import { convertConversation, convertMessage, resolveOption } from "../core/convert";
import type { Settings, SiteSettings } from "../core/settings";
import { ConversionError, type ButtonLabel, type SiteAdapter, type SiteAutomation, type SourceReference } from "../core/types";

/** Prefix for console messages, so the extension's output is easy to filter in a busy page console. */
const LOG_PREFIX = "[AI Chat Formatter]";
/** Marks buttons the extension injected, so each message gets exactly one and they can all be removed again. */
const INJECTED_ATTRIBUTE = "data-acf-injected";
const BUTTON_LABEL = "Copy as Markdown";
const COPIED_MS = 1500;
const TOAST_MS = 4000;

/** The Markdown mark, drawn in `currentColor` so it follows the site's toolbar icon color in light and dark themes. */
const MARKDOWN_ICON =
  '<svg viewBox="0 0 208 128" width="20" height="20" aria-hidden="true" focusable="false"><rect x="7" y="7" width="194" height="114" rx="16" fill="none" stroke="currentColor" stroke-width="12"/><path fill="currentColor" d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0-30-33h20V30h20v35h20z"/></svg>';
const CHECK_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5 10 17.5 19 7"/></svg>';

/** What the controller needs from its environment; the live page and the tests supply different implementations. */
export interface ControllerEnvironment {
  document: Document;
  /** Writes `text` to the clipboard as plain text. */
  writeClipboard(text: string): Promise<void>;
  /** Runs `callback` before the next repaint; batches the bursts of DOM mutations a streaming reply causes. */
  requestFrame(callback: () => void): void;
  /** Resolves after `ms` milliseconds, for a site's automation. Defaults to `setTimeout`. */
  sleep?(ms: number): Promise<void>;
  /** A random number in [0, 1), for a site's automation. Defaults to `Math.random`. */
  random?(): number;
  /** Whether the page is showing. Defaults to the document's `visibilityState`. */
  isPageVisible?(): boolean;
}

/**
 * Runs the extension on one chat page: keeps a "Copy as Markdown" button on
 * every finished reply, optionally stands in for the site's own Copy button,
 * and applies settings changes as they happen.
 */
export class ContentController {
  private settings: Settings;
  private observer: MutationObserver | null = null;
  private syncScheduled = false;
  private toast: HTMLElement | null = null;
  /** Each message's button, which may sit outside the message (as Gemini's conversation button does). */
  private readonly buttons = new WeakMap<Element, HTMLButtonElement>();
  /** Each button's label, restored after the copied flash; also how this run's own buttons are told from ones an earlier run left. */
  private readonly labels = new WeakMap<HTMLButtonElement, ButtonLabel>();

  constructor(
    private readonly adapter: SiteAdapter,
    settings: Settings,
    private readonly env: ControllerEnvironment,
  ) {
    this.settings = settings;
  }

  /** Starts watching the page and intercepting native Copy clicks. Call once. */
  start(): void {
    const view = this.env.document.defaultView;
    // Capture phase on window runs before the site's own handlers, which React attaches lower down at its root element.
    view?.addEventListener("click", this.onNativeCopyClick, true);
    this.observer = new (view?.MutationObserver ?? MutationObserver)(() => this.scheduleSync());
    this.observer.observe(this.env.document.body, { childList: true, subtree: true });
    this.sync();
  }

  /** Applies new settings immediately, adding or removing buttons as needed. */
  applySettings(settings: Settings): void {
    this.settings = settings;
    this.sync();
  }

  /** This site's settings, or null when the extension is switched off for it. */
  private get activeSiteSettings(): SiteSettings | null {
    const site = this.settings.sites[this.adapter.id];
    return this.settings.enabled && site?.enabled ? site : null;
  }

  /**
   * What the adapter's automation reads and waits with. Every option reads
   * the settings at the moment it's asked, so switching an option, the site
   * or the extension off stops the automation before its next step.
   */
  private readonly automation: SiteAutomation = {
    isOptionEnabled: (id) => {
      const site = this.activeSiteSettings;
      return site !== null && (site.options[id] ?? this.adapter.options?.find((option) => option.id === id)?.defaultEnabled ?? false);
    },
    choice: (id) => this.activeSiteSettings?.choices[id] ?? this.adapter.choices?.find((choice) => choice.id === id)?.defaultValue ?? "",
    sleep: (ms) => this.env.sleep?.(ms) ?? new Promise((resolve) => setTimeout(resolve, ms)),
    random: () => this.env.random?.() ?? Math.random(),
    isPageVisible: () => this.env.isPageVisible?.() ?? this.env.document.visibilityState === "visible",
  };

