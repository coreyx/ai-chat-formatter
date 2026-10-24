---
status: approved
---

# Duck.ai adapter: Copy as Markdown with Read More sources

Adds Duck.ai, DuckDuckGo's AI chat, as the second supported site. Its replies get the **Copy as Markdown** button and the optional Copy-button override. The inline source chips become citations, titled from the reply's **Read More** cards. Duck.ai's own Copy button writes Markdown text but drops every link and source, so this fills that gap. Read More cards that no chip cites go under `### More`.

**Related documents**
- [Copilot source details plan](../copilot-source-details/implementation_plan.md)
- [Linked citations plan](../block-reference-citations/implementation_plan.md)

## User Review Required

> [!IMPORTANT]
> **Where the extension runs: `https://duck.ai/*` only.** `duckduckgo.com/?ia=chat` redirects to `duck.ai/chat` (checked 2026-10-24), so Duck.ai opened from DuckDuckGo is covered too, and the extension stays off DuckDuckGo's search pages. If DuckDuckGo stops redirecting, `duckduckgo.com` patterns can be added later.

> [!IMPORTANT]
> **How Read More is used.**
> - **Titles:** each inline chip is matched to the Read More card with the same URL, and the card supplies the title: `[Title](url) — domain`. A chip with no matching card uses its own label (a site name such as "GitHub" or a domain).
> - **Uncited cards:** Read More cards that no chip cites go under `### More`, in card order. They're controlled by the per-site **Include "More" sources** switch, on by default as for Copilot.
> - **A reply with no chips:** this happens. All its Read More cards then come through under `### More`, with no `### Citations`.

> [!IMPORTANT]
> **A page script for popup chips (revision).** Duck.ai's popup chips have no links in their markup: the sources they stand for are only in Duck.ai's React state, which the content script can't see. As with Copilot, a small script runs in Duck.ai's own page:
> - When a copy starts, it reads each popup chip's sources and writes them as JSON to a `data-acf-sources` attribute on that chip's button. It only reads React state and never throws into the page.
> - The attribute stays on the button afterward, unlike Copilot's, which is removed. Conversion works on a copy of the reply taken after the request, and the attribute must still be there when that copy is made. The attribute is invisible and is rewritten on every copy.
> - **If the page data can't be read**, the content script falls back to the Read More card whose domain matches the chip's displayed domain. If there's no such card, the chip's label is dropped rather than copied as stray text.

> [!NOTE]
> **Plan revision (2026-10-24).** Testing TASK-1 to TASK-8 in Brave showed a second kind of chip: a popup button showing a domain and a count of further sources, such as `widget.example` with `1`. The adapter copied it as plain text (`widget.example1`), and its sources' cards wrongly landed under More. The plan was reopened, with the maintainer's agreement, to add TASK-10 to TASK-13. TASK-10 replaces TASK-4's "no page script" point. Also found during implementation and fixed without a plan change: Streamdown renders bold as `span[data-streamdown="strong"]` rather than `<strong>`, so the preprocess step converts those spans too.

> [!IMPORTANT]
> **Release.** This adds a feature, so the next version is **0.4.0**. TASK-9 repeats the earlier release steps, which publish to GitHub. Approving this plan authorizes them for 0.4.0, after you've tested the build and after `wrap-up` and `prepare-release`.

