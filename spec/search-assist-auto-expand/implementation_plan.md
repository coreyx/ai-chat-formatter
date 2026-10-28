---
status: approved
---

# Search Assist: press More and expand Explore More automatically

Adds two Search Assist options, both off by default, that do the clicking a copy needs:
- **Press More automatically:** expands a collapsed answer, then presses **More**.
- **Expand Explore More questions automatically:** opens each Explore More question as soon as Explore More appears.

A third setting, **Click pacing**, chooses how the clicks are spaced: Unhurried (the default), Brisk, or Random without waiting for answers. Each pause is randomized, the way a person would click.

**Related documents**
- [Search Assist Explore More plan](../search-assist-explore-more/implementation_plan.md)
- [Search Assist Explore More walkthrough](../search-assist-explore-more/walkthrough.md)

## User Review Required

> [!IMPORTANT]
> **What the automation does on the page.** With an option on, the extension clicks Search Assist's own buttons on every search where Search Assist answers, whether or not you copy anything:
> - **Press More automatically:** each search gets its extended answer written. That's an extra AI answer from DuckDuckGo every time, and about 13 seconds of writing in the inspection.
> - **Expand Explore More questions automatically:** each question opened loads its own answer from DuckDuckGo, three per search in the inspection.
>
> The clicks are ordinary clicks on the page's buttons, one at a time, with randomized pauses. The pauses keep the pace like a person's and avoid sending a burst of requests. They don't hide anything: DuckDuckGo sees the same requests as if you had clicked.

> [!IMPORTANT]
> **When it acts, and when it doesn't:**
> - **Only once per answer:**
>   - More is pressed once per Search Assist answer.
>   - Each question is opened once. A question you close stays closed, and one you've already opened is left alone.
>   - If you press More yourself first, nothing more happens.
> - **Only while the tab is visible:** a search opened in a background tab waits until you switch to it, then starts with the first pause.
> - **Turning an option off stops it** before its next click.
> - **Explore More waits for More to finish:** it starts after **Stop** is gone. In the inspection, the questions appeared about 1.5 seconds before More finished writing.
> - **Independent of the Explore More copy option:** expanding works whether or not **Include expanded Explore More answers** is on, since you may want the answers open just to read them.
> - **Copying during the automation** copies whatever is open at that moment, as now.

> [!NOTE]
> **Click pacing.** Each range is a random pause, picked fresh for each click:
>
> | Choice | Before the first click | Waits for each answer to load | Between clicks |
> |---|---|---|---|
> | **Unhurried** (default) | 1–2.5 s | Yes, up to 10 s | 1.5–4 s |
> | **Brisk** | 0.5–1.5 s | Yes, up to 10 s | 0.5–1.5 s |
> | **Random, without waiting for answers** | 0.5–2 s | No | 0.5–2 s |
>
> - **Pressing More** takes two clicks when the answer is collapsed. **Expand content** comes after the first pause, then **More** after a between-clicks pause.
> - **Waiting for More** doesn't count as waiting for an answer. Every choice waits for More to finish before opening questions.
> - **The setting** is a drop-down in Search Assist's section of the options page. It's greyed out while both automatic options are off.

> [!NOTE]
> **From a live inspection on 2026-10-27,** on a neutral search, recording structure only:
> - **More:** while collapsed, the answer shows **Expand content** (`button[aria-label="Expand content"]`) and no More button. After it's clicked, the More button appears: `button[data-testid="duckassist-stream-more-pill"][aria-label="More"]`.
> - **Writing:** pressing More shows **Stop** for about 13 seconds, then the button disappears.
> - **Questions:**
>   - A scripted `click()` on an Explore More question opens it: `aria-expanded` becomes `true`.
>   - Its answer was in the panel within 0.1 seconds, complete rather than streamed.

> [!NOTE]
> **Under the hood:**
> - **Choice settings:** sites can now declare a choice setting (a drop-down) as well as on/off options. It's stored per site, like the options.
> - **An automation hook:** sites gain an `automate` hook. The controller calls it on each page check, whether or not the Copy as Markdown button is shown.
> - **Code layout:** Search Assist's selectors and question finder move to a shared module, so the copy and the automation use the same ones.
> - **Copilot and Duck.ai** declare neither, so nothing changes for them.

## Open Questions

None at this time. The trigger (as soon as Explore More appears), the separate More option and the three pacing choices were decided before this plan was written.

## Proposed Changes

### Core

