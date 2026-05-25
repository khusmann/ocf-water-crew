// Pins the legacy-shape adapter in src/scheduler.ts. The sheet's
// pushObjArrayToSheet projects each row by the existing column
// headers (legacy field names), so the adapter has to echo every
// legacy input field plus rebuild `index` and re-derive the three
// flag booleans from `brokenRules`. This test covers the round-trip
// shape; the engine-level snapshot tests cover placement correctness.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { assign } from "../src/scheduler.ts";
import type { IndexedAssignment, SchedulerInput } from "../src/types.ts";

function loadInput(name: string): SchedulerInput {
  return JSON.parse(
    fs.readFileSync(path.resolve("test/fixtures", `${name}.json`), "utf8")
  );
}

test("legacy adapter echoes every legacy input field on each row", () => {
  const input = loadInput("tiny");
  const out = assign(input.assignments, input.people);
  const legacyKeys: Array<keyof IndexedAssignment> = [
    "stagedVolunteer",
    "assignedVolunteer",
    "jobPriority",
    "jobName",
    "special",
    "day",
    "dayId",
    "shiftStart",
    "shiftStartNum",
    "hrsShift",
    "person",
    "timePriority",
    "timeCategory",
    "sameDayAssigned",
    "nonIdealShiftTaken",
    "doubleShiftTaken",
    "index",
  ];
  for (const row of out) {
    for (const k of legacyKeys) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(row, k),
        `row missing legacy key "${k}": ${JSON.stringify(row)}`
      );
    }
  }
});

test("legacy adapter maps `one-shift-per-day` → sameDayAssigned", () => {
  // same-day fixture: Person 01 staged to two day-1 slots; engine emits
  // brokenRules=["one-shift-per-day"] on the second slot.
  const input = loadInput("same-day");
  const out = assign(input.assignments, input.people);
  const dayOneSlots = out.filter((r) => r.day === 1);
  assert.equal(dayOneSlots[0].sameDayAssigned, false);
  assert.equal(dayOneSlots[1].sameDayAssigned, true);
});

test("legacy adapter maps `time-preference` → nonIdealShiftTaken", () => {
  // relaxation fixture: AM-only person placed on a PM slot at the
  // priority-1 pass; brokenRules=["time-preference"].
  const input = loadInput("relaxation");
  const out = assign(input.assignments, input.people);
  assert.equal(out[0].nonIdealShiftTaken, true);
  assert.equal(out[0].sameDayAssigned, false);
});

test("legacy adapter restarts `index` per (jobName, day) group", () => {
  // brute-force fixture has Carts slots spread across all four days.
  const input = loadInput("brute-force");
  const out = assign(input.assignments, input.people);

  const seen = new Map<string, number[]>();
  for (const row of out) {
    const k = `${row.jobName}|${row.day}`;
    const arr = seen.get(k) ?? [];
    arr.push(row.index);
    seen.set(k, arr);
  }
  for (const [group, indices] of seen) {
    assert.deepEqual(
      indices,
      indices.map((_, i) => i + 1),
      `index should be 1..N for group ${group}, got ${indices.join(",")}`
    );
  }
});

test("legacy adapter never sets doubleShiftTaken (legacy behavior)", () => {
  const input = loadInput("realistic");
  const out = assign(input.assignments, input.people);
  for (const row of out) {
    assert.equal(row.doubleShiftTaken, false);
  }
});
