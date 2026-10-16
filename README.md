# SC City Quest bot (interactive edition)

A screen-reading bot for the Standard Chartered City Quest runner game
(sccityquest.zenimpact.vn), Hanoi course, Guest play only. It plays in a
normal browser window that you can take over at any time with **F8**.

- **Before 2,806 m:** the early-game controller steers. This is ChatGPT's
  trial-427 pilot and interactive edition (F8/Escape takeover, cancellable
  inputs).
- **From 2,806 m to the finish:** Claude's endgame controller (endgame-v3)
  steers. It is the controller of the batch bot, which survived 30 of 30 live
  runs (mean 31,074 points).

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
- **Endgame (from 2,806 m):** the endgame controller follows the course on
  every frame even while the bot is off, so you can play part of the endgame
  and hand back at any point.
  - It waits until the runner has been seen in one lane for 0.2 s.
  - Until it has pressed a few keys itself, it assumes a typical 25 ms
    screenshot lag.
- **When the endgame clock is lost:** the distance clock comes from the
  timing of the visible HUD stage labels. It is lost if the game tab is
  hidden, or if a puzzle starts between the last stage label and 2,806 m. The
  endgame controller then stays off for that run, and F8 uses the early-game
  controller.

## Options

Pass options to the launcher or after `npm start --`:

| option | effect |
|---|---|
| `--edge` | use Microsoft Edge instead of Chrome |
| `--chromium` | use Playwright's Chromium (first run `npx playwright install chromium`) |
| `--age-authorized` | let the bot tick the 18+ confirmation |
| `--capture` | save every analysed frame and per-frame timings (`timing.jsonl`) |
| `--no-warmup` | skip the 1.5 s launch warm-up |
| `--sequential-text` | use the original early-game page-text read |

- **Endgame controller off:** remove `--endgame-v3` from
  `src/interactive-settings.json`.
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
    hand-offs, keys and per-frame decisions.

## How it was checked

**Unit tests** (`npm test`, 22 pass), covering:

- key cancellation on stop;
- the stage clock and its loss;
- puzzle pause timing;
- hand-back lane detection and correction;
- shadow following;
- the late-key crash;
- the warm-up;
- the page-text reader.

**Live interactive games** (Chrome unless noted, bot on throughout unless
noted, 2026-10-16):

| game | result |
|---|---|
| i-001 | 33,160, full course |
| i-002 | 31,950, full course; F8 off at 2,915 m and back on at 3,023 m |
| i-008 | 31,890, full course (after the display-scaling fix) |
| i-009 (Edge) | 30,140, full course; the dense-boundary case handled live |
| i-010 | 32,110, full course (with the warm-up) |
| i-012 | 29,450, full course (with the bounded text read); smoothest opening so far |

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
src/                       the bot (flat: modules, models, settings)
  interactive-play.mjs     entry point: browser lifecycle, early game and endgame loops
  bot-control.mjs          F8, Escape, on-page button, focus handling
  user-browser.mjs         dedicated Chrome/Edge launcher (1:1 rendering, game tab kept in front)
  controller-config.mjs    early-game pilot setup (trial 427), with the *-pilot, detector and *-model.json files
  manual-handoff.mjs       lane reacquisition when you hand back in the early game
  interruptible-scheduler.mjs  cancellable multi-key inputs
  page-text.mjs            early-game page-text read that a slow page does not hold up
  endgame-session.mjs      endgame clock, following/steering, hand-back, timed keys, logs
  endgame-v3*.mjs          endgame controller (course rules, perception, coins, planner)
  camera-model.mjs, runner-x.mjs  screen geometry for the endgame
  warmup.mjs, warmup/      launch warm-up on 22 bundled frames from a recorded run
  interactive-settings.json  controller flags and the expected game bundle
test/                      unit tests (node --test)
tools/                     live check and offline benches (see tools/README.md)
docs/                      reports and provenance
```
