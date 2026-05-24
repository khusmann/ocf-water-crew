// Regenerates test/fixtures/expected/*.json by running the current
// assign() against every input under test/fixtures/. Use after a
// deliberate behavior change (Phase 4) so the diff to the snapshot
// suite is the proof of what changed. Phase 2 uses it once to seed
// the initial snapshots.
import fs from "node:fs";
import path from "node:path";
import { assign } from "../src/scheduler.ts";
import type { SchedulerInput } from "../src/types.ts";

const fixturesDir = path.resolve("test/fixtures");
const expectedDir = path.join(fixturesDir, "expected");

if (!fs.existsSync(expectedDir)) {
  fs.mkdirSync(expectedDir, { recursive: true });
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
  const result = assign(data.assignments, data.people);
  fs.writeFileSync(
    path.join(expectedDir, name),
    JSON.stringify(result, null, 2) + "\n"
  );
  console.log(`wrote test/fixtures/expected/${name}`);
}
