// Laniakea's Edge: ship pictures for the fleet builder, and the full-screen ship viewer (v57).
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

/* ---------------- class spec text, shared by the viewer and the help chart ---------------- */
const wRangeText = d => isFinite(d.range)? `Range ${d.range}` : `Range ${d.reach}+`;
const wDmgText = d => `${d.shots>1? d.shots+'×' : ''}${d.dmg} dmg${d.reload>1? `, fires every ${d.reload} turns` : ''}${d.ammo? `, ${d.ammo} salvos` : ''}`;
// a class's weapons with repeats counted: the Dreadnought's two light railguns read "Light railgun ×2"
function classWeapons(cls){ const n=new Map(); for(const k of CLASSES[cls].weapons) n.set(k,(n.get(k)||0)+1); return [...n].map(([k,c])=>({def:WEAPONS[k], n:c})); }
const weaponNames = cls => classWeapons(cls).map(w=>w.def.name+(w.n>1?` ×${w.n}`:'')).join(', ');
const abilityLine = cls => { const a=ABIL[CLASSES[cls].ability]; return `<b>${a.name}</b>: ${a.desc}.`; };

/* ---------------- pictures and viewer ----------------
   Both draw on the game's own canvas and renderer (a page gets one WebGL context worth having): the model is built
   high above the board, where only the sky is behind it, and the scene pass is pointed at a camera of our own. A
   picture is rendered inside a normal frame, just before the game's own render, so it never reaches the screen;
   the middle of the canvas is copied out into an image. Ambient occlusion is off while we use the pass. */
