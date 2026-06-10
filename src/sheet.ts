import {
  orderCodes,
  runEngine,
  type Assignment,
  type Person,
} from "./engine.ts";
import { currentRules } from "./rulesets.ts";

type Sheet = GoogleAppsScript.Spreadsheet.Sheet;

// One row per data record after pulling from a sheet. Keys are the
// camelCased column headers; values are whatever the cells contained.
type SheetRow = Record<string, any>;

// Columns the generated Assignments tab carries. The code owns this header
// row (writeAssignmentsSheet writes it), so the canonical engine shape is
// the source of truth for the tab's schema — no hand-maintained headers to
// drift. Each header camelCases to a canonical Assignment / PlacedAssignment
// key (plus the derived Codes column).
const ASSIGNMENT_HEADERS = [
  "Job Name",
  "Job Priority",
  "Required Qualification",
  "Day",
  "Start Hour",
  "Duration Hours",
  "Time Window",
  "Staged Volunteer",
  "Assigned Volunteer",
  "Codes",
];

function onOpen(): void {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("Volunteer Tools")
    .addItem("Assign volunteers", "runAssignVolunteers")
    .addItem("Print assignments by job", "runPrintAssignmentsByJob")
    .addItem("Print assignments by volunteer", "runPrintAssignmentsByVolunteer")
    .addToUi();
  ui.createMenu("Danger")
    .addItem("Clear / Re-generate assignments", "runGenerateAssignments")
    .addToUi();
}

function runGenerateAssignments(): void {
  const assignmentsSheet = getSheet("Assignments");
  writeAssignmentsSheet(assignmentsSheet, generateAssignments());
  debugPrint("people", JSON.stringify(getVolunteers()), 1);
  debugPrint("assignments", JSON.stringify(readAssignmentSlots()), 2);
  assignmentsSheet.activate();
}

function debugPrint(name: string, x: string, col: number): void {
  const debugSheet = getOrCreateSheet("Debug");

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
  const slots = readAssignmentSlots();

  debugPrint("people", JSON.stringify(people), 1);
  debugPrint("assignments", JSON.stringify(slots), 2);

  const placed = runEngine(currentRules, slots, people);

  // Project each placement onto the sheet columns: spread the canonical
  // fields and add the human-facing Codes string (ordered, deduped).
  const rows: SheetRow[] = placed.map((p) => ({
    ...p,
    codes: orderCodes(new Set(p.brokenCodes)).join(""),
  }));

  pushObjArrayToSheet(assignmentsSheet, rows);
  assignmentsSheet.activate();
}

function getSheet(sheet_name: string): Sheet {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheet_name);
  if (!sheet) {
    throw new Error(`Sheet named '${sheet_name}' not found!`);
  }
  return sheet;
}

// Like getSheet, but creates the tab if it's missing. Used for the
// Debug dump so a fresh spreadsheet without a Debug tab doesn't abort
// the assignment run.
function getOrCreateSheet(sheet_name: string): Sheet {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(sheet_name) ?? ss.insertSheet(sheet_name);
}

// Person preference → engine TimeWindow. "AM, PM" / "PM, AM" / "" all fold
// to EITHER (the flexible reserve). Was the engine's personTimeWindow.
function personTimeWindow(t: string): Person["timePreference"] {
  if (t === "AM") return "AM";
  if (t === "PM") return "PM";
  return "EITHER";
}

// Shift category → engine TimeWindow. Tolerates both "AM, PM" and the
// no-space "AM,PM" the sheet has historically produced. Was slotTimeWindow.
function slotTimeWindow(t: string): Assignment["timeWindow"] {
  if (t === "AM") return "AM";
  if (t === "PM") return "PM";
  return "EITHER";
}

