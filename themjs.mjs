const genericCompare = (a, b) => {
  // if (a === undefined || b === undefined) {
  //   throw new Error("value is undefined"+" " + a + b);
  // }

  const valueA = Array.isArray(a) ? Math.min(...a) : a;
  const valueB = Array.isArray(b) ? Math.min(...b) : b;

  if (valueA === valueB) {
    return 0;
  }

  if (valueA === undefined || Number.isNaN(valueA) || valueA === Infinity) {
    return 2;
  }

  if (valueB === undefined || Number.isNaN(valueB) || valueB === Infinity) {
    return -2;
  }

  return valueA > valueB ? 1 : -1;
};

const priorityComparison = (keyOrder) => (a, b) => {
  for (const key of keyOrder) {
    const result = genericCompare(a[key], b[key]);
    if (result !== 0) {
      return result;
    }
  }
  return 0;
};

const personComparison = (shiftsChart, dayWanted) => (a, b) => {
  // const priorityObject = ["shiftsPlaced", "daysWorked", "timePriority"];
  const aShift = shiftsChart.find((person) => person.name == a.name)
  const bShift = shiftsChart.find((person) => person.name == b.name)
  let result = aShift.shiftsPlaced - bShift.shiftsPlaced;
  if(result == 0){
    if(aShift.daysWorked != bShift.daysWorked){
      if(aShift.daysWorked == 1 || aShift.daysWorked % dayWanted != 0 ){
        result = 1;
      }
      if(bShift.daysWorked == 1 || bShift.daysWorked % dayWanted != 0){
        result = -1
      }
    }
    result = genericCompare(a.timePriority, b.timePriority);
    if(result == 0 && a.specialQualsNumber && b.specialQualsNumber){
      result = genericCompare(a.specialQualsNumber, b.specialQualsNumber)*-1;
    }
  }
  return result;
  // return result;
  // return genericCompare(a.timePriority, b.timePriority) !== 0 ? genericCompare(a.timePriority, b.timePriority) : genericCompare(aShift.daysWorked, bShift.daysWorked) !== 0 ? genericCompare(aShift.daysWorked, bShift.daysWorked)*-1 : genericCompare(aShift.shiftsPlaced, bShift.shiftsPlaced) !== 0 ? genericCompare(aShift.shiftsPlaced, bShift.shiftsPlaced)*-1 : 0;
}

function distributeSort(arr, key) {
  const grouped = arr.reduce((acc, obj) => {
    acc[obj[key]] = acc[obj[key]] || [];
    acc[obj[key]].push(obj);
    return acc;
  }, {});

  const sortedKeys = Object.keys(grouped).sort((a, b) => a - b);
  const result = [];

  let i = 0;
  while (result.length < arr.length) {
    for (const k of sortedKeys) {
      if (grouped[k].length > 0) {
        result.push(grouped[k].shift()); // Take one at a time from each group
      }
    }
  }

  return result;
}

function splitByProperty(arr, property) {
  return Object.values(
    arr.reduce((acc, obj) => {
      let key = obj[property];
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(obj);
      return acc;
    }, {})
  );
}

// function expandObjects(arr, key) {
//     return arr.flatMap(obj =>
//         Array.isArray(obj[key])
//             ? obj[key].map(value => ({name: obj.name, specialQualifications: obj.specialQualifications, [key]: [value], timeId: obj.timeId, [key]: value }))
//             : [obj] //
//     );
// }

function expandObjects(arr, key) {
  return arr.flatMap((obj) =>
    Array.isArray(obj[key])
      ? obj[key].length > 0
        ? obj[key].map((value) => ({
            ...obj,
            // name: obj.name,
            // specialQualifications: obj.specialQualifications,
            // special: obj.special,
            [key]: value,
            // timeId: obj.timeId
          }))
        : [
            {
              ...obj,
              // name: obj.name,
              // specialQualifications: obj.specialQualifications,
              [key]: undefined, // should rly inserts `undefined` but w/e
              // timeId: obj.timeId
            },
          ]
      : [obj]
  );
}

//add full name or id
function sortPeople(people) {
  return people
    .map((i) => ({
      ...i,
      nonIdealShiftTaken: false,
      doubleShiftTaken: false,
      sameDayAssigned: false,
      name: `${i.first} ${i.last} ${i.nickname}`.trim(), // some people dont have last last needs to be '' i think.
      specialQualsNumber: i.specialQualificationsIds.length,
    }))
    .sort(priorityComparison(["specialQualificationsIds", "timeId"]));
}

