/**
 * Regression checks for the AI Chat Formatter extension (spec/ai-chat-formatter).
 * Run with `npm test`: esbuild bundles this file for Node and runs it. Each
 * check prints PASS or FAIL, and the process exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { CitationCollector, normalizeCitationUrl, parseCitationTitle, renderCitations } from "../src/core/citations";
import { convertMessage, type ConversionOptions } from "../src/core/convert";
import { collapseBlankLinesRule, invisibleCharactersRule, runRules } from "../src/core/rules";
import { ContentController } from "../src/content/controller";
import { renderOptions } from "../src/options/options";
import { buildDefaultSettings, mergeSettings, type Settings } from "../src/core/settings";
import { ConversionError, type Citation, type CitationStyle, type SiteAdapter } from "../src/core/types";
import { copilotAdapter, copilotLanguageId } from "../src/sites/copilot";
import { findAdapterForUrl, matchPatternToRegExp, SITE_ADAPTERS } from "../src/sites/index";

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
// Citations
// ---------------------------------------------------------------------------

const widgetRelease: Citation = {
  url: "https://widget.example/releases/5.0.0",
  title: "Widget 5.0.0 (Current)",
  sourceName: "widget.example",
};
const wdocs: Citation = { url: "https://docs.widget.example/api/path-matcher", title: "PathMatcher - API Reference | Widget Docs", sourceName: "docs.widget.example" };

check("citations: repeat citations of one page share a number", () => {
  const collector = new CitationCollector();
  const a = collector.register(widgetRelease);
  const b = collector.register(wdocs);
  const c = collector.register({ ...widgetRelease, url: widgetRelease.url + "/#notable-changes" });
  assert.equal(a, c);
  assert.notEqual(a, b);
  assert.equal(collector.citations.length, 2);
});

check("citations: URL normalization drops fragment and trailing slash only", () => {
  assert.equal(normalizeCitationUrl("https://Example.com/a/#x"), "https://example.com/a");
  assert.equal(normalizeCitationUrl("https://example.com/a?q=1"), "https://example.com/a?q=1");
  assert.equal(normalizeCitationUrl("not a url "), "not a url");
});

check("citations: footnotes attach to text and collapse adjacent repeats", () => {
  const collector = new CitationCollector();
  const p1 = collector.register(widgetRelease);
  const p2 = collector.register(wdocs);
  const md = `Widget 5 was released. ${p1} ${p1}\n\n- PathMatcher is global ${p2}\n- wpm 4 ${p1}`;
  assert.equal(
    renderCitations(md, collector.citations, "footnotes"),
    "Widget 5 was released.[^1]\n\n- PathMatcher is global[^2]\n- wpm 4[^1]\n\n" +
      "## Sources\n\n### Citations\n\n" +
      "[^1]: [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0) — widget.example\n" +
      "[^2]: [PathMatcher - API Reference | Widget Docs](https://docs.widget.example/api/path-matcher) — docs.widget.example",
  );
});

check("citations: inline links plus Sources list", () => {
  const collector = new CitationCollector();
  const p1 = collector.register(widgetRelease);
  assert.equal(
    renderCitations(`Released. ${p1}`, collector.citations, "inline-links-and-sources"),
    "Released.[1](https://widget.example/releases/5.0.0)\n\n## Sources\n\n### Citations\n\n1. [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0) — widget.example",
  );
});

check("citations: Sources list only removes inline markers", () => {
  const collector = new CitationCollector();
  const p1 = collector.register(widgetRelease);
  assert.equal(
    renderCitations(`Released. ${p1}`, collector.citations, "sources-only"),
    "Released.\n\n## Sources\n\n### Citations\n\n1. [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0) — widget.example",
  );
});

check("citations: no citations leaves the Markdown unchanged", () => {
  assert.equal(renderCitations("Plain *reply*.", [], "footnotes"), "Plain *reply*.");
});

check("citations: titles and URLs that would break a link are escaped", () => {
  const collector = new CitationCollector();
  const p = collector.register({ url: "https://example.com/a (b)", title: "Tips [2026]", sourceName: "example.com" });
  assert.equal(renderCitations(p, collector.citations, "footnotes"), "[^1]\n\n## Sources\n\n### Citations\n\n[^1]: [Tips \\[2026\\]](https://example.com/a%20%28b%29) — example.com");
});

check("citations: title comes from the last aria-label segment, then name, then host", () => {
  assert.equal(parseCitationTitle("Citation: widget — Widget — Widget 5.0.0 (Current)", "widget.example", widgetRelease.url), "Widget 5.0.0 (Current)");
  assert.equal(parseCitationTitle("Citation: widget", "widget.example", widgetRelease.url), "widget.example");
  assert.equal(parseCitationTitle(null, "", "https://www.example.com/x"), "example.com");
});

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

check("rules: invisible characters are normalized, emoji joiners kept", () => {
  const family = "👨\u200D👩\u200D👧";
  assert.equal(invisibleCharactersRule.apply(`a\u00A0b\u202Fc\u200Bd\u200Ce\u2060f\uFEFFg x\u200Dy ${family}`), `a b cdefg xy ${family}`);
});

check("rules: blank-line runs collapse outside fences but not inside", () => {
  const input = "\n\nOne\n\n\n\nTwo\n```\ncode\n\n\n\nmore\n```\n\n\nThree\n\n";
  assert.equal(collapseBlankLinesRule.apply(input), "One\n\nTwo\n```\ncode\n\n\n\nmore\n```\n\nThree");
});

check("rules: a longer closing fence and tilde fences are respected", () => {
  const input = "````md\n```\n\n\ninner\n````\n\n\n~~~\n\n\n~~~";
  assert.equal(collapseBlankLinesRule.apply(input), "````md\n```\n\n\ninner\n````\n\n~~~\n\n\n~~~");
});

check("rules: runRules skips a disabled rule and keeps order", () => {
  const upper = { id: "upper", name: "", description: "", defaultEnabled: true, apply: (s: string) => s.toUpperCase() };
  const bang = { id: "bang", name: "", description: "", defaultEnabled: true, apply: (s: string) => s + "!" };
  assert.equal(runRules("hi", [upper, bang], () => true), "HI!");
  assert.equal(runRules("hi", [upper, bang], (id) => id !== "upper"), "hi!");
});

// ---------------------------------------------------------------------------
// Converter (generic, with a minimal test adapter)
// ---------------------------------------------------------------------------

/** Parses `html` into a detached element using jsdom, standing in for the live page. */
function element(html: string): HTMLElement {
  const { document } = new JSDOM(`<!doctype html><body>${html}</body>`).window;
  return document.body.firstElementChild as HTMLElement;
}

