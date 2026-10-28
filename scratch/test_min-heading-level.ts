/**
 * Regression checks for spec/min-heading-level: shifting headings down to the
 * minimum heading level, what counts as a heading, the shift through
 * convertMessage with the Sources section, the stored setting, the options
 * page and the controller. Run with `pnpm test`, which runs every
 * scratch/test_*.ts script. Each check prints PASS or FAIL, and the process
 * exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { ContentController } from "../src/content/controller";
import { convertMessage } from "../src/core/convert";
import { enforceMinHeadingLevel } from "../src/core/headings";
import { collapseBlankLinesRule, invisibleCharactersRule } from "../src/core/rules";
import { buildDefaultSettings, mergeSettings, type Settings } from "../src/core/settings";
import type { CitationStyle, HeadingLevel, SiteAdapter, SourceReference } from "../src/core/types";
import { renderOptions } from "../src/options/options";
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

/** Runs an async check, recording its result like {@link check}. */
async function checkAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name });
  } catch (error) {
    results.push({ name, error });
  }
}

/** Joins lines into one Markdown text. */
const md = (...lines: string[]) => lines.join("\n");

// ---------------------------------------------------------------------------
// The shift
// ---------------------------------------------------------------------------

check("shift: minimum H2 with H1 to H3 present moves each down by one", () => {
  assert.equal(
    enforceMinHeadingLevel(md("# Top", "", "Text.", "", "## Middle", "", "### Bottom"), 2),
    md("## Top", "", "Text.", "", "### Middle", "", "#### Bottom"),
  );
});

check("shift: the example from the request — one H1, the rest at H2 or deeper", () => {
  assert.equal(
    enforceMinHeadingLevel(md("# Title", "## Part", "### Detail", "## Part two"), 2),
    md("## Title", "### Part", "#### Detail", "### Part two"),
  );
});

check("shift: nothing moves when every heading is already at the minimum or deeper", () => {
  const text = md("## Part", "", "### Detail");
  assert.equal(enforceMinHeadingLevel(text, 2), text);
});

check("shift: minimum H1 never changes anything, and text without headings comes back identical", () => {
  const text = md("# Top", "", "## Part");
  assert.equal(enforceMinHeadingLevel(text, 1), text);
  const plain = md("Just text.", "", "- a list", "- of items");
  assert.equal(enforceMinHeadingLevel(plain, 4), plain);
});

check("shift: the gap is measured from the shallowest heading, wherever it is", () => {
  assert.equal(enforceMinHeadingLevel(md("### Deep", "", "## Shallow"), 4), md("##### Deep", "", "#### Shallow"));
});

check("past H6: headings that would go deeper stay at H6", () => {
  assert.equal(enforceMinHeadingLevel(md("# One", "##### Five"), 4), md("#### One", "###### Five"));
  assert.equal(enforceMinHeadingLevel(md("# One", "## Two", "### Three"), 6), md("###### One", "###### Two", "###### Three"));
});

// ---------------------------------------------------------------------------
// What isn't a heading
// ---------------------------------------------------------------------------

check("not headings: fenced code, escaped #, #hashtag and seven #s are left alone", () => {
  const text = md("# Real", "", "```bash", "# comment", "## also code", "```", "", "~~~", "# tilde fence", "~~~", "", "\\# not a heading", "", "#hashtag", "", "####### seven");
  assert.equal(
    enforceMinHeadingLevel(text, 2),
    md("## Real", "", "```bash", "# comment", "## also code", "```", "", "~~~", "# tilde fence", "~~~", "", "\\# not a heading", "", "#hashtag", "", "####### seven"),
  );
});

check("not headings: a heading only in fenced code doesn't set the shift", () => {
  const text = md("## Real", "", "```", "# comment", "```");
  assert.equal(enforceMinHeadingLevel(text, 2), text);
});

check("headings: inside a blockquote, opening a list item, indented, and empty are shifted", () => {
  assert.equal(
    enforceMinHeadingLevel(md("> # Quoted", "> > ## Nested quote", "- # In a list", "1. ## Numbered", "   ### Indented", "#", "## Tabbed\theading"), 2),
    md("> ## Quoted", "> > ### Nested quote", "- ## In a list", "1. ### Numbered", "   #### Indented", "##", "### Tabbed\theading"),
  );
});

check("headings: closing #s and the heading text are kept as they are", () => {
  assert.equal(enforceMinHeadingLevel("# Title with # inside #", 3), "### Title with # inside #");
});

// ---------------------------------------------------------------------------
// Through convertMessage, with the Sources section
// ---------------------------------------------------------------------------

