# Backlog

Work Hard Burn still owes, in rough priority order. Each item carries enough
context to pick up cold. `CLAUDE.md` describes what the game *is*; this file
describes what it doesn't do yet.

---

## TOP PRIORITY — Fleet setup before battle

**This is the first thing to build.** Everything else in this file comes after
it. Steps 1–2 are also phase 1 of the campaign (items 8 and 10), so this work
feeds straight into it.

### 0. Quick play presets, custom fleets and per-ship loadouts

**Decisions made (Jon):** custom fleets start with choosing hulls against a
point budget, then add per-ship loadouts. The AI builds to the same budget.
Add a quick play mode with preset fleets. Starting positions stay automatic
for now; letting the player place ships is a possible later addition.

**Menu:** three ways into a battle.
- **Quick play:** pick a preset fleet and fight, in one or two taps.
- **Custom battle:** build a fleet against a point budget, then fight.
- **Classic:** today's one-of-each game, kept as one of the presets.

**Step 1 — custom fleets, choosing hulls.**
- Point budget chosen by the player, for example Skirmish 300, Standard 600,
  Large 1000. The AI gets the same budget and never more.
- Hull costs added to `CLASSES`. None exist today. Start from hull, shields,
  armor and weapons, then adjust through play and AI-vs-AI testing.
- Builder screen: plus and minus per class, running total against the budget,
  Start enabled once within budget. Works by tapping, no hover needed.
- The AI builds within the budget using one of a few approaches (balanced,
  heavy gunline, swarm, carrier-led), at random or by difficulty.
- Engine work:
  - battles accept any mix of ships, including duplicates of a class
  - starting positions generated for any fleet, replacing the fixed
    per-class `DEPLOY`
  - the roster and enemy contacts panels handle any number of ships
  - ship names handle duplicates (`NAMES` is one name per class today)

**Step 2 — per-ship loadouts.** Tap a ship in the builder to fit its weapons,
following the slot and budget rules in item 7. Weapons cost points, so a
heavily armed Frigate costs more than a bare one. This is where the campaign
shipyard gets built and tested.

**Quick play presets.** Five to seven fixed fleets built to the same budget:
- Classic: one of each class
- Gunline: Heavy cruiser and Destroyers
- Swarm: many Patrol craft and Corvettes
- Carrier group: Carrier with escorts
- Torpedo wolfpack: Destroyers and Corvettes, missile-heavy

The player picks one; the AI picks at random or one that counters it. Presets
are saved fleet lists, so they're nearly free once step 1 works.

**Risk: more ships may simply win.** In Fleet Combat, the side with more hulls
won almost every battle, and point costs could never be balanced. Hard Burn
may be less exposed, because hits can miss and asteroids block line of sight,
but measure it before tuning prices: equal-budget fleets of different shapes,
AI against AI, a few hundred battles. Cheap safeguard: a **maximum ship count
per fleet** on top of the budget.

**Order:**
1. ~~engine work (any fleet, generated starting positions)~~ **Done in v15.** Battles take any fleet up to 12 a side, duplicates included; see `CLAUDE.md` §4. Testable from the console with `HB.startGame({player:[...], enemy:[...]})`.
2. hull costs, then measure balance
3. quick play presets
4. the custom builder
5. per-ship loadouts

Presets come before the builder so the engine is tested with fixed fleets
before players can build anything they like.

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

---

## Campaign: a shared trading universe

A second game mode built around the existing battle engine, in the spirit of
Trade Wars. The current game stays on the menu as **quick-launch head-to-head
battle**. The campaign becomes the main mode.

### Decisions already made (Jon)

- **Shared universe.** All players trade and fight in one persistent world, as
  in Trade Wars. Not single-player first.
- **Real-time turn limits.** Each player gets a budget of turns that refills on
  a real-world clock (for example, per day). A **paid option to buy extra turns**
  may come later.
- **Nearly free-form ship loadouts, limited by hull class.** Players choose
  their own weapons and equipment, but each class caps what it can mount. A
  Patrol craft can't carry four torpedo launchers, a spinal railgun and two
  heavy beams.
