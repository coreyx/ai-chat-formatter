import { collapseBlankLinesRule, invisibleCharactersRule } from "../core/rules";
import type { SiteAdapter } from "../core/types";

/*
 * Duck.ai, DuckDuckGo's AI chat. Every selector here comes from duck.ai's
 * rendered page as inspected on 2026-10-24; none of it is a documented API.
 * Duck.ai's class names are generated hashes that change between releases, so
 * the selectors use only ids, data attributes, ARIA attributes and tag
 * structure. When Duck.ai changes its markup, this is the file to update.
 */

/** Duck.ai's own Copy button in a reply's toolbar. */
const COPY_BUTTON_SELECTOR = "button[data-copyairesponse]";

export const duckAiAdapter: SiteAdapter = {
  id: "duckai",
  name: "Duck.ai",
  // duckduckgo.com/?ia=chat redirects here, so Duck.ai opened from a search is covered too.
  matches: ["https://duck.ai/*"],
  // Each reply's id ends in "-assistant-message-<turn>-<variant>"; its heading reuses the id with a "heading-" prefix.
  messageSelector: 'div[id*="-assistant-message-"]:not([id^="heading-"])',
  // The rendered Markdown. The Reasoning panel and the Read More cards sit outside it.
  contentSelector: "[data-dark-theme]",
  nativeCopyButtonSelector: COPY_BUTTON_SELECTOR,
  // Every toolbar item has its own wrapper div in a flex row; the button goes in the row, right after Copy's wrapper.
  findButtonAnchor(message) {
    const wrapper = message.querySelector(COPY_BUTTON_SELECTOR)?.parentElement;
    return wrapper?.parentElement ? { parent: wrapper.parentElement, before: wrapper.nextSibling } : null;
  },
  stripSelectors: ['[data-streamdown="code-block-header"]', '[data-streamdown="code-block-actions"]', "[aria-live]"],
  turndownRules: () => ({}),
  rules: [invisibleCharactersRule, collapseBlankLinesRule],
};
