# Walkthrough: Gemini Deep Research

Gemini (`gemini.google.com`) is now a supported site. A finished Deep Research report's toolbar gets two buttons, before **Share & Export**:
- **Report:** copies the report with the research request as its prompt.
- **Conversation:** copies the whole left pane.

Three Gemini options shape the report copy: the used sources (on), the sources browsed but not used (off), and Gemini's thinking (off). A fourth option, on by default, shows the Conversation button. The shared code gained a few small, optional abilities to support this. The other sites' copies and settings are unchanged.

## What Was Implemented

### 1. Core
- **`src/core/types.ts`:**
  - **`SiteOption.governsMoreSources`:** an option that decides More in place of the generic setting.
  - **`nativeCopyButtonSelector`:** now optional, for a site with no Copy button to take over.
  - **`findButtonAnchor(message, isOptionEnabled?)`:** may return an anchor outside the message.
  - **`buttonLabel` and `copyButtonDescription`.**
  - **`readTurns` and `ConversationTurn`.**
  - **`AFTER_SOURCES_ATTRIBUTE`.**
- **`src/core/convert.ts`:**
  - **Sections after Sources:** elements that `preprocess` marks with `AFTER_SOURCES_ATTRIBUTE` are taken out of the body. They're written after the Sources section (and after footnote definitions), before the heading shift.
  - **More:** follows a `governsMoreSources` option when the site has one.
  - **New `convertConversation`:** converts each turn with its own prompt and Sources section, with block IDs unique per turn.
  - **`resolveOption`** is exported for the controller.

### 2. Content script and options page
- **`src/content/controller.ts`:**
  - **Tracking:** each message's button is tracked in a `WeakMap`, so it can sit outside the message.
  - **Removal:** a button whose anchor turns null is removed.
  - **Labels:** buttons take the adapter's label and visible text, restored after the copied flash.
  - **Conversations:** a message the adapter splits into turns is copied with `convertConversation`, always with its prompts.
  - **Override:** skipped for a site with no native Copy selector.
- **`src/options/options.ts`:** a site's section leaves out the override (no native Copy) and the generic **Include "More" sources** (a governing option). It uses the site's own hint for the button setting.
- **`src/content/content.css`:** `.acf-copy-button.acf-labelled` and `.acf-button-text`. These make a pill-shaped button with the label after the icon, like Gemini's toolbar buttons.

### 3. Gemini
- **`src/sites/gemini-markup.ts` (new):**
  - **Selectors:** the ones from the live inspection on 2026-10-28, each commented.
  - **`readSourceList`:** a source list or browsing step, read as URL, title and domain.
  - **`readQueryText`:** a prompt as typed, without "You said", with numbered lists as `N.` lines.
  - **`findReportTurn`:** the report card whose title matches the panel's, or the last card.
  - **`findResearchRequest`:** the earliest plan turn before the report, so "Start research" and plan revisions are passed over.
- **`src/sites/gemini.ts` (new):**
  - **Report copy:**
    1. A report without its end marker and source lists isn't copied ("still writing").
    2. Each `source-footnote` becomes a link to its used source, for the `geminiCitation` rule. It's dropped when that option is off or the number has no source.
    3. The carousels go.
    4. **Sources browsed but not used** and **Thinking** become `##` sections after Sources.
  - **`readReferences`:** the used list, each source marked cited when a marker points to it, so the rest form More.
  - **Conversation copy:**
    - `readTurns` gives one turn per `.conversation-container`.
    - Each reply keeps its `message-content`, without Gemini's own thinking, carousels, markers and buttons.
    - The plan becomes a bold title and a numbered list of steps, with each description's lines as a nested list.
    - The report card becomes `Deep Research report: *Title*`.
  - **Buttons:** both go in the panel's toolbar. Report goes before Share & Export; Conversation goes before Report, and only while its option is on and a panel is open.
- **`src/sites/index.ts`:** Gemini is registered after Search Assist. The build adds `https://gemini.google.com/*` to the manifest.

### 4. Docs
- **README:** Gemini in the intro and the sites table, a Gemini Deep Research section, the settings, install and update steps, a limitation, the development tree, and the new adapter fields under Adding a site.
- **CHANGELOG:** Unreleased Added entries.

### Changes made during implementation
- **Making the native Copy selector optional** meant 17 existing test lines that read it gained a `!`, in TASK-1.
- **The "already has a button" check** was narrowed in TASK-8. The controller used to skip any message holding an injected button. The Conversation button sits inside the report panel, so Report was never added. Now only a button this run didn't create counts, so a button left by an earlier run of the extension still prevents a second one. A check covers both cases.
- **The plan's step descriptions** became a nested list rather than paragraphs. Paragraphs made a loose list with whitespace-only lines.
- **The long-conversation question** (TASK-8) was settled on a second, longer conversation, recording structure only:
  - **The loading:** on opening, the page held 10 of its 12 turns. Scrolling the history to the top loaded the other 2.
  - **No marker:** before and after, the scroller had the same attributes and leading nodes, and no spinner or sentinel belonged to it.
  - **Outcome:** as the plan said for that outcome, the copy takes the loaded turns, and the limit is documented in the code and the README.
