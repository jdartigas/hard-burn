// Laniakea's Edge: camera and input.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

/* ---------------- camera ---------------- */
const MIN_ZOOM=3.5;
const cam={ target:new THREE.Vector3(0,0,2), goal:new THREE.Vector3(0,0,2), radius:62, theta:0, phi:0.9, rGoal:62, menu:true };
function fitRadius(){ const a=innerWidth/innerHeight; const base = innerWidth>1100 ? 76 : 66; return a<1.2 ? base*1.2/Math.max(0.45,a) : base; }
function camFocus(p, amount=1){ cam.goal.lerp(new THREE.Vector3(p.x,0,p.z), amount); }
// Every way of selecting a ship (board, fleet list, Tab, start of turn) brings it into view the same way (v56: only
// as far as needed, never recentring a ship already on screen; C still centres). If the camera
// is zoomed in following a ship, it follows the new one instead of staying on the old.
function focusShip(s){ if(cam.menu) return; if(cam.follow) cam.follow=s; else keepInView([s]); }
function updateCamera(dt){
  if(cam.menu){ const hero=Loc.menuTheta(); cam.goal.set(0,0,0); cam.rGoal=46; cam.phi=lerp(cam.phi,1.12,dt);
    // a location with a planet frames it beside the menu, swaying gently; the Shattered Reach keeps its slow circle
    if(hero===null) cam.theta+=dt*0.05; else cam.theta+=shortestAngle(cam.theta, hero)*Math.min(1,dt*1.2); }
  // drag-rotation eases toward where the pointer put it, like pan and zoom, instead of stepping per pointer event
  if(cam.thGoal!=null && !cam.menu){ const k=1-Math.pow(0.0002,dt); cam.theta+=(cam.thGoal-cam.theta)*k; cam.phi+=(cam.phGoal-cam.phi)*k;
    if(!drag && Math.abs(cam.thGoal-cam.theta)<1e-4 && Math.abs(cam.phGoal-cam.phi)<1e-4) cam.thGoal=cam.phGoal=null; }
  cam.target.lerp(cam.goal, 1-Math.pow(0.02,dt)); cam.radius=lerp(cam.radius,cam.rGoal,1-Math.pow(0.01,dt));
  const r=cam.radius; camera.position.set(cam.target.x + r*Math.sin(cam.phi)*Math.sin(cam.theta), r*Math.cos(cam.phi), cam.target.z + r*Math.sin(cam.phi)*Math.cos(cam.theta));
  if(cam.follow){ if(cam.follow.alive && !cam.menu) cam.goal.set(cam.follow.group.position.x,0,cam.follow.group.position.z); else cam.follow=null; }
  if(!cam.menu && state.phase!=='menu') clampToBoard(cam.goal, cam.rGoal);
  const lift=clamp((22-r)/16,0,1)*0.85; camera.position.y+=lift; camera.lookAt(cam.target.x, cam.target.y+lift, cam.target.z);
  if(shake>0){ camera.position.x+=(Math.random()-.5)*shake*0.6; camera.position.y+=(Math.random()-.5)*shake*0.6; shake=Math.max(0,shake-dt*2.2); }
}
function panBy(dx,dz){ const f=new THREE.Vector3(Math.sin(cam.theta),0,Math.cos(cam.theta)), rt=new THREE.Vector3(f.z,0,-f.x); cam.goal.addScaledVector(rt,dx).addScaledVector(f,dz); cam.goal.x=clamp(cam.goal.x,-40,40); cam.goal.z=clamp(cam.goal.z,-26,26); cam.touched=true; }
// Write a tag's style only when it changes: even an unchanged write can dirty style.
function setTag(s, op, tf){ const t=s.tag; if(t._op!==op){ t._op=op; t.style.opacity=op; } if(tf!==undefined && t._tf!==tf){ t._tf=tf; t.style.transform=tf; } }
function toScreen(p){ V.copy(p).project(camera); if(V.z>1) return null; return {x:(V.x*0.5+0.5)*innerWidth, y:(-V.y*0.5+0.5)*innerHeight}; }

