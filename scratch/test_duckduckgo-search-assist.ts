/**
 * Regression checks for spec/duckduckgo-search-assist: the Search Assist
 * adapter's selectors and button placement, conversion of the collapsed and
 * after-More answers (source chips, Streamdown markup), the "still writing"
 * refusal, the More sources list, the page script, the native Copy override,
 * registration and settings, against a synthetic fixture modeled on
 * duckduckgo.com's markup. Run with `pnpm test`, which runs every
 * scratch/test_*.ts script. Each check prints PASS or FAIL, and the process
 * exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { ContentController } from "../src/content/controller";
import { convertMessage } from "../src/core/convert";
import { REFERENCES_ATTRIBUTE, REFERENCES_EVENT } from "../src/core/references-protocol";
import { buildDefaultSettings } from "../src/core/settings";
import { ConversionError, type CitationStyle, type SourceReference } from "../src/core/types";
import { renderOptions } from "../src/options/options";
import { extractSearchAssistReferences, installSearchAssistPageScript } from "../src/page/duckduckgo";
import { duckAiAdapter } from "../src/sites/duckai";
import { duckDuckGoAdapter, readSearchAssistReferences } from "../src/sites/duckduckgo";
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

/**
 * The answer data Search Assist keeps in React state, as the page script finds
 * it: the chips' sources in chip order, then every consulted page, which
 * repeats both cited ones (one with a trailing slash) and adds two more and
 * one entry without an http(s) URL that must be dropped.
 */
const ANSWER_DATA = {
  answer: "Widgets are small parts…",
  sources: [
    { article: { link: "https://widget.example/guide", site: "widget.example", text: "The Widget Guide | Widget Docs" } },
    { article: { link: "https://gadget.example/parts", site: "gadget.example", text: "Gadget parts list" } },
    { article: { link: "javascript:void(0)", site: "", text: "Not a page" } },
  ],
  all_source_urls: ["https://widget.example/guide/", "https://gadget.example/parts", "https://parts.example/widgets", "ftp://files.example/w", "https://forum.example/t/widgets"],
};

/** Builds a chain of fake React fibers with the answer data `levels` above the first, under `item.data.data`. */
function fakeFiber(data: unknown, levels = 6): object {
  let fiber: object = { memoizedProps: { item: { data: { data } } }, return: null };
  for (let i = 0; i < levels; i++) fiber = { memoizedProps: { className: "x" }, return: fiber };
  return fiber;
}

/**
 * A fresh copy of the fixture page. jsdom runs no React, so each short answer
 * gets a fake fiber holding {@link ANSWER_DATA}; with `pageScript`, the page
 * script is installed as it is on the real page.
 */
function searchPage({ pageScript = true, data = ANSWER_DATA as unknown } = {}): Document {
  const page = new JSDOM(readFileSync("scratch/fixtures/duckduckgo-search-assist.html", "utf8")).window.document;
  for (const answer of Array.from(page.querySelectorAll('[data-testid="duckassist-answer-content"]'))) {
    (answer as unknown as Record<string, object>)["__reactFiber$test"] = fakeFiber(data);
  }
  if (pageScript) installSearchAssistPageScript(page);
  return page;
}

/** The fixture's Search Assist module with the given id: `collapsed`, `after-more` or `writing`. */
function module(page: Document, id: "collapsed" | "after-more" | "writing"): Element {
  return page.getElementById(id)!;
}

/**
 * Converts `message` as the controller does, reading its references first.
 * Search Assist's own options (inline chips, Explore More) are all off, so
 * these checks cover the numbered citations; the options have their own
 * checks in test_search-assist-explore-more.ts.
 */
function convert(message: Element, { style = "linked-citations" as CitationStyle, includeMoreSources = false } = {}): string {
  return convertMessage(duckDuckGoAdapter, message, {
    style,
    includeMoreSources,
    isRuleEnabled: () => true,
    references: readSearchAssistReferences(message),
    isOptionEnabled: () => false,
  });
}

/** `markdown` with its random block-ID token replaced, so two copies can be compared. */
const withoutToken = (markdown: string) => markdown.replace(/c-[a-z0-9]{4}-/g, "c-TOKEN-");

/** The short answer, as every copy starts. */
const SHORT_ANSWER = "**Widgets** are small parts that fit into gadgets.\n\nMost gadgets need two of them.[[#^c-TOKEN-1|⁽¹⁾]][[#^c-TOKEN-2|⁽²⁾]]";

