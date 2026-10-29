import type TurndownService from "turndown";
import { collapseBlankLinesRule, invisibleCharactersRule } from "../core/rules";
import { streamdownLanguageId } from "./streamdown";
import {
  AFTER_SOURCES_ATTRIBUTE,
  ConversionError,
  type ButtonAnchor,
  type ButtonLabel,
  type ConversationTurn,
  type ConversionContext,
  type SiteAdapter,
  type SourceReference,
} from "../core/types";
import {
  BROWSE_LIST_SELECTOR,
  CITATION_INDEX_ATTRIBUTE,
  CITATION_SELECTOR,
  CODE_BLOCK_SELECTOR,
  CODE_CONTENT_SELECTOR,
  CODE_LANGUAGE_SELECTOR,
  END_OF_REPORT_SELECTOR,
  GENERATED_FILE_NAME_SELECTOR,
  GENERATED_FILE_SELECTOR,
  GENERATED_FILE_TYPE_SELECTOR,
  GENERATED_IMAGE_SELECTOR,
  GENERATED_MUSIC_SELECTOR,
  findReportTurn,
  findResearchRequest,
  type GeminiSource,
  HISTORY_SELECTOR,
  MESSAGE_CONTENT_SELECTOR,
  MODEL_RESPONSE_SELECTOR,
  PLAN_SELECTOR,
  PLAN_STEP_DESCRIPTION_SELECTOR,
  PLAN_STEP_SELECTOR,
  PLAN_STEP_TITLE_SELECTOR,
  PLAN_TITLE_SELECTOR,
  readPromptText,
  readSourceList,
  REPORT_BODY_SELECTOR,
  REPORT_CARD_SELECTOR,
  REPORT_CARD_TITLE_SELECTOR,
  REPORT_PANEL_SELECTOR,
  SHARE_EXPORT_SELECTOR,
  SOURCE_LISTS_SELECTOR,
  SOURCES_CAROUSEL_SELECTOR,
  THINKING_ITEM_SELECTOR,
  THINKING_OVERLAY_SELECTOR,
  THOUGHT_BODY_SELECTOR,
  THOUGHT_HEADER_SELECTOR,
  TOOLBAR_ACTIONS_SELECTOR,
  TURN_SELECTOR,
  UNUSED_SOURCES_SELECTOR,
  USED_SOURCES_SELECTOR,
  USER_QUERY_SELECTOR,
  VIDEO_PLAYER_SELECTOR,
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
export const CONVERSATION_BUTTON_OPTION = "conversation-button";
export const REPORT_PROMPT_OPTION = "report-prompt";

/** How the two buttons name themselves. The report's title also finds its button, which the conversation's goes before. */
const REPORT_LABEL: ButtonLabel = { title: "Copy report as Markdown", text: "Report" };
const CONVERSATION_LABEL: ButtonLabel = { title: "Copy conversation as Markdown", text: "Conversation" };

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

/** What separates a table cell's paragraphs in the copy: Markdown tables allow no line breaks, and Obsidian shows `<br>` as one inside a cell. */
const CELL_LINE_BREAK = "<br>";

/**
 * Puts each table cell in `root` on one line. Gemini wraps a cell's text in
 * `<p>` (sometimes more than one), as seen on gemini.google.com on
 * 2026-10-28; Turndown writes paragraphs on lines of their own, which splits
 * the row. Each paragraph or `<div>` is unwrapped, with a `<br>` before every
 * one after the first, and each `<br>` in a cell becomes the same literal.
 */
function flattenTableCells(root: Element): void {
  const document = root.ownerDocument;
  for (const cell of Array.from(root.querySelectorAll("td, th"))) {
    cell.querySelectorAll("br").forEach((br) => br.replaceWith(document.createTextNode(CELL_LINE_BREAK)));
    let blocks = Array.from(cell.querySelectorAll(":scope > p, :scope > div"));
    // Unwrapping exposes any paragraphs nested a level down, so it repeats until none are left.
    while (blocks.length) {
      blocks.forEach((block, index) => {
        const separator = index > 0 || block.previousSibling?.textContent?.trim() ? [document.createTextNode(CELL_LINE_BREAK)] : [];
        block.replaceWith(...separator, ...Array.from(block.childNodes));
      });
      blocks = Array.from(cell.querySelectorAll(":scope > p, :scope > div"));
    }
  }
}

/**
 * Rewrites each of Gemini's code blocks in `root` as `<pre><code>` that
 * Turndown fences, tagged with the language its header shows ("Python"
 * becomes `python`; "Text" gives no tag). The header, with its download and
 * copy buttons, is dropped. A block without a header, as in reports, keeps a
 * plain fence.
 */
function rewriteCodeBlocks(root: Element): void {
  const document = root.ownerDocument;
  for (const block of Array.from(root.querySelectorAll(CODE_BLOCK_SELECTOR))) {
    const source = block.querySelector(CODE_CONTENT_SELECTOR) ?? block.querySelector("pre code, pre");
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    const language = streamdownLanguageId(block.querySelector(CODE_LANGUAGE_SELECTOR)?.textContent);
    if (language) code.className = `language-${language}`;
    code.textContent = source?.textContent ?? "";
    pre.append(code);
    block.replaceWith(pre);
  }
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
  rewriteCodeBlocks(body);
  flattenTableCells(body);

  const sections: HTMLElement[] = [];
  const unusedList = root.querySelector(UNUSED_SOURCES_SELECTOR);
  const unused = context.isOptionEnabled(UNUSED_SOURCES_OPTION) && unusedList ? readSourceList(unusedList) : [];
  if (unused.length) sections.push(afterSourcesSection(document, "Sources browsed but not used", sourceList(document, unused)));
  const thinking = context.isOptionEnabled(THINKING_OPTION) ? thinkingSection(root) : null;
  if (thinking) sections.push(thinking);
  root.replaceChildren(body, ...sections);
}

/**
 * The research plan card as the copy writes it: its title in bold, then a
 * numbered list of its steps, each step's title in bold with the lines of its
 * description as a list under it, so the plan stays a tight list. The time
 * estimate and the buttons are left out.
 */
function rewritePlan(plan: Element): HTMLElement {
  const document = plan.ownerDocument;
  const rebuilt = document.createElement("div");
  const title = (plan.querySelector(PLAN_TITLE_SELECTOR)?.textContent ?? "").trim();
  if (title) rebuilt.append(paragraph(document, title, true));
  const steps = document.createElement("ol");
  for (const step of Array.from(plan.querySelectorAll(PLAN_STEP_SELECTOR))) {
    const item = document.createElement("li");
    const stepTitle = (step.querySelector(PLAN_STEP_TITLE_SELECTOR)?.textContent ?? "").trim();
    if (stepTitle) {
      const strong = document.createElement("strong");
      strong.textContent = stepTitle;
      item.append(strong);
    }
    const description = step.querySelector(PLAN_STEP_DESCRIPTION_SELECTOR)?.textContent ?? "";
    const lines = description
      .split("\n")
      .map((text) => text.trim())
      .filter(Boolean);
    if (lines.length) {
      const list = document.createElement("ul");
      for (const line of lines) {
        const entry = document.createElement("li");
        entry.textContent = line;
        list.append(entry);
      }
      item.append(list);
    }
    if (item.childNodes.length) steps.append(item);
  }
  if (steps.childElementCount) rebuilt.append(steps);
  return rebuilt;
}

/** The report card as a line naming the report; the report itself is the Report button's copy. */
function rewriteReportCard(card: Element): HTMLElement {
  const line = paragraph(card.ownerDocument, "Deep Research report: ");
  const title = card.ownerDocument.createElement("em");
  title.textContent = (card.querySelector(REPORT_CARD_TITLE_SELECTOR)?.textContent ?? "").trim();
  line.append(title);
  return line;
}

/** Marks the paragraphs {@link rewriteGeneratedItems} writes, so those outside a reply's text can be found again. */
const GENERATED_ATTRIBUTE = "data-acf-gemini-generated";

/**
 * Names each thing Gemini made in `root`, in its place, as a paragraph of
 * text: a file as `Generated file: *name* (TYPE)`, and an image, music or a
 * video as `*Generated image*`, `*Generated music*` or `*Generated video*`.
 * Nothing is linked or embedded: the addresses are Google's, and may need a
 * sign-in or stop working. Music plays in a `video-player` of its own, so
 * it's named before any player left over is taken for a video.
 */
function rewriteGeneratedItems(root: Element): void {
  const document = root.ownerDocument;
  /** A marked paragraph: `prefix`, then `name` in italics, then `suffix`. */
  const line = (prefix: string, name: string, suffix = ""): HTMLParagraphElement => {
    const element = paragraph(document, prefix);
    element.setAttribute(GENERATED_ATTRIBUTE, "");
    const emphasis = document.createElement("em");
    emphasis.textContent = name;
    element.append(emphasis, suffix);
    return element;
  };
  for (const file of Array.from(root.querySelectorAll(GENERATED_FILE_SELECTOR))) {
    const name = (file.querySelector(GENERATED_FILE_NAME_SELECTOR)?.textContent ?? "").trim() || "file";
    const type = (file.querySelector(GENERATED_FILE_TYPE_SELECTOR)?.textContent ?? "").trim();
    file.replaceWith(line("Generated file: ", name, type ? ` (${type})` : ""));
  }
  root.querySelectorAll(GENERATED_IMAGE_SELECTOR).forEach((image) => image.replaceWith(line("", "Generated image")));
  root.querySelectorAll(GENERATED_MUSIC_SELECTOR).forEach((music) => music.replaceWith(line("", "Generated music")));
  root.querySelectorAll(VIDEO_PLAYER_SELECTOR).forEach((video) => video.replaceWith(line("", "Generated video")));
}

/**
 * Prepares a copy of one reply in the left pane: only its text is kept, with
 * the things Gemini made named in it (see {@link rewriteGeneratedItems}; any
 * outside the text follow it, in page order), and Gemini's own "Show
 * thinking", the source carousels, citation markers (which carry no link
 * outside a report) and buttons dropped. The research plan card
 * and the report card are rewritten (see {@link rewritePlan} and
 * {@link rewriteReportCard}).
 */
function preprocessReply(root: HTMLElement): void {
  rewriteGeneratedItems(root);
  const content = root.querySelector(MESSAGE_CONTENT_SELECTOR);
  if (content) {
    const outside = Array.from(root.querySelectorAll(`[${GENERATED_ATTRIBUTE}]`)).filter((item) => !content.contains(item));
    root.replaceChildren(content, ...outside);
  }
  for (const selector of [THINKING_OVERLAY_SELECTOR, SOURCES_CAROUSEL_SELECTOR, CITATION_SELECTOR, "button", "gem-button"]) {
    root.querySelectorAll(selector).forEach((element) => element.remove());
  }
  root.querySelectorAll(PLAN_SELECTOR).forEach((plan) => plan.replaceWith(rewritePlan(plan)));
  root.querySelectorAll(REPORT_CARD_SELECTOR).forEach((card) => card.replaceWith(rewriteReportCard(card)));
  rewriteCodeBlocks(root);
  flattenTableCells(root);
}

/** Prepares a copy of a panel's or a reply's content, by which of the two it is. */
function preprocessGemini(root: HTMLElement, context: ConversionContext): void {
  const body = root.querySelector(REPORT_BODY_SELECTOR);
  if (body) preprocessReport(root, body, context);
  else preprocessReply(root);
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
 * turn that first proposed the research plan, not "Start research". Null
 * unless **Copy the research request with the report** is on (it starts off),
 * for anything but the report panel, or when the request isn't in the page.
 */
export function readGeminiPrompt(message: Element, isOptionEnabled?: (id: string) => boolean): string | null {
  if (!message.matches(REPORT_PANEL_SELECTOR) || !(isOptionEnabled?.(REPORT_PROMPT_OPTION) ?? false)) return null;
  const reportTurn = findReportTurn(message);
  const request = reportTurn ? findResearchRequest(reportTurn) : null;
  return request ? readPromptText(request) || null : null;
}

/**
 * The conversation in the left pane, one turn per prompt and reply, in order.
 * Null for the report panel, which is copied as a single report.
 *
 * Only the turns in the page are read. Gemini loads a long conversation's
 * early turns only once it's scrolled up (10 of 12 turns on opening, as
 * inspected on 2026-10-28), and nothing in the page marks that some are
 * missing, so a copy made before scrolling up starts at the first loaded turn.
 */
export function readGeminiTurns(message: Element): ConversationTurn[] | null {
  if (!message.matches(HISTORY_SELECTOR)) return null;
  return Array.from(message.querySelectorAll(TURN_SELECTOR), (turn) => {
    const query = turn.querySelector(USER_QUERY_SELECTOR);
    return { prompt: query ? readPromptText(query) || null : null, reply: turn.querySelector(MODEL_RESPONSE_SELECTOR) ?? turn };
  });
}

/**
 * Where a button goes: in the open report panel's toolbar, the report's right
 * before Share & Export and the conversation's before the report's, so they
 * always read Conversation, Report, Share & Export. The conversation's button
 * shows only while its option is on and a report panel is open.
 */
function findGeminiButtonAnchor(message: Element, isOptionEnabled?: (id: string) => boolean): ButtonAnchor | null {
  const isReport = message.matches(REPORT_PANEL_SELECTOR);
  if (!isReport && !(isOptionEnabled?.(CONVERSATION_BUTTON_OPTION) ?? true)) return null;
  const panel = isReport ? message : message.ownerDocument.querySelector(REPORT_PANEL_SELECTOR);
  const share = panel?.querySelector(`${TOOLBAR_ACTIONS_SELECTOR} ${SHARE_EXPORT_SELECTOR}`);
  if (!share?.parentElement) return null;
  const reportButton = isReport ? null : share.parentElement.querySelector(`:scope > [data-acf-injected][title="${REPORT_LABEL.title}"]`);
  return { parent: share.parentElement, before: reportButton ?? share };
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
  findButtonAnchor: findGeminiButtonAnchor,
  buttonLabel: (message) => (message.matches(REPORT_PANEL_SELECTOR) ? REPORT_LABEL : CONVERSATION_LABEL),
  copyButtonDescription: "Adds buttons to a Deep Research report's toolbar, next to Share & Export.",
  // The preprocess step keeps only what the copy needs, so there's nothing to strip first.
  stripSelectors: [],
  preprocess: preprocessGemini,
  turndownRules: (context) => ({ geminiCitation: geminiCitationRule(context) }),
  readReferences: readGeminiReferences,
  readPrompt: readGeminiPrompt,
  readTurns: readGeminiTurns,
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
    {
      id: REPORT_PROMPT_OPTION,
      name: "Copy the research request with the report",
      description: 'Starts the report copy with the prompt that asked for the research. Needs "Copy the prompt with the response" on too. The Conversation copy always has its prompts.',
      defaultEnabled: false,
    },
    {
      id: CONVERSATION_BUTTON_OPTION,
      name: "Show a Copy conversation button",
      description: "Adds a Conversation button before Report that copies the whole conversation on the left: your prompts, the research plan and Gemini's replies.",
      defaultEnabled: true,
    },
  ],
  rules: [invisibleCharactersRule, collapseBlankLinesRule],
};
