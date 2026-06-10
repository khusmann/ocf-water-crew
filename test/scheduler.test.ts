// Snapshot tests pinning the current-rule-set behavior of the canonical
// engine against hand-built fixtures. Each fixture targets one or two
// code paths so a regression fails a named test instead of an opaque
// whole-output diff.
//
// Inputs in test/fixtures/*.json are canonical engine shapes, fed
// straight to runEngine.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  runEngine,
  type Assignment,
  type PlacedAssignment,
  type Person,
} from "../src/engine.ts";
import { currentRules } from "../src/rulesets.ts";

type EngineInput = { people: Person[]; assignments: Assignment[] };

const fixturesDir = path.resolve("test/fixtures");
const expectedDir = path.join(fixturesDir, "expected");

function loadInput(name: string): EngineInput {
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
  const actual = runEngine(currentRules, input.assignments, input.people);
  const expected = loadExpected(name);
  assert.deepEqual(actual, expected);
}

// All pre-staged; placement pass does nothing for these slots.
test("tiny: pre-stage copy of all slots", () => runFixture("tiny"));

// Specialist eligible for both their specialty job and any general job —
// the qualification rule short-circuits for general jobs, so no special
// bucket handling is needed.
test("special-jobs: specialist also fills a general slot", () =>
  runFixture("special-jobs"));

// Pre-stages the same person to two day-1 slots and one day-2 slot.
// Second day-1 slot picks up "one-shift-per-day" in brokenRules.
test("same-day: same-day staging surfaces in brokenRules", () =>
  runFixture("same-day"));

// Pins the legacy `.some(... > 9)` + [0] sentinel quirk via
// rest-gap-9h-legacy. Open slot still gets filled at the floor because
// the sentinel makes the check trivially pass — same outcome as legacy,
// new representation of "no brokenRules".
test("rest-gap: legacy-quirk gap rule still admits the placement", () =>
  runFixture("rest-gap"));

// AM-only person on an EVENING slot — incompatible per the time-preference
// matrix. The rule (priority 2 in currentRules) drops on relaxation;
// placement records "time-preference" in brokenRules.
test("relaxation: time-preference relaxation surfaces in brokenRules", () =>
  runFixture("relaxation"));

// Every qualified specialist competes for general slots (the qualification
// rule passes for everyone on general jobs), so there's no bucket blind
// spot — specialists can land general slots.
test("brute-force: candidate-pool reshuffle", () =>
  runFixture("brute-force"));

// EITHER-preference people compete on equal footing (no legacy
// deprioritization of the old "PM, AM" permutation).
test("time-pref-permutation: EITHER preference sorts normally", () =>
  runFixture("time-pref-permutation"));

// Two jobs sharing a priority. Under currentRules (no rng) the fill order
// is the deterministic compareSlots order, so this is a stable baseline;
// the target suite drives the same fixture with rng to exercise the §4.6
// equal-priority shuffle.
test("priority-tie: equal-priority jobs fill in deterministic order (no rng)", () =>
  runFixture("priority-tie"));

// Broad regression catch — same shape as the live data/thejson.json.
test("realistic: anonymized full-size dataset", () =>
  runFixture("realistic"));
