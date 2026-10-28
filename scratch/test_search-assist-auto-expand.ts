/**
 * Regression checks for spec/search-assist-auto-expand: the controller's
 * automation hook, Search Assist pressing More and expanding Explore More
 * automatically with the chosen pacing, the stored choice, and the options
 * page. Run with `pnpm test`, which runs every scratch/test_*.ts script. Each
 * check prints PASS or FAIL, and the process exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { ContentController, type ControllerEnvironment } from "../src/content/controller";
import { buildDefaultSettings, type Settings } from "../src/core/settings";
import type { SiteAdapter, SiteAutomation } from "../src/core/types";
import { automateSearchAssist } from "../src/sites/duckduckgo-automation";
import { duckDuckGoAdapter } from "../src/sites/duckduckgo";
import { SITE_ADAPTERS } from "../src/sites/index";

const results: { name: string; error?: unknown }[] = [];

/** Runs an async check, recording whether it threw. */
async function checkAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name });
  } catch (error) {
    results.push({ name, error });
  }
}

// ---------------------------------------------------------------------------
// The controller's automation hook
// ---------------------------------------------------------------------------

/** What the hook adapter's automate saw on each call. */
interface HookCall {
  message: string;
  option: boolean;
  choice: string;
}

/** An adapter with one option and one choice whose automate records each call, keeping the last SiteAutomation. */
function hookAdapter() {
  const calls: HookCall[] = [];
  let automation: SiteAutomation | null = null;
  const adapter: SiteAdapter = {
    id: "hook",
    name: "Hook",
    matches: ["https://chat.example/*"],
    messageSelector: ".message",
    contentSelector: ".reply",
    nativeCopyButtonSelector: ".copy",
    findButtonAnchor: () => null,
    stripSelectors: [],
    turndownRules: () => ({}),
    rules: [],
    options: [{ id: "act", name: "Act", description: "", defaultEnabled: false }],
    choices: [{ id: "pace", name: "Pace", description: "", defaultValue: "slow", values: [{ value: "slow", label: "Slow" }, { value: "fast", label: "Fast" }] }],
    automate(message, given) {
      automation = given;
      calls.push({ message: message.id, option: given.isOptionEnabled("act"), choice: given.choice("pace") });
    },
  };
  return { adapter, calls, automation: () => automation! };
}

/** A controller for `adapter` on a page with two messages, with `env` overriding the environment. */
function startHook(adapter: SiteAdapter, edit: (settings: Settings) => void, env: Partial<ControllerEnvironment> = {}) {
  const document = new JSDOM('<!doctype html><body><div class="message" id="m1"></div><div class="message" id="m2"></div></body>').window.document;
  const settings = buildDefaultSettings([adapter]);
  edit(settings);
  const controller = new ContentController(adapter, settings, { document, writeClipboard: async () => {}, requestFrame: (callback) => callback(), ...env });
  controller.start();
  return { controller, settings };
}

await checkAsync("hook: automate runs for every message, even with the button hidden, reading the site's settings", async () => {
  const hook = hookAdapter();
  startHook(hook.adapter, (settings) => {
    settings.sites.hook.showCopyButton = false;
    settings.sites.hook.options.act = true;
    settings.sites.hook.choices.pace = "fast";
  });
  assert.deepEqual(hook.calls, [
    { message: "m1", option: true, choice: "fast" },
    { message: "m2", option: true, choice: "fast" },
  ]);
});

await checkAsync("hook: not called while the site or the extension is off, and options read as off once switched off", async () => {
  for (const off of [(s: Settings) => (s.sites.hook.enabled = false), (s: Settings) => (s.enabled = false)]) {
    const hook = hookAdapter();
    startHook(hook.adapter, off);
    assert.deepEqual(hook.calls, []);
  }
  const hook = hookAdapter();
  const { controller, settings } = startHook(hook.adapter, (s) => (s.sites.hook.options.act = true));
  const automation = hook.automation();
  assert.equal(automation.isOptionEnabled("act"), true);
  controller.applySettings({ ...structuredClone(settings), enabled: false });
  assert.equal(automation.isOptionEnabled("act"), false, "an automation already running sees the change");
  assert.equal(automation.choice("pace"), "slow");
});

