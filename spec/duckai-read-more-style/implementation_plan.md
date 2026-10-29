---
status: approved
---

# Duck.ai: an option to cite sources as Duck.ai shows them

Adds a Duck.ai setting, **Cite sources as Duck.ai does**, off by default. While it's off, Duck.ai copies keep your citation style, as now. While it's on:
- **Each source chip** stays where it is in the text, as a link with the label Duck.ai shows.
- **The copy ends with `## Read More`:** one line per Read More card, with the card's icon, title and site.
- **No numbered citations or Sources section** are written.

**Related documents**
- [Duck.ai adapter plan](../duck-ai-adapter/implementation_plan.md)
- [Search Assist plan](../duckduckgo-search-assist/implementation_plan.md)

## User Review Required

> [!IMPORTANT]
> **A checkbox, not the drop-down I described.** The scope said a Duck.ai **Citation style** drop-down. This plan uses an on/off setting instead, for two reasons:
> - **Consistency:** Search Assist's **Keep Search Assist's inline source chips** works the same way.
> - **Less new code:**
>   - **Greying out:** the extension can already grey out **Include "More" sources** while such a setting is on.
>   - **Leaving out Sources:** it can already drop the Sources section for such a setting.
>   - **What a drop-down would need:** new plumbing for both.
>
> Either way there are the same two styles. If you'd still rather have the drop-down, say so and I'll revise the plan.

> [!IMPORTANT]
> **What a copy looks like with the setting on** (example data):
>
> ```markdown
> Widget 5 was released in May as the new current release. [Widget](https://widget.example/releases/5.0.0) The team announced it on its blog. [blog.widget.example](https://blog.widget.example/widget-5)
>
> ## Read More
>
> - ![|16](https://external-content.example/ip3/widget.example.ico) [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0) — widget.example
> - ![|16](https://external-content.example/ip3/docs.widget.example.ico) [PathMatcher - API Reference | Widget Docs](https://docs.widget.example/api/path-matcher) — docs.widget.example
> ```
>
> - **A link chip** becomes `[label](url)`, with the label Duck.ai shows ("Widget", "docs.widget.example").
> - **A popup chip** (one domain and a count, standing for several sources) becomes one `[domain](url)` per source, separated by spaces, so none is lost.
>   - **When its sources can't be read:** the chip is left out, as it is now.
> - **Read More** lists every card in page order, whether or not the reply cites it, as Duck.ai shows them. Each line has three parts:
>   - **The icon:** the card's own, at 16px, as `![|16](icon)`. That's Obsidian's size syntax, as in Search Assist's chips. A card without a web icon has none.
>   - **The title,** linked to the page. A card with no title shows its domain instead.
>   - **The domain,** after a dash. It's left off when it's the same as the title.
> - **The heading** is `##`, like the Sources section's, and moves with your heading-level settings and prompt heading.
> - **No Read More section** is written for a reply without Read More cards; its chips are still links.
> - **Include "More" sources** for Duck.ai is greyed out while the setting is on, since Read More already lists every card. The options page says why, as it does for Search Assist.

> [!NOTE]
> **Where the icons come from:** each card's icon is an `external-content.duckduckgo.com` image address, as in the fixture recorded on 2026-10-24. It's public, like Search Assist's favicons. Each line's icon loads from DuckDuckGo whenever the note is shown, as in Search Assist copies.

> [!NOTE]
> **A small shared change:** a site's `preprocess` step gets the whole message as a third argument, not only its reply text.
> - **Why:** Duck.ai's Read More cards sit outside the reply text that's converted.
> - **Other sites** ignore the argument and are unchanged.

## Open Questions

None at this time.

## Proposed Changes

### Shared code

#### [MODIFY] `src/core/types.ts`
- [x] **TASK-1:** Give `SiteAdapter.preprocess` an optional third parameter, `message: Element`, for the message the reply text was cloned from.
  - **Its doc comment:** the step may read that message but must not change it. A site uses it for parts of a reply that sit outside its reply text, such as Duck.ai's Read More cards.

#### [MODIFY] `src/core/convert.ts`
- [x] **TASK-2:** In `convertMessage`, call `adapter.preprocess?.(clone, context, message)`.

### Duck.ai adapter