/* ---------------- camera framing (v56, Jon) ----------------
   Ships are brought into view rather than centred, shots are framed so both ends are on screen, and the board's
   edge never drags empty space into the view. "In view" means inside the safe area: the screen less the panels
   docked over it. cam.touched records that the player moved the camera, which stops AI-turn framing until the
   next AI turn. */
const vcam=new THREE.PerspectiveCamera(), fRay=new THREE.Raycaster(), fNdc=new THREE.Vector2(), fV=new THREE.Vector3();
let safeCache=null, safeAt=-1;
function safeRect(fresh=false){
  const now=performance.now(); if(!fresh && safeCache && now-safeAt<250) return safeCache;
  const W=innerWidth, H=innerHeight; let l=0, t=0, r=W, b=H;
  const box=sel=>{ const e=$(sel); if(!e) return null; const q=e.getBoundingClientRect();
    if(q.width<2 || q.height<2 || q.right<=0 || q.left>=W || q.bottom<=0 || q.top>=H || getComputedStyle(e).visibility==='hidden') return null; return q; };
  const tb=box('#topbar'); if(tb) t=tb.bottom;
  for(const s of ['#shippanel','#endturn','#log']){ const q=box(s); if(q && q.top>H*0.45) b=Math.min(b,q.top); }
  const ro=box('#roster'); if(ro && ro.left<W*0.3 && ro.height>H*0.3) l=ro.right;
  const en=box('#enemies'); if(en && en.right>W*0.7 && en.height>H*0.2) r=en.left;
  l+=12; t+=12; r-=12; b-=12;
  if(r-l<W*0.4){ l=W*0.1; r=W*0.9; } if(b-t<H*0.3){ t=H*0.12; b=H*0.85; }
  safeAt=now; return safeCache={l,t,r,b};
}
// a stand-in camera where the real one is heading, built the way updateCamera builds the real one
function camAt(goal, r){
  vcam.copy(camera,false);
  vcam.position.set(goal.x + r*Math.sin(cam.phi)*Math.sin(cam.theta), r*Math.cos(cam.phi), goal.z + r*Math.sin(cam.phi)*Math.cos(cam.theta));
  const lift=clamp((22-r)/16,0,1)*0.85; vcam.position.y+=lift; vcam.lookAt(goal.x, goal.y+lift, goal.z); vcam.updateMatrixWorld(true); return vcam;
}
function groundAt(x, y, vc){ fNdc.set(x/innerWidth*2-1, -(y/innerHeight)*2+1); fRay.setFromCamera(fNdc,vc); const p=new THREE.Vector3(); return fRay.ray.intersectPlane(plane,p)? p : null; }
function screenBox(pts, vc){ let x0=Infinity, y0=Infinity, x1=-Infinity, y1=-Infinity;
  for(const p of pts){ fV.copy(p).project(vc); if(fV.z>1) return null; const x=(fV.x*0.5+0.5)*innerWidth, y=(-fV.y*0.5+0.5)*innerHeight;
    x0=Math.min(x0,x); x1=Math.max(x1,x); y0=Math.min(y0,y); y1=Math.max(y1,y); }
  return {x0,y0,x1,y1}; }
let boardExt=null;
function boardBounds(){ if(boardExt) return boardExt; let x0=Infinity, x1=-Infinity, z0=Infinity, z1=-Infinity;
  for(const c of board.list){ const p=hexToWorld(c.q,c.r); x0=Math.min(x0,p.x); x1=Math.max(x1,p.x); z0=Math.min(z0,p.z); z1=Math.max(z1,p.z); }
  // v57: the margin past the outermost cell centres. One hex (v56) cut edge ships in half when zoomed in: a
  // Dreadnought is over three hexes long and its tag sits above it, so the view may run about 2.5 hexes past the cells.
  const m=HEX*2.5; return boardExt={x0:x0-m, x1:x1+m, z0:z0-m, z1:z1+m}; }
