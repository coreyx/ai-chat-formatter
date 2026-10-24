/**
 * Runs in Copilot's own page world (`"world": "MAIN"` in the manifest), where
 * React's internal properties are visible; the isolated content script can't
 * see them. It does one thing: when asked through
 * {@link REFERENCES_EVENT}, it reads the reply's full source list from React
 * state and writes it to the reply element as JSON. It only reads, and it
 * never throws into the page.
 *
 * The data lives in the props of a component a few levels above
 * `[data-testid="markdown-reply"]`, as `response.references`: every source,
 * cited or not, with `name` (the page title), `url`, `isCitedInResponse` and
 * `hideCitationFromReferenceSection`. Observed on copilot.com on 2026-10-24.
 */
import { REFERENCES_ATTRIBUTE, REFERENCES_EVENT, type RawReference } from "../core/references-protocol";

const REPLY_SELECTOR = '[data-testid="markdown-reply"]';
/** How far up the component tree to look before giving up; the list was 4 levels up when observed. */
const MAX_LEVELS = 20;

/** A React fiber, reduced to the two fields this script reads. */
interface Fiber {
  memoizedProps?: { response?: { references?: unknown } } | null;
  return?: Fiber | null;
}

/** `value` as a string when it is one, otherwise null. */
function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Reads the source list for the reply in or at `element`, or returns null when
 * there's no reply body, no React fiber on it, or no list within
 * {@link MAX_LEVELS} levels. Entries without an http(s) URL are dropped.
 */
export function extractCopilotReferences(element: Element): RawReference[] | null {
  const reply = element.matches(REPLY_SELECTOR) ? element : element.querySelector(REPLY_SELECTOR);
  if (!reply) return null;
  // React stores each element's fiber under a per-build random suffix, e.g. "__reactFiber$x1y2z3".
  const key = Object.keys(reply).find((name) => name.startsWith("__reactFiber$"));
  let fiber: Fiber | null | undefined = key ? (reply as unknown as Record<string, Fiber>)[key] : null;

  for (let level = 0; fiber && level <= MAX_LEVELS; level++) {
    const references = fiber.memoizedProps?.response?.references;
    if (Array.isArray(references)) {
      return references.flatMap((entry): RawReference[] => {
        const url = text(entry?.url);
        if (!url || !/^https?:\/\//i.test(url)) return [];
        return [
          {
            url,
            title: text(entry.name) ?? "",
            cited: entry.isCitedInResponse === true,
            hidden: entry.hideCitationFromReferenceSection === true,
          },
        ];
      });
    }
    fiber = fiber.return;
  }
  return null;
}

/**
 * Answers {@link REFERENCES_EVENT} requests on `document`. Exported so the
 * regression script can install it on a test document; in the page it is
 * installed once, below.
 */
export function installCopilotPageScript(document: Document): void {
  document.addEventListener(REFERENCES_EVENT, (event) => {
    try {
      const target = event.target as Element | null;
      if (!target?.matches) return;
      const references = extractCopilotReferences(target);
      const reply = target.matches(REPLY_SELECTOR) ? target : target.querySelector(REPLY_SELECTOR);
      if (references && reply) reply.setAttribute(REFERENCES_ATTRIBUTE, JSON.stringify(references));
    } catch {
      // Reading someone else's React state can fail in ways we can't foresee; the content script falls back on its own.
    }
  });
}

if (typeof window !== "undefined" && window.document) {
  installCopilotPageScript(window.document);
}
