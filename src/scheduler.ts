// Thin driver over the rules engine. The legacy four-pass /
// constraint-restriction-level machinery is gone; assign() parses
// legacy inputs to canonical types, runs the engine with the
// current-rules rule set, and re-projects the canonical output back
// into the legacy IndexedAssignment shape so the existing
// sheet.ts → pushObjArrayToSheet path still writes meaningful columns.
//
// The canonical-shape consumers (tests, regen-fixtures) call
// runEngine() in src/engine.ts directly — they don't go through this
// adapter. Once src/sheet.ts is rewritten to consume canonical
// types directly (META_PLAN migration step 2), this driver collapses
// to a one-liner and the legacy types can be deleted.
import { orderCodes, parseLegacy, runEngine } from "./engine.ts";
import { currentRules } from "./rulesets.ts";
import type { Assignment, IndexedAssignment, Person } from "./types.ts";

export function assign(
  assignments: Assignment[],
  people: Person[]
): IndexedAssignment[] {
  const canonical = parseLegacy(assignments, people);
  const placed = runEngine(currentRules, canonical.assignments, canonical.people);

  // Sort the legacy inputs by the engine's iteration order so they
  // line up index-for-index with `placed`. Stable JS sort preserves
  // input order for ties beyond these keys.
  const sortedLegacy = [...assignments].sort((a, b) => {
    if (a.jobPriority !== b.jobPriority) return a.jobPriority - b.jobPriority;
    if (a.day !== b.day) return a.day - b.day;
    if (a.shiftStartNum !== b.shiftStartNum) return a.shiftStartNum - b.shiftStartNum;
    if (a.jobName !== b.jobName) return a.jobName < b.jobName ? -1 : 1;
    return 0;
  });

  const out: IndexedAssignment[] = [];
  let lastGroupKey = "";
  let groupIndex = 0;
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    const l = sortedLegacy[i];
    const key = `${l.jobName}|${l.day}`;
    groupIndex = key === lastGroupKey ? groupIndex + 1 : 1;
    lastGroupKey = key;
    out.push({
      ...l,
      index: groupIndex,
      assignedVolunteer: p.assignedVolunteer,
      sameDayAssigned: p.brokenRules.includes("one-shift-per-day"),
      nonIdealShiftTaken: p.brokenRules.includes("time-preference"),
      doubleShiftTaken: false,
      codes: orderCodes(new Set(p.brokenCodes)).join(""),
    });
  }
  return out;
}
