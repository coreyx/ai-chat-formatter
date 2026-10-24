# Release Notes

## 0.1.0 (2026-10-24)

The first release of AI Chat Formatter, a Chrome extension (also for Edge) that copies Microsoft Copilot replies as clean Markdown, ready to paste into Obsidian.

### Copy as Markdown

Every Copilot reply gets an **M↓** button right next to Copilot's own Copy button. Click it and the reply goes on the clipboard as Markdown: headings, lists, links, inline code, tables and math come through as Markdown, so nothing needs fixing after you paste.

You can also have Copilot's own Copy button do the same thing (**Use for Copilot's own Copy button** on the options page). If a reply ever can't be converted, Copilot's normal copy runs instead, so the button always copies something.

### Citations come with it

Copilot's own Copy button turns citations into broken `[[site]](<url>)` links. AI Chat Formatter reads each citation's page and title from the reply and writes them in the style you pick:

- **Obsidian footnotes** (default): `[^1]` markers with linked footnotes at the end.
- **Inline links + Sources list**: `[1](url)` markers and a numbered Sources list.
- **Sources list only**: just the list at the end.

A page cited several times gets a single number.

### Code blocks and ASCII trees stay intact

Code blocks paste as fenced blocks with their language and exact indentation, so directory trees no longer come apart into separate lines. If Copilot hasn't loaded every line of a long code block, the copy stops with a message rather than copying it with lines missing.

### Settings

The options page has a master switch, the citation style, and for each site: the button, the Copy-button takeover, and clean-up rules for invisible characters and extra blank lines. Changes apply to open tabs right away.

### Works with Paste with Source

Paste with Source [1.6.0](https://github.com/coreyx/obsidian-paste-with-source/releases/tag/1.6.0) and later cite pastes from this extension on Windows, using the page URL Chrome attaches to plain-text copies.

### Installing

Download `ai-chat-formatter-0.1.0.zip` from this release, extract it to a folder you'll keep, then in `chrome://extensions` turn on **Developer mode**, click **Load unpacked** and choose that folder. The [README](https://github.com/coreyx/ai-chat-formatter#installation) has the full steps, including updating.

### Known limitations

- Microsoft 365 Copilot isn't supported yet.
- The clipboard gets plain-text Markdown only, so pasting into Word or Outlook shows raw Markdown.
- The extension relies on Copilot's page markup, which can change; a Copilot update may need a new release.
