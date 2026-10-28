---
status: approved
---

# Gemini Deep Research: copy the report and the conversation as Markdown

Adds Gemini (`gemini.google.com`) as a fourth site. A Deep Research report opens in a panel beside the chat, and its toolbar gets two buttons before **Share & Export**:
- **Report:** copies the open report as Markdown, with the research request as its prompt.
- **Conversation:** copies the whole left pane: every prompt, the research plan and Gemini's replies, in order. It's on by default and can be turned off.

Three Gemini options shape the report copy:
- **Include "Sources used in the report":** on by default.
- **Include "Sources browsed but not used":** off by default.
- **Include "Show thinking":** off by default.

**Related documents**
- [Duck.ai adapter plan](../duck-ai-adapter/implementation_plan.md)
- [Search Assist plan](../duckduckgo-search-assist/implementation_plan.md)

## User Review Required

> [!IMPORTANT]
> **What the report copy contains**, in this order:
> 1. **The prompt:** the research request, in your prompt format, as on the other sites. Gemini's "Start research" message is never used as the prompt.
> 2. **The report.**
> 3. **`## Sources`:** with **Include "Sources used in the report"** on (the default).
>    - **Citations:** the report's markers become citations in your citation style, numbered in order of first appearance as on the other sites. They are not numbered as Gemini numbers them.
>    - **More:** the sources Gemini lists as used but never cites. The sample report cites 40 of its 60.
>    - **When the option is off:** no markers and no Sources section.
>    - **Gemini's generic setting is hidden:** **Include "More" sources** doesn't appear for Gemini, since this option covers More.
> 4. **`## Sources browsed but not used`:** with that option on, each source as `[Title](url) — domain`. This is a section of its own rather than a subsection under `## Sources`, so it reads the same with the first option off. The scope sketch said `###`.
> 5. **`## Thinking`:** with **Include "Show thinking"** on. Each step is its heading in bold with its text below, and each browsing step is a list of the pages visited.
>
> Your minimum heading level shifts every heading, as on the other sites, including these two sections. With the footnotes style, the footnote definitions come before these two sections. Obsidian's Reading view gathers them at the bottom anyway.

> [!IMPORTANT]
> **What the conversation copy contains.** It covers each turn in the left pane in order:
> - **Your prompt** in your prompt format, followed by **Gemini's reply** below it.
> - **The research plan** becomes:
>   - its title in bold;
>   - a numbered list of its steps, each with its description;
>   - the time estimate and the buttons are left out.
> - **The "report ready" card** becomes a line naming the report: `Deep Research report: *Title*`. The report itself is in the report copy.
> - **Gemini's own "Show thinking" in left-pane replies** is left out.
>
> Prompts are always included here, even when **Copy the prompt with the response** is off, because preserving them is the point of this copy. Each reply's citations, if it has any, get their own Sources section after that reply.

> [!IMPORTANT]
> **Two buttons side by side need telling apart.** Both use the Markdown icon, so each also shows a short visible label in the style of Gemini's toolbar text buttons: **Report** and **Conversation**. Their tooltips are "Copy report as Markdown" and "Copy conversation as Markdown". The other sites keep their icon-only button.

