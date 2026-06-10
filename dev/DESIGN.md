# DESIGN — ocf-water-crew

How the scheduler works as it stands. This is the single design reference;
the planning/migration docs that produced it (CURRENT, PLAN, META_PLAN,
NEW_SYSTEM, UNIFY_SHEET) have been retired now that the work shipped — the
code, the README, and git history are the rest of the record.

The scheduler assigns Oregon Country Faire water-crew volunteers to shift
slots. The same TypeScript runs two ways:

- **Node**, for local iteration and the test suite.
- **Google Apps Script**, bound to the production sheet (`bin/build-gas.ts`
  bundles `src/*.ts` into `dist/scheduler.js`; `clasp push` deploys it).

Layering (`src/`, in dependency order): `engine.ts` (canonical types +
the placement engine) → `rules.ts` (rule combinators) → `rulesets.ts`
(named compositions `currentRules` / `targetRules`) → `sheet.ts` (the
Apps Script layer: menus, sheet I/O, the canonical mapping, print views).

---

## 1. Canonical data model

`src/engine.ts` defines the only data model. There is no legacy/alternate
shape and no boundary parser — `sheet.ts` reads the sheet straight into
these types.

```ts
type TimePreference = "AM" | "PM" | "EITHER";        // a volunteer's availability
type ShiftWindow    = "MORNING" | "MIDDAY" | "EVENING"; // a shift's time-of-day
type QualificationId = string;                        // opaque token = the job name

interface Person {
  name: string;                 // canonical display name; matches staged/assigned cells
  timePreference: TimePreference;
  qualifications: QualificationId[];
}

interface Assignment {
  jobName: string;
  jobPriority: number;          // lower fills first; NON-unique (ties allowed, §4)
  requiredQualification?: QualificationId; // present iff the job needs a qualification
  day: number;                  // 1..4 (Thu..Sun)
  startHour: number;            // integer hour-of-day
  durationHours: number;
  timeWindow: ShiftWindow;
  stagedVolunteer: string;      // "" if open
}

interface PlacedAssignment extends Assignment {
  assignedVolunteer: string;    // "" if the engine left it empty
  brokenRules: string[];        // rule names relaxed to make this placement
  brokenCodes: string[];        // short codes for those rules (see §6)
}
```

Person availability (`AM`/`PM`/`EITHER`) and shift window
(`MORNING`/`MIDDAY`/`EVENING`) are **two distinct domains** joined by a
compatibility matrix (§3.3) — not the same enum compared for equality.

Per-person running state during a run:

```ts
interface PersonState {
  shiftsPlaced: number;
  daysWorked: Set<number>;
  assignedShifts: Array<{ absoluteStartHour: number; durationHours: number }>;
}
```

---

## 2. The placement engine

`runEngine(ruleSet, assignments, people, { rng? })` → `PlacedAssignment[]`.

1. **Order slots for filling.** Without `rng`: the deterministic canonical
   order `compareSlots` = `[jobPriority, day, startHour, jobName]`. With
   `rng`: stable by `jobPriority`, then each equal-priority group is
   **Fisher–Yates shuffled together** (full interleave) so no equal-priority
   job systematically gets first pick (§4 / Job Priority).
2. **Staging pass.** Copy each `stagedVolunteer` into `assignedVolunteer`,
   evaluate the *full* assignment-rule set against the (staged person, slot)
   pair, and record any failures in `brokenRules` — staging is never
   rejected, only annotated. Then bump that person's state.
3. **Relaxation passes.** Fill open slots with all assignment rules active;
   then drop the highest-priority-number rule group and retry the
   still-open slots; repeat down to the priority-0 floor. For each slot:
   filter people through the currently-active assignment rules → sort
   survivors by the sorting rules → pick the top tied group (`rng` picks
   uniformly among ties; without `rng`, the first survivor). Rules dropped
   on prior passes that the chosen person fails are recorded in
   `brokenRules`. A slot that can't satisfy the floor stays empty.

The engine returns slots in fill order; `sheet.ts` re-sorts for display
(§5). `rng` is the only source of nondeterminism, and it drives both the
slot-group shuffle and people-tie selection.

