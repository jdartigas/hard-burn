# Laniakea's Edge — project guide for Claude Code

The game was called Hard Burn until v44 and Orion's Spur for v44 only; it is Laniakea's Edge from v45. The repo, the Pages URL, the `css/hard-burn.css` file name and the `hardburn.` storage prefix keep the old name on purpose: renaming the repo moves the live URL, and renaming the prefix would lose every saved score.

Turn-based 2.5D space fleet battle in the browser, built with Three.js/WebGL. The player commands six ships against an AI fleet of six on a hex grid strewn with destructible asteroids. The ship designs follow The Expanse, modeled on the owner's painted 3D-printed miniatures.

- **Owner:** Jon. He prefers concise answers and hard-refreshes to test.
- **Repo:** https://github.com/jdartigas/hard-burn (default branch `main`).
- **Live:** https://jdartigas.github.io/hard-burn/ (GitHub Pages, static).
- **Version:** `GAME_VERSION` in the small script at the top of `index.html`. It shows on the intro screen and in the pause menu, and is appended to every css/js URL so a release is never mixed with cached old files.

---

## 1. Repo layout and deployment

- **No build step, no package.json, no bundler.** Split into files in v29:
  - `index.html`: the markup, `GAME_VERSION`, the three.js import map and a small module that loads three.js and then the game.
  - `css/hard-burn.css`: all styles.
  - `js/*.js`: the game, **plain scripts (not modules) sharing one global scope**, loaded in this order by `index.html`: `core` (utilities, all game data, hex maths), `audio`, `render`, `board`, `environment`, `ships`, `rules`, `wrecks`, `combat`, `hud`, `input`, `menus`, `main`. Each file's header says what it holds.
  - **Load order matters:** code that runs at load time (not inside a function called later) can only use names from earlier files or earlier in the same file. Function calls at runtime can go anywhere. A new file must be added to the list in `index.html`.
  - Every top-level name is global, so it must not collide with a browser global (`open`, `close`, `name`, `status`, `top`...). Checked for all 287 names in v29; check new ones the same way.
  - Globals are reachable from the browser console (`state`, `CLASSES`, `createShip`...), which makes debugging much easier. `window.HB` still exposes the test hooks.