/** Conversion options for `style` with every rule on and no source list, as 0.1.0 converted. */
function options(style: CitationStyle): ConversionOptions {
  return { style, includeMoreSources: true, isRuleEnabled: () => true, references: null };
}

/** A bare adapter: `.reply` is the body, `.chip[data-url]` is a citation, `.chrome` is stripped. */
const testAdapter: SiteAdapter = {
  id: "test",
  name: "Test",
  matches: ["https://chat.example/*"],
  messageSelector: ".message",
  contentSelector: ".reply",
  nativeCopyButtonSelector: ".copy",
  findButtonAnchor: () => null,
  stripSelectors: [".chrome"],
  turndownRules: (context) => ({
    chip: {
      filter: (node) => node.classList.contains("chip"),
      replacement: (_content, node) =>
        context.registerCitation({ url: node.getAttribute("data-url")!, title: node.getAttribute("data-title")!, sourceName: "" }),
    },
  }),
  rules: [invisibleCharactersRule, collapseBlankLinesRule],
};

check("convert: compact list markers, nested lists, headings and strip selectors", () => {
  const message = element(
    `<div class="message"><div class="reply"><h3>Key features</h3><span class="chrome">Copy</span>` +
      `<ol><li>Engine<ul><li>HalfFloatBuffer</li><li><code>Pattern.escape()</code></li></ul></li><li>wpm 4</li></ol></div></div>`,
  );
  assert.equal(
    convertMessage(testAdapter, message, options("footnotes")),
    "### Key features\n\n1. Engine\n   - HalfFloatBuffer\n   - `Pattern.escape()`\n2. wpm 4",
  );
});

check("convert: site citation rule feeds the chosen citation style", () => {
  const message = element(
    `<div class="message"><div class="reply"><p>Released in May.\u00A0<span class="chip" data-url="https://widget.example/x" data-title="Release\u00A0notes">widget</span></p></div></div>`,
  );
  assert.equal(convertMessage(testAdapter, message, options("footnotes")), "Released in May.[^1]\n\n## Sources\n\n### Citations\n\n[^1]: [Release notes](https://widget.example/x) — widget.example");
});

