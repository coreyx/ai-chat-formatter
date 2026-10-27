/**
 * Regression checks for spec/copy-user-prompt: reading a prompt's text,
 * writing it in each prompt format, putting it above the response (with the
 * response nested below a prompt heading), each site's prompt reader, the
 * settings, the options page and the controller. Run with `pnpm test`, which
 * runs every scratch/test_*.ts script. Each check prints PASS or FAIL, and the
 * process exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { convertMessage, type ConversionOptions } from "../src/core/convert";
import { formatPrompt, promptText } from "../src/core/prompt";
import { collapseBlankLinesRule, invisibleCharactersRule } from "../src/core/rules";
import { buildDefaultSettings, mergeSettings } from "../src/core/settings";
import type { SiteAdapter } from "../src/core/types";
import { copilotAdapter } from "../src/sites/copilot";
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

/** The first element of `html`, parsed in a fresh document. */
function element(html: string): Element {
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document.body.firstElementChild!;
}

// ---------------------------------------------------------------------------
// Reading a prompt's text
// ---------------------------------------------------------------------------

check("promptText: newlines in pre-wrapped text are line breaks, and a run of blank lines becomes one", () => {
  // Copilot renders a typed blank line as a newline, a <br> and a newline.
  assert.equal(promptText(element(`<div>Line one.\n<br>\nLine three.\n</div>`)), "Line one.\n\nLine three.");
  assert.equal(promptText(element(`<div>One\nTwo\n\n\n\nThree</div>`)), "One\nTwo\n\nThree");
});

check("promptText: <br> is a line break and block elements are paragraphs", () => {
  assert.equal(promptText(element(`<div><p>First<br>second</p><p>Third</p></div>`)), "First\nsecond\n\nThird");
});

check("promptText: buttons, icons and the skip selector are left out", () => {
  const prompt = element(
    `<div><h3>You said</h3><button aria-label="Copy">Copy</button><svg><text>icon</text></svg><p>The prompt.</p><img alt="photo"></div>`,
  );
  assert.equal(promptText(prompt, "h3"), "The prompt.");
  assert.equal(promptText(prompt), "You said\n\nThe prompt.");
});

check("promptText: trailing spaces are trimmed; an empty prompt gives null", () => {
  assert.equal(promptText(element(`<div>Spaces after   \nNext </div>`)), "Spaces after\nNext");
  assert.equal(promptText(element(`<div> \n <p> </p><br></div>`)), null);
  assert.equal(promptText(element(`<div><button>Edit</button></div>`)), null);
});

// ---------------------------------------------------------------------------
// Writing a prompt
// ---------------------------------------------------------------------------

const ONE_LINE = "What is new in Widget 5?";
const SEVERAL_LINES = "Compare these two configs\nUse the YAML below.\n\nKeep it short.";

check("formatPrompt: each format, for a one-line prompt", () => {
  assert.equal(formatPrompt(ONE_LINE, "heading", 2), "## What is new in Widget 5?");
  assert.equal(formatPrompt(ONE_LINE, "blockquote", 2), "> What is new in Widget 5?");
  assert.equal(formatPrompt(ONE_LINE, "bold", 2), "**What is new in Widget 5?**");
  assert.equal(formatPrompt(ONE_LINE, "plain", 2), "What is new in Widget 5?");
});

check("formatPrompt: each format, for a prompt with several lines", () => {
  assert.equal(formatPrompt(SEVERAL_LINES, "heading", 2), md("## Compare these two configs", "", "> Use the YAML below.", ">", "> Keep it short."));
  assert.equal(formatPrompt(SEVERAL_LINES, "blockquote", 2), md("> Compare these two configs", "> Use the YAML below.", ">", "> Keep it short."));
  assert.equal(formatPrompt(SEVERAL_LINES, "bold", 2), md("**Compare these two configs", "Use the YAML below.**", "", "**Keep it short.**"));
  assert.equal(formatPrompt(SEVERAL_LINES, "plain", 2), SEVERAL_LINES);
});

check("formatPrompt: a blank line straight after the heading line doesn't start the quote", () => {
  assert.equal(formatPrompt("Title line\n\nMore detail.", "heading", 3), md("### Title line", "", "> More detail."));
});

check("formatPrompt: the heading level setting, H1 to H6", () => {
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    assert.equal(formatPrompt(ONE_LINE, "heading", level), `${"#".repeat(level)} ${ONE_LINE}`);
  }
});

