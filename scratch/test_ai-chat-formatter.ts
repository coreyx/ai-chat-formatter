/**
 * Regression checks for the AI Chat Formatter extension (spec/ai-chat-formatter).
 * Run with `npm test`: esbuild bundles this file for Node and runs it. Each
 * check prints PASS or FAIL, and the process exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { CitationCollector, normalizeCitationUrl, parseCitationTitle, renderCitations } from "../src/core/citations";
import type { Citation } from "../src/core/types";

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
// Summary
// ---------------------------------------------------------------------------

for (const result of results) {
  console.log(`${result.error ? "FAIL" : "PASS"}  ${result.name}`);
  if (result.error) console.log(`      ${String((result.error as Error).message ?? result.error).split("\n").join("\n      ")}`);
}
const failed = results.filter((result) => result.error).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