  /** Coalesces mutation bursts into one {@link sync} per frame. */
  private scheduleSync(): void {
    if (this.syncScheduled) return;
    this.syncScheduled = true;
    this.env.requestFrame(() => {
      this.syncScheduled = false;
      this.sync();
    });
  }

  /**
   * Whether the adapter's option `id` is on for this site, following its
   * required options as a copy does. Off while the site or the extension is.
   */
  private isOptionEnabled(id: string): boolean {
    const site = this.activeSiteSettings;
    if (!site) return false;
    return resolveOption(this.adapter, id, (optionId) => site.options[optionId] ?? this.adapter.options?.find((option) => option.id === optionId)?.defaultEnabled ?? false);
  }

  /**
   * Makes the page match the settings: one button for every message that has
   * a toolbar when buttons are on, none anywhere when they're off. A reply
   * that's still streaming has no toolbar yet, and gets its button on a later
   * pass once the toolbar appears. A button can sit outside its message, so
   * each message's button is tracked rather than looked for inside it; when
   * the adapter no longer gives a message an anchor (an option that shows the
   * button was turned off), its button is removed, and when the anchor is now
   * somewhere else (Gemini's Conversation button, between the top bar and an
   * open report's toolbar), the button moves there.
   */
  sync(): void {
    const document = this.env.document;
    // Automation runs whether or not the button is shown: it serves the site's own Copy too, or just reading.
    if (this.adapter.automate && this.activeSiteSettings) {
      for (const message of Array.from(document.querySelectorAll(this.adapter.messageSelector))) {
        this.adapter.automate(message, this.automation);
      }
    }
    const showButtons = this.activeSiteSettings?.showCopyButton ?? false;
    if (!showButtons) {
      document.querySelectorAll(`[${INJECTED_ATTRIBUTE}]`).forEach((button) => button.remove());
      return;
    }
    const isOptionEnabled = (id: string) => this.isOptionEnabled(id);
    for (const message of Array.from(document.querySelectorAll(this.adapter.messageSelector))) {
      const anchor = this.adapter.findButtonAnchor(message, isOptionEnabled);
      const tracked = this.buttons.get(message);
      if (tracked?.isConnected) {
        if (!anchor) tracked.remove();
        else if (tracked.parentElement !== anchor.parent) anchor.parent.insertBefore(tracked, anchor.before);
        continue;
      }
      // A button left inside the message by an earlier run of the extension still counts; one of this run's own, for another message placed inside this one, doesn't.
      const leftover = Array.from(message.querySelectorAll(`[${INJECTED_ATTRIBUTE}]`)).some((button) => !this.labels.has(button as HTMLButtonElement));
      if (!anchor || leftover) continue;
      const button = this.createButton(message);
      this.buttons.set(message, button);
      anchor.parent.insertBefore(button, anchor.before);
    }
  }

  /**
   * Fills `button` with `icon` and, when `label` has visible text, the text
   * after it, and names it with the label's title.
   */
  private renderButton(button: HTMLButtonElement, icon: string, label: ButtonLabel, accessibleName = label.title): void {
    button.innerHTML = icon;
    if (label.text) {
      const text = this.env.document.createElement("span");
      text.className = "acf-button-text";
      text.textContent = label.text;
      button.append(text);
    }
    button.setAttribute("aria-label", accessibleName);
  }

  /** Builds the "Copy as Markdown" button for `message`, named as the adapter says (see {@link SiteAdapter.buttonLabel}). */
  private createButton(message: Element): HTMLButtonElement {
    const label = this.adapter.buttonLabel?.(message) ?? { title: BUTTON_LABEL };
    const button = this.env.document.createElement("button");
    button.type = "button";
    button.className = label.text ? "acf-copy-button acf-labelled" : "acf-copy-button";
    button.setAttribute(INJECTED_ATTRIBUTE, "");
    button.title = label.title;
    this.renderButton(button, MARKDOWN_ICON, label);
    this.labels.set(button, label);
    button.addEventListener("click", (event) => {
      // Keep the click from reaching the site's toolbar handlers.
      event.stopPropagation();
      void this.copy(message, button);
    });
    return button;
  }

