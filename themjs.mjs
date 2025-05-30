import fs from "fs";
import { priorityComparison } from "./util.mjs";
import { splitByProperty } from "./util.mjs";
import { expandObjects } from "./util.mjs";
import { forEach } from "lodash-es";


// 1) read in your JSON data
const data = JSON.parse(fs.readFileSync("./thejson.json", "utf8"));
const assignments = data.assignments;
const people = data.people;

//------- generate matrix ---------

//add full name or id
function sortPeople(){
  return people
    .map((i) => ({
      ...i,
      name: `${i.first} ${i.last} ${i.nickname}`,//this is a spacing bug maybe later? but maybe not if constructed from here. add a space iff nickname exists
    }))
    .sort(
      priorityComparison(["specialQualificationsIds", "timeId"])
    );
}

function sortAssignments(){
  let unsorted = assignments.sort(
    priorityComparison(["jobPriority", "timePriority", "day", "person"])
  ).map((i, index) => ({
    index: index+1,
    ...i
  }));

  let groupShiftIds = 1;
  for (let i = 1; i < unsorted.length; i++){
    if(unsorted[i] !== undefined){
      if (unsorted[i].day != unsorted[i - 1].day || unsorted[i].person <= unsorted[i - 1].person) {
        groupShiftIds = 1;
        unsorted[i].index=groupShiftIds;
        groupShiftIds++;
      }
      else{
        unsorted[i].index=groupShiftIds;
        groupShiftIds++;
      }
    }
  }
  return unsorted;
}

const peopleSorted = sortPeople();
const assignmentsSorted = sortAssignments();
const shiftsPlacedChart = peopleSorted.map(
  (i) => ({name: i.name, shiftsPlaced: 0})
);
const shiftsSorted = expandObjects(peopleSorted, "specialQualificationsIds").sort(priorityComparison([ "specialQualificationsIds", "timeId", "name"]));

// console.log(peopleSorted.slice(69))

//------- clear staged ---------

function clear(){
  let cleared = assignmentsSorted.map(
    function(assignment) {
      let volunteerAssignment = ({
      ...assignment,
      assignedVolunteer: '',
      });
      shiftsPlacedChart.forEach(
        (i) => i.shiftsPlaced = 0 /*effect */
      )
      return volunteerAssignment;
  });
  return cleared;
}

//------- assign  ---------

function assign(){
  
  //contains effects -- i.e. adds one to the shiftsPlaced field of the shiftsSorted entity whose name or id (edit this) matches assigned volunteer
  let peopleToAssign = splitByProperty(shiftsSorted, "specialQualificationsIds"); 
  let unstagedAssignments = splitByProperty(assignmentsSorted.map(
    function(assignment) {
      let volunteerAssignment = ({
      ...assignment,
      assignedVolunteer: assignment.stagedVolunteer,
      });
      let assignedPerson = shiftsPlacedChart.find(
        (person) => person.name === volunteerAssignment.assignedVolunteer
      );
      if(assignedPerson) /*effect */
        assignedPerson.shiftsPlaced++;
      return volunteerAssignment;
  }), "jobPriority");

  // console.log(shiftsPlacedChart.find(p => p.name = "Graham Shields "))
  // console.log(JSON.stringify(unstagedAssignments, null, 2));
  // console.log(JSON.stringify(autoassignedPeople, null, 2));


  let stop = true;
  // console.log(peopleToAssign.at(0))
  // shiftsPlacedChart.find(p => p.name === "Helena Ament Leni").shiftsPlaced = 7; // test
  for(let assignmentIndex = 0, peopleIndex = 0; peopleToAssign.length != 0 && peopleIndex < peopleToAssign.length && assignmentIndex < unstagedAssignments.length && stop; assignmentIndex++, peopleIndex++){ //using shift and splice
    for(let p = 0, a = 0; peopleToAssign[peopleIndex].length > 0 && a<unstagedAssignments[assignmentIndex].length && a<peopleToAssign[peopleIndex].length && p < unstagedAssignments[assignmentIndex].length; p++){
      // console.log("hi");
      let shiftCount = shiftsPlacedChart.find(shift => shift.name === peopleToAssign[peopleIndex][p].name);
        if(shiftCount.shiftsPlaced >= 2){
          // console.log("removed", shiftCount);
          peopleToAssign[peopleIndex].splice(p,1);
        }
        else{
          unstagedAssignments[assignmentIndex][a].stagedVolunteer = peopleToAssign[peopleIndex][p].name;
          shiftCount.shiftsPlaced++;
          a++;//add in time id and 
          
        }
        if(p >= peopleToAssign[peopleIndex].length){
          p=0;
        }

    }
  }
  // console.log(unstagedAssignments[0], "reeee");



    // // peopleToAssign[peopleIndex].forEach(
    //   // (person, index) => {
    //     let shiftCount = shiftsPlacedChart.find(p => p.name === person.name);
    //     // console.log(shiftCount)
    //     if(shiftCount.shiftsPlaced >= 2){
    //       // console.log("removed", shiftCount);
    //       peopleToAssign[peopleIndex].splice(index,1);
    //       // console.log("the person:", person);
    //       // console.log("rest" ,peopleToAssign[peopleIndex])
    //     } else{
    //       for(i = 0; {
    //         unstagedAssignments[assignmentIndex][i].stagedVolunteer = person;
    //       }

    //     // }

    //   // }
    //     }

    // console.log(peopleToAssign.slice(0,1), unstagedAssignments.slice(0,1))


    
  // console.log((autoassignedPeople.slice(autoassignedPeople.length -1,autoassignedPeople.length).at(0)))

  //do a queue copy of unstaged, duplicate every listing there splitting apart each special qualifications. before inserting each go to shifts place lookuptable, look for name, if its shifts lpaced is at 2 remove it.
  //while iterating through the assignments by job name,
  //when a person gets shiftsPlace to two remove them. otherwise if you assign them remove them but then add them back in the queue.
  // iterate through the person queue until (it is empty or we reach the end of it) and weve reached the end of assignments.
  //if an assignment gets fully filled skip to the next one 



  return peopleToAssign;
}

assign();
// console.log(assignmentsSorted)
//special to be instead specialqualificationId be 0-9 instead of true or , which is there position in the jobs, 0 indexed hk thats job priority
