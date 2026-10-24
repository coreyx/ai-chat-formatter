import type TurndownService from "turndown";
import { parseCitationTitle } from "../core/citations";
import { collapseBlankLinesRule, invisibleCharactersRule } from "../core/rules";
import { ConversionError, type ConversionContext, type SiteAdapter } from "../core/types";

/*
 * Microsoft Copilot (consumer). Every selector here comes from copilot.com's
 * rendered page as inspected on 2026-10-24; none of it is a documented API.
 * When Copilot changes its markup, this is the file to update.
 */

/** Copilot's code viewer labels, mapped to fence info strings where the label isn't already one. */
const LANGUAGE_IDS: Record<string, string> = {
  "plain text": "",
  plaintext: "",
  text: "",
  "c#": "csharp",
  "c++": "cpp",
  "f#": "fsharp",
  shell: "bash",
  "objective-c": "objectivec",
};

/** The fence info string for a code viewer label such as "Python" or "Plain Text"; empty means no language. */
export function copilotLanguageId(label: string | null | undefined): string {
  const key = (label ?? "").trim().toLowerCase();
  return key in LANGUAGE_IDS ? LANGUAGE_IDS[key] : key.replace(/\s+/g, "");
}

/**
 * Replaces each of Copilot's code viewers in `root` with a plain
 * `<pre><code class="language-…">`. The viewer is not a `<pre>`: it renders
 * one `[data-line-index]` div per line beside a separate line-number gutter,
 * so its text has to be reassembled line by line.
 *
 * The viewer is marked as virtualized, so a long block may not have every line
 * in the page. Rather than copy a block with lines silently missing, this
 * throws when the line indices aren't continuous from 0 or don't match the
 * gutter's line count.
 */
function rewriteCodeBlocks(root: HTMLElement): void {
  const document = root.ownerDocument;
  for (const block of Array.from(root.querySelectorAll<HTMLElement>(".scriptor-component-code-block"))) {
    const lines = Array.from(block.querySelectorAll<HTMLElement>("[data-line-index]"))
      .map((line) => ({ index: Number(line.getAttribute("data-line-index")), text: line.textContent ?? "" }))
      .sort((a, b) => a.index - b.index);
    const gutterCount = block.querySelectorAll("[data-line-number]").length;
    const continuous = lines.every((line, i) => line.index === i);
    if (lines.length === 0 || !continuous || (gutterCount > 0 && gutterCount !== lines.length)) {
      throw new ConversionError(
        "A code block in this reply isn't fully loaded, so it can't be copied completely. Scroll through the code block, then try again, or use Copilot's own Copy button.",
      );
    }

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    const language = copilotLanguageId(block.querySelector('[data-testid="one-copilot-code-identity"] span')?.textContent);
    if (language) code.className = `language-${language}`;
    code.textContent = lines.map((line) => line.text).join("\n");
    pre.appendChild(code);
    block.replaceWith(pre);
  }
}

/** One entry of a citation chip's `data-grouped-citations` JSON. */
interface GroupedCitation {
  url?: unknown;
  name?: unknown;
}

/**
 * Turndown rule for Copilot's citation chips: `<button data-grouped-citations>`
 * holding a JSON array of the sources the chip stands for. Each source is
 * registered and replaced by its placeholder. The chip's `aria-label` names the
 * page title, but only for a chip with a single source; a chip grouping several
 * falls back to each source's name. A chip whose JSON can't be read keeps its
 * visible text rather than failing the whole copy.
 */
function citationChipRule(context: ConversionContext): TurndownService.Rule {
  return {
    filter: (node) => node.nodeName === "BUTTON" && node.hasAttribute("data-grouped-citations"),
    replacement: (content, node) => {
      let group: GroupedCitation[];
      try {
        const parsed: unknown = JSON.parse(node.getAttribute("data-grouped-citations") ?? "");
        group = Array.isArray(parsed) ? parsed : [];
      } catch {
        return content;
      }
      const sources = group.filter((entry): entry is { url: string; name?: unknown } => typeof entry?.url === "string" && /^https?:\/\//.test(entry.url));
      if (sources.length === 0) return content;
      const label = sources.length === 1 ? node.getAttribute("aria-label") : null;
      return sources
        .map((source) => {
          const name = typeof source.name === "string" ? source.name : "";
          return context.registerCitation({ url: source.url, title: parseCitationTitle(label, name, source.url), sourceName: name });
        })
        .join("");
    },
  };
}

export const copilotAdapter: SiteAdapter = {
  id: "copilot",
  name: "Copilot",
  matches: ["https://copilot.microsoft.com/*", "https://copilot.com/*"],
  // User prompts are articles too; only replies contain a markdown-reply body.
  messageSelector: 'div[role="article"]:has([data-testid="markdown-reply"])',
  contentSelector: '[data-testid="markdown-reply"]',
  nativeCopyButtonSelector: 'button[data-testid="CopyButtonTestId"]',
  findButtonAnchor(message) {
    const container = message.querySelector('[data-testid="CopyButtonContainerTestId"]');
    return container?.parentElement ? { parent: container.parentElement, before: container.nextSibling } : null;
  },
  stripSelectors: ['[role="status"]', "[aria-live]"],
  preprocess: rewriteCodeBlocks,
  turndownRules: (context) => ({ copilotCitationChip: citationChipRule(context) }),
  rules: [invisibleCharactersRule, collapseBlankLinesRule],
};
