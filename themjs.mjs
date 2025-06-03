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

export const priorityComparison = (keyOrder) => (a, b) => {
  for (const key of keyOrder) {
    const result = genericCompare(a[key], b[key]);
    if (result !== 0) {
      return result;
    }
  }
  return 0;
};

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
      name: `${i.first} ${i.last} ${i.nickname}`, //make prettier?
    }))
    .sort(priorityComparison(["specialQualificationsIds", "timeId"]));
}

function sortAssignments(assignments) {
  let unsorted = assignments
    .sort(priorityComparison(["jobPriority", "timePriority", "day", "person"]))
    .map((i, index) => ({
      index: index + 1,
      nonIdealShiftTaken: false,
      ...i,
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

function clear(assignmentsSorted, shiftsPlacedChart) {
  let cleared = assignmentsSorted.map(function (assignment) {
    let volunteerAssignment = {
      ...assignment,
      stagedVolunteer: "",
    };
    shiftsPlacedChart.forEach((i) => (i.shiftsPlaced = 0) /*effect */);
    return volunteerAssignment;
  });
  return cleared;
}

//------- assign  ---------

//problem with assign rightnow is that names are sorted alphabetically and not randomly, so same people that fill a job qualification will always get it and people with lower lexical order will not.
//good fix idea is just in the order we found it on the sheet which is presumably the the date they got on there.
//another good idea is to make a date-time submittedInquiryTime and we make it first come first serve and sort by that instead of name
function assign(assignments, people) {
  const peopleSorted = sortPeople(people);

  const assignmentsSorted = sortAssignments(assignments);
  const shiftsPlacedChart = peopleSorted
    .sort(priorityComparison(["specialQualificationsIds", "timeId", "name"]))
    .map((i) => ({ name: i.name, shiftsPlaced: 0 }));
  const shiftsSorted = expandObjects(
    peopleSorted,
    "specialQualificationsIds"
  ).sort(priorityComparison(["specialQualificationsIds", "timeId", "name"]));

  //import jobs; then
  //const number of special jobs =  
  // console.log(
  //  jobsSorted.reduce(
  //    (count, item) =>
  //     count + (item.special == true ? 1 : 0),
  //   0
  // )); then replace that with 10

  // console.log(assignmentsSorted);
  // console.log(peopleSorted.slice(69));
  // console.log(shiftsPlacedChart);

  //contains effects -- i.e. adds one to the shiftsPlaced field of the shiftsSorted entity whose name or id (edit this) matches assigned volunteer
  let peopleToAssign = splitByProperty(
    shiftsSorted,
    "specialQualificationsIds"
  );
  let unstagedAssignments = splitByProperty(
    assignmentsSorted.map(function (assignment) {
      let volunteerAssignment = {
        ...assignment,
        assignedVolunteer: assignment.stagedVolunteer,
      };
      let assignedPerson = shiftsPlacedChart.find(
        (person) => person.name === volunteerAssignment.assignedVolunteer
      );
      if (assignedPerson) /*effect */ assignedPerson.shiftsPlaced++;
      return volunteerAssignment;
    }),
    "jobPriority"
  );

  for (let i = 0; i < 1; i++) {
    let p = 0;
    let a = 0;
    let shiftCount;
    for (
      let assignmentIndex = 0, peopleIndex = 0;
      peopleIndex < peopleToAssign.length &&
      assignmentIndex < unstagedAssignments.length;
      assignmentIndex++, peopleIndex >= 10 ? 1 : peopleIndex++
    ) {
      p = 0;
      a = 0;
      shiftCount = shiftsPlacedChart.find(
        (shift) => shift.name === peopleToAssign[peopleIndex][p].name
      );
      {
        for (
          let idealGrace = 0;
          idealGrace < 1 &&
          a < unstagedAssignments[assignmentIndex].length &&
          p < peopleToAssign[peopleIndex].length * 4;
          p >= peopleToAssign[peopleIndex].length &&
          a >= unstagedAssignments[assignmentIndex].length
            ? idealGrace++
            : 1
        ) {
          if (shiftCount.shiftsPlaced >= 4) {
            p++;
            shiftCount = shiftsPlacedChart.find(
              (shift) =>
                shift.name ===
                peopleToAssign[peopleIndex][
                  p % peopleToAssign[peopleIndex].length
                ].name
            );
          } else {
            if (!unstagedAssignments[assignmentIndex][a].assignedVolunteer) {
              if (idealGrace < 1) {
                if (
                  unstagedAssignments[assignmentIndex][a].timePriority !=
                    peopleToAssign[peopleIndex][
                      p % peopleToAssign[peopleIndex].length
                    ].timeId &&
                  peopleToAssign[peopleIndex][
                    p % peopleToAssign[peopleIndex].length
                  ].timeId != 1 &&
                  unstagedAssignments[assignmentIndex][a].timePriority != 1
                ) {
                  p++;
                  shiftCount = shiftsPlacedChart.find(
                    (shift) =>
                      shift.name ===
                      peopleToAssign[peopleIndex][
                        p % peopleToAssign[peopleIndex].length
                      ].name
                  );
                } else {
                  if (
                    unstagedAssignments[assignmentIndex][a].jobPriority ==
                      peopleToAssign[peopleIndex][
                        p % peopleToAssign[peopleIndex].length
                      ].specialQualificationsIds ||
                    unstagedAssignments[assignmentIndex][a].jobPriority >= 10
                  ) {
                    unstagedAssignments[assignmentIndex][a].assignedVolunteer =
                      peopleToAssign[peopleIndex][
                        p % peopleToAssign[peopleIndex].length
                      ].name;
                    shiftCount.shiftsPlaced++;
                    if (
                      unstagedAssignments[assignmentIndex][a].timePriority !=
                        peopleToAssign[peopleIndex][
                          p % peopleToAssign[peopleIndex].length
                        ].timeId &&
                      !(
                        peopleToAssign[peopleIndex][
                          p % peopleToAssign[peopleIndex].length
                        ].timeId != 1 ||
                        unstagedAssignments[assignmentIndex][a].timePriority !=
                          1
                      )
                    ) {
                      unstagedAssignments[assignmentIndex][
                        a
                      ].nonIdealShiftTaken = true;
                      peopleToAssign[peopleIndex][
                        p % peopleToAssign[peopleIndex].length
                      ].nonIdealShiftTaken = true;
                    }
                    p++;
                    shiftCount = shiftsPlacedChart.find(
                      (shift) =>
                        shift.name ===
                        peopleToAssign[peopleIndex][
                          p % peopleToAssign[peopleIndex].length
                        ].name
                    );
                  }
                }
                a++;
              } else {
                // if(idealGrace == 2){
                //   a=0;
                //   // p=0;
                //   idealGrace++;
                // }
                // a=0;
                // if(!unstagedAssignments[assignmentIndex][a].assignedVolunteer){
                if (
                  !unstagedAssignments[assignmentIndex][a].assignedVolunteer &&
                  (unstagedAssignments[assignmentIndex][a].jobPriority ==
                    peopleToAssign[peopleIndex][p].specialQualificationsIds ||
                    peopleToAssign[peopleIndex][p].specialQualificationsIds >=
                      10)
                ) {
                  unstagedAssignments[assignmentIndex][a].assignedVolunteer =
                    peopleToAssign[peopleIndex][
                      p % peopleToAssign[peopleIndex].length
                    ].name;
                  if (
                    unstagedAssignments[assignmentIndex][a].timePriority !=
                      peopleToAssign[peopleIndex][
                        p % peopleToAssign[peopleIndex].length
                      ].timeId &&
                    (peopleToAssign[peopleIndex][
                      p % peopleToAssign[peopleIndex].length
                    ].timeId != 1 ||
                      unstagedAssignments[assignmentIndex][a].timePriority != 1)
                  ) {
                    //modify to or if assignment isnt 2
                    unstagedAssignments[assignmentIndex][
                      a
                    ].nonIdealShiftTaken = true;
                    peopleToAssign[peopleIndex][
                      p % peopleToAssign[peopleIndex].length
                    ].nonIdealShiftTaken = true;
                  }
                  shiftCount.shiftsPlaced++;
                }
                p++;
                a++;
                shiftCount = shiftsPlacedChart.find(
                  (shift) =>
                    shift.name ===
                    peopleToAssign[peopleIndex][
                      p % peopleToAssign[peopleIndex].length
                    ]
                );
              }
            } else {
              a++;
            }
          }
        }
        a++;
      }
    }
  }
  let flatPeople = peopleToAssign.flat();
  let flatAssignments = unstagedAssignments.flat();
  for (let a = 0; a < flatAssignments.length; a++) {
    if (flatAssignments[a].assignedVolunteer == "") {
      for (let p = 0; p < flatPeople.length; p++) {
        let shiftCount = shiftsPlacedChart.find(
          (shift) => shift.name === flatPeople[p].name
        );
        // if(!flatAssignments[a].assignedVolunteer){ original
        if (
          (flatPeople[p].specialQualificationsIds ==
            flatAssignments[a].jobPriority ||
            flatAssignments[a].jobPriority >= 10) &&
          shiftCount.shiftsPlaced < 4
        ) {
          flatAssignments[a].assignedVolunteer = flatPeople[p].name;
          shiftCount.shiftsPlaced++;
          if (
            flatAssignments[a].timePriority != flatPeople[p].timeId &&
            flatPeople[p].timeId != 1 &&
            flatAssignments[a].timePriority != 1
          ) {
            flatAssignments[a].nonIdealShiftTaken = true;
            flatPeople[p].nonIdealShiftTaken = true;
          }
        }
      }
    }
  }
  // console.log(
  //  flatAssignments.reduce(
  //    (count, item) =>
  //     count + (item.assignedVolunteer == "Schuyler Ashton " ? 1 : 0),
  //   0
  // )
  // ); // debugging mystery? // console.log(shiftsPlacedChart.slice(26));

  return clear(flatAssignments, shiftsPlacedChart);
}

export default assign;