  /**
   * Gathers `message`'s sources, converts it and writes it to the clipboard,
   * showing the outcome on `button`, or in a toast next to it when something
   * goes wrong. Gathering may take a moment
   * when it falls back to the slower path, so the button is disabled and
   * marked busy meanwhile, and a click on a busy button is ignored.
   */
  async copy(message: Element, button?: HTMLButtonElement): Promise<void> {
    if (button?.getAttribute("aria-busy") === "true") return;
    button?.setAttribute("aria-busy", "true");
    if (button) button.disabled = true;
    try {
      const references = await this.gatherReferences(message);
      let markdown: string;
      try {
        markdown = this.convert(message, references);
      } catch (error) {
        this.showToast(describeError(error, `Couldn't convert this ${this.adapter.name} reply`), button);
        return;
      }
      try {
        await this.env.writeClipboard(markdown);
      } catch (error) {
        this.showToast(describeError(error, "Couldn't write to the clipboard"), button);
        return;
      }
      if (button) this.flashCopied(button);
    } finally {
      button?.removeAttribute("aria-busy");
      if (button) button.disabled = false;
    }
  }

  /**
   * Reads `message`'s source list: the adapter's synchronous reader first,
   * then its slower one, but only when the result would show — the More list
   * is on, or some citation has no title without it. A reader that throws
   * counts as having found nothing.
   *
   * A conversation (a message the adapter splits into turns) gathers nothing
   * here: each of its replies reads its own sources with the synchronous
   * reader as it's converted (see {@link convert}). The slower reader isn't
   * used for a whole conversation; on Copilot it opens a reply's Sources
   * panel, which can't be done reply after reply.
   */
  private async gatherReferences(message: Element): Promise<SourceReference[] | null> {
    if (this.adapter.readTurns?.(message)) return null;
    const quick = this.readReferencesNow(message);
    if (quick || !this.adapter.readReferencesSlowly) return quick;
    const site = this.settings.sites[this.adapter.id];
    if (!site?.includeMoreSources && !this.adapter.hasUntitledCitations?.(message)) return null;
    try {
      return await this.adapter.readReferencesSlowly(message);
    } catch (error) {
      console.warn(`${LOG_PREFIX} Couldn't read the sources from the page:`, error);
      return null;
    }
  }

  /** The adapter's synchronous source reader, guarded so a failure never blocks a copy. */
  private readReferencesNow(message: Element): SourceReference[] | null {
    try {
      return this.adapter.readReferences?.(message) ?? null;
    } catch (error) {
      console.warn(`${LOG_PREFIX} Couldn't read the sources from the page:`, error);
      return null;
    }
  }

  /**
   * The prompt `message` answers, when the prompt setting is on and the
   * adapter can find one. A reader that throws counts as having found
   * nothing, so the copy still goes ahead with the response alone.
   */
  private readPrompt(message: Element): string | null {
    if (!this.settings.includePrompt) return null;
    try {
      return this.adapter.readPrompt?.(message, (id) => this.isOptionEnabled(id)) ?? null;
    } catch (error) {
      console.warn(`${LOG_PREFIX} Couldn't read the prompt from the page:`, error);
      return null;
    }
  }

  /**
   * Converts `message` with the current settings and `references`; throws as
   * {@link convertMessage} does. A message the adapter splits into turns is a
   * whole conversation, copied turn by turn with every prompt, whatever the
   * prompt setting says, and each reply's own sources.
   */
  private convert(message: Element, references: SourceReference[] | null): string {
    const site = this.settings.sites[this.adapter.id];
    const shared = {
      style: this.settings.citationStyle,
      includeMoreSources: site?.includeMoreSources ?? false,
      isRuleEnabled: (ruleId: string) => site?.rules[ruleId] ?? true,
      isOptionEnabled: (optionId: string) => site?.options[optionId] ?? this.adapter.options?.find((option) => option.id === optionId)?.defaultEnabled ?? false,
      choice: (choiceId: string) => site?.choices[choiceId] ?? this.adapter.choices?.find((choice) => choice.id === choiceId)?.defaultValue ?? "",
      minHeadingLevel: this.settings.minHeadingLevel,
    };
    const turns = this.adapter.readTurns?.(message);
    if (turns) {
      return convertConversation(this.adapter, turns, {
        ...shared,
        promptFormat: { format: this.settings.promptFormat, headingLevel: this.settings.promptHeadingLevel },
        referencesFor: (reply) => this.readReferencesNow(reply),
      });
    }
    const prompt = this.readPrompt(message);
    return convertMessage(this.adapter, message, {
      ...shared,
      references,
      ...(prompt ? { prompt: { text: prompt, format: this.settings.promptFormat, headingLevel: this.settings.promptHeadingLevel } } : {}),
    });
  }

