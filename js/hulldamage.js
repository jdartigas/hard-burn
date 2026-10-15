// Laniakea's Edge: battle damage on the hull (v122, Jon). Every hit that reaches the hull leaves a wound where it
// struck: a charred patch with a ragged edge that glows hot, cools to an ember and goes black. How much of the hull
// is gone sets a tier, and the model gets worse with it, restrained in the manner of The Expanse:
//   tier 1 (under 75%): fittings blown off near the worst wound, a thin smoke trail
//   tier 2 (under 50%): the worst wound opens into a gash (dark, ribbed, a faint ember rim), a dish torn away,
//                       air venting from the gash, running lights flickering
//   tier 3 (under 25%): a second gash, most lights out, a slight list, the drives sputtering
// Repairs cool and shrink the wounds and step the tier back down; anything torn off stays gone.
// Cosmetic only (Math.random), and skipped entirely in sims.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

const HD = { max:12, tiers:[0.75,0.5,0.25], grow:0.7, hot:0.9, ember:0.12, emberLife:10, mergeCap:0.13, list:0.07 };
const HD_FRAG = `uniform vec4 uW[12]; uniform float uH[12]; uniform float uK[12]; uniform int uN; uniform float uGrow; varying vec3 vHdL;
float hdHash(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
float hdNoise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hdHash(i),hdHash(i+vec3(1.0,0.0,0.0)),f.x),mix(hdHash(i+vec3(0.0,1.0,0.0)),hdHash(i+vec3(1.0,1.0,0.0)),f.x),f.y),
             mix(mix(hdHash(i+vec3(0.0,0.0,1.0)),hdHash(i+vec3(1.0,0.0,1.0)),f.x),mix(hdHash(i+vec3(0.0,1.0,1.0)),hdHash(i+vec3(1.0,1.0,1.0)),f.x),f.y),f.z); }
void hdEval(inout float ch, inout float so, inout float gl, inout float ga, inout float rib){
  if(uN==0) return;
  float n=hdNoise(vHdL*38.0)*0.6+hdNoise(vHdL*95.0)*0.4;
  for(int i=0;i<12;i++){ if(i>=uN) break;
    vec4 w=uW[i]; float e=distance(vHdL,w.xyz)/(w.w*uGrow)+(n-0.5)*0.55;
    float c=1.0-smoothstep(0.45,0.85,e); ch=max(ch,c);
    so=max(so,1.0-smoothstep(0.85,1.7,e));
    float ring=smoothstep(0.35,0.62,e)*(1.0-smoothstep(0.62,0.9,e));
    gl+=uH[i]*(ring*0.8+c*0.18*step(0.7,n));
    if(uK[i]>0.5){ float g=1.0-smoothstep(0.25,0.5,e); ga=max(ga,g); rib=max(rib,step(0.72,fract(vHdL.z*30.0))*g);
      gl+=0.14*smoothstep(0.36,0.48,e)*(1.0-smoothstep(0.48,0.6,e)); }
  }
}`;
// hook a ship material so it draws the wounds in U (shared by every material of one ship, or one wreck section)
function hdHook(m, U){
  m.onBeforeCompile=sh=>{ Object.assign(sh.uniforms, U);
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nuniform mat4 uBodyInv; varying vec3 vHdL;')
      .replace('#include <project_vertex>','#include <project_vertex>\nvec4 hdP=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nhdP=instanceMatrix*hdP;\n#endif\nvHdL=(uBodyInv*modelMatrix*hdP).xyz;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\n'+HD_FRAG)
      .replace('#include <color_fragment>','#include <color_fragment>\nfloat hdC=0.0, hdS=0.0, hdG=0.0, hdGa=0.0, hdR=0.0; hdEval(hdC,hdS,hdG,hdGa,hdR);\ndiffuseColor.rgb*=mix(1.0,0.5,hdS)*mix(1.0,0.07,hdC);\ndiffuseColor.rgb=mix(diffuseColor.rgb, vec3(0.012)+vec3(0.09)*hdR, hdGa);')
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,1.0,max(hdC,hdGa));')
      .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,0.15,max(hdC,hdGa)*0.8);')
      .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance=totalEmissiveRadiance*(1.0-max(hdC,hdGa))+vec3(1.0,0.36,0.08)*hdG;'); };
  m.customProgramCacheKey=()=>'hd1'; m.needsUpdate=true;
}
function hdUniforms(){ return { uBodyInv:{value:new THREE.Matrix4()}, uW:{value:Array.from({length:HD.max},()=>new THREE.Vector4())},
  uH:{value:new Float32Array(HD.max)}, uK:{value:new Float32Array(HD.max)}, uN:{value:0}, uGrow:{value:1} }; }
