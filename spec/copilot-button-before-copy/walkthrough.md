# Walkthrough: Copilot button order

On Copilot, the **Copy as Markdown** (M↓) button now sits directly before Copilot's Copy button, first in the toolbar row, as it does on Duck.ai. It ships in 0.4.0 with the Duck.ai adapter.

## What Was Implemented

### 1. Copilot adapter
- **`src/sites/copilot.ts`**: `findButtonAnchor` now returns `{ parent: copy.parentElement, before: copy }`, which inserts the button ahead of Copy rather than after it. The comment says why: M↓ is the button used most.

### 2. Tests
- **`scratch/test_ai-chat-formatter.ts`**: the anchor check expects `before` to be the Copy button. The controller check expects the injected button to be the row's first child, followed directly by Copy.

TASK-1 and TASK-2 were committed together, because the placement checks fail as soon as the anchor moves and every commit's tests should pass.

## Verification & Test Results

### Automated Tests
`npm test`:
- `scratch/test_ai-chat-formatter.ts`: **38/38 passed**, including the two updated placement checks. Before they were updated, both failed against the new anchor, as expected.

### Regression Testing
- `scratch/test_block-reference-citations.ts`: **7/7 passed.**
- `scratch/test_copilot-source-details.ts`: **30/30 passed.**
- `scratch/test_duck-ai-adapter.ts`: **20/20 passed.**

`tsc --noEmit` passes.

## Manual Verification
The maintainer's result, 2026-10-24: after reloading the extension and refreshing Copilot, M↓ shows immediately to the left of Copilot's Copy button and copies Markdown.

To repeat it:
1. Run `npm run build`, reload the extension in `chrome://extensions`, and refresh Copilot.
2. Check that each finished reply shows M↓ immediately to the left of Copy, and that it copies Markdown.
3. With **Use for Copilot's own Copy button** on, check that Copy still copies Markdown.

## Follow-ups
None.
