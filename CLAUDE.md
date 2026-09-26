# Hard Burn — project guide for Claude Code

Turn-based 2.5D space fleet battle in the browser, built with Three.js/WebGL. The player commands six ships against an AI fleet of six on a hex grid strewn with destructible asteroids. The ship designs follow The Expanse, modeled on the owner's painted 3D-printed miniatures.

- **Owner:** Jon. He prefers concise answers and hard-refreshes to test.
- **Repo:** https://github.com/jdartigas/hard-burn (default branch `main`).
- **Live:** https://jdartigas.github.io/hard-burn/ (GitHub Pages, static).
- **Version:** the current version is `GAME_VERSION` in the script. It shows on the intro screen and in the pause menu.

---

## 1. Repo layout and deployment

- The whole game is **one self-contained `index.html`**: roughly 2,370 lines of inline CSS and one `<script type="module">`. There is no build step, no package.json and no bundler.
- **Three.js r169** loads from jsDelivr through an import map:
  - `three` → `https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js`
  - `three/addons/` → `.../three@0.169.0/examples/jsm/`
  - Addons used: `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `GTAOPass`, `OutputPass`, `Pass`/`FullScreenQuad`, `CopyShader`, `SMAAPass`, `mergeGeometries`.
  - Everything is spread into a single `THREE` object: `const THREE = { ...THREE_NS, EffectComposer, ... }`. Code calls `THREE.GTAOPass` and so on, and `window.THREE` is set for debugging.
- **Fonts:** Google Fonts, Saira Extra Condensed and Saira Semi Condensed.
- **Deploy:** commit `index.html` to the repo root on `main`. GitHub Pages serves it, so **pushing to `main` updates the live site.**
- The local folder `~/Desktop/Hard Burn` is not a git checkout. Before committing, clone the repo or `git init` there and add `origin`, and check that the local `index.html` matches what's on `main` first.
- **No assets on disk.** Every texture, model, sound and piece of music is generated procedurally at runtime.
- Splitting into modules is fine if it helps, but keep it build-free and static-hostable. The single file is not why anything has broken so far.

## 2. Release conventions

- **Never push to `main` without Jon's OK.** It is the live site. Committing locally is fine.
- **Bump `GAME_VERSION`** (near the top of the script) on every change you ship. Jon uses it to confirm he isn't looking at a cached copy.
- Keep the game working at every quality setting on Apple Silicon (M2 Max, Chrome and Safari) and on Windows with an NVIDIA 4070 Ti. Read §6 before touching rendering.
- `localStorage` keys use the prefix `hardburn.`: `sound`, `music`, `diff`, `gfx`. Always go through the `store` helper, which wraps `localStorage` in try/catch.

## 3. Code map (sections appear in this order in the script)

The script has almost no section banners, so find a section by grepping for one of its names below (for example `function hitCore`, `const CLASSES`).

| Section | What's there |
|---|---|
| utilities | `$`, `clamp`, `lerp`, `rand`, `mulberry32` (seeded RNG), `store` |
| data | `WEAPONS`, `ABIL`, `CLASSES`, `ORDER`, `NAMES`, `DEPLOY`, `DEPLOY_MAX_X`, `MAX_FLEET`, `CLASSIC_FLEET`, `DIFF`, `SHIP_SCALE=1.25`, `COL` |
| hex math | Axial pointy-top hexes, `HEX=1.9`, `MAP_R=9`, `MAP_ROWS=6`, `hexToWorld`, `worldToHex`, `hdist`, `hexLine` |
| audio | `Sound`: Web Audio synthesized effects plus a generative cinematic score, with music and effects on separate gains |
| renderer and scene | Renderer, composer, `MSAARenderPass` (now just a plain scene pass), lights, `updateShadowFrustum`, `enableShadows`, `QUALITY` presets, URL diagnostics |
| procedural textures | `canvasTex`, `panelTexture`, `glowTex` |
| environment | Nebula sky shader, stars, sun, gas giant with atmosphere, PMREM environment map |
| particles | `Particles`: one additive `Points` pool of 6,000 with `emit`/`burst`/`update` |
| timing | `tween`, `wait`, `after`, `addFx`. All scaled by `timeScale` and driven by the frame loop, not `setTimeout` |
| board | Hex cells, grid lines, highlight tiles (`InstancedMesh`), selection rings, path line |
| asteroids | `RockNoise`, `makeRockGeometry` (about 12.5k triangles, craters, fractures), `rockMat` with shader micro-detail, `makeRockTarget`, `destroyRock`, `generateTerrain` |
| ship models | `armorTextures` (generated color, normal and packed AO/rough/metal maps), `shipMaterials`, `deckGeometry`, `buildShip` (per-class builders, greebles, conduits, close-up detail layer) |
| game state | `state`, `createShip`, `shipAt`, `weaponReady` |
| rules | `hasLOS`, `hitCore`, `hitChance`, `interceptChance`, `applyDamage`, `expected`, `reachable`, `pathTo` |
| FX | `fxRail`, `fxBeam`, `fxPulse`, `fxGuided`, `impactFx`, `floatText`, `flash` (pooled point lights), `addShake` |
| destruction | `DebrisKit`, `breakUpShip`, `updateWrecks`, `clearWrecks`, `explodeShip` |
| combat | `fireWeapon`, `destroyShip`, `fireAll`, `useAbility`, `moveShip` |
| AI | `scoreAttack`, `threatAt`, `evalCell`, `aiShip`, `runAITurn` |
| turn flow | `beginSideTurn`, `startPlayerTurn`, `endPlayerTurn`, `checkEnd`, `showEnd` |
| player actions and HUD | `select`, `recomputeHighlights`, `playerAttack`, `playerMove`, `updateHUD`, `updateHover` |
| camera and input | Orbit camera `cam`, `MIN_ZOOM=3.5`, follow and zoom (`zoomTo`, the Z key, double-click), pointer, pinch and keys |
| setup | `clearBattle`, `setupBattle`, `startGame`, `toMenu` |
| main loop | `frame()`, `debugTick`, `onResize`, `applyQuality`, `cycleQuality` |

`window.HB` exposes test hooks: `render`, `applyQuality`, `state`, `cam`, `board`, `wrecks`, `explodeShip`, `destroyRock`, `fireWeapon`, `runAITurn`, `endPlayerTurn`, `startGame`, `setTimeScale` and more.

## 4. Game design

**Fleets.** A fleet is a list of class keys, duplicates allowed, up to `MAX_FLEET` (12) per side, and the two sides can differ. `startGame({player:[...], enemy:[...]})` starts one; with no argument it replays the last fleets, and the default is the classic one of each class. There is no fleet-building screen yet (see `BACKLOG.md` item 0). The player's fleet is on the west side, the enemy's on the east.
- **Deployment** (`deployFleet`): the first ship of each class takes its `DEPLOY` home cell, so the classic fleet lines up as it always has. Extra copies take the nearest free cell west of `DEPLOY_MAX_X`, keeping a one-hex gap where possible. The enemy's cells are mirrored through the centre, and terrain keeps every deployment cell clear.
- **Duplicates** are named with numerals (Iron Vesper II) and carry hull numbers like 537-2.

| Class | Hull | Armor | Shield (regen) | Move | Evasion | PD | Weapons | Ability |
|---|---|---|---|---|---|---|---|---|
| Patrol craft | 45 | 1 | 15 (+8) | 7 | 32 | .20 | Pulse, missiles | ECM screen |
| Corvette | 70 | 3 | 25 (+10) | 6 | 24 | .30 | Light railgun, missiles | Hard burn |
| Frigate | 95 | 4 | 35 (+12) | 5 | 18 | .45 (lends 90% of it within 2 hexes) | Beam, missiles | PD surge |
| Destroyer | 140 | 6 | 45 (+15) | 4 | 12 | .40 | Railgun, pulse battery, torpedo | Shield overcharge |
| Heavy cruiser | 230 | 9 | 70 (+18) | 3 | 6 | .50 | Spinal railgun, heavy beam, torpedo bay | Brace for impact |
| Fleet carrier | 250 | 7 | 80 (+20) | 3 | 4 | .55 | Strike wing, pulse | Repair drones |

**Turn.** Each ship can move up to its movement allowance, fire each ready weapon once, and use its ability if charged, in any order. Then the AI takes its turn.

**Hit chance, direct fire (pulse, beam, rail).** `acc − max(0, dist − opt) × fall − target evasion`. Subtract 15 if the target is in debris and 20 if it's under ECM. Add the difficulty modifier (enemy −12 on Easy, +8 on Hard; player +5 on Easy). Clamp to 5–95. Direct fire needs line of sight, and asteroids block it.

**Hit chance, guided (missiles, torpedoes, fighters).** `acc − evasion/2`, minus 5 in debris and 25 under ECM. Ignores range falloff and line of sight. Point defense can then intercept each hit: `pdc × pdcF`, capped at 0.8.
- A ship's `pdc` is its own value or 90% of any Frigate within 2 hexes, whichever is higher.
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
- **UI palette:** amber `#E9A53B`, red `#E0533F`, cyan `#62C9E6`, ink `#DCE2E6`. Panels are solid rgba with **no `backdrop-filter`** (see §6).

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
8. The **close-up detail layer** (`s.fineMesh`, and the wreck `fineMeshes`) only draws within 13 units of the camera.

**URL diagnostics:**
- `?debug` shows a bottom-left overlay with version, GPU, device pixel ratio, render scale, buffer sizes, feature flags and GL errors.
- `?shadows=0`, `?aa=0`, `?ao=0` and `?pr=1` each turn off a single feature to isolate driver problems.

## 7. Testing

**First choice: a real browser on Jon's Mac.** In the Claude Code desktop app, open the page in the built-in browser pane. It runs on the real GPU, so it renders at full speed and can show the driver bugs in §6 that SwiftShader can't.
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
  - Double-click a ship to zoom in and follow it.
- **Keys:**
  - 1–3 select a single weapon, F selects all weapons.
  - Q: ability. Tab: next ship. Space: end turn.
  - WASD pans, C centers, Z zooms and follows.
  - M: music. N: effects. G: graphics. H: help. P: menu.