> [!NOTE]
> **From a live inspection on 2026-10-28** of one Deep Research conversation, recording structure only:
> - **The report panel:**
>   - **Element:** `deep-research-immersive-panel`. Its toolbar's `.action-buttons` holds `toc-menu`, `button[data-test-id="export-menu-button"]` (Share & Export) and the Create button.
>   - **The report's body:** `#extended-response-markdown-content`.
>   - **After the body,** inside the panel's `.response-container-content`: `div.end-of-report-marker`, `deep-research-source-lists`, `collapsible-button.collapsible-thinking-button` and `thinking-panel`.
> - **Citation markers:** `source-footnote > sup.superscript[data-turn-source-index]`, empty, with a 1-based index into "Sources used in the report".
>   - The index was checked against one opened carousel: markers 11 and 13 were the 11th and 13th used sources.
>   - Each paragraph's `sources-carousel-inline` (the chevron) holds no links until opened, so it is stripped.
> - **Source lists:** `.source-list.used-sources` and `.source-list.unused-sources`, each of `browse-web-item > a[href]`, with `.display-name` (the domain), `.sub-title` (the page title) and `img.favicon`. Both lists are in the page while collapsed. In the sample there were 60 used and 46 unused, with no overlap.
> - **Thinking:** `.thinking-panel > .item-container`, in the page while collapsed. Each item is one of:
>   - a `thought-item` with `[data-test-id="thought-header"]` and `[data-test-id="thought-body"]`, both plain text;
>   - a `browse-chip-list` of `browse-web-chip > a[data-test-id="browse-chip-link"]`, with `[data-test-id="domain-name"]` and `[data-test-id="title"]`. Its header was empty.
> - **The left pane:**
>   - **The history:** `infinite-scroller[data-test-id="chat-history-container"]`, with one `.conversation-container` per turn, each holding a `user-query` and a `model-response`.
>   - **A prompt:** `.query-text`, with a visually hidden "You said" label, one `p.query-text-line` per line (a blank line is a `<br>`), and numbered lists as `ol.query-numbered-list > li`.
>   - **The research plan:** `deep-research-confirmation-widget` in the reply's markdown. It has:
>     - a `[data-test-id="title"]`;
>     - `.research-step` items, each with a `.research-step-title` and a `.research-step-description`. The description is clipped by CSS but complete in the page.
>     - a time estimate and buttons.
>   - **The report card:** `immersive-entry-chip`. Its `span.card-title` matches the panel's toolbar title, `h2.title-text`.
> - **Gemini's own copy:** **Share & Export** holds **Copy contents**, inside a pop-up menu outside the report.
> - **Code and tables:** code blocks are `code-block … pre > code` with real newlines. Tables are plain `<table>` in a scroll wrapper.

> [!NOTE]
> **Under the hood**, the shared code gains a few general abilities, each optional, so the other sites are unchanged:
> - **A button outside its message:** a site's button can sit outside its message, since the conversation's button lives in the report panel.
> - **Hiding a button:** a site can hide a button while one of its options is off.
> - **Labels:** a site can give a button a visible label.
> - **Copying turn by turn:** a site can split a message into turns, which are copied one after another.
> - **Owning More:** a site option can govern the More list in place of the generic setting.
> - **Sections after Sources:** a site can put sections after the Sources section.
> - **No own Copy button:** a site can declare it has no Copy button of its own to override, which hides that setting.

## Open Questions

- **Long conversations:** Gemini's history is an `infinite-scroller`, so a long conversation may not have its first turns in the page until you scroll up. The sample was too short to show it.
  - **During TASK-8,** I'd like to inspect a longer Deep Research conversation of yours, structure only, to see whether unloaded turns leave a marker.
  - **If they do,** the conversation copy refuses with: "Scroll to the top of the conversation so Gemini loads its first messages, then copy again."
  - **If they don't,** the copy takes the loaded turns, and the walkthrough records the limit.
- **A report still being written** wasn't seen live. The plan treats a report without `div.end-of-report-marker` and its source lists as unfinished. The copy refuses with: "Gemini is still writing this report. Copy again once it's finished."
- **A revised research plan** ("Edit plan") wasn't seen live. To find the research request, the copy starts at the report card's turn and goes back through the turns holding a research plan, then takes the earliest one's prompt. A revision should then still lead back to the original request.

## Proposed Changes

The test script, `scratch/test_gemini-deep-research.ts`, is started in TASK-1 and grows with each item.

### Core

#### [MODIFY] `src/core/types.ts`
- [x] **TASK-1:** Extend the adapter contract, all optional, so existing adapters compile unchanged:
  - **`SiteOption.governsMoreSources?: boolean`:** while this option is on, the More list is included. The generic `includeMoreSources` setting isn't used, and the options page hides it.
  - **`SiteAdapter.nativeCopyButtonSelector`** becomes optional. Without it, the site has no Copy button of its own to override.
  - **`findButtonAnchor(message, isOptionEnabled)`:** gains the site's option lookup (resolved as in `convertMessage`), so a site can hide a button while an option is off by returning null. A returned anchor may be outside `message`.
  - **`buttonLabel?(message): { title: string; text?: string }`:** the tooltip and accessible name, plus an optional visible label. The default is `{ title: "Copy as Markdown" }`.
  - **`copyButtonDescription?: string`:** the options page's hint for "Show a Copy as Markdown button", for a site whose button isn't next to each reply's Copy.
  - **`readTurns?(message): ConversationTurn[] | null`:** splits a message into turns that are copied one after another.
    - `ConversationTurn` is `{ prompt: string | null; reply: Element }`.
    - Null means the message isn't a conversation and is copied as usual.
  - **`AFTER_SOURCES_ATTRIBUTE = "data-acf-after-sources"`:** exported. An element the adapter's `preprocess` marks with it is written after the Sources section.

