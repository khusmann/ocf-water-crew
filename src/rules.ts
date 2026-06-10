// Rule combinators. Each function returns a fresh AssignmentRule or
// SortingRule parameterized by priority (and rule-specific knobs).
// Callers compose them at rule-set construction time — see rulesets.ts.
//
// Names embed parameter values where useful (e.g. `max-shifts-4`,
// `sequential-rest-8h`) so the strings that land in brokenRules stay
// self-describing without separate "name" arguments.
import type {
  AssignmentRule,
  ShiftWindow,
  SortingRule,
  TimePreference,
} from "./engine.ts";

// Which shift windows each availability preference can cover. An AM person
// takes Morning or Midday; a PM person Midday or Evening; EITHER anything.
// Midday is the only window everyone can take. dev/DESIGN.md §3.3.
const COMPATIBLE: Record<TimePreference, ShiftWindow[]> = {
  AM: ["MORNING", "MIDDAY"],
  PM: ["MIDDAY", "EVENING"],
  EITHER: ["MORNING", "MIDDAY", "EVENING"],
};

// ---------------------------------------------------------------------------
// Assignment rules
// ---------------------------------------------------------------------------

export function qualification(priority: number): AssignmentRule {
  return {
    name: "qualification",
    code: "Q",
    priority,
    test: ({ slot, person }) =>
      !slot.requiredQualification ||
      person.qualifications.includes(slot.requiredQualification),
  };
}

export function maxShifts(maxN: number, priority: number): AssignmentRule {
  return {
    name: `max-shifts-${maxN}`,
    code: `S${maxN}`,
    priority,
    test: ({ state }) => state.shiftsPlaced < maxN,
  };
}

export function oneShiftPerDay(priority: number): AssignmentRule {
  return {
    name: "one-shift-per-day",
    code: "D",
    priority,
    test: ({ slot, state }) => !state.daysWorked.has(slot.day),
  };
}

// Legacy buggy quirk preserved for currentRules: `.some(... > h)` plus
// the initial [0] sentinel in legacy `assignedHours` means this is
// "any prior anchor — including the sentinel — is >h from the slot",
// not "every prior shift is >h away". Compared start-to-start.
// targetRules uses sequentialRest() instead.
export function restGapLegacy(
  minGapHours: number,
  priority: number
): AssignmentRule {
  return {
    name: `rest-gap-${minGapHours}h-legacy`,
    code: `H${minGapHours}`,
    priority,
    test: ({ slot, state }) => {
      const slotStart = 24 * slot.day + slot.startHour;
      const hours = [0, ...state.assignedShifts.map((s) => s.absoluteStartHour)];
      return hours.some((h) => Math.abs(slotStart - h) > minGapHours);
    },
  };
}

// End-to-next-start gap ≥ minGapHours, in either direction. Also
// rejects same-start collisions (gap goes negative) and overlaps.
export function sequentialRest(
  minGapHours: number,
  priority: number
): AssignmentRule {
  return {
    name: `sequential-rest-${minGapHours}h`,
    code: `H${minGapHours}`,
    priority,
    test: ({ slot, state }) => {
      const slotStart = 24 * slot.day + slot.startHour;
      const slotEnd = slotStart + slot.durationHours;
      return state.assignedShifts.every((s) => {
        const sEnd = s.absoluteStartHour + s.durationHours;
        return (
          slotStart - sEnd >= minGapHours ||
          s.absoluteStartHour - slotEnd >= minGapHours
        );
      });
    },
  };
}

export function timePreference(priority: number): AssignmentRule {
  return {
    name: "time-preference",
    code: "T",
    priority,
    test: ({ slot, person }) =>
      COMPATIBLE[person.timePreference].includes(slot.timeWindow),
  };
}

// ---------------------------------------------------------------------------
// Sorting rules
// ---------------------------------------------------------------------------

export function fewerShiftsFirst(priority: number): SortingRule {
  return {
    name: "fewer-shifts-first",
    priority,
    compare: (a, b, { stateOf }) =>
      stateOf(a).shiftsPlaced - stateOf(b).shiftsPlaced,
  };
}

export function fewerDaysFirst(priority: number): SortingRule {
  return {
    name: "fewer-days-first",
    priority,
    compare: (a, b, { stateOf }) =>
      stateOf(a).daysWorked.size - stateOf(b).daysWorked.size,
  };
}

// Legacy guard: tie when either candidate has zero qualifications.
// Without the guard, a specialist beats a non-specialist on every
// general-bucket tiebreak — the legacy guard is what keeps Carts going
// to non-specialists first.
export function moreSpecializedFirstAmongSpecialists(
  priority: number
): SortingRule {
  return {
    name: "more-specialized-first-among-specialists",
    priority,
    compare: (a, b) => {
      const aN = a.qualifications.length;
      const bN = b.qualifications.length;
      if (aN === 0 || bN === 0) return 0;
      return bN - aN;
    },
  };
}

// Flipped polarity from the legacy rule: prefer the less-loaded
// specialists. Same guard so non-specialists aren't deprioritized.
export function fewerQualsFirstAmongSpecialists(
  priority: number
): SortingRule {
  return {
    name: "fewer-quals-first-among-specialists",
    priority,
    compare: (a, b) => {
      const aN = a.qualifications.length;
      const bN = b.qualifications.length;
      if (aN === 0 || bN === 0) return 0;
      return aN - bN;
    },
  };
}

export function alphabeticalByName(priority: number): SortingRule {
  return {
    name: "alphabetical-by-name",
    priority,
    compare: (a, b) => a.name.localeCompare(b.name),
  };
}

// Step comparator: people with <n shifts beat people with ≥n.
export function everyoneGetsAtLeast(
  n: number,
  priority: number
): SortingRule {
  return {
    name: `everyone-gets-${n}-shifts`,
    priority,
    compare: (a, b, { stateOf }) => {
      const aBucket = stateOf(a).shiftsPlaced < n ? 0 : 1;
      const bBucket = stateOf(b).shiftsPlaced < n ? 0 : 1;
      return aBucket - bBucket;
    },
  };
}

// Among the already-compatible survivors (the time-preference assignment
// rule has gated everyone here), prefer fixed-preference (AM/PM) people;
// EITHER ranks last so the flexible reserve is saved for windows a
// fixed-preference person can't fill. dev/DESIGN.md §3.3.
export function preferExactTimeMatch(priority: number): SortingRule {
  return {
    name: "prefer-exact-time-match",
    priority,
    compare: (a, b) => {
      const rank = (pref: TimePreference) => (pref === "EITHER" ? 1 : 0);
      return rank(a.timePreference) - rank(b.timePreference);
    },
  };
}
