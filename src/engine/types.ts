// Canonical types at the rules-engine boundary. See dev/NEW_SYSTEM.md §1.

export type TimeWindow = "AM" | "PM" | "EITHER";

export type QualificationId = string;

export interface Person {
  name: string;
  timePreference: TimeWindow;
  qualifications: QualificationId[];
}

export interface Assignment {
  jobName: string;
  jobPriority: number;
  requiredQualification?: QualificationId;
  day: number;
  startHour: number;
  durationHours: number;
  timeWindow: TimeWindow;
  stagedVolunteer: string;
}

export interface PlacedAssignment extends Assignment {
  assignedVolunteer: string;
  brokenRules: string[];
}

export interface PersonState {
  shiftsPlaced: number;
  daysWorked: Set<number>;
  assignedShifts: Array<{
    absoluteStartHour: number;
    durationHours: number;
  }>;
}

export interface PlacementContext {
  slot: Assignment;
  person: Person;
  state: PersonState;
}

export interface AssignmentRule {
  name: string;
  priority: number;
  test: (ctx: PlacementContext) => boolean;
}

export interface SortContext {
  slot: Assignment;
  stateOf: (person: Person) => PersonState;
}

export interface SortingRule {
  name: string;
  priority: number;
  compare: (a: Person, b: Person, ctx: SortContext) => number;
}

export interface RuleSet {
  name: string;
  assignmentRules: AssignmentRule[];
  sortingRules: SortingRule[];
}

export interface AssignOptions {
  rng?: () => number;
}