// Keep the board under the safe area: shift the goal so the safe area's edges, on the ground, stay inside the
// board, and centre it on an axis where the view is wider than the board.
function clampToBoard(goal, r){
  // The far edge of a tilted view lands much further away than the near edge, so it is mirrored from the near one:
  // otherwise the far side alone decides the clamp and pushes the view off the board.
  if(!board.list.length) return; const S=safeRect(), vc=camAt(goal,r), E=boardBounds(), my=(S.t+S.b)/2, mx=(S.l+S.r)/2;
  const c=groundAt(mx,my,vc), near=groundAt(mx,S.b,vc), L=groundAt(S.l,my,vc), R=groundAt(S.r,my,vc); if(!c || !near || !L || !R) return;
  const pts=[L, R, near, c.clone().multiplyScalar(2).sub(near)];
  const fit=(lo,hi,a,b)=> hi-lo>b-a ? (a+b)/2-(lo+hi)/2 : lo<a ? a-lo : hi>b ? b-hi : 0;
  goal.x+=fit(Math.min(...pts.map(p=>p.x)), Math.max(...pts.map(p=>p.x)), E.x0, E.x1);
  goal.z+=fit(Math.min(...pts.map(p=>p.z)), Math.max(...pts.map(p=>p.z)), E.z0, E.z1);
}
// The least camera move that puts every point inside the safe area: pan only, or zoom out too when they can't fit.
// Never zooms in. Returns true if the camera has somewhere to go.
function framePoints(pts, zoomOut=false){
  if(cam.menu || state.simulated || window.__norender) return false;
  const S=safeRect(true), sw=S.r-S.l, sh=S.b-S.t, goal=cam.goal.clone(), maxR=Math.max(cam.rGoal, 110); let r=cam.rGoal;
  const shift=(lo,hi,a,b)=> hi-lo>b-a ? (a+b)/2-(lo+hi)/2 : lo<a ? a-lo : hi>b ? b-hi : 0;
  for(let it=0; it<14; it++){
    clampToBoard(goal, r);   // judge the fit where the camera will really end up
    const vc=camAt(goal,r), B=screenBox(pts,vc);
    if(!B){ if(it) break; goal.x=pts.reduce((a,p)=>a+p.x,0)/pts.length; goal.z=pts.reduce((a,p)=>a+p.z,0)/pts.length; continue; }   // behind the camera: start from centred
    const bw=B.x1-B.x0, bh=B.y1-B.y0;
    if(zoomOut && (bw>sw || bh>sh) && r<maxR-0.01){ r=Math.min(maxR, r*Math.max(bw/sw,bh/sh)*1.08); continue; }
    const tx=shift(B.x0,B.x1,S.l,S.r), ty=shift(B.y0,B.y1,S.t,S.b);
    if(Math.abs(tx)<1 && Math.abs(ty)<1) break;
    const cx=(B.x0+B.x1)/2, cy=(B.y0+B.y1)/2, a=groundAt(cx,cy,vc), b=groundAt(cx+tx,cy+ty,vc); if(!a || !b) break;
    const before=goal.clone(); goal.x+=a.x-b.x; goal.z+=a.z-b.z; clampToBoard(goal, r);
    // the board edge stopped the pan short: back off a little further so the points fit anyway
    if(goal.distanceTo(before)<0.05){ if(zoomOut && r<maxR-0.01) r=Math.min(maxR, r*1.12); else break; }
  }
  if(goal.distanceTo(cam.goal)<0.3 && Math.abs(r-cam.rGoal)<0.5) return false;
  cam.follow=null; cam.goal.copy(goal); cam.rGoal=r; return true;
}
// a ship's footprint for framing: its hull out to either end, and its tag above it
function shipPoints(s){ const p=s.group.position, k=Math.max(1, (s.len||1.5)*0.55);
  return [new THREE.Vector3(p.x+k,0,p.z), new THREE.Vector3(p.x-k,0,p.z), new THREE.Vector3(p.x,0,p.z+k), new THREE.Vector3(p.x,0,p.z-k), new THREE.Vector3(p.x,1.6,p.z)]; }
const keepInView = list => framePoints(list.flatMap(shipPoints), false);
const frameShot = (a, t) => framePoints([...shipPoints(a), ...shipPoints(t)], true);

