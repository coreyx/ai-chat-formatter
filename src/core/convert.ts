import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { CitationCollector, normalizeCitationUrl, renderCitations } from "./citations";
import { enforceMinHeadingLevel } from "./headings";
import { formatPrompt } from "./prompt";
import { runRules } from "./rules";
import {
  AFTER_SOURCES_ATTRIBUTE,
  ConversionError,
  type CitationStyle,
  type ConversationTurn,
  type ConversionContext,
  type HeadingLevel,
  type PromptFormat,
  type SiteAdapter,
  type SiteOption,
  type SourceReference,
} from "./types";

/** How {@link convertMessage} writes a message. */
export interface ConversionOptions {
  /** How citations are written. */
  style: CitationStyle;
  /**
   * Whether sources the reply lists but doesn't cite get a "More sources"
   * section. Not used when one of the adapter's options governs More (see
   * {@link SiteOption.governsMoreSources}).
   */
  includeMoreSources: boolean;
  /** Whether the adapter's post-processing rule `ruleId` is on. */
  isRuleEnabled: (ruleId: string) => boolean;
  /**
   * Whether the adapter's option `optionId` (see {@link SiteAdapter.options})
   * is set on. Absent means every option takes its default. An option whose
   * required option is off reads as off to the adapter either way.
   */
  isOptionEnabled?: (optionId: string) => boolean;
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

/**
 * Whether `adapter`'s option `id` is on, given `lookup` for each option's own
 * value. An option the adapter doesn't declare is off, and so is one whose
 * required option is off, however it's set itself. Requirements are followed
 * in a chain, stopping at a loop so a mistaken declaration can't hang a copy.
 */
export function resolveOption(adapter: SiteAdapter, id: string, lookup: (id: string) => boolean, seen = new Set<string>()): boolean {
  const option = adapter.options?.find((candidate) => candidate.id === id);
  if (!option || seen.has(id) || !lookup(id)) return false;
  seen.add(id);
  return option.requires === undefined || resolveOption(adapter, option.requires, lookup, seen);
}

/**
 * Takes the elements `preprocess` marked to follow the Sources section out of
 * `root`, in document order, each wrapped in a `<div>` of its own so that
 * Turndown writes the marked element itself and not just its contents. A
 * marked element inside another is taken with it. Citations aren't rendered in
 * these sections, so they're meant for plain links.
 */
function takeAfterSourcesSections(root: HTMLElement): HTMLElement[] {
  const selector = `[${AFTER_SOURCES_ATTRIBUTE}]`;
  const marked = Array.from(root.querySelectorAll(selector)).filter((element) => !element.parentElement?.closest(selector));
  return marked.map((element) => {
    const wrapper = root.ownerDocument.createElement("div");
    wrapper.append(element);
    return wrapper;
  });
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
  const lookupOption = options.isOptionEnabled ?? ((id: string) => adapter.options?.find((option) => option.id === id)?.defaultEnabled ?? false);
  const collector = new CitationCollector();
  const referencesByUrl = new Map<string, SourceReference>();
  for (const reference of references ?? []) {
    if (reference.url !== null) referencesByUrl.set(normalizeCitationUrl(reference.url), reference);
  }
  const context: ConversionContext = {
    registerCitation: (citation) => collector.register(citation),
    findReference: (url) => referencesByUrl.get(normalizeCitationUrl(url)),
    isOptionEnabled: (id) => resolveOption(adapter, id, lookupOption),
  };
  adapter.preprocess?.(clone, context, message);
  const afterSources = takeAfterSourcesSections(clone);

  const service = createTurndown();
  // Site rules go last so they take precedence over the shared ones; Turndown checks the most recently added rule first.
  for (const [name, rule] of Object.entries(adapter.turndownRules(context))) {
    service.addRule(name, rule);
  }

  // While an option writes the sources some other way, there's no Sources section for More to join.
  const sourcesReplaced = (adapter.options ?? []).some((option) => option.replacesSourcesSection && context.isOptionEnabled(option.id));
  const governing = adapter.options?.find((option) => option.governsMoreSources);
  const wantMore = governing ? context.isOptionEnabled(governing.id) : includeMoreSources;
  const moreSources = wantMore && !sourcesReplaced ? (references ?? []).filter((reference) => !reference.cited) : [];
  const idToken = style === "linked-citations" ? (options.idToken ?? randomIdToken()) : "";
  const withSources = renderCitations(service.turndown(clone), collector.citations, style, moreSources, idToken);
  const trailing = afterSources.map((section) => service.turndown(section).trim()).filter(Boolean);
  const markdown = trailing.length ? `${withSources.trimEnd()}\n\n${trailing.join("\n\n")}` : withSources;
  const { prompt } = options;
  // Headings shift after citations are rendered, so the Sources headings are measured and moved with the reply's.
  const shifted = enforceMinHeadingLevel(markdown, responseMinHeadingLevel(options.minHeadingLevel ?? 1, prompt));
  // The prompt goes on after the shift, so a prompt heading keeps the level the user chose.
  const copy = prompt ? `${formatPrompt(prompt.text, prompt.format, prompt.headingLevel)}\n\n${shifted}` : shifted;
  // Rules run after citations are rendered so that citation titles are cleaned up too.
  return runRules(copy, adapter.rules, isRuleEnabled);
}

/** How {@link convertConversation} writes a conversation. */
export interface ConversationOptions extends Omit<ConversionOptions, "references" | "prompt"> {
  /** How each turn's prompt is written above its reply (see {@link formatPrompt}). */
  promptFormat: { format: PromptFormat; headingLevel: HeadingLevel };
  /** Reads a reply's full source list, as {@link ConversionOptions.references}; absent means no reply has one. */
  referencesFor?: (reply: Element) => SourceReference[] | null;
}

/**
 * Converts a conversation turn by turn: each reply with its own prompt above
 * it, its own citations and its own Sources section, joined with a blank line.
 * Every turn's prompt is written, since keeping the prompts is what a
 * conversation copy is for. A turn whose reply has no reply body (see
 * {@link SiteAdapter.contentSelector}) keeps its prompt alone, and a turn left
 * with no text at all is left out. With a fixed `idToken`, turn N
 * uses `<idToken><N>`, so linked-citation block IDs stay unique across turns.
 *
 * @throws ConversionError as {@link convertMessage} does for a reply.
 */
export function convertConversation(adapter: SiteAdapter, turns: readonly ConversationTurn[], options: ConversationOptions): string {
  const { promptFormat, referencesFor, ...shared } = options;
  const parts: string[] = [];
  turns.forEach((turn, index) => {
    const prompt = turn.prompt?.trim() ? { text: turn.prompt, ...promptFormat } : undefined;
    const hasContent = turn.reply.matches(adapter.contentSelector) || turn.reply.querySelector(adapter.contentSelector) !== null;
    if (!hasContent) {
      if (prompt) parts.push(formatPrompt(prompt.text, prompt.format, prompt.headingLevel));
      return;
    }
    const markdown = convertMessage(adapter, turn.reply, {
      ...shared,
      references: referencesFor?.(turn.reply) ?? null,
      ...(prompt ? { prompt } : {}),
      ...(shared.idToken !== undefined ? { idToken: `${shared.idToken}${index + 1}` } : {}),
    }).trim();
    if (markdown) parts.push(markdown);
  });
  return parts.join("\n\n");
}
