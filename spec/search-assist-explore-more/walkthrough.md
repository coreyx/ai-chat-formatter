# Walkthrough: Search Assist Explore More and inline source chips

Search Assist has three options of its own:
- **Explore More** (on by default) copies the expanded Explore More answers after the extended answer.
- **More Search Results links** (off by default) can add each answer's link to a DuckDuckGo search for its question.
- **Inline chips** (on by default) writes each source chip as Search Assist shows it, `[![|16](favicon) name](url)`, instead of a numbered citation. Explore More's chips are always inline.

Underneath, any site adapter can now declare options of its own.

## What Was Implemented

### 1. Site options (core)
- **`src/core/types.ts`:**
  - A new `SiteOption`: `id`, `name`, `description` and `defaultEnabled`, plus two optional fields:
    - `replacesSourcesSection`: while the option is on, the adapter writes no citations.
    - `requires`: another option that must be on for this one to apply.
  - `SiteAdapter.options`.
  - `ConversionContext.isOptionEnabled(id)`.
  - `preprocess(root, context)` now receives the context. Copilot's and Duck.ai's preprocess functions ignore it.
- **`src/core/settings.ts`:** `SiteSettings.options` holds each option's on/off value.
  - Defaults come from the adapter.
  - `mergeSettings` keeps stored booleans for declared options and drops anything else, so 0.5.0 settings load with the defaults.
- **`src/core/convert.ts`:**
  - `ConversionOptions.isOptionEnabled` is optional; without it, each option takes its default.
  - `resolveOption` makes an option read as off while the option it `requires` is off. A missing or looping requirement also reads as off.
  - The context is built before `preprocess` runs, so it can be passed in.
  - While a `replacesSourcesSection` option is on, the More list is empty.
- **`src/content/controller.ts`:** passes each site's stored options, falling back to the adapter's defaults.

### 2. Search Assist (`src/sites/duckduckgo.ts`)
- **Options:** `explore-more`, `explore-more-search-links` (which `requires` Explore More), and `inline-chips` (which sets `replacesSourcesSection`).
- **Finding Explore More** (`extractExploreMore`), by structure only:
  - The questions are `button[aria-expanded][aria-controls]` elements whose panel is in the wrapper and that aren't inside either answer. The wrapper's other `aria-expanded` buttons control no panel there, so they're skipped.
  - The section is the closest ancestor below the wrapper that holds every question plus an `<h3>` outside the panels and answers.
  - Because nothing matches on text, a heading in another language is copied as it reads.
- **Rebuilding it:** the section's `<h3>`, then an `<h4>` and the answer for each expanded question whose panel has text. The section goes after the extended answer, and is left out when nothing is expanded.
- **Links in an answer** (`prepareExploreMoreLinks`):
  - Chips get `data-acf-inline-chip`, so they're always written inline.
  - The More Search Results link is the non-chip link that resolves to `duckduckgo.com/` with a `q` parameter. With the links option on, it gets its absolute URL and a paragraph of its own at the end of the answer. Otherwise it's removed.
  - Other relative links are made absolute.
  - A link that doesn't lead to a web page keeps its text but loses the link.
- **The chip rule** (`inlineChip`):
  - The favicon becomes `![|16](…)`. Without a web favicon, the chip is its linked name alone.
  - The name is escaped as link text, and both URLs are encoded as citation links are, via `escapeLinkText` and `encodeLinkDestination`, now exported from `src/core/citations.ts`.
  - Inside a table cell, the `|` is escaped (`\|16`) so it doesn't end the cell.
  - No space is added before a chip when the text before it already ends in one.

### 3. Options page (`src/options/options.ts`, `options.html`)
- **Placement:** each adapter option is a checkbox named `<site>.options.<id>`, after the Copy-button override and before **Include "More" sources**.
- **`requires`:** an option is disabled while the option it requires is off. Its own value is kept.
- **More sources:** disabled while a `replacesSourcesSection` option is on. Its hint then reads `Not used while "Keep Search Assist's inline source chips" is on.`
- **Styling:** a new CSS rule greys out a single disabled checkbox. It skips options inside a fieldset that's already disabled, so they aren't dimmed twice.

