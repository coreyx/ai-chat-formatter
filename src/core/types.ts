import type TurndownService from "turndown";

/** A source a reply cites, captured from the page so it survives the copy. */
export interface Citation {
  /** The cited page's URL. */
  url: string;
  /** The cited page's title, or the best stand-in the page offers when it shows no title. */
  title: string;
  /** The short source name the site shows on the citation chip, such as `widget.example`. */
  sourceName: string;
}

/**
 * How citations are written into the copied Markdown:
 * - `footnotes`: `[^1]` markers with `[^1]: [Title](url)` definitions at the end (Obsidian renders these as footnotes).
 * - `inline-links-and-sources`: `[1](url)` markers plus a "Sources" list at the end.
 * - `sources-only`: no inline markers, just the "Sources" list.
 */
export type CitationStyle = "footnotes" | "inline-links-and-sources" | "sources-only";

/** The citation styles in the order the options page lists them. */
export const CITATION_STYLES: readonly CitationStyle[] = ["footnotes", "inline-links-and-sources", "sources-only"];

/**
 * A Markdown-to-Markdown fix applied after conversion. Rules exist so that
 * site quirks found later can be corrected one at a time, each switchable on
 * the options page without touching the converter.
 */
export interface FormatRule {
  /** Stable id, used as the settings key; never rename it once released. */
  id: string;
  /** Name shown on the options page. */
  name: string;
  /** One-line explanation shown under the name on the options page. */
  description: string;
  /** Whether the rule is on before the user changes anything. */
  defaultEnabled: boolean;
  /** Returns `markdown` with the fix applied. */
  apply(markdown: string): string;
}

/** What an adapter's Turndown rules can call into while a message is being converted. */
export interface ConversionContext {
  /**
   * Records `citation` for the current message and returns the placeholder to
   * emit where it was cited. The placeholder is swapped for the chosen
   * citation style once the whole message has been converted, since numbering
   * and the closing list depend on every citation in the message.
   */
  registerCitation(citation: Citation): string;
}

/** Where an injected button goes: inside `parent`, before `before` (or at the end when `before` is null). */
export interface ButtonAnchor {
  parent: Element;
  before: Node | null;
}

/**
 * Everything the extension needs to know about one chat site. Each site is a
 * separate module, so supporting a new site never touches the others or the
 * shared converter.
 */
export interface SiteAdapter {
  /** Stable id, used as the settings key; never rename it once released. */
  id: string;
  /** Name shown on the options page and in messages. */
  name: string;
  /** Manifest V3 match patterns for the pages this adapter handles; the build copies them into the manifest. */
  matches: string[];
  /** Selects each assistant message, the unit that one copy covers. */
  messageSelector: string;
  /** Selects the reply body inside a message: the part converted to Markdown. */
  contentSelector: string;
  /** Selects the site's own Copy button inside a message, for the optional override. */
  nativeCopyButtonSelector: string;
  /** Finds where the "Copy as Markdown" button goes for `message`, or null when the message has no toolbar yet (still streaming). */
  findButtonAnchor(message: Element): ButtonAnchor | null;
  /** Page chrome inside the reply body (buttons, labels, live regions) removed before conversion. */
  stripSelectors: string[];
  /** Turndown rules for this site's markup, keyed by rule name. */
  turndownRules(context: ConversionContext): Record<string, TurndownService.Rule>;
  /** Post-conversion rules, applied in order. */
  rules: FormatRule[];
}

/** Thrown when a message can't be converted faithfully; `message` is shown to the user as is. */
export class ConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversionError";
  }
}
