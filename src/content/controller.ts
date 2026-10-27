import { convertMessage } from "../core/convert";
import type { Settings, SiteSettings } from "../core/settings";
import { ConversionError, type SiteAdapter, type SourceReference } from "../core/types";

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
   * Makes the page match the settings: one button on every message that has
   * a toolbar when buttons are on, none anywhere when they're off. A reply
   * that's still streaming has no toolbar yet, and gets its button on a later
   * pass once the toolbar appears.
   */
  sync(): void {
    const document = this.env.document;
    const showButtons = this.activeSiteSettings?.showCopyButton ?? false;
    if (!showButtons) {
      document.querySelectorAll(`[${INJECTED_ATTRIBUTE}]`).forEach((button) => button.remove());
      return;
    }
    for (const message of Array.from(document.querySelectorAll(this.adapter.messageSelector))) {
      if (message.querySelector(`[${INJECTED_ATTRIBUTE}]`)) continue;
      const anchor = this.adapter.findButtonAnchor(message);
      if (anchor) anchor.parent.insertBefore(this.createButton(message), anchor.before);
    }
  }

  /** Builds the "Copy as Markdown" button for `message`. */
  private createButton(message: Element): HTMLButtonElement {
    const button = this.env.document.createElement("button");
    button.type = "button";
    button.className = "acf-copy-button";
    button.setAttribute(INJECTED_ATTRIBUTE, "");
    button.setAttribute("aria-label", BUTTON_LABEL);
    button.title = BUTTON_LABEL;
    button.innerHTML = MARKDOWN_ICON;
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
   */
  private async gatherReferences(message: Element): Promise<SourceReference[] | null> {
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
      return this.adapter.readPrompt?.(message) ?? null;
    } catch (error) {
      console.warn(`${LOG_PREFIX} Couldn't read the prompt from the page:`, error);
      return null;
    }
  }

  /** Converts `message` with the current settings and `references`; throws as {@link convertMessage} does. */
  private convert(message: Element, references: SourceReference[] | null): string {
    const site = this.settings.sites[this.adapter.id];
    const prompt = this.readPrompt(message);
    return convertMessage(this.adapter, message, {
      style: this.settings.citationStyle,
      includeMoreSources: site?.includeMoreSources ?? false,
      isRuleEnabled: (ruleId) => site?.rules[ruleId] ?? true,
      references,
      minHeadingLevel: this.settings.minHeadingLevel,
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
    if (!this.activeSiteSettings?.overrideNativeCopy) return;
    const target = event.target as Element | null;
    const nativeButton = target?.closest?.(this.adapter.nativeCopyButtonSelector);
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

  /** Shows the copied state on `button` briefly, then restores it. */
  private flashCopied(button: HTMLButtonElement): void {
    button.classList.add("acf-copied");
    button.innerHTML = CHECK_ICON;
    button.setAttribute("aria-label", "Copied as Markdown");
    setTimeout(() => {
      button.classList.remove("acf-copied");
      button.innerHTML = MARKDOWN_ICON;
      button.setAttribute("aria-label", BUTTON_LABEL);
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
  // offsetWidth and offsetHeight ignore the entry animation's transform.
  const width = toast.offsetWidth;
  const height = toast.offsetHeight;
  const below = button.bottom + TOAST_GAP;
  const fitsBelow = below + height <= view.innerHeight - TOAST_MARGIN;
  const top = fitsBelow ? below : Math.max(TOAST_MARGIN, button.top - TOAST_GAP - height);
  const left = Math.max(TOAST_MARGIN, Math.min(button.left, view.innerWidth - TOAST_MARGIN - width));
  toast.style.top = `${Math.round(top)}px`;
  toast.style.left = `${Math.round(left)}px`;
  toast.classList.add("acf-toast-anchored");
}

/** A user-facing message for `error`: a ConversionError's own message, or `prefix` with the error's text. */
function describeError(error: unknown, prefix: string): string {
  if (error instanceof ConversionError) return error.message;
  console.error(LOG_PREFIX, error);
  return `${prefix}: ${error instanceof Error ? error.message : String(error)}`;
}
