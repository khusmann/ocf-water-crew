// Snapshot tests pinning the current-rule-set behavior of the canonical
// engine against hand-built fixtures. Each fixture targets one or two
// code paths so a regression fails a named test instead of an opaque
// whole-output diff.
//
// Inputs in test/fixtures/*.json are still in the legacy shape — the
// engine's parseLegacy bridges them. Once src/sheet.ts is rewritten to
// emit canonical types directly, the fixtures move to canonical shape
// too and parseLegacy is deleted.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runEngine } from "../src/engine/runEngine.ts";
import { parseLegacy } from "../src/engine/parseLegacy.ts";
import type { PlacedAssignment } from "../src/engine/types.ts";
import { currentRules } from "../src/rulesets/current.ts";
import type { SchedulerInput } from "../src/types.ts";

const fixturesDir = path.resolve("test/fixtures");
const expectedDir = path.join(fixturesDir, "expected");

function loadInput(name: string): SchedulerInput {
  return JSON.parse(
    fs.readFileSync(path.join(fixturesDir, `${name}.json`), "utf8")
  );
}

function loadExpected(name: string): PlacedAssignment[] {
  return JSON.parse(
    fs.readFileSync(path.join(expectedDir, `${name}.json`), "utf8")
  );
}

function runFixture(name: string): void {
  const input = loadInput(name);
  const canonical = parseLegacy(input.assignments, input.people);
  const actual = runEngine(currentRules, canonical.assignments, canonical.people);
  const expected = loadExpected(name);
  assert.deepEqual(actual, expected);
}

// All pre-staged; placement pass does nothing for these slots.
test("tiny: pre-stage copy of all slots", () => runFixture("tiny"));

// Specialist eligible for both their specialty job and any general job —
// no special bucket-duplication needed (META_PLAN: short-circuit on
// qualification rule). See dev/NEW_SYSTEM.md §2.4.
test("special-jobs: specialist also fills a general slot", () =>
  runFixture("special-jobs"));

// Pre-stages the same person to two day-1 slots and one day-2 slot.
// Second day-1 slot picks up "one-shift-per-day" in brokenRules —
// the new shape of the legacy `sameDayAssigned` flag (§2.4).
test("same-day: same-day staging surfaces in brokenRules", () =>
  runFixture("same-day"));

// Pins the legacy `.some(... > 9)` + [0] sentinel quirk via
// rest-gap-9h-legacy. Open slot still gets filled at the floor because
// the sentinel makes the check trivially pass — same outcome as legacy,
// new representation of "no brokenRules".
test("rest-gap: legacy-quirk gap rule still admits the placement", () =>
  runFixture("rest-gap"));

// AM-only person, PM slot. Time-preference rule (priority 2) drops on
// pass 2; placement records "time-preference" in brokenRules.
test("relaxation: time-preference relaxation surfaces in brokenRules", () =>
  runFixture("relaxation"));

// Brute-force fixture (legacy). Under the canonical engine, every
// qualified specialist competes for general slots (META_PLAN
// qualification decision), so the legacy bucket-duplication blind spot
// goes away. See dev/NEW_SYSTEM.md §2.4 "Bucket-duplication trick".
test("brute-force: candidate-pool reshuffle (§2.4)", () =>
  runFixture("brute-force"));

// Person 01 had timePreference "PM, AM" with no legacy `timeId`; the
// canonical parser folds both "PM, AM" and "AM, PM" into "EITHER",
// removing the deprioritization. See dev/NEW_SYSTEM.md §2.4 "PM, AM".
test("time-pref-permutation: PM,AM no longer sorts worst (§2.4)", () =>
  runFixture("time-pref-permutation"));

// Broad regression catch — same shape as the live data/thejson.json.
test("realistic: anonymized full-size dataset", () =>
  runFixture("realistic"));
