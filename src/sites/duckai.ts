import type TurndownService from "turndown";
import { normalizeCitationUrl, sourceDomain } from "../core/citations";
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

/** Rewrites the reply body's Streamdown markup into HTML that Turndown converts faithfully. */
function preprocessDuckAi(root: HTMLElement): void {
  rewriteDuckAiCodeBlocks(root);
  rewriteDuckAiStrong(root);
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
 * Reads `message`'s Read More cards as its source list, in page order. Each
 * card holds a favicon, then a `<span>` whose own text is the page title and
 * whose inner `<span>` is the domain. A card counts as cited when a chip in
 * the reply body links to the same page; the rest become the More list.
 *
 * Returns null when the message has no Read More section, so the chips fall
 * back to their own labels.
 */
export function readDuckAiReferences(message: Element): SourceReference[] | null {
  const cards = Array.from(message.querySelectorAll<HTMLAnchorElement>(READ_MORE_CARD_SELECTOR)).filter((card) =>
    /^https?:\/\//.test(card.getAttribute("href") ?? ""),
  );
  if (cards.length === 0) return null;

  const body = message.querySelector(CONTENT_SELECTOR);
  const chipUrls = new Set(
    Array.from(body?.querySelectorAll<HTMLElement>("a[aria-label][tabindex]") ?? [])
      .filter(isCitationChip)
      .map((chip) => normalizeCitationUrl(chip.getAttribute("href") ?? "")),
  );

  return cards.map((card) => {
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
    return { url, title, domain, cited: chipUrls.has(normalizeCitationUrl(url)) };
  });
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
  turndownRules: (context) => ({ duckAiCitationChip: citationChipRule(context) }),
  // Everything is in the page already, so there's no slower reader or page script.
  readReferences: readDuckAiReferences,
  rules: [invisibleCharactersRule, collapseBlankLinesRule],
};
