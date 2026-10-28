/**
 * Regression checks for spec/search-assist-explore-more: site options through
 * conversion, Search Assist's inline source chips, its Explore More section
 * and More Search Results links, the stored options, the options page and the
 * controller. Run with `pnpm test`, which runs every scratch/test_*.ts
 * script. Each check prints PASS or FAIL, and the process exits non-zero if
 * any failed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { convertMessage, type ConversionOptions } from "../src/core/convert";
import { buildDefaultSettings, mergeSettings } from "../src/core/settings";
import type { SiteAdapter, SourceReference } from "../src/core/types";
import { duckDuckGoAdapter } from "../src/sites/duckduckgo";
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
// Search Assist: inline chips, Explore More and More Search Results links
// ---------------------------------------------------------------------------

/** A fresh copy of the fixture page at a DuckDuckGo search address, so relative links resolve as on the real page. */
function searchPage(): Document {
  return new JSDOM(readFileSync("scratch/fixtures/duckduckgo-search-assist.html", "utf8"), { url: "https://duckduckgo.com/?q=widgets&ia=web" }).window.document;
}

/** Search Assist's source list for the fixture: both chips cited and titled, and one page it consulted but doesn't show. */
const REFERENCES: SourceReference[] = [
  { url: "https://widget.example/guide", title: "The Widget Guide", domain: "widget.example", cited: true },
  { url: "https://gadget.example/parts", title: "Gadget parts list", domain: "gadget.example", cited: true },
  { url: "https://parts.example/widgets", title: "", domain: "parts.example", cited: false },
];

/**
 * Converts `message` with More sources on and the Search Assist options in
 * `set` overriding their defaults; without `set`, the caller passes no
 * `isOptionEnabled`, as with settings that predate the options.
 */
function convert(message: Element, set?: Record<string, boolean>): string {
  const defaults = Object.fromEntries((duckDuckGoAdapter.options ?? []).map((option) => [option.id, option.defaultEnabled]));
  return convertMessage(duckDuckGoAdapter, message, {
    style: "linked-citations",
    includeMoreSources: true,
    isRuleEnabled: () => true,
    references: REFERENCES,
    idToken: "tttt",
    isOptionEnabled: set ? (id) => ({ ...defaults, ...set })[id] ?? false : undefined,
  });
}

const WIDGET_CHIP = "[![|16](https://external-content.example/ip3/widget.example.ico) widget.example](https://widget.example/guide)";
const GADGET_CHIP = "[![|16](https://external-content.example/ip3/gadget.example.ico) gadget.example](https://gadget.example/parts#widgets)";

/** The collapsed module's copy with inline chips. */
const COLLAPSED_INLINE = md("**Widgets** are small parts that fit into gadgets.", "", `Most gadgets need two of them. ${WIDGET_CHIP} ${GADGET_CHIP}`);

/** The expanded Explore More answer, as the after-More copy ends with the default settings. */
const EXPLORE_MORE = md(
  "### Explore More",
  "",
  "#### What size widget fits a pocket gadget?",
  "",
  "The small widget fits most pocket gadgets. [![|16](https://external-content.example/ip3/widget.example.ico) widget.example](https://widget.example/sizes) [Pocket Guide](https://pocket.example/fit)",
);

const SEARCH_LINK = "[More Search Results](https://duckduckgo.com/?q=What+size+widget+fits+a+pocket+gadget%3F)";

check("inline chips (default): both chips stay inline after the last sentence, as favicon and name, linked", () => {
  assert.equal(convert(searchPage().getElementById("collapsed")!), COLLAPSED_INLINE);
});

