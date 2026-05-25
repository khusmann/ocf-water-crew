// Thin driver over the rules engine. The legacy four-pass /
// constraint-restriction-level machinery is gone; assign() now
// parses legacy inputs to canonical types and delegates to the
// engine with the current-rules rule set.
//
// Migration plan (dev/META_PLAN.md): once src/sheet.ts is rewritten
// to emit canonical shapes directly, parseLegacy at the boundary
// goes away and the legacy types in src/types.ts can be dropped.
import { assign as engineAssign } from "./engine/assign.ts";
import { parseLegacy } from "./engine/parseLegacy.ts";
import type { PlacedAssignment } from "./engine/types.ts";
import { currentRules } from "./rulesets/current.ts";
import type { Assignment, Person } from "./types.ts";

export function assign(
  assignments: Assignment[],
  people: Person[]
): PlacedAssignment[] {
  const canonical = parseLegacy(assignments, people);
  return engineAssign(currentRules, canonical.assignments, canonical.people);
}
