# Release Notes

## 0.3.0 (2026-10-24)

Citations now read the same in Obsidian's Reading view as in Live Preview, with the Sources section in Copilot's order.

### Linked citations, the new default

Obsidian's Reading view always moves footnotes to the very bottom of a note, so the footnotes style couldn't keep Copilot's order there. The new **Linked citations (Obsidian)** style makes the citations an ordinary numbered list and links the markers in the text to it:

```markdown
Widget 5 was released in May.[[#^c-k3f9-1|⁽¹⁾]]

## Sources

### Citations

1. [Widget 5.0.0 (Current)](https://widget.example/releases/5.0.0) — widget.example ^c-k3f9-1

### More

- [Widget 5 is now available | Widget Blog](https://widget.example/blog/widget-5) — widget.example
```

In Obsidian, each marker shows as a small `⁽¹⁾` link: click it to jump to the citation, or hover to preview it. The `^c-k3f9-1` block IDs are hidden. The `k3f9` part is random for each copy, so two replies pasted into one note don't clash.

The syntax is Obsidian's own; other Markdown apps show it as text, so pick one of the other styles for them. Obsidian plugins that show block links as live transclusions replace each `⁽¹⁾` with a copy of its entry in Reading view.

### Defaults and saved choices

Linked citations is now the default. If you chose and saved a citation style before, it's kept.

### Footnotes without the empty heading

The footnotes style drops its `### Citations` heading, which Reading view left empty. With More sources, a copy ends with `## Sources`, `### More`, and then the footnotes; without them, just the footnotes.

## 0.2.0 (2026-10-24)

Sources now come through the way Copilot shows them: every citation with its page title, and the extra sources Copilot lists under **More**.

### Titles on every citation

Each source is written as `[Title](url) — domain`, in every citation style. Copilot's chips that stand for several sources at once, such as `photovault+1`, used to copy as bare domains; now each page gets its real title.

### The "More" sources

Copilot's Sources panel lists sources it consulted but didn't cite under **More**. These now come along too, after the citations. Turn this off per site with **Include "More" sources** on the options page.

### Laid out like Copilot's Sources panel

Every copy ends with the same structure as the panel:

```markdown
## Sources

### Citations

[^1]: [Set up the sandbox | Example Learn](https://learn.example.com/…) — learn.example.com

### More

- [Installation | DeployKit Docs](https://deploykit.example/docs/…) — deploykit.example
```

With the footnotes style, Obsidian's Reading view still gathers the footnotes at the bottom of the note; Live Preview shows the order above.

### Where the titles come from

The extension reads Copilot's own source list, which has every title and link:
1. From the live page, through a small script that runs in Copilot's page. The extension now has two content scripts.
2. If that ever fails, from the conversation data embedded when the page loaded.
3. As a last resort, **Copy as Markdown** opens the reply's Sources panel, reads it and closes it, usually before it even comes into view. The panel has no links for its **More** entries, so those come through as plain `Title — domain`.

If none of these works, the copy still goes ahead with the titles the chips carry, as in 0.1.0.

### Updating

Download `ai-chat-formatter-0.2.0.zip` from this release and extract it over your existing extension folder. Then click the reload icon on the **AI Chat Formatter** card in `chrome://extensions` and refresh any open Copilot tabs.

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
