# Walkthrough: DuckDuckGo Search Assist adapter

Search Assist, the AI answer at the top of DuckDuckGo's search results, is the third supported site. It gets the **Copy as Markdown** button, placed to the left of Search Assist's Copy button, and the optional Copy-button override. The copy holds the whole short answer, collapsed or expanded, and the extended answer once **More** has finished writing it. Each source chip becomes a citation titled with its page title. The other pages Search Assist consulted can go under `### More`, off by default for this site. Search Assist's own Copy drops every source; this fills that gap.

## What Was Implemented

### 1. Shared code
- **`src/sites/streamdown.ts`** (new): Duck.ai's Streamdown helpers moved here as `streamdownLanguageId`, `rewriteStreamdownCodeBlocks` and `rewriteStreamdownStrong`, since Search Assist renders with the same markup. `src/sites/duckai.ts` imports them and keeps `duckAiLanguageId` as an alias.
- **`src/core/citations.ts`**: `parseReferencesAttribute` moved here from `src/sites/copilot.ts`, which imports and re-exports it.
- **Per-site More sources:** `SiteAdapter` gains an optional `moreSources: { defaultEnabled, description }`.
  - `buildDefaultSettings` uses its default.
  - The options page uses its description, falling back to the old generic text.
  - Duck.ai's description now names its Read More cards; Copilot's is unchanged.

### 2. The page script: `src/page/duckduckgo.ts`
- Runs in the page world on `duckduckgo.com`. On `REFERENCES_EVENT` on a Search Assist module, it walks up to 40 React fiber levels from the short answer to `memoizedProps.item.data.data`.
- It writes `REFERENCES_ATTRIBUTE` on the module:
  - first the chips' `sources`, cited and titled;
  - then the `all_source_urls` not already listed, uncited and untitled.
- Non-http URLs are dropped. A stale attribute is removed when nothing is found.

### 3. The adapter: `src/sites/duckduckgo.ts`
- **Selectors**, from the live inspection on 2026-10-24 (structure only):
  - Modules: `[data-react-module-id="wikinlp"]` holding a `duckassist-answer-content`.
  - Body: the `div` wrapping both answers.
  - Native Copy: `button[aria-label="Copy to clipboard"]`.
  - Matches `https://duckduckgo.com/*`.
- **Placement:** directly before Copy in the toolbar, as on Copilot and Duck.ai.
- **Preprocess:**
  - It throws the "still writing" `ConversionError` while the More pill reads **Stop**.
  - It keeps only the short answer and the extended answer, which drops the Expand button, the More pill and the "Ask Duck.ai" box.
  - It runs the Streamdown rewrites.
  - It moves each run of chips into the paragraph it follows.
- **Chips** (a link with a favicon, inside `span[tabindex]`) become citations, titled from the page data or with the chip's domain.
- **`readSearchAssistReferences`:** asks the page script and parses its answer. It returns null when nothing came back.
- **Registration:** listed after Duck.ai in `src/sites/index.ts`, so the manifest gains `https://duckduckgo.com/*` for the content script and a `world: "MAIN"` entry for `page-duckduckgo.js` there only.

### 4. Docs
- **`README.md`:**
  - Search Assist in the intro, Why and Supported sites, with a section on the collapsed, expanded and More states.
  - Where its titles come from, and the off-by-default More sources.
  - Settings, install and update steps.
  - Two limitations: the internal data it depends on, and loading on every DuckDuckGo search page.
  - The development tree, and `moreSources` under Adding a site.

### Changes made during implementation
- **Chips joined to their paragraph** (`caadcc8`, part of TASK-7). Search Assist puts its chips in a `span` after the paragraphs' container, so their markers first copied as a paragraph of their own. Each run of chips now moves into the last paragraph before conversion, so the markers end the sentence: `Most gadgets need two of them.⁽¹⁾⁽²⁾`.
- **A Duck.ai check updated** (TASK-8). It asserted that DuckDuckGo search matches no adapter. That's no longer true, so it now asserts the URL doesn't pick Duck.ai's adapter.
- An empty `turndownRules` placeholder was added in TASK-5 to satisfy the `SiteAdapter` type, then replaced in TASK-7.

## Verification & Test Results

