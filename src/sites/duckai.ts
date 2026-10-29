import type TurndownService from "turndown";
import { encodeLinkDestination, escapeLinkText, normalizeCitationUrl, sourceDomain } from "../core/citations";
import { promptText } from "../core/prompt";
import { CHIP_SOURCES_ATTRIBUTE, REFERENCES_EVENT, type RawChipSource } from "../core/references-protocol";
import { collapseBlankLinesRule, invisibleCharactersRule } from "../core/rules";
import type { ButtonLabel, ConversationTurn, ConversionContext, SiteAdapter, SourceReference } from "../core/types";
import { rewriteStreamdownCodeBlocks, rewriteStreamdownStrong, streamdownLanguageId } from "./streamdown";

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

/** A reply. Each reply's id ends in "-assistant-message-<turn>-<variant>"; its heading reuses the id with a "heading-" prefix. */
export const DUCK_AI_REPLY_SELECTOR = 'div[id*="-assistant-message-"]:not([id^="heading-"])';

/**
 * The conversation: the element whose children are the turns. As inspected on
 * 2026-10-28, each turn is a wrapper `<div>` holding its user message and its
 * reply, and the wrappers share a parent (the first half). The 2026-10-24
 * layout had the user messages and replies side by side in `<main>`, with no
 * wrappers (the second half); it's kept so that layout still works.
 */
const CONVERSATION_SELECTOR = 'div:has(> div > [data-testid="user-message"]), :not(div):has(> [data-testid="user-message"])';

/** How the conversation's button names itself; the replies' buttons keep the plain icon. */
const CONVERSATION_LABEL: ButtonLabel = { title: "Copy conversation as Markdown", text: "Conversation" };

/** The id of the option that cites sources as Duck.ai shows them; stored in the settings, so never rename it. */
export const READ_MORE_STYLE_OPTION = "read-more-style";

/** `[label](url)`, a link written where a chip was, while sources are cited as Duck.ai shows them. */
function inlineLink(label: string, url: string): string {
  return `[${escapeLinkText(label)}](${encodeLinkDestination(url)})`;
}

/**
 * The fence info string for a Duck.ai code block's `data-language` value.
 * Kept under its old name for the Duck.ai tests; the logic is shared in
 * ./streamdown.ts.
 */
export const duckAiLanguageId = streamdownLanguageId;

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

/**
 * Rewrites the reply body's Streamdown markup into HTML that Turndown converts
 * faithfully. While sources are cited as Duck.ai shows them, the reply's Read
 * More section (see {@link readMoreSection}) is added at the end.
 */
function preprocessDuckAi(root: HTMLElement, context: ConversionContext, message: Element): void {
  rewriteStreamdownCodeBlocks(root);
  rewriteStreamdownStrong(root);
  removeUnreadablePopupChips(root);
  const readMore = context.isOptionEnabled(READ_MORE_STYLE_OPTION) ? readMoreSection(message) : null;
  if (readMore) root.append(readMore);
}

/** Marks the icon of a Read More line, for {@link readMoreIconRule}. */
const READ_MORE_ICON_ATTRIBUTE = "data-acf-read-more-icon";

/**
 * `message`'s Read More cards as the copy's Read More section: an `<h2>`, then
 * a list with a line for each card, in page order. Each line is the card's
 * icon (when it's a web address), its title linked to the page (its domain
 * when it has no title), then the domain after a dash, unless that's what the
 * title already says. Null when the message has no cards.
 */