function hdInit(s){
  const U=hdUniforms();
  // what a hit can strike: the drawn, opaque hull (the merged meshes and instanced detail; no plumes, sprites or shield)
  const ks=new Set(); (s.knock||[]).forEach(k=>k.traverse(o=>ks.add(o)));
  const solids=[]; s.body.traverse(o=>{ const m=o.material; if(o.isMesh && !ks.has(o) && o.visible && m && !Array.isArray(m) && m.isMeshStandardMaterial && !m.transparent) solids.push(o); });
  s.hd={U, wounds:[], tier:0, lastHull:s.hull, lightsOff:[], list:0, debrisMat:null, solids};
  for(const k in s.mats){ const m=s.mats[k]; if(m && m.isMeshStandardMaterial) hdHook(m, U); }
  return s.hd;
}

// ---- a hit lands on the hull: find where on the model it struck, and wound it there ----
const _hdRay=new THREE.Raycaster(), _hdV=new THREE.Vector3(), _hdN=new THREE.Vector3();
function hullWound(s, from, p, dmg){
  if(simRunning || window.__norender || !s.alive) return;
  const hd=s.hd || hdInit(s), solid=h=>{ const m=h.object.material; return m && !Array.isArray(m) && m.isMeshStandardMaterial && !m.transparent; };
  s.group.updateMatrixWorld(true);
  let hit=null;
  for(const [o,t] of [[from,p],[p.clone().addScaledVector(p.clone().sub(s.group.position),1.5),s.group.position]]){
    _hdRay.set(o, _hdV.copy(t).sub(o).normalize()); _hdRay.far=1e4;
    hit=_hdRay.intersectObjects(hd.solids,false).find(h=>h.object.parent && solid(h)); if(hit) break; }
  const lp= s.body.worldToLocal(hit? hit.point.clone() : p.clone());
  const ln= hit && hit.face ? _hdN.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).transformDirection(new THREE.Matrix4().copy(s.body.matrixWorld).invert()).clone() : new THREE.Vector3(0,1,0);
  const r=s.modelLen*(0.025+0.05*Math.min(1,Math.sqrt(dmg/s.hullMax*3)));
  if(hd.wounds.length<HD.max) hd.wounds.push({p:lp, n:ln, r, t:0, gash:false});
  else { let best=hd.wounds[0], bd=1e9; for(const w of hd.wounds){ const d=w.p.distanceTo(lp); if(d<bd){ bd=d; best=w; } }
    best.r=Math.min(s.modelLen*HD.mergeCap, best.r*1.12+r*0.3); best.t=0; }
}