check("formatPrompt: lines that would become headings are escaped, in every format", () => {
  const text = "# Not a heading\n## Nor this";
  assert.equal(formatPrompt(text, "heading", 2), md("## \\# Not a heading", "", "> \\## Nor this"));
  assert.equal(formatPrompt(text, "blockquote", 2), md("> \\# Not a heading", "> \\## Nor this"));
  assert.equal(formatPrompt(text, "bold", 2), md("**\\# Not a heading", "\\## Nor this**"));
  assert.equal(formatPrompt(text, "plain", 2), md("\\# Not a heading", "\\## Nor this"));
  // Not headings, so left alone: no space after the #s, or seven of them.
  assert.equal(formatPrompt("#hashtag\n####### seven", "plain", 2), "#hashtag\n####### seven");
});

check("formatPrompt: a heading line ending in ' #' keeps its #", () => {
  assert.equal(formatPrompt("Which is better, C or C #", "heading", 2), "## Which is better, C or C \\#");
  assert.equal(formatPrompt("Learning C#", "heading", 2), "## Learning C#");
});

// ---------------------------------------------------------------------------
// Through convertMessage
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
function reply(): Element {
  return element(
    `<div class="message"><div class="reply">` +
      `<h1>Widgets</h1><p>Widgets fit gadgets.<span class="chip" data-url="https://widget.example/guide" data-title="Widget guide">widget.example</span></p>` +
      `<h2>Sizes</h2><p>Two sizes.</p></div></div>`,
  );
}

/** Converts {@link reply} in linked-citations style with `extra` options. */
function convertReply(extra: Partial<ConversionOptions> = {}): string {
  return convertMessage(testAdapter, reply(), { style: "linked-citations", includeMoreSources: false, isRuleEnabled: () => true, references: null, idToken: "k3f9", ...extra });
}