/** The two chips' citations, titled from the answer data. */
const CITATIONS = [
  "## Sources",
  "",
  "### Citations",
  "",
  "1. [The Widget Guide | Widget Docs](https://widget.example/guide) — widget.example ^c-TOKEN-1",
  "2. [Gadget parts list](https://gadget.example/parts#widgets) — gadget.example ^c-TOKEN-2",
].join("\n");

/** The collapsed module's copy in linked-citations style. */
const COLLAPSED = `${SHORT_ANSWER}\n\n${CITATIONS}`;

/** The collapsed module's copy with the default settings, which keep Search Assist's inline chips. */
const COLLAPSED_INLINE = [
  "**Widgets** are small parts that fit into gadgets.",
  "",
  "Most gadgets need two of them. [![|16](https://external-content.example/ip3/widget.example.ico) widget.example](https://widget.example/guide) [![|16](https://external-content.example/ip3/gadget.example.ico) gadget.example](https://gadget.example/parts#widgets)",
].join("\n");

// ---------------------------------------------------------------------------
// Messages and placement
// ---------------------------------------------------------------------------

check("messages: each Search Assist module is found, and the organic results aren't", () => {
  const page = searchPage();
  assert.deepEqual(
    Array.from(page.querySelectorAll(duckDuckGoAdapter.messageSelector)).map((message) => message.id),
    ["collapsed", "after-more", "writing"],
  );
});

check("placement: directly before Copy in the toolbar; none without a Copy button", () => {
  const page = searchPage();
  const message = module(page, "collapsed");
  const copy = message.querySelector(duckDuckGoAdapter.nativeCopyButtonSelector)!;
  assert.deepEqual(duckDuckGoAdapter.findButtonAnchor(message), { parent: copy.parentElement, before: copy });
  copy.remove();
  assert.equal(duckDuckGoAdapter.findButtonAnchor(message), null);
});

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

check("collapsed: the whole short answer, bold kept, chips as titled citations; no toolbar or Expand text", () => {
  const markdown = convert(module(searchPage(), "collapsed"));
  assert.equal(withoutToken(markdown), COLLAPSED);
  assert.doesNotMatch(markdown, /Search Assist|Auto-generated|feedback|Expand/i);
});

check("collapsed: footnotes style", () => {
  assert.equal(
    convert(module(searchPage(), "collapsed"), { style: "footnotes" }),
    [
      "**Widgets** are small parts that fit into gadgets.",
      "",
      "Most gadgets need two of them.[^1][^2]",
      "",
      "[^1]: [The Widget Guide | Widget Docs](https://widget.example/guide) — widget.example",
      "[^2]: [Gadget parts list](https://gadget.example/parts#widgets) — gadget.example",
    ].join("\n"),
  );
});

check("after More: the short answer, then the extended answer; its chip reuses citation 1, and no ask box", () => {
  const markdown = convert(module(searchPage(), "after-more"));
  const expected = [
    SHORT_ANSWER,
    "",
    "## How widgets work",
    "",
    "A widget turns once for every turn of the gadget.",
    "",
    "### Sizes",
    "",
    "| Size | Teeth |",
    "| --- | --- |",
    "| Small | 12 |",
    "| Large | 24 |",
    "",
    "1. Pick a size.",
    "2. Fit the widget.",
    "",
    "- **Small widgets:** for pocket gadgets.",
    "- **Large widgets:** for desk gadgets.",
    "",
    "Check the fit:",
    "",
    "```bash",
    "if widget --fits; then",
    '  echo "fits"',
    "fi",
    "```",
    "",
    "The guide has more detail.[[#^c-TOKEN-1|⁽¹⁾]]",
    "",
    CITATIONS,
  ].join("\n");
  assert.equal(withoutToken(markdown), expected);
  assert.doesNotMatch(markdown, /Ask Duck\.ai|follow-up/);
});

check("writing: conversion refuses with the still-writing message", () => {
  assert.throws(
    () => convert(module(searchPage(), "writing")),
    (error: unknown) => error instanceof ConversionError && error.message === "Search Assist is still writing its answer. Copy again once it's finished.",
  );
});

check("the live page is left unchanged by a copy", () => {
  const page = searchPage();
  const message = module(page, "after-more");
  const before = message.outerHTML;
  convert(message, { includeMoreSources: true });
  assert.equal(message.outerHTML, before);
});

// ---------------------------------------------------------------------------
// More sources
// ---------------------------------------------------------------------------

