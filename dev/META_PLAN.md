# META_PLAN — rules-engine rewrite

A plan-of-the-plan. This is the next phase after the work tracked in
[PLAN.md](PLAN.md): replace the four-nested-loops + `constraintRestrictionLevel`
machinery in `src/scheduler.ts` (see [CURRENT.md](CURRENT.md) §5) with a
declarative rules engine driven by a config file.

Two work products feed it:

1. **`dev/NEW_SYSTEM.md`** — the rule-DSL design (Step 1).
2. **A rewrite plan** — separate doc, written after Step 1 is settled
   (Step 2).

Execution comes after that and is not designed here.

Rules are expressed **in TypeScript**, not JSON — a typed DSL where each
rule is (or wraps) a function. This gets us type-checked predicates,
editor-completion on the data model, and trivial composition. A "config"
in this doc means "a TS module that builds a rule set", not a config
file.

---

## Target algorithm

```
1. Initialize per-assignment output state: clear assignedVolunteer
   from any prior run, set brokenRules to []. (stagedVolunteer is
   input, untouched.)
2. Sort assignments by job priority — most important jobs filled first.
3. Copy staged volunteers into their assignments; bump each person's
   running counters (shifts placed, days worked, hours assigned).
4. Place open assignments with all assignment rules active. For each
   still-open slot:
     a. Filter people through the currently-active assignment rules.
     b. Sort survivors by the people-sorting rules.
     c. Pick from the top-tied group (stable order, or RNG per engine
        parameter).
     d. Record any *dropped* rules the chosen (person, slot) pair
        would have failed in brokenRules.
5. Drop the highest-priority-number group of assignment rules. (Rules
   sharing that priority drop together — non-distinct priorities.)
6. Repeat step 4 on still-open slots.
7. Continue 5–6 until only the rule set's floor remains active.
8. Done. Any slot the floor couldn't fill stays empty
   (assignedVolunteer === "").
```

The **floor** is whatever rules are still active after all relaxable levels
have been dropped. For the current-rules rule set, the floor is
qualification + max-shifts (matching the current brute-force pass — see
[CURRENT.md](CURRENT.md) §5f). For the target-rules rule set, the floor is
the priority-0 rules (qualification + same-start-time + ≥1 hr rest gap);
slots that can't satisfy these stay empty.

`brokenRules` is set **inline during placement** (step 4d), not as a
separate post-pass. It replaces the legacy `nonIdealShiftTaken` /
`sameDayAssigned` / `doubleShiftTaken` flags. The UI consumes it as
"this volunteer didn't get their time preference", "this slot had to
break the one-shift-per-day rule", etc.

---

## Two kinds of rules

Rules are specified via config (JSON). There are two types:

**Assignment rules** — gate whether a person *can* take a slot.
Non-distinct priority (multiple rules may share a priority and are relaxed
as a group). Priority `0` = unbreakable.

**People-sorting rules** — comparators that rank candidates inside the
qualified pool. Distinct priority. Priority `0` = strictest tiebreaker.

People-sorting rules express the *order in which we are willing to
compromise* — i.e. the priorities of an ideal assignment.

---

## Target rule set (the one the new system must support)

**Assignment rules:**

| Rule | Priority |
|------|----------|
| No two shifts with the same start time | 0 |
| Sequential shifts must have ≥ 1 hour between end and next start | 0 |
| At most one shift per day | 1 |
| Sequential shifts must have ≥ 8 hours between end and next start | 1 |
| At most 4 shifts per person | 2 |
| Person gets their time preference | 3 |

**People-sorting rules:**

| Rule | Priority |
|------|----------|
| Every person gets ≥ 2 assignments *(not yet implemented)* | 0 |
| Fewer shifts placed first | 1 |
| Fewer days assigned first | 2 |
| Time preference (PM → AM/PM → AM) | 3 |
| Among qualified specialists, fewer qualifications first | 4 |

The current hard-coded rules in `scheduler.ts` are a *subset* of these — the
config format must be able to express both.

---

## Decisions locked in

- **Rule expression**: TS DSL. Rules are typed objects that wrap a
  predicate (assignment rule) or a comparator (people-sorting rule).
