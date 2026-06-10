// Rules engine: canonical types, RuleSet validator, scheduling loop, and
// seeded RNG. src/sheet.ts reads the sheet straight into these canonical
// types and runs the engine directly — there is no legacy shape and no
// boundary parser anymore.
//
// One-file layout deliberate: every layer above (rules.ts, rulesets.ts)
// imports from this module; consolidation keeps the dist bundle small and
// the import graph linear.

// ---------------------------------------------------------------------------
// Canonical types — dev/DESIGN.md §1.
// ---------------------------------------------------------------------------

// A person's availability preference and a shift's time-of-day window are
// two distinct domains, joined by the compatibility matrix in rules.ts
// (an AM person can take Morning or Midday; a PM person Midday or Evening;
// an EITHER person anything). dev/DESIGN.md §3.3.
export type TimePreference = "AM" | "PM" | "EITHER";
export type ShiftWindow = "MORNING" | "MIDDAY" | "EVENING";

export type QualificationId = string;

export interface Person {
  name: string;
  timePreference: TimePreference;
  qualifications: QualificationId[];
}

export interface Assignment {
  jobName: string;
  jobPriority: number;
  requiredQualification?: QualificationId;
  day: number;
  startHour: number;
  durationHours: number;
  timeWindow: ShiftWindow;
  stagedVolunteer: string;
}

export interface PlacedAssignment extends Assignment {
  assignedVolunteer: string;
  brokenRules: string[];
  brokenCodes: string[];
}

export interface PersonState {
  shiftsPlaced: number;
  daysWorked: Set<number>;
  assignedShifts: Array<{
    absoluteStartHour: number;
    durationHours: number;
  }>;
}

export interface PlacementContext {
  slot: Assignment;
  person: Person;
  state: PersonState;
}

export interface AssignmentRule {
  name: string;
  // Short code surfaced in output when this rule is broken (e.g. "H8",
  // "S4", "T"). Letter identifies the rule; trailing number, where
  // present, echoes the rule's parameter.
  code: string;
  priority: number;
  test: (ctx: PlacementContext) => boolean;
}

export interface SortContext {
  slot: Assignment;
  stateOf: (person: Person) => PersonState;
}

export interface SortingRule {
  name: string;
  priority: number;
  compare: (a: Person, b: Person, ctx: SortContext) => number;
}

export interface RuleSet {
  name: string;
  assignmentRules: AssignmentRule[];
  sortingRules: SortingRule[];
}

export interface AssignOptions {
  rng?: () => number;
}

// ---------------------------------------------------------------------------
// defineRuleSet — construction-time validation.
// ---------------------------------------------------------------------------

export function defineRuleSet(spec: RuleSet): RuleSet {
  const hasFloor = spec.assignmentRules.some((r) => r.priority === 0);
  if (!hasFloor) {
    throw new Error(
      `RuleSet "${spec.name}" has no priority-0 assignment rule; ` +
        `the engine has no floor to relax to.`
    );
  }

  const seen = new Set<number>();
  for (const rule of spec.sortingRules) {
    if (seen.has(rule.priority)) {
      throw new Error(
        `RuleSet "${spec.name}" has duplicate sorting-rule priority ${rule.priority}; ` +
          `sorting priorities must be pairwise distinct.`
      );
    }
    seen.add(rule.priority);
  }

  return spec;
}

// ---------------------------------------------------------------------------
// mulberry32 — small seedable RNG for deterministic tests.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// orderCodes — stable display order for broken-rule codes.
// ---------------------------------------------------------------------------

