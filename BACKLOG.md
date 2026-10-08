# Backlog

Work Laniakea's Edge (Hard Burn until v44, then briefly Orion's Spur) still owes, in rough priority order. Each item carries enough
context to pick up cold. `CLAUDE.md` describes what the game *is*; this file
describes what it doesn't do yet.

**Milestones (Jon, after v89).** The large tracks are classed by size:
- **Class A:** Mobile release (iOS and Android); Campaign, the Trade Wars-style shared trading universe.
- **Class B:** Real nearby star systems as battle locations (the 21 systems within about 50 light years; see
  "Locations beyond the solar system" under Battle locations).
- **Class C:** Scenarios (escort, hold the line, last stand).

---

## CLASS A MILESTONE — Mobile release (iOS and Android) (Jon, after v88)

Ship Laniakea's Edge to the App Store and Google Play. **Decided approach: wrap the existing web game, don't rewrite it.**
The game stays one codebase for the web and both stores.

### Packaging options

| Route | What it is | Effort | Verdict |
|---|---|---|---|
| PWA | Add to Home Screen from the browser: full-screen, offline, own icon | Days | Free, but not in the stores. A cheap way to try it as an app |
| **Capacitor wrapper** | The same HTML/CSS/JS in a native iOS and Android shell (system WebView) | 2-4 weeks to a first store build | **Recommended** |
| Native or engine port (Unity, Godot) | Rebuild in a game engine | Months | Only if WebView performance proves inadequate; loses the single codebase |

### What the game needs, whichever route
- **Phone UI:** the Phone layout section below (P-1 to P-6) becomes mandatory. Lock phones to **landscape** (iPad
  landscape already works well) and handle notches and home-bar safe areas (`env(safe-area-inset-*)`).
- **Offline bundling:** Three.js r169 (now the jsDelivr import map) and the Google Fonts (Michroma, Rajdhani) ship inside
  the app. Keep the CDN path for the web build or switch both to local copies.
- **Performance and heat:** bloom, GTAO and shadows on a phone GPU will run hot. A lower default quality on phones, a frame
  cap (30 fps is plenty for a turn-based game), no rendering while idle, and testing on a mid-range Android, the weakest
  target. Keep the §6 lessons in CLAUDE.md (no multisampled targets, whole pixel ratios, no NaN in shaders).
- **Saved data:** iOS may clear WebView storage, so scores and settings move to native storage (Capacitor Preferences).
  The `store` helper makes this a contained change; the `hardburn.` keys and the `hardburn.scores` format must survive
  it, with a one-time migration from `localStorage`.
- **App lifecycle:** pause audio and rendering when backgrounded; on iOS respect the silent switch and unlock audio on the
  first tap.
- **Touch polish:** haptics on fire and hits, larger tap targets, no stray browser gestures (pull-to-refresh,
  double-tap zoom, long-press menus).

### Stores
- **Accounts:** Apple Developer $99 a year (needs a Mac with Xcode), Google Play $25 once.
- **Listing:** icons at every size, screenshots per device class, description, age rating questionnaire, privacy labels.
  "Collects no data" is true today and is the easiest label to get through.
- **Apple review:** guideline 4.2 rejects thin website wrappers; a full game normally passes.
- **Attribution in the app:** the HYG star data (CC BY-SA 4.0) needs a visible credit, e.g. an About screen fed from
  `assets/CREDITS.md`. NASA images and Kenney's CC0 sounds are fine as they are.

### Legal and IP, before selling
- **The Expanse:** "inspired by" is fine; keep the name out of the store listing and keywords, and make sure no design
  copies a trademarked ship.
- **Jon's miniatures (Path 2):** if the STL models go in, check each Printables license allows commercial use. Many don't.
- **The name:** check "Laniakea's Edge" is free on both stores and not trademarked.

### Business decisions (Jon)
- **Price model:** paid up front ($3-8 is typical for a premium tactics game) is simplest: no ads, accounts or server.
  Free with in-app purchases needs something to sell (scenarios, the campaign) and adds review and privacy work.
- **Optional extras, not needed for launch:** Game Center and Play Games achievements, iCloud saves, controller support.

### Suggested order
1. Phone UI: P-1 to P-4 below, plus landscape.
2. PWA: manifest, icons, offline cache. Test it as an app on real phones.
3. Bundle Three.js and the fonts locally; mobile quality preset and frame cap.
4. Capacitor wrapper; native storage (with migration) and lifecycle handling.
5. Store accounts, assets, About and credits screen, the IP and name checks.
6. TestFlight and Google Play internal testing with a few players, then release.

The real cost is step 1 and device testing; the wrapper itself is the easy part.

---

## CLASS C MILESTONE — Scenarios (Jon, after v89)

Battles with objectives beyond "destroy everything" (was F3 below). Planned, not started.

**Structure.** A new `js/scenarios.js` holds `SCENARIOS` as data: name, brief, fleets, location, turn limit, marked hexes,
and two checks, a win/loss check during play and the result at the turn limit. The combat code gets small hooks rather
than special cases: `checkEnd` and `endOnTurnLimit` ask the scenario first, and the AI's `targetValue` and `evalCell`
take a scenario bonus (hunt the escort, contest the zone). The hooks apply to whichever side the AI plays, so `HB.sim`
can run scenarios AI against AI for tuning. Difficulty works as it does now.