#### [MODIFY] `src/sites/duckai.ts`
- [x] **TASK-3:** Add the option and the inline chips.
  - **The option:** `READ_MORE_STYLE_OPTION = "read-more-style"`, in a new `options` array:
    - **Name:** "Cite sources as Duck.ai does".
    - **Description:** "Keeps each source chip as a link where it is, and ends with Read More: a line for each card, with its icon, title and site. Replaces the numbered citations and the Sources section."
    - **`defaultEnabled`:** false.
    - **`replacesSourcesSection`:** true.
  - **`citationChipRule`, with the option on:** returns `[label](url)` instead of registering a citation. The label is the chip's text, escaped with `escapeLinkText`, and the address goes through `encodeLinkDestination`.
  - **`popupChipRule`, with the option on:** returns one such link per source, labelled with the source's domain and joined with spaces.
  - **Doc comments:** both rules' comments describe the two behaviors.
- [x] **TASK-4:** Add `readMoreSection(message)` and call it from `preprocessDuckAi` while the option is on.
  - **What `readMoreSection` builds:** an `<h2>Read More</h2>` followed by a `<ul>`.
    - **The cards:** each Read More card (`READ_MORE_CARD_SELECTOR`, http(s) only, in page order) becomes an `<li>`.
    - **Each item holds:**
      1. the card's icon, as `<img alt="|16" src>` when its `img` has an http(s) `src`, then a space;
      2. `<a href>` with the card's title (from `readCard`), or its domain when there's no title;
      3. ` — domain`, unless the domain equals the title.
  - **No cards:** returns null.
  - **Where the section goes:** appended to the end of the cloned reply. `preprocessDuckAi` takes `(root, context, message)`.
  - **The image rule:** make sure Turndown writes the icon as `![|16](src)` with the `|` unescaped. Add a small Duck.ai rule for these images if the shared conversion escapes it.

### Tests

#### [NEW] `scratch/test_duckai-read-more-style.ts`
- [ ] **TASK-5:** Add a regression script covering the checks under Automated Tests, using the existing `scratch/fixtures/duckai-message.html` with the fake React fiber setup from `scratch/test_duck-ai-adapter.ts`. If the options-page expectations in `scratch/test_duck-ai-adapter.ts` change with Duck.ai's new option, update them there.

## Verification Plan

### Automated Tests

`scratch/test_duckai-read-more-style.ts`, against the Duck.ai fixture, checks that:
1. **By default** (option off), the first reply's copy is exactly what it is today, matching `test_duck-ai-adapter.ts`'s expectation in every citation style.
2. **With the option on,** the first reply's copy:
   - keeps `[Widget](https://widget.example/releases/5.0.0)` and `[docs.widget.example](…)` where the chips were;
   - turns the popup chip into one `[blog.widget.example](…)` link per source;
   - has no citation markers, no `## Sources` and no `### More`.
3. **Read More** lists all four cards in page order, each as `- ![|16](icon) [Title](url) — domain`, the cited and the uncited alike.
4. **Headings:** the `## Read More` heading shifts with **Minimum heading level** and sits below a prompt heading, as the Sources section does.
5. **No cards:** a reply without Read More cards gets its links and no Read More section.
6. **Card details:**
   - A card with no title is listed by its domain, with no repeated domain.
   - A card whose icon isn't an http(s) address is listed without an icon.
   - A title with `[` or `]` is escaped.
7. **The popup chip:** with no readable sources, it's still left out with the option on.
8. **The options page:**
   - **The setting:** Duck.ai shows **Cite sources as Duck.ai does**, off by default.
   - **Turning it on:** **Include "More" sources** is greyed out, with the "Not used while…" hint.

**Regression:** `pnpm test` runs every existing script, which must pass, and `tsc --noEmit` must be clean.

### Manual Verification
1. Run `pnpm run build`, then click the reload icon on the extension in `chrome://extensions`, then reload a Duck.ai tab.
2. **The default:** open a Duck.ai conversation whose reply cites sources, and click **Copy as Markdown**. The copy should be unchanged: numbered citations and a Sources section.
3. **Duck.ai's style:**
   1. In Options, under Duck.ai, turn on **Cite sources as Duck.ai does**. **Include "More" sources** should grey out.
   2. Copy the same reply and paste it into an Obsidian note.
   3. Each chip should be a link where it was, and the note should end with `## Read More`.
   4. Each card should be on a line with its 16px icon, its linked title and its domain.
4. **A chip that stands for several sources:** copy a reply with one, a chip showing a domain and a number. Each source behind it should appear as its own link.
5. **The override:** turn on **Use for Duck.ai's own Copy button**, then click Duck.ai's Copy. You should get the same Duck.ai-style Markdown.

## Visual design application

No `design-system.md` or `art-bible.md` exists for this product. The change adds only a checkbox, using the options page's existing site-option layout.
