import fs from "node:fs";
import path from "node:path";
import { assign } from "../src/scheduler.ts";
import type { SchedulerInput } from "../src/types.ts";

const inputPath = path.resolve("data/thejson.json");
const outputPath = path.resolve("data/theresultjson.json");

const data: SchedulerInput = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const newAssignments = assign(data.assignments, data.people);

fs.writeFileSync(outputPath, JSON.stringify(newAssignments, null, 2));
