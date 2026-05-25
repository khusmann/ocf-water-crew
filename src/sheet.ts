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
  const days = Array.from(new Set(rows.map((r) => r.day))).sort((a, b) => a - b);

  // Columns: union of (start-of-day minutes, hrsShift) pairs across the job.
  const shiftCols = new Map<string, { start: any; hrs: number; minutes: number }>();
  for (const r of rows) {
    const minutes = timeOfDayMinutes(r.shiftStart);
    const key = `${minutes}|${r.hrsShift}`;
    if (!shiftCols.has(key)) {
      shiftCols.set(key, { start: r.shiftStart, hrs: r.hrsShift, minutes });
    }
  }
  const cols = Array.from(shiftCols.values()).sort((a, b) => a.minutes - b.minutes);

  const cellMap = new Map<string, Assignment[]>();
  for (const r of rows) {
    const key = `${r.day}|${timeOfDayMinutes(r.shiftStart)}|${r.hrsShift}`;
    let list = cellMap.get(key);
    if (!list) {
      list = [];
      cellMap.set(key, list);
    }
    list.push(r);
  }

  const headerCells = cols
    .map((c) => `<th>${escapeHtml(shiftRangeLabel(c.start, c.hrs))}</th>`)
    .join("");
  const bodyRows = days
    .map((d) => {
      const tds = cols
        .map((c) => {
          const list = (cellMap.get(`${d}|${c.minutes}|${c.hrs}`) ?? [])
            .slice()
            .sort((a, b) => a.person - b.person);
          const names = list
            .map((a) => escapeHtml(volunteerName(a)))
            .join("<br>");
          return `<td>${names}</td>`;
        })
        .join("");
      return `<tr><th class="day">${escapeHtml(dayLabel(d))}</th>${tds}</tr>`;
    })
    .join("\n");

  return `<section class="page">
    <h1 class="title" style="background:${titleColor(jobName)}">${escapeHtml(jobName)}</h1>
    <table class="grid">
      <thead><tr><th class="corner"></th>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </section>`;
}

function renderCartsShiftPages(rows: Assignment[]): string[] {
  const color = titleColor("Carts");
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
      const items = group
        .map((a) => `<li>${escapeHtml(volunteerName(a))}</li>`)
        .join("\n");
      return `<section class="page">
      <h1 class="title" style="background:${color}">Carts &mdash; ${escapeHtml(dayLabel(head.day))} ${escapeHtml(shiftRangeLabel(head.shiftStart, head.hrsShift))}</h1>
      <ul class="roster">${items}</ul>
    </section>`;
    });
}

function titleColor(name: string): string {
  // Stable hash → pastel palette. Light enough for black text to read.
  const palette = [
    "#b6cdec", "#c4e3b6", "#f5e6a3", "#f5c6d8",
    "#d4c5e8", "#f7d4b6", "#b6e3d4", "#f5b6b6",
    "#b6e3e8", "#e8d4b6", "#e0b6e8", "#d0e8b6",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(h) % palette.length];
}

function dayLabel(day: number): string {
  return (
    ({ 1: "Thursday", 2: "Friday", 3: "Saturday", 4: "Sunday" } as Record<
      number,
      string
    >)[day] ?? `Day ${day}`
  );
}

function shiftRangeLabel(start: any, hrs: number): string {
  if (!start) return "";
  const d = new Date(start);
  const end = new Date(d.getTime() + hrs * 60 * 60 * 1000);
  return `${formatHourCompact(d)} - ${formatHourCompact(end)}`;
}

function formatHourCompact(d: Date): string {
  // "7:00 AM" → "7am", "12:30 PM" → "12:30pm"
  const raw = Utilities.formatDate(d, Session.getScriptTimeZone(), "h:mm a");
  const [time, ampm] = raw.split(" ");
  const [h, m] = time.split(":");
  const suffix = ampm.toLowerCase();
  return m === "00" ? `${h}${suffix}` : `${h}:${m}${suffix}`;
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
  body { font-family: -apple-system, system-ui, "Segoe UI", Arial, sans-serif; margin: 0; color: #000; background: #eee; }
  .toolbar { position: sticky; top: 0; z-index: 1; background: #f5f5f5; padding: 8px 12px; border-bottom: 1px solid #ccc; }
  .toolbar button { font-size: 14px; padding: 6px 16px; cursor: pointer; }
  .pages { padding: 16px; }
  .page { background: #fff; padding: 24px; margin: 0 auto 16px; max-width: 9in; border: 1px solid #ddd; }
  .title { margin: 0; padding: 12px; font-size: 22px; font-weight: bold; text-align: center; background: #b6cdec; border: 1px solid #888; border-bottom: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.grid th, table.grid td { border: 1px solid #888; padding: 14px 16px; vertical-align: middle; font-size: 15px; line-height: 1.6; }
  table.grid thead th { text-align: center; font-weight: bold; background: #fff; }
  table.grid th.corner { width: 130px; background: #fff; border-top: none; border-left: none; }
  table.grid th.day { width: 130px; text-align: center; font-weight: bold; background: #fff; }
  table.grid td { min-height: 70px; height: 70px; }
  ul.roster { list-style: none; padding: 0; margin: 0; border: 1px solid #888; border-top: none; }
  ul.roster li { padding: 14px 16px; border-bottom: 1px solid #888; font-size: 16px; }
  ul.roster li:last-child { border-bottom: none; }
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
