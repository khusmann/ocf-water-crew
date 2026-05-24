# PLAN — migrate `ocf-water-crew` to a clean structure

Goal: get from the as-found state described in [CURRENT.md](CURRENT.md) to a
repo with proper file names, a real test runner, a clean local/GAS dev loop,
and a fixed-point "this is what the current algorithm does" test suite — so
that the next step (rule-based rewrite) can be done with confidence.

**Out of scope for this plan:** CI, any change to the algorithm's behavior,
and the actual move to `clasp` (we set up *clasp-ready* but don't adopt it).
The algorithm gets *moved to TypeScript, exported, and pinned by tests* —
not rewritten. Rewrite is Phase 4, deferred.

---

## Tooling decisions

**Decided: npm + TypeScript, zero runtime dependencies, two dev deps (`typescript`, `@types/google-apps-script`). Structured to drop `clasp` in later without restructuring.**

### Why npm
The shipped GAS artifact has no module system and no `node_modules`, so
*runtime* deps are off the table. But `package.json` still earns its
keep: `npm test`/`npm run build`/`npm start` as standard entry points,
`"engines"` to pin the Node version, a place for devDeps.

### Why TypeScript
- The data model is the complicated part of this codebase (see
  CURRENT.md §4: parallel arrays, `timeId` ↔ `timePreference` mappings,
  pre-staged vs assigned, `dayId` primes). Typing it once kills a whole
  class of "what's this field again?" bugs in the rewrite.
- Apps Script V8 runtime accepts modern JS, and `tsc` can emit a single
  GAS-compatible file via `module: "none"` + `outFile`. So TS adds a
  build step but no runtime cost.
- Two devDeps (`typescript`, `@types/google-apps-script`). No bundler,
  no test transformer if we use Node ≥22.6's native type stripping
  (see below).
- `@types/google-apps-script` gives us `SpreadsheetApp`, `Sheet`,
  `Range`, etc. The algorithm itself doesn't touch any of those, so
  these types are dormant during Phase 1–3. They're installed now so
  that when clasp lands and the sheet-side wrapper moves into this
  repo, no tooling change is needed — just write the wrapper as `.ts`
  and the types are already there. (Loaded via
  `"types": ["google-apps-script"]` in the GAS tsconfig.)

### Test runner with TypeScript: three options
1. **Node ≥22.6 `--experimental-strip-types`** (recommended). Native, zero
   extra deps. Run with `node --test --experimental-strip-types test/`.
   Requires pinning Node ≥22.6 in `engines`. Caveat: doesn't support
   `enum` or namespace — we don't need either.
2. **`tsx` as devDep.** Drop-in if we need to support older Node. Pulls
   in esbuild transitively.
3. **Compile then test.** `tsc && node --test dist-test/`. Slowest loop;
   only worth it if (1) and (2) both fail.

**Going with (1).** Bump to (2) only if we hit a real friction point.

### Clasp readiness (not adoption)
`clasp push` expects a directory containing one or more `.js`/`.gs` files
plus an `appsscript.json` manifest, with a `.clasp.json` at the project
root pointing to that directory via `"rootDir"`. Our `dist/` will already
hold `Code.gs` post-build — adopting clasp later is just:

1. `npm i -D @google/clasp`
2. `clasp login`
3. Drop `appsscript.json` into `dist/`
4. Add `.clasp.json` at the repo root with `"rootDir": "./dist"` and the
   bound script's `scriptId`.
5. `clasp push` instead of copy-paste.

Nothing in this plan needs to change to enable that. Flagged here so we
don't accidentally couple `dist/` to non-clasp-friendly conventions
(e.g. don't put non-GAS files in `dist/`).

Push back on any of this if you'd rather: keep things looser (no TS),
go further (add Prettier/ESLint now), or do the clasp adoption as part
of Phase 1 rather than later.

---

## Target layout

```
ocf-water-crew/
  package.json              scripts + Node engine; one devDep (typescript)
  tsconfig.json             strict; targets ES2019; module: none + outFile
                            for the GAS build
  tsconfig.tools.json       extends tsconfig.json; module: NodeNext, used
                            for bin/* scripts that need fs/path/etc.
  README.md                 short — what it is, how to run/test/build/deploy
  .gitignore                add /dist, /build, keep /data

  src/
    scheduler.ts            the algorithm: assign() + helpers, with exports
    types.ts                Person, Assignment, AssignmentResult, etc. —
                            the data shapes from CURRENT.md §4, hand-written
                            from the live JSON. Imported by scheduler.ts
                            and tests.

  test/
    helpers.test.ts         unit tests for priorityComparison,
                            genericCompare, splitByProperty, expandObjects,
                            distributeSort  (the existing 4 assertions
                            roll into here)
    scheduler.test.ts       end-to-end behavior tests against synthetic
                            fixtures (Phase 2)
    fixtures/
      tiny.json             smallest input that exercises pre-stage copy
      special-jobs.json     specialist matching, bucket-duplication trick
      same-day.json         dayId prime-multiplication mechanic
      rest-gap.json         9-hour rest-gap constraint
      relaxation.json       forces level-1/2 relaxation passes
      brute-force.json      forces the gap-fill block
      expected/             snapshotted outputs (committed)

  bin/
    run-local.ts            reads data/thejson.json, calls assign(),
                            writes data/theresultjson.json
                            (replaces the IGNORE-below-HERE block)
    build-gas.ts            emits dist/Code.gs from src/scheduler.ts —
                            shells out to tsc with the GAS tsconfig and
                            tacks on a "do not edit" header
    anonymize.ts            (Phase 2) reads data/thejson.json, rewrites
                            every name field with a placeholder, writes
                            test/fixtures/realistic.json

  dist/                     generated, gitignored
    Code.gs                 single-file GAS-pasteable output of tsc
                            (clasp's rootDir target later)

  data/                     gitignored (real names) — unchanged

  dev/
    CURRENT.md              the as-found writeup
    PLAN.md                 this file
```

**Files to delete:**

- `themjs.mjs` — contents migrate to `src/scheduler.ts`
- `runthemjs.mjs` — replaced by `bin/run-local.ts`
- `run_tests.mjs` — replaced by `test/helpers.test.ts`
- `theworkingversion.mjs` — 0-byte; gone

**Files to keep:** `LICENSE`, `README.md` (rewrite), `.claude/CLAUDE.md`,
`dev/CURRENT.md`, `dev/PLAN.md`.

Naming rationale: `themjs.mjs` is unsearchable and `runthemjs` / `thejson`
are riffs on it. `scheduler`, `run-local`, `build-gas` say what the file
does the first time you read the name.

### Why two tsconfigs
`src/scheduler.ts` has to compile to a single file with no module syntax
(GAS doesn't have modules), which means `module: "none"` + `outFile`. But
that mode forbids `import`/`export` in source — fine for `src/`, broken
for `bin/run-local.ts` which needs `import fs from "node:fs"`. So
`tsconfig.tools.json` extends the base with `module: "NodeNext"` for
the bin scripts. It's the standard split.

The alternative — one tsconfig that uses modules, plus a separate bundle
step that strips `export` and concatenates — works too, but it's more
moving parts. tsc's `outFile` is the simplest thing that produces the
right shape for GAS, and clasp later just consumes whatever lands in
`dist/`.

---

## Build/run/test pipeline

All commands assume Node ≥22.6 (pinned in `package.json` `engines`).

### `npm test`
Runs `node --test --experimental-strip-types test/`. Picks up both
`helpers.test.ts` and `scheduler.test.ts`. Tests import from
`src/scheduler.ts` directly — Node strips the types at load time, no
compile step needed.

### `npm start` (or `npm run local`)
Runs `node --experimental-strip-types bin/run-local.ts`. Reads
`data/thejson.json`, calls `assign()`, writes `data/theresultjson.json`.
This is what `node themjs.mjs` currently does, minus the ritual of
commenting out the import block.

### `npm run build`
Runs `tsc -p tsconfig.json`. Emits `dist/Code.gs` — a single file with
no module syntax, all functions/consts at top level, ready for GAS.
The "Generated, do not edit" header is prepended via a tiny postbuild
step (one `fs.writeFileSync` call wrapping the tsc output, or just a
`build-gas.ts` wrapper that shells out to tsc and prepends).

GAS deployment today is then: `npm run build`, open `dist/Code.gs`, copy,
paste into the bound script editor. No commenting-out, no manual edits.
The sheet-side wrapper still calls `assign(assignments, people)` exactly
as today.

GAS deployment **once clasp is adopted**: `npm run build && clasp push`.
No source changes needed for the switch.

### `npm run typecheck`
Runs `tsc --noEmit -p tsconfig.json` and `tsc --noEmit -p tsconfig.tools.json`.
Catches type errors without producing output. Useful as a fast pre-commit
check.

---

## Phase 1 — repo scaffolding + port to TS (mechanical, no behavior change)

1. Add `package.json` with:
   - `"engines": { "node": ">=22.6" }`
   - `scripts`: `test`, `start`, `build`, `typecheck`
   - `devDependencies`: `typescript` (latest 5.x),
     `@types/google-apps-script` (latest 1.x)
   - No runtime deps.
2. Add `tsconfig.json` (GAS build target): `strict: true`, `target: "ES2019"`,
   `module: "none"`, `outFile: "./dist/Code.gs"`, `include: ["src/**/*.ts"]`,
   `types: ["google-apps-script"]`, `removeComments: false`.
3. Add `tsconfig.tools.json` extending the base with `module: "NodeNext"`,
   `moduleResolution: "NodeNext"`, `include: ["bin/**/*.ts", "test/**/*.ts", "src/**/*.ts"]`,
   `noEmit: true` (only used for typecheck).
4. Add `src/types.ts` with hand-written `Person`, `Assignment`,
   `AssignmentResult`, `ShiftChartEntry` (and any others needed) derived
   from CURRENT.md §4. Use `readonly` where appropriate; mark
   `assignedVolunteer`, `sameDayAssigned` etc. as the mutated fields.
5. Move `themjs.mjs` → `src/scheduler.ts`. Mechanical changes only:
   - Add types to function signatures and locals, importing from `types.ts`.
     Resolve `any`s by reading what the live data actually contains, not
     by guessing.
   - Restore named exports for `assign`, `priorityComparison`,
     `genericCompare`, `splitByProperty`, `expandObjects`,
     `distributeSort`, `personComparison`, `sortPeople`, `sortAssignments`.
   - Delete the IGNORE block and the commented-out `clear()`,
     `doubleShiftTaken`, and design-note blocks at the bottom — CURRENT.md
     preserves them.
   - **Do not refactor logic.** Bugs documented in CURRENT.md §6 stay in.
     Adding types may surface them (e.g. `"ShiftStart"` vs `shiftStart`) —
     note them in a `// TODO(phase-4):` comment and leave the behavior
     unchanged. The Phase-2 snapshots will pin them.
6. Add `bin/run-local.ts` — `import { assign } from "../src/scheduler.ts"`,
   read `data/thejson.json`, write `data/theresultjson.json`.
7. Add `bin/build-gas.ts` — shell out to `tsc -p tsconfig.json`, then
   prepend the "Generated from src/scheduler.ts — do not edit" header
   to `dist/Code.gs`.
8. Port `run_tests.mjs` → `test/helpers.test.ts`. Use `node:test` +
   `node:assert/strict`.
9. Delete the four obsolete files.
10. Update `.gitignore`: add `/dist`, `/build`, keep `/data`,
    `node_modules/`.
11. Rewrite `README.md`: one paragraph on what this is, then the
    commands (test/start/build/typecheck, deploy ritual, and a one-line
    "clasp coming later" note).

**Exit criteria for Phase 1:**
- `npm install` succeeds (just typescript).
- `npm run typecheck` passes with no errors.
- `npm test` runs the 4 existing comparator assertions and passes.
- `npm start` reproduces the current `data/theresultjson.json`
  byte-for-byte.
- `npm run build` produces a `dist/Code.gs` that, pasted into GAS,
  behaves identically to the hand-pasted version today.

The byte-for-byte check on `data/theresultjson.json` is the safety net
for the port — TS shouldn't change runtime behavior, but a stray
coercion (e.g. `as number` on something that was actually a string in
practice) can. Diff before/after to confirm.

---

## Phase 2 — pin the current algorithm with synthetic tests

This is the load-bearing phase: we need a checked-in regression suite
before we touch the algorithm, and we can't check in the real input
because of the names policy (see [CLAUDE.md](../.claude/CLAUDE.md)).

### Approach
Build small synthetic fixtures using placeholder names ("Person 01",
"Person 02", …). Each fixture targets one or two specific code paths
in `assign()` so a future change that breaks that path fails a named,
diagnosable test instead of an opaque whole-output diff.

For each fixture, commit both `fixtures/foo.json` (input) and
`fixtures/expected/foo.json` (output of running the **current**
`assign()` against it). The tests read both and `assert.deepEqual`.
This locks in current behavior — *including the bugs documented in
CURRENT.md §6*. Those get fixed deliberately in Phase 4, not
incidentally now.

### Fixtures to build (one file each)

| Fixture            | Exercises                                                              |
|--------------------|------------------------------------------------------------------------|
| `tiny.json`        | 2 people, 2 slots, all pre-staged. Smoke test of stage-copy path.      |
| `special-jobs.json`| One specialist, one specialist slot, plus a general slot they also     |
|                    | get duplicated into (the line-218 bucket trick).                       |
| `same-day.json`    | One person, two slots on the same day → `sameDayAssigned` flag set;    |
|                    | also a slot on a different day to confirm flag *not* set there.        |
| `rest-gap.json`    | Adjacent shifts violating the 9-hour gap → second placement skipped    |
|                    | at level 0/1, taken at level 2. Also confirms the documented bug       |
|                    | (pre-staged shifts don't enter `assignedHours`).                       |
| `relaxation.json`  | No level-0 fit; level-1 (drop time pref) finds one. Verifies pass      |
|                    | escalation works.                                                      |
| `brute-force.json` | All structured passes exhaust; brute-force gap fill (§5f) places       |
|                    | the remaining slots.                                                   |
| `time-pref-permutation.json` | Includes a `"PM, AM"` person with missing `timeId`, to      |
|                    | pin current `undefined`-sorts-worst behavior (CURRENT §6.10).          |

Plus one big anonymized fixture:

| Fixture            | Exercises                                                              |
|--------------------|------------------------------------------------------------------------|
| `realistic.json`   | Same *shape* as `data/thejson.json` (127 people, 416 slots, same       |
|                    | jobs, same day/time distribution) but with placeholder names. Built    |
|                    | once via a `bin/anonymize.mjs` script that reads the live file and     |
|                    | rewrites every `first`/`last`/`nickname`/`stagedVolunteer` field.      |
|                    | Acts as the broad regression catch.                                    |

### Test structure
`test/scheduler.test.ts` uses `node:test` describe/it. One `test()`
per fixture: load input (typed via `types.ts`), call `assign()`, compare
against expected. Keep the comparison strict — order of array elements
included — since the algorithm's output order is observable behavior
the rewrite needs to preserve (or deliberately change).

### When a fixture's expected output is "wrong"
Several documented bugs (CURRENT §6) will appear in the expected files
— `nonIdealShiftTaken` count of 0 when it should fire, `doubleShiftTaken`
always false, rest gap not enforced against pre-stages. **Snapshot
them as-is.** Add a comment in the test naming the bug and pointing at
the CURRENT.md section. Phase 4 will flip these to the corrected
expectation as part of the rewrite, with the diff of expected outputs
being the proof of what the rewrite changed.

### Exit criteria for Phase 2
- All fixtures committed with current-behavior snapshots.
- `npm test` runs them all and passes.
- Removing any single line from the algorithm causes at least one
  named test to fail (informal check — don't actually commit broken
  versions, just sanity-test once).

---

## Phase 3 — small clarifying cleanups (optional, low-risk)

These are changes that don't alter behavior but make the algorithm easier
to read before Phase 4. Do them only if they're trivial and the Phase-2
snapshot suite confirms no output change. Skip anything ambiguous.

- Drop any remaining cruft inside `src/scheduler.ts` (the heap/priority-queue
  sketch comments, etc.). CURRENT.md preserves the intent.
- Fix the no-op final sort key (`"ShiftStart"` → `"shiftStart"`) **only if**
  the snapshot doesn't change. If it does change, that's a behavior delta
  — defer to Phase 4. (TypeScript may have already forced this in Phase 1
  by complaining about the unknown property — in which case it's tracked
  as a Phase-4 TODO already.)
- Extract magic numbers (4-shift cap, 9-hour rest gap) into named
  `const`s at the top of `src/scheduler.ts`.
- Tighten any `any` types that Phase 1 had to leave in to preserve
  behavior — only the ones that don't change runtime semantics.

If any of these flip a snapshot, revert and note in Phase-4 notes.

---

## Phase 4 — rule-based rewrite (deferred — plan separately)

Not designed here. Placeholder for the conversation we'll have once
Phases 1–3 are in. Inputs to that conversation will be:

- The synthetic fixture suite (the contract the rewrite must meet or
  consciously break).
- The bug list in CURRENT.md §6 (the changes we *want* the rewrite to
  make — flipping snapshots is the proof).
- A design sketch for "rules engine" — what a rule is, how rules
  compose, how priority/relaxation is expressed declaratively instead
  of as four nested loops with a `constraintRestrictionLevel` switch.

---

## Order of operations

1. Phase 1 as one commit. Verify byte-identical `theresultjson.json`
   before committing.
2. Phase 2 as a series of commits — one per fixture, so the snapshot of
   "what the current algorithm does for case X" is reviewable in
   isolation.
3. Phase 3 only if it stays trivial.
4. Stop. Re-plan Phase 4 with the user.
