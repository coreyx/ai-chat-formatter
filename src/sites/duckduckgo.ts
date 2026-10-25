import { collapseBlankLinesRule, invisibleCharactersRule } from "../core/rules";
import { ConversionError, type SiteAdapter } from "../core/types";
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
 * Prepares a copy of the answers' wrapper for conversion. A half-written
 * extended answer isn't copied, so the user doesn't paste an answer that ends
 * mid-sentence. Otherwise only the short answer and the extended answer are
 * kept, in that order, which drops the Expand button, the More pill, the
 * "Ask Duck.ai" box and anything DuckDuckGo adds to the wrapper later. The
 * answers' Streamdown markup is then rewritten for Turndown.
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
  turndownRules: () => ({}),
  pageScript: "duckduckgo",
  moreSources: { defaultEnabled: false, description: "Adds the other pages Search Assist consulted but doesn't show, as links without titles." },
  rules: [invisibleCharactersRule, collapseBlankLinesRule],
};
