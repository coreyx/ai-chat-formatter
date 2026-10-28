import type TurndownService from "turndown";
import { collapseBlankLinesRule, invisibleCharactersRule } from "../core/rules";
import { AFTER_SOURCES_ATTRIBUTE, ConversionError, type ConversionContext, type SiteAdapter, type SourceReference } from "../core/types";
import {
  BROWSE_LIST_SELECTOR,
  CITATION_INDEX_ATTRIBUTE,
  CITATION_SELECTOR,
  END_OF_REPORT_SELECTOR,
  findReportTurn,
  findResearchRequest,
  type GeminiSource,
  readQueryText,
  readSourceList,
  REPORT_BODY_SELECTOR,
  REPORT_PANEL_SELECTOR,
  SHARE_EXPORT_SELECTOR,
  SOURCE_LISTS_SELECTOR,
  SOURCES_CAROUSEL_SELECTOR,
  THINKING_ITEM_SELECTOR,
  THOUGHT_BODY_SELECTOR,
  THOUGHT_HEADER_SELECTOR,
  TOOLBAR_ACTIONS_SELECTOR,
  UNUSED_SOURCES_SELECTOR,
  USED_SOURCES_SELECTOR,
} from "./gemini-markup";

/*
 * Gemini (gemini.google.com), for Deep Research. A finished report opens in a
 * panel beside the chat, and the panel's toolbar gets the extension's buttons.
 * The selectors are in gemini-markup.ts, which says where they come from.
 */

/** The option ids, stored in the settings; never rename them once released. */
export const USED_SOURCES_OPTION = "used-sources";
export const UNUSED_SOURCES_OPTION = "unused-sources";
export const THINKING_OPTION = "thinking";

/** Marks a citation marker rewritten as a link to its source, for {@link geminiCitationRule}. */
const CITE_ATTRIBUTE = "data-acf-gemini-cite";

/** The page's own numbers for the report's citations: each marker's position in the used list, from 1. */
function citationIndexes(body: ParentNode): number[] {
  return Array.from(body.querySelectorAll(`${CITATION_SELECTOR} [${CITATION_INDEX_ATTRIBUTE}]`), (marker) => Number(marker.getAttribute(CITATION_INDEX_ATTRIBUTE)));
}

/**
 * One source as an HTML list item, `Title — domain` with the title linked, so
 * Turndown writes it as the Sources section's entries are written. The domain
 * is left off when it's the only name shown.
 */
function sourceItem(document: Document, source: GeminiSource): HTMLLIElement {
  const item = document.createElement("li");
  const link = document.createElement("a");
  link.href = source.url;
  link.textContent = source.title || source.domain;
  item.append(link);
  if (source.title && source.title.toLowerCase() !== source.domain.toLowerCase()) item.append(` — ${source.domain}`);
  return item;
}

/** A list of `sources`, one {@link sourceItem} each. */
function sourceList(document: Document, sources: GeminiSource[]): HTMLUListElement {
  const list = document.createElement("ul");
  list.append(...sources.map((source) => sourceItem(document, source)));
  return list;
}

/** A section to write after the Sources section: an `<h2>` titled `title`, then `content`. */
function afterSourcesSection(document: Document, title: string, ...content: Node[]): HTMLElement {
  const section = document.createElement("div");
  section.setAttribute(AFTER_SOURCES_ATTRIBUTE, "");
  const heading = document.createElement("h2");
  heading.textContent = title;
  section.append(heading, ...content);
  return section;
}

/** A paragraph holding `text`, in bold when `bold` is set. */
function paragraph(document: Document, text: string, bold = false): HTMLParagraphElement {
  const element = document.createElement("p");
  if (bold) {
    const strong = document.createElement("strong");
    strong.textContent = text;
    element.append(strong);
  } else {
    element.textContent = text;
  }
  return element;
}

