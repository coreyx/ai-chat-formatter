# Walkthrough: Copilot source details

Copilot replies now copy with every citation's page title and domain (`[Title](url) — domain`), including chips that group several sources (`photovault+1`), which 0.1.0 copied as bare domains. The sources Copilot lists under **More** but doesn't cite come along too. The closing section is laid out like Copilot's Sources panel: `## Sources`, `### Citations`, `### More`. The source list is read from three places in turn: Copilot's React state (through a page-world script), the conversation data embedded in the page at load, and, as a last resort for **Copy as Markdown**, the reply's Sources panel.

## What Was Implemented

### 1. Core
- **`src/core/types.ts`**: `SourceReference` (`url` or null, `title`, `domain`, `cited`). Optional adapter hooks:
  - `readReferences`: synchronous, used by both buttons.
  - `readReferencesSlowly`: asynchronous, Copy as Markdown only.
  - `hasUntitledCitations`: not in the original plan. It lets the controller skip the panel when it couldn't add anything.
  - `pageScript`.

  `ConversionContext` gained `findReference(url)`.
- **`src/core/citations.ts`**: `sourceDomain`; entries written as `[Title](url) — domain`, or just `[domain](url)` when the title is the domain, or `Title — domain` (escaped) when there's no URL. The More list leaves out cited and repeated sources. The closing section is `## Sources` → `### Citations` (footnote definitions or the numbered list) → `### More`, leaving out empty subsections.
- **`src/core/convert.ts`**: `convertMessage(adapter, message, options)` takes `{ style, includeMoreSources, isRuleEnabled, references }`. Gathering references is the caller's job, so conversion stays synchronous.
- **`src/core/settings.ts`**: per-site `includeMoreSources`. It defaults on for adapters that can read sources and is merged like the other settings. `canReadReferences(adapter)`.
- **`src/core/references-protocol.ts`**: the event name and attribute shared by the content script and the page script, kept separate so neither bundle pulls in the other.

