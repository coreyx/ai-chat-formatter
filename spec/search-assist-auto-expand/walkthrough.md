# Walkthrough: Search Assist presses More and expands Explore More automatically

Search Assist has two new options, both off by default:
- **Press More automatically** expands a collapsed answer, then presses **More**.
- **Expand Explore More questions automatically** opens each Explore More question once More has finished.

A **Click pacing** drop-down (Unhurried, Brisk or Random) sets the randomized pauses between the clicks. Underneath, a site can now declare drop-down settings and an automation hook.

## What Was Implemented

### 1. Core
- **`src/core/types.ts`:**
  - **`SiteChoice`:** a drop-down setting with `values`, a `defaultValue`, and `requiresAny`, the options it serves.
  - **`SiteAutomation`:** `isOptionEnabled`, `choice`, `sleep`, `random`, `isPageVisible`.
  - **`SiteAdapter.choices` and `SiteAdapter.automate`.**
- **`src/core/settings.ts`:**
  - `SiteSettings.choices` holds each choice's value.
  - `mergeSettings` takes an optional `adapters` argument, so a stored value must be one the choice offers. `loadSettings` and `onSettingsChanged` pass it.
- **`src/content/controller.ts`:**
  - `ControllerEnvironment` gains optional `sleep`, `random` and `isPageVisible`. Their defaults are `setTimeout`, `Math.random` and `visibilityState`.
  - `sync()` calls `adapter.automate` for every message while the site is active, before the button logic, so it runs with the button hidden too.
  - The `SiteAutomation` reads the settings at each call. Switching an option, the site or the extension off stops the automation before its next step.

### 2. Search Assist
- **`src/sites/duckduckgo-markup.ts` (new):**
  - The selectors and helpers shared by the copy and the automation, moved from `duckduckgo.ts`.
  - Two selectors from the inspection: `MORE_PILL_SELECTOR` and `EXPAND_BUTTON_SELECTOR`.
  - `findExploreMoreQuestions(root)`, which `extractExploreMore` now uses.
- **`src/sites/duckduckgo-automation.ts` (new):** `automateSearchAssist`, `PACING` and the option and choice ids.
  - **State:** a per-module `WeakMap` records whether More was pressed, whether a run is underway, and which question buttons were handled.
  - **Pressing More:** waits for the page to be showing, then takes the first pause. It clicks **Expand content** if it's there, and takes a between-clicks pause. It then waits up to 3 s for the More button and clicks it. Before each click it checks the option is still on and that More hasn't been pressed meanwhile.
  - **Expanding Explore More:** starts once Stop is gone and an unhandled question exists, with the first pause.
    - For each question in order, one already open is only recorded. A closed one is clicked once the page is showing and the option is still on.
    - With Unhurried or Brisk, its answer gets up to 10 s to load, polled every 200 ms.
    - A between-clicks pause comes before the next question.
    - Handled questions are never clicked again.
- **`src/sites/duckduckgo.ts`:** declares `auto-more`, `auto-explore-more` and the `automation-pacing` choice, and sets `automate: automateSearchAssist`.

### 3. Options page (`src/options/options.ts`)
- **The drop-down:** each choice is a labelled drop-down named `<site>.choices.<id>`, after the site's option checkboxes and before **Include "More" sources**.
- **Greying out:** it's disabled while none of its `requiresAny` options is on.

### 4. Docs
- **README:**
  - a "Clicking for you" section under Search Assist, with the pacing table;
  - the settings list;
  - `choices` and `automate` under Adding a site;
  - the test script in the development tree.

### Changes made during implementation
- **`mergeSettings` gained an `adapters` argument** (TASK-2). The plan said stored choice values are checked against the offered values, but the default settings it received don't list them. Without the argument, any string is kept, as before.
- **Existing checks updated in the task that changed their output:**
  - TASK-2: the whole-settings checks in `test_ai-chat-formatter.ts` gained `choices: {}`.
  - TASK-6: four checks in `test_search-assist-explore-more.ts` that list Search Assist's options now include the two new ones.
  - The plan expected `test_search-assist-explore-more.ts` to need `choices` added, but its settings checks compare only `options`, so it didn't.
