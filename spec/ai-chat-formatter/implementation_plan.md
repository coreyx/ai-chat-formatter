---
status: approved
---

# AI Chat Formatter: a Chrome extension that copies LLM chat replies as clean Markdown with their citations

A Manifest V3 Chrome extension (it also loads in Edge) that adds a **Copy as Markdown** button to each assistant reply on supported LLM chat sites. It can also, optionally, take over the site's own Copy button. Instead of trusting the site's clipboard output, the extension builds Markdown from the reply as rendered on the page. That output is ready to paste into Obsidian, and it includes the reply's citations, which the native Copy button loses. Each site is a self-contained adapter, keyed by an id and any number of URL match patterns. Microsoft Copilot is the first site.

## User Review Required

> [!IMPORTANT]
> **The extension reads Copilot's rendered page, which is undocumented and will change.** Every selector below was confirmed on copilot.com on 2026-10-24. When Copilot changes its markup, the Copilot adapter needs updating. The failure behavior is designed for that: if the extension can't read a reply, the **Copy as Markdown** button says so in a toast, and an overridden native Copy button falls back to Copilot's own copy. Neither copies half-converted content.

> [!IMPORTANT]
> **v0.1.0 supports consumer Copilot only** (`copilot.microsoft.com`, which now redirects to `copilot.com`). Earlier we agreed on consumer and M365 Copilot together. M365 Copilot (`m365.cloud.microsoft` and related hosts) is a separate app with its own markup, which I haven't been able to inspect. Shipping an adapter written blind would mean selectors that fail silently. So M365 becomes its own follow-up adapter, once someone can inspect it from a work account.

> [!IMPORTANT]
> **The clipboard gets Markdown as `text/plain` only, with no `text/html`.** If HTML were included, Obsidian's HTML-to-Markdown conversion would take over on paste and bring the quirks back. The trade-off: pasting into Word or Outlook gives raw Markdown. Copilot's own Copy button, when not overridden, still produces rich text for those apps.

> [!NOTE]
> **Paste with Source compatibility.** A `text/plain`-only write puts no `HTML Format` on the Windows clipboard, so there's no `SourceURL:` header. Chrome does still write the page URL as UTF-8 under the custom format `Chromium internal source URL` (verified 2026-10-24); on macOS the same format is `org.chromium.source-url`. Rather than add HTML here, [Paste with Source](https://github.com/coreyx/obsidian-paste-with-source) will read that format on Windows. That's separate work in its own repo, requested on 2026-10-24. Until it ships, pasting this extension's output on Windows gets no Paste with Source citation.

> [!IMPORTANT]
> **Git, release and distribution.** `coreyx/ai-chat-formatter` exists, is empty and public. Because `main` has no commits yet, I'll commit straight to `main` while implementing (one commit per task, with the trailer convention), then push. The release step publishes a GitHub release with a zip of the built extension. Installation is **Load unpacked**, as described in the README. There's no Chrome Web Store listing. Approving this plan authorizes the push, the `0.1.0` tag and the GitHub release. Later work goes back to branches and PRs.

> [!NOTE]
> **What the Copilot inspection found.** I sent one test prompt on copilot.com and captured what its Copy button writes:
> - The button calls `navigator.clipboard.write` with two formats. `text/plain` is rendered text with no Markdown: no heading or list markers, no link URLs, no citations. `text/html` is semantic HTML except for two things.
> - **Citations** come through as `<a href="url">[widget.example]</a>`. Obsidian's conversion turns these into the `[[widget.example]](<url>)` hybrid links you saw.
> - **Code blocks** lose their `<pre>`. Every line becomes its own `<div><span>…</span></div>`, so Obsidian turns each line into a separate paragraph. That's the blank-line ASCII-tree problem, and the fence and language are lost as well.
>
> The live page carries more than the clipboard does: each citation chip includes JSON with its URL and source name, plus an `aria-label` with the page title. That's what makes reliable citation capture possible.

> [!NOTE]
> **The Obsidian plan's `hybrid-links`, `ascii-tree-spacing` and `code-block-headers` rules are dropped.** With the extension writing the Markdown, those problems never happen: citations and code blocks get converted correctly in the first place. The post-processing rule pipeline stays, with each rule toggleable per site, so you can add rules as you find new quirks. v0.1.0 ships two generic rules, `invisible-characters` and `collapse-blank-lines`.

