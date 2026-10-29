import { sourceDomain } from "../core/citations";

/*
 * What the extension knows about Gemini's markup, shared by the report copy
 * and the conversation copy (gemini.ts). Every selector comes from
 * gemini.google.com's rendered page as inspected on 2026-10-28, on a finished
 * Deep Research conversation and, for the selectors from "A reply's toolbar"
 * on, on ordinary chats the same day; none of it is a documented API. Gemini is an
 * Angular app: its custom element names, `data-test-id` attributes and plain
 * class names are used, never the generated `_ngcontent-*` or `ng-tns-*` ones.
 * When Gemini changes its markup, this is the file to update.
 */

/** The panel a Deep Research report opens in, beside the chat. */
export const REPORT_PANEL_SELECTOR = "deep-research-immersive-panel";

/** The report's title in the panel's toolbar; the same text as its card in the chat. */
export const PANEL_TITLE_SELECTOR = "h2.title-text";

/** The panel toolbar's buttons on the right: Contents, Share & Export, Create and Close. */
export const TOOLBAR_ACTIONS_SELECTOR = ".action-buttons";

/** The Share & Export button, which the extension's buttons go before. */
export const SHARE_EXPORT_SELECTOR = 'button[data-test-id="export-menu-button"]';

/** The report's own text, with its headings, tables, code and citation markers. */
export const REPORT_BODY_SELECTOR = "#extended-response-markdown-content";

/** An empty marker after the report's text; with the source lists, the sign the report is finished. */
export const END_OF_REPORT_SELECTOR = ".end-of-report-marker";

/** The "Sources used in the report" and "Sources browsed but not used" lists, below the report. */
export const SOURCE_LISTS_SELECTOR = "deep-research-source-lists";

/** "Sources used in the report": in the page in full even while collapsed. Citation markers index into it. */
export const USED_SOURCES_SELECTOR = ".source-list.used-sources";

/** "Sources browsed but not used": in the page in full even while collapsed. */
export const UNUSED_SOURCES_SELECTOR = ".source-list.unused-sources";

/** A citation marker: an empty `<sup>` inside it carries the source's 1-based position in the used list. */
export const CITATION_SELECTOR = "source-footnote";

/** The attribute on a citation marker's `<sup>` naming its source's position in the used list, from 1. */
export const CITATION_INDEX_ATTRIBUTE = "data-turn-source-index";

/** The chevron after a paragraph that opens a carousel of its sources; it holds no links until opened. */
export const SOURCES_CAROUSEL_SELECTOR = "sources-carousel-inline";

/** Each step under "Show thinking", in order; in the page even while collapsed. */
export const THINKING_ITEM_SELECTOR = ".thinking-panel > .item-container";

/** A thinking step's heading and its text, both plain text. */
export const THOUGHT_HEADER_SELECTOR = '[data-test-id="thought-header"]';
export const THOUGHT_BODY_SELECTOR = '[data-test-id="thought-body"]';

/** A thinking step that lists the pages Gemini browsed, as chips. */
export const BROWSE_LIST_SELECTOR = "browse-chip-list";

/** The conversation in the left pane. A long conversation's older turns load only as it's scrolled up, with no marker for the ones still missing. */
export const HISTORY_SELECTOR = 'infinite-scroller[data-test-id="chat-history-container"]';

/** One turn of the conversation: a prompt and Gemini's reply. */
export const TURN_SELECTOR = ".conversation-container";

/** A turn's prompt, and its text inside it. */
export const USER_QUERY_SELECTOR = "user-query";
export const QUERY_TEXT_SELECTOR = ".query-text";

/** A turn's reply. */
export const MODEL_RESPONSE_SELECTOR = "model-response";

/** A reply's text, in the left pane. */
export const MESSAGE_CONTENT_SELECTOR = "message-content";

/** Labels only screen readers see, such as the "You said" before each prompt. */
export const VISUALLY_HIDDEN_SELECTOR = ".cdk-visually-hidden";

/** A reply's own "Show thinking", in the left pane. */
export const THINKING_OVERLAY_SELECTOR = "thinking-overlay";

/** The research plan card, inside the reply that proposes it. */
export const PLAN_SELECTOR = "deep-research-confirmation-widget";