#### [MODIFY] `src/core/types.ts`
- [x] **TASK-1:** Add choice settings and the automation hook.
  - **`SiteChoice`:** `{ id, name, description, defaultValue: string, values: { value: string; label: string }[], requiresAny?: string[] }`, documented. `requiresAny` lists options of the same adapter; the choice is greyed out on the options page while none of them is on.
  - **`SiteAdapter.choices?: SiteChoice[]`.**
  - **`SiteAutomation`:** what an adapter's automation can call.
    - `isOptionEnabled(id)` and `choice(id)` read the current settings each time they're called, so a change applies before the next click.
    - `sleep(ms): Promise<void>`.
    - `random(): number`, in [0, 1).
    - `isPageVisible(): boolean`.
  - **`SiteAdapter.automate?(message: Element, automation: SiteAutomation): void`:** called on every page check for each message while the site is enabled. It must return at once and keep its own state, since it's called often.

#### [MODIFY] `src/core/settings.ts`
- [x] **TASK-2:** Store choices per site.
  - **`SiteSettings.choices: Record<string, string>`**, from each adapter's `choices` defaults.
  - **`mergeSettings`** keeps a stored value only when it's one of the choice's `values`, and drops unknown choices. Settings saved before this load with the defaults.

### Content script

#### [MODIFY] `src/content/controller.ts`
- [ ] **TASK-3:** Run the adapter's automation.
  - **Environment:** `ControllerEnvironment` gains optional `sleep`, `random` and `isPageVisible`. The live page uses `setTimeout`, `Math.random` and `document.visibilityState === "visible"`; tests pass their own.
  - **`sync()`:** while the site is active (extension and site switches on), call `adapter.automate(message, automation)` for every message. This happens before the button logic, so it runs even when the button is hidden.
  - **The `SiteAutomation`:**
    - `isOptionEnabled` and `choice` read `this.settings` when called, falling back to the adapter's defaults.
    - Both report off, or the default, while the site or the extension is switched off.

### Search Assist

#### [NEW] `src/sites/duckduckgo-markup.ts`
- [ ] **TASK-4:** Move Search Assist's shared markup knowledge out of `duckduckgo.ts`, unchanged, so the copy and the automation share one copy.
  - **Selectors:** `ANSWER_SELECTOR`, `EXPANDED_ANSWER_SELECTOR`, `WRITING_PILL_SELECTOR`, `QUESTION_BUTTON_SELECTOR`, plus two new ones from the inspection:
    - `EXPAND_BUTTON_SELECTOR` (`button[aria-label="Expand content"]`);
    - `MORE_PILL_SELECTOR` (`[data-testid="duckassist-stream-more-pill"][aria-label="More"]`).
  - **Helpers:**
    - `findById`.
    - A new `findExploreMoreQuestions(root)`: the `{ button, panel }` list `extractExploreMore` builds today. These are question buttons outside the answers whose panel is inside `root`.
  - **In `duckduckgo.ts`:** these are imported, and `extractExploreMore` uses `findExploreMoreQuestions`. Copy output is unchanged, and the existing tests show it.

#### [NEW] `src/sites/duckduckgo-automation.ts`
- [ ] **TASK-5:** `automateSearchAssist(message, automation)`, with the pacing table above as `PACING`, keyed by the choice values `unhurried`, `brisk` and `random`.
  - **State:** kept per module in a `WeakMap`: whether More was pressed, whether a run is underway, and a `WeakSet` of the question buttons already handled.
  - **Pressing More**, when `auto-more` is on, the module has neither an extended answer nor a Stop button, and More hasn't been pressed for it:
    1. Mark it pressed, then pause for the first-click range.
    2. If **Expand content** is there, click it, then pause for a between-clicks range.
    3. Wait for the More button, polling every 200 ms for up to 3 s, and click it.
    - Before each click, the option is checked again and the page must be visible; a hidden page is waited out.
    - If the More button doesn't appear, it gives up for this module.
    - It doesn't press More if the user already has.
  - **Expanding Explore More**, when `auto-explore-more` is on, there's no Stop button, `findExploreMoreQuestions` finds questions, and no run is underway:
    1. Pause for the first-click range.
    2. For each question in order that isn't handled yet:
       - mark it handled;
       - skip it if it's already open;
       - otherwise click it, once the option is still on and the page is visible.
    3. With a waiting pacing, poll its panel every 200 ms until it has text, for up to 10 s.
    4. Pause for a between-clicks range before the next question.
    - A later page check starts a new run only if an unhandled question appears.
  - **Pauses:** `min + random() × (max − min)`, rounded to whole milliseconds.

