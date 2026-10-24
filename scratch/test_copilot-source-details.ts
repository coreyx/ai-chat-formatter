/**
 * Regression checks for spec/copilot-source-details: source titles and domains
 * on every citation, the "More sources" list, and how Copilot's source list is
 * read (the page-world script and the Sources panel fallback). Run with
 * `npm test`, which also runs the 0.1.0 checks. Each check prints PASS or
 * FAIL, and the process exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { CitationCollector, renderCitations, sourceDomain } from "../src/core/citations";
import { convertMessage } from "../src/core/convert";
import type { Citation, SiteAdapter, SourceReference } from "../src/core/types";

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

/** A source reference for `url`, with the domain derived the way adapters do. */
function ref(url: string | null, title: string, cited: boolean, domain = url ? sourceDomain(url) : ""): SourceReference {
  return { url, title, domain, cited };
}

// ---------------------------------------------------------------------------
// Rendering: domains and the More sources list
// ---------------------------------------------------------------------------

const photovault: Citation = { url: "https://photovault.example/", title: "PhotoVault", sourceName: "photovault.example" };
const repo: Citation = { url: "https://github.com/photovault/photovault", title: "GitHub - photovault/photovault: Self-hosted photo library.", sourceName: "github.com" };
const more = [
  ref("https://guides.example.net/photovault", "PhotoVault: A Complete Setup Guide", false),
  ref("https://www.example-blog.com/photovault", "PhotoVault Backups · Example Blog", false),
  ref("https://docs.photovault.example/backup", "Backup and Restore | PhotoVault Docs", false),
];

/** A collector holding the two PhotoVault citations, and the body that cites them. */
function photovaultReply(): { body: string; citations: Citation[] } {
  const collector = new CitationCollector();
  const body = `PhotoVault is a strong choice. ${collector.register(photovault)} ${collector.register(repo)}`;
  return { body, citations: collector.citations };
}

const MORE_SECTION =
  "## More sources\n\n" +
  "- [PhotoVault: A Complete Setup Guide](https://guides.example.net/photovault) — guides.example.net\n" +
  "- [PhotoVault Backups · Example Blog](https://www.example-blog.com/photovault) — example-blog.com\n" +
  "- [Backup and Restore | PhotoVault Docs](https://docs.photovault.example/backup) — docs.photovault.example";

check("render: footnotes put More sources before the definitions", () => {
  const { body, citations } = photovaultReply();
  assert.equal(
    renderCitations(body, citations, "footnotes", more),
    "PhotoVault is a strong choice.[^1][^2]\n\n" +
      MORE_SECTION +
      "\n\n[^1]: [PhotoVault](https://photovault.example/) — photovault.example\n" +
      "[^2]: [GitHub - photovault/photovault: Self-hosted photo library.](https://github.com/photovault/photovault) — github.com",
  );
});

check("render: the list styles put More sources after the Sources list", () => {
  const { body, citations } = photovaultReply();
  const sources = "## Sources\n\n1. [PhotoVault](https://photovault.example/) — photovault.example\n2. [GitHub - photovault/photovault: Self-hosted photo library.](https://github.com/photovault/photovault) — github.com";
  assert.equal(
    renderCitations(body, citations, "inline-links-and-sources", more),
    "PhotoVault is a strong choice.[1](https://photovault.example/)[2](https://github.com/photovault/photovault)\n\n" + sources + "\n\n" + MORE_SECTION,
  );
  assert.equal(renderCitations(body, citations, "sources-only", more), "PhotoVault is a strong choice.\n\n" + sources + "\n\n" + MORE_SECTION);
});

check("render: More sources skips cited and repeated sources; empty list adds nothing", () => {
  const { body, citations } = photovaultReply();
  const withDuplicates = [ref("https://photovault.example", "PhotoVault", false), ...more, more[0], ref(null, "No URL", false, "a.example"), ref(null, "no url", false, "a.example")];
  const out = renderCitations(body, citations, "sources-only", withDuplicates);
  assert.equal(out.split("## More sources\n\n")[1].split("\n").length, 4, "three linked plus one unlinked entry");
  assert.ok(!out.split("## More sources")[1].includes("](https://photovault.example"), "a cited source isn't repeated under More");
  assert.ok(!renderCitations(body, citations, "footnotes", []).includes("More sources"));
});

check("render: a source without a URL is plain, escaped text", () => {
  const out = renderCitations("Text.", [], "footnotes", [ref(null, "Set up *the sandbox* | [Example] Learn", false, "learn.example.com")]);
  assert.equal(out, "Text.\n\n## More sources\n\n- Set up \\*the sandbox\\* | \\[Example\\] Learn — learn.example.com");
});

check("render: a title that is just the domain isn't repeated", () => {
  const collector = new CitationCollector();
  const p = collector.register({ url: "https://photovault.example/", title: "photovault.example", sourceName: "photovault.example" });
  assert.equal(renderCitations(p, collector.citations, "footnotes"), "[^1]\n\n[^1]: [photovault.example](https://photovault.example/)");
  assert.equal(renderCitations("x", [], "footnotes", [ref("https://www.example.com/", "", false)]), "x\n\n## More sources\n\n- [example.com](https://www.example.com/)");
});

check("render: sourceDomain drops www. and survives a bad URL", () => {
  assert.equal(sourceDomain("https://www.example-blog.com/photovault"), "example-blog.com");
  assert.equal(sourceDomain("https://docs.photovault.example/x"), "docs.photovault.example");
  assert.equal(sourceDomain("not a url"), "not a url");
});

// ---------------------------------------------------------------------------
// convertMessage with a source list
// ---------------------------------------------------------------------------

/** Parses `html` into a detached element using jsdom. */
function element(html: string): HTMLElement {
  const { document } = new JSDOM(`<!doctype html><body>${html}</body>`).window;
  return document.body.firstElementChild as HTMLElement;
}

/** A bare adapter whose `.chip[data-url]` citations take their title from the source list when it has one. */
const lookupAdapter: SiteAdapter = {
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
      replacement: (_content, node) => {
        const url = node.getAttribute("data-url")!;
        return context.registerCitation({ url, title: context.findReference(url)?.title || "fallback", sourceName: "" });
      },
    },
  }),
  rules: [],
};

const lookupMessage = () =>
  element(`<div class="message"><div class="reply"><p>Cited. <span class="chip" data-url="https://photovault.example/#top">x</span></p></div></div>`);
const lookupReferences = [ref("https://photovault.example", "PhotoVault", true), more[2]];

check("convert: titles come from the source list, matched by normalized URL", () => {
  const out = convertMessage(lookupAdapter, lookupMessage(), { style: "footnotes", includeMoreSources: false, isRuleEnabled: () => true, references: lookupReferences });
  assert.equal(out, "Cited.[^1]\n\n[^1]: [PhotoVault](https://photovault.example/#top) — photovault.example");
});

check("convert: uncited sources become More sources only when asked", () => {
  const on = convertMessage(lookupAdapter, lookupMessage(), { style: "footnotes", includeMoreSources: true, isRuleEnabled: () => true, references: lookupReferences });
  assert.equal(on, "Cited.[^1]\n\n## More sources\n\n- [Backup and Restore | PhotoVault Docs](https://docs.photovault.example/backup) — docs.photovault.example\n\n[^1]: [PhotoVault](https://photovault.example/#top) — photovault.example");
  const none = convertMessage(lookupAdapter, lookupMessage(), { style: "footnotes", includeMoreSources: true, isRuleEnabled: () => true, references: null });
  assert.equal(none, "Cited.[^1]\n\n[^1]: [fallback](https://photovault.example/#top) — photovault.example");
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
