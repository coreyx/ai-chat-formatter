---
status: approved
---

# DuckDuckGo Search Assist adapter: Copy as Markdown with its sources

Adds Search Assist, the AI answer at the top of DuckDuckGo's search results, as the third supported site. It gets the **Copy as Markdown** button and the optional Copy-button override. The copy holds the whole short answer, whether the box is collapsed or expanded, and the extended answer too once **More** has been pressed. Each inline source chip (favicon and domain) becomes a citation titled with its page title. Search Assist's own Copy button drops every source.

**Related documents**
- [Duck.ai adapter plan](../duck-ai-adapter/implementation_plan.md)
- [Copilot source details plan](../copilot-source-details/implementation_plan.md)

## User Review Required

> [!IMPORTANT]
> **Where the extension runs: every `https://duckduckgo.com/*` page.** Search Assist only shows on some searches, so the content script and the page script load on every DuckDuckGo search page. They do nothing until a Search Assist answer is there. Loading the new build unpacked (as the README describes) applies this without a prompt. The extension's host list gains `duckduckgo.com`.

> [!IMPORTANT]
> **What gets copied:**
> - **Collapsed or expanded:** collapsing only clips the box to 80px. The whole short answer is in the page either way, so both states copy the same full short answer. Nothing is clicked open.
> - **After More:** the extended answer follows the short one in the copy. Before More is pressed it isn't included, even though DuckDuckGo already has it in its page data. The copy matches what's on screen.
> - **While More is still writing** (its button shows **Stop**): **Copy as Markdown** shows "Search Assist is still writing its answer. Copy again once it's finished." and copies nothing. With the Copy-button override on, Search Assist's own copy runs instead, as with any reply that can't be converted.
> - **Left out:** the toolbar, the More/Stop button, the "Ask Duck.ai" box, follow-up questions, the feedback row and the settings strip.

> [!IMPORTANT]
> **Sources:**
> - **Chips → citations.** Each chip becomes a citation in the chosen style, titled with the page title shown in the chip's hover tooltip: `[Title](url) — domain`. The title comes from Search Assist's React data through a small page script, as on Copilot and Duck.ai. If that can't be read, the chip's domain stands in.
> - **More, off by default.** Search Assist's data also lists every page it consulted (5 to 7 in testing). Most of them aren't shown on the page and have no titles. With **Include "More" sources** turned on for this site, the ones no chip cites go under `### More` as `[domain](url)`. The setting starts **off** for this site only; Copilot and Duck.ai keep it on.

> [!NOTE]
> **Options page wording.** The **Include "More" sources** description is now set per site, since each site's More comes from a different place:
> - Copilot: unchanged.
> - Duck.ai: now says Read More cards rather than "its Sources panel", which was wrong for Duck.ai.
> - Search Assist: describes the consulted pages.
>
> Saved settings are kept. A user who never saved Duck.ai or Copilot settings sees no change in behavior.

> [!NOTE]
> **Shared code moves, with no change in behavior:**
> - Duck.ai's Streamdown handling (bold spans and code blocks) moves to `src/sites/streamdown.ts`, because Search Assist renders with the same Streamdown markup.
> - Copilot's `parseReferencesAttribute` moves to `src/core/citations.ts`, because the new page script uses the same handshake.
>
> The existing tests cover both.

