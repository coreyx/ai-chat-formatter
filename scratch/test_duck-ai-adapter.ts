/**
 * Regression checks for spec/duck-ai-adapter: the Duck.ai adapter's selectors,
 * conversion (citation chips, Read More cards, code blocks, bold text), button
 * placement, registration and native Copy override, against a synthetic
 * fixture modeled on duck.ai's markup. Run with `npm test`, which runs every
 * scratch/test_*.ts script. Each check prints PASS or FAIL, and the process
 * exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { ContentController } from "../src/content/controller";
import { convertMessage, type ConversionOptions } from "../src/core/convert";
import { buildDefaultSettings } from "../src/core/settings";
import type { CitationStyle } from "../src/core/types";
import { duckAiAdapter, duckAiLanguageId, readDuckAiReferences } from "../src/sites/duckai";
import { findAdapterForUrl, SITE_ADAPTERS } from "../src/sites/index";

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

/** A fresh copy of the fixture page. */
function duckAiPage(): Document {
  return new JSDOM(readFileSync("scratch/fixtures/duckai-message.html", "utf8")).window.document;
}

/** The fixture's replies: the first with chips and three Read More cards, the second with cards and no chips. */
function replies(page = duckAiPage()): Element[] {
  return Array.from(page.querySelectorAll(duckAiAdapter.messageSelector));
}

/** Converts `message` the way the extension does, reading its Read More cards first, with a fixed block-ID token. */
function convert(message: Element, style: CitationStyle = "linked-citations", overrides: Partial<ConversionOptions> = {}): string {
  return convertMessage(duckAiAdapter, message, {
    style,
    includeMoreSources: true,
    isRuleEnabled: () => true,
    references: readDuckAiReferences(message),
    idToken: "k3f9",
    ...overrides,
  });
}

const FIRST_REPLY =
  "**Widget 5** was released in May as the new current release.[[#^c-k3f9-1|⁽¹⁾]]\n\n" +
  "- **PathMatcher is global:** no import needed.[[#^c-k3f9-2|⁽²⁾]][[#^c-k3f9-1|⁽¹⁾]]\n" +
  "- The upgrade guide is in [the Widget docs](https://widget.example/docs/upgrade).\n\n" +
  "Check your version:\n\n" +
  '```bash\nif widget --version; then\n  echo "installed"\nfi\n```\n\n' +
  "## Sources\n\n" +
  "### Citations\n\n" +
  "1. [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0) — widget.example ^c-k3f9-1\n" +
  "2. [PathMatcher - API Reference | Widget Docs](https://docs.widget.example/api/path-matcher) — docs.widget.example ^c-k3f9-2\n\n" +
  "### More\n\n" +
  "- [Widget 5 is now available | Widget Blog](https://blog.widget.example/widget-5) — blog.widget.example";

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

check("messages: the two replies are found, not the user messages or the reply headings", () => {
  const found = replies();
  assert.equal(found.length, 2);
  for (const message of found) {
    assert.match(message.id, /-assistant-message-\d+-\d+$/);
    assert.ok(!message.id.startsWith("heading-"));
  }
});

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

check("convert: chips become linked citations titled from Read More, uncited cards go under More", () => {
  assert.equal(convert(replies()[0]), FIRST_REPLY);
});

check("convert: no Reasoning panel, Read More card or toolbar text leaks into the body", () => {
  const body = convert(replies()[0]).split("\n\n## Sources")[0];
  for (const leak of ["searched.example", "forum.example", "Hide Reasoning", "Read More", "Copy", "Share", "Model"]) {
    assert.ok(!body.includes(leak), `body contains ${leak}`);
  }
});

check("convert: the original page is left untouched", () => {
  const page = duckAiPage();
  const before = page.body.innerHTML;
  convert(replies(page)[0]);
  assert.equal(page.body.innerHTML, before);
});

check("convert: footnotes style with the same sources", () => {
  const markdown = convert(replies()[0], "footnotes");
  assert.ok(markdown.includes("needed.[^2][^1]"));
  assert.ok(
    markdown.endsWith(
      "## Sources\n\n### More\n\n- [Widget 5 is now available | Widget Blog](https://blog.widget.example/widget-5) — blog.widget.example\n\n" +
        "[^1]: [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0) — widget.example\n" +
        "[^2]: [PathMatcher - API Reference | Widget Docs](https://docs.widget.example/api/path-matcher) — docs.widget.example",
    ),
  );
});

check("code blocks: language from data-language, lines joined with newlines, plain languages dropped", () => {
  assert.ok(convert(replies()[0]).includes('```bash\nif widget --version; then\n  echo "installed"\nfi\n```'));
  assert.equal(duckAiLanguageId("TypeScript"), "typescript");
  assert.equal(duckAiLanguageId("text"), "");
  assert.equal(duckAiLanguageId(" PlainText "), "");
  assert.equal(duckAiLanguageId(null), "");
  // A block without line spans keeps its text.
  const page = duckAiPage();
  const code = page.querySelector('[data-streamdown="code-block-body"] code')!;
  code.innerHTML = "plain\ntext";
  assert.ok(convert(replies(page)[0]).includes("```bash\nplain\ntext\n```"));
});

// ---------------------------------------------------------------------------
// Read More references
// ---------------------------------------------------------------------------

check("references: the Read More cards in order, with title, domain and whether a chip cites them", () => {
  assert.deepEqual(readDuckAiReferences(replies()[0]), [
    { url: "https://widget.example/releases/5.0.0", title: "Widget 5.0.0 (Current)", domain: "widget.example", cited: true },
    { url: "https://docs.widget.example/api/path-matcher", title: "PathMatcher - API Reference | Widget Docs", domain: "docs.widget.example", cited: true },
    { url: "https://blog.widget.example/widget-5", title: "Widget 5 is now available | Widget Blog", domain: "blog.widget.example", cited: false },
  ]);
});

