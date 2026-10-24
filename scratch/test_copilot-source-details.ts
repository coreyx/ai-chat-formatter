/**
 * Regression checks for spec/copilot-source-details: source titles and domains
 * on every citation, the "More sources" list, and how Copilot's source list is
 * read (the page-world script and the Sources panel fallback). Run with
 * `npm test`, which also runs the 0.1.0 checks. Each check prints PASS or
 * FAIL, and the process exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { REFERENCES_ATTRIBUTE, REFERENCES_EVENT } from "../src/core/references-protocol";
import { extractCopilotReferences, installCopilotPageScript } from "../src/page/copilot";
import { copilotAdapter, panelTiming, parseReferencesAttribute, readPageDataReferences } from "../src/sites/copilot";
import { CitationCollector, renderCitations, sourceDomain } from "../src/core/citations";
import { convertMessage } from "../src/core/convert";
import { buildDefaultSettings, mergeSettings, type Settings } from "../src/core/settings";
import { ContentController } from "../src/content/controller";
import { renderOptions } from "../src/options/options";
import { SITE_ADAPTERS } from "../src/sites/index";
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
  "### More\n\n" +
  "- [PhotoVault: A Complete Setup Guide](https://guides.example.net/photovault) — guides.example.net\n" +
  "- [PhotoVault Backups · Example Blog](https://www.example-blog.com/photovault) — example-blog.com\n" +
  "- [Backup and Restore | PhotoVault Docs](https://docs.photovault.example/backup) — docs.photovault.example";

check("render: footnotes put More under Sources, then the definitions, with no Citations heading", () => {
  const { body, citations } = photovaultReply();
  assert.equal(
    renderCitations(body, citations, "footnotes", more),
    "PhotoVault is a strong choice.[^1][^2]\n\n" +
      "## Sources\n\n" +
      MORE_SECTION +
      "\n\n[^1]: [PhotoVault](https://photovault.example/) — photovault.example\n" +
      "[^2]: [GitHub - photovault/photovault: Self-hosted photo library.](https://github.com/photovault/photovault) — github.com",
  );
});

check("render: the list styles put the numbered list under Citations, with More after it", () => {
  const { body, citations } = photovaultReply();
  const sources = "## Sources\n\n### Citations\n\n1. [PhotoVault](https://photovault.example/) — photovault.example\n2. [GitHub - photovault/photovault: Self-hosted photo library.](https://github.com/photovault/photovault) — github.com";
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
  assert.equal(out.split("### More\n\n")[1].split("\n").length, 4, "three linked plus one unlinked entry");
  assert.ok(!out.split("### More")[1].includes("](https://photovault.example"), "a cited source isn't repeated under More");
  const withoutMore = renderCitations(body, citations, "footnotes", []);
  assert.ok(!withoutMore.includes("## Sources") && withoutMore.includes("\n\n[^1]: "), "footnotes without More: just the definitions");
});

check("render: a source without a URL is plain, escaped text; More alone has no Citations subsection", () => {
  const out = renderCitations("Text.", [], "footnotes", [ref(null, "Set up *the sandbox* | [Example] Learn", false, "learn.example.com")]);
  assert.equal(out, "Text.\n\n## Sources\n\n### More\n\n- Set up \\*the sandbox\\* | \\[Example\\] Learn — learn.example.com");
});

check("render: a title that is just the domain isn't repeated", () => {
  const collector = new CitationCollector();
  const p = collector.register({ url: "https://photovault.example/", title: "photovault.example", sourceName: "photovault.example" });
  assert.equal(renderCitations(p, collector.citations, "footnotes"), "[^1]\n\n[^1]: [photovault.example](https://photovault.example/)");
  assert.equal(renderCitations("x", [], "footnotes", [ref("https://www.example.com/", "", false)]), "x\n\n## Sources\n\n### More\n\n- [example.com](https://www.example.com/)");
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
  assert.equal(on, "Cited.[^1]\n\n## Sources\n\n### More\n\n- [Backup and Restore | PhotoVault Docs](https://docs.photovault.example/backup) — docs.photovault.example\n\n[^1]: [PhotoVault](https://photovault.example/#top) — photovault.example");
  const none = convertMessage(lookupAdapter, lookupMessage(), { style: "footnotes", includeMoreSources: true, isRuleEnabled: () => true, references: null });
  assert.equal(none, "Cited.[^1]\n\n[^1]: [fallback](https://photovault.example/#top) — photovault.example");
});

// ---------------------------------------------------------------------------
// Page-world script: reading response.references from React fibers
// ---------------------------------------------------------------------------

const RAW_REFERENCES: unknown[] = JSON.parse(readFileSync("scratch/fixtures/copilot-references.json", "utf8"));

/**
 * A jsdom page with one Copilot reply whose `markdown-reply` element carries a
 * fake React fiber chain with `response.references` at `level` (0 being the
 * element's own fiber). `level` null gives a chain with no references.
 */
