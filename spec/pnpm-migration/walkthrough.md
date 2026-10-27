# Walkthrough: Switch to pnpm

The project now uses pnpm 12.6.0 instead of npm. `pnpm-lock.yaml` replaces `package-lock.json` with every dependency at the version it had, the pnpm version is pinned in `package.json`, and the README, the package script and the test comments say `pnpm`. The built extension is unchanged.

## What Was Implemented

### 1. Package manager
- **`package.json`**: `"packageManager": "pnpm@12.6.0"`, and the `package` script runs `pnpm run build`.
- **`pnpm-lock.yaml`** (new): written by `pnpm import` from `package-lock.json`, which was then deleted.
- **`pnpm-workspace.yaml`** (new): `allowBuilds: esbuild: false`, with comments on why. pnpm 12 runs no dependency install scripts unless allowed, and stops with `ERR_PNPM_IGNORED_BUILDS` while one is undecided. esbuild works without its script, since pnpm installs its platform binary as an optional dependency.
- **`node_modules/`**: deleted and reinstalled with `pnpm install --frozen-lockfile`.
- **`.gitignore`**: `pnpm-debug.log*` replaces `npm-debug.log*`. `package-lock.json` isn't ignored, so a stray `npm install` shows up in `git status`.

### 2. Docs and messages
- **`README.md`**:
  - Building from source now runs `corepack enable`, `pnpm install` and `pnpm run build`, with a note on Corepack and the pinned version.
  - The Development table and Adding a site use `pnpm`.
- **`scripts/package.mjs`**: its "run the build first" message says `pnpm run build`.
- **`scratch/test_*.ts`**: the six existing scripts' comments say `pnpm test`.
- **Left as they were:**
  - The earlier spec documents and walkthroughs under `spec/`.
  - Prose about npm itself, such as the "npm 11" fixture text.

### Changes made during implementation
- **10 direct dependencies, not 8.** The plan's count missed two of the ten (2 runtime and 8 dev). All ten match their npm versions exactly.
- **README development tree** (`8b19e73`, `bc4a0fa`): it was missing `test_min-heading-level.ts`, which the minimum-heading-level wrap-up should have added. Both it and the new `test_pnpm-migration.ts` are now listed.
- **The 0.4.0 release zip kept as it was.** `pnpm run package` writes `release/ai-chat-formatter-<version>.zip`, and the version is still 0.4.0. So the package check would have overwritten the zip built for the 0.4.0 release with unreleased code. The original was backed up first and restored afterwards, with a matching hash.

## Verification & Test Results

### Automated Tests
`pnpm test` runs `scratch/test_pnpm-migration.ts`: **6/6 passed.**
- `package.json` pins `pnpm@12.6.0`, and no script calls npm.
- `pnpm-lock.yaml` exists, and `package-lock.json` doesn't. A temporary `package-lock.json` made this check fail as intended, then was removed.
- `pnpm-workspace.yaml` sets `esbuild: false` under `allowBuilds`.
- Neither the README nor `scripts/` contains an npm or npx command.
- The pattern used to find npm commands catches `npm install`, `npm i`, `npm ci`, `npm run`, `npm test` and `npx`. It ignores `pnpm …`, "npm 11", `npm-debug.log` and "the npm registry".

Checked by hand:
- **`pnpm install --frozen-lockfile`:** exits 0, and the lockfile's hash is the same before and after.
- **Dependency versions:** all 10 direct dependencies match what npm had installed.
- **`pnpm run package`:** exits 0 and packages 8 files.
- **`tsc --noEmit`:** passes.

### Regression Testing
Under pnpm, re-run after every item:
- `scratch/test_ai-chat-formatter.ts`: **38/38 passed.**
- `scratch/test_block-reference-citations.ts`: **7/7 passed.**
- `scratch/test_copilot-source-details.ts`: **30/30 passed.**
- `scratch/test_duck-ai-adapter.ts`: **20/20 passed.**
- `scratch/test_duckduckgo-search-assist.ts`: **22/22 passed.**
- `scratch/test_min-heading-level.ts`: **21/21 passed.**

## Manual Verification
Not yet done; these are for the maintainer:
1. In a terminal in the repo, run `corepack enable` (once per machine; optional, since pnpm is already installed globally here), then `pnpm --version`. It should print `12.6.0`.
2. Run `pnpm install`, then `pnpm run build`. Reload the extension from `brave://extensions` and copy a reply on Copilot to check that the build works.
3. Optionally, clone the repo into a new folder and follow the README's Building from source steps exactly.

## Follow-ups
- `prepare-release` should run `pnpm run package` for 0.5.0. The version bump gives the zip a new name, so the overwrite above doesn't come up.
