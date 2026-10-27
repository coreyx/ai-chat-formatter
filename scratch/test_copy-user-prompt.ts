/**
 * Regression checks for spec/copy-user-prompt: reading a prompt's text,
 * writing it in each prompt format, putting it above the response (with the
 * response nested below a prompt heading), each site's prompt reader, the
 * settings, the options page and the controller. Run with `pnpm test`, which
 * runs every scratch/test_*.ts script. Each check prints PASS or FAIL, and the
 * process exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { formatPrompt, promptText } from "../src/core/prompt";

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
// Summary
// ---------------------------------------------------------------------------

for (const result of results) {
  console.log(`${result.error ? "FAIL" : "PASS"}  ${result.name}`);
  if (result.error) console.log(`      ${String((result.error as Error).message ?? result.error).split("\n").join("\n      ")}`);
}
const failed = results.filter((result) => result.error).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
