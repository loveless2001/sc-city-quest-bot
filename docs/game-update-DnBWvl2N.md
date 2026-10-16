# Game update review: index-kcDsL1AL.js → index-DnBWvl2N.js (2026-10-16)

The live site switched bundles between about 11:04 and 11:09 on 2026-10-16.
The version guard disabled the bot as designed.

## Method

- Fetched the new public bundle into `work/game-public-index-DnBWvl2N.js`
  (366,299 bytes against 365,598).
- Split both bundles into statements, normalized short minified names, and
  diffed them (31 hunks).
- Compared the multiset of numeric literals.
- Compared the names of the imported chunks.

## Changes

- **Guest analytics (new):**
  - a random `guest_id` UUID kept in localStorage;
  - events `visit` (app open), `run` (a guest starts a run) and `convert`
    (a guest logs in), POSTed to `/api/guests/events`.
- **Auth store:** reordered; `login` now emits `convert` for guests.
- **Admin panel chunk:** renamed (AdminApp-CahL-Rmt.js → AdminApp-DCUzvQqj.js).
- **Nothing else:** the rest of the diff is variable renaming, including the
  obstacle-spawn code (`wall`, `z`, `lanes`, `fenceOnly`, `mystery`), which is
  identical apart from names.

## Evidence that gameplay is unchanged

- **Chunks:** the content-hashed names of the r3f, three, tween and
  rolldown-runtime chunks are identical, so their content is identical.
- **Numeric literals:** only 0, 2, 6, 8, 12, 15, 16, 20, 63, 64 and 128
  changed count. All of them belong to the UUID generator (16 random bytes,
  `&15|64`, `&63|128`, slices 8/12/16/20, `padStart(2)`, `toString(16)`).

## Action taken

- Moved the version guard to `index-DnBWvl2N.js` in `runs/args-v3.txt`
  (batch bot; backup `args-v3.txt.bak-kcDsL1AL`) and in
  `interactive/interactive-settings.json`.
- No controller change is needed.
- ChatGPT's release folder still expects the old bundle; it was not edited.
