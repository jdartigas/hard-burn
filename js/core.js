// Laniakea's Edge: utilities, all game data (weapons, abilities, classes, fleets, budgets, presets, AI plans), hex maths.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

/* =====================================================================
   LANIAKEA'S EDGE — turn-based 2.5D fleet engagement
   ===================================================================== */


/* ---------------- utilities ---------------- */
const $ = s => document.querySelector(s);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const lerp = (a,b,t) => a + (b-a)*t;
const rand = (a,b) => a + Math.random()*(b-a);
const pick = arr => arr[Math.floor(Math.random()*arr.length)];
const easeInOut = t => t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
const easeOut = t => 1-Math.pow(1-t,3);
const linear = t => t;
// Two kinds of randomness. gameRand() decides outcomes (hits, interceptions, damage, the AI's deliberate noise) and
// is seeded from the battle seed in setupBattle, so the same seed and the same orders replay the same battle, which
// replays, bug reports, online play and a verifiable leaderboard all depend on. Math.random() and rand() are for
// looks only (sparks, bobbing, sounds, effect paths): nothing cosmetic may ever call gameRand(), or how an
// explosion looks would change who wins.
let gameRng=null;
function seedGameRand(seed){ gameRng=mulberry32(((seed>>>0) ^ 0x9E3779B9)>>>0); }
function gameRand(){ if(!gameRng) seedGameRand(1); return gameRng(); }
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const store = {
  get(k,d){ try{ const v = localStorage.getItem('hardburn.'+k); return v===null?d:JSON.parse(v);}catch(e){return d;} },
  set(k,v){ try{ localStorage.setItem('hardburn.'+k, JSON.stringify(v)); }catch(e){} }
};
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- data ---------------- */
const WEAPONS = {
  pulse:  {name:'Pulse cannons', kind:'pulse', range:4, opt:2, acc:82, fall:6, dmg:7,  shots:3, sh:1.6, hu:0.7, pierce:0,   reload:1},
  pulseH: {name:'Pulse battery', kind:'pulse', range:4, opt:2, acc:82, fall:6, dmg:8,  shots:4, sh:1.6, hu:0.7, pierce:0,   reload:1},
  beam:   {name:'Beam laser',    kind:'beam',  range:5, opt:2, acc:95, fall:8, dmg:24, shots:1, sh:1.15,hu:1.0, pierce:0.2, reload:1},
  beamH:  {name:'Heavy beam',    kind:'beam',  range:6, opt:3, acc:95, fall:7, dmg:34, shots:1, sh:1.15,hu:1.0, pierce:0.2, reload:1},
  // v50 (Jon): railguns have no range limit. A slug never slows; what limits it is time of flight, which lets a target
  // dodge. Inside `reach` (the old range) accuracy is as it always was; past it, each extra hex also costs `fall` plus
  // the target's evasion times `dodge`, so capitals are hit from anywhere and nimble hulls are nearly safe far out.
  railL:  {name:'Light railgun', kind:'rail',  range:Infinity, reach:7, opt:3, acc:86, fall:5, dodge:0.12, dmg:18, shots:1, sh:0.6, hu:1.1, pierce:0.6, reload:1},
  rail:   {name:'Railgun',       kind:'rail',  range:Infinity, reach:9, opt:4, acc:88, fall:4, dodge:0.12, dmg:30, shots:1, sh:0.6, hu:1.1, pierce:0.7, reload:1},
  spinal: {name:'Spinal railgun',kind:'rail',  range:Infinity,reach:12,opt:6, acc:85, fall:3, dodge:0.12, dmg:62, shots:1, sh:0.6, hu:1.1, pierce:0.8, reload:2},
  missL:  {name:'Missile rack',  kind:'missile',range:8, acc:92, dmg:13, shots:2, sh:1, hu:1.0, pierce:0.3, reload:1, ammo:4, guided:true, pdcF:1.0},
  torp:   {name:'Torpedo',       kind:'missile',range:10,acc:90, dmg:44, shots:1, sh:1, hu:1.15,pierce:0.5, reload:1, ammo:3, guided:true, pdcF:0.85, big:true},
  torpH:  {name:'Torpedo bay',   kind:'missile',range:10,acc:90, dmg:36, shots:2, sh:1, hu:1.15,pierce:0.5, reload:1, ammo:3, guided:true, pdcF:0.85, big:true},
  wing:   {name:'Strike wing',   kind:'fighter',range:12,acc:90, dmg:9,  shots:6, sh:1, hu:1.0, pierce:0.6, reload:2, guided:true, pdcF:0.45},
  // v32: Fast Attack Ship; v34: Electronic warfare ship's self-defence beam
  beamL:  {name:'Light beam',    kind:'beam',  range:5, opt:2, acc:95, fall:8, dmg:14, shots:1, sh:1.15,hu:1.0, pierce:0.2, reload:1},
  pdcGun: {name:'PDC guns',     kind:'pdc',   range:2, opt:1, acc:78, fall:12, dmg:8, shots:10, sh:0.5, hu:1.0, pierce:0.5, reload:1},   // v74: shots set per ship from PDC_GUNS
  strikeM:{name:'Strike missiles',kind:'missile',range:9, acc:92, dmg:32, shots:2, sh:1, hu:1.0, pierce:0.35,reload:1, ammo:2, guided:true, pdcF:0.7},
};
const ABIL = {
  burn:      {name:'Hard burn',        desc:'+3 movement this turn', reload:3},
  ecm:       {name:'ECM screen',       desc:'Allies within 2 hexes gain +20 evasion until your next turn', reload:3},
  overcharge:{name:'Shield overcharge',desc:'Restore 60% of maximum shields', reload:3},
  pdsurge:   {name:'Point defense surge', desc:'Allies within 2 hexes intercept missiles 60% better until your next turn', reload:3},
  brace:     {name:'Brace for impact', desc:'Double armor and 25% less hull damage until your next turn', reload:3},
  // targeted abilities: `target` says who they're aimed at, `range` how far
  repair:    {name:'Repair drones',    desc:'Restore 45 hull to an ally within 3 hexes', reload:3, targeted:true, target:'ally', range:3, amount:45, verb:'repair'},
  resupply:  {name:'Resupply',         desc:'Ally within 2 hexes: restore 60 hull and half its shields, and reload one salvo in each missile launcher', reload:2, targeted:true, target:'ally', range:2, amount:60, verb:'resupply'},
  blackout:  {name:'Sensor blackout',  desc:'Enemy within 8 hexes: no missiles or fighters, and -25 accuracy, until your next turn', reload:3, targeted:true, target:'enemy', range:8, verb:'black out'},
  ambush:    {name:'Ambush',           desc:'+2 movement, and missiles fired this turn are half as likely to be intercepted', reload:3},
};
const CLASSES = {
  patrol:   {label:'Patrol craft',  role:'Stealth hunter',         m:75, cost:20, hull:45,  armor:1, shield:15, regen:8,  mp:7, ev:32, pdc:0.20, weapons:['pulse','missL'],        ability:'ecm',        len:1.8, y:0.7},
  corvette: {label:'Corvette',      role:'Fast skirmisher',        m:145, cost:40, hull:70,  armor:3, shield:25, regen:10, mp:6, ev:24, pdc:0.30, weapons:['railL','missL'],        ability:'burn',       len:2.3, y:0.75},
  frigate:  {label:'Frigate',       role:'Escort, point defense',  m:185, cost:60, hull:95,  armor:4, shield:35, regen:12, mp:5, ev:18, pdc:0.56, weapons:['beam','missL'],         ability:'pdsurge',    len:2.55, y:0.8, pdnet:true},
  destroyer:{label:'Destroyer',     role:'Line combatant',         m:230, cost:140, hull:140, armor:6, shield:45, regen:15, mp:4, ev:12, pdc:0.40, weapons:['rail','pulseH','torp'], ability:'overcharge', len:2.95, y:0.85},
  cruiser:  {label:'Heavy cruiser', role:'Long-range artillery',   m:290, cost:250, hull:230, armor:9, shield:70, regen:18, mp:3, ev:6,  pdc:0.50, weapons:['spinal','beamH','torpH'],ability:'brace',      len:3.7, y:0.95},
  fastattack:{label:'Fast attack ship', role:'Ambush striker',      m:100, cost:50, hull:55,  armor:1, shield:16, regen:6,  mp:8, ev:30, pdc:0.15, weapons:['strikeM','pulse'],     ability:'ambush',     len:1.9, y:0.7},
  dreadnought:{label:'Dreadnought',  role:'Capital of the line',    m:390, cost:480, hull:400, armor:12,shield:120,regen:22, mp:2, ev:2,  pdc:0.60, weapons:['spinal','railL','railL','beamH','beamH','pulse'], ability:'brace', len:4.6, y:1.1},
  // v34: support classes. `passive` is shown in the ship panel and builder; the effects live in the rules.
  ewar:     {label:'Electronic warfare ship', role:'Jamming and targeting', m:215, cost:90, hull:60, armor:2, shield:30, regen:10, mp:5, ev:22, pdc:0.30, weapons:['beamL'], ability:'blackout', len:2.4, y:0.8, jam:true,
             passive:'Jams enemies within 4 hexes (-10 accuracy, -15 with missiles) and gives allies within 3 hexes +8 accuracy'},
  tender:   {label:'Repair tender', role:'Repair and resupply',    m:250, cost:70, hull:150, armor:3, shield:50, regen:12, mp:3, ev:8,  pdc:0.35, weapons:['pulse'], ability:'resupply', len:3.0, y:0.9, fieldRepair:10, fieldRange:2,
             passive:'Field repairs: allies within 2 hexes regain 10 hull each turn'},
  carrier:  {label:'Fleet carrier', role:'Strike and support',     m:275, cost:150, hull:250, armor:7, shield:80, regen:20, mp:3, ev:4,  pdc:0.55, weapons:['wing','pulse'],         ability:'repair',     len:3.3, y:1.0},
};
// v57 (Jon): what each class is for, in words, for the fleet builder, the ship viewer and the help chart. `best` is a
// short phrase; `purpose` two or three sentences. The numbers they describe live in CLASSES, WEAPONS and ABIL.
const CLASS_INFO = {
  patrol:     {best:'Screening the fleet: its ECM screen makes nearby ships hard to hit',
               purpose:'The smallest hull in the fleet and the hardest to pin down. It runs ahead of the line, harries with its pulse turret and missiles, and its ECM screen makes the ships around it much harder to hit. It cannot take a beating.'},
  fastattack: {best:'Opening a fight with a missile ambush',
               purpose:'An oversized drive with a missile pod on each flank. It closes fast, and when it springs an ambush its strike missiles are half as likely to be shot down. Two salvos, then it is down to its pulse turret.'},
  corvette:   {best:'Getting into position fast and finishing off damaged ships',
               purpose:'A quick, well-armed skirmisher. Twin light railguns reach anywhere on the board, its missiles finish off weakened targets, and a hard burn throws it three hexes further when it needs to flank or escape.'},
  frigate:    {best:'Shooting down missiles aimed at the ships around it',
               purpose:'The fleet\'s escort. Its point defense covers nearby allies as well as itself, and a point defense surge makes that screen far stronger for a turn. Twin beam projectors under the bow make it dangerous up close.'},
  ewar:       {best:'Making every enemy shot worse, and silencing its most dangerous ship',
               purpose:'Nearly unarmed, and often the most valuable ship in the fleet. It jams enemies within 4 hexes and sharpens the aim of allies within 3, and its sensor blackout stops a chosen enemy firing missiles or fighters for a turn. The enemy will hunt it first.'},
  destroyer:  {best:'Trading blows at medium range',
               purpose:'The line combatant. A keel railgun, a heavy pulse battery and torpedoes give it an answer at every range, and when its shields fail it can overcharge them back to strength mid-fight.'},
  tender:     {best:'Keeping damaged ships in the fight and rearming missile boats',
               purpose:'A working ship, lightly armed. Ships near it repair a little every turn, and its resupply patches up one ally and reloads its missile launchers: the only way to rearm mid-battle.'},
  cruiser:    {best:'Hitting hard from long range',
               purpose:'Long-range artillery. Its spinal railgun reaches across the board, and heavy beams and a torpedo bay take over closer in. Slow and easy to hit, it braces for impact when it has to take punishment.'},
  carrier:    {best:'Striking anywhere on the board, and repairing its escorts',
               purpose:'A flight deck over a heavy hull. Its strike wing reaches 12 hexes and is hard to intercept, though it needs a turn to rearm after each sortie. Repair drones patch up allies within 3 hexes.'},
  dreadnought:{best:'Absorbing punishment and out-gunning anything at range',
               purpose:'The capital of the line. Six weapons, the heaviest armor and shields afloat, and almost no evasion: it does not dodge, it endures. Brace for impact makes it harder still to kill.'},
};
const ORDER = ['fastattack','patrol','corvette','ewar','frigate','destroyer','tender','cruiser','carrier','dreadnought'];   // lightest to heaviest
// Each class's model seed. Fixed, so adding a class to ORDER never reshuffles how the existing ships look.
const MODEL_SEED = { patrol:0, corvette:1, frigate:2, destroyer:3, cruiser:4, carrier:5, fastattack:6, dreadnought:7, tender:8, ewar:9 };
// Electronic warfare: enemy jamming field, and the targeting uplink for allies (see accAdj in rules.js)
const JAM = { range:4, direct:10, guided:15, uplink:3, boost:8, blackout:25 };
const NAMES = {
  player:{carrier:'Ardent Hand', cruiser:'Tethys Resolve', destroyer:'Iron Vesper', frigate:'Calloway', corvette:'Little Wren', patrol:'Kestrel', fastattack:'Swift Remit', dreadnought:'Unbending Oath', tender:'Patient Hands', ewar:'Quiet Choir'},
  enemy: {carrier:'Maw of Kerr', cruiser:'Scalding Choir', destroyer:'Rustjaw', frigate:'Quiet Knife', corvette:'Gnat', patrol:'Needle', fastattack:'Hook', dreadnought:'Iron Tithe', tender:'Scrapmother', ewar:'Hiss'},
};
// Home cell per class on the player's side; the enemy's are mirrored through the centre. The first ship of each
// class deploys here, so the classic one-of-each fleet lines up exactly as it always has. Extra copies take the
// nearest free cell to their class's home (see deployFleet).
const DEPLOY = { carrier:[-7,0], cruiser:[-5,-2], destroyer:[-6,2], frigate:[-3,-4], corvette:[-7,4], patrol:[-5,5], fastattack:[-1,-6], dreadnought:[-6,-3], tender:[-8,2], ewar:[-4,1] };
const DEPLOY_MAX_X = -2.5;   // deployment zone: cells whose world x (q + r/2) is at or west of this
const MAX_FLEET = 12;
// A battle ends after this many turns. If both fleets are still in it, the side with more fleet value left wins:
// each surviving ship's cost times its fraction of hull remaining. Without a limit a standoff never ends.
const BATTLE_TURNS = 30;
// v74 (Jon): round 2 of the review roadmap. Two fixes for fights that dragged (Frigate mirrors averaged 19 turns
// because shields fully regenerate every turn):
// - Shields under fire: a ship damaged during the other side's turn regenerates only `regen` of its shields when its
//   own turn begins.
// - PDC guns: every ship can turn its point defense on an enemy at knife range (WEAPONS.pdcGun, added to each ship
//   outside its class loadout). Rounds per volley scale with the ship's point defense rating. A ship that fires them
//   has no point defense against missiles until its next turn. Never part of "All weapons".
const UNDER_FIRE = { regen:0.5, capital:0.75, capitalHull:200 };   // v77: capitals (max hull 200+) keep 75%
// v76 (Jon): a dying ship's blast hits every ship within `radius` hexes, friend or foe, for `share` of the dying ship's
// max hull, through shields and armor like any hit (`pierce` of the armor ignored). A blast can chain into another.
const SPLASH = { share:0.12, radius:1, pierce:0.3 };
const PDC_GUNS = { perRating:18, min:3 };
// v60 (Jon): Quick battle, four ships a side. Both sides field the same lineup, picked at random: at this size equal
// points are far from equal fights (measured at about 220 points, a Destroyer group won 67-100% of its matchups), so a
// mirror is the fair test and the lineup and location supply the variety. Homes move `shift` hexes toward the centre but
// never past world x = `maxX`, so the fleets start three to four hexes apart, and the turn limit is `turns`. Measured
// mirror lengths (10 battles each): Line 9.9 turns, Electronic 11.0, Strike 12.1, Raiders 7.3. A Repair column and an
// Escort group ran 17-18 turns and were dropped.
const QUICK = { turns:15, shift:3, maxX:-1.5, fleets:[
  {id:'line',    name:'Line patrol',       fleet:['destroyer','corvette','patrol','patrol']},
  {id:'ewar',    name:'Electronic screen', fleet:['ewar','frigate','corvette','fastattack']},
  {id:'strike',  name:'Strike group',      fleet:['destroyer','fastattack','corvette','patrol']},
  {id:'raiders', name:'Raiders',           fleet:['fastattack','fastattack','corvette','patrol']} ]};
