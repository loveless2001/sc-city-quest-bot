# Interactive edition + endgame controller (2026-10-16)

The merged edition was built in `claude-sc-city-quest/interactive/` (now this repo), a copy of
ChatGPT's `outputs/sc-city-quest-interactive`. ChatGPT's folders are
untouched. The live checks are in the sections below.

## What changed

**Before 2,806 m:** behaviour is unchanged: ChatGPT's trial-427 pilot with
F8 / Escape takeover and cancellable inputs.

**From 2,806 m:** the endgame controller from bot-v2 takes over (in
`endgame-session.mjs`):

- **Clock:** taken from page timestamps of the visible stage-label changes,
  recorded by an init script that also logs puzzle screens, continue clicks and
  the tab being hidden.
- **Following while off:** the controller follows the course on every frame,
  bot on or off. While off it is "shadow" perception: the runner's x comes only
  from the lane lines, no lag samples are taken, and no keys are sent.
- **Hand-back (F8 on):** the bot waits until the runner has been seen in the
  same lane for 0.2 s, then calls `rebaseLane()`. For 0.6 s afterwards it
  checks the screen against its lane model while the model has the runner
  standing in a lane. On two disagreeing frames, `correctLane()` re-syncs and
  drops the queued keys.
- **Takeover from the pilot:** with the bot on at 2,806 m, the pilot's lane is
  used directly, as in bot-v2.
- **Clock lost:** a hidden tab, or a puzzle after the last stage label and
  before 2,806 m, leaves the endgame off for that run, and the pilot is used.
- **Logs:** each run that reaches the endgame writes `endgame-<time>.json`.

**Controller additions** (in `bot-next/endgame-v3.mjs`, copied to the
edition): `perceive({shadow})`, `rebaseLane`, `correctLane`, and
`lagPrior: 25`. All are inactive in batch play: replays of c-010, c-030 and
c-053 are identical to before.

**Settings:** `--endgame-v3 --late-frame-ms=40` were added, so the arguments
now match bot-v2's except the launch-only flags.

## Evidence

**Unit tests** (`npm test`): 13/13 pass, ChatGPT's 4 plus 9 new ones. They
cover:

- key cancellation on stop;
- the stage clock;
- clock loss from a puzzle or a hidden tab;
- puzzle pause timing;
- hand-back lane detection;
- lane correction;
- shadow perception.

**Hand-back replays** (`analysis/shadow-replay.mjs`): 8 recorded runs, three
of them boundary runs (c-030, c-053, c-060), × 6 patterns, 48 replays in all.
Each pattern turns the bot off over some stretches, with the recorded moves
standing for the player:

- off 2,806–3,290 m
- off 3,300–3,800 m
- off 3,800–4,400 m
- off 4,400–5,200 m
- off 2,806–7,000 m
- four short offs