**Three scenarios:**
1. **Convoy:** your Repair tender (the VIP) must reach marked exit hexes on the east edge within 14 turns. Lose if it
   dies; destroying the enemy also wins. The enemy AI weights the tender heavily and moves to cut its path.
2. **Hold the line:** a marked zone of seven hexes in the centre. At the end of each round, a side with ships in the zone
   and none of the enemy's scores a point. First to 5 wins, or destroy the enemy. The AI values zone hexes.
3. **Last stand:** four ships against a fleet about 1.6 times their budget. Win if any ship is still alive after 10 turns.
   The enemy plays aggressively.

**Interface.** A Scenarios button beside Custom battle on the intro (two half-width cards, so the phone intro still
fits one screen), opening a panel of three cards with their briefs; a brief screen with the objective before the battle;
an objective line in the top bar ("Convoy: Mercy, 4 hexes to the exit · turn 6/14", "Hold: you 3, enemy 2"); marked
hexes on the existing highlight tiles (no new draw calls); and an end screen that says why you won or lost.

**Balance.** Tune each so the player side wins about 40-50% AI against AI at Normal (a human should beat that). To save
usage, Jon runs one console command per scenario and pastes the result back.

**Build order:** framework plus Last stand first (fewest new parts), then Hold the line, then Convoy, each shipped as
its own version.

**Open decisions (Claude's defaults in brackets):**
- Records: per scenario and difficulty (wins, losses, fastest win), kept out of the main score bests? [yes]
- Fleets: fixed, hand-picked per scenario rather than built from a budget? [fixed]

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

**Fixed in v46 (was open): the Frigate couldn't escort capitals.** Its point defense (0.45) is below the Heavy cruiser's
(0.50) and the Carrier's (0.55), and a screen only counts when it beats a ship's own. Tested
`PD_NET.stack` (both fire: 1-(1-own)(1-screen)): round robin Carrier 57, Swarm 56, Gunline 55,
Classic 46, **Wolfpack 36**, and Carrier grp v Wolfpack 80%. Too hard on missile fleets. Options to
try: stack at a lower share (say 50%), or raise the Frigate's own `pdc` to about 0.55 so its screen
reaches the capitals under the current rule. Re-measure the presets either way.

**v46 balance pass** (Standard budget, 40 battles a pairing, sides swapped; one matchup is ±8, an average over
seven opponents about ±3). Round robin of the five presets and the AI plans Dreadnought, Raiders and Support:

| Fleet | Baseline avg | Notes |
|---|---|---|
| Swarm | 61 | strongest; left alone |
| Raiders | 58 | hard counter to the Dreadnought (85–90) |
| Gunline / Wolfpack | 54 / 57 | |
| Dreadnought | 51 | polarised: 90–97 over Carrier group, 10–15 against Raiders and Wolfpack. Real counters, left alone |
| Classic / Carrier group | 48 / 48 | |
| **Support** | **23** | the outlier |

Changes shipped:
- **Frigate point defense 0.45 → 0.56**, so its screen beats the Heavy cruiser's 0.50 and Carrier's 0.55 under the
  existing rule. Same seeds: Classic +3, Wolfpack −4, Raiders −3, the rest within 1. Small; it makes the escort real.
- **Repair tender 110 → 70.** Support fleet variants against the other seven: as was 27; Tender stronger repairs
  (15 hull, range 3) 30; **Tender at 70: 39**; no Tender at all 42; more hulls with two EW ships and no cruiser 12.
  The Tender added too little fighting power for its price; cheaper helped, stronger didn't. Support is still the
  weakest plan, a force multiplier rather than a brawler.

**Still to run:** the same check at the Skirmish and Large budgets (Jon: hold for now), and the EW ship's price alone.

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
- **v41, fix (Jon):** nobody could see the galaxy. At the usual tilt the top of the screen is only about 5° above the
  horizon and it sat at 7°, so it only showed zoomed in, as a speck. Now at 2° and about 11° across, with brighter arms.
- **Open:** a ring for the gas giant, only if Jon wants it after seeing the rest.

## Ship models made by Jon (after v58)

Jon wants to model the ships himself instead of using AI-generated art. Today every hull is built in code from
the kit in `buildShip` (js/ships.js). This section is the plan for loading his models instead, class by class, with
the code-built hull kept as the fallback for any class without a model yet.

### File format: glTF (.glb), not STL

The game can load either with Three.js's own loaders (`GLTFLoader`, `STLLoader`, from the same CDN as the rest of
three/addons), so there is still no build step. STL carries shape only.

| | STL | glTF / GLB |
|---|---|---|
| Shape | Yes | Yes |
| Materials and colours (charcoal hull, orange bands, white stripes, glowing lights) | No | Yes |
| Texture coordinates, so the riveted plating can be applied | No (a triplanar shader can fake it, more crudely) | Yes |
| Separate named parts (turrets, drives, sections) | No: one mesh per file | Yes |
| Marker points for weapon mounts and drive nozzles | No | Yes, as empties |

STL is workable only as one file per part (hull, orange livery, white livery, each turret). Recommend .glb exported
from Blender.

### What each model needs

- **Orientation and size:** the bow along one agreed axis, at true length (`m` in `CLASSES`). The game rescales by
  measured length anyway, as it does now (`modelLen`).
