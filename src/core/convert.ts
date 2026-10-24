import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { CitationCollector, renderCitations } from "./citations";
import { runRules } from "./rules";
import { ConversionError, type CitationStyle, type SiteAdapter } from "./types";

/**
 * List items with a single space after the marker (`- item`, `1. item`).
 * Turndown's own rule pads markers to four characters, which renders the same
 * but makes every pasted list look unlike one typed in Obsidian.
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
    const body = content.replace(/^\n+/, "").replace(/\n+$/, "") + (isParagraph ? "\n" : "");
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
 * @throws ConversionError when the message has no reply body or an adapter
 *   rule finds content it can't convert faithfully.
 */
export function convertMessage(
  adapter: SiteAdapter,
  message: Element,
  style: CitationStyle,
  isRuleEnabled: (ruleId: string) => boolean,
): string {
  const content = message.matches(adapter.contentSelector) ? message : message.querySelector(adapter.contentSelector);
  if (!content) throw new ConversionError(`Couldn't find the reply text in this ${adapter.name} message.`);

  const clone = content.cloneNode(true) as HTMLElement;
  for (const selector of adapter.stripSelectors) {
    clone.querySelectorAll(selector).forEach((element) => element.remove());
  }

  const collector = new CitationCollector();
  const service = createTurndown();
  // Site rules go last so they take precedence over the shared ones; Turndown checks the most recently added rule first.
  for (const [name, rule] of Object.entries(adapter.turndownRules({ registerCitation: (citation) => collector.register(citation) }))) {
    service.addRule(name, rule);
  }

  const markdown = renderCitations(service.turndown(clone), collector.citations, style);
  // Rules run after citations are rendered so that citation titles are cleaned up too.
  return runRules(markdown, adapter.rules, isRuleEnabled);
}
