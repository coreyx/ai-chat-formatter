import type TurndownService from "turndown";
import { normalizeCitationUrl, sourceDomain } from "../core/citations";
import { CHIP_SOURCES_ATTRIBUTE, REFERENCES_EVENT, type RawChipSource } from "../core/references-protocol";
import { collapseBlankLinesRule, invisibleCharactersRule } from "../core/rules";
import type { ConversionContext, SiteAdapter, SourceReference } from "../core/types";

/*
 * Duck.ai, DuckDuckGo's AI chat. Every selector here comes from duck.ai's
 * rendered page as inspected on 2026-10-24; none of it is a documented API.
 * Duck.ai's class names are generated hashes that change between releases, so
 * the selectors use only ids, data attributes, ARIA attributes and tag
 * structure. When Duck.ai changes its markup, this is the file to update.
 */

/** Duck.ai's own Copy button in a reply's toolbar. */
const COPY_BUTTON_SELECTOR = "button[data-copyairesponse]";

/** The reply body: the rendered Markdown, without the Reasoning panel or the Read More cards. */
const CONTENT_SELECTOR = "[data-dark-theme]";

/** The cards in a reply's Read More section, a `<section>` headed by an `<h4>`. */
const READ_MORE_CARD_SELECTOR = "section:has(> h4) a[data-handled-by-react]";

/** Code block labels that mean "no particular language", so the fence gets no info string. */
const PLAIN_LANGUAGES = new Set(["text", "plaintext", "plain", "txt"]);

/**
 * The fence info string for a code block's `data-language` value: lowercased,
 * or empty when the block names no real language.
 */
export function duckAiLanguageId(language: string | null | undefined): string {
  const id = (language ?? "").trim().toLowerCase();
  return PLAIN_LANGUAGES.has(id) ? "" : id;
}

/**
 * Rewrites Duck.ai's code blocks as `<pre><code>` that Turndown fences.
 *
 * Duck.ai renders each line as its own `<span>` under `<code>`, with no
 * newline characters between them, so the block's text alone would run every
 * line together. The lines are joined with newlines here instead, keeping each
 * line's own leading spaces. A block without line spans falls back to its text.
 */
function rewriteDuckAiCodeBlocks(root: HTMLElement): void {
  const document = root.ownerDocument;
  for (const block of Array.from(root.querySelectorAll<HTMLElement>('[data-streamdown="code-block"]'))) {
    const source = block.querySelector("code");
    const lines = source ? Array.from(source.children).map((line) => line.textContent ?? "") : [];

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    const language = duckAiLanguageId(block.getAttribute("data-language"));
    if (language) code.className = `language-${language}`;
    code.textContent = lines.length > 0 ? lines.join("\n") : (source?.textContent ?? block.textContent ?? "");
    pre.appendChild(code);
    block.replaceWith(pre);
  }
}

/**
 * Turns Streamdown's bold text back into `<strong>`. Streamdown renders `**…**`
 * as a `<span data-streamdown="strong">` styled bold, and Turndown only knows
 * bold from the tag, so without this every bold run would copy as plain text.
 */
function rewriteDuckAiStrong(root: HTMLElement): void {
  for (const span of Array.from(root.querySelectorAll('span[data-streamdown="strong"]'))) {
    const strong = root.ownerDocument.createElement("strong");
    strong.append(...Array.from(span.childNodes));
    span.replaceWith(strong);
  }
}

/**
 * Removes popup chips that have no readable sources, together with the `<span>`
 * that wraps each one, so that nothing of them reaches Turndown. Emitting an
 * empty string from the chip rule instead would leave the space before the
 * chip at the end of its line.
 */
function removeUnreadablePopupChips(root: HTMLElement): void {
  for (const chip of Array.from(root.querySelectorAll("button[aria-haspopup]")).filter(isPopupChip)) {
    if (parseChipSources(chip.getAttribute(CHIP_SOURCES_ATTRIBUTE))) continue;
    const wrapper = chip.parentElement;
    if (wrapper?.nodeName === "SPAN" && wrapper.childNodes.length === 1) wrapper.remove();
    else chip.remove();
  }
}

