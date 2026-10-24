---
status: approved
---

# Copilot source details: page titles on every citation, and the "More" sources list

Two improvements to how Copilot replies' sources are copied:
- **Every citation gets its page title and domain.** Chips that group several sources (shown as `photovault+1`) currently copy as bare domains.
- **The "More" sources come along.** These are the sources Copilot lists under **More** in its Sources panel but doesn't cite in the text.

The data comes from the reply's own source list, which Copilot keeps in its React state; a small script running in the page's own JavaScript world reads it. When that isn't available, the extension opens the reply's Sources panel, reads it and closes it again. Sources are written as `[Title](url) — domain`. The More list is a `## More sources` section, on by default, with a toggle per site.

**Related documents**
- [AI Chat Formatter 0.1.0 plan](../ai-chat-formatter/implementation_plan.md)
- [AI Chat Formatter 0.1.0 walkthrough](../ai-chat-formatter/walkthrough.md)

## User Review Required

> [!IMPORTANT]
> **Primary source: Copilot's React state.** Inspected on copilot.com on 2026-10-24 in a test conversation. With the Sources panel closed, a React component above each reply's `[data-testid="markdown-reply"]` (4 levels up) holds `response.references`. That's an array of every source, cited and More alike, with:
> - `name`: the page title,
> - `url`,
> - `isCitedInResponse`,
> - `hideCitationFromReferenceSection`.
>
> One reply had 6: 3 cited, matching its chip URLs exactly, and 3 under More. Content scripts run in an isolated world and can't see React's properties, so a second content script runs in the page's world (`"world": "MAIN"`, Chrome 111+, which the manifest's minimum of 120 already covers). It only reads data and hands it over. **This relies on React internals**, which are more fragile than markup, hence the fallback below.

> [!IMPORTANT]
> **Fallback: open the Sources panel.** Used only by the **Copy as Markdown** button, and only when the React data can't be read. Inspected the same day:
> - The extension clicks the reply's `[data-testid="sources-button-testid"]`. A scripted click works, and the panel's entries appeared within about 1 second.
> - It reads the panel: `[data-testid="search-widget-drawer-test-id"]` holds a "Citations" heading, then a `role="list"` of `[data-testid="search-widget-item"]`, then "More" and its own list. Each item has the full title and the domain as `title` attributes.
> - It closes the panel with the panel header's `button[aria-label="Close"]`.
>
> Panel entries carry **no URLs**:
> - **Citations** are matched to chip URLs by position. A chip source's `index` (`1-a1b2c3`, `2-d4e5f6`, …) is its position in the panel's Citations list, which tells apart two citations from the same domain (verified with two `github.com` sources).
> - **More** entries have no URL anywhere in the panel, so they're written as `Title — domain` without a link.
>
> What you'll see: the panel slides open for about a second during the copy, then closes. If it was already open, it's left open, now showing this reply's sources. The copy waits up to 3 seconds for the panel, and checks that the panel's citation domains match the chip URLs in order, so it never pairs one reply's titles with another's. If anything doesn't line up, it copies as 0.1.0 does.
>
> **The Copy-button takeover doesn't use the fallback.** It has to decide synchronously, before Copilot's own handler runs, and opening the panel takes time. When the React data can't be read there, it copies as 0.1.0 does.

> [!IMPORTANT]
> **Release.** This adds features, so the next version is **0.2.0**. TASK-12 repeats 0.1.0's release steps, which publish to GitHub: package, push `main`, tag `0.2.0`, publish the release. Approving this plan authorizes them for 0.2.0, after `wrap-up` and `prepare-release`.

> [!NOTE]
> **How the two scripts talk.** Synchronously:
> 1. The isolated script dispatches an `acf:request-references` event on the reply element. DOM events reach both worlds, and listeners run during `dispatchEvent`.
> 2. The page script finds the reply's React fiber (the `__reactFiber$…` property), walks up at most 20 levels for `memoizedProps.response.references`, and writes a validated JSON copy to the reply's `data-acf-references` attribute.
> 3. The isolated script reads that attribute and removes it.
>
> Only `url` (http/https only), `name` and the two flags are passed across.

