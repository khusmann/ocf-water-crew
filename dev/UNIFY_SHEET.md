# UNIFY_SHEET — make the sheet feed the engine natively

This is migration **step 2** from [META_PLAN.md](META_PLAN.md)'s "Canonical
types at the engine boundary" decision: rewrite [src/sheet.ts](../src/sheet.ts)
to emit the canonical engine shapes directly and delete the translation
layer. Step 1 (the engine + a parser bridging the legacy shapes) shipped;
this step removes the bridge.

The core of this step is a **behavior-preserving plumbing** change: the
legacy `Person` / `Assignment` shapes and the two conversions that wrap the
engine go away, and the sheet becomes the canonical source. Two additive
behavior changes ride along, each unlocked by the data-model reshape but
each landing as its own isolated commit *after* the plumbing so its
snapshot diff stays separate:

1. An explicit, non-unique **Job Priority** column with randomized
   tiebreaks (§4.6).
2. A **two-domain time model** — AM/PM/Either person preferences against
   Morning/Midday/Evening shift windows, joined by a compatibility matrix
   (§4.3).

---

## 0. Execution checklist (follow along here)

The commit-by-commit order we're working through. Each ends green
(`npm test` + `npm run typecheck`) so a regression is bisectable. Detail
for each lives in the section linked. **"Local"** = Claude does it solo and
shows green tests; **"Joint"** = needs Kyle's hands on the live sheet.

- [x] **Commit 1 — fixtures + tests** *(local).* Convert
  `test/fixtures/*.json` inputs legacy→canonical, drop `parseLegacy` from
  `scheduler.test.ts` / `target.test.ts` / `regen-fixtures.ts`, delete
  `sheetAdapter.test.ts`. The `expected/` snapshots stayed byte-for-byte
  identical — proof the reshape changed no behavior. No sheet involvement.
  *(§6, §7.1)* — `d1231ae`
- [x] **Commit 2 — rewrite `sheet.ts`** *(joint).* Read canonical → run
  `runEngine(currentRules, …)` directly → write back; rewrote the print
  helpers; `runGenerateAssignments` owns the Assignments header row.
  **Realization:** the input tabs (Jobs/Shifts/Volunteers) did *not* need
  renaming — `sheet.ts` maps their existing columns, so only the generated
  Assignments tab changed (code-owned). Kyle's part was just `npm run push`
  + Danger/Clear-Regenerate + Assign + print — no header re-keying.
  Follow-up fixups: merge job cols into shifts, Staged/Assigned columns
  first, the **Seat** column, and generate-in-engine-order so the tab
  doesn't reshuffle on assign. *(§3, §4, §5, §7.2)* — `f0a93e1`, `5fb0461`
- [x] **Commit 3 — remove the legacy type layer** *(local).* Deleting
  `src/types.ts` forced deleting `parseLegacy` (its only remaining
  consumer), so this merged with the `scheduler.ts`/`types.ts` deletion +
  `build-gas.ts` order + porting `run-local.ts`/`anonymize.ts` to canonical.
  *(§7.3–7.4)* — `2cd722a`
- [x] **Commit 4 — docs refresh** *(local).* `README.md` `src/`
  description; META_PLAN / NEW_SYSTEM parser notes flipped to past tense;
  this checklist ticked. *(§7.5)*
- [x] **Commit 5 — Job Priority feature (§4.6)** *(joint).* Engine:
  seed-shuffles equal-priority slot groups in `runEngine`. Sheet: reads an
  explicit Jobs **Priority** column, seeded RNG (`mulberry32`) for
  reproducible draws, stable display sort. Added the `priority-tie` fixture.
  *(§4.6, §7.6)* — `1f2cabc`, `a4f77b8`, `8175790`
- [x] **Commit 6 — two-domain time model (§4.3)** *(joint).* Engine/rules:
  `TimePreference` + `ShiftWindow` types, `COMPATIBLE` matrix, rewrote
  `timePreference` (matrix lookup) and `preferExactTimeMatch` (EITHER last).
  Sheet: Shifts hold `MORNING`/`MIDDAY`/`EVENING`, Volunteers `EITHER`;
  fixtures migrated, both suites re-snapshotted. **Note:** the slot-window
  type is shared, so `current` adopted the matrix too (its legacy-repro
  role was already retired). *(§4.3, §7.7)* — `ab96f46`
