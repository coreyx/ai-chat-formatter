import type { HeadingLevel, PromptFormat } from "./types";

/** Elements that start and end a paragraph of the prompt. */
const BLOCK_ELEMENTS = new Set(["P", "DIV", "LI", "PRE", "BLOCKQUOTE", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6"]);

/** Parts of a prompt that are never its text: buttons, icons and anything that can't hold typed text. */
const ALWAYS_SKIPPED = "button, svg, img, script, style, template";

/**
 * The plain text of a prompt as the user typed it: `\n` between lines and
 * `\n\n` between paragraphs. Chat sites show a prompt in pre-wrapped text, so
 * newlines inside its text are kept as line breaks rather than collapsed as
 * HTML would; `<br>` is a line break too, and block elements are paragraphs.
 * Buttons, icons and whatever matches `skip` (such as a "You said" label
 * meant for screen readers) are left out. Spaces at line ends are trimmed and
 * runs of blank lines become one, since a site may render a typed blank line
 * as a newline, a `<br>` and another newline. Returns null when nothing but
 * whitespace is left.
 */
export function promptText(element: Element, skip?: string): string | null {
  const skipped = skip ? `${ALWAYS_SKIPPED}, ${skip}` : ALWAYS_SKIPPED;
  let text = "";
  const walk = (node: Node): void => {
    if (node.nodeType === node.TEXT_NODE) {
      text += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== node.ELEMENT_NODE) return;
    const child = node as Element;
    if (child.matches(skipped)) return;
    if (child.nodeName === "BR") {
      text += "\n";
      return;
    }
    const block = BLOCK_ELEMENTS.has(child.nodeName);
    if (block) text += "\n\n";
    child.childNodes.forEach(walk);
    if (block) text += "\n\n";
  };
  element.childNodes.forEach(walk);
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
  return normalized.trim() ? normalized : null;
}

/**
 * Escapes what would make a typed line turn into a heading in the copy: a
 * leading run of one to six `#` followed by a space or the end of the line.
 * Left alone, the minimum heading level would count and shift it, and it
 * would break out of the prompt's format.
 */
function escapeHeadingMarker(line: string): string {
  return line.replace(/^( {0,3})(#{1,6})(?=[ \t]|$)/, "$1\\$2");
}

/** `lines` as a blockquote; a blank line stays inside the quote as a bare `>`. */
function quote(lines: string[]): string {
  return lines.map((line) => (line ? `> ${line}` : ">")).join("\n");
}

/**
 * Writes the prompt `text` (as {@link promptText} gives it) as Markdown in
 * `format`, ready to go above the response:
 * - `heading`: the first line as a heading at `headingLevel`, since a heading
 *   can only hold one line; any further lines follow it as a blockquote.
 * - `blockquote`: every line quoted.
 * - `bold`: each paragraph wrapped in `**`, lines kept.
 * - `plain`: the lines as they are.
 *
 * The text is otherwise kept as typed, Markdown included, except that lines
 * which would become headings are escaped.
 */
export function formatPrompt(text: string, format: PromptFormat, headingLevel: HeadingLevel): string {
  const lines = text.split("\n").map(escapeHeadingMarker);
  switch (format) {
    case "heading": {
      // A space then `#`s at the end of a heading line would be read as its closing sequence and dropped.
      const title = lines[0].trim().replace(/([ \t])(#+)[ \t]*$/, "$1\\$2");
      const rest = lines.slice(1);
      while (rest.length && !rest[0].trim()) rest.shift();
      const heading = `${"#".repeat(headingLevel)} ${title}`;
      return rest.length ? `${heading}\n\n${quote(rest)}` : heading;
    }
    case "blockquote":
      return quote(lines);
    case "bold":
      return lines
        .join("\n")
        .split(/\n{2,}/)
        .map((paragraph) => `**${paragraph.trim()}**`)
        .join("\n\n");
    case "plain":
      return lines.join("\n");
  }
}