/** Rewrites the reply body's Streamdown markup into HTML that Turndown converts faithfully. */
function preprocessDuckAi(root: HTMLElement): void {
  rewriteDuckAiCodeBlocks(root);
  rewriteDuckAiStrong(root);
  removeUnreadablePopupChips(root);
}

/**
 * Whether `node` is one of Duck.ai's inline source chips: a link to an
 * `http(s)` page with an `aria-label` and a `tabindex`, wrapping a single
 * `<span>` with the site's name. Ordinary links in a reply carry neither
 * attribute, so they're left to the normal link conversion.
 */
function isCitationChip(node: HTMLElement): boolean {
  return (
    node.nodeName === "A" &&
    /^https?:\/\//.test(node.getAttribute("href") ?? "") &&
    node.hasAttribute("aria-label") &&
    node.hasAttribute("tabindex") &&
    node.childElementCount === 1 &&
    node.firstElementChild?.nodeName === "SPAN"
  );
}

/**
 * Turndown rule for Duck.ai's source chips. Each chip is registered as a
 * citation and replaced by its placeholder. The chip shows only a short site
 * name ("GitHub", "widget.example"), so the page title comes from the reply's
 * Read More card for the same URL, when the caller read them; otherwise the
 * chip's label stands in.
 */
function citationChipRule(context: ConversionContext): TurndownService.Rule {
  return {
    filter: (node) => isCitationChip(node),
    replacement: (_content, node) => {
      const element = node as HTMLElement;
      const url = element.getAttribute("href") ?? "";
      const name = (element.textContent ?? "").trim();
      const title = context.findReference(url)?.title.trim() || (element.getAttribute("aria-label") ?? "").trim() || name;
      return context.registerCitation({ url, title, sourceName: name });
    },
  };
}

/**
 * Whether `node` is one of Duck.ai's popup source chips: a button that opens a
 * popup listing the sources it stands for, showing the first source's domain
 * and a count of the others. Its markup holds no links; the sources come from
 * {@link CHIP_SOURCES_ATTRIBUTE}, written by the page script or the Read More
 * fallback in {@link readDuckAiReferences}.
 */
function isPopupChip(node: Element): boolean {
  return node.nodeName === "BUTTON" && node.hasAttribute("aria-haspopup") && node.hasAttribute("aria-label");
}

/** The domain a popup chip displays: the text of its first `<span>`. */
function popupChipDomain(chip: Element): string {
  return (Array.from(chip.children).find((child) => child.nodeName === "SPAN")?.textContent ?? "").trim();
}

/**
 * Parses a popup chip's {@link CHIP_SOURCES_ATTRIBUTE}, keeping entries with an
 * http(s) URL. Returns null when the attribute is missing or malformed, so the
 * chip is dropped rather than turned into wrong citations.
 */
