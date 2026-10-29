---
status: approved
---

# Gemini chats: copy each reply, and the whole conversation, as Markdown

Extends the Gemini adapter from Deep Research to ordinary Gemini conversations:
- **Each reply** gets a **Copy as Markdown** button just left of Gemini's own Copy icon. It copies that reply with its prompt.
- **The Conversation button** now shows on every conversation:
  - **No report open:** in the top bar, just left of the ⋮ menu.
  - **A report open:** in the report's toolbar, as now.
- **Gemini's own Copy button** can be set to copy Markdown too. This applies to reply toolbars only.
- **Attachments and generated files** are named in the copy as text, so the copy records that they existed.

**Related documents**
- [Gemini Deep Research plan](../gemini-deep-research/implementation_plan.md)
- [Duck.ai adapter plan](../duck-ai-adapter/implementation_plan.md)

## User Review Required

> [!IMPORTANT]
> **What a reply's copy contains**, in this order:
> 1. **The prompt**, in your prompt format, when **Copy the prompt with the response** is on (the default), as on the other sites.
>    - **Files attached to the prompt** are named in a last paragraph of the prompt: `Attached: *Widget_Guide* (PDF), *Spare_Parts* (PDF)`.
>    - **The file's name and type** are what Gemini shows on the attachment: the name without its extension, then the type label.
>    - **An attached image** with no name shown is written `*image*`.
>    - **Where the line ends up:** it's part of the prompt, so with the Heading format it lands in the quote under the heading. With the prompt setting off, the line goes too.
> 2. **The reply.** Gemini's own markup is rewritten as follows:
>    - **Code blocks** become fenced blocks tagged with the language Gemini shows in the block's header (`Python` becomes ` ```python `). The header and its buttons are dropped.
>    - **A file Gemini made** becomes `Generated file: *riff* (JSON)`, in the same place.
>    - **An image Gemini made** becomes `*Generated image*`, and its own buttons, its Copy among them, are dropped.
>    - **Music Gemini made** becomes `*Generated music*`; a video becomes `*Generated video*`.
>    - **None of these get a link or an embed.** Their addresses are on Google's servers and may need a sign-in or stop working.
>    - **Citation markers and source chips** are dropped when they have no link. In the chats inspected, they pointed to uploaded files and carried no address.
>    - **Ordinary links** in a reply stay links.
>
> The same rewriting applies to each turn of the Conversation copy. The research request at the top of a Deep Research report copy also gains its `Attached:` line.

> [!IMPORTANT]
> **Where the buttons go:**
> - **Each reply:** an icon-only **Copy as Markdown** button, like the other sites' buttons, just left of Gemini's Copy icon in the reply's toolbar.
>   - **While a reply is being written,** it has no toolbar yet, so it gets no button. That's how the other sites wait for a finished reply too.
>   - **Deep Research conversations get them too,** on every reply, including the one with the research plan.
> - **Conversation**, with **Show a Copy conversation button** on (the default):
>   - **No report open:** in the top bar, just left of the ⋮ "Open menu for conversation" button.
>   - **A report open:** it moves into the report's toolbar, before **Report**. When the report closes, it moves back.
>   - **Its new top-bar spot** means the button is no longer limited to Deep Research.
> - **Gemini's own Copy:** **Use for Gemini's own Copy button** now appears in Gemini's settings, off by default, with the same wording as the other sites.
>   - **What it covers:** only the Copy in a reply's toolbar.
>   - **What it leaves alone:** the Copy on a generated image, and Copy contents in a report's Share & Export menu.

