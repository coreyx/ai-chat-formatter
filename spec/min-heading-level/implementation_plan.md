---
status: approved
---

# Minimum heading level for the copied Markdown

Adds a **Minimum heading level** setting, H1 to H6, that applies to every site. When the copy has a heading above that level, every heading in it shifts down by the same amount, so the shallowest one lands on the minimum and the hierarchy is kept. For example, with H2 as the minimum, a reply whose shallowest heading is H1 becomes H1 → H2, H2 → H3, and so on. This lets a reply be pasted under a note's own title without competing with it.

**Related documents**
- [Original extension plan](../ai-chat-formatter/implementation_plan.md)

## User Review Required

> [!IMPORTANT]
> **One shift across the whole copy, Sources included.** The shift is measured over every heading in the copy, the Sources section's `## Sources`, `### Citations` and `### More` included, and applied to all of them. So Sources keeps its place relative to the reply. Some examples:
> - **Minimum H2, reply has an H1:** H1 → H2, H2 → H3, and `## Sources` → `### Sources`, `### Citations` → `#### Citations`.
> - **Minimum H2, reply's shallowest heading is H2 or H3:** nothing changes, since `## Sources` is already at H2.
> - **Minimum H3, reply has no headings:** `### Sources`, then `#### Citations` and `#### More`.
> - **No headings at all**, as with the footnotes style and no More list: nothing changes.

> [!IMPORTANT]
> **Past H6, headings stay at H6.** Markdown has no H7. A heading that would be shifted past H6 becomes H6, so the deepest levels can merge into one. It's still a heading in Obsidian's outline.

> [!NOTE]
> **One setting for all sites, off by default.** It sits on the options page under Citation style, as a drop-down from **H1 (no change)** to **H6**. The default is H1, which never shifts anything, so copies stay as they are until it's changed. Like every other setting, it applies to open tabs without a reload, and to the site's own Copy button when the override is on.

> [!NOTE]
> **What counts as a heading.** Only real Markdown headings (`#` to `######` at the start of a line) are shifted, including ones inside a blockquote or a list item. Lines in fenced code blocks are left alone, so a `# comment` in a shell script stays as it is. A `#` that starts ordinary text is already escaped as `\#` by the converter, so it's never mistaken for a heading. Linked citations point at block IDs, not headings, so shifting doesn't break them.

## Open Questions

None at this time. Scope (one global setting), Sources headings (shifted with the rest) and past H6 (stay at H6) were settled before this plan was written.

## Proposed Changes

### Core

#### [MODIFY] `src/core/types.ts`
- [x] **TASK-1:** Add `export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6` and `export const HEADING_LEVELS: readonly HeadingLevel[] = [1, 2, 3, 4, 5, 6]`, documented next to `CitationStyle`.

#### [NEW] `src/core/headings.ts`
- [x] **TASK-2:** Add `enforceMinHeadingLevel(markdown: string, minLevel: HeadingLevel): string`.
  - Uses `mapOutsideCodeFences` from `src/core/rules.ts`, so fenced code is never touched.
  - Matches ATX headings at the start of a line, after any indent, blockquote markers (`>`) and one list marker (`-`, `*`, `+`, `1.`, `1)`): the `#` run must be 1 to 6 long and followed by a space, a tab or the end of the line.
  - Finds the shallowest heading level in the whole text. The shift is `max(0, minLevel - shallowest)`. With no headings, or a shift of 0, the text comes back unchanged.
  - Rewrites each heading's `#` run to `min(6, level + shift)` and leaves the rest of the line as it is.

#### [MODIFY] `src/core/convert.ts`
- [x] **TASK-3:** Add `minHeadingLevel?: HeadingLevel` to `ConversionOptions` (documented; absent means 1, so existing callers and tests are unaffected). In `convertMessage`, apply `enforceMinHeadingLevel` to the output of `renderCitations`, before `runRules`, so the Sources headings are measured and shifted with the reply's.

#### [MODIFY] `src/core/settings.ts`
- [x] **TASK-4:** Add `minHeadingLevel: HeadingLevel` to `Settings` (documented). `buildDefaultSettings` sets it to `1`. `mergeSettings` keeps a stored value only when it's one of `HEADING_LEVELS`, and falls back to the default otherwise, so settings saved by 0.4.0 and earlier load unchanged.

