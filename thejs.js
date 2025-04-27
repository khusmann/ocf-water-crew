const fs = require("fs");

// 1) read in your JSON data
const data = JSON.parse(fs.readFileSync("./thejson.json", "utf8"));
const assignments = data.assignments;
const people = data.people;

//------- generate matrix ---------

const genericCompare = (a, b) => {
  if (Array.isArray(a)) {
    return genericCompare(Math.min(...a), Math.min(...b));
  } else {
    if (a === b) {
      return 0;
    } else {
      return a > b ? 1 : -1;
    }
  }
};

const priorityComparison = (keyOrder) => (a, b) => {
  for (let i = 0; i < keyOrder.length; i++) {
    const out = genericCompare(a[keyOrder[i]], b[keyOrder[i]]);
    if (out !== 0) {
      return out;
    }
  }
  return 0;
};

const test_priorityComparison = () => {
  const a = {
    a: 1,
    b: 2,
    c: 3,
  };
  const b = {
    a: 2,
    b: 1,
    c: 3,
  };
  console.log(priorityComparison(["a", "b"])(a, b) === -1);
  console.log(priorityComparison(["c", "b"])(a, b) === 1);
  console.log(priorityComparison(["c", "a"])(a, b) === -1);
};

const test_priorityComparisonArray = () => {
  const a = {
    a: [1],
    b: [2],
    c: [3],
  };
  const b = {
    a: [2],
    b: [1],
    c: [3],
  };
  console.log(priorityComparison(["a", "b"])(a, b) === -1);
  console.log(priorityComparison(["c", "b"])(a, b) === 1);
  console.log(priorityComparison(["c", "a"])(a, b) === -1);
};

test_priorityComparison();
test_priorityComparisonArray();

process.exit();

const assignmentsSorted = assignments.sort(
  priorityComparison(["jobId", "shiftStart", "timeId", "person"])
);

const peopleSorted = people
  .map((i) => ({
    ...i,
    name: `${i.first} ${i.last} ${i.nickname}`,
    shiftsPlaced: "0",
  }))
  .sort(
    priorityComparison(["SpecialQualificationIds", "timeId", "shiftsPlaced"])
  );

console.log(assignmentsSorted);

// console.log(peopleSorted);

//------- assign  ---------

// assign stages to assgin
// iterate through
