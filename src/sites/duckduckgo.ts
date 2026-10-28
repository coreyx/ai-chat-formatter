import type TurndownService from "turndown";
import { encodeLinkDestination, escapeLinkText, parseReferencesAttribute } from "../core/citations";
import { REFERENCES_ATTRIBUTE, REFERENCES_EVENT } from "../core/references-protocol";
import { collapseBlankLinesRule, invisibleCharactersRule } from "../core/rules";
import { ConversionError, type ConversionContext, type SiteAdapter, type SourceReference } from "../core/types";
import {
  ANSWER_SELECTOR,
  ANSWERS_SELECTOR,
  CONTENT_SELECTOR,
  EXPANDED_ANSWER_SELECTOR,
  findExploreMoreQuestions,
  QUESTION_BUTTON_SELECTOR,
  WRITING_PILL_SELECTOR,
} from "./duckduckgo-markup";
import { rewriteStreamdownCodeBlocks, rewriteStreamdownStrong } from "./streamdown";

/*
 * Search Assist, the AI answer at the top of DuckDuckGo's search results.
 * The selectors this shares with the automation are in duckduckgo-markup.ts,
 * which says where they come from; the ones only the copy needs are here.
 */

/** Search Assist's own Copy button, in the module's toolbar. */
const COPY_BUTTON_SELECTOR = 'button[aria-label="Copy to clipboard"]';

/** Marks chips that are always written inline, whatever the inline-chips option says (Explore More's). */
const INLINE_CHIP_ATTRIBUTE = "data-acf-inline-chip";

/** The option ids, stored in the settings; never rename them once released. */
const EXPLORE_MORE_OPTION = "explore-more";
const SEARCH_LINKS_OPTION = "explore-more-search-links";
const INLINE_CHIPS_OPTION = "inline-chips";

/**
 * Moves each run of chips that follows a block of paragraphs into the block's
 * last paragraph. Search Assist puts its chips in a `<span>` after the
 * paragraphs' container, where they show at the end of the text; left there,
 * their markers would copy as a paragraph of their own instead of at the end
 * of the last sentence.
 */
function attachTrailingChips(root: HTMLElement): void {
  const runs = new Set<Element>();
  for (const chip of Array.from(root.querySelectorAll("a")).filter(isSearchAssistChip)) {
    const run = chipRun(chip);
    if (run !== chip) runs.add(run);
  }
  for (const run of runs) {
    const paragraph = run.previousElementSibling?.lastElementChild;
    if (paragraph?.nodeName === "P") paragraph.append(run);
  }
}

/** The outermost `<span>` around `chip`: the run of chips it belongs to, or the chip itself when it has no wrapper. */
function chipRun(chip: Element): Element {
  let run = chip;
  while (run.parentElement?.nodeName === "SPAN") run = run.parentElement;
  return run;
}

/**
 * Moves the chips that follow the extended answer into it. Search Assist
 * shows the extended answer's last chips at the end of its text, but puts
 * them in an element after the answer's own, as seen on duckduckgo.com on
 * 2026-10-27; left there, they'd be dropped with the rest of the wrapper.
 * Each sibling that holds chips is taken in turn, stopping at the first that
 * doesn't, or that holds Explore More's questions. Placed last in the answer,
 * the runs then join its last paragraph like the short answer's chips.
 */
function adoptFollowingChips(answer: Element): void {
  for (let sibling = answer.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
    const chips = Array.from(sibling.querySelectorAll("a")).filter(isSearchAssistChip);
    if (chips.length === 0 || sibling.querySelector(QUESTION_BUTTON_SELECTOR)) return;
    answer.append(...new Set(chips.map(chipRun)));
  }
}

/**
 * The absolute URL in `element`'s `attribute`, resolved against the page's
 * address, or null when it's missing or can't be resolved. Search Assist
 * writes some URLs relative to the page: its More Search Results links
 * (`/?q=…`) and its favicons, which have no scheme (`//external-content…`).
 */