`mulberry32(seed)` is the bundled seedable RNG. `compareSlots` is exported
so `sheet.ts` can lay out generated rows in the same order.

---

## 3. The rule DSL

```ts
interface AssignmentRule {            // gates whether a person CAN take a slot
  name: string;                       // surfaced in brokenRules
  code: string;                       // short code (§6)
  priority: number;                   // NON-distinct; 0 = unbreakable floor
  test: (ctx: { slot; person; state }) => boolean;
}

interface SortingRule {               // ranks candidates within the qualified pool
  name: string;
  priority: number;                   // distinct; 0 = strictest tiebreaker
  compare: (a, b, ctx: { slot; stateOf }) => number;
}

interface RuleSet { name; assignmentRules; sortingRules; }
```

`defineRuleSet()` validates at construction: at least one priority-0
assignment rule (the floor), and pairwise-distinct sorting priorities.
Assignment rules drop in descending priority; sorting rules compose
lexicographically in ascending priority. Combinators live in `rules.ts`
(each returns a fresh rule parameterized by priority); names embed
parameters (`max-shifts-4`, `sequential-rest-8h`) so `brokenRules` stays
self-describing.

### 3.3 Time-preference matrix

The `timePreference` assignment rule is a matrix lookup (shared by both
rule sets, in `rules.ts`):

| Person \ Shift | MORNING | MIDDAY | EVENING |
|----------------|:-------:|:------:|:-------:|
| **AM**         | ✓       | ✓      | ✗       |
| **PM**         | ✗       | ✓      | ✓       |
| **EITHER**     | ✓       | ✓      | ✓       |

`MIDDAY` is the only window everyone can take. The `preferExactTimeMatch`
sorting rule ranks `EITHER` people *last* among compatible survivors, so
the flexible reserve is saved for windows a fixed-preference person can't
fill.

---

## 4. The two rule sets

Both are composed in `src/rulesets.ts` from the same combinators.
**Production runs `targetRules`** (`sheet.ts`); `currentRules` is kept for
reference and its snapshot suite.

**`currentRules`** — derived from the legacy algorithm.

| Assignment rule        | Priority |   | Sorting rule                              | Priority |
|------------------------|:--------:|---|-------------------------------------------|:--------:|
| `qualification`        | 0        |   | `fewer-shifts-first`                      | 0        |
| `max-shifts-4`         | 0        |   | `more-specialized-first-among-specialists`| 1        |
| `one-shift-per-day`    | 1        |   | `alphabetical-by-name`                    | 2        |
| `rest-gap-9h-legacy`   | 1        |   |                                           |          |
| `time-preference`      | 2        |   |                                           |          |

`rest-gap-9h-legacy` deliberately preserves a legacy quirk (a `.some()` +
sentinel comparison that under-rejects); see the comment on `restGapLegacy`
in `rules.ts`.

**`targetRules`** — the production policy.

| Assignment rule       | Priority |   | Sorting rule                            | Priority |
|-----------------------|:--------:|---|-----------------------------------------|:--------:|
| `qualification`       | 0        |   | `everyone-gets-2-shifts`                | 0        |
| `sequential-rest-1h`  | 0        |   | `fewer-shifts-first`                    | 1        |
| `one-shift-per-day`   | 1        |   | `fewer-days-first`                      | 2        |
| `sequential-rest-8h`  | 1        |   | `prefer-exact-time-match`               | 3        |
| `max-shifts-4`        | 2        |   | `fewer-quals-first-among-specialists`   | 4        |
| `time-preference`     | 3        |   |                                         |          |

The diff between the two is the policy change the cutover to `targetRules`
shipped: a split rest-gap (≥1h floor / ≥8h relaxable) replacing the buggy
9h rule, `max-shifts-4` demoted off the floor, a fairness-first sorting
stack (everyone gets ≥2, then fewest shifts/days), and *fewer*-qualified-
first (anti-burnout) instead of more-specialized-first.

> The slot-`timeWindow` type is shared, so both rule sets use the §3.3
> matrix for `timePreference`. `currentRules` is no longer a byte-faithful
> reproduction of the pre-rewrite algorithm — that legacy-reproduction role
> was retired once the migration shipped and was snapshot-verified.

