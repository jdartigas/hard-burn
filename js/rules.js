// Laniakea's Edge: game state, ship creation, hit/damage/intercept rules, pathing, weapon effects.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

/* ---------------- game state ---------------- */
const turnLimit = () => state.quick ? QUICK.turns : BATTLE_TURNS;   // v60: Quick battles are shorter
const state = {
  diff: store.get('diff','normal'), turn:0, phase:'menu', ships:[], selected:null, weaponSel:'all', mode:null,
  busy:false, over:false, reach:null, hoverCell:null, hoverShip:null, stats:null, acting:null,
};
let shipId=0;
function createShip(cls, side, q, r, copy=0){
  const C=CLASSES[cls], d=DIFF[state.diff];
  const hullMax=Math.round(C.hull*(side==='enemy'?d.hull:1));
  const m=buildShip(cls, side, copy);
  const s={ id:shipId++, side, cls, C, name:NAMES[side][cls]+(copy?' '+ROMAN[copy]:''), copy, hull:hullMax, hullMax, shield:C.shield, shieldMax:C.shield, armor:C.armor, regen:C.regen,
    mp:C.mp, mpMax:C.mp, ev:C.ev, pdc:C.pdc, q, r, alive:true, len:C.m/M_PER_UNIT*SHIP_SCALE, baseY:C.y, phase:Math.random()*6,
    weapons:C.weapons.map(k=>({key:k, def:WEAPONS[k], wait:0, ammo:WEAPONS[k].ammo, firedTurn:-1})),
    ability:{key:C.ability, def:ABIL[C.ability], wait:0}, fx:{}, moved:false,
    ...m };
  s.group.scale.setScalar(SHIP_SCALE*(C.m/M_PER_UNIT)/s.modelLen);   // the built model, scaled to the class's length in metres
  s.pickMesh.scale.setScalar(Math.max(1, 0.9/(C.len*0.5*s.group.scale.x)));   // small hulls keep a finger-sized target
  s.group.position.copy(hexToWorld(q,r,s.baseY));
  s.group.rotation.y = side==='player'? Math.PI/2 : -Math.PI/2;
  s.pickMesh.userData.ship=s; initSystems(s);
  scene.add(s.group);
  // label
  const el=document.createElement('div'); el.className='tag '+side;
  el.innerHTML=`<div class="hit"></div><div class="tn">${s.name}</div><div class="mbar sh"><i></i></div><div class="mbar hu"><i></i></div><div class="fx"></div>`;
  $('#labels').appendChild(el); s.tag=el; s.tagHit=el.querySelector('.hit'); s.tagSh=el.querySelector('.sh i'); s.tagHu=el.querySelector('.hu i'); s.tagHuBar=el.querySelector('.hu'); s.tagFx=el.querySelector('.fx');
  return s;
}
const ROMAN = ['','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
const alive = side => state.ships.filter(s=>s.alive && s.side===side);
const other = side => side==='player'?'enemy':'player';
function shipAt(q,r){ return state.ships.find(s=>s.alive && s.q===q && s.r===r) || null; }
function weaponReady(w){ return w.wait===0 && (w.ammo===undefined || w.ammo>0) && !weaponOffline(w); }
function abilityReady(s){ return s.ability.wait===0; }

/* ---------------- rules ---------------- */
function hasLOS(a,b){ const line=hexLine(a,b); for(let i=1;i<line.length-1;i++){ const c=cellAt(line[i].q,line[i].r); if(c && c.t==='rock') return false; } return true; }
function accMod(side){ return side==='enemy'? DIFF[state.diff].acc : (state.diff==='easy'?5:0); }
function hitCore(w, attSide, dist, tgt, tgtCell, los, adj=0){
  if(dist>w.range || dist<1) return 0;
  if(!w.guided && !los) return 0;
  let p = w.guided ? w.acc - tgt.ev*0.5 : w.acc - Math.max(0,dist-w.opt)*w.fall - tgt.ev;
  if(w.reach && dist>w.reach) p -= (dist-w.reach)*tgt.ev*w.dodge;   // beyond a railgun's old range, the target has time to dodge
  const c=cellAt(tgtCell.q,tgtCell.r); if(c && c.t==='debris') p -= w.guided?5:15;
  if(tgt.fx.ecm) p -= w.guided?25:20;
  p += accMod(attSide) + adj;
  return clamp(Math.round(p),5,95);
}
// Accuracy changes that depend on the firing ship: sensor blackout on it, an enemy jamming field around where it
// fires from, and a friendly targeting uplink. Fields don't stack: one jammer or one uplink in range is enough.
function accAdj(att, w, from=att){
  let a=0;
  if(att.blackout) a-=JAM.blackout;
  if(alive(other(att.side)).some(e=>e.C.jam && hdist(e,from)<=JAM.range)) a-= w.guided? JAM.guided : JAM.direct;
  if(alive(att.side).some(e=>e.C.jam && hdist(e,from)<=JAM.uplink)) a+=JAM.boost;
  return a;
}
function hitChance(att, w, tgt, from=att){ const d=hdist(from,tgt); if(d>w.range) return 0;
  if(att.blackout && w.guided) return 0;   // no missile locks under a sensor blackout
  return hitCore(w, att.side, d, tgt, tgt, w.guided?true:hasLOS(from,tgt), accAdj(att,w,from)); }
// who a targeted ability can be used on, right now
function abilityTargets(s){ const d=s.ability.def; if(!d.targeted) return [];
  return d.target==='enemy'? alive(other(s.side)).filter(o=>hdist(o,s)<=d.range) : alive(s.side).filter(o=>o!==s && hdist(o,s)<=d.range); }
// Whose point defense protects tgt: its own, or an escort's screen when that is stronger. `by` is the ship doing
// the shooting, so the interception can be drawn from it and credited to it.
function pdCover(tgt){
  let p=effPdc(tgt), by=tgt;   // a damaged point-defense system intercepts less (damage.js)
  if(tgt.fx.pdsurge) p=Math.min(0.85,p*1.6);
  let best=null; for(const a of alive(tgt.side)) if(a.C.pdnet && a!==tgt && hdist(a,tgt)<=PD_NET.radius && (!best || effPdc(a)>effPdc(best))) best=a;
  if(best){ const sp=effPdc(best)*PD_NET.share;
    if(PD_NET.stack){ p=1-(1-p)*(1-sp); by=best; } else if(sp>p){ p=sp; by=best; } }
  return {p, by};
}
function interceptChance(tgt, w){ return clamp(pdCover(tgt).p*w.pdcF, 0, 0.8); }
function applyDamage(t, w, dmg){
  let s=0, h=0;
  if(t.shield>0){ const sd=dmg*w.sh, ab=Math.min(t.shield, sd); t.shield-=ab; s=ab; dmg=(sd-ab)/w.sh; }
  if(dmg>0.01){ const armor=t.armor*(t.fx.brace?2:1)*(1-w.pierce); let hd=dmg*w.hu-armor; hd=Math.max(hd, dmg*w.hu*0.15); if(t.fx.brace) hd*=0.75; h=hd; t.hull-=hd; }
  return {s,h};
}
function expected(att, w, tgt, from=att){
  const p=hitChance(att,w,tgt,from); if(!p) return {p:0, dmg:0, hull:0, kill:false};
  const per=p/100*(w.guided?1-interceptChance(tgt,w):1);
  const sim={shield:tgt.shield, hull:tgt.hull, armor:tgt.armor, fx:tgt.fx}; let tot=0, hull=0;
  for(let i=0;i<w.shots;i++){ const c={...sim}; const r=applyDamage(c,w,w.dmg); sim.shield-=r.s*per; sim.hull-=r.h*per; tot+=(r.s+r.h)*per; hull+=r.h*per; }
  return {p, dmg:tot, hull, kill: hull>=tgt.hull*0.92};
}
function reachable(s){
  const res=new Map(); const start=key(s.q,s.r); res.set(start,{cost:0, prev:null, q:s.q, r:s.r});
  const open=[{q:s.q,r:s.r,cost:0}];
  while(open.length){ open.sort((a,b)=>a.cost-b.cost); const cur=open.shift();
    for(const d of DIRS){ const nq=cur.q+d[0], nr=cur.r+d[1]; const c=cellAt(nq,nr); if(!c || c.t==='rock') continue;
      const occ=shipAt(nq,nr); if(occ && occ.side!==s.side) continue;
      const nc=cur.cost+(c.t==='debris'?2:1); if(nc>s.mp) continue;
      const k=key(nq,nr); const ex=res.get(k); if(ex && ex.cost<=nc) continue;
      res.set(k,{cost:nc, prev:key(cur.q,cur.r), q:nq, r:nr}); open.push({q:nq,r:nr,cost:nc}); } }
  for(const [k,v] of res){ const occ=shipAt(v.q,v.r); if(occ && occ!==s) v.blocked=true; }
  return res;
}
function pathTo(reach, k){ const path=[]; let cur=reach.get(k); while(cur){ path.unshift(cur); cur=cur.prev?reach.get(cur.prev):null; } return path; }

/* ---------------- ship helpers & FX ---------------- */
const V=new THREE.Vector3();
function fwd(s){ return new THREE.Vector3(Math.sin(s.group.rotation.y),0,Math.cos(s.group.rotation.y)); }
function muzzle(s, spread=0){ const f=fwd(s), p=s.group.position.clone().addScaledVector(f,s.len*0.42); p.y+=0.05; if(spread){ p.x+=(Math.random()-.5)*spread; p.z+=(Math.random()-.5)*spread; } return p; }
// v42: shots leave from the weapon's own fitting. Ships carry body-space mounts per loadout slot (buildShip); a volley
// steps through them, and the starting mount advances every volley so twin single-shot guns alternate.
function mountPoint(s, slot, i=0){
  const list=s.mounts && slot!=null && s.mounts.w[slot];
  if(!list || !list.length) return {p:muzzle(s), d:fwd(s)};
  const m=list[i%list.length]; s.group.updateMatrixWorld(true); let p=m.p.clone(), d=m.d.clone();
  if(m.t){ const T=s.turrets[m.t-1], y=s.turretRig.yaw.value[m.t-1]; p.sub(T.pivot).applyAxisAngle(T.axis,y).add(T.pivot); d.applyAxisAngle(T.axis,y); }   // follows the turret round
  return {p:s.body.localToWorld(p), d:d.transformDirection(s.body.matrixWorld)};
}
// v43: turret tracking. The bearing turret t needs to face a world point, as an angle about its own axis from rest.
function turretBearing(s, t, point){
  const T=s.turrets[t-1]; s.group.updateMatrixWorld(true);
  const v=s.body.worldToLocal(point.clone()).sub(T.pivot), a=T.axis; v.addScaledVector(a,-v.dot(a)); if(v.lengthSq()<1e-8) return null; v.normalize();
  const f=T.fwd.clone().addScaledVector(a,-T.fwd.dot(a)).normalize();
  return Math.atan2(V.crossVectors(f,v).dot(a), f.dot(v));
}
function aimTurret(s, t, point, hold=2.5){ if(!t || !s.turrets) return 0; const y=turretBearing(s,t,point); if(y===null) return 0;
  s.turretGoal[t-1]=y; s.turretHold[t-1]=hold; return Math.abs(shortestAngle(s.turretRig.yaw.value[t-1], y)); }
// slew toward the goal; turrets with nothing to shoot drift between nearby bearings so a fleet at rest still looks crewed
const TURRET_SLEW=5, TURRET_IDLE=0.7;
function updateTurrets(s, dt){
  const yaw=s.turretRig.yaw.value, goal=s.turretGoal, hold=s.turretHold;
  for(let i=0;i<s.turrets.length;i++){
    if(hold[i]>0) hold[i]-=dt; else if(Math.random()<dt*0.12) goal[i]=rand(-TURRET_IDLE,TURRET_IDLE);
    const d=shortestAngle(yaw[i],goal[i]), step=(hold[i]>0?TURRET_SLEW:0.7)*dt;
    yaw[i]=shortestAngle(0, yaw[i]+(Math.abs(d)<=step? d : Math.sign(d)*step)); }
}
// the point-defense turret on `s` nearest to `near`, in world space (the hull centre if it has none)
function pdcPoint(s, near){
  const list=s.mounts && s.mounts.pdc; if(!list || !list.length) return s.group.position.clone().add(new THREE.Vector3(0,0.2,0));
  s.group.updateMatrixWorld(true); let best=null, bt=null, bd=Infinity;
  for(const t of list){ const w=s.body.localToWorld(V.copy(t.p)); const d=w.distanceToSquared(near); if(d<bd){ bd=d; best=w.clone(); bt=t; } }
  if(bt) aimTurret(s, bt.t, near, 1.5);   // and that turret swings onto the warhead
  return best;
}
function hitPoint(s){ return s.group.position.clone().add(new THREE.Vector3(rand(-.3,.3)*s.len*0.5, rand(-.1,.2), rand(-.3,.3)*s.len*0.5)); }
function angleTo(a, b){ return Math.atan2(b.x-a.x, b.z-a.z); }
function shortestAngle(from,to){ let d=(to-from)%(Math.PI*2); if(d>Math.PI) d-=Math.PI*2; if(d<-Math.PI) d+=Math.PI*2; return d; }
async function faceTarget(s, tgt){
  const a0=s.group.rotation.y, d=shortestAngle(a0, angleTo(s.group.position, tgt.group.position));
  if(Math.abs(d)<0.05) return; await tween(clamp(Math.abs(d)*0.25,0.15,0.5), k=>{ s.group.rotation.y=a0+d*k; });
}
function beamMesh(a, b, radius, color, opacity){
  const len=a.distanceTo(b); const g=new THREE.CylinderGeometry(radius,radius,1,8,1,true);
  const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color, transparent:true, opacity, blending:THREE.AdditiveBlending, depthWrite:false}));
  m.position.copy(a).lerp(b,0.5); m.scale.y=len; m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), V.copy(b).sub(a).normalize()); scene.add(m); return m;
}
function disposeMesh(m){ scene.remove(m); m.geometry.dispose(); if(m.material.dispose) m.material.dispose(); }
const lightPool=[0,1,2,3].map(()=>{ const l=new THREE.PointLight(0xffaa55,0,30,2); scene.add(l); return {l, t:0}; });
function flash(p, color=0xffaa55, intensity=6, dur=0.5){ const L=lightPool.reduce((a,b)=>a.t<b.t?a:b); L.l.position.copy(p); L.l.color.set(color); L.l.intensity=intensity*4.5; L.t=dur; L.max=dur; L.i=intensity*4.5; }
let shake=0;
function addShake(v){ if(!REDUCED) shake=Math.min(1.2, shake+v); }
function shieldFlash(s, from){ s.shieldMesh.visible=true; const dir=V.copy(from).sub(s.group.position); dir.applyQuaternion(s.group.quaternion.clone().invert());
  dir.set(dir.x/s.shieldMesh.scale.x, dir.y/s.shieldMesh.scale.y, dir.z/s.shieldMesh.scale.z).normalize(); s.shMat.uniforms.uHit.value.copy(dir); s.shMat.uniforms.uFlash.value=1.2; }