- **Three.js r169** loads from jsDelivr through an import map:
  - `three` → `https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js`
  - `three/addons/` → `.../three@0.169.0/examples/jsm/`
  - Addons used: `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `GTAOPass`, `OutputPass`, `Pass`/`FullScreenQuad`, `CopyShader`, `SMAAPass`, `mergeGeometries`.
  - Everything is spread into a single `THREE` object: `const THREE = { ...THREE_NS, EffectComposer, ... }`. Code calls `THREE.GTAOPass` and so on, and `window.THREE` is set for debugging.
- **Fonts:** Google Fonts. Michroma (wide, technical) for the title, headings and button labels in caps; Rajdhani for everything else, with `font-size-adjust:0.5` on the body because its x-height is small.
- **Deploy:** commit to `main`. GitHub Pages serves the repo root, so **pushing to `main` updates the live site.**
- **Assets on disk: real data only (v48, Jon).** Models, sounds, music and the Shattered Reach's textures are generated in code. The real locations use real data, committed in the repo: NASA Earth, cloud and Moon maps in `assets/sol/` and the HYG star catalogue subset in `js/stardata.js`. Every file is listed with its source and license in `assets/CREDITS.md`; keep that file current. The star data is CC BY-SA 4.0 and must keep its attribution header. Textures load by relative path, so the game needs to be served over http (as GitHub Pages does), not opened as a file.
- Keep it build-free and static-hostable.

## 2. Release conventions

- **Never push to `main` without Jon's OK.** It is the live site. Committing locally is fine.
- **Bump `GAME_VERSION`** (top of `index.html`) on every change you ship. Jon uses it to confirm he isn't looking at a cached copy.
- Keep the game working at every quality setting on Apple Silicon (M2 Max, Chrome and Safari) and on Windows with an NVIDIA 4070 Ti. Read §6 before touching rendering.
- `localStorage` keys use the prefix `hardburn.`: `sound`, `music`, `diff`, `gfx`, `fleetYou`, `fleetEnemy`, `custom` (the builder's fleet), `hud` (which HUD drawers are open), `scores` (records, below). Always go through the `store` helper, which wraps `localStorage` in try/catch.
- **Scores and records live in `hardburn.scores`, and losing them would lose Jon's history.** Never rename the key. The shape is `{format, games, bests}`; each game keeps the raw facts (fleets, difficulty, seed, result, turns, fleet values, damage) plus its score and `formula` version, so the formula can change and old games be rescored. If the format changes, bump `SCORES_FORMAT` and convert old data in `loadScores`, never drop it. `loadScores` validates everything it reads, because Import brings in files from outside; render record fields through `esc()`. Simulator battles are never recorded.

## 3. Code map (sections in load order; the file is in brackets)

Find a section by grepping `js/` for one of its names below (for example `function hitCore`, `const CLASSES`).

| Section | What's there |
|---|---|
| utilities (`core`) | `$`, `clamp`, `lerp`, `rand`, `mulberry32` (seeded RNG), `store` |
| data (`core`) | `WEAPONS`, `ABIL`, `CLASSES`, `ORDER`, `NAMES`, `DEPLOY`, `DEPLOY_MAX_X`, `MAX_FLEET`, `CLASSIC_FLEET`, `DIFF`, `SHIP_SCALE=1.25`, `COL` |
| hex math (`core`) | Axial pointy-top hexes, `HEX=1.9`, `MAP_R=9`, `MAP_ROWS=6`, `hexToWorld`, `worldToHex`, `hdist`, `hexLine` |
| audio (`audio`) | `Sound`: Web Audio synthesized effects plus a generative cinematic score, with music and effects on separate gains |
| renderer and scene (`render`) | Renderer, composer, `MSAARenderPass` (now just a plain scene pass), lights, `updateShadowFrustum`, `enableShadows`, `QUALITY` presets, URL diagnostics |
| procedural textures (`render`) | `canvasTex`, `panelTexture`, `glowTex` |
| environment (`render`) | Nebula sky shader, stars in three tiers from a fixed seed (faint field crowding the nebula band, bright, brightest), sun, gas giant with atmosphere, PMREM environment map |
| particles (`render`) | `Particles`: one additive `Points` pool of 6,000 with `emit`/`burst`/`update` |
| timing (`render`) | `tween`, `wait`, `after`, `addFx`. All scaled by `timeScale` and driven by the frame loop, not `setTimeout` |
| board (`board`) | Hex cells, grid lines, highlight tiles (`InstancedMesh`), selection rings, path line |
| scenery (`environment`) | `ENV` layout constants and `Env`: a distant asteroid belt tilted under the board with a dust band, a midground slab of rock deep below it, large rocks on the horizon well outside the board (v37), and micro-debris: a box of specks the vertex shader wraps around the camera, scaled with zoom (v37). The landmark (v38): a shattered dwarf planet opposite the gas giant at 6° below the horizon, fracture turned across its sunlit limb, chunks and a fragment trail descending into the belt; and the gas giant's two moons (`bodyGeometry` builds both). A far nebula (steel-blue core fading to dusty rose, dust lanes that dim the stars, embedded young stars) and a small galaxy (v40), each a flat panel facing the board with its own shader, so they only cost the pixels they cover. The camera never looks more than about 16° above the horizon, so sky features must sit low. Anything below the board plane on the far side projects onto the cells in tilted views, so big rocks must stay level with the plane. Instanced, flat-shaded, distance-hazed, fixed seed; no shadows, no AO, never picked. `QUALITY[q].env` sets how many instances each layer draws (`Env.setQuality`, called by `applyQuality`) |
| damage model (`damage`) | `CRIT` (every tuning number), `initSystems`, `rollCrit` (decided in `fireWeapon` while the volley is pre-resolved, shot by shot against copies, so seeds replay the same), `applyCrit` (severity only rises, so arrival order doesn't matter), `tickSystems` (turn start: offline counts down, damaged may be repaired), `repairAll` (Resupply), effects `weaponOffline`, `slotAcc`, `moveAllowance`, `regenOf`, `effPdc`, display `damagedSystems`/`damageSummary`, `updateDamageFx` (smoke and sparks at the fitting). About 7 criticals a battle; measured no effect on balance or battle length (BACKLOG) |
| locations (`stardata`, `locations`) | `STAR_DATA` (8,920 naked-eye stars, equatorial J2000 positions in parsecs, magnitude, B-V). `LOCATIONS` and `Loc.set(id)`: each location has its own root group, sun direction (`setSunDir`), baked environment map, and second light (the Reach's blue fill, or earthshine). The Shattered Reach is the fictional sky (`reachSky` in render, `Env.reachRoot`). Five locations since v49: The Shattered Reach, Earth orbit, Mars orbit beside Phobos, the asteroid belt, Jupiter orbit. `frameFrom` orients a sky from two real directions (the sun and the planet's real pole), so the moons' plane, the planet's tilt and the stars agree; `orient` turns a body by its pole and the longitude that faces a point; `pointBody` draws bodies too small to resolve. The menu camera frames each location's `heroAz` body on the right of the screen (`Loc.menuTheta`). Real locations: `skyFrame` orients the real sky so the date's sun lands on a chosen low direction with the ecliptic near the horizon; `buildRealSky` draws the catalogue and a Milky Way in galactic coordinates; `buildSun` draws the sun at its true size; planets and moons use `bodyMaterial` (sunlight only, no ambient). `setupBattle` applies `fleets.location`; the menu picks it (`pickLoc`, `hardburn.location`, Random rolls per battle) |
| asteroids (`board`) | `RockNoise`, `makeRockGeometry` (about 12.5k triangles, craters, fractures), `rockMat` with shader micro-detail, `makeRockTarget`, `destroyRock`, `generateTerrain` |
| ship models (`ships`) | `armorTextures` (generated color, normal and packed AO/rough/metal maps), `shipMaterials`, `deckGeometry`, `buildShip` (per-class builders, greebles, conduits, close-up detail layer). Weapon fittings (`emitter`, `pulseTurret`, `cells`, `tubeMouth`) register **mounts**: `ship.mounts.w[slot]` lists the muzzles for each loadout slot in `CLASSES[cls].weapons` order, and `ship.mounts.pdc` every PDC turret. A new class or loadout needs a mount for every slot, or that weapon falls back to the bow. Turrets (PDCs and pulse turrets, up to `MAX_TURRETS` a ship) traverse in the vertex shader: `rigTurret` numbers them, `mergeStatic` writes the number into an `aTurret` attribute, and `rigMaterial` rotates those vertices by the ship's `turretRig.yaw` angles, so tracking costs no draw calls. The shadow pass does not rotate them |
| game state (`rules`) | `state`, `createShip`, `shipAt`, `weaponReady` |
| rules (`rules`) | `hasLOS`, `hitCore`, `hitChance`, `interceptChance`, `applyDamage`, `expected`, `reachable`, `pathTo` |
| FX (`rules`) | `mountPoint` (a weapon slot's muzzle in world space; volleys step through a slot's mounts, so twin guns alternate), `pdcPoint` (the PDC turret nearest a warhead, which it also swings onto it), `aimTurret`/`updateTurrets` (slew toward a goal bearing, idle drift otherwise; pulse turrets traverse onto the target before a volley), `fxRail`, `fxBeam`, `fxPulse`, `fxGuided`, `impactFx`, `floatText`, `flash` (pooled point lights), `addShake` |
| destruction (`wrecks`) | `DebrisKit`, `breakUpShip`, `updateWrecks`, `clearWrecks`, `explodeShip` |
| combat (`combat`) | `fireWeapon`, `destroyShip`, `fireAll`, `useAbility`, `moveShip` |
| AI (`combat`) | `scoreAttack`, `threatAt`, `evalCell`, `aiShip`, `runAITurn` |
| turn flow (`combat`) | `beginSideTurn`, `startPlayerTurn`, `endPlayerTurn`, `checkEnd`, `showEnd` |
| player actions and HUD (`hud`) | `select`, `recomputeHighlights`, `playerAttack`, `playerMove`, `updateHUD`, `updateHover`. Layout: the fleet lists are drawers that slide off the sides (`#tg-roster`, `#tg-enemies`), the selected ship's orders run along one command bar at the bottom with End turn beside it, and the log shows its last two lines until expanded. `measureHud` sets `--hud-bottom` so the log and lists sit above the bar however it wraps |
| scores and records (`hud`) | `scoreBattle`, `loadScores`/`saveScores`, `recordBattle`, `considerBest`, `fleetName`, `esc` |
| camera and input (`input`) | Orbit camera `cam`, `MIN_ZOOM=3.5`, follow and zoom (`zoomTo`, the Z key, double-click), pointer, pinch and keys. `focusShip` brings every selection into view, whichever way it was made (v56: `keepInView`, only as far as needed; C still centres). Framing (v56): `safeRect` (screen less the docked panels), `framePoints`, `frameShot`, `clampToBoard` |
| screens and menus (`menus`) | Menu: difficulty segmented control (`showDiff`), fleet pickers as list popovers (`PICKERS`, `openPicker`, listbox keys; a bottom sheet on phones), `chosenFleets`, `renderPicks`; Settings sheet (music and effects volume, `hardburn.musicVol`/`fxVol`, graphics), fleet builder (`openBuilder`, `renderBuilder`), records panel, import/export, pause and surrender, HUD drawers (`applyHudPrefs`, `measureHud`) |
| setup (`main`) | `clearBattle`, `setupBattle`, `startGame`, `toMenu` |
| main loop (`main`) | `frame()`, `debugTick`, `onResize`, `applyQuality`, `cycleQuality` |

