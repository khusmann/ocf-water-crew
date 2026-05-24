# PLAN — migrate `ocf-water-crew` to a clean structure

Goal: get from the as-found state described in [CURRENT.md](CURRENT.md) to a
repo with proper file names, a real test runner, a clean local/GAS dev loop,
and a fixed-point "this is what the current algorithm does" test suite — so
that the next step (rule-based rewrite) can be done with confidence.

**Out of scope for this plan:** CI, any change to the algorithm's
behavior. The algorithm gets *moved to TypeScript, exported, and
pinned by tests* — not rewritten. Rewrite is Phase 4, deferred.

---

## Tooling decisions

**Decided: npm + TypeScript + clasp, zero runtime dependencies, four devDeps (`typescript`, `@types/google-apps-script`, `@types/node`, `@google/clasp`).**

### Why npm
The shipped GAS artifact has no module system and no `node_modules`, so
*runtime* deps are off the table. But `package.json` still earns its
keep: `npm test`/`npm run build`/`npm start`/`npm run push` as
standard entry points, `"engines"` to pin the Node version, a place
for devDeps.

### Why TypeScript
- The data model is the complicated part of this codebase (see
  CURRENT.md §4: parallel arrays, `timeId` ↔ `timePreference` mappings,
  pre-staged vs assigned, `dayId` primes). Typing it once kills a whole
  class of "what's this field again?" bugs in the rewrite.
- Apps Script V8 runtime accepts modern JS. `tsc` emits per-file ESM
  to `build/`, and `bin/build-gas.ts` strips `import`/`export` lines
  and assembles `dist/` for clasp. Build step, no runtime cost.
- `@types/google-apps-script` gives us `SpreadsheetApp`, `Sheet`,
  `Range`, etc. — used heavily by `src/sheet.ts`, the sheet-side
  wrapper. `@types/node` is needed for `bin/` scripts that use
  `node:fs`/`node:path`.

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

### Clasp (adopted)
`.clasp.json` at the repo root pins the bound script ID and points
clasp at `./dist` as its `rootDir`. `appsscript.json` (the GAS
manifest) lives at the repo root and is copied verbatim into `dist/`
during build. `npm run push` runs build + `clasp push`; `npm run pull`
brings server-side edits back into `dist/` for diffing.

The hand-maintained sheet-side wrapper (`src/sheet.ts`) was pulled
into the repo when clasp was adopted. It uses `SpreadsheetApp` and
friends directly, and imports `{ assign }` from `./scheduler.js` — the
build strips the import line so both files land in GAS as siblings in
the same global scope.

---

## Target layout

```
ocf-water-crew/
  package.json              scripts + Node engine + devDeps
  package-lock.json
  tsconfig.json             strict; ES2019; emits ESM to ./build/
  tsconfig.tools.json       extends tsconfig.json; NodeNext + noEmit,
                            used for typechecking bin/test/src
  .clasp.json               script ID + rootDir: ./dist
  appsscript.json           GAS manifest; copied verbatim into dist/
  README.md                 what it is, how to run/test/build/push
  .gitignore                ignores /dist, /build, /data, node_modules

  src/
    scheduler.ts            the algorithm: assign() + helpers, exported
    sheet.ts                GAS sheet wrapper: onOpen, menu wiring,
                            runAssignVolunteers, sheet I/O. Imports
                            { assign } from ./scheduler.js.
    types.ts                Person, Assignment, IndexedAssignment, etc.
                            — data shapes from CURRENT.md §4, imported
                            by scheduler.ts, sheet.ts, and tests.

  test/
    helpers.test.ts         unit tests for priorityComparison and
                            related comparators (the original assertions
                            from run_tests.mjs)
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
    build-gas.ts            tsc → strip imports/exports → assemble
                            dist/ (scheduler.js + sheet.js +
                            appsscript.json) for clasp push
    anonymize.ts            (Phase 2) reads data/thejson.json, rewrites
                            every name field with a placeholder, writes
                            test/fixtures/realistic.json

  build/                    generated, gitignored — raw tsc output
  dist/                     generated, gitignored — clasp rootDir
    scheduler.js            algorithm, generated from src/scheduler.ts
    sheet.js                wrapper, generated from src/sheet.ts
    appsscript.json         copied from ./appsscript.json

  data/                     gitignored (real names) — unchanged

  dev/
    CURRENT.md              the as-found writeup
    PLAN.md                 this file
```

**Files deleted in Phase 1:** `themjs.mjs`, `runthemjs.mjs`,
`run_tests.mjs`, `theworkingversion.mjs`. Contents migrated where
relevant.

Naming rationale: `themjs.mjs` is unsearchable and `runthemjs` /
`thejson` are riffs on it. `scheduler`, `sheet`, `run-local`,
`build-gas` say what the file does the first time you read the name.

