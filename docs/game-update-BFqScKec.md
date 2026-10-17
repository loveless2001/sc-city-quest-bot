# Game update review: index-DnBWvl2N.js → index-BFqScKec.js (2026-10-17)

The live site switched bundles on 2026-10-17 (file dated 02:37 UTC). The
version guard disabled the bot as designed (`game-version.json` of session
`interactive-2026-10-17T05-07-44-999Z`).

Unlike the previous update, this one **changes the course**. The bot must not
be re-enabled by just moving the guard: the endgame controller would steer by
the old timetable.

## Method

- Fetched the new bundle into
  `claude-sc-city-quest/work/game-public-index-BFqScKec.js` (366,405 bytes
  against 366,299).
- Diffed both bundles statement by statement with short minified names
  normalized (`claude-sc-city-quest/analysis/bundle-diff.mjs`), and compared
  the numeric literals.
- The r3f, three, tween and rolldown-runtime chunk names are unchanged; only
  the admin chunk was renamed.

## What changed

### Stages (distance in m)

| stage | speed cap | old | new |
|---|---|---|---|
| Nhập cuộc | 25 | 0–500 | 0–500 |
| Tăng tốc 1 | 28 | 500–1,100 | 500–1,280 |
| Tăng tốc 2 | 31 | 1,100–1,700 | 1,280–3,060 |
| Tăng tốc 3 | 34 | 1,700–2,300 | 3,060–3,840 |
| Về đích | 37 | 2,300–2,600 | 3,840–4,140 |
| Bứt phá | 50 | 2,600– | 4,140– |

The speed law itself is unchanged: +0.12 m/s² until the stage's cap, and from
the start of Bứt phá a ramp, linear in distance, from the entry speed to
50 m/s over 400 m (now 4,140–4,540 m).

- **The caps now bind.** On the old course the runner never reached a cap
  (32 m/s at 2,600 m). Now it reaches 31 m/s at about 2,338 m and holds it to
  3,060 m.
- **Bứt phá entry speed:** about 34.9 m/s instead of 32.
- **Arrival times:** about 115 s at 3,060 m and about 148 s at 4,140 m.

### Final stage

| | old | new |
|---|---|---|
| random obstacles until | 2,800 | 4,340 |
| empty breather | 2,800–3,300 | **removed** |
| lane-fence rows (every 30 m, 5% box) | 3,300–3,780 | 4,340–4,820 |
| sparse fences (40–60 m) | 3,810–4,300 | 4,850–5,340 |
| dense two-lane rows from | 4,300 | 5,340 |
| dense fully tightened spacing | 4,600 | 5,640 |
| sliding fences | 3,000–4,000, 7,000–7,500 | 4,340–5,040, 8,040–8,540 |
| dense tightening | 6,000–8,000 | 7,040–9,040 |
| forced end | 10,000 | 11,040 |

- **Shift:** everything from the lane fences on is shifted by +1,040 m.
- **No gap after the random obstacles:** the last random obstacle spawns less
  than 40 m before the first sliding-fence row at 4,340 m. The old endgame
  controller took over at 2,806 m, inside the empty breather. There is no such
  gap any more.
- **Dense-row spacing:** it is now ramped over 4,340–5,640 m instead of
  2,800–4,600 m, so its values at a given point of the dense section differ
  slightly, not just by the shift.

### Coins

- **Rain (new), 2,060–3,060 m:**
  - no random obstacles spawn there (letters are unaffected);
  - single-lane coin streams, one coin every 9.23 m, switching lane every
    90 m.
- **Streams from 5,340 m to the end:** now single-lane, one coin every 9.23 m.
  Before, they were one or two lanes, one coin every 6 m.
- **Doubles:** the share of double (80) coins now ramps over 4,140–5,640 m
  (was 2,600–4,600 m).

### Letters and words

- **Values ×4:** 40 / 120 / 200 per letter; −80 for a wrong lane; +800 for a
  word.
- **Rows:** 45.5 m apart (was 35 m).
- **Badges:** the help text now places them at 600, 3,200 and 3,900 m. They
  stay tied to stages 2, 4 and 5.

### Unchanged