- **No existing checks needed changing** when Gemini was registered (TASK-9).

## Verification & Test Results

### Automated Tests
`pnpm test` runs `scratch/test_gemini-deep-research.ts`: **33/33 passed**, against a synthetic fixture (`scratch/fixtures/gemini-deep-research.html`, all `*.example` data) modeled on the inspected structure.
1. **Converter:**
   - Sections marked after Sources come after `## Sources`, and after footnote definitions, and shift with the minimum heading level.
   - A governing option decides More whatever the generic setting says, and without one the generic setting still applies.
   - A conversation writes each prompt above its reply, with block IDs unique per turn. A turn without a reply keeps its prompt.
2. **Controller:**
   - A button anchored outside its message is added once over many passes, and again after the site removes it.
   - It's removed when its option goes off, and returns when the option is back on.
   - Label text, tooltip and `aria-label` are right, and restored after the flash.
   - A conversation copies with prompts even with prompts off.
   - A leftover button from an earlier run still prevents a second.
   - The override is ignored for a site without a native Copy.
3. **Options page and styles:**
   - No override and no generic More where they don't apply, and the site's own hint.
   - The built CSS has the pill rules.
4. **Markup readers:**
   - The prompt reads with its blank line and numbered list.
   - Source lists and browsing chips read as URL, title and domain, with the host standing in for a missing domain.
   - The report turn is found by title, with the fallback.
   - The research request is found past an unrelated turn and a plan revision, and is null without a plan.
5. **Report copy:**
   - The exact default Markdown: the prompt as H2 with its quoted lines and list; the report's headings shifted below it; a table; a code block; linked citations numbered by first appearance; More with an escaped title.
   - Cited flags come from the markers, and a marker without a source is dropped.
   - "Sources used" off leaves no markers and no Sources section, even with the generic More setting on.
   - Browsed-but-not-used, then Thinking, come after Sources.
   - Footnotes, inline links and sources-only all work.
   - Without the end marker or the source lists, the copy refuses with the "still writing" message.
   - The prompt is the request, not "Start research".
   - The button goes before Share & Export.
6. **Conversation copy:**
   - The exact Markdown, with the plan as a tight numbered list and the card as a line.
   - The panel isn't split into turns.
7. **Buttons through the controller:**
   - The order is Conversation, Report, Share & Export, with the right labels.
   - Each copies its own Markdown, the conversation with prompts even when prompts are off.
   - The order holds when the conversation's button is added later.
   - The button leaves with its option, and needs an open panel.
8. **Registration and settings:**
   - `/app/…` and `/u/1/app/…` match, and an unrelated Google URL doesn't.
   - The built manifest has `https://gemini.google.com/*` and no page-world script there.
   - The defaults are on, off, off, on.
   - The options page shows the button with its hint, then the four options.

**Two first runs failed, and both were test mistakes:**
- **TASK-2:** two checks expected the citation marker after the sentence's period. It goes where the citation was, before the period.
- **TASK-7:** an expected line was missing the backslashes that escape `[` and `]` in a title.

**One failure found a real bug:** TASK-8's button-order check exposed the "already has a button" problem described above. It was fixed in the controller, and the check now passes.

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
- `test_search-assist-auto-expand.ts`: **21/21**
- `test_search-assist-explore-more.ts`: **31/31**

## Manual Verification
Not yet run. These steps are for the maintainer, in Brave:
1. **Setup:** run `pnpm run build` and reload the extension in `brave://extensions`. The new site may need permission.
2. **The buttons:** open a finished Deep Research conversation and open its report. The panel's toolbar should show **Conversation** and **Report**, in that order, before **Share & Export**.
3. **The report copy:** click **Report** and paste into Obsidian. Check:
   - your research request is the prompt;
   - the report's headings, tables and code;
   - citation markers that jump to the right source;
   - `Sources` with Citations and More.
4. **The two optional sections:** turn on **Include "Sources browsed but not used"** and **Include "Show thinking"**, copy again, and check the two sections at the end. Turn off **Include "Sources used in the report"**: no markers and no Sources section.
5. **The conversation copy:** click **Conversation** and paste. Check each prompt and reply in order, the plan as a numbered list of steps, and the line naming the report.
6. **Turning the button off:** turn off **Show a Copy conversation button**. The button should disappear without a reload.
7. **A long conversation:** scroll to the top of it, then copy the conversation. All turns should be there.
8. **Writing:** while a report is still being written, click **Report**. The "still writing" message should show next to the button.

## Follow-ups
- **Loading a long conversation for you:** the Conversation copy could scroll the history to the top and wait for the earliest turns before copying. That needs an asynchronous step before conversion, which adapters don't have yet.
- **Ordinary Gemini chats:** buttons on ordinary chats, and per-reply buttons, were out of scope.
- **Citations in left-pane replies:** these are dropped. Outside a report there's no source list to link them to.
- **Code-block language labels:** a Gemini code block with a language header wasn't inspected. Its label may come through as a line before the fence.
- **Unseen states:** a report still being written, and a plan revised with "Edit plan", weren't seen live. Both are covered by synthetic checks.
