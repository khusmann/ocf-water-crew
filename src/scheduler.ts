import type {
  Person,
  DecoratedPerson,
  ExpandedPerson,
  Assignment,
  IndexedAssignment,
  ShiftChartEntry,
} from "./types.ts";

// Per-person ceiling on placed shifts (applies at restriction levels
// 0/1/2 and in the brute-force gap-fill pass). Level 3 was intended
// to lift this cap but was never implemented — see CURRENT.md §5e.
const MAX_SHIFTS_PER_PERSON = 4;

// Minimum hours between two shifts assigned to the same person.
// Compared against `assignedHours` entries (each = 24*day + startHour).
// Note: pre-staged shifts don't push to assignedHours, so the gap is
// not enforced against them — see CURRENT.md §6.5.
const MIN_REST_HOURS = 9;

// Comparator that treats arrays as their minimum element, and treats
// undefined / NaN / Infinity as "always loses". Only the sign of the
// return is read downstream, but the original code returns +/-2 for
// the always-loses cases — preserved here.
export const genericCompare = (a: any, b: any): number => {
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

// Lexicographic comparator: first key whose values differ decides.
// Accepts arbitrary string keys so that the (buggy) "ShiftStart" key
// in the final brute-force sort still compiles. See CURRENT.md §6.8.
export const priorityComparison =
  (keyOrder: string[]) =>
  (a: Record<string, any>, b: Record<string, any>): number => {
    for (const key of keyOrder) {
      const result = genericCompare(a[key], b[key]);
      if (result !== 0) {
        return result;
      }
    }
    return 0;
  };

// Comparator over expanded-person rows. Note: accesses .timePriority
// on persons, which persons do not have — that field is always
// undefined here, so the genericCompare line returns 0. Preserving
// as-is per CURRENT.md §6 — Phase 4 will revisit.
// TODO(phase-4): .timePriority is not a person field; this branch is dead.
export const personComparison =
  (shiftsChart: ShiftChartEntry[], dayWanted: number) =>
  (a: ExpandedPerson, b: ExpandedPerson): number => {
    const aShift = shiftsChart.find((person) => person.name == a.name)!;
    const bShift = shiftsChart.find((person) => person.name == b.name)!;
    let result = aShift.shiftsPlaced - bShift.shiftsPlaced;
    if (result == 0) {
      if (aShift.daysWorked != bShift.daysWorked) {
        if (aShift.daysWorked == 1 || aShift.daysWorked % dayWanted != 0) {
          result = 1;
        }
        if (bShift.daysWorked == 1 || bShift.daysWorked % dayWanted != 0) {
          result = -1;
        }
      }
      result = genericCompare((a as any).timePriority, (b as any).timePriority);
      if (result == 0 && a.specialQualsNumber && b.specialQualsNumber) {
        result = genericCompare(a.specialQualsNumber, b.specialQualsNumber) * -1;
      }
    }
    return result;
  };

// Groups by key and interleaves: one from group 1, then group 2, etc.,
// looping through groups in key order until exhausted.
export function distributeSort<T extends Record<string, any>>(
  arr: T[],
  key: string
): T[] {
  const grouped: Record<string, T[]> = arr.reduce((acc, obj) => {
    acc[obj[key]] = acc[obj[key]] || [];
    acc[obj[key]].push(obj);
    return acc;
  }, {} as Record<string, T[]>);

  const sortedKeys = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));
  const result: T[] = [];

  while (result.length < arr.length) {
    for (const k of sortedKeys) {
      if (grouped[k].length > 0) {
        result.push(grouped[k].shift()!);
      }
    }
  }

  return result;
}

// Splits an array into array-of-arrays grouped by the property value.
export function splitByProperty<T extends Record<string, any>>(
  arr: T[],
  property: string
): T[][] {
  return Object.values(
    arr.reduce((acc, obj) => {
      const key = obj[property];
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(obj);
      return acc;
    }, {} as Record<string, T[]>)
  );
}

// If obj[key] is an array, emits one copy of obj per element with
// [key] overwritten to the scalar element. Empty array -> one copy
// with the key set to undefined.
export function expandObjects<T extends Record<string, any>>(
  arr: T[],
  key: string
): T[] {
  return arr.flatMap((obj) =>
    Array.isArray(obj[key])
      ? obj[key].length > 0
        ? obj[key].map((value: any) => ({
            ...obj,
            [key]: value,
          }))
        : [
            {
              ...obj,
              [key]: undefined,
            },
          ]
      : [obj]
  );
}

export function sortPeople(people: Person[]): DecoratedPerson[] {
  return people
    .map((i) => ({
      ...i,
      nonIdealShiftTaken: false,
      doubleShiftTaken: false,
      sameDayAssigned: false,
      name: `${i.first} ${i.last} ${i.nickname}`.trim(),
      specialQualsNumber: i.specialQualificationsIds.length,
    }))
    .sort(priorityComparison(["specialQualificationsIds", "timeId"]));
}

