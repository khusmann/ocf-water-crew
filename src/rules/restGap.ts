// Two flavors of rest-gap rule. The legacy one mirrors the buggy
// `.some(... > 9)` + [0] sentinel start-to-start check (preserved for
// `current`). The end-to-start sequential rules encode the intent and
// power `target`'s priority-0 floor and priority-1 layer. See
// dev/NEW_SYSTEM.md §2.1 and §3.1.
import type { AssignmentRule } from "../engine/types.ts";

export const restGap9hLegacy: AssignmentRule = {
  name: "rest-gap-9h-legacy",
  priority: 1,
  test: ({ slot, state }) => {
    const slotStart = 24 * slot.day + slot.startHour;
    const hours = [0, ...state.assignedShifts.map((s) => s.absoluteStartHour)];
    return hours.some((h) => Math.abs(slotStart - h) > 9);
  },
};

export const sequentialRest1h: AssignmentRule = {
  name: "sequential-rest-1h",
  priority: 0,
  test: ({ slot, state }) => {
    const slotStart = 24 * slot.day + slot.startHour;
    const slotEnd = slotStart + slot.durationHours;
    return state.assignedShifts.every((s) => {
      const sEnd = s.absoluteStartHour + s.durationHours;
      return slotStart - sEnd >= 1 || s.absoluteStartHour - slotEnd >= 1;
    });
  },
};

export const sequentialRest8h: AssignmentRule = {
  name: "sequential-rest-8h",
  priority: 1,
  test: ({ slot, state }) => {
    const slotStart = 24 * slot.day + slot.startHour;
    const slotEnd = slotStart + slot.durationHours;
    return state.assignedShifts.every((s) => {
      const sEnd = s.absoluteStartHour + s.durationHours;
      return slotStart - sEnd >= 8 || s.absoluteStartHour - slotEnd >= 8;
    });
  },
};
