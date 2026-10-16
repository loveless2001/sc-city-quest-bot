# Dense-anchor boundary fix (2026-10-16)

Fix for the c-030 death (coin-audit/REPORT.md §7). Made in
`bot-next/endgame-v3.mjs`, then copied into bot-v2 for the live batch
c-037..c-046 (see the end of this report).

## The bug

`discover()` treated the first chain row at z ≥ 4,300 m as the first dense row
(or at 4,299–4,300 m with two-lane contact votes). The estimate is good to
~2 m, so near 4,300 m that row is ambiguous:

- **c-030:** the last sparse fence (true z < 4,300) settled at 4,301.8 and
  was aligned to 4,300.3. The real pattern started ~56 m later, so the
  predicted dense rows were 21–38 m early.
- **Opposite case** (code path; not seen in any recorded run): a real first
  dense row measured just under 4,300 m, with a cone in one lane, fails the
  two-lane vote. It would be taken as sparse, and the empty window after it
  would settle blind and anchor the pattern about 50 m late.
- **Middle-lane case** (code path; not seen in any recorded run): a lane-1
  sparse fence measured at ≥ 4,300 m becomes a dense [0,2] row, whose free
  lane is the fence's.

## The change

1. **Boundary row.** A chain row settles with hi ≥ 4,300 and
   |z − 4,300| < `boundaryBand` (3 m).
   - If its fence is confidently in the middle lane only, it is sparse: the
     first dense row uses lanes 0 and 2.
   - Otherwise pattern A starts on it, exactly as before (dense [0,2],
     alignDense), and the sparse chain keeps searching 40–60 m on.
2. **Next row (N).**
   - Fewer than 2 consistent contacts once zFrame ≥ hi − 30 (the whole window
     has been in contact range): A only.
   - A contact cluster: pattern B starts on N. Both patterns are planned
     around, with B rows at ±max(2, unc(N)) m.
3. **resolveDense.** Each upcoming row (index ≥ 1) of either pattern gets a
   contact probe within ±5 m on each of its lanes.
   - A row is *seen* with a cluster of 3 contacts within 1.2 m. It is
     *missing* after 8 probed frames with a cluster of at most 1.
   - A pattern is kept when its score (seen − missing) leads by 2 and it has at
     least one seen row.
   - If B is kept, its rows shift by the median contact offset of its seen
     rows (denseUnc 1.5). A's residuals are discarded.
   - The probed pattern's own rows are unmasked. The other pattern's nearer
     rows stay masked, because a real fence's top bar reads as a contact
     13–16 m behind it.
4. **Unchanged.** alignDense and refineDense still apply to the primary
   pattern only (`!r.alt`). The fallback chain, planner and narrow-pass
   handling are not touched.