- **Pirate encounters are fought by the player** in the hex battle. There is no
  automatic resolution.

### 6. The core loop

**Trade → earn credits → upgrade the ship → take on harder routes and fights →
buy more hulls → command a fleet.** A new player starts with one very basic
ship.

- **Star map:** sectors linked by warp lanes. Ports buy and sell commodities
  (ore, fuel, equipment and so on).
- **Trading:** prices move with supply and demand, and ports restock over time.
  Money comes from finding good buy-low, sell-high routes. In a shared universe,
  other players' trading moves the same prices.
- **Turn budget:** moving, trading and fighting cost turns, which refill in real
  time. This paces play and makes route planning matter.
- **Encounters:** pirates, patrols and bounty targets, fought in the existing
  battle engine.
- **Shipyard:** buy equipment and fit it within the hull's limits (item 7), and
  buy new hulls. The six classes become the progression ladder, Patrol craft to
  Fleet carrier.
- **Stakes:** damage and losses persist. Repairs cost credits. Losing the last
  ship needs a rule, for example an insurance payout or restarting with a
  starter ship. Not decided yet.

### 7. Free-form loadouts with class limits

Not yet designed in detail. One workable shape:
- **Each hull has slots by size:** small, medium, large and spinal. A weapon
  or module needs a slot of its size. A Patrol craft has a few small slots; only
  capital hulls have spinal and large ones.
- **Plus a budget** (mass, power, or both) so a hull can't max every slot with
  the heaviest option in its size.
- Weapons and modules become items with a size, a cost and the stats already in
  `WEAPONS`.

Today loadouts are fixed per class in `CLASSES.weapons`, so the battle engine
has to read weapons from each ship instead of from its class.

### 8. What has to change in the existing game first

1. ~~**Battles must accept any fleet.**~~ Done in v15 (item 0, step 1).
2. **Per-ship loadouts** instead of per-class ones (item 7).
3. **Battles report results back:** survivors, damage taken and rewards.
4. **Split the code into multiple files.** The campaign would roughly double
   the game, and one ~5,000-line `index.html` is hard to work on. Plain
   JavaScript modules served as separate files still need no build step and
   work on GitHub Pages.
5. **Seeded combat rolls** (see item 5). Needed for the server to check a
   battle's result.
6. **Save and restore the full battle state.**

### 9. Consequences of a shared universe

These follow from the decisions above and shape everything else:
- **A real backend from the start of the campaign.** GitHub Pages can keep
  hosting the game itself, but the world, player accounts, credits, prices,
  cargo and turn counters must live on a server (Supabase, Firebase or a small
  custom service).
- **The server must be the authority.** With a shared economy, and especially
  with paid turns, the player's browser can't be trusted to report its own
  credits or battle results. The server checks every trade and move. For
  battles, it replays the fight from its seed and the player's orders, which is
  why seeded combat rolls come first.
- **Accounts and sign-in**, which the game has none of today.
- **Paid turns** bring payment processing, refunds, taxes and a store's terms,
  and a design question: buying turns must not let paying players simply
  out-trade everyone else. Settle how far purchases can go before building it.
- **Running costs:** a server and database cost money every month, unlike
  GitHub Pages.

### 10. Suggested phases

Each phase leaves something playable.
1. **Foundations** (item 8): split the code, battles with any fleet, per-ship
   loadouts, seeded rolls, save and restore of battle state. Improves the
   head-to-head mode too.
2. **Trading prototype:** star map, ports and prices, single-player and
   offline, to prove trading is fun before paying for a server.
3. **Pirate encounters:** fights on the map, damage and rewards carried over.
4. **Shipyard:** equipment, slots and class limits (item 7).
5. **Fleet command:** more hulls, upkeep, bigger fights.
6. **Shared universe:** backend, accounts, the server-authoritative economy,
   real-time turn refills.
7. **Paid turns**, if still wanted.