### 4. Fixture and docs
- **`scratch/fixtures/duckduckgo-search-assist.html`:** the after-More module gains a synthetic Explore More section in the structure inspected on 2026-10-27.
  - The first of its three questions is expanded. Its answer has a chip with a favicon, a chip whose `<img>` has no URL, and a relative More Search Results link.
  - The other two questions are collapsed, with empty panels.
- **`README.md`:**
  - Search Assist's chips, Explore More and More Search Results.
  - The three settings, and More sources greyed out while inline chips are on.
  - `options` under Adding a site, and the new test script in the development tree.

### Changes made during implementation
- **Links that don't lead to a web page keep their text** (TASK-5). The plan said such links are removed. Removing the element also removed its words, so only the link is dropped now. The More Search Results link is still removed as a whole.
- **No double space before a chip** (TASK-5). A chip after text ending in a space, as in a table cell, got two spaces. It now adds its own space only when needed.
- **`|` escaped in table cells** (TASK-5). This wasn't in the plan. Unescaped, it would break a table that has a chip in it.
- **The More sources hint names the option** instead of the plan's fixed "inline source chips" wording, since the options page code is shared by every site (TASK-7).
- **A CSS rule in `options.html`** (TASK-7), which the plan didn't list. Without it, a disabled checkbox wasn't greyed out.
- **Existing checks updated in the task that changed their output,** not all in TASK-8, so every commit passes:
  - TASK-3: the two whole-settings checks in `test_ai-chat-formatter.ts` gained `options: {}`.
  - TASK-5:
    - `test_duckduckgo-search-assist.ts` converts with every option off, so its checks still cover the numbered citations.
    - Its two controller checks now expect the inline default.
    - `test_min-heading-level.ts`'s two controller checks now expect Explore More's headings, shifted, in place of Sources.
  - TASK-7: the More-description check in `test_duckduckgo-search-assist.ts` turns inline chips off first.
- **TASK-2 also touched `convert.ts`:** the context had to gain `isOptionEnabled` and be passed to `preprocess` for the type change to compile. Until TASK-4, each option read as its default.
- **The new test script was started in TASK-4** and grew with each later task.

### Fixed after the first manual check
- **No icons showed** in the maintainer's first copy. On the live page, each chip's favicon `src` has no scheme (`//external-content.duckduckgo.com/ip3/…`), and the chip rule accepted only `http(s)://` values, so every chip fell back to its linked name.
  - The fixture had used full `https://` favicon URLs, so no test caught it.
  - The fix resolves the favicon against the page's address, as relative links already were (`absoluteUrl` replaces `absoluteHref`), so it's written as `https://…`.
  - The fixture's favicons are now scheme-less. `test_duckduckgo-search-assist.ts` loads it at a `duckduckgo.com` address, as `test_search-assist-explore-more.ts` already did.
  - Re-checked on a live search page, recording only the attribute's shape.
- **The extended answer's last chips were missing.** On a live search after More, those chips aren't inside `duckassist-expanded-answer-content`. They're in a `<div>` right after it, before Explore More. The copy keeps only the answer's own element, so they were dropped.
  - The fixture had placed them inside the answer, a guess, since the first inspection saw no chips in an extended answer.
  - The fix: `adoptFollowingChips` moves chips from the elements directly after the extended answer into it, stopping at the first element without chips or with Explore More's questions. The existing `attachTrailingChips` step then joins them to the last paragraph.
  - The fixture now has that chip in a sibling `<div>`. Without the fix, 4 existing checks fail.

## Verification & Test Results

### Automated Tests
`pnpm test` runs `scratch/test_search-assist-explore-more.ts`: **31/31 passed.**
1. **Options through conversion** (with a test adapter):
   - Defaults apply without `isOptionEnabled`, and stored values pass through.
   - An option reads as off while its required option is off, or when its requirement is missing or loops.
   - More is listed normally, and left out while a `replacesSourcesSection` option is on.
2. **Inline chips (default):**
   - The collapsed answer ends `… two of them. [![|16](…) widget.example](…) [![|16](…) gadget.example](…)`.
   - There are no markers and no Sources section, even with More sources on.
3. **Inline chips off:** the exact numbered-citations copy, with More.
4. **Explore More (default):**
   - The after-More copy ends with `### Explore More`, `#### What size widget fits a pocket gadget?` and its answer with inline chips.
   - It holds no collapsed questions, no More Search Results link and no ask box.
   - The chip without a favicon is `[Pocket Guide](…)`.
