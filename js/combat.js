// Laniakea's Edge: firing, abilities, movement, the AI, turn flow and the turn limit.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

/* ---------------- combat ---------------- */
function newStats(){ const z=()=>({dealt:0,taken:0,shots:0,hits:0,kills:0,ints:0,screened:0}); return {player:z(), enemy:z()}; }
async function fireWeapon(att, wi, tgt){
  const w=att.weapons[wi], d=w.def;
  if(!att.alive || !tgt.alive || !weaponReady(w)) return false;
  let p=hitChance(att,d,tgt); if(p<=0) return false;
  p=clamp(p+slotAcc(w),5,95);   // a damaged weapon aims worse
  if(state.acting===att && !cam.touched && frameShot(att,tgt)) await wait(0.3);   // AI shots: frame both ends, unless the player has taken the camera
  await faceTarget(att,tgt);
  w.wait=d.reload; w.firedTurn=state.turn; if(w.ammo!==undefined) w.ammo--;
  const cover=d.guided? pdCover(tgt) : null, pInt=d.guided? clamp(cover.p*d.pdcF,0,0.8)*(att.fx.ambush?0.5:1) : 0, screen= cover && cover.by!==tgt ? cover.by : null;
  const outcomes=[], dmgRoll=[];
  for(let i=0;i<d.shots;i++){ let o=gameRand()*100<p?'hit':'miss'; if(o==='hit' && d.guided && gameRand()<pInt) o='int'; outcomes.push(o); dmgRoll.push(d.dmg*(0.85+gameRand()*0.3)); }
  // Resolve the volley now, shot by shot in order, against a copy of the target. The effects land in whatever order
  // their (cosmetic) flight paths make them, so each impact only applies its precomputed share: subtraction is the
  // same in any order, and the shot that kills is fixed here rather than by which effect arrives first.
  const sim={shield:tgt.shield, hull:tgt.hull, armor:tgt.armor, fx:tgt.fx}; let killShot=-1;
  const simSys={};   // criticals are decided here too, in shot order, so a seed always plays out the same (damage.js)
  const res=outcomes.map((o,i)=>{ if(o!=='hit' || killShot>=0) return {s:0,h:0}; const r=applyDamage(sim,d,dmgRoll[i]); if(sim.hull<=0.5) killShot=i; else r.crit=rollCrit(tgt,r.h,simSys,sim.hull); return r; });
  const st=state.stats[att.side]; st.shots+=d.shots;
  let S=0,H=0,hits=0,ints=0,misses=0, missShown=false;
  const onEvent=(i,o)=>{
    if(o==='hit'){ hits++; st.hits++;
      const r=res[i]; S+=r.s; H+=r.h;
      if(!tgt.isRock){ st.dealt+=r.s+r.h; state.stats[tgt.side].taken+=r.s+r.h; att.st.dealt+=r.s+r.h; tgt.st.taken+=r.s+r.h; }
      if(!tgt.alive) return;
      tgt.shield=Math.max(0,tgt.shield-r.s); tgt.hull-=r.h; if(tgt.isRock) rockDamaged(tgt);
      impactFx(tgt,r,att.group.position, d.kind==='rail'||d.big?1.6:1);
      if(r.h>=0.5) floatText(tgt, Math.round(r.h), r.h>=25?'hu big':'hu'); else if(r.s>0) floatText(tgt, Math.round(r.s), 'sh');
      if(r.crit && i!==killShot) applyCrit(tgt, r.crit);
      if(i===killShot){ tgt.hull=0; if(tgt.isRock) destroyRock(tgt, att); else { tgt.alive=false; st.kills++; att.st.kills++; destroyShip(tgt, att); } }
      refreshTags(); updateHUD();
    } else if(o==='int'){ ints++; const ds=state.stats[tgt.side]; ds.ints++; if(screen) ds.screened++; if(!tgt.isRock) (screen||tgt).st.ints++;
      if(ints===1){ floatText(tgt, screen? 'Screened':'Intercepted','int',0.4); if(screen) floatText(screen,'Point defense','int',0.2); } }
    else { misses++; if(!missShown){ missShown=true; floatText(tgt,'Miss','miss',0.4); } }
  };
  await playWeaponFx(d, att, tgt, outcomes, onEvent, screen, wi);
  const cls= att.side==='player'?'p':'e';
  let msg=`${att.name} ${d.name.toLowerCase()} → ${tgt.name}: `;
  const byScr= screen? ` by ${screen.name}'s screen` : '';
  if(hits===0) msg += ints? `${ints} intercepted${byScr}` : 'missed';
  else { msg += `${Math.round(S+H)} damage`; if(S>0.5 && H>0.5) msg+=` (${Math.round(S)} to shields)`; else if(H<0.5) msg+=' to shields'; if(ints) msg+=`, ${ints} intercepted${byScr}`; if(d.shots>1) msg+=`, ${hits}/${d.shots} hit`; }
  log(msg, cls);
  updateHUD();
  return true;
}
const pendingDeaths=[];
function destroyShip(s, by){
  log(`${s.name} destroyed${by?` by ${by.name}`:''}`, 'k');
  const wc=cellAt(s.q,s.r); if(wc && wc.t==='open') wc.t='debris';   // the wreck leaves a debris field: cover, double movement
  const pr=explodeShip(s); pendingDeaths.push(pr);
  if(state.selected===s) select(null);
  checkEnd();
}
function firingOrder(s){ const pri={pulse:0,beam:1,rail:2,missile:3,fighter:3}; return s.weapons.map((w,i)=>i).sort((a,b)=>pri[s.weapons[a].def.kind]-pri[s.weapons[b].def.kind]); }
async function fireAll(att, tgt){
  let any=false;
  for(const i of firingOrder(att)){ if(!tgt.alive || state.over) break; const w=att.weapons[i]; if(weaponReady(w) && hitChance(att,w.def,tgt)>0){ if(await fireWeapon(att,i,tgt)){ any=true; await wait(0.12); } } }
  return any;
}
async function useAbility(s, target=null){
  const a=s.ability; if(!abilityReady(s)) return false;
  const k=a.key;
  if(k==='burn'){ s.mp+=3; Sound.power(); s.engines.forEach(e=>e.boost=1.5); floatText(s,'+3 movement','heal'); }
  else if(k==='ecm'){ for(const o of alive(s.side)) if(hdist(o,s)<=2){ o.fx.ecm=1; Particles.burst(o.group.position,30,{speed:3,color:C_CYAN,size:0.3,life:0.8}); }
    Sound.power(); const ring=hexRing(0.5,0.7,COL.cyan,0.8); ring.position.copy(s.group.position).setY(0.1); scene.add(ring);
    addFx({t:0,update(dt){ this.t+=dt; const k=this.t/1; ring.scale.setScalar(1+k*HEX*2.6*1.6); ring.material.opacity=0.8*(1-k); return k<1; }, dispose(){ disposeMesh(ring); }}); }
  else if(k==='overcharge'){ const add=Math.min(s.shieldMax-s.shield, s.shieldMax*0.6); s.shield+=add; shieldFlash(s, s.group.position.clone().add(new THREE.Vector3(0,3,0))); s.shMat.uniforms.uFlash.value=2; Sound.shield(); Sound.power(); floatText(s,`+${Math.round(add)} shields`,'sh'); }
  else if(k==='pdsurge'){ for(const o of alive(s.side)) if(hdist(o,s)<=2){ o.fx.pdsurge=1; Particles.burst(o.group.position,26,{speed:3,color:new THREE.Color(1,.85,.4),size:0.28,life:0.7}); } Sound.pdc(); Sound.power(); floatText(s,'PD surge','heal'); }
  else if(k==='ambush'){ s.mp+=2; s.fx.ambush=1; Sound.power(); s.engines.forEach(e=>e.boost=1.5); floatText(s,'Ambush','heal'); }
  else if(k==='brace'){ s.fx.brace=1; Sound.power(); floatText(s,'Braced','heal'); Particles.burst(s.group.position,24,{speed:2,color:new THREE.Color(1,.8,.4),size:0.35,life:0.8}); }
  else if(k==='resupply'){ if(!target) return false;
    const hull=Math.min(a.def.amount, target.hullMax-target.hull), sh=Math.min(target.shieldMax/2, target.shieldMax-target.shield); let salvos=0;
    target.hull+=hull; target.shield+=sh; s.st.repaired+=hull; target.weapons.forEach(w=>{ if(w.ammo!==undefined && w.ammo<w.def.ammo){ w.ammo++; salvos++; } }); const fixed=repairAll(target);
    const a0=s.group.position.clone(), b0=target.group.position.clone(); Sound.power();
    for(let i=0;i<24;i++){ after(i*0.03,()=>{ const p=a0.clone().lerp(b0,Math.random()); Particles.emit(p.setY(p.y+0.4),new THREE.Vector3(0,0.5,0),new THREE.Color(.55,.9,1),0.3,0.7,0.5); }); }
    Particles.burst(b0,30,{speed:2,color:new THREE.Color(.55,.9,1),size:0.3,life:0.9});
    floatText(target,[hull>=1?`+${Math.round(hull)} hull`:'', salvos?`+${salvos} salvo${salvos>1?'s':''}`:'', fixed?`${fixed} system${fixed>1?'s':''} repaired`:''].filter(Boolean).join(', ')||'Resupplied','heal'); }
  else if(k==='blackout'){ if(!target) return false; target.blackout=s.side;   // lasts until this side's next turn begins
    const a0=s.group.position.clone(), b0=target.group.position.clone(); Sound.power();
    for(let i=0;i<30;i++){ after(i*0.02,()=>{ const p=a0.clone().lerp(b0,i/30); Particles.emit(p.setY(p.y+0.3),new THREE.Vector3().randomDirection().multiplyScalar(0.6),new THREE.Color(.75,.5,1),0.22,0.5,0.4); }); }
    Particles.burst(b0,40,{speed:3,color:new THREE.Color(.75,.5,1),size:0.3,life:0.8}); floatText(target,'Blackout','int'); }
  else if(k==='repair'){ if(!target) return false; const add=Math.min(ABIL.repair.amount, target.hullMax-target.hull); target.hull+=add; s.st.repaired+=add; Sound.power();
    const a0=s.group.position.clone(), b0=target.group.position.clone();
    for(let i=0;i<24;i++){ after(i*0.03,()=>{ const p=a0.clone().lerp(b0,Math.random()); Particles.emit(p.setY(p.y+0.4),new THREE.Vector3(0,0.5,0),new THREE.Color(.5,1,.5),0.3,0.7,0.5); }); }
    Particles.burst(b0,30,{speed:2,color:new THREE.Color(.5,1,.5),size:0.3,life:0.9}); floatText(target,`+${Math.round(add)} hull`,'heal'); }
  a.wait=a.def.reload;
  log(`${s.name}: ${a.def.name.toLowerCase()}${target&&target!==s?` on ${target.name}`:''}`, s.side==='player'?'p':'e');
  refreshTags(); updateHUD(); await wait(0.4); return true;
}
async function moveShip(s, path){
  if(path.length<2) return;
  const dest=path[path.length-1]; s.mp-=dest.cost; s.q=dest.q; s.r=dest.r; s.moved=true;
  const pts=path.map(p=>hexToWorld(p.q,p.r,s.baseY));
  // start from current (possibly bobbing) position; add a lead-in point aligned to facing for a smoother turn
  pts[0]=s.group.position.clone();
  const curve=new THREE.CatmullRomCurve3(pts,false,'centripetal',0.4); const len=curve.getLength();
  const dur=clamp(len/7.5, 0.45, 3.2);
  Sound.move(); s.engines.forEach(e=>e.boost=(e.boost||0)+1);
  const y0=s.group.rotation.y; let yaw=y0;
  await tween(dur, k=>{ const p=curve.getPointAt(k); s.group.position.x=p.x; s.group.position.z=p.z;
    const t=curve.getTangentAt(Math.min(k+0.02,1)); const ty=Math.atan2(t.x,t.z); const dd=shortestAngle(yaw,ty); yaw+=dd*Math.min(1,0.18); s.group.rotation.y=yaw; s.body.rotation.z=-dd*0.8; }, easeInOut);
  s.body.rotation.z=0; s.engines.forEach(e=>e.boost=Math.max(0,(e.boost||0)-1));
}