check("convert: KaTeX inline and display math use $ and $$", () => {
  const tex = (source: string) => `<span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">${source}</annotation></semantics></math></span><span class="katex-html">rendered</span></span>`;
  const message = element(
    `<div class="message"><div class="reply"><p>Energy ${tex("E = mc^2")} holds.</p><span class="katex-display">${tex("\\int_0^1 x\\,dx")}</span></div></div>`,
  );
  assert.equal(convertMessage(testAdapter, message, options("footnotes")), "Energy $E = mc^2$ holds.\n\n$$\n\\int_0^1 x\\,dx\n$$");
});

check("convert: a message without a reply body throws ConversionError", () => {
  assert.throws(() => convertMessage(testAdapter, element(`<div class="message"></div>`), options("footnotes")), ConversionError);
});

// ---------------------------------------------------------------------------
// Copilot adapter, against a fixture modeled on copilot.com's markup
// ---------------------------------------------------------------------------

/** A fresh copy of the Copilot fixture document, so checks that edit it don't affect each other. */
function copilotPage(): Document {
  return new JSDOM(readFileSync("scratch/fixtures/copilot-message.html", "utf8")).window.document;
}

/** The fixture's assistant reply, the one message the adapter should select. */
function copilotReply(page = copilotPage()): Element {
  const messages = page.querySelectorAll(copilotAdapter.messageSelector);
  assert.equal(messages.length, 1, "only the assistant reply is a message, not the user prompt");
  return messages[0];
}

const COPILOT_EXPECTED_BODY = [
  '**Widget 5** was released on **March 3, 2026** as the new "Current" release. The main changes include:[^1]',
  "",
  "### Key New Features in Widget 5",
  "",
  "1. **Render Engine 3.2**",
  "   - Upgraded to Render Engine 3.2.",
  "   - Includes support for:",
  "     - `HalfFloatBuffer`",
  "     - Scoped Resources",
  "     - `Widget.isWidget()`[^1]",
  "2. **PathMatcher Is Now Global**",
  "   - Available without importing a module.[^2][^1]",
  "",
  "---",
  "",
  "### Official Release Notes",
  "",
  "- [Widget 5.0.0 (Current) Release Notes](https://widget.example/releases/5.0.0)",
  "",
  "### Example ASCII Directory Tree",
  "",
  "```",
  "my-widget-app/",
  "├── package.json",
  "├── src/",
  "│   ├── index.js",
  "│   └── routes/",
  "│       └── users.js",
  "└── test/",
  "    └── users.test.js",
  "```",
  "",
  "And a script:",
  "",
  "```python",
  "def fence():",
  '    return "```"',
  "",
  "print(fence())",
  "```",
  "",
  "For most developers, the headline items are the **Render Engine 3.2 upgrade** and **global PathMatcher**.[^1]",
].join("\n");

check("copilot: the fixture converts to the expected Markdown with footnotes", () => {
  assert.equal(
    convertMessage(copilotAdapter, copilotReply(), options("footnotes")),
    COPILOT_EXPECTED_BODY +
      "\n\n## Sources\n\n### Citations\n\n[^1]: [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0) — widget.example" +
      "\n[^2]: [PathMatcher - API Reference | Widget Docs](https://docs.widget.example/api/path-matcher) — docs.widget.example",
  );
});

check("copilot: no page chrome or chip labels leak into the output", () => {
  // Only the reply body: the Sources list legitimately names domains like "widget.example".
  const markdown = convertMessage(copilotAdapter, copilotReply(), options("sources-only")).split("\n\n## Sources")[0];
  for (const leak of ["Plain Text", "Python\n", "Copy code", "Copy Response", " widget", " wdocs", "[[", "](<"]) {
    assert.ok(!markdown.includes(leak), `output contains ${JSON.stringify(leak)}`);
  }
});

check("copilot: the original page is left untouched", () => {
  const page = copilotPage();
  const before = page.body.innerHTML;
  convertMessage(copilotAdapter, copilotReply(page), options("footnotes"));
  assert.equal(page.body.innerHTML, before);
});

check("copilot: a code block missing a line throws instead of truncating", () => {
  const page = copilotPage();
  page.querySelector('[data-line-index="3"]')!.remove();
  assert.throws(() => convertMessage(copilotAdapter, copilotReply(page), options("footnotes")), ConversionError);
});