| check | result |
|---|---|
| same dense-anchor decisions as continuous control | 46/48 (2 benign: c-060's boundary row fell just outside the 3 m band, so it took the normal path; same anchor within 0.5 m) |
| row error at 4,800 m relative to the runner | median 0.20 m, max 1.32 m (c-055, from the 25 ms lag prior) |
| hand-backs | 69 |
| lane wrong at hand-back | 11, all while the "player" had just started a move; all corrected within 4–6 m (~0.1 s) |
| spurious lane corrections | 0 (6 before the stationary-only check) |
| first planned key after hand-back agrees with continuous control | 26–40 of the first 40 frames, mostly 35+ |

**Hand-back latency:** about 10–25 m (0.2–0.5 s) once the player stops
moving. In the replays it is often longer, because the recorded moves keep
coming.

**Cost:** perceive and plan per frame are as in bot-v2. Following while off
costs one perceive per frame.

## Live check (approved by the user, 2026-10-16)

Run with `analysis/interactive-live-check.mjs` (now `tools/live-check.mjs`), which uses a dedicated Chrome
window and presses F8 like a player. ChatGPT's batch was idle. Outputs are in
`runs/i-001` and `runs/i-002`.

| game | F8 | result |
|---|---|---|
| i-001 | on at the menu, never off | **33,160**, full course to 7,872 m. Takeover at 2,806.2 m (continuous); the endgame then steered all 2,316 frames. Lag 25 ms, 4 clock fixes |
| i-002 | on at the menu; off at 2,914.6 m, on again 2.2 s later | **31,950**, full course to 7,870 m. 54 shadow frames, runner x from the lane lines on every one. Hand-back at 3,023.0 m, 230 ms after F8, in lane 2 (correct, no correction); the bot's first key 4 m later |

Planner fallback use matches the batch runs, and no clock was lost.

Two earlier attempts failed before the endgame. Neither was caused by the
endgame code:

1. **Loading screen:** the game's page was unresponsive for over 1.5 s while
   loading. ChatGPT's loop treated the text-read timeout as fatal and turned
   the bot off. Fixed in `interactive-play.mjs`: timeouts are retried, and only
   10 s without a readable page stops the bot.
2. **Focus lost:** the user clicked another window. The game's own code makes
   the runner fall on window blur or a hidden tab. This is now noted in the
   README: keep the game window focused during a run.

### Black game window (found after the live games)

ChatGPT's `user-browser.mjs` started Chrome with Node's `windowsHide: true`.
For a GUI program, that makes Windows create Chrome's first window hidden.
Chrome's own window reported "not visible" while the page rendered normally
inside it, so the bot's screenshots and scores were fine but the user saw a
black window.

- Fixed by removing the option (2026-10-16). A DPI-aware capture on the
  user's 1920×1080 / 125% display then shows the full game uncropped.
- Side effect: as a normal window, it is now reported hidden when another
  window fully covers it, and the game ends a run when hidden. Keep the game
  window in front during a run.
- The two live games above ran with the hidden window. A game with the
  visible window has not been run yet.

### Game 3 death, display-scaling blur, Edge, game update (2026-10-16)

**i-003** (Chrome, visible window): 30,190; died at about 7,450 m in the
sliding section, after an all-lanes-ambiguous sliding row pushed the planner
to its last-resort level.

**Sliding rows were weak in every interactive game:**

| | batch runs (c-047..c-064) | interactive (i-001, i-002, i-003) |
|---|---|---|
| sliding rows confident by 20 m (of 17) | 12–16 | 6–8 |
| frames scored per row by 20 m | ~24 | 19–24 |
| frame sharpness (Laplacian variance, 2,600–3,600 m) | ~1,700 | 484–520 |

Frame colours and screencast timestamps are the same in both. The cause is
**display scaling**: at 125%, headful Chrome draws the page at 1.25× and the
screencast scales it back to 870 px.

- Fixed with `--force-device-scale-factor=1`. On the same page, headful frame
  sharpness went 1,971 → 3,378.
- Not yet confirmed in a live game.

**Frame pacing** (frame gaps up to 265 ms in i-003):

- The endgame loop now reads page text and the event log in one round trip
  every 5th frame (one `page.evaluate`, 18 ms against 46 ms for the old
  locator read on the menu).
- `--capture` frame writes no longer block the loop.
- Each endgame record now carries per-phase timings: `probe`, `wait`,
  `decode`, `step`, `since`.

**Edge:**

- A new profile restarted itself, and the start tab took focus, so the game
  tab got no frames. The bot stayed at "Finding runner…".
- Fixed: Playwright's Edge switches (`--edge-skip-compat-layer-relaunch`,
  `--disable-sync`, `--disable-search-engine-choice-screen`); relaunch
  tolerance; `keepGameTab()`, which closes other tabs (own tab found by its
  main-frame id) and fronts the game after launch and after page load.
- The user's own Edge profile can't be used: Edge 155 ignores remote debugging
  on the default profile.

**Game update** to index-DnBWvl2N.js (guest analytics only, gameplay
unchanged): see `game-update-DnBWvl2N.md`. Version guard updated.

### Live check after the fixes (display at 100%, 2026-10-16 11:20–11:32)

| game | browser | result | sharpness | sliding rows confident by 20 m | 7,000–7,500 m frame gaps (p90 / max) |
|---|---|---|---|---|---|
| i-007 | Chrome | 200, crashed at ~14 s | – | – | – |
| i-008 | Chrome | **31,890**, full course | 1,699 | 16/17 | 64 / 99 ms |
| i-009 | Edge | **30,140**, full course | 1,603 | 12/17 | 59 / 90 ms |
| batch c-064 (reference) | headless | – | 1,703 | 16/17 | 61 / 78 ms |

- **i-007:** ChatGPT's early pilot clipped a middle-lane gate during the first
  ~10 s. Loop timing was slow during warm-up (analysis spikes up to 97 ms).
  Not an endgame issue.
- **i-008 crash fix:** after the result screen, a key still in flight called
  the reset controller and the Node process exited. Fixed: the key sender is
  bound to its run's controller and swallows errors from late presses
  (regression test added; 14/14 tests). i-009 exited cleanly.
- **i-009 hit the c-030 situation live:** boundary row at 4,300.0, next fence
  at 4,360, later pattern kept at 4,471 m (A1 missing, B1 seen). The old
  controller would have anchored on 4,300.0. The run survived the dense
  section and finished the course.

### Launch warm-up (after i-007's early crash)

