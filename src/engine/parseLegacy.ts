// Boundary parser: legacy src/types.ts shapes (as produced by
// src/sheet.ts) → canonical engine inputs. Drops the redundant /
// unused legacy fields enumerated in dev/NEW_SYSTEM.md §1.1. The
// numeric qualification id space is bridged to opaque strings by
// stringification — both Person.specialQualificationsIds[i] and
// Assignment.jobPriority (when special) are stringified so the
// engine's equality check lines up.
import type {
  Person as LegacyPerson,
  Assignment as LegacyAssignment,
} from "../types.ts";
import type {
  Person as CanonicalPerson,
  Assignment as CanonicalAssignment,
  TimeWindow,
} from "./types.ts";

function personTimeWindow(p: LegacyPerson): TimeWindow {
  switch (p.timePreference) {
    case "AM":
      return "AM";
    case "PM":
      return "PM";
    case "AM, PM":
    case "PM, AM":
      return "EITHER";
    case "":
      return "EITHER";
  }
}

function slotTimeWindow(a: LegacyAssignment): TimeWindow {
  switch (a.timePriority) {
    case 0:
      return "AM";
    case 2:
      return "PM";
    case 1:
      return "EITHER";
    default:
      return "EITHER";
  }
}

function canonicalName(p: LegacyPerson): string {
  return `${p.first} ${p.last} ${p.nickname}`.trim();
}

export function parseLegacyPerson(p: LegacyPerson): CanonicalPerson {
  return {
    name: canonicalName(p),
    timePreference: personTimeWindow(p),
    qualifications: p.specialQualificationsIds.map((id) => String(id)),
  };
}

export function parseLegacyAssignment(
  a: LegacyAssignment
): CanonicalAssignment {
  return {
    jobName: a.jobName,
    jobPriority: a.jobPriority,
    ...(a.special ? { requiredQualification: String(a.jobPriority) } : {}),
    day: a.day,
    startHour: a.shiftStartNum,
    durationHours: a.hrsShift,
    timeWindow: slotTimeWindow(a),
    stagedVolunteer: a.stagedVolunteer ?? "",
  };
}

export function parseLegacy(
  assignments: LegacyAssignment[],
  people: LegacyPerson[]
): {
  assignments: CanonicalAssignment[];
  people: CanonicalPerson[];
} {
  return {
    assignments: assignments.map(parseLegacyAssignment),
    people: people.map(parseLegacyPerson),
  };
}
