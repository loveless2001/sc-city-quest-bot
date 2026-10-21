# Game update review: index-CE9I5eWz.js → index-B8HeQgVv.js (2026-10-20)

The live site now loads `index-B8HeQgVv.js` (CSS `index-D3m-FlZ7.css`; the
bundle is dated 2026-10-20 14:11 UTC, found on 2026-10-21). The version guard
would have stopped both bots.

The course and rules are unchanged. The one change the bot can see is the
health warning, which now stays on screen for the whole game.

## Method

- Fetched the new bundle into
  `claude-sc-city-quest/work/game-public-index-B8HeQgVv.js` (368,402 bytes,
  against 368,807), along with its stylesheet.
- Diffed the two bundles at statement level with minified names normalized
  (`claude-sc-city-quest/analysis/bundle-diff.mjs`, output in
  `work/bundle-diff-B8HeQgVv`): 53 old and 38 new statements differ.
- Measured the warning on the live menu page in headless Chrome, at the bot's
  870×668 viewport and scale 1, without starting a game
  (`analysis/health-strip-capture.mjs`).

## Changes

- **The health warning stays on screen:**
  - **Before:** a button centred at the bottom. It showed for 5 s after the
    page loaded and again every 30 minutes, could be dismissed with a click,
    and had a progress bar.
  - **Now:** a plain panel rendered on every screen (menu, game, puzzles,
    results) that never hides. It is black, 273×29 px, at the bottom left of
    the game area: x 185–458, rows 639–668 of the bot's frames.
  - **Clicks:** it has `pointer-events:none`, so it never takes them.
  - **Text:** "00+ Chơi quá 180 phút một ngày sẽ ảnh hưởng xấu đến sức khỏe".
- **Admin chunk renamed:** AdminApp-Cv-p2eKg.js → AdminApp-DH6sOMb6.js.
- **Nothing else:** the rest of the diff is minifier renaming.

## Evidence that gameplay is unchanged

- **Chunks:** the content-hashed three, r3f, tween and rolldown-runtime
  chunks are identical.
