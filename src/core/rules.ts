import type { FormatRule } from "./types";

/** An opening code fence: up to three spaces of indent, then three or more backticks or tildes. */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Applies `fn` to the runs of lines outside fenced code blocks and leaves the
 * fenced blocks, fence lines included, exactly as they are. A block closes at
 * a fence of the same character that is at least as long as the opening one,
 * per CommonMark; an unclosed block runs to the end of the text.
 */
export function mapOutsideCodeFences(text: string, fn: (prose: string) => string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let prose: string[] = [];
  let fence: string | null = null;

  const flushProse = () => {
    if (prose.length) out.push(fn(prose.join("\n")));
    prose = [];
  };

  for (const line of lines) {
    if (fence === null) {
      const open = FENCE_OPEN.exec(line);
      if (open) {
        flushProse();
        fence = open[1];
        out.push(line);
      } else {
        prose.push(line);
      }
    } else {
      out.push(line);
      const close = new RegExp(`^ {0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}\\s*$`);
      if (close.test(line)) fence = null;
    }
  }
  flushProse();
  return out.join("\n");
}

/**
 * Normalizes characters that are invisible on screen but break Markdown or
 * search in the pasted note: non-breaking spaces become plain spaces, and
 * zero-width characters are removed. A zero-width joiner between pictographs
 * is kept, since emoji such as 👨‍👩‍👧 are built from them.
 */
export const invisibleCharactersRule: FormatRule = {
  id: "invisible-characters",
  name: "Normalize invisible characters",
  description: "Turns non-breaking spaces into normal spaces and removes zero-width characters.",
  defaultEnabled: true,
  apply: (markdown) =>
    markdown
      .replace(/[  ]/g, " ")
      .replace(/[​‌⁠﻿]/g, "")
      .replace(/(?<![\p{Extended_Pictographic}\u{FE0F}\u{1F3FB}-\u{1F3FF}])‍|‍(?!\p{Extended_Pictographic})/gu, ""),
};

/**
 * Collapses runs of blank lines to a single blank line and trims blank lines
 * from both ends. Fenced code is left untouched, since blank lines there are
 * part of the code.
 */
export const collapseBlankLinesRule: FormatRule = {
  id: "collapse-blank-lines",
  name: "Collapse blank lines",
  description: "Reduces runs of blank lines to one, outside code blocks.",
  defaultEnabled: true,
  apply: (markdown) =>
    mapOutsideCodeFences(markdown, (prose) =>
      prose
        .split("\n")
        .filter((line, i, lines) => !(line.trim() === "" && i > 0 && lines[i - 1].trim() === ""))
        .join("\n"),
    )
      .replace(/^(?:[ \t]*\n)+/, "")
      .replace(/(?:\n[ \t]*)+$/, ""),
};

/** Applies the rules that `isEnabled` allows to `markdown`, in the order given. */
export function runRules(markdown: string, rules: readonly FormatRule[], isEnabled: (ruleId: string) => boolean): string {
  return rules.reduce((text, rule) => (isEnabled(rule.id) ? rule.apply(text) : text), markdown);
}
