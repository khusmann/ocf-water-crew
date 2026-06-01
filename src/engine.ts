// Rules engine: canonical types, RuleSet validator, scheduling loop,
// seeded RNG, and the boundary parser that bridges the legacy
// src/types.ts shapes (as produced by src/sheet.ts) to the canonical
// types the engine consumes.
//
// One-file layout deliberate: every layer above (rules.ts, rulesets.ts,
// scheduler.ts) imports from this module; consolidation keeps the dist
// bundle small and the import graph linear. parseLegacy lives here
// because it shares the canonical types — it'll be deleted once
// src/sheet.ts is rewritten to emit canonical shapes directly
// (META_PLAN migration step 2).

import type {
  Person as LegacyPerson,
  Assignment as LegacyAssignment,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Canonical types — dev/NEW_SYSTEM.md §1.
// ---------------------------------------------------------------------------

export type TimeWindow = "AM" | "PM" | "EITHER";

export type QualificationId = string;

export interface Person {
  name: string;
  timePreference: TimeWindow;
  qualifications: QualificationId[];
}

export interface Assignment {
  jobName: string;
  jobPriority: number;
  requiredQualification?: QualificationId;
  day: number;
  startHour: number;
  durationHours: number;
  timeWindow: TimeWindow;
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
// runEngine — META_PLAN target algorithm.
// ---------------------------------------------------------------------------

function compareSlots(a: Assignment, b: Assignment): number {
  if (a.jobPriority !== b.jobPriority) return a.jobPriority - b.jobPriority;
  if (a.day !== b.day) return a.day - b.day;
  if (a.startHour !== b.startHour) return a.startHour - b.startHour;
  if (a.jobName !== b.jobName) return a.jobName < b.jobName ? -1 : 1;
  return 0;
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

  const placed: PlacedAssignment[] = assignments
    .map((a) => ({
      ...a,
      assignedVolunteer: "",
      brokenRules: [] as string[],
      brokenCodes: [] as string[],
    }))
    .sort((a, b) => compareSlots(a, b));

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

// ---------------------------------------------------------------------------
// parseLegacy — legacy → canonical boundary. dev/NEW_SYSTEM.md §1.1.
// ---------------------------------------------------------------------------

function personTimeWindow(p: LegacyPerson): TimeWindow {
  switch (p.timePreference) {
    case "AM":
      return "AM";
    case "PM":
      return "PM";
    case "AM, PM":
    case "PM, AM":
      return "EITHER";
    case "":
      return "EITHER";
  }
}

function slotTimeWindow(a: LegacyAssignment): TimeWindow {
  switch (a.timePriority) {
    case 0:
      return "AM";
    case 2:
      return "PM";
    case 1:
      return "EITHER";
    default:
      return "EITHER";
  }
}

function canonicalName(p: LegacyPerson): string {
  return `${p.first} ${p.last} ${p.nickname}`.trim();
}

export function parseLegacyPerson(p: LegacyPerson): Person {
  return {
    name: canonicalName(p),
    timePreference: personTimeWindow(p),
    qualifications: p.specialQualificationsIds.map((id) => String(id)),
  };
}

export function parseLegacyAssignment(a: LegacyAssignment): Assignment {
  return {
    jobName: a.jobName,
    jobPriority: a.jobPriority,
    ...(a.special ? { requiredQualification: String(a.jobPriority) } : {}),
    day: a.day,
    startHour: a.shiftStartNum,
    durationHours: a.hrsShift,
    timeWindow: slotTimeWindow(a),
    stagedVolunteer: a.stagedVolunteer ?? "",
  };
}

export function parseLegacy(
  assignments: LegacyAssignment[],
  people: LegacyPerson[]
): { assignments: Assignment[]; people: Person[] } {
  return {
    assignments: assignments.map(parseLegacyAssignment),
    people: people.map(parseLegacyPerson),
  };
}
