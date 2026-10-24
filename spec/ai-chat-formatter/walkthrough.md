# Walkthrough: AI Chat Formatter

A Manifest V3 Chrome extension that adds a **Copy as Markdown** button to each Microsoft Copilot reply, and can optionally take over Copilot's own Copy button. It builds Markdown from the reply as rendered on the page, not from Copilot's lossy clipboard output, so citations survive in a choice of three styles and code blocks keep their fences, languages and exact indentation. Sites are pluggable adapters, and Copilot is the first.

## What Was Implemented

### 1. Project and build
- **`package.json`, `tsconfig.json`, `.gitignore`, `.gitattributes`, `LICENSE`**: TypeScript 7 and esbuild tooling, with Turndown and its GFM plugin as the only runtime dependencies. MIT license; line endings normalized to LF.
- **`scripts/build.mjs`**: bundles the content script and the options page into `dist/` and copies the stylesheet and options HTML. It writes `dist/manifest.json` from `src/manifest.json`, filling in the version from `package.json` and the content-script match patterns from every site adapter, so a site's URLs are only ever listed once. `--dev` adds source maps, and `--watch` rebuilds on change.
- **`scripts/package.mjs`**: zips `dist/` into `release/ai-chat-formatter-<version>.zip` for releases.
- **`src/manifest.json`**: MV3 template with `storage` and `clipboardWrite` permissions, one content script, and an options page. No host permissions beyond the content-script matches, and no background worker.

### 2. Core (site-independent)
- **`src/core/types.ts`**: `SiteAdapter`, `Citation`, `CitationStyle`, `FormatRule` and `ConversionError`. During implementation, adapters gained an optional `preprocess` hook (see section 3).
- **`src/core/citations.ts`**: `CitationCollector` numbers citations by first appearance, merging repeats of the same page (fragment and trailing slash ignored). `renderCitations` writes them as Obsidian footnotes (the default), inline links plus a Sources list, or a Sources list only. A marker attaches to the text before it, including across a non-breaking space, and the same citation repeated back to back collapses into one marker. `parseCitationTitle` takes the page title from the chip's `aria-label`.
- **`src/core/rules.ts`**: `invisible-characters` and `collapse-blank-lines`, plus a `mapOutsideCodeFences` helper that follows CommonMark fence rules. The invisible-character rule keeps zero-width joiners between pictographs, so emoji like 👨‍👩‍👧 aren't broken; the plan had listed U+200D for unconditional removal.
- **`src/core/convert.ts`**: `convertMessage` clones the reply body, strips page chrome, runs the adapter's `preprocess`, and converts with Turndown. Turndown is configured for ATX headings, fenced code, `-` bullets, compact list markers, and KaTeX to `$`/`$$`, with adapter rules taking precedence over shared ones. List items whose lead paragraph is followed by a nested list stay tight, matching how Copilot shows them. Post-processing rules run *after* citations are rendered, a reorder from the plan, so citation titles are cleaned up too. Conversion is synchronous, so the native Copy override can fall back before Copilot's handler runs.
- **`src/core/settings.ts`**: settings in `chrome.storage.sync`. Defaults are derived from the adapters, and stored values are merged over them with type checks, so new sites or rules need no migration. Changes reach open tabs live.

### 3. Copilot adapter and registry
- **`src/sites/copilot.ts`**: selectors from inspecting copilot.com on 2026-10-24:
  - a reply is `div[role="article"]` containing `[data-testid="markdown-reply"]`;
  - the native Copy button is `button[data-testid="CopyButtonTestId"]`;
  - the extension's button goes directly after the native Copy button, in the flex row it shares with the feedback buttons. The plan put it after `[data-testid="CopyButtonContainerTestId"]`; that container turned out to hold Copy, the feedback buttons and Regenerate, which put the button too far from Copy. Moved at the maintainer's request after the first test.

  Citation chips (`button[data-grouped-citations]`) register every source in their JSON. A chip with unreadable JSON keeps its text rather than failing the copy.

  **Change from the plan:** Copilot's code viewer is rebuilt as `<pre><code class="language-…">` in `preprocess`, not handled by a Turndown rule. Turndown collapses whitespace outside `<pre>` before any rule runs, which would have flattened ASCII-tree indentation. A block whose line indices aren't continuous, or don't match its line-number gutter, throws instead of copying a truncated block.