/** The headings of a copy, in order. */
const headingsOf = (markdown: string) => markdown.split("\n").filter((line) => /^#{1,6} /.test(line));

check("convert: a prompt heading at H2 comes first, and the response and Sources shift together to start at H3", () => {
  const copy = convertReply({ prompt: { text: ONE_LINE, format: "heading", headingLevel: 2 } });
  assert.equal(
    copy,
    md(
      "## What is new in Widget 5?",
      "",
      "### Widgets",
      "",
      "Widgets fit gadgets.[[#^c-k3f9-1|⁽¹⁾]]",
      "",
      "#### Sizes",
      "",
      "Two sizes.",
      "",
      "#### Sources",
      "",
      "##### Citations",
      "",
      "1. [Widget guide](https://widget.example/guide) — widget.example ^c-k3f9-1",
    ),
  );
});

check("convert: under a prompt heading at H2, a response with no headings puts Sources at H3", () => {
  const message = element(
    `<div class="message"><div class="reply"><p>Short.<span class="chip" data-url="https://widget.example/guide" data-title="Widget guide">widget.example</span></p></div></div>`,
  );
  const copy = convertMessage(testAdapter, message, {
    style: "linked-citations",
    includeMoreSources: false,
    isRuleEnabled: () => true,
    references: null,
    idToken: "k3f9",
    prompt: { text: ONE_LINE, format: "heading", headingLevel: 2 },
  });
  assert.deepEqual(headingsOf(copy), ["## What is new in Widget 5?", "### Sources", "#### Citations"]);
});

check("convert: under a prompt heading the minimum heading level isn't used, deeper or shallower", () => {
  const expected = ["## What is new in Widget 5?", "### Widgets", "#### Sizes", "#### Sources", "##### Citations"];
  for (const minHeadingLevel of [1, 2, 4, 6] as const) {
    assert.deepEqual(headingsOf(convertReply({ minHeadingLevel, prompt: { text: ONE_LINE, format: "heading", headingLevel: 2 } })), expected, `minimum H${minHeadingLevel}`);
  }
});

check("convert: a prompt heading at H1 puts the response at H2; at H6, everything is capped at H6", () => {
  assert.deepEqual(headingsOf(convertReply({ prompt: { text: ONE_LINE, format: "heading", headingLevel: 1 } })), [
    "# What is new in Widget 5?",
    "## Widgets",
    "### Sizes",
    "### Sources",
    "#### Citations",
  ]);
  assert.deepEqual(
    headingsOf(convertReply({ prompt: { text: ONE_LINE, format: "heading", headingLevel: 6 } })),
    Array(5).fill("######").map((hashes, i) => `${hashes} ${["What is new in Widget 5?", "Widgets", "Sizes", "Sources", "Citations"][i]}`),
  );
});

check("convert: a prompt of several lines as a heading, with the rest quoted before the response", () => {
  assert.match(convertReply({ prompt: { text: SEVERAL_LINES, format: "heading", headingLevel: 2 } }), /^## Compare these two configs\n\n> Use the YAML below\.\n>\n> Keep it short\.\n\n### Widgets\n/);
});

check("convert: blockquote, bold and plain prompts leave the response's headings to the minimum heading level", () => {
  const before = headingsOf(convertReply());
  for (const format of ["blockquote", "bold", "plain"] as const) {
    const copy = convertReply({ prompt: { text: ONE_LINE, format, headingLevel: 2 } });
    assert.ok(copy.startsWith(`${formatPrompt(ONE_LINE, format, 2)}\n\n# Widgets\n`), format);
    assert.deepEqual(headingsOf(copy), before, format);
  }
  // The typed "# " line is escaped, so the shift is measured from the response's H1 alone.
  assert.deepEqual(headingsOf(convertReply({ minHeadingLevel: 3, prompt: { text: "# Typed hash", format: "plain", headingLevel: 2 } })), [
    "### Widgets",
    "#### Sizes",
    "#### Sources",
    "##### Citations",
  ]);
});

check("convert: with no prompt, the copy is the response alone, as before", () => {
  assert.ok(convertReply().startsWith("# Widgets\n"));
});

// ---------------------------------------------------------------------------
// Site adapters
// ---------------------------------------------------------------------------

/** A fresh copy of a fixture page, optionally at `url`. */
function fixture(name: string, url?: string): Document {
  return new JSDOM(readFileSync(`scratch/fixtures/${name}`, "utf8"), url ? { url } : {}).window.document;
}

check("Copilot: the prompt before the reply, from its chatOutput text, without the 'You said:' label", () => {
  const page = fixture("copilot-message.html");
  const [message] = Array.from(page.querySelectorAll(copilotAdapter.messageSelector));
  assert.equal(copilotAdapter.readPrompt!(message), "Search the web: what is new in Widget 5?\n\nKeep it short.");
});

check("Copilot: without chatOutput, the prompt article's own text, still without the label or the button", () => {
  const page = fixture("copilot-message.html");
  const output = page.querySelector('[data-testid="chatOutput"]')!;
  output.removeAttribute("data-testid");
  const [message] = Array.from(page.querySelectorAll(copilotAdapter.messageSelector));
  assert.equal(copilotAdapter.readPrompt!(message), "Search the web: what is new in Widget 5?\n\nKeep it short.");
});

check("Copilot: null when the article before is another reply, or there's none", () => {
  const page = fixture("copilot-message.html");
  const [message] = Array.from(page.querySelectorAll(copilotAdapter.messageSelector));
  const prompt = message.previousElementSibling!;
  // A second reply straight after the first: the article before it is a reply.
  const second = message.cloneNode(true) as Element;
  message.after(second);
  assert.equal(copilotAdapter.readPrompt!(second), null);
  prompt.remove();
  assert.equal(copilotAdapter.readPrompt!(message), null);
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

check("settings: the prompt is on by default, as a heading at H2", () => {
  const defaults = buildDefaultSettings(SITE_ADAPTERS);
  assert.equal(defaults.includePrompt, true);
  assert.equal(defaults.promptFormat, "heading");
  assert.equal(defaults.promptHeadingLevel, 2);
});

check("settings: stored values are kept; settings saved before this change, or invalid values, get the defaults", () => {
  const defaults = buildDefaultSettings(SITE_ADAPTERS);
  const stored = mergeSettings({ includePrompt: false, promptFormat: "bold", promptHeadingLevel: 4 }, defaults);
  assert.deepEqual([stored.includePrompt, stored.promptFormat, stored.promptHeadingLevel], [false, "bold", 4]);
  const older = mergeSettings({ enabled: true, citationStyle: "footnotes", minHeadingLevel: 3, sites: {} }, defaults);
  assert.deepEqual([older.includePrompt, older.promptFormat, older.promptHeadingLevel, older.minHeadingLevel], [true, "heading", 2, 3]);
  const invalid = mergeSettings({ includePrompt: "yes", promptFormat: "italic", promptHeadingLevel: 7 }, defaults);
  assert.deepEqual([invalid.includePrompt, invalid.promptFormat, invalid.promptHeadingLevel], [true, "heading", 2]);
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
