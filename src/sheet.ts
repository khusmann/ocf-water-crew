import type { Person, Assignment, IndexedAssignment } from "./types.ts";

// `assign` lives in scheduler.ts; in the GAS deployment it sits next
// to this file in the same global scope. Declared as ambient here so
// TypeScript sees the signature without an import (which would be
// stripped at build time anyway). See bin/build-gas.ts.
declare function assign(
  assignments: Assignment[],
  people: Person[]
): IndexedAssignment[];

type Sheet = GoogleAppsScript.Spreadsheet.Sheet;

// One row per data record after pulling from a sheet. Keys are the
// camelCased column headers; values are whatever the cells contained.
type SheetRow = Record<string, any>;

function onOpen(): void {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("Volunteer Tools")
    .addItem("Assign volunteers", "runAssignVolunteers")
    .addToUi();
  ui.createMenu("Danger")
    .addItem("Clear / Re-generate assignments", "runGenerateAssignments")
    .addToUi();
}

function runGenerateAssignments(): void {
  const assignmentsSheet = getSheet("Assignments");
  const assignments = generateAssignments();
  pushObjArrayToSheet(assignmentsSheet, assignments);
  debugPrint("people", JSON.stringify(getVolunteers()), 1);
  debugPrint("assignments", JSON.stringify(getAssignments()), 2);
  assignmentsSheet.activate();
}

function debugPrint(name: string, x: string, col: number): void {
  const debugSheet = getSheet("Debug");

  const chunks: string[] = [];
  const chunkSize = 50000;
  for (let i = 0; i < x.length; i += chunkSize) {
    chunks.push(x.slice(i, i + chunkSize));
  }

  // Write all chunks into the sheet at once (faster than one-by-one).
  const data = chunks.map((chunk) => [chunk]);
  debugSheet.getRange(1, col).setValue(name);
  debugSheet.getRange(2, col, data.length, 1).setValues(data);
}

function runAssignVolunteers(): void {
  const assignmentsSheet = getSheet("Assignments");

  const people = getVolunteers();
  const assignments = getAssignments().map((i) => ({
    ...i,
    sameDayAssigned: false,
  }));

  debugPrint("people", JSON.stringify(people), 1);
  debugPrint("assignments", JSON.stringify(assignments), 2);

  const newAssignments = assign(assignments, people);

  pushObjArrayToSheet(assignmentsSheet, newAssignments);
  assignmentsSheet.activate();
}

function getSheet(sheet_name: string): Sheet {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheet_name);
  if (!sheet) {
    throw new Error(`Sheet named '${sheet_name}' not found!`);
  }
  return sheet;
}

function lookupTimeId(t: string): number | undefined {
  return ({ AM: 0, PM: 2, "AM, PM": 1, "AM,PM": 1 } as Record<string, number>)[
    t
  ];
}

function lookupDayId(d: number): number | undefined {
  return ({ 1: 2, 2: 3, 3: 5, 4: 7 } as Record<number, number>)[d];
}

function generateAssignments(): SheetRow[] {
  const jobs = getJobs();

  const shifts = getShifts().map((i): SheetRow => ({
    ...i,
    timePriority: lookupTimeId(i.timeCategory),
  }));

  const jobLookup = Object.fromEntries(jobs.map((j) => [j.jobName, j]));

  const shiftsXJobs = shifts.map((s): SheetRow => ({
    ...s,
    shiftStartNum: new Date(s.shiftStart).getHours(),
    ...jobLookup[s.jobName],
  }));

  const shiftsXJobsXpeople = shiftsXJobs.flatMap((s) =>
    Array.from({ length: s.peopleShift }, (_, i): SheetRow => ({ ...s, person: i + 1 }))
  );

  const shiftsXJobsXpeopleXDays = shiftsXJobsXpeople.flatMap((s) =>
    Array.from({ length: s.days }, (_, i): SheetRow => ({
      ...s,
      day: i + 1,
      dayId: lookupDayId(i + 1),
    }))
  );

  return shiftsXJobsXpeopleXDays;
}

function getJobs(): SheetRow[] {
  return objArrayFromSheet(getSheet("Jobs")).map((i, idx) => ({
    ...i,
    jobPriority: idx,
  }));
}

function getShifts(): SheetRow[] {
  return objArrayFromSheet(getSheet("Shifts"));
}

function getVolunteers(): Person[] {
  const jobs = getJobs();

  // Throws via `!` if the qualification name doesn't match any job —
  // same crash the original JS would produce on `.jobPriority` of
  // undefined. The sheet is expected to keep these in sync.
  const lookupPriority = (name: string): number =>
    jobs.find((i) => i.jobName === name)!.jobPriority;

  return objArrayFromSheet(getSheet("Volunteers")).map((i) => ({
    ...i,
    timeId: lookupTimeId(i.timePreference),
    specialQualificationsIds:
      i.specialQualifications === ""
        ? []
        : i.specialQualifications.split(", ").map(lookupPriority),
  })) as Person[];
}

function getAssignments(): Assignment[] {
  return objArrayFromSheet(getSheet("Assignments"), 3) as Assignment[];
}

function objArrayFromSheet(sheet: Sheet, sizeCol: number = 0): SheetRow[] {
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  const nJobs = sizeIgnoringEmptyEnd(values.map((i) => i[sizeCol]));
  const nProps = sizeIgnoringEmptyEnd(values[nJobs - 1]);

  const props = values[0].slice(0, nProps).map(toCamelCase);

  return values.slice(1, nJobs).map((row) =>
    Object.fromEntries(row.slice(0, nProps).map((p, idx) => [props[idx], p]))
  );
}

function pushObjArrayToSheet(sheet: Sheet, objArray: SheetRow[]): void {
  const headersRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  const headers = headersRange.getValues()[0].map(toCamelCase);

  const values = objArray.map((obj) => headers.map((header) => obj[header]));

  sheet
    .getRange(2, 1, sheet.getMaxRows() - 1, sheet.getLastColumn())
    .clearContent();
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

function toCamelCase(name: unknown): string {
  return String(name)
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join("");
}

function sizeIgnoringEmptyEnd(arr: any[]): number {
  let size = arr.length;
  while (size > 0 && !arr[size - 1]) {
    size--;
  }
  return size;
}
