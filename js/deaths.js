// Laniakea's Edge: how a ship dies (v121, Jon). Most ships die quietly, the way they do in The Expanse: the bridge is
// holed and the hull goes dark, the keel fails and the sections drift apart, a drive sticks open and the ship spins
// away (into an asteroid, if one is close), or the hull is gutted by a dozen small breaches. The reactor going up
// (explodeShip, wrecks.js) is kept for the big moments: torpedo kills, damaged magazines, and railgun slugs that find
// the core. Cosmetic only: the choice uses Math.random, never gameRand, and the rules have already resolved the kill.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

const DEATH_LABEL = { reactor:'Reactor breach', dark:'Bridge destroyed', broken:'Hull broken', spin:'Drive failure', crash:'Collision', riddled:'Gutted' };
// odds per killing weapon, tried in order (each is the chance of that death given the ones before it failed);
// capitals add DEATH.capital to the reactor chance
const DEATH = { capital:0.15, engineSpin:0.55, magazine:0.7, crashRange:3,
  odds: { big:{reactor:0.65, broken:1}, rail:{reactor:0.3, dark:0.65, broken:1}, beam:{reactor:0.2, broken:0.6, dark:1},
          light:{reactor:0.15, riddled:0.55, broken:0.5, spin:1}, none:{reactor:0.5, broken:1} } };

function pickDeath(s, w){
  // ships in the blast radius take damage from it (blastNeighbours), so a death next to them has to be seen to blow
  if(state.ships.some(o=>o!==s && o.alive && !o.isRock && hdist(o,s)<=SPLASH.radius)) return {kind:'reactor'};
  const sys=s.sys||{}, bad=k=>sys[k] && sys[k].state!=='ok';
  if(bad('magazine') && Math.random()<DEATH.magazine) return {kind:'reactor'};
  if(bad('engines') && Math.random()<DEATH.engineSpin) return spinOrCrash(s);
  const k= !w? 'none' : w.big || (w.guided && w.dmg>=30)? 'big' : w.kind==='rail'? 'rail' : w.kind==='beam'? 'beam' : 'light';
  const cap= s.C.m>=275? DEATH.capital : 0;
  for(const [kind,p] of Object.entries(DEATH.odds[k])) if(Math.random() < p+(kind==='reactor'?cap:0)) return kind==='spin'? spinOrCrash(s) : {kind};
  return {kind:'broken'};
}
// a spin-out heads for the nearest asteroid within reach, if there is one
function spinOrCrash(s){
  let best=null, bd=1e9;
  for(const c of board.list){ if(c.t!=='rock' || !c.rock || !c.rock.alive) continue; const d=hdist(s,c); if(d>=1 && d<=DEATH.crashRange && d<bd){ bd=d; best=c; } }
  return best? {kind:'crash', rock:best} : {kind:'spin'};
}

function killShip(s, how){
  if(simRunning || window.__norender || how.kind==='reactor') return explodeShip(s);
  s.tag.style.display='none';
  if(how.kind==='dark') return dieDark(s);
  if(how.kind==='broken') return dieBroken(s);
  if(how.kind==='riddled') return dieRiddled(s);
  return dieSpin(s, how.rock);
}

// ---- shared pieces ----
// the ship is no longer alive, so main.js stops animating its drives: this runs them down (or holds one open) itself
function drivesTo(s, dur, held=null){
  const from=s.engines.map(e=>e.cur||0.3);
  addFx({t:0, update(dt){ this.t+=dt; const k=Math.min(1,this.t/dur);
    s.engines.forEach((e,i)=>{ const flick= Math.random()<0.25? Math.random() : 1;
      e.cur= e===held? 1.6+Math.sin(this.t*31)*0.25 : from[i]*(1-k)*flick;
      e.group.scale.set(1,1,0.5+e.cur*0.9); for(const m of e.mats){ m.uniforms.uPow.value=e.cur; m.uniforms.uTime.value=elapsed+i*1.7; }
      e.sprite.material.opacity=Math.min(0.45,0.12+e.cur*0.25)*(e.cur>0.02?1:0); e.mach.material.opacity=Math.min(1,e.cur*0.9); });
    return s.group.visible && (held || k<1); }});
}
// running lights go out one by one, each with a flicker or two first
function lightsOut(s, dur){
  s.lights.forEach(l=>{ const t=rand(0.1,1)*dur; after(t*0.7, ()=>l.visible=false); after(t*0.8, ()=>l.visible=true); after(t, ()=>l.visible=false); });
}
const hullPoint=(s, along, up=0.15)=>s.group.position.clone().addScaledVector(fwd(s), along*s.len*0.5).add(new THREE.Vector3(rand(-.15,.15)*s.len*0.3, rand(0,up), rand(-.15,.15)*s.len*0.3));