export function sortAssignments(assignments: Assignment[]): IndexedAssignment[] {
  const unsorted: IndexedAssignment[] = assignments
    .sort(priorityComparison(["jobPriority", "timePriority", "day", "person"]))
    .map((i, index) => ({
      index: index + 1,
      ...i,
      nonIdealShiftTaken: false,
      doubleShiftTaken: false,
      sameDayAssigned: false,
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

// problem with assign right now: names are sorted alphabetically, so
// the same people that fill a qualification always get it and people
// with lower lexical order will not. Possible fixes recorded in
// CURRENT.md; behavior preserved as-is for the port.
export function assign(
  assignments: Assignment[],
  people: Person[]
): IndexedAssignment[] {
  const peopleSorted = sortPeople(people);

  const assignmentsSorted = sortAssignments(assignments);
  const shiftsPlacedChart: ShiftChartEntry[] = peopleSorted
    .sort(priorityComparison(["specialQualificationsIds", "timeId", "name"]))
    .map((i) => ({
      name: i.name,
      shiftsPlaced: 0,
      daysWorked: 1,
      assignedHours: [0],
    }));
  const shiftsSorted = expandObjects(
    peopleSorted,
    "specialQualificationsIds"
  ).sort(priorityComparison(["specialQualificationsIds", "timeId", "name"])) as unknown as ExpandedPerson[];

  const uniqueValues = new Set<number>(
    assignments.map((item) => (item.special == false ? -1 : item.jobPriority))
  );
  uniqueValues.delete(-1);
  const specialJobsAmount = uniqueValues.size;

  // contains effects: pushes specialists into the general-jobs bucket.
  // Relies on specialJobsAmount being the index of the general bucket,
  // which only holds when specialty ids are dense 0..N-1. See
  // CURRENT.md §6.11.
  // TODO(phase-4): dense-id assumption is undocumented and brittle.
  const peopleToAssign: ExpandedPerson[][] = splitByProperty(
    shiftsSorted,
    "specialQualificationsIds"
  );
  peopleToAssign.forEach((arr) =>
    arr.forEach((person, index) =>
      index < specialJobsAmount
        ? peopleToAssign[specialJobsAmount].push(person)
        : person
    )
  );

  // start copy staged area to assigned
  // Bug-ish: assignedHours is not updated here, so pre-staged shifts
  // don't count against the 9-hour rest gap. See CURRENT.md §6.5.
  // TODO(phase-4): pre-staged shifts should bump assignedHours.
  const unstagedAssignments: IndexedAssignment[][] = splitByProperty(
    assignmentsSorted.map(function (assignment) {
      const volunteerAssignment: IndexedAssignment = {
        ...assignment,
        assignedVolunteer: assignment.stagedVolunteer,
      };
      const assignedPerson = shiftsPlacedChart.find(
        (person) => person.name === volunteerAssignment.assignedVolunteer
      );
      if (assignedPerson) {
        assignedPerson.shiftsPlaced++;
        if (assignedPerson.daysWorked % assignment.dayId == 0) {
          volunteerAssignment.sameDayAssigned = true;
        }
        assignedPerson.daysWorked =
          assignedPerson.daysWorked * volunteerAssignment.dayId;
      }
      return volunteerAssignment;
    }),
    "jobPriority"
  );

  // start placing assignments
  // edge case of night-before / morning-after double; should check if
  // start time is within X hours. Level 0 = recommended only;
  // 1 = differing timePriority allowed; 2 = differing timePriority AND
  // same-day allowed; 3 = also more than 4 shifts allowed.
  // TODO(phase-4): level 3 is referenced in comments but never coded.
  for (
    let constraintRestrictionLevel = 0;
    constraintRestrictionLevel < 4;
    constraintRestrictionLevel++
  ) {
    for (
      let assignmentIndex = 0, peopleIndex = 0;
      peopleIndex < peopleToAssign.length &&
      assignmentIndex < unstagedAssignments.length;
      assignmentIndex++,
        peopleIndex >= specialJobsAmount ? specialJobsAmount : peopleIndex++
    ) {
      for (
        let a = 0, p = 0;
        a < unstagedAssignments[assignmentIndex].length;
        a++
      ) {
        for (
          let shiftCount = shiftsPlacedChart.find(
            (shift) => shift.name === peopleToAssign[peopleIndex][p].name
          )!;
          !unstagedAssignments[assignmentIndex][a].assignedVolunteer &&
          p < peopleToAssign[peopleIndex].length;
          p++,
            p == peopleToAssign[peopleIndex].length
              ? 1
              : (shiftCount = shiftsPlacedChart.find(
                  (shift) => shift.name === peopleToAssign[peopleIndex][p].name
                )!)
        ) {
          if (
            (unstagedAssignments[assignmentIndex][a].jobPriority ==
              peopleToAssign[peopleIndex][p].specialQualificationsIds ||
              unstagedAssignments[assignmentIndex][a].jobPriority >=
                specialJobsAmount) &&
            ((constraintRestrictionLevel == 0 &&
              shiftCount.shiftsPlaced < MAX_SHIFTS_PER_PERSON &&
              (unstagedAssignments[assignmentIndex][a].timePriority ==
                peopleToAssign[peopleIndex][p].timeId ||
                peopleToAssign[peopleIndex][p].timeId == 1 ||
                unstagedAssignments[assignmentIndex][a].timePriority == 1) &&
              (shiftCount.daysWorked %
                unstagedAssignments[assignmentIndex][a].dayId !=
                0 ||
                shiftCount.daysWorked == 1) &&
              shiftCount.assignedHours.some(
                (number) =>
                  Math.abs(
                    24 * unstagedAssignments[assignmentIndex][a].day +
                      unstagedAssignments[assignmentIndex][a].shiftStartNum -
                      number
                  ) > MIN_REST_HOURS
              )) ||
              (constraintRestrictionLevel == 1 &&
                shiftCount.shiftsPlaced < MAX_SHIFTS_PER_PERSON &&
                (shiftCount.daysWorked %
                  unstagedAssignments[assignmentIndex][a].dayId !=
                  0 ||
                  shiftCount.daysWorked == 1) &&
                shiftCount.assignedHours.some(
                  (number) =>
                    Math.abs(
                      24 * unstagedAssignments[assignmentIndex][a].day +
                        unstagedAssignments[assignmentIndex][a].shiftStartNum -
                        number
                    ) > MIN_REST_HOURS
                )) ||
              (constraintRestrictionLevel == 2 &&
                shiftCount.shiftsPlaced < MAX_SHIFTS_PER_PERSON))
          ) {
            unstagedAssignments[assignmentIndex][a].assignedVolunteer =
              peopleToAssign[peopleIndex][p].name;

            if (
              shiftCount.daysWorked %
                unstagedAssignments[assignmentIndex][a].dayId ==
              0
            ) {
              peopleToAssign[peopleIndex][p].sameDayAssigned = true;
              unstagedAssignments[assignmentIndex][a].sameDayAssigned = true;
            }
            shiftCount.shiftsPlaced++;
            shiftCount.daysWorked =
              shiftCount.daysWorked *
              unstagedAssignments[assignmentIndex][a].dayId;
            shiftCount.assignedHours.push(
              24 * unstagedAssignments[assignmentIndex][a].day +
                unstagedAssignments[assignmentIndex][a].shiftStartNum
            );
            // nonIdealShiftTaken detection bug: the inner !(... || ...)
            // is true only when both sides equal 1 — i.e. both are
            // wildcards. Fires when nothing actually conflicts.
            // See CURRENT.md §6.6.
            // TODO(phase-4): inverted condition; should fire when prefs
            // genuinely conflict, not when both are wildcards.
            if (
              unstagedAssignments[assignmentIndex][a].timePriority !=
                peopleToAssign[peopleIndex][p].timeId &&
              !(
                peopleToAssign[peopleIndex][p].timeId != 1 ||
                unstagedAssignments[assignmentIndex][a].timePriority != 1
              )
            ) {
              unstagedAssignments[assignmentIndex][a].nonIdealShiftTaken = true;
              peopleToAssign[peopleIndex][p].nonIdealShiftTaken = true;
            }
          }
        }
        p = 0;
        peopleToAssign[peopleIndex].sort(
          personComparison(
            shiftsPlacedChart,
            unstagedAssignments[assignmentIndex][a].dayId
          )
        );
      }
    }
  }

  // start bruteForce missingGaps
  const flatPeople = peopleToAssign.flat();

  const flatAssignments = distributeSort(unstagedAssignments.flat(), "day");
  for (let a = 0; a < flatAssignments.length; a++) {
    if (flatAssignments[a].assignedVolunteer == "") {
      for (let p = 0; p < flatPeople.length; p++) {
        const shiftCount = shiftsPlacedChart.find(
          (shift) => shift.name === flatPeople[p].name
        )!;
        if (
          (flatPeople[p].specialQualificationsIds ==
            flatAssignments[a].jobPriority ||
            flatAssignments[a].jobPriority >= specialJobsAmount) &&
          shiftCount.shiftsPlaced < MAX_SHIFTS_PER_PERSON
        ) {
          flatAssignments[a].assignedVolunteer = flatPeople[p].name;
          shiftCount.shiftsPlaced++;
          shiftCount.daysWorked =
            shiftCount.daysWorked * flatAssignments[a].dayId;
          if (
            flatAssignments[a].timePriority != flatPeople[p].timeId &&
            flatPeople[p].timeId != 1 &&
            flatAssignments[a].timePriority != 1
          ) {
            flatAssignments[a].nonIdealShiftTaken = true;
            flatPeople[p].nonIdealShiftTaken = true;
          }
          break;
        }
      }
    }
  }
  // Final sort key includes "ShiftStart" (capital S) which is not a
  // field on these objects, so this key is a no-op. See CURRENT.md §6.8.
  // TODO(phase-4): fix to "shiftStart" (lowercase s) once snapshot suite is in place.
  flatAssignments.sort(
    priorityComparison([
      "jobPriority",
      "timePriority",
      "day",
      "person",
      "ShiftStart",
    ])
  );

  // doubleShiftTaken post-pass attempts are fully commented out in
  // themjs.mjs and intentionally not ported. See CURRENT.md §5g.
  // TODO(phase-4): decide whether to implement doubleShiftTaken at all.

  return flatAssignments;
}
