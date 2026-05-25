import { assign } from "./scheduler.js";
import type { Person, Assignment } from "./types.ts";

type Sheet = GoogleAppsScript.Spreadsheet.Sheet;

// One row per data record after pulling from a sheet. Keys are the
// camelCased column headers; values are whatever the cells contained.
type SheetRow = Record<string, any>;

function onOpen(): void {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("Volunteer Tools")
    .addItem("Assign volunteers", "runAssignVolunteers")
    .addItem("Print assignments", "runPrintAssignments")
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

function runPrintAssignments(): void {
  const html = buildPrintHtml(getAssignments());
  const output = HtmlService.createHtmlOutput(html)
    .setWidth(1000)
    .setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(output, "Print assignments");
}

function buildPrintHtml(assignments: Assignment[]): string {
  const byJob = new Map<string, Assignment[]>();
  for (const a of assignments) {
    let list = byJob.get(a.jobName);
    if (!list) {
      list = [];
      byJob.set(a.jobName, list);
    }
    list.push(a);
  }

  // Jobs print in jobPriority order; rows within a group share the same priority.
  const jobNames = Array.from(byJob.keys()).sort(
    (a, b) => byJob.get(a)![0].jobPriority - byJob.get(b)![0].jobPriority
  );

  const pages: string[] = [];
  for (const name of jobNames) {
    const rows = byJob.get(name)!;
    if (name === "Carts") {
      pages.push(...renderCartsShiftPages(rows));
    } else {
      pages.push(renderJobPage(name, rows));
    }
  }

  return wrapPrintDocument(pages.join("\n"));
}

function renderJobPage(jobName: string, rows: Assignment[]): string {
  const sorted = rows.slice().sort(
    (a, b) =>
      a.day - b.day ||
      timeOfDayMinutes(a.shiftStart) - timeOfDayMinutes(b.shiftStart) ||
      a.person - b.person
  );
  const body = sorted
    .map(
      (a) => `<tr>
      <td>Day ${a.day}</td>
      <td>${escapeHtml(formatShiftTime(a.shiftStart))}</td>
      <td>${a.hrsShift}h</td>
      <td class="slot">#${a.person}</td>
      <td class="name">${escapeHtml(volunteerName(a))}</td>
    </tr>`
    )
    .join("\n");
  return `<section class="page">
    <h1>${escapeHtml(jobName)}</h1>
    <table>
      <thead><tr><th>Day</th><th>Start</th><th>Hours</th><th>Slot</th><th>Volunteer</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </section>`;
}

function renderCartsShiftPages(rows: Assignment[]): string[] {
  // One page per (day, shiftStart) combination.
  const shifts = new Map<string, Assignment[]>();
  for (const a of rows) {
    const key = `${String(a.day).padStart(2, "0")}|${shiftTimeKey(a.shiftStart)}`;
    let list = shifts.get(key);
    if (!list) {
      list = [];
      shifts.set(key, list);
    }
    list.push(a);
  }
  return Array.from(shifts.keys())
    .sort()
    .map((k) => {
      const group = shifts.get(k)!.slice().sort((a, b) => a.person - b.person);
      const head = group[0];
      const body = group
        .map(
          (a) => `<tr>
        <td class="slot">#${a.person}</td>
        <td class="name">${escapeHtml(volunteerName(a))}</td>
      </tr>`
        )
        .join("\n");
      return `<section class="page">
      <h1>Carts &mdash; Day ${head.day} &middot; ${escapeHtml(formatShiftTime(head.shiftStart))}</h1>
      <p class="sub">${head.hrsShift}h shift</p>
      <table>
        <thead><tr><th>Slot</th><th>Volunteer</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </section>`;
    });
}

function volunteerName(a: Assignment): string {
  return a.assignedVolunteer || a.stagedVolunteer || "—";
}

function timeOfDayMinutes(t: any): number {
  if (!t) return 0;
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
}

function shiftTimeKey(t: any): string {
  if (!t) return "00:00";
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatShiftTime(t: any): string {
  if (!t) return "";
  const d = new Date(t);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "h:mm a");
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapPrintDocument(body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, system-ui, "Segoe UI", sans-serif; margin: 0; color: #111; background: #eee; }
  .toolbar { position: sticky; top: 0; z-index: 1; background: #f5f5f5; padding: 8px 12px; border-bottom: 1px solid #ccc; }
  .toolbar button { font-size: 14px; padding: 6px 16px; cursor: pointer; }
  .pages { padding: 16px; }
  .page { background: #fff; padding: 32px; margin: 0 auto 16px; max-width: 720px; border: 1px solid #ddd; }
  .page h1 { margin: 0 0 4px; font-size: 24px; }
  .page .sub { margin: 0 0 14px; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #eee; }
  th { background: #f0f0f0; font-weight: 600; }
  td.slot { width: 64px; color: #555; }
  td.name { font-weight: 500; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .pages { padding: 0; }
    .page { border: none; padding: 0.5in; max-width: none; margin: 0; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    @page { size: letter; margin: 0; }
  }
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">Print</button></div>
<div class="pages">${body}</div>
</body>
</html>`;
}
