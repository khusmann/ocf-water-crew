import { priorityComparison } from "./themjs.mjs";
import assert from "assert";

{
  const a = {
    a: 1,
    b: 2,
    c: 3,
  };
  const b = {
    a: 2,
    b: 1,
    c: 3,
  };

  assert.strictEqual(priorityComparison(["a", "b"])(a, b), -1);
  assert.strictEqual(priorityComparison(["c", "b"])(a, b), 1);
  assert.strictEqual(priorityComparison(["c", "a"])(a, b), -1);
}

{
  const a = {
    a: [1],
    b: [2],
    c: [3],
  };
  const b = {
    a: [2],
    b: [1],
    c: [3],
  };
  assert.strictEqual(priorityComparison(["a", "b"])(a, b), -1);
  assert.strictEqual(priorityComparison(["c", "b"])(a, b), 1);
  assert.strictEqual(priorityComparison(["c", "a"])(a, b), -1);
}

console.log("All tests passed!");