function sortAssignments(assignments) {
  let unsorted = assignments
    .sort(priorityComparison(["jobPriority", "timePriority", "day", "person"]))
    .map((i, index) => ({
      index: index + 1,
      ...i,
      nonIdealShiftTaken: false,
      doubleShiftTaken: false,
      sameDayAssigned: false,
    }));

  let groupShiftIds = 1;
  for (let i = 1; i < unsorted.length; i++) {
    if (unsorted[i] !== undefined) {
      if (
        unsorted[i].day != unsorted[i - 1].day ||
        unsorted[i].person <= unsorted[i - 1].person
      ) {
        groupShiftIds = 1;
        unsorted[i].index = groupShiftIds;
        groupShiftIds++;
      } else {
        unsorted[i].index = groupShiftIds;
        groupShiftIds++;
      }
    }
  }
  return unsorted;
}

//------- clear staged ---------

// function clear(assignmentsSorted, shiftsPlacedChart) {
//   let cleared = assignmentsSorted.map(function (assignment) {
//     let volunteerAssignment = {
//       ...assignment,
//       stagedVolunteer: "",
//     };
//     shiftsPlacedChart.forEach((i) => (i.shiftsPlaced = 0) /*effect */);
//     return volunteerAssignment;
//   });
//   return cleared;
// }

//------- assign  ---------

