---
status: approved
---

# Copilot: put Copy as Markdown before the Copy button

On Copilot, the **Copy as Markdown** (M↓) button currently sits right after Copilot's Copy button. This moves it directly before Copy, so it comes first in the toolbar. That's where it is on Duck.ai, whose toolbar runs right to left, and the maintainer will use M↓ far more often than Copy.

**Related documents**
- [Duck.ai adapter plan](../duck-ai-adapter/implementation_plan.md)

## User Review Required

> [!IMPORTANT]
> **Release.** This ships in **0.4.0** together with the Duck.ai adapter. That release is done by the Duck.ai plan's TASK-9 once both plans' items are done and you've tested the build, so this plan has no release item of its own.

> [!NOTE]
> Copilot's Copy button is the first child of a flex row that runs left to right, followed by the feedback buttons. Inserting M↓ before it puts M↓ at the start of the row, to Copy's left. Nothing else about the button or the native Copy override changes.

## Open Questions

None at this time.

## Proposed Changes

### Copilot adapter

#### [MODIFY] `src/sites/copilot.ts`
- [x] **TASK-1:** Change `findButtonAnchor` to return `{ parent: copy.parentElement, before: copy }`, and update its comment: directly before the native Copy button, so M↓ comes first.

### Tests

#### [MODIFY] `scratch/test_ai-chat-formatter.ts`
- [x] **TASK-2:** Update the two placement checks:
  - The anchor's `before` is the native Copy button.
  - In the controller check, the injected button's next sibling is the Copy button, and it's the row's first child.

## Verification Plan

### Automated Tests
`npm test` runs every scratch script. The updated checks in `scratch/test_ai-chat-formatter.ts` confirm:
1. `copilotAdapter.findButtonAnchor` anchors in Copy's parent, before Copy.
2. With the controller running on the Copilot fixture, there is one button per reply, as the first element in the row, directly followed by the Copy button.

The other scripts must keep passing.

### Manual Verification
1. Run `npm run build`, reload the extension in `chrome://extensions`, and refresh Copilot.
2. Check that each finished reply shows M↓ immediately to the left of Copilot's Copy button, and that it still copies Markdown.
3. With **Use for Copilot's own Copy button** on, check that Copilot's Copy still copies Markdown.
