/**
 * Runs in DuckDuckGo's own page world (`"world": "MAIN"` in the manifest),
 * where React's internal properties are visible; the isolated content script
 * can't see them. It does one thing: when asked through
 * {@link REFERENCES_EVENT} on a Search Assist module, it writes the answer's
 * source list to that module as JSON. It only reads, and it never throws into
 * the page.
 *
 * Search Assist's chips show only a favicon and a domain; the page title is in
 * a tooltip that's only in the page while the chip is hovered. The answer's
 * data is in the props of a component above the answer element, as
 * `item.data.data`: `sources` (the chips' sources, in chip order), each
 * `{ article: { link, site, text } }` with `text` the page title, and
 * `all_source_urls`, every page Search Assist consulted. Observed on
 * duckduckgo.com on 2026-10-24.
 */
import { normalizeCitationUrl } from "../core/citations";
import { REFERENCES_ATTRIBUTE, REFERENCES_EVENT, type RawReference } from "../core/references-protocol";

/** The short answer, whose fiber is the starting point of the walk. */
const ANSWER_SELECTOR = '[data-testid="duckassist-answer-content"]';
/** How far up the component tree to look before giving up. */
const MAX_LEVELS = 40;

/** The answer data Search Assist keeps in its props, reduced to the fields read here. */
interface AnswerData {
  sources?: unknown;
  all_source_urls?: unknown;
}

/** A React fiber, reduced to the two fields this script reads. */
interface Fiber {
  memoizedProps?: { item?: { data?: { data?: AnswerData | null } | null } | null } | null;
  return?: Fiber | null;
}

/** `value` as a string when it is one, otherwise an empty string. */
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Whether `url` is an http(s) URL, the only kind that becomes a citation. */
function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Finds the answer data above `element`, or null without a fiber or past {@link MAX_LEVELS} levels. */
function findAnswerData(element: Element): AnswerData | null {
  // React stores each element's fiber under a per-build random suffix, e.g. "__reactFiber$x1y2z3".
  const key = Object.keys(element).find((name) => name.startsWith("__reactFiber$"));
  let fiber: Fiber | null | undefined = key ? (element as unknown as Record<string, Fiber>)[key] : null;
  for (let level = 0; fiber && level <= MAX_LEVELS; level++) {
    const data = fiber.memoizedProps?.item?.data?.data;
    if (data && Array.isArray(data.sources)) return data;
    fiber = fiber.return;
  }
  return null;
}

/**
 * Reads the source list of the Search Assist answer in `module`: first the
 * chips' sources as cited references titled with their page titles, then the
 * other consulted pages, untitled and uncited, without repeating a cited one.
 * Entries without an http(s) URL are dropped. Returns null when the answer has
 * no React fiber or no answer data.
 */
export function extractSearchAssistReferences(module: Element): RawReference[] | null {
  const answer = module.matches(ANSWER_SELECTOR) ? module : module.querySelector(ANSWER_SELECTOR);
  const data = answer ? findAnswerData(answer) : null;
  if (!data) return null;

  const references: RawReference[] = [];
  const seen = new Set<string>();
  const add = (url: string, title: string, cited: boolean): void => {
    const key = normalizeCitationUrl(url);
    if (!isWebUrl(url) || seen.has(key)) return;
    seen.add(key);
    references.push({ url, title, cited, hidden: false });
  };

  for (const source of data.sources as { article?: { link?: unknown; text?: unknown } | null }[]) {
    add(text(source?.article?.link), text(source?.article?.text), true);
  }
  for (const url of Array.isArray(data.all_source_urls) ? data.all_source_urls : []) {
    add(text(url), "", false);
  }
  return references;
}

/**
 * Answers {@link REFERENCES_EVENT} requests on `document`. Exported so the
 * regression script can install it on a test document; in the page it is
 * installed once, below.
 */
export function installSearchAssistPageScript(document: Document): void {
  document.addEventListener(REFERENCES_EVENT, (event) => {
    try {
      const target = event.target as Element | null;
      if (!target?.querySelector) return;
      const references = extractSearchAssistReferences(target);
      if (references && references.length > 0) target.setAttribute(REFERENCES_ATTRIBUTE, JSON.stringify(references));
      else target.removeAttribute(REFERENCES_ATTRIBUTE);
    } catch {
      // Reading someone else's React state can fail in ways we can't foresee; the content script falls back on its own.
    }
  });
}

if (typeof window !== "undefined" && window.document) {
  installSearchAssistPageScript(window.document);
}
