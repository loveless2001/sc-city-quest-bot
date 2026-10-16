# Docs

| file | contents |
|---|---|
| [interactive-edition-report.md](interactive-edition-report.md) | merging the endgame controller into the interactive edition, every live check, and the fixes found on the way |
| [dense-boundary-fix.md](dense-boundary-fix.md) | the endgame's dense-anchor fix (behind live batch run c-030's death) and its validation |
| [game-update-DnBWvl2N.md](game-update-DnBWvl2N.md) | review of the 2026-10-16 game bundle update (guest analytics only, gameplay unchanged) |
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

**Endgame.** `endgame-v3*.mjs`, `camera-model.mjs` and `runner-x.mjs` are
identical to those in `claude-sc-city-quest\bot-next`. That copy is the batch
bot's controller plus the interactive hand-back hooks, which do nothing in
batch play. When you change the endgame here, copy the change there too (or
the other way round) so the batch bot and this bot stay the same.

**Changes made in this repo's history** (see the report):

- endgame takeover at 2,806 m, with shadow following, hand-back and lane
  correction;
- visible window, 1:1 rendering, Edge switches and keeping the game tab in
  front;
- the loading-screen timeout tolerance;
- the end-of-run crash fix;
- the launch warm-up;
- the bounded early-game page-text read.

## What is not in this repo

These remain in the development workspace
`C:\Users\lenovo\Documents\Codex\claude-sc-city-quest`:

- the headless batch bot (`bot-v2`, `runs/batch.sh`);
- recorded runs (`runs/c-*`, `runs/i-*`);
- the endgame analysis tools (`analysis/`: shadow replays, anchor replays,
  boundary probes, the v3-sim2 simulator, coin audits).

Paths in the reports such as `analysis/…`, `runs/…` and `bot-next/…` refer
to that workspace.