i-007 died at about 14 s, while the loop was still cold: analysis spiked to
97 ms and frame gaps to 166–179 ms in the first ~10 s.

`src/warmup.mjs` runs a throwaway early-game controller over 18
consecutive frames and a throwaway endgame controller over 4 frames (bundled
in `src/warmup/`, from batch run c-064), ×4 rounds. It also does three
page-text reads, all at launch while the menu loads (~1.5 s). `--no-warmup`
skips it.

Offline benchmark (`analysis/warmup-bench.mjs`, now `tools/warmup-bench.mjs`): the first 240 opening frames
of live game i-008, fresh process, 3 repetitions each.

| first ~10 s | cold | after warm-up |
|---|---|---|
| analysis, worst frame | 86–94 ms | 27–31 ms |
| analysis, p90 | 16.5–18.1 ms | 13.0–13.7 ms |
| decode, p90 | 7.7–8.5 ms | 6.3–6.8 ms |
| frames over 60 ms | 3 | 0 |

After the first 10 s the two are the same. Tests: 15/15 pass.

**Live check** (approved by the user; batch idle; 2026-10-16 13:24–13:30).
The warm-up took 2.1 s at launch in both games. Timings come from the bot's
progress lines (~5 s windows). Analysis and frame gap are p90 / max.

| game | warm-up | first frame analysis | 0–5 s analysis | 0–5 s frame gap | 0–5 s text read max | 5–10 s analysis max | 5–10 s frame gap max |
|---|---|---|---|---|---|---|---|
| i-008 Chrome | no | 154 ms | 31 / 97 | 71 / 179 | 71 | 35 | 62 |
| i-009 Edge | no | 133 ms | 30 / 97 | 72 / 166 | 26 | 49 | 78 |
| i-010 Chrome | yes | 35 ms | 29 / 47 | 79 / 125 | 92 | 68 | 96 |
| i-011 Edge | yes | 22 ms | 22 / 48 | 59 / 83 | 28 | 24 | 71 |

- **Analysis:** the first frame went from 133–154 ms to 22–35 ms, and the worst
  in the first 5 s from 97 to 47–48 ms.
- **Frame gaps:** the worst went from 166–179 to 83–125 ms.
- **What remains in i-010** is mostly page-side: the game's page answered the
  per-frame text read in up to 92 ms while it was still busy after loading. A
  Node-side warm-up can't fix that.
- **i-010:** **32,110**, full course to 7,931 m.
  - Frame sharpness 1,731; sliding rows confident by 20 m: 15/17.
  - No planner fallback ≥4 in 7,000–7,520 m.
  - 7,000–7,500 m frame gaps p90 59, max 108 ms.
  - Normal dense path (anchor 4,337.6); lag 20 ms; 3 clock fixes; clean exit.
- **i-011:** the user clicked another window at about 78 s (stage Tăng tốc 3,
  ~3,500 points). The bot turned off, and the game ended the run. The opening
  was clean, and Edge's full course was already shown in i-009, so it was not
  re-run.

### Early-game page-text read (after i-010)

**Problem.** The early-game loop reads the page text before every
screenshot, for the stage, score, puzzle and result screens. In i-010's first
5 s that read took up to 92 ms while the game page was busy, and each frame
waited for it.

**Change** (`interactive-play.mjs`, new `page-text.mjs`):

- **One round trip:** the text is read with one page call instead of
  Playwright's locator read.
- **Bounded wait:** during the run, a frame waits at most 25 ms for the read.
  A slower read carries on in the background through that frame's screenshot
  and analysis, and the frame uses the previous text, if it is under 250 ms
  old (otherwise the frame waits as before). One read runs at a time.
- **Unchanged:**
  - the screenshot is still taken after the text;
  - menus, puzzles and the result screen still wait for the text;
  - the endgame loop.
- `--sequential-text` restores the original read. With `--capture`,
  per-frame timings go to `timing.jsonl`.

**Offline bench** (`analysis/text-overlap-bench.mjs`, now `tools/text-read-bench.mjs`).

- **Replay:** a local page replays 600 recorded frames (i-010 or i-008) on a
  canvas, with the HUD text in hidden DOM.
  - The game-like main-thread load is heavy for the first 10 s, light after.
  - Each run has a Guest start, a loading screen, one puzzle screen and a
    result screen.
  - No live game is contacted.
- **Player:** the real loop plays it in headless Chrome (warm-up, trial-427
  pilot, endgame session).
- **Calibration:** the old loop's opening text waits (p50/p90/max 14–16 /
  33–36 / 103–132 ms) are close to i-010's live 15 / 27 / 92 ms.

