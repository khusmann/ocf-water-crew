import fs from "fs";
import { priorityComparison } from "./util.mjs";
import { splitByProperty } from "./util.mjs";
import { expandObjects } from "./util.mjs";

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
      nonIdealShiftTaken: false,
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
    nonIdealShiftTaken: false,
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
const shiftsPlacedChart = peopleSorted.sort(priorityComparison([ "specialQualificationsIds", "timeId", "name"])).map(
  (i) => ({name: i.name, shiftsPlaced: 0})
);
const shiftsSorted = expandObjects(peopleSorted, "specialQualificationsIds").sort(priorityComparison([ "specialQualificationsIds", "timeId", "name"]));

// console.log(assignmentsSorted);
// console.log(peopleSorted.slice(69));
// console.log(shiftsPlacedChart);


//------- clear staged ---------

function clear(){
  let cleared = assignmentsSorted.map(
    function(assignment) {
      let volunteerAssignment = ({
      ...assignment,
      stagedVolunteerVolunteer: '',
      });
      shiftsPlacedChart.forEach(
        (i) => i.shiftsPlaced = 0 /*effect */
      )
      return volunteerAssignment;
  });
  return cleared;
}

//------- assign  ---------


//problem with assign rightnow is that names are sorted alphabetically and not randomly, so same people that fill a job qualification will always get it and people with lower lexical order will not.
//good fix idea is just in the order we found it on the sheet which is presumably the the date they got on there.
//another good idea is to make a date-time submittedInquiryTime and we make it first come first serve and sort by that instead of name
//also bug removing at 3?
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

  for(let i = 0; i<2; i++){
    for(let assignmentIndex = 0, peopleIndex = 0; assignmentIndex < unstagedAssignments.length; assignmentIndex++, peopleIndex >= 10 ? 1 : peopleIndex++){
      for(let p = 0, a = 0, shiftCount = shiftsPlacedChart.find(shift => shift.name === peopleToAssign[peopleIndex][p].name) ;  p < peopleToAssign[peopleIndex].length && a < unstagedAssignments[assignmentIndex].length;){ 
        // console.log(p, a); //
        //shiftCount = peopleIndex == 0 ? shiftsPlacedChart[0] :shiftsPlacedChart[peopleToAssign[peopleIndex-1].length]
          for(let idealGrace = 0; idealGrace < 3 && a < unstagedAssignments[assignmentIndex].length; p % peopleToAssign[peopleIndex].length == 0 ? idealGrace++ : 1){ //idealGrace >= 3 ? p : p = 0
            // console.log(shiftCount.name);
            // if(shiftCount.name == 'Ryan Ashton ' && assignmentIndex >1){
            //   // console.log("here");
            // }
            if(shiftCount.shiftsPlaced >= 2){
              p++;
              shiftCount = shiftsPlacedChart.find(shift => shift.name === peopleToAssign[peopleIndex][p % peopleToAssign[peopleIndex].length].name);
              // shiftCount = peopleIndex == 0 ? shiftsPlacedChart[(p % peopleToAssign[peopleIndex].length)] : shiftsPlacedChart[(p % peopleToAssign[peopleIndex].length)+peopleToAssign[peopleIndex-1].length-1];  
            } 
            else{
              if(unstagedAssignments[assignmentIndex][a].timePriority != peopleToAssign[peopleIndex][p % peopleToAssign[peopleIndex].length].timeId && peopleToAssign[peopleIndex][p % peopleToAssign[peopleIndex].length].timeId != 2 && unstagedAssignments[assignmentIndex][a].timePriority != 2){
                if(idealGrace < 2){
                p++;
                // a++;
                // shiftCount = peopleIndex == 0 ? shiftsPlacedChart[(p % peopleToAssign[peopleIndex].length)] : shiftsPlacedChart[(p % peopleToAssign[peopleIndex].length)+peopleToAssign[peopleIndex-1].length];  
                shiftCount = shiftsPlacedChart.find(shift => shift.name === peopleToAssign[peopleIndex][p % peopleToAssign[peopleIndex].length].name); 
                }
                idealGrace++;         
              } 
              else{
                if(idealGrace == 2){
                  a=0;
                  // p=0;
                  idealGrace++;
                }  
                // a=0;
                // if(!unstagedAssignments[assignmentIndex][a].assignedVolunteer){
                if(!unstagedAssignments[assignmentIndex][a].assignedVolunteer){
                  unstagedAssignments[assignmentIndex][a].assignedVolunteer = peopleToAssign[peopleIndex][p % peopleToAssign[peopleIndex].length].name;
                  if(unstagedAssignments[assignmentIndex][a].timePriority != peopleToAssign[peopleIndex][p % peopleToAssign[peopleIndex].length].timeId && (peopleToAssign[peopleIndex][p % peopleToAssign[peopleIndex].length].timeId != 2 || unstagedAssignments[assignmentIndex][a].timePriority != 2)){//modify to or if assignment isnt 2
                    unstagedAssignments[assignmentIndex][a].nonIdealShiftTaken = true;
                    peopleToAssign[peopleIndex][p % peopleToAssign[peopleIndex].length].nonIdealShiftTaken = true;
                  }
                  shiftCount.shiftsPlaced++;
                }
                  p++;
                  shiftCount = peopleIndex == 0 ? shiftsPlacedChart[(p % peopleToAssign[peopleIndex].length)] : shiftsPlacedChart[(p % peopleToAssign[peopleIndex].length)+peopleToAssign[peopleIndex-1].length];  
                  // shiftCount = shiftsPlacedChart.find(shift => shift.name === peopleToAssign[peopleIndex][p % peopleToAssign[peopleIndex].length].name);
                  a++;
                // }
              }
            }
            // if(idealGrace >= 3){
            //   p=0;
            // }
          }
        a++;
        // p++;
        // console.log(p,a);

        //PERSON GETS INSERT a++ p++;
        //person gets no job agreement break;
        //person gets skipped because non-preference; p++; 
        //person gets skipped 

        // if(p == peopleToAssign[peopleIndex].length && a < unstagedAssignments[assignmentIndex].length){
        //   p++;//on skip
        // }
        // if(p < peopleToAssign[peopleIndex].length && a < unstagedAssignments[assignmentIndex].length){
        //   if
        //   p++;
        //   a++;
        // }
        // else{
        //   p++;
        //   a++;
      }
    }
  }
  // console.log((unstagedAssignments[0].slice(0,9)));
  // console.log(shiftsPlacedChart)

  // for(let i = 0; i<2; i++){
  //   for(let assignmentIndex = 0, peopleIndex = 0; assignmentIndex < unstagedAssignments.length; assignmentIndex++, peopleIndex >= 10 ? 1 : peopleIndex++){
  //     for(let p = 0, a = 0, shiftCount =shiftsPlacedChart[0];  p < peopleToAssign[peopleIndex].length && a < unstagedAssignments[assignmentIndex].length;){ 
  //       console.log(p, a);
  //         for(let idealGrace = 0; idealGrace < 3; idealGrace++){ //idealGrace >= 3 ? p : p = 0
  //           console.log(shiftCount.name);
  //           if(shiftCount.shiftsPlaced >= 2){
  //             p++;
  //             shiftCount = shiftsPlacedChart.find(shift => shift.name === peopleToAssign[peopleIndex][p].name);
  //           } 
  //           else{
  //             if(idealGrace < 2 && unstagedAssignments[assignmentIndex][a].timePriority != peopleToAssign[peopleIndex][p % peopleToAssign[peopleIndex].length].timeId){
  //               p++;
  //               shiftCount = shiftsPlacedChart.find(shift => shift.name === peopleToAssign[peopleIndex][p % peopleToAssign[peopleIndex].length].name);                } 
  //             else{
  //               unstagedAssignments[assignmentIndex][a].assignedVolunteer = peopleToAssign[peopleIndex][p % peopleToAssign[peopleIndex].length].name;
  //               if(unstagedAssignments[assignmentIndex][a].timePriority != peopleToAssign[peopleIndex][p % peopleToAssign[peopleIndex].length].timeId ){
  //                 unstagedAssignments[assignmentIndex][a].nonIdealShiftTaken = true;
  //                 peopleToAssign[peopleIndex][p].nonIdealShiftTaken = true;
  //               }
  //               shiftCount.shiftsPlaced++;
  //               p++;
  //               shiftCount = shiftsPlacedChart.find(shift => shift.name === peopleToAssign[peopleIndex][p % peopleToAssign[peopleIndex].length].name);
  //               a++;
  //             }
  //           }
  //           if(idealGrace >= 3){
  //             p=0;
  //           }
  //         }
  //       a++;
  //       // p++;
  //       // console.log(p,a);

  //       //PERSON GETS INSERT a++ p++;
  //       //person gets no job agreement break;
  //       //person gets skipped because non-preference; p++; 
  //       //person gets skipped 

  //       // if(p == peopleToAssign[peopleIndex].length && a < unstagedAssignments[assignmentIndex].length){
  //       //   p++;//on skip
  //       // }
  //       // if(p < peopleToAssign[peopleIndex].length && a < unstagedAssignments[assignmentIndex].length){
  //       //   if
  //       //   p++;
  //       //   a++;
  //       // }
  //       // else{
  //       //   p++;
  //       //   a++;
  //     }
  //   }
  // }
  // // console.log((unstagedAssignments[0].slice(0,9)));
  // console.log(shiftsPlacedChart)

  // }
  // // console.log(shiftsPlacedChart.find(p => p.name = "Graham Shields "))
  // // console.log(JSON.stringify(unstagedAssignments, null, 2));
  // // console.log(JSON.stringify(peopleToAssign, null, 2));


  // // console.log(peopleToAssign.at(0))
  // // shiftsPlacedChart.find(p => p.name === "Helena Ament Leni").shiftsPlaced = 7; // test
  // for(let assignmentIndex = 0, peopleIndex = 0, specialCount = 0; assignmentIndex < unstagedAssignments.length; assignmentIndex++ ){ //using shift and splice
  //   let skip = true;
  //   for(let p = 0, a = 0, i=1, totalCount=0; peopleToAssign[peopleIndex].length > 0 && a < unstagedAssignments[assignmentIndex].length && p < unstagedAssignments[assignmentIndex].length  && p < peopleToAssign[peopleIndex].length && skip; p++){ // peopleIndex < peopleToAssign.length && peopleToAssign.length != 0 && a < peopleToAssign[peopleIndex].length
  //     let shiftCount = shiftsPlacedChart.find(shift => shift.name === peopleToAssign[peopleIndex][p].name);
  //       if(shiftCount.shiftsPlaced >= 2){
  //         console.log("removed", shiftCount);
  //         // console.log(p,peopleIndex, shiftCount.name);
  //         peopleToAssign[peopleIndex].splice(p,1);
  //         p--; //?
  //       }
  //       else{
  //         // if(unstagedAssignments[assignmentIndex][a].timePriority == peopleToAssign[peopleIndex][p].timeId){
  //         if(unstagedAssignments[assignmentIndex][a].timePriority != peopleToAssign[peopleIndex][p].timeId && peopleToAssign[peopleIndex][p].timeId != 2){
  //           peopleToAssign[peopleIndex].push(peopleToAssign[peopleIndex].splice(p,1)[0]);
  //           shiftCount = shiftsPlacedChart.find(shift => shift.name === peopleToAssign[peopleIndex][p].name);
  //           //add in time id and 
  //         } 
          
  //         {
  //           unstagedAssignments[assignmentIndex][a].assignedVolunteer = peopleToAssign[peopleIndex][p].name;
  //           totalCount++;
  //           // peopleToAssign[peopleIndex].push(peopleToAssign[peopleIndex].splice(p,1)[0]);//might break

  //           if(unstagedAssignments[assignmentIndex][a].timePriority != peopleToAssign[peopleIndex][p].timeId ){
  //             unstagedAssignments[assignmentIndex][a].nonIdealShiftTaken = true;
  //             peopleToAssign[peopleIndex][p].nonIdealShiftTaken = true;
  //           }
  //           shiftCount.shiftsPlaced++;
  //           // console.log(shiftCount.shiftsPlaced, " boop ", peopleToAssign[peopleIndex][p]);
  //         }
  //         a++;
  //       }
  //       if(i == 1 && p >= peopleToAssign[peopleIndex].length - 1){
  //         p=-1;
  //         i++;
  //       }
  //       if(i ==2 && p >= peopleToAssign[peopleIndex].length-1){
  //         p=-1;
  //         a=0;
  //         // peopleIndex < 10 ? peopleIndex++: 1;
  //         skip=false;
  //       }
  //       if(totalCount >= unstagedAssignments[assignmentIndex].length){
  //         skip=false;
  //         for(p=0;  peopleToAssign[peopleIndex].length != 0; p++){
  //           let uselessQ = peopleToAssign[peopleIndex].pop();
  //           if(shiftsPlacedChart.find((person) => person.name === uselessQ.name).shiftCount >= 2){
  //             ;
  //           }
  //           else{
  //             peopleToAssign[10].push();
  //           }
  //         }
  //         p=0;
  //         peopleIndex < 10 ? peopleIndex++: 1;
  //         assignmentIndex++;
  //         totalCount = 0;
  //       }
  //   }
  //   // if(peopleIndex > 0 && peopleIndex < 10 && peopleToAssign[peopleIndex].length > 0){
  //   //   for(let p = 0; p<peopleToAssign[peopleIndex].length; p++){
  //   //     if(peopleToAssign[peopleIndex][p]){
  //   //       peopleToAssign[10].push(peopleToAssign[peopleIndex][p])
  //   //     }
  //   //   }
  //   // }
  //   if(peopleIndex >= 10 && specialCount < 4){
  //     peopleIndex = 9;
  //     specialCount++;
  //   }
  //   peopleIndex++;
  // }
  // console.log(unstagedAssignments[0].slice(0,9));
  // console.log(shiftsPlacedChart);
  // // console.log(peopleToAssign.slice(0,1));


  //   // // peopleToAssign[peopleIndex].forEach(
  //   //   // (person, index) => {
  //   //     let shiftCount = shiftsPlacedChart.find(p => p.name === person.name);
  //   //     // console.log(shiftCount)
  //   //     if(shiftCount.shiftsPlaced >= 2){
  //   //       // console.log("removed", shiftCount);
  //   //       peopleToAssign[peopleIndex].splice(index,1);
  //   //       // console.log("the person:", person);
  //   //       // console.log("rest" ,peopleToAssign[peopleIndex])
  //   //     } else{
  //   //       for(i = 0; {
  //   //         unstagedAssignments[assignmentIndex][i].stagedVolunteer = person;
  //   //       }

  //   //     // }

  //   //   // }
  //   //     }



    
  // // console.log((autoassignedPeople.slice(autoassignedPeople.length -1,autoassignedPeople.length).at(0)))

  // //do a queue copy of unstaged, duplicate every listing there splitting apart each special qualifications. before inserting each go to shifts place lookuptable, look for name, if its shifts lpaced is at 2 remove it.
  // //while iterating through the assignments by job name,
  // //when a person gets shiftsPlace to two remove them. otherwise if you assign them remove them but then add them back in the queue.
  // // iterate through the person queue until (it is empty or we reach the end of it) and weve reached the end of assignments.
  // //if an assignment gets fully filled skip to the next one 

  // console.log(unstagedAssignments[1].find(a => a.assignedVolunteer == "Alicia Hayden "));
  // // console.log(shiftsPlacedChart.find(p => p.name == "Alicia Hayden "));
  // // console.log(peopleToAssign.find(p => p.name == "Christopher Hammer "))

  // console.log(peopleToAssign.slice(0,1), unstagedAssignments.slice(0,1))

  // console.log( peopleToAssign.slice(10).slice(0,9), unstagedAssignments.slice(10,11).slice(0,9), shiftsPlacedChart.length*2, unstagedAssignments.reduce((sum, item) => sum + item.length, 0));
  let flatPeople = peopleToAssign.flat();
  let flatAssignments = unstagedAssignments.flat();
  for(let a = 0; a < flatAssignments.length; a++){
    for(let p = 0; p < flatPeople.length; p++){
      let shiftCount = shiftsPlacedChart.find(shift => shift.name === flatPeople[p].name);
      if(!flatAssignments[a].assignedVolunteer){
        if((flatPeople[p].specialQualificationsIds == flatAssignments[a].jobPriority || flatAssignments[a].jobPriority >= 10) && shiftCount.shiftsPlaced < 2){
          flatAssignments[a].assignedVolunteer = flatPeople[p].name;
          if(flatAssignments[a].timePriority != flatPeople[p].timeId != 2 && flatAssignments[a].jobPriority != 2 ){
            flatAssignments[a].nonIdealShiftTaken = true;
            flatPeople[p].nonIdealShiftTaken = true;
          }
          shiftCount.shiftsPlaced++;
        }
      }
    }
  }
  console.log(shiftsPlacedChart);
  clear();
  return flatAssignments;
}

assign();
// console.log(shiftsSorted);
// console.log(assignmentsSorted)
//special to be instead specialqualificationId be 0-9 instead of true or , which is there position in the jobs, 0 indexed hk thats job priority
