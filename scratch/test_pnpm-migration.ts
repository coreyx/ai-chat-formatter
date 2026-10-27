/**
 * Regression checks for spec/pnpm-migration: the project stays on pnpm. They
 * catch the usual ways npm creeps back in: a stray `npm install` writing
 * package-lock.json, a script or doc telling someone to run npm, or the
 * esbuild install-script decision going missing, which makes `pnpm install`
 * stop. Run with `pnpm test`, which runs every scratch/test_*.ts script. Each
 * check prints PASS or FAIL, and the process exits non-zero if any failed.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const results: { name: string; error?: unknown }[] = [];

/** Runs `fn` as one named check and records whether it threw. */
function check(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name });
  } catch (error) {
    results.push({ name, error });
  }
}

/**
 * An npm or npx command, such as `npm install` or `npm run build`. The
 * lookbehind skips `pnpm …`, and prose about npm itself ("npm 11") isn't a
 * command, so it doesn't match.
 */
const NPM_COMMAND = /(?<![\w-])(?:npm (?:install|i|ci|run|test|exec|start)\b|npx )/;

/** The lines of `text` that run npm, with their line numbers, for a readable failure. */
function npmCommandLines(text: string): string[] {
  return text
    .split("\n")
    .map((line, i) => `${i + 1}: ${line.trim()}`)
    .filter((line) => NPM_COMMAND.test(line));
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { packageManager?: string; scripts: Record<string, string> };

check("package.json: pins pnpm to an exact version", () => {
  assert.match(packageJson.packageManager ?? "", /^pnpm@\d+\.\d+\.\d+$/);
});

check("package.json: no script calls npm", () => {
  for (const [name, command] of Object.entries(packageJson.scripts)) {
    assert.doesNotMatch(command, NPM_COMMAND, `script "${name}"`);
  }
});

check("lockfiles: pnpm-lock.yaml is there, and package-lock.json isn't", () => {
  assert.ok(existsSync("pnpm-lock.yaml"), "pnpm-lock.yaml is missing");
  assert.ok(!existsSync("package-lock.json"), "package-lock.json is back; was `npm install` run?");
});

check("pnpm-workspace.yaml: esbuild's install script is decided (off), so pnpm install doesn't stop", () => {
  const workspace = readFileSync("pnpm-workspace.yaml", "utf8");
  // The esbuild line must sit under allowBuilds, with only comments in between.
  assert.match(workspace, /^allowBuilds:[ \t]*\n(?:[ \t]+#.*\n)*[ \t]+esbuild:[ \t]*false[ \t]*$/m);
});

check("docs and scripts: neither the README nor scripts/ tells anyone to run npm", () => {
  const files = ["README.md", ...readdirSync("scripts").map((name) => join("scripts", name))];
  for (const file of files) {
    assert.deepEqual(npmCommandLines(readFileSync(file, "utf8")), [], file);
  }
});

check("the npm-command pattern: catches npm and npx commands, not pnpm or prose about npm", () => {
  for (const command of ["npm install", "npm i", "npm ci", "npm run build", "run `npm test` first", "npx tsc"]) {
    assert.ok(NPM_COMMAND.test(command), command);
  }
  for (const text of ["pnpm install", "pnpm run build", "pnpm test", "npm 11", "npm-debug.log", "the npm registry"]) {
    assert.ok(!NPM_COMMAND.test(text), text);
  }
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

for (const result of results) {
  console.log(`${result.error ? "FAIL" : "PASS"}  ${result.name}`);
  if (result.error) console.log(`      ${String((result.error as Error).message ?? result.error).split("\n").join("\n      ")}`);
}
const failed = results.filter((result) => result.error).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
