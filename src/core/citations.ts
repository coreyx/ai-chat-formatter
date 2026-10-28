import type { RawReference } from "./references-protocol";
import type { Citation, CitationStyle, SourceReference } from "./types";

/**
 * Marks where a citation was found while the message converts. Turndown never
 * escapes `⟦`/`⟧`, and they don't occur in chat replies in practice, so the
 * marker survives conversion intact and can be swapped out afterwards.
 */
const PLACEHOLDER = /⟦cite:(\d+)⟧/g;

/** The placeholder for citation number `n`. */
function placeholder(n: number): string {
  return `⟦cite:${n}⟧`;
}

/**
 * Normalizes a URL for de-duplication, so that two chips pointing at the same
 * page with a different fragment or trailing slash become one citation.
 * Unparsable URLs are compared as written.
 */
export function normalizeCitationUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

/**
 * Numbers a message's citations in order of first appearance, merging repeat
 * citations of the same page into one number. One collector covers one copy.
 */
export class CitationCollector {
  /** The distinct citations, in number order (citation N is at index N - 1). */
  readonly citations: Citation[] = [];
  private readonly numbers = new Map<string, number>();

  /** Records `citation` and returns the placeholder to emit where it was cited. */
  register(citation: Citation): string {
    const key = normalizeCitationUrl(citation.url);
    let n = this.numbers.get(key);
    if (n === undefined) {
      this.citations.push(citation);
      n = this.citations.length;
      this.numbers.set(key, n);
    }
    return placeholder(n);
  }
}

/**
 * Picks a citation's title from its chip's accessible label. Copilot labels
 * chips "Citation: <chip text> — <site name> — <page title>", so the last
 * segment is the page title. A label with a single segment only repeats the
 * chip text, so the source name or the URL's host stands in for the title.
 */
export function parseCitationTitle(ariaLabel: string | null | undefined, fallbackName: string, url: string): string {
  const segments = (ariaLabel ?? "")
    .replace(/^\s*Citation:\s*/i, "")
    .split(/\s+—\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length >= 2) return segments[segments.length - 1];
  if (fallbackName.trim()) return fallbackName.trim();
  return sourceDomain(url);
}

/** Escapes the characters that would end a Markdown link's text early. */
export function escapeLinkText(text: string): string {
  return text.replace(/([\\[\]])/g, "\\$1");
}

