import type { SiteAutomation } from "../core/types";
import {
  CONTENT_SELECTOR,
  EXPAND_BUTTON_SELECTOR,
  EXPANDED_ANSWER_SELECTOR,
  findExploreMoreQuestions,
  MORE_PILL_SELECTOR,
  WRITING_PILL_SELECTOR,
} from "./duckduckgo-markup";

/*
 * Search Assist's optional automation: pressing More, and opening each
 * Explore More question, so a copy has everything without the user clicking.
 * The clicks are the page's own buttons, one at a time, with randomized
 * pauses like a person's, so DuckDuckGo gets no burst of requests.
 */

/** The option and choice ids, stored in the settings; never rename them once released. */
export const AUTO_MORE_OPTION = "auto-more";
export const AUTO_EXPLORE_MORE_OPTION = "auto-explore-more";
export const PACING_CHOICE = "automation-pacing";

/** A pause range in milliseconds, from its shortest to its longest. */
type Range = readonly [number, number];

/** How one pacing choice spaces the clicks. */
interface Pacing {
  /** The pause before the first click of a run. */
  first: Range;
  /** The pause between one click and the next. */
  between: Range;
  /** Whether each question's answer is waited for before the pause to the next. */
  waitForAnswers: boolean;
}

/** The pacing for each value of the pacing choice; the values are stored, so never rename them. */
export const PACING: Record<"unhurried" | "brisk" | "random", Pacing> = {
  unhurried: { first: [1000, 2500], between: [1500, 4000], waitForAnswers: true },
  brisk: { first: [500, 1500], between: [500, 1500], waitForAnswers: true },
  random: { first: [500, 2000], between: [500, 2000], waitForAnswers: false },
};

/** How often a wait for something on the page checks again. */
const POLL_MS = 200;
/** How long a hidden page is left before checking again whether it's showing. */
const HIDDEN_POLL_MS = 500;
/** How long the More button gets to appear after the answer is expanded. */
const MORE_PILL_TIMEOUT_MS = 3000;
/** How long a question's answer gets to load before the automation moves on. */
const ANSWER_TIMEOUT_MS = 10000;

/** What the automation has done for one Search Assist module, so each step happens once. */
interface ModuleState {
  /** Whether More has been pressed for this module, or the attempt started. */
  morePressed: boolean;
  /** Whether a run through the Explore More questions is underway. */
  expanding: boolean;
  /** Question buttons already opened, or found open; they're never clicked again, so one the user closes stays closed. */
  handled: WeakSet<Element>;
}

const states = new WeakMap<Element, ModuleState>();

/** `message`'s state, created on first use. */
function stateOf(message: Element): ModuleState {
  let state = states.get(message);
  if (!state) {
    state = { morePressed: false, expanding: false, handled: new WeakSet() };
    states.set(message, state);
  }
  return state;
}

/** The pacing the user chose, or Unhurried for a value this version doesn't know. */
function pacingOf(automation: SiteAutomation): Pacing {
  return PACING[automation.choice(PACING_CHOICE) as keyof typeof PACING] ?? PACING.unhurried;
}

/** Waits a random time within `range`. */
function pause(automation: SiteAutomation, [min, max]: Range): Promise<void> {
  return automation.sleep(Math.round(min + automation.random() * (max - min)));
}

/**
 * Waits until the page is showing, and returns whether `option` is still on
 * and `message` still on the page, so the next click should go ahead.
 */
async function readyToClick(automation: SiteAutomation, option: string, message: Element): Promise<boolean> {
  while (!automation.isPageVisible()) {
    if (!automation.isOptionEnabled(option)) return false;
    await automation.sleep(HIDDEN_POLL_MS);
  }
  return automation.isOptionEnabled(option) && message.isConnected;
}

/** Checks `probe` every {@link POLL_MS} until it returns something, for up to `timeoutMs`; null if it never does. */
async function waitFor<T>(automation: SiteAutomation, probe: () => T | null, timeoutMs: number): Promise<T | null> {
  for (let waited = 0; ; waited += POLL_MS) {
    const found = probe();
    if (found || waited >= timeoutMs) return found;
    await automation.sleep(POLL_MS);
  }
}

