# Walkthrough: Gemini chats

Ordinary Gemini conversations are now supported, not only Deep Research:
- **Each reply:** every finished reply gets a **Copy as Markdown** button, which copies it with its prompt.
- **The Conversation button:** it sits in the top bar, and moves into a report's toolbar while one is open.
- **Gemini's own Copy:** a reply's Copy icon can be set to copy Markdown too.
- **Attachments and generated items:** files attached to prompts, and the files, images, music and video Gemini makes, are named in the copy as text.

## What Was Implemented

### 1. Shared code
- **`src/core/types.ts`:** `SiteAdapter.buttonLabel` may return null. That message then gets the plain icon button, so a site can label some of its buttons and not others.
- **`src/content/controller.ts`:** `sync()` moves a tracked button when the adapter's anchor for it now has a different parent, instead of leaving it where it was. Gemini's Conversation button relies on this.

### 2. Gemini markup
- **`src/sites/gemini-markup.ts`:**
  - **New selectors** from the 2026-10-28 inspection of ordinary chats:
    - the reply toolbar, its Copy and Share, and the native Copy button;
    - the top bar's ⋮ menu;
    - code blocks and their language header;
    - source chips;
    - prompt attachments and their labels;
    - generated files, images, music and video.
  - **`readPromptText(userQuery)`:** the prompt's text, followed by `Attached: *name* (TYPE), …` when files were attached.
    - **Names:** escaped for Markdown. An attachment with no name shown is `*image*`.
    - **Where it's used:** for reply prompts, Conversation turns and the Deep Research request.

### 3. Gemini adapter
- **`src/sites/gemini.ts`:**
  - **Code blocks:** `rewriteCodeBlocks` fences each one with its header's language, lowercased. "Text" gets no tag, and the header's buttons go. Reports use it too.
  - **Generated items:** `rewriteGeneratedItems` names each one in place, without links:
    - a file as `Generated file: *name* (TYPE)`;
    - an image, music or a video as `*Generated image*`, `*Generated music*` or `*Generated video*`.
    - **Items outside the reply's text:** any found there follow it.
  - **Chips and markers:** `preprocessReply` drops source chips as well as citation markers. Neither carries a link in a chat.
  - **Each reply:** `model-response` is now a message.
    - **Where its button goes:** before the toolbar's Copy, or before **Share** when the reply is only an image or a video, which has no Copy.
    - **What else changed:**
      - the reply's prompt is its own turn's;
      - the native Copy override covers `message-actions copy-button button` only;
      - the reply button has no visible label.
  - **Conversation button:** with no report open, it goes before `conversation-actions-icon` in the top bar.
  - **Wording:** the option and button-setting descriptions are updated.

### 4. Tests
- **`scratch/fixtures/gemini-chat.html` (new, synthetic):** a top bar and three turns:
  1. **Two PDF attachments**, and a reply with a Python code block, a chip, a marker, a link and a table.
  2. **A picture attachment**, and a reply with a generated file, image, music and video, whose toolbar shows Share in place of Copy.
  3. **A reply still being written.**
- **`scratch/test_gemini-chat.ts` (new):** 20 checks.
- **`scratch/test_gemini-deep-research.ts`:**
  - **The options-page check** now expects the override setting for Gemini, and the new button-setting hint.
  - **One check's title** says its "needs an open report" now also allows for the top bar's menu, which that fixture doesn't have.

## Verification & Test Results

### Automated Tests

`pnpm test` (which builds first, then runs every `scratch/test_*.ts`) passed. `scratch/test_gemini-chat.ts` gave **20/20 passed**:

- **The controller:** a tracked button moves when its anchor's parent changes, and back, without a second button. A null label gives the plain icon button. **Passed**
- **Prompts:**
  - Attachments are named after the text, with their types, and escaped. **Passed**
  - A picture is `*image*`, and a missing type is left off. **Passed**
  - A prompt of attachments alone is the `Attached:` line. **Passed**
  - A prompt without attachments is unchanged. **Passed**
- **Code:** fenced with the header's language, with the header and its buttons gone. A plain-text block, or one with no header, gets no language. **Passed**
- **Generated items:**
  - A file, an image, music and a video are named in place with no addresses or buttons. **Passed**
  - A lone player counts as a video. **Passed**
  - An item beside the reply's text follows it. **Passed**
- **Sources:** chips and markers are dropped, while ordinary links and tables stay. **Passed**
- **Reply buttons:**
  - **Placement:** the icon-only button goes before Copy, or before Share on an image-only reply. **Passed**
  - **A reply still being written** gets one only once its toolbar appears. **Passed**
  - **A click** copies the reply with its prompt, or alone with the prompt setting off. **Passed**
- **Prompt reading:** a reply's prompt is its own turn's, with no Gemini option needed. **Passed**
- **Override:**
  - **With it on:** a reply's Copy writes Markdown and is stopped before Gemini's handler, while a generated image's Copy reaches Gemini. **Passed**
  - **With it off:** both reach Gemini. **Passed**