/* ---------------- AI ---------------- */
function targetValue(t){ return {ewar:1.4, dreadnought:1.3, carrier:1.25, tender:1.2, cruiser:1.2, destroyer:1.05, frigate:1.0, corvette:0.9, patrol:0.85, fastattack:0.85}[t.cls]||1; }
function scoreAttack(att, w, tgt, from, D){
  const e=expected(att,w,tgt,from); if(!e.p) return 0;
  let v=(e.hull + (e.dmg-e.hull)*0.5)*targetValue(tgt);
  if(e.kill) v+=45*targetValue(tgt);
  v*= 1 + D.focus*(1-tgt.hull/tgt.hullMax)*0.8;
  return v;
}
function threatAt(s, cell){
  let thr=0; const pseudo={...s, q:cell.q, r:cell.r, fx:s.fx};
  for(const e of alive(other(s.side))){
    for(const w of e.weapons){ if(w.ammo===0) continue; const d=w.def; const dist=hdist(e,cell); const eff=Math.max(1,dist-Math.floor(e.mp*0.7));
      if(eff>d.range) continue; const p=hitCore(d, e.side, eff, pseudo, cell, true);
      thr += p/100*d.shots*d.dmg*(d.guided?0.6:1)/(w.wait>1?2:1); }
  }
  return thr;
}
function evalCell(s, cell, D){
  const from={q:cell.q, r:cell.r}; let off=0; const foes=alive(other(s.side));
  let ready=0, idle=0;
  for(const w of s.weapons){ if(!weaponReady(w)) continue; let best=0; for(const t of foes) best=Math.max(best, scoreAttack(s,w.def,t,from,D)); off+=best; ready++; if(best===0) idle++; }
  const late=Math.max(0.3, 1-state.turn/10);
  // the turn limit decides on fleet value: in the last three turns a side that is ahead protects its lead and a
  // side that is behind presses, instead of both playing as if the battle had no end
  let press=1, guard=1;
  if(turnLimit()-state.turn<=2){ const lead=fleetValue(s.side)-fleetValue(other(s.side)); if(lead>0) guard=2.5; else if(lead<0){ press=1.3; guard=0.3; } }
  let score=off*D.aggr*press - threatAt(s,cell)*D.caution*late*guard*(s.hull/s.hullMax<0.4?1.5:1);
  const c=cellAt(cell.q,cell.r); if(c.t==='debris') score+=4;
  // stand-off preference for fragile artillery, closing pressure for everyone else
  const near=foes.reduce((m,f)=>Math.min(m,hdist(f,cell)),99);
  if(s.cls==='carrier' || s.cls==='cruiser' || s.cls==='dreadnought' || s.cls==='tender') score -= Math.max(0,5-near)*6*late;
  // support ships position for their passives: the tender near damaged allies, the jammer with enemies inside its
  // field and allies inside its uplink
  if(s.C.fieldRepair){ for(const o of alive(s.side)) if(o!==s && hdist(o,cell)<=2) score += (1-o.hull/o.hullMax)*14; }
  if(s.C.jam){ score += foes.filter(f=>hdist(f,cell)<=JAM.range).length*5 + alive(s.side).filter(o=>o!==s && hdist(o,cell)<=JAM.uplink).length*3; }
  // closing pressure for every ready weapon that can't reach anything from here. It used to apply only when no weapon
  // could fire, and railguns without a range limit always can: railgun ships then sat back and never brought their
  // beams and torpedoes into range (v50). With nothing in reach this is the same as before.
  if(ready) score -= near*1.8*idle/ready;
  score += (gameRand()-0.5)*D.noise;
  return score;
}
async function aiShip(s){
  const D = s.side==='enemy'? DIFF[state.diff] : DIFF.normal;
  if(s.ability.key==='overcharge' && abilityReady(s) && s.shield<s.shieldMax*0.4) await useAbility(s);
  let reach=reachable(s);
  const bestOffense = r => { let b=0; for(const [,c] of r){ if(c.blocked) continue; for(const w of s.weapons){ if(!weaponReady(w)) continue; for(const t of alive(other(s.side))) if(hitChance(s,w.def,t,c)>0) b=1; } if(b) break; } return b; };
  if(s.ability.key==='burn' && abilityReady(s) && !bestOffense(reach)){ await useAbility(s); reach=reachable(s); }
  // ambush when its missiles are loaded and an enemy is (or will be, with the extra speed) inside their reach
  if(s.ability.key==='ambush' && abilityReady(s) && s.weapons.some(w=>w.def.guided && weaponReady(w)) && alive(other(s.side)).some(t=>hdist(s,t)<=s.weapons.find(w=>w.def.guided).def.range+s.mp+2)){ await useAbility(s); reach=reachable(s); }
  let best=null, bestScore=-1e9;
  for(const [k,c] of reach){ if(c.blocked) continue; const sc=evalCell(s,c,D) + (k===key(s.q,s.r)?2:0) - c.cost*0.3; if(sc>bestScore){ bestScore=sc; best=k; } }
  if(best && best!==key(s.q,s.r)){ await moveShip(s, pathTo(reach,best)); await wait(0.1); }
  if(state.over) return;
  if(s.ability.key==='pdsurge' && abilityReady(s)){ const n=alive(s.side).filter(o=>hdist(o,s)<=2).length; const missiles=alive(other(s.side)).some(e=>e.weapons.some(w=>w.def.guided && w.ammo!==0)); if(missiles && (n>=2 || threatAt(s,s)>30)) await useAbility(s); }
  if(s.ability.key==='ecm' && abilityReady(s)){ const n=alive(s.side).filter(o=>hdist(o,s)<=2).length; if(n>=2 || threatAt(s,s)>30) await useAbility(s); }
  // resupply whichever ally needs it most: hull, shields, and above all empty launchers
  if(s.ability.key==='resupply' && abilityReady(s)){ let tgt=null, best=30;
    for(const o of abilityTargets(s)){ const v=(o.hullMax-o.hull) + (o.shieldMax-o.shield)*0.4 + o.weapons.filter(w=>w.ammo!==undefined && w.ammo<w.def.ammo).length*25; if(v>best){ best=v; tgt=o; } }
    if(tgt) await useAbility(s,tgt); }
  // black out the enemy that would hurt most this turn, preferring ships that still carry missiles or fighters
  if(s.ability.key==='blackout' && abilityReady(s)){ let tgt=null, best=0;
    for(const o of abilityTargets(s)){ if(o.blackout) continue; const v=classDpt(o.cls)*(o.weapons.some(w=>w.def.guided && w.ammo!==0)?1.4:1); if(v>best){ best=v; tgt=o; } }
    if(tgt) await useAbility(s,tgt); }
  if(s.ability.key==='repair' && abilityReady(s)){ let tgt=null, miss=34; for(const o of alive(s.side)){ if(o!==s && hdist(o,s)<=3 && o.hullMax-o.hull>miss){ miss=o.hullMax-o.hull; tgt=o; } } if(tgt) await useAbility(s,tgt); }
  for(const i of firingOrder(s)){ if(state.over) return; const w=s.weapons[i]; if(!weaponReady(w)) continue;
    let tgt=null, bv=0; for(const t of alive(other(s.side))){ const v=scoreAttack(s,w.def,t,s,D)*(1+(gameRand()-.5)*D.noise/40); if(v>bv){ bv=v; tgt=t; } }
    if(!tgt && !w.def.guided){ // no clean shot: blast an asteroid that blocks the line to the nearest enemy
      const foes=alive(other(s.side)); const foe=foes.sort((a,b)=>hdist(a,s)-hdist(b,s))[0];
      if(foe && hdist(s,foe)<=w.def.range+3){ const line=hexLine(s,foe); for(let k=1;k<line.length-1;k++){ const c=cellAt(line[k].q,line[k].r); if(c && c.t==='rock' && c.rock && c.rock.alive){ if(hitChance(s,w.def,c.rock)>0) tgt=c.rock; break; } } }
      if(tgt){ await fireWeapon(s,i,tgt); await wait(0.15); continue; }
    }
    // save guided ammo for worthwhile shots
    if(tgt && w.ammo!==undefined && bv<8 && gameRand()<0.7) continue;
    if(tgt){ state.hoverTarget=tgt; await fireWeapon(s,i,tgt); await wait(0.15); }
  }
  if(state.over) return;
  if(s.ability.key==='brace' && abilityReady(s) && (threatAt(s,s)>45 || s.hull<s.hullMax*0.5)) await useAbility(s);
  if(s.ability.key==='overcharge' && abilityReady(s) && s.shield<s.shieldMax*0.5 && threatAt(s,s)>25) await useAbility(s);
}
async function runAITurn(side){
  const order=alive(side).sort((a,b)=>ORDER.indexOf(a.cls)-ORDER.indexOf(b.cls)); cam.touched=false;
  for(const s of order){ if(state.over) break; if(!s.alive) continue; state.acting=s; actRing.visible=true; actRing.material.color.set(side==='player'?COL.player:COL.enemy);
    if(!cam.touched) keepInView([s]); await aiShip(s); await wait(0.3); }
  state.acting=null; actRing.visible=false; state.hoverTarget=null;
}

