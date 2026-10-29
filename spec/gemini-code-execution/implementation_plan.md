---
status: approved
---

# Gemini: copy the code Gemini ran as a folded callout

A Gemini reply can include code Gemini ran to produce its answer, with that code's output. Gemini folds it away behind **Show code** in the reply's header.

**Today:** each run is copied as an ordinary code block, with nothing to say it was hidden, and its output is left out.

**With this change:** a Gemini drop-down, **Code Gemini ran**, chooses how runs are copied. The default is an Obsidian callout that starts folded, holding the code and its output.

**Related documents**
- [Gemini chat plan](../gemini-chat/implementation_plan.md)

## User Review Required

> [!IMPORTANT]
> **The drop-down's choices:**
> - **Folded callout** (the default):
>
>   ````markdown
>   > [!example]- Code Gemini ran
>   > ```python
>   > import json
>   > …
>   > ```
>   >
>   > **Code output**
>   >
>   > ```
>   > Saved riff.json
>   > ```
>   ````
>
>   The `-` after the type makes Obsidian show it folded, in both Live Preview and Reading view. Other Markdown apps show a plain quote that begins with `[!example]-`.
> - **Code blocks:** the code as a fenced block with its language, then `**Code output**` and the output in a plain fence. This is today's copy, plus the output.
> - **Leave out:** runs aren't copied.

