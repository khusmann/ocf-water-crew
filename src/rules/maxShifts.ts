// Per-person cap of 4 shifts. Floor priority in `current`; demoted to
// priority 2 (relaxable) in `target` — see dev/NEW_SYSTEM.md §3.1.
import type { AssignmentRule } from "../engine/types.ts";

export const maxShifts4Floor: AssignmentRule = {
  name: "max-shifts-4",
  priority: 0,
  test: ({ state }) => state.shiftsPlaced < 4,
};

export const maxShifts4Relaxable: AssignmentRule = {
  name: "max-shifts-4",
  priority: 2,
  test: ({ state }) => state.shiftsPlaced < 4,
};