> [!NOTE]
> **Built from a live inspection.** Everything below comes from duckduckgo.com in Brave on 2026-10-24, using neutral test searches. Only structure was recorded. The class names are generated, so the adapter uses `data-*` attributes, ARIA attributes and tag structure. The fixture and tests use synthetic `*.example` content.
> - **Module:** `[data-react-module-id="wikinlp"]`, inside `li[data-layout="wikinlp"]` in the results list (`section[data-testid="mainline"]`).
> - **Toolbar:** buttons with `aria-label` `Copy to clipboard`, `Share link`, `Learn more about Search Assist and Explore More` and `Change Search Assist settings`. The native Copy writes through `execCommand("copy")` and `clipboard.write` (text/plain and text/html), with no sources.
> - **Short answer:** `[data-testid="duckassist-answer-content"] [data-dark-theme]`. It holds a `div` of Streamdown paragraphs (bold is `span[data-streamdown="strong"]`), then a `span` of chips.
> - **Chip:** `span[tabindex][aria-describedby] > a[data-handled-by-react][target="_self"]`, holding a favicon `img` and nested `span`s with the domain. The `href` is the source page itself. The hover tooltip (`role` element named by `aria-describedby`) shows the page title, but it's only in the page while hovered.
> - **Wrapper:** the short answer's parent `div` holds the short answer, then a `div` with the extended answer.
>   - Collapsed, that second `div` holds the `Expand content` button.
>   - Expanded, it holds the More pill (`button[data-testid="duckassist-stream-more-pill"]`, `aria-label` `More`, then `Stop` while writing; it disappears when finished) and the Duck.ai ask box (`[data-testid="ask"]`).
> - **Extended answer:** `[data-testid="duckassist-expanded-answer-content"][data-dark-theme]`, with Streamdown headings, tables, ordered and unordered lists, and bold. No chips or links were seen in it, but the adapter handles chips there too.
> - **React data:** walking up from the short answer's fiber to `memoizedProps.item.data.data`, which holds:
>   - `sources` (the chips' sources, in chip order), each `{ article: { link, site, text } }`, where `text` is the page title;
>   - `all_source_urls`, every consulted URL;
>   - `answer` and `expanded_answer` as Markdown;
>   - `more_questions`, which is not used.

## Open Questions

None at this time.

## Proposed Changes

### Shared code

#### [NEW] `src/sites/streamdown.ts`
- [x] **TASK-1:** Move Duck.ai's Streamdown helpers here:
  - `duckAiLanguageId` becomes `streamdownLanguageId`;
  - `rewriteDuckAiCodeBlocks` becomes `rewriteStreamdownCodeBlocks`;
  - `rewriteDuckAiStrong` becomes `rewriteStreamdownStrong`.

  Each keeps its doc comment, reworded to say any Streamdown site rather than Duck.ai. `src/sites/duckai.ts` imports them and keeps `export const duckAiLanguageId = streamdownLanguageId`, so its test is unchanged.

#### [MODIFY] `src/core/citations.ts`, `src/sites/copilot.ts`
- [x] **TASK-2:** Move `parseReferencesAttribute` from `src/sites/copilot.ts` to `src/core/citations.ts`, unchanged. Reword its doc comment to say "sources the site itself hides". `copilot.ts` imports it and re-exports it, so `scratch/test_copilot-source-details.ts` keeps its import.

#### [MODIFY] `src/core/types.ts`, `src/core/settings.ts`, `src/options/options.ts`, `src/sites/duckai.ts`
- [x] **TASK-3:** Let each adapter set its More sources default and description:
  - **`SiteAdapter`:** add an optional `moreSources?: { defaultEnabled: boolean; description: string }`, documented as applying only when the adapter can read references.
  - **`buildDefaultSettings`:** sets `includeMoreSources` to `canReadReferences(adapter) && (adapter.moreSources?.defaultEnabled ?? true)`.
  - **The options page:** uses `adapter.moreSources?.description`, falling back to today's text.
  - **`duckAiAdapter`:** gets `moreSources: { defaultEnabled: true, description: "Adds the Read More cards that the reply doesn't cite." }`.
  - **Copilot:** unchanged.

### Search Assist page script

#### [NEW] `src/page/duckduckgo.ts`
- [x] **TASK-4:** Add `extractSearchAssistReferences(module: Element): RawReference[] | null`, with a header comment naming the inspection date.
  1. From the module's `[data-testid="duckassist-answer-content"]`, find the `__reactFiber$` key and walk up to `MAX_LEVELS = 40` fibers to the first `memoizedProps.item.data.data` whose `sources` is an array.
  2. Return, in order:
     - each `sources[i].article` as `{ url: link, title: text, cited: true, hidden: false }`;
     - then each `all_source_urls` entry whose normalized URL isn't already listed, as `{ url, title: "", cited: false, hidden: false }`.
  3. Drop non-http(s) URLs. Return null when there's no fiber or no data.

  Add `installSearchAssistPageScript(document)` as well. On `REFERENCES_EVENT`, it writes the list as JSON to `REFERENCES_ATTRIBUTE` on the event's target module, or removes the attribute when there's nothing. It's wrapped in try/catch, like the other page scripts, and installed once when loaded in a window.

### Search Assist adapter

#### [NEW] `src/sites/duckduckgo.ts`
- [x] **TASK-5:** Add `duckDuckGoAdapter: SiteAdapter`, with a header comment naming the inspection date:
  - `id: "duckduckgo"` and `name: "DuckDuckGo Search Assist"`.
  - `matches: ["https://duckduckgo.com/*"]`.
  - `messageSelector: '[data-react-module-id="wikinlp"]:has([data-testid="duckassist-answer-content"])'`.
  - `contentSelector: 'div:has(> [data-testid="duckassist-answer-content"])'`: the wrapper holding both answers.
  - `nativeCopyButtonSelector: 'button[aria-label="Copy to clipboard"]'`.
  - `findButtonAnchor` returns `{ parent: copy.parentElement, before: copy }`, putting M↓ first in the toolbar as on Copilot and Duck.ai. It returns null when there's no Copy button or no short answer yet.
  - `stripSelectors: []`, since the preprocess step keeps only the answers.
  - `rules: [invisibleCharactersRule, collapseBlankLinesRule]`.
  - `pageScript: "duckduckgo"`.
  - `moreSources: { defaultEnabled: false, description: "Adds the other pages Search Assist consulted but doesn't show, as links without titles." }`.
- [ ] **TASK-6:** Add `preprocessSearchAssist(root)`, in this order:
  1. If `root` holds `[data-testid="duckassist-stream-more-pill"][aria-label="Stop"]`, throw `ConversionError("Search Assist is still writing its answer. Copy again once it's finished.")`.
  2. Replace `root`'s children with just its `[data-testid="duckassist-answer-content"]` and, when present, `[data-testid="duckassist-expanded-answer-content"]`, in that order. This drops the More pill, the ask box, the Expand button and anything DuckDuckGo adds there later.
  3. Run `rewriteStreamdownCodeBlocks` and `rewriteStreamdownStrong`.
- [ ] **TASK-7:** Add the chip rule and the reference reader:
  - **`isSearchAssistChip(node)`:** an `A` whose `href` is http(s), whose parent is a `span[tabindex]`, and which contains an `img`.
  - **The `searchAssistChip` Turndown rule:** registers `{ url, title: context.findReference(url)?.title.trim() || name, sourceName: name }`, where `name` is the chip's trimmed text (its domain).
  - **`readSearchAssistReferences(message)`:**
    - It clears `REFERENCES_ATTRIBUTE`, dispatches `REFERENCES_EVENT` on the module, then reads, removes and parses the attribute with `parseReferencesAttribute`.
    - It returns null when nothing came back, so chips use their domains and More stays empty.
    - Cited entries become citations through `findReference`. Uncited ones are the More list, which `convertMessage` already gates on `includeMoreSources`.

#### [MODIFY] `src/sites/index.ts`
- [ ] **TASK-8:** List `duckDuckGoAdapter` after `duckAiAdapter` in `SITE_ADAPTERS`. The build then adds `https://duckduckgo.com/*` to the content script's matches, and adds a `world: "MAIN"` entry for `page-duckduckgo.js` on that pattern only.

### Tests

#### [NEW] `scratch/fixtures/duckduckgo-search-assist.html`
- [ ] **TASK-9:** A synthetic results page modeled on the inspected structure, with `*.example` content. It holds an organic result before and after, and three Search Assist modules, each in its own `li[data-layout="wikinlp"]`:
  1. **Collapsed:** the toolbar, and a short answer with a bold span and two chips (`widget.example`, `gadget.example`). Below it, the second `div` holds only the `Expand content` button.
  2. **After More:** the same short answer. The second `div` holds the extended answer, with an `h2`, an `h3`, a two-column table, an ordered list, an unordered list with bold lead-ins, a Streamdown code block, and one chip (`widget.example` again). It also holds the ask box. The More pill is gone.
  3. **Writing:** the extended answer, partly written, with the pill labeled `Stop`.

#### [NEW] `scratch/test_duckduckgo-search-assist.ts`
- [ ] **TASK-10:** Add the regression script, run by `npm test` and covering the checks in the Verification Plan. It gives the fixture's short-answer elements a fake `__reactFiber$test` chain ending in `item.data.data`, with `sources` and `all_source_urls`.

### Docs

#### [MODIFY] `README.md`
- [ ] **TASK-11:** Update the README:
  - Add Search Assist to the intro and to Supported sites. Explain collapsed, expanded and More, where chip titles come from, and the off-by-default More with its untitled links.
  - Note the gap in Search Assist's own Copy, and add a limitations line: the extension loads on every DuckDuckGo search page but acts only on Search Assist.
  - Add the new files to the development tree.

## Verification Plan

### Automated Tests
`scratch/test_duckduckgo-search-assist.ts`, run by `npm test`, checks:
1. **Messages:** each of the three modules is found, and the organic results aren't. `findButtonAnchor` puts M↓ directly before Copy, and returns null for a module without Copy.
2. **Collapsed copy:** the full short answer, with bold kept. Each chip becomes a linked citation titled from the fake React data, under `### Citations`. Nothing comes from the toolbar or the Expand button. The check runs in linked-citations style and in footnotes style.
3. **After-More copy:** the short answer, then the extended answer: headings, a GFM table, both lists, a fenced code block with its language and line breaks, and the chip in the extended answer cited once with the same number as in the short answer. No ask-box text is copied.
4. **Writing:** conversion throws the ConversionError with the "still writing" message.
5. **More sources:**
   - With the setting on, the uncited consulted URLs come under `### More` as `[domain](url)`, after Citations, without duplicating cited ones.
   - With it off, there's no More section.
   - With no page data, chips use their domains and there's no More.
6. **Page script:**
   - `extractSearchAssistReferences` reads the fake fiber chain, drops non-http URLs, and returns null without a fiber or past 40 levels.
   - The install writes and clears `REFERENCES_ATTRIBUTE`.
7. **Native Copy override:** a click on Search Assist's Copy, with the override on, writes the same Markdown as the button. In the writing state it falls through to the site's copy.
8. **Registration and settings:**
   - `findAdapterForUrl` picks this adapter for `https://duckduckgo.com/?q=x&ia=web`, and Duck.ai's for `https://duck.ai/chat`.
   - The built manifest has `page-duckduckgo.js` on `https://duckduckgo.com/*` only.
   - Default settings have `includeMoreSources` off for `duckduckgo` and on for `copilot` and `duckai`.
   - The options page shows each site's own More description.

Re-run `scratch/test_ai-chat-formatter.ts`, `scratch/test_block-reference-citations.ts`, `scratch/test_copilot-source-details.ts` and `scratch/test_duck-ai-adapter.ts`; all must still pass. `tsc --noEmit` must pass.

### Manual Verification
1. Run `npm run build`, reload the extension from `brave://extensions` (or `chrome://extensions`), and search DuckDuckGo for something that brings up Search Assist.
2. **Collapsed:** check that M↓ appears just left of Search Assist's Copy button. Click it without expanding, and paste into Obsidian: the whole short answer, with each chip as a linked citation titled like its hover tooltip.
3. **Expanded:** expand the box, copy again, and check that the result matches step 2.
4. **More:** press **More**, and click M↓ while it's still writing (the button shows Stop). The "still writing" message should appear. Once it's finished, copy again: the extended answer follows the short one with its headings, tables and lists, and no follow-up questions or Ask box.
5. **More sources:** turn on **Include "More" sources** for DuckDuckGo Search Assist on the options page, copy again, and check `### More` lists the other consulted pages as links. Turn it off again.
6. **Override:** turn on **Use for DuckDuckGo Search Assist's own Copy button** and check that Search Assist's Copy gives the same Markdown.
7. Check a search with no Search Assist: no button, and no errors in the console.
8. Check that Duck.ai and Copilot still copy as before.

## Visual design application
Not applicable. The change reuses the extension's existing M↓ button and toast. No `design-system.md` or `art-bible.md` exists in this repo.