//problem with assign rightnow is that names are sorted alphabetically and not randomly, so same people that fill a job qualification will always get it and people with lower lexical order will not.
//good fix idea is just in the order we found it on the sheet which is presumably the the date they got on there.
//another good idea is to make a date-time submittedInquiryTime and we make it first come first serve and sort by that instead of name
function assign(assignments, people) {
  //start parameter set up
  const numberShiftsNeeded = 4;
  const peopleSorted = sortPeople(people);

  const assignmentsSorted = sortAssignments(assignments);
  const shiftsPlacedChart = peopleSorted
    .sort(priorityComparison(["specialQualificationsIds", "timeId", "name"]))
    .map((i) => ({ name: i.name, shiftsPlaced: 0, daysWorked: 1, assignedHours: [0] }));
  const shiftsSorted = expandObjects(
    peopleSorted,
    "specialQualificationsIds"
  ).sort(priorityComparison(["specialQualificationsIds", "timeId", "name"]));

  let uniqueValues = new Set(
    assignments.map((item) => (item.special == false ? -1 : item.jobPriority))
  );
  uniqueValues.delete(-1);
  const specialJobsAmount = uniqueValues.size;

  // console.log(assignmentsSorted);
  // console.log(peopleSorted.slice(69));
  // console.log(shiftsPlacedChart);

  //contains effects -- i.e. adds one to the shiftsPlaced field of the shiftsSorted entity whose name or id (edit this) matches assigned volunteer
  let peopleToAssign = splitByProperty(
    shiftsSorted,
    "specialQualificationsIds"
  )
  peopleToAssign.forEach(arr => arr.forEach((person, index) => index < specialJobsAmount ? peopleToAssign[specialJobsAmount].push(person) : person));

  //.map(peopleByjobCategory => Heap.heapify(peopleByjobCategory, personComparison()).toArray());
  //end setup

  // start copy staged area to assigned
  let unstagedAssignments = splitByProperty(
    assignmentsSorted.map(function (assignment) {
      let volunteerAssignment = {
        ...assignment,
        assignedVolunteer: assignment.stagedVolunteer,
      };
      let assignedPerson = shiftsPlacedChart.find(
        (person) => person.name === volunteerAssignment.assignedVolunteer
      );
      if (assignedPerson) {
        /*effect */ assignedPerson.shiftsPlaced++;
        if(assignedPerson.daysWorked % assignment.dayId == 0 ){
          // assignedPerson.sameDayAssigned = true;
        volunteerAssignment.sameDayAssigned = true;
        }
        /*effect */ assignedPerson.daysWorked =
          assignedPerson.daysWorked * volunteerAssignment.dayId;

      }
      return volunteerAssignment;
    }),
    "jobPriority"
  );
  // end

  //start placing assignments
  for (
    let constraintRestrictionLevel = 0;
    constraintRestrictionLevel < 4;
    constraintRestrictionLevel++
  ) {
    //edge case of night before morning after double thing; should just check if start time is within X hours. or define a shift sequence for each sequence and check if they are sequential. make sure to make sequence not sequential for each job if there is a rest period between them.//constraintRestrictionLevel = 0 -> only recommended positions allowed; 1 -> differing timePriority allowed; 2 -> differing timePriotity allowed AND Same day shifts allowed; 3->differing timePriority and same day shift AND more than 4 shifts allowed.
    for (
      let assignmentIndex = 0, peopleIndex = 0;
      peopleIndex < peopleToAssign.length &&
      assignmentIndex < unstagedAssignments.length;
      assignmentIndex++,
        peopleIndex >= specialJobsAmount ? specialJobsAmount : peopleIndex++
    ) {
      for (
        let a = 0, p = 0;
        a < unstagedAssignments[assignmentIndex].length;
        a++
      ) {
        for (
          let shiftCount = shiftsPlacedChart.find(
            (shift) => shift.name === peopleToAssign[peopleIndex][p].name
          );
          !unstagedAssignments[assignmentIndex][a].assignedVolunteer &&
          p < peopleToAssign[peopleIndex].length;
          p++,
          p == peopleToAssign[peopleIndex].length ? 1 : shiftCount = shiftsPlacedChart.find(
            (shift) => shift.name === peopleToAssign[peopleIndex][p].name)
        ) {
          if (
            (unstagedAssignments[assignmentIndex][a].jobPriority ==
              peopleToAssign[peopleIndex][p].specialQualificationsIds ||
            unstagedAssignments[assignmentIndex][a].jobPriority >=
              specialJobsAmount) &&
            (
              (constraintRestrictionLevel == 0 &&
                shiftCount.shiftsPlaced < numberShiftsNeeded &&
                (unstagedAssignments[assignmentIndex][a].timePriority ==
                peopleToAssign[peopleIndex][p].timeId ||
                peopleToAssign[peopleIndex][p].timeId == 1 ||
                unstagedAssignments[assignmentIndex][a].timePriority == 1) &&
                ((shiftCount.daysWorked %
                    unstagedAssignments[assignmentIndex][a].dayId !=
                    0 || 
                    shiftCount.daysWorked == 1) && shiftCount.assignedHours.some(number => Math.abs((24 * unstagedAssignments[assignmentIndex][a].day + unstagedAssignments[assignmentIndex][a].shiftStartNum) - (number)) > 9)
                )
              ) || // day*24+shiftStartNum shiftStartNum need to put each assignment in shiftsplaced chart and check absolute difference in each start time is more than 9 hours
              (constraintRestrictionLevel == 1 &&
                shiftCount.shiftsPlaced < numberShiftsNeeded &&
                ((shiftCount.daysWorked %
                    unstagedAssignments[assignmentIndex][a].dayId !=
                    0 || 
                    shiftCount.daysWorked == 1) && shiftCount.assignedHours.some(number => Math.abs((24 * unstagedAssignments[assignmentIndex][a].day + unstagedAssignments[assignmentIndex][a].shiftStartNum) - (number)) > 9)
                )
              ) //|| // day*24+shiftStartNum shiftStartNum need to put each assignment in shiftsplaced chart and check absolute difference in each start time is more than 9 hours
              // (constraintRestrictionLevel == 2 &&
              //   shiftCount.shiftsPlaced < numberShiftsNeeded
              //   // do bug here
              // ) //||
              //constraintRestrictionLevel == 3
            )

          ) {
            unstagedAssignments[assignmentIndex][a].assignedVolunteer =
              peopleToAssign[peopleIndex][p].name;
      
            if(shiftCount.daysWorked % unstagedAssignments[assignmentIndex][a].dayId == 0){
              peopleToAssign[peopleIndex][p].sameDayAssigned = true;
              unstagedAssignments[assignmentIndex][a].sameDayAssigned = true;
              // console.log(unstagedAssignments[assignmentIndex][a])
            }
            shiftCount.shiftsPlaced++;
            shiftCount.daysWorked = shiftCount.daysWorked * unstagedAssignments[assignmentIndex][a].dayId;
            shiftCount.assignedHours.push(24 * unstagedAssignments[assignmentIndex][a].day + unstagedAssignments[assignmentIndex][a].shiftStartNum);
            //first element null?
            if (
              (unstagedAssignments[assignmentIndex][a].timePriority !=
                peopleToAssign[peopleIndex][p].timeId &&
                !(
                  peopleToAssign[peopleIndex][p].timeId != 1 ||
                  unstagedAssignments[assignmentIndex][a].timePriority != 1
                ))
            ) {
              unstagedAssignments[assignmentIndex][a].nonIdealShiftTaken = true;
              peopleToAssign[peopleIndex][p].nonIdealShiftTaken = true;
            }
          }
        }
        p = 0;
        peopleToAssign[peopleIndex].sort(personComparison(shiftsPlacedChart, unstagedAssignments[assignmentIndex][a].dayId));
      }
    }
  }

  1;

  //end placing assignments

  //start bruteForce missingGaps
  let flatPeople = peopleToAssign.flat();
  // console.log(flatPeople);

  let flatAssignments = distributeSort(unstagedAssignments.flat(), "day");
  for (let a = 0; a < flatAssignments.length; a++) {
    if (flatAssignments[a].assignedVolunteer == "") {
      for (let p = 0; p < flatPeople.length; p++) {
        let shiftCount = shiftsPlacedChart.find(
          (shift) => shift.name === flatPeople[p].name
        );
        if (
          (flatPeople[p].specialQualificationsIds ==
            flatAssignments[a].jobPriority ||
            flatAssignments[a].jobPriority >= specialJobsAmount) &&
          shiftCount.shiftsPlaced < 4
        ) {
          flatAssignments[a].assignedVolunteer = flatPeople[p].name;
          shiftCount.shiftsPlaced++;
          shiftCount.daysWorked = shiftCount.daysWorked * flatAssignments[a].dayId;
          if (
            flatAssignments[a].timePriority != flatPeople[p].timeId &&
            flatPeople[p].timeId != 1 &&
            flatAssignments[a].timePriority != 1
          ) {
            flatAssignments[a].nonIdealShiftTaken = true;
            flatPeople[p].nonIdealShiftTaken = true;
          }
          break;
        }
      }
    }
  }
  flatAssignments.sort(
    priorityComparison([
      "jobPriority",
      "timePriority",
      "day",
      "person",
      "ShiftStart",
    ])
  );

  // working on double shift
  // const countMap = new Map();

  // // // First pass: count occurrences of (name, day) pairs
  // // for (const { name, day } of flatAssignments) {
  // //     const key = `${name}-${day}`;
  // //     countMap.set(key, (countMap.get(key) || 0) + 1);
  // // }

  // // // Second pass: mark doubleShiftTaken if count > 1
  // // for (const assignment of flatAssignments) {
  // //     const key = `${assignment.name}-${assignment.day}`;
  // //     if (countMap.get(key) > 1) {
  // //         assignment.doubleShiftTaken = true;
  // //         flatPeople.find(a => a.assignedVolunteer == flatPeople.name).doubleShiftTaken = true;
  // //     }
  // // }
  // const seen =  new Map();
  // for (const assignment of flatAssignments) {
  //   const key = `${assignment.name}-${assignment.day}`;

  //   if (seen.has(key)) {
  //       assignment.doubleShiftTaken = true;
  //       seen.get(key).doubleShiftTaken = true; // Mark the original instance
  //   } else {
  //       seen.set(key, assignment);
  //   }
  // }

  // console.log(flatAssignments);

  // console.log(
  //  flatAssignments.reduce(
  //    (count, item) =>
  //     count + (item.assignedVolunteer == "Schuyler Ashton " ? 1 : 0),
  //   0
  // )
  // ); // debugging mystery? // console.log(shiftsPlacedChart.slice(26));

  return flatAssignments;
}
// const data = JSON.parse(fs.readFileSync("./thejson.json", "utf8"));
// const assignments = data.assignments;
// const people = data.people;

  // const newAssignments = assign(assignments, people);