check("copilot: unreadable chip JSON keeps the chip text; multi-source chips register every source", () => {
  const page = copilotPage();
  const chips = page.querySelectorAll("button[data-grouped-citations]");
  chips[0].setAttribute("data-grouped-citations", "{not json");
  chips[1].setAttribute(
    "data-grouped-citations",
    JSON.stringify([
      { url: "https://a.example/1", name: "a.example" },
      { url: "https://b.example/2", name: "b.example" },
    ]),
  );
  const markdown = convertMessage(copilotAdapter, copilotReply(page), options("footnotes"));
  assert.ok(markdown.includes("The main changes include: widget\n"), "the unreadable chip keeps its text");
  assert.ok(markdown.includes("`Widget.isWidget()`[^1][^2]"), "both grouped sources are cited");
  assert.ok(markdown.includes("[^1]: [a.example](https://a.example/1)\n[^2]: [b.example](https://b.example/2)"), "grouped sources use their names");
});

check("copilot: code viewer labels map to fence languages", () => {
  assert.equal(copilotLanguageId("Plain Text"), "");
  assert.equal(copilotLanguageId("Python"), "python");
  assert.equal(copilotLanguageId("C#"), "csharp");
  assert.equal(copilotLanguageId("C++"), "cpp");
  assert.equal(copilotLanguageId("Shell"), "bash");
  assert.equal(copilotLanguageId("Visual Basic"), "visualbasic");
  assert.equal(copilotLanguageId(undefined), "");
});

check("copilot: the injected button anchors right after the native Copy button", () => {
  const reply = copilotReply();
  const anchor = copilotAdapter.findButtonAnchor(reply)!;
  const nativeCopy = reply.querySelector(copilotAdapter.nativeCopyButtonSelector)!;
  assert.ok(nativeCopy, "the native Copy button is found");
  assert.equal(anchor.parent, nativeCopy.parentElement);
  assert.equal(anchor.before, nativeCopy.nextSibling);
});

// ---------------------------------------------------------------------------
// Site registry
// ---------------------------------------------------------------------------

check("registry: Copilot URLs match and others don't", () => {
  for (const url of [
    "https://copilot.microsoft.com/",
    "https://copilot.microsoft.com/chats/abc",
    "https://copilot.com/chat/conversation/00000000-0000-4000-8000-000000000abc",
    "https://copilot.com/chat?fromcode=x&sessionId=y",
    "https://COPILOT.com/chat#top",
  ]) {
    assert.equal(findAdapterForUrl(url)?.id, "copilot", url);
  }
  for (const url of ["https://example.com/", "https://m365.cloud.microsoft/chat", "https://notcopilot.com/", "http://copilot.com/", "", "not a url"]) {
    assert.equal(findAdapterForUrl(url), undefined, url);
  }
});

check("registry: match patterns follow Chrome's rules", () => {
  assert.ok(matchPatternToRegExp("*://*.example.com/docs/*").test("http://example.com/docs/a"));
  assert.ok(matchPatternToRegExp("*://*.example.com/docs/*").test("https://a.b.example.com:8443/docs/"));
  assert.ok(!matchPatternToRegExp("*://*.example.com/docs/*").test("https://example.com/blog/"));
  assert.ok(matchPatternToRegExp("<all_urls>").test("file:///C:/x"));
  assert.throws(() => matchPatternToRegExp("copilot.com/*"));
});

