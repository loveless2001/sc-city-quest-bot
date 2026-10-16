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