> [!NOTE]
> **Dependency: Turndown** (MIT; the standard DOM-to-Markdown library) with `turndown-plugin-gfm` for tables and strikethrough. Each adapter adds its own Turndown rules for its citation chips, code viewer and so on. Tooling: TypeScript and esbuild, with jsdom for the regression script.

> [!NOTE]
> The test conversation I created is still in your Copilot history. Delete it whenever you like.

## Open Questions

- **Long code blocks.** Copilot's code viewer is marked as virtualized (`data-virtualized-code-find-root`). A 20-line block had every line in the DOM even when scrolled out of view, but very long blocks might not. The adapter checks that the line indices run continuously from 0 and that the line-number gutter count matches. If they don't, the copy fails with a clear message rather than dropping lines. Manual verification step 7 tests a 150-line block. If that does truncate, a follow-up can read the block through its own "Copy code" button.
- **Math.** My test reply had no math. The converter turns KaTeX output (`.katex` with an `annotation[encoding="application/x-tex"]`) into `$…$`, or into `$$…$$` for `.katex-display`. That's the standard KaTeX markup, but it isn't confirmed for Copilot yet.

## Proposed Changes

### Project scaffolding

#### [NEW] `package.json`
- [x] **TASK-1:** Add the package manifest (`name: "ai-chat-formatter"`, `version: "0.1.0"`, `private: true`, MIT, author Corey Struzan).
  - Dependencies: `turndown`, `turndown-plugin-gfm`.
  - Dev dependencies: `typescript`, `esbuild`, `@types/chrome`, `@types/turndown`, `jsdom`, `@types/jsdom`, `fflate`.
  - Scripts: `build` (`tsc --noEmit && node scripts/build.mjs`), `watch`, `test` (bundles `scratch/test_ai-chat-formatter.ts` for Node into `scratch/.out/` and runs it), `package` (build, then zip `dist/` into `release/ai-chat-formatter-<version>.zip` with `fflate`).
  - Also add `tsconfig.json` (strict, `ES2022`, DOM libs), `.gitignore` (`node_modules/`, `dist/`, `release/`, `scratch/.out/`, OS/editor files) and an MIT `LICENSE`. Run `npm install` and commit the lockfile.

#### [NEW] `scripts/build.mjs`
- [ ] **TASK-2:** Add the build script. It bundles `src/content/index.ts` → `dist/content.js` and `src/options/options.ts` → `dist/options.js` (esbuild, IIFE, ES2022, minified unless `--dev`), and copies `src/content/content.css` and `src/options/options.html` into `dist/`. It then writes `dist/manifest.json` from `src/manifest.json` with two values filled in: `version`, read from `package.json`, and `content_scripts[0].matches`, the union of every adapter's `matches` (collected by bundling `src/sites/index.ts` for Node and reading `SITE_ADAPTERS`). Adding a site therefore never means editing match patterns in two places. `--watch` rebuilds on change.

#### [NEW] `src/manifest.json`
- [ ] **TASK-3:** Add the manifest template: `manifest_version: 3`, `name: "AI Chat Formatter"`, a description, `permissions: ["storage", "clipboardWrite"]`, one `content_scripts` entry (`js: ["content.js"]`, `css: ["content.css"]`, `run_at: "document_idle"`, `matches` filled in at build time), `options_ui: { page: "options.html", open_in_tab: true }`, `minimum_chrome_version: "120"`. There are no host permissions beyond the content-script matches, and no background worker.

### Core (site-independent)

