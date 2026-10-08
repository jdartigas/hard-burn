// Laniakea's Edge: battle setup, shader warm-up, main loop, debug overlay, balance simulator, startup.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

/* ---------------- setup / teardown ---------------- */
function clearBattle(){
  clearWrecks();
  for(const s of state.ships){ scene.remove(s.group); s.tag.remove(); s.group.traverse(o=>{ if(o.geometry) o.geometry.dispose(); if(o.material){ (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{ if(m.map && m.map!==texCache.player.map && m.map!==texCache.enemy.map && m.map!==radTex) m.map.dispose(); m.dispose(); }); } }); }
  state.ships=[]; fxList.splice(0).forEach(f=>f.dispose&&f.dispose()); tweens.length=0; timers.length=0; pendingDeaths.length=0;
  document.querySelectorAll('.ftxt').forEach(e=>e.remove());
  $('#logbody').innerHTML=''; selRing.visible=tgtRing.visible=actRing.visible=hoverRing.visible=pathLine.visible=false; setTiles(new Map());
}
// A fleet is a list of class keys, duplicates allowed, e.g. ['cruiser','destroyer','destroyer'].
function cleanFleet(list){
  const f=(Array.isArray(list)?list:[]).filter(c=>CLASSES[c]).slice(0,MAX_FLEET);
  return f.length ? f : CLASSIC_FLEET.slice();
}
// Cells for a fleet on the player's side, in the same order as the list. Heavier classes are placed first, so
// they get first pick. The first of each class takes its DEPLOY home; later copies take the free zone cell nearest
// that home, keeping a one-hex gap from every placed ship when the zone allows it.
function deployFleet(list){
  // Quick battles deploy closer to the centre, but never past QUICK.maxX, so the two fleets always start apart
  const sh=state.quick? QUICK.shift : 0, maxX=state.quick? QUICK.maxX : DEPLOY_MAX_X;
  const zone=board.list.filter(c=>c.q+c.r/2<=maxX);
  const cells=new Array(list.length), taken=[], firstSeen=new Set();
  const order=list.map((cls,i)=>i).sort((a,b)=>ORDER.indexOf(list[b])-ORDER.indexOf(list[a]) || a-b);
  for(const i of order){
    const cls=list[i], [hq0,hr]=DEPLOY[cls], hq=Math.min(hq0+sh, Math.floor(maxX-hr/2)), home={q:hq,r:hr};
    let pick=null;
    if(!firstSeen.has(cls) && !taken.some(t=>t.q===hq&&t.r===hr)) pick=home;
    for(const gap of [2,1]){
      if(pick) break;
      let best=Infinity;
      for(const c of zone){
        if(taken.some(t=>hdist(t,c)<gap)) continue;
        const d=hdist(c,home)*10+Math.abs(c.r-hr);   // nearest to home, then closest in row
        if(d<best){ best=d; pick={q:c.q,r:c.r}; }
      }
    }
    firstSeen.add(cls); taken.push(pick); cells[i]=[pick.q,pick.r];
  }
  return cells;
}
function setupBattle(seed, fleets={}){
  clearBattle(); board.seed=seed; seedGameRand(seed);
  state.location=fleets.location||menuLocation(); Loc.set(state.location); state.quick=!!fleets.quick;
  const lists={player:cleanFleet(fleets.player), enemy:cleanFleet(fleets.enemy)};
  const cells={player:deployFleet(lists.player), enemy:deployFleet(lists.enemy).map(([q,r])=>[-q,-r])};
  board.deploy=[...cells.player, ...cells.enemy];
  generateTerrain(seed);
  for(const side of ['player','enemy']){
    const n={};
    lists[side].forEach((cls,i)=>{ const copy=n[cls]=(n[cls]??-1)+1; state.ships.push(createShip(cls, side, cells[side][i][0], cells[side][i][1], copy)); });
  }
  state.fleets=lists;
  state.turn=0; state.over=false; state.result=null; state.surrendered=false; state.recorded=false; state.simulated=false; state.busy=false; state.selected=null; state.mode=null; state.stats=newStats(); refreshTags();
  Sound.drum('stand', alive('player').length<=2 || alive('enemy').length<=2);   // v94: a small fleet starts at full intensity
}
// fleets: {player:[...], enemy:[...]}. Leave it out to replay the last fleets (classic on the first game).
let lastFleets={};
function startGame(fleets){
  if(fleets && (fleets.player || fleets.enemy)) lastFleets=fleets;
  Tut.setup(lastFleets);   // v85: the tutorial battle plays on Easy and is never recorded; any other battle ends it
  Sound.init(); Sound.ui();
  setupBattle(lastFleets.seed ?? Math.floor(Math.random()*1e9), lastFleets); warmUp();
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('on'));
  $('#hud').classList.add('on');
  cam.thGoal=cam.phGoal=null; cam.menu=false; cam.goal.set(-3,0,6); cam.rGoal=fitRadius(); cam.phi=0.8; cam.theta=((cam.theta%(Math.PI*2))+Math.PI*3)%(Math.PI*2)-Math.PI; tween(1.6,k=>{ cam.theta=cam.theta*(1-k); },easeInOut);
  log(`Engagement begins ${(LOCATIONS.find(l=>l.id===state.location)||LOCATIONS[0]).where} on ${state.diff} difficulty. Enemy fleet${lastFleets.enemyName?` (${lastFleets.enemyName})`:''} closing from the east: ${fleetSummary(lastFleets.enemy||CLASSIC_FLEET)}.`, 'sys');
  state.phase='starting'; updateHUD();
  after(1.2, ()=>startPlayerTurn());
  canvas.focus();
}
function toMenu(){ Tut.stop(); Sound.setMood('menu'); setupBattle(4242); state.phase='menu'; cam.menu=true; $('#hud').classList.remove('on'); showScreen('menu'); }