export function parseChipSources(json: string | null): RawChipSource[] | null {
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const sources = parsed.flatMap((entry: Partial<RawChipSource> | null): RawChipSource[] => {
    const url = typeof entry?.url === "string" ? entry.url : "";
    if (!/^https?:\/\//i.test(url)) return [];
    return [{ url, title: typeof entry?.title === "string" ? entry.title : "", domain: typeof entry?.domain === "string" ? entry.domain : "" }];
  });
  return sources.length > 0 ? sources : null;
}

/**
 * Turndown rule for Duck.ai's popup chips. Each source behind the chip is
 * registered as its own citation, titled from its Read More card when there is
 * one, otherwise from Duck.ai's own title for it. A chip with no readable
 * sources becomes nothing: its visible text is only a domain and a count, which
 * would otherwise run into the sentence ("widget.example1").
 */
function popupChipRule(context: ConversionContext): TurndownService.Rule {
  return {
    filter: (node) => isPopupChip(node),
    replacement: (_content, node) => {
      const sources = parseChipSources((node as HTMLElement).getAttribute(CHIP_SOURCES_ATTRIBUTE)) ?? [];
      return sources
        .map((source) => {
          const domain = source.domain.trim() || sourceDomain(source.url);
          const title = context.findReference(source.url)?.title.trim() || source.title.trim() || domain;
          return context.registerCitation({ url: source.url, title, sourceName: domain });
        })
        .join("");
    },
  };
}

/** One Read More card as a source reference, not yet marked cited. */
function readCard(card: Element): SourceReference {
  const url = card.getAttribute("href") ?? "";
  const label = Array.from(card.children).find((child) => child.nodeName === "SPAN");
  // The title is the label's own text; its inner span is the domain.
  const title = Array.from(label?.childNodes ?? [])
    .filter((node) => node.nodeType === node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const domain = (label?.querySelector("span")?.textContent ?? "").trim() || sourceDomain(url);
  return { url, title, domain, cited: false };
}

/**
 * Reads `message`'s Read More cards as its source list, in page order, and
 * makes sure every popup chip in the reply carries its sources for conversion.
 *
 * First it asks the page script (src/page/duckai.ts) to write each popup chip's
 * sources to the chip; the request is synchronous, like Copilot's. A popup chip
 * left without them gets the Read More card for the domain it displays, when
 * there is one.
 *
 * Each card holds a favicon, then a `<span>` whose own text is the page title
 * and whose inner `<span>` is the domain. A card counts as cited when a link
 * chip, or a source behind a popup chip, points to the same page; the rest
 * become the More list.
 *
 * Returns null when the message has no Read More section, so link chips fall
 * back to their own labels.
 */
export function readDuckAiReferences(message: Element): SourceReference[] | null {
  message.dispatchEvent(new (message.ownerDocument.defaultView ?? window).CustomEvent(REFERENCES_EVENT, { bubbles: true }));

  const references = Array.from(message.querySelectorAll(READ_MORE_CARD_SELECTOR))
    .filter((card) => /^https?:\/\//.test(card.getAttribute("href") ?? ""))
    .map(readCard);

  const body = message.querySelector(CONTENT_SELECTOR);
  const popupChips = Array.from(body?.querySelectorAll("button[aria-haspopup]") ?? []).filter(isPopupChip);
  for (const chip of popupChips) {
    if (parseChipSources(chip.getAttribute(CHIP_SOURCES_ATTRIBUTE))) continue;
    const card = references.find((reference) => reference.domain === popupChipDomain(chip));
    if (card) chip.setAttribute(CHIP_SOURCES_ATTRIBUTE, JSON.stringify([{ url: card.url, title: card.title, domain: card.domain }]));
  }
  if (references.length === 0) return null;

  const citedUrls = new Set([
    ...Array.from(body?.querySelectorAll<HTMLElement>("a[aria-label][tabindex]") ?? [])
      .filter(isCitationChip)
      .map((chip) => chip.getAttribute("href") ?? ""),
    ...popupChips.flatMap((chip) => (parseChipSources(chip.getAttribute(CHIP_SOURCES_ATTRIBUTE)) ?? []).map((source) => source.url)),
  ].map((url) => normalizeCitationUrl(url)));
  return references.map((reference) => ({ ...reference, cited: citedUrls.has(normalizeCitationUrl(reference.url ?? "")) }));
}

export const duckAiAdapter: SiteAdapter = {
  id: "duckai",
  name: "Duck.ai",
  // duckduckgo.com/?ia=chat redirects here, so Duck.ai opened from a search is covered too.
  matches: ["https://duck.ai/*"],
  // Each reply's id ends in "-assistant-message-<turn>-<variant>"; its heading reuses the id with a "heading-" prefix.
  messageSelector: 'div[id*="-assistant-message-"]:not([id^="heading-"])',
  contentSelector: CONTENT_SELECTOR,
  nativeCopyButtonSelector: COPY_BUTTON_SELECTOR,
  // Every toolbar item has its own wrapper div in a flex row; the button goes in the row, right after Copy's wrapper.
  findButtonAnchor(message) {
    const wrapper = message.querySelector(COPY_BUTTON_SELECTOR)?.parentElement;
    return wrapper?.parentElement ? { parent: wrapper.parentElement, before: wrapper.nextSibling } : null;
  },
  stripSelectors: ['[data-streamdown="code-block-header"]', '[data-streamdown="code-block-actions"]', "[aria-live]"],
  preprocess: preprocessDuckAi,
  turndownRules: (context) => ({ duckAiCitationChip: citationChipRule(context), duckAiPopupChip: popupChipRule(context) }),
  readReferences: readDuckAiReferences,
  // Popup chips name their sources only in React state, which src/page/duckai.ts reads.
  pageScript: "duckai",
  rules: [invisibleCharactersRule, collapseBlankLinesRule],
};