// The Frigate's escort screen: allies within `radius` hexes intercept with `share` of the Frigate's point defense
// (if that beats their own). Classes with pdnet:true provide it.
// stack: false = the stronger of own and screen counts; true = both fire at the incoming round (1-(1-a)(1-b)), so an
// escort also helps ships whose own point defense beats it (the capitals)
const PD_NET = { share:1.0, radius:3, stack:false };   // v28: share and radius were 0.9 and 2 (see BACKLOG.md, Frigate)
// Fleet budgets in points; `cost` on each class is what a hull spends. Prices were measured with HB.sim, not
// derived from stats: see BACKLOG.md item 0 for the method and results. The classic fleet costs 660.
const BUDGETS = { skirmish:330, standard:660, large:1000 };
// Quick play fleets. Each fits the Standard budget and was measured against every other one with HB.sim;
// results are in BACKLOG.md item 0. Changing a fleet here changes that balance: re-measure.
const PRESETS = [
  {id:'classic',  name:'Classic',          desc:'One of every class. The original engagement.',
   fleet:['patrol','corvette','frigate','destroyer','cruiser','carrier']},
  {id:'gunline',  name:'Gunline',          desc:'Two heavy cruisers behind a light screen. Outguns carriers; torpedo boats that get close are its problem.',
   fleet:['cruiser','cruiser','frigate','corvette','corvette','patrol']},
  {id:'swarm',    name:'Swarm',            desc:'Twelve light hulls. Too many targets for big guns to keep up with.',
   fleet:['destroyer','frigate','frigate','frigate','frigate','corvette','corvette','corvette','corvette','corvette','corvette','patrol']},
  {id:'carrier',  name:'Carrier group',    desc:'Three carriers and their escorts. Strike wings reach anywhere on the board, but heavy guns punish them.',
   fleet:['carrier','carrier','carrier','frigate','frigate','corvette','patrol']},
  {id:'wolfpack', name:'Torpedo wolfpack', desc:'Destroyers and corvettes, heavy on missiles. Tears into big ships once it closes.',
   fleet:['destroyer','destroyer','destroyer','corvette','corvette','corvette','corvette','corvette','patrol','patrol']},
];
// How the AI spends a budget when it builds its own fleet (the "AI build" enemy). Each plan is a wish list it cycles
// through, buying each class it can still afford, until nothing more fits or the fleet is full. At the Standard
// budget, Balanced, Gunline and Wolfpack come out as the Classic, Gunline and Wolfpack presets.
const AI_PLANS = {
  balanced:{label:'Balanced', wish:['cruiser','destroyer','frigate','carrier','corvette','patrol']},
  gunline: {label:'Gunline',  wish:['cruiser','cruiser','frigate','corvette','corvette','patrol']},
  swarm:   {label:'Swarm',    wish:['destroyer','frigate','frigate','corvette','corvette','corvette','patrol']},
  carrier: {label:'Carriers', wish:['carrier','carrier','frigate','carrier','corvette','frigate','patrol']},
  wolfpack:{label:'Wolfpack', wish:['destroyer','corvette','corvette','destroyer','corvette','patrol']},
  dreadnought:{label:'Dreadnought', wish:['dreadnought','frigate','frigate','corvette','patrol']},   // v32; below 480 it builds escorts only
  raiders: {label:'Raiders',  wish:['fastattack','fastattack','destroyer','fastattack','fastattack','corvette']},
  support: {label:'Support',  wish:['cruiser','tender','destroyer','ewar','frigate','corvette','patrol']},   // v34
};
function aiBuild(budget, plan){
  const wish=AI_PLANS[plan].wish, f=[]; let left=budget, added=true;
  while(added && f.length<MAX_FLEET){ added=false;
    for(const c of wish){ if(f.length>=MAX_FLEET) break; if(CLASSES[c] && CLASSES[c].cost<=left){ f.push(c); left-=CLASSES[c].cost; added=true; } } }
  return f;
}
const fleetCost = list => list.reduce((a,c)=>a+(CLASSES[c]?CLASSES[c].cost:0),0);
// raw damage a class can put out in a turn with every weapon firing (before accuracy, range, shields and armor)
const classDpt = cls => CLASSES[cls].weapons.reduce((a,k)=>{ const w=WEAPONS[k]; return a+w.dmg*w.shots/w.reload; },0);
const BUDGET_LABEL = { skirmish:'Skirmish', standard:'Standard', large:'Large' };
// "Heavy cruiser ×2, Frigate, Patrol craft ×2", heaviest first
function fleetSummary(list){
  const n={}; list.forEach(c=>n[c]=(n[c]||0)+1);
  return Object.keys(n).sort((a,b)=>ORDER.indexOf(b)-ORDER.indexOf(a)).map(c=>CLASSES[c].label+(n[c]>1?' ×'+n[c]:'')).join(', ');
}        // ships per side; the zone holds 73 cells, but spacing and the board read poorly past this
const CLASSIC_FLEET = ['patrol','corvette','frigate','destroyer','cruiser','carrier'];   // one of each original class, the original game
const DIFF = {
  easy:  {acc:-12, hull:0.9,  caution:0.15, aggr:1.0, focus:0.0, noise:28},
  normal:{acc:0,   hull:1.0,  caution:0.45, aggr:1.0, focus:0.7, noise:5},
  hard:  {acc:8,   hull:1.15, caution:0.7,  aggr:1.1, focus:1.3, noise:0},
};
const SHIP_SCALE = 1.25;
// Ship sizes (v47, Jon): each class's `m` is its length in metres, bow tip to drive nozzle, at 1 model unit = 80 m.
// createShip scales the built model so it measures exactly that; `len` stays the model's own size, used inside it.
const M_PER_UNIT = 80;
// player is the interface accent (v44 holographic blue); ships keep their own amber livery in shipMaterials
const COL = { player:0x6FD0FF, enemy:0xE0533F, cyan:0x62C9E6, green:0x8FD17A };

