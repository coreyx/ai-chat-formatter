/**
 * Runs every regression script in scratch/ (`test_*.ts`): builds the extension
 * first, since some checks read dist/, then bundles each script for Node with
 * esbuild and runs it. Exits non-zero if any script fails, after running all
 * of them so one failure doesn't hide another.
 */
import * as esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const scratch = join(root, "scratch");
const outDir = join(scratch, ".out");

const build = spawnSync(process.execPath, [join(root, "scripts", "build.mjs")], { cwd: root, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const scripts = readdirSync(scratch).filter((name) => /^test_.*\.ts$/.test(name)).sort();
const failed = [];
for (const script of scripts) {
  const outfile = join(outDir, script.replace(/\.ts$/, ".mjs"));
  await esbuild.build({
    entryPoints: [join(scratch, script)],
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    outfile,
    logLevel: "warning",
  });
  console.log(`\n=== ${script} ===`);
  const run = spawnSync(process.execPath, [outfile], { cwd: root, stdio: "inherit" });
  if (run.status !== 0) failed.push(script);
}

console.log(failed.length ? `\nFailed: ${failed.join(", ")}` : `\nAll ${scripts.length} test scripts passed.`);
process.exit(failed.length ? 1 : 0);
