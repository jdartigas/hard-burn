# Backlog

Work Hard Burn still owes, in rough priority order. Each item carries enough
context to pick up cold. `CLAUDE.md` describes what the game *is*; this file
describes what it doesn't do yet.

---

## Scoring and records

The goal: a score for every battle, kept on the device across every future
edit to `index.html`.

**Browser storage already survives edits.** `localStorage` belongs to the
origin (`jdartigas.github.io`), not to the file, so redeploying never touches
it. What can lose scores is storage being cleared, a different device, or new
code that can't read old records. Items 1–3 are one feature, best built
together. Item 4 depends on them.

### 1. Score formula

Compute a score when `checkEnd` decides the battle. Everything it needs is
already in `state`:
- win or loss, and difficulty (used as a multiplier)
- turns taken (faster is better)
- ships surviving and hull remaining (cleaner is better)
- damage dealt versus damage taken

Starting shape: a win bonus × difficulty multiplier + survivors − turns. Tune it
by playing, not on paper.

### 2. Durable score storage

This is what protects the history, so get it right before anything is saved.
- **Save the raw facts, not only the score.** Each record keeps: date,
  `GAME_VERSION`, difficulty, battle seed, result, turns, survivors, hull left,
  damage dealt and taken, the score, and the version of the formula that
  produced it. If the formula changes, old games can be scored again instead of
  becoming meaningless.
- **One permanent key with a format version:** `hardburn.scores` holding
  `{format: 1, games: [...], bests: {...}}`. Never rename the key. When the
  format changes, add code that converts old records rather than dropping them.
- **Read defensively.** Skip a bad record instead of failing on it, ignore
  unknown fields, and fill in missing ones. Always go through the `store`
  helper.
- **Keep it bounded,** for example the last 500 games plus all-time bests per
  difficulty, so it never approaches the storage limit.
- **Ask the browser to keep the data.** Call `navigator.storage.persist()`.
  Otherwise Safari deletes storage for sites not visited in about 7 days.
- **Keep the `hardburn.` prefix on every key.** Every project published under
  `jdartigas.github.io` shares the same storage.

### 3. Showing scores, plus export and import

- **End-of-battle screen (`showEnd`):** this game's score, its breakdown, and
  whether it's a personal best.
- **"Records" panel on the menu:** bests per difficulty, recent games, win rate.
- **Export and Import buttons:** save the whole record to a JSON file and load
  it back. This is the only protection against cleared site data, a private
  window or a new browser, and the only way to move scores between the Mac and
  the Windows machine. Import should merge with what's there, not replace it.

Rough size for items 1–3: 150–250 lines in `index.html`, no new files.

### 4. Online leaderboard

A shared list across devices or players. **Needs a server.** GitHub Pages can
only serve files, so this means adding an outside service (Supabase, Firebase
or similar) and the game's first network requests beyond the CDN and fonts.

The catch: the game runs in the player's browser, so anyone can submit a fake
score. Options, from cheapest: a trusted-friends board with no checks; submit
the seed and the list of moves, and have the server replay the battle to
verify it (needs deterministic combat, see item 5); or accept that the board
can be gamed. Hold off until there's someone to share scores with.

---

## Multiplayer

### 5. Two human players

Human versus human instead of human versus AI. There are three levels, each
one building on the one before:

1. **Hot-seat (same device, take turns).** Cheapest by far, no network. The
   turn flow is already per side: `beginSideTurn(side)`, and
   `runAITurn(side)` can already play either fleet, so the work is mostly
   letting a human drive the `enemy` side instead of calling `runAITurn`.
   It also needs:
   - a handover screen between turns so neither player sees the other's
     planning
   - HUD changes (the roster, the enemy contacts list and the "Your ships"
     labels assume the player is always west)
   - a menu option to pick it
2. **Play by link or file (asynchronous).** Each player takes a turn and sends
   the game state to the other: a file, pasted text or a URL. Still no server.
   Needs the whole `state` to be saved and restored, which the game can't do
   today.
3. **Live online.** Both players connected at once. Needs a server to connect
   and relay the players: WebRTC through PeerJS or similar (a signalling
   server is still needed to connect), or a relay service (Supabase Realtime,
   Firebase, PartyKit). This is the first real backend Hard Burn would have.

**Things that constrain levels 2 and 3:**
- **Combat isn't deterministic.** Terrain and ship details use seeded
  `mulberry32`, but hit and interception rolls in `fireWeapon` use
  `Math.random()`. So the two browsers can't each simulate a turn and trust
  they got the same result. Either one side is the authority and sends
  outcomes, or all combat rolls move to a seeded generator that both sides
  share. The seeded route also makes replays and verified leaderboard scores
  (item 4) possible, so it's worth doing first.
- **Timing:** effects run on `tween`/`wait` scaled by `timeScale`. The remote
  player's turn has to play back as animation from received moves, not run
  live.
- **Difficulty modifiers** (`DIFF`, player +5 accuracy on Easy) must be off or
  equal in human-vs-human play.
- **Trust:** as with the leaderboard, a modified client can cheat. That's
  acceptable between friends; a public match needs server-side rules.

Recommended order: seeded combat rolls → hot-seat → save and restore `state` →
play by link → live online, if it's still wanted.
