# Walkthrough: Copy the user's prompt with the response

Copies now start with the prompt the reply answers, on Copilot, Duck.ai and Search Assist (where the search query stands in for it). Three settings apply to every site:
- **Copy the prompt with the response:** on by default.
- **Prompt format:** Heading (the default), Blockquote, Bold or Plain text.
- **Prompt heading level:** H2 by default.

As a heading, the prompt is the copy's top heading and the response, Sources included, starts one level below it. The Minimum heading level then isn't used, and the options page greys it out. With the prompt off, or in another format, the Minimum heading level applies as before.

## What Was Implemented

### 1. Live inspection and fixtures (TASK-1)
- **The test prompt:** with your approval, I sent "Line one of a test.", a blank line, then "Line three." in a new chat on Copilot and on Duck.ai. Then I read the prompt's structure, recording only tags and attributes.
- **Copilot:** the prompt's article holds three things:
  - a screen-reader-only `<h5>` reading "You said:";
  - an icon-only **More actions** button;
  - the text, pre-wrapped, in `[data-testid="chatOutput"]`. A typed blank line is rendered there as a newline, a `<br>` and another newline.
- **Duck.ai:** `[data-testid="user-message"]` holds four things:
  - a screen-reader-only `<h3>` reading "You said";
  - the text in one pre-wrapped `<p>` with plain newlines;
  - an icon;
  - a toolbar of icon-only Copy and Edit buttons.

  The "You said" heading wasn't there at the 2026-10-24 inspection.
- **`scratch/fixtures/copilot-message.html`:** its prompt now has Copilot's live structure, with two lines of synthetic text.
- **`scratch/fixtures/duckai-message.html`:** both prompts now have Duck.ai's live structure, and the second one has two lines.

### 2. Core
- **`src/core/types.ts`**: `PromptFormat`, `PROMPT_FORMATS`, and an optional `SiteAdapter.readPrompt(message)` that returns plain text.
- **`src/core/prompt.ts`** (new):
  - **`promptText(element, skip?)`:**
    - Newlines in the text are kept, `<br>` is a line break, and block elements are paragraphs.
    - Buttons, icons, images and whatever matches `skip` are left out.
    - Trailing spaces are trimmed, runs of blank lines collapse to one, and an empty prompt gives null.
  - **`formatPrompt(text, format, level)`:** writes the four formats.
    - **Heading:** the first line becomes the heading and the rest is quoted.
    - **Blockquote:** every line is quoted, with `>` on blank lines.
    - **Bold:** each paragraph is bold.
    - **Plain:** the text as typed.

    A typed line that would become a heading has its `#` escaped. A heading line ending in ` #` has that `#` escaped too, so it isn't dropped as a closing sequence.
- **`src/core/convert.ts`:**
  - **New option:** `ConversionOptions.prompt`.
  - **The shift:** `responseMinHeadingLevel` is the prompt level plus one (capped at 6) for a prompt heading, and `minHeadingLevel` otherwise. The response and Sources are shifted to it as one block.
  - **Order:** the prompt goes in front after the shift, so it keeps its own level. The clean-up rules then run over the whole copy.
- **`src/core/settings.ts`**: `includePrompt` (true), `promptFormat` (`"heading"`) and `promptHeadingLevel` (2). Each is validated, so settings saved earlier get these defaults.

### 3. Site adapters
- **Copilot** (`readCopilotPrompt`):
  - It reads the article just before the reply, using its `chatOutput` text.
  - If that element is missing, it falls back to the article's own text, without headings.
  - It returns null when the article before is another reply, or there isn't one.
- **Duck.ai** (`readDuckAiPrompt`): it reads the last user message before the reply, without headings. A second reply to the same prompt gets that prompt.
- **Search Assist** (`readSearchAssistPrompt`): it reads `q` from the page address, decoding `+` as a space, or returns null.

### 4. Content script
- **`src/content/controller.ts`:**
  - When `includePrompt` is on, `convert` reads the prompt and passes it on with the chosen format and level.
  - A reader that throws is logged and the copy goes ahead without the prompt.
  - The button and the Copy-button override share `convert`, so both include the prompt.

### 5. Options page
- **`src/options/options.ts`:** a **User prompt** section after Minimum heading level, holding:
  - the checkbox;
  - **Prompt format**, with the options "Heading (## Prompt)", "Blockquote (> Prompt)", "Bold (\*\*Prompt\*\*)" and "Plain text";
  - **Prompt heading level**, H1 to H6.

  Each drop-down has a visible label and a hint, linked through `aria-labelledby` and `aria-describedby`. Which controls are disabled:
  - The format is disabled while the checkbox is off.
  - The prompt level is disabled unless the prompt is on in the Heading format.
  - Minimum heading level is disabled while the prompt is on in the Heading format, and its hint says why.

  New `dropDown` and `labelledField` helpers build all three drop-downs.
- **`src/options/options.html`**: styles for the labelled fields and for disabled drop-downs.

### Changes made during implementation
- **The plan was revised mid-way, with your agreement** (`2e4822b`). As approved, the response under a prompt heading would have started at the minimum heading level when that was deeper. Its example also had Sources always one level below the prompt, which its own shift doesn't produce. You simplified the rule:
  - With the prompt on in the Heading format, the response always starts one level below the prompt, and Minimum heading level isn't used; it's greyed out on the options page.
  - With the prompt off, the minimum applies.
  - For the other formats, which have no prompt heading, the minimum applies too, as I proposed and you approved.