#### [MODIFY] `src/sites/duckduckgo.ts`
- [ ] **TASK-6:** Declare the options and the choice, and hook up the automation.
  - **`auto-more`:** "Press More automatically", off by default. Description: "Expands the answer and presses More for you, so the extended answer is written without a click. DuckDuckGo writes it on every search where Search Assist answers."
  - **`auto-explore-more`:** "Expand Explore More questions automatically", off by default. Description: "Opens each Explore More question once Explore More appears, one at a time, pausing between them. A question you close stays closed."
  - **The `automation-pacing` choice:** "Click pacing", default `unhurried`, with `requiresAny: ["auto-more", "auto-explore-more"]`. Its values:
    - `unhurried`: "Unhurried: pauses of 1.5–4 s, waiting for each answer";
    - `brisk`: "Brisk: pauses of 0.5–1.5 s, waiting for each answer";
    - `random`: "Random: pauses of 0.5–2 s, without waiting for answers".
  - **Description:** "How the automatic clicks are spaced. Each pause is random, within the range shown."
  - **The hook:** `automate: automateSearchAssist`.

### Options page

#### [MODIFY] `src/options/options.ts`
- [ ] **TASK-7:** Show each adapter choice as a drop-down named `<site>.choices.<id>`, with its label and description, using `labelledField`. It goes after the site's option checkboxes and before **Include "More" sources**.
  - **Greying out:** it's disabled while none of its `requiresAny` options is on, and updates as soon as one is toggled.
  - **`fill`:** shows the stored value.

### Tests

#### [NEW] `scratch/test_search-assist-auto-expand.ts`, and [MODIFY] existing checks
- [ ] **TASK-8:** A regression script, picked up by `pnpm test`. See Automated Tests below.
  - **Updated checks:** the whole-settings checks in `scratch/test_ai-chat-formatter.ts` and `scratch/test_search-assist-explore-more.ts`, which gain `choices`.
  - **README:** the development tree gains the new script.

## Verification Plan

### Automated Tests
`pnpm test` runs every `scratch/test_*.ts`.

**The test setup:**
- **Fixture:** `scratch/test_search-assist-auto-expand.ts` drives the fixture through the controller.
- **Fake clock:** `sleep` records each pause and resolves at once, and `random` is fixed.
- **Simulated page:** click handlers stand in for Search Assist.
  - **Expand content** adds the More button.
  - **More** shows **Stop**, then the extended answer and Explore More.
  - Each question fills its panel after a set number of polls.

**The checks:**
1. **Off by default:** with default settings, no button is clicked and nothing is waited on.
2. **Pressing More:**
   - On a collapsed answer, **Expand content** is clicked, then **More**, after a first-click pause and a between-clicks pause in the chosen pacing's ranges.
   - This happens only once, even over many page checks.
   - It doesn't happen when the extended answer is already there or **Stop** is showing.
3. **Expanding Explore More:**
   - The questions open in order, one at a time, only after **Stop** is gone.
   - With Unhurried or Brisk, each next click waits until the previous panel has text.
   - With Random, clicks don't wait for answers.
   - The pauses fall in each choice's ranges.
4. **Respecting the user:**
   - A question already open isn't clicked.
   - A question closed after the automation opened it isn't reopened on later page checks.
5. **Stopping:**
   - Turning the option off mid-run stops before the next click.
   - Switching the site or the extension off does the same.
   - Hiding the page holds the next click until it's visible again.
6. **The copy:** after the automation, Copy as Markdown includes every expanded answer under Explore More.
7. **Settings:**
   - The two options default to off and the pacing to `unhurried`.
   - A stored value outside the choices falls back to the default, and unknown choices are dropped.
   - Copilot and Duck.ai have no choices.
8. **Options page:**
   - Search Assist shows the two checkboxes and the pacing drop-down with its three choices and the stored value, and reports changes.
   - The drop-down is disabled while both options are off, and enabled when either is on.
9. **Unchanged copy:** the Search Assist and Explore More scripts still pass after the markup module move.

The existing scripts are re-run as regression checks, and `tsc --noEmit` must pass after every item.

### Manual Verification
1. Run `pnpm run build` and reload the extension from `brave://extensions`.
2. On the options page, check that **Click pacing** is greyed out. Turn on **Expand Explore More questions automatically**; it should become available, set to **Unhurried**.
3. Search for something that brings up Search Assist. Press **More** yourself. Once **Stop** is gone, the Explore More questions should open one at a time, a few seconds apart. Copy, and check that every answer is in the copy.
4. Close one of the opened questions. It should stay closed.
5. Turn on **Press More automatically** and search again. After a moment, the answer should expand, More should be pressed, and once it finishes, the questions should open.
6. Set **Click pacing** to **Brisk**, then to **Random**, and search again each time. The clicks should come faster.
7. Open a search in a background tab (Ctrl+click a link to a search). Nothing should happen until you switch to the tab.
8. Turn both options off and search again. Nothing should be clicked.

## Visual design application
No `design-system.md` or `art-bible.md` exists for this product. The new checkboxes and the drop-down reuse the options page's existing styles, and the greyed-out state reuses the one **Minimum heading level** has.
