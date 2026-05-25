# NEW_SYSTEM — rule DSL design

Step 1 deliverable from [META_PLAN.md](META_PLAN.md): the typed DSL the
rules engine will consume, plus two worked rule sets (`current` and
`target`). Step 2 turns these into engine internals and a migration
plan, in a separate doc.

The behavioral change the rewrite ships is exactly the diff between
`currentRules` and `targetRules`.

---

## 1. DSL

### 1.1 Canonical input types

The engine sees a normalized form of the input — not the legacy
[src/types.ts](../src/types.ts) `Person` / `Assignment` shapes. A small
parser at the engine entry converts the legacy shape (as produced by
[src/sheet.ts](../src/sheet.ts)) into the canonical one; the parser
gets deleted once `sheet.ts` is rewritten to emit canonical types
directly (per META_PLAN's "Canonical types at the engine boundary"
decision).

```ts
// Categorical: time-of-day window. No implicit ordering — any ranking
// lives in the people-sorting rules. "EITHER" replaces the legacy
// wildcard value (timeId / timePriority === 1) and folds in the
// legacy "PM, AM" timePreference (which had no timeId mapping at all).
export type TimeWindow = "AM" | "PM" | "EITHER";

// Open string id — the sheet is the source of truth for which
// qualifications exist. Engine treats them as opaque tokens: rules
// only do equality checks (`includes`, `===`), never branch on
// specific values. The boundary parser bridges the legacy numeric
// representation: legacy Assignment.jobPriority (when special) and
// Person.specialQualificationsIds[i] are both numeric ids drawn from
// the same name table on the sheet. The parser stringifies them (or
// looks up the sheet's qualification-name column) so that
// person.qualifications and slot.requiredQualification compare equal.
export type QualificationId = string;

export type Person = {
  name: string;                            // canonical display name
  timePreference: TimeWindow;
  qualifications: QualificationId[];
};

export type Assignment = {
  jobName: string;
  jobPriority: number;                     // 0..14, lower = filled first
  requiredQualification?: QualificationId; // present iff job needs qualification
  day: number;                             // 1..4 (Thu..Sun of the Faire)
  startHour: number;                       // integer hour-of-day 0..23 (was shiftStartNum)
  durationHours: number;                   // integer shift duration (was hrsShift)
  timeWindow: TimeWindow;                  // categorical (was timePriority/timeCategory)
  stagedVolunteer: string;                 // "" if open
};

export type PlacedAssignment = Assignment & {
  assignedVolunteer: string;               // "" if engine left it empty
  brokenRules: string[];                   // names of rules relaxed for this placement
};
```

What was dropped from legacy and why:

- `timeId`, `timePriority`, `timeCategory` — replaced by `TimeWindow`.
- `specialQualificationsIds: number[]` — renamed to `qualifications`
  and re-typed as opaque string ids sourced from the sheet (engine
  doesn't enumerate them).
- `dayId` (the prime 2/3/5/7 trick) — engine tracks `daysWorked` as
  `Set<number>`, no factor-checking needed.
- `shiftStart` (GS date serial) — `startHour` is the meaningful part.
- `special: boolean` on Assignment — presence of `requiredQualification`
  is the discriminator now.
- `person: number` (slot index within job/day) and `index: number`
  (post-sort renumbering) — neither drove any decision; canonical
  engine relies on JS's stable `Array.sort` for slot iteration
  tiebreaking instead.
- `nonIdealShiftTaken` / `sameDayAssigned` / `doubleShiftTaken` on
  output — folded into the unified `brokenRules: string[]`.
- `DecoratedPerson` / `ExpandedPerson` intermediates — these existed
  to feed the expand-and-bucket trick the new engine doesn't do.
- Sheet-only Person fields the algorithm never read:
  `volunteerType`, `hoursAssigned`, `shifts`, `first`/`last`/`nickname`,
  `specialQualifications` (the human-readable string).

### 1.2 Per-person state

State the engine maintains for each person across the placement pass.

```ts
export type PersonState = {
  shiftsPlaced: number;
  daysWorked: Set<number>;                 // day numbers (1..4)
  assignedShifts: Array<{
    absoluteStartHour: number;             // 24*assignment.day + assignment.startHour
    durationHours: number;
  }>;
};
```

### 1.3 Assignment rule (filter)

```ts
export type PlacementContext = {
  slot: Assignment;
  person: Person;
  state: PersonState;     // state of `person` at this point in the pass
};

export type AssignmentRule = {
  name: string;           // surfaced in brokenRules when relaxed
  priority: number;       // non-distinct; 0 = unbreakable floor
  test: (ctx: PlacementContext) => boolean;
};
```

A rule passes when `test()` returns `true`. The engine drops rule groups
in descending priority order (highest number first) until every slot is
either filled or stuck at the priority-0 floor. Slots that can't satisfy
the floor stay empty (`assignedVolunteer === ""`).

### 1.4 People-sorting rule (comparator)

```ts
export type SortContext = {
  slot: Assignment;
  stateOf: (person: Person) => PersonState;
};

export type SortingRule = {
  name: string;
  priority: number;       // distinct; 0 = strictest tiebreaker
  compare: (a: Person, b: Person, ctx: SortContext) => number;
};
```

Standard `< 0 | 0 | > 0`. The engine composes comparators
lexicographically in ascending `priority` order — priority-0 first, ties
handed to priority-1, etc.

### 1.5 Rule set

```ts
export type RuleSet = {
  name: string;
  assignmentRules: AssignmentRule[];
  sortingRules: SortingRule[];
};
```

Constructed via a `defineRuleSet()` helper that validates:

- `assignmentRules` contains at least one rule at priority 0 (the floor
  the engine relaxes down to).
- `sortingRules` priorities are pairwise distinct.

Both violations throw at construction — the engine never runs against
a malformed rule set.

### 1.6 Engine entry point

```ts
export type AssignOptions = {
  rng?: () => number;     // omitted → stable tie order
                          // given   → uniform random among top-tied group
};

export function assign(
  ruleSet: RuleSet,
  assignments: Assignment[],
  people: Person[],
  opts?: AssignOptions,
): PlacedAssignment[];
```

Slot iteration order is `[jobPriority, day, startHour, jobName]`. Ties
within those keys preserve input order via stable sort — the canonical
shape doesn't carry the legacy `person` / `index` fields, so input
order is the only available tiebreaker and the parser is responsible
for handing slots in a meaningful order (sheet row order is fine).

Staged volunteers (where `stagedVolunteer !== ""`) are copied verbatim
into `assignedVolunteer` before the placement pass begins. The
assignment-rule set is evaluated against each staged (person, slot)
pair and any failures are recorded in that slot's `brokenRules` —
staging is a manual override that the engine never rejects, but it
*is* annotated so a downstream UI can surface "this staged shift
breaks rule X." The placement pass updates per-person state from
staged shifts (counters, days, hours) so subsequent placements see
the correct picture.

---

## 2. Worked rule set: `current`

Reproduces the four-nested-loop behavior of [src/scheduler.ts](../src/scheduler.ts)
against the Phase-2 fixture snapshots. The dead branches in the legacy
`personComparison` (timePriority access that always returns 0, daysWorked
tiebreak that gets immediately overwritten, never-coded
`constraintRestrictionLevel === 3`) are dropped — they have no
observable effect on output, so omitting them preserves snapshots.

### 2.1 Assignment rules

| Rule                  | Priority | Legacy origin                            |
|-----------------------|----------|------------------------------------------|
| `qualification`       | 0        | `jobPriority === specialQualificationsIds \|\| jobPriority >= specialJobsAmount` |
| `max-shifts-4`        | 0        | `shiftCount.shiftsPlaced < MAX_SHIFTS_PER_PERSON` |
| `one-shift-per-day`   | 1        | `daysWorked % dayId != 0 \|\| daysWorked == 1` |
| `rest-gap-9h-legacy`  | 1        | `assignedHours.some(... > MIN_REST_HOURS)` |
| `time-preference`     | 2        | `timePriority == timeId \|\| timeId == 1 \|\| timePriority == 1` |

Drop order: priority 2 (time-pref) drops first → matches legacy Level 1.
Then priority 1 (same-day + rest-gap) drops → only floor remains, matching
legacy Level 2 *and* the brute-force gap-fill pass (both leave only
qualification + max-shifts active).

```ts
const qualification: AssignmentRule = {
  name: "qualification",
  priority: 0,
  test: ({ slot, person }) =>
    !slot.requiredQualification ||
    person.qualifications.includes(slot.requiredQualification),
};

const maxShifts4: AssignmentRule = {
  name: "max-shifts-4",
  priority: 0,
  test: ({ state }) => state.shiftsPlaced < 4,
};

const oneShiftPerDay: AssignmentRule = {
  name: "one-shift-per-day",
  priority: 1,
  test: ({ slot, state }) => !state.daysWorked.has(slot.day),
};

// Legacy quirk preserved: `.some(... > 9)` plus an initial sentinel of
// 0 in assignedHours means this is *true as long as any prior shift —
// including the sentinel — is >9h from the slot*. That's not "every
// prior shift is >9h away", and it's why the realistic snapshot shows
// fewer rest-gap rejections than you'd expect. The `target` set replaces
// this with `sequential-rest-8h`, which encodes the intent properly.
// Compared start-to-start (legacy compared `24*day + shiftStartNum`
// against the same form for prior shifts), not end-to-start.
const restGap9hLegacy: AssignmentRule = {
  name: "rest-gap-9h-legacy",
  priority: 1,
  test: ({ slot, state }) => {
    const slotStart = 24 * slot.day + slot.startHour;
    const hours = [0, ...state.assignedShifts.map((s) => s.absoluteStartHour)];
    return hours.some((h) => Math.abs(slotStart - h) > 9);
  },
};

const timePreference: AssignmentRule = {
  name: "time-preference",
  priority: 2,
  test: ({ slot, person }) =>
    slot.timeWindow === person.timePreference ||
    person.timePreference === "EITHER" ||
    slot.timeWindow === "EITHER",
};
```

### 2.2 People-sorting rules

The effective legacy `personComparison` reduces to two live comparisons
(see CURRENT.md §5a, plus inspection of [src/scheduler.ts:64-85](../src/scheduler.ts#L64-L85)):

1. `shiftsPlaced` ascending.
2. `specialQualificationsIds.length` descending, **guarded** so that the
   compare only runs when *both* candidates hold ≥ 1 qualification.
   Without the guard, a specialist beats a non-specialist on every
   general-bucket tiebreak — the legacy guard is what keeps Carts going
   to non-specialists first.

Plus an explicit by-name tiebreaker — see META_PLAN's "note on Phase-2
fixture reproduction" for why this is added even though the legacy
fixtures coincidentally satisfy it via input order.

| Rule                                          | Priority |
|-----------------------------------------------|----------|
| `fewer-shifts-first`                          | 0        |
| `more-specialized-first-among-specialists`    | 1        |
| `alphabetical-by-name`                        | 2        |

```ts
const fewerShiftsFirst: SortingRule = {
  name: "fewer-shifts-first",
  priority: 0,
  compare: (a, b, { stateOf }) =>
    stateOf(a).shiftsPlaced - stateOf(b).shiftsPlaced,
};

// Legacy guard: tie when either candidate has zero qualifications.
const moreSpecializedFirstAmongSpecialists: SortingRule = {
  name: "more-specialized-first-among-specialists",
  priority: 1,
  compare: (a, b) => {
    const aN = a.qualifications.length;
    const bN = b.qualifications.length;
    if (aN === 0 || bN === 0) return 0;
    return bN - aN;
  },
};

const alphabeticalByName: SortingRule = {
  name: "alphabetical-by-name",
  priority: 2,
  compare: (a, b) => a.name.localeCompare(b.name),
};
```

### 2.3 Composition

```ts
export const currentRules: RuleSet = defineRuleSet({
  name: "current",
  assignmentRules: [
    qualification, maxShifts4,
    oneShiftPerDay, restGap9hLegacy,
    timePreference,
  ],
  sortingRules: [
    fewerShiftsFirst,
    moreSpecializedFirstAmongSpecialists,
    alphabeticalByName,
  ],
});
```

### 2.4 Snapshot divergences

`currentRules` reproduces the *policy* of the current algorithm —
ordered passes that relax time-preference, then same-day + rest-gap,
then fall through to a qualification-only floor. The rule definitions
encode every legacy behavior that fits cleanly into the rule body; a
few legacy bugs would require schema additions (e.g. tracking which
pass made a placement, or distinguishing staged from placed shifts in
`PersonState`) to preserve and are *not* preserved. Phase-2 snapshots
need a one-time regeneration; the expected diff is exactly the items
below.

#### Output-shape changes (every snapshot row)

- The three boolean flags (`nonIdealShiftTaken`, `sameDayAssigned`,
  `doubleShiftTaken`) are replaced by `brokenRules: string[]`.
- The `index` field on the output is gone (it never drove a decision —
  see [src/types.ts:62-65](../src/types.ts#L62-L65) and CURRENT.md §6.8).

#### Bugs preserved by the rules

- **`sameDayAssigned` on staged slots.** Legacy
  [src/scheduler.ts:259-261](../src/scheduler.ts#L259-L261) sets the
  flag during the staging copy when a person was staged twice on the
  same day. Per META_PLAN step 3 the new engine evaluates all assignment
  rules against staged (person, slot) pairs, so a same-day staging
  collision lands `"one-shift-per-day"` in the second slot's
  `brokenRules` — same fact, new shape.

#### Bugs *not* preserved (expected snapshot diffs)

- **Pre-staged shifts now affect gap / day checks for auto-placements.**
  Legacy [src/scheduler.ts:248-268](../src/scheduler.ts#L248-L268) bumps
  `shiftsPlaced` and `daysWorked` from staged shifts but doesn't push to
  `assignedHours` — so the 9h gap check ignores staged shifts entirely
  (CURRENT.md §6.5). Preserving this would require `PersonState` to
  distinguish staged from placed entries; the new engine treats all
  shifts uniformly. **Snapshot impact:** in fixtures where someone is
  staged within 9h of an open slot they'd otherwise qualify for, the
  staged person now fails the gap check and a different candidate wins
  that slot. (`one-shift-per-day` is unaffected — legacy also bumped
  `daysWorked`, so same-day staging was already gating auto-placements.)

- **`time-preference` violations are now recorded uniformly.** Legacy's
  main-loop flag-setter at
  [src/scheduler.ts:371-381](../src/scheduler.ts#L371-L381) is logically
  unreachable — the condition simplifies to `x != y && x == 1 && y == 1`
  (CURRENT.md §6.6) — so `nonIdealShiftTaken` is only ever set by the
  brute-force pass at [src/scheduler.ts:416-422](../src/scheduler.ts#L416-L422).
  Preserving this would require rules to know which relaxation pass made
  the placement. The new engine records `"time-preference"` in
  `brokenRules` for any placement where it's violated, regardless of
  pass. **Snapshot impact:** more placements carry the
  `"time-preference"` entry than the legacy `nonIdealShiftTaken: true`
  flag — specifically the level-1 (time-pref-relaxed, gap- and day-still-
  enforced) placements that legacy intended to flag but didn't.

#### Slot iteration order

The legacy algorithm uses *two* slot orders — sorted
`[jobPriority, timePriority, day, person]` for the main loop, and a
day-interleaved `distributeSort` for the brute-force pass (CURRENT.md
§5e–§5f). The new engine uses one sorted order across all relaxation
passes: `[jobPriority, day, startHour, jobName]`. `startHour` (legacy
`shiftStartNum`) is the actual hour of day, finer-grained than the AM/PM
`timePriority` bucket, and a more natural ordering.

For most fixtures the `alphabetical-by-name` sorting rule uniquely
determines each placement, so slot order doesn't affect *who* gets
*which* slot. If the `realistic` fixture diverges anyway during Step-2
implementation, the available outs are:

1. The diff is provably equivalent (same set of (person, slot) pairs,
   different presentation order) — regen the snapshot and move on.
2. Slot order genuinely changes who gets which slot — either add an
   engine knob to switch iteration order at the floor (ugly but
   contained), or accept and document the snapshot delta.

Decide based on what the diff actually shows.

---

## 3. Worked rule set: `target`

The policy from META_PLAN's "Target rule set" tables, plus the implicit
`qualification` floor rule (META_PLAN omits it from the table since
every assignment rule set must carry it, but the engine has no
special-case logic so it has to be explicit here).

### 3.1 Assignment rules

| Rule                          | Priority |
|-------------------------------|----------|
| `qualification`               | 0        |
| `sequential-rest-1h`          | 0        |
| `one-shift-per-day`           | 1        |
| `sequential-rest-8h`          | 1        |
| `max-shifts-4`                | 2        |
| `time-preference`             | 3        |

Floor (priority 0) = qualification + minimum-1h-rest. The 1h-rest rule
subsumes "no two shifts with the same start time" — if two shifts share
a start, both gap checks return false (`slotStart - sEnd = -duration < 1`
on both sides), so the slot fails the floor anyway. A slot that can't
satisfy the floor stays empty — there is no brute-force escape hatch.

```ts
// Shared with `current` — same definition.
const qualification: AssignmentRule = { /* as in §2.1 */ };

// End-to-next-start gap ≥ 1h, in either direction. Also rejects
// same-start collisions (gap goes negative) and overlaps.
const sequentialRest1h: AssignmentRule = {
  name: "sequential-rest-1h",
  priority: 0,
  test: ({ slot, state }) => {
    const slotStart = 24 * slot.day + slot.startHour;
    const slotEnd = slotStart + slot.durationHours;
    return state.assignedShifts.every((s) => {
      const sEnd = s.absoluteStartHour + s.durationHours;
      return slotStart - sEnd >= 1 || s.absoluteStartHour - slotEnd >= 1;
    });
  },
};

const oneShiftPerDay: AssignmentRule = { /* as in §2.1 */ };

const sequentialRest8h: AssignmentRule = {
  name: "sequential-rest-8h",
  priority: 1,
  test: ({ slot, state }) => {
    const slotStart = 24 * slot.day + slot.startHour;
    const slotEnd = slotStart + slot.durationHours;
    return state.assignedShifts.every((s) => {
      const sEnd = s.absoluteStartHour + s.durationHours;
      return slotStart - sEnd >= 8 || s.absoluteStartHour - slotEnd >= 8;
    });
  },
};

const maxShifts4: AssignmentRule = {
  name: "max-shifts-4",
  priority: 2,                 // demoted from floor in `current`
  test: ({ state }) => state.shiftsPlaced < 4,
};

const timePreference: AssignmentRule = { /* same as §2.1, but */ priority: 3 };
```

### 3.2 People-sorting rules

| Rule                                          | Priority |
|-----------------------------------------------|----------|
| `everyone-gets-2-shifts`                      | 0        |
| `fewer-shifts-first`                          | 1        |
| `fewer-days-first`                            | 2        |
| `prefer-exact-time-match`                     | 3        |
| `fewer-quals-first-among-specialists`         | 4        |

```ts
// Step-comparator: people with <2 shifts beat people with ≥2.
const everyoneGets2Shifts: SortingRule = {
  name: "everyone-gets-2-shifts",
  priority: 0,
  compare: (a, b, { stateOf }) => {
    const aBucket = stateOf(a).shiftsPlaced < 2 ? 0 : 1;
    const bBucket = stateOf(b).shiftsPlaced < 2 ? 0 : 1;
    return aBucket - bBucket;
  },
};

const fewerShiftsFirst: SortingRule = { /* same as §2.2, but */ priority: 1 };

const fewerDaysFirst: SortingRule = {
  name: "fewer-days-first",
  priority: 2,
  compare: (a, b, { stateOf }) =>
    stateOf(a).daysWorked.size - stateOf(b).daysWorked.size,
};

// Prefer candidates whose preference matches the slot exactly; then
// EITHER (the flexible folks); then the opposite-window people last
// (they only show up here if `time-preference` has already been
// relaxed at priority 3, so they'd be a hard-mismatch placement).
// This saves EITHER candidates for slots where exact match is
// unavailable, instead of burning them on slots an exact-match person
// could have taken.
const preferExactTimeMatch: SortingRule = {
  name: "prefer-exact-time-match",
  priority: 3,
  compare: (a, b, { slot }) => {
    const rank = (pref: TimeWindow) =>
      pref === slot.timeWindow ? 0 : pref === "EITHER" ? 1 : 2;
    return rank(a.timePreference) - rank(b.timePreference);
  },
};

// Flipped from `current`: fewer quals first (don't burn out specialists).
// Same legacy-style guard — only compare among candidates who both have
// at least one qualification, otherwise tie.
const fewerQualsFirstAmongSpecialists: SortingRule = {
  name: "fewer-quals-first-among-specialists",
  priority: 4,
  compare: (a, b) => {
    const aN = a.qualifications.length;
    const bN = b.qualifications.length;
    if (aN === 0 || bN === 0) return 0;
    return aN - bN;
  },
};
```

The target set **omits** the `alphabetical-by-name` rule from `current`.
Tests pass a seeded RNG (`mulberry32(0)`) so ties resolve
deterministically; production uses unseeded `Math.random`.

### 3.3 Composition

```ts
export const targetRules: RuleSet = defineRuleSet({
  name: "target",
  assignmentRules: [
    qualification, sequentialRest1h,
    oneShiftPerDay, sequentialRest8h,
    maxShifts4,
    timePreference,
  ],
  sortingRules: [
    everyoneGets2Shifts,
    fewerShiftsFirst,
    fewerDaysFirst,
    preferExactTimeMatch,
    fewerQualsFirstAmongSpecialists,
  ],
});
```

---

## 4. What the diff buys us

The deltas between `currentRules` and `targetRules` are the actual
policy change the rewrite ships:

| Concern               | `current`                                         | `target`                                                          |
|-----------------------|---------------------------------------------------|-------------------------------------------------------------------|
| Hour-gap rule         | Single 9h start-to-start, buggy (`.some()` + `[0]` sentinel) | Split: ≥1h end-to-start floor, ≥8h end-to-start at priority 1     |
| Same-start collisions | Implicit in 9h rule                               | Subsumed by ≥1h floor rule (no separate rule)                     |
| Max-shifts-4          | Floor (unbreakable)                               | Priority 2 (relax before leaving slot empty)                      |
| Time preference       | Priority 2 (last to relax of breakables)          | Priority 3 (last to relax of breakables)                          |
| Sort: ≥2 per person   | absent                                            | Priority 0 (highest)                                              |
| Sort: days worked     | absent                                            | Priority 2                                                        |
| Sort: time pref       | absent                                            | Priority 3 (prefer exact slot match, then EITHER, then opposite)  |
| Sort: specialty count | More-specialized first (legacy)                   | **Fewer**-qualified first (anti-burnout)                          |
| Tiebreak              | Alphabetical-by-name                              | RNG (`mulberry32(0)` in tests, `Math.random` in production)       |
| Brute force           | Implicit final pass with reorder by day           | Drops out — floor is the only fallback, unfillable slots stay empty |

Each row is something the rewrite's snapshot diffs will exhibit when
`targetRules` is loaded instead of `currentRules`. Step 2 (and its
implementation) inherits this as the test plan: snapshot under
`currentRules` must equal Phase-2 baselines; snapshot under
`targetRules` is the new pinned behavior.
