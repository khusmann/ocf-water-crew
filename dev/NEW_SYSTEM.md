# NEW_SYSTEM — rule DSL design

Step 1 deliverable from [META_PLAN.md](META_PLAN.md): the typed DSL the
rules engine will consume, plus two worked rule sets (`current` and
`target`). Step 2 turns these into engine internals and a migration
plan, in a separate doc.

The behavioral change the rewrite ships is exactly the diff between
`currentRules` and `targetRules`.

---

## 1. DSL

### 1.1 Per-person state

State the engine maintains for each person across the placement pass.
Replaces the legacy prime-multiplication `daysWorked: number` and the
unitless `assignedHours: number[]`.

```ts
export type PersonState = {
  shiftsPlaced: number;
  daysWorked: Set<number>;                       // day numbers (1..4)
  assignedShifts: Array<{
    startHour: number;                           // 24*day + shiftStartNum
    durationHours: number;                       // assignment.hrsShift
  }>;
};
```

Same-day check is `state.daysWorked.has(slot.day)`. Hour-gap checks read
`assignedShifts` directly. Storing duration lets the target rule set
express "≥ 1 hour between end and next start"; the current rule set
ignores `durationHours`.

### 1.2 Assignment rule (filter)

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

### 1.3 People-sorting rule (comparator)

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

### 1.4 Rule set

```ts
export type RuleSet = {
  name: string;
  assignmentRules: AssignmentRule[];
  sortingRules: SortingRule[];
};
```

### 1.5 Engine entry point

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
): IndexedAssignment[];
```

`IndexedAssignment` carries `brokenRules: string[]` in place of the
legacy `nonIdealShiftTaken` / `sameDayAssigned` / `doubleShiftTaken`
booleans (per META_PLAN — no backwards-compat shim).

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
    !slot.special ||
    person.specialQualificationsIds.includes(slot.jobPriority),
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
const restGap9hLegacy: AssignmentRule = {
  name: "rest-gap-9h-legacy",
  priority: 1,
  test: ({ slot, state }) => {
    const slotStart = 24 * slot.day + slot.shiftStartNum;
    const hours = [0, ...state.assignedShifts.map((s) => s.startHour)];
    return hours.some((h) => Math.abs(slotStart - h) > 9);
  },
};

// Legacy code uses timeId/timePriority where 1 is the "either" wildcard.
const timePreference: AssignmentRule = {
  name: "time-preference",
  priority: 2,
  test: ({ slot, person }) =>
    slot.timePriority === person.timeId ||
    person.timeId === 1 ||
    slot.timePriority === 1,
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
    const aN = a.specialQualificationsIds.length;
    const bN = b.specialQualificationsIds.length;
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
export const currentRules: RuleSet = {
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
};
```

### 2.4 Snapshot-fidelity caveat

The Phase-2 snapshots were generated by an algorithm that uses *two*
slot iteration orders — sorted `[jobPriority, timePriority, day, person]`
for the main loop, and a day-interleaved `distributeSort` for the
brute-force pass (CURRENT.md §5e–§5f). The new engine uses a single
sorted slot order across all relaxation passes.

For most fixtures the alphabetical-by-name sorting rule uniquely
determines each placement, so slot order should not affect the result.
If the `realistic` fixture diverges anyway during Step-2 implementation,
the available outs are:

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
every assignment rule set must carry it, but the engine has no special-case
logic so it has to be explicit here).

### 3.1 Assignment rules

| Rule                          | Priority |
|-------------------------------|----------|
| `qualification`               | 0        |
| `no-two-shifts-same-start`    | 0        |
| `sequential-rest-1h`          | 0        |
| `one-shift-per-day`           | 1        |
| `sequential-rest-8h`          | 1        |
| `max-shifts-4`                | 2        |
| `time-preference`             | 3        |

Floor (priority 0) = qualification + no-collision + minimum-1h-rest.
A slot that can't satisfy all three stays empty — there is no
brute-force escape hatch.

