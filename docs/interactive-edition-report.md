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

Run with `analysis/interactive-live-check.mjs`, which uses a dedicated Chrome
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

`interactive/warmup.mjs` runs a throwaway early-game controller over 18
consecutive frames and a throwaway endgame controller over 4 frames (bundled
in `interactive/warmup/`, from batch run c-064), ×4 rounds. It also does three
page-text reads, all at launch while the menu loads (~1.5 s). `--no-warmup`
skips it.

Offline benchmark (`analysis/warmup-bench.mjs`): the first 240 opening frames
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

**Offline bench** (`analysis/text-overlap-bench.mjs`).

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

## Still to verify

Hand-back after a real player has steered in the obstacle sections. In the
replays the "player" is the old bot's recorded moves; live, only a hand-back
in the breather was tried.