> [!NOTE]
> **Built from a live inspection.** Everything below comes from a saved Duck.ai conversation, inspected on 2026-10-24 in Brave: three replies, nothing sent, structure recorded only. Duck.ai's class names are generated hashes, so the adapter uses only ids, `data-*` attributes, ARIA attributes and tag structure. Fixtures and tests use synthetic `*.example` content.
>
> What was found:
> - **Reply:** a `div` whose `id` ends in `-assistant-message-<n>-<n>`. A sibling heading element's `id` starts with `heading-`.
> - **Reply body:** the reply's single `[data-dark-theme]` element. It holds Streamdown output (`data-streamdown="list-item"`, `"code-block"` and so on), and not the Reasoning panel or the Read More section.
> - **Reasoning panel:** a collapsed `[inert]` panel listing every site searched. It sits outside the body, so it's never converted.
> - **Inline chip:** `a[aria-label][tabindex]` with `target="_blank"`. It contains one `span` whose text matches the label.
> - **Popup chip** (found in testing): a `button[aria-haspopup]` with an `aria-label`, inside a wrapping `span`. It holds a `span` with the first source's domain, then a `span` with an icon and a `span` with the count of further sources. Its React component, three fiber levels up, has `sources`: an array of `{ id, url, title, domain, rootDomain, siteName }`, two entries in the observed case. The popup's content isn't in the page until it opens.
> - **Read More:** a `section` with an `h4` reading "Read More", holding `a[data-handled-by-react]` cards. Each card is an `img`, then a `span` that holds the title as text plus an inner `span` with the domain.
> - **Native Copy:** `button[data-copyairesponse]` ("Copy to clipboard"), inside a wrapper `div` in the reply's toolbar row. Every toolbar item has its own wrapper `div`.
> - **Code block:** `[data-streamdown="code-block"][data-language]`. Each line is a `span` under `code`, with **no newline characters** between lines.
>
> Not seen, because the model was down: a reply while it's still being written, tables, and math. These are covered by manual verification.

## Open Questions

None at this time.

## Proposed Changes

### Duck.ai adapter

#### [NEW] `src/sites/duckai.ts`
- [x] **TASK-1:** Add `duckAiAdapter: SiteAdapter`, with a header comment naming the inspection date as Copilot's does:
  - `id: "duckai"`, `name: "Duck.ai"`, `matches: ["https://duck.ai/*"]`.
  - `messageSelector: 'div[id*="-assistant-message-"]:not([id^="heading-"])'`, `contentSelector: "[data-dark-theme]"`, `nativeCopyButtonSelector: "button[data-copyairesponse]"`.
  - `findButtonAnchor`: the toolbar row is the copy button's wrapper's parent. Insert directly after the copy button's wrapper `div`, or return null when there's no copy button yet (still streaming).
  - `stripSelectors`: `[data-streamdown="code-block-header"]`, `[data-streamdown="code-block-actions"]` and `[aria-live]`.
  - `rules`: `invisibleCharactersRule`, `collapseBlankLinesRule`.
- [x] **TASK-2:** `preprocess: rewriteDuckAiCodeBlocks`:
  - Replace each `[data-streamdown="code-block"]` with `<pre><code class="language-…">`.
  - Join the line `span`s under `code` with `\n`. Fall back to `code.textContent` when there are no line spans.
  - Take the language from `data-language` through an exported `duckAiLanguageId`: lowercased, with `text`/`plaintext` mapping to none.
- [x] **TASK-3:** A `duckAiCitationChip` Turndown rule. It matches an `a` with an `http(s)` `href`, an `aria-label` and a `tabindex`, whose only element child is a `span`, and registers `{ url, title, sourceName }`:
  - `title` is `context.findReference(url)?.title`, or the chip's label when there's none.
  - `sourceName` is the chip's text.

  Ordinary links in the reply have no `aria-label`, so they keep converting as normal links.
- [x] **TASK-4:** `readReferences: readDuckAiReferences(message)`:
  - Reads the Read More cards (`section:has(> h4) a[data-handled-by-react]`, in page order) into `SourceReference`s:
    - `url`: the card's `href`.
    - `title`: the card `span`'s own text, excluding the inner domain `span`, with whitespace collapsed.
    - `domain`: the inner `span`'s text, or `sourceDomain(url)` when it's empty.
    - `cited`: whether a chip in the body links to the same URL (compared with `normalizeCitationUrl`).
  - Returns null when the message has no Read More section, so chips fall back to their labels.
  - No `readReferencesSlowly`, `hasUntitledCitations` or `pageScript`: everything is in the page already.

