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

**Step 2 results (v16).**

*Does one extra ship decide it?* Largely, yes, for identical fleets. The larger side wins:
6 v 5 Destroyers 91%, 4 v 3 Heavy cruisers 96%, 8 v 7 Frigates 88% (100 battles each, 40 for the
Frigates). Carriers are the exception: 3 v 2 is only 61%, because 31 of 40 battles hit the turn limit
(item 0a).

*But hull count is not the whole story.* Against the six-ship classic fleet, 10 Corvettes, 8 Frigates
and 12 Patrol craft all lose every battle. Mixed fleets beat single-class ones by a wide margin.

*Exchange rate against the classic fleet* (the count that wins about half the time, 30 battles each):
Heavy cruiser ~2.5, Carrier ~4.3, Destroyer ~5, Frigate ~10, Corvette over 12, Patrol craft well over 12.

*Prices, after two rounds of equal-budget tests:* Patrol craft 20, Corvette 40, Frigate 60,
Destroyer 140, Heavy cruiser 250, Fleet carrier 120. **The Carrier moved to 150 in v17** (item 0a),
so the classic fleet is now 660 and the budgets are Skirmish 330, Standard 660, Large 1000.

*Equal-budget fleets at 620, against each other (40 battles each):*
- Gunline (2 Heavy cruisers, Frigate, Corvette, Patrol) beats Carrier group (3 Carriers, Destroyer,
  2 Frigates) **90%**
- Swarm (Destroyer, 4 Frigates, 5 Corvettes, 2 Patrol) beats Gunline **65%**
- Carrier group beats Swarm **74%**

**No single fleet shape dominates; it's rock-paper-scissors.** That is the result that matters for
fleet building: buying the most hulls is not automatically right, unlike in Fleet Combat.

*Against the classic fleet (630):* Carrier group 73%, Gunline 70%, Swarm 70%, 2 Heavy cruisers and
2 Frigates 45%, 4 Destroyers and escorts 35%. The classic fleet is a weak build, not a yardstick.

*Caveats.*
- Prices swing hard: in round 1, one 20-point change bought the Carrier group an extra hull and moved
  it from 41% to 73%. Small price changes can have large effects, so re-measure after any change.
- The AI is the same for every fleet. A human will find counters it doesn't use, so treat these as a
  starting point and adjust by play.
- 40 battles per matchup leaves roughly ±8% noise.

**Quick play presets (v18).** Every preset against every other, 40 battles each (60 for Carrier v
Wolfpack). Row fleet's win rate:

| | Classic | Gunline | Swarm | Carrier | Wolfpack | Average |
|---|---|---|---|---|---|---|
| Wolfpack (660, 10 ships) | 52 | 75 | 47 | 55 | – | **57** |
| Swarm (640, 12) | 55 | 57 | – | 45 | 53 | **53** |
| Gunline (660, 6) | 60 | – | 43 | 70 | 25 | **50** |
| Classic (660, 6) | – | 40 | 45 | 50 | 48 | **46** |
| Carrier group (630, 7) | 50 | 30 | 55 | – | 45 | **45** |

Three rounds to get here. The first cut had the Carrier group at 8 ships averaging 69%. Dropping it
to 6 ships put it at 39%, and a Wolfpack of 9 fell to 34% where 10 made 60%. One hull moves a preset
10–25 points, so presets were tuned by ship count, not price. Each fleet has a matchup it wins
clearly (Gunline over Carrier 70, Wolfpack over Gunline 75) and none dominates.

Changing any preset's fleet changes this table: re-measure with `HB.sim`.

### 0a. ~~Carrier-only fights stall~~ Fixed in v17

**What was done:** a 30-turn battle limit decided on fleet value (`CLAUDE.md` §4), and the Strike wing's
armor penetration raised from 0.25 to 0.6. The Carrier's price rose from 120 to 150 to match.

**What the cause turned out to be:** armor, not shields or repair. Each fighter hit is 9 damage into
7 armor, so it barely reaches the hull. Two v two Carrier draws (out of 30): unchanged 30; repair
switched off 30; shields not regenerating under fire 38/40; armor penetration 0.6 13; that plus
weaker repair 9. Launching fighters every turn ended every stalemate but made the Carrier group win
98–100% even at 150, and four fighters a turn still drew 17/40 while losing to the gunline. No
Carrier-only setting both ends the mirror and stays balanced, hence the turn limit.