`window.HB` exposes test hooks: `render`, `applyQuality`, `state`, `cam`, `board`, `wrecks`, `explodeShip`, `destroyRock`, `fireWeapon`, `runAITurn`, `endPlayerTurn`, `startGame`, `setTimeScale` and more.

## 4. Game design

**Support classes (v35).**
- **Electronic warfare ship** (`jam:true`): enemies within `JAM.range` (4) hexes of it fire at −10 accuracy (−15 with missiles and fighters); allies within `JAM.uplink` (3) get +8. Fields don't stack. **Sensor blackout** (enemy within 8): that ship can't fire missiles or fighters and has −25 accuracy until the jammer's side begins its next turn (`ship.blackout` holds that side). All of it goes through `accAdj` in `hitChance`, so every hit percentage shown includes it. The AI treats it as the top-priority target.
- **Repair tender**: field repairs give allies within `fieldRange` (2) hexes `fieldRepair` (10) hull at the start of each of its side's turns. **Resupply** (ally within 2): +60 hull, half its shields, one salvo back in each missile launcher, the only way to rearm mid-battle.
- Targeted abilities share one mode (`state.mode==='target'`): `ABIL[k].target` is `'ally'` or `'enemy'`, and `abilityTargets(s)` lists who's in range. A class's `passive` text shows in the fleet builder.

**Ambush** (Fast attack ship): +2 movement, and its missiles are half as likely to be intercepted that turn (`fx.ambush` in `fireWeapon`). The AI uses it when loaded missiles can reach an enemy.

**Models from reference art (v53 onwards, Jon).** Jon supplies concept art in `reference/` (untracked); models are rebuilt from it with the shared kit, matching its proportions from the plan view as fractions of length. The Fast attack ship (v53) is the first: solid banded drive, open truss round the fuel tanks, arrowhead hull with a missile pod on each flank (2 x 2 tubes), armoured block with sensor dome, twin pulse turret. **v54 rebuilt seven more** from Jon's blueprint sheets: Frigate, Destroyer, Heavy cruiser, Fleet carrier, Dreadnought, Repair tender and EW ship. Each keeps the hardpoint counts on its sheet (which match the atlas). They use the v54 kit in `buildShip`: `drive()` (solid armoured drive cylinder, livery bands as fractions of its length), `cyl()` (cylinder with UVs in world units, so plates stay square on round surfaces), `sec()`/`band()` (a hull section that remembers its shape, and orange or white bands that wrap it anywhere along a taper) and `lattice()` (open masts). **Armor plating (v54):** `armorTextures` now draws the sheets' square riveted plates (some doubled up), dark seams, rivet rows, scuffed and replaced plates, chipped edges, grime and small amber running lights; the player hull is darker charcoal and stripes take the same plate texture. **v55 rebuilt the last two** from their sheets: the Patrol craft (a faceted stealth wedge on three drives, PDCs port and starboard on the swept flanks, missile pods under them, twin pulse turret on the spine) and the Corvette (three drives, two above one below, a 2 × 2 cell block, canopy bridge, twin light railguns under the bow). All ten classes now come from Jon's art. The old drum, struts, sidePlates, grille and turretBlock kit pieces are no longer used by any class. The Fleet Hardpoint Atlas (an artifact, PDF copy in `reference/`) was re-measured at v55: re-measure when a model changes.

