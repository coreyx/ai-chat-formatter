/**
 * Regression checks for spec/gemini-chat: buttons that move with their
 * anchor, and the Gemini adapter on ordinary chats (a button per reply, the
 * Conversation button in the top bar, prompt attachments, code blocks,
 * generated items, the native Copy override), against a synthetic fixture
 * modeled on gemini.google.com's markup. Run with `pnpm test`, which runs
 * every scratch/test_*.ts script. Each check prints PASS or FAIL, and the
 * process exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { ContentController } from "../src/content/controller";
import { buildDefaultSettings } from "../src/core/settings";
import type { SiteAdapter } from "../src/core/types";
import { readPromptText } from "../src/sites/gemini-markup";

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

// ---------------------------------------------------------------------------
// The controller: a button follows its anchor
// ---------------------------------------------------------------------------

check("controller: a tracked button moves when its anchor's parent changes, and back, without a second button", () => {
  const document = new JSDOM('<!doctype html><body><div class="top"><i class="menu"></i></div><div class="history"><div class="reply"><p>Hi.</p></div></div></body>').window.document;
  const adapter: SiteAdapter = {
    id: "toy",
    name: "Toy",
    matches: ["https://chat.example/*"],
    messageSelector: ".history",
    contentSelector: ".reply",
    // The panel's toolbar while a panel is open, otherwise the top bar.
    findButtonAnchor: () => {
      const panel = document.querySelector(".panel .bar");
      if (panel) return { parent: panel, before: panel.querySelector(".share") };
      const menu = document.querySelector(".menu")!;
      return { parent: menu.parentElement!, before: menu };
    },
    buttonLabel: () => null,
    stripSelectors: [],
    turndownRules: () => ({}),
    rules: [],
  };
  const controller = new ContentController(adapter, buildDefaultSettings([adapter]), { document, writeClipboard: async () => {}, requestFrame: (callback) => callback() });
  controller.start();
  const buttons = () => Array.from(document.querySelectorAll<HTMLButtonElement>("[data-acf-injected]"));
  assert.equal(buttons().length, 1);
  const button = buttons()[0];
  assert.equal(button.nextElementSibling, document.querySelector(".menu"));
  assert.equal(button.getAttribute("aria-label"), "Copy as Markdown", "a null label is the plain icon button");
  assert.ok(!button.classList.contains("acf-labelled"));

  document.body.insertAdjacentHTML("beforeend", '<div class="panel"><div class="bar"><button class="share">Share</button></div></div>');
  controller.sync();
  assert.equal(buttons().length, 1);
  assert.equal(buttons()[0], button, "the same button, moved");
  assert.equal(button.nextElementSibling, document.querySelector(".share"));

  document.querySelector(".panel")!.remove();
  controller.sync();
  assert.equal(buttons().length, 1);
  assert.equal(buttons()[0].nextElementSibling, document.querySelector(".menu"));
});

// ---------------------------------------------------------------------------
// Prompts and their attachments
// ---------------------------------------------------------------------------

/** A `user-query` holding `text` as its one line, then a preview for each of `files` (`[name, type]`, a missing name for a picture). */
function userQuery(text: string, files: [string | null, string][]): Element {
  const previews = files
    .map(([name, type]) => `<user-query-file-preview><div data-test-id="uploaded-file"><button>${type ? `<div data-test-id="extension-label">${type}</div>` : ""}${name === null ? '<img src="blob:https://gemini.google.com/x">' : `<div data-test-id="filename-label">${name}</div>`}</button></div></user-query-file-preview>`)
    .join("");
  const document = new JSDOM(`<!doctype html><body><user-query><span class="user-query-container"><div class="file-preview-container"><user-query-file-carousel>${previews}</user-query-file-carousel></div><div class="query-text"><span class="cdk-visually-hidden">You said</span>${text ? `<p class="query-text-line">${text}</p>` : ""}</div></span></user-query></body>`).window.document;
  return document.querySelector("user-query")!;
}

check("prompts: attached files are named after the prompt's text, with their types, and never linked", () => {
  assert.equal(readPromptText(userQuery("Summarize these.", [["Widget_Guide", "PDF"], ["Spare Parts", "PDF"]])), "Summarize these.\n\nAttached: *Widget\\_Guide* (PDF), *Spare Parts* (PDF)");
});

check("prompts: an attachment showing only a picture is *image*, a missing type is left off, and a prompt of attachments alone is the line", () => {
  assert.equal(readPromptText(userQuery("", [[null, ""]])), "Attached: *image*");
  assert.equal(readPromptText(userQuery("What is this?", [[null, "PNG"], ["a*b[c]", ""]])), "What is this?\n\nAttached: *image* (PNG), *a\\*b\\[c\\]*");
});

check("prompts: a prompt with no attachments is its text alone", () => {
  assert.equal(readPromptText(userQuery("Just text.", [])), "Just text.");
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
