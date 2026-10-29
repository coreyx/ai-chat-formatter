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
 * - `linked-citations`: a numbered Citations list whose entries carry Obsidian
 *   block IDs, with markers in the text linking to them. Unlike footnotes, it
 *   reads in the same order in Reading view and Live Preview.
 * - `footnotes`: `[^1]` markers with `[^1]: [Title](url)` definitions at the
 *   end. Obsidian's Reading view gathers these at the bottom of the note, so
 *   they act as the citations and get no heading of their own.
 * - `inline-links-and-sources`: `[1](url)` markers plus a numbered Citations list.
 * - `sources-only`: no inline markers, just the numbered Citations list.
 */
export type CitationStyle = "linked-citations" | "footnotes" | "inline-links-and-sources" | "sources-only";

/** The citation styles in the order the options page lists them. */
export const CITATION_STYLES: readonly CitationStyle[] = ["linked-citations", "footnotes", "inline-links-and-sources", "sources-only"];

/**
 * A Markdown heading level, from 1 (`#`) to 6 (`######`). Used for the
 * minimum heading level: the shallowest level a heading may have in the copy.
 */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** Every heading level, in order; also the choices the options page lists. */
export const HEADING_LEVELS: readonly HeadingLevel[] = [1, 2, 3, 4, 5, 6];

/**
 * How the user's prompt is written at the top of a copy:
 * - `heading`: a heading at the chosen level; a prompt of several lines puts
 *   its first line in the heading and quotes the rest below it.
 * - `blockquote`: every line quoted.
 * - `bold`: each paragraph in bold.
 * - `plain`: the prompt as typed.
 */
export type PromptFormat = "heading" | "blockquote" | "bold" | "plain";

/** The prompt formats in the order the options page lists them. */
export const PROMPT_FORMATS: readonly PromptFormat[] = ["heading", "blockquote", "bold", "plain"];

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

/**
 * A switch that belongs to one site, for behavior only that site's markup has
 * (such as Search Assist's Explore More section). Stored per site, like the
 * clean-up rules, and shown in the site's section of the options page.
 */
export interface SiteOption {
  /** Stable id, used as the settings key; never rename it once released. */
  id: string;
  /** Name shown on the options page. */
  name: string;
  /** One-line explanation shown under the name on the options page. */
  description: string;
  /** Whether the option is on before the user changes anything. */
  defaultEnabled: boolean;
  /**
   * Whether the adapter writes no citations while this option is on, so
   * neither the Sources section nor its More list is used. The options page
   * greys out "Include "More" sources" while it's on.
   */
  replacesSourcesSection?: boolean;
  /**
   * The id of another option of the same adapter that must be on for this one
   * to apply. While that option is off, this one reads as off whatever its
   * stored value, and the options page greys it out.
   */
  requires?: string;
  /**
   * Whether this option decides if the More list is included, in place of the
   * generic "Include "More" sources" setting, which the options page then
   * doesn't show. For a site whose More list is part of a section it names
   * itself (Gemini's "Sources used in the report").
   */
  governsMoreSources?: boolean;
}

/**
 * A setting with several values that belongs to one site, shown as a
 * drop-down in the site's section of the options page and stored per site.
 */
export interface SiteChoice {
  /** Stable id, used as the settings key; never rename it once released. */
  id: string;
  /** Name shown on the options page. */
  name: string;
  /** One-line explanation shown under the drop-down. */
  description: string;
  /** The value before the user changes anything; one of {@link values}. */
  defaultValue: string;
  /** The values offered, in order, each with the label the drop-down shows; the values are stored, so never rename them. */
  values: { value: string; label: string }[];
  /**
   * Options of the same adapter that this choice serves. The options page
   * greys it out while none of them is on.
   */
  requiresAny?: string[];
}

/**
 * What a site's automation (see {@link SiteAdapter.automate}) can call. The
 * settings are read at each call, so a change applies before the automation's
 * next step; while the site or the extension is switched off, every option
 * reads as off.
 */
export interface SiteAutomation {
  /** Whether the adapter's option `id` is on right now. */
  isOptionEnabled(id: string): boolean;
  /** The current value of the adapter's choice `id`. */
  choice(id: string): string;
  /** Resolves after `ms` milliseconds. */
  sleep(ms: number): Promise<void>;
  /** A random number in [0, 1), for randomized pauses. */
  random(): number;
  /** Whether the page is showing, as opposed to in a background tab or minimized. */
  isPageVisible(): boolean;
}

/**
 * One entry in a reply's full source list, as the site keeps it: the sources
 * cited in the text and the ones it only lists (Copilot's "More"). It is the
 * richer counterpart to what a citation chip carries, so it's where page
 * titles come from when the chip doesn't name them.
 */
export interface SourceReference {
  /** The source's URL, or null when it was read from a place that shows no URL (such as Copilot's Sources panel). */
  url: string | null;
  /** The page title, or an empty string when the site gives none. */
  title: string;
  /** The hostname without a leading `www.`, as chat sites display it. */
  domain: string;
  /** Whether the reply cites this source in its text. */
  cited: boolean;
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
  /** The reply's source-list entry for `url` (compared normalized), when the caller gathered the list. */
  findReference(url: string): SourceReference | undefined;
  /**
   * Whether the adapter's option `id` (see {@link SiteAdapter.options}) is on
   * for this copy. An option whose {@link SiteOption.requires} option is off
   * reads as off.
   */
  isOptionEnabled(id: string): boolean;
  /**
   * The value of the adapter's drop-down setting `id` (see
   * {@link SiteAdapter.choices}) for this copy, or `""` for an id the adapter
   * doesn't declare.
   */
  choice(id: string): string;
}