> [!NOTE]
> **From live inspections on 2026-10-28** of the user's ordinary Gemini chats, recording structure only:
> - **A reply's toolbar:** `model-response` → `message-actions` → `div.buttons-container-v2`. It holds:
>   - `thumb-up-button`;
>   - `thumb-down-button`;
>   - `regenerate-button`;
>   - `copy-button > gem-icon-button > button`;
>   - a more menu.
> - **A reply's text:**
>   - **Where it is:** `message-content`, inside `.response-container-content`.
>   - **Thinking:** a reply marked `.has-thoughts` holds an empty `thinking-overlay` once finished.
> - **Code blocks:** `code-block`, holding:
>   - `div.code-block-decoration`, with a `span` (the language) and the download and copy buttons;
>   - then `pre > code[data-test-id="code-content"]`, with real newlines.
> - **Source chips:** `source-inline-chip > div.source-inline-chip-container > button`, holding:
>   - `span.source-title`;
>   - an optional `span.source-count` ("+ 2").
>   - **No `href`.** Opening one showed no links either.
> - **Citation markers:** `source-footnote`, as in reports, but with no source list to point into. The reply's `sources-list` held an empty `overview-carousel`.
> - **Generated items:**
>   - **A file:** `generated-file > div.chip-lr`, with:
>     - `img.file-icon-lr`;
>     - `div.file-name-lr`;
>     - `div.file-type-lr` (e.g. "JSON");
>     - an open button.
>   - **Music:** `generated-music > video-player > video[src]`.
>   - **An image:** `generated-image > single-image`, holding:
>     - the `img`;
>     - `div.generated-image-controls`, which has a `copy-button` of its own.
> - **Prompt attachments:**
>   - **Where they are:** `user-query` → `user-query-file-carousel` → `user-query-file-preview` → `div[data-test-id="uploaded-file"]`, outside `.query-text`.
>   - **Each one** holds a `[data-test-id="extension-label"]` (e.g. "PDF") and a `[data-test-id="filename-label"]`.
> - **The top bar:** `conversation-actions-icon` (the ⋮ menu) inside `div.buttons-container`.

> [!NOTE]
> **Out of scope, and why:**
> - **Thinking on ordinary replies:** once a reply is finished, its thinking isn't in the page. This was checked on six ordinary chats and on a new chat set to Flash with High thinking. No "Show thinking" control is left either, so there's nothing to copy. If a model turns up that keeps it, **Include "Show thinking"** can be extended to replies later.
> - **Web-search citations:** none turned up in about 11 chats checked. Their markup is unknown.

## Open Questions

- **Two kinds of item haven't been seen in a live chat:** a video Gemini made, and an image attached to a prompt.
  - **How they're handled for now:** the plan assumes a video is a `video-player` outside `generated-music`. It also assumes an attached image is an `uploaded-file` preview with an `img` and no filename label.
  - **How to check:** manual step 8 covers both if such a chat exists. If the markup differs, the item is left out of the copy rather than named wrongly.
- **Generated items may sit outside `message-content`:** this wasn't recorded during the inspection. TASK-6 handles both cases: an item outside it is named after the reply's text, in page order.

## Proposed Changes

### Shared code

#### [MODIFY] `src/core/types.ts`
- [x] **TASK-1:** Let `SiteAdapter.buttonLabel(message)` return `ButtonLabel | null`, documented as: null gives that message the default icon-only button. Gemini's reply buttons need this, since the adapter's report and conversation buttons are labelled.

#### [MODIFY] `src/content/controller.ts`
- [x] **TASK-2:** In `sync()`, move a tracked button whose anchor has moved.
  - **When:** the button is connected, the adapter still gives an anchor, and `button.parentElement !== anchor.parent`.
  - **What:** re-insert it with `anchor.parent.insertBefore(button, anchor.before)` instead of leaving it.
  - **Why:** the Conversation button moves between the top bar and the report toolbar.
  - **Also:** `createButton` treats a null `buttonLabel` like an absent one. Update `sync()`'s doc comment.

### Gemini markup

#### [MODIFY] `src/sites/gemini-markup.ts`
- [x] **TASK-3:** Add the ordinary-chat selectors from the inspection above, each with a doc comment:
  - `REPLY_COPY_SELECTOR` (`message-actions copy-button`);
  - `NATIVE_COPY_BUTTON_SELECTOR` (`message-actions copy-button button`);
  - `CONVERSATION_MENU_SELECTOR` (`conversation-actions-icon`);
  - `CODE_BLOCK_SELECTOR`, `CODE_LANGUAGE_SELECTOR` (`.code-block-decoration > span`) and `CODE_CONTENT_SELECTOR`;
  - `INLINE_SOURCE_CHIP_SELECTOR`;
  - `UPLOADED_FILE_SELECTOR`, `FILENAME_LABEL_SELECTOR` and `EXTENSION_LABEL_SELECTOR`;
  - `GENERATED_FILE_SELECTOR`, `GENERATED_FILE_NAME_SELECTOR` and `GENERATED_FILE_TYPE_SELECTOR`;
  - `GENERATED_IMAGE_SELECTOR`, `GENERATED_MUSIC_SELECTOR` and `VIDEO_PLAYER_SELECTOR`.

  Extend the file's header comment to say that the ordinary-chat selectors come from the same day's inspection of ordinary chats.
