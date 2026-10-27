import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { CitationCollector, normalizeCitationUrl, renderCitations } from "./citations";
import { enforceMinHeadingLevel } from "./headings";
import { formatPrompt } from "./prompt";
import { runRules } from "./rules";
import { ConversionError, type CitationStyle, type ConversionContext, type HeadingLevel, type PromptFormat, type SiteAdapter, type SourceReference } from "./types";

/** How {@link convertMessage} writes a message. */
export interface ConversionOptions {
  /** How citations are written. */
  style: CitationStyle;
  /** Whether sources the reply lists but doesn't cite get a "More sources" section. */
  includeMoreSources: boolean;
  /** Whether the adapter's post-processing rule `ruleId` is on. */
  isRuleEnabled: (ruleId: string) => boolean;
  /** The message's full source list, if the caller could read it; titles and the More list come from here. */
  references: SourceReference[] | null;
  /**
   * The shallowest heading level the copy may have; headings above it shift
   * down, Sources included (see {@link enforceMinHeadingLevel}). Absent means
   * 1, which never shifts anything. Not used under a prompt heading, which
   * sets the response's minimum itself.
   */
  minHeadingLevel?: HeadingLevel;
  /**
   * The prompt the message answers, written above the response in `format`
   * (see {@link formatPrompt}). With the `heading` format the response nests
   * below it. Absent means the copy is the response alone.
   */
  prompt?: { text: string; format: PromptFormat; headingLevel: HeadingLevel };
  /**
   * The token that makes this copy's block IDs unique, for the linked-citations
   * style. Generated randomly when absent; tests pass a fixed one.
   */
  idToken?: string;
}

const ID_TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * A random 4-character token of lowercase letters and digits. Two copies pasted
 * into one note then get different block IDs; 36^4 (about 1.7 million)
 * combinations make a clash between a handful of pastes vanishingly unlikely.
 */
export function randomIdToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (byte) => ID_TOKEN_ALPHABET[byte % ID_TOKEN_ALPHABET.length]).join("");
}

/**
 * List items with a single space after the marker (`- item`, `1. item`).
 * Turndown's own rule pads markers to four characters, which renders the same
 * but makes every pasted list look unlike one typed in Obsidian.
 *
 * Chat sites often wrap an item's lead text in `<p>` before a nested list,
 * which Turndown separates with a blank line; that makes the whole list
 * "loose" (spaced out) in Obsidian although the site shows it tight. The blank
 * line is dropped only where a nested list follows, since between two
 * paragraphs it is what keeps them separate.
 */
const compactListItem: TurndownService.Rule = {
  filter: "li",
  replacement(content, node) {
    const parent = node.parentNode as HTMLElement | null;
    let prefix = "- ";
    if (parent?.nodeName === "OL") {
      const start = parent.getAttribute("start");
      const index = Array.prototype.indexOf.call(parent.children, node);
      prefix = `${start ? Number(start) + index : index + 1}. `;
    }
    const isParagraph = /\n$/.test(content);
    const body =
      content
        .replace(/^\n+/, "")
        .replace(/\n+$/, "")
        .replace(/\n\n+(?=[ \t]*(?:[-*+]|\d+[.)])[ \t])/g, "\n") + (isParagraph ? "\n" : "");
    return prefix + body.replace(/\n/g, "\n" + " ".repeat(prefix.length)) + (node.nextSibling ? "\n" : "");
  },
};

/** The TeX source KaTeX keeps alongside its rendered math, or null when the element doesn't carry it. */
function katexSource(node: HTMLElement): string | null {
  return node.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() || null;
}

/** Display math rendered by KaTeX becomes a `$$` block, the delimiter Obsidian renders. */
const katexDisplay: TurndownService.Rule = {
  filter: (node) => node.classList.contains("katex-display"),
  replacement: (content, node) => {
    const tex = katexSource(node);
    return tex ? `\n\n$$\n${tex}\n$$\n\n` : content;
  },
};

