# AI Chat Formatter

A Chrome extension (it also runs in Edge) that copies replies from AI chat sites as clean Markdown, citations included, ready to paste into Obsidian.

It adds a **Copy as Markdown** button to every reply. If you prefer, it can also take over the site's own Copy button. Microsoft Copilot is the first supported site; each site is a separate adapter, so more can be added.

## Why

Copilot's Copy button doesn't produce Markdown, and what it does produce falls apart in Obsidian:

- **Citations turn into broken links.** Each citation is copied as a link whose text is `[widget.example]`, so Obsidian pastes `[[widget.example]](<https://…>)`, half wikilink and half Markdown link.
- **Code blocks lose their formatting.** Every line of a code block is copied as a separate paragraph, so an ASCII directory tree pastes with blank lines between its lines, and the code fence and language are gone.
- **The plain-text version is no better.** It has no heading or list markers, no link URLs and no citations at all.

AI Chat Formatter reads the reply from the page instead, where the structure and the citation details are still intact, and writes proper Markdown to the clipboard.

## Features

- **Copy as Markdown** button on every reply, next to the site's own buttons.
- Optionally, **the site's own Copy button copies Markdown too**. If a reply can't be converted, the site's normal copy runs instead, so the button always copies something.
- **Citations kept**, in the style you choose (see below). A page cited several times gets one number.
- **Code blocks** come through as fenced blocks with their language and exact indentation.
- **Headings, lists, tables, links, inline code and math** (`$…$` and `$$…$$`) convert to their Markdown equivalents.
- **Clean-up rules** you can switch on and off per site: normalizing invisible characters (non-breaking and zero-width spaces) and collapsing runs of blank lines.
- **Settings apply immediately** to open chat tabs; no reload needed.

## Supported sites

| Site | Pages |
|---|---|
| Microsoft Copilot | `copilot.microsoft.com`, `copilot.com` |

Microsoft 365 Copilot (`m365.cloud.microsoft`) is a separate app with different markup, and isn't supported yet.

## Citation styles

Choose one on the options page. For a reply citing the Widget release notes:

**Obsidian footnotes** (default)

```markdown
Widget 5 was released in May.[^1]

[^1]: [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0)
```

**Inline links + Sources list**

```markdown
Widget 5 was released in May.[1](https://widget.example/releases/5.0.0)

## Sources

1. [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0)
```

**Sources list only**

```markdown
Widget 5 was released in May.

## Sources

1. [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0)
```

## Settings

Open them from `chrome://extensions` → **AI Chat Formatter** → **Details** → **Extension options**.

- **Enable AI Chat Formatter**: turns everything on or off.
- **Citation style**: one of the three styles above.
- Per site:
  - **Enable on _site_**
  - **Show a "Copy as Markdown" button**: on by default.
  - **Use for _site_'s own Copy button**: off by default.
  - **Formatting rules**: one switch per clean-up rule.

## Installation

AI Chat Formatter isn't in the Chrome Web Store. Install it from a GitHub release.

1. Download `ai-chat-formatter-<version>.zip` from the [latest release](https://github.com/coreyx/ai-chat-formatter/releases/latest).
2. Extract it to a folder you'll keep, such as `Documents\Extensions\ai-chat-formatter`. Chrome loads the extension from that folder every time it starts, so don't delete it.
3. Open `chrome://extensions` (in Edge, `edge://extensions`).
4. Turn on **Developer mode**.
5. Click **Load unpacked** and choose the folder from step 2.
6. Open a Copilot conversation. Finished replies now have a **Copy as Markdown** button.

### Updating

1. Download the newer release's zip and extract it over the same folder, replacing its files.
2. On `chrome://extensions`, click the reload icon on the **AI Chat Formatter** card.
3. Reload any open Copilot tabs.

### Building from source

```bash
git clone https://github.com/coreyx/ai-chat-formatter.git
cd ai-chat-formatter
npm install
npm run build
```

Then follow the installation steps from step 3, choosing the `dist/` folder.

## Pasting with Paste with Source

The extension writes Markdown to the clipboard as plain text only, so Obsidian pastes exactly that Markdown instead of converting HTML. One effect on Windows: a plain-text copy carries no `HTML Format` `SourceURL`, which [Paste with Source](https://github.com/coreyx/obsidian-paste-with-source) has used to find the page a paste came from. Chrome still records the page URL in its `Chromium internal source URL` clipboard format, and Paste with Source [1.6.0](https://github.com/coreyx/obsidian-paste-with-source/releases/tag/1.6.0) and later read it on Windows (setting: **Cite plain-text copies from Chromium apps**, on by default). With an older version, pastes from this extension on Windows get no citation. On macOS, Paste with Source reads Chrome's equivalent (`org.chromium.source-url`).

## Limitations

- **The extension depends on each site's page markup**, which isn't a documented API and can change without notice. When Copilot changes its markup, the Copilot adapter needs an update. Until then, Copy as Markdown shows an error rather than copying a broken reply, and an overridden Copy button falls back to Copilot's own copy.
- **Plain text only on the clipboard.** Pasting into Word or Outlook gives raw Markdown. Use the site's own Copy button (with the override off) for those apps.
- **Very long code blocks.** Copilot may not keep every line of a long code block in the page. If any line is missing, the copy stops with a message instead of copying a shortened block. Scroll through the code block and try again, or use Copilot's own Copy button.

## Development

| Command | What it does |
|---|---|
| `npm run build` | Type-checks and builds the extension into `dist/` |
| `npm run watch` | Rebuilds `dist/` on every change, with source maps |
| `npm test` | Builds, then runs the regression checks in `scratch/test_ai-chat-formatter.ts` |
| `npm run package` | Builds and zips `dist/` into `release/ai-chat-formatter-<version>.zip` |

```text
ai-chat-formatter/
├── scripts/
│   ├── build.mjs        # Bundles with esbuild, writes dist/manifest.json
│   └── package.mjs      # Zips dist/ for a release
├── src/
│   ├── manifest.json    # Manifest template; version and match patterns are filled in at build
│   ├── core/            # Site-independent: types, conversion, citations, rules, settings
│   ├── sites/           # One adapter per site, plus the registry (index.ts)
│   ├── content/         # Content script: button injection and the Copy override
│   └── options/         # Options page
└── scratch/
    ├── fixtures/        # Page markup samples the tests convert
    └── test_ai-chat-formatter.ts
```

### Adding a site

1. Inspect the site: how each reply is marked up, where its Copy button and toolbar are, how citations and code blocks are rendered, and what the Copy button actually writes.
2. Write `src/sites/<site>.ts` exporting a `SiteAdapter` (see `src/core/types.ts`). It provides:
   - its id, name and URL match patterns,
   - selectors for messages, the reply body and the native Copy button,
   - where the button goes,
   - Turndown rules for anything site-specific, such as citations,
   - an optional `preprocess` step for whitespace-sensitive markup like code viewers,
   - its post-processing rules.
3. Add it to `SITE_ADAPTERS` in `src/sites/index.ts`. The build adds its match patterns to the manifest, and the options page gives it a section automatically.
4. Save a trimmed copy of the site's markup under `scratch/fixtures/` and add checks for it to `scratch/test_ai-chat-formatter.ts`.

## License

[MIT](LICENSE)