- **Weapon mounts:** named empties, e.g. `rail_0`, `pulse_1`, `pdc_3`, mapped to the class's weapon slots, so shots
  leave from the real hardpoints (`mounts.w[slot]`, `mounts.pdc`) and the damage model's smoke and sparks still find them.
- **Turrets:** separate objects with their pivot at the base, so they keep traversing (`rigTurret`, `MAX_TURRETS`).
- **Drives:** nozzle empties for the plumes (`makePlume`), pointing aft.
- **Lights:** emissive materials for ports and running lights, and nav lights as named empties if they should blink.
- **Triangle budget:** about 20,000–60,000 per ship at full detail (see levels of detail below). Print-ready models
  often run to millions.

### Breaking up on destruction

`breakUpShip` (js/wrecks.js) splits a ship into 2–5 sections along the keel, cutting between the deck modules the
code-built hulls are made of. Meshes that span a cut are stretched to fit each side. Small debris is a stock kit
(plates, girders, pipes) from `DebrisKit`, not pieces of the ship. A model that arrives as one mesh would therefore
go into one section and not break at all. Two changes keep it working, and they combine:

1. **Automatic cutting:** each section draws the whole model through clipping planes, so it shows only its slice.
   The planes follow the section as it tumbles. The existing glowing torn edges (`tornEdge`) cover the open cut.
   This works with any model, a single STL included, with nothing special for Jon to do.
2. **Modelled parts as debris:** separate objects in the model (turrets, dishes, antennas, armour panels) below a
   size threshold fly off as real debris, alongside or instead of the stock shards. With glTF Jon only has to leave
   them as separate objects.

Together: large sections tumbling apart, with the ship's own fittings scattering.

### Suggested path

1. Jon models one ship first. The Frigate is a good test: mid-sized, with a mix of fittings. Export as .glb with
   mount empties.
2. Build the loader, mount and turret mapping, automatic cutting and parts-as-debris on that one ship.
3. Run the stress test below.
4. Publish a short modelling guide (naming, orientation, triangle and texture budgets) for the other nine classes.

### Engine: stay with Three.js (assessed after v58)

The question was whether Three.js is the best engine for many detailed models on screen at once. It is not the limit:
every browser engine hands the GPU the same work through WebGL or WebGPU, so the same models are not meaningfully
faster elsewhere. What decides speed is triangle count, draw calls (ships are already merged to a handful each,
`mergeShipParts`), texture memory, and post-effects (bloom, ambient occlusion, shadows, anti-aliasing), which probably
cost more than the ships on today's board.

- **Babylon.js:** the only serious alternative. More is built in (levels of detail, inspector, mature WebGPU), but no
  real speed advantage at this scale, and switching means rewriting the renderer, effects, ships, wrecks, sky and every
  shader.
- **PlayCanvas:** a good engine built around its own online editor. Same performance story, same rewrite.
- **Unity or Godot web exports:** large downloads, slow loading, weak on iPhone and iPad Safari, and no longer "it's
  just a web page". Ruled out.
- **Three.js WebGPU renderer:** an upgrade within Three.js, not a change of engine. Safari supports WebGPU now.
  Revisit once it is mature.

### What actually matters for detailed models

1. **Levels of detail (the big one).** On the board ships are 30–200 pixels long, so full detail is mostly wasted
   there. Each ship exported at two or three levels: full for the ship viewer and close zoom, about 10,000 triangles for
   normal board view, a very simple one far out. Three.js's `LOD` swaps them by distance.
2. **Shared copies.** Five Frigates load the geometry once and draw it five times.
3. **Compression for download size:** Draco or meshopt for geometry, KTX2 for textures, both supported by Three.js, so
   the game still loads quickly on a phone connection.
4. **Texture memory budget.** iPhones and iPads cap memory per tab. Large textures on ten classes add up fast; agree a
   size per ship.

### Stress test before committing to budgets

When the first model exists: 24 copies on the board, full effects, on Jon's iPad (likely the weakest device people
will use). That says in one sitting whether levels of detail are needed from day one or only later. `DEBUG` (main.js)
already shows frame time, draw calls and buffer sizes.

## Review roadmap (ChatGPT/Codex playtest + Jon's combat ideas, after v73)

ChatGPT's review of a fresh-player Quick battle (Codex could run it; ChatGPT's own browser had no WebGL), filtered by
Jon, plus three combat ideas of his. Rule: change the rules before building what explains them.

1. ~~**Quick fixes**~~ **Done in v73:** objective text in How to play; the hover card kept clear of the interface; the
   "Resolving…" busy chip.
