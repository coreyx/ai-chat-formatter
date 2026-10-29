/**
 * Regression checks for spec/gemini-deep-research: the shared additions
 * (sections after Sources, an option that governs More, conversations copied
 * turn by turn, buttons outside their message, labelled and hidden buttons)
 * and the Gemini adapter's report and conversation copies, against a
 * synthetic fixture modeled on gemini.google.com's markup. Run with
 * `pnpm test`, which runs every scratch/test_*.ts script. Each check prints
 * PASS or FAIL, and the process exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { ContentController } from "../src/content/controller";
import { convertConversation, convertMessage, type ConversionOptions } from "../src/core/convert";
import { buildDefaultSettings, type Settings } from "../src/core/settings";
import { renderOptions } from "../src/options/options";
import {
  findReportTurn,
  findResearchRequest,
  PANEL_TITLE_SELECTOR,
  PLAN_SELECTOR,
  readQueryText,
  readSourceList,
  REPORT_PANEL_SELECTOR,
  UNUSED_SOURCES_SELECTOR,
  USED_SOURCES_SELECTOR,
} from "../src/sites/gemini-markup";
import { geminiAdapter, readGeminiPrompt, readGeminiReferences, readGeminiTurns } from "../src/sites/gemini";
import { AFTER_SOURCES_ATTRIBUTE, ConversionError, type SiteAdapter, type SourceReference } from "../src/core/types";
import { findAdapterForUrl, SITE_ADAPTERS } from "../src/sites/index";

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
// The adapter contract
// ---------------------------------------------------------------------------

check("contract: the after-Sources marker is a data attribute, and the existing sites keep their native Copy selector", () => {
  assert.equal(AFTER_SOURCES_ATTRIBUTE, "data-acf-after-sources");
  for (const id of ["copilot", "duckai", "duckduckgo"]) {
    const adapter = SITE_ADAPTERS.find((candidate) => candidate.id === id) as SiteAdapter;
    assert.ok(adapter.nativeCopyButtonSelector, `${id} still offers the override`);
  }
});

// ---------------------------------------------------------------------------
// The converter: sections after Sources, an option that governs More, conversations
// ---------------------------------------------------------------------------

/**
 * A minimal adapter for the converter checks. Each `<a class="cite">` is a
 * citation; `preprocess` marks `.after` elements to follow the Sources
 * section. Its `more` option governs More when `governed` is set.
 */
function toyAdapter(governed = false): SiteAdapter {
  return {
    id: "toy",
    name: "Toy",
    matches: ["https://chat.example/*"],
    messageSelector: ".message",
    contentSelector: ".reply",
    findButtonAnchor: () => null,
    stripSelectors: [],
    preprocess(root) {
      root.querySelectorAll(".after").forEach((element) => element.setAttribute(AFTER_SOURCES_ATTRIBUTE, ""));
    },
    turndownRules: (context) => ({
      cite: {
        filter: (node) => node.nodeName === "A" && (node as HTMLElement).classList.contains("cite"),
        replacement: (_content, node) => {
          const url = (node as HTMLElement).getAttribute("href")!;
          return context.registerCitation({ url, title: (node.textContent ?? "").trim(), sourceName: new URL(url).hostname });
        },
      },
    }),
    options: governed ? [{ id: "more", name: "More", description: "", defaultEnabled: true, governsMoreSources: true }] : [],
    rules: [],
  };
}

/** A `.message` element holding `replyHtml` in its `.reply`. */
function toyMessage(replyHtml: string): Element {
  const document = new JSDOM(`<!doctype html><body><div class="message"><div class="reply">${replyHtml}</div></div></body>`).window.document;
  return document.querySelector(".message")!;
}

const TOY_REFERENCES: SourceReference[] = [
  { url: "https://a.example/one", title: "One", domain: "a.example", cited: true },
  { url: "https://b.example/two", title: "Two", domain: "b.example", cited: false },
];

/** Conversion options for the toy checks: linked citations with a fixed token, More off. */
function toyOptions(overrides: Partial<ConversionOptions> = {}): ConversionOptions {
  return { style: "linked-citations", includeMoreSources: false, isRuleEnabled: () => true, references: TOY_REFERENCES, idToken: "t", ...overrides };
}

const TOY_REPLY = '<h1>Title</h1><p>Text <a class="cite" href="https://a.example/one">One</a>.</p><div class="after"><h2>Extra</h2><p>Last words.</p></div>';

check("converter: a section marked after Sources comes after the Sources section, and shifts with the minimum heading level", () => {
  const markdown = convertMessage(toyAdapter(), toyMessage(TOY_REPLY), toyOptions({ minHeadingLevel: 2 }));
  assert.equal(
    markdown,
    [
      "## Title",
      "",
      "Text[[#^c-t-1|⁽¹⁾]].",
      "",
      "### Sources",
      "",
      "#### Citations",
      "",
      "1. [One](https://a.example/one) — a.example ^c-t-1",
      "",
      "### Extra",
      "",
      "Last words.",
    ].join("\n"),
  );
});

