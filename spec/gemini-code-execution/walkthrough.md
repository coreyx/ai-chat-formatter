# Walkthrough: Code Gemini ran

The code Gemini runs for a reply is folded behind **Show code**. It's now copied by default as an Obsidian callout that starts folded, `> [!example]- Code Gemini ran`, holding each run's code and its output. A new Gemini drop-down, **Code Gemini ran**, can make the runs plain code blocks with their output, or leave them out.

## What Was Implemented

### 1. Shared code
- **`src/core/types.ts`:** `ConversionContext.choice(id)` gives the value of a site's drop-down setting during a copy, or `""` for an id the site doesn't declare.
- **`src/core/convert.ts`:** `ConversionOptions.choice` is an optional reader. Without one, every choice takes its default, so the existing callers and tests are unchanged. `convertConversation` passes it to every turn.
- **`src/content/controller.ts`:** `convert()` passes the stored value for each drop-down, falling back to its default. That covers the reply button, the Conversation copy and the native Copy override.

TASK-1 and TASK-2 went in as one commit, since TypeScript needs the context's new method and the code that provides it together.

### 2. Gemini
- **`src/sites/gemini-markup.ts`:** two new selectors:
  - **`CODE_OUTPUT_SELECTOR`:** `[data-test-id="code-output-stdout-stderr"]`. Its presence is what marks a code block as code Gemini ran.
  - **`RESPONSE_ELEMENT_SELECTOR`:** the wrapper around each block.
- **`src/sites/gemini.ts`:**
  - **The drop-down:** `CODE_EXECUTION_CHOICE` (`code-execution`), with the values `callout` (the default), `code-blocks` and `omit`.
  - **`rewriteCodeRuns(root, context)`:** runs in reply and report copies, before the ordinary code-block rewriting. Each run, with its `response-element`, is handled by the setting:
    - **Leave out:** the run is removed.
    - **Code blocks:** the code is fenced with its language, then `**Code output**` and a plain fence when the run printed anything.
    - **Folded callout:** the run becomes a placeholder holding its language, code and output. A run straight after another joins its placeholder. An unknown setting value is read as the default.
    - **How runs are found:** by their output, so a run you've unfolded is copied the same way.
  - **`codeRunCalloutRule()`:** writes each placeholder as the callout.
    - **Every line is quoted.** A line with nothing on it is a bare `>`.
    - **Runs are separated** by an empty quoted line.
    - **Fences:** each is three backticks, or one more than the longest run of backticks in its text.

### 3. Tests
- **`scratch/fixtures/gemini-code-execution.html` (new, synthetic):** one reply, built from the 2026-10-28 inspection. In order, it has:
  1. two folded runs with output;
  2. a heading and a paragraph;
  3. an ordinary JSON block;
  4. a third run that printed nothing, whose code holds a line of three backticks;
  5. a closing paragraph.
- **`scratch/test_gemini-code-execution.ts` (new):** 11 checks.

## Verification & Test Results

### Automated Tests

`pnpm test` (which builds first, then runs every `scratch/test_*.ts`) passed. `scratch/test_gemini-code-execution.ts` gave **11/11 passed**:

- **Choices during conversion:**
  - A conversion reads a drop-down from its reader, its default without one, and `""` for an undeclared id. **Passed**
  - A conversation passes the reader to every turn. **Passed**
  - The controller passes a site's stored value to its copy, and the default when nothing is stored. **Passed**
- **The setting:** Gemini's setting starts as `callout`. The options page offers **Folded callout**, **Code blocks** and **Leave out**, with Folded callout selected. **Passed**
- **Code blocks:** each run is fenced with its language, then `**Code output**` and a plain fence. The Show code toggle, the headers and the buttons are gone. **Passed**
- **Leave out:** no run or output is copied, and the rest of the reply is intact. **Passed**
- **A run that printed nothing,** as code blocks, has no Code output part. **Passed**
- **Callout:**
  - Runs next to each other share one folded callout, and the written JSON block stays plain. "callout" and an unknown value give the same result. **Passed**
  - A run apart from the others gets its own callout in place. One that printed nothing has no Code output, and backticks in the code lengthen the fence to four. **Passed**
- **The fixture:**
  - The default copy matches the expected Markdown exactly: one callout for the two runs, one for the third, and the text and written block untouched. No "Show code", "Download code" or "Copy code" text appears. **Passed**
  - Each of the three settings reaches the reply button, the Conversation copy and the native Copy override, and keeps the text around the runs. **Passed**

`tsc --noEmit` is clean.

### Regression Testing

All 16 test scripts passed:

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
| gemini-code-execution | 11 of 11 |
| gemini-deep-research | 36 of 36 |
| message-next-to-button | 8 of 8 |
| min-heading-level | 21 of 21 |
| pnpm-migration | 6 of 6 |
| search-assist-auto-expand | 21 of 21 |
| search-assist-explore-more | 31 of 31 |

No existing test needed changing.

## Manual Verification
1. Run `pnpm run build`, then click the reload icon on the extension in `chrome://extensions`, then reload a Gemini tab.
2. **The default:**
   1. Open a chat whose reply shows **Show code**, and leave the code folded.
   2. Click the reply's Copy as Markdown, and paste into an Obsidian note.
   3. A folded "Code Gemini ran" callout should appear where the code was, in both Live Preview and Reading view.
   4. Expand it. It should show each run's Python code and, under **Code output**, its output, all as code blocks.
3. **Code blocks:** in Options, set **Code Gemini ran** to **Code blocks** and copy again. The code and output should be plain code blocks, with no callout.
4. **Leave out:** set it to **Leave out** and copy again. No code Gemini ran should appear, and the rest of the reply should be unchanged.
5. **The Conversation copy:** set it back to **Folded callout**, then copy the whole chat with **Conversation**. That reply's runs should be folded callouts there too.

## Follow-ups

- **The same callout could hold other optional sections, if you want:**
  - Deep Research's `## Thinking` and **Sources browsed but not used** sections;
  - the sites listed in Duck.ai's Reasoning panel.
- **Output that's already Markdown,** such as a table printed by the code, is shown as text in a fence, as Gemini shows it.