- **`src/sites/index.ts`**: `SITE_ADAPTERS`, `matchPatternToRegExp` (Chrome's match-pattern rules) and `findAdapterForUrl`.

### 4. Content script and options page
- **`src/content/controller.ts`**: `ContentController` keeps one **Copy as Markdown** button on each finished reply, using a frame-debounced `MutationObserver`; a reply still streaming gets its button once its toolbar appears. It writes the Markdown with a checkmark for confirmation, or shows a toast on failure. With the override on, a capture-phase click listener on `window` replaces Copilot's Copy, but only when conversion succeeds; otherwise Copilot's copy runs. The document and clipboard writer are parameters, so it's testable with jsdom. This split into a controller and an entry point wasn't in the plan.
- **`src/content/index.ts`**: wires the controller to the live page and the settings.
- **`src/content/content.css`**: a 32px button using `currentColor`, matching Copilot's toolbar, and a toast readable on either theme. Every class is prefixed `acf-`.
- **`src/options/options.html`, `src/options/options.ts`**: master switch; citation style with an example of each; and per site, enable, button, override and rule switches. Each change saves immediately, and site details grey out when the site is off. `renderOptions` is separate from the page bootstrap so it can be tested.

### 5. Docs
- **`README.md`**: what Copilot's Copy loses, features, supported sites, citation styles with examples, settings, installation via **Load unpacked** (Chrome and Edge), updating, building, Paste with Source compatibility (1.6.0+ on Windows), limitations, development commands and how to add a site.

## Verification & Test Results

### Automated Tests
`npm test` builds `dist/`, then runs `scratch/test_ai-chat-formatter.ts` (jsdom, against `scratch/fixtures/copilot-message.html`). **38/38 checks passed**:
- Citations: numbering and de-duplication, URL normalization, all three styles, marker attachment and collapsing, escaping of link-breaking titles and URLs, title fallbacks: **Passed**
- Rules: invisible characters (with emoji joiners kept), blank-line collapsing outside but not inside fences (including longer and tilde fences), disabled rules skipped: **Passed**
- Converter: compact nested lists, headings, strip selectors, KaTeX inline and display, missing reply body: **Passed**
- Copilot fixture: exact expected Markdown with footnotes; no chrome or chip labels leaking; the source page left untouched; a missing code line throws; bad chip JSON and multi-source chips; language mapping; button anchor: **Passed**
- Registry: Copilot URLs match and others don't; Chrome match-pattern rules; adapter ids and patterns valid: **Passed**
- Settings: defaults from adapters; merging stored, missing and invalid values: **Passed**
- Controller: one button per finished reply; button added once the toolbar appears; live on/off; Copy as Markdown writes without reaching the site; failed conversion shows a toast and copies nothing; native Copy untouched with the override off, replaced with it on, and falling back on conversion failure: **Passed**
- Options page: values shown, each change reported as a full settings object, site details disabled when the site is off: **Passed**
- Built manifest: version, every adapter's matches, bundle and stylesheet entries, non-empty files: **Passed**

`tsc --noEmit` passes with no errors.

Two checks failed while being written and were fixed before their items were committed:
- A non-breaking space before a citation wasn't attached. `renderCitations` now absorbs it.
- One expectation was wrong about how a kept chip label is spaced, and was corrected.

### Regression Testing
This is the project's first spec, so there were no earlier scripts to re-run. The suite was re-run after every task, and its final run was **38/38**.

### Checked on the live site
On copilot.com, using the conversation created for the plan's inspection (no new prompts sent):
- Every selector and data shape the adapter relies on was confirmed. 1 reply among 2 articles; the native Copy button and its container inside the message; a 20-line code block whose line indices are continuous and match its gutter; 11 citation chips, all with parseable single-source JSON and title-bearing `aria-label`s; the live regions to strip are present.
- The button markup and stylesheet were injected by hand. The button matched Copilot's toolbar buttons (32×32, same color), and the toast showed below the message box. Placed directly after Copy, it sits 8px from it, the same spacing as the other toolbar icons, in the order Copy, M↓, thumbs, Regenerate.

## Manual Verification
The maintainer loaded `dist/` with **Load unpacked**, used **Copy as Markdown** on the test conversation, pasted into Obsidian and confirmed it works (2026-10-24). The plan's other manual steps haven't been confirmed yet:
1. Options page: switch the citation style to **Inline links + Sources list**, then **Sources list only**. Copy the same reply after each change and confirm the output matches, with no page reload.
2. Turn on **Use for Copilot's own Copy button**, click Copilot's Copy and paste: expect the same Markdown plus a "Copied as Markdown" toast. Turn it off: expect Copilot's native output.
3. Turn off **Show a "Copy as Markdown" button**: the buttons disappear live and return when it's turned back on. The master switch turns off both features.
4. Send a new prompt: the new reply gets a button once it finishes. Reload an older conversation: every reply has exactly one button.
5. Ask for a code file of about 150 lines and copy it: expect all lines, or a clear "isn't fully loaded" toast, never a silently shortened block.
6. Load `dist/` in Edge (`edge://extensions`) and repeat the basic copy.
7. With Paste with Source 1.6.0 or later on Windows, paste a copied reply: the citation uses the Copilot conversation URL.
8. After the release, install from the zip in a clean Chrome profile and repeat the basic copy.

## Follow-ups
- **Released as 0.1.0** on 2026-10-24: https://github.com/coreyx/ai-chat-formatter/releases/tag/0.1.0 (asset `ai-chat-formatter-0.1.0.zip`, checksum verified against the local build).
- **Microsoft 365 Copilot** (`m365.cloud.microsoft`) needs its own adapter. Its markup couldn't be inspected without a work account.
- **Long code blocks:** if manual step 5 shows Copilot leaves lines out of very long blocks, a follow-up could read the block through its own Copy code button.
- **Math** conversion follows standard KaTeX markup but hasn't been seen in a Copilot reply yet.
- **Extension icons** weren't part of the plan; Chrome shows its default icon.
- The test conversation remains in the maintainer's Copilot history.