// ---- dead in space: the bridge is holed, the power fails section by section, and the hull drifts off tumbling ----
async function dieDark(s){
  const p=s.group.position.clone(), bridge=hullPoint(s, 0.6, 0.25);
  sndAt(p, ()=>Sound.powerDown());
  flash(bridge,0xffd0a0,3,0.3); Particles.burst(bridge,30,{speed:3.5,color:C_SPARK,size:0.2,life:0.6});
  Particles.burst(bridge,10,{speed:1.2,color:C_VENT_DIM,size:0.5,life:1.4,grow:0.8});
  lightsOut(s, 1.6); drivesTo(s, 1.4);
  // the hull lists as the attitude jets die
  const r0=s.body.rotation.clone(), roll=rand(-1,1)*0.5;
  addFx({t:0, update(dt){ this.t+=dt; const k=Math.min(1,this.t/1.9); s.body.rotation.z=r0.z+roll*k*k; s.body.rotation.x=r0.x+0.12*k*k; return k<1 && s.group.visible; }});
  await wait(1.9);
  breakUpShip(s, {sections:1, debris:0.12, fires:0, scorch:0.7, drift:0.35, spin:0.6});
  await wait(0.2);
}

// ---- broken back: stress cracks run down the keel, a groan, then the sections tear apart and vent ----
async function dieBroken(s){
  const p=s.group.position.clone(), L=s.len;
  sndAt(p, ()=>Sound.hullGroan(L/2.2));
  for(let i=0;i<6;i++) after(i*0.16+rand(0,.05), ()=>{ if(!s.group.visible) return; const q=hullPoint(s, rand(-0.7,0.7));
    Particles.burst(q,18,{speed:3,color:C_SPARK,size:0.16,life:0.45}); flash(q,0xffa050,1.6,0.15);
    s.body.position.set(rand(-.03,.03),rand(-.02,.02),rand(-.03,.03)); });
  lightsOut(s, 0.9); drivesTo(s, 0.8);
  await wait(1.05);
  s.body.position.set(0,0,0);
  sndAt(p, ()=>Sound.tear(L/2.2)); flash(p,0xffa060,5,0.4); addShake(0.15+L*0.05);
  Particles.burst(p,70,{speed:5,color:C_SPARK,size:0.22,life:0.9,drag:1.2}); Particles.burst(p,24,{speed:2,color:C_VENT,size:0.7,life:1.6,grow:1});
  breakUpShip(s, {drift:1.4, debris:0.6});
  await wait(0.4);
}

// ---- gutted: holed in a dozen places, fire and air jet from each breach in turn, the power flickers out ----
async function dieRiddled(s){
  const p=s.group.position.clone(), L=s.len, n=6+Math.round(L*2);
  for(let i=0;i<n;i++) after(i*0.13+rand(0,.06), ()=>{ if(!s.group.visible) return; const q=hullPoint(s, rand(-0.85,0.85), 0.3);
    const out=q.clone().sub(p).setY(0).normalize().add(new THREE.Vector3(0,rand(0,.6),0)).normalize();
    for(let j=0;j<16;j++) Particles.emit(q, out.clone().multiplyScalar(rand(2,6)).add(new THREE.Vector3().randomDirection().multiplyScalar(0.7)), j%3? C_FIRE : C_SPARK, rand(0.14,0.3), rand(0.3,0.7), 1.6, 0.4);
    for(let j=0;j<5;j++) Particles.emit(q, out.clone().multiplyScalar(rand(1,3)), C_VENT_DIM, rand(0.3,0.5), rand(0.8,1.3), 1.2, 0.7);
    flash(q,0xff8844,1.5,0.15); if(i%2===0) sndAt(q, ()=>Sound.breach()); });
  lightsOut(s, n*0.13); drivesTo(s, n*0.12);
  await wait(n*0.13+0.3);
  breakUpShip(s, {sections:1, debris:0.35, fires:5, scorch:0.45, drift:0.4, spin:0.7});
  await wait(0.2);
}

