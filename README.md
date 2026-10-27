# AI Chat Formatter

A Chrome extension (it also runs in Edge and Brave) that copies replies from AI chat sites as clean Markdown, citations included, ready to paste into Obsidian.

It adds a **Copy as Markdown** button to every reply. If you prefer, it can also take over the site's own Copy button. It supports Microsoft Copilot, Duck.ai and DuckDuckGo's Search Assist; each site is a separate adapter, so more can be added.

## Why

Copilot's Copy button doesn't produce Markdown, and what it does produce falls apart in Obsidian:

- **Citations turn into broken links.** Each citation is copied as a link whose text is `[widget.example]`, so Obsidian pastes `[[widget.example]](<https://…>)`, half wikilink and half Markdown link.
- **Code blocks lose their formatting.** Every line of a code block is copied as a separate paragraph, so an ASCII directory tree pastes with blank lines between its lines, and the code fence and language are gone.
- **The plain-text version is no better.** It has no heading or list markers, no link URLs and no citations at all.

Duck.ai's Copy button does write Markdown, but it leaves out every link and source. So does the Copy button on Search Assist, the AI answer at the top of DuckDuckGo's search results.

AI Chat Formatter reads the reply from the page instead, where the structure and the citation details are still intact, and writes proper Markdown to the clipboard.

## Features

- **Copy as Markdown** button on every reply, next to the site's own buttons.
- Optionally, **the site's own Copy button copies Markdown too**. If a reply can't be converted, the site's normal copy runs instead, so the button always copies something.
- **Citations kept**, in the style you choose (see below), each with its page title and domain: `[Title](url) — domain`. A page cited several times gets one number.
- **"More" sources too**: sources the site lists without citing them in the reply (Copilot's **More** in its Sources panel, Duck.ai's uncited **Read More** cards) come along after the citations, laid out like Copilot's panel. For Search Assist, the other pages it consulted can come along too, off by default.
- **Your prompt comes along**, above the reply: as a heading (H2 by default, with the reply nested below it), a blockquote, bold text or plain text. On Search Assist, the search query stands in for the prompt. You can turn this off.
- **Code blocks** come through as fenced blocks with their language and exact indentation.
- **Headings, lists, tables, links, inline code and math** (`$…$` and `$$…$$`) convert to their Markdown equivalents.
- **Clean-up rules** you can switch on and off per site: normalizing invisible characters (non-breaking and zero-width spaces) and collapsing runs of blank lines.
- **Settings apply immediately** to open chat tabs; no reload needed.

## Supported sites

| Site | Pages |
|---|---|
| Microsoft Copilot | `copilot.microsoft.com`, `copilot.com` |
| Duck.ai | `duck.ai` (Duck.ai opened from DuckDuckGo, `duckduckgo.com/?ia=chat`, redirects there) |
| DuckDuckGo Search Assist | `duckduckgo.com` search results |

Microsoft 365 Copilot (`m365.cloud.microsoft`) is a separate app with different markup, and isn't supported yet.

### Search Assist

Search Assist answers only some searches. Where it does, its answer gets the **Copy as Markdown** button, just left of its own Copy button.

- **Collapsed or expanded**, the copy holds the whole short answer: a collapsed answer is only clipped on screen, so nothing needs opening first.
- **After More**, the extended answer that **More** writes follows the short answer in the copy, with its headings, tables and lists. While it's still being written (the button shows **Stop**), Copy as Markdown says so and copies nothing; copy again once it's finished.
- The toolbar, the More button, the "Ask Duck.ai" box and the follow-up questions are left out.

## Citation styles

Choose one on the options page. Each ends with a **Sources** section laid out like Copilot's Sources panel: **Citations**, then **More** (the sources the site lists but the reply doesn't cite). For a reply citing the Widget release notes, with one More source:

**Linked citations (Obsidian)** (default)

```markdown
Widget 5 was released in May.[[#^c-k3f9-1|⁽¹⁾]]

## Sources

### Citations

1. [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0) — widget.example ^c-k3f9-1

### More

- [Widget 5 is now available | Widget Blog](https://widget.example/blog/widget-5) — widget.example
```