/** The plan's title, its steps, and each step's title and description (clipped on screen by CSS, but complete in the page). */
export const PLAN_TITLE_SELECTOR = '[data-test-id="title"]';
export const PLAN_STEP_SELECTOR = ".research-step";
export const PLAN_STEP_TITLE_SELECTOR = ".research-step-title";
export const PLAN_STEP_DESCRIPTION_SELECTOR = ".research-step-description";

/** The card in the chat that opens a finished report, and its title. */
export const REPORT_CARD_SELECTOR = "immersive-entry-chip";
export const REPORT_CARD_TITLE_SELECTOR = ".card-title";

/** A reply's Copy button in its toolbar, which the extension's button goes before. An image-only reply's toolbar has none. */
export const REPLY_COPY_SELECTOR = "message-actions copy-button";

/** The button inside it, for the override. A generated image has a `copy-button` of its own, outside `message-actions`. */
export const NATIVE_COPY_BUTTON_SELECTOR = "message-actions copy-button button";

/** A reply's toolbar buttons: thumbs up and down, Redo, Copy (or Share, for an image), and the more menu. */
export const REPLY_TOOLBAR_SELECTOR = "message-actions .buttons-container-v2";

/** The toolbar's Share button, which an image-only reply shows where others show Copy. */
export const REPLY_SHARE_SELECTOR = "share-button";

/** The ⋮ "Open menu for conversation" button in the top bar, which the Conversation button goes before. */
export const CONVERSATION_MENU_SELECTOR = "conversation-actions-icon";

/** A code block: a header with the language and the download and copy buttons, then the code. */
export const CODE_BLOCK_SELECTOR = "code-block";

/** The language a code block's header shows ("Python"). */
export const CODE_LANGUAGE_SELECTOR = ".code-block-decoration > span";

/** A code block's code, with real newlines. */
export const CODE_CONTENT_SELECTOR = 'code[data-test-id="code-content"]';

/** A chip naming the source of a passage (in the chats inspected, an uploaded file), with no link. */
export const INLINE_SOURCE_CHIP_SELECTOR = "source-inline-chip";

/** A file attached to a prompt, outside the prompt's text, and its name (without its extension) and type ("PDF"). */
export const UPLOADED_FILE_SELECTOR = '[data-test-id="uploaded-file"]';
export const FILENAME_LABEL_SELECTOR = '[data-test-id="filename-label"]';
export const EXTENSION_LABEL_SELECTOR = '[data-test-id="extension-label"]';

/** A file Gemini made, and its name and type ("JSON"). */
export const GENERATED_FILE_SELECTOR = "generated-file";
export const GENERATED_FILE_NAME_SELECTOR = ".file-name-lr";
export const GENERATED_FILE_TYPE_SELECTOR = ".file-type-lr";

/** An image Gemini made, with its own Share, Copy and Download buttons. */
export const GENERATED_IMAGE_SELECTOR = "generated-image";

/** Music Gemini made: a `video-player` inside it plays the track. */
export const GENERATED_MUSIC_SELECTOR = "generated-music";

/** A video Gemini made, playing in a `video-player` of its own, with its own Share and Download buttons (seen on 2026-10-28). */
export const GENERATED_VIDEO_SELECTOR = "generated-video";

/** A video player. One outside `generated-music` and `generated-video` is taken for a video Gemini made too. */
export const VIDEO_PLAYER_SELECTOR = "video-player";

/** One entry of a source list or a browsing step, as Gemini shows it. */
export interface GeminiSource {
  url: string;
  title: string;
  domain: string;
}

