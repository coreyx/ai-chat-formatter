/**
 * Regression checks for spec/block-reference-citations: the Linked citations
 * style (a numbered Citations list with Obsidian block IDs, linked from the
 * text) and the footnotes style's layout without a Citations heading. Run with
 * `npm test`, which runs every scratch/test_*.ts script. Each check prints PASS
 * or FAIL, and the process exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { CitationCollector, citationBlockId, renderCitations, sourceDomain, superscriptDigits } from "../src/core/citations";
import { convertMessage, randomIdToken } from "../src/core/convert";
import type { Citation, SourceReference } from "../src/core/types";
import { copilotAdapter } from "../src/sites/copilot";

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

/** A source reference for `url`, with its domain derived the way adapters do. */
function ref(url: string, title: string): SourceReference {
  return { url, title, domain: sourceDomain(url), cited: false };
}

const release: Citation = { url: "https://widget.example/releases/5.0.0", title: "Widget 5.0.0 (Current)", sourceName: "widget.example" };
const api: Citation = { url: "https://docs.widget.example/api/path-matcher", title: "PathMatcher - API Reference | Widget Docs", sourceName: "docs.widget.example" };
const blog = ref("https://widget.example/blog/widget-5", "Widget 5 is now available | Widget Blog");

/** A body citing `release` twice in a row and then `api`, with the collector holding both. */
function widgetReply(): { body: string; citations: Citation[] } {
  const collector = new CitationCollector();
  const r = collector.register(release);
  const a = collector.register(api);
  return { body: `Widget 5 was released in May. ${r} ${r}\n\n- PathMatcher is global ${a} ${r}`, citations: collector.citations };
}

// ---------------------------------------------------------------------------
// Linked citations
// ---------------------------------------------------------------------------

check("linked: markers link to block IDs on a numbered Citations list, More after it", () => {
  const { body, citations } = widgetReply();
  assert.equal(
    renderCitations(body, citations, "linked-citations", [blog], "k3f9"),
    "Widget 5 was released in May.[[#^c-k3f9-1|⁽¹⁾]]\n\n" +
      "- PathMatcher is global[[#^c-k3f9-2|⁽²⁾]][[#^c-k3f9-1|⁽¹⁾]]\n\n" +
      "## Sources\n\n" +
      "### Citations\n\n" +
      "1. [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0) — widget.example ^c-k3f9-1\n" +
      "2. [PathMatcher - API Reference | Widget Docs](https://docs.widget.example/api/path-matcher) — docs.widget.example ^c-k3f9-2\n\n" +
      "### More\n\n" +
      "- [Widget 5 is now available | Widget Blog](https://widget.example/blog/widget-5) — widget.example",
  );
});

check("linked: markers from 10 up, valid block IDs, and every marker has an entry", () => {
  const collector = new CitationCollector();
  const markers = Array.from({ length: 12 }, (_, i) => collector.register({ url: `https://site${i}.example/`, title: `Page ${i + 1}`, sourceName: "" }));
  const out = renderCitations(markers.join(" "), collector.citations, "linked-citations", [], "k3f9");
  assert.ok(out.includes("[[#^c-k3f9-12|⁽¹²⁾]]"), "citation 12 shows as superscript 12 in parentheses");
  const linked = [...out.matchAll(/\[\[#\^([^|\]]+)\|/g)].map((m) => m[1]);
  const defined = [...out.matchAll(/ \^([^\s]+)$/gm)].map((m) => m[1]);
  assert.equal(linked.length, 12);
  for (const id of [...linked, ...defined]) assert.match(id, /^[a-z0-9-]+$/);
  assert.deepEqual([...new Set(linked)].sort(), [...defined].sort());
  assert.equal(superscriptDigits(105), "¹⁰⁵");
});

check("linked: citations only, More only, nothing, and an empty or unsafe token", () => {
  const { body, citations } = widgetReply();
  const citationsOnly = renderCitations(body, citations, "linked-citations", [], "k3f9");
  assert.ok(citationsOnly.includes("### Citations") && !citationsOnly.includes("### More"));
  assert.equal(renderCitations("Text.", [], "linked-citations", [blog], "k3f9"), "Text.\n\n## Sources\n\n### More\n\n- [Widget 5 is now available | Widget Blog](https://widget.example/blog/widget-5) — widget.example");
  assert.equal(renderCitations("Plain *reply*.", [], "linked-citations", [], "k3f9"), "Plain *reply*.");
  assert.ok(renderCitations(body, citations, "linked-citations").includes("[[#^c-1|⁽¹⁾]]"), "no token: c-1");
  assert.equal(citationBlockId("K3_f9!", 2), "c-k3f9-2", "unsafe token characters are dropped");
});

// ---------------------------------------------------------------------------
// Footnotes without a Citations heading
// ---------------------------------------------------------------------------

check("footnotes: More under Sources, then the definitions; without More, just the definitions", () => {
  const { body, citations } = widgetReply();
  const withMore = renderCitations(body, citations, "footnotes", [blog]);
  assert.ok(
    withMore.endsWith(
      "## Sources\n\n### More\n\n- [Widget 5 is now available | Widget Blog](https://widget.example/blog/widget-5) — widget.example\n\n" +
        "[^1]: [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0) — widget.example\n" +
        "[^2]: [PathMatcher - API Reference | Widget Docs](https://docs.widget.example/api/path-matcher) — docs.widget.example",
    ),
  );
  assert.ok(!withMore.includes("### Citations"));
  const withoutMore = renderCitations(body, citations, "footnotes", []);
  assert.ok(withoutMore.endsWith("- PathMatcher is global[^2][^1]\n\n[^1]: [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0) — widget.example\n[^2]: [PathMatcher - API Reference | Widget Docs](https://docs.widget.example/api/path-matcher) — docs.widget.example"));
  assert.ok(!withoutMore.includes("## Sources"));
});

// ---------------------------------------------------------------------------
// Tokens from convertMessage
// ---------------------------------------------------------------------------

/** The Copilot fixture's assistant reply, in a fresh jsdom page. */
function copilotReply(): Element {
  const document = new JSDOM(readFileSync("scratch/fixtures/copilot-message.html", "utf8")).window.document;
  return document.querySelectorAll(copilotAdapter.messageSelector)[0];
}

/** The block-ID tokens used in `markdown`'s markers. */
function tokensIn(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(/\[\[#\^c-([a-z0-9]+)-\d+\|/g)].map((m) => m[1]))];
}

check("convert: each linked-citations copy gets its own 4-character token; a fixed one is used as given", () => {
  const options = { style: "linked-citations" as const, includeMoreSources: true, isRuleEnabled: () => true, references: null };
  const first = tokensIn(convertMessage(copilotAdapter, copilotReply(), options));
  const second = tokensIn(convertMessage(copilotAdapter, copilotReply(), options));
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.match(first[0], /^[a-z0-9]{4}$/);
  assert.notEqual(first[0], second[0], "two copies get different tokens (a clash here has odds of about 1 in 1.7 million)");
  const fixed = convertMessage(copilotAdapter, copilotReply(), { ...options, idToken: "k3f9" });
  assert.deepEqual(tokensIn(fixed), ["k3f9"]);
  assert.ok(fixed.includes("### Citations\n\n1. [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0) — widget.example ^c-k3f9-1"));
  assert.match(randomIdToken(), /^[a-z0-9]{4}$/);
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