/** Escapes inline Markdown syntax in text shown without a link, so a title like `a_b *c*` stays literal. */
function escapeInlineText(text: string): string {
  return text.replace(/([\\`*_[\]<>])/g, "\\$1");
}

/** Percent-encodes the characters that would end a Markdown link's destination early. */
export function encodeLinkDestination(url: string): string {
  return url.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/</g, "%3C").replace(/>/g, "%3E");
}

/** The hostname of `url` without a leading `www.`, as chat sites display it; the URL itself when it can't be parsed. */
export function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * One source as `[Title](url) — domain`. The domain is left off when the only
 * title is the domain itself, and a source without a URL is written as plain
 * `Title — domain`, since there is nothing to link to.
 */
function sourceEntry(title: string, url: string | null, domain: string): string {
  const shown = title.trim() || domain;
  const suffix = shown.toLowerCase() === domain.toLowerCase() ? "" : ` — ${domain}`;
  if (url === null) return escapeInlineText(shown) + suffix;
  return `[${escapeLinkText(shown)}](${encodeLinkDestination(url)})${suffix}`;
}

/** `[Title](url) — domain` for `citation`. */
function citationLink(citation: Citation): string {
  return sourceEntry(citation.title, citation.url, sourceDomain(citation.url));
}

/** Every citation as a numbered `N. [Title](url) — domain` line, for the list styles. */
function numberedCitations(citations: Citation[]): string {
  return citations.map((citation, i) => `${i + 1}. ${citationLink(citation)}`).join("\n");
}

/** The superscript forms of the digits 0 to 9, for linked-citation markers. */
const SUPERSCRIPT_DIGITS = ["\u2070", "\u00B9", "\u00B2", "\u00B3", "\u2074", "\u2075", "\u2076", "\u2077", "\u2078", "\u2079"];
const SUPERSCRIPT_OPEN = "\u207D";
const SUPERSCRIPT_CLOSE = "\u207E";

/** `n` written in superscript digits, so 12 becomes superscript one, superscript two. */
export function superscriptDigits(n: number): string {
  return String(n)
    .split("")
    .map((digit) => SUPERSCRIPT_DIGITS[Number(digit)] ?? digit)
    .join("");
}

/**
 * The Obsidian block ID for citation `n`: `c-<token>-<n>`, or `c-<n>` without a
 * token. The token keeps IDs from two copies pasted into one note apart. Only
 * lowercase letters, digits and hyphens are allowed in a block ID, so anything
 * else is dropped from the token.
 */
export function citationBlockId(token: string, n: number): string {
  const safeToken = token.toLowerCase().replace(/[^a-z0-9]/g, "");
  return safeToken ? `c-${safeToken}-${n}` : `c-${n}`;
}

/**
 * The in-text marker for linked citations: a same-note link to the entry's
 * block, displayed as the number in superscript parentheses. The parentheses
 * keep adjacent markers apart; bare superscript digits would run together.
 * Inside a table row the `|` before the display text is escaped, or it would
 * end the cell; Obsidian reads `[[target\|text]]` as the same link.
 */
function linkedMarker(token: string, n: number, inTableRow = false): string {
  return `[[#^${citationBlockId(token, n)}${inTableRow ? "\\|" : "|"}${SUPERSCRIPT_OPEN}${superscriptDigits(n)}${SUPERSCRIPT_CLOSE}]]`;
}

/** Whether `line` is a row of a Markdown table, which starts with `|`. */
function isTableRow(line: string): boolean {
  return line.trimStart().startsWith("|");
}

/** Every citation as a numbered entry ending in its block ID, for linked citations. */
function linkedCitations(citations: Citation[], token: string): string {
  return citations.map((citation, i) => `${i + 1}. ${citationLink(citation)} ^${citationBlockId(token, i + 1)}`).join("\n");
}

/** Every citation as a `[^N]: [Title](url) — domain` footnote definition. */
function footnoteDefinitions(citations: Citation[]): string {
  return citations.map((citation, i) => `[^${i + 1}]: ${citationLink(citation)}`).join("\n");
}

/**
 * The lines of the More list: sources the reply's site lists but the reply
 * doesn't cite. Sources already cited are left out, as are repeats, matched by
 * URL or, for sources without one, by title and domain. Empty when nothing is
 * left.
 */
function moreSourcesList(moreSources: readonly SourceReference[], citations: readonly Citation[]): string {
  const seen = new Set(citations.map((citation) => normalizeCitationUrl(citation.url)));
  const lines: string[] = [];
  for (const source of moreSources) {
    const key = source.url !== null ? normalizeCitationUrl(source.url) : `no-url|${source.domain}|${source.title.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`- ${sourceEntry(source.title, source.url, source.domain)}`);
  }
  return lines.join("\n");
}

/**
 * The closing section, laid out like Copilot's Sources panel: `## Sources`,
 * then `### Citations`, then `### More`. A subsection with nothing in it is
 * left out, and the whole section when both are empty.
 */
function sourcesSection(citationLines: string, moreLines: string): string {
  const parts: string[] = [];
  if (citationLines) parts.push(`### Citations\n\n${citationLines}`);
  if (moreLines) parts.push(`### More\n\n${moreLines}`);
  return parts.length ? `## Sources\n\n${parts.join("\n\n")}` : "";
}

/**
 * Swaps the citation placeholders in `markdown` for `style` and appends the
 * Sources section (see {@link sourcesSection}): the numbered list under
 * Citations, then the uncited sources under More. The footnotes style differs:
 * Obsidian's Reading view gathers footnote definitions at the bottom of the
 * note whatever their position, so they get no Citations heading and simply
 * follow the More list, or the body when there's no More list. Placeholders
 * attach to the text before them (`release.[^1]`, not `release. [^1]`), and
 * the same citation repeated back to back, as when a chip is cited twice in a
 * row, collapses into one marker. With no citations and no More sources the
 * Markdown is unchanged. `idToken` is only used by the linked-citations style.
 */
export function renderCitations(
  markdown: string,
  citations: Citation[],
  style: CitationStyle,
  moreSources: readonly SourceReference[] = [],
  idToken = "",
): string {
  let body = markdown
    .replace(/(⟦cite:(\d+)⟧)(?:\s*⟦cite:\2⟧)+/g, "$1")
    .replace(/[ \t\u00A0\u202F]+(?=⟦cite:\d+⟧)/g, "");

  const more = moreSourcesList(moreSources, citations);
  if (citations.length === 0) {
    body = body.replace(PLACEHOLDER, "");
    return more ? `${body.trimEnd()}\n\n${sourcesSection("", more)}` : body;
  }

  const citationFor = (n: string) => citations[Number(n) - 1];
  let citationLines: string;
  switch (style) {
    case "linked-citations":
      body = body
        .split("\n")
        .map((line) => line.replace(PLACEHOLDER, (_, n: string) => (citationFor(n) ? linkedMarker(idToken, Number(n), isTableRow(line)) : "")))
        .join("\n");
      citationLines = linkedCitations(citations, idToken);
      break;
    case "footnotes": {
      body = body.replace(PLACEHOLDER, (_, n: string) => (citationFor(n) ? `[^${n}]` : ""));
      const definitions = footnoteDefinitions(citations);
      return more ? `${body.trimEnd()}\n\n${sourcesSection("", more)}\n\n${definitions}` : `${body.trimEnd()}\n\n${definitions}`;
    }
    case "inline-links-and-sources":
      body = body.replace(PLACEHOLDER, (_, n: string) => {
        const citation = citationFor(n);
        return citation ? `[${n}](${encodeLinkDestination(citation.url)})` : "";
      });
      citationLines = numberedCitations(citations);
      break;
    case "sources-only":
      body = body.replace(PLACEHOLDER, "");
      citationLines = numberedCitations(citations);
      break;
  }
  return `${body.trimEnd()}\n\n${sourcesSection(citationLines, more)}`;
}

/**
 * Validates the JSON the page script wrote and turns it into source
 * references, leaving out the sources the site itself hides. Returns null for
 * anything malformed, so a surprise in the data falls back to chip-only
 * citations rather than producing wrong ones.
 */
export function parseReferencesAttribute(json: string | null): SourceReference[] | null {
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const references: SourceReference[] = [];
  for (const entry of parsed as Partial<RawReference>[]) {
    if (typeof entry?.url !== "string" || typeof entry.title !== "string" || typeof entry.cited !== "boolean") return null;
    if (!/^https?:\/\//i.test(entry.url) || entry.hidden === true) continue;
    references.push({ url: entry.url, title: entry.title, domain: sourceDomain(entry.url), cited: entry.cited });
  }
  return references;
}
