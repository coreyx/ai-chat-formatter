/**
 * Runs in Duck.ai's own page world (`"world": "MAIN"` in the manifest), where
 * React's internal properties are visible; the isolated content script can't
 * see them. It does one thing: when asked through {@link REFERENCES_EVENT} on
 * a reply, it writes the sources behind each of the reply's popup citation
 * chips to that chip as JSON. It only reads, and it never throws into the page.
 *
 * A popup chip is a `<button aria-haspopup>` showing the first source's domain
 * and a count of further sources; its markup holds no links, and the popup's
 * content isn't in the page until it opens. The sources are in the props of a
 * component a few levels above the button, as `sources`: an array of
 * `{ id, url, title, domain, rootDomain, siteName }`. Observed on duck.ai on
 * 2026-10-24.
 */
import { CHIP_SOURCES_ATTRIBUTE, REFERENCES_EVENT, type RawChipSource } from "../core/references-protocol";

/** The reply body, where the chips are. */
const BODY_SELECTOR = "[data-dark-theme]";
/** A popup citation chip inside the body. */
const POPUP_CHIP_SELECTOR = "button[aria-haspopup]";
/** How far up the component tree to look before giving up; the list was 3 levels up when observed. */
const MAX_LEVELS = 8;

/** A React fiber, reduced to the two fields this script reads. */
interface Fiber {
  memoizedProps?: { sources?: unknown } | null;
  return?: Fiber | null;
}

/** `value` as a string when it is one, otherwise an empty string. */
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Reads the sources behind the popup chip `button`, or returns null when it
 * has no React fiber or no `sources` list within {@link MAX_LEVELS} levels.
 * Entries without an http(s) URL are dropped.
 */
export function extractDuckAiChipSources(button: Element): RawChipSource[] | null {
  // React stores each element's fiber under a per-build random suffix, e.g. "__reactFiber$x1y2z3".
  const key = Object.keys(button).find((name) => name.startsWith("__reactFiber$"));
  let fiber: Fiber | null | undefined = key ? (button as unknown as Record<string, Fiber>)[key] : null;

  for (let level = 0; fiber && level <= MAX_LEVELS; level++) {
    const sources = fiber.memoizedProps?.sources;
    if (Array.isArray(sources)) {
      return sources.flatMap((entry): RawChipSource[] => {
        const url = text(entry?.url);
        return /^https?:\/\//i.test(url) ? [{ url, title: text(entry.title), domain: text(entry.domain) }] : [];
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
export function installDuckAiPageScript(document: Document): void {
  document.addEventListener(REFERENCES_EVENT, (event) => {
    try {
      const target = event.target as Element | null;
      if (!target?.querySelectorAll) return;
      for (const chip of Array.from(target.querySelectorAll(`${BODY_SELECTOR} ${POPUP_CHIP_SELECTOR}`))) {
        const sources = extractDuckAiChipSources(chip);
        if (sources && sources.length > 0) chip.setAttribute(CHIP_SOURCES_ATTRIBUTE, JSON.stringify(sources));
        else chip.removeAttribute(CHIP_SOURCES_ATTRIBUTE);
      }
    } catch {
      // Reading someone else's React state can fail in ways we can't foresee; the content script falls back on its own.
    }
  });
}

if (typeof window !== "undefined" && window.document) {
  installDuckAiPageScript(window.document);
}
