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
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { ContentController } from "../src/content/controller";
import { convertConversation, convertMessage, type ConversionOptions } from "../src/core/convert";
import { buildDefaultSettings, type Settings } from "../src/core/settings";
import type { SiteAdapter } from "../src/core/types";
import { readPromptText } from "../src/sites/gemini-markup";
import { geminiAdapter, readGeminiPrompt, readGeminiTurns } from "../src/sites/gemini";
import { renderOptions } from "../src/options/options";
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

/** A `user-query` holding `text` as its one line, then a preview for each of `files` (`[name, type]`; `[null, ""]` is a picture, shown as Gemini shows one, with no name). */
function userQuery(text: string, files: [string | null, string][]): Element {
  const previews = files
    .map(([name, type]) =>
      name === null && !type
        ? '<user-query-file-preview><div class="file-preview-container"><button class="preview-image-button" aria-label="Show the uploaded image in a lightbox"><img class="preview-image" data-test-id="uploaded-img" src="https://images.example/x.jpg" alt="Uploaded image preview"></button></div></user-query-file-preview>'
        : `<user-query-file-preview><div data-test-id="uploaded-file"><button>${type ? `<div data-test-id="extension-label">${type}</div>` : ""}${name === null ? '<img src="https://images.example/x.png">' : `<div data-test-id="filename-label">${name}</div>`}</button></div></user-query-file-preview>`,
    )
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

/** Gemini's generated items, as inspected: a file chip, an image with its own buttons, music in a player, and a lone player. */
const GENERATED_FILE = '<generated-file><div class="chip-lr"><img class="file-icon-lr" src="https://www.gstatic.example/json.svg"><div class="file-name-lr">riff</div><div class="file-type-lr">JSON</div><button aria-label="Open">Open</button></div></generated-file>';
const GENERATED_IMAGE =
  '<div class="attachment-container generated-images"><response-element class="no-md"><generated-image><single-image class="generated-image large"><div class="image-container"><div class="overlay-container"><button class="image-button"><img class="image" src="blob:https://gemini.google.com/abc" alt="A brass widget"></button><div class="generated-image-controls hide-from-message-actions"><share-button><button aria-label="Share"></button></share-button><copy-button><button aria-label="Copy image"></button></copy-button><download-generated-image-button><button aria-label="Download"></button></download-generated-image-button></div></div></div></single-image></generated-image></response-element></div>';
const GENERATED_MUSIC = '<generated-music><video-player><video src="https://media.example/track.mp4"></video><button aria-label="Play"></button></video-player></generated-music>';
const GENERATED_VIDEO = '<generated-video><video-player><video src="https://media.example/clip.mp4"></video><div class="controls"><span class="time">0:00 / 0:08</span></div></video-player></generated-video>';
const LONE_PLAYER = '<video-player><video src="https://media.example/other.mp4"></video><button aria-label="Play"></button></video-player>';

check("generated: files, images, music and video are named in place, with no links, addresses or buttons", () => {
  const markdown = convertReply(reply(`<p>Here you go.</p>${GENERATED_FILE}${GENERATED_IMAGE}<p>And sound:</p>${GENERATED_MUSIC}${GENERATED_VIDEO}`));
  assert.equal(markdown, "Here you go.\n\nGenerated file: *riff* (JSON)\n\n*Generated image*\n\nAnd sound:\n\n*Generated music*\n\n*Generated video*");
});

check("generated: a player outside music and video is taken for a video too", () => {
  assert.equal(convertReply(reply(LONE_PLAYER)), "*Generated video*");
});

check("generated: an item beside the reply's text, rather than in it, follows the text", () => {
  assert.equal(convertReply(reply("<p>Made it.</p>", GENERATED_IMAGE)), "Made it.\n\n*Generated image*");
});

check("sources: source chips and citation markers without links are dropped; ordinary links and tables stay", () => {
  const chip = '<source-inline-chip><div class="source-inline-chip-container"><button class="button multiple-button" aria-label="View source details for Manual"><span class="source-title">Manual</span><span class="source-count">+ 2</span></button></div></source-inline-chip>';
  const marker = '<source-footnote><sup class="superscript" data-turn-source-index="2"></sup></source-footnote>';
  const message = reply(`<p>Tune low.<span class="chip-here"></span>${marker} See <a href="https://docs.example/tuning">the docs</a>.</p><table><thead><tr><th><p>Key</p></th></tr></thead><tbody><tr><td><p>E</p></td></tr></tbody></table>`);
  // The chip holds a <div>, which the HTML parser won't leave inside a <p>; Gemini builds it there through the DOM, so the test does too.
  const holder = message.ownerDocument.createElement("div");
  holder.innerHTML = chip;
  message.querySelector(".chip-here")!.replaceWith(holder.firstElementChild!);
  const markdown = convertReply(message);
  assert.equal(markdown, "Tune low. See [the docs](https://docs.example/tuning).\n\n| Key |\n| --- |\n| E |");
});

// ---------------------------------------------------------------------------
// A button for each reply
// ---------------------------------------------------------------------------

/** One turn of a chat: a prompt holding `prompt`, and a reply (see {@link reply}) whose toolbar is `toolbar`, or none while it's being written. */
function turnHtml(prompt: string, replyHtml: string, toolbar: string | null): string {
  const actions = toolbar === null ? "" : `<message-actions><div class="buttons-container-v2">${toolbar}</div></message-actions>`;
  return `<div class="conversation-container"><user-query><div class="query-text"><span class="cdk-visually-hidden">You said</span><p class="query-text-line">${prompt}</p></div></user-query><model-response><div class="response-container-content"><message-content><div class="markdown">${replyHtml}</div></message-content></div>${actions}</model-response></div>`;
}

const COPY_TOOLBAR = '<thumb-up-button></thumb-up-button><copy-button><gem-icon-button><button aria-label="Copy"></button></gem-icon-button></copy-button><div class="menu"></div>';
const IMAGE_TOOLBAR = '<thumb-up-button></thumb-up-button><div><regenerate-button></regenerate-button></div><share-button><gem-icon-button><button aria-label="Share image"></button></gem-icon-button></share-button><div class="menu"></div>';

/** A chat page with the extension running on it, recording what's copied. */
function startChat(turns: string, edit: (settings: Settings) => void = () => {}) {
  const document = new JSDOM(`<!doctype html><body><div class="buttons-container"><conversation-actions-icon><button aria-label="Open menu for conversation"></button></conversation-actions-icon></div><infinite-scroller data-test-id="chat-history-container">${turns}</infinite-scroller></body>`).window.document;
  const settings = buildDefaultSettings([geminiAdapter]);
  edit(settings);
  const copied: string[] = [];
  const controller = new ContentController(geminiAdapter, settings, { document, writeClipboard: async (text) => void copied.push(text), requestFrame: (callback) => callback() });
  controller.start();
  const replyButtons = () => Array.from(document.querySelectorAll<HTMLButtonElement>("model-response [data-acf-injected]"));
  return { document, controller, settings, copied, replyButtons };
}

check("reply buttons: each finished reply gets the plain icon button just before Copy, or before Share when an image-only reply has no Copy", () => {
  const page = startChat(turnHtml("One", "<p>A.</p>", COPY_TOOLBAR) + turnHtml("Two", "<p>B.</p>", IMAGE_TOOLBAR));
  const [first, second] = page.replyButtons();
  assert.equal(page.replyButtons().length, 2);
  assert.equal(first.nextElementSibling?.nodeName, "COPY-BUTTON");
  assert.equal(second.nextElementSibling?.nodeName, "SHARE-BUTTON");
  assert.equal(first.getAttribute("aria-label"), "Copy as Markdown");
  assert.ok(!first.classList.contains("acf-labelled"));
});

check("reply buttons: a reply still being written gets none until its toolbar appears", () => {
  const page = startChat(turnHtml("One", "<p>Writing…</p>", null));
  assert.equal(page.replyButtons().length, 0);
  page.document.querySelector("model-response")!.insertAdjacentHTML("beforeend", `<message-actions><div class="buttons-container-v2">${COPY_TOOLBAR}</div></message-actions>`);
  page.controller.sync();
  assert.equal(page.replyButtons().length, 1);
});

check("reply prompt: a reply's prompt is its own turn's, attachments and all", () => {
  const page = startChat(turnHtml("First", "<p>A.</p>", COPY_TOOLBAR) + turnHtml("Second", "<p>B.</p>", COPY_TOOLBAR));
  const replies = page.document.querySelectorAll("model-response");
  assert.equal(readGeminiPrompt(replies[1]), "Second");
  assert.equal(readGeminiPrompt(replies[0], () => false), "First", "no Gemini option governs a reply's prompt");
});

await checkAsync("reply buttons: a click copies the reply with its prompt, or alone with the prompt setting off", async () => {
  const page = startChat(turnHtml("What is it?", "<p>It is <strong>this</strong>.</p>", COPY_TOOLBAR));
  page.replyButtons()[0].click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(page.copied[0], "## What is it?\n\nIt is **this**.");
  const alone = startChat(turnHtml("What is it?", "<p>It is.</p>", COPY_TOOLBAR), (settings) => (settings.includePrompt = false));
  alone.replyButtons()[0].click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(alone.copied[0], "It is.");
});

await checkAsync("override: with it on, a reply toolbar's Copy copies Markdown; a generated image's own Copy is left alone, and so is everything with it off", async () => {
  const imageReply = `<p>Here.</p>${GENERATED_IMAGE}`;
  for (const on of [true, false]) {
    const page = startChat(turnHtml("Draw", imageReply, COPY_TOOLBAR), (settings) => (settings.sites.gemini.overrideNativeCopy = on));
    let reachedGemini = 0;
    page.document.addEventListener("click", () => reachedGemini++);
    page.document.querySelector<HTMLButtonElement>("message-actions copy-button button")!.click();
    page.document.querySelector<HTMLButtonElement>(".generated-image-controls copy-button button")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(page.copied, on ? ["## Draw\n\nHere.\n\n*Generated image*"] : []);
    assert.equal(reachedGemini, on ? 1 : 2, "only the reply's Copy is stopped before Gemini's handler");
  }
});

// ---------------------------------------------------------------------------
// The Conversation button
// ---------------------------------------------------------------------------

/** A report panel's toolbar, as in the Deep Research fixture, for the Conversation button to move into. */
const REPORT_PANEL = '<deep-research-immersive-panel><h2 class="title-text">A report</h2><div class="action-buttons"><button data-test-id="export-menu-button">Share &amp; Export</button></div><div class="response-container-content"><div id="extended-response-markdown-content"><p>Report.</p></div></div></deep-research-immersive-panel>';

check("conversation button: in the top bar before ⋮ with no report open; into the report's toolbar and back as a report opens and closes; gone with its option", () => {
  const page = startChat(turnHtml("One", "<p>A.</p>", COPY_TOOLBAR));
  const conversationButtons = () => Array.from(page.document.querySelectorAll<HTMLButtonElement>('[title="Copy conversation as Markdown"]'));
  assert.equal(conversationButtons().length, 1);
  const [button] = conversationButtons();
  assert.equal(button.nextElementSibling?.nodeName, "CONVERSATION-ACTIONS-ICON");
  assert.equal(button.textContent, "Conversation");

  page.document.body.insertAdjacentHTML("beforeend", REPORT_PANEL);
  page.controller.sync();
  assert.equal(conversationButtons().length, 1);
  const toolbar = Array.from(page.document.querySelector(".action-buttons")!.children, (child) => child.getAttribute("title") ?? child.getAttribute("data-test-id"));
  assert.deepEqual(toolbar, ["Copy conversation as Markdown", "Copy report as Markdown", "export-menu-button"]);
  assert.equal(conversationButtons()[0], button, "the same button, moved");

  page.document.querySelector("deep-research-immersive-panel")!.remove();
  page.controller.sync();
  assert.equal(conversationButtons().length, 1);
  assert.equal(conversationButtons()[0].nextElementSibling?.nodeName, "CONVERSATION-ACTIONS-ICON");

  const off = buildDefaultSettings([geminiAdapter]);
  off.sites.gemini.options["conversation-button"] = false;
  page.controller.applySettings(off);
  assert.equal(conversationButtons().length, 0);
  assert.equal(page.replyButtons().length, 1, "the reply's button stays");
});

// ---------------------------------------------------------------------------
// The fixture: a whole chat
// ---------------------------------------------------------------------------

const FIXTURE = readFileSync("scratch/fixtures/gemini-chat.html", "utf8");

/** The fixture page with the extension running on it, recording what's copied. */
function fixturePage(edit: (settings: Settings) => void = () => {}) {
  const document = new JSDOM(`<!doctype html><body>${FIXTURE}</body>`).window.document;
  const settings = buildDefaultSettings([geminiAdapter]);
  edit(settings);
  const copied: string[] = [];
  const controller = new ContentController(geminiAdapter, settings, { document, writeClipboard: async (text) => void copied.push(text), requestFrame: (callback) => callback() });
  controller.start();
  return { document, controller, copied, replies: Array.from(document.querySelectorAll("model-response")) };
}

const FIRST_REPLY = [
  "## Write a script that oils a widget.",
  "",
  "> Use the attached guides.",
  ">",
  "> Attached: *Widget\\_Guide* (PDF), *Spare Parts* (PDF)",
  "",
  "Here is a script that oils a widget.",
  "",
  "```python",
  "def oil(widget):",
  "    widget.oil(drops=2)",
  "```",
  "",
  "Two drops are enough.",
  "",
  "See [the oiling page](https://widgets.example/oil) for more.",
  "",
  "| Part | Drops |",
  "| --- | --- |",
  "| Gear | 2 |",
].join("\n");

const SECOND_REPLY = [
  "## Make a parts list, a picture and a jingle for this widget.",
  "",
  "> Attached: *image*",
  "",
  "Here is the parts list.",
  "",
  "Generated file: *widget\\_parts* (JSON)",
  "",
  "*Generated image*",
  "",
  "And a jingle:",
  "",
  "*Generated music*",
  "",
  "*Generated video*",
].join("\n");

check("fixture: the two finished replies get buttons, the one still being written doesn't, and Conversation is in the top bar", () => {
  const page = fixturePage();
  assert.deepEqual(page.replies.map((reply) => reply.querySelectorAll("[data-acf-injected]").length), [1, 1, 0]);
  assert.equal(page.document.querySelector('[title="Copy conversation as Markdown"]')?.nextElementSibling?.nodeName, "CONVERSATION-ACTIONS-ICON");
});

await checkAsync("fixture: each reply's copy has its prompt and attachments, fenced code, no chips, and its generated items named without addresses", async () => {
  const page = fixturePage();
  for (const reply of page.replies.slice(0, 2)) reply.querySelector<HTMLButtonElement>("[data-acf-injected]")!.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(page.copied[0], FIRST_REPLY);
  assert.equal(page.copied[1], SECOND_REPLY);
  assert.ok(!/https:\/\/(images|media)\.example|blob:|gstatic/.test(page.copied.join("\n")), "no address of a generated item or attachment");
});

check("fixture: the Conversation copy holds all three turns, attachments named, replies rewritten", () => {
  const page = fixturePage();
  const turns = readGeminiTurns(page.document.querySelector('infinite-scroller[data-test-id="chat-history-container"]')!)!;
  const markdown = convertConversation(geminiAdapter, turns, {
    style: "linked-citations",
    includeMoreSources: false,
    isRuleEnabled: () => true,
    idToken: "t",
    promptFormat: { format: "heading", headingLevel: 2 },
    referencesFor: () => null,
  });
  assert.equal(markdown, `${FIRST_REPLY}\n\n${SECOND_REPLY}\n\n## Thanks! One more?\n\nWorking on it`);
});

check("options page: Gemini offers the override now, still without the generic More, and its hint names the reply buttons", () => {
  const document = new JSDOM("<!doctype html><body></body>").window.document;
  const form = renderOptions(document, SITE_ADAPTERS, () => {});
  document.body.append(form.root);
  form.fill(buildDefaultSettings(SITE_ADAPTERS));
  const names = Array.from(document.querySelectorAll<HTMLInputElement>('section[data-site="gemini"] fieldset.site input'), (input) => input.name);
  assert.ok(names.includes("gemini.overrideNativeCopy"));
  assert.ok(!names.includes("gemini.includeMoreSources"));
  assert.match(document.querySelector('input[name="gemini.showCopyButton"]')!.closest(".option")!.querySelector(".hint")!.textContent!, /each reply/);
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