**Intro screen and Quick battle (v60, Jon).** The intro is comp A of the v58 comps: an eyebrow, the title, a big **Quick battle** button, the old setup as a "Custom engagement" card with Begin inside it, and a row of How to play, Ships (opens the ship viewer), Records and Settings. It tightens under 900px tall so iPad landscape never scrolls. **v69:** the title alone is Orbitron Black (Michroma has no bold weight), each line filled with a light-to-blue gradient and a soft glow (`drop-shadow`, since a clipped-text gradient can't take a text-shadow); it is sized up because Orbitron runs narrower. **v71:** Jon's logo replaced the text title: `assets/logo.webp` (1000×568, 187 KB) is the primary lockup cut from `reference/logo.png`, with its dark sky keyed out to transparency by brightness (so it sits on any scene); the `h1` keeps the name as the image's alt text, and the eyebrow now sits under it. The logo is sized by height under 900px tall, and the lede is hidden under 820px tall, so iPad landscape and 1440×900 still fit without scrolling. Orbitron is no longer loaded. To recut it from a new sheet, crop the lockup and set alpha = smoothstep(0.17, 0.45, max(r,g,b)). **v72 (Jon): a simpler intro.** It is now the logo, the eyebrow and lede, Difficulty, a **Quick battle** button, a **Custom battle** button, and the How to play / Ships / Records / Settings row. Custom battle opens its own panel (`#setup`) with the Your fleet, Enemy fleet and Location pickers (the picker popover `#pk-list` lives there now) and Begin engagement / Back; the fleet builder returns to that panel, and Escape closes it. The intro fits without scrolling from 1366×600 up, and on a 390×844 phone. Quick battle (`quickFleets` in menus.js, `QUICK` in core.js): both sides get the same random four-ship lineup (equal points were far from equal fights at this size), a random location and the chosen difficulty. `state.quick` makes `deployFleet` move homes toward the centre (capped at `QUICK.maxX`) and `turnLimit()` return `QUICK.turns` (15) instead of `BATTLE_TURNS`. Quick games are recorded with `quick:true` and never set a best. `HB.sim` passes `quick` through.

**Weapon sounds reworked (v65, Jon's notes after playing v64).** Missiles launch with a fast whoosh and whine (not a lift-off roar). Impacts now know the weapon (`impactFx(..., kind)` → `Sound.hit(kind)`, `Sound.shield(kind)`): a missile or fighter hitting a hull is a small explosion, a beam sizzles and burns, a pulse bolt is a punchy blast, a railgun slug a heavy crunch. Shield hits crackle with static (`crackle()`), longer under a beam. The beam's firing sound is a new synthesized energy hum (the laserLarge recording is no longer used). The railgun charges for `RAIL_CHARGE` seconds (0.55, audio.js), a rising whine with energy drawn into the muzzle (fxRail waits as long), then fires with a thump. Pulse firing is unchanged: Jon liked it. **v66 (Jon's second pass):** a limiter sits last in the audio chain so stacked sounds can't clip. Missile and fighter hits are a gentler synthesized explosion (`blast()`); torpedoes (`d.big`, impact kind `'torpedo'`) have their own heavier two-stage blast, no longer the recording that small ships' deaths use. The railgun fires with a low thump (no bright crack). A slug hitting a hull rips into metal: a crunch, a falling grind and shrapnel crackle. The blasts running along a dying ship are small explosions (`Sound.burst`), not hull clunks. The system-damage alarm is an electrical short (crackle and buzz); its old two-tone beep read as a doorbell. **v67:** every ship's death uses the capital explosion recording, pitched up and quieter for smaller hulls (`P` in `boom()`), because the short clips for small and medium hulls clipped and cut off; all explosion levels are lower. Missiles, fighters and torpedoes bursting on shields add a small `blast()` over the static. Beams gain a high, detuned shimmer over the hum, and both trail off for 0.7 s after the beam. Unused clips were removed: `assets/sfx/` holds 12 (pulse ×3, launch ×2, hull ×3, pop, rail, boom4, rumble), and js/sfxdata.js is 177 KB. **v68:** point defense sounds like a gatling: a motor whine spinning up, then 18 fast, slightly uneven rounds (a crack and a small thump each), synthesized. **v69:** a missile, fighter or torpedo on a shield is an explosion close to its hull hit (brighter, softer) with a short falling shield tone, not the static, which read as a crunch.

**Recorded sound effects (v63, Jon).** short AAC files in `assets/sfx/` (19 in v63, 12 since v67), cut from Kenney's CC0 "Sci-Fi Sounds" and "Impact Sounds" packs (credited in assets/CREDITS.md; the raw packs are not in the repo). `SFX` in audio.js maps each sound to its files; `sample()` picks one at random with a little pitch variation. Pulse, missile launch, shield and hull impacts, interceptions (`Sound.intercept`, new) and explosions (sized by hull: small, medium, capital plus a low rumble) play the recordings; the railgun and beam layer a recording over their synthesis. Every one falls back to the old synthesized sound if it can't decode (old Safari). **Since v64 the clips load from `js/sfxdata.js`** (`SFX_DATA`, base64), not by fetch(): a page opened from a file can't fetch its own assets, and on Jon's local copy v63 was silently all-synthesized. After changing a clip in `assets/sfx/`, regenerate it: `python3 -c "import base64,glob,os;print('\n'.join(f\"  {os.path.basename(f)[:-4]}:'{base64.b64encode(open(f,'rb').read()).decode()}',\" for f in sorted(glob.glob('assets/sfx/*.m4a'))))"` and paste the lines between `const SFX_DATA = {` and `};`. Player ships losing a system sound a two-tone alarm (`Sound.alarm`). Victory and defeat have longer stings: a fanfare resolving to a held chord, and a falling minor chord over a rumble. Gains are the numbers passed to `sample()`, all in audio.js.

**Shields under fire and PDC guns (v74, review roadmap round 2, first step).** Frigate mirrors averaged 19 turns because shields fully regenerate every turn. Now: (1) a ship damaged during the other side's turn regenerates only `UNDER_FIRE.regen` (half) of its shields when its own turn begins (`s.underFire`, set in fireWeapon, cleared in beginSideTurn). (2) Every ship carries **PDC guns** (`WEAPONS.pdcGun`, appended last to `s.weapons` outside its class loadout, so `C.weapons` and `mounts.w` still line up): range 2, 8 damage, pierce 0.5, weak against shields (sh 0.5), rounds per volley = point defense rating × 18 (min 3). Firing them sets `s.fx.pdcFired`, so `effPdc` returns 0 (no interceptions, no escort screen) until that ship's next turn, and its tag shows "PDCs spent". `isPdcGun(w)` keeps them out of `firingOrder` (so out of All weapons and the AI's main volley), the ready counts, `hasOrders`, the AI's positioning score, and the critical-hit list: they share the point defense system's state (`linkPdcGun`). The AI fires them last, only when no enemy with loaded missiles or fighters could reach it next turn, or to finish a target. Measured (10 battles each): Frigate mirror 19.1 → 10.7 turns, Destroyer mirror 10.7 → 8.9; fleet battles still about 19-25 turns. **v79 (round 3):** the ship panel and every ship hover card show its point defense state (`pdLine` in hud.js): own PDCs ready or spent, and the share of missile-rack missiles its cover stops, naming the Frigate when a screen supplies it. **v80:** a row of system chips sits beside it (`sysChips`): WPN (the worst of its guns), ENG, SHD, PD, SNS and, on missile ships, MAG; dim when working, amber damaged, red offline with turns left, the detail in each chip's title.

**Capital regen under fire (v77, round 2 balance).** The v76 round robin had Dreadnought fleets at 41 and Swarm/Raiders at 62/66: big-shield hulls under fire every turn never recovered. Ships with max hull `UNDER_FIRE.capitalHull` (200) or more regenerate `UNDER_FIRE.capital` (75%) under fire instead of half. Round robin after: Dreadnought 49, Swarm 57, Raiders 63 (still high). Splash and a size-based crit resistance were both measured and ruled out as causes; see BACKLOG round 2.

**Fast attack evasion 34 to 30 (v78).** Raiders were still at 63. A cost of 55 overshot to 42, because any price over 50 costs the 660 build its last Corvette; evasion 30 brings them to 59.

**Broader damage model (v75, review roadmap round 2, second step).** Weapons took 60% of criticals, so damage read as weapons-only. `CRIT.weights` is now weapons 40%, engines 14, shields 14, point defense 10, **sensors** 12 and **magazine** 10; a key a ship lacks (point defense at 0, the magazine on ships without missiles or torpedoes, `hasMagazine`) drops out and the rest renormalize. Systems are listed in `SYS_LABEL`/`SYS_KEYS`. **Sensors:** damaged costs `CRIT.sensorsDamaged` (10) accuracy on every weapon, offline 20 (`accAdj`), and offline sensors can't track a railgun target past its reach (`hitChance`). **Magazine:** a hit loses a salvo from the fullest launcher (`magazineHit`); knocked offline it loses another and cooks off for `CRIT.magazineBlast` (8%) of max hull, never fatal, and the ship's missiles and torpedoes can't fire while it's offline (`w.mag`, checked in `weaponOffline`; relinked with the PDC guns in `linkPdcGun` after `repairAll`). The blast is decided in `rollCrit` and subtracted from the volley's simulated hull, so the precomputed kill shot stays right. Measured: about 5 criticals a battle, weapons now 44% of them; battle length unchanged (~20 turns).

**Explosion splash damage (v76, review roadmap round 2, third step).** A dying ship's blast (`blastNeighbours`, called from `destroyShip`) hits every ship within `SPLASH.radius` (1) hex, friend or foe, for `SPLASH.share` (12%) of its max hull, through shields and armor like any hit (`SPLASH.pierce` 0.3 of armor ignored): a Patrol craft's blast is about 5, a Destroyer's 17, a Dreadnought's 48. Damage lands immediately so the rules stay in step; floating numbers and impact effects wait for the hull to go up. A blast can kill and chain. A kill on the other side is credited to whoever killed the first ship; a ship lost to its own side's blast is credited to no one. The AI counts a kill's blast in its target choice (`blastSwing` in `scoreAttack`) and avoids stopping next to ships likely to die, its own or the enemy's (`evalCell`). How to play mentions it. **v81 (round 3):** the hover card warns before a blast (`blastLine` in hud.js): when the selected volley would kill a ship, or its hull is under `BLAST_WARN` (25%), it shows the blast's size and what it would do to each ship within the radius, yours first, from the same `applyDamage` maths.

**Big moments (v62, Jon).** Every ship's death (`destroyShip` → `bigMoment`) eases time down and back up (`timeScale`, driven by real time in `updateMoment` so the slow-down can't slow itself), scaled by hull size in `MOMENT`: small hulls 0.55× for 0.35 s, medium 0.4× for 0.7 s with a camera push, capitals 0.25× for 1.2 s with a stronger push. The push hands the camera back afterwards unless the player moved it meanwhile; no push if they moved it this turn (`cam.touched`, now also reset at the start of the player's turn). A bigger moment absorbs a smaller one. Skipped in simulations and under reduced motion.

**Battle summary (v61, Jon).** Every ship carries `st` {dealt, taken, kills, ints, repaired}: damage it dealt and took, kills, missiles and fighters it stopped (the escort that screened, else the target itself), and hull it repaired (Resupply, Repair drones, field repairs). The end screen shows an **MVP** (`mvpScore`, weights in `MVP_WEIGHT`, so escorts and tenders can win it) with a one-line citation, and a table of your ships sorted by it; Stopped and Repaired columns appear only when someone scored there. Per-ship totals equal `state.stats`.

**Ship pictures, the ship viewer and the help chart (v57, Jon).** `CLASS_INFO` (core.js) holds each class's `best` phrase and `purpose` paragraph, and later its `lore`. js/shipview.js draws everything on the game's own canvas and renderer, because a page only gets one WebGL context worth having. The model is built 300 units above the board, the board and ships are hidden, and `scenePass.camera` is pointed at the viewer's own camera; ambient occlusion is off and bloom and exposure are turned down (`closeLook`), since they are tuned for ships seen across the board. **Builder pictures** are rendered one class per frame inside `frame()` (`SV.update`, just before the game's own render, so they never reach the screen), copied out of the canvas middle as JPEG data URLs, and cached for the session. They are framed on a sample of the hull's vertices, not its box. **The viewer** (`SV.open(cls, fromScreen)`) has a spec panel (right on wide screens, a bottom sheet on phones), and the ship is centred in the uncovered area with `setViewOffset`. It supports drag to orbit, wheel or pinch to zoom, Shift-drag or two fingers to pan, double-click to reset, arrows or ‹ › to step through the classes, and a livery toggle. Close and Esc return to the screen it was opened from. **How to play** has a Ships chart built from the class data, and each row opens the viewer. Builder rows show the ability's description and any passive.

**Ship lengths (v47, Jon).** Each class has `m`, its length in metres from bow tip to drive nozzle, at 1 model unit = 80 m: Patrol craft 75, Fast attack ship 100, Corvette 145, Frigate 185, EW ship 215, Destroyer 230, Repair tender 250, Fleet carrier 275, Heavy cruiser 290, Dreadnought 390. `buildShip` measures the built model (`modelLen`, opaque hull only) and `createShip` scales the group by `SHIP_SCALE × (m/80) / modelLen`, so a model can change shape without its length drifting. `len` in `CLASSES` is the model's own size, used inside the model (shield, pick sphere); `ship.len` is the real length in world units. Small hulls keep a pick radius of at least 0.9.

**Fleets.** A fleet is a list of class keys, duplicates allowed, up to `MAX_FLEET` (12) per side, and the two sides can differ. `startGame({player:[...], enemy:[...]})` starts one; with no argument it replays the last fleets, and the default is the classic one of each class. The menu's pickers choose your fleet from `PRESETS` or **Custom** (the fleet builder), and the enemy from Random (any preset), a preset, or **AI build** (the AI spends your budget with one of the `AI_PLANS`, picked at random each battle). The builder lists every class in `CLASSES` with its cost, hull, shields, damage per turn and weapons, against a budget from `BUDGETS` (Skirmish 330, Standard 660, Large 1000) and the 12-ship cap. A custom fleet is stored as `hardburn.custom` = {budget, fleet}; if a price change later puts it over budget it's discarded and the pick falls back to Classic. Presets are Standard-budget fleets, so saving a custom fleet at another budget switches the enemy to AI build, and the menu warns if you pick a preset against it. Choices persist as `hardburn.fleetYou` and `hardburn.fleetEnemy`; scored games also keep both fleet lists and the budget.
- **Deployment** (`deployFleet`): the first ship of each class takes its `DEPLOY` home cell, so the classic fleet lines up as it always has. Extra copies take the nearest free cell west of `DEPLOY_MAX_X`, keeping a one-hex gap where possible. The enemy's cells are mirrored through the centre, and terrain keeps every deployment cell clear.
- **Duplicates** are named with numerals (Iron Vesper II) and carry hull numbers like 537-2.

| Class | Cost | Hull | Armor | Shield (regen) | Move | Evasion | PD | Weapons | Ability |
|---|---|---|---|---|---|---|---|---|---|
| Patrol craft | 20 | 45 | 1 | 15 (+8) | 7 | 32 | .20 | Pulse, missiles | ECM screen |
| Corvette | 40 | 70 | 3 | 25 (+10) | 6 | 24 | .30 | Light railgun, missiles | Hard burn |
| Frigate | 60 | 95 | 4 | 35 (+12) | 5 | 18 | .56 (screens allies within 3 hexes with all of it; above the capitals' own since v46, so it covers them) | Beam, missiles | PD surge |
| Destroyer | 140 | 140 | 6 | 45 (+15) | 4 | 12 | .40 | Railgun, pulse battery, torpedo | Shield overcharge |
| Heavy cruiser | 250 | 230 | 9 | 70 (+18) | 3 | 6 | .50 | Spinal railgun, heavy beam, torpedo bay | Brace for impact |
| Fleet carrier | 150 | 250 | 7 | 80 (+20) | 3 | 4 | .55 | Strike wing, pulse | Repair drones |
| Fast attack ship | 50 | 55 | 1 | 16 (+6) | 8 | 34 | .15 | Strike missiles (2×32, range 9, 2 salvos, harder to intercept), pulse | Ambush |
| Dreadnought | 480 | 400 | 12 | 120 (+22) | 2 | 2 | .60 | Spinal railgun, 2 light railguns, 2 heavy beams, pulse | Brace for impact |
| Electronic warfare ship | 90 | 60 | 2 | 30 (+10) | 5 | 22 | .30 | Light beam | Sensor blackout |
| Repair tender | 70 | 150 | 3 | 50 (+12) | 3 | 8 | .35 | Pulse | Resupply |

**Turn.** Each ship can move up to its movement allowance, fire each ready weapon once, and use its ability if charged, in any order. Then the AI takes its turn.

**Surrender.** In the pause menu (two presses: the first arms it, the second within 4 s confirms). Ends the battle at once as a loss, with its own "Surrendered" end screen. Hidden when no battle is running. It is not withdrawal; that is a campaign mechanic still to design (`BACKLOG.md` item 11).

**Turn limit.** A battle lasts at most `BATTLE_TURNS` (30) turns. If both fleets survive, the side with more fleet value left wins: each surviving ship's cost times its fraction of hull remaining (`fleetValue`). An exact tie is a stalemate. Without the limit, a standoff (two Carrier fleets, a last ship that keeps running) never ends. In the last three turns the AI plays to it: a side ahead on value protects its lead (more caution), a side behind presses (more aggression, less caution), in `evalCell`.

**Score** (`scoreBattle`, formula 1): victory 1000 + fleet value kept (0–1000) + enemy value destroyed (0–500) + 20 per unused turn on a win, times Easy 0.75 / Normal 1 / Hard 1.5. A surrender forfeits the fleet, so it earns no fleet-kept points. Shown on the end screen with its breakdown and a new-best badge; the menu's Records panel shows bests per difficulty, win rate, recent battles, and Export/Import (merges, skips duplicates).

**Hit chance, direct fire (pulse, beam, rail).** `acc − max(0, dist − opt) × fall − target evasion`, and for railguns past `reach` also `− (dist − reach) × evasion × dodge`. Railguns (v50, Jon) have **no range limit** (`range: Infinity`): a slug never slows, so what limits it is time of flight, and a nimble target dodges a long shot. `reach` is the old range (Light 7, Railgun 9, Spinal 12), inside which accuracy is unchanged; `dodge` is 0.12. Spinal at 18 hexes: Dreadnought 46%, Destroyer 28%, Patrol craft 5%. Interface code must handle `isFinite(range)`. Subtract 15 if the target is in debris and 20 if it's under ECM. Add the difficulty modifier (enemy −12 on Easy, +8 on Hard; player +5 on Easy). Clamp to 5–95. Direct fire needs line of sight, and asteroids block it.

**Determinism.** A battle is fully determined by its seed (`board.seed`) plus the orders given. Everything that decides an outcome draws from `gameRand()`, seeded in `setupBattle`: hit and interception rolls, the ±15% damage roll, and the AI's deliberate noise. Everything cosmetic uses `Math.random()`/`rand()`. **Never call `gameRand()` from an effect, and never let an outcome depend on `Math.random()`**, or visuals will change results. `fireWeapon` resolves a volley's damage when it fires, shot by shot against a copy of the target, and each impact effect only applies its precomputed share, so the order effects land in cannot matter. Checked by running the same seeded battles with the simulator clock and with the frame loop both stepping: identical, down to every hull value. `HB.sim` results include a per-battle signature (`battles`) for this. The seed shows in the `?debug` overlay and is stored with every scored game.

**Hit chance, guided (missiles, torpedoes, fighters).** `acc − evasion/2`, minus 5 in debris and 25 under ECM. Ignores range falloff and line of sight. Point defense can then intercept each hit: `pdc × pdcF`, capped at 0.8.
- A ship's point defense is its own `pdc` or the screen of any Frigate within `PD_NET.radius` (3) hexes at `PD_NET.share` (100%) of the Frigate's, whichever is higher (`pdCover`). An interception by a screen is drawn from the Frigate, logged as "by X's screen", and counted in the end screen's "Missiles and fighters stopped" row.
- Known gap: the Frigate's 0.45 is below the Heavy cruiser's 0.50 and the Carrier's 0.55, so its screen never helps the capitals it's meant to escort. `PD_NET.stack` (combine both instead of taking the higher) fixes that but was measured too strong against missile fleets; see `BACKLOG.md`.
- PD surge multiplies `pdc` by 1.6, capped at 0.85, before `pdcF` applies.

**Damage.** Shields absorb first, scaled by the weapon's shield multiplier (`sh`). What gets through is multiplied by the weapon's hull multiplier (`hu`), and armor, reduced by pierce, is subtracted from it. Hull damage never drops below 15% of the hit after `hu`. Brace for impact doubles armor, then cuts the hull damage by 25%.

**Terrain:**
- **Asteroids** have 90 integrity. They block movement and line of sight and can be shot apart. A destroyed asteroid leaves debris.
- **Debris** costs double movement and gives cover.
- **Wrecks:** a destroyed ship turns its hex into debris.
- The terrain layout is mirrored and always passes a connectivity check.

**AI** (`evalCell`, `aiShip`):
- It scores every reachable hex by offense minus threat, with caution fading over turns.
- It focuses fire by difficulty and saves guided ammo for worthwhile shots.
- It uses abilities situationally.
- When a direct-fire weapon has no clean shot, it blasts the asteroid blocking its line.

**Difficulty** (`DIFF`) changes enemy accuracy, hull multiplier, caution, focus and noise.

### Adding a new ship class

The fleet builder, the class list and the HUD read `CLASSES`, so a new class appears in them on its own. Everything else a class touches:
1. `CLASSES`: stats, `weapons` (keys into `WEAPONS`), `ability` (a key into `ABIL`), `len` and `y`, and a provisional `cost`.
2. `ORDER`: where it sits, lightest to heaviest (turn order and list sorting), and a new, unused number in `MODEL_SEED`. Never derive the model seed from `ORDER`: inserting a class would reshuffle every existing model.
3. `DEPLOY`: a home cell on the player's side for the first ship of the class.
4. `NAMES`: one name per side, and a hull number in the `idn` maps at the top of `buildShip`.
5. `buildShip`: its model. This is the real work: a per-class builder in the same design language (drum drives, V-strut truss, tiled decks), with plumes via `makePlume`. Anything animated or transparent must go in `mergeShipParts`'s skip set.
6. `breakUpShip`: how many sections it breaks into (`nSec`).
7. AI: `targetValue` (how much the AI wants to kill it), and whether `evalCell` should keep it at stand-off range like the carrier and cruiser.
8. Price it with `HB.sim`: exchange rate against the classic fleet, then equal-budget tests against the presets (`BACKLOG.md` item 0 has the method), and add it to any `AI_PLANS` wish lists that should use it.
9. Check it in the warm-up (`warmUp` builds a Carrier wreck; a new class with new materials may need its own).

## 5. Visual design

- **Ships** are built entirely in code from primitives, modeled on Jon's miniatures:
  - 365 is the corvette, 436 the frigate, 537 the destroyer.
  - The four-drive ship is the heavy cruiser, and the angular ship is the patrol craft.
  - The shared design language:
    - drum-housed drives at the stern
    - V-strut truss to the engineering section
    - chamfered decks of tiled armor
    - color-plated sides, stripes and hull numbers
    - PDC turrets, RCS thrusters and radiators
  - **Player livery:** charcoal tile, rust-orange plates, white stripes and numbers.
  - **Enemy livery:** pale grey tile, oxide-red plates.
- **Drive plumes** have three shader layers (a core with shock diamonds, a turbulent sheath and an outer glow), plus a nozzle flare and sparks. Throttle is `engine.boost`.
- **Destruction:** a chain of internal blasts, then the main blast. The hull splits at deck boundaries into 2–4 sections with glowing torn edges, venting and fires. Long parts are cut at the breaks. About 56 detailed debris pieces from `DebrisKit` persist. Sections drift and tumble for the rest of the battle.
- **Brightness (v59, Jon):** every lever is in `LOOK` at the top of render.js: star brightness and size, faint filler stars (on the real-sky locations they crowd toward the Milky Way), Milky Way gain, and multipliers on each location's fill and ambient light (applied in `Loc.set`). A cool rim light (`rimLight`) sits opposite the sun, a little above, so hulls keep a lit edge on their shadowed side; `setSunDir` moves it. Base exposure is `EXPOSURE` (1.4, was 1.3), scaled by the Settings Brightness slider (50% to 200%, `hardburn.bright`, `setBrightness`).
- **Camera:** pan, zoom and drag-rotation all ease toward a goal each frame. Wheel zoom scales with the wheel's actual delta (trackpads send many small ones), not a fixed step per event.
- **Round 1 of the ChatGPT/Codex review (v73):** How to play no longer says "destroy all six enemy ships" (fleets vary); it states the goal and the turn limit (30, or 15 in a Quick battle). The hover card (`showTooltip`) is clamped inside `safeRect()`, so it never covers the ship panel, weapon buttons, End turn or the log, and it hides when the pointer leaves the canvas for the interface. The busy chip (`#busy`, `updateBusy` in hud.js, driven from `frame()`): while your own move, volley or ability resolves, clicks are still ignored, but after 0.35 s a small "Resolving…" chip shows, and a click meanwhile pulses it ("Enemy turn" during the enemy's turn), so no click goes unanswered.
- **Camera framing (v56, Jon):** "in view" means inside `safeRect()`, the screen less the top bar, fleet lists, ship panel, End turn and log. Selecting a ship pans only as far as needed to bring it in (`keepInView`), and never recentres a ship already in view. A player shot is framed when the target is picked (`frameShot` in `playerAttack`, then a 0.35 s pause so the camera settles first): it pans, and zooms out if needed but never in. Tapping an enemy contact frames it beside the selected ship. AI shots are framed the same way in `fireWeapon` (`state.acting===att`), and each AI ship is kept in view when it activates. The old constant drift toward the acting ship is gone. Any camera input by the player (`cam.touched`) stops AI framing until the next AI turn. `clampToBoard` runs every frame and keeps the board under the safe area (with a margin of 2.5 hexes past the outermost cells since v58; one hex cut edge ships in half when zoomed in), centring it on an axis where the view is wider than the board. It mirrors the near edge for the far one, because a tilted view's far edge lands so far off that it would otherwise push the view off the board. All framing is skipped in simulations. **v68:** the view at the start of an AI turn is saved (`cam.before`) and handed back when the player's turn starts, unless they moved the camera during the AI turn; the usual keep-in-view of their first ship follows. A ship behind the camera (zoomed far in) is centred first, then framed.
- **UI palette (v44, holographic):** accent light blue `--accent #6FD0FF` (interface and the player's side), `--accent-hi #BDEBFF`, red `--red` for the enemy, teal `--cyan #4FE3CC` for shields, ink `#D9F0FF`. Rounded corners (`--r` 8px, `--r-sm` 6px), thin lit edges and a soft glow. Panels are dark rgba glass with **no `backdrop-filter`** (see §6). `COL.player` is the same blue for board highlights; player ships keep their amber livery and amber weapon fire.

## 6. Rendering pipeline and hard-won lessons (read before changing graphics)

**Pipeline:** scene pass (plain HalfFloat target) → `GTAOPass` (High only) → `UnrealBloomPass` → `OutputPass` (Neutral tone mapping plus sRGB) → `SMAAPass` (Medium and High).

**Quality presets** (`QUALITY`; G cycles them; stored in `hardburn.gfx`):

| Preset | Render scale | Shadow map | Ambient occlusion | SMAA |
|---|---|---|---|---|
| High | 2× on Retina, else 1× | 4096 | on | on |
| Medium | 1× | 2048 | off | on |
| Low | 1× | none | off | off |

An automatic step-down triggers if frames average over 40 ms in the first 6 seconds of a battle, unless Jon picked a setting himself.

**Lessons, all confirmed on Jon's hardware:**
1. **Never use multisampled render targets (`samples > 0`).** They render large black rectangles on Apple M2 Max (ANGLE Metal, Chrome and Safari) and on an NVIDIA 4070 Ti. This held even with MSAA isolated to its own scene pass. Headless SwiftShader does not reproduce it. Use SMAA or FXAA instead.
2. **Keep the pixel ratio a whole number.** `applyQuality` floors it, and it runs at startup before the first frame. The early `setPixelRatio` at renderer creation is not floored, but it is overwritten before anything draws. Fractional scales (1.25, 1.5) were suspected in the black-rectangle bug, so route any new pixel-ratio change through `applyQuality`.
3. **No `backdrop-filter`** on panels over the WebGL canvas. It's a known Chrome black-tile trigger.
4. **Color management is on (r152+).**
   - Canvas color textures need `colorSpace = SRGBColorSpace`; `canvasTex(..., srgb)` handles it.
   - Hand-tuned display-space values must go through `toLinear()` (pow 2.2). This covers vertex colors, the nebula and atmosphere shaders, and particle colors.
5. **Lights are physical (r155+).** The sun is 6.5 and ambient 0.55. The environment map comes from PMREM of the sky, a bright sun sphere and the planet, and `scene.environmentIntensity` is 2.2. Flash point lights use `intensity × 4.5`.
6. **Ambient occlusion:** `gtao.overrideVisibility` is patched to hide transparent, shader, sprite, point and line objects, and anything with `userData.noAO`. Its radius scales with camera distance.
7. **Shadows:** the sun's shadow frustum follows `cam.target`, sizes to the zoom level, and snaps to texels (`updateShadowFrustum`). Call `enableShadows(obj)` on new meshes. Basic, shader and transparent materials are skipped automatically.
8. **Warm-up (`warmUp`) renders, not just compiles.** On Metal, pipelines for each blend, depth and shadow combination, and texture uploads, only happen on the first real draw. So the warm-up builds one of every effect, shield and a full wreck, shrinks them to a thousandth at the camera target, and draws two full frames before removing them. Anything new that first appears mid-battle (a new effect, material or blend mode) should be added to it, or it will stutter the first time it shows.
9. **Screen-space labels move by `transform`, never `left`/`top`.** Ship tags and floating damage numbers follow bobbing ships every frame. Moving them with `left`/`top` forced a page layout and a repaint of every tag (with text shadows) each frame: about half the frame time on an M2 Max, and the stutter players saw. They now use `translate3d` on their own compositor layer (`will-change: transform`), and `setTag` writes a style only when it changes. Keep any new per-frame DOM overlay the same way.
10. **Draw calls, not triangles, are the budget.** Each ship was ~200 separate meshes, so 12 ships cost ~2,400 draw calls per pass plus the shadow pass: 23–30 ms a frame zoomed out on an M2 Max, against 8 ms zoomed in where most were culled. `mergeShipParts` now merges each ship's static parts into one mesh per material and shadow setting (the originals stay, hidden, for `breakUpShip`), and `mergeStatic` does the same to each wreck section. Result: ~700 draws for 12 ships and 8 ms zoomed out, pixel-identical. Anything added to a ship's body that animates, is transparent, or changes visibility per frame must be in the skip set, or it will be frozen into the merged mesh.
11. **Ship tags fade with zoom** between radius 20 and 12 instead of switching off at 16, which blinked every tag at once while zooming.
12. **Shaders must never output NaN.** `pow()` with a negative base is undefined and returns NaN on Apple GPUs, and so does anything built on it. One NaN pixel is smeared by `UnrealBloomPass` into a black block: the board around ships flashed black about once a second (1 frame in 70), with the camera still. The culprits were `pow(1.0-t, …)` where `t` interpolated a hair past 1, and `pow(x, 2.0)` on a signed value, in the drive plumes. Clamp every `pow()` base to be non-negative, write squares as multiplications, and cap additive outputs before they reach bloom. Diagnose with the bloom pass disabled: if the flashing stops, it's NaN or Inf from some material.
13. The **close-up detail layer** (`s.fineMesh`, and the wreck `fineMeshes`) only draws within 13 units of the camera.

**URL diagnostics:**
- `?debug` shows a bottom-left overlay with version, live performance over the last half second (fps, average and worst frame, time in game code, draw calls and triangles across all passes), GPU, device pixel ratio, render scale, buffer sizes, feature flags and GL errors. Ask Jon for this overlay when he reports slowness: a slow frame with low game-code time and normal draw calls points at the browser or machine, not the game.
- `?shadows=0`, `?aa=0`, `?ao=0` and `?pr=1` each turn off a single feature to isolate driver problems.

## 7. Testing

**First choice: a real browser on Jon's Mac.** In the Claude Code desktop app, open the page in the built-in browser pane. It runs on the real GPU, so it renders at full speed and can show the driver bugs in §6 that SwiftShader can't.
- **When the game can't start (v70):** the loader in index.html checks for WebGL first and, if there is none, shows a plain full-screen message (turn on hardware acceleration or try another browser) instead of loading the game; a script that fails to load shows a message too. Without this, a browser with no WebGL (an AI reviewer's headless browser, in Jon's case) got a dead menu and errors like `scene is not defined` and `Cannot access 'MAX_ANISO' before initialization`, because render.js stops at its first line (`new THREE.WebGLRenderer`) and nothing it defines ever exists.
- `index.html` loads Three.js from the CDN as an ES module. If `file://` refuses to load it, serve the folder instead: `python3 -m http.server 8000`, then open `http://localhost:8000/`.
- Hard-refresh after every edit, and check that the version on the intro screen matches `GAME_VERSION`.
- Add `?debug` to see GPU, render scale and GL errors. Add `?shadows=0`, `?aa=0`, `?ao=0` or `?pr=1` to isolate a rendering fault.
- Drive the game from the console with the `window.HB` hooks (§3). Wait for `window.HB` to exist before calling them.
- The built-in browser is Chromium only. Anything touching rendering still needs Jon to check Safari and the Windows 4070 Ti machine.

**Fallback: headless, when no GPU browser is available** (for example in a cloud sandbox):
- Run Chromium through Playwright with SwiftShader (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`).
- If the sandbox can't reach the CDN, route `cdn.jsdelivr.net/npm/three@0.169.0/*` to a local `npm pack three@0.169.0` copy.
- Software rendering is slow, around 9 seconds a frame at High. Set `window.__norender = true` so the loop runs logic only, then call `HB.render()` once before each screenshot.
- End evaluate calls with `; 0` so Playwright doesn't await a long promise like `fireWeapon`.
- SwiftShader cannot reproduce GPU-driver bugs (see §6.1). For rendering changes, ask Jon to test with `?debug`.

**Balance simulator.** `await HB.sim({west:[...], east:[...]}, n)` runs `n` AI-vs-AI battles with the real rules and AI, no rendering, the clock stepped in large jumps, both sides at Normal, and the fleets swapping sides every battle to cancel the first-move advantage. It reports the `west` fleet's win rate (draws count half), average turns and survivors. Battles end at the game's own turn limit; `byValue` counts how many were decided on fleet value rather than by destruction.
- Speed: about 0.3 s per battle for 6 v 6, up to 10 s for 23 ships. **The tab must be in front**: a background tab runs many times slower.
- Take balance numbers from 40+ battles per matchup; 40 still carries roughly ±8% noise.
- It returns to the menu when finished.

**Useful scenarios (either setup):**
- AI-vs-AI rounds: `HB.runAITurn('player')`, then `HB.endPlayerTurn()`, at `HB.setTimeScale(10)`.
- Close-ups: set `HB.cam.goal`, `target`, `radius`, `theta` and `phi` directly.
- The explosion sequence: `s.alive = false; HB.explodeShip(s)`.
- Every quality level: `HB.applyQuality('low' | 'medium' | 'high')`.

## 8. Roadmap and ideas discussed

Planned features with full context (scoring and records, multiplayer) live in `BACKLOG.md`. Read it before proposing what to build next, and add new deferred work there rather than here.

- **Path 2, real models:** Jon has the STL files for his ships (free on Printables). The plan:
  1. Simplify them to about 50–150k triangles each.
  2. Compress them (glTF with Draco or meshopt).
  3. Color them to the livery, using per-part materials if the files are split by part, otherwise shader banding with the armor-tile texture.
  4. Align plumes and weapon muzzles to the real geometry.

  This turns the game into a folder of assets, which is still fine on GitHub Pages. **Check each model's Printables license** before publishing. Convert one ship first for Jon to review.
- Balance: after the pacing changes, a full game ran about 20 turns. The opening could be tightened further.
- The hex grid is 2.5D. Ships bob, but movement and combat stay planar.

## 9. Controls (for reference)

- **Mouse:**
  - Click a ship to select it, a hex to move, and an enemy or asteroid to fire.
  - Right-click or Esc cancels.
  - Drag to orbit, Shift-drag to pan, scroll to zoom.
- **Touch devices** get `html.touch` (set in `index.html` from `pointer:coarse`). On touch tablets in landscape (iPad) the command bar is slimmer and stays one row: 44px tap targets, no keyboard hints, no range line on weapon buttons. Phones keep their own layout; desktop is unaffected.
- **Touch:** one finger drags to orbit; two fingers pinch to zoom and drag to pan at the same time; tap to select, move and fire; double-tap a ship to follow it.
  - Double-click a ship to zoom in and follow it.
- **Keys:**
  - 1–3 select a single weapon, F selects all weapons.
  - Q: ability. Tab: next ship. Space: end turn.
  - WASD pans, C centers, Z zooms and follows.
  - M: music. N: effects. G: graphics. H: help. P: menu.
