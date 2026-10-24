# Walkthrough: Linked citations

A new default citation style, **Linked citations (Obsidian)**, keeps the Sources section in Copilot's order in every Obsidian view. `### Citations` is a visible numbered list whose entries carry block IDs, and the markers in the text are same-note links to those entries, shown as `⁽¹⁾`. The footnotes style stays as an option, reworked so Reading view no longer shows an empty Citations heading.

## What Was Implemented

### 1. Core
- **`src/core/types.ts`**: `"linked-citations"` added to `CitationStyle`, first in `CITATION_STYLES` (the options page order). The doc comment describes the new style and the footnotes style's new shape.
- **`src/core/citations.ts`**:
  - `renderCitations` takes an `idToken` (default `""`), used only by linked citations.
  - A marker is `[[#^c-<token>-<N>|⁽<N>⁾]]`, with `superscriptDigits(n)` producing the digits. The superscript parentheses keep adjacent markers apart (`⁽¹⁾⁽²⁾`, not `¹²`). The characters are written as `\u` escapes in the source.
  - Entries are `N. [Title](url) — domain ^c-<token>-<N>`, under `## Sources` → `### Citations` → `### More`, leaving out empty subsections.
  - `citationBlockId(token, n)` builds the ID, keeping only `[a-z0-9]` from the token as Obsidian's block IDs require, and falls back to `c-<N>` with no token.
  - **Footnotes:** with More sources, `## Sources` → `### More` → the definitions; without, just the definitions after the reply.
- **`src/core/convert.ts`**: an optional `idToken` in `ConversionOptions`. For linked citations without one, `randomIdToken()` generates 4 characters from `[a-z0-9]` with `crypto.getRandomValues`, so two replies pasted into one note don't share block IDs.
- **`src/core/settings.ts`**: the default citation style is `linked-citations`. A saved choice is kept by `mergeSettings` as before.

### 2. Options page
- **`src/options/options.ts`**: **Linked citations (Obsidian)** listed first, with an example and a hint. Choices can now carry a hint; the Footnotes example and hint describe the new layout.

### 3. Tests and docs
- **`scratch/test_block-reference-citations.ts`** (new), with expectation updates in the two earlier scripts for the footnotes layout and the new default.
- **`README.md`**: Linked citations documented as the default, with why it exists (Reading view gathers footnotes at the bottom), its Obsidian-only syntax, the per-copy tokens, and a note on plugins that show block links as transclusions. The footnotes example shows the new layout, and the old Reading-view caveat is gone.

TASK-1, TASK-2 and TASK-5 were committed together: adding the style to the type requires its rendering and its options-page entry for the project to type-check, so splitting them would have left commits that don't build.

## Verification & Test Results

### Automated Tests
`npm test` builds, then runs every scratch script. `scratch/test_block-reference-citations.ts`: **7/7 passed.** It covers:
- linked output with a fixed token: markers attached to the text, repeated citations collapsed, `⁽²⁾⁽¹⁾` for adjacent markers, the Citations list with block IDs, then More;
- markers from 10 up (`⁽¹²⁾`), every block ID matching `^[a-z0-9-]+$`, and every marker matching an entry;
- citations only, More only, no sources (Markdown unchanged), no token (`c-1`), and unsafe token characters dropped;
- the footnotes layout with and without More;
- `convertMessage` giving each copy its own 4-character token, and using a fixed one as given;
- the default style, a saved footnotes choice surviving, and the options page listing and reporting the new style.

`tsc` passes as part of the build.

### Regression Testing
- `scratch/test_ai-chat-formatter.ts`: **38/38 passed**, after its default-style expectations were updated.
- `scratch/test_copilot-source-details.ts`: **30/30 passed**, after its footnotes-layout and default-style expectations were updated.

## Manual Verification
The maintainer's results, 2026-10-24, with the extension reloaded:
- **Default:** the options page shows Linked citations (Obsidian) selected.
- **Live Preview:** `⁽¹⁾` link markers; `## Sources` → `### Citations` → `### More` in order, with the block IDs hidden.
- **Reading view:** first showed each marker as a copy of its entry. A community plugin that renders block links as live transclusions caused it, not Obsidian or the extension. With the plugin out of the way, Reading view passed: `⁽¹⁾` markers that jump to and preview their entries, in Copilot's order.
- **Two pastes in one note:** each copy's markers go to their own entries.
- **Footnotes:** no empty Citations heading in Reading view.

To repeat the checks:
1. Run `npm run build`, reload the extension on `chrome://extensions`, refresh Copilot, and confirm the options page shows **Linked citations (Obsidian)** selected.
2. Copy a reply with several citations and More sources, and paste it into an Obsidian note. In Reading view and Live Preview, check for `⁽¹⁾` markers that jump to and preview their entries, and `## Sources` → `### Citations` (numbered, no visible `^…`) → `### More`.
3. Paste a second reply into the same note, and check that each copy's markers go to their own entries.
4. Switch to **Obsidian footnotes** and copy again: Reading view shows no empty Citations heading, and a reply without More sources gets only the footnotes.

## Release
Released as [0.3.0](https://github.com/coreyx/ai-chat-formatter/releases/tag/0.3.0) on 2026-10-24, with `ai-chat-formatter-0.3.0.zip` attached. The asset's SHA-256 matches the local package.

## Follow-ups
- None required. Other Markdown apps show linked citations' `[[…]]` and `^…` syntax as text; the other three styles remain for them.
