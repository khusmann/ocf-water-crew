# ocf-water-crew

Scheduler for water crew work assignments at Oregon Country Faire. The
rules engine in `src/engine.ts` runs both under Node (for local
iteration) and as a Google Apps Script bound to the production sheet
(deployed via `clasp push`). `src/sheet.ts` reads the sheet into the
engine's canonical types, runs the engine, and writes the result back.

## Requirements

- Node ≥ 22.6 (pinned in `package.json` — the test runner and local
  runner use Node's native `--experimental-strip-types` to load `.ts`
  files directly).
- `npm install` to install the devDeps. No runtime dependencies.

## Commands

| Command            | What it does                                                                  |
|--------------------|-------------------------------------------------------------------------------|
| `npm test`         | Runs the test suite under `node --test`.                                      |
| `npm start`        | Reads `data/thejson.json`, runs `assign()`, writes `data/theresultjson.json`. |
| `npm run build`    | Assembles the `dist/` deploy directory (see below).                           |
| `npm run push`     | Build + `clasp push` to the bound script.                                     |
| `npm run pull`     | `clasp pull` — pulls the live bound script into `dist/`.                      |
| `npm run typecheck`| Type-checks `src/`, `bin/`, and `test/` with no emit.                         |

`data/` is gitignored because the live JSON contains real volunteer
names. See `.claude/CLAUDE.md` for the privacy policy.

## What `npm run build` produces

```
dist/
  scheduler.js     bundle of src/*.ts (engine + rules + rulesets + sheet),
                   ES module syntax stripped, concatenated in dependency order
  appsscript.json  copied verbatim from ./appsscript.json (the manifest)
```

`dist/` is gitignored — it is the rootDir clasp pushes from. The bundle is
assembled by `bin/build-gas.ts` (GAS has no module system, so everything
lands in one global scope).

`src/sheet.ts` is the sheet-side layer (menu setup, sheet I/O, the
`runAssignVolunteers` / print entry points). It consumes Apps Script
globals directly and maps sheet rows to/from the engine's canonical types.

## Deploying

```
npm run push
```

That builds and runs `clasp push` against the script ID pinned in
`.clasp.json`. Use `npm run pull` if you've edited the script in the
GAS editor and need to bring those changes back into the repo
(diff before committing).

## Repository layout

See [dev/PLAN.md](dev/PLAN.md) for the migration plan and
[dev/CURRENT.md](dev/CURRENT.md) for the as-found snapshot of the
codebase before this work. [dev/UNIFY_SHEET.md](dev/UNIFY_SHEET.md) tracks
the sheet↔engine unification (the removal of the legacy translation layer).
