import type TurndownService from "turndown";
import { parseCitationTitle, parseReferencesAttribute, sourceDomain } from "../core/citations";
import { REFERENCES_ATTRIBUTE, REFERENCES_EVENT } from "../core/references-protocol";
import { collapseBlankLinesRule, invisibleCharactersRule } from "../core/rules";
import { ConversionError, type ConversionContext, type SiteAdapter, type SourceReference } from "../core/types";

// Re-exported for the Copilot tests, which import it from this module.
export { parseReferencesAttribute };

/*
 * Microsoft Copilot (consumer). Every selector here comes from copilot.com's
 * rendered page as inspected on 2026-10-24; none of it is a documented API.
 * When Copilot changes its markup, this is the file to update.
 */

/** The reply body inside each assistant message. */
const REPLY_SELECTOR = '[data-testid="markdown-reply"]';

/** Copilot's code viewer labels, mapped to fence info strings where the label isn't already one. */
const LANGUAGE_IDS: Record<string, string> = {
  "plain text": "",
  plaintext: "",
  text: "",
  "c#": "csharp",
  "c++": "cpp",
  "f#": "fsharp",
  shell: "bash",
  "objective-c": "objectivec",
};

/** The fence info string for a code viewer label such as "Python" or "Plain Text"; empty means no language. */
export function copilotLanguageId(label: string | null | undefined): string {
  const key = (label ?? "").trim().toLowerCase();
  return key in LANGUAGE_IDS ? LANGUAGE_IDS[key] : key.replace(/\s+/g, "");
}

/**
 * Replaces each of Copilot's code viewers in `root` with a plain
 * `<pre><code class="language-…">`. The viewer is not a `<pre>`: it renders
 * one `[data-line-index]` div per line beside a separate line-number gutter,
 * so its text has to be reassembled line by line.
 *
 * The viewer is marked as virtualized, so a long block may not have every line
 * in the page. Rather than copy a block with lines silently missing, this
 * throws when the line indices aren't continuous from 0 or don't match the
 * gutter's line count.
 */
function rewriteCodeBlocks(root: HTMLElement): void {
  const document = root.ownerDocument;
  for (const block of Array.from(root.querySelectorAll<HTMLElement>(".scriptor-component-code-block"))) {
    const lines = Array.from(block.querySelectorAll<HTMLElement>("[data-line-index]"))
      .map((line) => ({ index: Number(line.getAttribute("data-line-index")), text: line.textContent ?? "" }))
      .sort((a, b) => a.index - b.index);
    const gutterCount = block.querySelectorAll("[data-line-number]").length;
    const continuous = lines.every((line, i) => line.index === i);
    if (lines.length === 0 || !continuous || (gutterCount > 0 && gutterCount !== lines.length)) {
      throw new ConversionError(
        "A code block in this reply isn't fully loaded, so it can't be copied completely. Scroll through the code block, then try again, or use Copilot's own Copy button.",
      );
    }

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    const language = copilotLanguageId(block.querySelector('[data-testid="one-copilot-code-identity"] span')?.textContent);
    if (language) code.className = `language-${language}`;
    code.textContent = lines.map((line) => line.text).join("\n");
    pre.appendChild(code);
    block.replaceWith(pre);
  }
}

/** One entry of a citation chip's `data-grouped-citations` JSON. */
interface GroupedCitation {
  url?: unknown;
  name?: unknown;
}

/**
 * Turndown rule for Copilot's citation chips: `<button data-grouped-citations>`
 * holding a JSON array of the sources the chip stands for. Each source is
 * registered and replaced by its placeholder. Its title comes from the reply's
 * source list when the caller read one. Otherwise the chip's `aria-label`
 * names the page title, but only for a chip with a single source; a chip
 * grouping several ("photovault+1", labeled "PhotoVault plus 1 more") falls back to
 * each source's name. A chip whose JSON can't be read keeps its visible text
 * rather than failing the whole copy.
 */
