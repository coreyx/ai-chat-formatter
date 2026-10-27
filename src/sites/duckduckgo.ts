import type TurndownService from "turndown";
import { parseReferencesAttribute } from "../core/citations";
import { REFERENCES_ATTRIBUTE, REFERENCES_EVENT } from "../core/references-protocol";
import { collapseBlankLinesRule, invisibleCharactersRule } from "../core/rules";
import { ConversionError, type ConversionContext, type SiteAdapter, type SourceReference } from "../core/types";
import { rewriteStreamdownCodeBlocks, rewriteStreamdownStrong } from "./streamdown";

/*
 * Search Assist, the AI answer at the top of DuckDuckGo's search results.
 * Every selector here comes from duckduckgo.com's rendered page as inspected
 * on 2026-10-24; none of it is a documented API. The class names are
 * generated hashes that change between releases, so the selectors use only
 * data attributes, ARIA attributes and tag structure. When DuckDuckGo changes
 * its markup, this is the file to update.
 */

/** Search Assist's own Copy button, in the module's toolbar. */
const COPY_BUTTON_SELECTOR = 'button[aria-label="Copy to clipboard"]';

/** The short answer: shown clipped when collapsed, but always in the page in full. */
const ANSWER_SELECTOR = '[data-testid="duckassist-answer-content"]';

/** The extended answer, in the page only once More has been pressed. */
const EXPANDED_ANSWER_SELECTOR = '[data-testid="duckassist-expanded-answer-content"]';

/** The More pill while the extended answer is still being written; it's removed once the answer is finished. */
const WRITING_PILL_SELECTOR = '[data-testid="duckassist-stream-more-pill"][aria-label="Stop"]';

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
    // The run is the outermost <span> around the chip.
    let run: Element = chip;
    while (run.parentElement?.nodeName === "SPAN") run = run.parentElement;
    if (run !== chip) runs.add(run);
  }
  for (const run of runs) {
    const paragraph = run.previousElementSibling?.lastElementChild;
    if (paragraph?.nodeName === "P") paragraph.append(run);
  }
}

/**
 * Prepares a copy of the answers' wrapper for conversion. A half-written
 * extended answer isn't copied, so the user doesn't paste an answer that ends
 * mid-sentence. Otherwise only the short answer and the extended answer are
 * kept, in that order, which drops the Expand button, the More pill, the
 * "Ask Duck.ai" box and anything DuckDuckGo adds to the wrapper later. The
 * answers' Streamdown markup is then rewritten for Turndown, and each run of
 * chips joins the paragraph it follows.
 *
 * @throws ConversionError while the extended answer is still being written.
 */
function preprocessSearchAssist(root: HTMLElement): void {
  if (root.querySelector(WRITING_PILL_SELECTOR)) {
    throw new ConversionError("Search Assist is still writing its answer. Copy again once it's finished.");
  }
  const answers = [root.querySelector(ANSWER_SELECTOR), root.querySelector(EXPANDED_ANSWER_SELECTOR)].filter((answer) => answer !== null);
  root.replaceChildren(...answers);
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
 * Turndown rule for Search Assist's source chips. Each chip is registered as a
 * citation and replaced by its placeholder. The chip shows only a domain, so
 * the page title comes from the answer's data, read by the page script;
 * without it the domain stands in.
 */
function searchAssistChipRule(context: ConversionContext): TurndownService.Rule {
  return {
    filter: (node) => isSearchAssistChip(node),
    replacement: (_content, node) => {
      const element = node as HTMLElement;
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
  contentSelector: `div:has(> ${ANSWER_SELECTOR})`,
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
  rules: [invisibleCharactersRule, collapseBlankLinesRule],
};