Two extra engine behaviors are governed by `rng`, not by the rule sets:

- **Job priority ties (§2 step 1).** `jobPriority` is non-unique; equal-
  priority slots fill in a shuffled (interleaved) order so no job gets a
  systematic candidate-pool advantage.
- **People-tie selection** among top-ranked candidates.

Production passes a seeded RNG (`mulberry32(ASSIGNMENT_SEED)` in
`sheet.ts`) so runs are reproducible; change the seed to draw a different
schedule. Tests use `mulberry32(0)` for `target` snapshots and omit `rng`
for `current` snapshots (deterministic `compareSlots` order).

---

## 5. The sheet layer (`src/sheet.ts`)

Apps Script reads four input tabs and writes one. `objArrayFromSheet`
turns a tab into row objects keyed by the camelCased headers;
`pushObjArrayToSheet` writes objects back by header.

**Input tabs (human-authored; `sheet.ts` maps their columns):**

- **Jobs** — `Job Name`, `Priority` (→ `jobPriority`, non-unique),
  `Requires Qualification`-style flag (→ `requiredQualification = jobName`
  for special jobs), plus layout columns (`peopleShift`, `days`).
- **Shifts** — `Job Name`, a time-of-day cell (→ `startHour`), duration
  (→ `durationHours`), and a window column holding `MORNING`/`MIDDAY`/
  `EVENING` (→ `timeWindow`; unrecognized/blank falls back to `MIDDAY`).
- **Volunteers** — `first`/`last`/`nickname` (→ `name`), `Time Preference`
  (`AM`/`PM`/`EITHER`; legacy `AM, PM`/`PM, AM`/blank still fold to
  `EITHER`), `Special Qualifications` (comma-joined job names →
  `qualifications`).

**Generated/output tab — Assignments.** The code owns its header row
(`ASSIGNMENT_HEADERS`), so the schema can't drift: `Staged Volunteer`,
`Assigned Volunteer`, `Job Name`, `Job Priority`, `Required Qualification`,
`Day`, `Start Hour`, `Duration Hours`, `Time Window`, `Seat`, `Codes`.
`Seat` (1..N within each job/day/start/duration group) distinguishes the
otherwise-identical slots of one shift; it's stamped at generation and
rides through the engine as passenger data (no rule reads it).

Menu actions:

- **Clear / Re-generate assignments** — expands Jobs × Shifts into slot
  rows (in `compareSlots`+seat order) and writes the tab.
- **Assign volunteers** — reads slots + volunteers, runs
  `runEngine(targetRules, …, { rng: mulberry32(ASSIGNMENT_SEED) })`, then
  writes results back **re-sorted by `[compareSlots, seat]`** so the tab
  stays in a stable order even though fill order is randomized.
- **Print by job / by volunteer** — HTML print views built from the raw
  Assignments rows + Volunteers rows (they keep display-only fields the
  engine drops). Times render from `startHour` + `durationHours`.

A **Debug** tab is auto-created with the JSON of the canonical
`people` and `assignments` for inspection.

---

## 6. Broken-rule codes

Each placement that relaxes a rule carries short codes, concatenated into
the `Codes` column and surfaced in the by-volunteer print legend:

| Code | Meaning                              |
|------|--------------------------------------|
| `H#` | under #h rest between shifts         |
| `D`  | second shift same day                |
| `S#` | over # shifts (the max-shifts cap)   |
| `T`  | non-preferred window (matrix miss)   |
| `Q`  | missing required qualification       |

`orderCodes` (in `engine.ts`) sorts and dedupes them for stable display.

---

## 7. Tests

`test/engine.test.ts` unit-tests the engine against stub rule sets.
`test/scheduler.test.ts` and `test/target.test.ts` are snapshot suites:
each fixture in `test/fixtures/*.json` (canonical shape) is run under
`currentRules` (no `rng`) and `targetRules` (`mulberry32(0)`), compared to
`test/fixtures/expected/` and `…/expected/target/`. `bin/regen-fixtures.ts`
rewrites the snapshots after a deliberate behavior change;
`bin/anonymize.ts` rebuilds the `realistic` fixture from a canonical live
dump with names scrubbed.