> [!IMPORTANT]
> **How the callout is laid out:**
> - **One callout per group of runs:** runs right next to each other share one callout, in page order. In the sample reply, both runs come before the reply's text. A run further down the reply gets its own callout in place.
> - **The code:** fenced with the language Gemini shows ("Python" becomes `python`).
> - **The output:** under **Code output**, in a plain fence. A run with no output has no **Code output** part.
> - **Fences inside fences:** where the code or its output itself holds ```` ``` ````, its fence uses more backticks, so it can't close early.
> - **Where it applies:** the reply copy, the Conversation copy, and Gemini's own Copy when the override is on.

> [!NOTE]
> **From a live inspection on 2026-10-28**, structure only. A run is one of Gemini's `code-block`s holding two parts:
> 1. **The code:** a header with the language and the download and copy buttons, then `pre > code[data-test-id="code-content"]`.
> 2. **The output:**
>    - a second header, `div.code-block-decoration.header`, reading "Code output";
>    - `mat-divider.code-result-divider`;
>    - `pre > code.code-result-container[data-test-id="code-output-stdout-stderr"]`.
>
> **Where runs sit:** each run is wrapped in a `response-element`, in the reply's text. While folded, its `div.code-block` is `display: none`, but the code and output are in the page in full.
>
> **How runs are told apart:** by the output element, not by whether they're hidden, so an unfolded run is copied the same way.
>
> **The toggle:** one `button[data-test-id="toggle-code-button"]` ("Show code") in the reply's header covers all of the reply's runs. It's left alone.

> [!NOTE]
> **A small shared change:**
> - **What it is:** a site's conversion step can now read the site's drop-down settings. Until now, only the automation behind Search Assist's clicking could.
> - **How:** `ConversionContext` gains `choice(id)`, and `ConversionOptions` gains an optional `choice` reader.
> - **Defaults:** without one, each choice takes its default, so the existing callers and tests are unchanged.

## Open Questions

None at this time.

## Proposed Changes

### Shared code

#### [MODIFY] `src/core/types.ts`
- [x] **TASK-1:** Add `choice(id: string): string` to `ConversionContext`.
  - **What it returns:** the value of the adapter's drop-down setting `id` (see `SiteAdapter.choices`) for this copy.
  - **An unknown id:** gives `""`.

#### [MODIFY] `src/core/convert.ts`
- [x] **TASK-2:** Add `choice?: (choiceId: string) => string` to `ConversionOptions`.
  - **In `convertMessage`:** `context.choice` is that reader, falling back to the adapter's `defaultValue` for the choice. An absent reader means every choice takes its default.
  - **In `convertConversation`:** passes the reader through for each turn, with the other shared options.

#### [MODIFY] `src/content/controller.ts`
- [x] **TASK-3:** In `convert()`'s shared options, pass `choice: (id) => site?.choices[id] ?? adapter default`, mirroring `isOptionEnabled`.
  - **What reaches it:** the reply copy, the Conversation copy and the native Copy override, since they all go through `convert()`.

### Gemini

#### [MODIFY] `src/sites/gemini-markup.ts`
- [x] **TASK-4:** Add these selectors, with doc comments from the inspection above:
  - `CODE_OUTPUT_SELECTOR` (`[data-test-id="code-output-stdout-stderr"]`);
  - `RESPONSE_ELEMENT_SELECTOR` (`response-element`).

#### [MODIFY] `src/sites/gemini.ts`
- [ ] **TASK-5:** Add the drop-down: `CODE_EXECUTION_CHOICE = "code-execution"` in a new `choices` array.
  - **Name:** "Code Gemini ran".
  - **Description:** "How the code Gemini ran for a reply, hidden behind Show code, is copied, with its output."
  - **Values:** `callout` ("Folded callout", the default), `code-blocks` ("Code blocks") and `omit` ("Leave out").
- [ ] **TASK-6:** Add `rewriteCodeRuns(root, context)`, run in `preprocessReply` and `preprocessReport` before `rewriteCodeBlocks`.
  - **What it finds:** each `code-block` holding `CODE_OUTPUT_SELECTOR`. Its outermost wrapper (the enclosing `response-element`, or the block itself) is the unit.
  - **What it reads:** the language with `streamdownLanguageId`, the code from `CODE_CONTENT_SELECTOR`, and the output from `CODE_OUTPUT_SELECTOR`.
  - **With `omit`:** the unit is removed.
  - **With `code-blocks`:** the unit becomes `<pre><code class="language-…">`. When there's output, that's followed by `<p><strong>Code output</strong></p>` and a plain `<pre><code>`.
  - **With `callout`:** the unit becomes a `div[data-acf-gemini-code-run]`.
    - **What it holds:** the runs as JSON in a data attribute, each as `{ language, code, output }`.
    - **A unit straight after such a div** (ignoring whitespace) joins it instead of starting another.
- [ ] **TASK-7:** Add `codeRunCalloutRule()` to `turndownRules`. It writes each `div[data-acf-gemini-code-run]` as the callout shown above.
  - **The first line:** `> [!example]- Code Gemini ran`.
  - **Each run:**
    1. its code fence;
    2. when there's output, a `>` line, `> **Code output**`, a `>` line and the output fence;
    3. a `>` line between runs.
  - **Every line** is prefixed with `> `, and a line with nothing on it is just `>`.
  - **The fence:** three backticks, or one more than the longest run of backticks in its text.
  - **The block as a whole** is surrounded by blank lines, so it stands as a block.

### Tests

#### [NEW] `scratch/fixtures/gemini-code-execution.html`
- [ ] **TASK-8:** Add a synthetic Gemini chat with one finished reply, structured as inspected.
  - **The header:** the reply's header holds the **Show code** toggle.
  - **The reply's text, in order:**
    1. two runs in a row (Python, each with output), hidden as Gemini hides them;
    2. a heading and a paragraph;
    3. an ordinary JSON code block;
    4. a third run whose output is empty, whose code holds a line of three backticks;
    5. a closing paragraph.
  - **The toolbar:** with Copy.

#### [NEW] `scratch/test_gemini-code-execution.ts`
- [ ] **TASK-9:** Add a regression script covering the checks under Automated Tests.
  - **The existing Gemini scripts:** run them; their fixtures have no runs, so they must be unchanged.
  - **The suite:** run `pnpm test`.

## Verification Plan

### Automated Tests

`scratch/test_gemini-code-execution.ts` checks that:
1. **The default (callout):**
   - The two runs in a row become one `> [!example]- Code Gemini ran` callout before the heading. It holds both code fences (` ```python `) and both outputs under `**Code output**`, every line prefixed with `>`.
   - The third run is its own callout, with no **Code output** part, and its code fence uses four backticks.
   - The ordinary JSON block stays a plain ` ```json ` block outside any callout.
2. **The text around the callouts** is unchanged, and no "Show code", "Code output" header text or button labels leak into the copy.
3. **Code blocks:** each run is a fenced block followed by `**Code output**` and a plain fence. There are no callouts.
4. **Leave out:** no run, and no **Code output**, appear. The rest of the reply is intact.
5. **The setting's reach:** it applies through the controller to the reply button, to the Conversation copy, and to the native Copy override.
6. **The settings and options page:**
   - **The default:** Gemini's `code-execution` setting starts as `callout`.
   - **The options page:** Gemini's section shows the **Code Gemini ran** drop-down with its three choices.
7. **The shared change:** a conversion with no `choice` reader gets each choice's default, and other sites are unaffected.

**Regression:** `pnpm test` runs every existing script, which must pass, and `tsc --noEmit` must be clean.

### Manual Verification
1. Run `pnpm run build`, then click the reload icon on the extension in `chrome://extensions`, then reload a Gemini tab.
2. **The default:**
   1. Open a chat whose reply shows **Show code**, and leave the code folded.
   2. Click the reply's Copy as Markdown, and paste into an Obsidian note.
   3. A folded "Code Gemini ran" callout should appear where the code was. Expanding it should show the Python code and its output, both as code blocks.
3. **Code blocks:** in Options, set **Code Gemini ran** to **Code blocks** and copy again. The code and output should be plain code blocks, with no callout.
4. **Leave out:** set it to **Leave out** and copy again. No code Gemini ran should appear.
5. **The whole chat:** set it back to **Folded callout**, then copy the whole chat with **Conversation**. That reply's runs should be folded callouts there too.

## Visual design application

No `design-system.md` or `art-bible.md` exists for this product. The change adds only a drop-down, using the options page's existing layout for site drop-downs.