- [ ] **Optional — column cleanup (META_PLAN step 3):** drop now-unused
  columns from the live sheet. *(§7.8)*

**Engine/rules touch map:** plumbing (commits 1–3) makes **no** engine
*logic* change — only the `parseLegacy` deletion. The real engine/rules
edits are deferred to commits 5–6, behind the `current`-snapshot safety
net, so each feature's behavior diff lands in isolation.

---

## 1. What "the translation layer" is, concretely

Three pieces sit between the sheet and the engine today:

1. **`parseLegacy` (legacy → canonical input)** —
   [src/engine.ts:300-364](../src/engine.ts#L300-L364):
   `parseLegacy`, `parseLegacyPerson`, `parseLegacyAssignment`,
   `personTimeWindow`, `slotTimeWindow`, `canonicalName`. Converts the
   `src/types.ts` shapes into canonical `Person` / `Assignment`.

2. **The re-projection (canonical → legacy output)** —
   [src/scheduler.ts](../src/scheduler.ts) `assign()`. Runs the engine,
   then re-sorts the legacy inputs to line up index-for-index with the
   engine output and rebuilds the legacy `IndexedAssignment` rows
   (`index`, `sameDayAssigned`, `nonIdealShiftTaken`, `doubleShiftTaken`,
   `codes`) so `pushObjArrayToSheet` can write them by legacy header.

3. **The legacy shapes themselves** — [src/types.ts](../src/types.ts)
   (`Person`, `Assignment`, `IndexedAssignment`, `DecoratedPerson`,
   `ExpandedPerson`, `TimePreference`, `TimeCategory`, …), produced by
   [src/sheet.ts](../src/sheet.ts) `getVolunteers()` / `getAssignments()`
   and consumed by the print views.

The engine's canonical types already live in
[src/engine.ts:18-63](../src/engine.ts#L18-L63). After this step they are
the only data model; `src/types.ts` is deleted.

---

## 2. Target end-state

```
Sheet tabs ──► sheet.ts (read) ──► canonical Person[] / Assignment[]
                                          │
                                   runEngine(currentRules, …)   ← no adapter
                                          │
                                   PlacedAssignment[]
                                          │
              sheet.ts (write) ◄──────────┘
                                          │
              print views read canonical PlacedAssignment rows back
```

- `src/scheduler.ts` is **deleted** (its `assign()` collapses to a direct
  `runEngine` call — not worth a wrapper file). `sheet.ts` imports
  `runEngine` + `currentRules` directly.
- `src/types.ts` is **deleted**.
- `parseLegacy` and friends are **deleted** from `engine.ts`.
- The Assignments sheet stores canonical columns + output columns; the
  print views read those columns instead of legacy ones.

A note on the engine's deliberate field-dropping vs. the print views: the
canonical `Person` carries only `name`, but the by-volunteer print wants
`first` / `last` / `nickname` / `timePreference`. **Resolution: the
*engine* sees the canonical subset; the *sheet layer* keeps reading the
display columns it needs straight off the Volunteers / Assignments tabs.**
Canonical types are the engine's interface, not a ceiling on what
`sheet.ts` may handle. See §4.5.

---

## 3. Sheet schema after unification

The Assignments tab is *generated* by `generateAssignments()` from the
Jobs × Shifts tabs (see [src/sheet.ts:91-120](../src/sheet.ts#L91-L120)),
then filled in place. So unifying the data model means changing what
`generateAssignments` emits and what columns the four tabs carry. Columns
are matched to object keys by `toCamelCase` of the header row, so "header
text" ↔ "camelCase key".

### 3.1 Assignments tab (generated + filled)

| Column (header)      | Canonical key          | Source / notes                                              |
|----------------------|------------------------|-------------------------------------------------------------|
| Job Name             | `jobName`              | from Jobs                                                   |
| Job Priority         | `jobPriority`          | from Jobs **Priority** column; non-unique, ties randomized (§4.6) |
| Required Qualification | `requiredQualification` | from Jobs: the job's own name iff it's a special job, else "" (see §4.2) |
| Day                  | `day`                  | 1..4                                                        |
| Start Hour           | `startHour`            | integer hour-of-day (was `shiftStartNum`)                   |
| Duration Hours       | `durationHours`        | (was `hrsShift`)                                            |
| Shift Window         | `window`               | "AM"/"PM"/"EITHER" during plumbing; → "Morning"/"Midday"/"Evening" target-era (§4.3). Was `timeCategory` + `timePriority` |
| Staged Volunteer     | `stagedVolunteer`      | hand-entered                                                |
| Assigned Volunteer   | `assignedVolunteer`    | **output**                                                  |
| Codes                | `codes`                | **output** (concatenated broken-rule codes; already present)|

Dropped from the legacy Assignments tab: `special` (folded into Required
Qualification), `dayId` (prime trick — engine uses `Set<number>`),
`shiftStart` (date serial — `startHour` is the meaningful part; print
formats from the integer, see §4.4), `person`, `index`,
`sameDayAssigned` / `nonIdealShiftTaken` / `doubleShiftTaken` (folded into
`codes` / `brokenRules`).

### 3.2 Jobs tab

| Column                | Notes                                                                 |
|-----------------------|-----------------------------------------------------------------------|
| Job Name              | also the qualification token for special jobs (§4.2)                  |
| Priority              | explicit integer; **non-unique** — ties fill in randomized order (§4.6) |
| Requires Qualification| boolean; replaces the `special` flag. `generateAssignments` sets `requiredQualification = thisRequires ? jobName : ""` |
| (other layout cols)   | `peopleShift`, `days`, etc. as today — drive slot generation          |

`jobPriority` is now read from the explicit **Priority** column rather than
derived from row order (today: `getJobs` at
[src/sheet.ts:122-127](../src/sheet.ts#L122-L127) sets `jobPriority: idx`).
See §4.6 — decoupling qualification from `jobPriority` (§4.2) is what frees
it to be a pure, non-unique fill-order knob.

### 3.3 Shifts tab

Unchanged in spirit. `generateAssignments` derives `startHour` from the
time-of-day cell (today: `new Date(s.shiftStart).getHours()` →
`shiftStartNum`) and the shift `window` from the shift's category (today:
`timeCategory` → `lookupTimeId` → `timePriority`). The `lookupTimeId` /
`lookupDayId` numeric mappings ([src/sheet.ts:81-89](../src/sheet.ts#L81-L89))
are deleted; the category maps straight to a window string and `day` needs
no `dayId`.

Target-era (§4.3): the AM/PM/EITHER category column becomes a
Morning/Midday/Evening classification, hand-entered per shift (not derived
from `startHour`). `generateAssignments` copies it onto each slot verbatim.

### 3.4 Volunteers tab

| Column            | Canonical key      | Notes                                                |
|-------------------|--------------------|------------------------------------------------------|
| Name              | `name`             | single source of truth for the staged/assigned match (§4.1) |
| Time Preference   | → `timePreference` | "AM" / "PM" / "AM, PM" / "PM, AM" → folded to `TimeWindow` |
| Special Qualifications | → `qualifications` | comma-joined **job names**; split on ", " (§4.2)   |
| First / Last / Nickname | (display only) | read by the by-volunteer print, not the engine (§4.5) |

`timeId` and `specialQualificationsIds` columns/derivations are deleted —
the engine takes `TimeWindow` and job-name qualification tokens.

---

## 4. Decisions to lock in

### 4.1 Canonical name = the Volunteers `Name` column (recommended)

Legacy `parseLegacyPerson` *rebuilds* the name as
`` `${first} ${last} ${nickname}`.trim() `` and ignores the sheet's `name`
column. The engine matches `stagedVolunteer` / `assignedVolunteer` strings
against `person.name`, so whatever produces those strings must agree.

**Decision:** use the Volunteers `Name` column verbatim as `person.name`,
and require staged/assigned cells to contain that exact string. One source
of truth, no rebuild. (In the current fixtures the rebuilt value already
equals the `name` column, so this is behavior-preserving for real data —
but confirm against the live sheet that the `Name` column is populated and
matches the staging convention before committing.)

### 4.2 Qualification token = job name (recommended)

Today qualifications are numeric ids that coincide with `jobPriority`
(`special` jobs), cross-referenced through the human-readable
`specialQualifications` string. Canonical wants an opaque string token
shared between `slot.requiredQualification` and `person.qualifications`.

**Decision:** the token **is the job name**.
- `person.qualifications` = `specialQualifications` split on `", "`
  (already job names on the sheet).
- `slot.requiredQualification` = the job's own `jobName` when the job
  requires a qualification, else absent.

This deletes the `lookupPriority` indirection
([src/sheet.ts:139-149](../src/sheet.ts#L139-L149)) and the
jobPriority-as-id coupling, and makes the sheet self-documenting (a
qualification is literally the name of the job it gates). The engine only
does equality checks on the token, so opaque strings are fine.

### 4.3 Time windows: two domains, not one

Today a single `TimeWindow = "AM" | "PM" | "EITHER"` is used for **both**
the person's preference and the slot's window, and the rule passes when
they're equal or either side is `EITHER`. We split this into two distinct
domains joined by an explicit compatibility matrix:

- **Person preference** — `"AM" | "PM" | "EITHER"` (unchanged values).
- **Shift window** — `"Morning" | "Midday" | "Evening"` (new; classifies
  the slot, replacing the slot's AM/PM/EITHER value).

Compatibility (which preference can take which shift window):

| Person \ Shift | Morning | Midday | Evening |
|----------------|:-------:|:------:|:-------:|
| **AM**         | ✓       | ✓      | ✗       |
| **PM**         | ✗       | ✓      | ✓       |
| **Either**     | ✓       | ✓      | ✓       |

```ts
type TimePreference = "AM" | "PM" | "EITHER";          // person
type ShiftWindow    = "Morning" | "Midday" | "Evening"; // slot

const COMPATIBLE: Record<TimePreference, ShiftWindow[]> = {
  AM:     ["Morning", "Midday"],
  PM:     ["Midday", "Evening"],
  EITHER: ["Morning", "Midday", "Evening"],
};
```

The `time-preference` assignment rule
([src/rules.ts:88-98](../src/rules.ts#L88-L98)) becomes
`COMPATIBLE[person.timePreference].includes(slot.window)`. Midday is the
only window everyone can take; Morning excludes PM-only people and Evening
excludes AM-only people.

**Scoping — this is a `target`-era change, not part of the plumbing.**
Like §4.6, it's an additive behavior change, so it lands as its own commit
*after* the behavior-preserving migration:

- During the unification (steps 1–5), the read-side mapping keeps the
  current single-domain model so the `current` snapshots stay byte-stable:
  Person "AM"→AM / "PM"→PM / "AM, PM"/"PM, AM"/""→EITHER; Slot
  AM-category→AM / PM→PM / "AM, PM"/"AM,PM"→EITHER. (This is the old
  `personTimeWindow` / `slotTimeWindow` logic from
  [src/engine.ts:304-329](../src/engine.ts#L304-L329), moved into
  `sheet.ts`.) Everything numeric (`timeId`, `timePriority`,
  `lookupTimeId`) is deleted regardless.
- The two-domain model then lands target-side: it supersedes the time
  rules in [NEW_SYSTEM.md](NEW_SYSTEM.md) §3.1 (`timePreference`) and §3.2
  (`preferExactTimeMatch`), changes the Shifts-tab time column from AM/PM
  to Morning/Midday/Evening (§3.3), and re-snapshots the `target` suite.

**Shift-window source — hand-entered (decided).** The Morning/Midday/
Evening value is entered by hand per shift on the Shifts tab; it is **not**
derived from `startHour`. The window encodes policy, not clock arithmetic
(an 11am shift may be "Midday" by intent), so the sheet author owns it.
`generateAssignments` copies the shift's window onto each generated slot
verbatim.

**Soft preference — EITHER is the flexible reserve (decided).** The
`target` set's `preferExactTimeMatch` sorting rule
([src/rules.ts:185-195](../src/rules.ts#L185-L195)) is rewritten to prefer
a compatible AM/PM person over an EITHER person — rank EITHER last so the
flexible folks are saved for windows a fixed-preference person can't fill.
AM-vs-PM on a Midday slot stays a tie (both are equally "fixed" there).

```ts
// Among the already-compatible survivors (the time-preference assignment
// rule has gated everyone here), prefer fixed-preference people; EITHER last.
const rank = (pref: TimePreference) => (pref === "EITHER" ? 1 : 0);
compare: (a, b) => rank(a.timePreference) - rank(b.timePreference);
```

### 4.4 Print time labels come from `startHour` + `durationHours`

The by-job print currently formats times from the `shiftStart` date serial
via `Session.getScriptTimeZone()`
([src/sheet.ts:512-542](../src/sheet.ts#L512-L542)). With `shiftStart`
dropped, `shiftRangeLabel` / `formatHourCompact` / `timeOfDayMinutes` /
`shiftTimeKey` are rewritten to take an integer `startHour` (+ duration)
and format "6am – 2pm" directly. All shift starts in the data are integer
hours (verified), so no precision is lost and the timezone dependency goes
away. `amPmBucket` ([src/sheet.ts:347-357](../src/sheet.ts#L347-L357))
reads `timeWindow` + `startHour` instead of `timeCategory` + `shiftStartNum`.

### 4.5 Print display fields stay on the sheet layer

`buildVolunteerScheduleHtml` ([src/sheet.ts:223-317](../src/sheet.ts#L223-L317))
needs `first` / `last` / `nickname` / `timePreference` for its roster
columns and `a.person` is used to order names within a cell
([src/sheet.ts:435, 471](../src/sheet.ts#L435)). The canonical engine
types drop these. **They are read directly from the Volunteers /
Assignments tabs by the print code** — the print functions take raw
`SheetRow`s (or a small print-specific type), not engine `Person` /
`PlacedAssignment`. The `person` within-cell ordering is replaced by sheet
row order (stable) or a name sort; decide when rewriting the print code —
it only affects display order within one cell.

### 4.6 Job Priority is an explicit, non-unique fill-order column

Today `jobPriority` is the Jobs-tab row index (unique 0..14) and serves
double duty: slot fill order **and** the qualification id. §4.2 retires the
second duty (qualification token = job name), leaving `jobPriority` as a
pure ordering knob. We make it an explicit **Priority** column and allow
**ties**: two jobs may share a priority, and the order in which equal-
priority roles are filled is **randomized**.

Why this matters: the engine fills slots one at a time, and earlier slots
get first pick of candidates. With a deterministic tiebreak (today
`compareSlots` falls back to `jobName` —
[src/engine.ts:162-168](../src/engine.ts#L162-L168)), the alphabetically-
first job of a priority tier always gets the best people. Randomizing the
tie spreads that advantage fairly across equal-priority jobs.

**Engine change (additive).** `compareSlots` keeps `jobPriority` as the
primary key but its tiebreak among equal-priority slots becomes RNG-driven
instead of `jobName`:

- `rng` **omitted** → stable input order (deterministic). The `current`-
  rules snapshot suite runs rng-omitted, so it is unaffected as long as the
  fixtures' slot input order is preserved — keeps those snapshots green.
- `rng` **given** → randomize the relative order of equal-priority slots.
  Tests pass `mulberry32(0)` (as the `target` suite already does), so the
  shuffle is deterministic per seed; production passes `Math.random`.

This reuses the existing `AssignOptions.rng` knob — the same one that
already breaks ties among equally-ranked *people*
([src/engine.ts:281](../src/engine.ts#L281)). No new engine parameter.

**Tie granularity — fully interleave (decided).** Among equal-priority
slots, **all slots of the tied jobs are shuffled together** (not grouped by
job). So with two priority-3 jobs Fountain Sanitizer (F1..F3) and Hot Spot
Duster (H1..H3), the fill order is a random braid like `F1, H1, H2, F2, …`
— *not* one job entirely before the other. This is the fairer policy when
the candidate pool is constrained: the tied jobs trade off candidates
evenly instead of whichever job sorts first claiming all the best people.
(With an ample candidate pool the choice is moot — both yield the same
assignments.)

Implementation: within each equal-`jobPriority` group, apply a seeded
shuffle (Fisher–Yates over the group, driven by `opts.rng`) before the
slots are iterated, replacing the `(day, startHour, jobName)` tiebreak for
tied groups. With `rng` omitted, fall back to the existing deterministic
order so the `current` suite stays byte-stable.

**Test/fixture impact.** This is a behavior addition, not part of the
behavior-preserving plumbing migration (§6). The existing fixtures have
unique `jobPriority` values, so they exercise no ties — they stay green
under the rng-omitted `current` suite. To actually cover the randomized
tiebreak, add a `target`-suite fixture with two equal-priority jobs
competing for a constrained candidate pool, snapshotted under
`mulberry32(0)`. Land §4.6 as its own commit *after* the migration so its
snapshot diff is isolated from the reshape.

---

## 5. File-by-file change list

| File | Change |
|------|--------|
| [src/types.ts](../src/types.ts) | **Delete.** |
| [src/scheduler.ts](../src/scheduler.ts) | **Delete.** `assign()` collapses into a one-line `runEngine` call at the `sheet.ts` call site. |
| [src/engine.ts](../src/engine.ts) | Delete `parseLegacy` / `parseLegacyPerson` / `parseLegacyAssignment` / `personTimeWindow` / `slotTimeWindow` / `canonicalName` (L300-364) and the `LegacyPerson` / `LegacyAssignment` import (L13-16). Engine keeps canonical types, `runEngine`, `defineRuleSet`, `mulberry32`, `orderCodes`. **§4.6 (separate commit):** make the slot ordering a stable sort by `jobPriority` only, then seed-shuffle each equal-priority group in place (Fisher–Yates over `opts.rng`); `rng` omitted keeps the deterministic `(day, startHour, jobName)` order. Touches `compareSlots` / the `placed.sort(...)` site (L162-221). |
| [src/rules.ts](../src/rules.ts), [src/rulesets.ts](../src/rulesets.ts) | Unchanged — already canonical-only. |
| [src/sheet.ts](../src/sheet.ts) | Rewrite read side (`getVolunteers` → canonical `Person[]`; `getAssignments` → canonical `Assignment[]` or `PlacedAssignment[]` for print; `generateAssignments` emits the §3.1 columns; drop `lookupTimeId` / `lookupDayId` / `lookupPriority`, add time-window + qualification mapping). `runAssignVolunteers` calls `runEngine(currentRules, …)` and writes `assignedVolunteer` + `codes`. Rewrite print helpers per §4.4–4.5. |
| [bin/build-gas.ts](../bin/build-gas.ts) | Drop `"scheduler.js"` from the concat `order` (L18-25). |
| [bin/run-local.ts](../bin/run-local.ts) | Stop importing from `scheduler.ts`; read a canonical input JSON and call `runEngine(currentRules, …)` directly. |
| [README.md](../README.md) | Refresh the `src/` description (currently says `scheduler.ts` is the algorithm and references a `Code.js` that no longer exists). |

---

## 6. Tests & fixtures

The fixtures are still legacy-shaped and the engine tests call
`parseLegacy` to bridge them
([test/scheduler.test.ts:37-43](../test/scheduler.test.ts#L37-L43),
[test/target.test.ts:23-38](../test/target.test.ts#L23-L38),
[bin/regen-fixtures.ts:29-51](../bin/regen-fixtures.ts#L29-L51)). With
`parseLegacy` gone, the *input* fixtures must move to canonical shape.

**Plan:**

1. **Convert the input fixtures to canonical shape.** Write a one-shot
   script (or reuse the soon-to-be-deleted `parseLegacy` once, before
   deleting it) to rewrite each `test/fixtures/*.json` from
   `{people, assignments}` legacy → `{people, assignments}` canonical. The
   `expected/` snapshots are **already canonical** (see
   [test/fixtures/expected/tiny.json](../test/fixtures/expected/tiny.json))
   and do **not** change — this is the proof the migration is behavior-
   preserving: same engine, same rule sets, same outputs, only the input
   files reshaped.
2. **Update the test harnesses** to drop the `parseLegacy` call and feed
   the canonical fixtures straight to `runEngine`
   (`scheduler.test.ts`, `target.test.ts`, `regen-fixtures.ts`).
3. **Delete [test/sheetAdapter.test.ts](../test/sheetAdapter.test.ts)** —
   it pins the legacy re-projection in `scheduler.ts`, which no longer
   exists. The round-trip-shape concern it covered is now "does
   `pushObjArrayToSheet` write the canonical columns", which can be a
   small new test if desired, but isn't a snapshot concern.
4. **`engine.test.ts`** ([test/engine.test.ts](../test/engine.test.ts)) —
   verify it doesn't import `parseLegacy`; adjust if it does.
5. Run `npm test`: the `expected/` snapshots must stay byte-for-byte
   identical. Any diff means the fixture conversion was lossy — fix the
   conversion, not the snapshot.

The live `data/thejson*.json` files are legacy-shaped too. `run-local.ts`
either consumes a converted canonical dump, or we keep a tiny throwaway
legacy-reader in `bin/` for local runs against old dumps. Recommend
regenerating a canonical `data/` dump from the sheet once `sheet.ts` is
rewritten, rather than carrying a converter.

---

## 7. Execution order

Each step ends green so a regression is bisectable.

1. **Convert input fixtures to canonical** + update `scheduler.test.ts`,
   `target.test.ts`, `regen-fixtures.ts` to skip `parseLegacy`, **and
   delete `sheetAdapter.test.ts`** in the same step. (That test feeds the
   fixtures through the legacy `assign()`, so converting the fixtures
   breaks it immediately; it pins the adapter we're deleting in step 3
   anyway.) Run `npm test` — `expected/` snapshots unchanged. *(Engine
   still has `parseLegacy`; `scheduler.ts` / `types.ts` still present but
   now untested.)*
2. **Rewrite `sheet.ts`** read/write/print to canonical + the §3 column
   schema. Build (`npm run build`) and type-check (`npm run typecheck`).
   Manually exercise against a copy of the live sheet (new column
   headers + a re-run of "Assign volunteers" and both print views).
3. **Delete `scheduler.ts` + `src/types.ts`**, update `build-gas.ts`
   order and `run-local.ts`. Type-check + `npm test`.
4. **Delete `parseLegacy` & friends** from `engine.ts`. Type-check +
   `npm test` (proves nothing else imported them).
5. **Refresh `README.md`**; update [META_PLAN.md](META_PLAN.md) /
   [NEW_SYSTEM.md](NEW_SYSTEM.md) notes that say "parser gets deleted in
   step 2" to past tense.
6. **Job Priority feature (§4.6), separate commit:** add the explicit
   Priority column to the Jobs schema + `generateAssignments`, change the
   slot ordering to seed-shuffle equal-priority groups, add a
   tie-exercising `target` fixture + snapshot. The `current` suite stays
   green (rng-omitted); the only new snapshot is the new fixture under
   `mulberry32(0)`.
7. **Two-domain time model (§4.3), separate commit:** add the
   `ShiftWindow` type + `COMPATIBLE` matrix, rewrite the `target`
   `timePreference` / `preferExactTimeMatch` rules, switch the Shifts-tab
   time column to Morning/Midday/Evening, update NEW_SYSTEM.md §3, and
   re-snapshot the `target` suite. `current` is untouched.
8. **Optional follow-on (META_PLAN step 3):** drop any now-unused columns
   from the live sheet itself.

---

## 8. Risks / open questions

- **Live-sheet column rename is a breaking change to the spreadsheet.**
  `toCamelCase` matching means renaming a header silently drops a column.
  The rewrite must land together with a sheet-template update; staged
  data and the Jobs/Shifts layout columns have to be re-keyed in lockstep.
  Confirm the exact current header set with `npm run pull` + inspection
  before committing to the §3 names.
- **`Name` column trustworthiness (§4.1).** If the live `Name` column
  isn't reliably populated / doesn't match staging strings, either fix the
  sheet or keep a `name = first+last+nickname` derivation on the read side
  (a sheet-layer concern, not the engine's). Verify before step 2.
- **Qualification strings must match job names exactly (§4.2)** — including
  punctuation/spacing (e.g. "Phil-up Swampers"). A mismatch makes a
  specialist silently unqualified. Worth a sheet-load validation that
  every `specialQualifications` entry resolves to a known special job
  name (the legacy code crashed via `!` on this; keep an explicit check).
- **Print within-cell ordering (§4.5)** loses the `person` index tiebreak;
  decide on row-order vs. name-order. Cosmetic only.
</content>
</invoke>
