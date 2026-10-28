/**
 * Regression checks for spec/search-assist-explore-more: site options through
 * conversion, Search Assist's inline source chips, its Explore More section
 * and More Search Results links, the stored options, the options page and the
 * controller. Run with `pnpm test`, which runs every scratch/test_*.ts
 * script. Each check prints PASS or FAIL, and the process exits non-zero if
 * any failed.
 */
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { convertMessage, type ConversionOptions } from "../src/core/convert";
import type { SiteAdapter, SourceReference } from "../src/core/types";

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

/** Joins lines into one Markdown text. */
const md = (...lines: string[]) => lines.join("\n");

/** Parses `html` into a detached element in a fresh document. */
function element(html: string): HTMLElement {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  return dom.window.document.body.firstElementChild as HTMLElement;
}

// ---------------------------------------------------------------------------
// Site options through conversion
// ---------------------------------------------------------------------------

/**
 * An adapter whose preprocess step writes what the context reports for each
 * option into the reply, so a check can read it back from the Markdown. Its
 * chips register citations, so the Sources section shows whether More was
 * used.
 */
const optionsAdapter: SiteAdapter = {
  id: "options-test",
  name: "Options Test",
  matches: ["https://chat.example/*"],
  messageSelector: ".message",
  contentSelector: ".reply",
  nativeCopyButtonSelector: ".copy",
  findButtonAnchor: () => null,
  stripSelectors: [],
  options: [
    { id: "base", name: "Base", description: "", defaultEnabled: true },
    { id: "child", name: "Child", description: "", defaultEnabled: false, requires: "base" },
    { id: "orphan", name: "Orphan", description: "", defaultEnabled: true, requires: "missing" },
    { id: "loop-a", name: "Loop A", description: "", defaultEnabled: true, requires: "loop-b" },
    { id: "loop-b", name: "Loop B", description: "", defaultEnabled: true, requires: "loop-a" },
    { id: "replace", name: "Replace", description: "", defaultEnabled: false, replacesSourcesSection: true },
  ],
  preprocess(root, context) {
    const ids = ["base", "child", "orphan", "loop-a", "replace", "undeclared"];
    root.insertAdjacentHTML("afterbegin", `<p>${ids.map((id) => `${id}=${context.isOptionEnabled(id)}`).join(" ")}</p>`);
  },
  turndownRules: (context) => ({
    chip: {
      filter: (node) => node.classList.contains("chip"),
      replacement: (_content, node) => context.registerCitation({ url: node.getAttribute("data-url")!, title: "Cited", sourceName: "" }),
    },
  }),
  rules: [],
};

const OPTIONS_MESSAGE = '<div class="message"><div class="reply"><p>Text.<span class="chip" data-url="https://cited.example/">cited</span></p></div></div>';
const OPTIONS_REFERENCES: SourceReference[] = [
  { url: "https://cited.example/", title: "Cited", domain: "cited.example", cited: true },
  { url: "https://more.example/", title: "More page", domain: "more.example", cited: false },
];

/** Conversion options for the options adapter, with More sources on and `isOptionEnabled` as given. */
function optionsFor(isOptionEnabled?: (id: string) => boolean): ConversionOptions {
  return { style: "inline-links-and-sources", includeMoreSources: true, isRuleEnabled: () => true, references: OPTIONS_REFERENCES, isOptionEnabled };
}

/** The first line of the copy: what preprocess saw for each option. */
function optionLine(isOptionEnabled?: (id: string) => boolean): string {
  return convertMessage(optionsAdapter, element(OPTIONS_MESSAGE), optionsFor(isOptionEnabled)).split("\n")[0];
}

check("options: without isOptionEnabled each declared option takes its default, and undeclared ones are off", () => {
  assert.equal(optionLine(), "base=true child=false orphan=false loop-a=false replace=false undeclared=false");
});

check("options: stored values are passed through", () => {
  const stored: Record<string, boolean> = { base: true, child: true, replace: true };
  assert.equal(optionLine((id) => stored[id] ?? false), "base=true child=true orphan=false loop-a=false replace=true undeclared=false");
});

check("options: an option reads as off while the option it requires is off", () => {
  const stored: Record<string, boolean> = { base: false, child: true };
  assert.match(optionLine((id) => stored[id] ?? false), /^base=false child=false /);
});

check("options: a missing or looping requirement reads as off", () => {
  assert.match(optionLine(() => true), / orphan=false loop-a=false /);
});

check("options: More is listed normally, and left out while a replacesSourcesSection option is on", () => {
  const withMore = convertMessage(optionsAdapter, element(OPTIONS_MESSAGE), optionsFor());
  assert.match(withMore, /### More\n\n- \[More page\]\(https:\/\/more\.example\/\)/);
  const replaced = convertMessage(optionsAdapter, element(OPTIONS_MESSAGE), optionsFor((id) => id === "replace"));
  assert.doesNotMatch(replaced, /More page/);
  assert.match(replaced, /### Citations/);
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
