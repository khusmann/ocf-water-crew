// Data shapes for the water-crew scheduler, hand-derived from the
// live thejson.json. See dev/CURRENT.md §4 for field-by-field notes.

export type TimePreference = "AM" | "PM" | "AM, PM" | "PM, AM" | "";
export type TimeCategory = "AM" | "PM" | "AM, PM" | "AM,PM";
export type VolunteerType = "Staff" | "SOP";

// Input shape as it appears in data/thejson.json's `people` array.
// `timeId` is missing for people whose timePreference is "PM, AM" —
// the sheet-side mapping doesn't produce one for that permutation.
// See CURRENT.md §6.10.
export interface Person {
  first: string;
  last: string;
  nickname: string;
  volunteerType: VolunteerType;
  specialQualifications: string;
  timePreference: TimePreference;
  name: string;
  hoursAssigned: number;
  shifts: number;
  timeId?: number;
  specialQualificationsIds: number[];
}

// Person after sortPeople(): adds output flags, rebuilt name, and
// specialQualsNumber. specialQualificationsIds is still an array here.
export interface DecoratedPerson extends Person {
  nonIdealShiftTaken: boolean;
  doubleShiftTaken: boolean;
  sameDayAssigned: boolean;
  specialQualsNumber: number;
}

// One row per (person, qualification id) after expandObjects(). The
// scheduler treats specialQualificationsIds as a scalar in this form;
// it is `undefined` for people with no qualifications.
export interface ExpandedPerson extends Omit<DecoratedPerson, "specialQualificationsIds"> {
  specialQualificationsIds: number | undefined;
}

// Input shape as it appears in data/thejson.json's `assignments` array.
export interface Assignment {
  stagedVolunteer: string;
  assignedVolunteer: string;
  jobPriority: number;
  jobName: string;
  special: boolean;
  day: number;
  dayId: number;
  shiftStart: string;
  shiftStartNum: number;
  hrsShift: number;
  person: number;
  timePriority: number;
  timeCategory: TimeCategory | string;
  sameDayAssigned: boolean;
  nonIdealShiftTaken: boolean;
  // Concatenated broken-rule codes for this placement (e.g. "H8S4T").
  // Empty when the placement broke no relaxable rule.
  codes?: string;
}

// Assignment after sortAssignments(): adds index and doubleShiftTaken.
export interface IndexedAssignment extends Assignment {
  index: number;
  doubleShiftTaken: boolean;
  codes: string;
}

// Per-person running totals built in the setup phase.
export interface ShiftChartEntry {
  name: string;
  shiftsPlaced: number;
  daysWorked: number;
  assignedHours: number[];
}

// Top-level shape of data/thejson.json.
export interface SchedulerInput {
  people: Person[];
  assignments: Assignment[];
}
