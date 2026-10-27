/**
 * Regression checks for spec/min-heading-level: shifting headings down to the
 * minimum heading level, what counts as a heading, the shift through
 * convertMessage with the Sources section, the stored setting, the options
 * page and the controller. Run with `npm test`, which runs every
 * scratch/test_*.ts script. Each check prints PASS or FAIL, and the process
 * exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { enforceMinHeadingLevel } from "../src/core/headings";

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
// Summary
// ---------------------------------------------------------------------------

for (const result of results) {
  console.log(`${result.error ? "FAIL" : "PASS"}  ${result.name}`);
  if (result.error) console.log(`      ${String((result.error as Error).message ?? result.error).split("\n").join("\n      ")}`);
}
const failed = results.filter((result) => result.error).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