Five variants were tried. Figures are the first 10 s, pooled over 3 runs each,
in ms:

| variant | frame gap p90 / p99 / max | text wait max | frame age at analysis p50 / p90 / p99 | verdict |
|---|---|---|---|---|
| old loop (3 benches) | 67–75 / 117–133 / 173–197 | 103–132 | 25–27 / 56–69 / 107–118 | – |
| screenshot in parallel with the read | 63 / 94 / 141 | 40 | 37 / 76 / 123 | rejected |
| read during the pause before the frame | 62 / 95 / 144 | 36 | 17 / 50 / 75 | rejected |
| same, started 15 ms before the frame | 64 / 109 / 182 | 39 | 24 / 56 / 101 | rejected |
| **bounded wait (kept; 3 benches)** | 64–67 / 110–117 / 129–145 | 38–39 | 21–24 / 54–56 / 84–94 | kept |

Why the three were rejected:

- **Screenshot in parallel:** frames were older at analysis (steady-state
  median 49 vs 14 ms).
- **Read during the pause:** steady-state frames were older (median 39 vs
  14 ms), and the text was ~34 ms old when used.
- **Read started 15 ms before the frame:** the two-step pause lengthened the
  loop (52 → 60 ms per frame).

**Bounded wait against the old loop:**

- **After 10 s:** the same, with frame gap 52 / 58–59 / 63–65 ms and frame age
  median 12–14 vs 12–15 ms.
- **Stale text:** used on 20–26% of the first-10-s frames and ~0.5% after.
- **Detection delays, bounded vs old:**
  - stage change: 9–46 vs 9–70 ms;
  - puzzle screen: 6–20 vs 7–20 ms;
  - result: 35–69 vs 33–68 ms.
- **All 30 bench runs:**
  - no errors;
  - ~60 keys sent each;
  - bot back on after the puzzle;
  - result recorded.
- **Tests:** 22/22 pass, including 6 new tests for the text reader.

**Limits:**

- The page load is synthetic.
- The bench runs headless; live games run headful.
- The replay is open-loop (keys don't change the frames), so it says nothing
  about survival, only about timing and screen handling.
- **Puzzle screen under load:** with the page busy, the bounded read can see a
  puzzle screen one or two frames late, because it uses the previous text.
  In a 300-frame replay whose puzzle came in the heavy first 10 s, it was seen
  after 105 ms against 9 ms with the old read. The limit is 250 ms plus one
  read. The early-game controller finds the lane again after every puzzle.
- One early bench attempt, with a page whose Guest button was covered so the
  bot kept clicking for 50 s, ended with Chrome's "Target crashed". This was
  not seen again in the 30 later runs.

**Live check** (i-012, Chrome, bot on throughout; approved by the user; batch
idle; 2026-10-16 14:38–14:42): **29,450**, full course to 7,959 m, clean
exit.

| first 5 s (progress window) | read | warm-up | frame gap p50 / p90 / max | text p50 / p90 / max |
|---|---|---|---|---|
| i-008 Chrome | locator | no | 54 / 71 / 179 | 12 / 20 / 71 |
| i-009 Edge | locator | no | 53 / 72 / 166 | 11 / 20 / 26 |
| i-010 Chrome | locator | yes | 52 / 79 / 125 | 15 / 27 / 92 |
| i-011 Edge | locator | yes | 51 / 59 / 83 | 11 / 18 / 28 |
| **i-012 Chrome** | **one round trip, bounded** | yes | **51 / 59 / 70** | **9 / 17 / 24** |

**Opening:**

- i-012 had the smoothest opening of the five games.
  - First 10 s, per frame: frame gap max 70 ms, text wait max 24 ms, frame
    age p99 52 ms.
  - 5–10 s window: frame gap max 61 ms, text max 22 ms.
- No read in the first 10 s took over 25 ms, so the bounded wait never acted
  there. One game can't separate the cheaper read from a calmer page;
  page-side spikes vary a lot between games (i-009, i-011).
- From 10 s to the takeover, the bounded wait acted on 5 of 1,820 frames:
  those frames used text 77–79 ms old instead of waiting. Text wait max was
  37 ms.

**Rest of the course:**

- Sharpness 1,653; sliding rows confident by 20 m: 14/17.
- No planner fallback ≥4 in 7,000–7,520 m; frame gaps there p90 60, max
  93 ms.
- Normal dense path (anchor 4,328.4); lag 20 ms; 1 clock fix.

**Score:** the lowest of the five full Chrome games (29,450, against
31,890–33,160 for i-001, i-002, i-008 and i-010), but inside the batch range of
28,560–34,480.
Almost all of the shortfall is in 4,300–7,000 m:

| game | 4,300–7,000 m | before takeover |
|---|---|---|
| i-012 | +16,895 | 4,930 |
| i-001, i-008, i-010 | +20,349 to +21,716 | 5,040–5,960 |

That stretch is the endgame controller, which this change doesn't touch.

### Mystery boxes (2026-10-17, user request)

**Game rules** (public bundle index-DnBWvl2N.js):

- **Reward:** a box ("Hộp bí ẩn", a blue cube with a "?") pauses the game and
  opens the "THỬ THÁCH BẤT NGỜ" puzzle. Solving it is worth +200
  (`BONUS_POINTS`).
- **Collection:** the box floats 1.1–1.9 m up and is collected within 1.2 m of
  the runner's body.
- **Early box:** exactly one per run, between 600 and 2,400 m, in a random
  lane, away from the word races (`Tb()`).
- **Endgame boxes:** in the late generator's lane-fence rows (3,300–3,780 m,
  every 30 m), each row has a 5% chance of a box 15 m after it in a random lane
  (`LANE_FENCE_MYSTERY_RATE`). That's about 0.85 per run, with at least one in
  roughly 58% of runs.
