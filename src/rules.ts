// Rule combinators. Each function returns a fresh AssignmentRule or
// SortingRule parameterized by priority (and rule-specific knobs).
// Callers compose them at rule-set construction time — see rulesets.ts.
//
// Names embed parameter values where useful (e.g. `max-shifts-4`,
// `sequential-rest-8h`) so the strings that land in brokenRules stay
// self-describing without separate "name" arguments.
import type { AssignmentRule, SortingRule, TimeWindow } from "./engine.ts";

// ---------------------------------------------------------------------------
// Assignment rules
// ---------------------------------------------------------------------------

export function qualification(priority: number): AssignmentRule {
  return {
    name: "qualification",
    priority,
    test: ({ slot, person }) =>
      !slot.requiredQualification ||
      person.qualifications.includes(slot.requiredQualification),
  };
}

export function maxShifts(maxN: number, priority: number): AssignmentRule {
  return {
    name: `max-shifts-${maxN}`,
    priority,
    test: ({ state }) => state.shiftsPlaced < maxN,
  };
}

export function oneShiftPerDay(priority: number): AssignmentRule {
  return {
    name: "one-shift-per-day",
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
    priority,
    test: ({ slot, person }) =>
      slot.timeWindow === person.timePreference ||
      person.timePreference === "EITHER" ||
      slot.timeWindow === "EITHER",
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

// Exact slot match wins, then EITHER, then opposite-window people last
// (they only land here once `time-preference` has already relaxed).
// Saves EITHER candidates for slots an exact-match person can't take.
export function preferExactTimeMatch(priority: number): SortingRule {
  return {
    name: "prefer-exact-time-match",
    priority,
    compare: (a, b, { slot }) => {
      const rank = (pref: TimeWindow) =>
        pref === slot.timeWindow ? 0 : pref === "EITHER" ? 1 : 2;
      return rank(a.timePreference) - rank(b.timePreference);
    },
  };
}
