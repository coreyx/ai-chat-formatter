/**
 * Regression checks for spec/gemini-code-execution: drop-down settings read
 * during conversion, and the code Gemini ran (hidden behind Show code) copied
 * as a folded Obsidian callout, as code blocks, or not at all, against a
 * synthetic fixture modeled on gemini.google.com's markup. Run with
 * `pnpm test`, which runs every scratch/test_*.ts script. Each check prints
 * PASS or FAIL, and the process exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { ContentController } from "../src/content/controller";
import { convertConversation, convertMessage } from "../src/core/convert";
import { buildDefaultSettings } from "../src/core/settings";
import type { SiteAdapter } from "../src/core/types";

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

// ---------------------------------------------------------------------------
// Drop-down settings during conversion
// ---------------------------------------------------------------------------

/** A site whose preprocess step writes the value of its `mode` drop-down, and of an undeclared one, into the reply. */
const TOY: SiteAdapter = {
  id: "toy",
  name: "Toy",
  matches: ["https://chat.example/*"],
  messageSelector: ".message",
  contentSelector: ".reply",
  findButtonAnchor: () => null,
  stripSelectors: [],
  preprocess(root, context) {
    root.textContent = `mode=${context.choice("mode")} other=${context.choice("missing") || "(none)"}`;
  },
  turndownRules: () => ({}),
  choices: [{ id: "mode", name: "Mode", description: "", defaultValue: "a", values: [{ value: "a", label: "A" }, { value: "b", label: "B" }] }],
  rules: [],
};

/** A `.message` element holding one `.reply`. */
function toyMessage(): Element {
  return new JSDOM('<!doctype html><body><div class="message"><div class="reply"><p>x</p></div></div></body>').window.document.querySelector(".message")!;
}

const BASE = { style: "linked-citations" as const, includeMoreSources: false, isRuleEnabled: () => true, references: null };

check("choices: a conversion reads a drop-down's value from its reader, its default without one, and nothing for an undeclared id", () => {
  assert.equal(convertMessage(TOY, toyMessage(), BASE), "mode=a other=(none)");
  assert.equal(convertMessage(TOY, toyMessage(), { ...BASE, choice: (id) => (id === "mode" ? "b" : "") }), "mode=b other=(none)");
});

check("choices: a conversation passes the reader to every turn", () => {
  const markdown = convertConversation(TOY, [{ prompt: null, reply: toyMessage() }, { prompt: null, reply: toyMessage() }], {
    ...BASE,
    promptFormat: { format: "heading", headingLevel: 2 },
    choice: (id) => (id === "mode" ? "b" : ""),
  });
  assert.equal(markdown, "mode=b other=(none)\n\nmode=b other=(none)");
});

await checkAsync("choices: the controller passes a site's stored drop-down value to its copy, and the default when none is stored", async () => {
  const document = new JSDOM('<!doctype html><body><div class="message"><div class="bar"></div><div class="reply"><p>x</p></div></div></body>').window.document;
  const adapter: SiteAdapter = { ...TOY, findButtonAnchor: (message) => ({ parent: message.querySelector(".bar")!, before: null }) };
  for (const [stored, expected] of [[undefined, "mode=a"], ["b", "mode=b"]] as const) {
    const settings = buildDefaultSettings([adapter]);
    settings.includePrompt = false;
    if (stored) settings.sites.toy.choices.mode = stored;
    else delete settings.sites.toy.choices.mode;
    const copied: string[] = [];
    const controller = new ContentController(adapter, settings, { document, writeClipboard: async (text) => void copied.push(text), requestFrame: (callback) => callback() });
    await controller.copy(document.querySelector(".message")!);
    assert.equal(copied[0], `${expected} other=(none)`);
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
