---
status: approved
---

# Show the extension's messages next to the button that was clicked

The extension's short messages appear at the bottom center of the window, where they're easy to miss, especially on Search Assist, whose button is near the top of the page. They include the "still writing" message, conversion and clipboard errors, and "Copied as Markdown" from the overridden Copy button. This change shows each message just below the button that was clicked, or just above it when there's no room below, on every site.

**Related documents**
- [DuckDuckGo Search Assist walkthrough](../duckduckgo-search-assist/walkthrough.md)

## User Review Required

> [!IMPORTANT]
> **Where the message goes:**
> - **Which button:** the one that was clicked. That's **Copy as Markdown** for its own messages, and the site's own Copy button when the override is on.
> - **Below:** 8px under the button, with its left edge lined up with the button's left edge. It's kept at least 16px inside the window's left and right edges, so it never runs off screen.
> - **Above:** when there isn't room for it below, it goes 8px above the button instead.
> - **Fallback:** if the button can't be measured, for example because the site re-rendered it after the click, the message appears at the bottom center as it does today.

> [!NOTE]
> **It doesn't follow the page if you scroll** during the 4 seconds it shows. It's placed when it appears, and Copilot and Duck.ai scroll inside their own panels, so tracking the button would mean listening to each site's scroll container. Showing it for 4 seconds where you're already looking covers the reported problem.

> [!NOTE]
> **Nothing else changes:**
> - the wording;
> - the 4 seconds;
> - only one message at a time;
> - the dark style that reads on light and dark pages;
> - `role="status"` for screen readers.

## Open Questions

None at this time. Placement next to the button, rather than at the top center of the window, was chosen before this plan was written.

## Proposed Changes

### Content script

#### [MODIFY] `src/content/controller.ts`
- [x] **TASK-1:** Show messages next to their button.
  - `showToast(text, anchor?)` takes the element to place the message by. After adding the message to the page, it calls a new `placeToast(toast, anchor, view)`.
  - **`placeToast`:**
    - It measures the anchor with `getBoundingClientRect()`. A zero-size rectangle, or a missing or detached anchor, means it can't be measured, and the message keeps the bottom-center placement.
    - Otherwise it measures the message and sets fixed `top` and `left` coordinates: 8px below the anchor, or 8px above it when the message would come closer than 16px to the window's bottom edge.
    - `left` is the anchor's left edge, clamped to 16px inside each side of the window (`view.innerWidth`).
    - It adds the `acf-toast-anchored` class.
  - **Callers:**
    - `copy` passes its `button`, for the conversion and clipboard errors.
    - `onNativeCopyClick` passes the site's Copy button, for "Copied as Markdown" and the clipboard error.
  - The doc comments are updated to match.

#### [MODIFY] `src/content/content.css`
- [x] **TASK-2:** Split the placements.
  - `.acf-toast` keeps the look: colors, border, radius, shadow, font, max width and z-index.
  - The bottom-center position and its slide-up animation move to `.acf-toast:not(.acf-toast-anchored)`, so the fallback is unchanged.
  - `.acf-toast-anchored` uses the coordinates set by the script, with no transform, and a fade-in.
  - Reduced motion still turns the animations off.

### Tests

#### [NEW] `scratch/test_message-next-to-button.ts`
- [x] **TASK-3:** A regression script, picked up by `pnpm test`. See Automated Tests below.

## Verification Plan

### Automated Tests
`pnpm test` runs every `scratch/test_*.ts`. jsdom does no layout, so the script gives the button and the message fixed sizes and positions. The new `scratch/test_message-next-to-button.ts` checks:
1. **Below:** a message for a button in the middle of the window goes 8px below it, lined up with its left edge, with the `acf-toast-anchored` class.
2. **Above:** for a button near the bottom of the window, the message goes 8px above it.
3. **Inside the window:** for a button near the right edge, the message is moved left to stay 16px inside the window; near the left edge, it stays 16px in.
4. **Fallback:** with a zero-size or detached button, the message has no coordinates and no anchored class, so it stays at the bottom center.
5. **Through the controller, on the Search Assist fixture:**
   - Clicking Copy as Markdown on the module that's still writing places the "still writing" message by that button.
   - With the override on, a copy from Search Assist's Copy button places "Copied as Markdown" by Search Assist's Copy button.
6. **The style sheet:** the bottom-center placement applies only without `acf-toast-anchored`, and reduced motion still turns the animations off.

The existing scripts are re-run as regression checks; two of them look for the message's text. `tsc --noEmit` must pass after every item.

### Manual Verification
1. Run `pnpm run build` and reload the extension from `brave://extensions`.
2. **Search Assist:** press **More**, and click M↓ while it shows Stop. The "still writing" message should appear just below M↓.
3. **The override:** turn on **Use for _site_'s own Copy button**, and click the site's Copy button on Copilot or Duck.ai. "Copied as Markdown" should appear next to that Copy button.
4. **Near the bottom:** scroll so a reply's toolbar sits near the bottom of the window, and repeat step 3. The message should appear above the button.
5. Check that the message is readable in both light and dark themes.

## Visual design application
No `design-system.md` or `art-bible.md` exists for this product. The message keeps its current look; only its position changes.