/** A bare adapter: `.reply` is the body and `.chip[data-url]` is a citation. */
const testAdapter: SiteAdapter = {
  id: "test",
  name: "Test",
  matches: ["https://chat.example/*"],
  messageSelector: ".message",
  contentSelector: ".reply",
  nativeCopyButtonSelector: ".copy",
  findButtonAnchor: () => null,
  stripSelectors: [],
  turndownRules: (context) => ({
    chip: {
      filter: (node) => node.classList.contains("chip"),
      replacement: (_content, node) =>
        context.registerCitation({ url: node.getAttribute("data-url")!, title: node.getAttribute("data-title")!, sourceName: "" }),
    },
  }),
  rules: [invisibleCharactersRule, collapseBlankLinesRule],
};

/** A reply with an H1, an H2 and one citation. */
function replyWithH1(): Element {
  const { document } = new JSDOM(
    `<!doctype html><body><div class="message"><div class="reply">` +
      `<h1>Widgets</h1><p>Widgets fit gadgets.<span class="chip" data-url="https://widget.example/guide" data-title="Widget guide">widget.example</span></p>` +
      `<h2>Sizes</h2><p>Two sizes.</p></div></div>`,
  ).window;
  return document.querySelector(".message")!;
}

/** Converts {@link replyWithH1} in `style`, with an uncited source when `more` is set. */
function convertReply(style: CitationStyle, minHeadingLevel?: HeadingLevel, more = false): string {
  const references: SourceReference[] = [
    { url: "https://widget.example/guide", title: "Widget guide", domain: "widget.example", cited: true },
    { url: "https://parts.example/list", title: "Parts list", domain: "parts.example", cited: false },
  ];
  return convertMessage(testAdapter, replyWithH1(), {
    style,
    includeMoreSources: more,
    isRuleEnabled: () => true,
    references,
    idToken: "k3f9",
    ...(minHeadingLevel === undefined ? {} : { minHeadingLevel }),
  });
}

check("convert: minimum H2 shifts the reply and the Sources headings together; markers and block IDs are unchanged", () => {
  assert.equal(
    convertReply("linked-citations", 2),
    md(
      "## Widgets",
      "",
      "Widgets fit gadgets.[[#^c-k3f9-1|⁽¹⁾]]",
      "",
      "### Sizes",
      "",
      "Two sizes.",
      "",
      "### Sources",
      "",
      "#### Citations",
      "",
      "1. [Widget guide](https://widget.example/guide) — widget.example ^c-k3f9-1",
    ),
  );
});

check("convert: footnotes with no More list have no Sources headings, so only the reply's move", () => {
  assert.equal(
    convertReply("footnotes", 2),
    md("## Widgets", "", "Widgets fit gadgets.[^1]", "", "### Sizes", "", "Two sizes.", "", "[^1]: [Widget guide](https://widget.example/guide) — widget.example"),
  );
});

