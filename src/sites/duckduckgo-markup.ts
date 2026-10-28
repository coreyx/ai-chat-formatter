/*
 * What the extension knows about Search Assist's markup, shared by the copy
 * (duckduckgo.ts) and the automation (duckduckgo-automation.ts). Every
 * selector comes from duckduckgo.com's rendered page as inspected on
 * 2026-10-24 and 2026-10-27; none of it is a documented API. The class names
 * are generated hashes that change between releases, so the selectors use
 * only data attributes, ARIA attributes and tag structure. When DuckDuckGo
 * changes its markup, this is the file to update.
 */

/** The short answer: shown clipped when collapsed, but always in the page in full. */
export const ANSWER_SELECTOR = '[data-testid="duckassist-answer-content"]';

/** The extended answer, in the page only once More has been pressed. */
export const EXPANDED_ANSWER_SELECTOR = '[data-testid="duckassist-expanded-answer-content"]';

/** Either answer, for telling the answers' own markup from the rest of the wrapper. */
export const ANSWERS_SELECTOR = `${ANSWER_SELECTOR}, ${EXPANDED_ANSWER_SELECTOR}`;

/** The wrapper holding the short answer and, after More, the extended answer and Explore More. */
export const CONTENT_SELECTOR = `div:has(> ${ANSWER_SELECTOR})`;

/** The More pill while the extended answer is still being written; it's removed once the answer is finished. */
export const WRITING_PILL_SELECTOR = '[data-testid="duckassist-stream-more-pill"][aria-label="Stop"]';

/** The More pill before it's pressed. It's only there once the answer is expanded. */
export const MORE_PILL_SELECTOR = '[data-testid="duckassist-stream-more-pill"][aria-label="More"]';

/** The button that expands a collapsed answer; it's gone once the answer is expanded. */
export const EXPAND_BUTTON_SELECTOR = 'button[aria-label="Expand content"]';

/**
 * An Explore More question, inspected on 2026-10-27: a button naming its
 * answer's panel, which stays empty until the question is expanded. The
 * wrapper also holds other `aria-expanded` buttons, but they control no panel
 * in it.
 */
export const QUESTION_BUTTON_SELECTOR = "button[aria-expanded][aria-controls]";

/** One Explore More question: its button, and the panel its answer appears in. */
export interface ExploreMoreQuestion {
  button: Element;
  panel: Element;
}

/** The element in `root` whose id is `id`; a clone being converted is detached, so `getElementById` can't reach it. */
export function findById(root: Element, id: string): Element | null {
  return Array.from(root.querySelectorAll("[id]")).find((element) => element.id === id) ?? null;
}

/**
 * The Explore More questions in `root` (the answers' wrapper), in page order:
 * question buttons outside the answers whose panel is inside `root`.
 */
export function findExploreMoreQuestions(root: Element): ExploreMoreQuestion[] {
  return Array.from(root.querySelectorAll(QUESTION_BUTTON_SELECTOR))
    .filter((button) => !button.closest(ANSWERS_SELECTOR))
    .map((button) => ({ button, panel: findById(root, button.getAttribute("aria-controls") ?? "") }))
    .filter((question): question is ExploreMoreQuestion => question.panel !== null);
}