check("registry: every adapter has a unique id and valid match patterns", () => {
  const ids = SITE_ADAPTERS.map((adapter) => adapter.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const adapter of SITE_ADAPTERS) {
    assert.ok(adapter.matches.length > 0, adapter.id);
    adapter.matches.forEach((pattern) => matchPatternToRegExp(pattern));
  }
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

check("settings: defaults come from each adapter and its rules", () => {
  const defaults = buildDefaultSettings([testAdapter]);
  assert.deepEqual(defaults, {
    enabled: true,
    citationStyle: "footnotes",
    sites: { test: { enabled: true, showCopyButton: true, overrideNativeCopy: false, includeMoreSources: false, rules: { "invisible-characters": true, "collapse-blank-lines": true } } },
  });
});

check("settings: merge keeps stored values and fills in what's missing or invalid", () => {
  const defaults = buildDefaultSettings([testAdapter]);
  const merged = mergeSettings(
    { enabled: false, citationStyle: "bogus", sites: { test: { overrideNativeCopy: true, showCopyButton: "yes", rules: { "collapse-blank-lines": false } }, gone: { enabled: true } } },
    defaults,
  );
  assert.deepEqual(merged, {
    enabled: false,
    citationStyle: "footnotes",
    sites: { test: { enabled: true, showCopyButton: true, overrideNativeCopy: true, includeMoreSources: false, rules: { "invisible-characters": true, "collapse-blank-lines": false } } },
  });
  assert.deepEqual(mergeSettings(undefined, defaults), defaults);
  assert.equal(mergeSettings({ citationStyle: "sources-only" }, defaults).citationStyle, "sources-only");
});

// ---------------------------------------------------------------------------
// Content controller (button injection and native Copy override)
// ---------------------------------------------------------------------------

/** A controller on a fresh fixture page, recording clipboard writes and clicks that reach the "site". */
function controllerOnFixture(configure: (settings: Settings) => void = () => {}) {
  const dom = new JSDOM(readFileSync("scratch/fixtures/copilot-message.html", "utf8"));
  const document = dom.window.document;
  const written: string[] = [];
  const siteClicks: string[] = [];
  // Stands in for Copilot's own handler, which React attaches at its root element.
  document.querySelector("main")!.addEventListener("click", () => siteClicks.push("native copy ran"));
  const settings = buildDefaultSettings(SITE_ADAPTERS);
  configure(settings);
  const controller = new ContentController(copilotAdapter, settings, {
    document,
    writeClipboard: async (text) => void written.push(text),
    requestFrame: (callback) => callback(),
  });
  controller.start();
  return { document, controller, settings, written, siteClicks };
}

/** Lets pending promise callbacks (the clipboard write) run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Runs an async check, recording its result like {@link check}. */
async function checkAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name });
  } catch (error) {
    results.push({ name, error });
  }
}

check("controller: one button per finished reply, placed after the native Copy button", () => {
  const { document, controller } = controllerOnFixture();
  controller.sync();
  const buttons = document.querySelectorAll(".acf-copy-button");
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].previousElementSibling?.getAttribute("data-testid"), "CopyButtonTestId");
  assert.equal(buttons[0].nextElementSibling?.tagName, "SECTION", "the feedback buttons follow");
  assert.equal(buttons[0].getAttribute("aria-label"), "Copy as Markdown");
});

check("controller: a reply without a toolbar yet gets its button once the toolbar appears", () => {
  const { document, controller } = controllerOnFixture();
  const toolbar = document.querySelector('[role="toolbar"]')!;
  const parent = toolbar.parentElement!;
  toolbar.remove();
  document.querySelectorAll(".acf-copy-button").forEach((button) => button.remove());
  controller.sync();
  assert.equal(document.querySelectorAll(".acf-copy-button").length, 0);
  parent.appendChild(toolbar);
  controller.sync();
  assert.equal(document.querySelectorAll(".acf-copy-button").length, 1);
});

check("controller: turning the button setting off removes buttons, and on restores them", () => {
  const { document, controller, settings } = controllerOnFixture();
  controller.applySettings({ ...settings, sites: { copilot: { ...settings.sites.copilot, showCopyButton: false } } });
  assert.equal(document.querySelectorAll(".acf-copy-button").length, 0);
  controller.applySettings(settings);
  assert.equal(document.querySelectorAll(".acf-copy-button").length, 1);
  controller.applySettings({ ...settings, enabled: false });
  assert.equal(document.querySelectorAll(".acf-copy-button").length, 0);
});

await checkAsync("controller: Copy as Markdown writes the converted reply and doesn't reach the site", async () => {
  const { document, written, siteClicks } = controllerOnFixture();
  (document.querySelector(".acf-copy-button") as HTMLButtonElement).click();
  await flush();
  assert.equal(written.length, 1);
  assert.ok(written[0].startsWith("**Widget 5** was released"));
  assert.ok(written[0].endsWith("(https://docs.widget.example/api/path-matcher) — docs.widget.example"));
  assert.deepEqual(siteClicks, []);
  assert.equal(document.querySelector(".acf-copy-button")!.getAttribute("aria-label"), "Copied as Markdown");
});

