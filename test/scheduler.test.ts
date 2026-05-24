// Snapshot tests pinning the current behavior of assign() against
// hand-built fixtures. Each fixture targets one or two code paths so
// a regression fails a named test instead of an opaque whole-output
// diff.
//
// Snapshots include the documented bugs in dev/CURRENT.md §6 as-is.
// Phase 4 will deliberately flip these and the diff against these
// expected files is the proof of what the rewrite changed.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { assign } from "../src/scheduler.ts";
import type { IndexedAssignment, SchedulerInput } from "../src/types.ts";

const fixturesDir = path.resolve("test/fixtures");
const expectedDir = path.join(fixturesDir, "expected");

function loadInput(name: string): SchedulerInput {
  return JSON.parse(
    fs.readFileSync(path.join(fixturesDir, `${name}.json`), "utf8")
  );
}

function loadExpected(name: string): IndexedAssignment[] {
  return JSON.parse(
    fs.readFileSync(path.join(expectedDir, `${name}.json`), "utf8")
  );
}

function runFixture(name: string): void {
  const input = loadInput(name);
  const expected = loadExpected(name);
  const actual = assign(input.assignments, input.people);
  assert.deepEqual(actual, expected);
}

// All pre-staged; main loop does nothing. Verifies the pre-stage copy
// path writes assignedVolunteer and the final sort order.
test("tiny: pre-stage copy of all slots", () => {
  runFixture("tiny");
});

// Exercises the line-218 bucket-duplication trick: the one specialist
// is pushed into the general-jobs bucket so they can be considered for
// both specialty and general slots. CURRENT.md §5c, §6.11.
test("special-jobs: specialist + general via bucket-duplication", () => {
  runFixture("special-jobs");
});

// Pre-stages the same person to two day-1 slots and one day-2 slot.
// Slot 2 should have sameDayAssigned=true (Person 01 already worked
// day 1 once); the day-2 slot should not. Tests the dayId prime
// mechanic in the pre-stage path. CURRENT.md §5b, §5d.
test("same-day: sameDayAssigned flag set on same-day pre-stage", () => {
  runFixture("same-day");
});

// Pre-stages a Day-1 22:00 shift, then leaves a Day-2 06:00 open
// slot (8 hours after — under the documented 9-hour rest gap). The
// snapshot shows the open slot gets filled at level 0 anyway,
// pinning two documented bugs together: pre-stages don't push to
// assignedHours (CURRENT.md §6.5) AND the initial [0] in
// assignedHours makes the some(>9) check trivially pass for any
// real shift (CURRENT.md §5e). Phase 4 will fix both and the
// snapshot will flip.
test("rest-gap: 9-hour gap not enforced (documented bug)", () => {
  runFixture("rest-gap");
});

// One AM-only person, one PM slot. Level 0 (strict time-pref) finds
// no match; level 1 (drop time-pref) places them. Note: the
// nonIdealShiftTaken flag stays false because of the inverted
// detection condition (CURRENT.md §6.6 / §5e). Phase 4 will fix
// the detection and this snapshot will flip.
test("relaxation: level-1 placement when level-0 has no time-pref fit", () => {
  runFixture("relaxation");
});

// Engineered so the main loop fills everything it can reach but
// leaves one general slot empty (Person 02, qualified, is only in
// the specialty bucket and never duplicated into the general
// bucket by the line-218 trick because they are not at index 0 of
// their specialty bucket). The brute-force gap-fill pass (§5f)
// iterates the full flat list and finds them.
test("brute-force: gap-fill places a candidate the main loop missed", () => {
  runFixture("brute-force");
});

// Person 01 has timePreference "PM, AM" with no timeId — the
// sheet-side mapping doesn't produce one for that permutation
// (CURRENT.md §6.10). genericCompare sorts undefined as worst,
// so Person 01 is deprioritized; the snapshot pins this current
// behavior. Phase 4 will fix the upstream mapping or handle
// undefined explicitly.
test("time-pref-permutation: undefined timeId sorts worst", () => {
  runFixture("time-pref-permutation");
});

// Broad regression catch: same shape as the live data/thejson.json
// (127 people, 416 slots, same job/day/time distribution) with
// placeholder names assigned in alphabetical order of the originals
// so the name-as-tiebreaker behavior matches production. Anchors
// any subtle output drift the small fixtures might miss.
test("realistic: anonymized full-size dataset", () => {
  runFixture("realistic");
});
