// Laniakea's Edge: hex board, highlight tiles, asteroids and terrain generation.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

/* ---------------- board ---------------- */
const board = { cells:new Map(), list:[], group:new THREE.Group(), rocks:[], seed:1, deploy:[DEPLOY.carrier] };
scene.add(board.group);
for(let q=-MAP_R;q<=MAP_R;q++) for(let r=-MAP_R;r<=MAP_R;r++){
  if(Math.abs(r)>MAP_ROWS) continue; if(hdist({q,r},{q:0,r:0})>MAP_R) continue;
  const c={q,r,t:'open',idx:board.list.length}; board.cells.set(key(q,r),c); board.list.push(c);
}
const cellAt = (q,r) => board.cells.get(key(q,r));

// grid lines (deduplicated edges, faded toward the rim)
(function buildGrid(){
  const seen=new Set(), verts=[], cols=[];
  const corners=hexCorners(HEX);
  for(const c of board.list){ const o=hexToWorld(c.q,c.r);
    for(let i=0;i<6;i++){ const a=corners[i], b=corners[(i+1)%6];
      const ax=o.x+a[0], az=o.z+a[1], bx=o.x+b[0], bz=o.z+b[1];
      const k1=`${ax.toFixed(2)},${az.toFixed(2)}`, k2=`${bx.toFixed(2)},${bz.toFixed(2)}`; const k=k1<k2?k1+'|'+k2:k2+'|'+k1;
      if(seen.has(k)) continue; seen.add(k);
      verts.push(ax,0,az,bx,0,bz);
      for(const [x,z] of [[ax,az],[bx,bz]]){ const d=Math.sqrt(x*x+z*z*1.6)/58; const f=clamp(1.1-d,0.08,1); cols.push(toLinear(0.38*f),toLinear(0.5*f),toLinear(0.6*f)); }
    } }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));
  const lines=new THREE.LineSegments(g,new THREE.LineBasicMaterial({vertexColors:true, transparent:true, opacity:0.22, depthWrite:false}));
  lines.position.y=0.01; board.group.add(lines);
})();

// highlight tiles
const tileGeo = (() => { const s=new THREE.Shape(); hexCorners(HEX*0.9).forEach(([x,y],i)=> i?s.lineTo(x,y):s.moveTo(x,y)); s.closePath(); const g=new THREE.ShapeGeometry(s); g.rotateX(Math.PI/2); return g; })();
const tiles = new THREE.InstancedMesh(tileGeo, new THREE.MeshBasicMaterial({transparent:true, opacity:0.32, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide}), board.list.length);
tiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
{ const m=new THREE.Matrix4(); board.list.forEach(c=>{ const p=hexToWorld(c.q,c.r,0.03); m.makeScale(0,0,0).setPosition(p); tiles.setMatrixAt(c.idx,m); tiles.setColorAt(c.idx,new THREE.Color(0)); }); }
tiles.frustumCulled=false; scene.add(tiles);
function setTiles(map){ // map: idx -> THREE.Color
  const m=new THREE.Matrix4();
  for(const c of board.list){ const col=map.get(c.idx); const p=hexToWorld(c.q,c.r,0.03);
    if(col){ m.makeScale(1,1,1).setPosition(p); tiles.setColorAt(c.idx,col); } else m.makeScale(0,0,0).setPosition(p);
    tiles.setMatrixAt(c.idx,m); }
  tiles.instanceMatrix.needsUpdate=true; if(tiles.instanceColor) tiles.instanceColor.needsUpdate=true;
}
function hexRing(inner, outer, color, opacity){ const g=new THREE.RingGeometry(inner, outer, 6, 1); g.rotateZ(Math.PI/6); g.rotateX(-Math.PI/2);
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({color, transparent:true, opacity, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide})); }
const selRing = hexRing(HEX*0.8, HEX*0.95, COL.player, 0.9); selRing.visible=false; scene.add(selRing);
const hoverRing = hexRing(HEX*0.86, HEX*0.93, 0xffffff, 0.45); hoverRing.visible=false; scene.add(hoverRing);
const tgtRing = hexRing(HEX*0.72, HEX*0.95, COL.enemy, 0.9); tgtRing.visible=false; scene.add(tgtRing);
const actRing = hexRing(HEX*0.8, HEX*0.95, COL.enemy, 0.7); actRing.visible=false; scene.add(actRing);
const pathLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({color:0x9fe0ff, transparent:true, opacity:0.95, depthWrite:false}));
pathLine.visible=false; scene.add(pathLine);

