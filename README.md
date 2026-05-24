# ocf-water-crew

Scheduler for water crew work assignments at Oregon Country Faire. The
algorithm in `src/scheduler.ts` runs both under Node (for local
iteration) and as a Google Apps Script bound to the production sheet
(deployed via `clasp push`).

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
  Scheduler.js     generated from src/scheduler.ts
  Code.js          copied verbatim from src/Code.js (the sheet wrapper)
  appsscript.json  copied verbatim from ./appsscript.json (the manifest)
```

`dist/` is gitignored — it is the rootDir clasp pushes from.

`src/Code.js` is the sheet-side wrapper (menu setup, sheet I/O, the
`runAssignVolunteers` entry point). It is hand-maintained JavaScript,
not TypeScript, because it consumes Apps Script globals directly.

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
codebase before this work.