check("More on: the uncited consulted pages follow Citations as untitled links, without the cited ones", () => {
  const markdown = convert(module(searchPage(), "collapsed"), { includeMoreSources: true });
  assert.equal(
    withoutToken(markdown),
    `${COLLAPSED}\n\n### More\n\n- [parts.example](https://parts.example/widgets)\n- [forum.example](https://forum.example/t/widgets)`,
  );
});

check("More off: no More section", () => {
  assert.doesNotMatch(convert(module(searchPage(), "collapsed")), /### More/);
});

check("no page data: chips use their domains, and there's no More even with it on", () => {
  for (const page of [searchPage({ pageScript: false }), searchPage({ data: null })]) {
    const message = module(page, "collapsed");
    assert.equal(readSearchAssistReferences(message), null);
    const markdown = withoutToken(convert(message, { includeMoreSources: true }));
    assert.ok(markdown.endsWith("1. [widget.example](https://widget.example/guide) ^c-TOKEN-1\n2. [gadget.example](https://gadget.example/parts#widgets) ^c-TOKEN-2"), markdown);
    assert.doesNotMatch(markdown, /### More/);
  }
});

// ---------------------------------------------------------------------------
// Page script
// ---------------------------------------------------------------------------

check("page script: reads the cited sources then the other consulted pages, dropping non-http URLs", () => {
  assert.deepEqual(extractSearchAssistReferences(module(searchPage({ pageScript: false }), "collapsed")), [
    { url: "https://widget.example/guide", title: "The Widget Guide | Widget Docs", cited: true, hidden: false },
    { url: "https://gadget.example/parts", title: "Gadget parts list", cited: true, hidden: false },
    { url: "https://parts.example/widgets", title: "", cited: false, hidden: false },
    { url: "https://forum.example/t/widgets", title: "", cited: false, hidden: false },
  ]);
});

check("page script: null without a fiber, and past 40 levels", () => {
  const page = searchPage({ pageScript: false });
  const answer = module(page, "collapsed").querySelector('[data-testid="duckassist-answer-content"]')! as unknown as Record<string, object>;
  answer["__reactFiber$test"] = fakeFiber(ANSWER_DATA, 40);
  assert.equal(extractSearchAssistReferences(module(page, "collapsed"))?.length, 4, "40 levels up is still found");
  answer["__reactFiber$test"] = fakeFiber(ANSWER_DATA, 41);
  assert.equal(extractSearchAssistReferences(module(page, "collapsed")), null);
  delete answer["__reactFiber$test"];
  assert.equal(extractSearchAssistReferences(module(page, "collapsed")), null);
});

check("page script: a request writes the list to the module, and clears a stale one when there's nothing", () => {
  const page = searchPage();
  const message = module(page, "collapsed");
  const request = () => message.dispatchEvent(new page.defaultView!.CustomEvent(REFERENCES_EVENT, { bubbles: true }));
  request();
  assert.equal((JSON.parse(message.getAttribute(REFERENCES_ATTRIBUTE)!) as SourceReference[]).length, 4);
  delete (message.querySelector('[data-testid="duckassist-answer-content"]') as unknown as Record<string, object>)["__reactFiber$test"];
  request();
  assert.equal(message.hasAttribute(REFERENCES_ATTRIBUTE), false);
});

check("reader: leaves no attribute behind on the module", () => {
  const message = module(searchPage(), "collapsed");
  assert.equal(readSearchAssistReferences(message)?.length, 4);
  assert.equal(message.hasAttribute(REFERENCES_ATTRIBUTE), false);
});

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

/** A controller on a fresh fixture page, recording clipboard writes and clicks that reach the "site". */
function startController(overrideNativeCopy: boolean) {
  const document = searchPage();
  const settings = buildDefaultSettings(SITE_ADAPTERS);
  settings.sites.duckduckgo.overrideNativeCopy = overrideNativeCopy;
  const written: string[] = [];
  const siteClicks: string[] = [];
  // Stands in for Search Assist's own Copy handler, which React attaches at its root element.
  document.getElementById("react-layout")!.addEventListener("click", () => siteClicks.push("native copy ran"));
  const controller = new ContentController(duckDuckGoAdapter, settings, { document, writeClipboard: async (text) => void written.push(text), requestFrame: (callback) => callback() });
  controller.start();
  return { document, written, siteClicks };
}

/** Lets pending timers and promise callbacks run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

await checkAsync("controller: each module gets a Copy as Markdown button before Copy, and it copies the answer", async () => {
  const page = startController(false);
  const buttons = Array.from(page.document.querySelectorAll<HTMLButtonElement>(".acf-copy-button"));
  assert.equal(buttons.length, 3);
  assert.equal(buttons[0].nextElementSibling, module(page.document, "collapsed").querySelector(duckDuckGoAdapter.nativeCopyButtonSelector));
  buttons[0].click();
  await flush();
  assert.deepEqual(page.written, [COLLAPSED_INLINE]);
  assert.deepEqual(page.siteClicks, []);
});

await checkAsync("controller: Copy as Markdown on a module that's still writing shows the message and copies nothing", async () => {
  const page = startController(false);
  module(page.document, "writing").querySelector<HTMLButtonElement>(".acf-copy-button")!.click();
  await flush();
  assert.deepEqual(page.written, []);
  assert.match(page.document.querySelector(".acf-toast")?.textContent ?? "", /still writing/);
});

await checkAsync("controller: with the override on, Search Assist's own Copy writes the same Markdown", async () => {
  const page = startController(true);
  module(page.document, "collapsed").querySelector<HTMLButtonElement>(duckDuckGoAdapter.nativeCopyButtonSelector)!.click();
  await flush();
  assert.deepEqual(page.written, [COLLAPSED_INLINE]);
  assert.deepEqual(page.siteClicks, []);
});

await checkAsync("controller: with the override on, a module that's still writing falls through to Search Assist's copy", async () => {
  const page = startController(true);
  const warn = console.warn;
  console.warn = () => {};
  try {
    module(page.document, "writing").querySelector<HTMLButtonElement>(duckDuckGoAdapter.nativeCopyButtonSelector)!.click();
  } finally {
    console.warn = warn;
  }
  await flush();
  assert.deepEqual(page.written, []);
  assert.deepEqual(page.siteClicks, ["native copy ran"]);
});

// ---------------------------------------------------------------------------
// Registration, settings and options page
// ---------------------------------------------------------------------------

check("registration: DuckDuckGo search picks this adapter, and Duck.ai keeps its own", () => {
  assert.equal(findAdapterForUrl("https://duckduckgo.com/?q=x&ia=web"), duckDuckGoAdapter);
  assert.equal(findAdapterForUrl("https://duckduckgo.com/"), duckDuckGoAdapter);
  assert.equal(findAdapterForUrl("https://duck.ai/chat"), duckAiAdapter);
});

check("registration: the manifest runs the content script and this page script on duckduckgo.com only", () => {
  const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
  assert.ok(manifest.content_scripts[0].matches.includes("https://duckduckgo.com/*"));
  const pageScripts = manifest.content_scripts.slice(1) as { matches: string[]; js: string[] }[];
  assert.deepEqual(
    pageScripts.filter((script) => script.js.includes("page-duckduckgo.js")),
    [{ matches: ["https://duckduckgo.com/*"], js: ["page-duckduckgo.js"], run_at: "document_idle", world: "MAIN" }],
  );
  assert.ok(pageScripts.every((script) => script.js.includes("page-duckduckgo.js") || !script.matches.includes("https://duckduckgo.com/*")), "no other page script on duckduckgo.com");
});

check("settings: More sources start off for Search Assist and on for Copilot and Duck.ai", () => {
  const sites = buildDefaultSettings(SITE_ADAPTERS).sites;
  assert.equal(sites.duckduckgo.includeMoreSources, false);
  assert.equal(sites.copilot.includeMoreSources, true);
  assert.equal(sites.duckai.includeMoreSources, true);
});

check("options page: each site's More sources option has its own description", () => {
  const document = new JSDOM("<!doctype html><body></body>").window.document;
  const form = renderOptions(document, SITE_ADAPTERS, () => {});
  document.body.append(form.root);
  const settings = buildDefaultSettings(SITE_ADAPTERS);
  // While Search Assist's inline chips are on, its More option says why it's unused instead; that has its own check.
  settings.sites.duckduckgo.options["inline-chips"] = false;
  form.fill(settings);
  const hint = (site: string) => document.querySelector(`input[name="${site}.includeMoreSources"]`)!.closest("label")!.querySelector(".hint")!.textContent;
  assert.equal(hint("copilot"), "Adds the sources Copilot lists under More in its Sources panel but doesn't cite in the reply.");
  assert.equal(hint("duckai"), "Adds the Read More cards that the reply doesn't cite.");
  assert.equal(hint("duckduckgo"), "Adds the other pages Search Assist consulted but doesn't show, as links without titles.");
  assert.equal(document.querySelector<HTMLInputElement>('input[name="duckduckgo.includeMoreSources"]')!.checked, false);
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