// Sort by leading letter (rest H, same-day D, max-shifts S, time T,
// qualification Q; anything else last), then by trailing number so e.g.
// "H8" precedes "H10". Dedups via the Set the caller passes in.
export function orderCodes(codes: Iterable<string>): string[] {
  const rank = (code: string): number => {
    const i = "HDSTQ".indexOf(code[0]);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const num = (code: string): number => {
    const n = parseInt(code.slice(1), 10);
    return Number.isNaN(n) ? 0 : n;
  };
  return Array.from(new Set(codes)).sort(
    (a, b) => rank(a) - rank(b) || num(a) - num(b) || a.localeCompare(b)
  );
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// runEngine — see dev/DESIGN.md §2.
// ---------------------------------------------------------------------------

// The canonical order the engine fills slots in. Exported so the sheet can
// emit generated rows in the same order, keeping the Assignments tab from
// reshuffling on the first assign run (ties beyond these keys preserve
// input order via stable sort).
export function compareSlots(a: Assignment, b: Assignment): number {
  if (a.jobPriority !== b.jobPriority) return a.jobPriority - b.jobPriority;
  if (a.day !== b.day) return a.day - b.day;
  if (a.startHour !== b.startHour) return a.startHour - b.startHour;
  if (a.jobName !== b.jobName) return a.jobName < b.jobName ? -1 : 1;
  return 0;
}

// Fisher–Yates shuffle of arr[lo, hi) in place, driven by rng.
function shuffleRange<T>(
  arr: T[],
  lo: number,
  hi: number,
  rng: () => number
): void {
  for (let i = hi - 1; i > lo; i--) {
    const j = lo + Math.floor(rng() * (i - lo + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// The order the engine fills slots in. Without rng: the deterministic
// canonical order (compareSlots). With rng: stable by jobPriority, then
// each equal-priority group is shuffled together (full interleave) — so
// among equal-priority slots no job systematically gets first pick of the
// candidate pool. dev/DESIGN.md §4.
function orderSlotsForFill(
  placed: PlacedAssignment[],
  rng?: () => number
): void {
  if (!rng) {
    placed.sort((a, b) => compareSlots(a, b));
    return;
  }
  placed.sort((a, b) => a.jobPriority - b.jobPriority); // stable in V8
  let i = 0;
  while (i < placed.length) {
    let j = i;
    while (j < placed.length && placed[j].jobPriority === placed[i].jobPriority) {
      j++;
    }
    shuffleRange(placed, i, j, rng);
    i = j;
  }
}

function emptyState(): PersonState {
  return { shiftsPlaced: 0, daysWorked: new Set(), assignedShifts: [] };
}

function bumpState(state: PersonState, slot: Assignment): void {
  state.shiftsPlaced += 1;
  state.daysWorked.add(slot.day);
  state.assignedShifts.push({
    absoluteStartHour: 24 * slot.day + slot.startHour,
    durationHours: slot.durationHours,
  });
}

function combineSortingRules(rules: SortingRule[]) {
  const ordered = [...rules].sort((a, b) => a.priority - b.priority);
  return (a: Person, b: Person, ctx: SortContext): number => {
    for (const rule of ordered) {
      const r = rule.compare(a, b, ctx);
      if (r !== 0) return r;
    }
    return 0;
  };
}

export function runEngine(
  ruleSet: RuleSet,
  assignments: Assignment[],
  people: Person[],
  opts: AssignOptions = {}
): PlacedAssignment[] {
  const rng = opts.rng;

  const rulesByPriorityAsc = [...ruleSet.assignmentRules].sort(
    (a, b) => a.priority - b.priority
  );
  const distinctPrioritiesAsc = Array.from(
    new Set(rulesByPriorityAsc.map((r) => r.priority))
  ).sort((a, b) => a - b);

  const states = new Map<string, PersonState>();
  for (const p of people) states.set(p.name, emptyState());
  const stateOf = (p: Person): PersonState => states.get(p.name)!;
  const personByName = new Map(people.map((p) => [p.name, p]));

  const placed: PlacedAssignment[] = assignments.map((a) => ({
    ...a,
    assignedVolunteer: "",
    brokenRules: [] as string[],
    brokenCodes: [] as string[],
  }));
  orderSlotsForFill(placed, rng);

  // Step 3 — copy staged volunteers into their assignments. Evaluate the
  // full assignment-rule set against the (staged person, slot) pair BEFORE
  // bumping state with this slot, so a same-day staging collision shows up
  // as "one-shift-per-day" in the SECOND slot's brokenRules, not both.
  for (const slot of placed) {
    if (!slot.stagedVolunteer) continue;
    slot.assignedVolunteer = slot.stagedVolunteer;
    const person = personByName.get(slot.stagedVolunteer);
    if (!person) continue;
    const state = stateOf(person);
    for (const rule of rulesByPriorityAsc) {
      if (!rule.test({ slot, person, state })) {
        slot.brokenRules.push(rule.name);
        slot.brokenCodes.push(rule.code);
      }
    }
    bumpState(state, slot);
  }

  // Steps 4-7 — placement pass, relaxing one priority group at a time.
  const compare = combineSortingRules(ruleSet.sortingRules);

  for (let i = distinctPrioritiesAsc.length - 1; i >= 0; i--) {
    const activeCeiling = distinctPrioritiesAsc[i];
    const activeRules = rulesByPriorityAsc.filter(
      (r) => r.priority <= activeCeiling
    );
    const droppedRules = rulesByPriorityAsc.filter(
      (r) => r.priority > activeCeiling
    );

    for (const slot of placed) {
      if (slot.assignedVolunteer) continue;

      const survivors: Person[] = [];
      for (const person of people) {
        const state = stateOf(person);
        let passes = true;
        for (const rule of activeRules) {
          if (!rule.test({ slot, person, state })) {
            passes = false;
            break;
          }
        }
        if (passes) survivors.push(person);
      }
      if (survivors.length === 0) continue;

      const ctx: SortContext = { slot, stateOf };
      const sorted = [...survivors].sort((a, b) => compare(a, b, ctx));

      // Identify the top tie group — every candidate that ties with sorted[0].
      const top: Person[] = [sorted[0]];
      for (let k = 1; k < sorted.length; k++) {
        if (compare(sorted[0], sorted[k], ctx) === 0) top.push(sorted[k]);
        else break;
      }

      const chosen = rng ? top[Math.floor(rng() * top.length)] : top[0];

      slot.assignedVolunteer = chosen.name;
      const chosenState = stateOf(chosen);

      for (const rule of droppedRules) {
        if (!rule.test({ slot, person: chosen, state: chosenState })) {
          slot.brokenRules.push(rule.name);
          slot.brokenCodes.push(rule.code);
        }
      }

      bumpState(chosenState, slot);
    }
  }

  return placed;
}
