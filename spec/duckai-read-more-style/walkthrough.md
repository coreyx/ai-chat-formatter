# Walkthrough: Duck.ai's own citation style

Duck.ai has a new setting, **Cite sources as Duck.ai does**, off by default.
- **With it off:** copies are unchanged and use your citation style.
- **With it on:** each source chip stays where it is, as a link. The copy ends with `## Read More`, a line for each Read More card with its icon, linked title and site, and there are no numbered citations or Sources section.

## What Was Implemented

### 1. Shared code
- **`src/core/types.ts`:** `SiteAdapter.preprocess` now gets a third argument, `message`, the message the reply text was cloned from. A site may read it, but must never change it.
  - **Why:** Duck.ai's Read More cards sit outside the reply text that's converted.
  - **The plan said "optional"**, meaning adapters can ignore the argument, as the other sites do. TypeScript then needed every caller to pass it, so TASK-1 and TASK-2 went in one commit.
- **`src/core/convert.ts`:** `convertMessage` passes the message to `preprocess`.

### 2. Duck.ai adapter
- **`src/sites/duckai.ts`:**
  - **The option:** `READ_MORE_STYLE_OPTION` (`read-more-style`), Duck.ai's first site option. Its settings:
    - **`defaultEnabled`:** false;
    - **`replacesSourcesSection`:** true, so the shared code leaves out the Sources section and More, and the options page greys out **Include "More" sources** with its "Not used while…" hint.
  - **`citationChipRule`:** with the option on, it writes `[label](url)` instead of registering a citation.
  - **`popupChipRule`:** with the option on, it writes one `[domain](url)` per source, separated by spaces.
    - **When the chip's sources can't be read:** the existing fallback to the Read More card for its domain still applies, and a chip with neither is still left out.
  - **`readMoreSection(message)`:** builds the `## Read More` heading and a list, one line per card in page order.
    - **Each line:** the icon, when it's an http(s) address, then the title linked to the page, falling back to the domain, then ` — domain` unless the domain equals the title.
    - **Where it goes:** `preprocessDuckAi` appends it to the reply while the option is on.
  - **`readMoreIconRule`:** writes the icon as `![|16](icon)`, with the `|` never escaped and the address encoded for a link.

### 3. Tests
- **`scratch/test_duckai-read-more-style.ts` (new):** 11 checks, against the existing Duck.ai fixture and its fake React fiber.
- **`scratch/test_search-assist-explore-more.ts`:** two checks assumed Duck.ai had no site options. They now expect its one option, off by default, with More sources still available while it's off.

## Verification & Test Results

### Automated Tests

`pnpm test` (which builds first, then runs every `scratch/test_*.ts`) passed. `scratch/test_duckai-read-more-style.ts` gave **11/11 passed**:

- **Chips:**
  - Each link chip stays in place as `[label](url)`. **Passed**
  - The popup chip becomes one linked domain per source. **Passed**
  - There are no citation markers and no Sources or More. **Passed**
- **A popup chip whose sources can't be read** falls back to the Read More card for its domain, as before. **Passed**
- **A popup chip with neither readable sources nor a matching card** is left out. **Passed**
- **With the option off,** the copy is byte-for-byte what it was, in every citation style. **Passed**
- **Read More:**
  - All four cards appear, cited or not, in page order, as `- ![|16](icon) [Title](url) — domain`, after the reply. **Passed**
  - The heading shifts with **Minimum heading level**, and sits below a prompt heading (`##` prompt, then `### Read More`). **Passed**
  - A reply without cards gets its links and no section. **Passed**
  - A card without a title shows its domain once, and one without a web icon has none. **Passed**
  - Brackets in a title are escaped. **Passed**
  - With the option off, there's no Read More section. **Passed**
- **Options page:** the setting starts off. Turning it on greys out **Include "More" sources** with "Not used while "Cite sources as Duck.ai does" is on." **Passed**
- **Controller:** with the setting on, both **Copy as Markdown** and the overridden Duck.ai Copy write Duck.ai's style. **Passed**

While writing the script, two of its first checks were wrong, not the code:
- **The "before" comparison:** it read sources from a different copy of the page than the one it converted.
- **The unreadable popup chip:** the check expected it to be dropped, but it falls back to its Read More card, as it always has.

Both checks were corrected before the TASK-3 commit.

`tsc --noEmit` is clean.

### Regression Testing

All 14 test scripts passed:

| Script | Checks passed |
|---|---|
| ai-chat-formatter | 38 of 38 |
| block-reference-citations | 7 of 7 |
| copilot-source-details | 30 of 30 |
| copy-user-prompt | 33 of 33 |
| duck-ai-adapter | 20 of 20 |
| duckai-read-more-style | 11 of 11 |
| duckduckgo-search-assist | 22 of 22 |
| gemini-chat | 20 of 20 |
| gemini-deep-research | 36 of 36 |
| message-next-to-button | 8 of 8 |
| min-heading-level | 21 of 21 |
| pnpm-migration | 6 of 6 |
| search-assist-auto-expand | 21 of 21 |
| search-assist-explore-more | 31 of 31 |

The two Search Assist checks updated for Duck.ai's new option are described above.

## Manual Verification
1. Run `pnpm run build`, then click the reload icon on the extension in `chrome://extensions`, then reload a Duck.ai tab.
2. **The default:**
   1. Open a Duck.ai conversation whose reply cites sources, and click **Copy as Markdown**.
   2. The copy should be unchanged: numbered citations and a Sources section.
3. **Duck.ai's style:**
   1. In Options, under Duck.ai, turn on **Cite sources as Duck.ai does**. **Include "More" sources** should grey out.
   2. Copy the same reply and paste it into an Obsidian note.
   3. Each chip should be a link where it was, and the note should end with `## Read More`.
   4. Each card should be on a line with its 16px icon, its linked title and its site.
4. **A chip that stands for several sources:** copy a reply with one, a chip showing a domain and a number. Each source behind it should appear as its own link.
5. **The override:** turn on **Use for Duck.ai's own Copy button**, then click Duck.ai's Copy. You should get the same Duck.ai-style Markdown.

## Follow-ups

- **The drop-down:** the scope first described a **Citation style** drop-down. The approved plan uses an on/off setting, matching Search Assist's. A drop-down would need new code to drop the Sources section and grey out **Include "More" sources** based on a drop-down's value.
- **Reasoning panel:** the sites listed in Duck.ai's Reasoning panel stay out of scope.