function fiberPage(level: number | null, references: unknown[] = RAW_REFERENCES) {
  const document = new JSDOM(
    `<!doctype html><body><div role="article"><div data-testid="markdown-reply"><p>Reply.</p></div><div role="toolbar"></div></div></body>`,
  ).window.document;
  const reply = document.querySelector('[data-testid="markdown-reply"]')!;
  let fiber: Record<string, unknown> | null = null;
  for (let i = 25; i >= 0; i--) {
    fiber = { memoizedProps: i === level ? { response: { references } } : { other: i }, return: fiber };
  }
  (reply as unknown as Record<string, unknown>)["__reactFiber$test123"] = fiber;
  return { document, reply, message: document.querySelector('[role="article"]')! };
}

check("page script: reads every web source with title, cited and hidden flags", () => {
  const { reply } = fiberPage(4);
  const found = extractCopilotReferences(reply)!;
  assert.equal(found.length, 7, "the file:// entry is dropped");
  assert.deepEqual(found[0], { url: "https://photovault.example/", title: "PhotoVault", cited: true, hidden: false });
  assert.deepEqual(found.map((r) => r.cited), [true, true, true, false, false, false, false]);
  assert.equal(found[6].hidden, true);
});

check("page script: finds the list from the message element too, and gives up cleanly", () => {
  assert.equal(extractCopilotReferences(fiberPage(4).message)?.length, 7);
  assert.equal(extractCopilotReferences(fiberPage(20).reply)?.length, 7, "20 levels up is still searched");
  assert.equal(extractCopilotReferences(fiberPage(21).reply), null, "beyond 20 levels it stops");
  assert.equal(extractCopilotReferences(fiberPage(null).reply), null, "a chain without references");
  const bare = new JSDOM(`<div data-testid="markdown-reply"></div>`).window.document.body.firstElementChild!;
  assert.equal(extractCopilotReferences(bare), null, "no fiber at all");
});

check("page script: answers a request event by writing the list to the reply", () => {
  const { document, reply } = fiberPage(4);
  installCopilotPageScript(document);
  reply.dispatchEvent(new document.defaultView!.CustomEvent(REFERENCES_EVENT, { bubbles: true }));
  assert.equal(JSON.parse(reply.getAttribute(REFERENCES_ATTRIBUTE)!).length, 7);
  const empty = fiberPage(null);
  installCopilotPageScript(empty.document);
  empty.reply.dispatchEvent(new empty.document.defaultView!.CustomEvent(REFERENCES_EVENT, { bubbles: true }));
  assert.equal(empty.reply.hasAttribute(REFERENCES_ATTRIBUTE), false);
});

// ---------------------------------------------------------------------------
// Copilot adapter: reading references through the page script
// ---------------------------------------------------------------------------

/**
 * The 0.1.0 Copilot fixture with the first chip turned into a two-source chip
 * ("photovault+1"), and a fake React fiber carrying the references fixture on the
 * reply. `withPageScript` installs the page script's listener, as the
 * extension's page-world script would.
 */
