/**
 * Regression checks for spec/search-assist-auto-expand: the controller's
 * automation hook, Search Assist pressing More and expanding Explore More
 * automatically with the chosen pacing, the stored choice, and the options
 * page. Run with `pnpm test`, which runs every scratch/test_*.ts script. Each
 * check prints PASS or FAIL, and the process exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { ContentController, type ControllerEnvironment } from "../src/content/controller";
import { buildDefaultSettings, type Settings } from "../src/core/settings";
import type { SiteAdapter, SiteAutomation } from "../src/core/types";

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
// Summary
// ---------------------------------------------------------------------------

for (const result of results) {
  console.log(`${result.error ? "FAIL" : "PASS"}  ${result.name}`);
  if (result.error) console.log(`      ${String((result.error as Error).message ?? result.error).split("\n").join("\n      ")}`);
}
const failed = results.filter((result) => result.error).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