### Automated Tests
`npm test` runs `scratch/test_duckduckgo-search-assist.ts`: **22/22 passed**, against the synthetic fixture `scratch/fixtures/duckduckgo-search-assist.html`. It has organic results around three modules (collapsed, after More, still writing) with `*.example` content. It covers:
- **Messages and placement:** the three modules are found and the organic results aren't. The button goes directly before Copy, and nowhere without Copy.
- **Collapsed:** the whole short answer, with bold, and chips as titled citations, in linked-citations and footnotes styles. No toolbar, feedback or Expand text.
- **After More:**
  - The short answer, then the extended answer: headings, a GFM table, both lists, and a fenced `bash` block with its line breaks.
  - Its chip reuses citation 1.
  - No ask-box text.
- **Writing:** conversion throws the "still writing" ConversionError.
- **The live page:** a copy leaves it unchanged.
- **More sources:**
  - With the setting on, the two uncited pages follow Citations as `[domain](url)`, without the cited ones or the `ftp:` entry.
  - With it off, there's no More.
  - Without the page script, or without data, chips use their domains and there's no More.
- **Page script:**
  - It reads cited then uncited entries and drops non-http URLs.
  - It finds data 40 levels up but not 41, and returns null without a fiber.
  - A request writes the attribute and clears a stale one, and the reader leaves no attribute behind.
- **Controller:**
  - Three buttons, each before Copy; a click copies the collapsed answer and doesn't reach the site.
  - On the writing module, the toast shows and nothing is copied.
  - With the override on, Search Assist's Copy writes the same Markdown, and on the writing module it falls through to the site's copy.
- **Registration and settings:**
  - `duckduckgo.com` URLs pick this adapter, and `duck.ai` keeps Duck.ai's.
  - The manifest has `page-duckduckgo.js` on `https://duckduckgo.com/*` only.
  - More sources default off here and on for Copilot and Duck.ai.
  - The options page shows each site's own More description.

The tests attach a fake React fiber to each short answer, since jsdom runs no React. `tsc --noEmit` passes. No check failed along the way.

### Regression Testing
- `scratch/test_ai-chat-formatter.ts`: **38/38 passed.**
- `scratch/test_block-reference-citations.ts`: **7/7 passed.**
- `scratch/test_copilot-source-details.ts`: **30/30 passed.**
- `scratch/test_duck-ai-adapter.ts`: **20/20 passed**, with the one check updated as described above.

All four were re-run after every item.

## Manual Verification
**Partly done** (reported by the maintainer on 2026-10-27):
- **Passed:** steps 1 and 2 (collapsed), 4's second part (the copy after More), 5 (More sources) and 6 (the override).
- **Covered elsewhere:** step 8, by the user-prompt feature's manual checks, which copied replies on Copilot and Duck.ai.
- **Still open:** step 3 (expanded, without More), 4's first part (the "still writing" message) and 7 (a search with no Search Assist).

These are for the maintainer, in Brave:
1. Run `npm run build`, reload the extension from `brave://extensions`, and search DuckDuckGo for something that brings up Search Assist.
2. **Collapsed:** check that M↓ appears just left of Search Assist's Copy button. Click it without expanding, and paste into Obsidian. You should get the whole short answer, with each chip as a linked citation titled like its hover tooltip and the markers at the end of the last sentence.
3. **Expanded:** expand the box, copy again, and check that the result matches step 2.
4. **More:**
   - Press **More**, and click M↓ while it's still writing (the button shows Stop). The "still writing" message should appear.
   - Once it's finished, copy again. The extended answer should follow the short one with its headings, tables and lists, and no follow-up questions or Ask box.
5. **More sources:** turn on **Include "More" sources** for DuckDuckGo Search Assist on the options page, copy again, and check that `### More` lists the other consulted pages as links. Turn it off again.
6. **Override:** turn on **Use for DuckDuckGo Search Assist's own Copy button** and check that Search Assist's Copy gives the same Markdown.
7. Check a search with no Search Assist: no button, and no errors in the console.
8. Check that Duck.ai and Copilot still copy as before.

## Follow-ups
- The manual checks still open above, before any release.
- No chips or links were seen in an extended answer during the inspection. The adapter handles chips there the same way, but that's only tested against the fixture.
- Still open from the Duck.ai adapter: checking that its button appears only once a reply has finished, and its table and math conversion, once Duck.ai's model is available.