/** Where an injected button goes: inside `parent`, before `before` (or at the end when `before` is null). */
export interface ButtonAnchor {
  parent: Element;
  before: Node | null;
}

/** How an injected button names itself: `title` for its tooltip and accessible name, and `text` as a visible label beside the icon. */
export interface ButtonLabel {
  title: string;
  text?: string;
}

/** One prompt and its reply, for a site that copies a whole conversation (see {@link SiteAdapter.readTurns}). */
export interface ConversationTurn {
  /** The prompt as plain text, as {@link SiteAdapter.readPrompt} returns it, or null when the turn shows none. */
  prompt: string | null;
  /** The reply, converted like a message on its own. */
  reply: Element;
}

/**
 * Marks an element that an adapter's `preprocess` wants written after the
 * Sources section rather than in the body, such as a section the site shows
 * below its sources.
 */
export const AFTER_SOURCES_ATTRIBUTE = "data-acf-after-sources";

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
  /**
   * Selects the site's own Copy button inside a message, for the optional
   * override. Absent when the site has no Copy button the override can stand
   * in for; the options page then doesn't offer it.
   */
  nativeCopyButtonSelector?: string;
  /**
   * Finds where the "Copy as Markdown" button goes for `message`, or null when
   * the message has no toolbar yet (still streaming) or shouldn't have a
   * button. The anchor may be outside `message`. `isOptionEnabled` reads the
   * adapter's options as a copy does, so a site can hide a button while one is
   * off; absent, every option takes its default.
   */
  findButtonAnchor(message: Element, isOptionEnabled?: (id: string) => boolean): ButtonAnchor | null;
  /**
   * How `message`'s button names itself. Absent, or null for a given message,
   * means "Copy as Markdown", without a visible label: a site can label some of
   * its buttons and leave the rest as the plain icon.
   */
  buttonLabel?(message: Element): ButtonLabel | null;
  /** The options page's hint for the button setting, for a site whose button isn't next to each reply's own Copy. */
  copyButtonDescription?: string;
  /** Page chrome inside the reply body (buttons, labels, live regions) removed before conversion. */
  stripSelectors: string[];
  /**
   * Rewrites site-specific markup in the cloned reply body into standard HTML
   * before Turndown sees it. This is the place for anything whitespace-sensitive
   * that the site doesn't render with `<pre>`: Turndown collapses whitespace in
   * every other element before its rules run, so a rule would only ever see the
   * damaged text. `context` gives the copy's options; citations aren't
   * registered here, since Turndown hasn't run yet. `message` is the message
   * the body was cloned from, for parts of a reply that sit outside its body
   * (Duck.ai's Read More cards); read it, but never change it. May throw
   * {@link ConversionError}.
   */
  preprocess?(root: HTMLElement, context: ConversionContext, message: Element): void;
  /** Turndown rules for this site's markup, keyed by rule name. */
  turndownRules(context: ConversionContext): Record<string, TurndownService.Rule>;
  /**
   * Reads `message`'s full source list synchronously, or returns null when it
   * can't. Synchronous so the native Copy override can use it before the
   * site's own handler runs.
   */
  readReferences?(message: Element): SourceReference[] | null;
  /**
   * A slower way to read the same list, for when {@link readReferences}
   * returns null — for example by opening a panel on the page. Only the
   * extension's own button uses it, since it can't finish before a native
   * click is handled.
   */
  readReferencesSlowly?(message: Element): Promise<SourceReference[] | null>;
  /**
   * Whether some citation in `message` has no title of its own on the page,
   * so the slower reader is worth running even when the "More sources" list
   * is off.
   */
  hasUntitledCitations?(message: Element): boolean;
  /**
   * The prompt that `message` answers, as plain text with `\n` between lines
   * and `\n\n` between paragraphs, or null when the page doesn't show one.
   * Synchronous, like {@link readReferences}, so the native Copy override can
   * include it. `isOptionEnabled` reads the adapter's options as a copy does,
   * so a site can leave its prompt out while one is off; absent, every option
   * takes its default.
   */
  readPrompt?(message: Element, isOptionEnabled?: (id: string) => boolean): string | null;
  /**
   * Splits `message` into turns copied one after another, each reply with its
   * own prompt, for a message that is a whole conversation. Null means
   * `message` is copied as a single reply.
   */
  readTurns?(message: Element): ConversationTurn[] | null;
  /**
   * How this site's "More sources" option starts out and how the options page
   * describes it, since each site's uncited sources come from a different
   * place. Applies only when the adapter can read references. Without it the
   * option starts on, with a generic description.
   */
  moreSources?: { defaultEnabled: boolean; description: string };
  /** Switches only this site has, in the order the options page lists them. */
  options?: SiteOption[];
  /** Drop-down settings only this site has, listed after its {@link options}. */
  choices?: SiteChoice[];
  /**
   * Acts on the page for the user, such as opening sections a copy needs.
   * The controller calls it for every message on each check of the page
   * while the site is enabled, so it must return at once, run any slow work
   * in the background, and keep its own record of what it has already done.
   */
  automate?(message: Element, automation: SiteAutomation): void;
  /**
   * Name of a script under `src/page/` that the build bundles and the manifest
   * runs in the page's own JavaScript world, for data the isolated content
   * script can't see (such as a framework's internal state).
   */
  pageScript?: string;
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
