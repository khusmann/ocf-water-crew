# Water Crew Scheduler — Rules Review

Thanks for helping us check the scheduling rules! You don't need to know
anything about the software — this is all about the **real-world scheduling
judgment**.

The automatic scheduler assigns volunteers to shift slots. Below are the rules
it follows right now, written as everyday situations. For each one, the box
marked **(current)** is what the scheduler does today.

**How to answer:** for each question, put an `x` in the box for the option you
want, and add a note if "current" is close but not quite right. If none of the
options fit, check **Other** and describe it. There's a one-line summary table
at the very end you can also fill in.

A few terms used throughout:

- **Shift windows:** every shift is labeled **Morning**, **Midday**, or
  **Evening**.
- **Volunteer preference:** each volunteer says they prefer **Mornings**,
  **Evenings**, or have **No preference**.
- **"The event"** = the four days (Thursday–Sunday).

---

## Part 1 — Absolute limits (the scheduler will _never_ break these)

These are the hard lines. If honoring them means a slot can't be filled, the
scheduler leaves it empty for a human to sort out (see Q9).

### Q1. One shift per day

> Dana is available all day Saturday. Could the scheduler give Dana **two shifts
> on the same day** (say a Morning and an Evening)?

- [ ] **A. No — never more than one shift per person per day.** _(current)_
- [ ] B. Allow a second shift on the same day only if we're short and can't fill
      it any other way.
- [ ] C. Other:

➤ Notes:

### Q2. Evening, then next morning

> Sam works an **Evening** shift Friday. Could the scheduler give Sam a
> **Morning** shift Saturday (the very next morning)?

- [ ] **A. No — never a morning shift the day after an evening shift.**
      _(current)_
- [ ] B. Allow it if there's enough rest in between (how many hours? \_\_\_\_).
- [ ] C. Allow it only if we're short-staffed.
- [ ] D. Other:

➤ Notes:

### Q2a. Does that overnight rule involve Midday at all? (edge cases)

> Today the rule is _only_ "no Morning right after an Evening." That means:
>
> - Evening Friday → **Midday** Saturday is **allowed**.
> - **Midday** Friday → Morning Saturday is **allowed**.
> - Only Evening → next-Morning is blocked.

- [ ] **A. Correct — only Evening-then-next-Morning is off-limits.** _(current)_
- [ ] B. Also block Evening → next **Midday**.
- [ ] C. Also block **Midday** → next Morning.
- [ ] D. Other:

➤ Notes:

### Q3. Required qualifications

> Some jobs need a qualification (e.g. Lead Plumber). Could someone **without**
> that qualification ever be assigned to such a job?

- [ ] **A. No — never assign someone unqualified.** _(current)_
- [ ] B. Allow it if we're short and no qualified person is available.
- [ ] C. Other:

➤ Notes:

### Q4. The bare-minimum rest gap

> Between the **end** of one shift and the **start** of the next, the scheduler
> will never schedule someone with less than **1 hour** of gap (and never
> overlapping shifts). 1 hour is the floor — see Q5 for the _preferred_ gap.

- [ ] **A. 1 hour is the right absolute minimum.** _(current)_
- [ ] B. The absolute minimum should be \_\_\_\_ hours instead.
- [ ] C. Other:

➤ Notes:

---

## Part 2 — Preferences that _can_ bend (and the order they bend in)

When the scheduler can't fill a slot while honoring everything, it starts giving
things up. These are the things it's willing to compromise on.

### Q5. Preferred rest between shifts

> Ideally everyone gets at least **10 hours** between shifts. If the scheduler
> can't manage that, it will pack shifts closer together (down to the 1-hour
> floor from Q4) rather than leave the slot empty.

- [ ] **A. 10 hours preferred is right.** _(current)_
- [ ] B. The preferred gap should be \_\_\_\_ hours instead.
- [ ] C. Other:

➤ Notes:

### Q6. The 4-shift target

> The scheduler aims for **at most 4 shifts** per volunteer over the event. If
> it's short-staffed, it will give someone a 5th (or more) rather than leave a
> slot empty.

- [ ] **A. 4 is a target — exceed it only when necessary.** _(current)_
- [ ] B. 4 is a hard cap — never exceed it, even if a slot goes empty.
- [ ] C. The number should be \_\_\_\_ instead.
- [ ] D. Other:

➤ Notes:

### Q7. What gets sacrificed first (important!)

> When the scheduler is struggling to fill a shift, it compromises in a set
> order. **Rank these from what to give up _first_ (1) to _last_ (3):**

| What can bend                                       | Rank (1 = give up first) |
| --------------------------------------------------- | :----------------------: |
| Honoring the volunteer's Morning/Evening preference |    **1** _(current)_     |
| The 4-shift target (let someone take a 5th)         |    **2** _(current)_     |
| The 10-hour rest (squeeze down toward 1 hour)       |    **3** _(current)_     |

- [ ] **A. This order is right.** _(current: preference → 4-shift → rest)_
- [ ] B. I've re-numbered the table above.
- [ ] C. Other:

