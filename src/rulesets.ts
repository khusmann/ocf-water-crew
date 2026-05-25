// Named rule-set compositions. The diff between currentRules and
// targetRules is exactly the policy change the rewrite ships —
// see dev/NEW_SYSTEM.md §4 for the row-by-row breakdown.
import { defineRuleSet, type RuleSet } from "./engine.ts";
import {
  alphabeticalByName,
  everyoneGetsAtLeast,
  fewerDaysFirst,
  fewerQualsFirstAmongSpecialists,
  fewerShiftsFirst,
  maxShifts,
  moreSpecializedFirstAmongSpecialists,
  oneShiftPerDay,
  preferExactTimeMatch,
  qualification,
  restGapLegacy,
  sequentialRest,
  timePreference,
} from "./rules.ts";

// Reproduces the legacy four-pass policy in the new DSL. Bug-preserving
// where the bugs fit cleanly into rule bodies (see NEW_SYSTEM.md §2.4
// for the divergences that don't).
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

// The new policy: explicit floor of qualification + ≥1h rest;
// relaxable layers for one-shift-per-day / ≥8h rest / max-shifts /
// time-preference; sorting stack that distributes work fairly and
// saves EITHER candidates for slots an exact-match person can't take.
// NEW_SYSTEM.md §3.
export const targetRules: RuleSet = defineRuleSet({
  name: "target",
  assignmentRules: [
    qualification(0),
    sequentialRest(1, 0),
    oneShiftPerDay(1),
    sequentialRest(8, 1),
    maxShifts(4, 2),
    timePreference(3),
  ],
  sortingRules: [
    everyoneGetsAtLeast(2, 0),
    fewerShiftsFirst(1),
    fewerDaysFirst(2),
    preferExactTimeMatch(3),
    fewerQualsFirstAmongSpecialists(4),
  ],
});
