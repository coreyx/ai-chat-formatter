import { CITATION_STYLES, type CitationStyle, type SiteAdapter } from "./types";

/** Per-site settings, keyed in {@link Settings.sites} by the adapter's id. */
export interface SiteSettings {
  /** Whether the extension does anything on this site. */
  enabled: boolean;
  /** Whether each reply gets a "Copy as Markdown" button. */
  showCopyButton: boolean;
  /** Whether the site's own Copy button produces the extension's Markdown instead of its native output. */
  overrideNativeCopy: boolean;
  /** Which post-processing rules are on, keyed by rule id. */
  rules: Record<string, boolean>;
}

/** Everything the user can configure, stored as one object in `chrome.storage.sync`. */
export interface Settings {
  /** Master switch: when off, the extension does nothing on any site. */
  enabled: boolean;
  /** How citations are written, for every site. */
  citationStyle: CitationStyle;
  sites: Record<string, SiteSettings>;
}

/** The `chrome.storage.sync` key the settings object lives under. */
const STORAGE_KEY = "settings";

/** The settings a fresh install starts with, derived from the adapters so each site and rule gets its declared default. */
export function buildDefaultSettings(adapters: readonly SiteAdapter[]): Settings {
  const sites: Record<string, SiteSettings> = {};
  for (const adapter of adapters) {
    sites[adapter.id] = {
      enabled: true,
      showCopyButton: true,
      overrideNativeCopy: false,
      rules: Object.fromEntries(adapter.rules.map((rule) => [rule.id, rule.defaultEnabled])),
    };
  }
  return { enabled: true, citationStyle: "footnotes", sites };
}

/** `value` when it is a boolean, otherwise `fallback`. */
function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** `value` as a plain object, or an empty one when it is anything else. */
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Overlays whatever was stored onto `defaults`. Only sites and rules that the
 * defaults know about are kept, and any value of the wrong type falls back to
 * its default, so settings saved by an older version (missing a newer site or
 * rule) or damaged by hand still load without a migration step.
 */
export function mergeSettings(stored: unknown, defaults: Settings): Settings {
  const saved = record(stored);
  const savedSites = record(saved.sites);
  const sites: Record<string, SiteSettings> = {};
  for (const [id, siteDefaults] of Object.entries(defaults.sites)) {
    const site = record(savedSites[id]);
    const savedRules = record(site.rules);
    sites[id] = {
      enabled: bool(site.enabled, siteDefaults.enabled),
      showCopyButton: bool(site.showCopyButton, siteDefaults.showCopyButton),
      overrideNativeCopy: bool(site.overrideNativeCopy, siteDefaults.overrideNativeCopy),
      rules: Object.fromEntries(Object.entries(siteDefaults.rules).map(([ruleId, on]) => [ruleId, bool(savedRules[ruleId], on)])),
    };
  }
  const style = saved.citationStyle;
  return {
    enabled: bool(saved.enabled, defaults.enabled),
    citationStyle: CITATION_STYLES.includes(style as CitationStyle) ? (style as CitationStyle) : defaults.citationStyle,
    sites,
  };
}

/** Reads the stored settings, filled out with the defaults for `adapters`. */
export async function loadSettings(adapters: readonly SiteAdapter[]): Promise<Settings> {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  return mergeSettings(data[STORAGE_KEY], buildDefaultSettings(adapters));
}

/** Stores `settings`, which every open tab picks up through {@link onSettingsChanged}. */
export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
}

/**
 * Calls `callback` with the merged settings whenever they change in storage,
 * so a change on the options page applies to open chat tabs without a reload.
 * Returns a function that stops listening.
 */
export function onSettingsChanged(adapters: readonly SiteAdapter[], callback: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "sync" && STORAGE_KEY in changes) {
      callback(mergeSettings(changes[STORAGE_KEY].newValue, buildDefaultSettings(adapters)));
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