//randomly pool through everyone in 10+ by index not by name

//split am,pm into am and pm peopletoassign
//
//put people of peopletoassign in a minheap. sort it similarly, then iterate. instead of p+. remove and insert.

// heapify shifts to assign

//then when you get to flat peop just assign.
//case around (a) and make rules for each jobPriority who can be assigned to what. if special (a > 10) is false then everyone just assign.

//find the person in shiftsto assign in people to assign

//add field into people to assign shifts covered.
//heapify each peopleIndex of people to assign min on top using shifts placed, followed by am, pm, am+pm.
// after every people index sync people to assign of that index with shifts to assign
//fill by jobname and then spread days so that the days are spread.

// add to priority comparison if all ties a coinflip
//add a skipped parameter to remove from heap. remove if person is at 4.

// dont sort people by timepriority just filter by it.
// sort assignments by jobpriority and then by time priority then spread by day.

// in shiftsassigned catalogue not just shifts placed, but which days are placed.

// hash combinations of days to then if day is divisible you will know
// days should not be 1 (for none) 2,3,5,7, and when you assign someone a shift multiply the int daysAssigned by the day corresponding to that number. if they have worked that day you can check just by dividing.

//  filter by jobPriority. min-heapify on each assignment based on shiftsplaced, daysplace % day == 0 (return small or neg), then by timeprioity*-1. then place each assignment by preference (popping the min)

//  after youve done all thatcase on special if special true then case on heirarchy and shifts placed. dont check for anything but if shifts placed is 4, then if it isnt fill from flat people assigned.

// skipDisrecommended=false
// p heapified p 0, p 1, p 2, etc, a 0
// a 1
// a 2
// skipDisrecommended=true
// // doLoopover














/////////////////////////////////////////////////////////////////
//--------------------------------------------------IGNORE below HERE
/////////////////////////////////////////////////////////////////
//--------------------------------------------------


import fs from "fs";


const data = JSON.parse(fs.readFileSync("./thejson.json", "utf8"));
const assignments = data.assignments;
const people = data.people;

const newAssignments = assign(assignments, people);

fs.writeFileSync(
  "theresultjson.json",
  JSON.stringify(newAssignments, null, 2)
);
