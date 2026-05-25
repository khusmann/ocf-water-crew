// Floor rule shared by both rule sets. A "general" job (no
// requiredQualification) passes for every candidate via short-circuit;
// a "special" job requires the person to hold the matching id.
import type { AssignmentRule } from "../engine/types.ts";

export const qualification: AssignmentRule = {
  name: "qualification",
  priority: 0,
  test: ({ slot, person }) =>
    !slot.requiredQualification ||
    person.qualifications.includes(slot.requiredQualification),
};