// ---- per frame, for each living ship (from updateDamageFx) ----
function hullDamageTick(s, dt){
  if(window.__norender) return;
  const hd=s.hd; if(!hd) return;
  const U=hd.U, frac=Math.max(0,s.hull)/s.hullMax;
  U.uBodyInv.value.copy(s.body.matrixWorld).invert();
  U.uGrow.value=1+(1-frac)*HD.grow;
  hd.wounds.forEach((w,i)=>{ w.t+=dt; U.uW.value[i].set(w.p.x,w.p.y,w.p.z,w.r); U.uK.value[i]=w.gash?1:0;
    U.uH.value[i]=Math.exp(-w.t/HD.hot)+HD.ember*Math.exp(-w.t/HD.emberLife); });
  U.uN.value=hd.wounds.length;
  // repairs: the wounds cool and close up a little
  if(s.hull>hd.lastHull+0.5){ const k=Math.max(0.55, 1-(s.hull-hd.lastHull)/s.hullMax*2.5); hd.wounds.forEach(w=>{ w.r*=k; w.t=Math.max(w.t,8); }); }
  hd.lastHull=s.hull;
  const tier= frac>HD.tiers[0]? 0 : frac>HD.tiers[1]? 1 : frac>HD.tiers[2]? 2 : 3;
  while(hd.tier<tier){ hd.tier++; hdTierUp(s, hd.tier); }
  if(tier<hd.tier){ hd.tier=tier; hdTierDown(s, tier); }
  // lingering effects, thin on purpose
  const lowQ= quality==='low', worst=hdWorst(hd);
  if(worst && hd.tier>=1 && !lowQ && Math.random()<dt*(0.8+hd.tier*1.1)){ const p=s.body.localToWorld(_hdV.copy(worst.p));
    Particles.emit(p, new THREE.Vector3(rand(-.15,.15),rand(.25,.55),rand(-.15,.15)), C_DMG_SMOKE, rand(0.3,0.55), rand(1.2,2.0), 0.4, 0.5); }
  if(hd.tier>=2) for(const w of hd.wounds){ if(!w.gash || Math.random()>dt*(lowQ?3:9)) continue;
    const p=s.body.localToWorld(_hdV.copy(w.p)), n=w.n.clone().transformDirection(s.body.matrixWorld);
    Particles.emit(p, n.multiplyScalar(rand(0.8,1.8)).add(new THREE.Vector3(rand(-.2,.2),rand(-.2,.2),rand(-.2,.2))), C_VENT_DIM, rand(0.12,0.24), rand(0.4,0.8), 1.5, 0.4);
    if(Math.random()<0.08) Particles.emit(p, n.clone().multiplyScalar(rand(1,3)), C_DMG_SPARK, 0.08, 0.3, 2); }
  if(hd.tier>=2 && Math.random()<dt*(hd.tier>=3?1.2:0.6)){ const live=s.lights.filter(l=>l.visible); if(live.length){ const l=live[Math.floor(Math.random()*live.length)]; l.visible=false; after(rand(0.06,0.18), ()=>{ if(!hd.lightsOff.includes(l)) l.visible=true; }); } }
  const listGoal= hd.tier>=3? hd.list : 0; s.group.rotation.z+= (listGoal-s.group.rotation.z)*Math.min(1,dt*0.8);
  if(hd.tier>=3 && Math.random()<dt*1.4 && s.engines.length){ const e=s.engines[Math.floor(Math.random()*s.engines.length)]; e.cur*=0.45; }
}
const hdWorst=hd=>hd.wounds.reduce((a,w)=>!a||w.r>a.r?w:a, null);

function hdTierUp(s, tier){
  const hd=s.hd, worst=hdWorst(hd);
  if(tier===1){ hdKnock(s, worst, 3); hdPlates(s, worst, 3); }
  if(tier===2){ if(worst){ worst.gash=true; worst.r*=1.25; } hdKnock(s, worst, 3); hdPlates(s, worst, 4); hdTearDish(s); hdLightsOff(s, 0.3); }
  if(tier===3){ const next=hd.wounds.filter(w=>!w.gash).reduce((a,w)=>!a||w.r>a.r?w:a, null); if(next){ next.gash=true; next.r*=1.2; }
    hdKnock(s, next||worst, 2); hdPlates(s, next||worst, 3); hdLightsOff(s, 0.6); hd.list=HD.list*(Math.random()<.5?-1:1); }
}
function hdTierDown(s, tier){
  const hd=s.hd, gashes=hd.wounds.filter(w=>w.gash);
  gashes.forEach((w,i)=>{ if(tier<2 || (tier<3 && i>0)){ w.gash=false; w.r*=0.8; } });
  const keep= tier>=3? 0.6 : tier>=2? 0.3 : 0, n=Math.round(s.lights.length*keep);
  while(hd.lightsOff.length>n){ const l=hd.lightsOff.pop(); l.visible=true; }
}
function hdLightsOff(s, share){ const hd=s.hd, want=Math.round(s.lights.length*share);
  const on=s.lights.filter(l=>!hd.lightsOff.includes(l)).sort(()=>Math.random()-0.5);
  while(hd.lightsOff.length<want && on.length){ const l=on.pop(); l.visible=false; hd.lightsOff.push(l); } }

