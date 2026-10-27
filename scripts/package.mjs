/**
 * Zips the built extension in `dist/` into `release/ai-chat-formatter-<version>.zip`,
 * the archive attached to each GitHub release for "Load unpacked" installs.
 * The files sit at the root of the archive, so extracting it gives a folder
 * that Chrome can load directly.
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(root, "dist");
const releaseDir = join(root, "release");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

/** Collects every file under `dir` as zip entries keyed by their forward-slash path relative to `dist/`. */
function collect(dir, entries = {}) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, entries);
    else entries[relative(distDir, full).split(sep).join("/")] = readFileSync(full);
  }
  return entries;
}

const entries = collect(distDir);
if (!entries["manifest.json"]) {
  console.error("dist/manifest.json is missing; run `pnpm run build` first.");
  process.exit(1);
}

mkdirSync(releaseDir, { recursive: true });
const outFile = join(releaseDir, `ai-chat-formatter-${version}.zip`);
writeFileSync(outFile, zipSync(entries, { level: 9 }));
console.log(`Packaged ${Object.keys(entries).length} files into ${relative(root, outFile)}`);
