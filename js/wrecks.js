// Hard Burn: ship destruction: blasts, hull breakup, debris, burning wrecks.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

/* ---------------- ship destruction: chained blasts, hull breakup, burning wrecks ---------------- */
const wrecks=[];
const C_VENT=new THREE.Color(.55,.62,.7), C_VENT_DIM=new THREE.Color(.22,.26,.3), C_ARC=new THREE.Color(.6,.85,1), C_EMBER=new THREE.Color(1,.35,.08);
const shardGeo=new THREE.BoxGeometry(1,1,1);
function scorchedMaterial(m, cache, k){
  if(cache.has(m)) return cache.get(m);
  let c=null;
  if(m.isShaderMaterial) c=null;
  else if(m.isMeshBasicMaterial){ c=m.clone(); c.color.multiplyScalar(m.map? 0.45 : 0.05); }
  else { c=m.clone(); if(c.color) c.color.multiplyScalar(k); if('emissiveIntensity' in c) c.emissiveIntensity=0; if('envMapIntensity' in c) c.envMapIntensity=0.7; }
  cache.set(m,c); return c;
}
// jagged glowing rim for a torn cross-section
function tornEdge(radius){
  const n=18, pts=[]; for(let i=0;i<n;i++){ const a=i/n*Math.PI*2, r=radius*(0.55+Math.random()*0.5); pts.push(new THREE.Vector2(Math.cos(a)*r, Math.sin(a)*r)); }
  const g=new THREE.ShapeGeometry(new THREE.Shape(pts));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({color:new THREE.Color(1,.45,.12).multiplyScalar(3), transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide}));
}
// ---- detailed debris kit: built once, shared by every wreck (pieces ~1 unit across, scaled per instance) ----
const DebrisKit = (() => {
  let kit=null;
  const ni=g=>g.index? g.toNonIndexed() : g;
  const uvScale=(g,k)=>{ const uv=g.attributes.uv; for(let i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i)*k, uv.getY(i)*k); return g; };
  const merge=parts=>{ const g=THREE.mergeGeometries(parts.map(ni)); g.computeVertexNormals(); g.computeBoundingSphere(); return g; };
  function jagged(R){ const n=7+Math.floor(R()*4), pts=[];
    for(let i=0;i<n;i++){ const a=i/n*Math.PI*2+R()*0.45, r=(0.34+R()*0.24)*(R()<0.25?0.55:1); pts.push(new THREE.Vector2(Math.cos(a)*r*1.35, Math.sin(a)*r)); }
    return new THREE.Shape(pts); }
  function plate(R, bend){   // torn armor plate with a stiffener rib and rivet lugs on the back
    const g=uvScale(new THREE.ExtrudeGeometry(jagged(R), {depth:0.05, bevelEnabled:true, bevelThickness:0.012, bevelSize:0.012, bevelSegments:1}), 0.2); g.translate(0,0,-0.025);
    const parts=[g]; const rib=new THREE.BoxGeometry(0.85,0.05,0.05); rib.translate(0,(R()-.5)*0.25,-0.055); parts.push(rib);
    for(let i=0;i<4;i++){ const l=new THREE.BoxGeometry(0.05,0.05,0.04); l.translate((R()-.5)*0.7,(R()-.5)*0.4,-0.05); parts.push(l); }
    const m=merge(parts);
    if(bend){ const p=m.attributes.position, piv=R()*0.2-0.1, ang=0.4+R()*0.55, c=Math.cos(ang), s=Math.sin(ang);
      for(let i=0;i<p.count;i++){ const x=p.getX(i), z=p.getZ(i); if(x>piv){ const dx=x-piv; p.setX(i, piv+dx*c-z*s); p.setZ(i, dx*s+z*c); } } m.computeVertexNormals(); }
    return m; }
  function girder(R, twist){   // I-beam, bowed and sometimes twisted
    const s=new THREE.Shape(), w=0.15, h=0.19, t=0.035;
    s.moveTo(-w,-h); s.lineTo(w,-h); s.lineTo(w,-h+t); s.lineTo(t/2,-h+t); s.lineTo(t/2,h-t); s.lineTo(w,h-t); s.lineTo(w,h); s.lineTo(-w,h); s.lineTo(-w,h-t); s.lineTo(-t/2,h-t); s.lineTo(-t/2,-h+t); s.lineTo(-w,-h+t); s.closePath();
    const g=new THREE.ExtrudeGeometry(s,{depth:1, steps:10, bevelEnabled:false}); g.translate(0,0,-0.5);
    const p=g.attributes.position, tw=twist? 0.6+R()*0.9 : 0, bow=0.12+R()*0.3;
    for(let i=0;i<p.count;i++){ const z=p.getZ(i), a=tw*(z+0.5), x=p.getX(i), y=p.getY(i); p.setX(i, x*Math.cos(a)-y*Math.sin(a)+bow*z*z); p.setY(i, x*Math.sin(a)+y*Math.cos(a)); }
    // cross-bracing plate still welded to one end
    const gus=new THREE.BoxGeometry(0.34,0.3,0.03); gus.translate(0,0,0.46);
    return merge([g,gus]); }
  function pipe(R){   // conduit section with flange, bolts and a torn elbow
    const len=0.75+R()*0.3, parts=[new THREE.CylinderGeometry(0.085,0.085,len,12,1,true)];
    const f=new THREE.CylinderGeometry(0.15,0.15,0.05,14); f.translate(0,len/2,0); parts.push(f);
    for(let i=0;i<6;i++){ const b=new THREE.BoxGeometry(0.03,0.08,0.03), a=i/6*Math.PI*2; b.translate(Math.cos(a)*0.12,len/2,Math.sin(a)*0.12); parts.push(b); }
    const e=new THREE.TorusGeometry(0.17,0.085,8,10,Math.PI*0.35); e.rotateY(Math.PI/2); e.translate(0,-len/2,0.17); parts.push(e);
    const g=merge(parts); g.rotateX(Math.PI/2); return g; }
  function shell(R){   // curved hull skin with internal frame ribs and ragged edges
    const arc=0.9+R()*1.0, H=0.75;
    const skin=uvScale(new THREE.CylinderGeometry(0.55,0.55,H,18,4,true,0,arc), 0.35);
    const p=skin.attributes.position; for(let i=0;i<p.count;i++){ const y=p.getY(i); if(Math.abs(y)>H*0.4) p.setY(i, y*(0.65+R()*0.55)); }
    const parts=[skin];
    for(let k=0;k<2;k++){ const r=new THREE.TorusGeometry(0.52,0.03,4,14,arc); r.rotateX(Math.PI/2); r.rotateY(Math.PI/2); r.translate(0,(k-0.5)*0.36,0); parts.push(r); }
    for(let k=0;k<3;k++){ const st=new THREE.BoxGeometry(0.03,H*0.8,0.05), a=arc*(k+0.5)/3; st.translate(Math.sin(a)*0.52,0,Math.cos(a)*0.52); parts.push(st); }
    const g=merge(parts); g.translate(0,0,-0.4); return g; }
  function chunk(R){   // blown-out block of machinery with fittings still attached
    const core=new THREE.BoxGeometry(0.6,0.38,0.5,2,2,2), p=core.attributes.position;
    for(let i=0;i<p.count;i++) p.setXYZ(i, p.getX(i)*(0.8+R()*0.45), p.getY(i)*(0.8+R()*0.45), p.getZ(i)*(0.8+R()*0.45));
    const parts=[core];
    for(let i=0;i<6;i++){ const b=new THREE.BoxGeometry(0.05+R()*0.16,0.04+R()*0.09,0.05+R()*0.18); b.translate((R()-.5)*0.5, 0.2+R()*0.05, (R()-.5)*0.4); parts.push(b); }
    for(let i=0;i<2;i++){ const c=new THREE.CylinderGeometry(0.025,0.025,0.55,6); c.rotateZ(Math.PI/2); c.translate(0.08,(i-0.5)*0.15,0.27); parts.push(c); }
    return merge(parts); }
  function build(){ const R=mulberry32(4711);
    kit={ plate:[plate(R,false),plate(R,true),plate(R,false),plate(R,true),plate(R,true)], girder:[girder(R,false),girder(R,true),girder(R,true)],
          pipe:[pipe(R),pipe(R)], shell:[shell(R),shell(R)], chunk:[chunk(R),chunk(R),chunk(R)] }; return kit; }
  return { get: ()=> kit || build() };
})();