function citationChipRule(context: ConversionContext): TurndownService.Rule {
  return {
    filter: (node) => node.nodeName === "BUTTON" && node.hasAttribute("data-grouped-citations"),
    replacement: (content, node) => {
      let group: GroupedCitation[];
      try {
        const parsed: unknown = JSON.parse(node.getAttribute("data-grouped-citations") ?? "");
        group = Array.isArray(parsed) ? parsed : [];
      } catch {
        return content;
      }
      const sources = group.filter((entry): entry is { url: string; name?: unknown } => typeof entry?.url === "string" && /^https?:\/\//.test(entry.url));
      if (sources.length === 0) return content;
      const label = sources.length === 1 ? node.getAttribute("aria-label") : null;
      return sources
        .map((source) => {
          const name = typeof source.name === "string" ? source.name : "";
          const title = context.findReference(source.url)?.title.trim() || parseCitationTitle(label, name, source.url);
          return context.registerCitation({ url: source.url, title, sourceName: name });
        })
        .join("");
    },
  };
}

/**
 * Asks the page script (src/page/copilot.ts) for `message`'s source list.
 * Synchronous: the page script answers while the event is being dispatched.
 * Returns null when the page script isn't there or found nothing.
 */
function readCopilotReferences(message: Element): SourceReference[] | null {
  const reply = message.matches(REPLY_SELECTOR) ? message : message.querySelector(REPLY_SELECTOR);
  if (!reply) return null;
  reply.removeAttribute(REFERENCES_ATTRIBUTE);
  reply.dispatchEvent(new (reply.ownerDocument.defaultView ?? window).CustomEvent(REFERENCES_EVENT, { bubbles: true }));
  const json = reply.getAttribute(REFERENCES_ATTRIBUTE);
  reply.removeAttribute(REFERENCES_ATTRIBUTE);
  return parseReferencesAttribute(json);
}

/*
 * Load-time data. Copilot embeds the conversation it loaded with the page in
 * a script, `window.__staticRouterHydrationData = JSON.parse("…")`. Its text
 * is ordinary page content, so the isolated content script can read it
 * without React. Under
 * `loaderData["chat-history"].store.rawConversationResponse.messages`, each
 * message has the `messageId` its reply element carries as
 * `data-message-id`, and a `references` map: cited sources keyed by the
 * chips' own index, uncited ones `uncite-…`, each with `targetLink`,
 * `isCitedInResponse` and `displayData.content`, a JSON string holding the
 * page title. It only covers replies that existed when the page loaded.
 */

const PAGE_DATA_MARKER = "window.__staticRouterHydrationData = JSON.parse(";

/**
 * The string literal passed to `JSON.parse` in the page-data script, quotes
 * included, or null when it isn't there. A character scan rather than a regex,
 * since the script runs to hundreds of kilobytes.
 */
function pageDataLiteral(text: string): string | null {
  const start = text.indexOf(PAGE_DATA_MARKER) + PAGE_DATA_MARKER.length;
  if (start < PAGE_DATA_MARKER.length || text[start] !== '"') return null;
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === '"') return text.slice(start, i + 1);
  }
  return null;
}

/** Parsed page data per script element; the data is large and doesn't change while the page is open. */
const pageDataCache = new WeakMap<Element, unknown>();

/** The page's load-time data, parsed once per script, or null when the page has none or it can't be read. */
function pageData(document: Document): unknown {
  const script = Array.from(document.scripts).find((element) => element.textContent?.includes(PAGE_DATA_MARKER));
  if (!script) return null;
  if (!pageDataCache.has(script)) {
    let parsed: unknown = null;
    try {
      const literal = pageDataLiteral(script.textContent ?? "");
      // The literal is a JSON string whose value is the JSON text of the data, so it takes two parses.
      if (literal) parsed = JSON.parse(JSON.parse(literal));
    } catch {
      parsed = null;
    }
    pageDataCache.set(script, parsed);
  }
  return pageDataCache.get(script) ?? null;
}

/** The page title in a reference's `displayData.content` JSON, or "" when it can't be read. */
function pageDataTitle(displayData: unknown): string {
  try {
    const content = JSON.parse((displayData as { content?: unknown })?.content as string);
    const title = content?.providerDisplayName ?? content?.Title;
    return typeof title === "string" ? title : "";
  } catch {
    return "";
  }
}

/**
 * Reads `message`'s sources from the page's load-time data, or returns null
 * when the page has no such data, the reply isn't in it (it was written after
 * the page loaded), or anything about it is unexpected. Never throws.
 */