- **Unfillable slots**: brute-force fill, matching current behavior
  ([CURRENT.md](CURRENT.md) §5f). Reproducible against Phase-2 snapshots.
- **Qualification matching**: expressed as a level-0 assignment rule, not
  a structural pre-filter. The rule reads
  `!assignment.special || person.specialQualificationsIds.includes(assignment.jobPriority)`
  — i.e. for "general" jobs (`special: false`, e.g. Carts, Fountain
  Sanitizer, Hot Spot Duster, Morning Foliage Duster) the rule passes for
  everyone; for "special" jobs the person must hold the matching
  qualification id. No new data-model field needed; `assignment.special`
  already carries this. The bucket-duplication trick from §5c step 8
  falls out for free — a specialist passes the rule on any general job
  via short-circuit — so the engine evaluates rules against the full
  people pool per assignment, not bucket-by-bucket.
- **Relaxation tracking**: each output assignment carries a
  `brokenRules: string[]` (rule names that had to be relaxed to place
  this person). Replaces the ad-hoc `nonIdealShiftTaken` /
  `sameDayAssigned` / `doubleShiftTaken` booleans entirely — no
  backwards-compat shim (per [CLAUDE.md](../.claude/CLAUDE.md)).
- **Engine flow per assignment**: filter people through currently-active
  assignment rules → sort survivors by people-sorting rules → pick from
  the top-ranked tie group.
- **Tiebreak among top-ranked candidates**: controlled by an optional
  engine parameter, not a rule. `rng` omitted → stable input order
  (first survivor wins). `rng` given → uniform random among the tied
  group. Rules describe a partial order over candidates; this knob
  describes how the engine resolves whatever ties the rules leave. Use
  a seeded RNG (`mulberry32(0)` or similar) for deterministic tests
  with randomization, omit it entirely for tests that just want stable
  output, and use `Math.random` in production.
- **Brute-force fallback**: expressed *in the rule set* as the final
  relaxation level (where only qualification + max-shifts survive). The
  engine has no special-case logic for it.
- **File layout**: `src/rules/*.ts` for individual rule implementations,
  `src/rulesets/*.ts` for named compositions (`current.ts`, `target.ts`).
  `src/scheduler.ts` becomes a thin driver over the engine + a rule set.

### A note on Phase-2 fixture reproduction

The current algorithm tiebreaks deterministically by **name** (alphabetical,
via `personComparison`). To reproduce Phase-2 snapshots byte-for-byte:

- The **current-rules rule set** adds an explicit lowest-priority sorting
  rule "alphabetical by name" — making the policy match what the current
  algorithm actually does, instead of relying on stable input order.
- Tests run the engine with `rng` omitted; stable order has nothing left
  to break since the by-name rule already fully resolves ties.
- The **target-rules rule set** omits the by-name rule. Tests pass a
  seeded RNG for determinism; production uses an unseeded one.

Note: [bin/anonymize.ts](../bin/anonymize.ts) slugs people in alphabetical
order of the originals, so input order coincidentally equals name order
in the fixtures — meaning "rng omitted + no by-name rule" would *also*
reproduce snapshots today. We still want the explicit by-name rule
because (a) it documents what the current algorithm does and (b) it
won't silently drift if the fixtures are ever rebuilt with shuffled
input.

## Step 1 — design the DSL (`dev/NEW_SYSTEM.md`)

Define:

- The TS types for an assignment rule and a people-sorting rule.
- The type for a rule set (the top-level value the engine consumes).
- A worked **current-rules rule set**: the four-pass / restriction-level
  machinery expressed in the new DSL. Must be expressive enough to
  reproduce the Phase-2 fixture snapshots byte-for-byte.
- A worked **target-rules rule set**: the rules in the tables above.

The diff between those two rule sets is the actual behavior change the
rewrite ships.

## Step 2 — plan the rewrite

A separate doc. Scope:

- Engine internals (how the loop in the "Target algorithm" section above
  becomes typed code).
- How `assign()` becomes a thin driver over the config.
- Migration order: implement engine → run current-rules config against
  Phase-2 fixtures (expect identical snapshots) → migrate the Phase-2
  tests to load configs → add fixtures + snapshots for the new rules.
