# Game update review: index-B8HeQgVv.js → index-BG06rE0x.js (2026-10-24)

The live site now loads `index-BG06rE0x.js` (CSS `index-CHxu4njo.css`; the
bundle is dated 2026-10-24 15:42 UTC). The version guard stopped the bot in
the session of 2026-10-24 19:41 UTC ("Game updated · bot needs review").

The course and rules are unchanged. The 18+ confirmation is gone, and guest
events now report where the visitor came from.

## Method

- Fetched the new bundle into
  `claude-sc-city-quest/work/game-public-index-BG06rE0x.js` (369,005 bytes,
  against 368,402), along with its stylesheet, the page and the four shared
  chunks.
- Diffed the two bundles at statement level with minified names normalized
  (`claude-sc-city-quest/analysis/bundle-diff.mjs`, output in
  `work/bundle-diff-BG06rE0x`): 97 old and 112 new lines differ.
- Diffed the stylesheets rule by rule.
- Walked the live start flow with a fresh browser profile in headless Chrome,
  stopping at "Bắt đầu chạy" without starting a run
  (`analysis/ui-probe.mjs`, output in `work/ui-probe-BG06rE0x`).

## Changes

- **No 18+ confirmation:**
  - **Removed:** the "XÁC THỰC TUỔI" popup on the login screen, with its
    checkbox ("Tôi đã đủ 18 tuổi trước khi bắt đầu chơi game.") and its
    "Xác nhận" button, and the `ageConfirmed` flag in the page's storage.
  - **Buttons:** the Facebook and "Chơi thử" buttons no longer wait for it.
  - **Stylesheet:** only the popup's 12 rules are gone.
  - **Live check:** a fresh profile went straight from the login buttons
    through "Chơi thử", "Chơi" and "VN Hà Nội" to "Bắt đầu chạy".
- **Traffic source:** the page works out where the visitor came from and
  keeps it in its storage as `traffic_source`.
  - **Sources, in order:** `utm_source`; then `fbclid`, `gclid` or `zarsrc`;
    then the referrer (Facebook, Instagram, Google, Zalo, TikTok, YouTube,
    Twitter/X, Bing, Cốc Cốc); then in-app browser user agents. Otherwise
    `direct`.
  - **Sent:** as `source` with every guest event (`/api/guests/events`) and
    with a Facebook login. The bot's games report `direct`.
- **Start-up:** the app records the traffic source before it renders.
- **Admin chunk renamed:** AdminApp-DH6sOMb6.js → AdminApp-CkpNefC5.js.
- **Nothing else:** the rest of the diff is minifier renaming.

## Evidence that gameplay is unchanged

- **Chunks:** the content-hashed three, r3f, tween and rolldown-runtime
  chunks are identical.
- **Numeric literals:**
  - **Added:** one more `30` (the source name is cut to 30 characters), one
    more `9` and one more `1`, all in the source code.
  - **Removed:** ten fewer `0`s, from the removed popup's markup.
- **Course and rules:** the course constants and every gameplay statement
  (fences, sliders, speed, letters, medals, boxes, the fatal-hit delay) are
  unchanged apart from renamed identifiers.
- **What the bot reads:** every page text and class it uses is still there:
  - the HUD's "Điểm số" and stage labels, and `.stage-label`;
  - "NEXT QUEST" and "Điểm Số" on the result;
  - "GHÉP HÌNH", "THỬ THÁCH BẤT NGỜ", "Chơi minigame ghép hình" and "Quay lại
    đường chạy" on puzzles, and `.challenge-title` and `.puzzle-continue-btn`;
  - "Đang vào game" while loading;
  - the menu buttons "Chơi thử", "Chơi" and "Bắt đầu chạy";
  - the health warning panel, unchanged in code and style.

## Effect on the bot

- **Start flow:** unchanged. The bot ticks the 18+ box only if the
  "Xác nhận" button shows. The bundle's only other "Xác nhận" is on the
  phone-verification form, which the Guest path never shows (it was there
  before too).
- **`--age-authorized`:** no longer needed on this bundle, and harmless.
- **Gameplay and endgame:** nothing to re-measure; the frames are the same.

## Changes made

- **Version guard:** moved to `index-BG06rE0x.js` in
  `src/interactive-settings.json`, and in the batch's `runs/args-v3.txt`
  (backup `args-v3.txt.bak-B8HeQgVv`).
- **Course:** `endgame-v3-course.mjs` lists `index-BG06rE0x.js` under the
  BFqScKec course (`sameCourse`). The batch staging copy (`bot-next`) has the
  same file, and `work/bot-next-staged` was rebuilt.
- **Comment:** `interactive-play.mjs` notes that the 18+ step is for older
  bundles.
- **Tests:** the new bundle maps to its course (`endgame.test.mjs`), and the
  batch test expects it. 57 repo tests and 11 batch tests pass.

## Live game (2026-10-24, 19:51 UTC)

One Chrome game on the new bundle, with the bot on throughout (live-check
output `claude-sc-city-quest/runs/i-037`, recorded with `--capture`). ChatGPT's
batch was paused.

| | i-037 |
|---|---|
| version guard | matched `index-BG06rE0x.js` |
| start | menu → Guest → Hanoi by the bot, no age step |
| result | 29,520, full course (endgame to 8,978 m) |
| takeover | 4,290.3 m, calm |
| handover obstacles | 1 fence, measured by contact 0.9 m from the pilot's estimate |
| first sliding row (4,340 m) | confident 59 m before |
| word-race letters | 10 (+40 ×3, +120 ×3, +200 ×4), 3 words |
| location medals (HUD) | gold, blue, green |
| early puzzle box | collected, puzzle solved |
| endgame boxes | none |
| endgame fallbacks | 8.2% of plans, 0 unsafe |
| endgame runner x from lane lines | 95.5% of frames |

- **Fallbacks:** as in every game, nearly all in the second sliding range
  (30% of its plans) and the tightened rows after it (53%). There were 4 in
  the lane rows, and none in the sparse or dense rows.
- **Recording:** the first live recording with the fixed frame numbering
  (2026-10-22). Its 5,043 timing lines and 5,043 frames pair one to one.
- **Sliders:** `analysis/slider-check.mjs` gives a clock residual of −0.11 m
  and no prediction off at the pass on 17 rows. `slider-speed.mjs` gives
  1.375 m/s from 19 rows.
