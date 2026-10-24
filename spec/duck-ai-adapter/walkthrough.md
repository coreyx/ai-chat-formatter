# Walkthrough: Duck.ai adapter

Duck.ai is the second supported site. Its replies get the **Copy as Markdown** button, placed to the left of Duck.ai's Copy button, and the optional Copy-button override. Both kinds of source chip become citations: link chips, and popup chips that stand for several sources. Titles come from the reply's **Read More** cards or Duck.ai's own data, and Read More cards that nothing cites go under `### More`. Duck.ai's own Copy writes Markdown without any links or sources; this fills that gap.

## What Was Implemented

### 1. The adapter: `src/sites/duckai.ts`
- **Selectors**, from a live inspection on 2026-10-24 (structure only). Duck.ai's class names are generated hashes, so the adapter uses ids, `data-*` attributes, ARIA attributes and tag structure.
  - Replies: `div[id*="-assistant-message-"]:not([id^="heading-"])`.
  - Body: `[data-dark-theme]`, which leaves out the Reasoning panel and the Read More section.
  - Native Copy: `button[data-copyairesponse]`.
  - Matches `https://duck.ai/*` only. `duckduckgo.com/?ia=chat` redirects there.
- **Placement:** in the toolbar row, right after Copy's wrapper `div`. The row is laid out right to left, so the button shows to Copy's left.
- **Preprocess:**
  - Code blocks: Duck.ai draws each line as its own `<span>` with no newlines, so the lines are joined with `\n`, keeping indentation. The language comes from `data-language` through `duckAiLanguageId`.
  - Bold: Streamdown renders bold as `span[data-streamdown="strong"]`, which becomes `<strong>`.
  - Popup chips with no readable sources are removed, together with their wrapper.
- **Link chips** (`a[aria-label][tabindex]` around one `<span>`): one citation each, titled from the Read More card with the same URL, or the chip's label.
- **Popup chips** (`button[aria-haspopup]` showing a domain and a count): one citation per source in their `data-acf-sources` attribute, titled from the source's Read More card, otherwise Duck.ai's own title for it.
- **`readDuckAiReferences`:**
  - It asks the page script for popup chips' sources.
  - Any popup chip still without them gets the Read More card for the domain it shows.
  - It reads the Read More cards in order as `{ url, title, domain, cited }`. A card is cited when a link chip or a popup chip's source points to it.
  - It returns null with no Read More section.

### 2. The page script: `src/page/duckai.ts`
- Runs in the page world on `duck.ai`. On `REFERENCES_EVENT`, for each popup chip in the reply body, it walks up to 8 React fiber levels to a `sources` array (3 levels up when observed). It writes the http(s) entries to `data-acf-sources`, or removes a stale attribute.
- The attribute stays on the chip, because conversion copies the reply after the request.
- **`src/core/references-protocol.ts`:** `CHIP_SOURCES_ATTRIBUTE` and `RawChipSource`.

### 3. Registration and docs
- **`src/sites/index.ts`:** the adapter is listed after Copilot, so the manifest gains `https://duck.ai/*` and a `world: "MAIN"` entry for `page-duckai.js`. The options page also gets a Duck.ai section, with More sources on by default.
- **`README.md`:**
  - Duck.ai in the intro and Supported sites.
  - Where its titles come from, including popup chips and their fallback.
  - The gap in Duck.ai's own Copy.
  - `brave://extensions` in the install steps.
  - A limitations note, and the updated development tree.

### Plan revision
After the first build was tested, the approved plan was reopened, with the maintainer's agreement. That first test showed popup chips copying as plain text (`widget.example1`-style) and their cards landing in More. TASK-10 to TASK-13 added the page script, popup-chip conversion, tests and docs; TASK-10 replaced TASK-4's "no page script" point.

Two fixes were made during implementation without a plan change:
- Bold kept as `<strong>` (`da513cd`).
- Unreadable popup chips dropped before conversion, so no trailing space is left (`d537671`).