function breakUpShip(s){
  s.group.updateMatrixWorld(true);
  const body=s.body, P=s.side==='player';
  const skip=new Set([...s.engines.map(e=>e.group), ...s.lights]);
  // choose cut planes on deck boundaries so the hull splits between sections, not through them
  const decks=body.children.filter(c=>c.isMesh && c.userData.chunk && c.geometry.boundingBox!==undefined);
  let zmin=1e9, zmax=-1e9; const ends=[];
  body.children.forEach(c=>{ if(skip.has(c)) return; if(c.isMesh && c.userData.chunk){ c.geometry.computeBoundingBox(); const bb=c.geometry.boundingBox; const a=c.position.z+bb.min.z, b=c.position.z+bb.max.z; zmin=Math.min(zmin,a); zmax=Math.max(zmax,b); ends.push(b); } });
  const len=zmax-zmin, nSec={patrol:2,corvette:2,frigate:3,destroyer:3,cruiser:4,carrier:3}[s.cls]||3;
  const cuts=[]; for(let i=1;i<nSec;i++){ const ideal=zmin+len*i/nSec; let best=ideal, bd=1e9; for(const e of ends){ const d=Math.abs(e-ideal); if(d<bd && e>zmin+len*0.12 && e<zmax-len*0.12 && !cuts.some(c=>Math.abs(c-e)<len*0.12)){ bd=d; best=e; } } cuts.push(bd<len*0.2?best:ideal+rand(-0.05,0.05)); }
  cuts.sort((a,b)=>a-b);
  const bounds=[zmin-1,...cuts,zmax+1];
  const secOf=z=>{ for(let i=0;i<cuts.length;i++) if(z<cuts[i]) return i; return cuts.length; };
  const wreck={sections:[], shards:[], t:0, side:s.side, fineMeshes:[], cache:new Map()};
  const bw=new THREE.Matrix4().copy(body.matrixWorld), bq=new THREE.Quaternion(), bp=new THREE.Vector3(), bs=new THREE.Vector3(); bw.decompose(bp,bq,bs);
  const axis=new THREE.Vector3(0,0,1).applyQuaternion(bq);
  for(let i=0;i<=cuts.length;i++){
    const z0=Math.max(bounds[i],zmin), z1=Math.min(bounds[i+1],zmax), cz=(z0+z1)/2;
    const outer=new THREE.Group(); outer.position.copy(bp).addScaledVector(axis, cz*bs.z); outer.quaternion.copy(bq); outer.scale.copy(bs);
    const inner=new THREE.Group(); inner.position.z=-cz; outer.add(inner); scene.add(outer);
    const k=rand(0.26,0.42);
    wreck.sections.push({outer, inner, z0, z1, cz, k, vel:new THREE.Vector3(), spin:new THREE.Vector3(), fires:[], embers:[], heat:1, cache:new Map()});
  }
  // distribute parts; instanced detail is split instance by instance
  const mtx=new THREE.Matrix4();
  const overlaps=(a,b)=>{ const out=[]; wreck.sections.forEach((sec,si)=>{ const lo=Math.max(a,bounds[si]), hi=Math.min(b,bounds[si+1]); if(hi-lo>1e-4) out.push([si,lo,hi]); }); return out; };
  body.children.forEach(c=>{
    if(skip.has(c) || c.userData.mergedProxy) return;
    if(c.isInstancedMesh){
      const buckets=wreck.sections.map(()=>[]);
      for(let j=0;j<c.count;j++){ c.getMatrixAt(j,mtx); const pz=mtx.elements[14], sz=mtx.elements[10], a=pz-sz/2, b=pz+sz/2;
        const parts=overlaps(a,b);
        if(parts.length<=1 || sz<0.05) buckets[secOf(pz)].push(mtx.clone());
        else parts.forEach(([si,lo,hi])=>{ const m=mtx.clone(); m.elements[10]=hi-lo; m.elements[14]=(lo+hi)/2; buckets[si].push(m); }); }
      buckets.forEach((list,si)=>{ if(!list.length) return; const sec=wreck.sections[si];
        const im=new THREE.InstancedMesh(c.geometry, scorchedMaterial(c.material, sec.cache, sec.k), list.length); list.forEach((m,j)=>im.setMatrixAt(j,m));
        im.castShadow=c.castShadow; im.receiveShadow=c.receiveShadow; im.visible=c!==s.fineMesh; sec.inner.add(im); if(c===s.fineMesh) wreck.fineMeshes.push({im, sec}); });
      return;
    }
    // straight hull decks that span a break are cut into one piece per section instead of poking out of a single one
    if(c.isMesh && c.userData.chunk && Math.abs(c.rotation.x)<1e-3 && Math.abs(c.rotation.y)<0.4){ const bb=c.geometry.boundingBox, a=c.position.z+bb.min.z*c.scale.z, b=c.position.z+bb.max.z*c.scale.z, parts=overlaps(a,b);
      if(parts.length>1){ parts.forEach(([si,lo,hi])=>{ const sec=wreck.sections[si]; const cl=c.clone(); cl.visible=true; cl.material=scorchedMaterial(c.material, sec.cache, sec.k);
          const k=(hi-lo)/(bb.max.z-bb.min.z); cl.scale.z=k; cl.position.z=lo-bb.min.z*k; sec.inner.add(cl); }); return; } }
    const sec=wreck.sections[secOf(c.position.z)];
    const cl=c.clone(true);
    cl.traverse(o=>{ if(o.userData.mergedAway) o.visible=true; if(o.material){ const m=scorchedMaterial(o.material, sec.cache, sec.k); if(!m) o.visible=false; else o.material=m; } });
    sec.inner.add(cl);
  });
  // a wreck stays for the rest of the battle: merge each section's pieces so it costs a handful of draw calls
  wreck.sections.forEach(sec=>mergeStatic(sec.inner, new Set(), false));
  // torn, glowing cross-sections at every cut
  const radiusAt=z=>{ let r=0.12; decks.forEach(d=>{ const bb=d.geometry.boundingBox; if(d.position.z+bb.min.z<=z && d.position.z+bb.max.z>=z) r=Math.max(r, Math.min(bb.max.x-bb.min.x, bb.max.y-bb.min.y)*0.5+Math.abs(d.position.x)*0.3); }); return r; };
  cuts.forEach((z,ci)=>{ const r=radiusAt(z);
    [wreck.sections[ci], wreck.sections[ci+1]].forEach((sec,side)=>{ const e=tornEdge(r); e.position.set(rand(-.03,.03),rand(-.03,.03), z + (side===0? 0.004 : -0.004)); sec.inner.add(e); sec.embers.push({mesh:e, base:e.material.color.clone()});
      sec.fires.push({local:new THREE.Vector3(rand(-r,r)*0.5, rand(-r,r)*0.5, z), dir: side===0?1:-1, vent:true, rate:rand(0.8,1.2)}); }); });
  // hull fires scattered over each section
  wreck.sections.forEach(sec=>{ const n=1+Math.floor(Math.random()*2); for(let i=0;i<n;i++) sec.fires.push({local:new THREE.Vector3(rand(-.2,.2), rand(0,.22), rand(sec.z0,sec.z1)*0.9), dir:0, vent:false, rate:rand(0.5,1)}); });
  // sections separate along the keel, tumbling slowly
  const mid=(zmin+zmax)/2;
  wreck.sections.forEach(sec=>{ const along=sec.cz-mid; const dir=axis.clone().multiplyScalar(Math.sign(along)||(Math.random()<.5?-1:1));
    sec.vel.copy(dir).multiplyScalar(rand(0.35,0.65)).add(new THREE.Vector3(rand(-.15,.15),rand(-.05,.1),rand(-.15,.15)));
    sec.spin.set(rand(-.25,.25), rand(-.18,.18), rand(-.35,.35)); });
  // debris field: torn plates, hull shards and twisted structure, instanced per material
  // debris field: torn plates in the ship's own armor, girders, conduit, hull skin and machinery, several shapes of each
  const M=s.mats, K=DebrisKit.get();
  const plan=[{geos:K.plate, mat:M.hull, n:16, sz:[0.1,0.26]}, {geos:K.plate, mat:M.plate, n:9, sz:[0.08,0.22]}, {geos:K.shell, mat:M.hull2, n:6, sz:[0.12,0.26]},
              {geos:K.girder, mat:M.metal, n:9, sz:[0.14,0.34]}, {geos:K.pipe, mat:M.dark, n:6, sz:[0.1,0.22]}, {geos:K.chunk, mat:M.dark, n:10, sz:[0.05,0.14]}];
  plan.forEach(pd=>{ const counts=pd.geos.map(()=>0); for(let j=0;j<pd.n;j++) counts[Math.floor(Math.random()*pd.geos.length)]++;
    const base=scorchedMaterial(pd.mat, wreck.cache, rand(0.4,0.6)); let mat=wreck.cache.get('ds:'+base.uuid); if(!mat){ mat=base.clone(); mat.side=THREE.DoubleSide; wreck.cache.set('ds:'+base.uuid, mat); }
    pd.geos.forEach((geo,gi)=>{ const cnt=counts[gi]; if(!cnt) return;
      const im=new THREE.InstancedMesh(geo, mat, cnt); im.castShadow=im.receiveShadow=true; im.frustumCulled=false; scene.add(im);
      const data=[]; for(let j=0;j<cnt;j++){ const z=rand(zmin,zmax); const p=new THREE.Vector3(rand(-.2,.2),rand(-.15,.15),z).applyMatrix4(bw);
        const a=rand(pd.sz[0],pd.sz[1])*SHIP_SCALE, sc=new THREE.Vector3(a*rand(0.85,1.15), a*rand(0.85,1.15), a*rand(0.85,1.15));
        const v=p.clone().sub(bp).setY(0).normalize().multiplyScalar(rand(0.8,3.2)).add(new THREE.Vector3(rand(-.9,.9),rand(-.4,.8),rand(-.9,.9)));
        data.push({p, v, q:new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0,6),rand(0,6),rand(0,6))), w:new THREE.Vector3(rand(-3,3),rand(-3,3),rand(-3,3)), sc, hot: Math.random()<0.35 ? rand(2,6) : 0}); }
      wreck.shards.push({im, data}); }); });
  s.group.visible=false;
  wrecks.push(wreck);
  return wreck;
}
const _q=new THREE.Quaternion(), _e=new THREE.Euler(), _m=new THREE.Matrix4(), _wp=new THREE.Vector3(), _wd=new THREE.Vector3();
function updateWrecks(dt){
  for(const w of wrecks){ w.t+=dt; const t=w.t;
    for(const sec of w.sections){
      const drag=Math.max(0, 1-0.6*dt); sec.vel.multiplyScalar(drag); if(sec.vel.lengthSq()<0.0002) sec.vel.setLength(0.014);
      sec.spin.multiplyScalar(Math.max(0,1-0.15*dt)); if(sec.spin.lengthSq()<0.0016) sec.spin.setLength(0.04);
      sec.outer.position.addScaledVector(sec.vel, dt);
      _e.set(sec.spin.x*dt, sec.spin.y*dt, sec.spin.z*dt); _q.setFromEuler(_e); sec.outer.quaternion.multiply(_q);
      // fire dies down over ~30s to a smoulder with occasional flare-ups
      sec.heat = Math.max(0.12, Math.exp(-t/14));
      for(const e of sec.embers){ const f=0.75+0.25*Math.sin(t*9+e.base.r*7)*Math.random(); e.mesh.material.color.copy(e.base).multiplyScalar(Math.max(0.08, sec.heat)*f); }
      for(const f of sec.fires){
        const rate=f.rate*(f.vent? 22*Math.exp(-t/4)+sec.heat*9 : sec.heat*14 + (Math.random()<0.004?40:0));
        if(Math.random()<rate*dt){ _wp.copy(f.local); sec.inner.localToWorld(_wp);
          if(f.vent){ _wd.set(0,0,f.dir).transformDirection(sec.inner.matrixWorld);
            const gas=t<5 && Math.random()<0.3; Particles.emit(_wp, _wd.multiplyScalar(gas?rand(1.5,3):rand(1,2.2)).add(new THREE.Vector3(rand(-.3,.3),rand(-.3,.3),rand(-.3,.3))), gas?C_VENT_DIM:C_FIRE, gas?rand(0.2,0.4):rand(0.22,0.45), gas?rand(0.6,1.0):rand(0.3,0.6), 1.4, gas?0.5:0.3); }
          else Particles.emit(_wp, new THREE.Vector3(rand(-.2,.2),rand(.1,.5),rand(-.2,.2)), Math.random()<0.7?C_FIRE:C_SPARK, rand(0.18,0.36)*(0.5+sec.heat), rand(0.4,0.8), 1.5, 0.25); }
      }
      // shorted power: blue-white arcs flicker across the wreck now and then. Sparks only, no point light: a light
      // here lit up the whole hex board around every wreck for the rest of the battle, which read as the board flickering.
      if(Math.random()<dt*(0.25+sec.heat*0.6)){ _wp.set(rand(-.2,.2),rand(-.1,.2),rand(sec.z0,sec.z1)); sec.inner.localToWorld(_wp);
        Particles.burst(_wp, 10, {speed:3, color:C_ARC, size:0.12, life:0.25, drag:3}); }
    }
    for(const sh of w.shards){ const im=sh.im;
      sh.data.forEach((d,j)=>{ d.v.multiplyScalar(Math.max(0,1-0.95*dt)); if(d.v.lengthSq()<0.0004) d.v.setLength(0.02); d.p.addScaledVector(d.v, dt);
        d.w.multiplyScalar(Math.max(0,1-0.08*dt)); _e.set(d.w.x*dt,d.w.y*dt,d.w.z*dt); _q.setFromEuler(_e); d.q.multiply(_q);
        _m.compose(d.p, d.q, d.sc); im.setMatrixAt(j,_m);
        if(d.hot>0){ d.hot-=dt; if(Math.random()<dt*18) Particles.emit(d.p, new THREE.Vector3(), Math.random()<.5?C_EMBER:C_FIRE, rand(0.12,0.24), rand(0.3,0.6), 0.5, 0.2); } });
      im.instanceMatrix.needsUpdate=true; }
    for(const f of w.fineMeshes){ f.im.visible = camera.position.distanceTo(f.sec.outer.position) < 13; }
  }
}
function clearWrecks(){
  for(const w of wrecks){
    for(const sec of w.sections){ scene.remove(sec.outer); sec.embers.forEach(e=>{ e.mesh.geometry.dispose(); e.mesh.material.dispose(); }); sec.outer.traverse(o=>{ if(o.isInstancedMesh) o.dispose(); else if(o.userData.mergedProxy) o.geometry.dispose(); }); sec.cache.forEach(m=>m&&m.dispose()); }
    for(const sh of w.shards){ scene.remove(sh.im); sh.im.dispose(); }
    w.cache.forEach(m=>m&&m.dispose());
  }
  wrecks.length=0;
}
async function explodeShip(s){
  const p=s.group.position.clone(), f=fwd(s), L=s.len;
  // chain of internal blasts running along the hull
  const n=3+Math.round(L);
  for(let i=0;i<n;i++){ after(i*0.2+rand(0,.08), ()=>{ if(!s.group.visible) return; const q=p.clone().addScaledVector(f, rand(-.45,.45)*L).add(new THREE.Vector3(rand(-.2,.2),rand(0,.25),rand(-.2,.2)));
      Particles.burst(q,34,{speed:6,color:C_SPARK,size:0.4,life:0.6}); Particles.burst(q,10,{speed:2,color:C_FIRE,size:0.9,life:0.5,grow:1.2});
      flash(q,0xff8844,4,0.3); Sound.hit(); addShake(0.12); s.body.position.set(rand(-.04,.04),rand(-.04,.04),rand(-.04,.04)); }); }
  await wait(n*0.2+0.15);
  s.body.position.set(0,0,0);
  // main detonation
  Sound.boom(L/2.2); addShake(0.6+L*0.12); flash(p,0xffcc88,14,1.0);
  Particles.burst(p,170,{speed:9*L/2.5,color:C_WHITE,size:0.9,life:0.8,drag:2.5});
  Particles.burst(p,150,{speed:5*L/2.5,color:C_FIRE,size:1.6,life:1.4,drag:2,grow:1.5});
  Particles.burst(p,120,{speed:15,color:C_SPARK,size:0.3,life:1.8,drag:0.7});
  Particles.burst(p,36,{speed:2.2,color:C_VENT_DIM,size:1.4,life:2.2,drag:0.8,grow:1.1});
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.94,1,64), new THREE.MeshBasicMaterial({color:0xffb070, transparent:true, opacity:0.55, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2; ring.position.copy(p); scene.add(ring);
  addFx({t:0,update(dt){ this.t+=dt; const k=this.t/1.2; ring.scale.setScalar(1+k*12); ring.material.opacity=0.55*(1-k)*(1-k); return k<1; }, dispose(){ disposeMesh(ring); }});
  breakUpShip(s);
  s.tag.style.display='none';
  await wait(0.6);
}