- **TASK-4's first checks were wrong.** They expected Sources at H3 under an H2 prompt even when the response starts at H1. The code shifts the response and Sources by one amount, which puts Sources at H4 there, so I corrected the checks. The same thing happened in one Blockquote check.
- **Older checks updated for the new default:**
  - Three controller checks in `scratch/test_ai-chat-formatter.ts` and `scratch/test_duck-ai-adapter.ts` compare the copy with the reply alone. They now turn the prompt off.
  - The two whole-settings checks expect the three new fields.
  - The minimum-heading-level check that the master switch greys out the drop-down now turns the prompt off first, since a prompt heading greys it out too.
- **Copilot's human check.** The first attempt to send the test prompt brought up a "Verify you are human" check, which I can't complete. The second attempt, while you watched, went through with no check.

## Verification & Test Results

### Automated Tests
`pnpm test` runs `scratch/test_copy-user-prompt.ts`: **33/33 passed.**
- **`promptText`:**
  - Copilot's newline, `<br>`, newline becomes one blank line.
  - `<br>` and block elements become line breaks and paragraphs.
  - The skip selector, buttons, icons and images are left out.
  - Trailing spaces are trimmed, and an empty prompt gives null.
- **`formatPrompt`:**
  - All four formats, for one-line and multi-line prompts.
  - Heading's first line with the rest quoted, and a blank line after it.
  - Levels H1 to H6.
  - `# ` lines escaped in every format, while `#hashtag` and seven `#`s are left alone.
  - A trailing ` #` keeps its `#`, and `C#` is unchanged.
- **Through `convertMessage`:**
  - Prompt H2 over a response starting at H1: `##` prompt, `###` response, `####` Sizes, `#### Sources`, `##### Citations`. Markers and block IDs are unchanged.
  - A response with no headings: `### Sources`.
  - Minimum heading levels of H1, H2, H4 and H6 all give the same result under a prompt heading.
  - Prompt H1 puts the response at H2, and H6 leaves everything at H6.
  - A multi-line prompt as a heading with its quote.
  - Blockquote, Bold and Plain text leave the response's levels to the minimum, and an escaped `# ` line in the prompt isn't counted.
  - With no prompt, the copy is unchanged.
- **Adapters:**
  - **Copilot:** reads the fixture's prompt from `chatOutput`, and from the article when `chatOutput` is missing. It gives null after another reply or with no article before.
  - **Duck.ai:** gives each reply its own prompt, and a second reply to the same prompt gets that prompt. It gives null with no prompt before.
  - **Search Assist:** `?q=widget+sizes%3F` gives `widget sizes?`, and no `q` or a blank one gives null.
- **Settings:** the defaults are on, Heading and H2. Stored values are kept, older settings get the defaults, and invalid values fall back.
- **Options page:**
  - Section order, stored values, option labels, and labels and hints for screen readers.
  - Disabled states for prompt-heading, Blockquote, prompt-off and master-off.
  - Each control reports only its own change.
- **Controller, on the Copilot fixture:**
  - The button copies `## …` with the rest of the prompt quoted. The reply's `###` heading goes to `####` and Sources to `###`.
  - The override copies the prompt too.
  - Blockquote format, and the setting off, work as expected.
  - A throwing reader still copies the response.

`tsc --noEmit` passes, and was run after every item.

### Regression Testing
Under pnpm, re-run after every item:
- `scratch/test_ai-chat-formatter.ts`: **38/38 passed**, with the updates described above.
- `scratch/test_block-reference-citations.ts`: **7/7 passed.**
- `scratch/test_copilot-source-details.ts`: **30/30 passed.**
- `scratch/test_duck-ai-adapter.ts`: **20/20 passed**, with the prompt off in its controller setup.
- `scratch/test_duckduckgo-search-assist.ts`: **22/22 passed.**
- `scratch/test_min-heading-level.ts`: **21/21 passed**, with the one update described above.
- `scratch/test_pnpm-migration.ts`: **6/6 passed.**

## Manual Verification
Not yet done; these are for the maintainer, in Brave:
1. Run `pnpm run build` and reload the extension from `brave://extensions`.
2. On the options page:
   - **User prompt** should sit under Minimum heading level, set to on, Heading and H2.
   - Minimum heading level should be greyed out.
   - Picking **Blockquote** should grey out Prompt heading level and bring back Minimum heading level.
   - Unticking the checkbox should grey out both prompt drop-downs.
   - Check the drop-downs in light and dark mode.
3. On Copilot, copy a reply with headings and citations and paste it into Obsidian. It should start with `## <your prompt>`, with the reply and Sources starting at H3. Citation markers should still jump to their entries.
4. Copy the reply to a prompt with several lines: the first line should be the heading and the rest a blockquote.
5. On Duck.ai, try Blockquote, Bold and Plain text, and check that each reply in a conversation gets its own prompt.
6. On Search Assist, copy an answer: it should start with the search query.
7. With **Use for _site_'s own Copy button** on, check that the site's Copy includes the prompt.
8. Turn **Copy the prompt with the response** off: a copy should be the reply alone, as before.
9. Delete the two test chats if you like: "Text lines" on Duck.ai, and the "Line one of a test." conversation on Copilot.

## Follow-ups
- **Single line breaks on Copilot are untested.** Only a blank line was checked. If Copilot renders a single Shift+Enter line break as a newline plus a `<br>`, it would copy as a paragraph break instead of a line break.
- **Prompts with attachments weren't inspected.** Images are skipped, but a file chip with text in it could end up in the prompt.
- The manual checks above, before any release.