function copilotFixtureWithReferences(withPageScript: boolean) {
  const document = new JSDOM(readFileSync("scratch/fixtures/copilot-message.html", "utf8")).window.document;
  const chip = document.querySelector("button[data-grouped-citations]")!;
  chip.setAttribute(
    "data-grouped-citations",
    JSON.stringify([
      { index: "1-0a0b0c", occurrence: 1, url: "https://photovault.example/", name: "photovault.example" },
      { index: "2-41a9be", occurrence: 1, url: "https://github.com/photovault/photovault", name: "github.com" },
    ]),
  );
  chip.setAttribute("aria-label", "Citation: photovault — PhotoVault plus 1 more");
  const reply = document.querySelector('[data-testid="markdown-reply"]')!;
  let fiber: Record<string, unknown> | null = { memoizedProps: { response: { references: RAW_REFERENCES } }, return: null };
  for (let i = 0; i < 4; i++) fiber = { memoizedProps: {}, return: fiber };
  (reply as unknown as Record<string, unknown>)["__reactFiber$fixture"] = fiber;
  if (withPageScript) installCopilotPageScript(document);
  return { document, reply, message: document.querySelectorAll(copilotAdapter.messageSelector)[0] };
}

check("copilot: readReferences gets the list from the page script and cleans up", () => {
  const { reply, message } = copilotFixtureWithReferences(true);
  const references = copilotAdapter.readReferences!(message)!;
  assert.equal(references.length, 6, "the hidden and non-web entries are left out");
  assert.deepEqual(references[4], { url: "https://www.example-blog.com/photovault", title: "PhotoVault Backups · Example Blog", domain: "example-blog.com", cited: false });
  assert.equal(reply.hasAttribute(REFERENCES_ATTRIBUTE), false);
  assert.equal(copilotAdapter.readReferences!(copilotFixtureWithReferences(false).message), null, "no page script, no list");
});

check("copilot: parseReferencesAttribute rejects malformed data", () => {
  assert.equal(parseReferencesAttribute(null), null);
  assert.equal(parseReferencesAttribute("{not json"), null);
  assert.equal(parseReferencesAttribute('{"url":"https://a.example"}'), null);
  assert.equal(parseReferencesAttribute('[{"url":"https://a.example","title":"A"}]'), null, "missing cited");
  assert.deepEqual(parseReferencesAttribute('[{"url":"ftp://a.example","title":"A","cited":true,"hidden":false}]'), []);
});

check("copilot: a multi-source chip gets every title from the source list", () => {
  const { message } = copilotFixtureWithReferences(true);
  const references = copilotAdapter.readReferences!(message);
  const out = convertMessage(copilotAdapter, message, { style: "footnotes", includeMoreSources: true, isRuleEnabled: () => true, references });
  assert.ok(out.includes("The main changes include:[^1][^2]"), "both sources of the chip are cited");
  assert.ok(out.includes("[^1]: [PhotoVault](https://photovault.example/) — photovault.example\n"));
  assert.ok(out.includes("[^2]: [GitHub - photovault/photovault: Self-hosted photo library.](https://github.com/photovault/photovault) — github.com\n"));
  const moreSection = out.split("### More\n\n")[1].split("\n\n")[0];
  // Copilot flags example-user/photovault-fork as cited, so it isn't a More source even though this fixture has no chip for it.
  assert.deepEqual(moreSection.split("\n"), [
    "- [PhotoVault: A Complete Setup Guide](https://guides.example.net/photovault) — guides.example.net",
    "- [PhotoVault Backups · Example Blog](https://www.example-blog.com/photovault) — example-blog.com",
    "- [Backup and Restore | PhotoVault Docs](https://docs.photovault.example/backup) — docs.photovault.example",
  ]);
});