#### [NEW] `src/core/types.ts`
- [x] **TASK-4:** Define the shared types:
  - `Citation` (`url`, `title`, `sourceName`).
  - `CitationStyle` (`"footnotes" | "inline-links-and-sources" | "sources-only"`).
  - `FormatRule` (`id`, `name`, `description`, `defaultEnabled`, `apply(markdown): string`).
  - `ConversionContext` (`registerCitation(c: Citation): string`, which returns the placeholder to emit inline).
  - `SiteAdapter` (`id`, `name`, `matches: string[]` as MV3 match patterns; `messageSelector`; `contentSelector` for the reply body inside a message; `nativeCopyButtonSelector`; `findButtonAnchor(message): { parent: Element; before: Node | null } | null` for where the extension's button goes; `stripSelectors: string[]` for page chrome removed before conversion; `turndownRules(ctx): Record<string, Turndown.Rule>`; `rules: FormatRule[]`).

#### [NEW] `src/core/citations.ts`
- [x] **TASK-5:** Add citation handling:
  - `CitationCollector` numbers citations by first appearance and de-duplicates by normalized URL (lower-case host, no trailing `/`, no `#fragment`). `register()` returns a placeholder `⟦cite:N⟧`; Turndown doesn't escape `⟦`/`⟧`.
  - `renderCitations(markdown, citations, style)`:
    - Drops whitespace before a placeholder and collapses repeats of the same citation in a row.
    - `footnotes` (the default) writes `[^N]` inline and appends `[^N]: [Title](url)` definitions.
    - `inline-links-and-sources` writes `[N](url)` inline and appends a `## Sources` list of `N. [Title](url)`.
    - `sources-only` removes the placeholders and appends just the `## Sources` list.
    - With no citations, nothing is appended.
  - `parseCitationTitle(ariaLabel, fallbackName, url)` takes the last ` — `-separated part of `Citation: widget — Widget — Widget 5.0.0 (Current)`. It falls back to the source name, then the URL's hostname.

#### [NEW] `src/core/rules.ts`
- [x] **TASK-6:** Add the shared rules and the runner:
  - `invisibleCharactersRule` turns U+00A0 and U+202F into spaces and removes U+200B, U+200C, U+200D, U+2060 and U+FEFF.
  - `collapseBlankLinesRule` turns two or more blank lines into one and trims leading and trailing blank lines. It leaves fenced code blocks alone; a `mapOutsideCodeFences(text, fn)` helper handles ``` and ~~~ fences of any length.
  - `runRules(markdown, rules, isEnabled)` applies the enabled rules in order.

#### [NEW] `src/core/convert.ts`
- [x] **TASK-7:** Add `convertMessage(adapter, messageElement, style, isRuleEnabled): string`. It:
  - Finds `adapter.contentSelector`, deep-clones it and removes `adapter.stripSelectors`.
  - Converts it with a Turndown instance (`headingStyle: "atx"`, `codeBlockStyle: "fenced"`, `bulletListMarker: "-"`, `emDelimiter: "*"`, GFM plugin) plus the adapter's rules and a shared KaTeX rule.
  - Runs the adapter's post-processing rules, then `renderCitations`.

  Everything is synchronous, so an overridden native click can decide whether to take over before Copilot's handler runs. It throws `ConversionError` (with a user-facing message) when the content root is missing or an adapter rule reports incomplete content.

#### [NEW] `src/core/settings.ts`
- [x] **TASK-8:** Add the settings:
  - Shape: `Settings` (`enabled`, `citationStyle` defaulting to `"footnotes"`, `sites: Record<id, { enabled; showCopyButton: true; overrideNativeCopy: false; rules: Record<ruleId, boolean> }>`).
  - `buildDefaultSettings(adapters)`, and `mergeSettings(stored, defaults)`, which keeps stored values and fills in anything missing. That way a site or rule added in a later version gets its default without a migration.
  - `loadSettings()` / `saveSettings()` on `chrome.storage.sync`, and `onSettingsChanged(callback)`.

### Sites

#### [NEW] `src/sites/copilot.ts`
- [ ] **TASK-9:** Add `copilotAdapter` (`id: "copilot"`, `name: "Copilot"`, `matches: ["https://copilot.microsoft.com/*", "https://copilot.com/*"]`) using the selectors confirmed during the inspection:
  - **Message:** `div[role="article"]` that contains `[data-testid="markdown-reply"]` (the reply body, which carries `data-message-id`).
  - **Native Copy:** `button[data-testid="CopyButtonTestId"]` (aria-label "Copy Response"), inside `[data-testid="CopyButtonContainerTestId"]`, in the message's `[role="toolbar"]`. The extension's button goes directly after that container.
  - **Citation chips:** each `button[data-grouped-citations]` holds a JSON array of `{ index, occurrence, url, name }`, plus an `aria-label` like "Citation: widget — Widget — Widget 5.0.0 (Current)". The Turndown rule registers every entry and emits its placeholders. Invalid JSON falls back to the chip's text and is never fatal.
  - **Code blocks:** `.scriptor-component-code-block`. Language comes from `[data-testid="one-copilot-code-identity"] span`, mapped to fence ids ("Plain Text" → none; "JavaScript" → `javascript`; "TypeScript" → `typescript`; "Python" → `python`; "C#" → `csharp`; "C++" → `cpp`; "Shell"/"Bash" → `bash`; "PowerShell" → `powershell`; anything else lower-cased with spaces removed). Lines come from `[aria-label="Code editor"] [data-line-index]`, sorted numerically and joined with `\n`. The fence is longer than any backtick run in the code. If the indices aren't continuous from 0, or don't match the `[data-line-number]` count, the rule throws `ConversionError("A code block isn't fully loaded…")`.
  - **Strip selectors:** the code-block toolbar (`[data-testid="one-copilot-code-identity"]`'s header row and its buttons) and any `[role="status"]`/`[aria-live]` regions.
  - **Rules:** `[invisibleCharactersRule, collapseBlankLinesRule]`.

#### [NEW] `src/sites/index.ts`
- [ ] **TASK-10:** Add the registry: `SITE_ADAPTERS: SiteAdapter[] = [copilotAdapter]`, `matchPatternToRegExp(pattern)` (MV3 scheme, host and path globbing) and `findAdapterForUrl(url)`. A new site means one new module plus one entry here; the manifest picks up its matches from the build script.

### Content script and options page

#### [NEW] `src/content/index.ts`
- [ ] **TASK-11:** Add the content script:
  - **Setup:** pick the adapter for `location.href` (exit if there's none), load settings, and re-apply them live through `onSettingsChanged`.
  - **Injected button:** while `enabled`, the site is enabled and `showCopyButton` is on, a `MutationObserver` on `document.body` (debounced to one animation frame) puts a **Copy as Markdown** button (`button.acf-copy-button`, inline Markdown-glyph SVG, `aria-label` and `title` "Copy as Markdown") at each message's `findButtonAnchor`. A `data-acf-injected` marker prevents duplicates. Turning the setting off removes the buttons. A click converts the message, writes it with `navigator.clipboard.writeText`, and shows a checkmark for 1.5 seconds. On a `ConversionError` or clipboard error it shows a toast (`div.acf-toast`, 4 seconds) with the message.
  - **Native override:** while `overrideNativeCopy` is on, a capture-phase `click` listener on `document` catches clicks inside `nativeCopyButtonSelector`. It converts synchronously. On success it calls `preventDefault()` and `stopImmediatePropagation()`, then writes the Markdown. On failure it lets the event through, so Copilot's own copy runs, and logs a `console.warn` prefixed `[AI Chat Formatter]`.

#### [NEW] `src/content/content.css`
- [ ] **TASK-12:** Style `.acf-copy-button` to sit with Copilot's toolbar icons: 32px square, transparent background, `currentColor` icon, rounded hover background, visible focus ring. Add the copied (checkmark) state and the `.acf-toast` (fixed bottom-center, readable in light and dark). Class names are prefixed `acf-` so they don't clash with the page.

#### [NEW] `src/options/options.html` + `src/options/options.ts`
- [ ] **TASK-13:** Add the options page, built from `SITE_ADAPTERS` and the stored settings. Every change saves immediately.
  - A master **Enable AI Chat Formatter** toggle.
  - **Citation style**: three radio buttons with a one-line example of each, footnotes by default.
  - One section per site listing its URL patterns, with toggles for **Enabled**, **Show "Copy as Markdown" button** (on), **Use for the site's own Copy button** (off), and one per rule (name plus description).
  - Plain HTML and CSS that follows `prefers-color-scheme`.

### Tests

#### [NEW] `scratch/fixtures/copilot-message.html` + `scratch/test_ai-chat-formatter.ts`
- [ ] **TASK-14:** Add a fixture that copies the structure confirmed on copilot.com (`role="article"` message, `markdown-reply` body, headings, nested lists, inline code, a normal link, citation chips with `data-grouped-citations`/`aria-label`, an `<hr>`, the code viewer with `data-line-index`/`data-line-number` lines and a language label, and the toolbar with the native Copy button). Add the regression script described under Verification Plan, run with jsdom by `npm test`. It prints `PASS`/`FAIL` per check plus a summary and exits non-zero on any failure.

### Docs and release

#### [NEW] `README.md`
- [ ] **TASK-15:** Write the README:
  - What the extension does, and why it's needed (what Copilot's Copy button loses, from the inspection findings).
  - Supported sites, the three citation styles with examples, and the settings.
  - Limitations: undocumented markup, consumer Copilot only for now, `text/plain` only.
  - **Installation:** download the release zip, extract it to a permanent folder, open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, click **Load unpacked** and choose the folder.
  - **Updating:** replace the folder's contents with the new release, then click the reload icon on the extension's card.
  - **Build from source.**
  - **Adding a site:** write a `SiteAdapter`, register it in `src/sites/index.ts`, and add a fixture and tests.

#### [MODIFY] GitHub repository `coreyx/ai-chat-formatter`
- [ ] **TASK-16:** After `wrap-up` and `prepare-release` have produced `CHANGELOG.md` and `RELEASE_NOTES.md` for `0.1.0`:
  1. Run `npm run package`.
  2. Push `main`.
  3. Create the release tag in the form `prepare-release` uses.
  4. Run `gh release create` with `release/ai-chat-formatter-0.1.0.zip` attached and the notes from `RELEASE_NOTES.md`.
  5. Confirm the asset with `gh release view`.

## Verification Plan

### Automated Tests
`npm test` runs `scratch/test_ai-chat-formatter.ts` against the fixture and checks:
1. **Registry:** `findAdapterForUrl` matches `https://copilot.microsoft.com/`, `https://copilot.com/chat/conversation/<id>` (with and without a query string), and nothing for `https://example.com`, `https://m365.cloud.microsoft/chat` or an empty string. `matchPatternToRegExp` handles `*` in paths.
2. **Conversion structure:** the fixture gives ATX headings, `1.` ordered items with `-` nested bullets, `` `code` `` inside list items, `**bold**`, a normal `[Widget 5.0.0 (Current) Release Notes](url)` link and `---`. No toolbar or button text leaks in ("Copy code", "Plain Text", "widget" chip labels).
3. **Code blocks:** the ASCII tree becomes one fenced block with no blank lines between tree lines and no line numbers. "Plain Text" gets no language; a "Python" block gets ```` ```python ````. A block with a gap in `data-line-index` throws `ConversionError`.
4. **Citations:**
   - Footnotes: markers sit directly after the preceding text (`…release.[^1]`), repeat chips for the same URL reuse one number and adjacent duplicates collapse, and there's one definition `[^1]: [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0)`.
   - `inline-links-and-sources` and `sources-only` produce their documented forms.
   - A reply without chips gets nothing appended.
   - Invalid chip JSON doesn't throw.
5. **`parseCitationTitle`** returns the last segment, then the name, then the hostname.
6. **Rules:** invisible characters are normalized; three or more blank lines collapse outside fences but not inside them; a disabled rule is skipped.
7. **Settings:** `mergeSettings` fills in a missing site or rule from the defaults and keeps stored values.
8. **Manifest:** after `npm run build`, `dist/manifest.json` has version `0.1.0`, both Copilot match patterns, and `content.js`/`content.css`.

### Manual Verification
1. Run `npm run build`. In Chrome, open `chrome://extensions`, turn on Developer mode, use **Load unpacked** on `dist/`, and confirm it loads without errors.
2. On copilot.com, ask something that returns web citations, a link, a list and an ASCII tree in a code block. When the reply finishes, a **Copy as Markdown** button appears next to Copilot's Copy button. Click it (checkmark), then paste into an Obsidian note. Expect: headings and lists intact, the tree in one fenced block with no blank lines, no `[[…]](<…>)` hybrids, inline `[^1]` markers, and footnote definitions that render as linked sources in Reading view.
3. In the options page, switch the citation style to **Inline links + Sources**, then **Sources only**. Copy the same reply after each change and confirm the output matches, with no page reload needed.
4. Turn on **Use for the site's own Copy button**. Click Copilot's Copy and paste: expect the same Markdown as step 2. Turn it off and click Copilot's Copy again: expect Copilot's native output.
5. Turn off **Show "Copy as Markdown" button** and confirm the buttons disappear live. Turn it back on and they return. Turn the master toggle off and confirm both behaviors stop.
6. Send another prompt and confirm the new reply gets the button. Reload an older conversation and confirm every reply gets exactly one button.
7. Ask for a 150-line code file. Copy as Markdown and confirm the pasted block has all 150 lines, or that a clear "isn't fully loaded" toast appears, not a silently truncated block.
8. Load the same `dist/` in Edge (`edge://extensions`) and repeat step 2.
9. After the release, download the zip from GitHub, extract it, load it unpacked in a clean Chrome profile, and repeat step 2.