// ---- drive failure: one drive sticks open as the rest die; the hull yaws into a flat spin and slews away,
// breaking up on its own or, with an asteroid in reach, ploughing into it ----
async function dieSpin(s, rock){
  const g=s.group, p0=g.position.clone(), L=s.len, held=s.engines[Math.floor(Math.random()*s.engines.length)];
  let end, T;
  if(rock){ const rp=hexToWorld(rock.q,rock.r,p0.y), d=rp.clone().sub(p0); end=rp.addScaledVector(d.clone().normalize(), -1.1); T=clamp(d.length()/3.2, 1.3, 2.4); }
  else { const a=Math.random()*Math.PI*2; end=p0.clone().add(new THREE.Vector3(Math.cos(a),0,Math.sin(a)).multiplyScalar(3+L)); T=2.6; }
  const side=new THREE.Vector3().subVectors(end,p0).cross(new THREE.Vector3(0,1,0)).normalize().multiplyScalar(rock? 0.6 : 1.4*(Math.random()<.5?-1:1));
  sndAt(p0, ()=>Sound.spinOut(T)); lightsOut(s, T); if(held) drivesTo(s, 0.6, held); else drivesTo(s, 0.6);
  const W=Math.min(9, 6/Math.max(1,L*0.6))*(Math.random()<.5?-1:1), V0=new THREE.Vector3();
  let last=p0.clone();
  addFx({t:0, update(dt){ if(!g.visible) return false; this.t+=dt; const k=Math.min(1,this.t/T), e=k*k*(3-2*k)*0.4+k*k*0.6;
    g.position.copy(p0).lerp(end,e).addScaledVector(side, Math.sin(k*Math.PI)); V0.subVectors(g.position,last).divideScalar(Math.max(dt,1e-3)); last.copy(g.position);
    g.rotation.y += W*k*dt; s.body.rotation.z=Math.sin(this.t*5)*0.15*k;
    if(Math.random()<dt*30){ const q=hullPoint(s, rand(-0.6,0.6)); Particles.emit(q, new THREE.Vector3(rand(-.4,.4),rand(0,.5),rand(-.4,.4)), Math.random()<.5? C_FIRE : C_SPARK, rand(0.15,0.3), rand(0.3,0.6), 1.5, 0.3); }
    return k<1; }});
  await wait(T);
  const p=g.position.clone(), vel=V0.clone().multiplyScalar(0.25);
  if(rock){
    sndAt(p, ()=>Sound.crash(L/2.2)); flash(p,0xffb070,9,0.6); addShake(0.35+L*0.1);
    Particles.burst(p,140,{speed:10,color:C_SPARK,size:0.24,life:1.1,drag:1}); Particles.burst(p,40,{speed:4,color:C_FIRE,size:0.9,life:0.9,grow:1.2});
    Particles.burst(p,40,{speed:2.5,color:new THREE.Color(.42,.35,.28),size:1.1,life:2.2,drag:0.9,grow:1.3});
    breakUpShip(s, {drift:0.7, spin:1.6, debris:1.3, vel:vel.multiplyScalar(-0.4)});
  } else {
    sndAt(p, ()=>Sound.burst()); flash(p,0xff9050,4,0.35); Particles.burst(p,50,{speed:5,color:C_SPARK,size:0.22,life:0.8});
    breakUpShip(s, {drift:0.6, spin:2.2, debris:0.5, vel});
  }
  await wait(0.4);
}