- **The test script was started in TASK-3** and grew with each later task.

## Verification & Test Results

### Automated Tests
`pnpm test` runs `scratch/test_search-assist-auto-expand.ts`: **21/21 passed.** It uses a fake clock (each pause is recorded and resolves at once), a fixed `random()`, and click handlers standing in for Search Assist.
1. **Hook:**
   - `automate` runs for every message with the button hidden, reading the site's options and choices.
   - It isn't called while the site or the extension is off.
   - A running automation sees an option switch off.
   - `sleep`, `random` and visibility come from the environment.
2. **Off by default:** nothing is clicked or waited on, directly or through the controller.
3. **Pressing More:**
   - The exact sequence is `sleep 1750, click expand, sleep 2750, click more`, for Unhurried at `random() = 0.5`.
   - It happens once over many page checks, and not when the extended answer is already there.
   - It waits for a More button that appears late, polling every 200 ms.
   - Through the controller: expand, then More, once.
4. **Expanding Explore More:**
   - Exact sequences:
     - Unhurried: `sleep 1750, click q2, sleep 200, sleep 2750, click q3, sleep 200`, skipping the already-open q1;
     - Brisk: the same with 1000 ms pauses;
     - Random: `sleep 1250, click q2, sleep 1250, click q3`, without waiting for answers.
   - The pauses are at each range's ends when `random()` is 0 or just under 1.
5. **Respecting the user and stopping:**
   - Nothing happens while Stop shows; it starts once Stop is gone.
   - A question the user closes stays closed.
   - Turning the option off mid-run stops before the next click.
   - A hidden page holds everything until it's showing, then the first pause starts.
6. **The copy:** through the controller, the questions open and Copy as Markdown has every answer under Explore More.
7. **Settings:**
   - Defaults are off, off, Unhurried.
   - A stored pacing is kept. One that isn't offered, or isn't a string, falls back, and unknown choices are dropped.
   - Copilot and Duck.ai have no choices.
8. **Options page:**
   - The order is the two checkboxes, then Click pacing, then More sources.
   - The three labels, the stored value and the labelled heading are shown.
   - It's disabled while both options are off, and enabled by either.
   - A change is reported.

I also checked that the tests can fail. With Unhurried set not to wait for answers, its check failed, and passed again once restored. `tsc --noEmit` passed after every item.

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
- `test_search-assist-explore-more.ts`: **31/31**

The Search Assist and Explore More scripts passed unchanged after the markup move in TASK-4.

## Manual Verification
Not yet run. These steps are for the maintainer, in Brave:
1. Run `pnpm run build` and reload the extension from `brave://extensions`.
2. On the options page, check that **Click pacing** is greyed out. Turn on **Expand Explore More questions automatically**; it should become available, set to **Unhurried**.
3. Search for something that brings up Search Assist. Press **More** yourself. Once **Stop** is gone, the Explore More questions should open one at a time, a few seconds apart. Copy, and check that every answer is in the copy.
4. Close one of the opened questions. It should stay closed.
5. Turn on **Press More automatically** and search again. After a moment, the answer should expand, More should be pressed, and once it finishes, the questions should open.
6. Set **Click pacing** to **Brisk**, then to **Random**, and search again each time. The clicks should come faster.
7. Open a search in a background tab (Ctrl+click a link to a search). Nothing should happen until you switch to the tab.
8. Turn both options off and search again. Nothing should be clicked.

## Follow-ups
- **Two clicks for More:** the More button only appears once the answer is expanded. Pressing More automatically therefore also expands a collapsed answer, which stays expanded on the page.
- **Navigating within the results page:** if DuckDuckGo replaces Search Assist's module in place on a new search, without a page load, the new module is new to the automation and acts once more. Whether it does that wasn't inspected.
- **More that never finishes:** if More's writing stops partway, Explore More's automation waits as long as **Stop** shows.
