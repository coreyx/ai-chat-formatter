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
import { JSDOM } from "jsdom";
import { convertConversation, convertMessage, type ConversionOptions } from "../src/core/convert";
import { AFTER_SOURCES_ATTRIBUTE, type SiteAdapter, type SourceReference } from "../src/core/types";
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
// The converter: sections after Sources, an option that governs More, conversations
// ---------------------------------------------------------------------------

/**
 * A minimal adapter for the converter checks. Each `<a class="cite">` is a
 * citation; `preprocess` marks `.after` elements to follow the Sources
 * section. Its `more` option governs More when `governed` is set.
 */
function toyAdapter(governed = false): SiteAdapter {
  return {
    id: "toy",
    name: "Toy",
    matches: ["https://chat.example/*"],
    messageSelector: ".message",
    contentSelector: ".reply",
    findButtonAnchor: () => null,
    stripSelectors: [],
    preprocess(root) {
      root.querySelectorAll(".after").forEach((element) => element.setAttribute(AFTER_SOURCES_ATTRIBUTE, ""));
    },
    turndownRules: (context) => ({
      cite: {
        filter: (node) => node.nodeName === "A" && (node as HTMLElement).classList.contains("cite"),
        replacement: (_content, node) => {
          const url = (node as HTMLElement).getAttribute("href")!;
          return context.registerCitation({ url, title: (node.textContent ?? "").trim(), sourceName: new URL(url).hostname });
        },
      },
    }),
    options: governed ? [{ id: "more", name: "More", description: "", defaultEnabled: true, governsMoreSources: true }] : [],
    rules: [],
  };
}

/** A `.message` element holding `replyHtml` in its `.reply`. */
function toyMessage(replyHtml: string): Element {
  const document = new JSDOM(`<!doctype html><body><div class="message"><div class="reply">${replyHtml}</div></div></body>`).window.document;
  return document.querySelector(".message")!;
}

const TOY_REFERENCES: SourceReference[] = [
  { url: "https://a.example/one", title: "One", domain: "a.example", cited: true },
  { url: "https://b.example/two", title: "Two", domain: "b.example", cited: false },
];

/** Conversion options for the toy checks: linked citations with a fixed token, More off. */
function toyOptions(overrides: Partial<ConversionOptions> = {}): ConversionOptions {
  return { style: "linked-citations", includeMoreSources: false, isRuleEnabled: () => true, references: TOY_REFERENCES, idToken: "t", ...overrides };
}

const TOY_REPLY = '<h1>Title</h1><p>Text <a class="cite" href="https://a.example/one">One</a>.</p><div class="after"><h2>Extra</h2><p>Last words.</p></div>';

check("converter: a section marked after Sources comes after the Sources section, and shifts with the minimum heading level", () => {
  const markdown = convertMessage(toyAdapter(), toyMessage(TOY_REPLY), toyOptions({ minHeadingLevel: 2 }));
  assert.equal(
    markdown,
    [
      "## Title",
      "",
      "Text[[#^c-t-1|⁽¹⁾]].",
      "",
      "### Sources",
      "",
      "#### Citations",
      "",
      "1. [One](https://a.example/one) — a.example ^c-t-1",
      "",
      "### Extra",
      "",
      "Last words.",
    ].join("\n"),
  );
});

check("converter: with footnotes, the section after Sources follows the footnote definitions; without citations it still comes last", () => {
  const footnotes = convertMessage(toyAdapter(), toyMessage(TOY_REPLY), toyOptions({ style: "footnotes" }));
  assert.match(footnotes, /\[\^1\]: \[One\]\(https:\/\/a\.example\/one\) — a\.example\n\n## Extra\n\nLast words\.$/);
  const plain = convertMessage(toyAdapter(), toyMessage('<p>No sources.</p><div class="after"><h2>Extra</h2></div>'), toyOptions({ references: null }));
  assert.equal(plain, "No sources.\n\n## Extra");
});

check("converter: an option that governs More decides it, whatever includeMoreSources says", () => {
  const more = /### More\n\n- \[Two\]\(https:\/\/b\.example\/two\) — b\.example/;
  const reply = '<p>Text <a class="cite" href="https://a.example/one">One</a>.</p>';
  assert.match(convertMessage(toyAdapter(true), toyMessage(reply), toyOptions({ includeMoreSources: false })), more, "on by default, with the generic setting off");
  assert.doesNotMatch(
    convertMessage(toyAdapter(true), toyMessage(reply), toyOptions({ includeMoreSources: true, isOptionEnabled: () => false })),
    /### More/,
    "off, with the generic setting on",
  );
  assert.doesNotMatch(convertMessage(toyAdapter(false), toyMessage(reply), toyOptions()), /### More/, "without a governing option, the generic setting still applies");
});

check("converter: a conversation is each prompt above its reply, in order, with unique block IDs and every prompt kept", () => {
  const document = new JSDOM(
    '<!doctype html><body><div class="turn" id="t1"><div class="reply"><p>First <a class="cite" href="https://a.example/one">One</a>.</p></div></div>' +
      '<div class="turn" id="t2"><div class="reply"><p>Second <a class="cite" href="https://a.example/one">One</a>.</p></div></div>' +
      '<div class="turn" id="t3"></div><div class="turn" id="t4"><div class="reply"></div></div></body>',
  ).window.document;
  const turn = (id: string) => document.getElementById(id)!;
  const markdown = convertConversation(
    toyAdapter(),
    [
      { prompt: "Question one", reply: turn("t1") },
      { prompt: "Question two\nwith a second line", reply: turn("t2") },
      { prompt: "Unanswered", reply: turn("t3") },
      { prompt: null, reply: turn("t4") },
    ],
    { style: "linked-citations", includeMoreSources: false, isRuleEnabled: () => true, idToken: "t", promptFormat: { format: "heading", headingLevel: 2 } },
  );
  assert.equal(
    markdown,
    [
      "## Question one",
      "",
      "First[[#^c-t1-1|⁽¹⁾]].",
      "",
      "### Sources",
      "",
      "#### Citations",
      "",
      "1. [One](https://a.example/one) — a.example ^c-t1-1",
      "",
      "## Question two",
      "",
      "> with a second line",
      "",
      "Second[[#^c-t2-1|⁽¹⁾]].",
      "",
      "### Sources",
      "",
      "#### Citations",
      "",
      "1. [One](https://a.example/one) — a.example ^c-t2-1",
      "",
      "## Unanswered",
    ].join("\n"),
  );
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
