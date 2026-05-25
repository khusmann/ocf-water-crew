// People-sorting rules. Priority numbers shift between `current` and
// `target`; see dev/NEW_SYSTEM.md §2.2 and §3.2. The two specialty-count
// variants share the legacy "guard if either has 0 quals" — without it,
// a specialist beats every non-specialist on every general-job tiebreak.
import type { SortingRule } from "../engine/types.ts";

// `current`: priority 0. `target`: priority 1.
export const fewerShiftsFirstCurrent: SortingRule = {
  name: "fewer-shifts-first",
  priority: 0,
  compare: (a, b, { stateOf }) =>
    stateOf(a).shiftsPlaced - stateOf(b).shiftsPlaced,
};

export const fewerShiftsFirstTarget: SortingRule = {
  name: "fewer-shifts-first",
  priority: 1,
  compare: (a, b, { stateOf }) =>
    stateOf(a).shiftsPlaced - stateOf(b).shiftsPlaced,
};

export const moreSpecializedFirstAmongSpecialists: SortingRule = {
  name: "more-specialized-first-among-specialists",
  priority: 1,
  compare: (a, b) => {
    const aN = a.qualifications.length;
    const bN = b.qualifications.length;
    if (aN === 0 || bN === 0) return 0;
    return bN - aN;
  },
};

export const fewerQualsFirstAmongSpecialists: SortingRule = {
  name: "fewer-quals-first-among-specialists",
  priority: 4,
  compare: (a, b) => {
    const aN = a.qualifications.length;
    const bN = b.qualifications.length;
    if (aN === 0 || bN === 0) return 0;
    return aN - bN;
  },
};

// Used only by `current` — the explicit by-name tiebreaker that pins
// Phase-2 fixture reproduction (see dev/META_PLAN.md "note on Phase-2
// fixture reproduction").
export const alphabeticalByName: SortingRule = {
  name: "alphabetical-by-name",
  priority: 2,
  compare: (a, b) => a.name.localeCompare(b.name),
};

// `target`-only sorting rules.

export const everyoneGets2Shifts: SortingRule = {
  name: "everyone-gets-2-shifts",
  priority: 0,
  compare: (a, b, { stateOf }) => {
    const aBucket = stateOf(a).shiftsPlaced < 2 ? 0 : 1;
    const bBucket = stateOf(b).shiftsPlaced < 2 ? 0 : 1;
    return aBucket - bBucket;
  },
};

export const fewerDaysFirst: SortingRule = {
  name: "fewer-days-first",
  priority: 2,
  compare: (a, b, { stateOf }) =>
    stateOf(a).daysWorked.size - stateOf(b).daysWorked.size,
};

// Exact slot match wins, then EITHER, then opposite-window last. Keeps
// EITHER candidates for slots an exact-match person can't take.
export const preferExactTimeMatch: SortingRule = {
  name: "prefer-exact-time-match",
  priority: 3,
  compare: (a, b, { slot }) => {
    const rank = (pref: typeof a.timePreference) =>
      pref === slot.timeWindow ? 0 : pref === "EITHER" ? 1 : 2;
    return rank(a.timePreference) - rank(b.timePreference);
  },
};