/* ---------------- turn flow ---------------- */
function beginSideTurn(side){
  for(const s of alive(side)){ tickSystems(s); s.shield=Math.min(s.shieldMax, s.shield+regenOf(s)); s.fx={}; s.mp=moveAllowance(s); s.moved=false; s.engines.forEach(e=>e.boost=0);
    s.weapons.forEach(w=>w.wait=Math.max(0,w.wait-1)); s.ability.wait=Math.max(0,s.ability.wait-1); }
  // a blackout this side cast runs out now that its enemy has had its turn
  for(const e of state.ships) if(e.blackout===side) e.blackout=null;
  // field repairs: a Repair tender patches up every ally within its field range
  for(const t of alive(side)) if(t.C.fieldRepair) for(const o of alive(side)) if(o!==t && hdist(o,t)<=(t.C.fieldRange||1) && o.hull<o.hullMax){
    const add=Math.min(t.C.fieldRepair, o.hullMax-o.hull); o.hull+=add; t.st.repaired+=add; if(add>=1) floatText(o,`+${Math.round(add)}`,'heal'); }
  refreshTags();
}
function banner(title, sub, cls){ const b=$('#banner'); b.className=''; void b.offsetWidth; b.querySelector('.t').textContent=title; b.querySelector('.s').textContent=sub; b.className='show '+cls; }
function startPlayerTurn(){
  state.turn++; state.phase='player'; beginSideTurn('player'); Sound.setMood('battle');
  banner(`Turn ${state.turn}`, state.turn>=turnLimit()?'Final turn: fleet value decides':'Your orders', 'p'); Sound.turn('player');
  const first=alive('player').sort((a,b)=>ORDER.indexOf(b.cls)-ORDER.indexOf(a.cls))[0];
  select(first||null, true); updateHUD();
}
async function endPlayerTurn(){
  if(state.phase!=='player' || state.busy || state.over) return;
  Sound.ui(); select(null); state.phase='enemy'; state.busy=true; updateHUD();
  banner('Enemy turn', 'Incoming', 'e'); Sound.turn('enemy'); Sound.setMood('enemy');
  await wait(1.1);
  beginSideTurn('enemy'); refreshTags();
  await runAITurn('enemy');
  await Promise.all(pendingDeaths.splice(0));
  state.busy=false;
  if(!state.over && state.turn>=turnLimit()){ endOnTurnLimit(); return; }
  if(!state.over){ await wait(0.3); startPlayerTurn(); }
}
function checkEnd(){
  if(state.over) return;
  const p=alive('player').length, e=alive('enemy').length;
  if(p && e) return;
  state.over=true; const win = e===0; state.result= win?'player':'enemy';
  after(2.4, ()=>showEnd(win));
}
const fleetValue = side => alive(side).reduce((a,s)=>a+s.C.cost*Math.max(0,s.hull)/s.hullMax, 0);
function endOnTurnLimit(){
  state.over=true;
  const p=Math.round(fleetValue('player')), e=Math.round(fleetValue('enemy'));
  state.result= p>e?'player': e>p?'enemy':'draw';
  log(`Turn limit reached. Fleet value left: yours ${p}, enemy ${e}.`, 'sys');
  after(1.2, ()=>showEnd(state.result==='player', {p,e}));
}
