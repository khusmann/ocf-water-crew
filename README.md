# ocf-water-crew

Scheduler for water crew work assignments at Oregon Country Faire. The
algorithm in `src/scheduler.ts` runs both under Node (for local
iteration) and as a Google Apps Script bound to the production sheet
(via the `dist/Code.gs` build artifact).

## Requirements

- Node ≥ 22.6 (pinned in `package.json` — the test runner and local
  runner use Node's native `--experimental-strip-types` to load `.ts`
  files directly).
- `npm install` to install the two devDeps (`typescript`,
  `@types/google-apps-script`). No runtime dependencies.

## Commands

| Command           | What it does                                                                 |
|-------------------|------------------------------------------------------------------------------|
| `npm test`        | Runs the test suite under `node --test`.                                     |
| `npm start`       | Reads `data/thejson.json`, runs `assign()`, writes `data/theresultjson.json`.|
| `npm run build`   | Emits `dist/Code.gs` — the single-file, paste-into-GAS build artifact.       |
| `npm run typecheck`| Type-checks `src/`, `bin/`, and `test/` with no emit.                       |

`data/` is gitignored because the live JSON contains real volunteer
names. See `.claude/CLAUDE.md` for the privacy policy.

## Deploying to Google Apps Script

Today: `npm run build`, then open `dist/Code.gs`, copy, and paste into
the bound script editor.

Planned (not yet adopted): drop a `.clasp.json` at the repo root with
`rootDir: "./dist"`, add `appsscript.json` to `dist/`, then deploy with
`clasp push`. No source changes needed for the switch.

## Repository layout

See [dev/PLAN.md](dev/PLAN.md) for the target layout, the rationale
behind it, and the phased migration plan. See
[dev/CURRENT.md](dev/CURRENT.md) for an as-found snapshot of the
codebase before the migration.