function absoluteUrl(element: Element, attribute: string): URL | null {
  const value = element.getAttribute(attribute);
  if (!value) return null;
  try {
    return new URL(value, element.ownerDocument.baseURI);
  } catch {
    return null;
  }
}

/** Whether `url` is a DuckDuckGo search, as each Explore More answer's More Search Results link is. */
function isDuckDuckGoSearch(url: URL): boolean {
  return /^(www\.)?duckduckgo\.com$/i.test(url.hostname) && url.pathname === "/" && url.searchParams.has("q");
}

/**
 * Turns one expanded answer's links into what the copy keeps. Chips are
 * marked to stay inline. The More Search Results link, which opens a new
 * search rather than citing a source, is kept only with `includeSearchLinks`:
 * it gets its absolute address and a paragraph of its own at the end of the
 * answer. Any other link that doesn't lead to a web page loses its link but
 * keeps its text, so no words go missing from the answer.
 */
function prepareExploreMoreLinks(answer: HTMLElement, includeSearchLinks: boolean): void {
  for (const link of Array.from(answer.querySelectorAll("a"))) {
    if (isSearchAssistChip(link)) {
      link.setAttribute(INLINE_CHIP_ATTRIBUTE, "");
      continue;
    }
    const url = absoluteUrl(link, "href");
    if (url && isDuckDuckGoSearch(url)) {
      link.remove();
      if (!includeSearchLinks) continue;
      link.setAttribute("href", url.href);
      const paragraph = answer.ownerDocument.createElement("p");
      paragraph.append(link);
      answer.append(paragraph);
    } else if (url && /^https?:$/.test(url.protocol)) {
      link.setAttribute("href", url.href);
    } else {
      link.replaceWith(...Array.from(link.childNodes));
    }
  }
}

/**
 * Rebuilds Search Assist's Explore More section from `root`, keeping only
 * the questions that have been expanded, each as an `<h4>` followed by its
 * answer, under the section's own `<h3>`. Returns null when the section isn't
 * there or no expanded question has an answer yet.
 *
 * The section is found by structure, not by its "Explore More" heading, so a
 * page in another language works too: it's the closest element holding every
 * question and an `<h3>` of its own (one outside the panels and the answers).
 */
function extractExploreMore(root: HTMLElement, includeSearchLinks: boolean): HTMLElement | null {
  const questions = findExploreMoreQuestions(root);
  if (questions.length === 0) return null;

  const panels = questions.map((question) => question.panel);
  const isSectionHeading = (heading: Element) => !heading.closest(ANSWERS_SELECTOR) && !panels.some((panel) => panel.contains(heading));
  let section = questions[0].button.parentElement;
  let heading: Element | undefined;
  // The wrapper itself holds the extended answer's headings too, so the search stops below it.
  while (section && section !== root) {
    if (questions.every((question) => section!.contains(question.button))) {
      heading = Array.from(section.querySelectorAll("h3")).find(isSectionHeading);
      if (heading) break;
    }
    section = section.parentElement;
  }
  if (!heading) return null;

  const document = root.ownerDocument;
  const rebuilt = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = (heading.textContent ?? "").trim();
  rebuilt.append(title);
  for (const { button, panel } of questions) {
    if (button.getAttribute("aria-expanded") !== "true" || !(panel.textContent ?? "").trim()) continue;
    const question = document.createElement("h4");
    question.textContent = (button.textContent ?? "").trim();
    const answer = document.createElement("div");
    answer.append(...Array.from(panel.childNodes));
    prepareExploreMoreLinks(answer, includeSearchLinks);
    rebuilt.append(question, answer);
  }
  return rebuilt.childElementCount > 1 ? rebuilt : null;
}

/**
 * Prepares a copy of the answers' wrapper for conversion. A half-written
 * extended answer isn't copied, so the user doesn't paste an answer that ends
 * mid-sentence. Otherwise only the short answer and the extended answer are
 * kept, in that order, followed by the expanded Explore More answers when
 * that option is on. That drops the Expand button, the More pill, the
 * unexpanded questions, the "Ask Duck.ai" box and anything DuckDuckGo adds to
 * the wrapper later. The Streamdown markup is then rewritten for Turndown,
 * and each run of chips joins the paragraph it follows.
 *
 * @throws ConversionError while the extended answer is still being written.
 */
