---
status: approved
---

# Search Assist: Explore More answers, and its own inline source chips

Adds three options for DuckDuckGo Search Assist.
- **Explore More** (on by default): copies the Explore More questions you've expanded, with their answers. Their source chips stay inline, written the way Search Assist shows them: icon and site name, linked.
- **More Search Results links** (off by default): adds each expanded answer's **More Search Results** link, which opens a DuckDuckGo search for that question. It only applies while Explore More is on.
- **Inline chips** (on by default): writes the main answer's chips the same way, instead of numbered citations with a Sources section. Turning this option off brings back today's citations and Sources section, which follow the citation style and **Include "More" sources**.

**Related documents**
- [DuckDuckGo Search Assist plan](../duckduckgo-search-assist/implementation_plan.md)
- [DuckDuckGo Search Assist walkthrough](../duckduckgo-search-assist/walkthrough.md)

## User Review Required

> [!IMPORTANT]
> **Search Assist copies change by default.** With both options on, which is the new default, a Search Assist copy has no numbered citation markers and no Sources section. Each chip stays where it was in the text, as a linked favicon and site name:
>
> ```markdown
> Most gadgets need two of them. [![|16](https://external-content.duckduckgo.com/ip3/widget.example.ico) widget.example](https://widget.example/guide) [![|16](https://external-content.duckduckgo.com/ip3/gadget.example.ico) gadget.example](https://gadget.example/parts#widgets)
> ```
>
> - **The favicon** is the chip's own image, which DuckDuckGo serves from `external-content.duckduckgo.com`. Obsidian loads it from there each time the note is shown.
> - **`|16`** is Obsidian's image-size syntax, so a large favicon shows at 16px. Other Markdown apps may ignore it, or show "16" as the image's alt text.
> - **A chip without an image** is written as its linked name alone.
> - **The name** is the chip's own text, such as `Wikipedia` or `What Hi-Fi?`, not the page title.
> - **Turning "inline chips" off** brings back today's output exactly: numbered citations in the chosen citation style, with page titles, a Sources section, and More when **Include "More" sources** is on.

> [!IMPORTANT]
> **Explore More, only what you've expanded.** Explore More appears below the extended answer once **More** has finished. It's a list of follow-up questions, and each answer only exists on the page once its question is expanded. The copy adds the expanded ones after the extended answer:
>
> ```markdown
> ### Explore More
>
> #### What size widget fits a pocket gadget?
>
> The small widget fits most pocket gadgets. [![|16](…/widget.example.ico) widget.example](https://widget.example/sizes)
> ```
>
> - **Headings:** "Explore More" is an H3, as on the page, and each expanded question is an H4. The minimum heading level and the prompt heading shift these like any other heading.
> - **Left out:** questions that aren't expanded.
> - **More Search Results:** left out by default, since it starts a new search rather than citing a source. See the next callout.
> - **No expanded questions:** if nothing is expanded, there's no Explore More section.
> - **Chips:** an Explore More answer's chips are always inline, even with "inline chips" off, as you asked.
> - **Turning the Explore More option off** leaves the section out entirely, as today.

> [!IMPORTANT]
> **More Search Results links, off by default.** With **Include More Search Results links** on, each expanded answer ends with its link, on a line of its own after the chips:
>
> ```markdown
> The small widget fits most pocket gadgets. [![|16](…/widget.example.ico) widget.example](https://widget.example/sizes)
>
> [More Search Results](https://duckduckgo.com/?q=What+size+widget+fits+a+pocket+gadget%3F)
> ```
>
> - **Off by default** is my choice, matching your first request to leave the links out. It's a one-word change if you'd rather have it on.
> - **The link text** is the page's own, so it follows DuckDuckGo's language.
> - **The URL** is made absolute: the page links to `/?q=…`, which wouldn't work in a note. Its query is the page's own, kept as it is.
> - **Which link:** the one in an answer's panel that isn't a chip and goes to a DuckDuckGo search (`duckduckgo.com/` with a `q` parameter). Any other link that isn't to an http(s) page is still removed.
> - **Only with Explore More:** the option is greyed out while **Include expanded Explore More answers** is off.

> [!NOTE]
> **The options page.** Search Assist's section gains three checkboxes:
> - **Include expanded Explore More answers** (on)
> - **Include More Search Results links** (off), greyed out while the one above is off
> - **Keep Search Assist's inline source chips** (on)
>
> **Include "More" sources** is greyed out while inline chips are on, since there's no Sources section to add More to.
>
> These are Search Assist's own options, not shared ones. Under the hood, a site adapter can now declare options of its own, stored per site like the clean-up rules. Copilot and Duck.ai declare none, so nothing changes for them.