5. **Explore More with inline chips off:** the main answer is numbered, while Explore More's chips stay inline and unnumbered.
6. **Explore More off, or nothing expanded:** no section.
7. **Other Explore More checks:**
   - A heading in another language is copied as it reads.
   - A `javascript:` link keeps its text, and a relative link is made absolute.
   - A copy with every option on leaves the live page unchanged.
8. **More Search Results links:**
   - With the option on, there's exactly one link, absolute, in its own paragraph after the chips.
   - With it off, or with Explore More off, there's none.
9. **Escaping:**
   - A chip name with `]` and `[`, and URLs with spaces and parentheses, still give valid links.
   - In a table cell the size is `\|16`, with a single space before the chip.
10. **Settings:**
    - Defaults are on, off, on.
    - Stored values are kept, unknown or invalid ones dropped, and 0.5.0 settings get the defaults.
    - Copilot and Duck.ai have no options.
11. **Options page:**
    - The order and stored values are right, and a change is reported.
    - More sources is disabled with its explanatory hint, then restored.
    - The More Search Results links option is disabled while Explore More is off, keeping its value.
    - Copilot and Duck.ai are unchanged.
12. **Controller:** Copy as Markdown and the Copy-button override both follow the stored options.

Along the way, checks caught three things, all fixed before their task was committed:
- the double space before a chip in a table cell;
- a link's words disappearing with it;
- a test chip that was empty and so dropped by Turndown.

`tsc --noEmit` passed after every item.

### Regression Testing
Re-run after every item. Final results:
- `test_ai-chat-formatter.ts`: **38/38**
- `test_block-reference-citations.ts`: **7/7**
- `test_copilot-source-details.ts`: **30/30**
- `test_copy-user-prompt.ts`: **33/33**
- `test_duck-ai-adapter.ts`: **20/20**
- `test_duckduckgo-search-assist.ts`: **22/22**
- `test_message-next-to-button.ts`: **8/8**
- `test_min-heading-level.ts`: **21/21**
- `test_pnpm-migration.ts`: **6/6**

The checks updated along the way are listed under "Changes made during implementation".

## Manual Verification
Not yet run. These steps are for the maintainer, in Brave:
1. Run `pnpm run build` and reload the extension from `brave://extensions`.
2. Search for something that brings up Search Assist. Copy the collapsed answer and paste it into Obsidian.
   - Each chip should show as a small favicon and its name, linked, at the end of the text.
   - There should be no Sources section.
3. Press **More** and wait for it to finish. Expand one or two **Explore More** questions and copy.
   - After the extended answer, you should see **Explore More**, then each expanded question as a heading with its answer and inline chips.
   - Unexpanded questions and More Search Results shouldn't appear.
4. On the options page, turn off **Keep Search Assist's inline source chips**. **Include "More" sources** should become available. Copy again:
   - The main answer should have numbered citations and a Sources section.
   - Explore More should keep its inline chips.
5. Turn on **Include More Search Results links** and copy again. Each expanded answer should end with a **More Search Results** link. In Obsidian, clicking it should open a DuckDuckGo search for that question.
6. Turn off **Include expanded Explore More answers**. **Include More Search Results links** should grey out. Copy again: there should be no Explore More section.
7. With the Copy-button override on, check that Search Assist's own Copy gives the same result.

## Follow-ups
- **The extended answer's last chips** join its last paragraph only when that block is a paragraph. After a list or table, they come out as a paragraph of their own, as the short answer's would.
- **Explore More markup:** where the More Search Results link sits in an answer, and whether an answer can hold more than one paragraph or a list, wasn't recorded during the inspection. The fixture places the link after the chips. The code finds it anywhere in the answer, and moves it to the end.
- **Live page:** no Explore More answer was seen still loading, so there's no "still writing" check for it. An expanded question whose panel is still empty is skipped.
- **Favicons load from DuckDuckGo's servers** whenever the note is shown, as noted in the README.
- **Still open from earlier specs:**
  - Duck.ai: that its button appears only once a reply has finished, and its table and math conversion.
  - Copilot: single line breaks in prompts.
  - Prompts with attachments.
