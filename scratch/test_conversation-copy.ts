/**
 * Regression checks for spec/conversation-copy: the Conversation button and
 * its turn-by-turn copy on Duck.ai and Copilot, against synthetic fixtures
 * modeled on duck.ai's and copilot.com's markup. Run with `pnpm test`, which
 * runs every scratch/test_*.ts script. Each check prints PASS or FAIL, and
 * the process exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { DUCK_AI_REPLY_SELECTOR, duckAiAdapter, readDuckAiTurns } from "../src/sites/duckai";

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
// Duck.ai: the conversation as a message
// ---------------------------------------------------------------------------

check("duck.ai: the older, flat layout's conversation is found and split into its two turns, each with its prompt", () => {
  const page = new JSDOM(readFileSync("scratch/fixtures/duckai-message.html", "utf8")).window.document;
  const conversations = Array.from(page.querySelectorAll(duckAiAdapter.messageSelector)).filter((message) => !message.matches(DUCK_AI_REPLY_SELECTOR));
  assert.equal(conversations.length, 1);
  const turns = readDuckAiTurns(conversations[0])!;
  assert.deepEqual(turns.map((turn) => turn.prompt), ["What is new in Widget 5?", "Any other reading?\n\nList two."]);
  assert.deepEqual(turns.map((turn) => turn.reply.id.slice(-5)), ["e-0-1", "e-1-1"]);
  assert.equal(readDuckAiTurns(turns[0].reply), null, "a reply isn't split into turns");
  assert.equal(duckAiAdapter.buttonLabel?.(turns[0].reply), null);
  assert.equal(duckAiAdapter.buttonLabel?.(conversations[0])?.text, "Conversation");
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
