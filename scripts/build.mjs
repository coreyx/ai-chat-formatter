/**
 * Builds the unpacked extension into `dist/`:
 * - bundles the content script and the options page with esbuild,
 * - copies the stylesheet and the options HTML,
 * - writes `dist/manifest.json` from `src/manifest.json`, filling in the
 *   version from package.json and the content-script match patterns from the
 *   site adapters, so a new site never needs its URLs listed twice.
 *
 * Flags: `--dev` skips minification and adds inline source maps; `--watch`
 * rebuilds the bundles on change (the manifest is written once at start, so
 * restart the watcher after changing an adapter's match patterns).
 */
import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const dev = process.argv.includes("--dev");
const watch = process.argv.includes("--watch");

/**
 * Collects every adapter's match patterns by bundling the site registry for
 * Node and importing it. The bundle goes under node_modules/.cache so its
 * external package imports resolve from the project's node_modules.
 */
async function readAdapterMatches() {
  const cacheDir = join(root, "node_modules", ".cache", "ai-chat-formatter");
  const outfile = join(cacheDir, `sites-${Date.now()}.mjs`);
  await esbuild.build({
    entryPoints: [join(root, "src", "sites", "index.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    outfile,
    logLevel: "warning",
  });
  try {
    const { SITE_ADAPTERS } = await import(pathToFileURL(outfile).href);
    return [...new Set(SITE_ADAPTERS.flatMap((adapter) => adapter.matches))];
  } finally {
    rmSync(outfile, { force: true });
  }
}

/** Writes dist/manifest.json from the template with the version and match patterns filled in. */
async function writeManifest() {
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(root, "src", "manifest.json"), "utf8"));
  manifest.version = version;
  manifest.content_scripts[0].matches = await readAdapterMatches();
  writeFileSync(join(dist, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

/** Copies the static files the manifest and options page reference. */
function copyStatic() {
  copyFileSync(join(root, "src", "content", "content.css"), join(dist, "content.css"));
  copyFileSync(join(root, "src", "options", "options.html"), join(dist, "options.html"));
}

/** esbuild options shared by the content script and options page bundles. */
const bundleOptions = {
  entryPoints: {
    content: join(root, "src", "content", "index.ts"),
    options: join(root, "src", "options", "options.ts"),
  },
  outdir: dist,
  bundle: true,
  format: "iife",
  target: "chrome120",
  minify: !dev,
  sourcemap: dev ? "inline" : false,
  logLevel: "warning",
};

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
copyStatic();
await writeManifest();

if (watch) {
  const context = await esbuild.context({
    ...bundleOptions,
    plugins: [{ name: "copy-static", setup: (build) => build.onEnd(copyStatic) }],
  });
  await context.watch();
  console.log("Watching for changes; dist/ is ready to load unpacked.");
} else {
  await esbuild.build(bundleOptions);
  console.log("Built the extension into dist/.");
}
