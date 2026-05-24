# CURRENT — state of the project as of 2026-05-24

This document captures the as-found state of `ocf-water-crew` before any
restructuring. It exists so that the upcoming rewrite (tests-to-lock-in-behavior,
new build/run/test pipeline, declarative rules engine) can proceed from a
shared understanding rather than guesses.

Nothing in here is recommended practice — it is just what is here right now.

---

## 1. Repository layout

Tracked files (per `git ls-files`):

```
.claude/CLAUDE.md         project instructions for Claude Code
.gitignore                ignores data/ and bak.mjs
LICENSE                   Apache 2.0
README.md                 one line: "# ocf-water-crew"
run_tests.mjs             4 assertions for priorityComparison (currently broken)
runthemjs.mjs             local runner: data/thejson.json -> data/theresultjson.json (currently broken)
themjs.mjs                the scheduler — the only meaningful source file
theworkingversion.mjs     0-byte empty placeholder
```

Untracked-but-present (the gitignored `data/` folder):

```
data/thejson.json              the live input the scheduler reads (127 people, 416 assignment slots)
data/thejson.old.json          older snapshot, different schema (jobId/timeId instead of jobPriority/timePriority)
data/thejson.new.json
data/thejson.new2.json
data/thejson.formatted.json
data/thejson.formatted.new.json
data/thejson.formatted.new2.json
data/theresultjson.json        last output of running themjs.mjs locally
```

There are **no** package.json, lock file, clasp config, `appsscript.json`,
`Code.gs`, or any other Google Apps Script artifact in the repo. The Apps
Script side lives entirely in a separate Google Sheet's bound script
project; this repo holds only the algorithm source that gets copy-pasted
into that script project.

---

## 2. Runtime targets

The same JavaScript in `themjs.mjs` is intended to run in two places:

1. **Google Apps Script**, bound to the production sheet. The sheet's
   bound script exports the sheet data as the JSON shape described in §4,
   calls `assign(assignments, people)`, and writes the returned array back
   to the sheet. None of that wiring is in this repo.

2. **Node (ES modules)**, locally, for fast iteration without round-tripping
   through Apps Script. `themjs.mjs` is `.mjs` so Node treats it as ESM
   without a `package.json`.

Earlier commits had `export default assign` so the Node runners could
import it. The current `themjs.mjs` has **no exports**; instead it contains
a section labelled `IGNORE below HERE` near the bottom that does
`import fs`, reads `./data/thejson.json`, calls `assign`, and writes
`./data/theresultjson.json` whenever the file itself is executed by Node.
The practical effect is that `node themjs.mjs` is the working local runner —
not `runthemjs.mjs`.

The "IGNORE below HERE" block must be removed (or commented out) before
the file can be pasted into Apps Script, because `import fs` is invalid
there. Earlier commits in `git log` show this block being commented and
uncommented repeatedly, which appears to be the manual ritual when
switching between local-test and copy-into-GS.

---

## 3. Build / run / test, as currently practiced

There is no build step. There is no package manager. Node ≥ 16 is enough
(only `fs`, `assert`, and ESM are used).

### Run the scheduler locally

```bash
node themjs.mjs        # reads ./data/thejson.json, writes ./data/theresultjson.json
```

This works because of the `IGNORE below HERE` block at the bottom of
`themjs.mjs`. It runs the same `assign()` function that the Apps Script
would run.

### `runthemjs.mjs` — broken

```bash
node runthemjs.mjs
# SyntaxError: The requested module './themjs.mjs' does not provide an export named 'default'
```

It was written to be the "clean" runner (it has no side-effect block in
the imported module), but at some point the `export default assign` line
was removed from `themjs.mjs` and never restored, so this file no longer
runs. The commit `a755fdc create runner to make copy-paste into gs
easier` introduced it for exactly the use case named.

### `run_tests.mjs` — broken

```bash
node run_tests.mjs
# SyntaxError: The requested module './themjs.mjs' does not provide an export named 'priorityComparison'
```