/**
 * Gemini's thinking, rebuilt from `root` as the Thinking section: each
 * thought as its heading in bold with its text below, and each browsing step
 * as a list of the pages it visited. Null when there are no steps.
 */
function thinkingSection(root: Element): HTMLElement | null {
  const document = root.ownerDocument;
  const content: Node[] = [];
  for (const item of Array.from(root.querySelectorAll(THINKING_ITEM_SELECTOR))) {
    const browsed = item.querySelector(BROWSE_LIST_SELECTOR);
    if (browsed) {
      const sources = readSourceList(browsed);
      if (sources.length) content.push(sourceList(document, sources));
      continue;
    }
    const header = (item.querySelector(THOUGHT_HEADER_SELECTOR)?.textContent ?? "").trim();
    const body = (item.querySelector(THOUGHT_BODY_SELECTOR)?.textContent ?? "").trim();
    if (header) content.push(paragraph(document, header, true));
    if (body) content.push(paragraph(document, body));
  }
  return content.length ? afterSourcesSection(document, "Thinking", ...content) : null;
}

/**
 * Prepares a copy of the report panel's content for conversion. A report
 * that isn't finished (no end marker or source lists yet) isn't copied. Each
 * citation marker becomes a link to its source in the used list, for
 * {@link geminiCitationRule}, or is dropped when the used sources are off or
 * the marker's number has no source. The paragraphs' source carousels go.
 * Only the report's text is kept, followed by the sections the options ask
 * for, marked to come after the Sources section: the sources browsed but not
 * used, then the thinking.
 *
 * @throws ConversionError while the report is still being written.
 */
function preprocessReport(root: HTMLElement, body: Element, context: ConversionContext): void {
  if (!root.querySelector(END_OF_REPORT_SELECTOR) || !root.querySelector(SOURCE_LISTS_SELECTOR)) {
    throw new ConversionError("Gemini is still writing this report. Copy again once it's finished.");
  }
  const document = root.ownerDocument;
  const usedList = root.querySelector(USED_SOURCES_SELECTOR);
  const used = context.isOptionEnabled(USED_SOURCES_OPTION) && usedList ? readSourceList(usedList) : [];
  for (const marker of Array.from(body.querySelectorAll(CITATION_SELECTOR))) {
    const index = Number(marker.querySelector(`[${CITATION_INDEX_ATTRIBUTE}]`)?.getAttribute(CITATION_INDEX_ATTRIBUTE));
    const cited = Number.isInteger(index) ? used[index - 1] : undefined;
    if (!cited) {
      marker.remove();
      continue;
    }
    const link = document.createElement("a");
    link.setAttribute(CITE_ATTRIBUTE, "");
    link.href = cited.url;
    link.dataset.title = cited.title;
    link.dataset.domain = cited.domain;
    // Turndown drops an element with no text before any rule sees it, so the link carries its source's name.
    link.textContent = cited.title || cited.domain;
    marker.replaceWith(link);
  }
  body.querySelectorAll(SOURCES_CAROUSEL_SELECTOR).forEach((carousel) => carousel.remove());

  const sections: HTMLElement[] = [];
  const unusedList = root.querySelector(UNUSED_SOURCES_SELECTOR);
  const unused = context.isOptionEnabled(UNUSED_SOURCES_OPTION) && unusedList ? readSourceList(unusedList) : [];
  if (unused.length) sections.push(afterSourcesSection(document, "Sources browsed but not used", sourceList(document, unused)));
  const thinking = context.isOptionEnabled(THINKING_OPTION) ? thinkingSection(root) : null;
  if (thinking) sections.push(thinking);
  root.replaceChildren(body, ...sections);
}

/** Prepares a copy of a panel's or a reply's content, by which of the two it is. */
function preprocessGemini(root: HTMLElement, context: ConversionContext): void {
  const body = root.querySelector(REPORT_BODY_SELECTOR);
  if (body) preprocessReport(root, body, context);
}