Speeds, caps, jump, lane switch, obstacle types and penalties, coin values
(10 / 80 / 100), the early mystery box (600–2,400 m, +200) and endgame box
rate (5%).

## What it breaks in the bot

- **Endgame controller (`endgame-v3*`, `endgame-session.mjs`):**
  - the stage boundaries, takeover distance (2,806 m), course timetable,
    speed law, dense-gap ramp and the 6 m coin step are all the old ones;
  - it would take over in the middle of Tăng tốc 2 with a wrong clock.
- **Takeover point:** it needs a new design. With no breather, the
  early-game controller has to dodge the last random obstacles while the
  endgame controller is already lining up for the 4,340 m sliding row.
- **Early-game controller:**
  - `course-clock.mjs` uses the old boundaries and ignores the speed caps;
  - `word-clock.mjs` assumes 35 m letter rows;
  - its reward weights still value a letter at 10–50 and a wrong lane at −20.
  - These only affect scoring; dodging is screen-based.
  - It has never had to play the 1,000 m rain stretch, but that stretch has no
    random obstacles.
- **Batch bot (bot-v2):** its guard expects the old bundle too, so it is
  blocked as well.

## Port (2026-10-17)

### Course model

`src/endgame-v3-course.mjs` now holds both known courses:

- `BFqScKec`, the default;
- `DnBWvl2N`, kept for replaying the recorded runs.

Each course has its:

- stage starts and speed caps;
- final-stage timetable;
- coin stream step;
- letter-row spacing;
- follow and takeover distances.

It also has the speed law, piecewise and exact: acceleration, stage caps, and
the final ramp linear in distance. On the old course it reproduces the old
formulas to about 1e-12.

Course values on the new course:

| distance (m) | time (s) | speed (m/s) |
|---|---|---|
| 2,337.5 (31 m/s cap reached) | 91.7 | 31.0 |
| 3,060 | 115.0 | 31.0 |
| 4,140 (Bứt phá) | 147.7 | 34.9 |
| 4,340 (first lane row) | 152.9 | 42.5 |
| 4,540 | 157.3 | 50.0 |

Everything that used the old numbers now reads them from the course model:

- the endgame clock's stage boundaries;
- the endgame row timetable and the first sparse row;
- the dense-gap ramp, now from the pattern start;
- the coin detector's stream step (9.23 m);
- the early-game course clock (with the caps);
- the word clock (45.5 m rows);
- the warm-up, which replays its old-course frames on the old course.

### Handover

On the old course the endgame controller took over at 2,806 m, inside an
empty 500 m breather. On the new course the random obstacles run right up to
the first sliding row at 4,340 m.

- **From 4,250 m** the endgame controller follows the course on the
  early-game controller's frames. This means:
  - its first rows' slide hypotheses are scored from 70 m;
  - the fences that controller tracks already get ground-contact measurements.
- **At 4,285 m, takeover:** the endgame controller takes over at the first
  moment the early-game controller has no queued or recent move and no
  tracked obstacle from 150 ms behind to 350 ms ahead. It takes over by
  4,300 m in any case.
- **After the takeover, until 4,345 m:**
  - the early-game controller keeps analysing frames (no keys);
  - its fence, cone and barrier tracks become endgame obstacles
    (`pilotObstacles`, `EndgameV3.setExternal`);
  - their lanes are mirrored (its lanes are −1..1 with −1 on the left).
- **Fence distances:** each external fence is measured by the endgame
  controller's own ground-contact score in its track's lane, within ±8 m. The
  measurements are kept per track.

**Calibration** (`analysis/junction-replay.mjs`):

- **Data:** 484 sightings 10–40 m ahead, on 47 recorded runs, in the old
  course's random-obstacle stretch before 2,806 m.
- **Mature tracks (seen 6+ times):** the early-game controller's predicted
  impact distance was off by a median −0.5 m (5–95%: −3.5..+1.0 m), but by up
  to −8 m for runs of frames. For example, batch run c-066 predicted 13.4 m
  for a fence whose base the frame shows at 20.9 m.
- **Younger tracks:** median −2 m, 5–95% −7.8..+6.5 m.
- **No contact:** 13% of track-frames had none.

Hence these windows, to which the planner adds its ±2 m:

| early-game distance z, and the contact | fence centre assumed in |
|---|---|
| contact agrees (within 2 m) | contact ± 0.8 (fatal) |
| contact disagrees | over both, ± 1 (fatal) |
| no contact yet, mature track | z−2..z+3 fatal, z−4..z+8 cost 3,000 |
| no contact yet, younger track | z−3..z+4 fatal, z−8..z+8 cost 3,000 |
| cone / barrier | z−4..z+6, cost 150 / 250 |

**The first row's fence:** a fence track level with the first sliding row may
be that row's fence. Once the row is resolved, a track where its fence was is
left to the row model; before that it stays as a likely obstacle only.

### Planner bug found on the way

The beam search merged routes whose lane change was equally far along, in
sixths of the change's duration. Below about 42 m/s (lane changes over
0.24 s), a change pressed two frames later fell into the bucket of an older
one and replaced it on a tie. So no lane change ever completed in the search:
a single fence 30 m ahead had no route at 40 m/s (40 of 40 test positions).

The old course reached its fences only at 50 m/s, where buckets never
collided. The new course's handover (40–42 m/s) and first lane rows (42–50
m/s) are slower.

Lane changes in progress are now keyed by the frames since their key. That
has no failures from 25 to 50 m/s (regression test), and at 50 m/s the keys
were already distinct.

**Old-course check** (v3-sim3, 100 paired runs, old vs fixed planner):
- the same 21 deaths at the same 21 distances;
- plan time 99th percentile 6.6 vs 6.2 ms.

### Simulation

`analysis/v3-sim3.mjs` is v3-sim2 on either course, plus the handover stretch:

- **Random obstacles:** spawned by the game's rules up to 4,340 m.
- **Takeover:** at 4,285 m in a lane the early-game controller could hold,
  and not while an obstacle is from 6 m behind to 15 m ahead.
- **Tracks and contacts:** they reach the planner through the bot's own
  `externalObstacles()`. Each track's distance error is drawn from the
  calibration, and fence contacts are measured from 4,250 m:
  - found 85% of frames at 8–45 m, ±0.3 m;
  - 3% wrong by up to ±8 m;
  - none for a fence in the runner's lane within 12 m.
- **The first row's fence:** while that row is unresolved, it is also reported
  as a likely fence track.

Handover stretch, 4,285–4,540 m, 1,000 paired runs per line:

| scenario | handover deaths | random-obstacle penalties per run |
|---|---|---|
| calibrated errors (default) | 0 | −2.0 |
| track errors ×2 | 0 | −2.7 |
| contacts found only half the time | 0 | −2.3 |
| 15% of contacts wrong | 0 | −2.1 |
| 3% of obstacles never tracked | 3, all on the untracked fences | −2.5 |
| takeover at 4,270 m | 1 (at the first sliding row) | −2.0 |
| takeover at 4,300 m | 1 (at the first sliding row) | −1.6 |

None of 1,000 against 1 of 1,000 is no real evidence between the three
takeover points; 4,285 m stays, in the middle.

**Full new course, 150 runs:**

- no handover deaths;
- 28 deaths, all at 8,103–8,504 m (the second sliding stretch). The same
  model gave 28 of 150 at 7,028–7,466 m on the old course (see the
  interactive-edition report).

An earlier version had 1–5 handover deaths per 1,000, all 5–7 m after the
takeover point. It took over just before a fence the early-game controller
was about to pass, before any contact measurement existed. That led to the
"not while passing" rule and the contact measurements from 4,250 m.

**Residual case:** a rerun found run 842 (3% untracked) dying at 4,340 m:
- a random fence in the middle lane at 4,335 m;
- the first sliding row's two explanations (ending left or right) stayed
  unresolved until about 8 m;
- the less likely explanation was the true one, which the simulator makes
  happen for 15% of ambiguous rows.

The planner bet on the wrong outer lane and could no longer cross the middle
lane. This is v3-sim2's pessimistic ambiguity model: on the old course the
same model kills about 20% of full-course runs in the second sliding stretch,
where live games survived 30 of 30.

Plan time in the stretch: median 3.8 ms, 99th percentile 11 ms.

### Letters