/* ---------------- shader warm-up ----------------
   A material's shader is compiled the first time it draws, and on Macs (ANGLE over Metal) that stalls the
   frame. Weapon effects, shields, close-up detail and wreck debris all first appear mid-battle, so this builds
   one of each and prepares it up front. Compiling alone isn't enough: Metal also builds a pipeline for each
   blend, depth and shadow combination, and textures upload, only when something is actually drawn. So the
   warm-up really renders everything once, through the full pipeline including the shadow pass, shrunk to a
   thousandth of its size at the camera target so nothing shows. The materials are kept (not disposed)
   because disposing the last user of a program deletes it. Call only when there are no wrecks. */
const warmKeep={};   // kept materials, per shadow setting (shadows change every lit shader)
function warmUp(){
  const key=renderer.shadowMap.enabled?'shadows':'flat';
  if(warmKeep[key] || wrecks.length) return;
  const t0=performance.now();
  DebrisKit.get();
  const keep=[], restore=[], junk=[];
  const a=new THREE.Vector3(0,-60,0), b=new THREE.Vector3(1,-60,0);
  junk.push(beamMesh(a,b,0.05,0xffffff,1));
  junk.push(new THREE.Mesh(new THREE.SphereGeometry(0.09,8,6), new THREE.MeshBasicMaterial({color:0xffffff})));
  junk.push(new THREE.Mesh(new THREE.ConeGeometry(0.06,0.34,6), new THREE.MeshStandardMaterial({color:0x9aa0a6, metalness:0.6, roughness:0.4, emissive:0x222222})));
  junk.push(new THREE.Mesh(new THREE.RingGeometry(0.94,1,64), new THREE.MeshBasicMaterial({color:0xffb070, transparent:true, opacity:0.55, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide})));
  junk.forEach(m=>{ m.position.copy(a); scene.add(m); });
  for(const s of state.ships) for(const o of [s.shieldMesh, s.fineMesh]) if(o && !o.visible){ o.visible=true; restore.push(o); }
  const dummy=createShip('carrier','player',0,0); dummy.group.position.y=-60;   // q,r are required since v15: without them the wreck was NaN
  const w=breakUpShip(dummy); w.fineMeshes.forEach(f=>f.im.visible=true);
  // shrink everything to invisible size at the camera target, where the view and the shadow map both see it
  updateCamera(0); const at=cam.target, tiny=0.001, scaled=[];
  const shrink=(o,pos)=>{ scaled.push([o,o.scale.clone()]); o.scale.multiplyScalar(tiny); if(pos) o.position.copy(pos); };
  junk.forEach(m=>shrink(m,at));
  w.sections.forEach(sec=>shrink(sec.outer,at)); w.shards.forEach(sh=>shrink(sh.im,at));
  for(const s of state.ships) if(s.shieldMesh) shrink(s.shieldMesh);
  renderer.compile(scene, camera);
  if(!window.__norender){ updateShadowFrustum(); composer.render(); composer.render(); }
  scaled.forEach(([o,sc])=>o.scale.copy(sc));
  restore.forEach(o=>o.visible=false);
  const grab=o=>{ if(o.material) (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>keep.push(m)); };
  junk.forEach(m=>{ scene.remove(m); grab(m); });
  w.sections.forEach(sec=>{ sec.outer.traverse(grab); scene.remove(sec.outer); });
  w.shards.forEach(sh=>{ grab(sh.im); scene.remove(sh.im); });
  wrecks.splice(wrecks.indexOf(w),1);
  scene.remove(dummy.group); dummy.tag.remove();
  warmKeep[key]=keep;
  if(URLQ.has('debug')) console.log(`warm-up ${Math.round(performance.now()-t0)} ms`);
}

