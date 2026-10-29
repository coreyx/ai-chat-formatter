---
status: approved
---

# Copy the whole conversation on Duck.ai and Copilot

Adds a **Conversation** button to Duck.ai and Copilot, like Gemini's. It copies every loaded turn in order: each prompt, then its reply, with that reply's own Sources section. Each site gets a **Show a Copy conversation button** setting, on by default. The button reuses the turn-by-turn conversation copy built for Gemini (`readTurns` and `convertConversation`).

**Related documents**
- [Gemini Deep Research plan](../gemini-deep-research/implementation_plan.md)
- [Gemini chat plan](../gemini-chat/implementation_plan.md)
- [Duck.ai citation style plan](../duckai-read-more-style/implementation_plan.md)

## User Review Required

> [!IMPORTANT]
> **Where the button goes:**
> - **Duck.ai:** in the chat's header, on a line of its own under the title and the privacy line. (Revised after manual testing: the plan first said "just left of the ⋮".)
>   - **Why it's on its own line:** Duck.ai lays the header out as a grid, with the title and privacy line in a wide column and the ⋮ in a narrow one. The button is placed just before the ⋮ in the page, so the grid gives it a new row.
>   - **Why it was kept there:** you chose to keep it. It's easy to find and never covers the title.
>   - **It scrolls with the chat:** Duck.ai's header scrolls away with the conversation, and the button goes with it. Scroll to the top to find it.
>   - **No header** (such as a new chat that hasn't started): no button.
> - **Copilot:** in the top bar, just left of **Share** (the icon before **Settings and more**). This bar stays in place while you scroll.
> - **Both sites:** the button looks like Gemini's, with the Markdown icon followed by the word **Conversation**, and the tooltip "Copy conversation as Markdown". The per-reply buttons are unchanged.

> [!IMPORTANT]
> **What the copy contains**, as on Gemini:
> - **Every turn's prompt**, in your prompt format, then its reply. Prompts are included even with **Copy the prompt with the response** off, since keeping them is the point of this copy.
> - **Each reply's citations and Sources section**, in your citation style. On Duck.ai, with **Cite sources as Duck.ai does** on, each reply instead keeps its chip links and ends with its own Read More list.
> - **Linked-citation block IDs stay unique** across the whole copy. Turn N's IDs use the copy's token with N appended.
> - **Duck.ai:** where a reply was regenerated, only the version on screen is copied.
> - **Copilot's sources:**
>   - **How they're read:** with the quick method used today, which asks Copilot's page data and then reads the data Copilot embedded when the page loaded.
>   - **What's skipped:** the slower fallback that opens each reply's Sources panel, since opening one panel after another would be slow and visible.
>   - **What that can cost:** citations in a reply written since the page loaded may lose page titles or More entries if the page data can't be read. This is the same trade-off as the **Use for Copilot's own Copy button** setting.

> [!NOTE]
> **From a live inspection on 2026-10-28**, recording structure only:
> - **Duck.ai** (its class names are generated, so none are used):
>   - **Each turn:** a wrapper `div` holding the turn's `[data-testid="user-message"]` and its reply `div[id*="-assistant-message-"][data-activeresponse="true"]`.
>   - **The wrappers:** they share one parent, the conversation.
>   - **The first wrapper also holds the chat's header:** a `div` with the title `h1`, then a `div > div > button[aria-label="menu"][aria-haspopup="menu"]` (the ⋮), then the privacy line.
>   - **The existing fixture (2026-10-24)** has the user messages and replies as siblings with no wrappers, so the selector below also accepts that layout.
> - **Copilot:**
>   - **The conversation:** `[data-testid="MessageListContainer"] div[role="feed"]`, holding a `div[role="article"]` per prompt and per reply.
>   - **The top bar:** `header`, holding the model switcher and a row of three:
>     - a `div` wrapping `span[aria-label="Share"] > button[data-testid="share-button"]`;
>     - `button#moreButton` (Settings and more);
>     - an empty `span`.
>   - **The button goes** before the Share wrapper.

> [!NOTE]
> **Limits:**
> - **Only loaded turns are copied,** as on Gemini. Copilot can stop keeping a long conversation's older messages in the page, and the per-reply copy already notes this.
> - **A conversation still being written:** the reply in progress is copied as far as it has got. Only Copilot's code blocks check for missing lines, as now.

## Open Questions

None at this time.

## Proposed Changes

### Duck.ai

#### [MODIFY] `src/sites/duckai.ts`
- [x] **TASK-1:** Make the conversation a message of its own.
  - **`CONVERSATION_SELECTOR`:** the parent of the turn wrappers, with a fallback for the older, flat layout. It's `div:has(> div > [data-testid="user-message"]), :not(div):has(> [data-testid="user-message"])`, with a comment saying why each half exists.
  - **`messageSelector`:** add `CONVERSATION_SELECTOR` to it.
  - **`readTurns`:** returns null for a reply. For the conversation, it returns one turn per reply that isn't `data-activeresponse="false"`, in page order, each with `readDuckAiPrompt(reply)` as its prompt.
  - **`buttonLabel`:** `{ title: "Copy conversation as Markdown", text: "Conversation" }` for the conversation, null for a reply.
- [x] **TASK-2:** Place the Conversation button, and add its option.
  - **`findButtonAnchor`:** for the conversation, the header is the parent of its `h1`.
    - **The anchor:** the direct child of the header that holds `button[aria-haspopup="menu"]`, so the button goes right before it.
    - **Null when:** there's no header or no menu, or the option is off.
    - **Replies:** keep their current anchor.
  - **`CONVERSATION_BUTTON_OPTION`:** `"conversation-button"`, added to `options` after the citation-style option.
    - **Name:** "Show a Copy conversation button".
    - **Description:** "Adds a Conversation button to the chat's header, under its title, that copies the whole conversation: each prompt and its reply."
    - **`defaultEnabled`:** true.
  - **`copyButtonDescription`:** not added. Duck.ai's button setting keeps its usual hint.
- [x] **TASK-9:** Match the code to the revised placement. Added in revision, after manual testing; nothing about where the button goes changes.
  - **The option's description:** the new wording above.
  - **`findConversationButtonAnchor`'s doc comment:** say that the button is placed before the ⋮ in the page, and that Duck.ai's header grid shows it on a line of its own under the title.
  - **README, CHANGELOG and walkthrough:** describe it the same way.

### Copilot

#### [MODIFY] `src/sites/copilot.ts`
- [x] **TASK-3:** Make the conversation a message of its own.
  - **`CONVERSATION_SELECTOR`:** `[data-testid="MessageListContainer"] div[role="feed"]`, added to `messageSelector`.
  - **`readTurns`:** returns null for a reply. For the conversation, it returns one turn per reply article (`div[role="article"]:has([data-testid="markdown-reply"])`) in it, each with `readCopilotPrompt(reply)` as its prompt.
  - **`buttonLabel`:** as for Duck.ai.
- [x] **TASK-4:** Place the Conversation button, and add its option.
  - **`findButtonAnchor`:** for the conversation, the anchor is the `div` holding `span > button[data-testid="share-button"]` in the page's `header`. The button goes right before that `div`, in the same row as **Settings and more**.
    - **Null when:** there's no Share button, or the option is off.
    - **Replies:** keep their current anchor.
  - **The option:** `options: [ { id: "conversation-button", … } ]`, Copilot's first site option.
    - **Name:** "Show a Copy conversation button".
    - **Description:** "Adds a Conversation button to the top bar, before Share, that copies the whole conversation: each prompt and its reply."
    - **`defaultEnabled`:** true.

### Shared code

#### [MODIFY] `src/content/controller.ts`
- [x] **TASK-5:** Check that a conversation copy on these sites reads each reply's sources with the quick reader only (`readReferencesNow`), as `convert()` already does for turns.
  - **The doc comment:** add one line saying so, that the slower reader isn't used for a whole conversation.
  - **The code:** if the check turns up something these two sites need, it's fixed here. Otherwise this task is the doc comment alone.

### Tests

#### [NEW] `scratch/fixtures/duckai-conversation.html`
- [x] **TASK-6:** Add a synthetic Duck.ai page in the live layout.
  - **The header:** the chat title `h1`, the ⋮ menu wrapper and the privacy line, inside the first turn wrapper.
  - **Three turn wrappers:**
    1. a prompt and a reply with one link chip and two Read More cards;
    2. a two-line prompt and a reply with no sources;
    3. a prompt whose reply has an inactive variant (`data-activeresponse="false"`) next to the active one.
  - **The data:** every reply has its toolbar with Copy, and all names and URLs are made up.

#### [NEW] `scratch/fixtures/copilot-conversation.html`
- [x] **TASK-7:** Add a synthetic Copilot page.
  - **The top bar:** a `header` with the model switcher and the row of Share wrapper, `#moreButton` and an empty `span`.
  - **The conversation:** a `MessageListContainer` with a `role="feed"` of two turns, in the article markup of `copilot-message.html`. One reply has a citation chip.

#### [NEW] `scratch/test_conversation-copy.ts`
- [x] **TASK-8:** Add a regression script covering the checks under Automated Tests.
  - **Existing scripts:** update any whose expectations change with Copilot and Duck.ai gaining options, such as `test_search-assist-explore-more.ts`'s "Copilot has no options" check, with a comment pointing here.
  - **The suite:** run `pnpm test`.

## Verification Plan

### Automated Tests

`scratch/test_conversation-copy.ts` checks that:
1. **Duck.ai button placement:**
   - The Conversation button goes in the header, right before the ⋮ wrapper in the page, labelled "Conversation", one per page over many passes.
   - Each reply keeps its own icon button.
2. **The Duck.ai copy:**
   - It has three turns, in order, each prompt as a heading above its reply. The two-line prompt follows the Heading format's quote rule.
   - Each reply has its own Sources section, and block IDs are unique across turns.
   - The inactive variant is left out.
   - The copy is the same with **Copy the prompt with the response** off.
3. **Duck.ai's style:** with **Cite sources as Duck.ai does** on, the first turn keeps its chip link and ends with its own Read More list, before the second turn.
4. **Copilot button placement:** the Conversation button goes right before the Share wrapper in the header row, and a click copies both turns with their prompts.
5. **Turning the setting off** removes the Conversation button on both sites and leaves the reply buttons.
6. **No header or Share button** (on a new chat): no Conversation button.
7. **The native Copy override** on a reply still copies only that reply, not the conversation.
8. **The older Duck.ai fixture** (flat layout, `duckai-message.html`) also finds the conversation and splits it into its two turns.
9. **Settings:**
   - **Defaults:** `conversation-button` is on for Duck.ai and Copilot.
   - **Each options page** lists the setting, Duck.ai's after **Cite sources as Duck.ai does**.

**Regression:** `pnpm test` runs every existing script, which must pass, and `tsc --noEmit` must be clean.

### Manual Verification
1. Run `pnpm run build`, then click the reload icon on the extension in `chrome://extensions`, then reload a Duck.ai and a Copilot tab.
2. **Duck.ai:**
   1. Open a conversation with several turns and scroll to the top. **Conversation** should sit on its own line under the chat title and the privacy line.
   2. Click it and paste into Obsidian. Every turn should be there in order, each with its own sources.
3. **Duck.ai's style:** turn on **Cite sources as Duck.ai does** and copy the conversation again. Each reply should end with its own Read More list.
4. **Copilot:**
   1. Open a conversation with several turns. **Conversation** should be in the top bar, left of Share.
   2. Copy it and paste. Every loaded turn should be there in order, each reply with its own sources and page titles.
5. **The setting:** turn off **Show a Copy conversation button** for each site. The button should disappear, and the per-reply buttons should stay.

## Visual design application

No `design-system.md` or `art-bible.md` exists for this product. The Conversation button reuses the labelled style (`.acf-copy-button.acf-labelled`) from Gemini's buttons.
