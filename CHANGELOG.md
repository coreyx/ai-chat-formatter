# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **DuckDuckGo Search Assist support** (`duckduckgo.com`): a **Copy as Markdown** button on Search Assist's answer, and the option to have its own Copy button copy Markdown too. Search Assist's Copy leaves out every source; this keeps them.
- The copy holds the whole short answer, collapsed or expanded, and the extended answer once **More** has finished writing it. While More is still writing, Copy as Markdown says so and copies nothing.
- Search Assist's source chips become citations titled with their page titles, read through a small script in DuckDuckGo's page. The other pages Search Assist consulted can go under **More** as untitled links, with **Include "More" sources**, which is off by default for Search Assist.
- **Minimum heading level** setting, H1 to H6, for every site. When a copy has a heading above it, every heading shifts down by the same amount, the Sources section's included, keeping the hierarchy; headings past H6 stay at H6. The default, H1, changes nothing.
- **The prompt is copied with the response**, on by default: each copy starts with the prompt the reply answers, on Copilot, Duck.ai and Search Assist (where the search query stands in for it). **Copy the prompt with the response** turns it off.
- **Prompt format**: Heading (the default), Blockquote, Bold or Plain text. As a heading, at the **Prompt heading level** (H2 by default), the reply and its Sources start one level below the prompt, and a prompt of several lines puts its first line in the heading and quotes the rest.

### Changed

- The extension's messages ("Copied as Markdown", "still writing", errors) now appear next to the button you clicked instead of at the bottom of the window, where they were easy to miss.
- Copies now start with the prompt by default. Turn off **Copy the prompt with the response** to copy the reply alone, as before.
- The **Include "More" sources** description on the options page is now specific to each site. Duck.ai's now refers to its Read More cards.
- Building from source uses [pnpm](https://pnpm.io/) instead of npm: `pnpm install`, then `pnpm run build`. The pnpm version is pinned in `package.json`, and `corepack enable` sets it up. Dependency versions are unchanged.

## [0.4.0] - 2026-10-24

### Added

- **Duck.ai support** (`duck.ai`): a **Copy as Markdown** button on every reply, and the option to have Duck.ai's own Copy button copy Markdown too. Duck.ai's Copy leaves out every link and source; this keeps them.
- Duck.ai's source chips become citations titled from the reply's **Read More** cards. Chips that open a popup of several sources become one citation per source, read through a small script in Duck.ai's page. Read More cards that nothing in the reply cites go under **More**.
- Duck.ai code blocks keep their language and line breaks, and bold text stays bold.
- Install steps for Brave (`brave://extensions`).

### Changed

- On Copilot, the **Copy as Markdown** button now comes before Copilot's Copy button, first in the toolbar.

## [0.3.0] - 2026-10-24

### Added

- **Linked citations (Obsidian)** citation style: markers in the text are same-note links shown as `⁽¹⁾`, pointing to a numbered `### Citations` list whose entries carry Obsidian block IDs. Unlike footnotes, it keeps Copilot's order (Citations, then More) in Reading view as well as Live Preview. Each copy gets its own random ID token, so two replies pasted into one note don't clash.

### Changed

- Linked citations is the default citation style. A citation style you chose and saved is kept.
- The footnotes style no longer has a `### Citations` heading, which Reading view left empty because it moves footnotes to the bottom of the note. With More sources the copy ends `## Sources` → `### More` → the footnote definitions; without, just the definitions.

## [0.2.0] - 2026-10-24

### Added

- Every citation is written with its page title and domain: `[Title](url) — domain`. Copilot chips that group several sources (such as `photovault+1`) now get each page's real title instead of a bare domain.
- The sources Copilot lists under **More** in its Sources panel, without citing them in the reply, are included. Turn this off per site with **Include "More" sources**, which is on by default.
- Copilot's source list is read from its page data through a small script that runs in the page itself, then from the conversation data embedded when the page loaded, and as a last resort, for **Copy as Markdown**, from the reply's Sources panel.

### Changed

- Sources are laid out like Copilot's Sources panel in every citation style: `## Sources`, then `### Citations` (footnote definitions or the numbered list), then `### More`.
- **Copy as Markdown** is disabled while it reads a reply's sources, so a second click doesn't start a second copy.

## [0.1.0] - 2026-10-24

### Added

- **Copy as Markdown** button next to the Copy button on every Microsoft Copilot reply (`copilot.microsoft.com`, `copilot.com`), writing clean Markdown to the clipboard as plain text.
- Option to have Copilot's own Copy button copy Markdown too, off by default. If a reply can't be converted, Copilot's normal copy runs instead.
- Citations captured from the page, in three styles: Obsidian footnotes (default), inline links with a Sources list, or a Sources list only. A page cited more than once gets a single number.
- Code blocks copied as fenced blocks with their language and exact indentation, so ASCII trees paste intact. A code block that isn't fully loaded stops the copy with a message rather than copying it shortened.
- Conversion of headings, lists, tables, links, inline code and KaTeX math (`$…$`, `$$…$$`).
- Clean-up rules that can be switched on and off per site: normalize invisible characters, and collapse blank lines.
- Options page with a master switch, citation style, and per-site button, override and rule settings; changes apply to open tabs without a reload.
- Pluggable site adapters: a site's match patterns go into the manifest automatically at build time.

[Unreleased]: https://github.com/coreyx/ai-chat-formatter/compare/0.4.0...HEAD
[0.4.0]: https://github.com/coreyx/ai-chat-formatter/compare/0.3.0...0.4.0
[0.3.0]: https://github.com/coreyx/ai-chat-formatter/compare/0.2.0...0.3.0
[0.2.0]: https://github.com/coreyx/ai-chat-formatter/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/coreyx/ai-chat-formatter/releases/tag/0.1.0