/* ---------------- main loop ---------------- */
// Timers, tweens and effects: everything the game awaits. The frame loop steps it by real time; the balance
// simulator (below) steps it in large jumps instead, and the frame loop stands aside while it does.
function stepClock(dt){
  for(let i=timers.length-1;i>=0;i--){ const t=timers[i]; t.t-=dt; if(t.t<=0){ timers.splice(i,1); t.fn(); } }
  for(let i=tweens.length-1;i>=0;i--){ const t=tweens[i]; t.t+=dt; const k=Math.min(1,t.t/t.dur); t.fn(t.ease(k)); if(k>=1){ tweens.splice(i,1); t.res(); } }
  for(let i=fxList.length-1;i>=0;i--){ const f=fxList[i]; if(!f.update(dt)){ fxList.splice(i,1); f.dispose&&f.dispose(); } }
}

/* ---------------- balance simulator (console only: HB.sim) ----------------
   AI against AI with the real rules, AI and effects, but the clock jumps SIM_DT game-seconds per step and
   nothing renders, so a battle takes a fraction of a second. Both sides run the AI at Normal, so neither
   gets a difficulty modifier. The west side still moves first each turn: swap sides to cancel that out. */
const SIM_DT = 5;
let simRunning=false;
const simTick = (()=>{ const mc=new MessageChannel(); let res=null; mc.port1.onmessage=()=>{ const r=res; res=null; r&&r(); };
  return ()=>new Promise(r=>{ res=r; mc.port2.postMessage(0); }); })();   // a macrotask that background tabs don't throttle
async function simBattle(fleets, seed){
  setupBattle(seed, fleets); state.phase='starting'; state.simulated=true;   // never recorded as a real game
  let running=true;
  const pump=(async()=>{ while(running){ stepClock(SIM_DT); await simTick(); } })();
  const until=async f=>{ while(!f()) await simTick(); };
  startPlayerTurn();
  while(!state.over){
    await until(()=>state.over || (state.phase==='player' && !state.busy));
    if(state.over) break;
    await runAITurn('player'); await endPlayerTurn();
  }
  await Promise.all(pendingDeaths.splice(0));
  running=false; await pump;
  const side=sd=>{ const all=state.ships.filter(x=>x.side===sd), live=all.filter(x=>x.alive);
    return {left:live.length, of:all.length, hull:Math.round(live.reduce((a,x)=>a+x.hull,0)/all.reduce((a,x)=>a+x.hullMax,0)*100)}; };
  const sig=state.ships.map(x=>x.alive?Math.round(x.hull*10)/10:'x').join(',');
  return {sig, winner: state.result==='player'?'west': state.result==='enemy'?'east':'draw', byValue: alive('player').length>0 && alive('enemy').length>0, turns:state.turn, west:side('player'), east:side('enemy')};
}
// HB.sim({west:[...], east:[...]}, n): n battles, fleets swapping sides each battle so the first-move advantage
// cancels. Reports wins for the fleet passed as `west`.
async function sim(fleets, n=20, seed0=1){
  const prevDiff=state.diff, prevScale=timeScale; state.diff='normal'; timeScale=1; simRunning=true; window.__norender=true;
  const out={a:0, b:0, draw:0, byValue:0, turns:0, n, aLeft:0, bLeft:0, battles:[]};
  try{
    for(let i=0;i<n;i++){
      const swap=i%2===1, f= swap? {player:fleets.east, enemy:fleets.west, quick:fleets.quick} : {player:fleets.west, enemy:fleets.east, quick:fleets.quick};
      const r=await simBattle(f, seed0+i);
      const aWon= swap? r.winner==='east' : r.winner==='west', bWon= swap? r.winner==='west' : r.winner==='east';
      if(aWon) out.a++; else if(bWon) out.b++; else out.draw++;
      if(r.byValue) out.byValue++; out.turns+=r.turns; out.battles.push(`${seed0+i}:${r.winner}:${r.turns}:${r.sig}`); out.aLeft+=(swap?r.east:r.west).left; out.bLeft+=(swap?r.west:r.east).left;
    }
  } finally { simRunning=false; window.__norender=false; state.diff=prevDiff; timeScale=prevScale; toMenu(); }
  out.turns=+(out.turns/n).toFixed(1); out.aLeft=+(out.aLeft/n).toFixed(1); out.bLeft=+(out.bLeft/n).toFixed(1);
  out.aWinRate=Math.round((out.a+out.draw/2)/n*100);
  return out;
}
let elapsed=0;
/* ---------------- big moments (v62, Jon) ----------------
   Every ship's death slows time for a moment; medium and heavy hulls also pull the camera in on the explosion, then
   hand it back. Scaled by hull size, so a battle's dozen kills don't each stop the game. Skipped in simulations, and
   when the system asks for reduced motion; no camera push if the player has moved the camera this turn. */