2. **Combat rules** (one batch, simulator balance pass at the end):
   - **Shields under fire regenerate at half rate**, plus **PDC close-in fire**: every ship can turn its point defense on
     an enemy at range 1-2 (many small rounds, weak against shields), but a ship that does can't intercept missiles
     until its next turn. Measured first: Frigate mirrors ran 19 turns on average because shields fully regenerate.
   - **Broader damage model:** rebalance critical odds (about 40% weapons), add **sensors** (accuracy) and a **magazine**
     on missile ships (lose a salvo, small chance of an internal explosion), optionally bridge/command (ability recharge).
   - **Explosion splash damage:** dying ships hurt adjacent hexes, friend and foe, about 12% of their maximum hull,
     through shields and armor; the AI must avoid it.
   - **Balance pass (v76 round robin, 40 battles per pairing):** Classic 48, Gunline 48, Swarm 62, Carrier 47,
     Wolfpack 54, Dreadnought 41, Raiders 66, Support 34; 18.8 turns (v52: 48/51/50/48/51/56/57/39, 20.2 turns).
     Splash is not the cause (splash off: Dreadnought 37, Raiders 63, Support 39). Crit resistance for big hulls
     (x sqrt(150/hull)) changed nothing measurable and was dropped. Suspect v74's half regen under fire, which hits
     the big-shield hulls that swarms keep under fire every turn. Open: tune Raiders/Swarm down, Dreadnought/Support up.
     **v77:** capitals (max hull 200+) keep 75% regen under fire. Round robin: Classic 46, Gunline 47, Swarm 57,
     Carrier 50, Wolfpack 51, Dreadnought 49, Raiders 63, Support 36; 19.5 turns. Next: Raiders (fast attack cost).
     **v78:** fast attack cost 55 dropped Raiders to 42 (any cost over 50 loses a whole Corvette at 660), so cost
     stayed 50 and fast attack evasion went 34 to 30: Raiders 63 to 59 (v52: 57). Support (36) is still the weakest.
     **v87:** EW ship cost 90 to 80, so the Support plan buys a seventh hull (a Patrol craft) at 660. Support row first,
     40 battles a pairing, same seeds: v86 35 (Raiders 13); EW 70 47; tender 50 47 (the same fleet, the same results);
     no Heavy cruiser 42 but lopsided. Full round robin at EW 80: Classic 49, Gunline 48, Swarm 57, Carrier 49,
     Wolfpack 49, Dreadnought 46, Raiders 54, Support 47; 19.6 turns. Spread 46-57 (v78: 36-59). Still to check:
     the Skirmish and Large budgets, where the Support plan builds a different fleet.