function preprocessSearchAssist(root: HTMLElement, context: ConversionContext): void {
  if (root.querySelector(WRITING_PILL_SELECTOR)) {
    throw new ConversionError("Search Assist is still writing its answer. Copy again once it's finished.");
  }
  const expanded = root.querySelector(EXPANDED_ANSWER_SELECTOR);
  if (expanded) adoptFollowingChips(expanded);
  const answers = [root.querySelector(ANSWER_SELECTOR), expanded].filter((answer) => answer !== null);
  const exploreMore = context.isOptionEnabled(EXPLORE_MORE_OPTION) ? extractExploreMore(root, context.isOptionEnabled(SEARCH_LINKS_OPTION)) : null;
  root.replaceChildren(...answers, ...(exploreMore ? [exploreMore] : []));
  rewriteStreamdownCodeBlocks(root);
  rewriteStreamdownStrong(root);
  attachTrailingChips(root);
}

/**
 * Whether `node` is one of Search Assist's inline source chips: a link to an
 * http(s) page, wrapped in a focusable `<span>` (which names the chip's hover
 * tooltip), holding the site's favicon and its domain. Ordinary links have no
 * favicon or wrapper, so they're left to the normal link conversion.
 */
function isSearchAssistChip(node: Element): boolean {
  return (
    node.nodeName === "A" &&
    /^https?:\/\//i.test(node.getAttribute("href") ?? "") &&
    node.parentElement?.nodeName === "SPAN" &&
    node.parentElement.hasAttribute("tabindex") &&
    node.querySelector("img") !== null
  );
}

/**
 * A chip as Search Assist shows it: its favicon at 16px, then its name, the
 * two linked to the source, as `[![|16](favicon) name](url)`. `|16` is
 * Obsidian's image-size syntax; inside a table cell the `|` is escaped, or it
 * would end the cell. A chip without a web favicon is its linked name alone.
 */
function inlineChip(chip: Element): string {
  const url = chip.getAttribute("href") ?? "";
  const name = escapeLinkText((chip.textContent ?? "").trim());
  const img = chip.querySelector("img");
  const favicon = img ? absoluteUrl(img, "src") : null;
  const size = chip.closest("td, th") ? "\\|16" : "|16";
  const icon = favicon && /^https?:$/.test(favicon.protocol) ? `![${size}](${encodeLinkDestination(favicon.href)}) ` : "";
  return `${followsWhitespace(chip) ? "" : " "}[${icon}${name}](${encodeLinkDestination(url)})`;
}

/**
 * Whether the text just before `node` ends in whitespace, so a chip written
 * there needs no space of its own. The chip sits inside wrapper spans, so the
 * nearest earlier sibling of the chip or of one of its ancestors is checked.
 */
function followsWhitespace(node: Node): boolean {
  let current: Node | null = node;
  while (current && !current.previousSibling) current = current.parentNode;
  return /\s$/.test(current?.previousSibling?.textContent ?? "");
}

/**
 * Turndown rule for Search Assist's source chips. Explore More's chips, and
 * every chip while the inline-chips option is on, are written inline as
 * Search Assist shows them (see {@link inlineChip}). Otherwise each chip is
 * registered as a citation and replaced by its placeholder; the chip shows
 * only a domain, so the page title comes from the answer's data, read by the
 * page script, and without it the domain stands in.
 */
function searchAssistChipRule(context: ConversionContext): TurndownService.Rule {
  return {
    filter: (node) => isSearchAssistChip(node),
    replacement: (_content, node) => {
      const element = node as HTMLElement;
      if (element.hasAttribute(INLINE_CHIP_ATTRIBUTE) || context.isOptionEnabled(INLINE_CHIPS_OPTION)) return inlineChip(element);
      const url = element.getAttribute("href") ?? "";
      const name = (element.textContent ?? "").trim();
      const title = context.findReference(url)?.title.trim() || name;
      return context.registerCitation({ url, title, sourceName: name });
    },
  };
}