> [!NOTE]
> **Output format.** Every source entry, in footnote definitions and in both Sources lists, becomes `[Title](url) — domain`. The domain is the hostname without a leading `www.`, as the Sources panel shows it. When the only title available *is* the domain, the entry is just `[domain](url)`.
>
> The More list goes after everything else, in every citation style; its entries have no link only when they came from the panel fallback:
> ```markdown
> ## More sources
>
> - [Backup and Restore | PhotoVault Docs](https://docs.photovault.example/…) — docs.photovault.example
> ```
> It leaves out sources already cited in the text, and those with `hideCitationFromReferenceSection` set, which Copilot itself doesn't list. A footnote reply's definitions still come last, so Obsidian's footnote rendering isn't affected.

## Open Questions

None at this time.

## Proposed Changes

### Core

#### [MODIFY] `src/core/types.ts`
- [x] **TASK-1:** Add the shared types and hooks:
  - `SourceReference` (`url: string | null`, `title`, `domain`, `cited: boolean`). A null `url` means the source came from a place that shows no URL, such as Copilot's panel.
  - On `SiteAdapter`, an optional `readReferences?(message: Element): SourceReference[] | null`: synchronous; the message's full source list, or null when it can't be read.
  - On `SiteAdapter`, an optional `readReferencesSlowly?(message: Element): Promise<SourceReference[] | null>`: the asynchronous fallback.
  - On `SiteAdapter`, an optional `pageScript?: string`: the name of a page-world script under `src/page/`.
  - On `ConversionContext`, `findReference(url): SourceReference | undefined`, so adapter rules can look up a source's title by normalized URL.