In Obsidian, the marker shows as a small `⁽¹⁾` link: clicking it jumps to the citation, and hovering previews it. The `^c-k3f9-1` at the end of the entry is a block ID, which Obsidian hides. The `k3f9` part is random for each copy, so two replies pasted into one note don't clash. This style exists because Obsidian's Reading view always gathers footnotes at the very bottom of a note; linked citations stay in this order in every view. It's Obsidian-specific: other Markdown apps show the `[[…]]` and `^…` syntax as text, so use one of the other styles there. Obsidian plugins that show block links as live transclusions replace each `⁽¹⁾` with a copy of its entry in Reading view.

**Obsidian footnotes**

```markdown
Widget 5 was released in May.[^1]

## Sources

### More

- [Widget 5 is now available | Widget Blog](https://widget.example/blog/widget-5) — widget.example

[^1]: [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0) — widget.example
```

Obsidian shows the footnote definitions at the bottom of the note as its own footnotes list, so they get no **Citations** heading. Without More sources, the definitions simply follow the reply.

**Inline links + Sources list**

```markdown
Widget 5 was released in May.[1](https://widget.example/releases/5.0.0)

## Sources

### Citations

1. [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0) — widget.example

### More

- [Widget 5 is now available | Widget Blog](https://widget.example/blog/widget-5) — widget.example
```

**Sources list only**: like the inline-links style, without the `[1](…)` markers in the text.

A subsection with nothing in it is left out. Turn off the More list with **Include "More" sources** on the options page.

### Where the titles and links come from

**Duck.ai.** A reply's source chips name only the site ("GitHub", `widget.example`). The page titles come from the reply's **Read More** cards: each chip is matched to the card with the same link. Read More cards that no chip in the reply cites go under **More**, so a reply with no chips at all has only a More list. A chip without a matching card keeps the site name as its title.

Some chips open a popup instead of linking, showing a domain and a count of further sources (`widget.example` with `1`). Their links aren't in the page's markup, so a small script running in Duck.ai's own page context (the extension's second content script on Duck.ai) reads them from Duck.ai's page data when you copy. Each source becomes its own citation, titled from its Read More card or from Duck.ai's own title for it. If that data can't be read, the chip gets the Read More card for the domain it shows, or is left out if there's none.

