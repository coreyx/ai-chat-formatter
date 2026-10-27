---
status: approved
---

# Copy the user's prompt with the response

Adds a **Copy the prompt with the response** setting, on by default, so a copy starts with the prompt that the reply answers. A **Prompt format** drop-down chooses how the prompt looks: **Heading** (the default), **Blockquote**, **Bold** or **Plain text**. When the format is Heading, a **Prompt heading level** drop-down sets its level, H2 by default, and the response nests below it. Turning the setting off copies only the response, as today. On Search Assist, the search query stands in for the prompt.

**Related documents**
- [Minimum heading level plan](../min-heading-level/implementation_plan.md)
- [Duck.ai adapter plan](../duck-ai-adapter/implementation_plan.md)
- [DuckDuckGo Search Assist plan](../duckduckgo-search-assist/implementation_plan.md)

## User Review Required

> [!IMPORTANT]
> **On by default, so copies change after the update.** Every copy from the **Copy as Markdown** button, and from the site's own Copy button when the override is on, starts with the prompt in the chosen format. Turning **Copy the prompt with the response** off brings back today's output exactly. The three settings apply to every site, like Citation style and Minimum heading level.

> [!IMPORTANT]
> **The four formats.** Using a prompt of "What is new in Widget 5?":
>
> | Format | Copied as |
> |---|---|
> | **Heading** (default, H2) | `## What is new in Widget 5?` |
> | **Blockquote** | `> What is new in Widget 5?` |
> | **Bold** | `**What is new in Widget 5?**` |
> | **Plain text** | `What is new in Widget 5?` |
>
> - **A blank line** separates the prompt from the response in every format.
> - **Longer prompts:**
>   - Blockquote quotes every line.
>   - Bold makes each paragraph bold on its own.
>   - Plain text keeps the prompt's lines and paragraphs as they are.
> - **Heading, with a prompt of several lines:** the first line becomes the heading and the rest follows as a blockquote, since a heading must fit on one line.

> [!IMPORTANT]
> **With the Heading format, the response nests below the prompt.** The prompt keeps the level you choose. The response's headings and the Sources section shift so their top heading is at least one level deeper than the prompt, or at the minimum heading level if that's deeper.
> - **Prompt H2, minimum H1:** a response's `# Title` becomes `### Title`, and `## Sources` becomes `### Sources`.
> - **Prompt H2, minimum H4:** the response starts at H4, and the prompt stays at H2.
> - **Prompt H6:** the response's headings are capped at H6, like any other heading.
>
> The minimum heading level still applies to the response in the other three formats, which add no heading. Its options-page hint changes to say that the prompt heading uses its own level.

> [!NOTE]
> **Where the prompt comes from:**
> - **Copilot:** the message just before the reply.
> - **Duck.ai:** the nearest `user-message` before the reply. When Duck.ai shows more than one reply to a prompt, each copy gets that prompt.
> - **Search Assist:** the `q` in the page's address, which is the query DuckDuckGo searched. Text typed into the search box but not yet searched isn't used.
> - **If no prompt can be found**, the copy holds the response alone, with no error. For example, Copilot might have dropped an old message from a long conversation, or a page might have no `q`.

> [!NOTE]
> **The prompt is copied as typed.** Markdown that someone types in a prompt, such as `**bold**` or a backtick, stays as it is. One exception: a line that would otherwise turn into a heading, such as one starting `# `, gets its `#` escaped (`\#`). Otherwise the minimum heading level would treat it as a heading, and it would break the prompt's format. Images and file attachments in a prompt aren't copied.

## Open Questions

- **The live markup of a multi-line prompt.** The fixtures from the 2026-10-24 inspection only have one-line prompts. TASK-1 inspects the live markup of a prompt with several lines and a blank line on Copilot and on Duck.ai, recording only the structure, as before. That needs a conversation containing such a prompt. **Proposed:** you send one in a new chat on each site, for example "Line one of a test.", a blank line, then "Line three.", and tell me when it's there. I then read its structure in a new Brave tab. Alternatively, approving this plan lets me send exactly that synthetic prompt myself, in a new chat on each site. Say which you prefer.

## Proposed Changes

### Fixtures

