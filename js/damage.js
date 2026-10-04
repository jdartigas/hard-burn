// Laniakea's Edge: the damage model. Hits that reach the hull can knock out a ship's systems: a weapon, its engines,
// its shield generator or its point defense. Systems are damaged (weaker) or offline (out for a while), crews repair
// them over time, and a Repair tender's Resupply fixes everything.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

/* ---------------- damage model (v52, Jon) ---------------- */
// Every number that tunes it lives here.
const CRIT = {
  perHull: 0.6,        // chance of a critical = hull damage / max hull x perHull ...
  hurt: 0.6,           // ... raised by up to this much (x) as the ship's hull runs down ...
  cap: 0.25,           // ... and capped here. Tuned for about 6 to 8 criticals a battle: at first 24 a battle buried the
                       // player in notices (the cap applied before the hurt bonus, so big hits ran to 80%)
  minHull: 4,          // chip damage below this never causes one
  offlineChance: 0.3,  // a healthy system that takes a critical goes straight offline this often, otherwise damaged
  offlineTurns: 2,     // turns an offline system stays out before coming back damaged
  recover: 0.25,       // chance a turn the crew repairs a damaged system
  fieldRecover: 0.25,  // extra chance inside a Repair tender's field
  weights: { weapon:0.6, engines:0.15, shields:0.15, pdc:0.1 },   // which system a critical hits
  accDamaged: 15,      // accuracy lost by a damaged weapon
  regenDamaged: 0.5,   // shield recharge kept when the generator is damaged (offline: none)
  pdcDamaged: 0.7, pdcOffline: 0.3,   // point defense kept
};
const SYS_LABEL = { engines:'Engines', shields:'Shield generator', pdc:'Point defense' };
const SEVERITY = { ok:0, damaged:1, offline:2 };

function initSystems(s){
  s.sys = { engines:{state:'ok', t:0}, shields:{state:'ok', t:0}, pdc:{state:'ok', t:0} };
  s.weapons.forEach(w=>{ w.sys={state:'ok', t:0}; });
}
// a system by key: 'engines' | 'shields' | 'pdc' | weapon index as a number
const sysOf = (s, key) => typeof key==='number' ? s.weapons[key].sys : s.sys[key];
const sysName = (s, key) => typeof key==='number' ? s.weapons[key].def.name : SYS_LABEL[key];
function damagedSystems(s){
  const out=[]; for(const k of ['engines','shields','pdc']) if(s.sys && s.sys[k].state!=='ok') out.push({key:k, name:SYS_LABEL[k], ...s.sys[k]});
  s.weapons.forEach((w,i)=>{ if(w.sys && w.sys.state!=='ok') out.push({key:i, name:w.def.name, ...w.sys}); });
  return out;
}

// Decided when a volley is resolved, shot by shot, against a copy of the target's systems, so a battle stays the same
// for the same seed whatever order the shots' effects arrive in. Returns the critical for this hit, or null.
function rollCrit(tgt, hullDmg, simSys, hullNow){
  if(tgt.isRock || hullDmg<CRIT.minHull) return null;
  const hurt=1-Math.max(0,hullNow)/tgt.hullMax;
  const p=Math.min(CRIT.cap, hullDmg/tgt.hullMax*CRIT.perHull*(1+CRIT.hurt*hurt));
  if(gameRand()>=p) return null;
  // which system: a weapon (any of them, equally) or a ship system, by weight
  const keys=[], w=[]; tgt.weapons.forEach((_,i)=>{ keys.push(i); w.push(CRIT.weights.weapon/tgt.weapons.length); });
  for(const k of ['engines','shields','pdc']) if(k!=='pdc' || tgt.pdc>0){ keys.push(k); w.push(CRIT.weights[k]); }
  let r=gameRand()*w.reduce((a,b)=>a+b,0), key=keys[keys.length-1]; for(let i=0;i<keys.length;i++){ r-=w[i]; if(r<=0){ key=keys[i]; break; } }
  const cur=simSys[key] || 'ok', roll=gameRand();
  const state= cur==='ok' ? (roll<CRIT.offlineChance?'offline':'damaged') : 'offline';
  simSys[key]=state;
  return {key, state};
}
// apply a critical decided by rollCrit. Severity only ever rises here, so the order effects land in doesn't matter.
function applyCrit(tgt, c){
  const s=sysOf(tgt, c.key); if(!s) return;
  if(SEVERITY[c.state]>=SEVERITY[s.state]){ s.state=c.state; if(c.state==='offline') s.t=CRIT.offlineTurns; }
  const name=sysName(tgt, c.key);
  floatText(tgt, `${name} ${c.state}`, c.state==='offline'?'crit off':'crit', 0.8);
  log(`${tgt.name}: ${name.toLowerCase()} ${c.state==='offline'?'knocked offline':'damaged'}.`, tgt.side==='player'?'e':'p');
}
// the start of a side's turn: offline systems count down, damaged ones may be repaired by the crew
function tickSystems(s){
  if(!s.sys) return; const field=alive(s.side).some(t=>t!==s && t.C.fieldRepair && hdist(t,s)<=(t.C.fieldRange||1));
  const fixed=[];
  const tick=(sys,name)=>{ if(sys.state==='offline'){ if(--sys.t<=0){ sys.state='damaged'; sys.t=0; } }
    else if(sys.state==='damaged' && gameRand()<CRIT.recover+(field?CRIT.fieldRecover:0)){ sys.state='ok'; fixed.push(name); } };
  for(const k of ['engines','shields','pdc']) tick(s.sys[k], SYS_LABEL[k]);
  s.weapons.forEach(w=>tick(w.sys, w.def.name));
  if(fixed.length && !state.simulated){ floatText(s, `${fixed.join(', ')} repaired`, 'heal', 0.6); }
}
function repairAll(s){ const n=damagedSystems(s).length; for(const k of ['engines','shields','pdc']) s.sys[k]={state:'ok',t:0}; s.weapons.forEach(w=>{ w.sys={state:'ok',t:0}; }); return n; }

