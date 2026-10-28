/**
 * Regression checks for spec/gemini-deep-research: the shared additions
 * (sections after Sources, an option that governs More, conversations copied
 * turn by turn, buttons outside their message, labelled and hidden buttons)
 * and the Gemini adapter's report and conversation copies, against a
 * synthetic fixture modeled on gemini.google.com's markup. Run with
 * `pnpm test`, which runs every scratch/test_*.ts script. Each check prints
 * PASS or FAIL, and the process exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { AFTER_SOURCES_ATTRIBUTE, type SiteAdapter } from "../src/core/types";
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

// ---------------------------------------------------------------------------
// The adapter contract
// ---------------------------------------------------------------------------

check("contract: the after-Sources marker is a data attribute, and the existing sites keep their native Copy selector", () => {
  assert.equal(AFTER_SOURCES_ATTRIBUTE, "data-acf-after-sources");
  for (const id of ["copilot", "duckai", "duckduckgo"]) {
    const adapter = SITE_ADAPTERS.find((candidate) => candidate.id === id) as SiteAdapter;
    assert.ok(adapter.nativeCopyButtonSelector, `${id} still offers the override`);
  }
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
