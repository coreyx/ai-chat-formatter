/*
 * Helpers for sites that render Markdown with Streamdown (Duck.ai and
 * DuckDuckGo's Search Assist). Streamdown marks its output with
 * `data-streamdown` attributes but draws some of it in ways Turndown can't
 * read back as Markdown: bold as a styled `<span>`, and code blocks as one
 * `<span>` per line with no newlines between them.
 */

/** Code block labels that mean "no particular language", so the fence gets no info string. */
const PLAIN_LANGUAGES = new Set(["text", "plaintext", "plain", "txt"]);

/**
 * The fence info string for a Streamdown code block's `data-language` value:
 * lowercased, or empty when the block names no real language.
 */
export function streamdownLanguageId(language: string | null | undefined): string {
  const id = (language ?? "").trim().toLowerCase();
  return PLAIN_LANGUAGES.has(id) ? "" : id;
}

/**
 * Rewrites Streamdown's code blocks as `<pre><code>` that Turndown fences.
 *
 * Streamdown renders each line as its own `<span>` under `<code>`, with no
 * newline characters between them, so the block's text alone would run every
 * line together. The lines are joined with newlines here instead, keeping each
 * line's own leading spaces. A block without line spans falls back to its text.
 */
export function rewriteStreamdownCodeBlocks(root: HTMLElement): void {
  const document = root.ownerDocument;
  for (const block of Array.from(root.querySelectorAll<HTMLElement>('[data-streamdown="code-block"]'))) {
    const source = block.querySelector("code");
    const lines = source ? Array.from(source.children).map((line) => line.textContent ?? "") : [];

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    const language = streamdownLanguageId(block.getAttribute("data-language"));
    if (language) code.className = `language-${language}`;
    code.textContent = lines.length > 0 ? lines.join("\n") : (source?.textContent ?? block.textContent ?? "");
    pre.appendChild(code);
    block.replaceWith(pre);
  }
}

/**
 * Turns Streamdown's bold text back into `<strong>`. Streamdown renders `**…**`
 * as a `<span data-streamdown="strong">` styled bold, and Turndown only knows
 * bold from the tag, so without this every bold run would copy as plain text.
 */
export function rewriteStreamdownStrong(root: HTMLElement): void {
  for (const span of Array.from(root.querySelectorAll('span[data-streamdown="strong"]'))) {
    const strong = root.ownerDocument.createElement("strong");
    strong.append(...Array.from(span.childNodes));
    span.replaceWith(strong);
  }
}