3. ~~**Clarity**~~ **Done in v79-v84** (PDC state v79, system chips v80, blast warning v81, failure reasons v82, threat overlay v83, label overlap v84): threat overlay (#8), failure reasons (#6), system status icons on the ship panel and hover card, an
   explosion warning on the hover card, PDC state (defending or spent), and **label overlap (#10)**, pulled forward
   because PDC brawls bring ships close.
4. ~~**Onboarding:**~~ **Done in v85:** the first-battle tutorial (#1), written against the finished rules.
5. ~~**Polish:**~~ **Done in v86:** Normal / Fast animation setting (#9; Normal stays the default; Fast applies to the enemy's turns only), combat log type markers (#11).

Skipped (Jon): #4 action-state labels, #7 move-bonus formatting.

## Brightness, playability and fun (Jon, after v58)

Options proposed after Jon found the screen too dark. **Chosen for the next round (Jon): B1, B2, B3, F1, F2, F4, F5,
plus a redesigned intro screen with a Quick start.** The rest stay here.

Why it is dark: the starfield uses real star magnitudes (`STAR_DATA`, ~8,900 stars), the v54 player livery is dark
charcoal, the scene is lit by one sun with a weak fill (`fill` 0.8, ambient 0.55 in render.js), and the hex grid is
drawn at 22% opacity (board.js).

**Brightening**
- **B1. Starfield 2–3× brighter**, more faint stars, stronger Milky Way band (`buildRealSky`, locations.js). *Chosen.*
- **B2. Brightness slider in Settings** (tone-mapping exposure), remembered per browser. *Chosen.*
- **B3. Lift ships' shadow side:** stronger fill light plus a soft rim light outlining hulls against space. *Chosen.*
- **B4.** Slightly lighter player livery: mid grey instead of charcoal.
- **B5.** More visible board: brighter hex grid, a faint glow on the board plane under the fleets.
- **B6.** Brighter backdrops per location: nebula glow, planets or sun more present (the Shattered Reach has none).

**Playability and ease of use**
- **P1. Undo last move.** *Declined by Jon.*
- **P2. AI turn speed.** *Declined by Jon (after v67): he likes watching the enemy's turns.*
- **P3.** Enemy threat ranges toggle: show where enemy weapons can reach.
- **P4.** First-battle tips: short prompts for select, move, fire, end turn.
- **P5.** "Ships with orders left" reminder before ending the turn.
- **P6.** Off-screen target markers (camera follow-up E, below).

**Fun**
- **F1. Improved sound effects** (see the sound section above). *Chosen.*
- **F2. Big moments:** brief slow motion and camera push when a capital ship dies; victory and defeat stings. *Chosen.*
- **F3.** Scenarios beyond "destroy everything": escort a tender, hold a point, survive an ambush for N turns. **Now the Class C milestone at the top of this file.**
- **F4. Quick battle mode:** smaller fleets for a ten-minute game, started from the intro screen. *Chosen.*
- **F5. Battle summary** at the end: damage per ship, MVP, missiles intercepted. *Chosen.*

## Phone layout (Jon, after v88)

Jon's verdict from playing v88 on an Android phone (about 390 x 850): **the touch wording is fine, but the phone UI is far too
intrusive.** iPad and desktop work well. Not urgent; parked here.

What the screenshots show (portrait):
- The command bar takes about a third of the screen: name, ability and Threat buttons, hull and shield bars, the v80 system
  chips, the v79 PD line, then a horizontally scrolling weapon row. The log and End turn take another row under it. With
  the top bar and the fleet strip, the board gets well under half the screen.
- The fleet strip (three cards) covers the top of the board, and **ships and their tags end up underneath it** (Needle
  hidden behind Kestrel's card). Cause: `safeRect` ignores the phone strip (it only counts `#roster` as a left-hand
  column), so camera framing puts ships under it. This one is a bug, the cheapest fix and worth doing first.
- Hit chips and tags crowd the top of the visible board.

Ideas, roughly cheapest first:
- ~~**P-1.**~~ **Done in v89:** `safeRect` counts the phone fleet strip (top edge), so framing keeps ships below it.
- **P-2.** Trim the phone command bar: hide the chips and PD line there (they are in the docked card on tap), and fold
  Threat into a small icon button.
- **P-3.** Slimmer fleet strip: name and one bar per ship, no "Move" line; or collapse it behind a Fleet button.
- **P-4.** Make the command bar a bottom sheet: collapsed to name plus weapon buttons, pulled up for detail.
- **P-5.** Log as a one-line ticker overlaid on the board, or behind a button, giving End turn the full row width.
- **P-6.** Suggest landscape for phones (as iPad landscape already works well), or a landscape-specific layout.

## Camera follow-ups (after v56)

Options E and F from the v56 camera plan, deferred when A–D were built:

- **E. Markers for off-screen targets.** While a ship is selected, enemies it can hit that are off screen get an arrow
  at the screen edge with the hit chance; tapping it aims at that ship. v56 covered part of this (tapping an Enemy
  contact frames it beside the selected ship), but markers would help most on phones, where the enemy list is in a
  drawer. Medium-sized. Best done the next time the battle interface is touched.
- **F. Camera setting: Follow action / Manual.** Manual turns off all automatic framing (`keepInView`, `frameShot`,
  AI framing). Less needed since the camera already stops framing AI shots once the player moves it (`cam.touched`).
  Small; keep in reserve until someone asks.
- ~~**Zoom back after AI turns.**~~ **Done in v68:** at the start of the player's turn the camera eases back to the view they had before the AI turn, unless they moved it during that turn.

## Ship lore (Jon, during v57)

Each class gets lore for the ship viewer: who builds it, its history, famous hulls, how crews talk about it.
The viewer already has the slot: add `lore` to the class's entry in `CLASS_INFO` (js/core.js) and a **Lore**
section appears in the viewer's spec panel. Until a class has lore the section stays hidden (Jon's call, v57).
Open questions: the setting's factions and history (Laniakea's Edge Fleet Yards appears on the blueprint sheets),
whether lore unlocks through play or is always there, and whether named hulls (the "Swift Remit" on the cruiser
sheet) become part of the game.

## Sound direction: reference set (Jon, after v91)

Jon collected 26 Epidemic Sound effects in `sfx/` (untracked, local only) as the sound he wants. **They can't ship:** his
Creator Subscription licenses them only for his own video and podcast productions, forbids apps that expose the audio
"on a standalone basis", allows only cutting, looping and fading (no pitch changes or layering), and stops new versions
once the subscription ends. So they are a **reference for the target character** only: never committed, never loaded by
the game or the sound lab, never uploaded to any AI tool. They *can* be used in trailers, gameplay videos and devlogs on
Jon's own channels, credited "Artist / Title / courtesy of Epidemic Sound".

The target, per game sound (from the reference files' names and their measured length, brightness and low end; Claude
can't listen, so Jon's ear decides):

| Game sound | Reference | Character to aim for |
|---|---|---|
| Railgun shot | Sniper Rifle, Single Shots; Hand Cannon, Single Shots; Huge Blaster Shot, Cannon, Distortion | A sharp, heavy single report with real low end (about a third of its energy under 250 Hz) and a short tail: a crack, not a boom |
| Railgun slug, PDC rounds, generic hull hit | Bullets, Impact, Hit, Metal 01 and 02; Ricochet, Metal, Tank / Harsh / Sharp | Metal being struck and torn: bright (about 3.3 kHz), almost no low end, some ringing; ricochets for glancing variations |
| Pulse bolt | Laser, Boom x4; Laser, Boom, Small; Scifi Shot 04 | Short, punchy energy shots, several takes so a three-bolt volley never repeats |
| Beam, and beam on a hull | Electric Discharge, Beam, Plasma, Hard; Blaster, Discharge, Energy, Beam 01 | Bright electrical discharge (about 4-4.5 kHz), crackling, sustained |
| Heavy guns (Dreadnought, heavy beam) | Laser, Boom, Heavy; Laser, Deep Drone | The pulse and beam character with more weight and a droning body |
| Torpedo hit, capital ship deaths | Futuristic Explosion 02, 03, 05; TNT, Heavy Blast | Big designed explosions, mostly low end (42-56% under 250 Hz), long rolling tails with secondary blasts |
| Medium ship deaths | Futuristic Explosion 01 | The same, brighter and shorter |
| A new "miss" or shield-deflect sound | Ricochet, Laser Projectiles Bouncing Off Surface (Bursts, Continuous); Ricochet, Classic, Fast, Crunchy | Energy bolts glancing off: bright zips with no low end |
| Skipped | Single Shot, Laser, Long Tail; Build Tool, Shot, Blast 01 | Long soft tails that would blur in rapid fire |

**How to get there:** synthesis (as in v91) where it can reach the character, and for the rest, game-licensed sources:
the Sonniss GDC bundles (free, royalty-free for commercial games, editing allowed), CC0 files on Freesound, or a paid
pack with an explicit game license. Claude shortlists, Jon approves before anything is downloaded, and every file is
credited in `assets/CREDITS.md`. Or ask Epidemic Sound for a custom game license (epidemicsound.com/custom-license/).

## Improved sound effects (Jon, during v52)

Today every sound is synthesized in `js/audio.js` (Web Audio oscillators and filtered noise), mixed through one
effects bus and one music bus. It works, but the effects are thin next to the visuals the game has grown.

Ideas to scope with Jon:
- **A distinct voice per weapon:** railgun crack and slug whine, beam hum that holds for the shot, pulse thumps per
  bolt, missile launch and motor roar, torpedo launch thud, fighters, PDC buzz-saw on intercepts.
- **Impacts that tell you what was hit:** shield ripple versus hull strike versus armor ping; a heavier layer for
  railgun and torpedo hits.
- **Explosions with weight:** layered ship deaths (crack, roar, debris rattle, a low tail), scaled by hull size.
- **Space for it:** pan by screen position and soften by camera distance, so a fight on the left sounds on the left
  and a close-up is louder than a distant exchange.
- **New game events:** system damage and offline alarms (v52 damage model), repairs, turret traverse, the turn banner,
  low-hull warnings.
- **Synthesized or recorded:** v48 allowed real files in `assets/`. Recorded or designed samples (CC0 sources, listed
  in `assets/CREDITS.md`) could sit alongside synthesis. Weigh download size; keep everything working with sound off.
- Keep it under the Effects slider and mute (v44).

## Combat: damage model and railgun range (Jon, after v49)

### Damage model: weapons and systems knocked out

**Done in v52**, as proposed below. Tuning: the first formula gave about 24 criticals a battle (the cap applied before
the bonus for a damaged ship, so a big hit on a hurt ship ran to 80%), which buried the player in notices; retuned to
about 7 (rate 0.6 x hull damage / max hull, up to 1.6x on a hurt hull, capped at 25%, none under 4 hull damage).
Round robin against v50, same seeds: Classic 48 (52), Gunline 51 (48), Swarm 50 (47), Carrier 48 (49), Wolfpack 51 (53),
Dreadnought 56 (57), Raiders 57 (57), Support 39 (38); 20.2 turns (20.3). No measurable snowballing at this rate.

**Jon:** when ships take damage, some weapons may stop working properly, with a notification that they are offline or
damaged.

Proposed design:
- **Trigger:** a hit that reaches the hull has a chance of a critical, higher for big hits and as hull falls. Rolled
  with `gameRand` so battles stay seeded and replayable.
- **Effects:** one system is *damaged* or *offline*:
  - a weapon: damaged means less accuracy or damage; offline means it can't fire for 1–3 turns
  - engines: less movement
  - shield generator: slower recharge
  - point defense: weaker interception
- **Shown:** floating text ("Railgun offline"), a log line, the status on that weapon's button in the command bar, a
  small icon on the ship's tag, and on enemy cards so the player sees what they knocked out.
- **On the model:** sparks or smoke at the hit fitting. The weapon mounts (v42) already know where every weapon is.
- **Repair:** the Repair tender's Resupply fixes damaged systems; ships also recover slowly on their own.
- **Watch:** crippling damage amplifies snowballing (the winning side wins faster). Measure with `HB.sim`.

### Railguns without a range limit

**Done in v50.** What was measured (8-fleet round robin, 40 battles a pairing, same seeds; averages good to about ±3):

| | Classic | Gunline | Swarm | Carrier | Wolfpack | Dreadnought | Raiders | Support | turns |
|---|---|---|---|---|---|---|---|---|---|
| v49 | 48 | 57 | 58 | 51 | 50 | 51 | 52 | 33 | 20.3 |
| no cap, evasion falloff from `opt` | 50 | 42 | 52 | 56 | 59 | 45 | 66 | 29 | 21.3 |
| + AI closing fix | 46 | 47 | 65 | 44 | 56 | 43 | 67 | 33 | 19.1 |
| **shipped: old accuracy inside `reach`, dodge only past it** | 52 | 48 | 47 | 49 | 53 | 57 | 57 | 38 | 20.3 |

Lessons: changing accuracy inside the old ranges reshuffled everything (the gunline collapsed against the small-hull
fleets); keeping it and adding reach beyond is a clean extension. And the AI only closed when no weapon could reach
anything: with unlimited railguns that never happened, so railgun ships sat back. Closing pressure is now per idle
weapon (`evalCell`).

**Jon:** raise railgun range; in space there shouldn't be a range limit (a slug never slows down).

Proposed design, agreed in principle: what limits a railgun is **time of flight**, not distance. At long range the
target has seconds to move, so only big or slow targets get hit.
- **No range cap on railguns.** Line of sight still applies (asteroids block).
- **Accuracy falls with distance, scaled by the target's evasion.** A Dreadnought or Carrier (evasion 2–4) is hit at
  almost any range; a Patrol craft or Fast attack ship (32–34) is nearly untouchable far out and must be engaged close.
  Today's falloff past `opt` per hex already does half of this; remove `range` for `kind:'rail'` and let falloff and
  evasion do the rest.
- **Gives light hulls a real job:** closing the distance on capital gunlines.
- **Balance risk:** today Spinal reaches 12 and Light railgun 7. Unlimited range lets Gunline and the Dreadnought group
  hit big targets from turn 1, and missiles lose their unique long reach. Run the preset round robin before shipping
  and tune the falloff.

## Battle locations and the galactic map (Jon, after v45)

More to come from Jon; capture additions here.

### Battle locations

**Phase 1 done in v48:** location picker (with Random), the real sky from the HYG catalogue with the Milky Way in
galactic coordinates, the sun at true size, **The Shattered Reach** and **Earth orbit** (geostationary: Earth 17.4
degrees across, the Moon at its true 0.52 degrees, lit by the real sun so its phase is right, near side toward Earth,
Earth's axis on the real celestial pole). Decided with Jon: real data files are allowed (assets/CREDITS.md); the sun
sits low (8 degrees) so it is on screen in tilted views; the Moon at true size.

Learned building it:
- A low sun barely lights the tops of ships, and a black sky gives metal nothing to reflect: the board went dark.
  Earthshine fixes it, as in reality: each location sets a second light (Earth's direction, bluish) and its
  environment map includes a bright Earth. Every new location needs its own fill, or it will be too dark to play.
- Planets need sunlight-only shading (`bodyMaterial`); the game's ambient and fill would light their night sides.
- A sun disc much brighter than about 4x blooms into a soft square. Brightness comes from the glare sprite.
- Seen elsewhere, not fixed: a ship's engine glow can bloom into a soft square very close to the camera.

**Phase 2 done in v49:**
- **Mars orbit:** on Phobos' orbit, 600 km behind it. Mars 42 degrees across (true from there), Phobos 2.6 degrees with
  its real 27 x 22 x 18 km proportions and Viking map, long axis toward Mars, Deimos a point. Mars first sat 26 degrees
  below the horizon, behind the far half of the board, where red ships vanished against it; at 8 below only its lower
  limb shows from overhead and it fills the horizon when tilted.
- **Asteroid belt:** 2.7 AU, sun 0.2 degrees, Jupiter and Mars as points, a sparse field of dark rocks, zodiacal light.
  Nothing out there reflects much light: the fill is a faint cool skylight, a readability concession.
- **Jupiter orbit:** 800,000 km out, in Jupiter's equatorial plane, Jupiter 10 degrees, the four Galilean moons along
  its equator at true sizes (Io 0.30, Europa 0.39, Ganymede 0.17, Callisto 0.10 degrees).
- Zodiacal light on every real location, fading with distance from the sun.

**v51 (Jon):** Jupiter moved in to 230,000 km (inside Io's orbit): 36 degrees across, the moons just beyond its limb.
The intro screen frames each location's planet beside the menu (`heroAz`, `Loc.menuTheta`), swaying gently; the
Shattered Reach keeps its slow circle.

**Next:** the 21 nearby star systems, which need the sky recomputed from each star's position. The Shattered Reach keeps
its old high sun for now; move it low too if Jon wants the sun visible there as well.

The player picks where a battle is fought, or Random. The board and rules stay the same; the scenery around it
changes. A fourth picker on the intro screen, same pattern as the fleet pickers.

| Location | Show |
|---|---|
| **Mars orbit** | Mars below or beside the board, **Phobos** (and Deimos, small) |
| **Earth orbit** | Earth, **the Moon** |
| **Asteroid belt** | Belt material all around, no large body close |
| **The Shattered Reach** | Today's scenery: fictional gas giant and moons, shattered dwarf planet, nebula, galaxy |
| **Jupiter orbit** | Jupiter, **the Galilean moons** (Io, Europa, Ganymede, Callisto) |

- **The star field as close to reality as possible.** Replace the random stars with a real catalogue: the brightest
  few thousand stars (for example the HYG or Yale Bright Star catalogue, to about magnitude 6.5) with real positions,
  brightness and colour from spectral type, plus the Milky Way band in the right place on the sky. Ship it as a small
  data file in the repo; no network calls. The same sky works at every location in the solar system, since the stars
  don't shift visibly between planets.
- **The Sun at its true size from each location.** Angular diameter about 0.53° at Earth, 0.35° at Mars, about 0.2°
  in the belt (2.7 AU) and 0.10° at Jupiter. Brightness and the sun light's intensity can follow it, but keep the
  board readable; light intensity is a gameplay-readability decision, not just physics.
- **Decisions to make when it's built:**
  - **Decided (Jon):** the fictional scenery since v36 (the brown gas giant and its moons, the shattered dwarf planet,
    the nebula and the galaxy) stays, as its own location: **The Shattered Reach**, after the broken dwarf planet.
    It keeps its own made-up sky; the real star catalogue is for the solar system locations.
  - **Orbit height.** From low orbit Earth fills half the sky; from the Moon's distance it is about 2°. Pick heights
    that look good and are honest (high orbit for Earth and Mars, say), and say so in the location's description.
  - The camera never looks more than about 16° above the horizon (see the environment pass), so planets and moons
    have to sit low or below the board, as the gas giant does today.
  - Real planet surfaces need textures. Either procedural (like today's gas giant) or real maps as files in the repo,
    which raises download size; measure it.
  - Does location change anything in play (light, sensor range, debris density)? Default: cosmetic only.

### CLASS B MILESTONE — Locations beyond the solar system (Jon)

**Decided (Jon): every system in this table is a location.** He asked first for Alpha Centauri, Wolf 359 and Sirius
A and B, then for all of them. **Keep each as real as possible:** its known planets, companions, disks and belts,
at their real sizes, colours and arrangement. Within about 50 light years (distance from the Sun):

| System | ly | The setting |
|---|---|---|
| **Alpha Centauri A, B and Proxima** | 4.2–4.4 | Two Sun-like stars in a close pair, a red dwarf far out, Proxima b in the habitable zone |
| Barnard's Star | 6.0 | Old, dim red dwarf with small rocky planets |
| **Wolf 359** | 7.9 | Small, violent flare star: dim, red-lit, flaring |
| **Sirius A and B** | 8.6 | The brightest star in Earth's sky, blue-white, with a white-dwarf companion |
| Epsilon Eridani | 10.5 | Young orange star, debris disk, a planet, asteroid belts. The best frontier setting |
| Procyon A and B | 11.5 | Yellow-white star with a white dwarf; a smaller Sirius |
| 61 Cygni | 11.4 | Two orange dwarfs; the first star whose distance was measured |
| Epsilon Indi | 11.9 | Orange star, a brown-dwarf pair, a cold giant planet imaged directly |
| Tau Ceti | 11.9 | Nearest single Sun-like star, heavy debris disk: a dense, dusty field |
| Teegarden's Star | 12.5 | Tiny red dwarf, two Earth-sized planets |
| 40 Eridani | 16.3 | Triple: orange dwarf, white dwarf, red dwarf |
| Altair | 16.7 | Spins so fast it is visibly flattened |
| Gliese 667 | 23.6 | Triple star with planets: three suns in one sky |
| Vega | 25 | Brilliant blue-white star, wide dust disk |
| Fomalhaut | 25 | Sharp, bright debris ring: a ready-made arena |
| Pollux | 34 | Orange giant with a gas giant planet |
| Arcturus | 37 | Red giant filling the sky |
| TRAPPIST-1 | 41 | Seven rocky planets close round a red dwarf, several visible at once |
| 55 Cancri | 41 | Binary star, five planets including a lava world |
| Capella | 43 | Pair of yellow giants |
| Castor | 51 | Just outside: six stars in three pairs |

Notes for building them:
- **The sky has to be recomputed from each star's position.** The catalogue's 3D positions give every star's
  direction and brightness as seen from there: constellations shift, and **the Sun shows as a star** (fairly bright
  from Alpha Centauri, faint from TRAPPIST-1). Mark it: it ties in with the galactic map's "you are here".
- Each primary star at its true angular size and colour, from its radius, temperature and the orbit chosen.
- **Realism first (Jon).** Use the known planets and objects for each system, from the current exoplanet record (NASA
  Exoplanet Archive) at the time it's built. Where something isn't known (a planet's surface, a disk's exact look), keep
  it plausible and say in the location's description which parts are measured and which are drawn.
- These are real stars. Use the astronomy, not any fiction's lore about them.

### Galactic map

A 3D map of the galaxy with points of interest, added later. Two uses:
- **The multiplayer and campaign phase:** the shared universe in the campaign section is navigated on it.
- **A small "you are here" inset** during battles and in menus.

**Zoom from galaxy to battle:** a continuous, as-cool-and-3D-as-possible zoom from the whole galaxy, to the solar
system, to the local view of the battle. Notes for building it:
- One three.js scene per scale, cross-faded, rather than one scene spanning light years (depth precision breaks
  across that range). Galaxy: a particle spiral with the Sun's position marked; solar system: planets on their
  orbits; local: today's board.
- **Decided (Jon): the zoom starts one level further out,** at the Laniakea supercluster that contains the Milky
  Way (the game's name), then the galaxy, the solar system and the battle.
- Needs a points-of-interest data format before any content; keep it a separate data file like `PRESETS`.

## Weapons fire from their mounts (v42 onwards, Jon)

- **v42, done:** every weapon fires from a fitting on the model. New fittings where a hull had none: beam emitters
  (cruiser shoulders, EW ship's keel), twin-barrel pulse turrets, vertical launch cells, tube mouths (patrol craft wing
  pods, destroyer bow), a keel railgun on the destroyer. Missiles leave along the launcher's axis (up out of cells, out
  of tubes, sideways out of the carrier's flank bays) before bending onto the attack path. Point defense streams from
  the turret nearest the warhead. Fittings merge with the hull: one extra draw per ship at most (the lens material).
- **v43, done:** turret tracking. Pulse turrets traverse onto the target before a volley (up to 0.45 s), the PDC
  nearest an incoming warhead swings onto it, and idle turrets drift between nearby bearings. Turrets stay merged and
  turn in the vertex shader (an `aTurret` number per vertex, a per-ship angle array), so it costs no draw calls; pulling
  them out of the merge would have cost one or more each, and a Dreadnought carries 17. Their shadows don't turn.



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

## CLASS A MILESTONE — Campaign: a shared trading universe

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