**After (v17, 40 battles each):** two v two Carriers now finish, 38/40 on fleet value. Classic
mirror 50%, 11/40 on value, so the limit rarely decides an ordinary battle. At 150 the Carrier group
(3 Carriers, 2 Frigates, Corvette) wins 35% against the gunline and 45% against the swarm; the
swarm beats the gunline 65%. At 140 (3 Carriers, Destroyer, Frigate) it won 60% and 70%. The
Carrier sits on a sharp edge: whether the group can afford a Destroyer matters more than the
price itself. Adjust by play.

~~**Still open:** the AI doesn't play toward the limit.~~ Done in v25: in the last three turns it
protects a lead or presses when behind (`evalCell`).

**Original note:**

Fleets made mostly of Carriers often can't finish each other: 3 v 2 Carriers ended at the 40-turn limit
in 31 of 40 battles, and the Carrier group drew 13–18 of 40 against the classic fleet. Repair drones and
strong point defense against the Strike wing are the likely cause. Needs a fix before presets or the
builder make Carrier-heavy fleets common: a turn limit with a points decision, weaker repair, or better
Carrier offense against Carriers.

**Risk: more ships may simply win.** In Fleet Combat, the side with more hulls
won almost every battle, and point costs could never be balanced. Hard Burn
may be less exposed, because hits can miss and asteroids block line of sight,
but measure it before tuning prices: equal-budget fleets of different shapes,
AI against AI, a few hundred battles. Cheap safeguard: a **maximum ship count
per fleet** on top of the budget.

**Order:**
1. ~~engine work (any fleet, generated starting positions)~~ **Done in v15.** Battles take any fleet up to 12 a side, duplicates included; see `CLAUDE.md` §4. Testable from the console with `HB.startGame({player:[...], enemy:[...]})`.
2. ~~hull costs, then measure balance~~ **Done in v16.** Costs are `cost` in `CLASSES`, budgets in `BUDGETS`.
   Measured with the balance simulator (`HB.sim`, see `CLAUDE.md` §7). Results below.
3. ~~quick play presets~~ **Done in v18.** Five fleets in `PRESETS`, picked on the menu; the enemy
   can be Random or a chosen preset. Balanced with a full round robin (below).
4. ~~the custom builder~~ **Done in v27.** Custom fleets against a budget, and an "AI build" enemy
   that spends the same budget (`AI_PLANS`). At Standard, the AI's five plans win 50-65% against
   the Classic fleet (40 battles each), so none is broken. Two things to watch: the Carriers plan
   buys a second Patrol craft with leftover points (the 8-ship group that dominated as a preset),
   and at Large, Swarm and Wolfpack hit the 12-ship cap with 160-260 points unspent.
5. per-ship loadouts

Presets come before the builder so the engine is tested with fixed fleets
before players can build anything they like.

---

### 0b. The Frigate (v28)

Jon felt Frigates were underpowered. Measured: priced fairly (about 10 match the 660-point Classic
fleet), but thin one-on-one, and its escort job was invisible.

