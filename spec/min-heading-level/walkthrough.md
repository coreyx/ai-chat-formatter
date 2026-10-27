# Walkthrough: Minimum heading level

A new **Minimum heading level** setting, H1 to H6, applies to every site. When a copy has a heading above that level, every heading in it shifts down by the same amount, the Sources section's included, so the shallowest one lands on the minimum and the hierarchy is kept. Headings that would go past H6 stay at H6. The default, **H1 (no change)**, never shifts anything.

## What Was Implemented

### 1. Core
- **`src/core/types.ts`**: `HeadingLevel` (1 to 6) and `HEADING_LEVELS`.
- **`src/core/headings.ts`** (new): `enforceMinHeadingLevel(markdown, minLevel)`.
  - It finds ATX headings outside fenced code, including in blockquotes, opening a list item, and indented.
  - It measures the shallowest level, shifts every heading by `minLevel - shallowest` when that's positive, and caps the result at 6.
  - `#hashtag`, seven `#`s, `\#` text and `#` lines in code fences aren't headings, and a heading only in code doesn't set the shift.
- **`src/core/convert.ts`**: `ConversionOptions.minHeadingLevel`, optional and treated as 1 when absent. The shift runs after `renderCitations`, so the Sources headings are measured and moved with the reply's, and before the clean-up rules.
- **`src/core/settings.ts`**: `Settings.minHeadingLevel`, default 1. `mergeSettings` keeps a stored level only if it's an integer from 1 to 6, so settings saved by 0.4.0 and earlier load as H1.

### 2. Content script
- **`src/content/controller.ts`**: `convert` passes the setting to `convertMessage`. This covers the **Copy as Markdown** button and the Copy-button override, which share it.

### 3. Options page
- **`src/options/options.ts`**: a **Minimum heading level** section after Citation style, with a `<select name="minHeadingLevel">` from **H1 (no change)** to **H6** and a hint. The section heading labels the drop-down and the hint describes it. It's in a `fieldset.global`, so the master switch greys it out.
- **`src/options/options.html`**: styles for `select` using the page's existing color tokens, so it follows light and dark mode.

### Changes made during implementation
- **Two existing settings checks updated** (TASK-4). `scratch/test_ai-chat-formatter.ts` compares whole settings objects in two checks, which now expect `minHeadingLevel: 1`.
- **TASK-6 and TASK-7 in one commit** (`157c210`). The test script was extended with each item, so the options page checks finished it.
- **A test chip needed text.** In the first draft of the `convertMessage` checks, the chip was an empty `<span>`, which Turndown drops before any rule sees it, so no citation was registered. Giving it text like the other scripts' chips fixed the check. The code wasn't at fault.

## Verification & Test Results

### Automated Tests
`npm test` runs `scratch/test_min-heading-level.ts`: **21/21 passed**.
- **The shift:**
  - Minimum H2 with H1 to H3 moves each down one, including the example from the request.
  - Nothing moves when the shallowest heading is already at the minimum, at minimum H1, or with no headings.
  - The gap is measured from the shallowest heading wherever it sits.
- **Past H6:** H1 and H5 at minimum H4 give H4 and H6; everything at minimum H6 gives H6.
- **What isn't a heading:**
  - These are left alone: fenced code (backtick and tilde), `\#` text, `#hashtag` and seven `#`s.
  - These are shifted: headings in blockquotes, nested blockquotes, list items (bulleted and numbered) and indented lines, and an empty `#`.
  - Heading text and closing `#`s are kept.
- **Through `convertMessage`:**
  - Linked citations at minimum H2: the reply's H1 goes to H2, `## Sources` to `### Sources`, `### Citations` to `#### Citations`, and the markers and block IDs are unchanged.
  - Footnotes with no More list: only the reply's headings move.
  - Footnotes with a More list: Sources and More move too.
  - Leaving the option out gives the same output as H1.
- **Settings:** the default is 1. Stored 3 and 6 are kept, while `0`, `7`, `2.5`, `"2"`, `null`, a missing value and a pre-existing settings object all give 1.
- **Options page:**
  - The drop-down lists the six levels, shows the stored one and comes right after Citation style.
  - It's labeled by the section heading and described by the hint.
  - Choosing H3 reports `3` as a number and changes nothing else.
  - It's disabled while the master switch is off.
- **Controller:** with H3 as the minimum, on the Search Assist fixture's after-More answer, both **Copy as Markdown** and the site's own Copy (with the override on) copy `### How widgets work`, `#### Sizes`, `### Sources`, `#### Citations`.

`tsc --noEmit` passes, and was run after every item.

### Regression Testing
- `scratch/test_ai-chat-formatter.ts`: **38/38 passed**, with two checks updated as described above.
- `scratch/test_block-reference-citations.ts`: **7/7 passed.**
- `scratch/test_copilot-source-details.ts`: **30/30 passed.**
- `scratch/test_duck-ai-adapter.ts`: **20/20 passed.**
- `scratch/test_duckduckgo-search-assist.ts`: **22/22 passed.**

All were re-run after every item.

## Manual Verification
Not yet done; these are for the maintainer, in Brave:
1. Run `npm run build` and reload the extension from `brave://extensions`.
2. On the options page:
   - **Minimum heading level** should appear under Citation style, with **H1 (no change)** selected.
   - It should grey out when **Enable AI Chat Formatter** is off.
   - The drop-down should be readable in both light and dark mode.
3. Set it to **H2**. On Copilot, copy a reply that has headings and citations, and paste it into Obsidian.
   - The reply's top heading should be H2 or deeper.
   - If the reply had an H1, Sources should be one level deeper than before (`### Sources`).
   - Clicking a citation marker should still jump to its entry.
4. Copy a reply with a fenced shell script containing `# comment` lines: they should be unchanged.
5. Set it to **H6** and copy a reply with several heading levels: they should all be H6.
6. Set it back to **H1 (no change)**: a copy should match what it was before this change.

## Follow-ups
- The manual checks above, before any release.
- Not handled: a heading inside a blockquote that is itself inside a list item (`- > ## x`). Turndown wasn't seen producing it; it would stay unshifted.