- [x] **TASK-4:** Add `readPromptText(userQuery)`.
  - **What it returns:** `readQueryText(userQuery)`, followed by a blank line and `Attached: *name* (TYPE), …` when the prompt has attachments.
  - **Where the attachments come from:** each `UPLOADED_FILE_SELECTOR` in `userQuery`.
  - **Name and type:**
    - The name is the filename label, or `image` when the attachment shows only an `img`.
    - `*`, `_`, `[` and `]` in a name are backslash-escaped.
    - The type is the extension label, left off when empty.
  - **Callers:** use it in place of `readQueryText` in `readGeminiPrompt`, `readGeminiTurns` and the research request.
  - **A prompt with attachments and no text** gives the `Attached:` line alone.

### Gemini adapter

#### [MODIFY] `src/sites/gemini.ts`
- [x] **TASK-5:** Add `rewriteCodeBlocks(root)`, run in `preprocessReply` and `preprocessReport`.
  - **What it does:** each `code-block` becomes `<pre><code class="language-…">` with the text of its `CODE_CONTENT_SELECTOR`.
  - **The language:** read from `CODE_LANGUAGE_SELECTOR` with `streamdownLanguageId`, so it's lowercased, and "text" or "plain" give no tag.
  - **No language label** (as in reports today): the block keeps its plain fence.
- [x] **TASK-6:** Add `rewriteGeneratedItems(root)`.
  - **When it runs:** in `preprocessReply`, before the reply is narrowed to `message-content`.
  - **What it writes:** each item becomes a `<p>`:
    - a `generated-file`: `Generated file: <em>name</em> (TYPE)`, from its name and type;
    - a `generated-image`: `<em>Generated image</em>`;
    - a `generated-music`: `<em>Generated music</em>`;
    - any other `video-player`: `<em>Generated video</em>`.
  - **Items outside `message-content`** are kept after it, in page order.
- [x] **TASK-7:** In `preprocessReply`, also remove `source-inline-chip`, alongside the citation markers it already drops. Update the doc comment to say that chips and markers carry no link in a chat.
- [x] **TASK-8:** Make each reply a message.
  - **`messageSelector`:** add `model-response`.
  - **`findGeminiButtonAnchor`:**
    - **For a `model-response`:** the anchor is `{ parent: copyButton.parentElement, before: copyButton }` for its `REPLY_COPY_SELECTOR`.
    - **No toolbar yet:** null.
  - **`buttonLabel`:** null for a reply.
  - **`nativeCopyButtonSelector`:** set to `NATIVE_COPY_BUTTON_SELECTOR`. Update the comment that said Gemini has no Copy button to take over.
  - **`readGeminiPrompt`:**
    - **For a `model-response`:** return `readPromptText` of its turn's `user-query`, with no Gemini option needed.
    - **The report's prompt:** still governed by **Copy the research request with the report**.
  - **`readGeminiReferences`:** stays null for a reply, so a reply has no Sources section.
  - **`copyButtonDescription`:** "Adds a button to each reply, before Gemini's Copy, and Conversation and Report buttons to the top bar or a report's toolbar."
- [ ] **TASK-9:** Show the Conversation button with no report open.
  - **Where:** with no `deep-research-immersive-panel` in the page, `findGeminiButtonAnchor` puts the history's button before `CONVERSATION_MENU_SELECTOR`.
  - **When it's hidden:** null while that isn't in the page, or while **Show a Copy conversation button** is off.
  - **Option description:** "Adds a Conversation button that copies the whole conversation on the left: your prompts, their attachments and Gemini's replies. It sits in the top bar, or before Report while a report is open."

### Tests

#### [NEW] `scratch/fixtures/gemini-chat.html`
- [ ] **TASK-10:** Add a synthetic fixture with made-up names, structured as inspected:
  - **The top bar:** a `div.buttons-container` with `conversation-actions-icon`.
  - **The history**, with three turns:
    1. **First turn:**
       - **The prompt:** two lines and two PDF attachments.
       - **The reply:**
         - a code block whose header says `Python`;
         - a `source-inline-chip` and a `source-footnote`;
         - a plain link and a table;
         - its toolbar.
    2. **Second turn:**
       - **The prompt:** an image attachment with no filename label.
       - **The reply:**
         - a `generated-file` (JSON);
         - a `generated-image` with its own `copy-button`;
         - a `generated-music`;
         - a lone `video-player`;
         - its toolbar.
    3. **Third turn:** a reply still being written, with no `message-actions`.