check("converter: with footnotes, the section after Sources follows the footnote definitions; without citations it still comes last", () => {
  const footnotes = convertMessage(toyAdapter(), toyMessage(TOY_REPLY), toyOptions({ style: "footnotes" }));
  assert.match(footnotes, /\[\^1\]: \[One\]\(https:\/\/a\.example\/one\) — a\.example\n\n## Extra\n\nLast words\.$/);
  const plain = convertMessage(toyAdapter(), toyMessage('<p>No sources.</p><div class="after"><h2>Extra</h2></div>'), toyOptions({ references: null }));
  assert.equal(plain, "No sources.\n\n## Extra");
});

check("converter: an option that governs More decides it, whatever includeMoreSources says", () => {
  const more = /### More\n\n- \[Two\]\(https:\/\/b\.example\/two\) — b\.example/;
  const reply = '<p>Text <a class="cite" href="https://a.example/one">One</a>.</p>';
  assert.match(convertMessage(toyAdapter(true), toyMessage(reply), toyOptions({ includeMoreSources: false })), more, "on by default, with the generic setting off");
  assert.doesNotMatch(
    convertMessage(toyAdapter(true), toyMessage(reply), toyOptions({ includeMoreSources: true, isOptionEnabled: () => false })),
    /### More/,
    "off, with the generic setting on",
  );
  assert.doesNotMatch(convertMessage(toyAdapter(false), toyMessage(reply), toyOptions()), /### More/, "without a governing option, the generic setting still applies");
});

check("converter: a conversation is each prompt above its reply, in order, with unique block IDs and every prompt kept", () => {
  const document = new JSDOM(
    '<!doctype html><body><div class="turn" id="t1"><div class="reply"><p>First <a class="cite" href="https://a.example/one">One</a>.</p></div></div>' +
      '<div class="turn" id="t2"><div class="reply"><p>Second <a class="cite" href="https://a.example/one">One</a>.</p></div></div>' +
      '<div class="turn" id="t3"></div><div class="turn" id="t4"><div class="reply"></div></div></body>',
  ).window.document;
  const turn = (id: string) => document.getElementById(id)!;
  const markdown = convertConversation(
    toyAdapter(),
    [
      { prompt: "Question one", reply: turn("t1") },
      { prompt: "Question two\nwith a second line", reply: turn("t2") },
      { prompt: "Unanswered", reply: turn("t3") },
      { prompt: null, reply: turn("t4") },
    ],
    { style: "linked-citations", includeMoreSources: false, isRuleEnabled: () => true, idToken: "t", promptFormat: { format: "heading", headingLevel: 2 } },
  );
  assert.equal(
    markdown,
    [
      "## Question one",
      "",
      "First[[#^c-t1-1|⁽¹⁾]].",
      "",
      "### Sources",
      "",
      "#### Citations",
      "",
      "1. [One](https://a.example/one) — a.example ^c-t1-1",
      "",
      "## Question two",
      "",
      "> with a second line",
      "",
      "Second[[#^c-t2-1|⁽¹⁾]].",
      "",
      "### Sources",
      "",
      "#### Citations",
      "",
      "1. [One](https://a.example/one) — a.example ^c-t2-1",
      "",
      "## Unanswered",
    ].join("\n"),
  );
});

// ---------------------------------------------------------------------------
// The controller: buttons outside their message, hidden and labelled buttons, conversations
// ---------------------------------------------------------------------------

/**
 * A page with a `.history` conversation (two `.turn`s) and a `.toolbar`
 * outside it, where the toy site puts the conversation's button while its
 * `show` option is on. The button is labelled "Chat".
 */
function startToyConversation(edit: (settings: Settings) => void = () => {}) {
  const document = new JSDOM(
    '<!doctype html><body><div class="toolbar"><button class="share">Share</button></div><div class="history">' +
      '<div class="turn"><p class="q">First question</p><div class="reply"><p>First answer.</p></div></div>' +
      '<div class="turn"><p class="q">Second question</p><div class="reply"><p>Second answer.</p></div></div></div></body>',
  ).window.document;
  const adapter: SiteAdapter = {
    ...toyAdapter(),
    messageSelector: ".history",
    options: [{ id: "show", name: "Show", description: "", defaultEnabled: true }],
    findButtonAnchor(_message, isOptionEnabled) {
      const toolbar = document.querySelector(".toolbar");
      if (!toolbar || !isOptionEnabled?.("show")) return null;
      return { parent: toolbar, before: toolbar.querySelector(".share") };
    },
    buttonLabel: () => ({ title: "Copy conversation as Markdown", text: "Chat" }),
    readTurns: (message) => Array.from(message.querySelectorAll(".turn"), (turn) => ({ prompt: turn.querySelector(".q")!.textContent, reply: turn })),
  };
  const settings = buildDefaultSettings([adapter]);
  settings.includePrompt = false;
  edit(settings);
  const copied: string[] = [];
  const controller = new ContentController(adapter, settings, {
    document,
    writeClipboard: async (text) => void copied.push(text),
    requestFrame: (callback) => callback(),
  });
  controller.start();
  const buttons = () => Array.from(document.querySelectorAll<HTMLButtonElement>(".acf-copy-button"));
  return { document, controller, settings, copied, buttons };
}

check("controller: a button anchored outside its message is added once over many passes, and again if the site removes it", () => {
  const page = startToyConversation();
  page.controller.sync();
  page.controller.sync();
  assert.equal(page.buttons().length, 1);
  assert.equal(page.buttons()[0].nextElementSibling, page.document.querySelector(".share"));
  page.buttons()[0].remove();
  page.controller.sync();
  assert.equal(page.buttons().length, 1, "put back after the site re-rendered its toolbar");
});

check("controller: a button whose anchor turns null (its option switched off) is removed, and comes back with the option", () => {
  const page = startToyConversation();
  const off = structuredClone(page.settings);
  off.sites.toy.options.show = false;
  page.controller.applySettings(off);
  assert.equal(page.buttons().length, 0);
  page.controller.applySettings(page.settings);
  assert.equal(page.buttons().length, 1);
});

check("controller: a labelled button shows its text after the icon, with its title as tooltip and accessible name", () => {
  const [button] = startToyConversation().buttons();
  assert.ok(button.classList.contains("acf-labelled"));
  assert.equal(button.title, "Copy conversation as Markdown");
  assert.equal(button.getAttribute("aria-label"), "Copy conversation as Markdown");
  assert.equal(button.querySelector("svg + .acf-button-text")?.textContent, "Chat");
});

await checkAsync("controller: a conversation is copied turn by turn with every prompt, even with the prompt setting off, and the label comes back after the flash", async () => {
  const page = startToyConversation();
  const [button] = page.buttons();
  button.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(page.copied, ["## First question\n\nFirst answer.\n\n## Second question\n\nSecond answer."]);
  assert.equal(button.getAttribute("aria-label"), "Copied as Markdown");
  assert.equal(button.querySelector(".acf-button-text")?.textContent, "Chat", "the label stays while the check shows");
  await new Promise((resolve) => setTimeout(resolve, 1600));
  assert.equal(button.getAttribute("aria-label"), "Copy conversation as Markdown");
  assert.equal(button.querySelector("svg + .acf-button-text")?.textContent, "Chat");
});

check("controller: a button an earlier run left inside a message still counts, so the message gets no second one", () => {
  const document = new JSDOM('<!doctype html><body><div class="message"><div class="bar"><button data-acf-injected="">old</button></div><div class="reply"><p>Hi.</p></div></div></body>').window.document;
  const adapter: SiteAdapter = { ...toyAdapter(), findButtonAnchor: (message) => ({ parent: message.querySelector(".bar")!, before: null }) };
  new ContentController(adapter, buildDefaultSettings([adapter]), { document, writeClipboard: async () => {}, requestFrame: (callback) => callback() }).start();
  assert.equal(document.querySelectorAll("[data-acf-injected]").length, 1);
});

await checkAsync("controller: a site without its own Copy button ignores the override setting", async () => {
  const page = startToyConversation((settings) => (settings.sites.toy.overrideNativeCopy = true));
  page.document.querySelector<HTMLButtonElement>(".share")!.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(page.copied, []);
});

// ---------------------------------------------------------------------------
// The options page
// ---------------------------------------------------------------------------

check("options page: no override for a site without its own Copy, no generic More under a governing option, and the site's button hint", () => {
  const governed: SiteAdapter = { ...toyAdapter(true), readReferences: () => null, copyButtonDescription: "Adds buttons to the toolbar." };
  const plain: SiteAdapter = { ...toyAdapter(), id: "plain", name: "Plain", nativeCopyButtonSelector: ".copy", readReferences: () => null };
  const adapters = [governed, plain];
  const document = new JSDOM("<!doctype html><body></body>").window.document;
  const form = renderOptions(document, adapters, () => {});
  document.body.append(form.root);
  form.fill(buildDefaultSettings(adapters));
  const names = (id: string) => Array.from(document.querySelectorAll<HTMLInputElement>(`section[data-site="${id}"] fieldset.site input`), (input) => input.name);
  assert.deepEqual(names("toy"), ["toy.showCopyButton", "toy.options.more"]);
  assert.deepEqual(names("plain"), ["plain.showCopyButton", "plain.overrideNativeCopy", "plain.includeMoreSources"]);
  const hint = (name: string) => document.querySelector(`input[name="${name}"]`)!.closest(".option")!.querySelector(".hint")!.textContent;
  assert.equal(hint("toy.showCopyButton"), "Adds buttons to the toolbar.");
  assert.equal(hint("plain.showCopyButton"), "Adds a button next to each reply's own Copy button.");
});

check("styles: the built style sheet shapes labelled buttons as pills with their label after the icon", () => {
  const css = readFileSync("dist/content.css", "utf8");
  const rule = (selector: string) => new RegExp(`${selector.replace(/[.*]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  const labelled = rule(".acf-copy-button.acf-labelled");
  for (const declaration of ["width: auto", "gap: 6px", "padding: 0 10px 0 6px", "border-radius: 16px", "font: inherit"]) assert.ok(labelled.includes(declaration), declaration);
  assert.ok(rule(".acf-button-text").includes("font-size: 14px"));
});

// ---------------------------------------------------------------------------
// Gemini's markup readers
// ---------------------------------------------------------------------------

const FIXTURE = readFileSync("scratch/fixtures/gemini-deep-research.html", "utf8");
const GEMINI_URL = "https://gemini.google.com/u/1/app/0123456789abcdef";

/** A fresh copy of the fixture page. */
function geminiPage(): Document {
  return new JSDOM(FIXTURE, { url: GEMINI_URL }).window.document;
}

check("markup: a prompt reads as typed, with its blank line and numbered list, and without the screen-reader label", () => {
  const document = geminiPage();
  assert.equal(
    readQueryText(document.querySelector("#turn-request user-query")!),
    "Please research how to keep widgets running smoothly.\nWrite a detailed report.\n\n1. Which oils suit widget gears?\n2. How often should they be serviced?",
  );
  assert.equal(readQueryText(document.querySelector("#turn-start user-query")!), "Start research");
});

check("markup: source lists and browsing steps read as URL, title and domain, in order", () => {
  const document = geminiPage();
  assert.deepEqual(readSourceList(document.querySelector(USED_SOURCES_SELECTOR)!), [
    { url: "https://docs.widget.example/care", title: "Widget care guide", domain: "docs.widget.example" },
    { url: "https://blog.gears.example/oil", title: "Oiling [gears] properly", domain: "blog.gears.example" },
    { url: "https://forum.widget.example/t/42", title: "Squeaky widgets thread", domain: "forum.widget.example" },
    { url: "https://lab.example/report", title: "Widget wear study", domain: "lab.example" },
  ]);
  assert.deepEqual(
    readSourceList(document.querySelector(UNUSED_SOURCES_SELECTOR)!).map((source) => source.url),
    ["https://shop.example/widgets", "https://news.example/widgets"],
  );
  assert.deepEqual(readSourceList(document.querySelector("browse-chip-list")!), [
    { url: "https://docs.widget.example/care", title: "Widget care guide", domain: "docs.widget.example" },
    { url: "https://shop.example/widgets", title: "Widget shop", domain: "shop.example" },
  ]);
  const bare = new JSDOM('<div><a href="https://www.plain.example/x">x</a><a href="javascript:void(0)">no</a></div>').window.document.body;
  assert.deepEqual(readSourceList(bare), [{ url: "https://www.plain.example/x", title: "", domain: "plain.example" }]);
});

check("markup: the report's turn is the card with the panel's title, or the last card when none matches", () => {
  const document = geminiPage();
  const panel = document.querySelector(REPORT_PANEL_SELECTOR)!;
  assert.equal(findReportTurn(panel)?.id, "turn-start");
  panel.querySelector(PANEL_TITLE_SELECTOR)!.textContent = "Another Report";
  assert.equal(findReportTurn(panel)?.id, "turn-start");
});

check("markup: the research request is the earliest plan turn before the report, past a revised plan and other chat", () => {
  const document = geminiPage();
  const request = document.getElementById("turn-request")!;
  const reportTurn = document.getElementById("turn-start")!;
  assert.equal(findResearchRequest(reportTurn), request.querySelector("user-query"));
  // An earlier, unrelated turn, then a revision of the plan ("Edit plan") between the request and the report.
  const chat = request.cloneNode(true) as Element;
  chat.id = "turn-chat";
  chat.querySelector(PLAN_SELECTOR)!.remove();
  request.before(chat);
  const revision = request.cloneNode(true) as Element;
  revision.id = "turn-revision";
  request.after(revision);
  assert.equal(findResearchRequest(reportTurn), request.querySelector("user-query"));
  for (const turn of [request, revision]) turn.querySelector(PLAN_SELECTOR)!.remove();
  assert.equal(findResearchRequest(reportTurn), null);
});

// ---------------------------------------------------------------------------
// The report copy
// ---------------------------------------------------------------------------

/**
 * The fixture's report converted as the controller would, with Gemini's
 * options set as in `options` (defaults otherwise) and the prompt as a heading.
 * The research request is turned on unless `options` turns it off, so these
 * checks see the whole copy; the default, without it, is checked through the
 * controller (see "report prompt" below).
 */
function convertReport(options: Record<string, boolean> = {}, overrides: Partial<ConversionOptions> = {}, document = geminiPage()): string {
  const panel = document.querySelector(REPORT_PANEL_SELECTOR)!;
  const defaults = Object.fromEntries((geminiAdapter.options ?? []).map((option) => [option.id, option.defaultEnabled]));
  const isOptionEnabled = (id: string) => ({ ...defaults, "report-prompt": true, ...options })[id] ?? false;
  const prompt = readGeminiPrompt(panel, isOptionEnabled);
  return convertMessage(geminiAdapter, panel, {
    style: "linked-citations",
    includeMoreSources: false,
    isRuleEnabled: () => true,
    isOptionEnabled,
    references: readGeminiReferences(panel),
    idToken: "t",
    ...(prompt ? { prompt: { text: prompt, format: "heading", headingLevel: 2 } } : {}),
    ...overrides,
  });
}

/** The prompt and report body of the fixture's copy, before its Sources section. */
const REPORT_BODY = [
  "## Please research how to keep widgets running smoothly.",
  "",
  "> Write a detailed report.",
  ">",
  "> 1. Which oils suit widget gears?",
  "> 2. How often should they be serviced?",
  "",
  "### Keeping Widgets Running",
  "",
  "Widgets last longer with regular care.[[#^c-t-1|⁽¹⁾]] Squeaks are the first sign of trouble.[[#^c-t-2|⁽²⁾]][[#^c-t-1|⁽¹⁾]]",
  "",
  "#### Choosing an Oil",
  "",
  "| Oil | Use |",
  "| --- | --- |",
  "| Light | Small gears |",
  "| Heavy | Large gears |",
  "",
  "The wear study measured both.[[#^c-t-3|⁽³⁾]] One forum claim had no source.",
  "",
  "| Gear | Advice |",
  "| --- | --- |",
  "| **Small** | Oil monthly.[[#^c-t-1\\|⁽¹⁾]]<br>Wipe weekly. |",
  "| Large | Replace yearly.[[#^c-t-3\\|⁽³⁾]] |",
  "",
  "##### A service schedule",
  "",
  "```",
  "weekly:  wipe",
  "monthly: oil",
  "yearly:  replace gears",
  "```",
  "",
  "- Keep widgets **dry**.",
  "- Store them indoors.",
].join("\n");

/** A linked-citation marker in the copy, with its `|` escaped or not. */
const LINKED_MARKER = /\[\[#\^c-t-\d\\?\|[^\]]*\]\]/g;

const REPORT_SOURCES = [
  "#### Sources",
  "",
  "##### Citations",
  "",
  "1. [Widget care guide](https://docs.widget.example/care) — docs.widget.example ^c-t-1",
  "2. [Squeaky widgets thread](https://forum.widget.example/t/42) — forum.widget.example ^c-t-2",
  "3. [Widget wear study](https://lab.example/report) — lab.example ^c-t-3",
  "",
  "##### More",
  "",
  "- [Oiling \\[gears\\] properly](https://blog.gears.example/oil) — blog.gears.example",
].join("\n");

check("report: by default, the request as prompt, the report with its table and code, citations from the used list by first appearance, and the uncited used sources under More", () => {
  assert.equal(convertReport(), `${REPORT_BODY}\n\n${REPORT_SOURCES}`);
});

check("report: the used list's sources are cited where a marker points to them; a marker without a source is dropped", () => {
  const document = geminiPage();
  assert.deepEqual(
    readGeminiReferences(document.querySelector(REPORT_PANEL_SELECTOR)!)!.map((reference) => [reference.domain, reference.cited]),
    [["docs.widget.example", true], ["blog.gears.example", false], ["forum.widget.example", true], ["lab.example", true]],
  );
  assert.equal(readGeminiReferences(document.querySelector('infinite-scroller[data-test-id="chat-history-container"]')!), null);
});

check('report: with "Sources used in the report" off, no markers and no Sources section, whatever the generic More setting says', () => {
  const markdown = convertReport({ "used-sources": false }, { includeMoreSources: true });
  assert.equal(markdown, REPORT_BODY.replace(LINKED_MARKER, ""));
});

check("report: browsed-but-not-used and thinking come after the Sources section, in that order, each as a section of its own", () => {
  const thinking = [
    "#### Thinking",
    "",
    "**Planning the search**",
    "",
    "I'll start with care guides, then look at oils.",
    "",
    "- [Widget care guide](https://docs.widget.example/care) — docs.widget.example",
    "- [Widget shop](https://shop.example/widgets) — shop.example",
    "",
    "**Comparing findings**",
    "",
    "The study and the guide agree on monthly oiling.",
  ].join("\n");
  const unused = [
    "#### Sources browsed but not used",
    "",
    "- [Widget shop](https://shop.example/widgets) — shop.example",
    "- [Widget news](https://news.example/widgets) — news.example",
  ].join("\n");
  assert.equal(convertReport({ "unused-sources": true, thinking: true }), `${REPORT_BODY}\n\n${REPORT_SOURCES}\n\n${unused}\n\n${thinking}`);
  assert.equal(convertReport({ thinking: true }), `${REPORT_BODY}\n\n${REPORT_SOURCES}\n\n${thinking}`);
  assert.equal(convertReport({ "used-sources": false, "unused-sources": true }), `${REPORT_BODY.replace(LINKED_MARKER, "")}\n\n${unused}`);
});

check("report: every citation style writes the report's citations", () => {
  const footnotes = convertReport({}, { style: "footnotes" });
  assert.match(footnotes, /regular care\.\[\^1\] Squeaks are the first sign of trouble\.\[\^2\]\[\^1\]/);
  assert.match(footnotes, /\[\^3\]: \[Widget wear study\]\(https:\/\/lab\.example\/report\) — lab\.example$/);
  assert.match(convertReport({}, { style: "inline-links-and-sources" }), /regular care\.\[1\]\(https:\/\/docs\.widget\.example\/care\)/);
  const sourcesOnly = convertReport({}, { style: "sources-only" });
  assert.match(sourcesOnly, /regular care\. Squeaks/);
  assert.match(sourcesOnly, /1\. \[Widget care guide\]\(https:\/\/docs\.widget\.example\/care\) — docs\.widget\.example\n/);
});

check("report: an unfinished report (no end marker, or no source lists yet) isn't copied", () => {
  for (const missing of [".end-of-report-marker", "deep-research-source-lists"]) {
    const document = geminiPage();
    document.querySelector(missing)!.remove();
    assert.throws(() => convertReport({}, {}, document), (error: Error) => error instanceof ConversionError && error.message === "Gemini is still writing this report. Copy again once it's finished.");
  }
});

check("report: the prompt is the research request, not Start research, only with its option on; null outside the panel", () => {
  const document = geminiPage();
  const panel = document.querySelector(REPORT_PANEL_SELECTOR)!;
  const on = (id: string) => id === "report-prompt";
  assert.match(readGeminiPrompt(panel, on)!, /^Please research how to keep widgets running smoothly\.\nWrite a detailed report\.\n\n1\. /);
  assert.equal(readGeminiPrompt(panel, () => false), null);
  assert.equal(readGeminiPrompt(panel), null, "off by default");
  assert.equal(readGeminiPrompt(document.querySelector('infinite-scroller[data-test-id="chat-history-container"]')!, on), null);
});

await checkAsync("report prompt: left out by default; with its option on, the request leads the copy, unless prompts are off; the conversation keeps its prompts", async () => {
  const copyReport = async (edit: (settings: Settings) => void) => {
    const page = startGemini(edit);
    page.document.querySelector<HTMLButtonElement>('[title="Copy report as Markdown"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return page;
  };
  const byDefault = await copyReport(() => {});
  assert.equal(byDefault.copied[0], convertReport({ "report-prompt": false }, { style: "footnotes" }));
  assert.match(byDefault.copied[0], /^# Keeping Widgets Running\n/);
  const withRequest = await copyReport((settings) => (settings.sites.gemini.options["report-prompt"] = true));
  assert.equal(withRequest.copied[0], convertReport({}, { style: "footnotes" }));
  assert.match(withRequest.copied[0], /^## Please research how to keep widgets running smoothly\.\n/);
  const promptsOff = await copyReport((settings) => {
    settings.sites.gemini.options["report-prompt"] = true;
    settings.includePrompt = false;
  });
  assert.match(promptsOff.copied[0], /^# Keeping Widgets Running\n/);
  promptsOff.document.querySelector<HTMLButtonElement>('[title="Copy conversation as Markdown"]')!.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(promptsOff.copied[1], /^## Please research how to keep widgets running smoothly\./);
});

check("report: the button goes right before Share & Export, labelled Report", () => {
  const document = geminiPage();
  const panel = document.querySelector(REPORT_PANEL_SELECTOR)!;
  const share = panel.querySelector('[data-test-id="export-menu-button"]')!;
  assert.deepEqual(geminiAdapter.findButtonAnchor(panel), { parent: share.parentElement, before: share });
  assert.deepEqual(geminiAdapter.buttonLabel!(panel), { title: "Copy report as Markdown", text: "Report" });
  share.remove();
  assert.equal(geminiAdapter.findButtonAnchor(panel), null);
});

// ---------------------------------------------------------------------------
// The conversation copy
// ---------------------------------------------------------------------------

const HISTORY = 'infinite-scroller[data-test-id="chat-history-container"]';

/** The fixture's conversation converted as the controller would, with prompts as H2 headings. */
function convertGeminiConversation(document = geminiPage()): string {
  return convertConversation(geminiAdapter, readGeminiTurns(document.querySelector(HISTORY)!)!, {
    style: "linked-citations",
    includeMoreSources: false,
    isRuleEnabled: () => true,
    idToken: "t",
    promptFormat: { format: "heading", headingLevel: 2 },
    referencesFor: (reply) => geminiAdapter.readReferences!(reply),
  });
}

check("conversation: each prompt and reply in order, the plan as a numbered list of steps, and the report card as a line", () => {
  assert.equal(
    convertGeminiConversation(),
    [
      "## Please research how to keep widgets running smoothly.",
      "",
      "> Write a detailed report.",
      ">",
      "> 1. Which oils suit widget gears?",
      "> 2. How often should they be serviced?",
      "",
      "I've put together a research plan. If you need to update it in any way, let me know.",
      "",
      "**Widget Care Research**",
      "",
      "1. **Research Websites**",
      "   - (1) Find care guides for widgets.",
      "   - (2) Compare gear oils.",
      "2. **Analyze Results**",
      "3. **Create Report**",
      "",
      "## Start research",
      "",
      "I've completed your research. Feel free to ask me follow-up questions or request changes.",
      "",
      "Deep Research report: *Widget Maintenance Report*",
    ].join("\n"),
  );
});

check("conversation: only the history splits into turns, and a turn without a reply keeps its prompt", () => {
  const document = geminiPage();
  assert.equal(readGeminiTurns(document.querySelector(REPORT_PANEL_SELECTOR)!), null);
  document.querySelector("#turn-start model-response")!.remove();
  assert.ok(convertGeminiConversation(document).endsWith("3. **Create Report**\n\n## Start research"));
});

/** The fixture page with the extension running on it, recording what's copied. */
function startGemini(edit: (settings: Settings) => void = () => {}) {
  const document = geminiPage();
  const settings = buildDefaultSettings([geminiAdapter]);
  settings.citationStyle = "footnotes";
  edit(settings);
  const copied: string[] = [];
  const controller = new ContentController(geminiAdapter, settings, { document, writeClipboard: async (text) => void copied.push(text), requestFrame: (callback) => callback() });
  controller.start();
  const toolbar = () => Array.from(document.querySelector(".action-buttons")!.children, (child) => child.getAttribute("title") ?? child.getAttribute("data-test-id") ?? child.nodeName.toLowerCase());
  return { document, controller, settings, copied, toolbar };
}

await checkAsync("buttons: Conversation, then Report, before Share & Export; each copies its own Markdown, the conversation with its prompts even when prompts are off", async () => {
  const page = startGemini((settings) => (settings.includePrompt = false));
  assert.deepEqual(page.toolbar().slice(0, 4), ["toc-menu", "Copy conversation as Markdown", "Copy report as Markdown", "export-menu-button"]);
  const button = (title: string) => page.document.querySelector<HTMLButtonElement>(`[title="${title}"]`)!;
  assert.equal(button("Copy report as Markdown").textContent, "Report");
  assert.equal(button("Copy conversation as Markdown").textContent, "Conversation");
  button("Copy report as Markdown").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(page.copied[0], convertReport({}, { style: "footnotes", prompt: undefined }), "the report alone, since prompts are off");
  assert.match(page.copied[0], /^# Keeping Widgets Running\n/);
  button("Copy conversation as Markdown").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(page.copied[1], convertGeminiConversation());
});

check("buttons: the conversation's button goes before Report whichever is added first, leaves with its option, and needs an open report (or, since spec/gemini-chat, the top bar's menu, which this fixture lacks)", () => {
  const page = startGemini((settings) => (settings.sites.gemini.options["conversation-button"] = false));
  assert.deepEqual(page.toolbar().slice(1, 3), ["Copy report as Markdown", "export-menu-button"]);
  page.controller.applySettings(buildDefaultSettings([geminiAdapter]));
  assert.deepEqual(page.toolbar().slice(1, 4), ["Copy conversation as Markdown", "Copy report as Markdown", "export-menu-button"]);
  const off = buildDefaultSettings([geminiAdapter]);
  off.sites.gemini.options["conversation-button"] = false;
  page.controller.applySettings(off);
  assert.deepEqual(page.toolbar().slice(1, 3), ["Copy report as Markdown", "export-menu-button"]);
  const closed = geminiPage();
  closed.querySelector(REPORT_PANEL_SELECTOR)!.remove();
  assert.equal(geminiAdapter.findButtonAnchor(closed.querySelector(HISTORY)!, () => true), null);
});

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** The rows of the first table in `markdown`, each split into its cells at unescaped `|`. */
function tableCells(markdown: string): string[][] {
  const rows = markdown.split("\n").filter((line) => line.startsWith("|"));
  return rows.map((row) => row.split(/(?<!\\)\|/).slice(1, -1).map((cell) => cell.trim()));
}

check("tables: cells holding paragraphs and citations stay on one row, in every citation style", () => {
  for (const style of ["linked-citations", "footnotes", "inline-links-and-sources", "sources-only"] as const) {
    const markdown = convertReport({}, { style });
    const rows = tableCells(markdown.slice(markdown.indexOf("| Gear |")));
    assert.equal(rows.length, 4, `${style}: header, divider and two rows`);
    assert.ok(rows.every((cells) => cells.length === 2), `${style}: every row has two cells: ${JSON.stringify(rows)}`);
    assert.match(rows[2][1], /^Oil monthly\..*<br>Wipe weekly\.$/, `${style}: the cell's two paragraphs are joined by <br>`);
  }
});

check("tables: a linked marker in a table row is escaped on any site, and one outside a table isn't", () => {
  const reply = '<p>Before <a class="cite" href="https://a.example/one">One</a>.</p><table><thead><tr><th>A</th></tr></thead><tbody><tr><td>In <a class="cite" href="https://a.example/one">One</a></td></tr></tbody></table>';
  const markdown = convertMessage(toyAdapter(), toyMessage(reply), toyOptions());
  assert.match(markdown, /^Before\[\[#\^c-t-1\|⁽¹⁾\]\]\.$/m);
  assert.match(markdown, /^\| In\[\[#\^c-t-1\\\|⁽¹⁾\]\] \|$/m);
});

// ---------------------------------------------------------------------------
// Registration and settings
// ---------------------------------------------------------------------------

check("registration: Gemini is a site, matched on its app and a second account's /u/1/ paths, and in the built manifest", () => {
  assert.ok(SITE_ADAPTERS.includes(geminiAdapter));
  assert.equal(findAdapterForUrl("https://gemini.google.com/app/0123456789abcdef"), geminiAdapter);
  assert.equal(findAdapterForUrl(GEMINI_URL), geminiAdapter);
  assert.equal(findAdapterForUrl("https://google.com/search?q=gemini"), undefined);
  const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf8")) as { content_scripts: { matches: string[] }[] };
  assert.ok(manifest.content_scripts.some((script) => script.matches.includes("https://gemini.google.com/*")));
});

check("registration: Gemini reads everything from the page itself, so no script runs in its page", () => {
  assert.equal(geminiAdapter.pageScript, undefined);
  const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf8")) as { content_scripts: { matches: string[]; world?: string }[] };
  assert.ok(manifest.content_scripts.every((script) => script.world !== "MAIN" || !script.matches.includes("https://gemini.google.com/*")));
});

check("settings: Gemini's options start on, off, off, off (the report's prompt), on, with no generic More", () => {
  const site = buildDefaultSettings(SITE_ADAPTERS).sites.gemini;
  assert.deepEqual(site.options, { "used-sources": true, "unused-sources": false, thinking: false, "report-prompt": false, "conversation-button": true });
  assert.equal(site.includeMoreSources, true, "stored as for any site that reads references, but never shown or used");
});

// Since spec/gemini-chat, Gemini's replies have a Copy the override can take over, so the section offers it.
check("options page: Gemini's section has the button with its hint, the override, then its five options, and no generic More", () => {
  const document = new JSDOM("<!doctype html><body></body>").window.document;
  const form = renderOptions(document, SITE_ADAPTERS, () => {});
  document.body.append(form.root);
  form.fill(buildDefaultSettings(SITE_ADAPTERS));
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('section[data-site="gemini"] fieldset.site input'), (input) => input.name).filter((name) => !name.includes(".rules."));
  assert.deepEqual(inputs, ["gemini.showCopyButton", "gemini.overrideNativeCopy", "gemini.options.used-sources", "gemini.options.unused-sources", "gemini.options.thinking", "gemini.options.report-prompt", "gemini.options.conversation-button"]);
  const hint = document.querySelector('input[name="gemini.showCopyButton"]')!.closest(".option")!.querySelector(".hint")!.textContent;
  assert.equal(hint, "Adds a button to each reply, before Gemini's Copy, and Conversation and Report buttons to the top bar or a report's toolbar.");
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
