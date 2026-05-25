// Regenerates test/fixtures/expected/*.json by running the rules
// engine against every input under test/fixtures/. After a deliberate
// behavior change (e.g. a new rule, or a §2.4 divergence in
// dev/NEW_SYSTEM.md), the diff between regenerated and prior expected
// is the proof of what changed.
//
// Writes both the `current` snapshot (test/fixtures/expected/*.json)
// and the `target` snapshot (test/fixtures/expected/target/*.json).
import fs from "node:fs";
import path from "node:path";
import { assign } from "../src/engine/assign.ts";
import { parseLegacy } from "../src/engine/parseLegacy.ts";
import { mulberry32 } from "../src/engine/rng.ts";
import { currentRules } from "../src/rulesets/current.ts";
import { targetRules } from "../src/rulesets/target.ts";
import type { SchedulerInput } from "../src/types.ts";

const fixturesDir = path.resolve("test/fixtures");
const expectedDir = path.join(fixturesDir, "expected");
const targetDir = path.join(expectedDir, "target");

for (const d of [expectedDir, targetDir]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

const inputs = fs
  .readdirSync(fixturesDir, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.endsWith(".json"))
  .map((d) => d.name)
  .sort();

for (const name of inputs) {
  const data: SchedulerInput = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, name), "utf8")
  );
  const canonical = parseLegacy(data.assignments, data.people);

  const current = assign(currentRules, canonical.assignments, canonical.people);
  fs.writeFileSync(
    path.join(expectedDir, name),
    JSON.stringify(current, null, 2) + "\n"
  );

  const target = assign(
    targetRules,
    canonical.assignments,
    canonical.people,
    { rng: mulberry32(0) }
  );
  fs.writeFileSync(
    path.join(targetDir, name),
    JSON.stringify(target, null, 2) + "\n"
  );

  console.log(`wrote test/fixtures/expected/${name} (current+target)`);
}