### Why two tsconfigs
`tsconfig.json` drives the build: `module: "ES2020"`,
`moduleResolution: "bundler"`, `outDir: "./build"`. Each `src/*.ts`
file compiles to a sibling `build/*.js`. `bin/build-gas.ts` then
strips `import`/`export` lines from those outputs and writes
`dist/scheduler.js` + `dist/sheet.js`, plus a copy of
`appsscript.json`. clasp pushes from `dist/`.

`tsconfig.tools.json` extends the base with `module: "NodeNext"` and
`noEmit: true`. It exists only for `npm run typecheck` and covers
`bin/`, `test/`, and `src/` in one pass — so editor diagnostics and
the typecheck script see the same world as Node when it runs the
`bin/` and `test/` scripts via `--experimental-strip-types`.

Why not `tsc --outFile` for a single GAS bundle? Because `outFile`
requires `module: "none" | "amd" | "system"` — none of which allow
`import`/`export` in source. We need exports so the test runner and
local runner can import from `src/scheduler.ts`. The strip-and-copy
approach is a tiny amount of post-processing for a much cleaner source
layout.

---

## Build/run/test pipeline

All commands assume Node ≥22.6 (pinned in `package.json` `engines`).

### `npm test`
Runs `node --test --experimental-strip-types "test/**/*.test.ts"`.
Picks up `helpers.test.ts` and (in Phase 2) `scheduler.test.ts`. Tests
import from `src/scheduler.ts` directly — Node strips the types at
load time, no compile step needed.

### `npm start` (or `npm run local`)
Runs `node --experimental-strip-types bin/run-local.ts`. Reads
`data/thejson.json`, calls `assign()`, writes `data/theresultjson.json`.

### `npm run build`
Runs `node --experimental-strip-types bin/build-gas.ts`, which:

1. Wipes `build/` and `dist/`.
2. Shells out to `tsc -p tsconfig.json` — emits per-file JS to
   `build/` (scheduler.js, sheet.js).
3. For each, strips `import` and `export` lines via regex, prepends a
   "Generated, do not edit" header, writes to `dist/`.
4. Copies `./appsscript.json` → `dist/appsscript.json` verbatim.

### `npm run push`
`npm run build && clasp push`. Deploys `dist/` to the bound script.

### `npm run pull`
`clasp pull`. Pulls server-side state into `dist/`. Use to diff against
local before committing edits made in the GAS editor.

### `npm run typecheck`
Runs `tsc --noEmit -p tsconfig.tools.json`, covering `bin/`, `test/`,
and `src/`. Catches type errors without producing output.

---

## Phase 1 — repo scaffolding + port to TS — **done**

What landed (see git history for the detail):

- `package.json` with `engines.node >=22.6`, four devDeps (`typescript`,
  `@types/google-apps-script`, `@types/node`, `@google/clasp`), no
  runtime deps. `"type": "module"` so Node's strip-types treats `.ts`
  as ESM.
- `tsconfig.json` (build) + `tsconfig.tools.json` (typecheck). See
  "Why two tsconfigs" above.
- `src/types.ts` — `Person`, `Assignment`, `IndexedAssignment`,
  `ShiftChartEntry`, etc., hand-derived from CURRENT.md §4.
- `src/scheduler.ts` — port of `themjs.mjs`, types added without
  refactor. Bugs from CURRENT.md §6 preserved and marked with
  `// TODO(phase-4):` comments (nonIdealShiftTaken inverted condition,
  pre-staged hours not pushed, `"ShiftStart"` no-op sort key, level-3
  unimplemented, dense-id assumption, dead `.timePriority` access).
- `src/sheet.ts` — sheet wrapper, pulled from the bound script via
  clasp, then ported to TS. Imports `{ assign }` from `./scheduler.js`.
- `bin/run-local.ts`, `bin/build-gas.ts` — Node entry points.
- `test/helpers.test.ts` — the original `priorityComparison` assertions
  from `run_tests.mjs`, re-homed under `node:test`.
- Clasp wired up: `.clasp.json`, `appsscript.json` at root, `npm run push`.
- Deleted: `themjs.mjs`, `runthemjs.mjs`, `run_tests.mjs`,
  `theworkingversion.mjs`.

Exit criteria met: `npm test` passes, `npm run typecheck` passes,
`npm start` reproduces `data/theresultjson.json` byte-for-byte against
the pre-port baseline, `npm run build` produces a `dist/` that
`clasp push` deploys and that runs identically to the prior bound
script.

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
|                    | once via a `bin/anonymize.ts` script that reads the live file and      |
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

1. ~~Phase 1 as one commit. Verify byte-identical `theresultjson.json`
   before committing.~~ **done**
2. Phase 2 as a series of commits — one per fixture, so the snapshot of
   "what the current algorithm does for case X" is reviewable in
   isolation. **next**
3. Phase 3 only if it stays trivial.
4. Stop. Re-plan Phase 4 with the user.