const MOMENT = { ease:0.3,
  small:  {scale:0.55, hold:0.35, push:0},      // up to 150 m
  medium: {scale:0.4,  hold:0.7,  push:0.8},    // 185 to 250 m
  capital:{scale:0.25, hold:1.2,  push:0.62} }; // 275 m and up
let moment=null;
function bigMoment(s){
  if(state.simulated || simRunning || window.__norender || REDUCED) return;
  const tier= s.C.m>=275? 'capital' : s.C.m>=185? 'medium' : 'small', M=MOMENT[tier];
  if(moment && moment.M.scale<=M.scale){ moment.t=Math.min(moment.t, MOMENT.ease); return; }   // a bigger one is running: just extend it
  const back= moment && moment.back;   // a smaller one is running: take over, but keep its way back
  moment={M, t:0, back};
  if(M.push && !cam.touched && !cam.menu){ if(!moment.back) moment.back={goal:cam.goal.clone(), r:cam.rGoal};
    const p=s.group.position; cam.follow=null; cam.goal.set(p.x,0,p.z); cam.rGoal=Math.max(MIN_ZOOM, s.len*4, cam.rGoal*M.push); }
}
function updateMoment(raw){
  if(!moment) return;
  moment.t+=raw; const M=moment.M, e=MOMENT.ease, t=moment.t;
  const k= t<e? t/e : t<e+M.hold? 1 : Math.max(0, 1-(t-e-M.hold)/e);
  timeScale=1+(M.scale-1)*k;
  if(t>=e+M.hold+e){ timeScale=1; if(moment.back && !cam.touched){ cam.goal.copy(moment.back.goal); cam.rGoal=moment.back.r; } moment=null; }
}
function frame(){
  requestAnimationFrame(frame);
  const fT0=DEBUG? performance.now() : 0; if(DEBUG) renderer.info.reset();
  const rawDt=clock.getDelta(); updateMoment(Math.min(rawDt,0.1)); const dt=Math.min(rawDt,0.05)*timeScale*(speedSetting==='fast' && state.phase==='enemy'? ENEMY_FAST : 1); elapsed+=dt;
  // one-time frame-rate check early in a battle: step graphics down if the machine is struggling (never overrides a manual choice)
  if(!perfCheck.done && state.phase==='player' && !document.hidden && !window.__norender && rawDt<0.5){ perfCheck.t+=rawDt; perfCheck.n++;
    if(perfCheck.t>6){ perfCheck.done=true; const ms=perfCheck.t/perfCheck.n*1000;
      if(ms>40 && store.get('gfx',null)===null && quality!=='low'){ quality= quality==='high'?'medium':'low'; applyQuality(); log(`Graphics lowered to ${QUALITY[quality].label} to keep the frame rate up. Press G to change it.`,'sys'); } } }
  if(!simRunning) stepClock(dt);
  Particles.update(dt);
  lightPool.forEach(L=>{ if(L.t>0){ L.t-=dt; L.l.intensity=L.i*Math.max(0,L.t/L.max); } else L.l.intensity=0; });
  // camera pan keys
  if(keys.size && !cam.menu){ const sp=cam.radius*0.9*dt; cam.follow=null; cam.touched=true; if(keys.has('w')||keys.has('arrowup')) panBy(0,-sp); if(keys.has('s')||keys.has('arrowdown')) panBy(0,sp); if(keys.has('a')||keys.has('arrowleft')) panBy(-sp,0); if(keys.has('d')||keys.has('arrowright')) panBy(sp,0); }
  updateCamera(dt);
  updateShadowFrustum();
  if(gtao.enabled){ const aoR=clamp(cam.radius*0.02,0.06,1.2); if(!(Math.abs(aoR-lastAoR)/lastAoR<0.08)){ lastAoR=aoR; gtao.updateGtaoMaterial({radius:aoR, thickness:aoR*2.5, distanceExponent:1.4, scale:1.15, samples:16}); } }
  // ships
  for(const s of state.ships){ if(!s.alive) continue;
    const bob=Math.sin(elapsed*1.1+s.phase)*0.07; s.group.position.y=s.baseY+bob; s.body.rotation.x=Math.sin(elapsed*0.7+s.phase)*0.02;
    let heat=0;
    s.engines.forEach((e,ei)=>{ const target=0.3+(e.boost||0)*1.0; e.cur=lerp(e.cur||0.3,target,Math.min(1,dt*3)); heat=Math.max(heat,e.cur);
      const L=0.5+e.cur*0.9; e.group.scale.set(1,1,L);
      for(const m of e.mats){ m.uniforms.uPow.value=e.cur; m.uniforms.uTime.value=elapsed+ei*1.7; }
      const fl=0.92+Math.random()*0.08; e.sprite.material.opacity=Math.min(0.45,0.12+e.cur*0.25)*fl; e.sprite.scale.setScalar(e.r*(1.5+e.cur*1.4)*fl);
      e.mach.material.opacity=Math.min(1,e.cur*0.9)*fl; e.mach.scale.setScalar(0.7+e.cur*0.5);
      if(e.cur>0.75 && Math.random()<dt*40){ e.group.getWorldPosition(V); const dir=new THREE.Vector3(0,0,-1).transformDirection(e.group.matrixWorld);
        Particles.emit(V, dir.multiplyScalar(rand(9,16)).add(new THREE.Vector3(rand(-.6,.6),rand(-.6,.6),rand(-.6,.6))), e.col, rand(0.08,0.18)*SHIP_SCALE, rand(0.25,0.5), 1.5); }
    });
    if(s.mats.bellIn){ if(!s.bellBase) s.bellBase=s.mats.bellIn.color.clone(); s.mats.bellIn.color.copy(s.bellBase).multiplyScalar(1+heat*2.2); }
    if(s.fineMesh) s.fineMesh.visible = camera.position.distanceTo(s.group.position) < 13;
    if(s.turrets && s.turrets.length) updateTurrets(s, dt);
    updateDamageFx(s, dt);
    s.lights.forEach((l,i)=>{ l.visible=((elapsed*1.3+i*0.5+s.phase)%1.6)<0.12 || i===2; });
    const u=s.shMat.uniforms; u.uTime.value=elapsed; if(u.uFlash.value>0){ u.uFlash.value=Math.max(0,u.uFlash.value-dt*1.8); if(u.uFlash.value===0) s.shieldMesh.visible=false; }
  }
  updateWrecks(dt);
  board.rocks.forEach(m=>{ const sp=m.userData.spin; if(sp){ m.rotation.x+=sp.x*dt; m.rotation.y+=sp.y*dt; m.rotation.z+=sp.z*dt; } });
  if(window.__planet) window.__planet.rotation.y+=dt*0.004;
  Env.update(dt); Loc.update();
  // rings
  const sel=state.selected; selRing.visible=!!sel && state.phase==='player';
  if(sel){ selRing.position.copy(hexToWorld(sel.q,sel.r,0.04)).lerp(new THREE.Vector3(sel.group.position.x,0.04,sel.group.position.z),1); selRing.material.opacity=0.6+Math.sin(elapsed*4)*0.3; }
  updateBusy(Math.min(rawDt,0.1)); Tut.tick(); updateFleetGlow();
  if(state.acting && state.acting.alive){ actRing.position.set(state.acting.group.position.x,0.04,state.acting.group.position.z); actRing.material.opacity=0.5+Math.sin(elapsed*5)*0.3; }
  if(state.hoverTarget && state.hoverTarget.alive && state.phase==='enemy'){ tgtRing.visible=true; tgtRing.position.set(state.hoverTarget.group.position.x,0.04,state.hoverTarget.group.position.z); }
  tgtRing.material.opacity=0.6+Math.sin(elapsed*6)*0.3;
  tiles.material.opacity=clamp(cam.radius/40,0.08,0.32);
  // labels. v84 (round 3, #10): tags that would overlap stack upward. The selected or hovered ship's tag and then the
  // lowest on screen (nearest the camera) keep their true place; each tag eases to its offset so a reshuffle never jumps.
  const showTags = state.phase!=='menu', live=[];
  // fade out between radius 20 and 12 rather than cutting off at 16, which blinked every tag while zooming
  const zf=clamp((cam.radius-12)/8,0,1);
  for(const s of state.ships){ if(!s.alive || !showTags){ setTag(s,0); continue; }
    const p=s.group.position.clone(); p.y+=1.0+s.len*0.1; const sp=toScreen(p);
    if(!sp){ setTag(s,0); continue; }
    const focus=(state.rosterHover===s || state.hoverShip===s || s===sel);
    const op=+Math.max(state.hoverShip===s?0.9:0, zf*(focus?1:0.85)).toFixed(2);
    if(!op){ setTag(s,0); s.tag._dy=0; continue; }
    const t=tagSize(s); live.push({s, x:sp.x, y:sp.y, w:t._w, h:t._h, op, pri:focus?1:0}); }
  live.sort((a,b)=>b.pri-a.pri || b.y-a.y);
  const placed=[];
  for(const L of live){ let bottom=L.y;
    for(let it=0; it<live.length; it++){ const hit=placed.find(P=>Math.abs(P.x-L.x)<(P.w+L.w)/2+2 && bottom>P.top-2 && bottom-L.h<P.bottom+2);
      if(!hit) break; bottom=hit.top-2; }
    L.top=bottom-L.h; L.bottom=bottom; placed.push(L);
    const t=L.s.tag, want=bottom-L.y; let dy=t._dy===undefined? want : t._dy+(want-t._dy)*Math.min(1,rawDt*12); if(Math.abs(want-dy)<0.3) dy=want; t._dy=dy;
    setTag(L.s, L.op, `translate3d(${L.x.toFixed(1)}px,${(L.y+dy).toFixed(1)}px,0) translate(-50%,-100%) scale(${state.rosterHover===L.s?1.12:1})`); }
  SV.update(dt);   // ship pictures and the viewer aim the scene pass before the frame renders
  if(!window.__norender) composer.render();
  if(DEBUG){ dbgFrames.push([rawDt*1000, performance.now()-fT0, renderer.info.render.calls, renderer.info.render.triangles]); debugTick(); }
}
let dbgEl=null, dbgErr={}, dbgT=0, dbgGpu='', dbgFrames=[], dbgPerf='';
function debugTick(){
  const gl=renderer.getContext(); let e; while((e=gl.getError())!==gl.NO_ERROR){ dbgErr[e]=(dbgErr[e]||0)+1; }
  if(performance.now()-dbgT<500) return; dbgT=performance.now();
  // performance over the last half second: what a player can read off when the game feels slow
  if(dbgFrames.length){ const f=dbgFrames.splice(0), n=f.length, avg=i=>f.reduce((a,x)=>a+x[i],0)/n, worst=Math.max(...f.map(x=>x[0]));
    dbgPerf=`fps ${Math.round(1000/avg(0))}  frame ${avg(0).toFixed(1)} ms avg, ${worst.toFixed(0)} worst  game code ${avg(1).toFixed(1)} ms\ndraw calls ${Math.round(avg(2))}  triangles ${(avg(3)/1e6).toFixed(2)}M  ${document.hidden?'TAB HIDDEN':''}`; }
  if(!dbgEl){ dbgEl=document.createElement('pre'); dbgEl.style.cssText='position:fixed;left:8px;bottom:8px;z-index:50;margin:0;padding:8px 10px;background:rgba(0,0,0,.85);color:#9fe;font:12px/1.4 monospace;pointer-events:none;white-space:pre-wrap;max-width:60vw';
    document.body.appendChild(dbgEl); const ext=gl.getExtension('WEBGL_debug_renderer_info'); dbgGpu= ext? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); }
  const r1=composer.renderTarget1;
  dbgEl.textContent=`Version ${GAME_VERSION}  battle seed ${board.seed}\n${dbgPerf}\nGPU ${dbgGpu}\nquality ${quality}  devicePixelRatio ${window.devicePixelRatio}  render scale ${renderer.getPixelRatio()}\ncanvas ${canvas.width}x${canvas.height}  effect buffers ${r1.width}x${r1.height}  scene buffer ${scenePass.rt.width}x${scenePass.rt.height}\nshadows ${sun.castShadow?sun.shadow.mapSize.x:'off'}  smaa ${smaa.enabled?'on':'off'}  ao ${gtao.enabled?'on':'off'}\nGL errors ${Object.keys(dbgErr).length? Object.entries(dbgErr).map(([k,v])=>'0x'+(+k).toString(16)+' x'+v).join(', ') : 'none'}`;
}
const clock=new THREE.Clock();
let lastAoR=1; const perfCheck={t:0,n:0,done:false};
function onResize(){ const w=innerWidth, h=innerHeight; renderer.setSize(w,h,false); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w,h); camera.aspect=w/h; camera.updateProjectionMatrix();
  Particles.mat.uniforms.uScale.value = h*renderer.getPixelRatio()/(2*Math.tan(camera.fov*Math.PI/360)); if(!cam.menu) cam.rGoal=Math.max(cam.rGoal*0+fitRadius(), 18); }
