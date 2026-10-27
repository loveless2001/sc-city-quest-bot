# Game update review: index-BG06rE0x.js → index-DS2du1bN.js (2026-10-26)

The live site now loads `index-DS2du1bN.js` (the bundle is dated 2026-10-26
14:32 UTC). The stylesheet `index-CHxu4njo.css` and the shared chunks are
unchanged. The version guard stopped the bot in the session of 2026-10-27
09:49 UTC.

The course and rules are unchanged. The site can now switch guest play off,
and **on 2026-10-27 guest play was off**, so the bot (Guest only) cannot
start a game until the site turns it back on.

## Method

- Fetched the new bundle into
  `claude-sc-city-quest/work/game-public-index-DS2du1bN.js` (369,882 bytes,
  against 369,005), with the page.
- Re-fetched the stylesheet and the four shared chunks; all are byte-identical
  to the copies from `index-BG06rE0x.js`.
- Diffed the two bundles at statement level with minified names normalized
  (`claude-sc-city-quest/analysis/bundle-diff.mjs`, output in
  `work/bundle-diff-DS2du1bN`): 45 old and 84 new lines differ.
- Read the site's new settings endpoint.
- Walked the live start flow with a fresh profile (`analysis/ui-probe.mjs`,
  `work/ui-probe-DS2du1bN`).
- Ran the bot loop itself headless on the live site with a throwaway profile,
  bot on. No game could start.

## Changes

- **Site settings:** on start-up the page fetches `/api/settings`, with two
  switches. Both count as on when missing or when the request fails.
  - **`guest_mode_enabled`:** the "Chơi thử" (Guest) button is shown only once
    the settings have loaded and guest play is on. When it is off, a guest
    on the start or menu screen is logged out and sent back to the start. A
    run in progress isn't affected.
  - **`challenges_enabled`:** hides the Challenges menu button and screen.
    The Guest path doesn't use it.
- **Google Analytics events:** `login` (Facebook), `guest_start`,
  `play_click` (with `is_guest`) and `run_start` (with the city and
  `is_guest`).
- **Admin chunk renamed:** AdminApp-CkpNefC5.js → AdminApp-CGFU_-pJ.js.
- **Nothing else:** the rest of the diff is minifier renaming.

## Guest play is off (2026-10-27)

- **Endpoint:** `/api/settings` returned
  `{"guest_mode_enabled":false,"challenges_enabled":false}` at 09:52 and again
  at 10:00 UTC.
- **Login screen:** a fresh profile sees only "Đăng nhập bằng Facebook" and
  "Hỗ trợ" (support). The probe waited 45 s and never reached "Bắt đầu chạy".
- **What it means for the bot:** it plays as Guest only and never logs in, so
  it cannot start a game while the switch is off. Logging in would also put
  its scores on the leaderboard under a real account, which this project
  avoids.

## Evidence that gameplay is unchanged

- **Numeric literals:** the only changes are three more `0`s and three more
  `1`s, from the settings and analytics code.
- **Course and rules:** the course constants and every gameplay statement are
  unchanged apart from renamed identifiers.
- **What the bot reads:** every page text and class it uses is still there
  (HUD, stage labels, result, puzzles, menu buttons, health warning).

## Changes made

- **Version guard:** moved to `index-DS2du1bN.js` in
  `src/interactive-settings.json`, and in the batch's `runs/args-v3.txt`
  (backup `args-v3.txt.bak-BG06rE0x`). The bot plays again as soon as the
  site turns guest play back on.
- **Course:** `endgame-v3-course.mjs` lists `index-DS2du1bN.js` under the
  BFqScKec course (`sameCourse`). The batch staging copy (`bot-next`) has the
  same file, and `work/bot-next-staged` was rebuilt.
- **New status "Guest play is off on the site":** shown when the login
  screen has shown the Facebook button without "Chơi thử" for 3 s (the Guest
  button is also missing for a moment while the settings load). It replaces
  "Waiting for Hanoi track", which hid the reason.
  - **Checked:** the real loop, headless on the live site with a throwaway
    profile, showed it 3 s after the login screen appeared. A fresh profile
    took about 40–50 s to render that screen.
- **Tests:** the new bundle maps to its course (`endgame.test.mjs`), and the
  batch test expects it. 57 repo tests and 11 batch tests pass.
- **Batch bot:** its own start flow wasn't changed. With guest play off it
  would also wait at the login screen.

## Not yet checked

- **A live game on this bundle:** not possible until guest play is back on.
  Check with `curl https://sccityquest.zenimpact.vn/api/settings`, or look for
  the "Chơi thử" button.