/* ---------------- input ---------------- */
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2(), plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
function pickAt(x,y){
  ndc.set(x/innerWidth*2-1, -(y/innerHeight)*2+1); ray.setFromCamera(ndc,camera);
  const picks=state.ships.filter(s=>s.alive).map(s=>s.pickMesh); board.list.forEach(c=>{ if(c.rock && c.rock.alive) picks.push(c.rock.pick); }); const hit=ray.intersectObjects(picks,false)[0];
  let cell=null, ship=null; if(hit && hit.object.userData.cell){ cell=hit.object.userData.cell; } else if(hit){ ship=hit.object.userData.ship; cell=cellAt(ship.q,ship.r); }
  else { const p=new THREE.Vector3(); if(ray.ray.intersectPlane(plane,p)){ const h=worldToHex(p.x,p.z); cell=cellAt(h.q,h.r)||null; if(cell) ship=shipAt(cell.q,cell.r); } }
  return {cell, ship};
}
const pointers=new Map(); let drag=null, pinch=null;
canvas.addEventListener('pointerdown', e=>{
  canvas.focus(); pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  // two fingers: pinch zooms and dragging both pans, together, like a map app
  if(pointers.size===2){ const [a,b]=[...pointers.values()]; pinch={d:Math.hypot(a.x-b.x,a.y-b.y), r:cam.rGoal, mx:(a.x+b.x)/2, my:(a.y+b.y)/2}; drag=null; hideTooltip(); return; }
  drag={x:e.clientX,y:e.clientY,btn:e.button,moved:false,id:e.pointerId}; try{ canvas.setPointerCapture(e.pointerId); }catch(err){}   // throws if the pointer is already gone
});
canvas.addEventListener('pointermove', e=>{
  mouse.x=e.clientX; mouse.y=e.clientY;
  if(pointers.has(e.pointerId)) pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch && pointers.size===2){ const [a,b]=[...pointers.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y); cam.rGoal=clamp(pinch.r*pinch.d/Math.max(d,1),MIN_ZOOM,110); cam.touched=true;
    const mx=(a.x+b.x)/2, my=(a.y+b.y)/2, k=cam.radius*0.0016;   // same pan rate as a mouse Shift-drag
    if(!cam.menu && (mx!==pinch.mx || my!==pinch.my)){ cam.follow=null; panBy(-(mx-pinch.mx)*k, -(my-pinch.my)*k); }
    pinch.mx=mx; pinch.my=my; return; }
  if(drag){ const dx=e.clientX-drag.x, dy=e.clientY-drag.y;
    if(!drag.moved && Math.hypot(dx,dy)>6){ drag.moved=true; hideTooltip(); }
    if(drag.moved && !cam.menu){ if(drag.btn===0 && !e.shiftKey){ if(cam.thGoal==null){ cam.thGoal=cam.theta; cam.phGoal=cam.phi; } cam.touched=true; cam.thGoal-=dx*0.006; cam.phGoal=clamp(cam.phGoal-dy*0.004,0.3,cam.radius<20?1.5:1.3); } else { const k=cam.radius*0.0016; cam.follow=null; panBy(-dx*k, -dy*k); } drag.x=e.clientX; drag.y=e.clientY; }
    if(drag.moved) return; }
  if(state.phase==='menu') return;
  const {cell, ship}=pickAt(e.clientX,e.clientY);
  const changed = (cell!==state.hoverCell) || (ship!==state.hoverShip);
  state.hoverCell=cell; state.hoverShip=ship; state.hoverRock = (!ship && cell && cell.rock && cell.rock.alive) ? cell.rock : null;
  hoverRing.visible=!!cell; if(cell) hoverRing.position.copy(hexToWorld(cell.q,cell.r,0.05));
  canvas.style.cursor = (ship || (state.hoverRock && state.selected)) ? 'crosshair' : (state.reach && cell && state.reach.has(key(cell.q,cell.r)) ? 'pointer' : 'default');
  if(changed){ updatePathPreview(); } updateHover();
});
function endPointer(e){
  pointers.delete(e.pointerId); if(pointers.size<2) pinch=null;
  if(!drag || drag.id!==e.pointerId) return; const d=drag; drag=null;
  if(d.moved) return;
  if(d.btn===2){ onCancel(); return; }
  if(d.btn===0) onClick(e.clientX,e.clientY);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', e=>{ pointers.delete(e.pointerId); drag=null; pinch=null; });
canvas.addEventListener('contextmenu', e=>e.preventDefault());
// Zoom by how far the wheel actually moved. A trackpad sends many tiny deltas per gesture; stepping a fixed 10%
// per event made it lurch. A mouse notch (about 100) still moves about 12%. Trackpad pinch arrives with ctrlKey.
canvas.addEventListener('wheel', e=>{ e.preventDefault(); if(cam.menu) return;
  const d= e.deltaMode===1? e.deltaY*16 : e.deltaMode===2? e.deltaY*innerHeight : e.deltaY;
  cam.rGoal=clamp(cam.rGoal*Math.exp(clamp(d,-150,150)*(e.ctrlKey?0.01:0.0012)),MIN_ZOOM,110); cam.touched=true; }, {passive:false});
canvas.addEventListener('dblclick', e=>{ if(cam.menu) return; const {ship}=pickAt(e.clientX,e.clientY); if(ship) zoomTo(ship); });
function zoomTo(s){ cam.thGoal=cam.phGoal=null; cam.follow=s; cam.touched=true; cam.rGoal=Math.max(MIN_ZOOM, s.len*1.9); cam.phi=Math.min(cam.phi,1.15); Sound.ui(); }
function onClick(x,y){
  if(state.phase!=='player' || state.busy) return;
  const {cell, ship}=pickAt(x,y); if(!cell) return;
  const s=state.selected;
  if(state.mode==='target' && s){
    if(ship && abilityTargets(s).includes(ship)){ state.mode=null; state.busy=true; frameShot(s,ship); useAbility(s,ship).then(()=>{ state.busy=false; recomputeHighlights(); updateHUD(); }); }
    else { state.mode=null; recomputeHighlights(); updateHUD(); }
    return;
  }
  if(ship && ship.side==='player'){ if(ship!==s) select(ship); return; }
  if(ship && ship.side==='enemy'){ if(s) playerAttack(ship); return; }
  if(!ship && cell.rock && cell.rock.alive){ if(s) playerAttack(cell.rock); return; }
  if(s && state.reach){ const k=key(cell.q,cell.r); const c=state.reach.get(k); if(c && c.cost>0 && !c.blocked){ playerMove(k); return; } }
}
function onCancel(){ if(state.mode){ state.mode=null; } else if(state.weaponSel!=='all'){ state.weaponSel='all'; } else select(null); recomputeHighlights(); updateHUD(); updateHover(); }
const keys=new Set();
addEventListener('keydown', e=>{
  if(e.target.tagName==='INPUT') return;
  const open=document.querySelector('.screen.on');
  if(open && open.id!=='menu'){ if(e.key==='Escape'||(e.key.toLowerCase()==='h'&&open.id==='help')){ if(open.id==='help'||open.id==='pause'||open.id==='setup') closeScreen(); } return; }
  if(state.phase==='menu'){ if(e.key==='Enter') startGame(chosenFleets()); return; }
  const k=e.key.toLowerCase();
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){ keys.add(k); e.preventDefault(); return; }
  if(k==='m'){ toggleMusic(); return; }
  if(k==='g'){ cycleQuality(); return; }
  if(k==='n'){ toggleSound(); return; }
  if(k==='h'){ showScreen('help'); return; }
  if(k==='p'){ openPause(); return; }
  if(k==='c' && state.selected){ cam.follow=null; camFocus(state.selected.group.position,1); return; }
  if(k==='z'){ const t=state.selected||state.hoverShip||state.acting; if(t){ if(cam.follow===t && cam.rGoal<20){ cam.follow=null; cam.rGoal=fitRadius(); } else zoomTo(t); } return; }
  if(state.phase!=='player' || state.busy) return;
  if(k===' '||k==='enter'){ e.preventDefault(); endPlayerTurn(); }
  else if(k==='tab'){ e.preventDefault(); nextShip(); }
  else if(k==='escape'){ onCancel(); }
  else if(k==='f'){ setWeapon('all'); }
  else if(k==='q'){ playerAbility(); }
  else if(k>='1' && k<='9'){ setWeapon(parseInt(k)-1); }   // the Dreadnought carries six
});
addEventListener('keyup', e=>keys.delete(e.key.toLowerCase()));
addEventListener('blur', ()=>keys.clear());