  /**
   * Stands in for the site's own Copy button when the override is on.
   * Conversion runs synchronously, before deciding anything: only a successful
   * conversion stops the click, so if the reply can't be converted the site's
   * own copy still happens and the user is never left with nothing copied.
   * For the same reason only the synchronous source reader is used here; the
   * slower one couldn't finish before the site's handler runs.
   */
  private readonly onNativeCopyClick = (event: Event): void => {
    const selector = this.adapter.nativeCopyButtonSelector;
    if (!selector || !this.activeSiteSettings?.overrideNativeCopy) return;
    const target = event.target as Element | null;
    const nativeButton = target?.closest?.(selector);
    const message = nativeButton?.closest(this.adapter.messageSelector);
    if (!message) return;

    let markdown: string;
    try {
      markdown = this.convert(message, this.readReferencesNow(message));
    } catch (error) {
      console.warn(`${LOG_PREFIX} Falling back to ${this.adapter.name}'s own copy:`, error);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.env.writeClipboard(markdown).then(
      () => this.showToast("Copied as Markdown", nativeButton),
      (error) => this.showToast(describeError(error, "Couldn't write to the clipboard"), nativeButton),
    );
  };

  /** Shows the copied state on `button` briefly, then restores its own icon and label. */
  private flashCopied(button: HTMLButtonElement): void {
    const label = this.labels.get(button) ?? { title: BUTTON_LABEL };
    button.classList.add("acf-copied");
    this.renderButton(button, CHECK_ICON, label, "Copied as Markdown");
    setTimeout(() => {
      button.classList.remove("acf-copied");
      this.renderButton(button, MARKDOWN_ICON, label);
    }, COPIED_MS);
  }

  /**
   * Shows `text` in a short-lived toast, replacing any toast already showing.
   * It goes next to `anchor`, the button that was clicked, where the user is
   * looking (see {@link placeToast}); without one it sits at the bottom
   * center of the window.
   */
  private showToast(text: string, anchor?: Element | null): void {
    this.toast?.remove();
    const toast = this.env.document.createElement("div");
    toast.className = "acf-toast";
    toast.setAttribute("role", "status");
    toast.textContent = text;
    this.env.document.body.appendChild(toast);
    const view = this.env.document.defaultView;
    if (anchor && view) placeToast(toast, anchor, view);
    this.toast = toast;
    setTimeout(() => {
      if (this.toast === toast) this.toast = null;
      toast.remove();
    }, TOAST_MS);
  }
}

/** The space between a toast and the button it belongs to, in pixels. */
const TOAST_GAP = 8;
/** The least space kept between a toast and the window's edges, in pixels. */
const TOAST_MARGIN = 16;

/**
 * Moves `toast`, already in the page, next to `anchor`: just below it, lined
 * up with its left edge, or just above it when there's no room below, and
 * always kept inside the window. The position is fixed when the toast
 * appears; following the button as the page scrolls would mean listening to
 * each site's own scroll container, and the toast only shows for a few
 * seconds. When `anchor` can't be measured (detached, or hidden, as when the
 * site re-renders it after the click), the toast is left at the bottom
 * center. Exported for the tests, which give elements fixed sizes since jsdom
 * does no layout.
 */
export function placeToast(toast: HTMLElement, anchor: Element, view: Window): void {
  if (!anchor.isConnected) return;
  const button = anchor.getBoundingClientRect();
  if (button.width === 0 && button.height === 0) return;
  // Measure in the anchored style, at the window's corner: at the bottom center, `left: 50%` would cap the width at half the window.
  toast.classList.add("acf-toast-anchored");
  toast.style.top = "0px";
  toast.style.left = "0px";
  // offsetWidth and offsetHeight ignore the entry animation's transform.
  const width = toast.offsetWidth;
  const height = toast.offsetHeight;
  const below = button.bottom + TOAST_GAP;
  const fitsBelow = below + height <= view.innerHeight - TOAST_MARGIN;
  const top = fitsBelow ? below : Math.max(TOAST_MARGIN, button.top - TOAST_GAP - height);
  const left = Math.max(TOAST_MARGIN, Math.min(button.left, view.innerWidth - TOAST_MARGIN - width));
  toast.style.top = `${Math.round(top)}px`;
  toast.style.left = `${Math.round(left)}px`;
}

/** A user-facing message for `error`: a ConversionError's own message, or `prefix` with the error's text. */
function describeError(error: unknown, prefix: string): string {
  if (error instanceof ConversionError) return error.message;
  console.error(LOG_PREFIX, error);
  return `${prefix}: ${error instanceof Error ? error.message : String(error)}`;
}