- **Input during the pause:** lane keys are gated by "running", not "paused",
  so the game still takes them.

**Before:**

- **Early box:** the early-game controller already collects it: 63 of 66
  batch runs, and 8 of 8 interactive games plus the user's 3 games past
  2,400 m.
- **Batch misses**, all near fences:

  | run | why it was missed |
  |---|---|
  | c-022 | left the box lane at the last moment for a coin |
  | c-023 | the fence-sequence rule kept a safe lane instead |
  | c-038 | box never confirmed (5 scattered sightings) |

- **Endgame boxes:** the endgame controller detected them and avoided them
  (cost 3,000), because the pause used to break its clock.

**Detection check** (`analysis/box-replay.mjs`, 30 batch runs, 3,300–3,800 m):

- Real boxes vote on every frame from about 59 m.
- False votes come in bursts of at most 10 frames: navy roadside banners at
  long range in lanes 0 and 2, or the runner close up.
- The old 3-votes/40% rule passed 2 false ones (in c-064).
- My first new rule, 12 votes and at least 85% of all frames, confirms all 19
  real boxes, 32–37 m before each, and none of the false ones.
- The rule now used is votes in **12 of the last 14 frames**, changed after the
  live check below. It also confirms all 19 batch boxes (31.6–36.7 m) and none
  of the false ones.

**Change** (`endgame-v3.mjs`, `endgame-v3-planner.mjs`, `endgame-session.mjs`,
`interactive-play.mjs`):

- **Collecting:** `boxes:'collect'` (default) turns confirmed boxes into
  planner rewards: value 100, collection radius 1 m.
  - Fences stay hard limits. Beside a sliding fence the soft clearance cost
    (400 × (1 − clear/0.6)) means a box never buys a pass closer than 0.75 m
    to the fence's predicted edge.
  - `--endgame-boxes=avoid` restores the old behaviour.
- **During the pause:**
  - The page is read every frame within 40 m of a confirmed box, so the pause
    is seen at once.
  - The session already clears queued keys on the pause, and resumes with the
    page's pause and continue timestamps.
- **After the puzzle:**
  - The collected box is dropped.
  - The fence-row distance readings restart, so the clock is re-measured from
    the next 8 of them.
  - Until then the planner uses a ±3.5 m margin (normally ±2 m).
  - A 0.6 s lane check on screen runs, as after a hand-back.

**Evidence:**

- **Tests:** 28/28 pass, 6 new.
- **Plan replays** (`analysis/box-plan-replay.mjs`, open loop on recorded
  frames): for all 19 real boxes, the first plan after confirmation goes
  through the box at fallback level 0, and stays so on every one of the next 6
  frames.
- **Closed-loop simulation** (`analysis/v3-sim2.mjs` `boxes=`, paired
  courses, 3,250–3,900 m):
  - boxes placed as the game does;
  - known to the controller from 34 m, with 75% detection;
  - collected within the game's 1.2 m;
  - on a pause: queued keys dropped, and a clock error until the fence rows
    re-measure it.

| scenario | runs | deaths | boxes collected | points in the stretch |
|---|---|---|---|---|
| real rate, no box logic | 1,000 | 3 | 328/769 (by accident) | 1,592 |
| real rate, avoid (old) | 1,000 | 3 (same 3) | 67/769 | 1,532 |
| real rate, collect | 1,000 | 3 (same 3) | 657/769 (85%) | 1,651 |
| 30% rate, collect | 600 | 2 (same as without boxes) | 2,617/3,092 | |
| 30% rate, ±3 m resume error, no wide margin | 600 | 27 | 2,560 | |
| 30% rate, ±3 m resume error, wide margin | 600 | 6 | 2,601 | |
| 30% rate, ±4 m resume error, wide margin | 600 | 19 | 2,587 | |
| full course, real rate: none vs collect | 150 + 150 | 28 and 28, all at 7,028–7,466 m (same runs) | | 27,526 vs 27,633 |

