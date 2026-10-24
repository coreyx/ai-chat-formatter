/**
 * Regression checks for the AI Chat Formatter extension (spec/ai-chat-formatter).
 * Run with `npm test`: esbuild bundles this file for Node and runs it. Each
 * check prints PASS or FAIL, and the process exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { CitationCollector, normalizeCitationUrl, parseCitationTitle, renderCitations } from "../src/core/citations";
import { convertMessage } from "../src/core/convert";
import { collapseBlankLinesRule, invisibleCharactersRule, runRules } from "../src/core/rules";
import { buildDefaultSettings, mergeSettings } from "../src/core/settings";
import { ConversionError, type Citation, type SiteAdapter } from "../src/core/types";

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

// ---------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------

const widgetRelease: Citation = {
  url: "https://widget.example/releases/5.0.0",
  title: "Widget 5.0.0 (Current)",
  sourceName: "widget.example",
};
const wdocs: Citation = { url: "https://docs.widget.example/api/path-matcher", title: "PathMatcher - API Reference | Widget Docs", sourceName: "docs.widget.example" };

check("citations: repeat citations of one page share a number", () => {
  const collector = new CitationCollector();
  const a = collector.register(widgetRelease);
  const b = collector.register(wdocs);
  const c = collector.register({ ...widgetRelease, url: widgetRelease.url + "/#notable-changes" });
  assert.equal(a, c);
  assert.notEqual(a, b);
  assert.equal(collector.citations.length, 2);
});

check("citations: URL normalization drops fragment and trailing slash only", () => {
  assert.equal(normalizeCitationUrl("https://Example.com/a/#x"), "https://example.com/a");
  assert.equal(normalizeCitationUrl("https://example.com/a?q=1"), "https://example.com/a?q=1");
  assert.equal(normalizeCitationUrl("not a url "), "not a url");
});

check("citations: footnotes attach to text and collapse adjacent repeats", () => {
  const collector = new CitationCollector();
  const p1 = collector.register(widgetRelease);
  const p2 = collector.register(wdocs);
  const md = `Widget 5 was released. ${p1} ${p1}\n\n- PathMatcher is global ${p2}\n- wpm 4 ${p1}`;
  assert.equal(
    renderCitations(md, collector.citations, "footnotes"),
    "Widget 5 was released.[^1]\n\n- PathMatcher is global[^2]\n- wpm 4[^1]\n\n" +
      "[^1]: [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0)\n" +
      "[^2]: [PathMatcher - API Reference | Widget Docs](https://docs.widget.example/api/path-matcher)",
  );
});

check("citations: inline links plus Sources list", () => {
  const collector = new CitationCollector();
  const p1 = collector.register(widgetRelease);
  assert.equal(
    renderCitations(`Released. ${p1}`, collector.citations, "inline-links-and-sources"),
    "Released.[1](https://widget.example/releases/5.0.0)\n\n## Sources\n\n1. [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0)",
  );
});

check("citations: Sources list only removes inline markers", () => {
  const collector = new CitationCollector();
  const p1 = collector.register(widgetRelease);
  assert.equal(
    renderCitations(`Released. ${p1}`, collector.citations, "sources-only"),
    "Released.\n\n## Sources\n\n1. [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0)",
  );
});

check("citations: no citations leaves the Markdown unchanged", () => {
  assert.equal(renderCitations("Plain *reply*.", [], "footnotes"), "Plain *reply*.");
});

check("citations: titles and URLs that would break a link are escaped", () => {
  const collector = new CitationCollector();
  const p = collector.register({ url: "https://example.com/a (b)", title: "Tips [2026]", sourceName: "example.com" });
  assert.equal(renderCitations(p, collector.citations, "footnotes"), "[^1]\n\n[^1]: [Tips \\[2026\\]](https://example.com/a%20%28b%29)");
});

check("citations: title comes from the last aria-label segment, then name, then host", () => {
  assert.equal(parseCitationTitle("Citation: widget — Widget — Widget 5.0.0 (Current)", "widget.example", widgetRelease.url), "Widget 5.0.0 (Current)");
  assert.equal(parseCitationTitle("Citation: widget", "widget.example", widgetRelease.url), "widget.example");
  assert.equal(parseCitationTitle(null, "", "https://www.example.com/x"), "example.com");
});

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

check("rules: invisible characters are normalized, emoji joiners kept", () => {
  const family = "👨‍👩‍👧";
  assert.equal(invisibleCharactersRule.apply(`a b c​d‌e⁠f﻿g x‍y ${family}`), `a b cdefg xy ${family}`);
});

check("rules: blank-line runs collapse outside fences but not inside", () => {
  const input = "\n\nOne\n\n\n\nTwo\n```\ncode\n\n\n\nmore\n```\n\n\nThree\n\n";
  assert.equal(collapseBlankLinesRule.apply(input), "One\n\nTwo\n```\ncode\n\n\n\nmore\n```\n\nThree");
});

check("rules: a longer closing fence and tilde fences are respected", () => {
  const input = "````md\n```\n\n\ninner\n````\n\n\n~~~\n\n\n~~~";
  assert.equal(collapseBlankLinesRule.apply(input), "````md\n```\n\n\ninner\n````\n\n~~~\n\n\n~~~");
});

check("rules: runRules skips a disabled rule and keeps order", () => {
  const upper = { id: "upper", name: "", description: "", defaultEnabled: true, apply: (s: string) => s.toUpperCase() };
  const bang = { id: "bang", name: "", description: "", defaultEnabled: true, apply: (s: string) => s + "!" };
  assert.equal(runRules("hi", [upper, bang], () => true), "HI!");
  assert.equal(runRules("hi", [upper, bang], (id) => id !== "upper"), "hi!");
});

// ---------------------------------------------------------------------------
// Converter (generic, with a minimal test adapter)
// ---------------------------------------------------------------------------

/** Parses `html` into a detached element using jsdom, standing in for the live page. */
function element(html: string): HTMLElement {
  const { document } = new JSDOM(`<!doctype html><body>${html}</body>`).window;
  return document.body.firstElementChild as HTMLElement;
}