/* ---------------- hex math (axial, pointy-top) ---------------- */
const HEX = 1.9, SQ3 = Math.sqrt(3), MAP_R = 9, MAP_ROWS = 6;
const DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const key = (q,r) => q+','+r;
const hdist = (a,b) => { const dq=a.q-b.q, dr=a.r-b.r; return (Math.abs(dq)+Math.abs(dr)+Math.abs(dq+dr))/2; };
function hexRound(q,r){ const s=-q-r; let rq=Math.round(q), rr=Math.round(r); const rs=Math.round(s);
  const dq=Math.abs(rq-q), dr=Math.abs(rr-r), ds=Math.abs(rs-s);
  if(dq>dr && dq>ds) rq=-rr-rs; else if(dr>ds) rr=-rq-rs; return {q:rq, r:rr}; }
function hexToWorld(q,r,y=0){ return new THREE.Vector3(HEX*SQ3*(q+r/2), y, HEX*1.5*r); }
function worldToHex(x,z){ return hexRound((SQ3/3*x - z/3)/HEX, (2/3*z)/HEX); }
function hexLine(a,b){ const n=hdist(a,b), out=[]; for(let i=0;i<=n;i++){ const t=n?i/n:0; out.push(hexRound(a.q+(b.q-a.q)*t+1e-6, a.r+(b.r-a.r)*t+2e-6)); } return out; }
function hexCorners(radius){ const pts=[]; for(let i=0;i<6;i++){ const a=Math.PI/180*(60*i-30); pts.push([Math.cos(a)*radius, Math.sin(a)*radius]); } return pts; }