await checkAsync("hook: sleep, random and visibility come from the environment", async () => {
  const hook = hookAdapter();
  const slept: number[] = [];
  startHook(hook.adapter, () => {}, { sleep: async (ms) => void slept.push(ms), random: () => 0.25, isPageVisible: () => false });
  const automation = hook.automation();
  await automation.sleep(1234);
  assert.deepEqual(slept, [1234]);
  assert.equal(automation.random(), 0.25);
  assert.equal(automation.isPageVisible(), false);
});

// ---------------------------------------------------------------------------
// Search Assist's automation
// ---------------------------------------------------------------------------

/** Lets every background step that's ready run; the fake sleep resolves at once, so a few hundred turns finish any run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 300; i++) await new Promise((resolve) => setImmediate(resolve));
}

/**
 * The fixture page with Search Assist's behavior stood in by click handlers,
 * recording each click and each pause in `log`. `atNextSleep` holds steps
 * to run at the next pauses, one each, standing in for the page changing
 * while the automation waits.
 * - Expand content removes itself and shows the More button.
 * - More records itself and shows Stop (the test finishes the writing).
 * - A collapsed Explore More question opens, and its answer loads at the
 *   next pause, as a quick fetch would.
 */
function automationPage({ options = {} as Record<string, boolean>, pacing = "unhurried", random = 0.5, visible = true } = {}) {
  const document = new JSDOM(readFileSync("scratch/fixtures/duckduckgo-search-assist.html", "utf8"), { url: "https://duckduckgo.com/?q=widgets&ia=web" }).window.document;
  const log: string[] = [];
  const atNextSleep: (() => void)[] = [];
  const state = { options: { ...options }, pacing, visible };
  const automation: SiteAutomation = {
    isOptionEnabled: (id) => state.options[id] ?? false,
    choice: () => state.pacing,
    sleep: async (ms) => {
      log.push(`sleep ${ms}`);
      atNextSleep.shift()?.();
    },
    random: () => random,
    isPageVisible: () => state.visible,
  };

  const collapsed = document.getElementById("collapsed")!;
  const expand = collapsed.querySelector<HTMLButtonElement>('button[aria-label="Expand content"]')!;
  expand.addEventListener("click", () => {
    log.push("click expand");
    const holder = expand.parentElement!;
    expand.remove();
    holder.insertAdjacentHTML("beforeend", '<button type="button" data-testid="duckassist-stream-more-pill" aria-label="More"><span>More</span></button>');
    holder.lastElementChild!.addEventListener("click", (event) => {
      log.push("click more");
      (event.currentTarget as Element).setAttribute("aria-label", "Stop");
    });
  });

  const afterMore = document.getElementById("after-more")!;
  for (const [index, button] of Array.from(afterMore.querySelectorAll<HTMLButtonElement>("button[aria-controls]")).entries()) {
    button.addEventListener("click", () => {
      log.push(`click q${index + 1}`);
      const open = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(open));
      const panel = document.getElementById(button.getAttribute("aria-controls")!)!;
      if (open) atNextSleep.push(() => (panel.firstElementChild!.innerHTML = `<p>Answer ${index + 1}.</p>`));
      else panel.firstElementChild!.innerHTML = "";
    });
  }
  return { document, log, atNextSleep, state, automation, collapsed, afterMore, run: (message: Element) => automateSearchAssist(message, automation) };
}

await checkAsync("automation: with both options off, nothing is clicked or waited on", async () => {
  const page = automationPage();
  page.run(page.collapsed);
  page.run(page.afterMore);
  await settle();
  assert.deepEqual(page.log, []);
});

await checkAsync("press More: a collapsed answer is expanded, then More pressed, after an Unhurried first pause and a between pause", async () => {
  const page = automationPage({ options: { "auto-more": true } });
  page.run(page.collapsed);
  await settle();
  // random() = 0.5: first 1000 + 0.5 × 1500, between 1500 + 0.5 × 2500.
  assert.deepEqual(page.log, ["sleep 1750", "click expand", "sleep 2750", "click more"]);
});

