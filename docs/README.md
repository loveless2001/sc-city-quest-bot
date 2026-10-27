# Docs

| file | contents |
|---|---|
| [interactive-edition-report.md](interactive-edition-report.md) | merging the endgame controller into the interactive edition, every live check, and the fixes found on the way |
| [dense-boundary-fix.md](dense-boundary-fix.md) | the endgame's dense-anchor fix (behind live batch run c-030's death) and its validation |
| [game-update-DnBWvl2N.md](game-update-DnBWvl2N.md) | review of the 2026-10-16 game bundle update (guest analytics only, gameplay unchanged) |
| [game-update-BFqScKec.md](game-update-BFqScKec.md) | review of the 2026-10-17 game update (course lengthened, letters ×4) and the port to it |
| [game-update-CE9I5eWz.md](game-update-CE9I5eWz.md) | review of the 2026-10-19 game update (guest button renamed "Chơi thử", sign-up form; gameplay unchanged) |
| [game-update-B8HeQgVv.md](game-update-B8HeQgVv.md) | review of the 2026-10-20 game update (health warning kept on screen, measured against recorded games; gameplay unchanged) |
| [game-update-BG06rE0x.md](game-update-BG06rE0x.md) | review of the 2026-10-24 game update (18+ confirmation removed, traffic-source analytics; gameplay unchanged) |
| [game-update-DS2du1bN.md](game-update-DS2du1bN.md) | review of the 2026-10-26 game update (site switch for guest play, off on 2026-10-27; analytics events; gameplay unchanged) |
| [chatgpt-control-verification.json](chatgpt-control-verification.json) | ChatGPT's own checks of the takeover controls (2026-10-15) |

## Where the code came from

**Early game and the interactive shell.** These come from ChatGPT's
interactive edition, copied on 2026-10-16:

- `outputs\sc-city-quest-interactive` in the 2026-10-14 ChatGPT workspace;
- built on its trial 427 settings and models.

Thirteen of its files are not used by the interactive bot, so they are left
out of this repo:

- pilots: `combined-pilot`, `fast-pilot`, `learned-pilot`, `precision-pilot`,
  `predictive-pilot`, `route-pilot`, `sliding-pilot`, `strict-pilot`,
  `timeline-pilot`;
- `opening-selection`, `stage-motion`;
- the headless players `play.mjs` and `fast-play.mjs`.

The `jpeg-js` dependency was used only by `play.mjs`, so it is gone too.

**Endgame.** `endgame-v3*.mjs`, `camera-model.mjs` and `runner-x.mjs` were
identical to those in `claude-sc-city-quest\bot-next` (the batch bot's
controller plus the interactive hand-back hooks) until the 2026-10-17 course
port. The port (course model, handover obstacles, coin stream step) is in this
repo only; `bot-next` still has the old course.

**Changes made in this repo's history** (see the report):

- endgame takeover at 2,806 m, with shadow following, hand-back and lane
  correction;
- visible window, 1:1 rendering, Edge switches and keeping the game tab in
  front;
- the loading-screen timeout tolerance;
- the end-of-run crash fix;
- the launch warm-up;
- the bounded early-game page-text read;
- endgame mystery-box collection and cone-only early jumps;
- the port to the 2026-10-17 course (see game-update-BFqScKec.md).

## What is not in this repo

These remain in the development workspace
`C:\Users\lenovo\Documents\Codex\claude-sc-city-quest`:

- the headless batch bot (`bot-v2`, `runs/batch.sh`);
- recorded runs (`runs/c-*`, `runs/i-*`);
- the endgame analysis tools (`analysis/`: shadow replays, anchor replays,
  boundary probes, the v3-sim2 and v3-sim3 simulators, the handover
  calibration replay `junction-replay.mjs`, coin audits).

Paths in the reports such as `analysis/…`, `runs/…` and `bot-next/…` refer
to that workspace.
