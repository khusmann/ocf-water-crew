// Local runner: reads a canonical engine dump from data/thejson.json,
// runs the current rule set, writes the placements to
// data/theresultjson.json. The input must be in canonical shape — produce
// one from the live sheet via the Debug tab dump (getVolunteers /
// readAssignmentSlots both emit canonical JSON there).
import fs from "node:fs";
import path from "node:path";
import { runEngine, type Assignment, type Person } from "../src/engine.ts";
import { currentRules } from "../src/rulesets.ts";

type EngineInput = { people: Person[]; assignments: Assignment[] };

const inputPath = path.resolve("data/thejson.json");
const outputPath = path.resolve("data/theresultjson.json");

const data: EngineInput = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const placed = runEngine(currentRules, data.assignments, data.people);

fs.writeFileSync(outputPath, JSON.stringify(placed, null, 2));