await checkAsync("press More: only once, however often the page is checked; never when More was already pressed", async () => {
  const page = automationPage({ options: { "auto-more": true } });
  for (let i = 0; i < 5; i++) page.run(page.collapsed);
  await settle();
  page.run(page.collapsed);
  await settle();
  assert.equal(page.log.filter((entry) => entry === "click more").length, 1);
  page.run(page.afterMore);
  await settle();
  assert.equal(page.log.filter((entry) => entry.startsWith("click")).length, 2, "the after-More module has its extended answer already");
});

await checkAsync("press More: waits for the More button to appear, for up to 3 s", async () => {
  const page = automationPage({ options: { "auto-more": true }, pacing: "brisk" });
  const expand = page.collapsed.querySelector<HTMLButtonElement>('button[aria-label="Expand content"]')!;
  // This time More appears only after a few polls.
  const late = expand.cloneNode(true) as HTMLButtonElement;
  expand.replaceWith(late);
  late.addEventListener("click", () => {
    page.log.push("click expand");
    late.remove();
    let polls = 0;
    const show = () => {
      if (++polls < 3) return;
      page.collapsed.querySelector(".T3ylZqfVHiSYAaVNqC1Q")!.insertAdjacentHTML("beforeend", '<button data-testid="duckassist-stream-more-pill" aria-label="More">More</button>');
      page.collapsed.querySelector('[aria-label="More"]')!.addEventListener("click", () => page.log.push("click more"));
    };
    for (let i = 0; i < 5; i++) page.atNextSleep.push(show);
  });
  page.run(page.collapsed);
  await settle();
  assert.deepEqual(page.log, ["sleep 1000", "click expand", "sleep 1000", "sleep 200", "sleep 200", "click more"]);
});

await checkAsync("Explore More: Unhurried opens the closed questions in order, waiting for each answer, skipping one already open", async () => {
  const page = automationPage({ options: { "auto-explore-more": true } });
  page.run(page.afterMore);
  await settle();
  // q1 is open in the fixture. Each answer loads at the first 200 ms poll.
  assert.deepEqual(page.log, ["sleep 1750", "click q2", "sleep 200", "sleep 2750", "click q3", "sleep 200"]);
});

await checkAsync("Explore More: Brisk waits for answers with shorter pauses; Random doesn't wait for answers", async () => {
  const brisk = automationPage({ options: { "auto-explore-more": true }, pacing: "brisk" });
  brisk.run(brisk.afterMore);
  await settle();
  assert.deepEqual(brisk.log, ["sleep 1000", "click q2", "sleep 200", "sleep 1000", "click q3", "sleep 200"]);
  const random = automationPage({ options: { "auto-explore-more": true }, pacing: "random" });
  random.run(random.afterMore);
  await settle();
  assert.deepEqual(random.log, ["sleep 1250", "click q2", "sleep 1250", "click q3"]);
});

await checkAsync("Explore More: pauses stay in each pacing's range at the extremes of random()", async () => {
  for (const [pacing, random, expected] of [
    ["unhurried", 0, ["sleep 1000", "sleep 1500"]],
    ["unhurried", 0.999999, ["sleep 2500", "sleep 4000"]],
    ["brisk", 0, ["sleep 500", "sleep 500"]],
    ["random", 0.999999, ["sleep 2000", "sleep 2000"]],
  ] as const) {
    const page = automationPage({ options: { "auto-explore-more": true }, pacing, random });
    page.run(page.afterMore);
    await settle();
    assert.deepEqual(page.log.filter((entry) => entry.startsWith("sleep") && entry !== "sleep 200"), expected, `${pacing} at ${random}`);
  }
});

await checkAsync("Explore More: waits while More is still writing, then starts once Stop is gone", async () => {
  const page = automationPage({ options: { "auto-explore-more": true } });
  page.afterMore.querySelector(".T3ylZqfVHiSYAaVNqC1Q")!.insertAdjacentHTML("beforeend", '<button data-testid="duckassist-stream-more-pill" aria-label="Stop">Stop</button>');
  page.run(page.afterMore);
  await settle();
  assert.equal(page.log.length, 0, "nothing while Stop shows");
  page.afterMore.querySelector('[aria-label="Stop"]')!.remove();
  page.run(page.afterMore);
  await settle();
  assert.ok(page.log.includes("click q2") && page.log.includes("click q3"), page.log.join(", "));
});