addEventListener('resize', onResize);
canvas.addEventListener('webglcontextlost', e=>{ e.preventDefault(); log('Graphics driver reset. Reloading the view.','sys'); });
canvas.addEventListener('webglcontextrestored', ()=>{ location.reload(); });
function applyQuality(){
  const Q=QUALITY[quality];
  const prRaw = URLQ.has('pr') ? parseFloat(URLQ.get('pr'))||1 : Math.min(window.devicePixelRatio||1, Q.pr);
  renderer.setPixelRatio(Math.max(1, Math.floor(prRaw)));   // whole-number scales only
  const on=Q.shadow>0 && URLQ.get('shadows')!=='0';
  if(renderer.shadowMap.enabled!==on){ renderer.shadowMap.enabled=on; scene.traverse(o=>{ const m=o.material; if(m) (Array.isArray(m)?m:[m]).forEach(x=>x.needsUpdate=true); }); }
  sun.castShadow=on;
  if(on && sun.shadow.mapSize.x!==Q.shadow){ sun.shadow.mapSize.set(Q.shadow,Q.shadow); if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map=null; } sun.shadow.camera.right=-1; }
  gtao.enabled=Q.ao && URLQ.get('ao')!=='0'; lastAoR=1;
  scenePass.setSamples(0); smaa.enabled = Q.aa && URLQ.get('aa')!=='0';
  Env.setQuality(quality);
  document.querySelectorAll('.btn-gfx').forEach(b=>b.textContent='Graphics: '+Q.label);
  onResize();
}
function cycleQuality(){ const order=['high','medium','low']; quality=order[(order.indexOf(quality)+1)%3]; store.set('gfx',quality); Sound.ui(); applyQuality(); }
document.querySelectorAll('.btn-gfx').forEach(b=>b.onclick=cycleQuality);
(function watchDpr(){ try{ matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', ()=>{ applyQuality(); watchDpr(); }, {once:true}); }catch(e){} })();
document.addEventListener('visibilitychange', ()=>{ clock.getDelta(); });

// boot: menu backdrop battle
setupBattle(4242); applyQuality(); warmUp(); cam.rGoal=46; cam.radius=70; cam.phi=1.12; frame();
window.HB = {sim, simBattle, WEAPONS, CLASSES, ABIL, PD_NET, aiBuild, AI_PLANS, BUDGETS, PRESETS, wrecks, explodeShip, destroyRock, Particles, render:()=>{ updateShadowFrustum(); composer.render(); }, applyQuality:(q)=>{ quality=q; applyQuality(); }, gtao, zoomTo, board, Sound, cam, fireWeapon, toScreen, hexToWorld, state, startGame, endPlayerTurn, runAITurn, beginSideTurn, alive, setTimeScale:v=>timeScale=v, startPlayerTurn, select, fireAll, playerMove, reachable};