## Verification & Test Results

### Automated Tests
`npm test` runs `scratch/test_duck-ai-adapter.ts`: **20/20 passed**, against a synthetic fixture with `*.example` content. It covers:
- **Messages:** the replies are found, not user messages or headings.
- **Full conversion:** link and popup chips, titles from the cards, Citations then More, an ordinary link kept, bold, and nothing leaking from the Reasoning panel, cards, toolbar or popup chips. The footnotes style is checked too.
- **The live page:** left unchanged apart from the popup chip's attribute.
- **Code blocks:** language, line joins and indentation, plain languages dropped, and the no-line-spans fallback.
- **References:** card order, title, domain and cited status. A reply without chips gets only More, or nothing with More off. With no Read More section, the result is null and chips use their labels or Duck.ai's titles. An empty domain falls back to the URL's.
- **The page script:**
  - It finds `sources` on a fake fiber, drops non-http entries, and gives up past 8 levels or with no fiber.
  - A request writes the attribute and clears a stale one.
  - Malformed attributes parse to null.
- **The fallback:** without the page script, a popup chip gets the card for its domain. With no such card, it copies as nothing, with no stray text or space.
- **The controller:**
  - Placement after Copy's wrapper, and none without Copy.
  - The button's copy, and the native override, both write the same Markdown.
- **Registration:**
  - `duck.ai` URLs pick the adapter and DuckDuckGo search doesn't.
  - The manifest has the content script and Duck.ai's page script on `duck.ai`, and Copilot's page script isn't there.
  - More sources default on.

The tests attach a fake React fiber to the fixture's popup chip, since jsdom runs no React. `tsc --noEmit` passes.

Failures along the way, all fixed before their items were committed:
- After TASK-10, the TASK-7 check asserting "no page script on duck.ai" failed, as it should. It was updated in the same commit.
- A first version of the no-card fallback left a trailing space; that's the `d537671` fix above.

### Regression Testing
- `scratch/test_ai-chat-formatter.ts`: **38/38 passed.**
- `scratch/test_block-reference-citations.ts`: **7/7 passed.**
- `scratch/test_copilot-source-details.ts`: **30/30 passed.**

## Manual Verification
The maintainer's results, 2026-10-24, in Brave with the extension loaded unpacked:
- **First build:** card titles, links and domains were right, but popup chips copied as plain text, and their cards appeared under More. This led to the plan revision.
- **Revised build:** "All is well". Popup chips' sources come through as linked, titled citations, their cards are out of More, and link-chip replies are unchanged.

Still to check when Duck.ai's model is available (it was down during this work):
1. Send a prompt and check that the button appears only once the reply has finished.
2. If a reply with a table or math comes up, check its conversion.

To repeat the main checks:
1. Run `npm run build`, then load or reload `dist/` from `brave://extensions` (Developer mode), and refresh Duck.ai.
2. Copy a reply with link chips and Read More, and paste it into Obsidian. Check the markers, the titles taken from the cards, `### Citations` and then `### More`, and that no Reasoning or toolbar text appears.
3. Copy a reply with a popup chip (a domain plus a count). Each of its sources should be a linked citation, with no `domain1` text, and its cards shouldn't be under More.
4. Turn on **Use for Duck.ai's own Copy button** and check that Duck.ai's Copy gives the same Markdown.

## Release
Released as [0.4.0](https://github.com/coreyx/ai-chat-formatter/releases/tag/0.4.0) on 2026-10-24, together with the Copilot button order change, with `ai-chat-formatter-0.4.0.zip` attached. The asset's SHA-256 matches the local package.

## Follow-ups
- The two checks above, once Duck.ai's model is back.
- If DuckDuckGo stops redirecting `duckduckgo.com/?ia=chat` to `duck.ai`, add `duckduckgo.com` match patterns.