#### [MODIFY] `src/core/citations.ts`
- [x] **TASK-2:** Add the domain and the More list to rendering:
  - `sourceDomain(url)`: the hostname without a leading `www.`; the URL itself when unparsable.
  - `citationLink` writes `[Title](url) — domain`, or just `[domain](url)` when the title equals the domain, case-insensitively.
  - `renderCitations` gains a `moreSources: SourceReference[]` parameter, defaulting to empty. When it's non-empty, `## More sources` goes after the body or the Sources list and before the footnote definitions. Each line is `- [Title](url) — domain`, or `- Title — domain` for a source without a URL; a title that's Markdown-sensitive is escaped. Sources whose normalized URL was cited, or that repeat within the list (by URL, or by title and domain when there's no URL), are left out.

#### [MODIFY] `src/core/convert.ts`
- [x] **TASK-3:** `convertMessage(adapter, message, options)` takes `{ style, includeMoreSources, isRuleEnabled, references }`, replacing the positional parameters; there are two callers, both in `src/content/controller.ts`. `references` is the list the caller gathered, or null. It builds `findReference` over `references` by normalized URL and passes the uncited, unhidden references to `renderCitations` when `includeMoreSources` is on. Conversion stays synchronous; gathering references is the caller's job.

#### [MODIFY] `src/core/settings.ts`
- [x] **TASK-4:** Add `includeMoreSources: boolean` to `SiteSettings`, defaulting to `true` for adapters with `readReferences` or `readReferencesSlowly`, and merged like the other booleans.

### Copilot

#### [NEW] `src/page/copilot.ts`
- [x] **TASK-5:** Add the page-world script:
  - It listens on `document` for `acf:request-references`.
  - An exported `extractCopilotReferences(element)` finds the event target's `[data-testid="markdown-reply"]` (the target itself or a descendant). It reads the property whose name starts with `__reactFiber$` and walks `.return` at most 20 times to the first `memoizedProps.response.references` array.
  - It maps that array to `{ url, title: name, cited: isCitedInResponse === true, hidden: hideCitationFromReferenceSection === true }`. Entries without an http(s) `url` are dropped, and `name` falls back to `""`.
  - The result goes to the reply's `data-acf-references` as JSON. When nothing is found, the attribute isn't set.
  - The script never throws into the page: everything is in a try/catch. It imports nothing.

#### [MODIFY] `src/sites/copilot.ts`
- [x] **TASK-6:** Add the fast path for Copilot:
  - `pageScript: "copilot"`.
  - `readReferences(message)`: dispatches `new CustomEvent("acf:request-references", { bubbles: true })` on the reply body, then reads, parses and removes `data-acf-references`, using an exported `parseReferencesAttribute(json): SourceReference[] | null`. That validates the shape, drops hidden entries and entries without an http(s) URL, fills in `domain`, and returns null on any problem.
  - The citation-chip rule takes each source's title from `context.findReference(url)?.title` when it's non-empty, and otherwise falls back to the 0.1.0 logic (the chip's `aria-label`, then the source name).
- [x] **TASK-7:** Add the panel fallback for Copilot, `readReferencesSlowly(message)`:
  - Return null right away when the message has no `[data-testid="sources-button-testid"]` or no citation chips.
  - Note whether `[data-testid="search-widget-drawer-test-id"]` is already open and what its first item's title is. Click the Sources button, then poll every 50 ms, for up to 3 seconds, until the drawer's items differ from the noted ones and its Citations list has at least as many items as the highest chip index.
  - Read each section's items, the text after a "Citations" or "More" heading. Every item's `[title]` elements give the title (first) and the domain (second).
  - Pair each chip source with the Citations entry at its `index` position (`/^(\d+)-/`). The panel and chips must agree: each paired entry's domain must equal `sourceDomain(chip url)`. If any don't, return null.
  - Return the cited entries with the chip URLs, plus the More entries with `url: null`.
  - Close the panel through the header's `button[aria-label="Close"]` (the nearest ancestor of the drawer that contains one) unless it was open before, even when reading fails.

### Build and extension

#### [MODIFY] `scripts/build.mjs`
- [x] **TASK-8:** Bundle each adapter's `pageScript` (`src/page/<name>.ts` → `dist/page-<name>.js`, IIFE). For each one, add a second `content_scripts` entry `{ matches: <that adapter's matches>, js: ["page-<name>.js"], run_at: "document_idle", world: "MAIN" }` after the isolated entry.

#### [MODIFY] `src/content/controller.ts` + `src/options/options.ts`
- [x] **TASK-9:** Wire up the controller and options page:
  - **Copy as Markdown** gathers references with `adapter.readReferences(message)`. When that returns null and `includeMoreSources` is on or a chip has no title, it awaits `adapter.readReferencesSlowly(message)`. Then it converts.
  - While it waits, the button is disabled and shows `aria-busy="true"`, so a second click doesn't start a second copy.
  - The native Copy override uses `readReferences` only.
  - A gathering hook that throws counts as null.
  - The options page adds **Include "More" sources** to each site that has either hook, with the hint "Adds the sources {site} lists under More in its Sources panel but doesn't cite in the reply."

### Tests

#### [NEW] `scratch/test_copilot-source-details.ts` + fixtures
- [x] **TASK-10:** Add the fixtures:
  - `scratch/fixtures/copilot-references.json`: `response.references` entries in the observed shape. Three cited, three More, one hidden, one non-http URL.
  - `scratch/fixtures/copilot-sources-panel.html`: the observed drawer markup, with Citations (two `github.com` entries) and More.

  Add the regression script described under Verification Plan. Extend `npm test` to run both scratch scripts and fail if either fails, and update the existing script's `convertMessage` calls to the new signature.

### Docs

#### [MODIFY] `README.md`
- [ ] **TASK-11:** Document the new behavior:
  - The `[Title](url) — domain` entry format, in the citation-style examples.
  - The "More sources" section and its setting.
  - Where the titles come from: Copilot's page data via a small page script, or, failing that, the Sources panel opened briefly by **Copy as Markdown**. Note the panel flash, and that More entries from the panel have no links.
  - Add `src/page/` to the project structure, and `pageScript`/`readReferences`/`readReferencesSlowly` to **Adding a site**.

### Release

#### [MODIFY] GitHub repository `coreyx/ai-chat-formatter`
- [ ] **TASK-12:** After `wrap-up` and `prepare-release` have produced the 0.2.0 `CHANGELOG.md` and `RELEASE_NOTES.md` sections:
  1. Run `npm run package`.
  2. Push `main`.
  3. Create and push the tag `0.2.0`.
  4. Run `gh release create 0.2.0` with `release/ai-chat-formatter-0.2.0.zip` attached and the 0.2.0 notes.
  5. Confirm the asset with `gh release view`, and check its checksum against the local zip.

## Verification Plan

### Automated Tests
`npm test` builds, then runs `scratch/test_ai-chat-formatter.ts`, which must still pass in full after the signature update, and `scratch/test_copilot-source-details.ts`, which checks:
1. **`extractCopilotReferences`:** on a jsdom reply whose element carries a fake `__reactFiber$abc` chain, with `response.references` 4 levels up, it returns every entry, with titles from `name` and the cited and hidden flags, and drops a non-http URL. It returns null when the chain has no references or the element has no fiber, and stops after 20 levels.
2. **The bridge round trip:** with the page script's listener registered on a jsdom document, `copilotAdapter.readReferences(reply)` returns the parsed references, minus the hidden ones, and leaves no `data-acf-references` attribute behind. Without the listener it returns null.
3. **`parseReferencesAttribute`:** null for invalid JSON, a non-array or missing fields. Drops non-http URLs.
4. **The panel fallback**, with a fake Sources button whose click handler inserts the panel fixture after a delay and whose Close button removes it:
   - It returns the cited entries with chip URLs (the two `github.com` citations correctly told apart by index) and the More entries with `url: null`.
   - It closes the panel when it wasn't open before, and leaves it open when it was.
   - It returns null when the panel never appears (after the timeout, using a shortened timeout in the test), when the domains don't match the chips, or when the message has no Sources button.
5. **Multi-source chip titles:** with references present, a chip holding two sources (`photovault+1`) produces footnotes `[^1]: [PhotoVault](https://photovault.example/) — photovault.example` and `[^2]: [GitHub - photovault/photovault: …](https://github.com/photovault/photovault) — github.com`. Without references, the output matches 0.1.0 except for the new `— domain` suffix.
6. **More sources:** each of the three citation styles ends with `## More sources` listing exactly the uncited, non-hidden sources: `[Title](url) — domain` (`www.` dropped), or `Title — domain` when the URL is null. The footnote definitions come after it. A More source also cited in the text is left out. With `includeMoreSources` off, or no uncited sources, there's no section.
7. **Title equals domain:** a source whose only title is its domain renders as `[photovault.example](https://photovault.example/)` with no repeated domain.
8. **The controller:**
   - **Copy as Markdown** uses `readReferences` when it returns data, and doesn't call the fallback.
   - It awaits `readReferencesSlowly` when `readReferences` returns null.
   - A second click while one copy is in progress does nothing.
   - The native override never calls `readReferencesSlowly`.
9. **Settings and options page:** `includeMoreSources` defaults to true for Copilot and survives a merge. The options page shows its toggle, and toggling it reports a full settings object.
10. **Built manifest:** `dist/manifest.json` has the isolated entry and a `world: "MAIN"` entry with `page-copilot.js` and Copilot's matches, and `dist/page-copilot.js` exists.

### Manual Verification
1. Run `npm run build`, then click reload on the extension in `chrome://extensions` and refresh Copilot.
2. Open a test conversation and click M↓ on a reply with two same-domain citations, then paste into Obsidian. Expect:
   - two footnotes with full titles, `deploykit/docs/sandbox-setup.md at main · example-dev/…` and `[Bug]: Install fails in a sandbox · Issue #123 · deploykit/…`, each `— github.com`;
   - a **More sources** section with the four More articles, linked;
   - no Sources panel opening (the React path).
3. Copy another reply with web citations the same way: three titled citations and three More sources, compared against its Sources panel.
4. Exercise the fallback: in DevTools on the Copilot tab, run `document.addEventListener("acf:request-references", e => e.stopImmediatePropagation(), true)`. This blocks the page script's reply, as if the React data weren't readable. Click M↓: the panel opens briefly and closes. The paste has the same titled citations, and the More entries are written `Title — domain` without links. Reload the page to undo.
5. Repeat step 4 with the Sources panel already open on another reply: it ends up showing this reply's sources and stays open.
6. Turn off **Include "More" sources** and copy again: no More section.
7. Switch to **Inline links + Sources list**, then **Sources list only**, copying after each: entries keep the `— domain` suffix, and More sources stays last.
8. With the override on, Copilot's own Copy button gives the same output as M↓ (React path). With step 4's blocker active, it gives 0.1.0-style citations and no More section, and no panel opens.