/** Whether the extended answer is there or being written, which means More has been pressed, by the user or by us. */
function morePressedOnPage(message: Element): boolean {
  return message.querySelector(EXPANDED_ANSWER_SELECTOR) !== null || message.querySelector(WRITING_PILL_SELECTOR) !== null;
}

/**
 * Presses More: expands the answer first when it's collapsed, since the More
 * button only appears then. Each click waits for the page to be showing and
 * checks the option is still on. Stops if the user presses More meanwhile, or
 * if the More button never appears.
 */
async function pressMore(message: Element, automation: SiteAutomation): Promise<void> {
  if (!(await readyToClick(automation, AUTO_MORE_OPTION, message))) return;
  await pause(automation, pacingOf(automation).first);
  if (!(await readyToClick(automation, AUTO_MORE_OPTION, message)) || morePressedOnPage(message)) return;
  const expand = message.querySelector<HTMLElement>(EXPAND_BUTTON_SELECTOR);
  if (expand) {
    expand.click();
    await pause(automation, pacingOf(automation).between);
    if (!(await readyToClick(automation, AUTO_MORE_OPTION, message)) || morePressedOnPage(message)) return;
  }
  const more = await waitFor(automation, () => message.querySelector<HTMLElement>(MORE_PILL_SELECTOR), MORE_PILL_TIMEOUT_MS);
  if (more && !morePressedOnPage(message)) more.click();
}

/**
 * Opens the Explore More questions not handled yet, in page order, one at a
 * time. A question that's already open is only recorded. With a waiting
 * pacing, each answer is given time to load before the pause to the next
 * click. The questions are found afresh before each click, so the run follows
 * the page as it changes.
 */
async function expandQuestions(message: Element, automation: SiteAutomation, state: ModuleState): Promise<void> {
  if (!(await readyToClick(automation, AUTO_EXPLORE_MORE_OPTION, message))) return;
  await pause(automation, pacingOf(automation).first);
  for (;;) {
    const wrapper = message.querySelector(CONTENT_SELECTOR);
    const next = wrapper && findExploreMoreQuestions(wrapper).find((question) => !state.handled.has(question.button));
    if (!next) return;
    if (next.button.getAttribute("aria-expanded") === "true") {
      state.handled.add(next.button);
      continue;
    }
    if (!(await readyToClick(automation, AUTO_EXPLORE_MORE_OPTION, message))) return;
    state.handled.add(next.button);
    (next.button as HTMLElement).click();
    const pacing = pacingOf(automation);
    if (pacing.waitForAnswers) await waitFor(automation, () => (next.panel.textContent ?? "").trim() || null, ANSWER_TIMEOUT_MS);
    const anotherLeft = findExploreMoreQuestions(wrapper).some((question) => !state.handled.has(question.button));
    if (!anotherLeft) return;
    await pause(automation, pacing.between);
  }
}

/**
 * Search Assist's automation, called on every check of the page. It starts
 * at most one press of More per module, and one run through the Explore More
 * questions at a time, each in the background. Explore More waits for More
 * to finish writing, since its questions appear shortly before it's done.
 */
export function automateSearchAssist(message: Element, automation: SiteAutomation): void {
  const state = stateOf(message);
  if (automation.isOptionEnabled(AUTO_MORE_OPTION) && !state.morePressed && !morePressedOnPage(message)) {
    state.morePressed = true;
    void pressMore(message, automation);
  }
  if (automation.isOptionEnabled(AUTO_EXPLORE_MORE_OPTION) && !state.expanding && !message.querySelector(WRITING_PILL_SELECTOR)) {
    const wrapper = message.querySelector(CONTENT_SELECTOR);
    if (wrapper && findExploreMoreQuestions(wrapper).some((question) => !state.handled.has(question.button))) {
      state.expanding = true;
      void expandQuestions(message, automation, state).finally(() => (state.expanding = false));
    }
  }
}
