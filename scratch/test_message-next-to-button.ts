/**
 * Regression checks for spec/message-next-to-button: the extension's message
 * goes next to the button that was clicked, below it or above it when
 * there's no room, inside the window, and falls back to the bottom center
 * when the button can't be measured; through the controller on the Search
 * Assist fixture; and the style sheet that places it. jsdom does no layout,
 * so elements get fixed sizes and positions. Run with `pnpm test`, which runs
 * every scratch/test_*.ts script. Each check prints PASS or FAIL, and the
 * process exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { ContentController, placeToast } from "../src/content/controller";
import { buildDefaultSettings } from "../src/core/settings";
import { duckDuckGoAdapter } from "../src/sites/duckduckgo";
import { SITE_ADAPTERS } from "../src/sites/index";

const results: { name: string; error?: unknown }[] = [];

/** Runs `fn` as one named check and records whether it threw. */
function check(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name });
  } catch (error) {
    results.push({ name, error });
  }
}

/** Runs an async check, recording its result like {@link check}. */
async function checkAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name });
  } catch (error) {
    results.push({ name, error });
  }
}

/** Gives `element` a fixed box at (`left`, `top`), standing in for the layout jsdom doesn't do. */
function layOut(element: Element, left: number, top: number, width: number, height: number): void {
  element.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
  Object.defineProperty(element, "offsetWidth", { configurable: true, value: width });
  Object.defineProperty(element, "offsetHeight", { configurable: true, value: height });
}

/** A 1000×800 window with a 32×32 button at (`left`, `top`) and a 240×40 message, both in the page. */
function scene(left: number, top: number) {
  const { window } = new JSDOM("<!doctype html><body><button>M</button></body>");
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  const button = window.document.querySelector("button")!;
  layOut(button, left, top, 32, 32);
  const toast = window.document.createElement("div");
  window.document.body.append(toast);
  layOut(toast, 0, 0, 240, 40);
  return { window, button, toast };
}

/** The message's placement: its coordinates and whether it's anchored. */
const placement = (toast: HTMLElement) => ({ top: toast.style.top, left: toast.style.left, anchored: toast.classList.contains("acf-toast-anchored") });

// ---------------------------------------------------------------------------
// placeToast
// ---------------------------------------------------------------------------

check("below: 8px under the button, lined up with its left edge, marked anchored", () => {
  const { window, button, toast } = scene(300, 200);
  placeToast(toast, button, window as unknown as Window);
  assert.deepEqual(placement(toast), { top: "240px", left: "300px", anchored: true });
});

check("above: 8px over the button when there's no room below", () => {
  // Below would end at 760 + 32 + 8 + 40 = 840, past 800 - 16.
  const { window, button, toast } = scene(300, 760);
  placeToast(toast, button, window as unknown as Window);
  assert.deepEqual(placement(toast), { top: "712px", left: "300px", anchored: true });
});

check("inside the window: moved left near the right edge, kept 16px in near the left edge", () => {
  const right = scene(950, 200);
  placeToast(right.toast, right.button, right.window as unknown as Window);
  assert.equal(right.toast.style.left, "744px"); // 1000 - 16 - 240
  const left = scene(4, 200);
  placeToast(left.toast, left.button, left.window as unknown as Window);
  assert.equal(left.toast.style.left, "16px");
});

check("fallback: a zero-size or detached button leaves the message at the bottom center", () => {
  const hidden = scene(300, 200);
  layOut(hidden.button, 0, 0, 0, 0);
  placeToast(hidden.toast, hidden.button, hidden.window as unknown as Window);
  assert.deepEqual(placement(hidden.toast), { top: "", left: "", anchored: false });
  const detached = scene(300, 200);
  detached.button.remove();
  placeToast(detached.toast, detached.button, detached.window as unknown as Window);
  assert.deepEqual(placement(detached.toast), { top: "", left: "", anchored: false });
});

// ---------------------------------------------------------------------------
// Through the controller, on the Search Assist fixture
// ---------------------------------------------------------------------------

/** A controller on the Search Assist fixture in a 1000×800 window, recording clipboard writes. */
function startController(overrideNativeCopy: boolean) {
  const { window } = new JSDOM(readFileSync("scratch/fixtures/duckduckgo-search-assist.html", "utf8"));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  const document = window.document;
  const settings = buildDefaultSettings(SITE_ADAPTERS);
  settings.sites.duckduckgo.overrideNativeCopy = overrideNativeCopy;
  const written: string[] = [];
  const controller = new ContentController(duckDuckGoAdapter, settings, { document, writeClipboard: async (text) => void written.push(text), requestFrame: (callback) => callback() });
  controller.start();
  return { document, written };
}

/** Lets pending timers and promise callbacks run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

await checkAsync("controller: the still-writing message goes below the Copy as Markdown button that was clicked", async () => {
  const page = startController(false);
  const button = page.document.getElementById("writing")!.querySelector<HTMLButtonElement>(".acf-copy-button")!;
  layOut(button, 600, 120, 32, 32);
  button.click();
  await flush();
  const toast = page.document.querySelector<HTMLElement>(".acf-toast")!;
  assert.match(toast.textContent ?? "", /still writing/);
  assert.deepEqual(placement(toast), { top: "160px", left: "600px", anchored: true });
});

await checkAsync("controller: with the override on, 'Copied as Markdown' goes next to the site's own Copy button", async () => {
  const page = startController(true);
  const copy = page.document.getElementById("collapsed")!.querySelector<HTMLButtonElement>(duckDuckGoAdapter.nativeCopyButtonSelector)!;
  layOut(copy, 640, 120, 32, 32);
  copy.click();
  await flush();
  assert.equal(page.written.length, 1);
  const toast = page.document.querySelector<HTMLElement>(".acf-toast")!;
  assert.equal(toast.textContent, "Copied as Markdown");
  assert.deepEqual(placement(toast), { top: "160px", left: "640px", anchored: true });
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