await checkAsync("Explore More: a question the user closes stays closed, and one they open isn't clicked", async () => {
  const page = automationPage({ options: { "auto-explore-more": true } });
  page.run(page.afterMore);
  await settle();
  const q2 = page.afterMore.querySelector<HTMLButtonElement>('[aria-controls=":re2:"]')!;
  q2.click(); // the user closes it
  for (let i = 0; i < 3; i++) page.run(page.afterMore);
  await settle();
  assert.equal(q2.getAttribute("aria-expanded"), "false");
  assert.deepEqual(page.log.filter((entry) => entry.startsWith("click")), ["click q2", "click q3", "click q2"]);
});

await checkAsync("Explore More: turning the option off mid-run stops before the next click", async () => {
  const page = automationPage({ options: { "auto-explore-more": true } });
  page.afterMore.querySelector('[aria-controls=":re2:"]')!.addEventListener("click", () => (page.state.options["auto-explore-more"] = false));
  page.run(page.afterMore);
  await settle();
  assert.deepEqual(page.log.filter((entry) => entry.startsWith("click")), ["click q2"]);
});

await checkAsync("hidden page: nothing happens until it's showing; the first pause starts then", async () => {
  const page = automationPage({ options: { "auto-explore-more": true }, visible: false });
  let hiddenPolls = 0;
  page.atNextSleep.push(() => void hiddenPolls++, () => {
    hiddenPolls++;
    page.state.visible = true;
  });
  page.run(page.afterMore);
  await settle();
  assert.equal(hiddenPolls, 2);
  assert.deepEqual(page.log.slice(0, 4), ["sleep 500", "sleep 500", "sleep 1750", "click q2"]);
});

// ---------------------------------------------------------------------------
// Through the controller
// ---------------------------------------------------------------------------

/**
 * A controller with Search Assist's adapter on an automation page, with its
 * site settings edited by `edit`, the prompt left out, and the page's fake
 * clock. Records clipboard writes.
 */
function startSearchAssist(edit: (settings: Settings) => void) {
  const page = automationPage();
  const settings = buildDefaultSettings(SITE_ADAPTERS);
  settings.includePrompt = false;
  edit(settings);
  const written: string[] = [];
  const controller = new ContentController(duckDuckGoAdapter, settings, {
    document: page.document,
    writeClipboard: async (text) => void written.push(text),
    requestFrame: (callback) => callback(),
    sleep: page.automation.sleep,
    random: page.automation.random,
    isPageVisible: () => true,
  });
  controller.start();
  return { ...page, written };
}

await checkAsync("controller: with the default settings, Search Assist clicks nothing", async () => {
  const page = startSearchAssist(() => {});
  await settle();
  assert.deepEqual(page.log, []);
});

await checkAsync("controller: with the option on, the questions open, and Copy as Markdown copies every answer under Explore More", async () => {
  const page = startSearchAssist((settings) => (settings.sites.duckduckgo.options["auto-explore-more"] = true));
  await settle();
  assert.deepEqual(page.log.filter((entry) => entry.startsWith("click")), ["click q2", "click q3"]);
  page.afterMore.querySelector<HTMLButtonElement>(".acf-copy-button")!.click();
  await settle();
  assert.equal(page.written.length, 1);
  assert.match(
    page.written[0],
    /### Explore More\n\n#### What size widget fits a pocket gadget\?\n\n[^\n]+\n\n#### How long does a widget last\?\n\nAnswer 2\.\n\n#### Can widgets be recycled\?\n\nAnswer 3\.$/,
  );
});

await checkAsync("controller: with Press More on, a collapsed answer is expanded and More pressed, once", async () => {
  const page = startSearchAssist((settings) => (settings.sites.duckduckgo.options["auto-more"] = true));
  await settle();
  assert.deepEqual(page.log.filter((entry) => entry.startsWith("click")), ["click expand", "click more"]);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

for (const result of results) {
  console.log(`${result.error ? "FAIL" : "PASS"}  ${result.name}`);
  if (result.error) console.log(`      ${String((result.error as Error).message ?? result.error).split("\n").join("\n      ")}`);
}
const failed = results.filter((result) => result.error).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
