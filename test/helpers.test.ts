import { test } from "node:test";
import assert from "node:assert/strict";
import { priorityComparison } from "../src/scheduler.ts";

test("priorityComparison: scalar keys, lexicographic on first differing", () => {
  const a = { a: 1, b: 2, c: 3 };
  const b = { a: 2, b: 1, c: 3 };

  assert.strictEqual(priorityComparison(["a", "b"])(a, b), -1);
  assert.strictEqual(priorityComparison(["c", "b"])(a, b), 1);
  assert.strictEqual(priorityComparison(["c", "a"])(a, b), -1);
});

test("priorityComparison: array-valued keys use array minimum", () => {
  const a = { a: [1], b: [2], c: [3] };
  const b = { a: [2], b: [1], c: [3] };

  assert.strictEqual(priorityComparison(["a", "b"])(a, b), -1);
  assert.strictEqual(priorityComparison(["c", "b"])(a, b), 1);
  assert.strictEqual(priorityComparison(["c", "a"])(a, b), -1);
});
