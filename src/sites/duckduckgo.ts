import { collapseBlankLinesRule, invisibleCharactersRule } from "../core/rules";
import type { SiteAdapter } from "../core/types";

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
  turndownRules: () => ({}),
  pageScript: "duckduckgo",
  moreSources: { defaultEnabled: false, description: "Adds the other pages Search Assist consulted but doesn't show, as links without titles." },
  rules: [invisibleCharactersRule, collapseBlankLinesRule],
};