#### [MODIFY] `src/core/references-protocol.ts`, [NEW] `src/page/duckai.ts`
- [x] **TASK-10:** The Duck.ai page script.
  - **Protocol:** add `CHIP_SOURCES_ATTRIBUTE = "data-acf-sources"` and a `RawChipSource { url, title, domain }` type. The request reuses `REFERENCES_EVENT`, dispatched on the reply. Only one page script runs on a site, so the event name doesn't clash with Copilot's.
  - **`extractDuckAiChipSources(button)`:** walk up to 8 fiber levels from the button to the first `memoizedProps.sources` array. Keep entries with an `http(s)` `url`, taking `title` and `domain` as strings (empty when missing). Return null when nothing is found.
  - **`installDuckAiPageScript(document)`:** on the event, for each `button[aria-haspopup]` in the reply's `[data-dark-theme]` body, write the JSON to `data-acf-sources`, or remove the attribute when nothing was found. Errors are caught.
  - Set `pageScript: "duckai"` on the adapter, so the build bundles the script and the manifest runs it in the page world on `duck.ai`.

#### [MODIFY] `src/sites/duckai.ts`
- [x] **TASK-11:** Popup chips in the adapter:
  - **Request:** `readDuckAiReferences` first dispatches `REFERENCES_EVENT` on the message, so popup chips carry `data-acf-sources`.
  - **Fallback:** for each popup chip still without the attribute, it writes one from the Read More card whose domain equals the chip's displayed domain (the first `span`), when there is one.
  - **Cited:** a card now counts as cited when a link chip or a popup chip's source has its URL.
  - **Without a Read More section,** it still returns null, but only after the request, so popup chips are annotated either way.
  - **Turndown rule `duckAiPopupChip`** for a `button[aria-haspopup]` in the body: register each source in its parsed, validated `data-acf-sources`, titled from the Read More card for its URL when there is one, otherwise the source's own title, otherwise its domain. With no usable attribute, emit nothing.

#### [MODIFY] `src/sites/index.ts`
- [x] **TASK-5:** Add `duckAiAdapter` to `SITE_ADAPTERS`, after Copilot. The build then adds its match pattern to the manifest's content script, and the options page gets a Duck.ai section with **Include "More" sources** on by default.

### Tests

#### [NEW] `scratch/fixtures/duckai-message.html`
- [x] **TASK-6:** A synthetic page modeled on the inspected structure, with generated-looking class names:
  - a user message;
  - a reply with a Reasoning panel holding links, a paragraph with two chips (one source cited twice), a bullet list with a chip, an ordinary Markdown link, a code block with an indented line, a Read More section with three cards (one uncited), and the toolbar row with the copy button;
  - a second reply with Read More cards and no chips.

  All names, titles and URLs are made up (`*.example`).

#### [NEW] `scratch/test_duck-ai-adapter.ts`
- [x] **TASK-7:** The regression script described under Verification Plan, plus updates to the earlier scripts for a second adapter, if any check assumed Copilot was the only one (options sections, manifest matches).

#### [MODIFY] `scratch/fixtures/duckai-message.html`, `scratch/test_duck-ai-adapter.ts`
- [ ] **TASK-12:**
  - **Fixture:** add a popup chip to the first reply, standing for two sources. One of them is the currently uncited third card, so it moves out of More; the other has no card.
  - **Tests:** the checks numbered 9 to 12 under Verification Plan. Since jsdom has no React, the tests attach a fake fiber (`__reactFiber$test` with `memoizedProps.sources` a few levels up) to the fixture's popup chip.

### Docs

#### [MODIFY] `README.md`
- [x] **TASK-8:**
  - Add Duck.ai to the intro and to **Supported sites** (`duck.ai`, noting that `duckduckgo.com/?ia=chat` redirects there).
  - Explain where Duck.ai's titles come from (Read More cards), and that uncited Read More cards go under More.
  - Note that Duck.ai's own Copy button drops links and sources.
  - Add `brave://extensions` to the installation steps, since Brave loads the extension the same way.
  - Update the development tree with the new files.
- [ ] **TASK-13:** Describe popup chips in Duck.ai's part of "Where the titles and links come from": the page script, and the fallback to the card with the same domain. Update `src/page/` in the development tree, which now holds both page scripts.

