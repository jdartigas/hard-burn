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
  // which system a critical hits. v75 (Jon): weapons took 60% of criticals, so damage read as weapons-only; now 40%,
  // and sensors and (on missile-armed ships) the magazine join. Keys a ship lacks drop out and the rest renormalize.
  weights: { weapon:0.40, engines:0.14, shields:0.14, pdc:0.10, sensors:0.12, magazine:0.10 },
  sensorsDamaged: 10, sensorsOffline: 20,   // accuracy lost; offline sensors also can't track a railgun target past its reach
  magazineBlast: 0.08,   // a magazine knocked offline cooks off: this share of max hull, never the killing blow
  accDamaged: 15,      // accuracy lost by a damaged weapon
  regenDamaged: 0.5,   // shield recharge kept when the generator is damaged (offline: none)
  pdcDamaged: 0.7, pdcOffline: 0.3,   // point defense kept
};
const SYS_LABEL = { engines:'Engines', shields:'Shield generator', pdc:'Point defense', sensors:'Sensors', magazine:'Magazine' };
const SYS_KEYS = Object.keys(SYS_LABEL);
const hasMagazine = s => s.weapons.some(w=>w.def.ammo!==undefined);
const SEVERITY = { ok:0, damaged:1, offline:2 };

function initSystems(s){
  s.sys = {}; for(const k of SYS_KEYS) s.sys[k]={state:'ok', t:0};
  s.weapons.forEach(w=>{ w.sys={state:'ok', t:0}; }); linkPdcGun(s);
}
// v74: the PDC guns are the point defense system: they share its state (damaged fires fewer rounds' worth of accuracy,
// offline can't fire) and are never a separate critical-hit target
function linkPdcGun(s){ const g=s.weapons.find(isPdcGun); if(g) g.sys=s.sys.pdc;
  s.weapons.forEach(w=>{ if(w.def.ammo!==undefined) w.mag=s.sys.magazine; }); }   // v75: missiles and torpedoes can't be loaded while the magazine is offline
// a system by key: 'engines' | 'shields' | 'pdc' | weapon index as a number
const sysOf = (s, key) => typeof key==='number' ? s.weapons[key].sys : s.sys[key];
const sysName = (s, key) => typeof key==='number' ? s.weapons[key].def.name : SYS_LABEL[key];
function damagedSystems(s){
  const out=[]; for(const k of SYS_KEYS) if(s.sys && s.sys[k] && s.sys[k].state!=='ok') out.push({key:k, name:SYS_LABEL[k], ...s.sys[k]});
  s.weapons.forEach((w,i)=>{ if(!isPdcGun(w) && w.sys && w.sys.state!=='ok') out.push({key:i, name:w.def.name, ...w.sys}); });
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
  const keys=[], w=[], main=tgt.weapons.filter(x=>!isPdcGun(x)).length; tgt.weapons.forEach((x,i)=>{ if(isPdcGun(x)) return; keys.push(i); w.push(CRIT.weights.weapon/main); });
  for(const k of SYS_KEYS) if((k!=='pdc' || tgt.pdc>0) && (k!=='magazine' || hasMagazine(tgt))){ keys.push(k); w.push(CRIT.weights[k]); }
  let r=gameRand()*w.reduce((a,b)=>a+b,0), key=keys[keys.length-1]; for(let i=0;i<keys.length;i++){ r-=w[i]; if(r<=0){ key=keys[i]; break; } }
  const cur=simSys[key] || 'ok', roll=gameRand();
  const state= cur==='ok' ? (roll<CRIT.offlineChance?'offline':'damaged') : 'offline';
  simSys[key]=state;
  // v75: a magazine knocked offline cooks off; decided here so the volley's kill shot accounts for it, never fatal itself
  const blast= key==='magazine' && state==='offline' ? Math.max(0, Math.min(hullNow-1, tgt.hullMax*CRIT.magazineBlast)) : 0;
  return {key, state, blast};
}
// apply a critical decided by rollCrit. Severity only ever rises here, so the order effects land in doesn't matter.
function applyCrit(tgt, c){
  const s=sysOf(tgt, c.key); if(!s) return;
  if(SEVERITY[c.state]>=SEVERITY[s.state]){ s.state=c.state; if(c.state==='offline') s.t=CRIT.offlineTurns; }
  const name=sysName(tgt, c.key);
  if(c.key==='magazine') magazineHit(tgt, c.state, c.blast||0);
  floatText(tgt, `${name} ${c.state}`, c.state==='offline'?'crit off':'crit', 0.8); if(tgt.side==='player') Sound.alarm();
  log(`${tgt.name}: ${name.toLowerCase()} ${c.state==='offline'?'knocked offline':'damaged'}.`, tgt.side==='player'?'e':'p', 'crit');
}
// v75: a magazine hit loses a salvo from the fullest launcher; knocked offline, it cooks off as well
function magazineHit(s, sev, blast){
  const lose=n=>{ for(let k=0;k<n;k++){ const w=s.weapons.filter(x=>x.ammo>0).sort((a,b)=>b.ammo-a.ammo)[0]; if(w) w.ammo--; } };
  lose(1);
  if(sev==='offline'){ lose(1); const dmg=Math.min(blast, s.hull-1); if(dmg>0){ s.hull-=dmg; s.st.taken+=dmg; floatText(s, Math.round(dmg), 'hu big', 0.5); }
    if(!state.simulated && !window.__norender){ Particles.burst(hitPoint(s),30,{speed:6,color:new THREE.Color(1,.6,.2),size:0.5,life:0.6}); sndAt(hitPoint(s), ()=>Sound.burst()); addShake(0.15); } }
}
// the start of a side's turn: offline systems count down, damaged ones may be repaired by the crew
function tickSystems(s){
  if(!s.sys) return; const field=alive(s.side).some(t=>t!==s && t.C.fieldRepair && hdist(t,s)<=(t.C.fieldRange||1));
  const fixed=[];
  const tick=(sys,name)=>{ if(sys.state==='offline'){ if(--sys.t<=0){ sys.state='damaged'; sys.t=0; } }
    else if(sys.state==='damaged' && gameRand()<CRIT.recover+(field?CRIT.fieldRecover:0)){ sys.state='ok'; fixed.push(name); } };
  for(const k of SYS_KEYS) tick(s.sys[k], SYS_LABEL[k]);
  s.weapons.forEach(w=>{ if(!isPdcGun(w)) tick(w.sys, w.def.name); });
  if(fixed.length && !state.simulated){ floatText(s, `${fixed.join(', ')} repaired`, 'heal', 0.6); }
}
function repairAll(s){ const n=damagedSystems(s).length; for(const k of SYS_KEYS) s.sys[k]={state:'ok',t:0}; s.weapons.forEach(w=>{ w.sys={state:'ok',t:0}; }); linkPdcGun(s); return n; }

