# Walkthrough: Show messages next to the button that was clicked

The extension's short messages used to appear at the bottom center of the window, where they were easy to miss. They now appear next to the button that was clicked: just below it, or just above it when there's no room below, and always inside the window. The messages include the "still writing" message, conversion and clipboard errors, and "Copied as Markdown" from the overridden Copy button. When the button can't be measured, a message still falls back to the bottom center.

## What Was Implemented

### 1. Content script
- **`src/content/controller.ts`:**
  - **`showToast(text, anchor?)`** takes the button that was clicked:
    - `copy` passes the Copy as Markdown button for its conversion and clipboard errors.
    - `onNativeCopyClick` passes the site's own Copy button for "Copied as Markdown" and its clipboard error.
  - **`placeToast(toast, anchor, view)`** (new, exported for the tests):
    - It gives up and leaves the bottom-center placement when the button is detached or measures zero by zero.
    - Otherwise it switches the message to the anchored style at the window's corner and measures it.
    - It places the message 8px below the button, lined up with its left edge, or 8px above it when below would come within 16px of the window's bottom. It keeps the message at least 16px inside the left and right edges, and 16px from the top.
- **`src/content/content.css`:**
  - **`.acf-toast`:** keeps the look.
  - **`.acf-toast:not(.acf-toast-anchored)`:** the bottom-center position and its slide-up animation.
  - **`.acf-toast-anchored`:** a fade-in, at the position the script sets.
  - **Reduced motion:** turns off both animations.

### Changes made during implementation
- **The message is measured in its new style** (`96aa13c`, part of TASK-2). At the bottom center its `left: 50%` caps its width at half the window, so measuring it there could give the wrong size. `placeToast` now switches it to the anchored style at the window's corner first.
- **Reduced motion names both selectors.** The bottom-center selector is more specific than `.acf-toast` alone, so the reduced-motion rule names both placements.
- **Tests:** the test script was started with TASK-1 and finished with TASK-3.

## Verification & Test Results

### Automated Tests
`pnpm test` runs `scratch/test_message-next-to-button.ts`: **8/8 passed.** jsdom does no layout, so the script gives the window, the button and the message fixed sizes and positions.
- **Below:** for a button at (300, 200), the message goes to top 240px and left 300px, marked anchored.
- **Above:** for a button at y 760 in an 800px window, the message goes to top 712px.
- **Inside the window:**
  - near the right edge, it moves to left 744px (1000 − 16 − 240);
  - near the left edge, it stays at 16px.
- **Fallback:** a zero-size or detached button leaves the message unplaced and unanchored.
- **Controller, on the Search Assist fixture:**
  - The still-writing message goes 8px below the Copy as Markdown button that was clicked.
  - With the override on, "Copied as Markdown" goes 8px below Search Assist's Copy button.
- **Style sheet** (the built `dist/content.css`):
  - The bottom-center position applies only without `acf-toast-anchored`.
  - The reduced-motion block turns off the animation for both selectors.

`tsc --noEmit` passes, and was run after every item.

### Regression Testing
Re-run after every item, under pnpm:
- `scratch/test_ai-chat-formatter.ts`: **38/38 passed.** It includes the "isn't fully loaded" message check.
- `scratch/test_block-reference-citations.ts`: **7/7 passed.**
- `scratch/test_copilot-source-details.ts`: **30/30 passed.**
- `scratch/test_copy-user-prompt.ts`: **33/33 passed.**
- `scratch/test_duck-ai-adapter.ts`: **20/20 passed.**
- `scratch/test_duckduckgo-search-assist.ts`: **22/22 passed.** It includes the "still writing" message check.
- `scratch/test_min-heading-level.ts`: **21/21 passed.**
- `scratch/test_pnpm-migration.ts`: **6/6 passed.**

## Manual Verification
Not yet done; these are for the maintainer, in Brave:
1. Run `pnpm run build` and reload the extension from `brave://extensions`.
2. **Search Assist:** press **More**, and click M↓ while it shows Stop. The "still writing" message should appear just below M↓.
3. **The override:** turn on **Use for _site_'s own Copy button**, and click the site's Copy button on Copilot or Duck.ai. "Copied as Markdown" should appear next to that Copy button.
4. **Near the bottom:** scroll so a reply's toolbar sits near the bottom of the window, and repeat step 3. The message should appear above the button.
5. Check that the message is readable in both light and dark themes.

## Follow-ups
- **The message doesn't follow the button** if the page scrolls during its 4 seconds. This was accepted in the plan.
- The manual checks above, before any release.
