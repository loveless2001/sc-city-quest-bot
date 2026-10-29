# Game update review: index-DS2du1bN.js → index-omdIpeof.js (2026-10-28)

The live site now loads `index-omdIpeof.js` (CSS `index-CGZhmfCs.css`; the
bundle is dated 2026-10-28 04:15 UTC). The shared chunks are unchanged. The
version guard would have stopped the bot.

The course and rules are unchanged. The one change the bot can see is a
cookie notice that stays on screen, over the road at the runner's feet, until
the player accepts it. **Guest play is back on:** on 2026-10-29
`/api/settings` returned `{"guest_mode_enabled":true,"challenges_enabled":false}`.

## Method

- Fetched the new bundle into
  `claude-sc-city-quest/work/game-public-index-omdIpeof.js` (372,668 bytes,
  against 369,882), with its stylesheet and the page.
- Re-fetched the four shared chunks; all are byte-identical.
- Diffed the two bundles at statement level with minified names normalized
  (`claude-sc-city-quest/analysis/bundle-diff.mjs`, output in
  `work/bundle-diff-omdIpeof`): 60 old and 137 new lines differ.
- Diffed the stylesheets rule by rule.
- Measured the notice on the live login screen in headless Chrome, at the
  bot's 870×668 viewport and scale 1, with a throwaway profile, clicking
  nothing.
- Pasted its captured pixels into recorded game i-037's frames to measure the
  runner-position reader (`src/runner-x.mjs`).

## Changes

- **Cookie notice:**
  - **Text:** "Trò chơi sử dụng cookie và bộ nhớ trình duyệt để lưu thông tin
    đăng nhập, nhân vật và tiến trình chơi của bạn." It has one button,
    "Đồng ý" (agree). There is no decline option.
  - **When it shows:** on every screen, games included, until "Đồng ý" is
    clicked. The page then stores `cookie_consent=accepted` and doesn't show
    it again in that browser profile.
  - **Where:** x 193–553, rows 575–638 of the bot's frames, with the button
    at x 480–542, rows 592–621. It sits just above the health warning (rows
    639–668), drawn above the game, 95% opaque dark blue. It slides in from
    below; that is the two new `150`s.
- **Phone sign-up for children under 16:** a checkbox "Đăng ký cho trẻ dưới
  16 tuổi" asks for the child's and the guardian's birth dates. This is the
  new `16`. It is on the Facebook path only.
- **Analytics:** logged-in users now send `user_visit` and `user_run` events,
  and a `utm_source` in the address now overrides the stored traffic source.
- **Admin chunk renamed:** AdminApp-CGFU_-pJ.js → AdminApp-C65O-Uz6.js.
- **Nothing else:** the rest of the diff is minifier renaming. The stylesheet
  only adds the notice's and the sign-up form's rules.

## Evidence that gameplay is unchanged

- **Numeric literals:** besides the notice's `150`s and the `16`, the only
  changes are 17 more `0`s and two more `1`s, from the new markup.
- **Course and rules:** the course constants and every gameplay statement are
  unchanged apart from renamed identifiers.
- **What the bot reads:** every page text and class it uses is still there.
  "Đồng ý" appears only in the notice.

## Effect on the bot

- **Runner position (`runner-x.mjs`):** the notice covers rows 625 and 610
  for x 193–553. The health warning already hides row 640's left line.
  Measured on all 2,271 endgame frames of i-037 with the notice pasted in:

  | | without the notice | with it |
  |---|---|---|
  | position read | 100% of frames | 97.4% |
  | reading lost | – | 57 frames |
  | reading more than 1 m off | – | 62 frames |

  - **Health warning alone:** more than 1 m off on 5–6 frames per game
    (docs/game-update-B8HeQgVv.md).
  - **Early game:** a sample of 285 frames from Tăng tốc 2 lost 3 readings,
    and 3 were more than 0.5 m off.
  - **Why it matters:** wrong readings can make the endgame correct its lane
    model the wrong way, so the bot shouldn't play with the notice showing.
- **Menus:** the notice's top edge (row 575) is just below the centre of
  "Chơi thử" (row 572), where the bot clicks.
- **Accepting it is the player's choice,** so the bot doesn't click "Đồng ý".

## Changes made

- **Bot turns off while the notice shows:** when the page text has the
  notice, the bot turns itself off with the status "Accept the cookie notice
  (Đồng ý), then press F8". This works on menus, in the early game and in the
  endgame (which keeps following the course with the bot off).
  - **Checked:** the real loop, headless on the live site with a throwaway
    profile, did this after F8 and left the notice in place.
  - **Once per profile:** after one click in a profile, the notice never
    shows there again.
- **Version guard:** moved to `index-omdIpeof.js` in
  `src/interactive-settings.json`, and in the batch's `runs/args-v3.txt`
  (backup `args-v3.txt.bak-DS2du1bN`).
- **Course:** `endgame-v3-course.mjs` lists `index-omdIpeof.js` under the
  BFqScKec course (`sameCourse`). The batch staging copy (`bot-next`) has the
  same file, and `work/bot-next-staged` was rebuilt.
- **Tests:** the new bundle maps to its course (`endgame.test.mjs`), and the
  batch test expects it. 57 repo tests and 11 batch tests pass.
- **Batch bot:** not changed. Its browser profile would need the notice
  accepted before its runs.

## Live game (2026-10-29, 16:08 UTC)

- **Notice accepted, with the user's approval:** the notice was clicked
  ("Đồng ý") once in the live-check browser profile, opened with the live
  check's own launcher. Nothing else was clicked. The page then stored
  `cookie_consent=accepted` and the notice was gone.
- **Game:** one Chrome game with the bot on throughout (live-check output
  `claude-sc-city-quest/runs/i-038`, recorded with `--capture`). ChatGPT's
  batch was paused.

| | i-038 |
|---|---|
| version guard | matched `index-omdIpeof.js` |
| start | menu → Guest → Hanoi by the bot; no cookie notice (accepted) |
| result | 31,870, full course (endgame to 8,975 m) |
| takeover | 4,300.8 m, calm |
| handover obstacles | 1 fence, measured by contact 0.1 m from the pilot's estimate |
| first sliding row (4,340 m) | confident 54 m before |
| word-race letters | 12 (+40 ×3, +120 ×3, +200 ×6), 3 words |
| location medals (HUD) | gold, blue, green |
| early puzzle box | collected, puzzle solved |
| endgame mystery box | collected at 4,355 m and survived |
| penalties | two −30 cones in the early game (Tăng tốc 2, Về đích), no jumps |
| endgame fallbacks | 9.7% of plans, 0 unsafe |
| endgame runner x from lane lines | 95.3% of frames |

- **Endgame box:**
  - **Pause:** 2.7 s.
  - **Clock after the puzzle:** the first check, at 4,385 m, found a 2.43 m
    error. That is inside the ±3.5 m margin used after a puzzle (i-020:
    2.63 m).
- **Fallbacks:** as usual, nearly all in the second sliding range (45% of its
  plans) and the tightened rows after it (52%). 2 in the dense rows, none
  elsewhere.
- **Cones:** early-game cone hits also happened before this update (i-026:
  two; i-033: one).
- **Sliders and recording:** `analysis/slider-check.mjs` gives a clock
  residual of −0.17 m and no prediction off at the pass on 17 rows.
  `slider-speed.mjs` gives 1.375 m/s. The 4,971 timing lines and frames pair
  one to one.