const C_SPARK=new THREE.Color(1,.62,.25), C_FIRE=new THREE.Color(1,.42,.12), C_WHITE=new THREE.Color(1,.95,.85), C_CYAN=new THREE.Color(.4,.8,1), C_SMOKE=new THREE.Color(.12,.1,.09);
function impactFx(tgt, res, from, heavy=1){
  const p=hitPoint(tgt);
  if(res.s>0){ shieldFlash(tgt, from); Particles.burst(p,10*heavy,{speed:4,color:C_CYAN,size:0.3,life:0.4}); Sound.shield(); }
  if(res.h>0.5){ Particles.burst(p,24*heavy,{speed:7,color:C_SPARK,size:0.35,life:0.7}); Particles.burst(p,8*heavy,{speed:1.5,color:C_FIRE,size:1.1*heavy,life:0.5,grow:1});
    Particles.burst(p,6,{speed:0.8,color:C_SMOKE,size:1.2,life:1.4,drag:0.5,grow:1}); flash(p,0xff9944,4*heavy,0.35); Sound.hit(); addShake(0.12*heavy); }
}
function floatText(s, text, cls, dy=0){
  const el=document.createElement('div'); el.className='ftxt '+cls; el.textContent=text; $('#labels').appendChild(el);
  const base=s.group.position.clone(); base.y+=1.2+dy; const off=new THREE.Vector3(rand(-.6,.6),0,rand(-.4,.4)); base.add(off);
  addFx({t:0, dur:1.3, update(dt){ this.t+=dt; const k=this.t/this.dur; const p=base.clone(); p.y+=k*1.8; const sp=toScreen(p);
      if(sp){ el.style.transform=`translate3d(${sp.x.toFixed(1)}px,${sp.y.toFixed(1)}px,0) translate(-50%,-50%)`; el.style.opacity= k<0.7?1:1-(k-0.7)/0.3; } else el.style.opacity=0; return k<1; },
    dispose(){ el.remove(); }});
}