// Expand the Jobs × Shifts layout into one canonical Assignment row per
// (shift, person-slot, day). `assignedVolunteer` / `Codes` start blank;
// `stagedVolunteer` is hand-entered after generation. Replaces the legacy
// shiftsXJobsX… pipeline; the dropped legacy fields (dayId, person, the
// GS date serial, the numeric timePriority) have no canonical equivalent.
function generateAssignments(): SheetRow[] {
  const jobLookup = Object.fromEntries(getJobs().map((j) => [j.jobName, j]));

  const rows: SheetRow[] = [];
  for (const s of getShifts()) {
    const job = jobLookup[s.jobName];
    const base: SheetRow = {
      jobName: s.jobName,
      jobPriority: job.jobPriority,
      // Qualification token is the job's own name (special jobs only).
      requiredQualification: job.special ? s.jobName : "",
      startHour: new Date(s.shiftStart).getHours(),
      durationHours: s.hrsShift,
      timeWindow: slotTimeWindow(s.timeCategory),
      stagedVolunteer: "",
      assignedVolunteer: "",
      codes: "",
    };
    for (let person = 0; person < s.peopleShift; person++) {
      for (let day = 1; day <= s.days; day++) {
        rows.push({ ...base, day });
      }
    }
  }
  return rows;
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

// Canonical Person rows for the engine. Name is rebuilt from the
// first/last/nickname columns (matching what the staged/assigned cells
// contain); qualifications are the job-name tokens in the comma-joined
// Special Qualifications column.
function getVolunteers(): Person[] {
  return objArrayFromSheet(getSheet("Volunteers")).map((i) => ({
    name: volunteerDisplayName(i),
    timePreference: personTimeWindow(i.timePreference),
    qualifications:
      i.specialQualifications === ""
        ? []
        : String(i.specialQualifications).split(", "),
  }));
}

// The canonical name used to match staged/assigned cells, rebuilt from the
// name-part columns. (NEW: §4.1 would switch this to the Name column once
// it's confirmed to match the staging convention on the live sheet.)
function volunteerDisplayName(row: SheetRow): string {
  return `${row.first} ${row.last} ${row.nickname}`.trim();
}

// Canonical Assignment slots for the engine, read back off the generated
// tab. A blank Required Qualification means "no requirement" (undefined).
function readAssignmentSlots(): Assignment[] {
  return objArrayFromSheet(getSheet("Assignments")).map((r) => ({
    jobName: r.jobName,
    jobPriority: r.jobPriority,
    requiredQualification: r.requiredQualification || undefined,
    day: r.day,
    startHour: r.startHour,
    durationHours: r.durationHours,
    timeWindow: r.timeWindow,
    stagedVolunteer: r.stagedVolunteer || "",
  }));
}

function objArrayFromSheet(sheet: Sheet, sizeCol: number = 0): SheetRow[] {
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  const nJobs = sizeIgnoringEmptyEnd(values.map((i) => i[sizeCol]));
  // Column count comes from the header row, which is always fully
  // populated. Deriving it from a data row drops trailing columns whose
  // last-row cell is empty (e.g. a Codes column the last assignment
  // leaves blank).
  const nProps = sizeIgnoringEmptyEnd(values[0]);

  const props = values[0].slice(0, nProps).map(toCamelCase);

  return values.slice(1, nJobs).map((row) =>
    Object.fromEntries(row.slice(0, nProps).map((p, idx) => [props[idx], p]))
  );
}

// Clears the sheet and writes the code-owned header row + canonical rows.
// Owning the header means the generated tab's schema can't drift out of
// sync with the engine shape.
function writeAssignmentsSheet(sheet: Sheet, objArray: SheetRow[]): void {
  sheet.clearContents();
  sheet
    .getRange(1, 1, 1, ASSIGNMENT_HEADERS.length)
    .setValues([ASSIGNMENT_HEADERS]);
  pushObjArrayToSheet(sheet, objArray);
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

function runPrintAssignmentsByJob(): void {
  const html = buildPrintHtml(readAssignmentRows());
  const output = HtmlService.createHtmlOutput(html)
    .setWidth(1000)
    .setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(output, "Print assignments");
}

function runPrintAssignmentsByVolunteer(): void {
  const html = buildVolunteerScheduleHtml(
    objArrayFromSheet(getSheet("Volunteers")),
    readAssignmentRows()
  );
  const output = HtmlService.createHtmlOutput(html)
    .setWidth(1200)
    .setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(output, "Print assignments by volunteer");
}

// Raw Assignments rows for the print views — keeps every column (incl.
// the display-only Codes string) rather than the engine's canonical
// subset. jobName (column 0) is always populated, so default sizing works.
function readAssignmentRows(): SheetRow[] {
  return objArrayFromSheet(getSheet("Assignments"));
}

function buildVolunteerScheduleHtml(
  volunteers: SheetRow[],
  assignments: SheetRow[]
): string {
  // Index assignments by volunteer name → "day|AM"/"day|PM" → [jobName],
  // and collect the union of broken-rule codes across their shifts.
  const buckets = new Map<string, Map<string, string[]>>();
  const codesByName = new Map<string, Set<string>>();
  for (const a of assignments) {
    const name = String(a.assignedVolunteer || "").trim();
    if (!name) continue;
    const slot = amPmBucket(a);
    if (!slot) continue;
    let cells = buckets.get(name);
    if (!cells) {
      cells = new Map();
      buckets.set(name, cells);
    }
    const key = `${a.day}|${slot}`;
    let list = cells.get(key);
    if (!list) {
      list = [];
      cells.set(key, list);
    }
    if (!list.includes(a.jobName)) list.push(a.jobName);

    let codes = codesByName.get(name);
    if (!codes) {
      codes = new Set();
      codesByName.set(name, codes);
    }
    // Persisted as a concatenated string ("H8S4T"); split back into
    // individual codes (letter + optional digits) to union per person.
    for (const c of String(a.codes ?? "").match(/[A-Z]\d*/g) ?? []) {
      codes.add(c);
    }
  }

  const sorted = volunteers
    .slice()
    .sort(
      (a, b) =>
        String(a.last || "").localeCompare(String(b.last || "")) ||
        String(a.first || "").localeCompare(String(b.first || ""))
    );

  const days = [1, 2, 3, 4];
  const slots: ("AM" | "PM")[] = ["AM", "PM"];

  const colHeaders = days
    .flatMap((d) => slots.map((s) => `${dayShort(d)} ${s}`))
    .map((h) => `<th>${escapeHtml(h)}</th>`)
    .join("");

  const bodyRows = sorted
    .map((v) => {
      const name = volunteerDisplayName(v);
      const cells = buckets.get(name) ?? new Map<string, string[]>();
      let total = 0;
      const slotCells = days
        .flatMap((d) =>
          slots.map((s) => {
            const list = cells.get(`${d}|${s}`) ?? [];
            total += list.length;
            return `<td>${list.map(escapeHtml).join(", ")}</td>`;
          })
        )
        .join("");
      const codes = orderCodes(codesByName.get(name) ?? []).join("");
      return `<tr>
        <td class="id">${escapeHtml(v.first)}</td>
        <td class="id">${escapeHtml(v.last)}</td>
        <td class="id">${escapeHtml(v.nickname)}</td>
        <td class="center">${escapeHtml(prefLabel(v.timePreference))}</td>
        <td class="center swatch" style="background:${shiftCountColor(total)}">${total}</td>
        <td class="center">${escapeHtml(codes)}</td>
        ${slotCells}
      </tr>`;
    })
    .join("\n");

  const body = `<section class="page wide">
    ${codesLegend()}
    <table class="schedule">
      <thead>
        <tr>
          <th>First</th><th>Last</th><th>Nickname</th><th>AM/PM Pref</th><th>Shifts</th><th>Codes</th>
          ${colHeaders}
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </section>`;

  return wrapPrintDocument(body, { landscape: true });
}

// Key for the Codes column. "#" stands for the rule's threshold, which
// rides along in the actual code (e.g. "H9" = under 9h rest).
function codesLegend(): string {
  const items: [string, string][] = [
    ["H#", "under #h rest between shifts"],
    ["D", "second shift same day"],
    ["S#", "over # shifts (max)"],
    ["T", "non-preferred AM/PM"],
    ["Q", "missing required qualification"],
  ];
  const entries = items
    .map(
      ([code, desc]) =>
        `<span class="legend-item"><b>${escapeHtml(code)}</b> ${escapeHtml(desc)}</span>`
    )
    .join("");
  return `<div class="legend"><span class="legend-title">Codes:</span> ${entries}</div>`;
}

function shiftCountColor(n: number): string {
  // Flag under-/fully-loaded volunteers at a glance: ≤1 red, 2 orange,
  // 3 yellow, 4 (the max-shifts cap) green.
  if (n <= 1) return "#f4a6a6";
  if (n === 2) return "#f6c592";
  if (n === 3) return "#f5e6a3";
  return "#bfe3a6";
}

function amPmBucket(a: SheetRow): "AM" | "PM" | null {
  // Each finished assignment occupies a single AM-or-PM column. AM and
  // PM pass straight through; an EITHER (midday) shift straddles noon, so
  // resolve it to a single window by start hour (before noon → AM, noon
  // or later → PM) rather than spanning both.
  const t = a.timeWindow;
  if (t === "AM") return "AM";
  if (t === "PM") return "PM";
  if (t === "EITHER") return a.startHour < 12 ? "AM" : "PM";
  return null;
}

function dayShort(day: number): string {
  return (
    ({ 1: "Thurs", 2: "Fri", 3: "Sat", 4: "Sun" } as Record<number, string>)[
      day
    ] ?? `Day ${day}`
  );
}

function prefLabel(p: string): string {
  if (p === "AM, PM" || p === "PM, AM" || p === "AM,PM") return "AM/PM";
  return p ?? "";
}

function buildPrintHtml(assignments: SheetRow[]): string {
  const byJob = new Map<string, SheetRow[]>();
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

function renderJobPage(jobName: string, rows: SheetRow[]): string {
  const days = Array.from(new Set(rows.map((r) => r.day))).sort((a, b) => a - b);

  // Columns: union of (startHour, durationHours) pairs across the job.
  const shiftCols = new Map<string, { startHour: number; hrs: number }>();
  for (const r of rows) {
    const key = `${r.startHour}|${r.durationHours}`;
    if (!shiftCols.has(key)) {
      shiftCols.set(key, { startHour: r.startHour, hrs: r.durationHours });
    }
  }
  const cols = Array.from(shiftCols.values()).sort(
    (a, b) => a.startHour - b.startHour
  );

  const cellMap = new Map<string, SheetRow[]>();
  for (const r of rows) {
    const key = `${r.day}|${r.startHour}|${r.durationHours}`;
    let list = cellMap.get(key);
    if (!list) {
      list = [];
      cellMap.set(key, list);
    }
    list.push(r);
  }

  const headerCells = cols
    .map((c) => `<th>${escapeHtml(shiftRangeLabel(c.startHour, c.hrs))}</th>`)
    .join("");
  const bodyRows = days
    .map((d) => {
      const tds = cols
        .map((c) => {
          const list = cellMap.get(`${d}|${c.startHour}|${c.hrs}`) ?? [];
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

function renderCartsShiftPages(rows: SheetRow[]): string[] {
  const color = titleColor("Carts");
  // One page per (day, startHour) combination.
  const shifts = new Map<string, SheetRow[]>();
  for (const a of rows) {
    const key = `${String(a.day).padStart(2, "0")}|${String(a.startHour).padStart(2, "0")}`;
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
      const group = shifts.get(k)!;
      const head = group[0];
      const half = Math.ceil(group.length / 2);
      const trs: string[] = [];
      for (let i = 0; i < half; i++) {
        const l = group[i];
        const r = group[i + half];
        const lCell = `<td>${l ? escapeHtml(volunteerName(l)) : ""}</td>`;
        const rCell = `<td>${r ? escapeHtml(volunteerName(r)) : ""}</td>`;
        trs.push(`<tr>${lCell}${rCell}</tr>`);
      }
      return `<section class="page">
      <h1 class="title" style="background:${color}">Carts &mdash; ${escapeHtml(dayLabel(head.day))} ${escapeHtml(shiftRangeLabel(head.startHour, head.durationHours))}</h1>
      <table class="roster"><tbody>${trs.join("\n")}</tbody></table>
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

// "6am - 2pm" from an integer start hour + duration. All shift starts in
// the data are whole hours, so no minutes handling is needed; end wraps
// past midnight via mod 24 (a 20:00 + 8h shift ends "4am").
function shiftRangeLabel(startHour: number, hrs: number): string {
  return `${formatHourCompact(startHour)} - ${formatHourCompact(
    (startHour + hrs) % 24
  )}`;
}

function formatHourCompact(hour: number): string {
  const suffix = hour < 12 ? "am" : "pm";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${suffix}`;
}

function volunteerName(a: SheetRow): string {
  return a.assignedVolunteer || a.stagedVolunteer || "—";
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapPrintDocument(
  body: string,
  opts: { landscape?: boolean } = {}
): string {
  const pageRule = opts.landscape
    ? "@page { size: letter landscape; margin: 0.4in; }"
    : "@page { size: letter; margin: 0; }";
  const printPagePadding = opts.landscape ? "0" : "0.5in";
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
  .page.wide { max-width: 10.5in; }
  .title { margin: 0; padding: 12px; font-size: 22px; font-weight: bold; text-align: center; background: #b6cdec; border: 1px solid #888; border-bottom: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.grid th, table.grid td { border: 1px solid #888; padding: 14px 16px; vertical-align: middle; font-size: 15px; line-height: 1.6; }
  table.grid thead th { text-align: center; font-weight: bold; background: #fff; }
  table.grid th.corner { width: 130px; background: #fff; border-top: none; border-left: none; }
  table.grid th.day { width: 130px; text-align: center; font-weight: bold; background: #fff; }
  table.grid td { min-height: 70px; height: 70px; }
  table.roster { width: 100%; border-collapse: collapse; border: 1px solid #888; border-top: none; table-layout: fixed; }
  table.roster td { padding: 14px 16px; border: 1px solid #888; font-size: 16px; width: 50%; }
  table.schedule { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.schedule tr { page-break-inside: avoid; break-inside: avoid; }
  table.schedule th, table.schedule td { border: 1px solid #888; padding: 4px 6px; vertical-align: middle; }
  table.schedule thead th { background: #d6e4f7; font-weight: bold; text-align: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table.schedule td.id { font-weight: 500; white-space: nowrap; }
  table.schedule td.center { text-align: center; }
  table.schedule td.swatch { font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .legend { font-size: 11px; margin: 0 0 8px; line-height: 1.6; }
  .legend-title { font-weight: bold; }
  .legend-item { margin-right: 14px; white-space: nowrap; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .pages { padding: 0; }
    .page { border: none; padding: ${printPagePadding}; max-width: none; margin: 0; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    ${pageRule}
  }
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">Print</button></div>
<div class="pages">${body}</div>
</body>
</html>`;
}