export function readPageDataReferences(message: Element): SourceReference[] | null {
  try {
    const reply = message.matches(REPLY_SELECTOR) ? message : message.querySelector(REPLY_SELECTOR);
    const messageId = reply?.getAttribute("data-message-id");
    if (!reply || !messageId) return null;
    const data = pageData(reply.ownerDocument) as {
      loaderData?: { "chat-history"?: { store?: { rawConversationResponse?: { messages?: unknown } } } };
    } | null;
    const messages = data?.loaderData?.["chat-history"]?.store?.rawConversationResponse?.messages;
    if (!Array.isArray(messages)) return null;
    const found = messages.find((entry) => entry?.messageId === messageId);
    if (!found?.references || typeof found.references !== "object") return null;

    const references: SourceReference[] = [];
    for (const entry of Object.values(found.references as Record<string, Record<string, unknown>>)) {
      const url = entry?.targetLink;
      if (typeof url !== "string" || !/^https?:\/\//i.test(url)) continue;
      references.push({ url, title: pageDataTitle(entry.displayData), domain: sourceDomain(url), cited: entry.isCitedInResponse === true });
    }
    return references;
  } catch {
    return null;
  }
}

/*
 * The Sources panel fallback. The panel lists a reply's sources under
 * "Citations" and "More", each item showing the page title and domain as
 * `title` attributes, but it carries no URLs and only exists while open.
 * Citations are paired with the chips' URLs by position: a chip source's
 * `index` ("1-a1b2c3", "2-d4e5f6", …) is its place in the panel's Citations
 * list, which tells apart two citations from the same domain.
 */

const SOURCES_BUTTON_SELECTOR = '[data-testid="sources-button-testid"]';
const PANEL_SELECTOR = '[data-testid="search-widget-drawer-test-id"]';
const PANEL_ITEM_SELECTOR = '[data-testid="search-widget-item"]';
const PANEL_CLOSE_SELECTOR = 'button[aria-label="Close"]';

/** How long to wait for the panel and how often to look; exported so the regression script can shorten them. */
export const panelTiming = { timeoutMs: 3000, pollMs: 50 };

/** One entry as the Sources panel shows it. */
interface PanelEntry {
  title: string;
  domain: string;
}

/** A chip source: its position in the panel's Citations list and its URL. */
interface ChipSource {
  position: number;
  url: string;
}

/** Every distinct source `message`'s chips cite, with its position taken from the chip's `index`. */
function chipSources(message: Element): ChipSource[] {
  const byPosition = new Map<number, string>();
  for (const chip of Array.from(message.querySelectorAll("button[data-grouped-citations]"))) {
    try {
      const group: unknown = JSON.parse(chip.getAttribute("data-grouped-citations") ?? "");
      for (const entry of Array.isArray(group) ? group : []) {
        const position = /^(\d+)-/.exec(String(entry?.index ?? ""))?.[1];
        if (position && typeof entry.url === "string" && /^https?:\/\//.test(entry.url)) byPosition.set(Number(position), entry.url);
      }
    } catch {
      // A chip with unreadable data just contributes nothing here.
    }
  }
  return Array.from(byPosition, ([position, url]) => ({ position, url }));
}

/** Reads the open Sources panel's Citations and More lists, or null when no panel is open. */
function readPanel(document: Document): { citations: PanelEntry[]; more: PanelEntry[] } | null {
  const panel = document.querySelector(PANEL_SELECTOR);
  if (!panel) return null;
  const lists = { citations: [] as PanelEntry[], more: [] as PanelEntry[] };
  let section: keyof typeof lists | null = null;
  // Headings and lists are siblings: "Citations", its list, "More", its list.
  for (const child of Array.from((panel.querySelector('[data-testid="search-widget-scrollable-container"]') ?? panel).children)) {
    if (child.getAttribute("role") === "list") {
      if (!section) continue;
      for (const item of Array.from(child.querySelectorAll(PANEL_ITEM_SELECTOR))) {
        const [title, domain] = Array.from(item.querySelectorAll("[title]"), (element) => element.getAttribute("title")?.trim() ?? "");
        if (title && domain) lists[section].push({ title, domain });
      }
    } else {
      const heading = child.textContent?.trim().toLowerCase();
      if (heading === "citations") section = "citations";
      else if (heading === "more") section = "more";
    }
  }
  return lists;
}

/**
 * Pairs the panel's lists with `sources` and returns the reply's references,
 * or null when the panel doesn't belong to this reply: every chip source's
 * position must exist in the Citations list, with the same domain.
 */
function pairPanel(panel: { citations: PanelEntry[]; more: PanelEntry[] }, sources: ChipSource[]): SourceReference[] | null {
  const references: SourceReference[] = [];
  for (const { position, url } of sources) {
    const entry = panel.citations[position - 1];
    if (!entry || entry.domain.toLowerCase() !== sourceDomain(url).toLowerCase()) return null;
    references.push({ url, title: entry.title, domain: sourceDomain(url), cited: true });
  }
  for (const entry of panel.more) references.push({ url: null, title: entry.title, domain: entry.domain, cited: false });
  return references;
}

/** A fingerprint of what the open panel shows, to tell when a click has swapped in another reply's sources. */
function panelFingerprint(document: Document): string {
  return Array.from(document.querySelectorAll(`${PANEL_SELECTOR} ${PANEL_ITEM_SELECTOR} [title]`), (element) => element.getAttribute("title")).join("\n");
}

/** Clicks the panel's Close button, which sits in a header just above the list. */
function closePanel(document: Document): void {
  let container: Element | null = document.querySelector(PANEL_SELECTOR);
  for (let level = 0; container && level < 4; level++, container = container.parentElement) {
    const close = container.querySelector<HTMLElement>(PANEL_CLOSE_SELECTOR);
    if (close) {
      close.click();
      return;
    }
  }
}

/** Resolves after `ms` milliseconds. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reads `message`'s sources by opening its Sources panel, for when the page
 * script can't. If the panel is already showing this reply, it's read as is.
 * Otherwise the reply's Sources button is clicked and the panel polled until
 * it shows entries that pair with this reply's chips, for up to
 * {@link panelTiming}.timeoutMs. A panel the extension opened is closed again,
 * whatever happens; one the user had open is left open. Returns null when the
 * reply has no Sources button or chips, or the panel never lines up.
 */
async function readCopilotReferencesFromPanel(message: Element): Promise<SourceReference[] | null> {
  const document = message.ownerDocument;
  const button = message.querySelector<HTMLElement>(SOURCES_BUTTON_SELECTOR);
  const sources = chipSources(message);
  if (!button || sources.length === 0) return null;

  const wasOpen = document.querySelector(PANEL_SELECTOR) !== null;
  if (wasOpen) {
    const current = readPanel(document);
    const paired = current && pairPanel(current, sources);
    if (paired) return paired;
  }

  const before = wasOpen ? panelFingerprint(document) : null;
  button.click();
  try {
    for (let waited = 0; waited <= panelTiming.timeoutMs; waited += panelTiming.pollMs) {
      const panel = readPanel(document);
      const changed = before === null || panelFingerprint(document) !== before;
      const paired = panel && changed ? pairPanel(panel, sources) : null;
      if (paired) return paired;
      await delay(panelTiming.pollMs);
    }
    return null;
  } finally {
    if (!wasOpen) closePanel(document);
  }
}

export const copilotAdapter: SiteAdapter = {
  id: "copilot",
  name: "Copilot",
  matches: ["https://copilot.microsoft.com/*", "https://copilot.com/*"],
  // User prompts are articles too; only replies contain a markdown-reply body.
  messageSelector: 'div[role="article"]:has([data-testid="markdown-reply"])',
  contentSelector: REPLY_SELECTOR,
  nativeCopyButtonSelector: 'button[data-testid="CopyButtonTestId"]',
  // Directly before the native Copy button, at the start of its flex row with the feedback buttons, so Copy as Markdown comes first.
  findButtonAnchor(message) {
    const copy = message.querySelector('button[data-testid="CopyButtonTestId"]');
    return copy?.parentElement ? { parent: copy.parentElement, before: copy } : null;
  },
  stripSelectors: ['[role="status"]', "[aria-live]"],
  preprocess: rewriteCodeBlocks,
  turndownRules: (context) => ({ copilotCitationChip: citationChipRule(context) }),
  // React state through the page script first; it covers every reply. The load-time data is the synchronous backup.
  readReferences: (message) => readCopilotReferences(message) ?? readPageDataReferences(message),
  readReferencesSlowly: readCopilotReferencesFromPanel,
  // A chip grouping several sources ("photovault+1") names only the first in its label.
  hasUntitledCitations: (message) =>
    Array.from(message.querySelectorAll("button[data-grouped-citations]")).some((chip) => {
      try {
        const group: unknown = JSON.parse(chip.getAttribute("data-grouped-citations") ?? "");
        return Array.isArray(group) && group.length > 1;
      } catch {
        return false;
      }
    }),
  pageScript: "copilot",
  rules: [invisibleCharactersRule, collapseBlankLinesRule],
};
