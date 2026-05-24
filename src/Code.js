function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Volunteer Tools')
    .addItem('Assign volunteers', 'runAssignVolunteers')
    .addToUi();
  ui.createMenu('Danger')
    .addItem("Clear / Re-generate assignments", 'runGenerateAssignments')
    .addToUi();
}

function runGenerateAssignments() {
  const assignmentsSheet = getSheet("Assignments");
  const assignments = generateAssignments();
  pushObjArrayToSheet(assignmentsSheet, assignments);
  debugPrint("people", JSON.stringify(getVolunteers()), 1);
  debugPrint("assignments", JSON.stringify(getAssignments()), 2); 
  assignmentsSheet.activate();
}

function debugPrint(name, x, col) {
  const debugSheet = getSheet("Debug");

  const chunks = [];
  const chunkSize = 50000;

  for (let i = 0; i < x.length; i += chunkSize) {
    chunks.push(x.slice(i, i + chunkSize));
  }

  // Write all chunks into the sheet at once (faster than one-by-one)
  const data = chunks.map(chunk => [chunk]); // each chunk in its own row

  debugSheet.getRange(1, col).setValue(name);
  debugSheet.getRange(2, col, data.length, 1).setValues(data);
}

function runAssignVolunteers() {
  // const people = getVolunteers().map(({first, last, nickname, ...extra}) => ({functionalName: nickname != '' ? nickname : `${first} ${last}`, ...extra}));

  const assignmentsSheet = getSheet("Assignments");

  const people = getVolunteers();

  const assignments = getAssignments().map((i) => ({...i, sameDayAssigned: false}));

  debugPrint("people", JSON.stringify(people), 1);
  debugPrint("assignments", JSON.stringify(assignments), 2); 

  //console.log(assignments);
  //console.log(people);

  const newAssignments = assign(assignments, people);

  pushObjArrayToSheet(assignmentsSheet, newAssignments);  

  assignmentsSheet.activate();
}

/**
 * @param {string} sheet_name name of the sheet
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} the sheet object
 */
function getSheet(sheet_name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheet_name);
  if (!sheet) {
    throw new Error(`Sheet named '${sheet_name}' not found!`);
  }
  return sheet;
}

function lookupTimeId(t) {
  return ({
    AM: 0,
    PM: 2,
    "AM, PM": 1,
    "AM,PM": 1
  })[t]
}

function lookupDayId(d) {
  return ({
    1: 2,
    2: 3,
    3: 5,
    4: 7,
  })[d]
}

/**
 * @returns {Array.<Object>} all the possible shift assignments
 */
function generateAssignments() {
  const jobs = getJobs()

  const shifts = getShifts().map(
    (i) => ({...i, timePriority: lookupTimeId(i.timeCategory)})
  );

  jobLookup = Object.fromEntries(
    jobs.map((j) => ([j.jobName, j]))
  )

  const shiftsXJobs = shifts.map((s) => ({...s, shiftStartNum: (new Date(s.shiftStart)).getHours(),...jobLookup[s.jobName]}));

  const shiftsXJobsXpeople = shiftsXJobs.flatMap((s) => Array.from({ length: s.peopleShift }, (_, i) => ({...s, person: i+1})));

  const shiftsXJobsXpeopleXDays = shiftsXJobsXpeople.flatMap((s) => Array.from({ length: s.days }, (_, i) => ({...s, day: i+1, dayId: lookupDayId(i+1)})));

  return shiftsXJobsXpeopleXDays;
}

/**
 * @returns {Array.<Object>} the jobs
 */
function getJobs() {
  return objArrayFromSheet(getSheet("Jobs")).map(
    (i, idx) => ({...i, jobPriority: idx})
  );;
}

/**
 * @returns {Array.<Object>} the shifts
 */
function getShifts() {
  return objArrayFromSheet(getSheet("Shifts"));
}

/**
 * @returns {Array.<Object>} the volunteers
 */
function getVolunteers(){
  jobs = getJobs();

  const lookupPriority = (name) => jobs.find((i) => i.jobName === name).jobPriority;

  return objArrayFromSheet(getSheet("Volunteers")).map(
    (i) => ({
      ...i,
      timeId: lookupTimeId(i.timePreference),
      specialQualificationsIds: i.specialQualifications === "" ? [] : i.specialQualifications.split(", ").map(lookupPriority)
    })
  );
}

/**
 * @returns {Array.<Object>} the assignments
 */
function getAssignments(){
  return objArrayFromSheet(getSheet("Assignments"), 3);
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to pull data from.
 */
function objArrayFromSheet(sheet, sizeCol = 0) {
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  const nJobs = sizeIgnoringEmptyEnd(values.map((i) => i[sizeCol]));
  const nProps = sizeIgnoringEmptyEnd(values[nJobs-1]);

  const props = values[0].slice(0, nProps).map(toCamelCase);

  return values.slice(1, nJobs).map((row) => (
    Object.fromEntries(row.slice(0, nProps).map((p, idx) => [props[idx], p]))
  ))
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to push the data to.
 * @param {Array.<Object>} objArray - An array of objects containing the data to be inserted.
 */
function pushObjArrayToSheet(sheet, objArray) {
  const headersRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  const headers = headersRange.getValues()[0].map(toCamelCase);

  const values = objArray.map((obj) => headers.map(header => obj[header]));

  sheet.getRange(2, 1, sheet.getMaxRows() - 1, sheet.getLastColumn()).clearContent();
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

/**
 * @param {string} name - name to convert to camel case
 * @returns {string}
 */
function toCamelCase(name) {
  return String(name)
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
    .trim() // Trim spaces at start and end
    .split(/\s+/) // Split by spaces
    .map((word, index) => 
      index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('');
}

/**
 * @param {Array} arr - an array to find the size of, ignoring falsy values at the end
 * @returns {number} the size
 */
function sizeIgnoringEmptyEnd(arr) {
  let size = arr.length;
  while (size > 0 && !arr[size - 1]) {
    size--;
  }
  return size;
}