```ts
// Shared with `current` — same definition.
const qualification: AssignmentRule = { /* as in §2.1 */ };

const noTwoShiftsSameStart: AssignmentRule = {
  name: "no-two-shifts-same-start",
  priority: 0,
  test: ({ slot, state }) => {
    const slotStart = 24 * slot.day + slot.shiftStartNum;
    return !state.assignedShifts.some((s) => s.startHour === slotStart);
  },
};

// End-to-next-start gap ≥ 1h, in either direction.
const sequentialRest1h: AssignmentRule = {
  name: "sequential-rest-1h",
  priority: 0,
  test: ({ slot, state }) => {
    const slotStart = 24 * slot.day + slot.shiftStartNum;
    const slotEnd = slotStart + slot.hrsShift;
    return state.assignedShifts.every((s) => {
      const sEnd = s.startHour + s.durationHours;
      return slotStart - sEnd >= 1 || s.startHour - slotEnd >= 1;
    });
  },
};

const oneShiftPerDay: AssignmentRule = { /* as in §2.1 */ };

const sequentialRest8h: AssignmentRule = {
  name: "sequential-rest-8h",
  priority: 1,
  test: ({ slot, state }) => {
    const slotStart = 24 * slot.day + slot.shiftStartNum;
    const slotEnd = slotStart + slot.hrsShift;
    return state.assignedShifts.every((s) => {
      const sEnd = s.startHour + s.durationHours;
      return slotStart - sEnd >= 8 || s.startHour - slotEnd >= 8;
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
| `pm-first-then-flex-then-am`                  | 3        |
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

// timeId: 0=AM, 1=AM/PM, 2=PM. Want PM (2) first, then AM/PM (1), then AM (0).
const pmFirstThenFlexThenAm: SortingRule = {
  name: "pm-first-then-flex-then-am",
  priority: 3,
  compare: (a, b) => {
    const rank = (timeId?: number) =>
      timeId === 2 ? 0 : timeId === 1 ? 1 : 2;     // undefined → 2 (AM-like)
    return rank(a.timeId) - rank(b.timeId);
  },
};

// Flipped from `current`: fewer quals first (don't burn out specialists).
// Same legacy-style guard — only compare among candidates who both have
// at least one qualification, otherwise tie.
const fewerQualsFirstAmongSpecialists: SortingRule = {
  name: "fewer-quals-first-among-specialists",
  priority: 4,
  compare: (a, b) => {
    const aN = a.specialQualificationsIds.length;
    const bN = b.specialQualificationsIds.length;
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
export const targetRules: RuleSet = {
  name: "target",
  assignmentRules: [
    qualification,
    noTwoShiftsSameStart, sequentialRest1h,
    oneShiftPerDay, sequentialRest8h,
    maxShifts4,
    timePreference,
  ],
  sortingRules: [
    everyoneGets2Shifts,
    fewerShiftsFirst,
    fewerDaysFirst,
    pmFirstThenFlexThenAm,
    fewerQualsFirstAmongSpecialists,
  ],
};
```

---

## 4. What the diff buys us

The deltas between `currentRules` and `targetRules` are the actual
policy change the rewrite ships:

| Concern         | `current`                                         | `target`                                                     |
|-----------------|---------------------------------------------------|--------------------------------------------------------------|
| Hour-gap rule   | Single 9h gap, buggy (`.some()` + `[0]` sentinel) | Split: ≥1h end-to-start floor, ≥8h end-to-start at priority 1 |
| Same-start collisions | Implicit in 9h rule                         | Explicit floor rule (`no-two-shifts-same-start`)             |
| Max-shifts-4    | Floor (unbreakable)                               | Priority 2 (relax before leaving slot empty)                 |
| Time preference | Priority 2 (last to relax of breakables)          | Priority 3 (last to relax of breakables)                     |
| Sort: ≥2 per person  | absent                                       | Priority 0 (highest)                                          |
| Sort: days worked    | absent                                       | Priority 2                                                    |
| Sort: time pref      | absent                                       | Priority 3 (PM → AM/PM → AM)                                  |
| Sort: specialty count | More-specialized first (legacy)             | **Fewer**-qualified first (anti-burnout)                      |
| Tiebreak        | Alphabetical-by-name                              | RNG (`mulberry32(0)` in tests, `Math.random` in production)  |
| Brute force     | Implicit final pass with reorder by day           | Drops out — floor is the only fallback, unfillable slots stay empty |

Each row is something the rewrite's snapshot diffs will exhibit when
`targetRules` is loaded instead of `currentRules`. Step 2 (and its
implementation) inherits this as the test plan: snapshot under
`currentRules` must equal Phase-2 baselines; snapshot under
`targetRules` is the new pinned behavior.