- **Numeric literals:** the only changes are three fewer `50`s (the old
  panel's `-50%` centring) and one fewer `200` (its `200%` exit). The old
  timers `1800*1e3` (30 minutes) and `5e3` (5 s) are also gone.
- **Course and rules:** the course constants and every gameplay statement are
  unchanged.

## Effect on the bot

The panel is opaque, so its captured pixels can be pasted into recorded
frames exactly (`analysis/health-strip-preload.cjs`). The bot's code was then
re-run on recorded games i-027, i-029 and i-030, with and without the panel.

- **Where it sits:** on the road 3.7–4.2 m behind the runner's feet.
  Obstacles, coins, letters, medals and boxes are all detected ahead of the
  runner, well above it.
- **Runner position (`runner-x.mjs`):** the panel hides row 640's left lane
  line, and rows 625 and 610 still give the reading.
  - **Lost:** on 1–1.4% of frames (44–67 per game). The bot then uses its own
    lane model.
  - **Errors:** more than 1 m off the plain-frame reading on 5–6 frames per
    game. Outliers (a reading that jumps away and back between frames) are
    unchanged at 9–18 per game either way.
  - **Unchanged:** reading only rows the panel never covers (625/610/595 or
    630/615/600) did no better, so the reader stays as it is.
- **Early-game controller (`analysis/early-coin-audit.mjs --pilot`):** its
  medal sightings are identical. The coins it knows about match within the
  audit's own counting noise; the audit tracks the lane with the same reader.

  | game | coins found / known to the pilot, plain | with the panel |
  |---|---|---|
  | i-029 | white 99/88, navy 33/33, green 8/8 | white 99/88, navy 32/32, green 7/7 |
  | i-030 | white 171/161, navy 57/56, green 3/3 | white 168/158, navy 58/58, green 3/3 |

- **Endgame (`analysis/endgame-replay.mjs`):** replayed from the takeover to
  the end of each game, open loop (the logged keys move the runner).
  - **Safety:** no plan was unsafe, with or without the panel.
  - **Keys:** the first planned key differs on 13, 16 and 54 of about 2,170
    frames per game. The runner position differs by more than 0.3 m on 14–26.
  - **Fallbacks:** plans with relaxed margins rose from 241 to 258, 242 to 292
    and 201 to 227. Centimetre-level position differences tip near-ties
    between equally safe routes; worth watching live.
- **Page text:** the warning's text is now always on the page. The playing,
  stage, score and pop-up checks each anchor on their own label, and none
  matches "00+" or "180".
- **Start flow:** the bots click buttons by exact name, and the warning is no
  longer a button.

## Changes made

- **Version guard:** moved to `index-B8HeQgVv.js` in
  `src/interactive-settings.json`, and in the batch's `runs/args-v3.txt`
  (backup `args-v3.txt.bak-CE9I5eWz`).
- **Course:** `endgame-v3-course.mjs` lists `index-B8HeQgVv.js` under the
  BFqScKec course (`sameCourse`). The batch staging copy (`bot-next`) has the
  same file.
- **Comments:** `runner-x.mjs` and `calibrated-pilot.mjs` describe both the
  old start-of-game banner and the new panel.
- **Tests:**
  - every live bundle maps to its course, and the guard expects a known one
    (`endgame.test.mjs`);
  - the playing check passes with the warning text present
    (`page-text.test.mjs`);
  - the batch test now expects the new bundle.

  50 repo tests and 11 batch tests pass.

## Live games (2026-10-21)

Two Chrome games on the new bundle, with the bot on throughout (live-check
outputs `claude-sc-city-quest/runs/i-032` and `i-033`). The version guard
matched `index-B8HeQgVv.js` in both.

| | i-032 | i-033 |
|---|---|---|
| result | 27,560, full course (to 8,984 m) | 28,740, full course (to 8,974 m) |
| takeover | 4,286.9 m, calm | 4,300.8 m, forced (15 m rule) |
| handover obstacles | 2 fences, 1 cone; none measured by contact | 2 fences measured by contact (−2.3 m, −0.9 m from the pilot's estimate), 1 not measured |
| first sliding row (4,340 m) | confident 63 m before | confident 14 m before (see below) |
| word-race letters | 11 (+40 ×3, +120 ×3, +200 ×5), 3 words | 9 (+40 ×3, +120 ×3, +200 ×3), 3 words |
| location medals (HUD) | gold, blue, green | gold, blue, green |
| penalties | none | −30 cone and −60 barrier in Về đích (early game) |
| endgame fallbacks | 8.9% of plans, 0 unsafe | 9.4% of plans, 0 unsafe |
| endgame runner x from lane lines | 95.2% of frames | 95.0% of frames |

- **Runner position:** read from the lane lines on 95.0–95.2% of endgame
  frames, against 96.9–97.3% in i-026, i-027, i-029 and i-030. So about 2%
  more frames used the lane model, close to the offline estimate.
- **Fallbacks:** 8.9% and 9.4% of plans, against 5.0–7.9% in those four games.
  As before, they are nearly all in the second sliding range (8,040–8,540 m)
  and the tightened dense rows after it, where every game has them (24–54%).
  This is in line with the offline replay's +7–21%.
- **i-033's late first row:** the row's two candidate slider positions stayed
  open until 11 m out. One of them (lane 2) coincided with a random fence the
  early-game controller tracked 3 m before the row (4,336.8 m by contact).
  The runner's position was read from the lane lines throughout, so this was
  not the panel. The plan kept both candidates blocked and passed safely.
- **i-033's penalties:** right after the green medal (+200), the early-game
  controller moved into the right lane through a row of three cones, then
  clipped a barrier 1 s later. Both were ahead of the runner, far from the
  panel. Early-game cone hits also happened before this update (i-026: two).

## Tools

- `claude-sc-city-quest/analysis/`:
  - `health-strip-capture.mjs`, `health-strip.cjs` and
    `health-strip-preload.cjs` capture the panel and paint it into frames;
  - `runner-x-strip.mjs`, `runner-x-rows.mjs` and `runner-x-outliers.mjs`
    measure the runner-position reader;
  - `endgame-replay.mjs` replays the interactive endgame.
