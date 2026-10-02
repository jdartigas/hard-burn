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
  railL:  {name:'Light railgun', kind:'rail',  range:7, opt:3, acc:86, fall:5, dmg:18, shots:1, sh:0.6, hu:1.1, pierce:0.6, reload:1},
  rail:   {name:'Railgun',       kind:'rail',  range:9, opt:4, acc:88, fall:4, dmg:30, shots:1, sh:0.6, hu:1.1, pierce:0.7, reload:1},
  spinal: {name:'Spinal railgun',kind:'rail',  range:12,opt:6, acc:85, fall:3, dmg:62, shots:1, sh:0.6, hu:1.1, pierce:0.8, reload:2},
  missL:  {name:'Missile rack',  kind:'missile',range:8, acc:92, dmg:13, shots:2, sh:1, hu:1.0, pierce:0.3, reload:1, ammo:4, guided:true, pdcF:1.0},
  torp:   {name:'Torpedo',       kind:'missile',range:10,acc:90, dmg:44, shots:1, sh:1, hu:1.15,pierce:0.5, reload:1, ammo:3, guided:true, pdcF:0.85, big:true},
  torpH:  {name:'Torpedo bay',   kind:'missile',range:10,acc:90, dmg:36, shots:2, sh:1, hu:1.15,pierce:0.5, reload:1, ammo:3, guided:true, pdcF:0.85, big:true},
  wing:   {name:'Strike wing',   kind:'fighter',range:12,acc:90, dmg:9,  shots:6, sh:1, hu:1.0, pierce:0.6, reload:2, guided:true, pdcF:0.45},
  // v32: Fast Attack Ship; v34: Electronic warfare ship's self-defence beam
  beamL:  {name:'Light beam',    kind:'beam',  range:5, opt:2, acc:95, fall:8, dmg:14, shots:1, sh:1.15,hu:1.0, pierce:0.2, reload:1},
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
  patrol:   {label:'Patrol craft',  role:'Stealth hunter',         cost:20, hull:45,  armor:1, shield:15, regen:8,  mp:7, ev:32, pdc:0.20, weapons:['pulse','missL'],        ability:'ecm',        len:1.8, y:0.7},
  corvette: {label:'Corvette',      role:'Fast skirmisher',        cost:40, hull:70,  armor:3, shield:25, regen:10, mp:6, ev:24, pdc:0.30, weapons:['railL','missL'],        ability:'burn',       len:2.3, y:0.75},
  frigate:  {label:'Frigate',       role:'Escort, point defense',  cost:60, hull:95,  armor:4, shield:35, regen:12, mp:5, ev:18, pdc:0.56, weapons:['beam','missL'],         ability:'pdsurge',    len:2.55, y:0.8, pdnet:true},
  destroyer:{label:'Destroyer',     role:'Line combatant',         cost:140, hull:140, armor:6, shield:45, regen:15, mp:4, ev:12, pdc:0.40, weapons:['rail','pulseH','torp'], ability:'overcharge', len:2.95, y:0.85},
  cruiser:  {label:'Heavy cruiser', role:'Long-range artillery',   cost:250, hull:230, armor:9, shield:70, regen:18, mp:3, ev:6,  pdc:0.50, weapons:['spinal','beamH','torpH'],ability:'brace',      len:3.7, y:0.95},
  fastattack:{label:'Fast attack ship', role:'Ambush striker',      cost:50, hull:55,  armor:1, shield:16, regen:6,  mp:8, ev:34, pdc:0.15, weapons:['strikeM','pulse'],     ability:'ambush',     len:1.9, y:0.7},
  dreadnought:{label:'Dreadnought',  role:'Capital of the line',    cost:480, hull:400, armor:12,shield:120,regen:22, mp:2, ev:2,  pdc:0.60, weapons:['spinal','railL','railL','beamH','beamH','pulse'], ability:'brace', len:4.6, y:1.1},
  // v34: support classes. `passive` is shown in the ship panel and builder; the effects live in the rules.
  ewar:     {label:'Electronic warfare ship', role:'Jamming and targeting', cost:90, hull:60, armor:2, shield:30, regen:10, mp:5, ev:22, pdc:0.30, weapons:['beamL'], ability:'blackout', len:2.4, y:0.8, jam:true,
             passive:'Jams enemies within 4 hexes (-10 accuracy, -15 with missiles) and gives allies within 3 hexes +8 accuracy'},
  tender:   {label:'Repair tender', role:'Repair and resupply',    cost:70, hull:150, armor:3, shield:50, regen:12, mp:3, ev:8,  pdc:0.35, weapons:['pulse'], ability:'resupply', len:3.0, y:0.9, fieldRepair:10, fieldRange:2,
             passive:'Field repairs: allies within 2 hexes regain 10 hull each turn'},
  carrier:  {label:'Fleet carrier', role:'Strike and support',     cost:150, hull:250, armor:7, shield:80, regen:20, mp:3, ev:4,  pdc:0.55, weapons:['wing','pulse'],         ability:'repair',     len:3.3, y:1.0},
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

