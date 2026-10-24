# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/coreyx/ai-chat-formatter/compare/0.1.0...HEAD
[0.1.0]: https://github.com/coreyx/ai-chat-formatter/releases/tag/0.1.0