/** `element`'s text with its runs of whitespace collapsed, as the page shows it. */
function shownText(element: Element | null | undefined): string {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * The sources in `list` (a source list or a browsing step), in order: each
 * link to an http(s) page, with its title and domain as shown. When no domain
 * is shown, the URL's host stands in.
 */
export function readSourceList(list: Element): GeminiSource[] {
  const sources: GeminiSource[] = [];
  for (const link of Array.from(list.querySelectorAll("a[href]"))) {
    const url = link.getAttribute("href") ?? "";
    if (!/^https?:\/\//i.test(url)) continue;
    const title = shownText(link.querySelector('.sub-title, [data-test-id="title"]'));
    const domain = shownText(link.querySelector('.display-name, [data-test-id="domain-name"]')) || sourceDomain(url);
    sources.push({ url, title, domain });
  }
  return sources;
}

/**
 * A prompt's text, as typed: each `p.query-text-line` is a line, and a line
 * holding only a `<br>` is the blank line between paragraphs. A numbered list
 * comes back as `N. item` lines, following its `start`, and a bulleted one as
 * `- item`. The "You said" label for screen readers is left out. Lines are
 * joined with `\n` and paragraphs with `\n\n`.
 */
export function readQueryText(userQuery: Element): string {
  const root = (userQuery.querySelector(QUERY_TEXT_SELECTOR) ?? userQuery).cloneNode(true) as Element;
  root.querySelectorAll(VISUALLY_HIDDEN_SELECTOR).forEach((hidden) => hidden.remove());
  const lines: string[] = [];
  for (const child of Array.from(root.children)) {
    if (child.nodeName === "OL" || child.nodeName === "UL") {
      const start = Number(child.getAttribute("start") ?? 1) || 1;
      Array.from(child.querySelectorAll(":scope > li")).forEach((item, index) => {
        lines.push(`${child.nodeName === "OL" ? `${start + index}.` : "-"} ${shownText(item)}`);
      });
    } else {
      lines.push((child.textContent ?? "").trim());
    }
  }
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** `text` with the characters that would start emphasis or a link in Markdown escaped. */
function escapeInline(text: string): string {
  return text.replace(/[\\*_[\]]/g, "\\$&");
}

/**
 * The files attached to a prompt, as the copy names them: `*name* (TYPE)`,
 * the name and type as Gemini shows them (the name without its extension).
 * An attachment that shows only a picture is `*image*`; the type is left off
 * when none is shown.
 */
function readAttachments(userQuery: Element): string[] {
  return Array.from(userQuery.querySelectorAll(UPLOADED_FILE_SELECTOR), (file) => {
    const name = shownText(file.querySelector(FILENAME_LABEL_SELECTOR)) || "image";
    const type = shownText(file.querySelector(EXTENSION_LABEL_SELECTOR));
    return `*${escapeInline(name)}*${type ? ` (${type})` : ""}`;
  });
}

/**
 * A prompt as the copy writes it: its text (see {@link readQueryText}), then,
 * when files were attached, a paragraph naming them, `Attached: *a* (PDF),
 * *b* (PDF)`. The files are named, not linked: their addresses are Google's
 * and may need a sign-in. A prompt of attachments alone is that paragraph.
 */
export function readPromptText(userQuery: Element): string {
  const text = readQueryText(userQuery);
  const attachments = readAttachments(userQuery);
  const attached = attachments.length ? `Attached: ${attachments.join(", ")}` : "";
  return [text, attached].filter(Boolean).join("\n\n");
}

/**
 * The turn whose report card opens the report in `panel`: the card with the
 * same title as the panel's toolbar. When no title matches, the last turn
 * with a report card stands in. Null when the conversation has no card.
 */
export function findReportTurn(panel: Element): Element | null {
  const title = shownText(panel.querySelector(PANEL_TITLE_SELECTOR));
  const withCard = Array.from(panel.ownerDocument.querySelectorAll(TURN_SELECTOR)).filter((turn) => turn.querySelector(REPORT_CARD_SELECTOR));
  return withCard.find((turn) => shownText(turn.querySelector(`${REPORT_CARD_SELECTOR} ${REPORT_CARD_TITLE_SELECTOR}`)) === title) ?? withCard.at(-1) ?? null;
}

/**
 * The prompt that asked for the research behind `reportTurn`. Going back
 * from that turn, the first run of turns holding a research plan is the
 * request and its revisions ("Edit plan"); the earliest of them asked for the
 * research, so its prompt is the one returned. "Start research", in the
 * report's own turn, is passed over. Null when no turn before it holds a plan.
 */
export function findResearchRequest(reportTurn: Element): Element | null {
  const turns = Array.from(reportTurn.ownerDocument.querySelectorAll(TURN_SELECTOR));
  let earliest: Element | null = null;
  for (let index = turns.indexOf(reportTurn); index >= 0; index--) {
    if (turns[index].querySelector(PLAN_SELECTOR)) earliest = turns[index];
    else if (earliest) break;
  }
  return earliest?.querySelector(USER_QUERY_SELECTOR) ?? null;
}