#### [MODIFY] `src/core/convert.ts`
- [x] **TASK-2:** In `convertMessage`:
  - **Sections after Sources:** after `preprocess`, every `[data-acf-after-sources]` element is taken out of the clone, in document order. Each is converted with the same Turndown service and appended after `renderCitations`' output, before the heading shift, so those headings shift with the rest.
  - **More:** follows the first option with `governsMoreSources` when there is one, and `includeMoreSources` otherwise.
  - **New `convertConversation(adapter, turns, options)`:** converts each turn with `convertMessage(adapter, turn.reply, …)`.
    - Each turn gets its own prompt (always written when the turn has one, in `options.prompt`'s format and level) and references, from `adapter.readReferences?.(turn.reply)`.
    - With a fixed `idToken`, turn *n* uses `<idToken><n>`, so block IDs stay unique across turns.
    - The turns are joined with a blank line.
    - A turn with neither a prompt nor reply text is skipped.

### Content script

#### [MODIFY] `src/content/controller.ts`
- [x] **TASK-3:** Support buttons outside their message, hidden buttons, labels and conversations:
  - **Tracking:** a `WeakMap<Element, HTMLButtonElement>` records each message's button. `sync()` skips a message whose tracked button is still connected, or that holds an injected button (as now). This covers a page where an earlier controller instance left one.
  - **Removal:** when `findButtonAnchor` returns null for a message with a tracked, connected button, the button is removed. That's how turning the conversation option off takes its button away.
  - **Labels:** `createButton` uses `buttonLabel`: `title` for the tooltip and `aria-label`, and `text` as a `<span class="acf-button-text">` after the icon, adding the `acf-labelled` class. `flashCopied` restores that button's own label and icon instead of the shared constants.
  - **Conversations:** `convert()` checks `adapter.readTurns?.(message)` first. When it returns turns, the copy goes through `convertConversation`, with the prompt format settings even when `includePrompt` is off.
  - **No own Copy button:** `onNativeCopyClick` returns at once when the adapter has no `nativeCopyButtonSelector`.

### Options page

#### [MODIFY] `src/options/options.ts`
- [x] **TASK-4:** In a site's section:
  - The override checkbox is left out when the adapter has no `nativeCopyButtonSelector`, and its value is never read.
  - **Include "More" sources** is left out when an option has `governsMoreSources`.
  - "Show a Copy as Markdown button" uses `copyButtonDescription` when given.

#### [MODIFY] `src/content/content.css`
- [ ] **TASK-5:** Add `.acf-copy-button.acf-labelled`: auto width, `padding: 0 10px 0 6px`, `gap: 6px`, and `border-radius: 16px` to match Gemini's pill toolbar buttons. Add `.acf-button-text` in the toolbar's font (`font: inherit`) at 14px, so the label reads like Gemini's own buttons. Colors stay `currentColor`.

### Gemini

#### [NEW] `src/sites/gemini-markup.ts`
- [ ] **TASK-6:** The selectors from the inspection, each with a comment saying where it comes from, and the readers shared by the report and conversation copies:
  - **`readQueryText(userQuery): string`:** the prompt as plain text.
    - It works on a clone, without the visually hidden label.
    - Each `p.query-text-line` is a line, and one holding only a `<br>` is a paragraph break.
    - Each `ol > li` becomes `N. text`, following `start`.
    - Lines are joined with `\n` and paragraphs with `\n\n`, as `readPrompt` promises.
  - **`readSourceList(list): { url, title, domain }[]`:** for `.source-list` and `browse-chip-list` alike.
    - It reads `a[href]` (http(s) only), the title (`.sub-title` / `[data-test-id="title"]`) and the domain (`.display-name` / `[data-test-id="domain-name"]`).
    - When there's no domain, the URL's host stands in.
  - **`findReportTurn(panel)`:** the `.conversation-container` whose `immersive-entry-chip span.card-title` matches the panel's `h2.title-text`. When none matches, it falls back to the last turn with a report card.
  - **`findResearchRequest(reportTurn)`:** walks back from that turn over the turns holding a `deep-research-confirmation-widget`. It returns the earliest one's `user-query`, or null.

#### [NEW] `src/sites/gemini.ts`
- [ ] **TASK-7:** The report copy. `geminiAdapter`:
  - **Identity:**
    - `id: "gemini"`, `name: "Gemini"`, `matches: ["https://gemini.google.com/*"]`. That covers the `/u/<n>/app/…` account paths.
    - `messageSelector: "deep-research-immersive-panel, infinite-scroller[data-test-id=chat-history-container]"`.
    - `contentSelector: ".response-container-content"`, which holds the report, its source lists and thinking in the panel, and each reply in the history.
    - No `nativeCopyButtonSelector`.
  - **`findButtonAnchor`, report:** in the panel's `.action-buttons`, right before the Share & Export button, once the toolbar is there. `buttonLabel` gives "Copy report as Markdown" / "Report".
  - **`preprocess`, for a root holding `#extended-response-markdown-content`:**
    1. Throw the "still writing" `ConversionError` when `.end-of-report-marker` or `deep-research-source-lists` is missing.
    2. Read the used and unused lists with `readSourceList`.
    3. Replace each `source-footnote` in the body as follows:
       - with **Include "Sources used in the report"** on: an `<a data-acf-gemini-cite href=…>` carrying the used source at `data-turn-source-index − 1`, with its title and domain;
       - otherwise, or when the index has no source: nothing.
    4. Remove `sources-carousel-inline`.
    5. Keep only the report body, then the sections the options ask for, each marked `data-acf-after-sources` and built as HTML for Turndown:
       - `<h2>Sources browsed but not used</h2>` with a list of `<a>Title</a> — domain`;
       - `<h2>Thinking</h2>` with, for each item, either `<p><strong>header</strong></p><p>body</p>` or a list of the browsed pages in the same form.
  - **Turndown rule `geminiCitation`:** turns `a[data-acf-gemini-cite]` into `context.registerCitation({ url, title, sourceName: domain })`.
  - **`readReferences(panel)`:** the used list, each with `cited` set when some marker's index points to it. Null for the history element.
  - **`readPrompt(panel)`:** `readQueryText` of `findResearchRequest(findReportTurn(panel))`.
  - **Options:** `used-sources` (on, `governsMoreSources`), `unused-sources` (off), `thinking` (off).
    - The names are `Include "Sources used in the report"`, `Include "Sources browsed but not used"` and `Include "Show thinking"`, with one-line descriptions.
    - `copyButtonDescription`: "Adds buttons to a Deep Research report's toolbar, next to Share & Export."
  - **Rules:** `invisibleCharactersRule` and `collapseBlankLinesRule`.
- [ ] **TASK-8:** The conversation copy:
  - **The button:** option `conversation-button`, named "Show a Copy conversation button", on by default. For the history element, `findButtonAnchor` returns the open report panel's `.action-buttons`:
    - before the Report button if it's there, otherwise before Share & Export, so the order is always **Conversation**, **Report**, Share & Export;
    - null while the option is off or no report panel is open.
  - **The label:** `buttonLabel` gives "Copy conversation as Markdown" / "Conversation".
  - **`readTurns(history)`:** one turn per `.conversation-container`, with `readQueryText` of its `user-query` as the prompt and its `model-response` as the reply. It returns null for the panel.
  - **`preprocess`, for a reply root (no report body):**
    - Keep the reply's `message-content`.
    - Drop `thinking-overlay`, `sources-carousel-inline` and buttons.
    - Rewrite `deep-research-confirmation-widget` as `<p><strong>title</strong></p>` plus an `<ol>` of steps, each `<strong>step title</strong>` followed by its description.
    - Rewrite `immersive-entry-chip` as `<p>Deep Research report: <em>title</em></p>`.
  - **Long conversations:** whatever the long-conversation check in Open Questions settles: either a `ConversionError` when unloaded turns are detected, or the documented limit.

#### [MODIFY] `src/sites/index.ts`
- [ ] **TASK-9:** Add `geminiAdapter` to `SITE_ADAPTERS`, after Search Assist. The build then adds `https://gemini.google.com/*` to the manifest.

### Tests

#### [NEW] `scratch/fixtures/gemini-deep-research.html` and `scratch/test_gemini-deep-research.ts`, and [MODIFY] existing checks
- [ ] **TASK-10:** Finish the fixture and the existing checks:
  - **The fixture:** a synthetic page modeled on the inspected structure, with made-up `*.example` sources and text. It has:
    - two turns: a research request with a numbered list, then "Start research";
    - the plan card and the report card;
    - a report panel whose body has headings, a table, a code block and markers that cite some used sources, some twice, leaving others uncited;
    - both source lists, and thinking with thought and browsing items.
  - **The existing checks:** update any that list every adapter, every site's settings, or the manifest's matches, in the item that changes them.

## Verification Plan

### Automated Tests
`pnpm test` runs `scratch/test_gemini-deep-research.ts` with the others. It checks:
1. **Core contract:**
   - Sections after Sources come after `## Sources` (and after footnote definitions), and shift with the minimum heading level.
   - A `governsMoreSources` option turns More on and off whatever `includeMoreSources` says.
   - `convertConversation` writes each turn's prompt and reply in order, with unique block IDs per turn.
2. **Controller:**
   - A button anchored outside its message is added once over many `sync()` passes, and again if the site removes it.
   - It is removed when the anchor turns null.
   - The label text, tooltip and `aria-label` are right, and restored after the copied flash.
   - Copilot's, Duck.ai's and Search Assist's buttons are unchanged.
3. **Report copy, default settings:**
   - The exact Markdown for the fixture: the prompt heading with the request's lines and numbered list, the report with its table and code block, and linked citations numbered by first appearance with titles and domains from the used list.
   - A repeated marker gives one citation.
   - Uncited used sources are under More, and nothing comes after Sources.
4. **Report options:**
   - "Sources used" off gives no markers and no Sources section.
   - "Browsed but not used" on adds its section with every unused source.
   - "Show thinking" on adds `## Thinking` with each thought and browsing item, after the other sections in that order.
   - Each citation style works.
5. **Unfinished report:** without the end marker, the copy shows the "still writing" message and copies nothing.
6. **Prompt:** the request comes from the plan turn, not "Start research"; the report card is matched by title, with the fallback when titles differ; and a revised plan leads back to the original request.
7. **Conversation copy:**
   - The exact Markdown: each prompt and reply in order, the plan as a numbered list of steps with descriptions, and the card as a line.
   - Prompts are included with **Copy the prompt with the response** off.
   - The button order is Conversation, Report, Share & Export, however the two were added.
   - Turning the option off removes the button.
8. **Registration and settings:**
   - `findAdapterForUrl` matches `/app/…` and `/u/1/app/…`.
   - The defaults are on, off, off, on.
   - The options page shows the four options, no override checkbox and no **Include "More" sources** for Gemini, and the Gemini button hint.

The existing scripts are re-run after every item.

### Manual Verification
1. **Setup:** run `pnpm run build` and reload the extension in `brave://extensions`. Chrome may ask to allow the new site.
2. **The buttons:** open a finished Deep Research conversation and open the report. The panel's toolbar should show **Conversation** and **Report** buttons, in that order, before **Share & Export**.
3. **The report copy:** click **Report** and paste into Obsidian. Check:
   - the research request is the prompt;
   - the report's headings, tables and code;
   - citation markers that open the right source;
   - `## Sources`, with Citations and More.
4. **The two optional sections:** turn on **Include "Sources browsed but not used"** and **Include "Show thinking"**, copy again, and check the two sections at the end. Turn off **Include "Sources used in the report"**: no markers and no Sources section.
5. **The conversation copy:** click **Conversation** and paste. Check each prompt and reply in order, the research plan with its steps, and the line naming the report.
6. **Turning the button off:** turn off **Show a Copy conversation button**. The button should disappear without a reload.
7. **Account paths:** on a second Google account's Gemini (`/u/1/` in the address), the buttons should appear too.
8. **Writing:** while a report is still being written, click **Report**. The "still writing" message should show next to the button.

## Visual design application
There's no design system or art bible in this repo. The labelled button (TASK-5) follows Gemini's own toolbar text buttons: a pill with the Markdown icon and a short label, in `currentColor`. The other sites keep their icon-only button.
