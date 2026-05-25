// Priority differs between the rule sets: 2 in `current`, 3 in `target`.
// See dev/NEW_SYSTEM.md §2.1 and §3.1.
import type { AssignmentRule } from "../engine/types.ts";

const test: AssignmentRule["test"] = ({ slot, person }) =>
  slot.timeWindow === person.timePreference ||
  person.timePreference === "EITHER" ||
  slot.timeWindow === "EITHER";

export const timePreferenceCurrent: AssignmentRule = {
  name: "time-preference",
  priority: 2,
  test,
};

export const timePreferenceTarget: AssignmentRule = {
  name: "time-preference",
  priority: 3,
  test,
};
