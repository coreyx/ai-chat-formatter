/**
 * Regression checks for spec/gemini-code-execution: drop-down settings read
 * during conversion, and the code Gemini ran (hidden behind Show code) copied
 * as a folded Obsidian callout, as code blocks, or not at all, against a
 * synthetic fixture modeled on gemini.google.com's markup. Run with
 * `pnpm test`, which runs every scratch/test_*.ts script. Each check prints
 * PASS or FAIL, and the process exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { ContentController } from "../src/content/controller";
import { convertConversation, convertMessage } from "../src/core/convert";
import { buildDefaultSettings } from "../src/core/settings";
import type { SiteAdapter } from "../src/core/types";
import { renderOptions } from "../src/options/options";
import { CODE_EXECUTION_CHOICE, geminiAdapter } from "../src/sites/gemini";
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
// The setting
// ---------------------------------------------------------------------------

check("setting: Gemini's Code Gemini ran starts as a folded callout, and the options page offers its three choices", () => {
  assert.equal(buildDefaultSettings(SITE_ADAPTERS).sites.gemini.choices[CODE_EXECUTION_CHOICE], "callout");
  const document = new JSDOM("<!doctype html><body></body>").window.document;
  const form = renderOptions(document, SITE_ADAPTERS, () => {});
  document.body.append(form.root);
  form.fill(buildDefaultSettings(SITE_ADAPTERS));
  const select = document.querySelector<HTMLSelectElement>('section[data-site="gemini"] select[name="gemini.choices.code-execution"]')!;
  assert.deepEqual(Array.from(select.options, (option) => [option.value, option.textContent]), [["callout", "Folded callout"], ["code-blocks", "Code blocks"], ["omit", "Leave out"]]);
  assert.equal(select.value, "callout");
});

// ---------------------------------------------------------------------------
// Code Gemini ran
// ---------------------------------------------------------------------------

/** A run of code as Gemini draws it, folded behind Show code: the code with its language header, then Code output and the output. */
function codeRun(code: string, output: string): string {
  return (
    '<response-element class="no-md md-has-block-component"><code-block class="enable-luminous-code-block"><div class="code-block" style="display: none"><div><div class="animated-opacity">' +
    '<div class="code-block-decoration header-formatted"><span>Python</span><div class="buttons"><button aria-label="Download code"></button><button aria-label="Copy code"></button></div></div>' +
    `<pre><code class="code-container formatted" data-test-id="code-content">${code}</code></pre>` +
    '<div class="code-block-decoration header"><span>Code output</span></div><mat-divider class="code-result-divider"></mat-divider>' +
    `<pre><code class="code-result-container" data-test-id="code-output-stdout-stderr">${output}</code></pre>` +
    "</div></div></div></code-block></response-element>"
  );
}

/** An ordinary code block Gemini wrote, with its language header. */
function writtenBlock(language: string, code: string): string {
  return `<response-element class="no-md md-has-block-component"><code-block><div class="code-block"><div><div class="animated-opacity"><div class="code-block-decoration header-formatted"><span>${language}</span><div class="buttons"><button aria-label="Copy code"></button></div></div><pre><code class="code-container formatted" data-test-id="code-content">${code}</code></pre></div></div></div></code-block></response-element>`;
}

/** A finished Gemini reply whose text is `html`, with the Show code toggle in its header. */
function geminiReply(html: string): Element {
  const document = new JSDOM(
    `<!doctype html><body><model-response><div class="response-container-header"><button class="toggle-code" data-test-id="toggle-code-button">Show code</button></div><div class="response-container-content"><div class="response-content"><model-response-content><message-content><div class="markdown markdown-main-panel">${html}</div></message-content></model-response-content></div></div></model-response></body>`,
  ).window.document;
  return document.querySelector("model-response")!;
}

/** Converts `reply` with Code Gemini ran set to `mode` (absent: the default). */
function convertRuns(reply: Element, mode?: string): string {
  return convertMessage(geminiAdapter, reply, { ...BASE, ...(mode ? { choice: (id: string) => (id === CODE_EXECUTION_CHOICE ? mode : "") } : {}) });
}

const TWO_RUNS_THEN_TEXT = `${codeRun("import json\nprint(len([1, 2]))\n", "2\n")}${codeRun("save('riff.json')", "Saved riff.json")}<h3>The riff</h3><p>Here it is.</p>${writtenBlock("JSON", '{"bpm": 120}')}`;

check("runs as code blocks: each run's code is fenced with its language, then Code output and a plain fence; the toggle, headers and buttons are gone", () => {
  assert.equal(
    convertRuns(geminiReply(TWO_RUNS_THEN_TEXT), "code-blocks"),
    '```python\nimport json\nprint(len([1, 2]))\n```\n\n**Code output**\n\n```\n2\n```\n\n```python\nsave(\'riff.json\')\n```\n\n**Code output**\n\n```\nSaved riff.json\n```\n\n### The riff\n\nHere it is.\n\n```json\n{"bpm": 120}\n```',
  );
});

check("runs left out: no run or output is copied, and the rest of the reply is intact", () => {
  assert.equal(convertRuns(geminiReply(TWO_RUNS_THEN_TEXT), "omit"), '### The riff\n\nHere it is.\n\n```json\n{"bpm": 120}\n```');
});

