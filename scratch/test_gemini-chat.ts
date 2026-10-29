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
import { convertMessage, type ConversionOptions } from "../src/core/convert";
import { buildDefaultSettings } from "../src/core/settings";
import type { SiteAdapter } from "../src/core/types";
import { readPromptText } from "../src/sites/gemini-markup";
import { geminiAdapter } from "../src/sites/gemini";

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
// A reply's content
// ---------------------------------------------------------------------------

/** A finished `model-response` whose text is `html`, with its toolbar; `outside` goes after the text, beside `message-content`. */
function reply(html: string, outside = ""): Element {
  const document = new JSDOM(
    `<!doctype html><body><model-response><div class="response-container-content has-thoughts"><div class="response-content"><thinking-overlay></thinking-overlay><model-response-content><message-content><div class="markdown markdown-main-panel">${html}</div></message-content>${outside}</model-response-content></div></div><message-actions><div class="buttons-container-v2"><thumb-up-button></thumb-up-button><copy-button><gem-icon-button><button aria-label="Copy"></button></gem-icon-button></copy-button></div></message-actions></model-response></body>`,
  ).window.document;
  return document.querySelector("model-response")!;
}

/** Converts `message` as a reply copy: linked citations with a fixed token, the default Gemini options. */
function convertReply(message: Element, overrides: Partial<ConversionOptions> = {}): string {
  return convertMessage(geminiAdapter, message, { style: "linked-citations", includeMoreSources: false, isRuleEnabled: () => true, references: null, idToken: "t", ...overrides });
}

/** A code block as Gemini draws it in a chat: a header with the language and two buttons, then the code. */
function codeBlock(language: string | null, code: string): string {
  const header = language === null ? "" : `<div class="code-block-decoration header-formatted gds-title-s"><span>${language}</span><div class="buttons"><button aria-label="Download">Download</button><button aria-label="Copy code">Copy</button></div></div>`;
  return `<code-block><div class="code-block">${header}<div class="formatted-code-block-internal-container"><div class="animated-opacity"><pre><code class="code-container formatted" data-test-id="code-content">${code}</code></pre></div></div></div></code-block>`;
}

check("code: a code block is fenced with its header's language, lowercased, and the header and its buttons are gone", () => {
  const markdown = convertReply(reply(`<p>Run this:</p>${codeBlock("Python", '<span class="hljs-keyword">def</span> main():\n    print(<span class="hljs-string">"hi"</span>)')}`));
  assert.equal(markdown, 'Run this:\n\n```python\ndef main():\n    print("hi")\n```');
});

check("code: a plain-text block, or one without a header, gets a fence with no language", () => {
  assert.equal(convertReply(reply(codeBlock("Text", "a\n  b"))), "```\na\n  b\n```");
  assert.equal(convertReply(reply(codeBlock(null, "x = 1"))), "```\nx = 1\n```");
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