// effects
const weaponOffline = w => !!(w.sys && w.sys.state==='offline') || !!(w.mag && w.mag.state==='offline');
const slotAcc = w => w.sys && w.sys.state==='damaged' ? -CRIT.accDamaged : 0;
function moveAllowance(s){ const st=s.sys? s.sys.engines.state : 'ok'; return st==='offline'? Math.max(1,Math.ceil(s.mpMax/2)) : st==='damaged'? Math.max(1,s.mpMax-1) : s.mpMax; }
function regenOf(s){ const st=s.sys? s.sys.shields.state : 'ok'; return st==='offline'? 0 : st==='damaged'? s.regen*CRIT.regenDamaged : s.regen; }
function effPdc(s){ if(s.fx && s.fx.pdcFired) return 0;   // v74: its PDCs are firing at a ship this turn
  const st=s.sys? s.sys.pdc.state : 'ok'; return st==='offline'? s.pdc*CRIT.pdcOffline : st==='damaged'? s.pdc*CRIT.pdcDamaged : s.pdc; }
// short status words for tags and lists
function damageSummary(s){ const d=damagedSystems(s); if(!d.length) return '';
  return d.map(x=>`${x.name} ${x.state==='offline'?`offline (${x.t})`:'damaged'}`).join(' · '); }

// smoke from damaged fittings, sparks from offline ones (cosmetic: Math.random)
const C_DMG_SMOKE=new THREE.Color(.16,.14,.13), C_DMG_SPARK=new THREE.Color(1,.7,.3);
function updateDamageFx(s, dt){
  if(!s.sys || window.__norender) return;
  const puff=(p,offline)=>{ if(offline) Particles.emit(p, new THREE.Vector3().randomDirection().multiplyScalar(rand(2,5)), C_DMG_SPARK, 0.1, rand(0.2,0.45), 2);
    else Particles.emit(p, new THREE.Vector3(rand(-.2,.2),rand(.3,.7),rand(-.2,.2)), C_DMG_SMOKE, rand(0.35,0.7), rand(1.2,2.2), 0.4, 0.6); };
  s.weapons.forEach((w,i)=>{ if(isPdcGun(w) || !w.sys || w.sys.state==='ok') return; const off=w.sys.state==='offline';
    if(Math.random()<dt*(off?9:3)) puff(mountPoint(s,i,Math.floor(Math.random()*8)).p, off); });
  const eng=s.sys.engines; if(eng.state!=='ok' && s.engines.length && Math.random()<dt*(eng.state==='offline'?8:3)){
    const e=s.engines[Math.floor(Math.random()*s.engines.length)]; e.group.getWorldPosition(V); puff(V.clone(), eng.state==='offline'); }
  const pd=s.sys.pdc; if(pd.state!=='ok' && s.mounts && s.mounts.pdc.length && Math.random()<dt*(pd.state==='offline'?6:2)){
    const t=s.mounts.pdc[Math.floor(Math.random()*s.mounts.pdc.length)]; s.group.updateMatrixWorld(true); puff(s.body.localToWorld(t.p.clone()), pd.state==='offline'); }
  const sh=s.sys.shields; if(sh.state!=='ok' && Math.random()<dt*(sh.state==='offline'?4:1.5)) puff(hitPoint(s), sh.state==='offline');
  for(const k of ['sensors','magazine']){ const y=s.sys[k]; if(y && y.state!=='ok' && Math.random()<dt*(y.state==='offline'?4:1.5)) puff(hitPoint(s), y.state==='offline'); }
}
