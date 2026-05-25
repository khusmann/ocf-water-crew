import type { AssignmentRule } from "../engine/types.ts";

export const oneShiftPerDay: AssignmentRule = {
  name: "one-shift-per-day",
  priority: 1,
  test: ({ slot, state }) => !state.daysWorked.has(slot.day),
};