/** Inline math rendered by KaTeX becomes `$…$`. */
const katexInline: TurndownService.Rule = {
  filter: (node) => node.classList.contains("katex") && !node.parentElement?.closest(".katex-display"),
  replacement: (content, node) => {
    const tex = katexSource(node);
    return tex ? `$${tex}$` : content;
  },
};

/**
 * The shallowest heading level the response (Sources included) may have.
 * Under a prompt heading, the prompt is the copy's top heading and the
 * response starts one level below it, so the note's outline shows the reply
 * as part of the prompt; the minimum heading level setting isn't used then.
 * Without a prompt heading (no prompt, or another prompt format) the minimum
 * applies. Markdown stops at H6, so a prompt heading at H6 leaves the
 * response at H6 too.
 */
function responseMinHeadingLevel(minHeadingLevel: HeadingLevel, prompt: ConversionOptions["prompt"]): HeadingLevel {
  if (prompt?.format !== "heading") return minHeadingLevel;
  return Math.min(6, prompt.headingLevel + 1) as HeadingLevel;
}

/** A Turndown instance with the output conventions shared by every site. */
function createTurndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    fence: "```",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  service.use(gfm);
  service.addRule("compactListItem", compactListItem);
  service.addRule("katexInline", katexInline);
  service.addRule("katexDisplay", katexDisplay);
  return service;
}

/**
 * Converts one assistant message to Markdown with its citations rendered in
 * `style`. The reply body is cloned and stripped of page chrome first, so the
 * live page is never modified.
 *
 * Conversion is synchronous on purpose: when the extension stands in for the
 * site's own Copy button, it has to know whether conversion succeeded before
 * the click reaches the site's handler, so that a failure can fall back to the
 * native copy.
 *
 * That's also why the message's full source list is gathered by the caller and
 * passed in as `options.references`: reading it can take time on some sites.
 *
 * @throws ConversionError when the message has no reply body or an adapter
 *   rule finds content it can't convert faithfully.
 */
export function convertMessage(adapter: SiteAdapter, message: Element, options: ConversionOptions): string {
  const { style, includeMoreSources, isRuleEnabled, references } = options;
  const content = message.matches(adapter.contentSelector) ? message : message.querySelector(adapter.contentSelector);
  if (!content) throw new ConversionError(`Couldn't find the reply text in this ${adapter.name} message.`);

  const clone = content.cloneNode(true) as HTMLElement;
  for (const selector of adapter.stripSelectors) {
    clone.querySelectorAll(selector).forEach((element) => element.remove());
  }
  adapter.preprocess?.(clone);

  const collector = new CitationCollector();
  const referencesByUrl = new Map<string, SourceReference>();
  for (const reference of references ?? []) {
    if (reference.url !== null) referencesByUrl.set(normalizeCitationUrl(reference.url), reference);
  }
  const context: ConversionContext = {
    registerCitation: (citation) => collector.register(citation),
    findReference: (url) => referencesByUrl.get(normalizeCitationUrl(url)),
  };

  const service = createTurndown();
  // Site rules go last so they take precedence over the shared ones; Turndown checks the most recently added rule first.
  for (const [name, rule] of Object.entries(adapter.turndownRules(context))) {
    service.addRule(name, rule);
  }

  const moreSources = includeMoreSources ? (references ?? []).filter((reference) => !reference.cited) : [];
  const idToken = style === "linked-citations" ? (options.idToken ?? randomIdToken()) : "";
  const markdown = renderCitations(service.turndown(clone), collector.citations, style, moreSources, idToken);
  const { prompt } = options;
  // Headings shift after citations are rendered, so the Sources headings are measured and moved with the reply's.
  const shifted = enforceMinHeadingLevel(markdown, responseMinHeadingLevel(options.minHeadingLevel ?? 1, prompt));
  // The prompt goes on after the shift, so a prompt heading keeps the level the user chose.
  const copy = prompt ? `${formatPrompt(prompt.text, prompt.format, prompt.headingLevel)}\n\n${shifted}` : shifted;
  // Rules run after citations are rendered so that citation titles are cleaned up too.
  return runRules(copy, adapter.rules, isRuleEnabled);
}
