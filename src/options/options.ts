/**
 * The options page: a master switch, the citation style, the minimum heading
 * level, the user prompt settings, and one section per site with its button,
 * override, site options and choices, and rule toggles. Every change is
 * saved as soon as it's made, and open chat tabs pick it up without a reload.
 */
import { canReadReferences, loadSettings, onSettingsChanged, saveSettings, type Settings } from "../core/settings";
import { CITATION_STYLES, HEADING_LEVELS, PROMPT_FORMATS, type CitationStyle, type HeadingLevel, type PromptFormat, type SiteAdapter } from "../core/types";
import { SITE_ADAPTERS } from "../sites/index";

/** How each citation style is presented: a label, an optional hint and a one-line example of its output. */
const CITATION_STYLE_TEXT: Record<CitationStyle, { label: string; hint?: string; example: string }> = {
  "linked-citations": {
    label: "Linked citations (Obsidian)",
    hint: "Numbered list under Sources; markers link to it. Reads the same in Reading view and Live Preview.",
    example: "…released in May.⁽¹⁾  →  1. [Title](url) — domain",
  },
  footnotes: {
    label: "Obsidian footnotes",
    hint: "Reading view shows the footnotes at the bottom of the note, after the More list.",
    example: "…released in May.[^1]  →  ### More …  [^1]: [Title](url) — domain",
  },
  "inline-links-and-sources": { label: "Inline links + Sources list", example: "…released in May.[1](url)  →  ## Sources" },
  "sources-only": { label: "Sources list only", example: "…released in May.  →  ## Sources" },
};

/** How each prompt format is listed: its name and a sketch of what it writes. */
const PROMPT_FORMAT_LABELS: Record<PromptFormat, string> = {
  heading: "Heading (## Prompt)",
  blockquote: "Blockquote (> Prompt)",
  bold: "Bold (**Prompt**)",
  plain: "Plain text",
};