➤ Notes:

### Q8. Leaving a slot empty

> After bending everything it's allowed to, if no one can take a slot _without_
> crossing an absolute limit (Part 1), the scheduler **leaves it empty** for a
> coordinator to handle by hand.

- [ ] **A. Leaving it empty for a human is right.** _(current)_
- [ ] B. It should force-fill it by crossing one of the Part 1 limits —
      specifically: ****\_\_\_\_****.
- [ ] C. Other:

➤ Notes:

---

## Part 3 — Who gets the shift when several people could take it

When more than one eligible volunteer could fill a slot, the scheduler picks
using this order of priorities. Each question checks one of them.

### Q9. Everyone gets at least 2 shifts first

> Anyone with **fewer than 2 shifts** is put ahead of anyone who already has 2
> or more — so we spread a baseline before piling more onto the same people.

- [ ] **A. Yes — make sure everyone hits 2 before anyone gets a 3rd.**
      _(current)_
- [ ] B. No baseline — just always pick whoever has the least so far.
- [ ] C. The baseline should be \_\_\_\_ shifts instead of 2.
- [ ] D. Other:

➤ Notes:

### Q10. Balancing the load — hours or shifts?

> To decide who's "least loaded," the scheduler looks at **total hours** first,
> then number of shifts as a tiebreaker. (Shifts vary in length, so hours is the
> finer measure.)

- [ ] **A. Hours first, then shift count.** _(current)_
- [ ] B. Shift count first, then hours.
- [ ] C. Only one of them matters — namely: **\_\_\_\_**.
- [ ] D. Other:

➤ Notes:

### Q11. Saving the flexible "No preference" folks

> For, say, a **Morning** slot, the scheduler prefers a volunteer who _prefers
> Mornings_ over a volunteer with _No preference_ — so the flexible "No
> preference" people are saved for slots that are harder to match.

- [ ] **A. Yes — prefer the matching person, save the flexible ones.**
      _(current)_
- [ ] B. Doesn't matter — treat matching and flexible people equally.
- [ ] C. Other:

➤ Notes:

### Q12. Specialists — spread them or save the most-qualified?

> Between two qualified specialists, the scheduler currently gives the slot to
> the one with **fewer** qualifications — the idea being to save the
> most-credentialed people for the hard-to-fill specialty jobs and avoid burning
> them out.

- [ ] **A. Fewer-qualifications person first (save the specialists).**
      _(current)_
- [ ] B. Most-qualified person first.
- [ ] C. Doesn't matter.
- [ ] D. Other:

➤ Notes:

### Q13. Breaking a final tie

> If two people are still perfectly even after everything above, the scheduler
> picks **at random** (the same way each run, so results are repeatable).

- [ ] **A. Random is fine.** _(current)_
- [ ] B. Break the tie another way — namely: **\_\_\_\_**.
- [ ] C. Other:

➤ Notes:

---

## Part 4 — Matching volunteers to time-of-day

> A volunteer's preference and a shift's window are matched like this — a ✓
> means "considered a good match":

| Volunteer prefers… | Morning shift | Midday shift | Evening shift |
| ------------------ | :-----------: | :----------: | :-----------: |
| **Mornings**       |       ✓       |      ✓       |       ✗       |
| **Evenings**       |       ✗       |      ✓       |       ✓       |
| **No preference**  |       ✓       |      ✓       |       ✓       |

So a morning-preferring person is happy with Morning **or** Midday; an evening
person with Midday **or** Evening; Midday works for everybody.

### Q14. Is the matching grid right?

- [ ] **A. The grid above is correct.** _(current)_
- [ ] B. **Midday** should _not_ count as a match for Morning-preferring people
      (only true Morning shifts).
- [ ] C. **Midday** should _not_ count as a match for Evening-preferring people
      (only true Evening shifts).
- [ ] D. Midday should only go to "No preference" people.
- [ ] E. Other (mark up the grid / describe):

➤ Notes:

---

## Part 5 — Which shifts get filled first

### Q15. Hardest-to-staff first

> The scheduler fills shifts in this order: **Evening first, then Morning, then
> Midday** — the reasoning being that fewer people want Evenings, so grab people
> for those first, and almost anyone can do Midday, so save those for last.

- [ ] **A. Evening → Morning → Midday is right.** _(current)_
- [ ] B. A different order (write it): ****\_\_\_\_****.
- [ ] C. Doesn't matter.
- [ ] D. Other:

➤ Notes:

---

## Part 6 — Hand-picked assignments

### Q16. Coordinator overrides

> If a coordinator manually pins a specific volunteer to a specific shift, the
> scheduler **keeps that assignment even if it breaks a guideline** — but flags
> it so it's visible.

- [ ] **A. Keep the manual pick, just flag any issues.** _(current)_
- [ ] B. The scheduler should refuse/override a manual pick that breaks a rule.
- [ ] C. Other:

➤ Notes:

---

## Anything we missed?

Situations or rules that matter for scheduling but aren't covered above:

➤