Same root cause — `priorityComparison` is not exported. The four
assertions inside (two with scalars, two with arrays — sanity checks on
how `priorityComparison` handles the lexicographic "first key that
differs wins" ordering) are the only tests in the repo and have not been
runnable since the exports were dropped.

### Deploying to Apps Script

There is no automation. The workflow inferred from commit messages and
file structure is:

1. Edit `themjs.mjs` locally.
2. Run `node themjs.mjs` and inspect `theresultjson.json` by eye / against
   intuition (no checked-in baseline to diff against).
3. Comment out the `IGNORE below HERE` block (specifically the
   `import fs` line, which Apps Script rejects).
4. Copy the file contents into the bound script editor in the Google
   Sheet.
5. Trigger the Apps Script function from the sheet UI; the wrapper there
   marshals sheet rows into the JSON shape, calls `assign`, and writes
   the result back.

The opposite direction — getting `thejson.json` for local testing — is
also manual: someone exports the current sheet state (presumably via a
small dump function inside the Apps Script) and pastes it into
`data/thejson.json` in this repo. The fact that there are seven different
`thejson.*.json` snapshots in `data/`, none tracked, is consistent with
this being ad-hoc.

---

## 4. Data model

Every shape below is described from the live `thejson.json` (the one the
algorithm actually reads).

### Input — `people` (127 entries)

```jsonc
{
  "first": "Jane",
  "last": "Doe",
  "nickname": "",
  "volunteerType": "Staff",                 // "Staff" (126) | "SOP" (1)
  "specialQualifications": "Plumbers, Phil-up Swampers",  // human-readable, comma-joined
  "timePreference": "AM, PM",               // "AM" | "PM" | "AM, PM" | "PM, AM"
  "name": "Jane Doe",                       // unused by themjs — it rebuilds its own
  "hoursAssigned": 18,                      // unused
  "shifts": 4,                              // unused
  "timeId": 1,                              // 0=AM only, 1=AM+PM, 2=PM only, missing for 3 people
  "specialQualificationsIds": [8, 3]        // ints; parallel to specialQualifications by index
}
```

Observed mapping (derived from the data, not from any source of truth):

| timePreference | timeId       |
|----------------|--------------|
| `AM`           | 0            |
| `AM, PM`       | 1            |
| `PM`           | 2            |
| `PM, AM`       | **missing**  |

Three people with `timePreference: "PM, AM"` have no `timeId` at all —
this is a real bug in whatever computes timeId on the sheet side, and
the algorithm just sees `undefined` for them.

Special qualification ids 0–10 each map to a specific special job, by
the same number used in `jobPriority`:

```
 0 Coordinator        4 Pump House Desk    8 Plumbers
 1 Biggie Swampers    5 Pump House Night   9 Cart Leads
 2 Phil-up Drivers    6 Shift Super       10 Runner
 3 Phil-up Swampers   7 Lead Plumbers
```

Only ids `{3,4,6,8,9,10}` actually appear in `specialQualificationsIds`
in the current data — jobs 0,1,2,5,7 are filled exclusively via
`stagedVolunteer` (i.e. hand-assigned in the sheet) and the algorithm is
never asked to pick someone for them.

### Input — `assignments` (416 entries; one per shift slot to fill)

```jsonc
{
  "stagedVolunteer": "Jane Doe",      // pre-assignment from the sheet, "" if open
  "assignedVolunteer": "Jane Doe",    // ignored on input; algorithm overwrites
  "jobPriority": 0,                   // 0..14, same numbering as specialQualificationsIds for 0..10
  "jobName": "Coordinator",
  "special": true,                    // true iff jobPriority < specialJobsAmount (i.e. needs qualification)
  "day": 1,                           // 1..4 (Thu..Sun of the Faire)
  "dayId": 2,                         // prime: day1=2, day2=3, day3=5, day4=7  (see §5 for why)
  "shiftStart": "1899-12-30T14:00:00.000Z",  // GS date serial; only the time-of-day is meaningful
  "shiftStartNum": 6,                 // hour-of-day as integer (here 14:00 UTC -> 06:00 local-ish? see §6)
  "hrsShift": 8,                      // shift duration in hours (4, 5, or 8 in current data)
  "person": 1,                        // 1..N slot index within (jobName, day) — e.g. 20 Carts on day 1 -> person 1..20
  "timePriority": 0,                  // 0=AM, 1=AM/PM, 2=PM — parallel to person.timeId
  "timeCategory": "AM",               // "AM" | "PM" | "AM, PM" | "AM,PM" (note the inconsistency)
  "sameDayAssigned": false,           // output flag, ignored on input
  "nonIdealShiftTaken": false         // output flag, ignored on input
}
```

Distribution in the current data:

```
416 total slots, 220 open, 196 pre-staged
jobs: 15 distinct (jobPriority 0..14)
days: 4 (104 slots per day)
biggest jobs: Carts (160 slots, all open), Cart Leads (40 open),
              Pump House Desk (32 staged), Plumbers (24 staged)
fully staged in advance: Coordinator, Phil-up Drivers, Pump House Desk,
                         Pump House Night Train, Shift Super,
                         Lead Plumbers, Plumbers, Runner
fully unstaged: Cart Leads, Fountain Sanitizer, Hot Spot Duster,
                Morning Foliage Duster, Carts
```

### Output

`assign()` returns a flat array of the same 416 records, with these
mutations:

- `assignedVolunteer` populated with a person's `name`
  (`"${first} ${last} ${nickname}".trim()`), or left `""` if no fit found
- `nonIdealShiftTaken: bool` — set to `true` when the assigned person's
  `timeId` didn't match the slot's `timePriority` AND neither was 1
  (the "either is OK" wildcard)
- `sameDayAssigned: bool` — set to `true` when the person was already
  working another shift on the same day
- `doubleShiftTaken: bool` — present on output, **never set to true**
  (the logic is fully commented out at lines 391–417)
- `index: int` — within each (job, day) group, slot number starting at 1

The current local run produces:

```
416 assignments, all filled (0 empty)
nonIdealShiftTaken: 0   (no relaxations triggered on this dataset)
sameDayAssigned:   142
doubleShiftTaken:  0    (never set)
57 people @ 4 shifts, 54 @ 3 shifts, 13 @ 2 shifts, 2 @ 0 shifts
```

The two people who got no shifts are: one nameless empty record, and
one person with `hoursAssigned: 0, shifts: 0`.

---

## 5. The algorithm — `assign(assignments, people)` in `themjs.mjs`

All line numbers refer to [themjs.mjs](../themjs.mjs).

### 5a. Helper functions

- [`genericCompare(a, b)`](../themjs.mjs#L1-L22) — comparator that
  treats arrays as their minimum element, and treats
  `undefined`/`NaN`/`Infinity` as "always-loses" (returns `+2`/`-2`
  rather than `+1`/`-1`, though only the sign is ever read downstream).
- [`priorityComparison(keyOrder)`](../themjs.mjs#L24-L32) — composes
  `genericCompare` lexicographically: first key whose values differ
  decides the comparison.
- [`personComparison(shiftsChart, dayWanted)`](../themjs.mjs#L34-L56) —
  ordering used to keep each per-qualification candidate pool sorted
  during placement. Priority: fewest shifts placed first; tiebreak by
  whether their `daysWorked` is incompatible with this slot's `dayId`;
  then time preference; then specialty count (more-specialized first,
  via the `*-1`).
- [`distributeSort(arr, key)`](../themjs.mjs#L58-L78) — groups by `key`
  and interleaves: one from group 1, one from group 2, etc., looping
  through groups in `key` order until exhausted. Used to spread the
  brute-force pass across days.
- [`splitByProperty(arr, property)`](../themjs.mjs#L80-L91) — splits
  into an array-of-arrays grouped by the property value.
- [`expandObjects(arr, key)`](../themjs.mjs#L101-L124) — if `obj[key]`
  is an array, emits one copy of `obj` per element with `[key]`
  overwritten to the scalar element. Empty array → one copy with the
  key set to `undefined`. Used to expand each multi-qualified person
  into one row per qualification.
- [`sortPeople(people)`](../themjs.mjs#L127-L138) — adds flag fields,
  builds the canonical `name`, computes `specialQualsNumber`, sorts by
  `[specialQualificationsIds, timeId]`.
- [`sortAssignments(assignments)`](../themjs.mjs#L140-L168) — sorts by
  `[jobPriority, timePriority, day, person]`, then walks the sorted
  list re-assigning `index` so it restarts at 1 each time `day` changes
  or `person` rolls back down. (The rolled `index` is part of the
  return shape but does not appear to drive any decision in `assign`.)

### 5b. The `dayId` trick

`dayId` is a prime per day: `day1=2, day2=3, day3=5, day4=7`. Each
person carries `daysWorked: int` starting at `1`. When assigned to a
shift, `daysWorked *= dayId`. To check "is this person already working
day D?" the code tests `daysWorked % thisShift.dayId === 0` — true
exactly when the prime is already a factor. This is the entire same-day
detection mechanism. It also means same-day **second** shifts are
detected (`daysWorked % dayId === 0` after `daysWorked *= dayId` once)
but not detected/blocked for the prior pre-staged shift on that same
day if both pre-staged shifts land before the multiplication — see
the half-completed `if(assignedPerson.daysWorked % assignment.dayId == 0)`
on line 235.

### 5c. Setup phase (lines 189–222)

1. `numberShiftsNeeded = 4` — global cap of 4 shifts per volunteer.
2. `peopleSorted = sortPeople(people)`.
3. `assignmentsSorted = sortAssignments(assignments)`.
4. `shiftsPlacedChart` — one row per person with running counters
   `{name, shiftsPlaced: 0, daysWorked: 1, assignedHours: [0]}`.
   `assignedHours` records every (day*24 + shiftStartNum) hour stamp
   the person has been booked at, used to enforce a ≥9-hour rest gap.
5. `shiftsSorted = expandObjects(peopleSorted, "specialQualificationsIds")`,
   then re-sorted by `[specialQualificationsIds, timeId, name]`.
   One "candidate row" per (person, qualification) pair.
6. `specialJobsAmount` = count of distinct `jobPriority` values that
   are flagged `special: true`. In the current data that's 11
   (priorities 0..10).
7. `peopleToAssign = splitByProperty(shiftsSorted, "specialQualificationsIds")`
   — the candidate rows bucketed by qualification id. Bucket layout
   ends up being: one bucket per qual id (0..10), then a final bucket
   for "no qualifications" (the `undefined` group).
8. The loop on line 218 then **duplicates specialists into the
   general-jobs bucket**: for every specialist bucket, take its first
   `specialJobsAmount` entries and also push them into
   `peopleToAssign[specialJobsAmount]` (the general bucket). The
   apparent intent is that the most-tenured / lowest-`timeId`
   specialists are also available for general work like Carts. The
   implementation looks fragile — it relies on `specialJobsAmount`
   pointing at the general bucket's index, which only holds if the
   specialty ids are dense 0..N-1.

### 5d. Pre-staged copy phase (lines 224–247)

Walks `assignmentsSorted`, for each one: copy `stagedVolunteer` into
`assignedVolunteer`, bump that person's `shiftsPlaced` and
`daysWorked *= dayId`, set `sameDayAssigned` if applicable.
**Bug-ish:** `assignedHours` is **not** updated here, so a pre-staged
shift does not count against the ≥9-hour rest gap when filling the
remaining slots. Then groups the (now-with-staged-people) assignments
by `jobPriority` into `unstagedAssignments`.

### 5e. Main placement loop (lines 250–341)

Four passes (`constraintRestrictionLevel` 0..3). Each pass walks
through `(assignmentIndex, peopleIndex)` pairs, where:

- `assignmentIndex` iterates over job-priority buckets in order
  (lowest priority number first — Coordinator before Carts).
- `peopleIndex` iterates over qualification buckets, but **clamps** at
  `specialJobsAmount`: once you've exhausted the specialty buckets,
  you stay on the general bucket forever for subsequent assignment
  buckets. (See the ternary in the `for` update on line 261.)

For each `(assignmentIndex, peopleIndex)` the inner double-loop tries
to place each open assignment `a` against successive candidates `p`,
re-sorting the candidate bucket by `personComparison(...,
unstagedAssignments[a].dayId)` after each placement attempt for that
slot (line 338) so the next slot's candidates reflect updated shift
counts.

The match condition combines two parts AND'd together:

1. **Qualification match**:
   `assignment.jobPriority === person.specialQualificationsIds`
   OR `assignment.jobPriority >= specialJobsAmount` (anyone can do a
   general job).

2. **Constraint match**, switched by `constraintRestrictionLevel`:
   - **Level 0** — strictest: under 4 shifts, AND
     (time preference matches OR either side is 1 [wildcard]), AND
     (not same day OR daysWorked still 1), AND
     no shift in `assignedHours` within 9 hours of this one.
   - **Level 1** — same as 0 but drop the time-preference check.
   - **Level 2** — only the 4-shift cap remains. Same-day allowed.
     9-hour rest gap dropped.
   - **Level 3** — listed as a comment but the condition for level 3
     is never written in code (`||/*constraintRestrictionLevel == 3*/`
     is commented). So the four-pass loop effectively only has three
     active passes.

When a match is taken: write `assignedVolunteer`, increment counters,
push the new hour stamp into `assignedHours`, and (if the time
preference didn't actually match) mark `nonIdealShiftTaken` on **both**
the assignment and the candidate.

There is a subtle `nonIdealShiftTaken` detection bug at lines 324–334:
the inner condition reads
`!(p.timeId != 1 || a.timePriority != 1)` which is true only when both
sides equal 1 — i.e. both are wildcards. So the flag fires when both
say "either" and not when they actually conflict. This is consistent
with `nonIdealShiftTaken` counts being `0` in the current output even
when level-1 relaxation was needed.

### 5f. Brute-force gap fill (lines 348–388)

Flattens both lists. For each still-empty slot (`assignedVolunteer ==
""`), walks the flat people list and assigns the first person who is
both qualified and under 4 shifts — no time-of-day or same-day or
rest-gap constraint. Updates `assignedHours` only sometimes (the
`assignedHours.push(...)` is not in this block — another inconsistency).
Then re-sorts the whole flat list by
`[jobPriority, timePriority, day, person, ShiftStart]` — note the
capital `S` in `ShiftStart`, which is not a real key on these objects,
so that final sort key is a no-op.

### 5g. Commented-out machinery still in the file

- A full alternate `clear()` implementation at lines 172–182.
- Two attempts at a `doubleShiftTaken` post-pass at lines 391–417.
  Neither runs. `doubleShiftTaken` is therefore always `false` on
  output even though the field is emitted.
- A long block of design-note comments (lines 437–477) sketching ideas
  for a priority-queue / heap-based redesign that was started
  (see commits `c9624d8 heap` and `6cf72c5 priority queue`) but
  abandoned.
- The bottom `IGNORE below HERE` block (lines 490–508) that turns the
  module into a self-running script in Node. See §3.

---

## 6. Known issues / things the rewrite will need to grapple with

These are things observed while reading the code, not a wishlist:

1. **The two runner scripts are broken.** `themjs.mjs` no longer
   exports anything, so `runthemjs.mjs` and `run_tests.mjs` both throw
   on import. The de-facto runner is `node themjs.mjs`, which works
   only because of an inline `import fs` + side-effect block that has
   to be removed before pasting into Apps Script.

2. **No CI, no `package.json`, no test runner.** The single test file
   contains 4 `assert.strictEqual` calls and is not currently runnable.

3. **No version control of the input data and no baseline output.**
   The entire `data/` folder is gitignored (because the inputs contain
   real volunteer names), so there is no reproducible baseline for the
   "scheduler produces X for input Y" property the rewrite needs to
   preserve. (A `theresult2json.json` snapshot of a past run used to be
   checked in, but it has been removed — its schema no longer lined up
   with the current `data/thejson.json` anyway.)

4. **`theworkingversion.mjs` is a 0-byte file** that's been tracked
   since at least 2025-07-05. Not clear if it's a placeholder for an
   intended snapshot of "the version that worked at v2025" or just
   leftover.

5. **Pre-staged shifts don't push to `assignedHours`**, so the
   9-hour-rest constraint is not enforced against pre-staged time
   slots — only against shifts placed during the main loop.

6. **`nonIdealShiftTaken` flag fires on the wrong condition**
   (see §5e); the current data shows 0 of them even though level-1
   relaxation logic exists.

7. **`doubleShiftTaken` is emitted but never set.**

8. **The final sort key `"ShiftStart"`** is not a real field on the
   assignment objects (the actual fields are `shiftStart` and
   `shiftStartNum`), so it sorts no-op-ly.

9. **`shiftStartNum` semantics are inconsistent with `shiftStart`** —
   e.g. `shiftStart: "1899-12-30T14:00:00.000Z"` paired with
   `shiftStartNum: 6`. The number is presumably the local-time hour
   (Pacific), but the algorithm's rest-gap check uses
   `day*24 + shiftStartNum` arithmetic that assumes it really is an
   hour-of-day. If the sheet ever changes timezone handling this will
   silently miscompute the rest gap.

10. **Three people are missing `timeId`** because the sheet-side
    mapping doesn't handle the `"PM, AM"` permutation. The algorithm
    treats their `timeId` as `undefined`, which `genericCompare`
    sorts as worst.

11. **Bucket-duplication trick** for putting specialists into the
    general pool (line 218) assumes specialty ids form a dense range
    `0..specialJobsAmount-1`. The current data satisfies this but the
    invariant isn't documented or enforced.

12. **Constraint level 3 is referenced in comments but never coded**,
    so the four-pass loop effectively only relaxes three times. In
    practice the brute-force pass (§5f) covers what level 3 would
    have done.

---

## 7. History note

Git history before 2026-05-24 was squashed into a single root commit to
scrub real volunteer names that had been accidentally committed (in a
past run-output JSON snapshot and a debug comment in `themjs.mjs`). The
squashed root contains the 2025-production state of the codebase as it
stood at the time of squashing; per the project CLAUDE.md, 2026 work is
expected to diverge freely without backward-compatibility concerns.