await checkAsync("controller: a reply that can't be converted shows a toast and copies nothing", async () => {
  const { document, written } = controllerOnFixture();
  document.querySelector('[data-line-index="2"]')!.remove();
  (document.querySelector(".acf-copy-button") as HTMLButtonElement).click();
  await flush();
  assert.deepEqual(written, []);
  assert.match(document.querySelector(".acf-toast")?.textContent ?? "", /isn't fully loaded/);
});

await checkAsync("controller: native Copy is left alone while the override is off", async () => {
  const { document, written, siteClicks } = controllerOnFixture();
  (document.querySelector(copilotAdapter.nativeCopyButtonSelector) as HTMLButtonElement).click();
  await flush();
  assert.deepEqual(written, []);
  assert.deepEqual(siteClicks, ["native copy ran"]);
});

await checkAsync("controller: with the override on, native Copy writes the Markdown instead", async () => {
  const { document, written, siteClicks } = controllerOnFixture((settings) => (settings.sites.copilot.overrideNativeCopy = true));
  (document.querySelector(copilotAdapter.nativeCopyButtonSelector) as HTMLButtonElement).click();
  await flush();
  assert.equal(written.length, 1);
  assert.ok(written[0].includes("[^1]: [Widget 5.0.0 (Current)]"));
  assert.deepEqual(siteClicks, []);
});

await checkAsync("controller: with the override on, a failed conversion falls back to the native copy", async () => {
  const { document, written, siteClicks } = controllerOnFixture((settings) => (settings.sites.copilot.overrideNativeCopy = true));
  document.querySelector('[data-line-index="2"]')!.remove();
  const warn = console.warn;
  console.warn = () => {};
  try {
    (document.querySelector(copilotAdapter.nativeCopyButtonSelector) as HTMLButtonElement).click();
  } finally {
    console.warn = warn;
  }
  await flush();
  assert.deepEqual(written, []);
  assert.deepEqual(siteClicks, ["native copy ran"]);
});

// ---------------------------------------------------------------------------
// Options page
// ---------------------------------------------------------------------------

check("options: the form shows the settings and reports each change as a full settings object", () => {
  const { document } = new JSDOM("<!doctype html><body></body>").window;
  const changes: Settings[] = [];
  const form = renderOptions(document, SITE_ADAPTERS, (settings) => changes.push(settings));
  document.body.append(form.root);
  form.fill(buildDefaultSettings(SITE_ADAPTERS));

  const input = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  assert.equal(input("enabled").checked, true);
  assert.equal(document.querySelector<HTMLInputElement>('input[name="citationStyle"]:checked')!.value, "footnotes");
  assert.equal(input("copilot.showCopyButton").checked, true);
  assert.equal(input("copilot.overrideNativeCopy").checked, false);
  assert.equal(input("copilot.rules.collapse-blank-lines").checked, true);
  assert.match(document.querySelector('section[data-site="copilot"] .hosts')!.textContent!, /copilot\.microsoft\.com, copilot\.com/);

  const toggle = (element: HTMLInputElement) => {
    element.checked = !element.checked;
    element.dispatchEvent(new document.defaultView!.Event("change"));
  };
  toggle(input("copilot.overrideNativeCopy"));
  document.querySelector<HTMLInputElement>('input[value="sources-only"]')!.checked = true;
  document.querySelector<HTMLInputElement>('input[value="sources-only"]')!.dispatchEvent(new document.defaultView!.Event("change"));
  toggle(input("copilot.rules.invisible-characters"));
  toggle(input("copilot.enabled"));

  const last = changes[changes.length - 1];
  assert.equal(changes.length, 4);
  assert.equal(last.citationStyle, "sources-only");
  assert.equal(last.sites.copilot.overrideNativeCopy, true);
  assert.equal(last.sites.copilot.rules["invisible-characters"], false);
  assert.equal(last.sites.copilot.enabled, false);
  assert.equal(document.querySelector<HTMLFieldSetElement>('section[data-site="copilot"] fieldset.site')!.disabled, true, "site details grey out when the site is off");
});

// ---------------------------------------------------------------------------
// Built manifest (npm test builds dist/ first)
// ---------------------------------------------------------------------------

check("manifest: dist/manifest.json carries the version, every adapter's matches and the bundles", () => {
  const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, version);
  assert.deepEqual(manifest.content_scripts[0].matches, SITE_ADAPTERS.flatMap((adapter) => adapter.matches));
  assert.deepEqual(manifest.content_scripts[0].js, ["content.js"]);
  assert.deepEqual(manifest.content_scripts[0].css, ["content.css"]);
  assert.equal(manifest.options_ui.page, "options.html");
  for (const file of ["content.js", "content.css", "options.js", "options.html"]) {
    assert.ok(readFileSync(`dist/${file}`).length > 0, `dist/${file} is empty`);
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