/** The hostnames an adapter's match patterns cover, for display. */
function hostsOf(adapter: SiteAdapter): string {
  return adapter.matches.map((pattern) => pattern.replace(/^[^:]+:\/\//, "").replace(/\/.*$/, "")).join(", ");
}

/** What the "Include "More" sources" option says it does for `adapter`. */
function moreSourcesDescription(adapter: SiteAdapter): string {
  return adapter.moreSources?.description ?? `Adds the sources ${adapter.name} lists under More in its Sources panel but doesn't cite in the reply.`;
}

/** Escapes `value` for use inside a double-quoted CSS attribute selector. */
function attr(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

/** Creates an element with optional class and text. */
function el<K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** A checkbox or radio with its label and optional hint, wired to `onChange`. */
function option(document: Document, type: "checkbox" | "radio", name: string, label: string, hint: string | null, onChange: (input: HTMLInputElement) => void): HTMLLabelElement {
  const wrapper = el(document, "label", "option");
  const input = el(document, "input");
  input.type = type;
  input.name = name;
  input.addEventListener("change", () => onChange(input));
  const text = el(document, "span", "option-text");
  text.append(el(document, "span", undefined, label));
  if (hint) text.append(el(document, "span", "hint", hint));
  wrapper.append(input, text);
  return wrapper;
}

/** A drop-down named `name` offering `choices` as `[value, label]` pairs, reporting the chosen value to `onChange`. */
function dropDown(document: Document, name: string, choices: [string, string][], onChange: (value: string) => void): HTMLSelectElement {
  const select = el(document, "select");
  select.name = name;
  for (const [value, label] of choices) {
    const choice = el(document, "option", undefined, label);
    choice.value = value;
    select.append(choice);
  }
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

/**
 * A drop-down with a visible label above it and a hint below, wired up for
 * screen readers through `aria-labelledby` and `aria-describedby`; `id`
 * prefixes the label's and hint's ids.
 */
function labelledField(document: Document, id: string, label: string, select: HTMLSelectElement, hint: string): HTMLDivElement {
  const field = el(document, "div", "select-field");
  const title = el(document, "span", "select-label", label);
  title.id = `${id}-label`;
  const description = el(document, "p", "hint select-hint", hint);
  description.id = `${id}-hint`;
  select.setAttribute("aria-labelledby", title.id);
  select.setAttribute("aria-describedby", description.id);
  field.append(title, select, description);
  return field;
}

/** The rendered form: the root element plus a function that shows a settings object's values in it. */
export interface OptionsForm {
  root: HTMLElement;
  fill(settings: Settings): void;
}

/**
 * Builds the options form for `adapters`. Changing any control calls
 * `onChange` with a complete new settings object; the caller saves it. The
 * form keeps no state of its own beyond the last settings passed to `fill`,
 * so a change made in another tab can be shown by calling `fill` again.
 */
export function renderOptions(document: Document, adapters: readonly SiteAdapter[], onChange: (settings: Settings) => void): OptionsForm {
  let current: Settings | null = null;
  /** Applies `edit` to a copy of the current settings and reports the result. */
  const update = (edit: (draft: Settings) => void) => {
    if (!current) return;
    const draft: Settings = structuredClone(current);
    edit(draft);
    current = draft;
    fill(draft);
    onChange(draft);
  };

  const root = el(document, "div");

  const general = el(document, "section");
  general.append(
    option(document, "checkbox", "enabled", "Enable AI Chat Formatter", "Turns everything below on or off at once.", (input) => update((s) => (s.enabled = input.checked))),
  );
  root.append(general);

  const styles = el(document, "section");
  const styleSet = el(document, "fieldset", "global");
  styleSet.append(el(document, "h2", undefined, "Citation style"));
  for (const style of CITATION_STYLES) {
    const text = CITATION_STYLE_TEXT[style];
    const choice = option(document, "radio", "citationStyle", text.label, text.hint ?? null, () => update((s) => (s.citationStyle = style)));
    choice.querySelector("input")!.value = style;
    const example = el(document, "code", undefined, text.example);
    choice.querySelector(".option-text")!.append(example);
    styleSet.append(choice);
  }
  styles.append(styleSet);
  root.append(styles);

  const headings = el(document, "section");
  const headingSet = el(document, "fieldset", "global");
  const headingTitle = el(document, "h2", undefined, "Minimum heading level");
  headingTitle.id = "min-heading-level-title";
  const levelSelect = dropDown(
    document,
    "minHeadingLevel",
    HEADING_LEVELS.map((level) => [String(level), level === 1 ? "H1 (no change)" : `H${level}`]),
    (value) => update((s) => (s.minHeadingLevel = Number(value) as HeadingLevel)),
  );
  levelSelect.setAttribute("aria-labelledby", headingTitle.id);
  levelSelect.setAttribute("aria-describedby", "min-heading-level-hint");
  const levelHint = el(
    document,
    "p",
    "hint select-hint",
    "Shifts every heading down by the same amount, Sources included, so none is above this level. Headings past H6 stay at H6. Not used while the prompt is copied as a heading: the response then starts one level below the prompt.",
  );
  levelHint.id = "min-heading-level-hint";
  headingSet.append(headingTitle, levelSelect, levelHint);
  headings.append(headingSet);
  root.append(headings);

  const prompt = el(document, "section");
  const promptSet = el(document, "fieldset", "global");
  promptSet.append(
    el(document, "h2", undefined, "User prompt"),
    option(document, "checkbox", "includePrompt", "Copy the prompt with the response", "Starts each copy with the prompt the reply answers. On Search Assist, that's the search query.", (input) =>
      update((s) => (s.includePrompt = input.checked)),
    ),
  );
  const formatSelect = dropDown(document, "promptFormat", PROMPT_FORMATS.map((format) => [format, PROMPT_FORMAT_LABELS[format]]), (value) =>
    update((s) => (s.promptFormat = value as PromptFormat)),
  );
  const promptLevelSelect = dropDown(document, "promptHeadingLevel", HEADING_LEVELS.map((level) => [String(level), `H${level}`]), (value) =>
    update((s) => (s.promptHeadingLevel = Number(value) as HeadingLevel)),
  );
  promptSet.append(
    labelledField(document, "prompt-format", "Prompt format", formatSelect, "A prompt of several lines as a Heading puts its first line in the heading and quotes the rest."),
    labelledField(document, "prompt-heading-level", "Prompt heading level", promptLevelSelect, "The response's headings and Sources nest one level below it."),
  );
  prompt.append(promptSet);
  root.append(prompt);

  for (const adapter of adapters) {
    const section = el(document, "section");
    section.dataset.site = adapter.id;
    section.append(el(document, "h2", undefined, adapter.name), el(document, "p", "hint hosts", hostsOf(adapter)));
    const siteSet = el(document, "fieldset", "global");
    siteSet.append(option(document, "checkbox", `${adapter.id}.enabled`, `Enable on ${adapter.name}`, null, (input) => update((s) => (s.sites[adapter.id].enabled = input.checked))));

    const details = el(document, "fieldset", "site");
    details.append(
      option(document, "checkbox", `${adapter.id}.showCopyButton`, 'Show a "Copy as Markdown" button', "Adds a button next to each reply's own Copy button.", (input) =>
        update((s) => (s.sites[adapter.id].showCopyButton = input.checked)),
      ),
      option(document, "checkbox", `${adapter.id}.overrideNativeCopy`, `Use for ${adapter.name}'s own Copy button`, `Its Copy button copies Markdown too. If a reply can't be converted, ${adapter.name}'s normal copy runs instead.`, (input) =>
        update((s) => (s.sites[adapter.id].overrideNativeCopy = input.checked)),
      ),
    );
    for (const siteOption of adapter.options ?? []) {
      details.append(
        option(document, "checkbox", `${adapter.id}.options.${siteOption.id}`, siteOption.name, siteOption.description, (input) =>
          update((s) => (s.sites[adapter.id].options[siteOption.id] = input.checked)),
        ),
      );
    }
    for (const choice of adapter.choices ?? []) {
      const select = dropDown(document, `${adapter.id}.choices.${choice.id}`, choice.values.map(({ value, label }) => [value, label]), (value) =>
        update((s) => (s.sites[adapter.id].choices[choice.id] = value)),
      );
      details.append(labelledField(document, `${adapter.id}-${choice.id}`, choice.name, select, choice.description));
    }
    if (canReadReferences(adapter)) {
      details.append(
        option(
          document,
          "checkbox",
          `${adapter.id}.includeMoreSources`,
          'Include "More" sources',
          moreSourcesDescription(adapter),
          (input) => update((s) => (s.sites[adapter.id].includeMoreSources = input.checked)),
        ),
      );
    }
    if (adapter.rules.length) {
      details.append(el(document, "h3", undefined, "Formatting rules"));
      for (const rule of adapter.rules) {
        details.append(option(document, "checkbox", `${adapter.id}.rules.${rule.id}`, rule.name, rule.description, (input) => update((s) => (s.sites[adapter.id].rules[rule.id] = input.checked))));
      }
    }
    siteSet.append(details);
    section.append(siteSet);
    root.append(section);
  }

  /** Shows `settings` in the form and greys out what the master and site switches have turned off. */
  function fill(settings: Settings): void {
    current = settings;
    const input = (name: string) => root.querySelector<HTMLInputElement>(`input[name="${attr(name)}"]`);
    input("enabled")!.checked = settings.enabled;
    root.querySelectorAll<HTMLInputElement>('input[name="citationStyle"]').forEach((radio) => (radio.checked = radio.value === settings.citationStyle));
    root.querySelectorAll<HTMLFieldSetElement>("fieldset.global").forEach((set) => (set.disabled = !settings.enabled));
    const select = (name: string) => root.querySelector<HTMLSelectElement>(`select[name="${attr(name)}"]`)!;
    const promptIsHeading = settings.includePrompt && settings.promptFormat === "heading";
    select("minHeadingLevel").value = String(settings.minHeadingLevel);
    // A prompt heading sets the response's minimum itself, so the general minimum has no effect then.
    select("minHeadingLevel").disabled = promptIsHeading;
    input("includePrompt")!.checked = settings.includePrompt;
    select("promptFormat").value = settings.promptFormat;
    select("promptFormat").disabled = !settings.includePrompt;
    select("promptHeadingLevel").value = String(settings.promptHeadingLevel);
    select("promptHeadingLevel").disabled = !promptIsHeading;
    for (const adapter of adapters) {
      const site = settings.sites[adapter.id];
      input(`${adapter.id}.enabled`)!.checked = site.enabled;
      input(`${adapter.id}.showCopyButton`)!.checked = site.showCopyButton;
      input(`${adapter.id}.overrideNativeCopy`)!.checked = site.overrideNativeCopy;
      for (const siteOption of adapter.options ?? []) {
        const box = input(`${adapter.id}.options.${siteOption.id}`)!;
        box.checked = site.options[siteOption.id];
        // An option that needs another one is greyed out while that one is off; its own value is kept for when it's back on.
        box.disabled = siteOption.requires !== undefined && !site.options[siteOption.requires];
      }
      for (const choice of adapter.choices ?? []) {
        const choiceSelect = select(`${adapter.id}.choices.${choice.id}`);
        choiceSelect.value = site.choices[choice.id];
        // A choice that serves some options has no effect while none of them is on.
        choiceSelect.disabled = choice.requiresAny !== undefined && !choice.requiresAny.some((id) => site.options[id]);
      }
      const includeMore = input(`${adapter.id}.includeMoreSources`);
      if (includeMore) {
        includeMore.checked = site.includeMoreSources;
        const replacing = adapter.options?.find((siteOption) => siteOption.replacesSourcesSection && site.options[siteOption.id]);
        includeMore.disabled = replacing !== undefined;
        const hint = includeMore.closest(".option")!.querySelector(".hint")!;
        hint.textContent = replacing ? `Not used while "${replacing.name}" is on.` : moreSourcesDescription(adapter);
      }
      for (const rule of adapter.rules) input(`${adapter.id}.rules.${rule.id}`)!.checked = site.rules[rule.id];
      root.querySelector<HTMLFieldSetElement>(`section[data-site="${attr(adapter.id)}"] fieldset.site`)!.disabled = !site.enabled;
    }
  }

  return { root, fill };
}

/** Loads the settings, renders the form and saves every change, confirming it in the status line. */
async function main(): Promise<void> {
  const status = document.getElementById("status")!;
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  const form = renderOptions(document, SITE_ADAPTERS, (settings) => {
    saveSettings(settings).then(
      () => {
        status.textContent = "Saved";
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => (status.textContent = ""), 1500);
      },
      (error) => (status.textContent = `Couldn't save: ${error instanceof Error ? error.message : String(error)}`),
    );
  });
  form.fill(await loadSettings(SITE_ADAPTERS));
  document.getElementById("options")!.append(form.root);
  onSettingsChanged(SITE_ADAPTERS, (settings) => form.fill(settings));
}

// Only run on the real options page; the regression script imports renderOptions without the extension APIs.
if (typeof chrome !== "undefined" && chrome.storage) {
  main().catch((error) => console.error("[AI Chat Formatter]", error));
}