**Search Assist.** Each source chip (a favicon and a domain) becomes a citation. The chip shows its page's title only in a tooltip while you hover it, so a small script running in DuckDuckGo's own page context (the extension's second content script on DuckDuckGo) reads the titles from Search Assist's page data when you copy. If that data can't be read, the chip's domain stands in. Search Assist's data also lists every page it consulted, most of them not shown on the page and without titles. With **Include "More" sources** turned on for Search Assist, the ones no chip cites go under **More** as links named by their domain: `[forum.example](https://forum.example/…)`. That setting starts off for Search Assist.

**Copilot.** Copilot's citation chips don't always name their pages: a chip like `photovault+1` stands for two sources but names only the first. The full list, with every page title and URL, is in Copilot's own data. The extension looks for it in three places, in order:

1. **Copilot's live page data**, read by a small script that runs in Copilot's own page context (the extension's second content script). This covers every reply.
2. **The conversation data embedded in the page when it loaded.** This covers every reply that existed when you opened the conversation, but not ones written since.
3. **The reply's Sources panel**, which **Copy as Markdown** opens, reads and closes again. It's usually closed before it finishes sliding into view, so you may not see it at all. The panel shows no URLs for its **More** entries, so those come through as `Title — domain` without a link.

If none of these works, the copy still goes ahead, with the titles the chips themselves carry. The **Use for Copilot's own Copy button** option never opens the panel: it has to decide instantly, before Copilot's own handler runs.

## Settings

Open them from `chrome://extensions` → **AI Chat Formatter** → **Details** → **Extension options**.

- **Enable AI Chat Formatter**: turns everything on or off.
- **Citation style**: one of the four styles above (Linked citations by default).
- **Minimum heading level**: H1 to H6, for every site; **H1 (no change)** by default. When a copy has a heading above this level, every heading shifts down by the same amount, Sources included, so the reply can sit under your note's own headings with its hierarchy kept. With H2, a reply's `# Title` becomes `## Title`, its `##` headings become `###`, and `## Sources` becomes `### Sources`. Headings that would go past H6 stay at H6, and `#` lines in code blocks are left alone. Not used while the prompt is copied as a heading, since the reply then starts one level below the prompt.
- **Copy the prompt with the response**: on by default, for every site. Each copy starts with the prompt the reply answers; on Search Assist, the search query from the page address. If the prompt can't be found, for example an old message Copilot no longer shows, the copy is the reply alone.
  - **Prompt format**: **Heading** (the default), **Blockquote**, **Bold** or **Plain text**. As a heading, a prompt of several lines puts its first line in the heading and quotes the rest below it. The prompt is copied as typed, except that a line starting with `# ` is escaped so it doesn't become a heading.
  - **Prompt heading level**: H1 to H6, H2 by default, for the Heading format. The reply and its Sources start one level below it: with H2, a reply's `# Title` becomes `### Title`. Headings above that level shift down by the same amount, and headings already deeper stay where they are.
- Per site:
  - **Enable on _site_**
  - **Show a "Copy as Markdown" button**: on by default.
  - **Use for _site_'s own Copy button**: off by default.
  - **Include "More" sources**: on by default, except for Search Assist.
  - **Formatting rules**: one switch per clean-up rule.

## Installation

AI Chat Formatter isn't in the Chrome Web Store. Install it from a GitHub release.

1. Download `ai-chat-formatter-<version>.zip` from the [latest release](https://github.com/coreyx/ai-chat-formatter/releases/latest).
2. Extract it to a folder you'll keep, such as `Documents\Extensions\ai-chat-formatter`. Chrome loads the extension from that folder every time it starts, so don't delete it.
3. Open `chrome://extensions` (in Edge, `edge://extensions`; in Brave, `brave://extensions`).
4. Turn on **Developer mode**.
5. Click **Load unpacked** and choose the folder from step 2.
6. Open a Copilot or Duck.ai conversation, or a DuckDuckGo search with a Search Assist answer. Finished replies now have a **Copy as Markdown** button.

### Updating

1. Download the newer release's zip and extract it over the same folder, replacing its files.
2. On `chrome://extensions`, click the reload icon on the **AI Chat Formatter** card.
3. Reload any open Copilot, Duck.ai or DuckDuckGo tabs.

### Building from source

```bash
git clone https://github.com/coreyx/ai-chat-formatter.git
cd ai-chat-formatter
corepack enable
pnpm install
pnpm run build
```

The project uses [pnpm](https://pnpm.io/), at the version pinned in `package.json`. `corepack enable` is needed only once per machine: Corepack ships with Node and fetches that pnpm version when you first run `pnpm` here. If pnpm is already installed globally, you can skip it.

Then follow the installation steps from step 3, choosing the `dist/` folder.

## Pasting with Paste with Source

The extension writes Markdown to the clipboard as plain text only, so Obsidian pastes exactly that Markdown instead of converting HTML. One effect on Windows: a plain-text copy carries no `HTML Format` `SourceURL`, which [Paste with Source](https://github.com/coreyx/obsidian-paste-with-source) has used to find the page a paste came from. Chrome still records the page URL in its `Chromium internal source URL` clipboard format, and Paste with Source [1.6.0](https://github.com/coreyx/obsidian-paste-with-source/releases/tag/1.6.0) and later read it on Windows (setting: **Cite plain-text copies from Chromium apps**, on by default). With an older version, pastes from this extension on Windows get no citation. On macOS, Paste with Source reads Chrome's equivalent (`org.chromium.source-url`).

## Limitations

- **The extension depends on each site's page markup**, which isn't a documented API and can change without notice. When a site changes its markup, its adapter needs an update. Until then, Copy as Markdown shows an error rather than copying a broken reply, and an overridden Copy button falls back to the site's own copy. Duck.ai's and DuckDuckGo's class names change between their releases, so their adapters rely only on ids, `data-*` and ARIA attributes, and page structure.
- **Source titles and More sources depend on Copilot's internal data**, which is even more likely to change than its markup. If the live page data stops working, replies that existed when the page loaded still get full titles and links from the page's embedded data. Replies written since then fall back to the Sources panel with Copy as Markdown (More entries without links), or to the titles on the citation chips with the Copy-button override, with no More sources.
- **The prompt is read from each site's page markup** too. If a site changes how it shows prompts, copies come without the prompt until its adapter is updated; the reply is still copied.
- **Duck.ai's popup chips depend on Duck.ai's internal data** in the same way. If reading it stops working, a popup chip falls back to the Read More card for the domain it shows, so a chip standing for several sources keeps only that one.
- **Search Assist's chip titles and More sources depend on DuckDuckGo's internal data** in the same way. If reading it stops working, chips are titled with their domains and there are no More sources.
- **The extension loads on every DuckDuckGo search page**, since Search Assist can appear on any of them. It does nothing on a page without a Search Assist answer.
- **Plain text only on the clipboard.** Pasting into Word or Outlook gives raw Markdown. Use the site's own Copy button (with the override off) for those apps.
- **Very long code blocks.** Copilot may not keep every line of a long code block in the page. If any line is missing, the copy stops with a message instead of copying a shortened block. Scroll through the code block and try again, or use Copilot's own Copy button.

## Development

| Command | What it does |
|---|---|
| `pnpm run build` | Type-checks and builds the extension into `dist/` |
| `pnpm run watch` | Rebuilds `dist/` on every change, with source maps |
| `pnpm test` | Builds, then runs every regression script in `scratch/` (`test_*.ts`) |
| `pnpm run package` | Builds and zips `dist/` into `release/ai-chat-formatter-<version>.zip` |

```text
ai-chat-formatter/
├── scripts/
│   ├── build.mjs        # Bundles with esbuild, writes dist/manifest.json
│   ├── package.mjs      # Zips dist/ for a release
│   └── run-tests.mjs    # Builds, then runs every scratch/test_*.ts
├── src/
│   ├── manifest.json    # Manifest template; version, match patterns and page scripts are filled in at build
│   ├── core/            # Site-independent: types, conversion, citations, rules, settings
│   ├── sites/           # One adapter per site (copilot.ts, duckai.ts, duckduckgo.ts), shared Streamdown helpers (streamdown.ts), and the registry (index.ts)
│   ├── page/            # Page-world scripts, for site data the isolated content script can't see
│   ├── content/         # Content script: button injection and the Copy override
│   └── options/         # Options page
└── scratch/
    ├── fixtures/        # Page markup and data samples the tests use
    ├── test_ai-chat-formatter.ts
    ├── test_block-reference-citations.ts
    ├── test_copy-user-prompt.ts
    ├── test_copilot-source-details.ts
    ├── test_duck-ai-adapter.ts
    ├── test_duckduckgo-search-assist.ts
    ├── test_message-next-to-button.ts
    ├── test_min-heading-level.ts
    └── test_pnpm-migration.ts
```

### Adding a site

1. Inspect the site: how each reply is marked up, where its Copy button and toolbar are, how citations and code blocks are rendered, and what the Copy button actually writes.
2. Write `src/sites/<site>.ts` exporting a `SiteAdapter` (see `src/core/types.ts`). It provides:
   - its id, name and URL match patterns,
   - selectors for messages, the reply body and the native Copy button,
   - where the button goes,
   - Turndown rules for anything site-specific, such as citations,
   - an optional `preprocess` step for whitespace-sensitive markup like code viewers,
   - its post-processing rules,
   - optionally, ways to read each reply's full source list: `readReferences` (synchronous, used by both buttons), `readReferencesSlowly` (asynchronous fallback, used by Copy as Markdown only), and `hasUntitledCitations` (whether the fallback is worth running when More sources is off),
   - optionally, `moreSources`: whether the More sources option starts on for this site, and how the options page describes it,
   - optionally, a `pageScript`: the name of a script in `src/page/` that the manifest runs in the page's own JavaScript world, for data only the page can see.
3. Add it to `SITE_ADAPTERS` in `src/sites/index.ts`. The build adds its match patterns and page script to the manifest, and the options page gives it a section automatically.
4. Save a trimmed copy of the site's markup under `scratch/fixtures/` and add a `scratch/test_<name>.ts` script with checks for it; `pnpm test` runs it.

## License

[MIT](LICENSE)