check("references: a reply without chips lists its cards under More, and nothing when More is off", () => {
  const second = replies()[1];
  assert.equal(
    convert(second),
    "Two good overviews are listed below.\n\n## Sources\n\n### More\n\n" +
      "- [Widget 5 review](https://news.example/widget-5-review) — news.example\n" +
      "- [Getting started with Widget 5](https://www.tutorials.example/widget-5) — tutorials.example",
  );
  assert.equal(convert(second, "linked-citations", { includeMoreSources: false }), "Two good overviews are listed below.");
});

check("references: without a Read More section, null, and chips fall back to their labels", () => {
  const page = duckAiPage();
  page.querySelectorAll("section").forEach((section) => section.remove());
  const first = replies(page)[0];
  assert.equal(readDuckAiReferences(first), null);
  const markdown = convert(first);
  assert.ok(markdown.includes("1. [Widget](https://widget.example/releases/5.0.0) — widget.example ^c-k3f9-1"));
  assert.ok(markdown.includes("2. [docs.widget.example](https://docs.widget.example/api/path-matcher) ^c-k3f9-2"));
  assert.ok(!markdown.includes("### More"));
});

check("references: an empty domain span falls back to the URL's domain", () => {
  const page = duckAiPage();
  const card = page.querySelector('a[data-handled-by-react][href="https://blog.widget.example/widget-5"] span span')!;
  card.textContent = "";
  assert.equal(readDuckAiReferences(replies(page)[0])![2].domain, "blog.widget.example");
});

// ---------------------------------------------------------------------------
// Button placement and the native Copy override
// ---------------------------------------------------------------------------

check("placement: directly after Copy's wrapper in the toolbar row; none without a Copy button", () => {
  const page = duckAiPage();
  const [first, second] = replies(page);
  const wrapper = first.querySelector(duckAiAdapter.nativeCopyButtonSelector)!.parentElement!;
  const anchor = duckAiAdapter.findButtonAnchor(first)!;
  assert.equal(anchor.parent, wrapper.parentElement);
  assert.equal(anchor.before, wrapper.nextSibling);
  second.querySelector(duckAiAdapter.nativeCopyButtonSelector)!.remove();
  assert.equal(duckAiAdapter.findButtonAnchor(second), null);
});

/** Starts a controller on a fresh fixture page, recording what it writes to the clipboard. */
function startController(overrideNativeCopy: boolean) {
  const document = duckAiPage();
  const settings = buildDefaultSettings(SITE_ADAPTERS);
  settings.sites.duckai.overrideNativeCopy = overrideNativeCopy;
  const written: string[] = [];
  const controller = new ContentController(duckAiAdapter, settings, { document, writeClipboard: async (text) => void written.push(text), requestFrame: (callback) => callback() });
  controller.start();
  return { document, written };
}

/** Lets pending timers and promise callbacks run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** `markdown` with its random block-ID token replaced, so two copies can be compared. */
const withoutToken = (markdown: string) => markdown.replace(/c-[a-z0-9]{4}-/g, "c-TOKEN-");

await checkAsync("controller: each reply gets a Copy as Markdown button after Copy, and it copies the reply", async () => {
  const page = startController(false);
  const buttons = Array.from(page.document.querySelectorAll<HTMLButtonElement>(".acf-copy-button"));
  assert.equal(buttons.length, 2);
  assert.ok(buttons[0].previousElementSibling!.contains(page.document.querySelector(duckAiAdapter.nativeCopyButtonSelector)));
  buttons[0].click();
  await flush();
  assert.equal(withoutToken(page.written[0]), withoutToken(FIRST_REPLY));
});

await checkAsync("controller: with the override on, Duck.ai's own Copy writes the same Markdown", async () => {
  const page = startController(true);
  page.document.querySelector<HTMLButtonElement>(duckAiAdapter.nativeCopyButtonSelector)!.click();
  await flush();
  assert.equal(page.written.length, 1);
  assert.equal(withoutToken(page.written[0]), withoutToken(FIRST_REPLY));
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

check("registration: Duck.ai's pages pick the adapter, DuckDuckGo search doesn't", () => {
  assert.equal(findAdapterForUrl("https://duck.ai/"), duckAiAdapter);
  assert.equal(findAdapterForUrl("https://duck.ai/?chatID=00000000-0000-4000-8000-000000000000"), duckAiAdapter);
  assert.equal(findAdapterForUrl("https://duck.ai/chat?ia=chat"), duckAiAdapter);
  assert.equal(findAdapterForUrl("https://duckduckgo.com/?q=widget"), undefined);
});

check("registration: the manifest runs the content script and Duck.ai's page script on duck.ai, and More sources default on", () => {
  const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
  assert.ok(manifest.content_scripts[0].matches.includes("https://duck.ai/*"));
  const pageScripts = manifest.content_scripts.slice(1) as { matches: string[]; js: string[]; world: string }[];
  assert.deepEqual(
    pageScripts.filter((script) => script.matches.includes("https://duck.ai/*")),
    [{ matches: ["https://duck.ai/*"], js: ["page-duckai.js"], run_at: "document_idle", world: "MAIN" }],
  );
  assert.ok(!pageScripts.find((script) => script.js.includes("page-copilot.js"))!.matches.includes("https://duck.ai/*"), "Copilot's page script stays off duck.ai");
  assert.equal(buildDefaultSettings(SITE_ADAPTERS).sites.duckai.includeMoreSources, true);
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
