// Unit tests for the rules engine itself, against stub rule sets.
// Decoupled from the production currentRules/targetRules definitions
// so engine bugs surface here rather than as confusing snapshot drift.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runEngine,
  defineRuleSet,
  mulberry32,
  type Assignment,
  type AssignmentRule,
  type Person,
  type SortingRule,
} from "../src/engine.ts";

const passEverything: AssignmentRule = {
  name: "pass",
  priority: 0,
  test: () => true,
};

const noTies: SortingRule = {
  name: "alpha",
  priority: 0,
  compare: (a, b) => a.name.localeCompare(b.name),
};

function alice(): Person {
  return { name: "Alice", timePreference: "EITHER", qualifications: [] };
}
function bob(): Person {
  return { name: "Bob", timePreference: "EITHER", qualifications: [] };
}
function slot(overrides: Partial<Assignment> = {}): Assignment {
  return {
    jobName: "Carts",
    jobPriority: 0,
    day: 1,
    startHour: 6,
    durationHours: 8,
    timeWindow: "AM",
    stagedVolunteer: "",
    ...overrides,
  };
}

test("defineRuleSet rejects rule sets with no priority-0 floor", () => {
  assert.throws(
    () =>
      defineRuleSet({
        name: "noFloor",
        assignmentRules: [{ ...passEverything, priority: 1 }],
        sortingRules: [noTies],
      }),
    /no priority-0 assignment rule/
  );
});

test("defineRuleSet rejects sorting rules with duplicate priorities", () => {
  assert.throws(
    () =>
      defineRuleSet({
        name: "dupSort",
        assignmentRules: [passEverything],
        sortingRules: [noTies, { ...noTies, name: "alpha2" }],
      }),
    /duplicate sorting-rule priority/
  );
});

test("runEngine places single slot using only a floor rule", () => {
  const rs = defineRuleSet({
    name: "minimal",
    assignmentRules: [passEverything],
    sortingRules: [noTies],
  });
  const out = runEngine(rs, [slot()], [alice(), bob()]);
  assert.equal(out.length, 1);
  assert.equal(out[0].assignedVolunteer, "Alice");
  assert.deepEqual(out[0].brokenRules, []);
});

test("runEngine sorts slots by [jobPriority, day, startHour, jobName]", () => {
  const rs = defineRuleSet({
    name: "minimal",
    assignmentRules: [passEverything],
    sortingRules: [noTies],
  });
  // Intentionally scrambled input order
  const slots = [
    slot({ jobName: "B", day: 2, startHour: 10 }),
    slot({ jobName: "A", day: 2, startHour: 10 }),
    slot({ jobName: "Z", day: 1, startHour: 14 }),
    slot({ jobName: "Z", day: 1, startHour: 6 }),
  ];
  const out = runEngine(rs, slots, [alice(), bob()]);
  assert.deepEqual(
    out.map((s) => [s.jobName, s.day, s.startHour]),
    [
      ["Z", 1, 6],
      ["Z", 1, 14],
      ["A", 2, 10],
      ["B", 2, 10],
    ]
  );
});

test("runEngine copies staged volunteers verbatim and bumps their counters", () => {
  const rs = defineRuleSet({
    name: "minimal",
    assignmentRules: [passEverything],
    sortingRules: [noTies],
  });
  const out = runEngine(
    rs,
    [
      slot({ jobName: "Carts", stagedVolunteer: "Bob" }),
      slot({ jobName: "Carts", day: 2 }),
    ],
    [alice(), bob()]
  );
  assert.equal(out[0].assignedVolunteer, "Bob");
  // Alice should win slot 2 (Bob has 1 shift already)
  const rs2 = defineRuleSet({
    name: "shiftCount",
    assignmentRules: [passEverything],
    sortingRules: [
      {
        name: "fewer-shifts",
        priority: 0,
        compare: (a, b, { stateOf }) =>
          stateOf(a).shiftsPlaced - stateOf(b).shiftsPlaced,
      },
      { ...noTies, priority: 1 },
    ],
  });
  const out2 = runEngine(
    rs2,
    [
      slot({ jobName: "Carts", stagedVolunteer: "Bob" }),
      slot({ jobName: "Carts", day: 2 }),
    ],
    [alice(), bob()]
  );
  assert.equal(out2[1].assignedVolunteer, "Alice");
});

test("runEngine records dropped-rule failures in brokenRules", () => {
  const onlyOnDay2: AssignmentRule = {
    name: "only-day-2",
    priority: 1,
    test: ({ slot }) => slot.day === 2,
  };
  const rs = defineRuleSet({
    name: "drop",
    assignmentRules: [passEverything, onlyOnDay2],
    sortingRules: [noTies],
  });
  const out = runEngine(rs, [slot({ day: 1 })], [alice()]);
  assert.equal(out[0].assignedVolunteer, "Alice");
  assert.deepEqual(out[0].brokenRules, ["only-day-2"]);
});

test("runEngine annotates staged-slot rule failures into brokenRules", () => {
  const oneShiftPerDay: AssignmentRule = {
    name: "one-shift-per-day",
    priority: 1,
    test: ({ slot, state }) => !state.daysWorked.has(slot.day),
  };
  const rs = defineRuleSet({
    name: "stagedFail",
    assignmentRules: [passEverything, oneShiftPerDay],
    sortingRules: [noTies],
  });
  const out = runEngine(
    rs,
    [
      slot({ day: 1, startHour: 6, stagedVolunteer: "Alice" }),
      slot({ day: 1, startHour: 14, stagedVolunteer: "Alice" }),
    ],
    [alice()]
  );
  assert.deepEqual(out[0].brokenRules, []);
  assert.deepEqual(out[1].brokenRules, ["one-shift-per-day"]);
});

test("runEngine without rng picks the first survivor (stable order)", () => {
  const rs = defineRuleSet({
    name: "stable",
    assignmentRules: [passEverything],
    sortingRules: [
      {
        name: "tie",
        priority: 0,
        compare: () => 0,
      },
    ],
  });
  const out = runEngine(rs, [slot()], [alice(), bob()]);
  // First survivor wins because everything ties
  assert.equal(out[0].assignedVolunteer, "Alice");
});

test("runEngine with rng picks uniformly from the top tied group", () => {
  const rs = defineRuleSet({
    name: "tied",
    assignmentRules: [passEverything],
    sortingRules: [
      {
        name: "tie",
        priority: 0,
        compare: () => 0,
      },
    ],
  });
  // mulberry32(1)() ≈ 0.627, so Math.floor(0.627 * 2) = 1 → Bob wins.
  // (no-rng would have picked Alice — see the prior test.)
  const rng = mulberry32(1);
  const out = runEngine(rs, [slot()], [alice(), bob()], { rng });
  assert.equal(out[0].assignedVolunteer, "Bob");
});

test("mulberry32 is deterministic and bounded in [0,1)", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});

test("priority-0 floor rule that fails leaves the slot empty", () => {
  const rs = defineRuleSet({
    name: "nofit",
    assignmentRules: [
      {
        name: "no-one-qualifies",
        priority: 0,
        test: () => false,
      },
    ],
    sortingRules: [noTies],
  });
  const out = runEngine(rs, [slot()], [alice(), bob()]);
  assert.equal(out[0].assignedVolunteer, "");
  assert.deepEqual(out[0].brokenRules, []);
});
