// The new policy: explicit floor of qualification + ≥1h rest, relaxable
// layers for one-shift-per-day / ≥8h rest / max-shifts / time-preference,
// and a sorting stack that distributes work fairly and saves EITHER
// candidates for slots an exact-match person can't take. See
// dev/NEW_SYSTEM.md §3.
import { defineRuleSet } from "../engine/defineRuleSet.ts";
import type { RuleSet } from "../engine/types.ts";
import { qualification } from "../rules/qualification.ts";
import { maxShifts4Relaxable } from "../rules/maxShifts.ts";
import { oneShiftPerDay } from "../rules/oneShiftPerDay.ts";
import { sequentialRest1h, sequentialRest8h } from "../rules/restGap.ts";
import { timePreferenceTarget } from "../rules/timePreference.ts";
import {
  everyoneGets2Shifts,
  fewerDaysFirst,
  fewerQualsFirstAmongSpecialists,
  fewerShiftsFirstTarget,
  preferExactTimeMatch,
} from "../rules/sorting.ts";

export const targetRules: RuleSet = defineRuleSet({
  name: "target",
  assignmentRules: [
    qualification,
    sequentialRest1h,
    oneShiftPerDay,
    sequentialRest8h,
    maxShifts4Relaxable,
    timePreferenceTarget,
  ],
  sortingRules: [
    everyoneGets2Shifts,
    fewerShiftsFirstTarget,
    fewerDaysFirst,
    preferExactTimeMatch,
    fewerQualsFirstAmongSpecialists,
  ],
});