check("copilot: without a source list a multi-source chip falls back to source names", () => {
  const { message } = copilotFixtureWithReferences(false);
  const out = convertMessage(copilotAdapter, message, { style: "footnotes", includeMoreSources: true, isRuleEnabled: () => true, references: null });
  assert.ok(out.includes("[^1]: [photovault.example](https://photovault.example/)\n"), "a title that's just the domain isn't repeated");
  assert.ok(out.includes("[^2]: [github.com](https://github.com/photovault/photovault)\n"));
  assert.ok(!out.includes("### More"));
});

// ---------------------------------------------------------------------------
// Copilot adapter: the Sources panel fallback
// ---------------------------------------------------------------------------

const PANEL_HTML = readFileSync("scratch/fixtures/copilot-sources-panel.html", "utf8");
const TERRENCE = "https://github.com/example-dev/deploykit/blob/main/docs/sandbox-setup.md";
const ISSUE = "https://github.com/deploykit/deploykit/issues/123";

/**
 * The Copilot fixture page with its chips citing the two github.com sources of
 * the panel fixture (index 1 and 2), and a Sources button whose click inserts
 * the panel after `openDelayMs`. `panelHtml` null makes the panel never
 * appear. The panel's Close button removes it. `openWith` starts the page with
 * a panel already open.
 */
function panelPage(options: { openDelayMs?: number; panelHtml?: string | null; openWith?: string; chipUrls?: [string, string] } = {}) {
  const { openDelayMs = 60, panelHtml = PANEL_HTML, openWith, chipUrls = [TERRENCE, ISSUE] } = options;
  const document = new JSDOM(readFileSync("scratch/fixtures/copilot-message.html", "utf8")).window.document;
  const chips = document.querySelectorAll("button[data-grouped-citations]");
  chips.forEach((chip, i) => {
    const which = i % 2;
    chip.setAttribute("data-grouped-citations", JSON.stringify([{ index: `${which + 1}-abc${which}`, occurrence: i, url: chipUrls[which], name: "github.com" }]));
  });
  const message = document.querySelectorAll(copilotAdapter.messageSelector)[0];
  const sources = document.createElement("div");
  sources.setAttribute("data-testid", "sources-button-testid");
  sources.setAttribute("role", "button");
  message.querySelector('[role="toolbar"]')!.append(sources);

  let clicks = 0;
  /** Replaces any open panel with `html`, wiring its Close button to remove it. */
  const showPanel = (html: string) => {
    document.querySelector("[data-test-panel-root]")?.remove();
    document.body.insertAdjacentHTML("beforeend", html);
    const root = document.querySelector("[data-test-panel-root]")!;
    root.querySelector('button[aria-label="Close"]')!.addEventListener("click", () => root.remove());
  };
  sources.addEventListener("click", () => {
    clicks++;
    if (panelHtml !== null) setTimeout(() => showPanel(panelHtml), openDelayMs);
  });
  if (openWith) showPanel(openWith);
  return { document, message, clickCount: () => clicks, panelOpen: () => document.querySelector('[data-testid="search-widget-drawer-test-id"]') !== null };
}

const EXPECTED_PANEL_REFERENCES = [
  { url: TERRENCE, title: "deploykit/docs/sandbox-setup.md at main · example-dev/deploykit", domain: "github.com", cited: true },
  { url: ISSUE, title: "[Bug]: Install fails in a sandbox · Issue #123 · deploykit/deploykit", domain: "github.com", cited: true },
  { url: null, title: "Installation | DeployKit Docs", domain: "deploykit.example", cited: false },
  { url: null, title: "Install Script Failed | DeployKit Docs", domain: "deploykit.example", cited: false },
  { url: null, title: "Set up the sandbox | Example Learn", domain: "learn.example.com", cited: false },
  { url: null, title: "Cannot start the sandbox - Example Q&A", domain: "learn.example.com", cited: false },
];

panelTiming.timeoutMs = 400;
panelTiming.pollMs = 20;