/** A bare adapter: `.reply` is the body, `.chip[data-url]` is a citation, `.chrome` is stripped. */
const testAdapter: SiteAdapter = {
  id: "test",
  name: "Test",
  matches: ["https://chat.example/*"],
  messageSelector: ".message",
  contentSelector: ".reply",
  nativeCopyButtonSelector: ".copy",
  findButtonAnchor: () => null,
  stripSelectors: [".chrome"],
  turndownRules: (context) => ({
    chip: {
      filter: (node) => node.classList.contains("chip"),
      replacement: (_content, node) =>
        context.registerCitation({ url: node.getAttribute("data-url")!, title: node.getAttribute("data-title")!, sourceName: "" }),
    },
  }),
  rules: [invisibleCharactersRule, collapseBlankLinesRule],
};

check("convert: compact list markers, nested lists, headings and strip selectors", () => {
  const message = element(
    `<div class="message"><div class="reply"><h3>Key features</h3><span class="chrome">Copy</span>` +
      `<ol><li>Engine<ul><li>HalfFloatBuffer</li><li><code>Pattern.escape()</code></li></ul></li><li>wpm 4</li></ol></div></div>`,
  );
  assert.equal(
    convertMessage(testAdapter, message, "footnotes", () => true),
    "### Key features\n\n1. Engine\n   - HalfFloatBuffer\n   - `Pattern.escape()`\n2. wpm 4",
  );
});

check("convert: site citation rule feeds the chosen citation style", () => {
  const message = element(
    `<div class="message"><div class="reply"><p>Released in May. <span class="chip" data-url="https://widget.example/x" data-title="Release notes">widget</span></p></div></div>`,
  );
  assert.equal(convertMessage(testAdapter, message, "footnotes", () => true), "Released in May.[^1]\n\n[^1]: [Release notes](https://widget.example/x)");
});

check("convert: KaTeX inline and display math use $ and $$", () => {
  const tex = (source: string) => `<span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">${source}</annotation></semantics></math></span><span class="katex-html">rendered</span></span>`;
  const message = element(
    `<div class="message"><div class="reply"><p>Energy ${tex("E = mc^2")} holds.</p><span class="katex-display">${tex("\\int_0^1 x\\,dx")}</span></div></div>`,
  );
  assert.equal(convertMessage(testAdapter, message, "footnotes", () => true), "Energy $E = mc^2$ holds.\n\n$$\n\\int_0^1 x\\,dx\n$$");
});

check("convert: a message without a reply body throws ConversionError", () => {
  assert.throws(() => convertMessage(testAdapter, element(`<div class="message"></div>`), "footnotes", () => true), ConversionError);
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

check("settings: defaults come from each adapter and its rules", () => {
  const defaults = buildDefaultSettings([testAdapter]);
  assert.deepEqual(defaults, {
    enabled: true,
    citationStyle: "footnotes",
    sites: { test: { enabled: true, showCopyButton: true, overrideNativeCopy: false, rules: { "invisible-characters": true, "collapse-blank-lines": true } } },
  });
});

check("settings: merge keeps stored values and fills in what's missing or invalid", () => {
  const defaults = buildDefaultSettings([testAdapter]);
  const merged = mergeSettings(
    { enabled: false, citationStyle: "bogus", sites: { test: { overrideNativeCopy: true, showCopyButton: "yes", rules: { "collapse-blank-lines": false } }, gone: { enabled: true } } },
    defaults,
  );
  assert.deepEqual(merged, {
    enabled: false,
    citationStyle: "footnotes",
    sites: { test: { enabled: true, showCopyButton: true, overrideNativeCopy: true, rules: { "invisible-characters": true, "collapse-blank-lines": false } } },
  });
  assert.deepEqual(mergeSettings(undefined, defaults), defaults);
  assert.equal(mergeSettings({ citationStyle: "sources-only" }, defaults).citationStyle, "sources-only");
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