const TWO_RUN_CALLOUT = [
  "> [!example]- Code Gemini ran",
  "> ```python",
  "> import json",
  "> print(len([1, 2]))",
  "> ```",
  ">",
  "> **Code output**",
  ">",
  "> ```",
  "> 2",
  "> ```",
  ">",
  "> ```python",
  "> save('riff.json')",
  "> ```",
  ">",
  "> **Code output**",
  ">",
  "> ```",
  "> Saved riff.json",
  "> ```",
].join("\n");

check("runs as a callout (the default): runs next to each other share one folded callout, before the text; written code stays a plain block", () => {
  assert.equal(convertRuns(geminiReply(TWO_RUNS_THEN_TEXT)), `${TWO_RUN_CALLOUT}\n\n### The riff\n\nHere it is.\n\n\`\`\`json\n{"bpm": 120}\n\`\`\``);
  assert.equal(convertRuns(geminiReply(TWO_RUNS_THEN_TEXT), "callout"), convertRuns(geminiReply(TWO_RUNS_THEN_TEXT)));
  assert.equal(convertRuns(geminiReply(TWO_RUNS_THEN_TEXT), "unknown-value"), convertRuns(geminiReply(TWO_RUNS_THEN_TEXT)), "an unknown value reads as the default");
});

check("runs as a callout: a run apart from the others gets its own callout in place; one that printed nothing has no Code output; backticks lengthen the fence", () => {
  const markdown = convertRuns(geminiReply(`${codeRun("a = 1", "1")}<p>Between.</p>${codeRun('s = """\n```\n"""', "")}<p>After.</p>`));
  assert.equal(
    markdown,
    "> [!example]- Code Gemini ran\n> ```python\n> a = 1\n> ```\n>\n> **Code output**\n>\n> ```\n> 1\n> ```\n\nBetween.\n\n> [!example]- Code Gemini ran\n> ````python\n> s = \"\"\"\n> ```\n> \"\"\"\n> ````\n\nAfter.",
  );
});

check("runs as code blocks: a run that printed nothing has no Code output part", () => {
  assert.equal(convertRuns(geminiReply(codeRun("x = 1", "")), "code-blocks"), "```python\nx = 1\n```");
});

// ---------------------------------------------------------------------------
// The fixture
// ---------------------------------------------------------------------------

/** The fixture page: one turn whose reply holds three runs of code around its text. */
function fixturePage(): Document {
  return new JSDOM(`<!doctype html><body>${readFileSync("scratch/fixtures/gemini-code-execution.html", "utf8")}</body>`).window.document;
}

const FIXTURE_REPLY = [
  "> [!example]- Code Gemini ran",
  "> ```python",
  "> import json",
  "> notes = [40, 43]",
  "> print(len(notes))",
  "> ```",
  ">",
  "> **Code output**",
  ">",
  "> ```",
  "> 2",
  "> ```",
  ">",
  "> ```python",
  "> save('riff.json', notes)",
  "> ```",
  ">",
  "> **Code output**",
  ">",
  "> ```",
  "> Saved riff.json",
  "> ```",
  "",
  "### The riff",
  "",
  "Here are the two notes.",
  "",
  "```json",
  '{"notes": [40, 43]}',
  "```",
  "",
  "> [!example]- Code Gemini ran",
  "> ````python",
  '> fence = """',
  "> ```",
  '> """',
  "> ````",
  "",
  "Play it slowly.",
].join("\n");

check("fixture: the default copy folds the two runs into one callout and the third into its own, with the text and the written block untouched", () => {
  const markdown = convertRuns(fixturePage().querySelector("model-response")!);
  assert.equal(markdown, FIXTURE_REPLY);
  for (const leak of ["Show code", "Download code", "Copy code"]) assert.ok(!markdown.includes(leak), leak);
});

await checkAsync("fixture: the setting reaches the reply button, the Conversation copy and the native Copy override", async () => {
  for (const [mode, expectRun] of [["callout", "> [!example]- Code Gemini ran"], ["code-blocks", "**Code output**\n\n```\nSaved riff.json\n```"], ["omit", null]] as const) {
    const document = fixturePage();
    const settings = buildDefaultSettings([geminiAdapter]);
    settings.includePrompt = false;
    settings.sites.gemini.choices[CODE_EXECUTION_CHOICE] = mode;
    settings.sites.gemini.overrideNativeCopy = true;
    const copied: string[] = [];
    new ContentController(geminiAdapter, settings, { document, writeClipboard: async (text) => void copied.push(text), requestFrame: (callback) => callback() }).start();
    document.querySelector<HTMLButtonElement>("model-response [data-acf-injected]")!.click();
    document.querySelector<HTMLButtonElement>('[title="Copy conversation as Markdown"]')!.click();
    document.querySelector<HTMLButtonElement>("message-actions copy-button button")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(copied.length, 3, mode);
    for (const markdown of copied) {
      if (expectRun) assert.ok(markdown.includes(expectRun), `${mode}: ${markdown}`);
      else assert.ok(!markdown.includes("riff.json") && !markdown.includes("Code output"), `${mode}: ${markdown}`);
      assert.ok(markdown.includes("### The riff\n\nHere are the two notes."), `${mode}: the text around the runs is kept`);
    }
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
