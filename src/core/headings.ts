import { mapOutsideCodeFences } from "./rules";
import type { HeadingLevel } from "./types";

/**
 * An ATX heading's `#` run, after whatever can come before it on its line:
 * indentation, blockquote markers, and one list marker (Turndown writes a
 * heading that opens a list item as `- ## Heading`). The run must be one to
 * six `#` followed by a space, a tab or the end of the line, as CommonMark
 * requires, so `#hashtag` and a seven-`#` line aren't headings. A `#` that
 * starts ordinary text never matches, since Turndown escapes it as `\#`.
 */
const HEADING = /^([ \t]*(?:>[ \t]*)*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?)(#{1,6})(?=[ \t]|$)/gm;

/**
 * Shifts every heading in `markdown` down by the same number of levels, just
 * enough that the shallowest one is at `minLevel`, so the copy can sit under
 * a note's own headings while keeping its hierarchy. Markdown has no level
 * past 6, so a heading that would go deeper stays at 6. Fenced code is left
 * alone, since a `#` there is code (a shell comment, say), not a heading.
 * Text whose headings are all at `minLevel` or deeper, or that has none,
 * comes back unchanged.
 */
export function enforceMinHeadingLevel(markdown: string, minLevel: HeadingLevel): string {
  let shallowest = Infinity;
  mapOutsideCodeFences(markdown, (prose) => {
    for (const match of prose.matchAll(HEADING)) shallowest = Math.min(shallowest, match[2].length);
    return prose;
  });
  const shift = minLevel - shallowest;
  // With no headings, shallowest stays Infinity and the shift is -Infinity.
  if (shift <= 0) return markdown;
  return mapOutsideCodeFences(markdown, (prose) =>
    prose.replace(HEADING, (_, prefix: string, hashes: string) => prefix + "#".repeat(Math.min(6, hashes.length + shift))),
  );
}