// effects
const weaponOffline = w => !!(w.sys && w.sys.state==='offline');
const slotAcc = w => w.sys && w.sys.state==='damaged' ? -CRIT.accDamaged : 0;
function moveAllowance(s){ const st=s.sys? s.sys.engines.state : 'ok'; return st==='offline'? Math.max(1,Math.ceil(s.mpMax/2)) : st==='damaged'? Math.max(1,s.mpMax-1) : s.mpMax; }
function regenOf(s){ const st=s.sys? s.sys.shields.state : 'ok'; return st==='offline'? 0 : st==='damaged'? s.regen*CRIT.regenDamaged : s.regen; }
function effPdc(s){ const st=s.sys? s.sys.pdc.state : 'ok'; return st==='offline'? s.pdc*CRIT.pdcOffline : st==='damaged'? s.pdc*CRIT.pdcDamaged : s.pdc; }
// short status words for tags and lists
function damageSummary(s){ const d=damagedSystems(s); if(!d.length) return '';
  return d.map(x=>`${x.name} ${x.state==='offline'?`offline (${x.t})`:'damaged'}`).join(' · '); }

// smoke from damaged fittings, sparks from offline ones (cosmetic: Math.random)
const C_DMG_SMOKE=new THREE.Color(.16,.14,.13), C_DMG_SPARK=new THREE.Color(1,.7,.3);
function updateDamageFx(s, dt){
  if(!s.sys || window.__norender) return;
  const puff=(p,offline)=>{ if(offline) Particles.emit(p, new THREE.Vector3().randomDirection().multiplyScalar(rand(2,5)), C_DMG_SPARK, 0.1, rand(0.2,0.45), 2);
    else Particles.emit(p, new THREE.Vector3(rand(-.2,.2),rand(.3,.7),rand(-.2,.2)), C_DMG_SMOKE, rand(0.35,0.7), rand(1.2,2.2), 0.4, 0.6); };
  s.weapons.forEach((w,i)=>{ if(!w.sys || w.sys.state==='ok') return; const off=w.sys.state==='offline';
    if(Math.random()<dt*(off?9:3)) puff(mountPoint(s,i,Math.floor(Math.random()*8)).p, off); });
  const eng=s.sys.engines; if(eng.state!=='ok' && s.engines.length && Math.random()<dt*(eng.state==='offline'?8:3)){
    const e=s.engines[Math.floor(Math.random()*s.engines.length)]; e.group.getWorldPosition(V); puff(V.clone(), eng.state==='offline'); }
  const pd=s.sys.pdc; if(pd.state!=='ok' && s.mounts && s.mounts.pdc.length && Math.random()<dt*(pd.state==='offline'?6:2)){
    const t=s.mounts.pdc[Math.floor(Math.random()*s.mounts.pdc.length)]; s.group.updateMatrixWorld(true); puff(s.body.localToWorld(t.p.clone()), pd.state==='offline'); }
  const sh=s.sys.shields; if(sh.state!=='ok' && Math.random()<dt*(sh.state==='offline'?4:1.5)) puff(hitPoint(s), sh.state==='offline');
}
