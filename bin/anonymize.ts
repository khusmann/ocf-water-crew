// Reads data/thejson.json, replaces every name with a placeholder
// ("Person 001" .. "Person NNN") in stable input order, and writes
// test/fixtures/realistic.json. The output preserves the live data's
// shape (same job/day/time distribution) so the realistic fixture
// acts as a broad regression catch without committing real names.
//
// Re-run whenever the live thejson.json schema or distribution changes
// meaningfully, then re-run regen-fixtures to refresh the snapshot.
import fs from "node:fs";
import path from "node:path";
import type { Person, Assignment, SchedulerInput } from "../src/types.ts";

const inputPath = path.resolve("data/thejson.json");
const outputPath = path.resolve("test/fixtures/realistic.json");

const data: SchedulerInput = JSON.parse(fs.readFileSync(inputPath, "utf8"));

const pad = (n: number) => String(n).padStart(3, "0");
const nameOf = (p: Person) => `${p.first} ${p.last} ${p.nickname}`.trim();

// Assign placeholders in alphabetical order of original names so the
// algorithm's name-as-tiebreaker behavior is preserved: if "Person N"
// was alphabetically before "Person M" in the originals, the same will
// hold in the anonymized output. Otherwise shift counts and the
// sameDayAssigned distribution drift away from the live-data result.
const nameMap = new Map<string, string>();
nameMap.set("", "");

const placeholderByName = new Map<string, string>();
const originalsSorted = [...data.people]
  .map(nameOf)
  .filter((n) => n)
  .sort();
originalsSorted.forEach((orig, i) => {
  if (!placeholderByName.has(orig)) {
    placeholderByName.set(orig, `Person ${pad(i + 1)}`);
  }
});

const anonPeople: Person[] = data.people.map((p) => {
  const orig = nameOf(p);
  const placeholder = orig ? placeholderByName.get(orig)! : "";
  if (orig) nameMap.set(orig, placeholder);
  if (p.name) nameMap.set(p.name, placeholder);
  const [first, last] = placeholder ? placeholder.split(" ") : ["", ""];
  return {
    ...p,
    first,
    last,
    nickname: "",
    name: placeholder,
  };
});

let unmapped = 0;
const anonAssignments: Assignment[] = data.assignments.map((a) => {
  const staged = a.stagedVolunteer ?? "";
  const assigned = a.assignedVolunteer ?? "";
  if (staged && !nameMap.has(staged)) unmapped++;
  return {
    ...a,
    stagedVolunteer: nameMap.get(staged) ?? "",
    assignedVolunteer: nameMap.get(assigned) ?? "",
  };
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
