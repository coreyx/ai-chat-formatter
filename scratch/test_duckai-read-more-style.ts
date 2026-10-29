/**
 * Regression checks for spec/duckai-read-more-style: the Duck.ai option that
 * cites sources as Duck.ai shows them (chips kept as links in place, and a
 * Read More section of the reply's cards), against the synthetic Duck.ai
 * fixture. Run with `pnpm test`, which runs every scratch/test_*.ts script.
 * Each check prints PASS or FAIL, and the process exits non-zero if any
 * failed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { convertMessage, type ConversionOptions } from "../src/core/convert";
import { CITATION_STYLES, type CitationStyle } from "../src/core/types";
import { installDuckAiPageScript } from "../src/page/duckai";
import { duckAiAdapter, READ_MORE_STYLE_OPTION, readDuckAiReferences } from "../src/sites/duckai";

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

/** The sources behind the fixture's popup chip, as in test_duck-ai-adapter.ts: two pages, and one entry that isn't a page. */
const POPUP_SOURCES = [
  { id: 3, url: "https://blog.widget.example/widget-5", title: "Widget 5 announcement", domain: "blog.widget.example", rootDomain: "widget.example", siteName: null },
  { id: 4, url: "https://status.widget.example/", title: "Widget status", domain: "status.widget.example", rootDomain: "widget.example", siteName: null },
  { id: 5, url: "javascript:void(0)", title: "Not a page", domain: "", rootDomain: "", siteName: null },
];

/** A chain of fake React fibers with `sources` three levels up, as React keeps it on Duck.ai. */
function fakeFiber(sources: unknown): object {
  let fiber: object = { memoizedProps: { sources }, return: null };
  for (let i = 0; i < 3; i++) fiber = { memoizedProps: { className: "x" }, return: fiber };
  return fiber;
}

/** A fresh fixture page with Duck.ai's page script installed and the popup chip's sources in a fake fiber; `popupSources` null leaves the chip unreadable. */
function duckAiPage(popupSources: unknown = POPUP_SOURCES): Document {
  const page = new JSDOM(readFileSync("scratch/fixtures/duckai-message.html", "utf8")).window.document;
  const chip = page.querySelector("[data-dark-theme] button[aria-haspopup]") as unknown as Record<string, object>;
  if (popupSources !== null) chip["__reactFiber$test"] = fakeFiber(popupSources);
  installDuckAiPageScript(page);
  return page;
}

/** The fixture's replies: the first with link and popup chips and four Read More cards, the second with two cards and no chips. */
function replies(page = duckAiPage()): Element[] {
  return Array.from(page.querySelectorAll(duckAiAdapter.messageSelector));
}

/** Converts `message` as the extension does, with Duck.ai's style on unless `style` says otherwise. */
function convert(message: Element, { duckAiStyle = true, style = "linked-citations" as CitationStyle, ...overrides }: Partial<ConversionOptions> & { duckAiStyle?: boolean } = {}): string {
  return convertMessage(duckAiAdapter, message, {
    style,
    includeMoreSources: true,
    isRuleEnabled: () => true,
    isOptionEnabled: (id) => id === READ_MORE_STYLE_OPTION && duckAiStyle,
    references: readDuckAiReferences(message),
    idToken: "k3f9",
    ...overrides,
  });
}

const FIRST_BODY =
  "**Widget 5** was released in May as the new current release. [Widget](https://widget.example/releases/5.0.0) The team announced it on its blog. [blog.widget.example](https://blog.widget.example/widget-5) [status.widget.example](https://status.widget.example/)\n\n" +
  "- **PathMatcher is global:** no import needed. [docs.widget.example](https://docs.widget.example/api/path-matcher) [Widget](https://widget.example/releases/5.0.0#features)\n" +
  "- The upgrade guide is in [the Widget docs](https://widget.example/docs/upgrade).\n\n" +
  "Check your version:\n\n" +
  '```bash\nif widget --version; then\n  echo "installed"\nfi\n```';

// ---------------------------------------------------------------------------
// Chips kept as links
// ---------------------------------------------------------------------------

check("chips: each link chip stays in place as a link with its label, and a popup chip becomes one linked domain per source", () => {
  const markdown = convert(replies()[0]);
  assert.ok(markdown.startsWith(FIRST_BODY), markdown);
  assert.ok(!/\[\[#\^|⁽|\[\^\d|## Sources|### More/.test(markdown), "no citation markers or Sources section");
});

check("chips: a popup chip whose sources can't be read falls back to the Read More card for its domain, as before", () => {
  const markdown = convert(replies(duckAiPage(null))[0]);
  assert.ok(markdown.includes("The team announced it on its blog. [blog.widget.example](https://blog.widget.example/widget-5)\n"), markdown);
  assert.ok(!markdown.includes("status.widget.example"));
});

check("chips: a popup chip with neither readable sources nor a matching card is left out", () => {
  const page = duckAiPage(null);
  page.querySelector('a[href="https://blog.widget.example/widget-5"][data-handled-by-react]')!.closest("li")!.remove();
  assert.ok(convert(replies(page)[0]).includes("The team announced it on its blog.\n"));
});

check("chips: with the option off, the copy is as before, in every citation style", () => {
  for (const style of CITATION_STYLES) {
    const message = replies()[0];
    const before = convertMessage(duckAiAdapter, message, { style, includeMoreSources: true, isRuleEnabled: () => true, references: readDuckAiReferences(message), idToken: "k3f9" });
    assert.equal(convert(replies()[0], { duckAiStyle: false, style }), before);
  }
  assert.match(convert(replies()[0], { duckAiStyle: false }), /\[\[#\^c-k3f9-1\|⁽¹⁾\]\][\s\S]*## Sources/);
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
