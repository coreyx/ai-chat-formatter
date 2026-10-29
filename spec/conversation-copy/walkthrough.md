# Walkthrough: Conversation copies on Duck.ai and Copilot

Duck.ai and Copilot now have a **Conversation** button, like Gemini's. It copies every turn in the page: each prompt, then its reply with that reply's own Sources section. Each site has a **Show a Copy conversation button** setting, on by default.
- **Duck.ai:** the button sits beside the chat's title, before its ⋮ menu.
- **Copilot:** the button sits in the top bar, before **Share**.

## What Was Implemented

### 1. Duck.ai
- **`src/sites/duckai.ts`:**
  - **`DUCK_AI_REPLY_SELECTOR`:** the reply selector, now exported.
  - **`CONVERSATION_SELECTOR`:** the parent of the turn wrappers in the 2026-10-28 layout, or `<main>` in the older, flat layout. It's added to `messageSelector`.
  - **`readDuckAiTurns`:** one turn per reply in page order, each with the prompt before it. It skips any reply marked `data-activeresponse="false"`.
  - **`buttonLabel`:** "Conversation" for the conversation, and the plain icon for replies.
  - **`findConversationButtonAnchor`:** the header is the parent of the chat's title `h1`. A heading inside a prompt or a reply is never taken for the title.
    - **Where the button goes:** right before the header's child that holds `button[aria-haspopup="menu"]`.
    - **Null when:** the option is off, or there's no header.
  - **`CONVERSATION_BUTTON_OPTION`:** `conversation-button`, on by default, listed after **Cite sources as Duck.ai does**.

### 2. Copilot
- **`src/sites/copilot.ts`:**
  - **`COPILOT_REPLY_SELECTOR`:** the reply selector, now exported.
  - **`CONVERSATION_SELECTOR`:** `[data-testid="MessageListContainer"] div[role="feed"]`, added to `messageSelector`.
  - **`readCopilotTurns`:** one turn per reply article, each with its prompt.
  - **`buttonLabel`:** as for Duck.ai.
  - **`findConversationButtonAnchor`:** right before the `div` wrapping Share (`header … span > button[data-testid="share-button"]`), in the row it shares with **Settings and more**.
  - **The option:** Copilot's first site option, `conversation-button`, on by default.

### 3. Shared code
- **`src/content/controller.ts`:** `gatherReferences` returns nothing for a message the adapter splits into turns. Each reply already reads its own sources with the quick reader as it's converted.
  - **The problem it fixes, found during TASK-5:** gathering sources for the conversation first could fall back to the slower reader. That happened whenever **Include "More" sources** was on, which is Copilot's default, and on Copilot the slower reader opens a reply's Sources panel. The fix is its own commit.

### 4. Tests
- **`scratch/fixtures/duckai-conversation.html` (new, synthetic):** the 2026-10-28 layout. It has the chat header in the first turn wrapper, three turns (one with a chip and two Read More cards, one with a two-line prompt, one with an inactive version), and a sidebar with its own menu button.
- **`scratch/fixtures/copilot-conversation.html` (new, synthetic):** the top bar's row (Share, Settings and more, an empty `span`) and a feed of two turns, one reply citing a source.
- **`scratch/test_conversation-copy.ts` (new):** 13 checks.
- **Existing scripts:**
  - **`test_copy-user-prompt.ts`, `test_duck-ai-adapter.ts` and `test_duckai-read-more-style.ts`** found Duck.ai's replies through its message selector, which now also matches the conversation. They now use `DUCK_AI_REPLY_SELECTOR`.
  - **`test_search-assist-explore-more.ts`:** its settings and options-page checks now expect the new options. Copilot has `conversation-button`, and Duck.ai has `read-more-style` and `conversation-button`.

## Verification & Test Results

### Automated Tests

`pnpm test` (which builds first, then runs every `scratch/test_*.ts`) passed. `scratch/test_conversation-copy.ts` gave **13/13 passed**:

- **Duck.ai:**
  - **The older layout:** the conversation is found and split into its two turns with their prompts. A reply isn't split, and the labels are right. **Passed**
  - **The current layout:** the conversation is the turns' parent, not the sidebar, and has three turns, without the inactive version. **Passed**
  - **Button placement:** the Conversation button goes right before the header's ⋮, once over many passes, and replies keep their own. **Passed**
  - **No header:** no Conversation button. Turning the setting off removes it. **Passed**
- **Copilot:**
  - **Turns:** the feed is a message, split into one turn per reply with its prompt. **Passed**
  - **The fixture:** two turns with their prompts, and the button goes before Share. **Passed**
  - **Button placement:** the button goes right before Share in the top bar's row, and there's none without Share. Turning the setting off removes it, and the reply keeps its button. **Passed**
- **The slower source reader:** a conversation copy never runs it, while a reply's own copy still does. This check fails without the TASK-5 fix. **Passed**
- **The Duck.ai copy:**
  - Each prompt is a heading over its reply, and the two-line prompt quotes its second line. **Passed**
  - Each reply has its own Sources section, and only the active version is copied. **Passed**
  - The copy is the same with prompts off. **Passed**
- **Duck.ai's style:** with it on, each reply keeps its chip link and ends with its own Read More list, before the next turn. **Passed**
- **The Copilot copy:** both turns, the first reply with its own Sources section. **Passed**
- **Override:** Copy on a reply, when taken over, copies that reply alone on both sites. **Passed**
- **Settings:** the setting starts on for both sites, and Duck.ai lists it after its citation style. **Passed**

Each reply's linked-citation block IDs use their own random token, so they can't clash across turns. The checks treat the token as a wildcard.

`tsc --noEmit` is clean.

### Regression Testing

All 15 test scripts passed:

| Script | Checks passed |
|---|---|
| ai-chat-formatter | 38 of 38 |
| block-reference-citations | 7 of 7 |
| conversation-copy | 13 of 13 |
| copilot-source-details | 30 of 30 |
| copy-user-prompt | 33 of 33 |
| duck-ai-adapter | 20 of 20 |
| duckai-read-more-style | 11 of 11 |
| duckduckgo-search-assist | 22 of 22 |
| gemini-chat | 20 of 20 |
| gemini-deep-research | 36 of 36 |
| message-next-to-button | 8 of 8 |
| min-heading-level | 21 of 21 |
| pnpm-migration | 6 of 6 |
| search-assist-auto-expand | 21 of 21 |
| search-assist-explore-more | 31 of 31 |

The four updated scripts are described under Tests above.

## Manual Verification
1. Run `pnpm run build`, then click the reload icon on the extension in `chrome://extensions`, then reload a Duck.ai tab and a Copilot tab.
2. **Duck.ai:**
   1. Open a conversation with several turns and scroll to the top. **Conversation** should sit just left of the ⋮ beside the chat's title.
   2. Click it and paste into Obsidian. Every turn should be there in order, each prompt as a heading over its reply, and each reply with its own sources.
3. **Duck.ai's style:** turn on **Cite sources as Duck.ai does** and copy the conversation again. Each reply should end with its own Read More list, and there should be no Sources sections.
4. **A regenerated reply:** if a turn's reply was regenerated, only the version on screen should be in the copy.
5. **Copilot:**
   1. Open a conversation with several turns. **Conversation** should sit in the top bar, just left of Share.
   2. Copy it and paste. Every loaded turn should be there in order, with each reply's sources and page titles.
   3. No Sources panel should open while it copies.
6. **The setting:** turn off **Show a Copy conversation button** for each site. The Conversation button should disappear, and the per-reply buttons should stay.

## Follow-ups

- **Copilot's sources:**
  - **What can be lost:** a reply written since the page loaded may come out without some page titles or More entries, if Copilot's page data can't be read. The same applies to **Use for Copilot's own Copy button**.
  - **Why:** the Sources-panel fallback isn't used for conversations.
- **Only loaded turns are copied:** on Copilot, older messages of a long conversation may not be in the page.