> [!NOTE]
> **From the live inspection on 2026-10-27,** recording structure only:
> - **Where Explore More sits:** it's an `<h3>` section beside the extended answer, inside the wrapper the adapter already reads. The adapter keeps only the two answers today, so it's left out.
> - **Questions:** each is a `button[aria-expanded][aria-controls]` whose panel is empty until expanded.
> - **Answers:** an expanded panel holds a `<p>`, then chips in the same markup as the main answer's chips, then a **More Search Results** link to `/?q=…`.
> - **Loading:** the answer appeared complete within 0.4 seconds of expanding, with no "still writing" state seen.
>
> The section is found by that structure, not by the words "Explore More", so it works in other languages too. The heading's own text is copied.

## Open Questions

None at this time. The favicon format (16px, Obsidian syntax) and the Explore More layout (H3 section, H4 questions) were chosen before this plan was written. The More Search Results option's default (off) is flagged above for your sign-off.

## Proposed Changes

### Fixture

#### [MODIFY] `scratch/fixtures/duckduckgo-search-assist.html`
- [x] **TASK-1:** Add an Explore More section to the `after-more` module, after the extended answer and before the Ask box, in the structure inspected on 2026-10-27.
  - It has an `<h3>`, then three question buttons with `aria-expanded` and `aria-controls`.
  - The first question is expanded. Its panel holds a `<p>`, a run of two chips (one with a favicon `<img>`, one without), and a **More Search Results** link to `/?q=…`.
  - The other two are collapsed, with empty panels.
  - All text and URLs are made up. The header comment describes the section.

### Core

#### [MODIFY] `src/core/types.ts`
- [x] **TASK-2:** Add adapter options.
  - A new `SiteOption` type, `{ id, name, description, defaultEnabled, replacesSourcesSection?: boolean, requires?: string }`, documented.
    - `replacesSourcesSection` means that while the option is on, the adapter writes no citations, so neither the Sources section nor More is used.
    - `requires` names another option of the same adapter that must be on for this one to apply. `isOptionEnabled` returns false for an option whose required option is off, whatever its own stored value.
  - `SiteAdapter.options?: SiteOption[]`.
  - `ConversionContext.isOptionEnabled(id): boolean`.
  - `preprocess?(root, context)` gains the context as a second argument. Copilot's and Duck.ai's preprocess functions ignore it.

#### [MODIFY] `src/core/settings.ts`
- [x] **TASK-3:** Store the options per site.
  - `SiteSettings.options: Record<string, boolean>`, filled from each adapter's `options` defaults, like `rules`.
  - `mergeSettings` keeps stored booleans for options the adapter declares, and drops unknown ones, so settings saved by 0.5.0 load with the defaults.

#### [MODIFY] `src/core/convert.ts`
- [ ] **TASK-4:** Pass the options through conversion.
  - `ConversionOptions.isOptionEnabled?: (id) => boolean`; when absent, each option's `defaultEnabled` applies.
  - It goes into the `ConversionContext`, wrapped so an option whose `requires` option is off reads as off, and the context is passed to `preprocess`.
  - When an option with `replacesSourcesSection` is on, the More list is left empty whatever `includeMoreSources` says.

### Search Assist

#### [MODIFY] `src/sites/duckduckgo.ts`
- [ ] **TASK-5:** Declare the three options and use them.
  - **The options:**
    - `explore-more`: "Include expanded Explore More answers", with the description "Adds the Explore More questions you've expanded, with their answers. Questions you haven't expanded are left out."
    - `explore-more-search-links`: "Include More Search Results links", off by default, with `requires: "explore-more"` and the description "Ends each expanded Explore More answer with its More Search Results link, which opens a DuckDuckGo search for that question."
    - `inline-chips`: "Keep Search Assist's inline source chips", with the description "Keeps each source as Search Assist shows it, icon and name linked, instead of numbered citations and a Sources section." It sets `replacesSourcesSection: true`.
  - **Finding Explore More** (`preprocessSearchAssist`): find the wrapper's question buttons (`button[aria-expanded][aria-controls]`). The section is their closest ancestor that also holds an `<h3>`.
  - **Rebuilding it:** for each question with `aria-expanded="true"` whose panel has text, write the question as an `<h4>`, followed by the panel's content. The section's `<h3>` goes first, keeping its text.
  - **More Search Results:** a panel link that isn't a chip and resolves (against the page's URL) to `https://duckduckgo.com/` with a `q` parameter.
    - With `explore-more-search-links` on, its `href` is set to the absolute URL and it's moved into a `<p>` of its own at the end of the answer, after the chips.
    - With it off, it's removed.
  - **Other links** that aren't to an http(s) page are removed.
  - **Placement:** the rebuilt section goes after the extended answer. It's left out when the option is off or nothing is expanded.
  - **Chips:** each run of chips joins the paragraph it follows, as now. Chips inside Explore More are marked, for example with `data-acf-inline-chip`, so they always stay inline.
  - **The chip rule:** inside Explore More, or with `inline-chips` on, a chip becomes `[![|16](<favicon>) <name>](<url>)`, with a space before it. A chip without an http(s) favicon becomes `[<name>](<url>)`. The name is escaped for link text, and both URLs are encoded as the citation links are. Otherwise the chip is registered as a citation, as now.