check("convert: footnotes with a More list shift Sources and More too", () => {
  assert.match(convertReply("footnotes", 3, true), /^### Widgets\n[\s\S]*\n#### Sizes\n[\s\S]*\n#### Sources\n\n##### More\n\n- \[Parts list\]/);
});

check("convert: leaving minHeadingLevel out, or setting H1, gives the same output as before", () => {
  const before = convertReply("linked-citations");
  assert.match(before, /^# Widgets\n[\s\S]*\n## Sizes\n[\s\S]*\n## Sources\n\n### Citations\n/);
  assert.equal(convertReply("linked-citations", 1), before);
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

check("settings: the default is H1, for every site at once", () => {
  assert.equal(buildDefaultSettings(SITE_ADAPTERS).minHeadingLevel, 1);
});

check("settings: a stored level is kept; anything else falls back to H1", () => {
  const defaults = buildDefaultSettings(SITE_ADAPTERS);
  assert.equal(mergeSettings({ minHeadingLevel: 3 }, defaults).minHeadingLevel, 3);
  assert.equal(mergeSettings({ minHeadingLevel: 6 }, defaults).minHeadingLevel, 6);
  for (const bad of [0, 7, 2.5, "2", null, undefined]) {
    assert.equal(mergeSettings({ minHeadingLevel: bad }, defaults).minHeadingLevel, 1, `stored ${String(bad)}`);
  }
  // Settings saved before this setting existed have no minHeadingLevel at all.
  assert.equal(mergeSettings({ enabled: true, citationStyle: "footnotes", sites: {} }, defaults).minHeadingLevel, 1);
});

// ---------------------------------------------------------------------------
// Options page
// ---------------------------------------------------------------------------

/** The options form, rendered and filled with `settings`, recording every change it reports. */
function optionsPage(settings: Settings) {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const changes: Settings[] = [];
  const form = renderOptions(window.document, SITE_ADAPTERS, (next) => changes.push(next));
  window.document.body.append(form.root);
  form.fill(settings);
  const select = window.document.querySelector<HTMLSelectElement>('select[name="minHeadingLevel"]')!;
  return { window, form, select, changes };
}

check("options page: a drop-down from H1 (no change) to H6, after Citation style, showing the stored level", () => {
  const settings = buildDefaultSettings(SITE_ADAPTERS);
  settings.minHeadingLevel = 4;
  const page = optionsPage(settings);
  assert.deepEqual(
    Array.from(page.select.options).map((option) => [option.value, option.textContent]),
    [["1", "H1 (no change)"], ["2", "H2"], ["3", "H3"], ["4", "H4"], ["5", "H5"], ["6", "H6"]],
  );
  assert.equal(page.select.value, "4");
  const titles = Array.from(page.window.document.querySelectorAll("h2")).map((heading) => heading.textContent);
  assert.equal(titles.indexOf("Minimum heading level"), titles.indexOf("Citation style") + 1);
  assert.equal(page.window.document.getElementById(page.select.getAttribute("aria-labelledby")!)!.textContent, "Minimum heading level");
  assert.match(page.window.document.getElementById(page.select.getAttribute("aria-describedby")!)!.textContent!, /Headings past H6 stay at H6/);
});

check("options page: choosing H3 reports minHeadingLevel 3 as a number, leaving the rest as it was", () => {
  const settings = buildDefaultSettings(SITE_ADAPTERS);
  const page = optionsPage(settings);
  page.select.value = "3";
  page.select.dispatchEvent(new page.window.Event("change"));
  assert.equal(page.changes.length, 1);
  assert.equal(page.changes[0].minHeadingLevel, 3);
  assert.deepEqual({ ...page.changes[0], minHeadingLevel: 1 }, settings);
});

check("options page: the drop-down is disabled while the master switch is off", () => {
  const settings = buildDefaultSettings(SITE_ADAPTERS);
  // A prompt heading greys it out too (see test_copy-user-prompt.ts), so the prompt is off here.
  settings.includePrompt = false;
  const page = optionsPage(settings);
  assert.equal(page.select.matches(":disabled"), false);
  page.form.fill({ ...settings, enabled: false });
  assert.equal(page.select.matches(":disabled"), true);
});

// ---------------------------------------------------------------------------
// Controller, on the Search Assist fixture
// ---------------------------------------------------------------------------

/**
 * A controller on the Search Assist fixture with the minimum heading level
 * set to H3, recording clipboard writes. Its after-More answer has H2 and H3
 * headings, and its expanded Explore More answer adds an H3 and an H4, so
 * everything shifts by one. (With the default settings, Search Assist's chips
 * stay inline, so there's no Sources section.)
 */
function startController(overrideNativeCopy: boolean) {
  const document = new JSDOM(readFileSync("scratch/fixtures/duckduckgo-search-assist.html", "utf8")).window.document;
  const settings = buildDefaultSettings(SITE_ADAPTERS);
  settings.minHeadingLevel = 3;
  settings.sites.duckduckgo.overrideNativeCopy = overrideNativeCopy;
  const written: string[] = [];
  const controller = new ContentController(duckDuckGoAdapter, settings, { document, writeClipboard: async (text) => void written.push(text), requestFrame: (callback) => callback() });
  controller.start();
  return { afterMore: document.getElementById("after-more")!, written };
}

/** Lets pending timers and promise callbacks run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The headings of a copy, in order. */
const headingsOf = (markdown: string) => markdown.split("\n").filter((line) => /^#{1,6} /.test(line));

/** What the after-More answer's headings become with H3 as the minimum. */
const SHIFTED_HEADINGS = ["### How widgets work", "#### Sizes", "#### Explore More", "##### What size widget fits a pocket gadget?"];

await checkAsync("controller: Copy as Markdown copies with the headings shifted to the minimum", async () => {
  const page = startController(false);
  page.afterMore.querySelector<HTMLButtonElement>(".acf-copy-button")!.click();
  await flush();
  assert.equal(page.written.length, 1);
  assert.deepEqual(headingsOf(page.written[0]), SHIFTED_HEADINGS);
});

await checkAsync("controller: with the override on, the site's own Copy shifts the headings too", async () => {
  const page = startController(true);
  page.afterMore.querySelector<HTMLButtonElement>(duckDuckGoAdapter.nativeCopyButtonSelector!)!.click();
  await flush();
  assert.equal(page.written.length, 1);
  assert.deepEqual(headingsOf(page.written[0]), SHIFTED_HEADINGS);
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