Notes on the table:

- **Default resume error:** ±1.5 m, re-measured 25 m later. Estimated from
  the 1.7 m collection-point assumption, the game's frame step and the
  puzzle screen's render.
- **Pessimistic rows:** re-measured only 40 m later.
- **Expected gain:** against the old avoid behaviour, about +120 points per
  run.
- **Larger clock errors:** if the real error after a puzzle were 2–3× the
  estimate, each collected box would add a ~0.15–0.7% death risk. That's still
  positive in expectation, but it's the thing to measure live.
- **Measuring it live:** the session log's `clockFixes` entry after a box
  pause records the error the fence rows found.

**Not changed:** the batch bot (`bot-v2`) still avoids endgame boxes. Its loop
has no every-frame page read near boxes and no post-resume lane check.
`bot-next` has the new controller files.

**Live check** (approved by the user; batch idle; 2026-10-16 18:06–18:19,
Chrome, bot on throughout):

| game | result | early box | endgame boxes |
|---|---|---|---|
| i-013 | **29,100**, full course (7,893 m) | collected, puzzle solved | none on screen |
| i-014 | **29,680**, ended at ~7,445 m by a focus loss (see below) | collected, puzzle solved | none on screen |
| i-015 | **30,060**, full course (7,917 m) | collected, puzzle solved | none on screen |

- **No endgame box in any of the three games** (about a 7% chance). So
  collecting one, and the clock error after its puzzle, are still untested
  live.
- **How "none" was checked:** the controller's own box test was recomputed on
  every captured frame in 3,300–3,800 m (`analysis/box-live-votes.mjs`). No
  position reached more than 10 votes, the false-hit level.
- **i-014:**
  - The bot was turned off ("You control the game") 50 ms before the result
    screen.
  - The runner was still moving on the bot's keys about 0.5 s before the end,
    whereas a fatal hit ends a run only 1 s later.
  - This is the same pattern as i-011, where the user's click took focus.
    Something took window focus at 18:14:37; the source is unknown.
- **Slow PC:** frame decoding was about 1.7× slower than in earlier games
  (13–19 ms against 8–9 ms) in i-013 and part of i-014, so the PC was under
  other load.
- **Detection fix found by this check:**
  - The same recomputation on an earlier live game (i-012, old controller)
    found a real endgame box (3,465 m, lane 0) that the old controller avoided.
  - On live frames it was missed at 55–59 m (a few pixels) and for 2 frames
    behind a fence: 19 of 25 votes. My first rule (≥85% of all frames) would
    never have confirmed it.
  - The rule is now 12 of the last 14 frames, which confirms it at 29.9 m.
    The 19 batch boxes are still confirmed, with no false ones; a test was
    added.

**Second live series** (approved; batch idle; up to 4 games, stopping at the
first endgame box):

| game | result | endgame box |
|---|---|---|
| i-016 | **31,570**, full course | none (8 votes at most) |
| i-017 | ended at 44 s (~1,480 points) by a focus loss | – |
| i-018 | **9,870**, crashed at ~3,330 m | collected at 3,315 m, then crash |

- **i-017:** same pattern as i-011 and i-014: the bot was turned off 49 ms
  before the result screen. A foreground-window logger started after i-017
  saw no other window take focus during i-018. The Claude app came to the
  front only after the browser closed. The 15-minute focus thefts (18:14:37,
  18:30:04) remain unexplained.
- **i-018 collected a box and then crashed:**
  - Box in lane 0 at 3,315 m, confirmed 34.2 m ahead (22 of 24 frames).
  - Puzzle solved. The page's pause came 12 ms before the predicted collection
    time, so the clock shift was accurate.
  - The plan had a double lane change 1.6 m past the box, because the next
    row's sliding fence (3,330 m, 15 m on, about 0.3 s) was in lane 0.
  - The puzzle pause cleared that key, as designed.
  - After the continue click the loop took **0.48 s** to steer again: the
    puzzle window fades out with its text still on the page, so the loop
    still saw a puzzle.
  - The game was already running, so the runner hit the 3,330 m fence.
  - This is the first live death from the box change.
- **The simulator had missed it:** it gave control back on the next frame.
  With a resume delay added (`resumelag=`):