/**
 * Asks the page script (src/page/duckduckgo.ts) for the source list of the
 * Search Assist answer in `message`. Synchronous: the page script answers
 * while the event is being dispatched. The chips' sources come back cited and
 * titled; the other pages Search Assist consulted come back uncited, and are
 * the More list. Returns null when the page script isn't there or found
 * nothing, so chips fall back to their domains and More stays empty.
 */
export function readSearchAssistReferences(message: Element): SourceReference[] | null {
  message.removeAttribute(REFERENCES_ATTRIBUTE);
  message.dispatchEvent(new (message.ownerDocument.defaultView ?? window).CustomEvent(REFERENCES_EVENT, { bubbles: true }));
  const json = message.getAttribute(REFERENCES_ATTRIBUTE);
  message.removeAttribute(REFERENCES_ATTRIBUTE);
  const references = parseReferencesAttribute(json);
  return references && references.length > 0 ? references : null;
}

/**
 * Search Assist answers a search rather than a chat prompt, so the search
 * query stands in for the prompt: the `q` in the page's address, which is
 * what DuckDuckGo searched. Text typed into the search box but not yet
 * searched isn't read. Returns null when the address has no query.
 */
export function readSearchAssistPrompt(message: Element): string | null {
  const href = message.ownerDocument.defaultView?.location.href ?? message.ownerDocument.URL;
  try {
    return new URL(href).searchParams.get("q")?.trim() || null;
  } catch {
    return null;
  }
}

export const duckDuckGoAdapter: SiteAdapter = {
  id: "duckduckgo",
  name: "DuckDuckGo Search Assist",
  // Search Assist only shows on some searches, so this covers every search page; the adapter acts only where a module is.
  matches: ["https://duckduckgo.com/*"],
  messageSelector: `[data-react-module-id="wikinlp"]:has(${ANSWER_SELECTOR})`,
  // The wrapper holding the short answer and, after More, the extended answer.
  contentSelector: CONTENT_SELECTOR,
  nativeCopyButtonSelector: COPY_BUTTON_SELECTOR,
  // The toolbar is a row of bare buttons; the button goes first, right before Copy, as on Copilot and Duck.ai.
  findButtonAnchor(message) {
    const copy = message.querySelector(COPY_BUTTON_SELECTOR);
    if (!copy?.parentElement || !message.querySelector(ANSWER_SELECTOR)) return null;
    return { parent: copy.parentElement, before: copy };
  },
  // The preprocess step keeps only the two answers, so there's nothing to strip first.
  stripSelectors: [],
  preprocess: preprocessSearchAssist,
  turndownRules: (context) => ({ searchAssistChip: searchAssistChipRule(context) }),
  readReferences: readSearchAssistReferences,
  readPrompt: readSearchAssistPrompt,
  // The chips' page titles are only in React state, which src/page/duckduckgo.ts reads.
  pageScript: "duckduckgo",
  moreSources: { defaultEnabled: false, description: "Adds the other pages Search Assist consulted but doesn't show, as links without titles." },
  options: [
    {
      id: EXPLORE_MORE_OPTION,
      name: "Include expanded Explore More answers",
      description: "Adds the Explore More questions you've expanded, with their answers. Questions you haven't expanded are left out.",
      defaultEnabled: true,
    },
    {
      id: SEARCH_LINKS_OPTION,
      name: "Include More Search Results links",
      description: "Ends each expanded Explore More answer with its More Search Results link, which opens a DuckDuckGo search for that question.",
      defaultEnabled: false,
      requires: EXPLORE_MORE_OPTION,
    },
    {
      id: INLINE_CHIPS_OPTION,
      name: "Keep Search Assist's inline source chips",
      description: "Keeps each source as Search Assist shows it, icon and name linked, instead of numbered citations and a Sources section.",
      defaultEnabled: true,
      replacesSourcesSection: true,
    },
  ],
  rules: [invisibleCharactersRule, collapseBlankLinesRule],
};