### Content script and options page

#### [MODIFY] `src/content/controller.ts`
- [ ] **TASK-6:** Pass `isOptionEnabled: (id) => site?.options[id] ?? <the option's default>` to `convertMessage`.

#### [MODIFY] `src/options/options.ts`
- [ ] **TASK-7:** Show each adapter option as a checkbox in its site's section, after the Copy-button override and before **Include "More" sources**, named `<site>.options.<id>`.
  - **Include "More" sources** is disabled while an option with `replacesSourcesSection` is on, and the description says why: "Not used while inline source chips are on."
  - An option with `requires` is disabled while that option is off, and updates as soon as it's toggled. Its stored value is kept.
  - `fill` shows the stored values.

### Tests

#### [NEW] `scratch/test_search-assist-explore-more.ts`, and [MODIFY] existing checks
- [ ] **TASK-8:** A regression script, picked up by `pnpm test`. See Automated Tests below.
  - **Updated checks:** the Search Assist checks in `scratch/test_duckduckgo-search-assist.ts` that expect numbered citations, and the two whole-settings checks in `scratch/test_ai-chat-formatter.ts`.
  - **README:** the development tree gains the new script.

## Verification Plan

### Automated Tests
`pnpm test` runs every `scratch/test_*.ts`. The new `scratch/test_search-assist-explore-more.ts` checks:
1. **Inline chips (default):**
   - The collapsed answer copies with both chips inline after its last sentence, `[![|16](favicon) name](url)` separated by spaces.
   - There are no citation markers and no Sources section, even with **Include "More" sources** on.
2. **Inline chips off:**
   - The copy matches today's linked-citations output exactly, with the Sources section.
   - More is listed when it's on.
3. **Explore More (default):**
   - The after-More module copies the short answer, the extended answer, then `### Explore More` and `#### <expanded question>` with its answer and inline chips.
   - It holds no collapsed questions and no More Search Results link.
   - A chip without a favicon is written as a linked name.
4. **Explore More with inline chips off:** the main answer has numbered citations and a Sources section, while Explore More's chips stay inline and aren't numbered.
5. **Explore More off, or nothing expanded:** there's no Explore More section.
6. **More Search Results links:**
   - With the option on, each expanded answer ends with `[More Search Results](https://duckduckgo.com/?q=…)` in a paragraph of its own, after the chips, with the absolute URL.
   - Collapsed questions add no link.
   - With it off (the default), there's no More Search Results link.
   - With it on but Explore More off, there's no Explore More section and no link.
7. **Escaping:** a chip name with `]` and a URL with spaces or parentheses still give valid links.
8. **Settings:**
   - Explore More and inline chips default to on, and More Search Results links to off.
   - Stored values are kept, unknown options are dropped, and older settings get the defaults.
   - Copilot and Duck.ai have no options.
9. **Options page:**
   - Search Assist's three checkboxes show the stored values and report changes.
   - **Include "More" sources** is disabled while inline chips are on.
   - **Include More Search Results links** is disabled while Explore More is off, and enabled again when it's turned on.
   - Copilot and Duck.ai sections are unchanged.
10. **Controller:** Copy as Markdown and the Copy-button override both follow the stored options.

The existing scripts are re-run as regression checks, and `tsc --noEmit` must pass after every item.

### Manual Verification
1. Run `pnpm run build` and reload the extension from `brave://extensions`.
2. Search for something that brings up Search Assist. Copy the collapsed answer and paste it into Obsidian. Each chip should show as a small favicon and its name, linked, in the text, with no Sources section.
3. Press **More**, then expand one or two **Explore More** questions and copy. After the extended answer, you should see `Explore More` with each expanded question as a heading and its answer with inline chips. Unexpanded questions and More Search Results shouldn't appear.
4. On the options page, turn off **Keep Search Assist's inline source chips** and copy again. The main answer should use numbered citations and a Sources section, while Explore More keeps its inline chips.
5. Turn on **Include More Search Results links** and copy again. Each expanded answer should end with a **More Search Results** link. In Obsidian, clicking it should open a DuckDuckGo search for that question.
6. Turn off **Include expanded Explore More answers**. **Include More Search Results links** should grey out. Copy again: there should be no Explore More section.
7. With the Copy-button override on, check that Search Assist's own Copy gives the same result.

## Visual design application
No `design-system.md` or `art-bible.md` exists for this product. The three new checkboxes reuse the options page's existing checkbox style, and the greyed-out state reuses the one **Minimum heading level** already has.
