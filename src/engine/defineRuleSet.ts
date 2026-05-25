import type { RuleSet } from "./types.ts";

// Validates a rule set at construction time. The engine relies on
// these invariants — see dev/NEW_SYSTEM.md §1.5.
export function defineRuleSet(spec: RuleSet): RuleSet {
  const hasFloor = spec.assignmentRules.some((r) => r.priority === 0);
  if (!hasFloor) {
    throw new Error(
      `RuleSet "${spec.name}" has no priority-0 assignment rule; ` +
        `the engine has no floor to relax to.`
    );
  }

  const seen = new Set<number>();
  for (const rule of spec.sortingRules) {
    if (seen.has(rule.priority)) {
      throw new Error(
        `RuleSet "${spec.name}" has duplicate sorting-rule priority ${rule.priority}; ` +
          `sorting priorities must be pairwise distinct.`
      );
    }
    seen.add(rule.priority);
  }

  return spec;
}