#### [MODIFY] `scratch/fixtures/copilot-message.html` and `scratch/fixtures/duckai-message.html`
- [x] **TASK-1:** Inspect a live multi-line prompt on Copilot and Duck.ai, as described under Open Questions, recording structure only.
  - Add a second conversation turn to each fixture, with a prompt of two lines and a blank line, marked up as the live page does it: paragraphs, `<br>`, or newlines in pre-wrapped text. Its text is synthetic.
  - Note in each fixture's header comment what the inspection found, including any screen-reader labels or attachment chips inside the prompt that must be left out.

### Core

#### [MODIFY] `src/core/types.ts`
- [ ] **TASK-2:** Add the prompt types.
  - `export type PromptFormat = "heading" | "blockquote" | "bold" | "plain"` and `export const PROMPT_FORMATS: readonly PromptFormat[]` in that order, documented.
  - Add `readPrompt?(message: Element): string | null` to `SiteAdapter`. Its documentation says it returns the prompt as plain text, with `\n` between lines and `\n\n` between paragraphs, or null when there's none.

#### [NEW] `src/core/prompt.ts`
- [ ] **TASK-3:** Add two functions.
  - `promptText(element: Element): string | null` turns a prompt's markup into that plain text.
    - Block elements (`p`, `div`, `li`, `pre`, and headings) become paragraph breaks.
    - `<br>` becomes a line break. Newlines already in the text are kept, since pre-wrapped prompts carry their line breaks that way.
    - Spaces at the ends of lines are trimmed, runs of more than one blank line collapse into one, and an empty prompt gives null.
    - Anything matching the selectors that TASK-1 finds to exclude is skipped.
  - `formatPrompt(text: string, format: PromptFormat, headingLevel: HeadingLevel): string` writes the prompt block in `format`, as tabled under User Review Required.
    - A line that would otherwise be read as a heading gets its leading `#` escaped.
    - Blank lines inside a blockquote are written as `>`.

#### [MODIFY] `src/core/convert.ts`
- [ ] **TASK-4:** Add `prompt?: { text: string; format: PromptFormat; headingLevel: HeadingLevel }` to `ConversionOptions`, documented; leaving it out keeps today's output.
  - `convertMessage` renders the response and its citations as now.
  - It shifts them with `enforceMinHeadingLevel`, at `minHeadingLevel`. When the format is `heading`, it uses `max(minHeadingLevel, headingLevel + 1)` instead, capped at 6.
  - It then puts `formatPrompt(...)` and a blank line in front, and runs the site's clean-up rules over the whole copy.
  - Because the prompt is added after the shift, its own heading keeps the chosen level.

#### [MODIFY] `src/core/settings.ts`
- [ ] **TASK-5:** Add three settings to `Settings`, documented:
  - `includePrompt: boolean`, default `true`;
  - `promptFormat: PromptFormat`, default `"heading"`;
  - `promptHeadingLevel: HeadingLevel`, default `2`.

  `mergeSettings` checks each one: `bool` for the switch, and `PROMPT_FORMATS` and `HEADING_LEVELS` for the drop-downs, falling back to the defaults. Settings saved before this change get the defaults, so the prompt is copied.

### Site adapters

#### [MODIFY] `src/sites/copilot.ts`
- [ ] **TASK-6:** Add `readPrompt`.
  - It finds the closest `div[role="article"]` before the reply's article that has no `[data-testid="markdown-reply"]`, and returns `promptText` of its text container. The selector is confirmed or adjusted by TASK-1.
  - It returns null when the article before is another reply or there isn't one.

#### [MODIFY] `src/sites/duckai.ts`
- [ ] **TASK-7:** Add `readPrompt`: the last `[data-testid="user-message"]` before the reply in document order, through `promptText`, or null.

#### [MODIFY] `src/sites/duckduckgo.ts`
- [ ] **TASK-8:** Add `readPrompt`: the `q` parameter of the message's page address (`URLSearchParams` decodes `+` as a space), trimmed, or null when it's missing or empty.

### Content script

#### [MODIFY] `src/content/controller.ts`
- [ ] **TASK-9:** In `convert`, when `settings.includePrompt` is on, read the prompt with `adapter.readPrompt`.
  - A thrown error is caught and logged with the other warnings, and the copy goes ahead without the prompt.
  - It then passes `prompt: { text, format: settings.promptFormat, headingLevel: settings.promptHeadingLevel }` when there's a prompt.
  - Reading the prompt is synchronous, so the Copy-button override includes it too.

### Options page

