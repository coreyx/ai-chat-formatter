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
function escapeLinkText(text: string): string {
  return text.replace(/([\\[\]])/g, "\\$1");
}

/** Escapes inline Markdown syntax in text shown without a link, so a title like `a_b *c*` stays literal. */
function escapeInlineText(text: string): string {
  return text.replace(/([\\`*_[\]<>])/g, "\\$1");
}

/** Percent-encodes the characters that would end a Markdown link's destination early. */
function encodeLinkDestination(url: string): string {
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

/** The "Sources" section listing every citation as a numbered link. */
function sourcesList(citations: Citation[]): string {
  return "## Sources\n\n" + citations.map((citation, i) => `${i + 1}. ${citationLink(citation)}`).join("\n");
}

/**
 * The "More sources" section: sources the reply's site lists but the reply
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
  return lines.length ? "## More sources\n\n" + lines.join("\n") : "";
}

/**
 * Swaps the citation placeholders in `markdown` for `style` and appends the
 * closing sections: the Sources list (for the list styles), then the More
 * sources list, then footnote definitions (for footnotes, which go last so
 * Obsidian's footnote rendering isn't affected). Placeholders attach to the
 * text before them (`release.[^1]`, not `release. [^1]`), and the same
 * citation repeated back to back, as when a chip is cited twice in a row,
 * collapses into one marker. With no citations and no More sources the
 * Markdown is unchanged.
 */
export function renderCitations(
  markdown: string,
  citations: Citation[],
  style: CitationStyle,
  moreSources: readonly SourceReference[] = [],
): string {
  let body = markdown
    .replace(/(⟦cite:(\d+)⟧)(?:\s*⟦cite:\2⟧)+/g, "$1")
    .replace(/[ \t\u00A0\u202F]+(?=⟦cite:\d+⟧)/g, "");

  const more = moreSourcesList(moreSources, citations);
  if (citations.length === 0) {
    body = body.replace(PLACEHOLDER, "");
    return more ? `${body.trimEnd()}\n\n${more}` : body;
  }

  const citationFor = (n: string) => citations[Number(n) - 1];
  const sections: string[] = [];
  switch (style) {
    case "footnotes":
      body = body.replace(PLACEHOLDER, (_, n: string) => (citationFor(n) ? `[^${n}]` : ""));
      sections.push(more, citations.map((citation, i) => `[^${i + 1}]: ${citationLink(citation)}`).join("\n"));
      break;
    case "inline-links-and-sources":
      body = body.replace(PLACEHOLDER, (_, n: string) => {
        const citation = citationFor(n);
        return citation ? `[${n}](${encodeLinkDestination(citation.url)})` : "";
      });
      sections.push(sourcesList(citations), more);
      break;
    case "sources-only":
      body = body.replace(PLACEHOLDER, "");
      sections.push(sourcesList(citations), more);
      break;
  }
  return [body.trimEnd(), ...sections.filter(Boolean)].join("\n\n");
}