### 2. Copilot
- **`src/page/copilot.ts`** (runs in the page's world): on `acf:request-references`, walks up to 20 React fiber levels from the reply for `memoizedProps.response.references` and writes a validated JSON copy to `data-acf-references`. It never throws into the page.
- **`src/sites/copilot.ts`**:
  - `readReferences` tries the page script, then `readPageDataReferences`. The latter reads `window.__staticRouterHydrationData` from its `<script>` text, decoding a JSON string inside `JSON.parse("…")` with a linear scan rather than a regex. It matches the reply's `data-message-id` to a `messageId`, and takes `targetLink`, `isCitedInResponse` and the title from `displayData.content`.
  - `readReferencesSlowly` clicks the reply's Sources button, polls up to 3 seconds for the panel, and pairs Citations entries with the chips' URLs by the chips' `index` position, checking domains. More entries get `url: null`. It closes the panel unless it was already open. A panel already showing the reply is read without a click; that refinement was added during implementation.
  - Chip titles come from the source list when present, otherwise 0.1.0's `aria-label` logic.

### 3. Extension
- **`scripts/build.mjs`**: bundles `src/page/<name>.ts` → `dist/page-<name>.js` and adds a `"world": "MAIN"` content-script entry for each adapter with a `pageScript`.
- **`src/content/controller.ts`**: Copy as Markdown gathers references, using the quick read, then the panel only when More sources is on or a chip lacks a title. The button is disabled and `aria-busy` while it waits, so a second click is ignored. The native override uses the quick read only. Readers that throw count as null.
- **`src/options/options.ts`**: an **Include "More" sources** toggle for sites that can read sources.

### 4. Tests and docs
- **`scripts/run-tests.mjs`**: `npm test` builds, then runs every `scratch/test_*.ts`.
- **`scratch/test_copilot-source-details.ts`** with fixtures `copilot-references.json`, `copilot-sources-panel.html` and `copilot-page-data.html`. The last is generated with the real double encoding rather than hand-escaped.
- **`README.md`**: the entry format, the Sources/Citations/More layout and its Reading-view caveat, the three places titles come from, the More toggle, limitations, `src/page/`, and the new adapter hooks.
- Literal invisible characters in source regexes and test strings were replaced by their `\u` escapes, with no change in behavior.

### Plan revision
After first testing, the approved plan was reopened, with Corey's agreement, and extended with TASK-13 to TASK-15:
- **TASK-13:** the panel-style layout, with More after Citations in every style. It had been before the footnote definitions.
- **TASK-14:** the load-time data source, so More entries keep their links when the page script fails.
- **TASK-15:** docs.

The test-expectation updates planned for TASK-15 were made in TASK-13 and TASK-14, whose verification depended on them.

## Verification & Test Results

### Automated Tests
`npm test` runs both scripts:
- `scratch/test_ai-chat-formatter.ts`: **38/38 passed.** Its expectations were updated for the new entry format and layout, and its leak check now reads only the reply body.
- `scratch/test_copilot-source-details.ts`: **30/30 passed.** It covers:
  - rendering in all three styles (entry format, title-equals-domain, unlinked entries, More filtering, Sources/Citations/More layout and empty subsections);
  - `convertMessage` with references;
  - settings defaults and merging;
  - the page script (fiber walk, 20-level limit, event round trip);
  - `parseReferencesAttribute`;
  - multi-source chip titles, with and without references;
  - the panel fallback (same-domain pairing by index, close-or-leave-open, already-open read, timeout, domain mismatch, no button, unlinked output);
  - the load-time data (fixture, unknown reply, no script, broken literal, bad `displayData.content`, linked More with no page script and no panel);
  - the controller (quick read skips the panel, waiting with busy-click protection, no needless fallback, override never uses the panel);
  - the options toggle;
  - the built manifest's `world: "MAIN"` entry.

`tsc --noEmit` passes.

Failures along the way, all fixed before their items were committed:
- A test expectation wrongly listed a source Copilot flags as cited under More.
- The Bash tool's heredoc collapsed `\\` and expanded `\u` escapes in a rewrite of `citations.ts`. The file was rewritten with the file tool and checked.
- One edit dropped a space in an expectation.

### Checked on the live site (a test conversation, no prompts sent)
- **The page script and the panel fallback**, injected as a bundle: the page script returned every visible reply's sources (6, 0 and 6), including both `github.com` citations and the More entries. The panel fallback paired correctly in about 0.7 seconds and closed the panel.
- **`readPageDataReferences`**, injected: the same titles, cited flags and full URLs as the React path for all three replies, in about 5 ms including parsing.
- **R3's missing flash, investigated:** with both quick sources blocked, the panel was added off-screen (`x=1624` in a 1512-pixel-wide window) and removed about 1.6 seconds later without ever coming into view. The fallback works, it's just invisible. The README wording was corrected.

## Manual Verification
Corey's results, 2026-10-24, with the extension reloaded:
- **R1 passed:** a footnotes copy of a reply with two same-domain citations reads `## Sources` → `### Citations` (two titled GitHub footnotes) → `### More` (four linked entries).
- **R2 passed:** with the page script blocked, no panel opened and the More entries kept their links (the load-time data).
- **R3 behaved correctly:** with the load-time data also removed, the More entries came through as `Title — domain` without links (the panel). No flash appeared, for the reason above.
- An earlier round, before the revision, confirmed titled citations and the More list. It also produced the feedback behind TASK-13 and TASK-14.

Not yet confirmed by hand:
1. Copy another reply with web citations and compare its three citations and three More entries with its Sources panel.
2. With both quick sources blocked as in R3, open the Sources panel on another reply first, then copy: the panel switches to this reply's sources and stays open.
3. Turn off **Include "More" sources** and copy: no `### More`.
4. Switch to **Inline links + Sources list**, then **Sources list only**, copying after each: `### Citations` holds the numbered list, and `### More` follows it.
5. With **Use for Copilot's own Copy button** on, Copilot's Copy gives the same output as M↓. With only the page script blocked (R2), it still has linked More entries from the load-time data. With both blocked (R3), it gives chip titles, no More section and no panel.
6. Send a new prompt, then block only the page script and copy the new reply. It isn't in the load-time data, so the panel fallback answers.

## Follow-ups
- **Reading view and footnotes:** Obsidian's Reading view gathers footnote definitions at the bottom of the note, so `### Citations` looks empty there under the footnotes style. That's Obsidian's rendering, documented in the README.
- **Back-to-back fallback copies:** copying a different reply within about a second of a panel-fallback copy can leave the panel open, since the closing panel still counts as "open". Cosmetic, and only on the panel path.
- **Internal data:** the React path and the load-time data are both undocumented Copilot internals. When they change, `src/page/copilot.ts` and `readPageDataReferences` are the places to update.
- **Microsoft 365 Copilot** still needs its own adapter.