function fxRail(att, tgt, outcomes, onEvent, mp){
  return new Promise(async res=>{
    const a=mp(0).p, hit=outcomes[0]==='hit'; let b=hitPoint(tgt);
    if(!hit){ const dir=b.clone().sub(a).normalize(); const perp=new THREE.Vector3(-dir.z,0,dir.x).multiplyScalar(rand(1.2,2.2)*(Math.random()<.5?-1:1)); b=b.add(perp).addScaledVector(dir,60); }
    Sound.rail();
    // charge
    for(let i=0;i<30;i++){ const off=new THREE.Vector3().randomDirection().multiplyScalar(0.55); Particles.emit(a.clone().add(off), off.clone().multiplyScalar(-3.2), C_CYAN, 0.18, 0.28, 0); }
    await wait(0.25);
    const core=beamMesh(a,b,0.05,0xffffff,1), glow=beamMesh(a,b,0.22,0x7fd0ff,0.55);
    flash(a,0x9fd8ff,5,0.25); Particles.burst(a,20,{speed:5,color:C_WHITE,size:0.3,life:0.3});
    const dir=b.clone().sub(a); const n=Math.min(60,Math.floor(dir.length()*2));
    for(let i=0;i<n;i++){ const p=a.clone().addScaledVector(dir,i/n); Particles.emit(p,new THREE.Vector3().randomDirection().multiplyScalar(0.4),new THREE.Color(.35,.55,.8),0.25,rand(0.5,1.1),1.5,0.4); }
    addShake(0.25);
    after(0.03, ()=>onEvent(0, outcomes[0]));
    addFx({t:0,dur:0.45,update(dt){ this.t+=dt; const k=this.t/this.dur; core.material.opacity=1-k; glow.material.opacity=0.55*(1-k); glow.scale.x=glow.scale.z=1+k*1.5; return k<1; }, dispose(){ disposeMesh(core); disposeMesh(glow); }});
    await wait(0.5); res();
  });
}
function fxBeam(att, tgt, outcomes, onEvent, mp){
  return new Promise(async res=>{
    const a=mp(0).p, hit=outcomes[0]==='hit'; let b=hitPoint(tgt);
    if(!hit){ const dir=b.clone().sub(a).normalize(); b.add(new THREE.Vector3(-dir.z,0.2,dir.x).multiplyScalar(rand(1.3,2)*(Math.random()<.5?-1:1))).addScaledVector(dir,25); }
    const col= att.side==='player'?0xffb44a:0xff5a3a; const colC=new THREE.Color(col);
    const core=beamMesh(a,b,0.04,0xffffff,0.95), glow=beamMesh(a,b,0.16,col,0.7);
    Sound.beam(0.9); flash(a,col,3,0.9);
    let fired=false;
    addFx({t:0,dur:0.9,update(dt){ this.t+=dt; const k=this.t/this.dur; const w=Math.sin(Math.min(1,k*5)*Math.PI/2)*(k>0.8?(1-k)/0.2:1);
        core.scale.x=core.scale.z=w*(0.9+Math.random()*0.3); glow.scale.x=glow.scale.z=w*(0.8+Math.random()*0.5);
        if(hit && Math.random()<0.8) Particles.burst(b,2,{speed:5,color:colC,size:0.28,life:0.35});
        if(!fired && k>0.3){ fired=true; onEvent(0,outcomes[0]); }
        return k<1; }, dispose(){ disposeMesh(core); disposeMesh(glow); }});
    await wait(0.95); res();
  });
}
function fxPulse(att, tgt, outcomes, onEvent, mp){
  return new Promise(res=>{
    let left=outcomes.length; const col=new THREE.Color(att.side==='player'?0xffd27a:0xff8a5a);
    outcomes.forEach((o,i)=>{
      after(i*0.13, ()=>{
        const a=mp(i).p; let b=hitPoint(tgt); if(o!=='hit'){ const dir=b.clone().sub(a).normalize(); b.add(new THREE.Vector3(-dir.z,rand(-.3,.3),dir.x).multiplyScalar(rand(1,1.8)*(Math.random()<.5?-1:1))); }
        const dir=b.clone().sub(a); const dist=dir.length(); dir.normalize(); const end= o==='hit'? b : b.clone().addScaledVector(dir,14);
        const bolt=new THREE.Mesh(new THREE.SphereGeometry(0.09,8,6), new THREE.MeshBasicMaterial({color:col.clone().multiplyScalar(2)})); bolt.scale.set(1,1,5);
        bolt.position.copy(a); bolt.lookAt(b); scene.add(bolt); Sound.pulse(); Particles.burst(a,5,{speed:3,color:col,size:0.25,life:0.2});
        const total=a.distanceTo(end), speed=34;
        addFx({d:0,update(dt){ this.d+=speed*dt; const k=Math.min(1,this.d/total); bolt.position.copy(a).lerp(end,k);
            Particles.emit(bolt.position,new THREE.Vector3(),col,0.22,0.15,0);
            if(o==='hit' && this.d>=dist){ onEvent(i,o); return false; }
            if(o!=='hit' && !this.m && this.d>=dist){ this.m=true; onEvent(i,o); }
            return k<1; }, dispose(){ disposeMesh(bolt); if(--left===0) res(); }});
      });
    });
  });
}
function fxGuided(att, tgt, outcomes, onEvent, kind, big, screen=null, mp=null){
  return new Promise(res=>{
    let left=outcomes.length;
    const fighter= kind==='fighter';
    const trailCol= fighter? new THREE.Color(att.side==='player'?0x9fd8ff:0xffa070) : new THREE.Color(1,.75,.45);
    if(fighter) Sound.fighter();
    outcomes.forEach((o,i)=>{
      after(i*(fighter?0.1:0.18), ()=>{
        const launch=mp(i), a=launch.p;
        let b=hitPoint(tgt); const dist=a.distanceTo(b); const dir=b.clone().sub(a).normalize();
        const side=new THREE.Vector3(-dir.z,0,dir.x).multiplyScalar(rand(-1,1)*(fighter?5:3));
        const ctrl=a.clone().lerp(b,0.45).add(side).add(new THREE.Vector3(0,rand(3,6)*(fighter?0.6:1),0));
        let end=b.clone(); if(o==='miss') end.add(new THREE.Vector3(-dir.z,rand(-1,1),dir.x).multiplyScalar(3*(Math.random()<.5?-1:1))).addScaledVector(dir,6);
        const geo= fighter? new THREE.ConeGeometry(0.12,0.35,3) : new THREE.ConeGeometry(big?0.09:0.06, big?0.5:0.34, 6); geo.rotateX(Math.PI/2);
        const m=new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color:0x9aa0a6, metalness:0.6, roughness:0.4, emissive:0x222222}));
        scene.add(m); if(!fighter) Sound.missile();
        const dur=(dist/(fighter?13:16))+0.45; const cutK = o==='int'? rand(0.7,0.85) : 1.0;
        // leave along the launcher's own axis (up out of a cell, out of a tube or bay), then bend onto the attack path
        const curve=new THREE.CubicBezierCurve3(a, a.clone().addScaledVector(launch.d, clamp(dist*0.18,0.8,3)), ctrl, end);
        let pdcStarted=false;
        addFx({t:0,update(dt){ this.t+=dt; const k=Math.min(this.t/dur,1); const e=k*k*(1.6-0.6*k);
            const p=curve.getPoint(Math.min(e,1)); const p2=curve.getPoint(Math.min(e+0.02,1)); m.position.copy(p); m.lookAt(p2);
            Particles.emit(p, new THREE.Vector3(rand(-.2,.2),rand(-.2,.2),rand(-.2,.2)), trailCol, big?0.45:0.3, fighter?0.25:0.5, 1, big?0.6:0.3);
            if(!fighter && Math.random()<0.4) Particles.emit(p, new THREE.Vector3(), C_SMOKE, 0.5, 1.2, 0.5, 0.8);
            if(o==='int' && !pdcStarted && e>cutK-0.22){ pdcStarted=true; Sound.pdc(); }
            if(o==='int' && pdcStarted && e<cutK){ const src=pdcPoint(screen||tgt, p);   // the turret nearest the warhead: a screening escort's own, or the target's
              const v=p.clone().sub(src); const dd=v.length(); v.normalize().multiplyScalar(40); Particles.emit(src,v,new THREE.Color(1,.85,.4),0.12,dd/40,0); }
            if(o==='int' && e>=cutK){ Particles.burst(p,18,{speed:4,color:C_FIRE,size:0.35,life:0.4}); flash(p,0xffaa66,2,0.2); onEvent(i,o); return false; }
            if(e>=1){ if(o==='hit') onEvent(i,o); else onEvent(i,o); return false; }
            return true; }, dispose(){ disposeMesh(m); if(--left===0) res(); }});
      });
    });
  });
}
async function playWeaponFx(w, att, tgt, outcomes, onEvent, screen=null, slot=null){
  const v=att.volleys=(att.volleys||0)+1, mp=i=>mountPoint(att, slot, v+i);
  // turreted weapons traverse onto the target first, as long as the slowest one needs (capped, so play keeps moving)
  const list=att.mounts && slot!=null ? att.mounts.w[slot] : null;
  if(list && list.some(m=>m.t)){ let need=0; for(const m of list) if(m.t) need=Math.max(need, aimTurret(att, m.t, tgt.group.position, 3));
    if(need>0.05) await wait(Math.min(0.45, need/TURRET_SLEW)); }
  switch(w.kind){ case 'rail': return fxRail(att,tgt,outcomes,onEvent,mp); case 'beam': return fxBeam(att,tgt,outcomes,onEvent,mp);
    case 'pulse': return fxPulse(att,tgt,outcomes,onEvent,mp); default: return fxGuided(att,tgt,outcomes,onEvent,w.kind,w.big,screen,mp); }
}
