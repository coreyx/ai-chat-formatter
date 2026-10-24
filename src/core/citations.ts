import type { Citation, CitationStyle } from "./types";

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
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Escapes the characters that would end a Markdown link's text early. */
function escapeLinkText(text: string): string {
  return text.replace(/([\\[\]])/g, "\\$1");
}

/** Percent-encodes the characters that would end a Markdown link's destination early. */
function encodeLinkDestination(url: string): string {
  return url.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/</g, "%3C").replace(/>/g, "%3E");
}

/** `[Title](url)` for `citation`. */
function citationLink(citation: Citation): string {
  return `[${escapeLinkText(citation.title)}](${encodeLinkDestination(citation.url)})`;
}

/** The "Sources" section listing every citation as a numbered link. */
function sourcesList(citations: Citation[]): string {
  return "## Sources\n\n" + citations.map((citation, i) => `${i + 1}. ${citationLink(citation)}`).join("\n");
}

/**
 * Swaps the citation placeholders in `markdown` for `style` and appends the
 * closing footnote definitions or Sources list. Placeholders attach to the
 * text before them (`release.[^1]`, not `release. [^1]`), and the same
 * citation repeated back to back, as when a chip is cited twice in a row,
 * collapses into one marker. With no citations the Markdown is unchanged.
 */
export function renderCitations(markdown: string, citations: Citation[], style: CitationStyle): string {
  let body = markdown
    .replace(/(⟦cite:(\d+)⟧)(?:\s*⟦cite:\2⟧)+/g, "$1")
    .replace(/[ \t  ]+(?=⟦cite:\d+⟧)/g, "");

  if (citations.length === 0) return body.replace(PLACEHOLDER, "");

  const citationFor = (n: string) => citations[Number(n) - 1];
  switch (style) {
    case "footnotes": {
      body = body.replace(PLACEHOLDER, (_, n: string) => (citationFor(n) ? `[^${n}]` : ""));
      const definitions = citations.map((citation, i) => `[^${i + 1}]: ${citationLink(citation)}`).join("\n");
      return `${body.trimEnd()}\n\n${definitions}`;
    }
    case "inline-links-and-sources": {
      body = body.replace(PLACEHOLDER, (_, n: string) => {
        const citation = citationFor(n);
        return citation ? `[${n}](${encodeLinkDestination(citation.url)})` : "";
      });
      return `${body.trimEnd()}\n\n${sourcesList(citations)}`;
    }
    case "sources-only": {
      body = body.replace(PLACEHOLDER, "");
      return `${body.trimEnd()}\n\n${sourcesList(citations)}`;
    }
  }
}
