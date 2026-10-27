---
status: approved
---

# Switch the project from npm to pnpm

Moves development from npm to pnpm: pnpm's lockfile replaces npm's, the pnpm version is pinned in `package.json`, and every `npm` command in the README, scripts and test comments becomes its `pnpm` equivalent. The extension itself doesn't change: every dependency stays at the exact version it has now.

## User Review Required

> [!IMPORTANT]
> **esbuild's install script stays off.** pnpm 12 runs no dependency's install script unless it's allowed. Without a decision on esbuild's, `pnpm install` stops with `ERR_PNPM_IGNORED_BUILDS`. The plan records the decision as `esbuild: false` in `pnpm-workspace.yaml`.
> - **Why off:** that script only checks esbuild's platform binary and makes its command start slightly faster. pnpm already installs the binary as a regular dependency.
> - **Tested:** with it off, a trial in a scratch copy installed cleanly, built, and passed all 6 test scripts (138 checks).
> - **Alternative:** set it to `true` to run the script as npm does today.

> [!IMPORTANT]
> **The same dependency versions.** `pnpm-lock.yaml` is made with `pnpm import`, which reads `package-lock.json` and keeps every resolved version, rather than with a fresh resolve. `package-lock.json` is then deleted. In the trial, the 8 direct dependencies matched exactly, from turndown 7.2.4 to typescript 7.0.2.

> [!NOTE]
> **pnpm is pinned to 12.6.0**, the version installed here, through `"packageManager": "pnpm@12.6.0"` in `package.json`. With Corepack (`corepack enable`, which ships with Node), anyone building from source gets that version automatically. The README's Building from source steps say so.

> [!NOTE]
> **`pnpm-workspace.yaml` is only a settings file.** pnpm 11 and later keep project settings such as `allowBuilds` there, even for a single package. It doesn't make the repo a monorepo.

> [!NOTE]
> **Your local `node_modules/` is rebuilt.** npm's layout and pnpm's differ, so `node_modules/` is deleted and reinstalled with `pnpm install`. It isn't committed, and `dist/` and `release/` aren't touched.

> [!NOTE]
> **What stays saying `npm`:** the earlier spec documents and walkthroughs under `spec/`. They're the record of what was done then, and approved documents aren't edited. Prose that's about npm itself, such as the "npm 11" line in a test fixture, is also left alone.

## Open Questions

None at this time.

## Proposed Changes

### Package manager

#### [MODIFY] `package.json`
- [x] **TASK-1:** Add `"packageManager": "pnpm@12.6.0"`, and change the `package` script to `pnpm run build && node scripts/package.mjs`.

#### [NEW] `pnpm-lock.yaml`, [NEW] `pnpm-workspace.yaml`, [DELETE] `package-lock.json`
- [ ] **TASK-2:** Move the lockfile and reinstall.
  - Run `pnpm import` to write `pnpm-lock.yaml` from `package-lock.json`, then delete `package-lock.json`.
  - Write `pnpm-workspace.yaml` with `allowBuilds:` / `esbuild: false`, plus a comment on why.
  - Delete `node_modules/` and run `pnpm install --frozen-lockfile`. It must finish without errors and leave the lockfile unchanged.

#### [MODIFY] `.gitignore`
- [ ] **TASK-3:** Replace `npm-debug.log*` with `pnpm-debug.log*`. Keep `package-lock.json` out of the ignore list, so a stray `npm install` shows up in `git status` instead of slipping by.

### Docs and messages

#### [MODIFY] `README.md`
- [ ] **TASK-4:** Change Building from source to `corepack enable` (once), `pnpm install`, `pnpm run build`, noting that Node's Corepack provides the pinned pnpm. In the Development table, change the four commands to `pnpm run build`, `pnpm run watch`, `pnpm test` and `pnpm run package`. In Adding a site, `npm test` becomes `pnpm test`.

#### [MODIFY] `scripts/package.mjs` and `scratch/test_*.ts`
- [ ] **TASK-5:** Change `run \`npm run build\` first` in `scripts/package.mjs` to `pnpm run build`. In the six test scripts' comments, `npm test` becomes `pnpm test`, including the "(npm test builds dist/ first)" section headings.

### Tests

#### [NEW] `scratch/test_pnpm-migration.ts`
- [ ] **TASK-6:** A regression script, picked up by `pnpm test`, that guards the switch. See Automated Tests below.

## Verification Plan

### Automated Tests
`pnpm test` runs every `scratch/test_*.ts`. The new `scratch/test_pnpm-migration.ts` checks:
1. `package.json` pins pnpm in `packageManager` (`pnpm@` followed by an exact version), and none of its scripts call `npm`.
2. `pnpm-lock.yaml` exists, and `package-lock.json` doesn't.
3. `pnpm-workspace.yaml` decides esbuild's install script (`esbuild: false`), so `pnpm install` doesn't stop with `ERR_PNPM_IGNORED_BUILDS`.
4. Neither the README nor the files under `scripts/` tell anyone to run `npm`.

Also checked by hand after TASK-2, and again at the end:
- `pnpm install --frozen-lockfile` exits 0 and leaves the lockfile unchanged.
- `pnpm test` passes all six existing scripts and the new one.
- `pnpm run package` writes `release/ai-chat-formatter-0.4.0.zip`.
- `pnpm list --depth 0` shows the same 8 versions as before.

### Manual Verification
1. In a terminal in the repo, run `corepack enable` (if not done already), then `pnpm --version`: it should print `12.6.0`.
2. Run `pnpm install`, then `pnpm run build`. Reload the extension from `brave://extensions` and copy a reply on Copilot to confirm the build works.
3. Optionally, clone the repo into a new folder and follow the README's Building from source steps exactly.
