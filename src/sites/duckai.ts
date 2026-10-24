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
  preprocess: rewriteDuckAiCodeBlocks,
  turndownRules: () => ({}),
  rules: [invisibleCharactersRule, collapseBlankLinesRule],
};
