# Game update review: index-BFqScKec.js → index-CE9I5eWz.js (2026-10-19)

The live site now loads `index-CE9I5eWz.js` (CSS `index-C2A9ZAI6.css`). The
version guard would have stopped both bots:

- the interactive bot shows "Game updated · bot needs review";
- the batch bot throws "Public game bundle changed".

## Method

- Fetched the new bundle into
  `claude-sc-city-quest/work/game-public-index-CE9I5eWz.js` (368,807 bytes,
  against 366,405).
- Diffed the two bundles at statement level with minified names normalized
  (`claude-sc-city-quest/analysis/bundle-diff.mjs`, output in
  `work/bundle-diff-CE9I5eWz`).
- Compared the multiset of numeric literals and the imported chunk names.

## Changes

- **Guest button renamed:** "Chơi ngay (Guest)" → **"Chơi thử"**. It is the same
  button (`login-btn guest-btn`) with the same handler (guest mode, then the
  menu).
  - Both bots match button names exactly, so they would have stalled on the
    login screen.
- **Phone sign-up (OTP):** now asks for full name and birth date as well as
  the phone number, with new validation messages. The bots never sign in.
- **Health warning:** gained an age-rating badge ("Phân loại độ tuổi 00+"). It
  renders as a button named "00+ Chơi quá 180 phút…", which cannot match the
  bots' exact "Chơi".
- **Hidden preview page:** a character-animation page behind
  `?scene=character-animation`.
- **Admin chunk:** renamed (AdminApp-60J33vEQ.js → AdminApp-Cv-p2eKg.js).
- **Nothing else:** the rest of the diff is minifier renaming.

## Evidence that gameplay is unchanged

- **Chunks:** the content-hashed three, r3f, tween and rolldown-runtime
  chunks are identical.
- **Numeric literals:** the only count changes are 0, 1, 2, 4, 00, 100 and the
  new 1900, all from the sign-up form (day/month/year lengths, name
  `maxLength:100`, earliest birth year 1900, the "00+" badge). One `60` went
  away, but it was part of the old admin chunk's file name.
- **Course and rules:** the course constants statement (spawn distances,
  `FINAL_STRETCH_START:4140`, `PATTERN_START_DISTANCE:4340`,
  `LANE_FENCE_END_DISTANCE:4840`, …) is byte-identical, as are the obstacle
  types (e.g. trash penalty 60). The 18+ checkbox text is unchanged.

## Live start-flow check (no game played)

`claude-sc-city-quest/analysis/ui-probe.mjs` on 2026-10-19:

1. Confirmed the bundle `index-CE9I5eWz.js`.
2. Confirmed the 18+ box.
3. Clicked "Chơi thử", "Chơi" and "VN Hà Nội".
4. Stopped when "Bắt đầu chạy" was visible (not clicked).

Screenshots and log are in `claude-sc-city-quest/work/ui-probe-2026-10-19`.

## Action taken

- **Guest button:** both bots also try "Chơi thử", keeping the old label for
  older bundles.
  - `src/interactive-play.mjs`
  - `claude-sc-city-quest/bot-next/fast-play.mjs`
- **Course:** `endgame-v3-course.mjs` (here and in bot-next, still identical)
  lists `index-CE9I5eWz.js` under the BFqScKec course (`sameCourse`).
  `courseOfBundle()` resolves a bundle name, and the batch bot uses it.
- **Version guard:** moved to `index-CE9I5eWz.js`.
  - `src/interactive-settings.json`
  - `claude-sc-city-quest/runs/args-v3.txt` (backup `args-v3.txt.bak-BFqScKec`;
    bot-v2 is still on the old course, so the batch should not be run before
    bot-next is copied in, as before).
- **Tests:** `npm test` passes 47/47, and
  `claude-sc-city-quest/analysis/batch-handover.test.mjs` passes 11/11 (its
  guard pin updated).
- No controller change is needed.

## Live check (2026-10-19)

Interactive bot, `tools/live-check.mjs`, output `claude-sc-city-quest/runs/i-030`.

- The guard matched `index-CE9I5eWz.js`, and the bot took the Guest path
  ("Chơi thử") and started the game itself.
- Full course (last frame ~8,973 m), calm takeover at 4,297.7 m, first sliding
  row passed, 12 letters and 3 words, no cone or barrier penalties.
- **Score 28,090:** 17,970 at takeover, then 10,120 in the endgame.
- Earlier games on this course (bundle BFqScKec): i-026 26,380, i-027 28,510,
  i-028 30,070 (crashed), i-029 25,750.
