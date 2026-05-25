// Reproduces the policy of the legacy four-pass scheduler against the
// canonical engine. See dev/NEW_SYSTEM.md §2 for the worked tables and
// §2.4 for the enumerated snapshot divergences.
import { defineRuleSet } from "../engine/defineRuleSet.ts";
import type { RuleSet } from "../engine/types.ts";
import { qualification } from "../rules/qualification.ts";
import { maxShifts4Floor } from "../rules/maxShifts.ts";
import { oneShiftPerDay } from "../rules/oneShiftPerDay.ts";
import { restGap9hLegacy } from "../rules/restGap.ts";
import { timePreferenceCurrent } from "../rules/timePreference.ts";
import {
  alphabeticalByName,
  fewerShiftsFirstCurrent,
  moreSpecializedFirstAmongSpecialists,
} from "../rules/sorting.ts";

export const currentRules: RuleSet = defineRuleSet({
  name: "current",
  assignmentRules: [
    qualification,
    maxShifts4Floor,
    oneShiftPerDay,
    restGap9hLegacy,
    timePreferenceCurrent,
  ],
  sortingRules: [
    fewerShiftsFirstCurrent,
    moreSpecializedFirstAmongSpecialists,
    alphabeticalByName,
  ],
});