- **Conversation button:**
  - **Placement:** in the top bar before ⋮. It moves into a report's toolbar before Report when one opens, and back when it closes. **Passed**
  - **Its option off:** the button goes, and the reply buttons stay. **Passed**
- **Fixture:**
  - **Buttons:** two finished replies get buttons, the one still being written doesn't, and Conversation is in the top bar. **Passed**
  - **Reply copies:** both match the expected Markdown exactly, with no addresses of generated items or attachments. **Passed**
  - **The Conversation copy** holds all three turns. **Passed**
- **Options page:** Gemini offers the override, still has no generic More, and its button hint names the replies. **Passed**

`tsc --noEmit` is clean.

### Regression Testing

All 13 test scripts passed:

| Script | Checks passed |
|---|---|
| ai-chat-formatter | 38 of 38 |
| block-reference-citations | 7 of 7 |
| copilot-source-details | 30 of 30 |
| copy-user-prompt | 33 of 33 |
| duck-ai-adapter | 20 of 20 |
| duckduckgo-search-assist | 22 of 22 |
| gemini-chat | 20 of 20 |
| gemini-deep-research | 36 of 36 |
| message-next-to-button | 8 of 8 |
| min-heading-level | 21 of 21 |
| pnpm-migration | 6 of 6 |
| search-assist-auto-expand | 21 of 21 |
| search-assist-explore-more | 31 of 31 |

Two Deep Research checks changed, as described under Tests above.

### Checked on the live site during implementation

- **A generated image** sits inside the reply's text. Its own Share, Copy and Download buttons are inside it, separate from the toolbar.
- **An image-only reply's toolbar** has Share where others have Copy. This wasn't anticipated in the plan, and is why the button falls back to Share.
- **A generated video:**
  - **Its markup:** a `video-player` inside `generated-video`, so a commit after TASK-11 matches that element by name. The fixture follows it.
  - **Its toolbar:** like an image's, it has Share and no Copy. The extension, already loaded in the browser, showed its button there before Share.
- **An image attached to a prompt:** not seen. Gemini never answered the test prompt with a picture attached, and the prompt didn't show up in the conversation. The fixture's picture attachment is still an assumption: a preview with an image and no filename label.

## Manual Verification

1. Run `pnpm run build`, then click the reload icon on the extension in `chrome://extensions`, then reload the Gemini tabs.
2. **The reply button:**
   1. Open an ordinary Gemini chat. Each finished reply should have the Markdown icon just left of Gemini's Copy icon.
   2. Click it on a reply with a code block, and paste into an Obsidian note. The prompt should come first, then the reply, with the code fenced as ` ```python ` (or whatever language the block's header showed).
3. **A new reply:** send a new prompt. The button should appear only once the reply has finished.
4. **The Conversation button:**
   1. It should be in the top bar, just left of ⋮.
   2. Click it and paste. Every loaded turn's prompt and reply should be there in order (scroll to the top first in a long chat).
5. **Prompt attachments:** in a chat whose prompt had files attached, copy that reply. The prompt should end with `Attached:`, naming each file with its type, e.g. `(PDF)`.
6. **Generated items:** in a chat where Gemini made an image and a video, copy each reply. You should get `*Generated image*` and `*Generated video*`, with no links or embedded images. The extension's button should sit before **Share** on both.
7. **The Conversation button around a report:**
   1. Open a Deep Research conversation and its report. Conversation should move into the report's toolbar, before **Report**.
   2. Close the report. Conversation should be back in the top bar.
8. **An attached picture:**
   1. If Gemini answers a prompt with a picture attached, copy that reply.
   2. The prompt should end with `Attached: *image*`, or the picture's name if Gemini shows one.
   3. If there's no `Attached:` line, the picture's preview has different markup from the guess: note it for a fix.
9. **The native Copy override:**
   1. In Options, turn on **Use for Gemini's own Copy button**.
   2. Click Gemini's Copy on a text reply and paste: you should get Markdown.
   3. Click Copy on a generated image: Gemini's own image copy should still happen.
10. **The Conversation setting:** turn off **Show a Copy conversation button**. The Conversation button should disappear from the top bar and a report's toolbar, and the reply buttons should stay.

## Follow-ups

- **An image attached to a prompt:** confirm its markup (manual step 8).
- **Thinking on chat replies:** not copied, since Gemini doesn't keep it in the page once a reply is finished. If a model is found that keeps a "Show thinking" control on finished replies, **Include "Show thinking"** could be extended to cover it.
- **Web-search citations in chats:** none turned up in the chats checked, so their markup is unknown and they aren't handled.
- **Links or embeds:** attachments and generated items are named without either, by your choice, since their Google addresses may need a sign-in or stop working.