/** Turndown rule for the citation links {@link preprocessReport} made: each is registered and replaced by its placeholder. */
function geminiCitationRule(context: ConversionContext): TurndownService.Rule {
  return {
    filter: (node) => node.nodeName === "A" && node.hasAttribute(CITE_ATTRIBUTE),
    replacement: (_content, node) => {
      const link = node as HTMLElement;
      const domain = link.dataset.domain ?? "";
      return context.registerCitation({ url: link.getAttribute("href") ?? "", title: link.dataset.title || domain, sourceName: domain });
    },
  };
}

/**
 * The report's source list: "Sources used in the report", each marked cited
 * when some marker in the report points to it. The uncited ones are the More
 * list. Null for anything but the report panel.
 */
export function readGeminiReferences(message: Element): SourceReference[] | null {
  if (!message.matches(REPORT_PANEL_SELECTOR)) return null;
  const list = message.querySelector(USED_SOURCES_SELECTOR);
  if (!list) return null;
  const cited = new Set(citationIndexes(message.querySelector(REPORT_BODY_SELECTOR) ?? message));
  return readSourceList(list).map((source, index) => ({ ...source, cited: cited.has(index + 1) }));
}

/**
 * The research request behind the report in `message`: the prompt of the
 * turn that first proposed the research plan, not "Start research". Null for
 * anything but the report panel, or when the request isn't in the page.
 */
export function readGeminiPrompt(message: Element): string | null {
  if (!message.matches(REPORT_PANEL_SELECTOR)) return null;
  const reportTurn = findReportTurn(message);
  const request = reportTurn ? findResearchRequest(reportTurn) : null;
  return request ? readQueryText(request) || null : null;
}

export const geminiAdapter: SiteAdapter = {
  id: "gemini",
  name: "Gemini",
  // Covers the /u/<n>/ paths of a second signed-in account too.
  matches: ["https://gemini.google.com/*"],
  // The report panel, and the conversation in the left pane, which gets a copy button of its own.
  messageSelector: `${REPORT_PANEL_SELECTOR}, infinite-scroller[data-test-id="chat-history-container"]`,
  // In the panel: the report, its source lists and its thinking. In the conversation: each reply.
  contentSelector: ".response-container-content",
  // Gemini's Copy contents is in a pop-up menu, outside the report, so there's nothing for the override to stand in for.
  findButtonAnchor(message) {
    if (!message.matches(REPORT_PANEL_SELECTOR)) return null;
    const share = message.querySelector(`${TOOLBAR_ACTIONS_SELECTOR} ${SHARE_EXPORT_SELECTOR}`);
    return share?.parentElement ? { parent: share.parentElement, before: share } : null;
  },
  buttonLabel: () => ({ title: "Copy report as Markdown", text: "Report" }),
  copyButtonDescription: "Adds buttons to a Deep Research report's toolbar, next to Share & Export.",
  // The preprocess step keeps only what the copy needs, so there's nothing to strip first.
  stripSelectors: [],
  preprocess: preprocessGemini,
  turndownRules: (context) => ({ geminiCitation: geminiCitationRule(context) }),
  readReferences: readGeminiReferences,
  readPrompt: readGeminiPrompt,
  options: [
    {
      id: USED_SOURCES_OPTION,
      name: 'Include "Sources used in the report"',
      description: "Keeps the report's citations, in your citation style, and lists the sources it used without citing under More.",
      defaultEnabled: true,
      governsMoreSources: true,
    },
    {
      id: UNUSED_SOURCES_OPTION,
      name: 'Include "Sources browsed but not used"',
      description: "Adds the pages Gemini looked at but didn't use, in a section of their own after the sources.",
      defaultEnabled: false,
    },
    {
      id: THINKING_OPTION,
      name: 'Include "Show thinking"',
      description: "Adds Gemini's research steps and the pages it browsed, under Thinking at the end.",
      defaultEnabled: false,
    },
  ],
  rules: [invisibleCharactersRule, collapseBlankLinesRule],
};
