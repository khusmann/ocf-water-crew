// Named rule-set compositions. The diff between currentRules and
// targetRules is exactly the policy change the rewrite ships —
// see dev/DESIGN.md §4 for the row-by-row breakdown.
import { defineRuleSet, type RuleSet } from "./engine.ts";
import {
  alphabeticalByName,
  everyoneGetsAtLeast,
  fewerHoursFirst,
  fewerQualsFirstAmongSpecialists,
  fewerShiftsFirst,
  maxShifts,
  moreSpecializedFirstAmongSpecialists,
  oneShiftPerDay,
  overnightTurnaround,
  preferExactTimeMatch,
  qualification,
  restGapLegacy,
  sequentialRest,
  timePreference,
} from "./rules.ts";

// Derived from the legacy four-pass algorithm (e.g. restGapLegacy preserves
// its buggy gap check), though the time-preference rule now uses the shared
// matrix. Kept for reference/snapshots; production runs targetRules. See
// dev/DESIGN.md §4.
export const currentRules: RuleSet = defineRuleSet({
  name: "current",
  assignmentRules: [
    qualification(0),
    maxShifts(4, 0),
    oneShiftPerDay(1),
    restGapLegacy(9, 1),
    timePreference(2),
  ],
  sortingRules: [
    fewerShiftsFirst(0),
    moreSpecializedFirstAmongSpecialists(1),
    alphabeticalByName(2),
  ],
});

// The policy production runs. Hard floor (priority 0): qualified, one
// shift per day, overnight turnaround, ≥1h rest. Relaxable layers peel off
// softest-first: time-preference (3), then max-shifts (2), then the ≥10h
// rest preference (1) down to the 1h floor. Sorting distributes work
// fairly (everyone ≥2, then fewest hours/shifts) and saves EITHER
// candidates for slots an exact-match person can't take. dev/DESIGN.md §4.
export const targetRules: RuleSet = defineRuleSet({
  name: "target",
  assignmentRules: [
    qualification(0),
    oneShiftPerDay(0),
    overnightTurnaround(0),
    sequentialRest(1, 0),
    sequentialRest(10, 1),
    maxShifts(4, 2),
    timePreference(3),
  ],
  sortingRules: [
    everyoneGetsAtLeast(2, 0),
    fewerHoursFirst(1),
    fewerShiftsFirst(2),
    preferExactTimeMatch(3),
    fewerQualsFirstAmongSpecialists(4),
  ],
});