#### [MODIFY] `src/options/options.ts` and `src/options/options.html`
- [ ] **TASK-10:** Add a **User prompt** section after Minimum heading level, in a `fieldset.global`, so the master switch greys it out. It holds:
  - A checkbox, **Copy the prompt with the response**, with the hint "Starts each copy with the prompt the reply answers. On Search Assist, that's the search query."
  - A **Prompt format** `<select name="promptFormat">` with Heading, Blockquote, Bold and Plain text, each option labelled with what it writes, such as `Heading (## Prompt)`.
  - A **Prompt heading level** `<select name="promptHeadingLevel">`, H1 to H6, with the hint "The response's headings and Sources nest one level below it."

  The two drop-downs are disabled while the checkbox is off, and the heading level is also disabled unless the format is Heading. Both are labelled through `aria-labelledby` and described by their hints, like the minimum heading level drop-down. The minimum heading level hint gains "The prompt heading, if any, uses its own level." Labels for the new controls reuse the existing `select` styles.

### Tests

#### [NEW] `scratch/test_copy-user-prompt.ts` and [MODIFY] existing settings checks
- [ ] **TASK-11:** A regression script, picked up by `pnpm test`. See Automated Tests below.
  - The two checks in `scratch/test_ai-chat-formatter.ts` that compare whole settings objects gain the three new defaults.
  - The README's development tree gains the new script.

## Verification Plan

### Automated Tests
`pnpm test` runs every `scratch/test_*.ts`. The new `scratch/test_copy-user-prompt.ts` checks:
1. **`promptText`:**
   - Paragraphs, `<br>` and pre-wrapped newlines each give the right line and paragraph breaks.
   - Spaces at line ends are trimmed and repeated blank lines are collapsed.
   - The excluded parts that TASK-1 found are skipped.
   - An empty prompt gives null.
2. **`formatPrompt`:**
   - Each of the four formats, for a one-line prompt and for a prompt with several lines.
   - Heading's first line followed by the blockquoted rest, and the level setting from H1 to H6.
   - A prompt line starting `# ` is escaped in every format.
3. **Through `convertMessage`, with the Heading format:**
   - Prompt H2: the response's H1 goes to H3 and Sources to H3/H4, with the prompt heading first.
   - Prompt H2 with minimum H4: the response starts at H4.
   - Prompt H6: everything is capped at H6.
   - Citation markers and block IDs are unchanged.
4. **Through `convertMessage`, other formats:**
   - Blockquote, Bold and Plain text leave the response's levels to the minimum heading level.
   - With no `prompt`, the output is byte-identical to today's.
5. **Adapters, on the fixtures:**
   - **Copilot:** finds the prompt before each reply, including the multi-line one from TASK-1, and gives null for a reply with no prompt before it.
   - **Duck.ai:** gives each reply its own prompt.
   - **Search Assist:** reads `q` from a page address such as `https://duckduckgo.com/?q=widget+sizes&ia=web`, and gives null with no `q`.
6. **Settings:**
   - The defaults are on, Heading and H2, and settings saved before this change get them.
   - Invalid stored values fall back.
7. **Options page:**
   - The section comes after Minimum heading level and shows the stored values.
   - The heading level is disabled unless the format is Heading, and both drop-downs are disabled while the checkbox is off.
   - Each change reports the right value.
8. **Controller:**
   - The Copy as Markdown button and the Copy-button override both copy the prompt heading first.
   - With the setting off, the copy is the response alone.
   - An adapter whose `readPrompt` throws still copies the response.

The existing scripts are re-run as regression checks, and `tsc --noEmit` must pass after every item.

### Manual Verification
1. Run `pnpm run build` and reload the extension from `brave://extensions`.
2. On the options page:
   - **User prompt** should sit under Minimum heading level, set to on, Heading and H2.
   - Prompt heading level should grey out when you pick Blockquote, and both drop-downs should grey out when the checkbox is off.
3. On Copilot, copy a reply and paste it into Obsidian. It should start with `## <your prompt>`, with the reply's headings and Sources below it.
4. Copy the reply to a prompt with several lines: the first line should be the heading and the rest a blockquote.
5. Try Blockquote, Bold and Plain text on Duck.ai, and check that each reply in a conversation gets its own prompt.
6. On Search Assist, copy an answer: it should start with the search query.
7. With **Use for _site_'s own Copy button** on, check the site's Copy includes the prompt too.
8. Turn **Copy the prompt with the response** off and check that a copy is the response alone, as before.

## Visual design application
No `design-system.md` or `art-bible.md` exists for this product. The new controls reuse the options page's existing checkbox, `select` and hint styles.