### Release

#### [MODIFY] GitHub repository `coreyx/ai-chat-formatter`
- [ ] **TASK-9:** After your test of the build, and after `wrap-up` and `prepare-release` have produced the 0.4.0 `CHANGELOG.md` and `RELEASE_NOTES.md` sections:
  1. Confirm the effective `git config user.email` is the GitHub noreply address.
  2. Scan the outgoing commits and the zip for private details.
  3. Run `npm run package`.
  4. Push `main`.
  5. Create and push the tag `0.4.0`.
  6. Run `gh release create 0.4.0` with `release/ai-chat-formatter-0.4.0.zip` attached and the 0.4.0 notes.
  7. Confirm the asset's checksum against the local zip.

## Verification Plan

### Automated Tests
`npm test` runs every scratch script; the three existing ones must keep passing. `scratch/test_duck-ai-adapter.ts` checks, against the fixture:
1. **Messages:** `messageSelector` finds the two replies and not the user message or the `heading-` elements.
2. **Full conversion** (linked citations, fixed token):
   - Expected Markdown with chips as markers, one number for the source cited twice, and titles from the Read More cards.
   - `### Citations` with the two cited sources, then `### More` with the uncited card.
   - The ordinary link kept as a link, and nothing from the Reasoning panel, the Read More cards or the toolbar in the body.
3. **Code block:** a fenced block with the language from `data-language`, lines joined with newlines and indentation kept. `text` and `plaintext` give no language.
4. **References:** `readDuckAiReferences` returns the three cards in order with title, domain and `cited`. It returns null with no Read More section. The reply with no chips gives only `### More`, and nothing under Sources when More sources is off.
5. **No Read More:** chips fall back to their label as the title.
6. **Placement:** `findButtonAnchor` puts the button directly after the copy button's wrapper, and returns null without a copy button.
7. **Registration:**
   - `findAdapterForUrl` picks Duck.ai for `duck.ai/` and `duck.ai/?chatID=…`, and nothing for `duckduckgo.com/?q=x`.
   - The built manifest lists `https://duck.ai/*`, and settings default Duck.ai's More sources to on.
8. **Native override:** with the override on, a click on `button[data-copyairesponse]` writes the converted Markdown.
9. **Page script:**
   - `extractDuckAiChipSources` finds `sources` on a fake fiber a few levels up, drops non-http entries, and returns null when there are none within 8 levels.
   - With the script installed, a request writes `data-acf-sources` to the popup chip.
10. **Popup chip conversion:**
    - The chip becomes one marker per source, titled from the Read More card when there is one, otherwise from the source's own title.
    - Its card counts as cited, so it's under Citations, not More.
    - No `widget.example1`-style text remains.
11. **Fallback:** without the page script, the chip gets the card with the same domain. With no such card, it emits nothing.
12. **Manifest:** a `world: "MAIN"` entry runs `page-duckai.js` on `https://duck.ai/*`, and Copilot's page script still runs only on Copilot.

### Manual Verification
Done in Brave (where the Duck.ai history is), and in Chrome if wanted:
1. Run `npm run build`, then load `dist/` unpacked from `brave://extensions` (Developer mode), or reload it there. Open a Duck.ai conversation with web sources.
2. Check that each finished reply has the **Copy as Markdown** button next to Duck.ai's Copy button, and replies without the toolbar don't.
3. Copy a reply with chips and Read More, and paste it into Obsidian. Check the markers, the titles taken from the cards, `### Citations`, then `### More` with the uncited cards. Check that no Reasoning content or toolbar text appears.
4. Copy a reply with a code block and check its language and line breaks.
5. Copy the reply with the popup chip (`domain` plus a count). Each of its sources should be a linked citation, with no `domain1` text, and those sources' cards shouldn't appear under More.
6. Turn on **Use for Duck.ai's own Copy button**, click Duck.ai's Copy, paste, and check that it's the same Markdown. Turn it off again.
7. Once the model is back: send a prompt and check that the button appears only once the reply has finished. If a reply with a table or math comes up, check its conversion.
