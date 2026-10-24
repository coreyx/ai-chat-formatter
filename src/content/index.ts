/**
 * Content script entry point, injected into every page the adapters match.
 * It picks the adapter for this page, loads the settings and hands the page
 * to a {@link ContentController}; settings changed on the options page reach
 * the controller live, so no reload is needed.
 */
import { loadSettings, onSettingsChanged } from "../core/settings";
import { findAdapterForUrl, SITE_ADAPTERS } from "../sites/index";
import { ContentController } from "./controller";

async function main(): Promise<void> {
  const adapter = findAdapterForUrl(location.href);
  if (!adapter) return;

  const controller = new ContentController(adapter, await loadSettings(SITE_ADAPTERS), {
    document,
    writeClipboard: (text) => navigator.clipboard.writeText(text),
    requestFrame: (callback) => requestAnimationFrame(() => callback()),
  });
  controller.start();
  onSettingsChanged(SITE_ADAPTERS, (settings) => controller.applySettings(settings));
}

main().catch((error) => console.error("[AI Chat Formatter]", error));
