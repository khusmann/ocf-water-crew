import fs from "fs";
import { priorityComparison } from "./util.mjs";

// 1) read in your JSON data
const data = JSON.parse(fs.readFileSync("./thejson.json", "utf8"));
const assignments = data.assignments;
const people = data.people;

//------- generate matrix ---------

const assignmentsSorted = assignments.sort(
  priorityComparison(["jobId", "shiftStart", "timeId", "person"])
);

const peopleSorted = people
  .map((i) => ({
    ...i,
    name: `${i.first} ${i.last} ${i.nickname}`,
    shiftsPlaced: 0,
  }))
  .sort(
    priorityComparison(["specialQualificationsIds", "timeId", "shiftsPlaced"])
  );

console.log(assignmentsSorted);

console.log(peopleSorted);

// console.log(peopleSorted);

//------- assign  ---------

// assign stages to assgin
// iterate through
