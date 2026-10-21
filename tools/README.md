# Tools

Run these from the repo root.

## Live check

`live-check.mjs`: plays one live game in its own visible window and presses
F8 the way a player would.

- It needs your OK, and you shouldn't use the PC while it runs.
- It records with `--capture` into the output folder you give it.
- `--toggle` turns the bot off and back on in the obstacle-free stretch after
  2,806 m.

```
node tools/live-check.mjs work/live/g-001
node tools/live-check.mjs work/live/g-002 --edge
node tools/live-check.mjs work/live/g-003 --toggle
```

## Clearing old logs

`clean-logs.mjs` (or `Clear Old Logs.cmd` in the repo root): moves old logs
to the Windows Recycle Bin after listing them and asking.

- **What it moves:**
  - session folders (`work/interactive-<time>/` and `work/live/<name>/`)
    except the newest `--keep=N` that hold a game (default 3; `--all` keeps
    none);
  - `work/text-read-bench/` and stray `*.log` files;
  - with `--cache` or `--all`, the browser caches in the bot's and the live
    check's profiles.
- **What it leaves alone:**
  - the profiles' sign-ins and settings;
  - the newest session while the bot or a live check is running, and caches
    while the browser is open.
- **Recycle Bin limits:** the Windows shell can't recycle a path of 260 or
  more characters; it offers to delete it permanently instead.
  - So nothing with a path over 250 characters, or larger than the bin, is
    handed to it.
  - Items go one at a time, and each is checked in the bin afterwards; the run
    stops if one disappears without reaching it.
  - If Windows still asks to delete something permanently, answer No.

```
node tools/clean-logs.mjs --dry-run
node tools/clean-logs.mjs
node tools/clean-logs.mjs --all --yes
```

## Offline benches

These need a game recorded with `--capture`, such as a live-check output
folder. Neither contacts the live game.

**`warmup-bench.mjs`:** the early-game controller's cost over a recording's
first frames, run cold or after the launch warm-up.

```
node tools/warmup-bench.mjs cold work/live/g-001
node tools/warmup-bench.mjs warm work/live/g-001
```

**`text-read-bench.mjs`:**

- **What it does:** a local page replays a recording's frames, with the HUD
  text in hidden DOM, game-like main-thread load, a Guest start, a puzzle
  screen and a result screen. The real bot loop plays it in headless Chrome.
- **What it compares:** the original page-text read (`sequential`) against
  the current bounded read (`bounded`).
- **What it reports:** frame gaps, text waits, frame age at analysis, and
  delays in seeing stage, puzzle and result screens.

```
node tools/text-read-bench.mjs work/live/g-001 3
```