| scenario (paired courses) | runs | deaths | boxes collected |
|---|---|---|---|
| 5% rate, 0.5 s delay, no hold | 1,000 | 195 | |
| 5% rate, 0.5 s delay, 30 m hold | 1,000 | 28 | 389/769 |
| 5% rate, 0.15 s delay, 30 m hold | 1,000 | 3 (baseline) | 403/769 |
| 30% rate, 0.5 s delay, no hold | 600 | 475 | |
| 30% rate, 0.5 s delay, 30 m hold | 600 | 116 | |

**Fixes:**

1. **Planner hold** (`holdAfter`, `BOX_HOLD_AFTER=30`): a route that collects
   a box presses no key for 30 m past it, plus the coin margin.
   - A box whose next row blocks its lane is not taken. That's about half the
     boxes; in the simulator 52% were collected instead of 85%.
   - The beam keeps held and free routes apart.
   - Regression test with the i-018 layout.
2. **Fast resume** (`interactive-play.mjs`, `steerFromModel`):
   - Right after the bot's continue click, the clock resumes from the click
     time and the controller plans from its lane model and sends keys at once.
   - While the puzzle window fades out (its text still on the page, up to
     1.5 s, unless a new puzzle screen appears in the page log), it keeps
     steering from the model without analysing frames.
   - Test added.
3. The controller's pause now uses the session's pause time.

More runs with the resume delay (5% box rate, 1,000 paired runs each):

| mode | resume delay | deaths | boxes collected | points in the stretch |
|---|---|---|---|---|
| avoid (old) | 0.15 s | 3 | 67 (by accident) | 1,531 |
| collect, 30 m hold | 0.15 s | 3 | 403 | **1,600** |
| collect, 30 m hold, ±3 m clock error | 0.15 s | 3 | 402 | 1,599 |
| collect, 50 m hold | 0.15 s | 3 | 326 | 1,585 |
| avoid (old) | 0.5 s | **28** | 66 | 1,514 |
| collect, 30 m hold | 0.3 s | 28 (the same 28 runs) | 390 | 1,580 |
| collect, 50 m hold | 0.5 s | 28 (the same 28 runs) | 318 | 1,565 |
| collect, 65 m hold | 0.8 s | 30 | 316 | 1,561 |

At the 30% stress rate with a 0.15 s delay and the 30 m hold: 3 deaths in 600
runs (baseline 2), 1,528/3,092 boxes collected.

What this shows:

- **With the hold, deliberate collection adds no deaths over the old avoid
  behaviour, at any delay.** Avoid at 0.5 s dies in exactly the same 28 runs
  as collect.
- **Those 28 deaths come from a box hit by accident.** The simulator lets the
  controller see only 75% of boxes; one passed through unseen pauses the game,
  and a slow resume then misses the next row. This risk exists in either mode.
- **A longer hold doesn't help,** it only takes fewer boxes. So it stays at
  30 m.
- **The fast resume protects against both kinds of box hit.** With a 0.15 s
  delay every mode is at the baseline. Live, the fast resume should give
  control back within a few tens of milliseconds of the click.
- **Expected gain:** about +70 points per run over the old avoid behaviour.

The hold fixes the deliberate case; the fast resume is needed for any box
hit.

**Third live series, with both fixes** (approved; batch idle; stopping once a
box was collected and survived; foreground-window logger running):

| game | result | endgame box |
|---|---|---|
| i-019 | **31,730**, full course (7,926 m) | none (5 votes at most) |
| i-020 | **30,390**, full course (7,962 m) | collected at 3,555 m, survived |

i-020 in detail:

