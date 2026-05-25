import type {
  Assignment,
  AssignmentRule,
  AssignOptions,
  Person,
  PersonState,
  PlacedAssignment,
  RuleSet,
  SortingRule,
  SortContext,
} from "./types.ts";

// Slot iteration order: [jobPriority, day, startHour, jobName].
// Stable JS sort preserves input order for ties beyond these keys.
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
    .map((a) => ({ ...a, assignedVolunteer: "", brokenRules: [] as string[] }))
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
      }
    }
    bumpState(state, slot);
  }

  // Steps 4-7 — placement pass, relaxing one priority group at a time.
  // We start with all priorities active, then drop the highest each round
  // until only priority 0 (the floor) remains active.
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
        }
      }

      bumpState(chosenState, slot);
    }
  }

  return placed;
}