// small instanced fittings near a wound are blown off: hidden in place, and a copy tumbles away
const _hdM=new THREE.Matrix4(), _hdZ=new THREE.Matrix4().makeScale(0,0,0), _hdP=new THREE.Vector3();
function hdKnock(s, w, n){ if(!w) return;
  const found=[];
  s.body.children.forEach(c=>{ if(!c.isInstancedMesh || c===s.fineMesh) return;
    for(let j=0;j<c.count;j++){ c.getMatrixAt(j,_hdM); if(_hdM.elements[0]===0 && _hdM.elements[5]===0) continue; _hdP.setFromMatrixPosition(_hdM).applyMatrix4(c.matrix);
      const d=_hdP.distanceTo(w.p); if(d<w.r*4) found.push({c, j, d, m:_hdM.clone()}); } });
  found.sort((a,b)=>a.d-b.d).slice(0,n).forEach(f=>{ const wm=new THREE.Matrix4().multiplyMatrices(s.body.matrixWorld, new THREE.Matrix4().multiplyMatrices(f.c.matrix, f.m));
    f.c.setMatrixAt(f.j,_hdZ); f.c.instanceMatrix.needsUpdate=true;
    const mesh=new THREE.Mesh(f.c.geometry, f.c.material); wm.decompose(mesh.position, mesh.quaternion, mesh.scale); hdFly(s, mesh, w, false); });
}
// torn plating from the wound itself
function hdPlates(s, w, n){ if(!w) return;
  const hd=s.hd, K=DebrisKit.get(); if(!hd.debrisMat) hd.debrisMat=scorchedMaterial(s.mats.hull, new Map(), 0.45);
  const at=s.body.localToWorld(w.p.clone()), sc=s.group.scale.x;
  for(let i=0;i<n;i++){ const geo=K.plate[Math.floor(Math.random()*K.plate.length)], mesh=new THREE.Mesh(geo, hd.debrisMat);
    mesh.position.copy(at); mesh.scale.setScalar(rand(0.04,0.09)*s.modelLen*sc); mesh.rotation.set(rand(0,6),rand(0,6),rand(0,6)); hdFly(s, mesh, w, true); }
}
// the first dish on the hull rips off its mount and tumbles away
function hdTearDish(s){ const d=(s.knock||[]).find(k=>k.parent===s.body); if(!d) return;
  s.body.updateMatrixWorld(true); const wm=d.matrixWorld.clone(); s.body.remove(d); const g=new THREE.Group(); wm.decompose(g.position,g.quaternion,g.scale); d.position.set(0,0,0); d.rotation.set(0,0,0); d.scale.set(1,1,1); g.add(d);
  Particles.burst(g.position,16,{speed:3,color:C_SPARK,size:0.14,life:0.5}); hdFly(s, g, null, false, 0.6); }
function hdFly(s, obj, w, own, speed=1){
  scene.add(obj);
  const out= w? w.n.clone().transformDirection(s.body.matrixWorld) : new THREE.Vector3(rand(-1,1),1,rand(-1,1)).normalize();
  const v=out.multiplyScalar(rand(1.2,2.6)*speed).add(new THREE.Vector3(rand(-.6,.6),rand(-.2,.5),rand(-.6,.6))), spin=new THREE.Vector3(rand(-4,4),rand(-4,4),rand(-4,4));
  addFx({t:0, dur:rand(5,7), update(dt){ this.t+=dt; obj.position.addScaledVector(v,dt); v.multiplyScalar(Math.max(0,1-0.25*dt));
    obj.rotation.x+=spin.x*dt; obj.rotation.y+=spin.y*dt; obj.rotation.z+=spin.z*dt; const k=this.t/this.dur; if(k>0.8) obj.scale.multiplyScalar(Math.max(0,1-dt*3)); return k<1; },
    dispose(){ scene.remove(obj); } });
}
// a wreck section keeps the ship's wounds, cooled (wrecks.js); the section's inner group is in body space
function hdCarry(s){ const hd=s.hd; if(!hd || !hd.wounds.length) return null; const U=hdUniforms(), V=hd.U;
  for(let i=0;i<HD.max;i++){ U.uW.value[i].copy(V.uW.value[i]); U.uK.value[i]=V.uK.value[i]; U.uH.value[i]=V.uH.value[i]*0.4; }
  U.uN.value=V.uN.value; U.uGrow.value=V.uGrow.value; return U; }
