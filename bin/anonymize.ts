// Reads a canonical engine dump from data/thejson.json, replaces every
// volunteer name with a placeholder ("Person 001" .. "Person NNN") in
// stable alphabetical order, and writes test/fixtures/realistic.json. The
// output preserves the live data's shape (same job/day/time distribution)
// so the realistic fixture acts as a broad regression catch without
// committing real names.
//
// Re-run whenever the live data distribution changes meaningfully (produce
// a fresh canonical data/thejson.json from the sheet's Debug tab first),
// then re-run regen-fixtures to refresh the snapshot.
import fs from "node:fs";
import path from "node:path";
import type { Assignment, Person } from "../src/engine.ts";

type EngineInput = { people: Person[]; assignments: Assignment[] };

const inputPath = path.resolve("data/thejson.json");
const outputPath = path.resolve("test/fixtures/realistic.json");

const data: EngineInput = JSON.parse(fs.readFileSync(inputPath, "utf8"));

const pad = (n: number) => String(n).padStart(3, "0");

// Assign placeholders in alphabetical order of original names so the
// `current` rule set's alphabetical-by-name tiebreak yields the same
// placements it would on the live data; otherwise the realistic snapshot
// drifts from the live-data result.
const nameMap = new Map<string, string>();
nameMap.set("", "");

const placeholderByName = new Map<string, string>();
const originalsSorted = [...data.people]
  .map((p) => p.name)
  .filter((n) => n)
  .sort();
originalsSorted.forEach((orig, i) => {
  if (!placeholderByName.has(orig)) {
    placeholderByName.set(orig, `Person ${pad(i + 1)}`);
  }
});

const anonPeople: Person[] = data.people.map((p) => {
  const placeholder = p.name ? placeholderByName.get(p.name)! : "";
  if (p.name) nameMap.set(p.name, placeholder);
  return { ...p, name: placeholder };
});

let unmapped = 0;
const anonAssignments: Assignment[] = data.assignments.map((a) => {
  const staged = a.stagedVolunteer ?? "";
  if (staged && !nameMap.has(staged)) unmapped++;
  return { ...a, stagedVolunteer: nameMap.get(staged) ?? "" };
});

fs.writeFileSync(
  outputPath,
  JSON.stringify({ people: anonPeople, assignments: anonAssignments }, null, 2) +
    "\n"
);

console.log(
  `wrote ${outputPath}: ${anonPeople.length} people, ${anonAssignments.length} assignments`
);
if (unmapped > 0) {
  console.log(
    `  warning: ${unmapped} stagedVolunteer name(s) had no matching person; cleared to ""`
  );
}