function readMoreSection(message: Element): HTMLElement | null {
  const document = message.ownerDocument;
  const cards = Array.from(message.querySelectorAll(READ_MORE_CARD_SELECTOR)).filter((card) => /^https?:\/\//i.test(card.getAttribute("href") ?? ""));
  if (cards.length === 0) return null;
  const list = document.createElement("ul");
  for (const card of cards) {
    const { url, title, domain } = readCard(card);
    const item = document.createElement("li");
    const icon = card.querySelector(":scope > img")?.getAttribute("src") ?? "";
    if (/^https?:\/\//i.test(icon)) {
      const image = document.createElement("img");
      image.setAttribute(READ_MORE_ICON_ATTRIBUTE, "");
      image.setAttribute("src", icon);
      item.append(image, " ");
    }
    const link = document.createElement("a");
    link.href = url ?? "";
    link.textContent = title || domain;
    item.append(link);
    if (title && title.toLowerCase() !== domain.toLowerCase()) item.append(` — ${domain}`);
    list.append(item);
  }
  const section = document.createElement("div");
  const heading = document.createElement("h2");
  heading.textContent = "Read More";
  section.append(heading, list);
  return section;
}

/**
 * Turndown rule for a Read More line's icon: `![|16](icon)`, Obsidian's
 * image-size syntax for 16px, as in Search Assist's chips. Turndown's own
 * image rule would write the alt text as given, but a rule of its own keeps
 * the `|` from ever being escaped and the address encoded for a link.
 */
function readMoreIconRule(): TurndownService.Rule {
  return {
    filter: (node) => node.nodeName === "IMG" && (node as HTMLElement).hasAttribute(READ_MORE_ICON_ATTRIBUTE),
    replacement: (_content, node) => `![|16](${encodeLinkDestination((node as HTMLElement).getAttribute("src") ?? "")})`,
  };
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
 * Turndown rule for Duck.ai's source chips. While sources are cited as Duck.ai
 * shows them, a chip stays where it is as a link with its label. Otherwise
 * it's registered as a citation and replaced by its placeholder. The chip
 * shows only a short site name ("GitHub", "widget.example"), so the
 * citation's page title comes from the reply's Read More card for the same
 * URL, when the caller read them; otherwise the chip's label stands in.
 */
function citationChipRule(context: ConversionContext): TurndownService.Rule {
  return {
    filter: (node) => isCitationChip(node),
    replacement: (_content, node) => {
      const element = node as HTMLElement;
      const url = element.getAttribute("href") ?? "";
      const name = (element.textContent ?? "").trim();
      if (context.isOptionEnabled(READ_MORE_STYLE_OPTION)) return inlineLink(name || sourceDomain(url), url);
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
 * one, otherwise from Duck.ai's own title for it. While sources are cited as
 * Duck.ai shows them, each source is instead a link labelled with its domain,
 * the links separated by spaces, so none is lost. A chip with no readable
 * sources becomes nothing: its visible text is only a domain and a count, which
 * would otherwise run into the sentence ("widget.example1").
 */
function popupChipRule(context: ConversionContext): TurndownService.Rule {
  return {
    filter: (node) => isPopupChip(node),
    replacement: (_content, node) => {
      const sources = parseChipSources((node as HTMLElement).getAttribute(CHIP_SOURCES_ATTRIBUTE)) ?? [];
      if (context.isOptionEnabled(READ_MORE_STYLE_OPTION)) {
        return sources.map((source) => inlineLink(source.domain.trim() || sourceDomain(source.url), source.url)).join(" ");
      }
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

/**
 * The prompt that the reply in `message` answers: the last user message
 * before it in the page. When Duck.ai shows more than one reply to a prompt,
 * each of them gets that prompt. A user message holds the pre-wrapped text, a
 * "You said" heading meant only for screen readers (the only heading in it,
 * so headings are skipped), an icon and a toolbar of icon buttons. Returns
 * null when no user message comes before the reply.
 */
export function readDuckAiPrompt(message: Element): string | null {
  const before = Array.from(message.ownerDocument.querySelectorAll('[data-testid="user-message"]')).filter(
    (prompt) => prompt.compareDocumentPosition(message) & prompt.DOCUMENT_POSITION_FOLLOWING,
  );
  const prompt = before.at(-1);
  return prompt ? promptText(prompt, "h1, h2, h3, h4, h5, h6") : null;
}

/**
 * The conversation in `message`, one turn per reply, in page order, each with
 * the prompt before it (see {@link readDuckAiPrompt}). A reply Duck.ai marks
 * as not the active one, a regenerated version off screen, is left out. Null
 * for a reply, which is copied on its own.
 */
export function readDuckAiTurns(message: Element): ConversationTurn[] | null {
  if (!message.matches(CONVERSATION_SELECTOR)) return null;
  return Array.from(message.querySelectorAll(DUCK_AI_REPLY_SELECTOR))
    .filter((reply) => reply.getAttribute("data-activeresponse") !== "false")
    .map((reply) => ({ prompt: readDuckAiPrompt(reply), reply }));
}

export const duckAiAdapter: SiteAdapter = {
  id: "duckai",
  name: "Duck.ai",
  // duckduckgo.com/?ia=chat redirects here, so Duck.ai opened from a search is covered too.
  matches: ["https://duck.ai/*"],
  // Each reply, and the conversation, which gets a copy button of its own.
  messageSelector: `${DUCK_AI_REPLY_SELECTOR}, ${CONVERSATION_SELECTOR}`,
  contentSelector: CONTENT_SELECTOR,
  nativeCopyButtonSelector: COPY_BUTTON_SELECTOR,
  // Every toolbar item has its own wrapper div in a flex row; the button goes in the row, right after Copy's wrapper.
  findButtonAnchor(message) {
    if (message.matches(CONVERSATION_SELECTOR)) return null;
    const wrapper = message.querySelector(COPY_BUTTON_SELECTOR)?.parentElement;
    return wrapper?.parentElement ? { parent: wrapper.parentElement, before: wrapper.nextSibling } : null;
  },
  stripSelectors: ['[data-streamdown="code-block-header"]', '[data-streamdown="code-block-actions"]', "[aria-live]"],
  preprocess: preprocessDuckAi,
  turndownRules: (context) => ({ duckAiCitationChip: citationChipRule(context), duckAiPopupChip: popupChipRule(context), duckAiReadMoreIcon: readMoreIconRule() }),
  readReferences: readDuckAiReferences,
  readPrompt: readDuckAiPrompt,
  readTurns: readDuckAiTurns,
  buttonLabel: (message) => (message.matches(CONVERSATION_SELECTOR) ? CONVERSATION_LABEL : null),
  moreSources: { defaultEnabled: true, description: "Adds the Read More cards that the reply doesn't cite." },
  options: [
    {
      id: READ_MORE_STYLE_OPTION,
      name: "Cite sources as Duck.ai does",
      description: "Keeps each source chip as a link where it is, and ends with Read More: a line for each card, with its icon, title and site. Replaces the numbered citations and the Sources section.",
      defaultEnabled: false,
      replacesSourcesSection: true,
    },
  ],
  // Popup chips name their sources only in React state, which src/page/duckai.ts reads.
  pageScript: "duckai",
  rules: [invisibleCharactersRule, collapseBlankLinesRule],
};