5. **Kill switch.** `boundaryBand=0` restores the old behaviour exactly.
6. **Live records.** Per-frame records gain `boundary` (the boundary row's z)
   and `denseAlt` (pattern B's start, while two patterns are live).
   `denseLog` holds the decisions.

## Evidence

### c-030 (anchor-replay, decision-replay, dense-drift, death-point)

**Decisions:**

- Boundary row at 4,301.8 (at zFrame 4,262.6).
- Next fence found at 4,357.5 (at 4,320.7).
- B kept at zFrame 4,474.2: A1@4,466.4 missing (8 frames, 0 contacts),
  B1@4,505.3 seen (5 contacts).

**Anchors:**

- Final anchor 4,356.7, against live 4,300.3.
- Rows: 4,504.8 [0,1], 4,607.1 [1,2], 4,682.1 [0,2].

**dense-drift:**

- With the new anchor, real contacts are within ±0.5 m of all four rows
  (10 frames each).
- With the live anchor, rows 1–3 have no contact within ±15 m.

The task's ~4,500 / ~4,604 / ~4,679 came from a rounded 4,350 anchor. The
frames put the fences at 4,504.4 / 4,606.7 / 4,681.7 (controller clock).

**Death point:** the hit frame is at zFrame 4,677 ± 2, and the runner enters
lane 2 at ~4,678. That is consistent with the [0,2] fence at ~4,682.

**New controller's plans at the death:** at frames 2,832–2,839 they keep
lane 1 through the 4,681.6 row and move only after 4,701. The fatal live L
press at ~4,672 does not appear.

**Two-pattern stretch:** across 105 frames (4,330–4,540) the planner stays at
fallback level 0 with margin 2.

### Replays on all 30 recorded runs (anchor-replay, logged keys)

| | result |
|---|---|
| c-016..c-029, c-031..c-036 (default band) | **20/20 identical** to bot-v2 (anchor at 4,800 m, end anchor, rows 4,400–4,750) |
| c-003..c-015 (default band) | identical except c-010 / c-011 |
| c-010 / c-011 (last sparse fence settled at 4,298.0 / 4,299.4) | take the new path. Next fence found, B kept at k = 1. End anchors 4,351.57 / 4,350.79 vs 4,351.47 / 4,350.24; rows differ by ≤ 0.2 m |
| forced band 60 (every first boundary row) | 30/30 correct: 22 boundary rows that were the real first dense row → no fence 40–60 m on → anchors identical to bot-v2. 5 real sparse fences (c-010, c-011, c-014, c-030, c-034) → B kept at k = 1 each time, within 0.4 m of bot-v2 (c-030 corrected). Middle-lane rule fired on c-015 / c-023 / c-026, whose later rows were then real dense rows → none |

### Probe calibration (boundary-probe, 29 surviving runs × dense rows 1–3)

- **Real rows:** 85/87 reach 3 contacts within 8 probed frames. 2 are
  undetectable (c-011 k3, c-018 k3: probably cones or occlusion).
- **Empty road 18–40 m before or 25–40 m after a real row:** 0/609 ever reach
  3 contacts, and all are ≤ 1 by 8 frames.
- **18–23 m after a real row:** without masks up to 5 contacts (53/87 reach 3).
  With the other pattern's masks the maximum is 1. Real rows behind the fake
  pattern stay visible (c-030).

### v3-sim2

v3-sim2 does not run discovery: it gives the planner exact rows. Its course
does put the last sparse fence just under 4,300 m in ~6% of runs, but that
can't fail there. The new opt-in `boundary=` mode:

- forces that geometry (last sparse fence 4,297.3–4,299.8, lane 0 or 2);
- reports dense rows like each controller: old = pattern on the sparse fence;
  new = both patterns (real rows ±5 m) until the real second row is 25–40 m
  ahead (c-030: 30.6 m); exact = real rows.

Seeds 1–8, runs=40 (320 runs per row):

| mode | deaths | mean pts | deaths 4,300–4,560 | deaths 7,000–7,520 (sliding) |
|---|---|---|---|---|
| default, bot-v2 | 67 | 27,035 | 0 | 66 |
| default, bot-next | **67** (identical per seed) | 27,035 | 0 | 66 |
| boundary=exact | 69 | 26,967 | 0 | 67 |
| boundary=new | 76 | 27,036 | **0** | 76 |
| boundary=old | **320** | 13,374 | 192 | 121 |

- The default sim never calls `endgame-v3.mjs`, so bot-next and bot-v2 are
  identical there.
- boundary=old reproduces c-030: every run dies, at the first or second real
  dense row or at the first sliding row (~7,027).
- boundary=new has no deaths in the two-pattern stretch. Its 7 extra sliding
  deaths compared with exact come from RNG divergence: the RNG is shared
  across runs, so later courses differ (sd ≈ 10 deaths).

Paired check (`runseed=1`: each run has its own seed, so both modes face the
same 320 courses):

- exact: 59 deaths; new: 60 deaths.
- 59 runs die in both modes. 1 run dies only under new, at 7,000–7,520 (key
  jitter diverges after the boundary). 0 runs die only under exact.
- 0 deaths fall in 4,300–4,560.
- Mean points: 26,977 (exact) vs 26,843 (new). Two-pattern planning costs
  ~134 points per boundary run, or ~13 per run overall at ~1 boundary run
  in 10.

### Cost

perceive() during c-030's two-pattern stretch (70 frames, machine loaded with
13 sim processes):

- p50: 8.1 → 11.0 ms
- p90: 18.7 → 21.0 ms

There is no extra work outside boundary runs.

## Residual risks

- **Both slots of the real first dense row are cones** (4%) right after a
  boundary sparse fence: N is not found and A is kept (wrong). The old code
  also fails here.
- **Middle-lane sparse fence near 4,300 that isn't confidently identified at
  settle:** it is modelled as [0,2], as before.
- **Neither pattern gets clean evidence:** the union stays (safe, costs
  coins). It did not happen in any replay.
- **The real first dense row lies within 3 m of 4,300:** the planner limit
  sits at R + 32 until "none" at R + 35–37. Planning stalls for ~3–5 m, which
  costs a few coins and is safe (the planner returns no presses).

## Live batch c-037..c-046 (approved by the user, 2026-10-16)

- `bot-v2/endgame-v3.mjs` is backed up in
  `backup-bot-v2-2026-10-16-pre-boundary/`; the bot-next version is now in
  bot-v2. All seven endgame files now match bot-next.
- ChatGPT's batch was idle: no lock, status `batch-complete`, PAUSED.json
  present.

| | c-027..c-036 | c-037..c-046 (boundary fix) |
|---|---|---|
| survived | 9 / 10 | **10 / 10** |
| survivors' mean | 31,109 | 30,943 |
| survivors' median | 30,930 | 30,420 |
| range | 28,640–34,370 | 28,560–34,480 |
| unsafe frames | 0 | 0 |

Scores for c-037..c-046: 30,340 / 30,500 / 29,840 / 31,300 / 34,480 / 28,560
/ 33,870 / 29,770 / 31,090 / 29,680.

- No run had a boundary row within 3 m of 4,300 m. No record has
  `boundary`, and all runs took the normal path; c-043 was closest at
  4,303.5. The first-dense estimates were 4,303.5–4,349.3.
- So this batch checks only for regressions in normal runs. The mean is
  −166, within noise (se ≈ 600). The boundary path itself has not yet run
  live. At ~1 boundary run in 10, about 20 more runs would give ~88% odds of
  at least one.
- Rollback: copy `backup-bot-v2-2026-10-16-pre-boundary/endgame-v3.mjs`
  back into bot-v2.

## Live batch c-047..c-066 (approved by the user, 2026-10-16 15:08–16:21)

ChatGPT's batch was idle (no lock, `batch-complete`, PAUSED.json present),
and bot-v2 was unchanged from the previous batch.

| | c-027..c-036 (old anchor) | c-037..c-046 | c-047..c-066 | c-037..c-066 (fix, all) |
|---|---|---|---|---|
| survived | 9 / 10 | 10 / 10 | **20 / 20** | **30 / 30** |
| survivors' mean | 31,109 | 30,943 | 31,140 | 31,074 |
| survivors' median | 30,930 | 30,420 | 31,285 | 30,980 |
| sd | 1,922 | 1,875 | 1,081 | 1,366 |
| unsafe frames | 0 | 0 | 0 | 0 |

Two runs took the boundary path (2 in 20, as expected).

### c-053 (31,380, to 7,932 m): later anchor kept

- The boundary row was a lane-2 sparse fence that settled at 4,299.3 and was
  modelled as [0,2] (aligned to 4,298.8). The next fence settled at 4,344.3
  (at zFrame 4,309.9).
- Both patterns were planned from 4,309.9 to 4,461.1, at fallback 0 /
  margin 2 for all 82 frames between 4,290 and 4,470.
- Decision: A1@4,465.5 missing (8 frames, 0 contacts), B1@4,496.3 seen (5).
  B was kept and aligned (+2.5 m); final anchor 4,346.0.
- dense-drift with the live anchor: real contacts within 0–1 m at every row
  from 4,497 to 4,827. With the boundary-row anchor (A): no contacts within
  ±15 m at rows 1–2.
- Replay with bot-next reproduces the live decisions and final anchor exactly.
- Replay with the old controller anchors the same rows at 4,800 m: the row
  was under 4,300 with no two-lane votes, like c-010/c-011. So the old code
  would also have been right here.

### c-060 (30,670, to 7,980 m): original anchor kept

- The boundary row settled at 4,302.8. No fence 40–60 m on ("none" at
  zFrame 4,338.9), so A was kept; final anchor 4,304.1.
- Replay is identical to the old controller.
- dense-drift offsets are in the normal range for end-of-run anchors (normal
  runs show the same −2 to −3 m at row 0).

So both branches have now run live, and both agree with the old code where
the old code was right. A c-030-type case, where the old code fails, has not
come up live since the fix. Its evidence is still the c-030 replay and the
sims above.