const SV = (()=>{
  const P0=new THREE.Vector3(0,300,0), vcam=new THREE.PerspectiveCamera(30,1,0.05,4000);
  const thumbs={}, waiting=[]; let open=false, cls=null, side='player', model=null, from=null, aoWas=false, t=0;
  const view={th:0.85, ph:1.12, r:8, thG:0.85, phG:1.12, rG:8, fit:8, pan:new THREE.Vector3(), panG:new THREE.Vector3()};

  function build(c, sd){
    const m=buildShip(c, sd), k=SHIP_SCALE*(CLASSES[c].m/80)/m.modelLen;
    m.group.scale.setScalar(k); m.group.position.copy(P0); if(m.fineMesh) m.fineMesh.visible=true;
    m.engines.forEach(e=>{ e.cur=0.35; }); scene.add(m.group); m.group.updateMatrixWorld(true);
    // the opaque hull's box, for framing (the shield bubble and pick sphere would make every ship look round)
    const box=new THREE.Box3(), part=new THREE.Box3();
    m.body.traverse(o=>{ const mt=o.material; if(!o.isMesh || !o.visible || !mt || Array.isArray(mt) || mt.transparent || mt.isShaderMaterial) return;
      if(o.isInstancedMesh){ o.computeBoundingBox(); part.copy(o.boundingBox).applyMatrix4(o.matrixWorld); } else { if(!o.geometry.boundingBox) o.geometry.computeBoundingBox(); part.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); }
      box.union(part); });
    // a sample of the hull's own vertices: framing fits these, since a long hull seen at an angle fills far less of
    // the view than its box's corners do
    const pts=[], v=new THREE.Vector3();
    m.body.traverse(o=>{ const mt=o.material; if(!o.isMesh || o.isInstancedMesh || !o.visible || !mt || Array.isArray(mt) || mt.transparent || mt.isShaderMaterial) return;
      const a=o.geometry.attributes.position, step=Math.max(1, Math.floor(a.count/60)); for(let i=0;i<a.count;i+=step) pts.push(v.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).clone()); });
    m.box=box; m.pts=pts; return m;
  }
  function dispose(m){ if(!m) return; scene.remove(m.group);
    m.group.traverse(o=>{ if(o.geometry) o.geometry.dispose(); const mt=o.material; if(mt) (Array.isArray(mt)?mt:[mt]).forEach(x=>{ if(x.map && x.map.isCanvasTexture && x.transparent) x.map.dispose(); x.dispose(); }); }); }
  function animate(m, dt){ t+=dt;
    m.engines.forEach((e,i)=>{ e.group.scale.set(1,1,0.5+e.cur*0.9); for(const mt of e.mats){ mt.uniforms.uPow.value=e.cur; mt.uniforms.uTime.value=t+i*1.7; }
      e.sprite.material.opacity=0.2; e.sprite.scale.setScalar(e.r*2); e.mach.material.opacity=0.3; });
    m.lights.forEach((l,i)=>{ l.visible=((t*1.3+i*0.5)%1.6)<0.12 || i===2; });
  }
  // place the camera, and shift the picture so the ship sits in the middle of what the panel leaves uncovered
  function aim(W, H, ox=0, oy=0){
    const c=P0.clone().add(view.pan), s=Math.sin(view.ph);
    vcam.position.set(c.x+view.r*s*Math.sin(view.th), c.y+view.r*Math.cos(view.ph), c.z+view.r*s*Math.cos(view.th)); vcam.lookAt(c);
    vcam.aspect=W/H; if(ox||oy) vcam.setViewOffset(W,H,ox,oy,W,H); else vcam.clearViewOffset(); vcam.updateProjectionMatrix(); vcam.updateMatrixWorld(true);
  }
  // the distance at which the hull fills fx of a W x H view's width or fy of its height, whichever comes first
  function fitDistance(m, W, H, fx, fy=fx){
    const centre=m.box.getCenter(new THREE.Vector3()); view.pan.copy(centre).sub(P0); view.panG.copy(view.pan);
    let r=m.box.getSize(new THREE.Vector3()).length()*1.2;
    for(let it=0; it<6; it++){ view.r=r; aim(W,H); let x0=1,x1=-1,y0=1,y1=-1; const v=new THREE.Vector3();
      for(const p of m.pts){ v.copy(p).project(vcam); x0=Math.min(x0,v.x); x1=Math.max(x1,v.x); y0=Math.min(y0,v.y); y1=Math.max(y1,v.y); }
      r*=Math.max((x1-x0)/2/fx, (y1-y0)/2/fy); }
    return r;
  }

  // ---- pictures: one class per frame, so opening the builder never stalls ----
  function thumb(c){ if(thumbs[c]) return thumbs[c]; if(!waiting.includes(c)) waiting.push(c); return ''; }
  function renderThumb(c){
    const W=canvas.width, H=canvas.height, cw=Math.round(W*0.5), ch=Math.round(cw/2.4), cx=Math.round((W-cw)/2), cy=Math.round((H-ch)/2);
    const m=build(c,'player'); animate(m,0); const save={th:view.th, ph:view.ph, r:view.r, pan:view.pan.clone()};
    // a three-quarter view from ahead and above, fitted to the crop: 90% of its width or 86% of its height
    view.th=0.85; view.ph=1.12; view.r=fitDistance(m, W, H, 0.4); const v=new THREE.Vector3();
    for(let it=0; it<3; it++){ aim(W,H); let x0=1,x1=-1,y0=1,y1=-1;
      for(const p of m.pts){ v.copy(p).project(vcam); x0=Math.min(x0,v.x); x1=Math.max(x1,v.x); y0=Math.min(y0,v.y); y1=Math.max(y1,v.y); }
      // centre the hull's outline in the crop, then rescale it to fill
      const hy=Math.tan(THREE.MathUtils.degToRad(vcam.fov/2))*view.r, hx=hy*vcam.aspect, rt=new THREE.Vector3(), up=new THREE.Vector3(), f=new THREE.Vector3();
      vcam.matrixWorld.extractBasis(rt, up, f); view.pan.addScaledVector(rt, (x0+x1)/2*hx).addScaledVector(up, (y0+y1)/2*hy);
      view.r*=Math.max((x1-x0)/2/(cw/W*0.9), (y1-y0)/2/(ch/H*0.86)); }
    aim(W,H);
    const was=scenePass.camera, ao=gtao.enabled, hid=hideWorld(), look=closeLook(); scenePass.camera=vcam; gtao.enabled=false;
    try{ composer.render();
      const out=document.createElement('canvas'); out.width=480; out.height=200; out.getContext('2d').drawImage(canvas, cx, cy, cw, ch, 0, 0, 480, 200);
      thumbs[c]=out.toDataURL('image/jpeg', 0.86); }
    finally { scenePass.camera=was; gtao.enabled=ao; showWorld(hid); look(); dispose(m); view.th=save.th; view.ph=save.ph; view.r=save.r; view.pan.copy(save.pan); }
    document.querySelectorAll(`img[data-thumb="${c}"]`).forEach(i=>{ i.src=thumbs[c]; });
  }
  // the board and its ships sit far below; hide them anyway, so no angle of the camera can find them
  function hideWorld(){ const list=[board.group, ...state.ships.map(s=>s.group)].filter(o=>o && o.visible); list.forEach(o=>o.visible=false); return list; }
  function showWorld(list){ list.forEach(o=>o.visible=true); }
  // Bloom and exposure are tuned for ships seen across the board; this close, every lit port and glint would blow
  // out. Turned down while a picture or the viewer has the pass; the returned function puts them back.
  function closeLook(){ const b=bloom.strength, x=renderer.toneMappingExposure; bloom.strength=b*0.5; renderer.toneMappingExposure=x*0.95; return ()=>{ bloom.strength=b; renderer.toneMappingExposure=x; }; }

  // ---- the viewer ----
  let hidden=[], unlook=null;
  function show(c, sd=side){
    dispose(model); cls=c; side=sd; model=build(c, side); t=0;
    const r=panelRect(); view.th=view.thG=0.85; view.ph=view.phG=1.12;
    view.fit=fitDistance(model, innerWidth, innerHeight, 0.78*(1-2*r.ox/innerWidth), 0.78*(1-2*r.oy/innerHeight)); view.r=view.rG=view.fit;
    renderPanel();
  }
  function openViewer(c, fromScreen){
    if(open){ show(c); return; }
    from=fromScreen; open=true; aoWas=gtao.enabled; gtao.enabled=false; scenePass.camera=vcam; hidden=hideWorld(); unlook=closeLook();
    document.body.classList.add('sv-open'); showScreen('shipview'); show(c, 'player');
  }
  function closeViewer(){
    if(!open) return; open=false; dispose(model); model=null;
    scenePass.camera=camera; gtao.enabled=aoWas; showWorld(hidden); hidden=[]; if(unlook){ unlook(); unlook=null; } document.body.classList.remove('sv-open');
    if(from) showScreen(from); else closeScreen();
  }
  // how far the panel pushes the ship's centre: to the left on wide screens, up on phones (where it is a bottom sheet)
  function panelRect(){ const p=$('#sv-panel'); if(!p || !open) return {ox:0, oy:0}; const q=p.getBoundingClientRect();
    return q.left>innerWidth*0.4 ? {ox:(innerWidth-q.left)/2, oy:0} : {ox:0, oy:(innerHeight-q.top)/2}; }
  function update(dt){
    if(waiting.length && !window.__norender && canvas.width>=200 && canvas.height>=120) renderThumb(waiting.shift());   // a hidden page has no canvas to draw on
    if(!open || !model) return;
    animate(model, dt); const k=1-Math.pow(0.0005,dt);
    view.th+=(view.thG-view.th)*k; view.ph+=(view.phG-view.ph)*k; view.r+=(view.rG-view.r)*k; view.pan.lerp(view.panG,k);
    const r=panelRect(); aim(innerWidth, innerHeight, r.ox, r.oy);
  }
  function renderPanel(){
    const C=CLASSES[cls], I=CLASS_INFO[cls]||{}, A=ABIL[C.ability], i=ORDER.indexOf(cls);
    $('#sv-count').textContent=`${i+1} / ${ORDER.length}`;
    $('#sv-livery').textContent= side==='player'? 'Enemy livery' : 'Your livery';
    $('#sv-panel').innerHTML=`<h2>${C.label}</h2><p class="sv-role">${C.role} · ${C.m} m · ${C.cost} points</p>
      <p>${I.purpose||''}</p>
      ${I.best?`<p class="sv-best"><span>Best at</span>${I.best}</p>`:''}
      <h3>Specifications</h3>
      <div class="sv-stats"><span>Hull</span><b>${C.hull}</b><span>Shields</span><b>${C.shield} <small>+${C.regen} a turn</small></b><span>Armor</span><b>${C.armor}</b>
        <span>Evasion</span><b>${C.ev}</b><span>Move</span><b>${C.mp} hexes</b><span title="Chance to shoot down an incoming missile">Point defense</span><b>${Math.round(C.pdc*100)}%</b></div>
      <h3>Weapons</h3>
      <ul class="sv-weap">${classWeapons(cls).map(w=>`<li><b>${w.def.name}${w.n>1?` ×${w.n}`:''}</b><span>${wRangeText(w.def)} · ${wDmgText(w.def)}</span><small>${weaponBlurb(w.def)||''}</small></li>`).join('')}</ul>
      <h3>Special ability</h3><p><b>${A.name}</b>: ${A.desc}. Recharges in ${A.reload} turns.</p>
      ${C.passive?`<h3>Always on</h3><p>${C.passive}.</p>`:''}
      ${I.lore?`<h3>Lore</h3><p>${I.lore}</p>`:''}`;   // the lore slot stays hidden until a class has lore (BACKLOG)
  }
  function step(d){ const i=ORDER.indexOf(cls); show(ORDER[(i+d+ORDER.length)%ORDER.length]); }

  // ---- controls: drag to orbit, wheel or pinch to zoom, two fingers (or Shift-drag) to pan, double-click to reset ----
  const stage=$('#sv-stage'), ptr=new Map(); let last=null, pinch=null;
  const panBy=(dx,dy)=>{ const k=view.r*0.0014, f=new THREE.Vector3(), rt=new THREE.Vector3(), up=new THREE.Vector3();
    vcam.matrixWorld.extractBasis(rt, up, f); view.panG.addScaledVector(rt,-dx*k).addScaledVector(up,dy*k); };
  stage.addEventListener('pointerdown', e=>{ ptr.set(e.pointerId,{x:e.clientX,y:e.clientY}); try{ stage.setPointerCapture(e.pointerId); }catch(err){}
    if(ptr.size===2){ const [a,b]=[...ptr.values()]; pinch={d:Math.hypot(a.x-b.x,a.y-b.y), r:view.rG, mx:(a.x+b.x)/2, my:(a.y+b.y)/2}; last=null; }
    else last={x:e.clientX, y:e.clientY, shift:e.shiftKey||e.button===2}; });
  stage.addEventListener('pointermove', e=>{ if(!ptr.has(e.pointerId)) return; ptr.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch && ptr.size===2){ const [a,b]=[...ptr.values()], d=Math.hypot(a.x-b.x,a.y-b.y), mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
      view.rG=clamp(pinch.r*pinch.d/Math.max(d,1), view.fit*0.35, view.fit*3); panBy(mx-pinch.mx, my-pinch.my); pinch.mx=mx; pinch.my=my; return; }
    if(!last) return; const dx=e.clientX-last.x, dy=e.clientY-last.y; last.x=e.clientX; last.y=e.clientY;
    if(last.shift) panBy(dx,dy); else { view.thG-=dx*0.007; view.phG=clamp(view.phG-dy*0.005, 0.25, 2.9); } });
  const up=e=>{ ptr.delete(e.pointerId); if(ptr.size<2) pinch=null; if(!ptr.size) last=null; };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up); stage.addEventListener('contextmenu', e=>e.preventDefault());
  stage.addEventListener('wheel', e=>{ e.preventDefault(); const d= e.deltaMode===1? e.deltaY*16 : e.deltaY;
    view.rG=clamp(view.rG*Math.exp(clamp(d,-150,150)*(e.ctrlKey?0.01:0.0015)), view.fit*0.35, view.fit*3); }, {passive:false});
  stage.addEventListener('dblclick', ()=>{ view.thG=0.85; view.phG=1.12; view.rG=view.fit; view.panG.copy(model.box.getCenter(new THREE.Vector3()).sub(P0)); });
  addEventListener('keydown', e=>{ if(!open) return; const k=e.key;
    if(k==='Escape'){ closeViewer(); } else if(k==='ArrowLeft'){ step(-1); } else if(k==='ArrowRight'){ step(1); } else return;
    e.preventDefault(); e.stopImmediatePropagation(); }, true);
  $('#sv-close').onclick=()=>{ Sound.ui(); closeViewer(); };
  $('#sv-prev').onclick=()=>{ Sound.ui(); step(-1); }; $('#sv-next').onclick=()=>{ Sound.ui(); step(1); };
  $('#sv-livery').onclick=()=>{ Sound.ui(); const keep={th:view.thG, ph:view.phG, r:view.rG}; show(cls, side==='player'?'enemy':'player'); view.thG=keep.th; view.phG=keep.ph; view.rG=keep.r; };

  return {thumb, open:openViewer, close:closeViewer, update, get isOpen(){ return open; }};
})();

/* ---------------- help: the ship chart, built from the class data so it can't drift from the game ---------------- */
$('#help-ships').innerHTML=`<tr><th>Ship</th><th>Best at</th><th>Weapons</th><th>Special ability</th><th class="n">Cost</th></tr>`+
  ORDER.map(c=>{ const C=CLASSES[c], I=CLASS_INFO[c]||{};
    return `<tr><td><button class="hs-ship" data-c="${c}" aria-label="View the ${C.label}"><b>${C.label}</b><span>${C.role}</span></button></td><td>${I.best||''}</td><td>${weaponNames(c)}</td>
      <td>${abilityLine(c)}${C.passive?`<br><span class="hs-pass">Always on: ${C.passive}.</span>`:''}</td><td class="n">${C.cost}</td></tr>`; }).join('');
$('#help-ships').querySelectorAll('.hs-ship').forEach(b=>b.onclick=()=>{ Sound.ui(); SV.open(b.dataset.c, 'help'); });