// asteroids
/* ---- procedural asteroids: dense icospheres with noise relief, craters, fractured faces and shader micro-detail ---- */
const RockNoise = (() => {
  const h=(i,j,k,s)=>{ const x=Math.sin(i*127.1+j*311.7+k*74.7+s*19.19)*43758.5453; return x-Math.floor(x); };
  const sm=t=>t*t*(3-2*t);
  function vn(x,y,z,s){ const ix=Math.floor(x), iy=Math.floor(y), iz=Math.floor(z); const fx=sm(x-ix), fy=sm(y-iy), fz=sm(z-iz);
    const l=(a,b,t)=>a+(b-a)*t;
    return l(l(l(h(ix,iy,iz,s),h(ix+1,iy,iz,s),fx), l(h(ix,iy+1,iz,s),h(ix+1,iy+1,iz,s),fx), fy),
             l(l(h(ix,iy,iz+1,s),h(ix+1,iy,iz+1,s),fx), l(h(ix,iy+1,iz+1,s),h(ix+1,iy+1,iz+1,s),fx), fy), fz)*2-1; }
  function fbm(x,y,z,s,oct=5){ let v=0,a=0.5,f=1; for(let i=0;i<oct;i++){ v+=a*vn(x*f,y*f,z*f,s+i*7); f*=2.03; a*=0.5; } return v; }
  function ridged(x,y,z,s,oct=4){ let v=0,a=0.5,f=1; for(let i=0;i<oct;i++){ const n=1-Math.abs(vn(x*f,y*f,z*f,s+i*13)); v+=a*n*n; f*=2.1; a*=0.5; } return v; }
  return {fbm, ridged};
})();
function icoSphere(detail){
  const src=new THREE.IcosahedronGeometry(1,detail), p=src.attributes.position, map=new Map(), verts=[], idx=[];
  for(let i=0;i<p.count;i++){ const x=p.getX(i), y=p.getY(i), z=p.getZ(i); const k=`${Math.round(x*1e4)},${Math.round(y*1e4)},${Math.round(z*1e4)}`;
    let id=map.get(k); if(id===undefined){ id=verts.length/3; map.set(k,id); verts.push(x,y,z); } idx.push(id); }
  src.dispose(); const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3)); g.setIndex(idx); return g;
}
function makeRockGeometry(seed, detail, big){
  const R=mulberry32(seed), N=RockNoise, g=icoSphere(detail), p=g.attributes.position, col=new Float32Array(p.count*3), v=new THREE.Vector3();
  const so=seed*0.37;
  const stretch=new THREE.Vector3(0.85+R()*0.45, 0.62+R()*0.3, 0.85+R()*0.45);
  const rdir=()=>new THREE.Vector3(R()*2-1,R()*2-1,R()*2-1).normalize();
  const craters=[...Array(big?9+Math.floor(R()*6):3)].map(()=>({c:rdir(), r:(big?0.12:0.25)+R()*(big?0.32:0.3), d:0.05+R()*0.09}));
  const cuts=[...Array(big?2+Math.floor(R()*2):1)].map(()=>({n:rdir(), o:0.7+R()*0.18}));
  const tint=[1.0, 0.93+R()*0.04, 0.84+R()*0.06];
  for(let i=0;i<p.count;i++){
    v.fromBufferAttribute(p,i).normalize();
    let hgt = 1 + N.fbm(v.x*1.5+so, v.y*1.5, v.z*1.5, seed)*0.34 + N.ridged(v.x*3.2, v.y*3.2+so, v.z*3.2, seed+3)*0.11 + N.fbm(v.x*8, v.y*8, v.z*8+so, seed+5, 3)*0.035;
    let crater=0, rim=0;
    for(const c of craters){ const a=Math.acos(clamp(v.dot(c.c),-1,1))/c.r;
      if(a<1){ const b=1-a*a; hgt-=c.d*b; crater=Math.max(crater,b); }
      const rr=Math.exp(-Math.pow((a-1)/0.17,2)); hgt+=c.d*0.4*rr; rim=Math.max(rim,rr); }
    v.multiplyScalar(hgt).multiply(stretch);
    let cut=0; for(const c of cuts){ const d=v.dot(c.n); if(d>c.o){ v.addScaledVector(c.n,-(d-c.o)*0.9); cut=1; } }
    p.setXYZ(i,v.x,v.y,v.z);
    let shade=0.36 + N.fbm(v.x*2.6,v.y*2.6,v.z*2.6,seed+9,4)*0.16 - crater*0.09 + rim*0.07 + cut*0.05 + (R()-0.5)*0.035;
    // occasional mineral banding
    shade += Math.max(0, Math.sin(v.y*9+N.fbm(v.x*2,v.y*2,v.z*2,seed+11,3)*4))*0.03;
    col[i*3]=toLinear(shade*tint[0]*0.92); col[i*3+1]=toLinear(shade*tint[1]*0.94); col[i*3+2]=toLinear(shade*tint[2]*0.98);
  }
  g.setAttribute('color',new THREE.BufferAttribute(col,3)); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}