await checkAsync("panel: opens the panel, pairs same-domain citations by index, and closes it", async () => {
  const page = panelPage();
  assert.deepEqual(await copilotAdapter.readReferencesSlowly!(page.message), EXPECTED_PANEL_REFERENCES);
  assert.equal(page.clickCount(), 1);
  assert.equal(page.panelOpen(), false, "the panel the extension opened is closed again");
});

await checkAsync("panel: a panel showing another reply is switched and left open", async () => {
  const other = PANEL_HTML.replace(/github\.com/g, "example.org").replace(/example-dev/g, "someone-else");
  const page = panelPage({ openWith: other });
  assert.deepEqual(await copilotAdapter.readReferencesSlowly!(page.message), EXPECTED_PANEL_REFERENCES);
  assert.equal(page.clickCount(), 1);
  assert.equal(page.panelOpen(), true, "a panel the user had open stays open");
});

await checkAsync("panel: a panel already showing this reply is read without a click", async () => {
  const page = panelPage({ openWith: PANEL_HTML });
  assert.deepEqual(await copilotAdapter.readReferencesSlowly!(page.message), EXPECTED_PANEL_REFERENCES);
  assert.equal(page.clickCount(), 0);
});

await checkAsync("panel: null when the panel never appears, doesn't line up, or there's no Sources button", async () => {
  const never = panelPage({ panelHtml: null });
  assert.equal(await copilotAdapter.readReferencesSlowly!(never.message), null);
  const mismatched = panelPage({ chipUrls: ["https://docs.example.com/a", "https://docs.example.com/b"] });
  assert.equal(await copilotAdapter.readReferencesSlowly!(mismatched.message), null);
  assert.equal(mismatched.panelOpen(), false, "closed again even when reading fails");
  const noButton = panelPage();
  noButton.message.querySelector('[data-testid="sources-button-testid"]')!.remove();
  assert.equal(await copilotAdapter.readReferencesSlowly!(noButton.message), null);
});