check("inline chips (default): no citation markers or Sources section, even with More sources on", () => {
  const markdown = convert(searchPage().getElementById("after-more")!);
  assert.doesNotMatch(markdown, /⁽|\^c-|## Sources|### More|parts\.example/);
  assert.match(markdown, new RegExp(`The guide has more detail\\. ${WIDGET_CHIP.replace(/[[\]().|?]/g, "\\$&")}`));
});

check("inline chips off: the copy is today's numbered citations, with More listed", () => {
  assert.equal(
    convert(searchPage().getElementById("collapsed")!, { "inline-chips": false }),
    md(
      "**Widgets** are small parts that fit into gadgets.",
      "",
      "Most gadgets need two of them.[[#^c-tttt-1|⁽¹⁾]][[#^c-tttt-2|⁽²⁾]]",
      "",
      "## Sources",
      "",
      "### Citations",
      "",
      "1. [The Widget Guide](https://widget.example/guide) — widget.example ^c-tttt-1",
      "2. [Gadget parts list](https://gadget.example/parts#widgets) — gadget.example ^c-tttt-2",
      "",
      "### More",
      "",
      "- [parts.example](https://parts.example/widgets)",
    ),
  );
});

check("Explore More (default): after the extended answer, the expanded question as an H4 with its answer and inline chips", () => {
  const markdown = convert(searchPage().getElementById("after-more")!);
  assert.ok(markdown.endsWith(`The guide has more detail. ${WIDGET_CHIP}\n\n${EXPLORE_MORE}`), markdown);
});

check("Explore More (default): no collapsed questions, no More Search Results link, no ask box", () => {
  const markdown = convert(searchPage().getElementById("after-more")!);
  assert.doesNotMatch(markdown, /How long does a widget last|Can widgets be recycled|More Search Results|duckduckgo\.com|Ask Duck\.ai/);
});

check("Explore More (default): a chip without a favicon is its linked name", () => {
  assert.match(convert(searchPage().getElementById("after-more")!), / \[Pocket Guide\]\(https:\/\/pocket\.example\/fit\)$/);
});

check("Explore More with inline chips off: the main answer is numbered, Explore More's chips stay inline and unnumbered", () => {
  const markdown = convert(searchPage().getElementById("after-more")!, { "inline-chips": false });
  assert.match(markdown, /Most gadgets need two of them\.\[\[#\^c-tttt-1\|⁽¹⁾\]\]\[\[#\^c-tttt-2\|⁽²⁾\]\]/);
  assert.ok(markdown.includes(`${EXPLORE_MORE}\n\n## Sources\n\n### Citations\n\n1. `), markdown);
  assert.doesNotMatch(markdown, /^3\. /m);
  assert.doesNotMatch(markdown, /widget\.example\/sizes\) — /);
});

check("Explore More off: no Explore More section", () => {
  assert.doesNotMatch(convert(searchPage().getElementById("after-more")!, { "explore-more": false }), /Explore More|What size widget/);
});

check("Explore More with nothing expanded: no Explore More section", () => {
  const page = searchPage();
  const question = page.querySelector('[aria-controls=":re1:"]')!;
  question.setAttribute("aria-expanded", "false");
  assert.doesNotMatch(convert(page.getElementById("after-more")!), /Explore More/);
});

check("Explore More: found by structure, so a heading in another language is copied as it reads", () => {
  const page = searchPage();
  page.querySelector("#after-more h3.Rb5kYe2nUf9LsWq0TgJi")!.textContent = "Explorar más";
  assert.match(convert(page.getElementById("after-more")!), /\n### Explorar más\n\n#### What size widget fits a pocket gadget\?\n/);
});

check("Explore More: a link that doesn't lead to a web page keeps only its text, a relative one is made absolute", () => {
  const page = searchPage();
  page.querySelector("#\\:re1\\: p")!.insertAdjacentHTML("beforeend", ' See <a href="javascript:void 0">this</a> and <a href="/about">that</a>.');
  assert.match(convert(page.getElementById("after-more")!), /gadgets\. See this and \[that\]\(https:\/\/duckduckgo\.com\/about\)\. \[!\[/);
});

check("More Search Results on: each expanded answer ends with its link, absolute, in a paragraph after the chips", () => {
  const markdown = convert(searchPage().getElementById("after-more")!, { "explore-more-search-links": true });
  assert.ok(markdown.endsWith(`${EXPLORE_MORE}\n\n${SEARCH_LINK}`), markdown);
  assert.equal(markdown.split("More Search Results").length - 1, 1);
});

check("More Search Results off (default): no link", () => {
  assert.doesNotMatch(convert(searchPage().getElementById("after-more")!, { "explore-more-search-links": false }), /More Search Results/);
});

check("More Search Results on with Explore More off: no section and no link", () => {
  assert.doesNotMatch(convert(searchPage().getElementById("after-more")!, { "explore-more": false, "explore-more-search-links": true }), /Explore More|More Search Results/);
});

/** A Search Assist module whose short answer is `answer`, for markup the fixture doesn't have. */
function moduleWith(answer: string): Element {
  return element(`<div data-react-module-id="wikinlp"><div><div data-testid="duckassist-answer-content"><div data-dark-theme="">${answer}</div></div></div></div>`);
}

/** A chip with the given link, favicon and name, in Search Assist's markup. */
const chip = (href: string, favicon: string, name: string) => `<span tabindex="0"><a href="${href}"><img src="${favicon}" width="16"><span>${name}</span></a></span>`;

check("escaping: a chip name with ] and URLs with spaces or parentheses still give valid links", () => {
  const message = moduleWith(`<div><p>Text.</p></div><span>${chip("https://x.example/a b(c)", "https://icons.example/a b.ico", "Odd ]name[")}</span>`);
  assert.equal(convert(message), "Text. [![|16](https://icons.example/a%20b.ico) Odd \\]name\\[](https://x.example/a%20b%28c%29)");
});

check("escaping: inside a table cell the size's | is escaped, so the cell doesn't end", () => {
  const message = moduleWith(`<table><thead><tr><th>Part</th></tr></thead><tbody><tr><td>Widget ${chip("https://widget.example/", "https://icons.example/w.ico", "widget.example")}</td></tr></tbody></table>`);
  assert.match(convert(message), /\| Widget \[!\[\\\|16\]\(https:\/\/icons\.example\/w\.ico\) widget\.example\]\(https:\/\/widget\.example\/\) \|/);
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

check("settings: Explore More and inline chips start on, More Search Results links off; Copilot and Duck.ai have no options", () => {
  const defaults = buildDefaultSettings(SITE_ADAPTERS);
  assert.deepEqual(defaults.sites.duckduckgo.options, { "explore-more": true, "explore-more-search-links": false, "inline-chips": true });
  assert.deepEqual(defaults.sites.copilot.options, {});
  assert.deepEqual(defaults.sites.duckai.options, {});
});

check("settings: stored values are kept, unknown or invalid ones dropped, and 0.5.0 settings get the defaults", () => {
  const defaults = buildDefaultSettings(SITE_ADAPTERS);
  const merged = mergeSettings({ sites: { duckduckgo: { options: { "inline-chips": false, "explore-more": "yes", removed: true } } } }, defaults);
  assert.deepEqual(merged.sites.duckduckgo.options, { "explore-more": true, "explore-more-search-links": false, "inline-chips": false });
  const older = mergeSettings({ sites: { duckduckgo: { enabled: true, rules: {} } } }, defaults);
  assert.deepEqual(older.sites.duckduckgo.options, defaults.sites.duckduckgo.options);
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