const bigRockGeos = [0,1,2,3,4,5].map(s=>makeRockGeometry(101+s*17, 22, true));
const smallRockGeos = [0,1,2,3,4,5].map(s=>makeRockGeometry(401+s*23, 6, false));
const rockMat = new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.9, metalness:0.08, envMapIntensity:0.6});
rockMat.onBeforeCompile = sh => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vObjPos;
float rh(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
float rn(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(rh(i),rh(i+vec3(1,0,0)),f.x),mix(rh(i+vec3(0,1,0)),rh(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(rh(i+vec3(0,0,1)),rh(i+vec3(1,0,1)),f.x),mix(rh(i+vec3(0,1,1)),rh(i+vec3(1,1,1)),f.x),f.y),f.z); }
float rockH(vec3 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*rn(p); p*=2.17; a*=0.5; } return v; }
vec3 rockPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float fd){
  vec3 sx=dFdx(surf_pos), sy=dFdy(surf_pos); vec3 r1=cross(sy,surf_norm), r2=cross(surf_norm,sx);
  float det=dot(sx,r1)*fd; vec3 grad=sign(det)*(dHdxy.x*r1+dHdxy.y*r2); return normalize(abs(det)*surf_norm-grad); }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
float rgrain = rockH(vObjPos*5.0);
diffuseColor.rgb *= 0.86 + 0.28*rgrain;`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
float rlod = clamp(1.0 - length(fwidth(vObjPos*18.0))*1.5, 0.0, 1.0);
float rhgt = rockH(vObjPos*5.0)*0.5 + rockH(vObjPos*18.0)*0.18*rlod;
normal = rockPerturb(-vViewPosition, normal, vec2(dFdx(rhgt), dFdy(rhgt))*0.22*(0.35+0.65*rlod), faceDirection);`);
};
const dustMat = new THREE.SpriteMaterial({map:glowTex, color:0x6b5a48, transparent:true, opacity:0.18, depthWrite:false});
const ROCK_HP=90;
function makeRockTarget(c){ const o=hexToWorld(c.q,c.r);
  return {isRock:true, name:'asteroid', cls:'asteroid', C:{label:'Asteroid'}, q:c.q, r:c.r, cell:c, hull:ROCK_HP, hullMax:ROCK_HP, armor:4, shield:0, shieldMax:0, ev:0, pdc:0,
    fx:{}, side:'rock', alive:true, len:2.2, group:{position:new THREE.Vector3(o.x,0.9,o.z)}, meshes:[]}; }
function rockDamaged(rt){ const k=0.62+0.38*Math.max(0,rt.hull/rt.hullMax); rt.meshes.forEach(m=>m.scale.copy(m.userData.s0).multiplyScalar(k));
  Particles.burst(hitPoint(rt),14,{speed:3,color:new THREE.Color(.42,.36,.3),size:0.9,life:1.4,drag:1.2,grow:0.8}); }