await checkAsync("panel: More entries without URLs render as plain text", async () => {
  const page = panelPage();
  const references = await copilotAdapter.readReferencesSlowly!(page.message);
  const out = convertMessage(copilotAdapter, page.message, { style: "footnotes", includeMoreSources: true, isRuleEnabled: () => true, references });
  assert.ok(out.includes("[^1]: [deploykit/docs/sandbox-setup.md at main · example-dev/deploykit](" + TERRENCE + ") — github.com\n"));
  assert.ok(out.includes("- Cannot start the sandbox - Example Q&A — learn.example.com\n\n[^1]: "), "the More list comes before the footnote definitions");
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

check("settings: More sources defaults on only where the adapter can read sources, and survives a merge", () => {
  const withHook: SiteAdapter = { ...lookupAdapter, id: "with", readReferences: () => null };
  const without: SiteAdapter = { ...lookupAdapter, id: "without" };
  const defaults = buildDefaultSettings([withHook, without]);
  assert.equal(defaults.sites.with.includeMoreSources, true);
  assert.equal(defaults.sites.without.includeMoreSources, false);
  assert.equal(mergeSettings({ sites: { with: { includeMoreSources: false } } }, defaults).sites.with.includeMoreSources, false);
  assert.equal(mergeSettings({ sites: { with: { includeMoreSources: "no" } } }, defaults).sites.with.includeMoreSources, true);
});

// ---------------------------------------------------------------------------
// Controller: gathering sources for Copy as Markdown and the native override
// ---------------------------------------------------------------------------

const STUB_MORE = [ref("https://docs.photovault.example/backup", "Backup and Restore | PhotoVault Docs", false)];

/**
 * A controller on the Copilot fixture with stubbed source readers that record
 * their calls. `quick` is what the synchronous reader returns; the slow reader
 * resolves with STUB_MORE when `release()` is called.
 */
function stubbedController(quick: SourceReference[] | null, configure: (settings: Settings) => void = () => {}) {
  const document = new JSDOM(readFileSync("scratch/fixtures/copilot-message.html", "utf8")).window.document;
  const calls = { quick: 0, slow: 0 };
  let release: () => void = () => {};
  const adapter: SiteAdapter = {
    ...copilotAdapter,
    readReferences: () => (calls.quick++, quick),
    readReferencesSlowly: () => (calls.slow++, new Promise((resolve) => (release = () => resolve(STUB_MORE)))),
  };
  const settings = buildDefaultSettings([adapter]);
  configure(settings);
  const written: string[] = [];
  const controller = new ContentController(adapter, settings, { document, writeClipboard: async (text) => void written.push(text), requestFrame: (callback) => callback() });
  controller.start();
  const button = document.querySelector<HTMLButtonElement>(".acf-copy-button")!;
  return { document, calls, written, button, release: () => release() };
}

/** Lets pending timers and promise callbacks run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

await checkAsync("controller: a successful quick read skips the panel fallback", async () => {
  const page = stubbedController(STUB_MORE);
  page.button.click();
  await flush();
  assert.deepEqual(page.calls, { quick: 1, slow: 0 });
  assert.ok(page.written[0].includes("### More\n\n- [Backup and Restore | PhotoVault Docs]"));
});

await checkAsync("controller: Copy as Markdown waits for the fallback, ignoring clicks meanwhile", async () => {
  const page = stubbedController(null);
  page.button.click();
  await flush();
  assert.equal(page.button.getAttribute("aria-busy"), "true");
  assert.equal(page.button.disabled, true);
  page.button.disabled = false; // A click that slips through anyway must still be ignored.
  page.button.click();
  await flush();
  assert.equal(page.calls.slow, 1, "the second click didn't start another read");
  page.release();
  await flush();
  await flush();
  assert.equal(page.written.length, 1);
  assert.ok(page.written[0].includes("### More\n\n"));
  assert.equal(page.button.hasAttribute("aria-busy"), false);
});

await checkAsync("controller: no fallback when it couldn't add anything", async () => {
  const page = stubbedController(null, (settings) => (settings.sites.copilot.includeMoreSources = false));
  page.button.click();
  await flush();
  assert.equal(page.calls.slow, 0, "More sources off and no multi-source chips");
  assert.equal(page.written.length, 1);
});

await checkAsync("controller: the native override uses only the quick read", async () => {
  const page = stubbedController(null, (settings) => (settings.sites.copilot.overrideNativeCopy = true));
  page.document.querySelector<HTMLButtonElement>(copilotAdapter.nativeCopyButtonSelector)!.click();
  await flush();
  assert.deepEqual(page.calls, { quick: 1, slow: 0 });
  assert.equal(page.written.length, 1);
  assert.ok(!page.written[0].includes("### More"));
});

check("options: the Include More sources toggle shows and reports changes", () => {
  const { document } = new JSDOM("<!doctype html><body></body>").window;
  const changes: Settings[] = [];
  const form = renderOptions(document, SITE_ADAPTERS, (settings) => changes.push(settings));
  document.body.append(form.root);
  form.fill(buildDefaultSettings(SITE_ADAPTERS));
  const toggle = document.querySelector<HTMLInputElement>('input[name="copilot.includeMoreSources"]')!;
  assert.equal(toggle.checked, true);
  toggle.checked = false;
  toggle.dispatchEvent(new document.defaultView!.Event("change"));
  assert.equal(changes.at(-1)!.sites.copilot.includeMoreSources, false);
});

// ---------------------------------------------------------------------------
// Copilot adapter: the page's load-time data
// ---------------------------------------------------------------------------

const PAGE_DATA_HTML = readFileSync("scratch/fixtures/copilot-page-data.html", "utf8");

/** The Copilot fixture page with the load-time data script added (or `scriptHtml` in its place). */
function pageWithData(scriptHtml: string | null = PAGE_DATA_HTML) {
  const document = new JSDOM(readFileSync("scratch/fixtures/copilot-message.html", "utf8") + (scriptHtml ?? "")).window.document;
  return { document, message: document.querySelectorAll(copilotAdapter.messageSelector)[0] };
}

check("page data: reads the reply's sources with titles, URLs and cited flags", () => {
  assert.deepEqual(readPageDataReferences(pageWithData().message), [
    { url: "https://widget.example/releases/5.0.0", title: "Widget — Widget 5.0.0 (Current)", domain: "widget.example", cited: true },
    { url: "https://docs.widget.example/api/path-matcher", title: "PathMatcher - API Reference | Widget Docs", domain: "docs.widget.example", cited: true },
    { url: "https://learn.example.com/sandbox/install", title: "Set up the sandbox | Example Learn", domain: "learn.example.com", cited: false },
    { url: "https://www.example-blog.com/photovault", title: "PhotoVault Backups · Example Blog", domain: "example-blog.com", cited: false },
  ]);
});

check("page data: null for an unknown reply, no script or a broken literal; bad content means an empty title", () => {
  const unknown = pageWithData();
  unknown.message.querySelector('[data-testid="markdown-reply"]')!.setAttribute("data-message-id", "not-in-the-data");
  assert.equal(readPageDataReferences(unknown.message), null);
  assert.equal(readPageDataReferences(pageWithData(null).message), null);
  assert.equal(readPageDataReferences(pageWithData('<script>window.__staticRouterHydrationData = JSON.parse("{broken");</script>').message), null);
  const data = {
    loaderData: {
      "chat-history": {
        store: {
          rawConversationResponse: {
            messages: [{ messageId: "11111111-2222-4333-8444-555555555555", references: { "uncite-1": { targetLink: "https://a.example/x", displayData: { content: "{not json" }, isCitedInResponse: false } } }],
          },
        },
      },
    },
  };
  const badContent = `<script>window.__staticRouterHydrationData = JSON.parse(${JSON.stringify(JSON.stringify(data))});</script>`;
  assert.deepEqual(readPageDataReferences(pageWithData(badContent).message), [{ url: "https://a.example/x", title: "", domain: "a.example", cited: false }]);
});

await checkAsync("page data: with no page script, Copy as Markdown gets linked More sources and never opens the panel", async () => {
  const { document } = pageWithData();
  let panelReads = 0;
  const adapter: SiteAdapter = { ...copilotAdapter, readReferencesSlowly: async () => (panelReads++, null) };
  const written: string[] = [];
  const controller = new ContentController(adapter, buildDefaultSettings([adapter]), { document, writeClipboard: async (text) => void written.push(text), requestFrame: (callback) => callback() });
  controller.start();
  document.querySelector<HTMLButtonElement>(".acf-copy-button")!.click();
  await flush();
  assert.equal(panelReads, 0);
  assert.ok(written[0].includes("1. [Widget — Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0) — widget.example ^c-"));
  assert.ok(
    written[0].includes(
      "### More\n\n- [Set up the sandbox | Example Learn](https://learn.example.com/sandbox/install) — learn.example.com\n- [PhotoVault Backups · Example Blog](https://www.example-blog.com/photovault) — example-blog.com",
    ),
  );
});

// ---------------------------------------------------------------------------
// Built manifest (npm test builds dist/ first)
// ---------------------------------------------------------------------------

check("manifest: Copilot's page script runs in the page world on Copilot's pages", () => {
  const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
  const [isolated, page] = manifest.content_scripts;
  assert.deepEqual(isolated.js, ["content.js"]);
  assert.equal(isolated.world, undefined, "the main content script stays isolated");
  assert.deepEqual(page, { matches: copilotAdapter.matches, js: ["page-copilot.js"], run_at: "document_idle", world: "MAIN" });
  assert.ok(readFileSync("dist/page-copilot.js", "utf8").includes(REFERENCES_EVENT));
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
