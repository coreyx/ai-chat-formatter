---
status: approved
---

# Linked citations: a visible Citations list that reads the same in every Obsidian view

Obsidian's Reading view always gathers footnote definitions at the very bottom of a note. The footnotes style therefore can't show Copilot's order (Citations, then More) there, and since 0.2.0 its `### Citations` heading looks empty. This adds a new default style, **Linked citations**, in which `### Citations` is a visible numbered list whose entries carry Obsidian block IDs, and the markers in the text are links to those entries. The footnotes style stays as an option, reworked so it no longer leaves an empty heading.

**Related documents**
- [Copilot source details plan](../copilot-source-details/implementation_plan.md)
- [Copilot source details walkthrough](../copilot-source-details/walkthrough.md)

## User Review Required

> [!IMPORTANT]
> **The new default style is Obsidian-specific Markdown.** A copy in the Linked citations style reads:
> ```markdown
> Widget 5 was released in May.[[#^c-k3f9-1|⁽¹⁾]]
>
> ## Sources
>
> ### Citations
>
> 1. [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0) — widget.example ^c-k3f9-1
>
> ### More
>
> - [Widget 5 is now available | Widget Blog](https://widget.example/blog/widget-5) — widget.example
> ```
> - **Entries:** `^c-k3f9-1` is a block ID on the list item. Obsidian hides it in Reading and Live Preview.
> - **Markers:** `[[#^c-k3f9-1|⁽¹⁾]]` is a same-note link to that entry, displayed as `⁽¹⁾`. Clicking it jumps to the entry, and hovering shows a preview (with Obsidian's Page preview plugin, which is on by default).
> - **Separate markers:** the display text uses superscript parentheses (`⁽¹⁾⁽²⁾`) because bare superscript digits would merge (`¹²` reads as twelve).
> - **Unique IDs:** the `k3f9` part is a short random token generated for each copy, so pasting two replies into one note doesn't produce duplicate block IDs.
> - **Outside Obsidian:** other Markdown apps show the `[[…]]` syntax and the `^…` IDs as literal text. The other three styles stay available for that.

> [!IMPORTANT]
> **Default and existing settings.** Linked citations becomes the default for new installs and for anyone who never changed the citation style. An explicitly saved choice (Footnotes, Inline links + Sources list, Sources list only) is kept.

> [!IMPORTANT]
> **The footnotes style changes shape** (B). It drops `### Citations`, leaving Obsidian's own footnotes block to act as the citations:
> - With More sources: `## Sources` → `### More` → the footnote definitions. In Reading view the definitions move to the bottom as usual, so there's no empty heading.
> - Without More sources: just the footnote definitions, as in 0.1.0, with no `## Sources` heading over nothing.

> [!IMPORTANT]
> **Release.** This adds a feature, so the next version is **0.3.0**. TASK-8 repeats the earlier release steps, which publish to GitHub: package, push `main` (including two already-committed walkthrough edits), tag `0.3.0`, publish the release. Approving this plan authorizes them for 0.3.0, after `wrap-up` and `prepare-release`.

> [!NOTE]
> **Not testable here:** how Obsidian renders this (block IDs on numbered list items, links with superscript display text, hover previews) can't be checked from this environment. It follows Obsidian's documented block-reference syntax, and manual verification step 2 checks it in Reading view and Live Preview before release.

## Open Questions

None at this time.

## Proposed Changes

### Core

#### [MODIFY] `src/core/types.ts`
- [x] **TASK-1:** Add `"linked-citations"` to `CitationStyle` and put it first in `CITATION_STYLES`, the order the options page lists them. Update the `CitationStyle` doc comment for the new style and for the footnotes style's new shape.

#### [MODIFY] `src/core/citations.ts`
- [x] **TASK-2:** Render the new style, and rework the footnotes layout:
  - `renderCitations` gains an `idToken: string` parameter, defaulting to `""`, used only by `linked-citations`.
  - **Linked citations:**
    - A marker becomes `[[#^c-<token>-<N>|⁽<N in superscript digits>⁾]]`, for example `⁽¹²⁾` for 12.
    - `### Citations` holds `N. [Title](url) — domain ^c-<token>-<N>`.
    - The rest of the layout follows the list styles: `## Sources`, `### Citations`, then `### More`, omitting empty subsections.
    - With an empty token, the ID is `c-<N>`.
    - Block IDs use only lowercase letters, digits and hyphens, as Obsidian requires.
  - **Footnotes:**
    - With More sources: `## Sources\n\n### More\n\n…` followed by the definitions.
    - Without: the definitions alone after the body.
  - Add `superscriptDigits(n)`. Write the superscript characters as `\u` escapes in the source, so nothing invisible or ambiguous ends up in the code.

#### [MODIFY] `src/core/convert.ts`
- [ ] **TASK-3:** Add an optional `idToken?: string` to `ConversionOptions`, passed to `renderCitations`. When it's absent and the style is `linked-citations`, generate one: 4 characters from `[a-z0-9]`, using `crypto.getRandomValues`. Tests pass a fixed token so their output is predictable.

#### [MODIFY] `src/core/settings.ts`
- [ ] **TASK-4:** Default `citationStyle` to `"linked-citations"`. `mergeSettings` already keeps any valid stored style, so saved choices survive. Valid stored values now include the new style.

### Options page

#### [MODIFY] `src/options/options.ts`
- [x] **TASK-5:** Add the Linked citations choice, labeled **Linked citations (Obsidian)**, with an example such as `…in May.⁽¹⁾  →  1. [Title](url) — domain` and the hint "Numbered list under Sources; markers link to it. Reads the same in Reading view and Live Preview." Update the Footnotes example to show definitions after More. It's listed first.

### Tests

#### [NEW] `scratch/test_block-reference-citations.ts`
- [ ] **TASK-6:** Add the regression script described under Verification Plan, and update the earlier scripts' expectations for the footnotes layout (B) and the default style. `npm test` picks up the new script automatically.

### Docs

#### [MODIFY] `README.md`
- [ ] **TASK-7:** Document Linked citations as the default style, with its example, and explain why it exists (Reading view gathers footnotes at the bottom). Describe its Obsidian-only syntax and the per-copy IDs. Update the Footnotes example to the new layout, and replace the old Reading-view note with a pointer to Linked citations.

### Release

#### [MODIFY] GitHub repository `coreyx/ai-chat-formatter`
- [ ] **TASK-8:** After `wrap-up` and `prepare-release` have produced the 0.3.0 `CHANGELOG.md` and `RELEASE_NOTES.md` sections:
  1. Confirm the effective `git config user.email` is the GitHub noreply address.
  2. Scan the outgoing commits for private details.
  3. Run `npm run package`.
  4. Push `main`.
  5. Create and push the tag `0.3.0`.
  6. Run `gh release create 0.3.0` with `release/ai-chat-formatter-0.3.0.zip` attached and the 0.3.0 notes.
  7. Confirm the asset's checksum against the local zip.

## Verification Plan

### Automated Tests
`npm test` runs every scratch script; the earlier two must still pass after their expectation updates. `scratch/test_block-reference-citations.ts` checks:
1. **Linked citations output** with the token `k3f9`:
   - Body markers `[[#^c-k3f9-1|⁽¹⁾]]`, attached to the preceding text.
   - The same citation repeated back to back collapses into one marker.
   - Two different adjacent markers read `⁽¹⁾⁽²⁾`.
   - `## Sources` → `### Citations` with `1. [Title](url) — domain ^c-k3f9-1` → `### More`.
2. **Markers from 10 up:** citation 12 shows as `⁽¹²⁾`. Every block ID matches `^[a-z0-9-]+$`, and every marker's target matches an entry's ID.
3. **Edge cases:** citations only (no `### More`), More only (no `### Citations`), no sources at all (Markdown unchanged), and an empty token (`c-1`).
4. **Footnotes (B):** with More, the output ends `## Sources`, `### More`, then the definitions, with no `### Citations`. Without More, the definitions follow the body with no `## Sources`.
5. **Tokens from `convertMessage`:** two conversions of the Copilot fixture without a fixed token produce different tokens of 4 lowercase letters or digits. With `idToken: "k3f9"`, the output is predictable.
6. **Settings:** a fresh default is `linked-citations`, and a stored `"footnotes"` survives `mergeSettings`. The options page lists Linked citations first and checked by default, and choosing it reports the new value.

### Manual Verification
1. Run `npm run build`, reload the extension, refresh Copilot, and confirm the options page shows **Linked citations (Obsidian)** selected by default.
2. Copy a reply with several citations and More sources, and paste it into an Obsidian note.
   - **Reading view:** markers show as `⁽¹⁾` links; `## Sources` → `### Citations` (a numbered list, no visible `^…` IDs) → `### More`, in that order. Clicking a marker scrolls to its entry, and hovering shows a preview.
   - **Live Preview:** the same order, with the markers as links.
3. Paste a second reply into the same note. Each copy's markers still go to their own entries; the IDs differ by token.
4. Switch to **Footnotes**, copy again and check Reading view: no empty Citations heading, More under Sources, footnotes at the bottom. A reply without More sources gets only the footnotes.
5. Check that **Inline links + Sources list** and **Sources list only** are unchanged.
