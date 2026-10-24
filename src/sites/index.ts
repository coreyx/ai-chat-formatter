import type { SiteAdapter } from "../core/types";
import { copilotAdapter } from "./copilot";
import { duckAiAdapter } from "./duckai";

/**
 * Every supported site. Adding a site means writing its adapter module and
 * listing it here; the build reads each adapter's `matches` into the manifest,
 * and the options page builds its sections from this list.
 */
export const SITE_ADAPTERS: readonly SiteAdapter[] = [copilotAdapter, duckAiAdapter];

/** Escapes `text` for literal use inside a regular expression. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compiles a Manifest V3 match pattern (`<scheme>://<host>/<path>`) into a
 * regular expression over a URL with its fragment removed, following Chrome's
 * rules: `*` as the scheme means http or https, `*.` before a host also
 * matches the bare host, any port is accepted, and `*` in the path matches
 * anything, including the query string.
 *
 * @throws Error when `pattern` isn't a valid match pattern, so a typo in an
 *   adapter fails the build and tests rather than silently matching nothing.
 */
export function matchPatternToRegExp(pattern: string): RegExp {
  if (pattern === "<all_urls>") return /^(?:https?|file|ftp):\/\//i;
  const parts = /^(\*|https?|file|ftp):\/\/(\*|\*\.[^/*]+|[^/*]*)(\/.*)$/.exec(pattern);
  if (!parts) throw new Error(`Invalid match pattern: ${pattern}`);
  const [, scheme, host, path] = parts;
  const schemePart = scheme === "*" ? "https?" : escapeRegExp(scheme);
  const hostPart = host === "*" ? "[^/:]+" : host.startsWith("*.") ? `(?:[^/:]+\\.)?${escapeRegExp(host.slice(2))}` : escapeRegExp(host);
  const pathPart = path.split("*").map(escapeRegExp).join(".*");
  return new RegExp(`^${schemePart}://${hostPart}(?::\\d+)?${pathPart}$`, "i");
}

/** The adapter whose match patterns cover `url`, or undefined when no supported site does. */
export function findAdapterForUrl(url: string, adapters: readonly SiteAdapter[] = SITE_ADAPTERS): SiteAdapter | undefined {
  const withoutFragment = url.split("#")[0];
  return adapters.find((adapter) => adapter.matches.some((pattern) => matchPatternToRegExp(pattern).test(withoutFragment)));
}
