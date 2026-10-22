# SC City Quest bot (interactive edition)

A screen-reading bot for the Standard Chartered City Quest runner game
(sccityquest.zenimpact.vn), Hanoi course, Guest play only. It plays in a
normal browser window that you can take over at any time with **F8**.

- **Before 4,285 m:** the early-game controller steers. This is ChatGPT's
  trial-427 pilot and interactive edition (F8/Escape takeover, cancellable
  inputs).
- **From 4,285 m to the finish:** Claude's endgame controller (endgame-v3)
  steers. It is the controller of the batch bot, which survived 30 of 30 live
  runs (mean 31,074 points) on the course before the 2026-10-17 game update.

The distances are those of the current course (game bundle
`index-BFqScKec.js`, 2026-10-17); see [Course](#course). The live bundle
`index-B8HeQgVv.js` (2026-10-20) plays the same course. Its health warning now
stays at the bottom left of the screen, which the bot tolerates
([docs/game-update-B8HeQgVv.md](docs/game-update-B8HeQgVv.md)). The bundle
before it, `index-CE9I5eWz.js` (2026-10-19), changed only the menus
([docs/game-update-CE9I5eWz.md](docs/game-update-CE9I5eWz.md)).

The bot uses only screenshots, visible page text and normal keyboard and mouse
events. There is no login, score submission, purchase, prize claim or hidden
game-state access. The public game bundle is checked before play, and if it
has changed the bot stays disabled until its rules have been reviewed.

## Quick start (Windows)

1. Double-click **`Start City Quest Bot.cmd`**. It opens a dedicated Chrome
   window with the bot **off**. The dependencies are in `node_modules/`; if
   that folder is missing, the launcher runs `npm install` first.
2. Click inside the game window, then press **F8** (on some laptops
   **Fn+F8**), or click the Start/Stop button at bottom right. At the menu the
   bot picks Guest and Hanoi itself. Alternatively, start a Guest game in Hanoi
   yourself (blue runner, default window size) and press F8.
3. Confirm the 18+ prompt yourself, or launch with `--age-authorized` to let
   the bot tick it.
4. Keep the game window in front and focused during a run. The game's own
   code makes the runner fall when its window loses focus or its tab is
   hidden, whether or not the bot is playing. Windows also counts a fully
   covered window as hidden.
5. After the result screen the bot turns off. Start the next game and press
   F8 again. Close the game window to quit.

The F8 shortcut works only while the game page has keyboard focus.

Each session leaves a log folder in `work/`. To clear old ones, double-click
**`Clear Old Logs.cmd`** (see [Clearing old logs](#clearing-old-logs)).

## Playing yourself

- **Stopping:** F8 or Escape stops the bot, and so does switching to another
  tab or window (it doesn't turn back on by itself). Stopping doesn't pause
  the game.
- **What stopping undoes:** the bot cancels queued moves and releases any
  mouse drag. An input already sent can't be undone.
- **Giving control back:** press F8 again. Finish your lane change first. The
  bot first finds your lane from fresh frames, then steers.
- **Puzzles:** the bot solves them while it is on. Press F8 or Escape to solve
  one yourself.
- **Endgame (from 4,250 m):** the endgame controller follows the course on
  every frame even while the bot is off, so you can play part of the endgame
  and hand back at any point. Handed back before 4,285 m, the early-game
  controller steers until then.
  - It waits until the runner has been seen in one lane for 0.2 s.
  - Until it has pressed a few keys itself, it assumes a typical 25 ms
    screenshot lag.
- **When the endgame clock is lost:** the distance clock comes from the
  timing of the visible HUD stage labels. It is lost if the game tab is
  hidden, or if a puzzle starts between the last stage label and 4,250 m. The
  endgame controller then stays off for that run, and F8 uses the early-game
  controller.

## Jumps

The early-game controller jumps only for a cone it can't steer around: a
tracked cone (−30 if hit) still in the lane it is committed to, less than
280 ms away. It never jumps for barriers, which the game doesn't let you jump.

Trial 427 used to jump about once a second, and every 70 ms in the late
"Bứt phá" stage, whether or not anything was ahead: about 94 jumps per run.
That made the runner miss coins below it, about 88 points per run, while
almost never jumping for an actual cone (6 of 37 in 30 recorded runs).

Remove `--hazard-only-early-jumps` and `--jump-cones-only` from
`src/interactive-settings.json` to restore the old jumping. The endgame
controller never jumps.

## Location medals and navy coins

**Location medals (+200 each):**

- **Where they are:** three discs hang 2 m up in the middle lane: a gold one
  in Tăng tốc 1, a blue one in Tăng tốc 3, and a green one in Về đích. Each
  sits at a random point in its stage; the help screen's "600 / 3,200 /
  3,900 m" is only approximate. Five recorded games put them at 759–977 m,
  3,304–3,380 m and 4,082–4,132 m on the current course.
- **Why some were missed:** the early-game controller recognised only the
  gold one by its colour. The green medal was collected in 26 of 49 recorded
  games.
- **How they are found now:** `src/medals.mjs` looks for any of the three
  ring colours around a pale disc of medal size at medal height, using the
  exact camera projection. It sees the medals from 40–55 m with no false
  detections in seven recorded games (`--location-medals`).

**Navy coins (80 each):**

- **Why some were missed:** the early-game controller's coin detector knew 27
  of the 51 navy coins in live game i-027, and missed 10 of them. It knew 95%
  of the white coins.
- **How they are found now:** the final-stage coin detector supplies navy
  coins to it as well. In the same game it then knows all 51
  (`--navy-coins`).
- **Cost:** about 3.5 ms more per frame (median 28 ms).

**The first second of a game (2026-10-19):**

- **Runner position:** the health-warning banner covers the lane-line rows
  that find the runner's position for about the first 17 frames. Until then
  the navy-coin and medal detectors had no runner position and did nothing.
  The early-game controller now measures the lane lines just above the banner
  while it is up (`measureRunnerX(frame,{startRows:true})`). On five recorded
  games this agrees with the usual rows to 0.04 m (p95). Without the option
  the result is unchanged, so the endgame is unaffected.
- **White coins:** all coins spawn together at the start, facing the camera.
  For about the first second the controller's own white-coin check (size,
  shape, logo model) rejects most of them. In live game i-024 its first white
  pickup came at frame 20, and two lane-0 coins went by.
  - With `--opening-white-coins` the final-stage coin detector supplies white
    coins in Nhập cuộc until the own check has recognised one in two frames.
  - In replays of five recorded openings, white pickups start at frame 2–4
    instead of 20–26 where the own check was late.
  - In those replays the controller decides to fetch the early coins; the
    other two games' decisions are unchanged.
- **Live check (i-031, 2026-10-19):** in the first 150 m it collected 8 of 8
  coins, and in the first 400 m 13 of 13 white coins and 4 of 5 navy. The
  navy miss at 320 m was a lane-timing choice, not detection.
  - The five games before (i-024, i-027, i-029, i-030) collected 4–7 of 6–8
    coins in the first 150 m, and missed 1–2 white coins each in the first
    400 m.
  - One game is not conclusive, but every opening coin was collected.
  - The game itself ended in Tăng tốc 3 when its window lost focus (another
    window was clicked), not by a crash.

**Live check (2026-10-17):** two games with both changes against the two
games just before. Coins are counted by `analysis/early-coin-audit.mjs`,
medals from the HUD.

| | i-026, i-027 (before) | i-028, i-029 (with medals and navy coins) |
|---|---|---|
| navy coins collected | 22/29 (76%), 41/51 (80%) | **33/34 (97%), 30/32 (94%)** |
| white coins collected | 95%, 94% | 95%, 85% |
| medals | 3/3, 2/3 (green missed) | 3/3, 2/3 (*) |
| letters / words | 9 + 1 wrong / 3; 10 / 3 | 11 / 3; 10 / 3 |
| result | 26,380; 28,510 | 30,070; 25,750 |

(*) In i-029 the blue medal sat at 3,156 m, the same distance as the first
letter row of that stage's word race. Taking it meant a word-race blocker
(cone or barrier) and a wrong letter (−80, streak reset), so the controller
took the letter instead.

i-028 ended at 8,230 m, before the end of the course, by an endgame crash in
the second sliding stretch. There are hardly any points left after it. The
cause is a known planner weakness, listed in the update review.

## Mystery boxes (+200)

The blue "?" boxes open a puzzle worth 200 points. The bot solves the puzzle
itself.

- **Early box:** one per run, between 600 and 2,400 m, in a random lane. The
  early-game controller goes for it. It was collected in 63 of 66 batch runs
  and in every interactive game that got past 2,400 m.
- **Endgame boxes:** in 4,340–4,840 m (single sliding fences every 30 m), each
  fence row has a 5% chance of a box 15 m after it. That's about 0.8 boxes per
  run, with at least one in more than half of runs. The endgame controller
  used to avoid these on purpose, because the puzzle pause broke its distance
  clock. It now collects them:
  - **Confirming a box:** a box counts once it has been seen on 12 of the last
    14 frames, about 30–35 m before it. In 30 recorded batch runs and one live
    game this rule confirmed all 20 real boxes and none of the false hits.
  - **Safety first:** fences stay hard limits. A box is never worth a pass
    closer than 0.75 m to a sliding fence's predicted edge. A box is taken only
    if the bot can then keep its lane for 30 m, so a box whose next fence row
    (15 m later) blocks its lane is skipped. That's about half of them.
  - **During the pause:** the page is read every frame near a box, so the
    pause is seen at once.
  - **After the puzzle:** right after its continue click, the bot resumes the
    clock and steers from its lane model. It doesn't wait for the puzzle window
    to fade out; in live game i-018 that wait took 0.48 s and cost the run. It
    then plans with a wider ±3.5 m distance margin and checks its lane on
    screen, until the fence rows have re-measured the clock.
  - `--endgame-boxes=avoid` restores the old behaviour.

## Course

The bot follows the course of the public game bundle it was checked against
(`--expected-bundle` in `src/interactive-settings.json`). On another bundle
it stays off until the new rules have been reviewed.

The 2026-10-17 update (`index-BFqScKec.js`, review in
[docs/game-update-BFqScKec.md](docs/game-update-BFqScKec.md)) lengthened the
course:

- **Stages:**
  - Tăng tốc 2 is now 1,280–3,060 m, and the runner holds its 31 m/s cap from
    about 2,340 m;
  - Bứt phá (the final stage) starts at 4,140 m instead of 2,600 m.
- **Rain stretch, 2,060–3,060 m:** coin streams and no random obstacles.
- **Final stage, shifted by +1,040 m:**
  - lane-fence rows at 4,340–4,820 m;
  - sparse fences to 5,340 m;
  - dense rows after that;
  - the course ends at 11,040 m.
- **No gap before the fences:** the empty stretch before the first sliding
  fence is gone. The random obstacles now run right up to it at 4,340 m.
- **Letters ×4:** 40/120/200 per letter, +800 per word, −80 for a wrong lane.

**How the bot handles it:**

- **Course model:** all distances, the speed law (now with the stage speed
  caps that bind) and the letter-row spacing come from one course model,
  `src/endgame-v3-course.mjs`. It also keeps the old course for replaying
  recorded runs.
- **Handover:**
  - From 4,250 m the endgame controller follows the course on the early-game
    controller's frames, and measures the fences that controller tracks.
  - From 4,285 m it takes over steering, between two of the early-game
    controller's moves and not while it is passing an obstacle (by 4,300 m in
    any case).
  - Up to 4,345 m it plans around the early-game controller's tracks of the
    last random obstacles (cones, barriers, fences). It measures each fence's
    distance itself from where the fence meets the road, because the
    early-game estimate can be off by up to 8 m.
  - A fence track level with the first sliding row counts as that row's fence
    once the row is resolved. Until then it stays a likely obstacle.
- **Letters:** the early-game controller values a letter at 720 instead of 180
  (`--letter-value=720`).

## Options

Pass options to the launcher or after `npm start --`:

| option | effect |
|---|---|
| `--edge` | use Microsoft Edge instead of Chrome |
| `--chromium` | use Playwright's Chromium (first run `npx playwright install chromium`) |
| `--age-authorized` | let the bot tick the 18+ confirmation |
| `--capture` | save every analysed frame and per-frame timings (`timing.jsonl`) |
| `--crash-frames-ms=N` | keep the last N ms of frames for crash frames (default 4000; 0 turns them off) |
| `--no-warmup` | skip the 1.5 s launch warm-up |
| `--sequential-text` | use the original early-game page-text read |
| `--endgame-boxes=avoid` | steer around endgame mystery boxes instead of collecting them |

- **Endgame controller off:** remove `--endgame-v3` from
  `src/interactive-settings.json`.
- **`--capture` recordings before 2026-10-22:** in their `timing.jsonl`,
  each line written after the endgame takeover has the number of the frame
  before its own. Its frame is `frame-<f+1>.jpg`, and the takeover's number
  appears twice. Recordings made since pair each line with its own frame.
- **Environment variables:**
  - `SC_BOT_OUTPUT` chooses where session logs go;
  - `SC_BOT_BROWSER_PROFILE` chooses the browser profile;
  - `SC_BOT_DEPENDENCIES` points at another `node_modules` folder.

## Terminal setup

You need Node.js 20+ and Chrome (default), Edge or Playwright Chromium.

```
npm install
npm start
npm test
```

- **Browser profile:** the bot uses a dedicated profile in
  `work/interactive-browser-profile`, never your usual one. Close its window
  before starting a second copy.
- **Session logs:** go to `work/interactive-<time>/`:
  - `controls.jsonl` and `progress.json`;
  - `results.jsonl`, marked interactive because a human may have helped;
  - result and solved-puzzle screenshots;
  - for runs that reach the endgame, `endgame-<time>.json` with clock samples,
    hand-offs, keys and per-frame decisions;
  - for a run that ends early, `crash-<time>/` with its last frames (below).
- **Crash frames:** without `--capture`, the bot keeps the last 4 s of
  analysed frames in memory (80–100 frames, 6–8 MB). When a run ends early,
  they go to `crash-<time>/` in the session folder. A full-course game writes
  nothing.
  - **Ended early:** the furthest distance the bot's clock reached in the run
    is short of 8,540 m, the end of the second sliding range. Full-course
    games run on to about 9,000 m, where the course closes. A run that ends
    before the clock starts (500 m) counts as early.
  - **When it's checked:** at the result screen, or when the endgame loses the
    game screen for 3 s.
  - **What writes nothing:** a run you leave yourself (reloading, closing the
    browser), and a game whose end the bot didn't see (bot off before the
    endgame).
  - **What the folder holds:**
    - `frame-<n>.jpg`, numbered as `--capture` numbers them;
    - their lines of `timing.jsonl`;
    - a copy of the run's `endgame-<time>.json`;
    - `crash.json`: the furthest and last distances, and the frame 1 s before
      the last one. The game shows its result 1 s after a fatal hit, so the
      hit is near that frame.
  - **Replays:** the folder is a run folder for the endgame replay tools in
    `claude-sc-city-quest/analysis/` (`endgame-replay.mjs`,
    `slider-check.mjs`). They pair frames with endgame records by capture time
    (`at - age` in `timing.jsonl`).
  - **Cost:** about 0.5 µs per frame. Writing a folder takes about 50 ms,
    after the result screen.
  - **Options:** `--crash-frames-ms=N` keeps N ms of frames (0 turns this
    off). `--capture` saves every frame instead and writes no crash folders.
- **Clearing old logs:** see [Clearing old logs](#clearing-old-logs).

## Clearing old logs

Each session leaves a folder of a few MB in `work/` (6–8 MB more for each
game that ends early, far more with `--capture`), and the bot's browser
profile collects caches. To clear them:

1. Double-click **`Clear Old Logs.cmd`** in the bot's folder (or run
   `npm run clean`).
2. It lists what it would move to the Recycle Bin, with sizes, and asks
   `Move these to the Recycle Bin? [y/N]`.
3. Type `y` and press Enter to clear them. Press Enter alone to change
   nothing.

Nothing is deleted outright: everything goes to the Recycle Bin, so you can
restore it from there.

- **What it clears by default:**
  - every session folder except the newest 3 that hold a game (folders where
    nothing was played go too);
  - bench outputs and stray `.log` files.
- **What it always keeps:** the browser profiles' sign-ins, settings and 18+
  confirmation.
- **What it leaves alone,** listed under "Left alone":
  - the newest session while the bot is running, and the browser caches while
    the game window is open;
  - anything the Recycle Bin can't take: paths of 250 or more characters, or
    items larger than the bin.

**Options:** pass them after `npm run clean --` (for example
`npm run clean -- --all`), or to `Clear Old Logs.cmd` from a terminal.

| option | effect |
|---|---|
| `--dry-run` | list what would go and change nothing |
| `--keep=N` | keep the newest N sessions with a game (default 3) |
| `--cache` | also clear the browser caches (the game downloads them again) |
| `--all` | clear every session folder and the browser caches |
| `--yes` | don't ask first |

## How it was checked

**Unit tests** (`npm test`, 57 pass), covering:

- key cancellation on stop;
- the stage clock and its loss;
- puzzle pause timing;
- hand-back lane detection and correction;
- shadow following;
- the late-key crash;
- the warm-up;
- the page-text reader;
- mystery boxes (on both courses);
- cone-only jumps;
- the handover obstacles, follow and takeover distances, and letter rows;
- which course each live game bundle plays, and the version guard;
- the crash frames' buffer and early-end rule.

The log cleaner was checked on fake work folders (Recycle Bin moves, sessions
in use, paths too long for the bin) and with a dry run on a real one.

The crash frames were checked offline:

- **Real bot loop:** run on i-036's recorded frames on the local replay page
  of `tools/text-read-bench.mjs`, without `--capture`. A run ending in the
  early game and one ending in the endgame each left one folder. Every
  timing line had its frame, and in the endgame every line matched an
  endgame record.
- **Replay tools:** a crash folder cut from i-036 at 4,431 m reads in the
  endgame replay and slider-check tools.
- **Cost:** measured on i-036's 5,047 frames (75 KB each): 0.5 µs per frame
  on average, under 4 µs at the 99th percentile.

**Live interactive games** (Chrome unless noted, bot on throughout unless
noted, 2026-10-16, all on the course before the 2026-10-17 update):

| game | result |
|---|---|
| i-001 | 33,160, full course |
| i-002 | 31,950, full course; F8 off at 2,915 m and back on at 3,023 m |
| i-008 | 31,890, full course (after the display-scaling fix) |
| i-009 (Edge) | 30,140, full course; the dense-boundary case handled live |
| i-010 | 32,110, full course (with the warm-up) |
| i-012 | 29,450, full course (with the bounded text read); smoothest opening so far |

On the current course (2026-10-17, bundle `index-BFqScKec.js`):

| game | result |
|---|---|
| i-026 | 26,380, full course; takeover at 4,285 m, 3 words |
| i-027 | 28,510, full course; takeover at 4,286 m, a handover fence measured by contact, 3 words |
| i-028 | 30,070, ended at 8,230 m (endgame crash, second sliding stretch); medals and navy coins (97%) |
| i-029 | 25,750, full course; navy coins 94%; blue medal traded for a word-race letter |
| i-032 (bundle `index-B8HeQgVv.js`) | 27,560, full course; calm takeover at 4,287 m; 11 letters, 3 words, all three medals |
| i-033 (bundle `index-B8HeQgVv.js`) | 28,740, full course; forced takeover at 4,301 m; 9 letters, 3 words, all three medals |

The new course gives fewer endgame coins and more letter points. See
[docs/game-update-BFqScKec.md](docs/game-update-BFqScKec.md).

Earlier failures, all fixed:

- the loading-screen timeout;
- the black (hidden) window;
- 125% display-scaling blur;
- Edge relaunch and stray-tab focus;
- the end-of-run crash;
- a cold-start crash (i-007, fixed by the warm-up).

i-011 ended when the window lost focus to the user's click. Details are in
[docs/](docs/).

## Layout

```
Start City Quest Bot.cmd   launcher (installs dependencies if missing)
Clear Old Logs.cmd         moves old session logs to the Recycle Bin (tools/clean-logs.mjs)
src/                       the bot (flat: modules, models, settings)
  interactive-play.mjs     entry point: browser lifecycle, early game and endgame loops
  bot-control.mjs          F8, Escape, on-page button, focus handling
  user-browser.mjs         dedicated Chrome/Edge launcher (1:1 rendering, game tab kept in front)
  controller-config.mjs    early-game pilot setup (trial 427), with the *-pilot, detector and *-model.json files
  manual-handoff.mjs       lane reacquisition when you hand back in the early game
  interruptible-scheduler.mjs  cancellable multi-key inputs
  page-text.mjs            early-game page-text read that a slow page does not hold up
  crash-frames.mjs         the last seconds of frames, written when a run ends early
  medals.mjs               location medals (gold, blue, green) for the early-game controller
  endgame-session.mjs      endgame clock, following/steering, hand-back, timed keys, logs
  endgame-v3-course.mjs    course model: both known courses, speed law, row timetable
  endgame-v3*.mjs          endgame controller (perception, coins, planner)
  camera-model.mjs, runner-x.mjs  screen geometry for the endgame
  warmup.mjs, warmup/      launch warm-up on 22 bundled frames from a recorded run
  interactive-settings.json  controller flags and the expected game bundle
test/                      unit tests (node --test)
tools/                     live check, log cleanup and offline benches (see tools/README.md)
docs/                      reports and provenance
```
