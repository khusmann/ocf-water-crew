// Parallel snapshot suite for the `target` rule set. Same fixtures as
// test/scheduler.test.ts, but the engine is driven by targetRules and a
// seeded RNG (mulberry32(0)) so the snapshots stay deterministic. The
// behavioral diff between these snapshots and the `current` ones in
// test/fixtures/expected/ is exactly the policy change the rewrite
// ships — see dev/NEW_SYSTEM.md §4 for the row-by-row breakdown.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  mulberry32,
  parseLegacy,
  runEngine,
  type PlacedAssignment,
} from "../src/engine.ts";
import { targetRules } from "../src/rulesets.ts";
import type { SchedulerInput } from "../src/types.ts";

const fixturesDir = path.resolve("test/fixtures");
const expectedDir = path.join(fixturesDir, "expected", "target");

function runFixture(name: string): void {
  const input: SchedulerInput = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, `${name}.json`), "utf8")
  );
  const canonical = parseLegacy(input.assignments, input.people);
  const actual = runEngine(
    targetRules,
    canonical.assignments,
    canonical.people,
    { rng: mulberry32(0) }
  );
  const expected: PlacedAssignment[] = JSON.parse(
    fs.readFileSync(path.join(expectedDir, `${name}.json`), "utf8")
  );
  assert.deepEqual(actual, expected);
}

test("target/tiny", () => runFixture("tiny"));
test("target/special-jobs", () => runFixture("special-jobs"));
test("target/same-day", () => runFixture("same-day"));
test("target/rest-gap", () => runFixture("rest-gap"));
test("target/relaxation", () => runFixture("relaxation"));
test("target/brute-force", () => runFixture("brute-force"));
test("target/time-pref-permutation", () => runFixture("time-pref-permutation"));
test("target/realistic", () => runFixture("realistic"));