**Variants, 40 battles each** (row fleet's win rate; ±8 points of noise):

| Variant | 10 Frigates v Classic | Swarm v Wolfpack | Carrier grp v Wolfpack |
|---|---|---|---|
| v27 (screen 90%, radius 2) | 40 | 40 | 53 |
| Full share | 33 | 45 | 57 |
| **Full share + radius 3 (shipped)** | 43 | 53 | 60 |
| Beam range 6 | 38 | 38 | 65 |
| Radius 3 + beam range 6 | 40 | 48 | 73 |

**Shipped in v28:** `PD_NET` share 100%, radius 3, plus visible screening (tracers from the Frigate,
"by X's screen" in the log, an end-screen row). Preset round robin after it, average win rate:
Carrier 53, Gunline 52, Swarm 52, Classic 49, Wolfpack 45, a tighter spread than v27 (45–57).

**Open: the Frigate can't escort capitals.** Its point defense (0.45) is below the Heavy cruiser's
(0.50) and the Carrier's (0.55), and a screen only counts when it beats a ship's own. Tested
`PD_NET.stack` (both fire: 1-(1-own)(1-screen)): round robin Carrier 57, Swarm 56, Gunline 55,
Classic 46, **Wolfpack 36**, and Carrier grp v Wolfpack 80%. Too hard on missile fleets. Options to
try: stack at a lower share (say 50%), or raise the Frigate's own `pdc` to about 0.55 so its screen
reaches the capitals under the current rule. Re-measure the presets either way.

### 0c. New ship classes (Jon, v33 onwards)

Four classes designed with Jon: Fast attack ship, Dreadnought, Repair tender, Electronic warfare ship.
Numbers are starting points, to tweak in play.

**Release 1 (v33): Fast attack ship and Dreadnought.** Measured against the five presets, 40
battles each, row fleet's win rate:

| Fleet (Standard budget) | Classic | Gunline | Swarm | Carrier | Wolfpack |
|---|---|---|---|---|---|
| Dreadnought group, first spec (450; spinal ×2, heavy beam, 2-salvo torpedoes) | 8 | 0 | 3 | 0 | 3 |
| Dreadnought group, Jon's loadout (spinal, 2 light rails, 2 heavy beams, pulse, PD 0.6) at 450 | 70 | 68 | 55 | 95 | 33 |
| **Same at 480** (Dreadnought, 2 Frigates, Corvette, Patrol) | 80 | 57 | 40 | 90 | 20 |
| Raiders, first spec (8 FAS at 45 + 2 Destroyers) | 8 | 15 | 3 | 0 | 8 |
| Raiders, missiles 32 and pdcF 0.7 | 50 | 60 | 25 | – | 28 |
| **Raiders, plus hull 55 and shields 16** (shipped at 50 points) | 68 | 57 | 53 | – | 60 |

Jon chose to keep the Dreadnought expensive and make it hit harder rather than cut its price. The
Fast attack ship couldn't be fixed by price: the 12-ship cap stops a cheaper class buying more hulls.
AI plans added: Dreadnought (Standard: the tested group) and Raiders. Raiders beat the Dreadnought
plan 83% (6 battles): a fast missile swarm is its counter, as intended.

**Watch:** the Dreadnought group is strong against Classic and Carrier (80–90%). Re-run the full
preset round robin once release 2 lands, with all ten classes.

**Release 2 (v35): Repair tender and Electronic warfare ship.** Shipped with the agreed designs, except
the Tender's field repairs (10 hull within 2 hexes, was 5 adjacent) and Resupply (60 hull, was 40).

What adding one ship to the Classic fleet is worth (Classic+X v Classic, 40 battles): Patrol 48,
Corvette 45, Frigate 65, **Tender 78, EW ship 85**, Destroyer 88. As additions both are strong.

Equal budget, swapping the Carrier (150) for support plus an escort, average against the presets
(30 battles each): EW + Frigate 33%, stronger jamming (−15/−20, +12) 34% (no change, so the effect
size isn't the limit); Tender + Corvette 37%, **stronger Tender 47%**, level with Classic (46%).

Reading: the EW ship multiplies a fleet's firepower, so it's worth nearly a Destroyer on top of a
fleet but less than a Carrier in place of one. Kept at 90 with the original effects; watch it at the
Large budget, where it has more to multiply. AI plan Support (Heavy cruiser, Tender, Destroyer, EW,
Frigate) plays Classic even, 50%. The AI uses Resupply and Sensor blackout on its own.

**Still to do:** a full round robin with all ten classes, now that every class exists.

Original designs:
- Repair tender: 150/50 (+12), armor 3, move 3, ev 8, PD 0.35, pulse cannons. Ability Resupply
  (ally within 2: +40 hull, half shields, +1 salvo per missile launcher; recharge 2). Passive field
  repairs: adjacent allies +5 hull a turn. About 110.
- Electronic warfare ship: 60/30 (+10), armor 2, move 5, ev 22, PD 0.30, light beam. Passive jamming
  (enemies within 4: −10 direct, −15 guided accuracy) and targeting uplink (allies within 3: +8).
  Ability Sensor blackout (enemy within 8: no guided fire, −25 accuracy until its next turn;
  recharge 3). AI treats it as a priority target. About 90.

## Environment pass (v36 onwards)

Depth and scale around the board, from a ChatGPT spec Jon brought in. Scenery only: no gameplay, AI, UI or board
changes. Everything lives in `js/environment.js` and draws a fixed number of instances per quality preset.

- **v36, done:** distant belt (tilted ring below the board, gaps, clusters, a radial gap, dust band) and the
  midground slab under the board. Cost measured at High: +13 draw calls, +0.44M triangles, no measurable frame time.
- **v37, done:** large rocks on the horizon (230 to 340 out, level with the board: first placed below the plane,
  where tilted views projected them onto the cells), and micro-debris wrapped around the camera with the box scaled to
  zoom. Cost measured: +1 draw call for the debris, the rocks mostly culled; well under a millisecond at every preset.
- **v38, done:** the landmark, a shattered dwarf planet on the far side of the sky from the gas giant, with ten
  broken-off chunks and a fragment and dust trail descending into the belt; two small moons beside the gas giant; stars
  in three tiers from a fixed seed, the faint one crowding the nebula band. Placement lessons: the landmark first sat
  at -23°, behind the board in tilted views, so it is lifted to -6°; and its fracture has to sit across the sunlit
  limb, or the lit side is all fracture and it reads as a potato. Adds about 50 ms at load, nothing measurable a frame.
- **v39, fix (Jon):** the ten chunks sat packed along the trail, big to small, and read as one lumpy chain lying
  across the fracture ("a turd floating in front of the destroyed part"). Now seven small chunks are thrown out of the
  fracture along its normal and fan sideways, a fifth of the dust hangs just off the break, and the trail starts
  wider and thinner. Lesson: debris from a break should spray out of it, not line up in front of it.
- **v40, done (Jon):** a far nebula near the horizon at azimuth 30°, steel-blue fading to dusty rose, and a small
  galaxy low in the sky at 172°. Each is a camera-facing panel with its own shader. The camera never looks more than
  about 16° above the horizon, so sky features must sit low or nobody sees them. About 0.5 ms at High when the
  nebula fills a third of the screen.
- **Open:** a ring for the gas giant, only if Jon wants it after seeing the rest.

## Scoring and records

The goal: a score for every battle, kept on the device across every future
edit to `index.html`.

**Browser storage already survives edits.** `localStorage` belongs to the
origin (`jdartigas.github.io`), not to the file, so redeploying never touches
it. What can lose scores is storage being cleared, a different device, or new
code that can't read old records. Items 1–3 are one feature, best built
together. Item 4 depends on them.

**Items 1–3 done in v25.** Formula, storage and display are described in `CLAUDE.md` §4 and §2.
One change from the plan below: a surrender forfeits the fleet (no fleet-kept points) instead of
scoring half, because half still let a turn-1 surrender outscore fighting and losing.

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
- ~~**Combat isn't deterministic.**~~ **Done in v26.** Every outcome comes from
  `gameRand()`, seeded from the battle seed; volleys resolve when fired, so
  effect timing can't change results. Same seed plus the same orders gives the
  same battle, verified across different frame timings (`CLAUDE.md` §4). What
  online play still needs on top: exchanging the seed and each side's orders.
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
4. ~~**Split the code into multiple files.**~~ **Done in v29** (`CLAUDE.md` §1). The campaign would roughly double
   the game, and one ~5,000-line `index.html` is hard to work on. Plain
   JavaScript modules served as separate files still need no build step and
   work on GitHub Pages.
5. ~~**Seeded combat rolls**~~ **Done in v26.** Needed for the server to check a
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

### 11. Withdrawing from battle

Surrender (v19) ends a quick play battle as a loss. **Withdrawal is different**: a campaign mechanic
that lets the player pull a damaged ship or fleet out of a fight to keep it, rather than lose it.
Belongs with phase 3 (pirate encounters), when ships persist between battles.

**Decided (Jon): withdrawing must cost something.** If it were instant and free, the player could
leave every fight the moment it turned, and no battle would carry real risk.

Ways to make it costly, which can combine:
- **Ships have to get away.** A ship escapes by reaching its own rear edge, or by spending a turn
  or two spooling its drive while it can still be shot. Fast hulls escape more easily, which gives
  Patrol craft and Corvettes value they lack now; slow capitals may not make it.
- **Ship by ship, not all or nothing.** Pull a damaged Heavy cruiser out while the screen covers
  it. That creates real decisions, including a rearguard that doesn't come home.
- **Leaving has consequences.** Salvage and bounty are forfeited; pirates may take cargo; ships
  that fought need repair; possibly a reputation cost for abandoning an escort mission.
- **The AI can withdraw too.** A pirate that breaks off when it's losing feels alive.

Open questions:
- How many turns does escaping take, and can a ship fire while spooling up?
- Does an escaped ship count toward fleet value at the turn limit? Probably not, or discounted.
- In multiplayer, withdrawing concedes the field to the opponent.
- How it's recorded in scores (item 2), separately from a loss.

### 10. Suggested phases

Each phase leaves something playable.
1. **Foundations** (item 8): split the code, battles with any fleet, per-ship
   loadouts, seeded rolls, save and restore of battle state. Improves the
   head-to-head mode too.
2. **Trading prototype:** star map, ports and prices, single-player and
   offline, to prove trading is fun before paying for a server.
3. **Pirate encounters:** fights on the map, damage and rewards carried over. Withdrawal
   (item 11) belongs here.
4. **Shipyard:** equipment, slots and class limits (item 7).
5. **Fleet command:** more hulls, upkeep, bigger fights.
6. **Shared universe:** backend, accounts, the server-authoritative economy,
   real-time turn refills.
7. **Paid turns**, if still wanted.