### Content script

#### [MODIFY] `src/content/controller.ts`
- [ ] **TASK-5:** In `convert`, pass `minHeadingLevel: this.settings.minHeadingLevel` to `convertMessage`. This covers both the extension's button and the Copy-button override, which share `convert`.

### Options page

#### [MODIFY] `src/options/options.ts` and `src/options/options.html`
- [ ] **TASK-6:** Add a **Minimum heading level** section after Citation style.
  - A `fieldset.global` (so the master switch greys it out) with an `h2`, a `<select name="minHeadingLevel">` and a hint: "Shifts every heading down by the same amount, Sources included, so none is above this level. Headings past H6 stay at H6."
  - Options: `H1 (no change)`, then `H2` to `H6`, with values `1` to `6`. A change calls `update((s) => (s.minHeadingLevel = level))`.
  - `fill` selects the stored level.
  - In `options.html`, style the `select` with the page's existing tokens (`--surface`, `--text`, `--border`, `--accent`), so it reads correctly in light and dark mode.
  - Update the file's top comment to mention the new setting.

### Tests

#### [NEW] `scratch/test_min-heading-level.ts`
- [ ] **TASK-7:** A regression script, picked up by `npm test`. See Automated Tests below for what it checks.

## Verification Plan

### Automated Tests
`npm test` builds the extension and runs every `scratch/test_*.ts`. The new `scratch/test_min-heading-level.ts` checks:
1. **The shift itself:** minimum H2 with H1 to H3 present shifts each by 1; minimum H2 with H2 and deeper present changes nothing; minimum H1 never changes anything; text with no headings comes back identical.
2. **The user's example:** minimum H2, one H1 and the rest at H2 or deeper: H1 → H2, H2 → H3, H3 → H4.
3. **Past H6:** minimum H4 with H1 and H5 present gives H4 and H6 (H5 + 3 = H8, kept at H6).
4. **What isn't a heading:** `# comment` inside a fenced block, `\# not a heading` in text, `#hashtag` with no space and a 7-`#` line are all left alone. Headings inside a blockquote and as a list item are shifted.
5. **Through `convertMessage`:** a reply with an H1 and citations, at minimum H2, in linked-citations style gives `## …` for the reply heading and `### Sources` / `#### Citations`, and the citation markers and block IDs are unchanged. In footnotes style with no More list (no headings in Sources) only the reply's headings move. Leaving `minHeadingLevel` out gives the same output as before.
6. **Settings:** the default is 1; `mergeSettings` keeps a stored 3, and falls back to 1 for `0`, `7`, `"2"` and a missing value.
7. **Options page:** the drop-down shows the stored level, choosing H3 reports `minHeadingLevel: 3`, and it's disabled when the master switch is off.
8. **Controller:** with `minHeadingLevel: 2` in the settings, clicking **Copy as Markdown** on a reply with an H1 copies `## …`.

The existing scripts are re-run as regression checks: `test_ai-chat-formatter.ts`, `test_block-reference-citations.ts`, `test_copilot-source-details.ts`, `test_duck-ai-adapter.ts` and `test_duckduckgo-search-assist.ts`. `tsc --noEmit` must pass after every item.

### Manual Verification
1. Run `npm run build` and reload the extension from `brave://extensions`.
2. On the options page, check that **Minimum heading level** appears under Citation style with **H1 (no change)** selected, and that it greys out when **Enable AI Chat Formatter** is off.
3. Set it to **H2**. On Copilot, copy a reply that has headings and citations, and paste it into Obsidian. Check that the reply's top heading is H2 or deeper, that Sources sits one level below where it was if the reply had an H1, and that clicking a citation marker still jumps to its entry.
4. Copy a reply with a fenced shell script containing `# comment` lines and check they're unchanged.
5. Set it to **H6** and copy a reply with several heading levels: they should all be H6.
6. Set it back to **H1 (no change)** and check a copy matches what it was before this change.

## Visual design application
No `design-system.md` or `art-bible.md` exists for this product. The new drop-down follows the options page's existing styles and color tokens.