function destroyRock(rt, by){
  rt.alive=false; const c=rt.cell, p=rt.group.position.clone();
  log(`${by?by.name+' shatters':'Shattered'} an asteroid. The lane is open.`, 'k');
  Sound.boom(1.1); addShake(0.55); flash(p,0xffd6a8,10,0.9);
  Particles.burst(p,140,{speed:6,color:new THREE.Color(.42,.36,.3),size:1.8,life:2.6,drag:1.1,grow:1.4});
  Particles.burst(p,90,{speed:11,color:C_SPARK,size:0.35,life:1.1,drag:1});
  Particles.burst(p,50,{speed:4,color:C_FIRE,size:1.2,life:0.7,drag:2,grow:1});
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.94,1,64), new THREE.MeshBasicMaterial({color:0xd8b890, transparent:true, opacity:0.4, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2; ring.position.copy(p); scene.add(ring);
  addFx({t:0,update(dt){ this.t+=dt; const k=this.t/1.1; ring.scale.setScalar(1+k*8); ring.material.opacity=0.4*(1-k)*(1-k); return k<1; }, dispose(){ disposeMesh(ring); }});
  for(const m of rt.meshes){ board.group.remove(m); board.rocks=board.rocks.filter(x=>x!==m);
    const base=m.position.clone(), sz=m.scale.x;
    for(let i=0;i<14;i++){ const keep=i<7; const f=new THREE.Mesh(smallRockGeos[Math.floor(Math.random()*6)], rockMat);
      f.scale.setScalar(sz*(keep?rand(0.14,0.28):rand(0.06,0.14))); f.position.copy(base).add(new THREE.Vector3(rand(-.5,.5),rand(-.4,.4),rand(-.5,.5)));
      f.rotation.set(rand(0,6),rand(0,6),rand(0,6)); f.castShadow=f.receiveShadow=true; board.group.add(f);
      const v=f.position.clone().sub(p).setY(rand(-0.3,0.6)).normalize().multiplyScalar(keep?rand(1.5,3.2):rand(6,11)); const spin=new THREE.Vector3(rand(-3,3),rand(-3,3),rand(-3,3));
      if(keep){ f.userData.spin=spin.clone().multiplyScalar(0.25); board.rocks.push(f); }
      else f.material=rockMat;
      addFx({t:0,update(dt){ this.t+=dt; f.position.addScaledVector(v,dt); v.multiplyScalar(Math.max(0,1-(keep?1.6:0.3)*dt)); if(!keep){ f.rotation.x+=spin.x*dt; f.rotation.y+=spin.y*dt; }
          if(!keep && Math.random()<0.3) Particles.emit(f.position,new THREE.Vector3(),new THREE.Color(.3,.26,.22),0.5,0.8,0.5,0.5);
          if(!keep && this.t>2.2){ f.scale.multiplyScalar(1-dt*1.5); }
          return keep? this.t<3 : this.t<4; },
        dispose(){ if(!keep){ board.group.remove(f); } }});
    }
  }
  board.group.remove(rt.pick); board.rocks=board.rocks.filter(x=>x!==rt.pick);
  c.t='debris'; c.rock=null;
  const s=new THREE.Sprite(dustMat); s.position.set(p.x,0.8,p.z); s.scale.setScalar(5); board.group.add(s); board.rocks.push(s);
  if(state.phase==='player' && !state.busy) recomputeHighlights();
}
function generateTerrain(seed){
  board.rocks.forEach(o=>board.group.remove(o)); board.rocks=[];
  let R=mulberry32(seed), tries=0;
  while(true){
    board.list.forEach(c=>{ c.t='open'; c.rock=null; });
    const dep=new Set(); board.deploy.forEach(([q,r])=>{ dep.add(key(q,r)); dep.add(key(-q,-r)); });
    const cand = board.list.filter(c=>{ const x=c.q+c.r/2; return Math.abs(x)<=5.5 && Math.abs(c.r)<=5 && (c.q!==0||c.r!==0) && !dep.has(key(c.q,c.r)); });
    const setT=(c,t)=>{ const m=cellAt(-c.q,-c.r); if(c.t==='open'&&m&&m.t==='open'){ c.t=t; m.t=t; } };
    for(let i=0;i<5;i++){ const c=cand[Math.floor(R()*cand.length)]; setT(c,'rock'); const n=Math.floor(R()*3); for(let k=0;k<n;k++){ const d=DIRS[Math.floor(R()*6)]; const nc=cellAt(c.q+d[0],c.r+d[1]); if(nc&&cand.includes(nc)) setT(nc,'rock'); } }
    for(let i=0;i<8;i++){ const c=cand[Math.floor(R()*cand.length)]; setT(c,'debris'); const n=1+Math.floor(R()*3); for(let k=0;k<n;k++){ const d=DIRS[Math.floor(R()*6)]; const nc=cellAt(c.q+d[0],c.r+d[1]); if(nc&&cand.includes(nc)) setT(nc,'debris'); } }
    // connectivity: every deployment must reach every enemy deployment without crossing rock
    const start=cellAt(board.deploy[0][0],board.deploy[0][1]); const seen=new Set([start.idx]); const qu=[start];
    while(qu.length){ const c=qu.shift(); for(const d of DIRS){ const n=cellAt(c.q+d[0],c.r+d[1]); if(n&&n.t!=='rock'&&!seen.has(n.idx)){ seen.add(n.idx); qu.push(n); } } }
    const ok = board.list.filter(c=>c.t!=='rock').every(c=>seen.has(c.idx));
    if(ok || ++tries>30) break;
  }
  for(const c of board.list){
    const o=hexToWorld(c.q,c.r);
    if(c.t==='rock'){ const n=1+Math.floor(R()*2); const rt=c.rock=makeRockTarget(c);
      const pk=new THREE.Mesh(new THREE.SphereGeometry(1.45,10,8),new THREE.MeshBasicMaterial()); pk.visible=false; pk.position.set(o.x,0.9,o.z); pk.userData.cell=c; board.group.add(pk); board.rocks.push(pk); rt.pick=pk;
      for(let i=0;i<n;i++){ const m=new THREE.Mesh(bigRockGeos[Math.floor(R()*6)], rockMat); const s=(n===1?1.3:0.9)+R()*0.4; rt.meshes.push(m);
        m.scale.set(s*(0.9+R()*0.3),s*(0.85+R()*0.3),s*(0.9+R()*0.3)); m.position.set(o.x+(R()-.5)*(n-1)*1.4, 0.6+R()*0.8, o.z+(R()-.5)*(n-1)*1.2);
        m.rotation.set(R()*6,R()*6,R()*6); m.userData.spin=new THREE.Vector3((R()-.5)*0.2,(R()-.5)*0.2,(R()-.5)*0.2); m.userData.s0=m.scale.clone(); board.group.add(m); board.rocks.push(m); }
      // loose rubble drifting around the big body
      for(let i=0;i<5;i++){ const m=new THREE.Mesh(smallRockGeos[Math.floor(R()*6)], rockMat); m.scale.setScalar(0.07+R()*0.14); const a=R()*Math.PI*2, rr=1.3+R()*0.6;
        m.position.set(o.x+Math.cos(a)*rr, 0.3+R()*1.5, o.z+Math.sin(a)*rr); m.rotation.set(R()*6,R()*6,R()*6); m.userData.spin=new THREE.Vector3((R()-.5),(R()-.5),(R()-.5)); board.group.add(m); board.rocks.push(m); } }
    else if(c.t==='debris'){
      for(let i=0;i<9;i++){ const big=i<2; const m=new THREE.Mesh((big?bigRockGeos:smallRockGeos)[Math.floor(R()*6)], rockMat); m.scale.setScalar(big?0.28+R()*0.12:0.08+R()*0.2);
        m.position.set(o.x+(R()-.5)*2.6, 0.2+R()*1.6, o.z+(R()-.5)*2.4); m.rotation.set(R()*6,R()*6,R()*6);
        m.userData.spin=new THREE.Vector3((R()-.5),(R()-.5),(R()-.5)); board.group.add(m); board.rocks.push(m); }
      const s=new THREE.Sprite(dustMat); s.position.set(o.x,0.8,o.z); s.scale.setScalar(5); board.group.add(s); board.rocks.push(s);
    }
  }
  enableShadows(board.group);
}