- **Box:** lane 1 at 3,555 m, confirmed 33.3 m ahead. Collected, and its
  puzzle solved (+200, in addition to the early box's +200).
- **Pause:** 2.2 s, clock shift 2.30 s. The bot saw the pause 69 ms after the
  predicted collection time.
- **Resume:**
  - first steering from the lane model 2 ms after the bot's continue click
    (i-018: 505 ms to the first key);
  - first analysed frame 434 ms after the click, once the puzzle window had
    faded;
  - first key needed 486 ms after the click: the plan kept the box lane, as the
    hold requires.
- **Clock after the puzzle:** the first lane-row measurement, 36 m past the box
  (8 residuals), found a 2.63 m error and fixed it. That's more than the
  ±1.5 m estimate, but inside the ±3.5 m post-pause margin, which shows the
  wide margin is needed.
- **Planning:** fallback level 0 on every frame from 35 m before the box to
  60 m after it. Margin 3.5 m until the clock fix, then 2 m. No lane
  corrections.
- **Focus:** the logger saw only the Claude app coming to the front after each
  browser closed. No focus theft during either game.

New log fields: `pauseChecks` (the first clock measurement after a box pause)
and `plannedAt` on model-steered records. `analysis/box-live.mjs` reports
them.

### Early-game jumps (2026-10-17, user request)

The user reported that the bot "jumps too often and misses some points", and
asked for a jump only when a cone is unavoidable.

**Game rules** (index-DnBWvl2N.js):

- **The jump:** 1.5 m high, 200 ms up and 250 ms down. The body box (feet to
  1.8 m above them) rises with it.
- **What a jump clears:** only cones ("Cọc tiêu", −30, `canJumpOver`).
  Barriers (−60) and fences collide whatever the height.
- **Coins:** float at 0.8–1.2 m and are collected within 0.5 m of the body
  box. So in the middle ~160 ms of a jump, coins bobbing below 1.0 m are
  missed.
- **Letters** (1.05–1.35 m, radius 0.7) and boxes (radius 1.2) are never
  missed by a jump.

**Trial 427's jumping:**

- None of the jump-mode flags was set, so the default rule applied: jump
  whenever 1 s has passed since the last jump and nothing is due in the
  target lane within 350 ms.
- The crossing pilot also turns on late-stage jumps: every 70 ms while on the
  ground in "Bứt phá" (2,600–2,806 m).

**Measured** in 30 batch runs (c-037..c-066; same controller flags as the
interactive edition), per run:

| | count |
|---|---|
| jumps | 94 |
| with a cone due in the runner's lanes | 3.0 |
| with a barrier due (can't be jumped) | 2.8 |
| with nothing ahead | 88 |
| expected coin points lost in the air | ~88 |

- **Early-game score:** median 5,630 at takeover.
- **Cones that reached the committed lane within 280 ms:** 1.2 per run, 37 in
  total. Only 6 got a jump, because the default rule blocks jumping when
  something is due within 350 ms.
- **Penalties:** about 0.6 per run, mostly single −30s.

**Change:**

- Settings add `--hazard-only-early-jumps`, the pilot's existing mode: jump
  only for a tracked low obstacle still in the committed lane within 280 ms,
  with the runner on the ground.
- Settings also add `--jump-cones-only`, which is new: only cones count, and
  the crossing pilot's late-stage jumps are turned off.
- Per-frame `timing.jsonl` records now mark jump keys (`jump:1`).

**Offline check** (`analysis/jump-policy-replay.mjs`): the jump decision is
recomputed on every recorded frame, with the same perception and lane plan.

| policy | jumps per run | cones jumped (of 37) | coin points lost in the air |
|---|---|---|---|
| recorded (trial 427) | 93.8 | 6 | 87.8 |
| cone-only | 0.8 | 23 | 1.3 |

- **The 14 cones the replay didn't jump:** in every one the recorded runner
  was already in the air from an old random jump, which won't happen under
  the new rule.
- **Real-loop replay** (headless, i-012's frames): no errors, puzzle and
  result handled, 24 keys sent against about 60 before.
- **Tests:** 32/32.
- **Expected effect:** about +85 points per run in the early game from coins
  no longer missed, and fewer cone hits. The "lucky" clears of untracked cones
  by random jumps are worth only a few points per run.

**Live check** (approved; batch idle; Chrome, bot on throughout). Per-frame
`timing.jsonl` now also logs the HUD score and penalty popups (`score`,
`pen`); `analysis/jump-live.mjs` reports them.

| game | final | jumps (early game) | penalties | score at the 2,806 m takeover |
|---|---|---|---|---|
| i-024 | **35,890**, full course (the highest yet) | 3 | one −30 cone | 5,640 |
| i-025 | **32,190**, full course | 3 | none | 6,120 |

For comparison, under the old jumping: about 94 jumps per run; score at the
takeover was a median 5,630 in batch, and 4,930–5,960 in the interactive games
i-001, i-008, i-010 and i-012. Two games are not a measurement of the coin
gain, but the jumping is gone.

**i-024's cone hit:**

- The early mystery box was in the left lane and a row of three cones in the
  middle lane; the runner came from the right.
- The controller crossed the cone lane to take the box (+200 for −30).
- The jump rule checks only the start and end lanes, not a lane crossed on the
  way.
- In the 30 batch runs, a cone in a crossed middle lane near a double lane
  change came up about 4.8 times per run (a loose count). Actual cone hits
  were about 0.4 per run, so extending the rule to crossed lanes would be
  worth at most about 15 points per run. Not done.

## Still to verify

Hand-back after a real player has steered in the obstacle sections. In the
replays the "player" is the old bot's recorded moves; live, only a hand-back
in the breather was tried.
