# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-10-28

### Added

- **Explore More on Search Assist**, on by default: the Explore More questions you've expanded are copied after the extended answer, under `### Explore More`, each as an H4 with its answer and inline source chips. Unexpanded questions are left out. Turn it off with **Include expanded Explore More answers**.
- **More Search Results links**, off by default: with **Include More Search Results links** on, each expanded Explore More answer ends with its link to a DuckDuckGo search for that question. Greyed out while Explore More is off.
- **Inline source chips on Search Assist**, on by default: each chip stays where it is in the text, written as Search Assist shows it, `[![|16](favicon) name](url)` (`|16` is Obsidian's image-size syntax), with no Sources section. Turn off **Keep Search Assist's inline source chips** for the numbered citations and Sources section, as in 0.5.0.
- Site adapters can declare options of their own (`SiteAdapter.options`), stored per site and shown in the site's section of the options page.
- **Press More automatically** on Search Assist, off by default: expands a collapsed answer and presses **More**, once per answer.
- **Expand Explore More questions automatically** on Search Assist, off by default: once More has finished, opens each Explore More question in turn. A question you close stays closed, and one you've opened is left alone.
- **Click pacing** for those clicks: **Unhurried** (the default; random pauses of 1.5–4 s, waiting for each answer), **Brisk** (0.5–1.5 s, waiting for each answer) or **Random** (0.5–2 s, without waiting). Nothing is clicked while the tab is in the background.
- Site adapters can declare drop-down settings (`SiteAdapter.choices`) and act on the page for the user (`SiteAdapter.automate`).
- **Gemini Deep Research support** (`gemini.google.com`): a finished report's toolbar gets **Conversation** and **Report** buttons, before **Share & Export**.
  - **Report** copies the report. With **Copy the research request with the report** on (off by default), your research request comes first.
  - **Conversation** copies the whole left pane: every prompt and reply, with the research plan as a numbered list of steps.
- **Include "Sources used in the report"** for Gemini, on by default: the report's markers become citations in your citation style, and the sources it used without citing go under **More**.
- **Include "Sources browsed but not used"** and **Include "Show thinking"** for Gemini, both off by default. Each adds a section after the Sources section.
- **Show a Copy conversation button** for Gemini, on by default.
- **Gemini chats**: every finished reply gets a **Copy as Markdown** button, just left of Gemini's Copy icon (before **Share** on a reply that's only an image or a video). It copies the reply with its prompt.
  - **Conversation** now appears on every chat, in the top bar beside the ⋮ menu, and moves into a report's toolbar while one is open.
  - **Use for Gemini's own Copy button**, off by default, covers the Copy icon in a reply's toolbar. A generated image's own Copy is left alone.
  - Files attached to a prompt are named under it (`Attached: *name* (PDF)`), and the files, images, music and video Gemini makes are named where they appear (`Generated file: *name* (JSON)`, `*Generated image*`). None is linked or embedded.
  - Code blocks are fenced with the language their header shows. Source chips and citation markers, which carry no link in a chat, are left out.
- **Cite sources as Duck.ai does**, off by default: Duck.ai copies keep each source chip in place as a link with its label (one link per source for a chip that stands for several), and end with `## Read More`, a line for each Read More card with its icon, linked title and site, instead of numbered citations and a Sources section. **Include "More" sources** is greyed out while it's on.
- **Code Gemini ran**, folded behind **Show code** in a Gemini reply, is copied by default as an Obsidian callout that starts folded (`> [!example]- Code Gemini ran`), with each run's code and its output. Runs next to each other share one callout. The **Code Gemini ran** setting can make them plain code blocks with their output, or leave them out.
- Site adapters can read their drop-down settings while a copy is converted (`ConversionContext.choice`).
- **Copy a whole conversation on Copilot and Duck.ai**: a **Conversation** button, on by default with **Show a Copy conversation button**, copies every turn in the page, each prompt (even with prompts off) above its reply and the reply's own Sources section. On Copilot it sits in the top bar before **Share**; on Duck.ai, in the chat's header under its title, copying only the version of a regenerated reply that's on screen.
- Site adapters can label some of their buttons and leave others as the plain icon (`buttonLabel` may return null), and a button moves when the adapter's anchor for it moves. A site's `preprocess` step also gets the whole message, for parts of a reply outside its text.
- Site adapters can:
  - place a button outside its message, hide it while an option is off, and give it a visible label (`findButtonAnchor`, `buttonLabel`);
  - copy a conversation turn by turn (`readTurns`);
  - let an option govern the More list (`governsMoreSources`);
  - write sections after the Sources section (`AFTER_SOURCES_ATTRIBUTE`);
  - leave out the native Copy override when the site has no Copy button of its own.

### Fixed

- **Tables with linked citations** no longer lose their cells. A linked-citation marker inside a table row is now written `[[#^…\|⁽¹⁾]]`, since its `|` ended the cell. This applies to every site.

### Changed

- Search Assist copies now keep its inline chips by default instead of numbered citations with a Sources section.
- **Include "More" sources** for Search Assist is greyed out while its inline chips are on, since there's no Sources section.

## [0.5.0] - 2026-10-27

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

[Unreleased]: https://github.com/coreyx/ai-chat-formatter/compare/0.6.0...HEAD
[0.6.0]: https://github.com/coreyx/ai-chat-formatter/compare/0.5.0...0.6.0
[0.5.0]: https://github.com/coreyx/ai-chat-formatter/compare/0.4.0...0.5.0
[0.4.0]: https://github.com/coreyx/ai-chat-formatter/compare/0.3.0...0.4.0
[0.3.0]: https://github.com/coreyx/ai-chat-formatter/compare/0.2.0...0.3.0
[0.2.0]: https://github.com/coreyx/ai-chat-formatter/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/coreyx/ai-chat-formatter/releases/tag/0.1.0