The early-game controller's planning value for a word-race letter goes from
180 to 720 (`--letter-value=720`), the same ×4 as the game's letter points.

### Tests

`npm test`: 43 pass. They cover:

- the box cases on both courses;
- the clock and follow/takeover distances;
- the conversion of the early-game controller's tracks;
- contact-measured windows;
- the first row's fence;
- the planner at 25–50 m/s;
- the letter rows.

## Live check (2026-10-17 06:53–07:04)

- **Conditions:** approved by the user; ChatGPT's batch idle; Chrome, bot on
  throughout.
- **Tools:** `analysis/course-live.mjs` and `jump-live.mjs`. The page's score
  pop-ups are now logged per frame for the letter count.

| | i-026 | i-027 |
|---|---|---|
| version check | `index-BFqScKec.js`, matched | matched |
| takeover | 4,285.3 m, calm (no move or obstacle pending) | 4,285.7 m, calm |
| handover obstacles | cones in lane 1 at 4,300 and lane 0 at 4,332 (avoided, three double moves) | cone lane 0 at 4,292 (avoided); fence lane 0, early-game estimate 4,317.8 → 4,316.1, contact 4,318.9 from the first plan (measured during the follow) |
| first lane row's fence seen as an early-game track | 13 plan-frames, left to the row model | 10 plan-frames |
| handover plans | 29, all at full margin, no fallback | 26, all at full margin, no fallback |
| first sliding row (4,340 m) | confident 49.8 m before, passed | confident 59.4 m before, passed |
| word race | 9 letters (40/120/200 ×3 each), 1 wrong lane, 3 words: HERITAGE RACE, PROSPERITY, STANDARD | 10 letters, no wrong lane, 3 words: CHARTERED, HANOI MARATHON, NOW IS YOUR TIME |
| early game | 14,520 at the takeover; 1 jump, one −30 cone | 16,540; 2 jumps, no penalty |
| end | 9,006 m (where the dense rows close, as at ~7,990 m on the old course; no points after ~8,640 m) | 8,975 m (same) |
| **result** | **26,380** | **28,510** |

- **Handover cost:** the extra early-game analysis took a median 18–22 ms
  (max 48 ms); endgame frames came every 42 ms (median).
- **Focus:** the foreground-window logs show Chrome in front throughout both
  games.
- **Where the points are now:**
  - On the old course, i-024 and i-025 had 5,640–6,120 points at 2,806 m, and
    the endgame added 26,000–30,000.
  - On the new course the early game brings 14,500–16,500, through ×4 letters
    and three words of +800 each, but the endgame adds only about 11,900.
  - The update removed the breather's coin streams and made the dense
    section's streams single-lane at 9.23 m instead of one or two lanes at
    6 m. That's about 0.11 coins per metre instead of 0.25.

## Live games i-028 and i-029: an endgame weakness

These two games tested the early-game medal and navy-coin changes (see the
README). Both takeovers were forced at about 4,301 m: the early-game
controller had a move or a passing obstacle pending the whole 15 m. Both
handovers went through without a hit.

**i-028 crashed at about 8,180 m**, in the second sliding stretch, which has
no points left to speak of. This is the first live crash there in 34 games
(30 batch, 4 interactive):

1. The runner was in lane 0 and planned to pass a sliding fence predicted at
   x = −0.5, with about 0.3 m of physical clearance.
2. 6 m before the fence, the prediction moved to −0.6. Under the planner's
   0.3 m hard slider margin, lane 0 then counted as a collision.
3. The planner's fallback order tries every distance margin at full fence
   width before it tries the measured ("thin") width. So it chose a double
   lane change across the fence's path at zero margin, rather than staying
   in a lane the fence physically missed.
4. One plan later, the last-resort level reversed that move mid-crossing.

**To fix, in a separate change:**
- close to a row, prefer the measured width before a zero-margin crossing;
- never reverse a crossing in progress at the last-resort level.

## Status

- The guard expects `index-BFqScKec.js`.
- The port is checked offline (tests, calibration, simulator) and live (2
  games, both full course).
- `tools/live-check.mjs --toggle` still turns the bot off "in the
  obstacle-free stretch after 2,806 m". There is no such stretch now, so
  that option needs a new place before it is used again.
