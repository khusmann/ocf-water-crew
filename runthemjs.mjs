import fs from "fs";
import assign from "./themjs.mjs";

const runAssign = () => {
  const data = JSON.parse(fs.readFileSync("./data/thejson.json", "utf8"));
  const assignments = data.assignments;
  const people = data.people;

  const newAssignments = assign(assignments, people);

  fs.writeFileSync(
    "data/theresultjson.json",
    JSON.stringify(newAssignments, null, 2)
  );
};

runAssign();