#### [NEW] `scratch/test_gemini-chat.ts`
- [ ] **TASK-11:** Add a regression script covering the checks under Automated Tests below.
  - **The Deep Research tests:** update `scratch/test_gemini-deep-research.ts` where its replies now get buttons of their own. Its fixture's replies have toolbars.
  - **The suite:** run all `scratch/test_*.ts` with `pnpm test`.

## Verification Plan

### Automated Tests

`scratch/test_gemini-chat.ts`, against the new fixture, checks that:
1. **Reply buttons:** each finished reply gets one icon-only Copy as Markdown button, directly before its toolbar's `copy-button`. The reply still being written gets none until a toolbar is added, and then gets one.
2. **The Conversation button with no report:** it goes before `conversation-actions-icon` in the top bar, and is removed when **Show a Copy conversation button** is turned off.
3. **The Conversation button with a report:** when a report panel is added to the page, the same button moves into the panel's toolbar before Report. When the panel is removed, it's back in the top bar, with exactly one Conversation button throughout.
4. **A reply's copy:**
   - It starts with its prompt, ending in `Attached: *…* (PDF), *…* (PDF)`.
   - With **Copy the prompt with the response** off, there's no prompt and no `Attached:` line.
5. **Code blocks:** each is fenced as ` ```python ` with its code intact, and the header text and buttons don't appear.
6. **Chips and links:**
   - Neither the chip's title nor any citation-marker text appears, and the reply has no Sources section.
   - The plain link stays a link, and the table keeps its rows.
7. **Generated items:**
   - **The text:** the second reply's copy reads `Generated file: *…* (JSON)`, `*Generated image*`, `*Generated music*` and `*Generated video*`, in page order.
   - **No addresses:** no `http` address from those items appears.
   - **The attached image:** the prompt's line says `*image*`.
8. **The Conversation copy:** it includes all three turns' prompts, with their `Attached:` lines, and their replies rewritten as above.
9. **The native Copy override:**
   - **Turned on:**
     - **The reply toolbar's Copy:** a click writes the reply's Markdown and stops Gemini's handler.
     - **The generated image's own Copy:** a click is left alone.
   - **Turned off:** both are left alone.
10. **The options page:**
    - **The override setting:** **Use for Gemini's own Copy button** now shows for Gemini.
    - **The More setting:** **Include "More" sources** is still hidden.
11. **Escaping:** an attachment name holding `*` or `_` is escaped in the `Attached:` line.

**Regression:** `pnpm test` runs every existing script, the Deep Research and Duck.ai ones included, and they must pass. `tsc --noEmit` must be clean.

### Manual Verification
1. Run `pnpm run build`, then reload the extension in `chrome://extensions`, and reload the Gemini tabs.
2. **The reply button:**
   1. Open an ordinary Gemini chat. Each finished reply should have the Markdown icon just left of Gemini's Copy icon.
   2. Click it on a reply with a code block, and paste into an Obsidian note. The prompt should come first, then the reply, with the code fenced and tagged with its language.
3. **A new reply:** send a new prompt. The button should appear only once the reply has finished.
4. **The Conversation button:**
   1. Check that it's in the top bar, left of ⋮.
   2. Click it and paste: every loaded turn's prompt and reply should be there in order.
5. **Prompt attachments:** in a chat whose prompt had files attached, copy that reply. The prompt should end with `Attached:` naming each file and its type.
6. **Generated files:** in a chat where Gemini made a file (or an image, or music), copy that reply. Each item should be named in place, with no link and no image.
7. **The Conversation button around a report:**
   1. Open a Deep Research conversation and its report. Conversation should move into the report's toolbar, before Report.
   2. Close the report. Conversation should be back in the top bar.
8. **Items not yet seen:** if you have a chat where Gemini made a video, or where you attached an image, copy those replies.
   - **What to look for:** `*Generated video*`, or `*image*` in the `Attached:` line.
   - **If either is missing:** note it, since the markup was assumed.
9. **The native Copy override:**
   1. In Options, turn on **Use for Gemini's own Copy button**.
   2. Click Gemini's Copy on a reply and paste: you should get Markdown.
   3. Click Copy on a generated image: Gemini's own image copy should still happen.
10. **The settings off:** turn off **Show a Copy conversation button**. The Conversation button should disappear from the top bar and the report toolbar, and the per-reply buttons should stay.

## Visual design application

No `design-system.md` or `art-bible.md` exists for this product. The reply button reuses the existing `.acf-copy-button`, and the top-bar Conversation button reuses the labelled style from the Deep Research work.
