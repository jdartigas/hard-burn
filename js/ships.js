// Laniakea's Edge: ship models: armor textures, materials, per-class builders, drive plumes, mesh merging.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

/* ---------------- ship models ---------------- */
/* ---------------- ship models (Expanse-inspired: stacked decks, drive at the stern, keel guns, PDC turrets) ----------------
   Player fleet: sleek naval style, chamfered armored decks, grey with amber markings.
   Enemy fleet: cobbled frontier style, boxy modules, exposed trusses, strapped-on tanks, patchwork plating. */
// Armor panel set (v54, from Jon's reference sheets): square riveted plates in a grid, some doubled up, with dark
// seams between them, a row of rivets round every plate, the odd scuffed or replaced plate, chipped edges, grime
// and small amber running lights. Color, normal (from a height field), packed occlusion/roughness/metalness and
// emissive are all generated here.
function armorTextures(seed){
  const S=1024, R=mulberry32(seed);
  const H=new Float32Array(S*S), Cc=new Float32Array(S*S), Ro=new Float32Array(S*S), Me=new Float32Array(S*S), Ao=new Float32Array(S*S);
  H.fill(0.06); Cc.fill(0.3); Ro.fill(0.85); Ao.fill(0.45);
  const rect=(x0,y0,w,h,fn)=>{ for(let y=Math.max(0,y0|0); y<Math.min(S,(y0+h)|0); y++) for(let x=Math.max(0,x0|0); x<Math.min(S,(x0+w)|0); x++) fn(y*S+x, x-x0, y-y0); };
  const P=64, N=S/P, used=new Uint8Array(N*N), plates=[];
  for(let gy=0; gy<N; gy++) for(let gx=0; gx<N; gx++){ if(used[gy*N+gx]) continue;
    const r=R(); let w=1, h=1; if(r<0.18) w=2; else if(r<0.32) h=2; else if(r<0.37){ w=2; h=2; }
    if(gx+w>N) w=1; if(gy+h>N) h=1;
    for(let j=0;j<h;j++) for(let i=0;i<w;i++) if(used[(gy+j)*N+gx+i]){ w=1; h=1; }
    for(let j=0;j<h;j++) for(let i=0;i<w;i++) used[(gy+j)*N+gx+i]=1;
    plates.push([gx*P, gy*P, w*P, h*P]); }
  for(const [px,py,pw,ph] of plates){
    const k=R(), shade= k<0.05? 0.82+R()*0.1 : k<0.12? 0.5+R()*0.08 : 0.6+R()*0.12, rough=0.55+R()*0.25, tilt=(R()-0.5)*0.06;
    rect(px+2,py+2,pw-4,ph-4,(i,lx,ly)=>{ const e=Math.min(lx,ly,pw-5-lx,ph-5-ly), bevel=Math.min(1,e/3);
      H[i]=0.5+0.4*bevel+tilt*(lx/pw-0.5); Cc[i]=shade*(0.9+0.1*bevel); Ro[i]=rough; Ao[i]=0.75+0.25*bevel; });
    // rivets: a row inset round the plate edge
    const inset=6, step=12, dot=(cx,cy)=>rect(cx-2,cy-2,5,5,(i,lx,ly)=>{ const d=(lx-2)*(lx-2)+(ly-2)*(ly-2); if(d<=5){ H[i]+=0.12*(1-d/6); Cc[i]=Math.min(1,Cc[i]*1.25+0.05); Ro[i]=0.4; Me[i]=0.5; } });
    for(let x=px+inset; x<=px+pw-inset; x+=step){ dot(x,py+inset); dot(x,py+ph-inset); }
    for(let y=py+inset+step; y<py+ph-inset; y+=step){ dot(px+inset,y); dot(px+pw-inset,y); }
  }
  // a few recessed hatches and vents
  for(let k=0;k<10;k++){ const pl=plates[Math.floor(R()*plates.length)], hw=pl[2]-28, hh=Math.min(pl[3]-28, 18+Math.floor(R()*20)), hx=pl[0]+14, hy=pl[1]+14;
    const vent=R()<0.5; rect(hx,hy,hw,hh,(i,lx,ly)=>{ const e=Math.min(lx,ly,hw-1-lx,hh-1-ly); if(e<2){ H[i]=0.2; Ao[i]=0.35; } else if(vent){ H[i]= ly%5<2? 0.25:0.45; Cc[i]*=0.6; } else { H[i]=0.42; Cc[i]*=0.85; } }); }
  // chipped paint: bare metal along plate edges
  for(let k=0;k<1100;k++){ const pl=plates[Math.floor(R()*plates.length)], side=Math.floor(R()*4), t=R();
    const cx= side<2? pl[0]+t*pl[2] : pl[0]+(side===2?3:pl[2]-4), cy= side<2? pl[1]+(side===0?3:pl[3]-4) : pl[1]+t*pl[3], r=1+R()*2.6;
    rect(cx-r,cy-r,r*2+1,r*2+1,(i,lx,ly)=>{ const dx=lx-r, dy=ly-r; if(dx*dx+dy*dy<=r*r){ Cc[i]=0.78; Ro[i]=0.32; Me[i]=0.95; H[i]-=0.03; } }); }
  // grime streaks running aft
  for(let k=0;k<180;k++){ const x=Math.floor(R()*S), y=Math.floor(R()*S), len=30+R()*140, w=1+Math.floor(R()*3), a=0.05+R()*0.12;
    rect(x,y,w,len,(i,lx,ly)=>{ Cc[i]*=1-a*(1-ly/len); Ro[i]=Math.min(1,Ro[i]+a); }); }
  const toCanvas=(fn)=>canvasTex(S,S,(g)=>{ const img=g.createImageData(S,S), d=img.data; for(let i=0;i<S*S;i++){ const [r,gg,b]=fn(i); d[i*4]=r; d[i*4+1]=gg; d[i*4+2]=b; d[i*4+3]=255; } g.putImageData(img,0,0); }, false);
  const map=toCanvas(i=>{ const v=Math.round(clamp(Cc[i],0,1)*255); return [v,v,v]; }); map.colorSpace=THREE.SRGBColorSpace;
  const normal=toCanvas(i=>{ const x=i%S, y=(i/S)|0; const hL=H[y*S+((x-1+S)%S)], hR=H[y*S+((x+1)%S)], hU=H[((y-1+S)%S)*S+x], hD=H[((y+1)%S)*S+x];
    const nx=(hL-hR)*4, ny=(hD-hU)*4, nz=1, l=Math.hypot(nx,ny,nz); return [Math.round((nx/l*0.5+0.5)*255), Math.round((ny/l*0.5+0.5)*255), Math.round((nz/l*0.5+0.5)*255)]; });
  const orm=toCanvas(i=>[Math.round(clamp(Ao[i],0,1)*255), Math.round(clamp(Ro[i],0.05,1)*255), Math.round(clamp(0.12+Me[i]*0.85,0,1)*255)]);
  // small amber running lights in plate corners, and the odd row of lit ports
  const emis=canvasTex(S,S,(g,w,h)=>{ g.fillStyle='#000'; g.fillRect(0,0,w,h); g.fillStyle='rgba(255,168,70,1)';
    for(const [px,py,pw,ph] of plates){ if(R()<0.16){ const cx=R()<0.5? px+12 : px+pw-16, cy=R()<0.5? py+12 : py+ph-16; g.fillRect(cx,cy,4,4); if(R()<0.3) g.fillRect(cx,cy+8,4,4); } }
    for(let i=0;i<10;i++){ const pl=plates[Math.floor(R()*plates.length)], n=2+Math.floor(R()*4); for(let k=0;k<n;k++) g.fillRect(pl[0]+14+k*10,pl[1]+pl[3]/2,6,4); } });
  for(const t of [map,normal,orm,emis]){ t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=MAX_ANISO; }
  return {map, normal, orm, emis};
}
const texCache = {player:armorTextures(11), enemy:armorTextures(23)};
const smoothTex = panelTexture(31); smoothTex.map.wrapS=smoothTex.map.wrapT=THREE.RepeatWrapping;
const radTex = canvasTex(128,256,(g,w,h)=>{ g.fillStyle='#2a2320'; g.fillRect(0,0,w,h); for(let x=0;x<w;x+=8){ g.fillStyle='#6d5a4a'; g.fillRect(x+1,0,5,h); g.fillStyle='#1a1512'; g.fillRect(x+6,0,2,h); } for(let y=0;y<h;y+=64){ g.fillStyle='#15110f'; g.fillRect(0,y,w,4); } });
radTex.wrapS=radTex.wrapT=THREE.RepeatWrapping;
const radGlow = canvasTex(64,256,(g,w,h)=>{ const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,'#000'); gr.addColorStop(0.6,'#2a0c02'); gr.addColorStop(1,'#a8360a'); g.fillStyle=gr; g.fillRect(0,0,w,h); });
function decalTex(text, side){
  return canvasTex(256,108,(g,w,h)=>{ g.clearRect(0,0,w,h); g.textAlign='center'; g.textBaseline='middle';
    g.font='bold 84px "Arial Narrow","Roboto Condensed",Arial,sans-serif'; g.fillStyle= side==='player'?'rgba(240,240,236,.95)':'rgba(40,40,44,.9)'; g.fillText(text,w/2,h/2+4,w*0.94); });   // maxWidth squeezes longer numbers (537-2) to fit
}
function shipMaterials(side){
  const t=texCache[side], P=side==='player';
  // player livery: charcoal tile armor with rust-orange plates and white stripes; enemy: pale grey tile with oxide-red plates
  const NS=new THREE.Vector2(1.1,1.1);
  const hull = (color, rough=1, metal=1, emis=true) => new THREE.MeshStandardMaterial({map:t.map, normalMap:t.normal, normalScale:NS, roughnessMap:t.orm, metalnessMap:t.orm, aoMap:t.orm, aoMapIntensity:1, color, metalness:metal, roughness:rough, ...(emis?{emissiveMap:t.emis, emissive:0xffffff, emissiveIntensity:2.2}:{})});
  return {
    hull: hull(P?0x6c6c70:0xcfd3d6),
    hull2: hull(P?0x505056:0xa9aeb3, 0.95),
    plate: hull(P?0xf0702e:0xb03a2c, 0.95, 0.75, false),
    deckTop: hull(P?0x4a4a4e:0x8d9297, 1, 1, false),
    stripe: hull(P?0xf4f4ee:0xc93a2c, 0.8, 0.3, false),
    crane: new THREE.MeshStandardMaterial({color:0xc8961a, metalness:0.2, roughness:0.7}),
    drum: new THREE.MeshStandardMaterial({color: P?0x3c3c42:0x4c5156, metalness:0.85, roughness:0.38, side:THREE.DoubleSide}),
    bay: new THREE.MeshBasicMaterial({color:new THREE.Color(0xff8a34).multiplyScalar(1.15)}),
    patches: [],
    dark: new THREE.MeshStandardMaterial({color: P?0x2f353b:0x2d2723, metalness:0.8, roughness:0.42}),
    metal: new THREE.MeshStandardMaterial({color: P?0x9aa1a8:0x8f8479, metalness:1.0, roughness:0.26}),
    accent: new THREE.MeshStandardMaterial({color: P?0xE9A53B:COL.enemy, metalness:0.3, roughness:0.5, emissive: P?0xE9A53B:COL.enemy, emissiveIntensity:0.1}),
    glow: new THREE.MeshBasicMaterial({color: P?0x9fdcff:0xffb07a}),
    bellIn: new THREE.MeshBasicMaterial({color: P?0x1c3a5c:0x4a2410, side:THREE.DoubleSide}),
    bell: new THREE.MeshStandardMaterial({color: P?0x7d848a:0x7a6f67, metalness:1.0, roughness:0.22, side:THREE.DoubleSide}),
    window: new THREE.MeshBasicMaterial({color:new THREE.Color(0xffe2b0).multiplyScalar(2.2)}),
    rad: new THREE.MeshStandardMaterial({map:radTex, color:0xffffff, metalness:0.3, roughness:0.7, emissiveMap:radGlow, emissive:0xffffff, emissiveIntensity:1.6, side:THREE.DoubleSide}),
  };
}
const PLUME_VS=`uniform float uLen; varying float vT; varying vec3 vN; varying vec3 vW; varying vec3 vP;
void main(){ vT=clamp(-position.z/uLen,0.0,1.0); vP=position; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const PLUME_FS=`uniform vec3 uColor; uniform vec3 uHot; uniform float uPow; uniform float uTime; uniform float uDiamonds; uniform float uEdge; uniform float uNoise; uniform float uI; uniform float uSeed;
varying float vT; varying vec3 vN; varying vec3 vW; varying vec3 vP;
float h3(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
// NaN safety: pow() with a negative base is undefined, and on Apple GPUs it returns NaN. One NaN pixel is smeared
// by the bloom blur into a black block, which flashed the board around ships every second or so. So every pow()
// base here is clamped non-negative, squares are multiplications, and the output is capped before it reaches bloom.
void main(){
  vec3 V=normalize(cameraPosition-vW); float soft=pow(clamp(abs(dot(normalize(vN+vec3(1e-6)),V)),0.0,1.0),uEdge);
  float t=clamp(vT,0.0,1.0); float u=max(1.0-t,0.0); float fall=pow(u,1.35)*smoothstep(0.0,0.05,t);
  float n=n3(vec3(vP.x*9.0+uSeed, vP.y*9.0, vP.z*2.5+uTime*16.0))*0.6 + n3(vec3(vP.x*23.0, vP.y*23.0+uSeed, vP.z*6.0+uTime*29.0))*0.4;
  float d=0.0; if(uDiamonds>0.0){ float s=fract(t*uDiamonds), q=(s-0.5)*5.0; d=exp(-q*q)*pow(u,1.5)*smoothstep(0.0,0.12,t)*smoothstep(0.2,0.9,uPow); }
  float flick=0.9+0.1*sin(uTime*53.0+uSeed*7.0);
  float a=(fall*mix(1.0,0.25+1.5*n*n*1.6,uNoise)*0.8+d*2.6)*soft*flick*uPow*uI;
  vec3 c=mix(uColor,uHot,clamp(u*u*u*0.8+d,0.0,1.0));
  gl_FragColor=vec4(clamp(c*max(a,0.0),0.0,16.0),1.0); }`;
const plumeMat = side => new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide,
  uniforms:{uColor:{value:new THREE.Color(side==='player'?0x8fcfff:0xff9a66)}, uPow:{value:0.4}, uTime:{value:0}},
  vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader:`varying vec2 vUv; uniform vec3 uColor; uniform float uPow; uniform float uTime;
    void main(){ float y=clamp(vUv.y,0.0,1.0); float a=pow(y,1.6); float flick=0.85+0.15*sin(uTime*40.0+y*20.0); vec3 c=mix(uColor,vec3(1.0),pow(y,5.0)); gl_FragColor=vec4(clamp(c*a*uPow*flick,0.0,16.0),1.0); }`});

// chamfered deck section: octagonal frustum along z, back (w0,h0) -> front (w1,h1), UVs in world units so panels tile evenly
function deckGeometry(len, w0,h0, w1,h1, ch, uvs=1.05){
  const ring=(w,h,z)=>{ const c=Math.min(w,h)*ch, x=w/2, y=h/2;
    return [[x-c,y],[x,y-c],[x,-y+c],[x-c,-y],[-x+c,-y],[-x,-y+c],[-x,y-c],[-x+c,y]].map(([a,b])=>new THREE.Vector3(a,b,z)); };
  const A=ring(w0,h0,-len/2), B=ring(w1,h1,len/2);
  const pos=[], uv=[]; let per=0;
  for(let i=0;i<8;i++){ const j=(i+1)%8; const a0=A[i],a1=A[j],b0=B[i],b1=B[j]; const edge=a0.distanceTo(a1);
    const u0=per*uvs, u1=(per+edge)*uvs; per+=edge; const v0=-len/2*uvs, v1=len/2*uvs;
    pos.push(...a0.toArray(),...b1.toArray(),...a1.toArray(), ...a0.toArray(),...b0.toArray(),...b1.toArray());
    uv.push(u0,v0,u1,v1,u1,v0, u0,v0,u0,v1,u1,v1); }
  const cap=(R,front)=>{ const cz=R[0].z; for(let i=0;i<8;i++){ const j=(i+1)%8; const p=front?[R[j],R[i]]:[R[i],R[j]];
      pos.push(0,0,cz,...p[0].toArray(),...p[1].toArray()); uv.push(0.5,0.5,p[0].x*uvs+0.5,p[0].y*uvs+0.5,p[1].x*uvs+0.5,p[1].y*uvs+0.5); } };
  cap(A,false); cap(B,true);
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.computeVertexNormals(); return g;
}

// A ship is built from ~200 small meshes. Drawn one by one that was ~200 draw calls per ship, per pass (the
// shadow pass too): most of a frame's cost with the whole board in view, on a Mac especially. The static parts are
// merged here into one mesh per material and shadow setting, for drawing only. The originals stay in the body,
// hidden (userData.mergedAway), because breakUpShip cuts the hull apart from them. Animated or transparent parts
// (engines, nav lights, shield, decals, the instanced detail layer) are left as they are.
function mergeShipParts(sh){
  mergeStatic(sh.body, new Set([...sh.engines.map(e=>e.group), ...sh.lights, sh.pickMesh, sh.shieldMesh, sh.fineMesh].filter(Boolean)), true);
}
// Merge the opaque, non-instanced meshes under `body` into one mesh per material and shadow setting. With
// keepOriginals they stay in place, hidden and flagged mergedAway; otherwise they are removed.
function mergeStatic(body, skip, keepOriginals){
  let root=body; while(root.parent) root=root.parent; root.updateMatrixWorld(true);
  const inv=new THREE.Matrix4().copy(body.matrixWorld).invert(), rel=new THREE.Matrix4();
  const buckets=new Map();
  const walk=o=>{ if(skip.has(o) || !o.visible) return;
    const m=o.material;
    if(o.isMesh && !o.isInstancedMesh && m && !Array.isArray(m) && !m.transparent && !m.isShaderMaterial){
      const k=m.uuid+(o.castShadow?'c':'')+(o.receiveShadow?'r':'');
      if(!buckets.has(k)) buckets.set(k,{mat:m, cast:o.castShadow, recv:o.receiveShadow, parts:[]}); buckets.get(k).parts.push(o); }
    o.children.forEach(walk); };
  body.children.forEach(walk);
  const needsUv=m=>!!(m.map||m.normalMap||m.aoMap||m.roughnessMap||m.metalnessMap||m.emissiveMap||m.bumpMap);
  for(const b of buckets.values()){
    if(b.parts.length<2) continue;
    const geos=b.parts.map(o=>{ const g=o.geometry.index? o.geometry.toNonIndexed() : o.geometry.clone();
      rel.multiplyMatrices(inv, o.matrixWorld); g.applyMatrix4(rel);
      if(b.mat.userData.turretRig) g.setAttribute('aTurret', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(o.userData.turret||0),1));
      if(rel.determinant()<0){ for(const a of Object.values(g.attributes)){ const n=a.itemSize, arr=a.array;   // mirrored part: restore winding
        for(let t=0;t+2<a.count;t+=3) for(let c=0;c<n;c++){ const i=(t+1)*n+c, j=(t+2)*n+c, v=arr[i]; arr[i]=arr[j]; arr[j]=v; } } }
      return g; });
    const names=Object.keys(geos[0].attributes).filter(n=>geos.every(g=>g.attributes[n]));
    const ok= names.includes('position') && names.includes('normal') && (!needsUv(b.mat)||names.includes('uv')) && (!b.mat.vertexColors||names.includes('color'));
    let merged=null;
    if(ok){ geos.forEach(g=>{ for(const n of Object.keys(g.attributes)) if(!names.includes(n)) g.deleteAttribute(n); g.morphAttributes={}; g.clearGroups(); });
      merged=THREE.mergeGeometries(geos,false); }
    geos.forEach(g=>g.dispose());
    if(!merged) continue;
    const mesh=new THREE.Mesh(merged,b.mat); mesh.castShadow=b.cast; mesh.receiveShadow=b.recv; mesh.userData.mergedProxy=true; mesh.userData.noAO=false; body.add(mesh);
    b.parts.forEach(o=>{ if(keepOriginals){ o.visible=false; o.userData.mergedAway=true; } else o.parent.remove(o); });
  }
}
// Turret tracking (v43). Turrets stay merged into the hull (pulling them out would cost a draw call or more each,
// and a Dreadnought carries 17), so they turn in the vertex shader instead: every vertex of a turret carries its
// turret number (aTurret, added by mergeStatic), and the ship's materials rotate those vertices about the turret's
// own axis by that ship's per-turret angle. The shadow pass doesn't see the rotation, which at this size nobody can.
const MAX_TURRETS=24;
const TURRET_VS=`attribute float aTurret; uniform float uTYaw[${MAX_TURRETS}]; uniform vec3 uTPivot[${MAX_TURRETS}]; uniform vec3 uTAxis[${MAX_TURRETS}];
vec3 tRot(vec3 v, vec3 k, float a){ float c=cos(a), s=sin(a); return v*c+cross(k,v)*s+k*dot(k,v)*(1.0-c); }`;
function rigMaterial(m, rig){
  m.userData.turretRig=true;
  m.onBeforeCompile=sh=>{ sh.uniforms.uTYaw=rig.yaw; sh.uniforms.uTPivot=rig.pivot; sh.uniforms.uTAxis=rig.axis;
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\n'+TURRET_VS)
      .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nint tId=int(aTurret+0.5)-1; if(tId>=0) objectNormal=tRot(objectNormal,uTAxis[tId],uTYaw[tId]);')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nif(tId>=0) transformed=uTPivot[tId]+tRot(transformed-uTPivot[tId],uTAxis[tId],uTYaw[tId]);'); };
}
function buildShip(cls, side, copy=0){
  const M=shipMaterials(side), g=new THREE.Group(), body=new THREE.Group(); g.add(body);
  const P=side==='player', R=mulberry32((P?1000:2000)+MODEL_SEED[cls]*77);
  const engines=[], lights=[], greebles={dark:[], hull:[], metal:[]}, decks=[];
  // weapon mounts, in body space: w[slot] lists the muzzles for that loadout slot (CLASSES[cls].weapons order), each
  // with the direction a shot leaves in; pdc lists every point-defense turret with its outward axis.
  const mounts={ w:CLASSES[cls].weapons.map(()=>[]), pdc:[] };
  const mount=(slot,x,y,z,dx=0,dy=0,dz=1)=>{ const m={p:new THREE.Vector3(x,y,z), d:new THREE.Vector3(dx,dy,dz).normalize()}; mounts.w[slot].push(m); return m; };
  // turrets that can traverse: rest pivot, traverse axis and barrel direction in body space, numbered from 1
  const turrets=[], rig={ yaw:{value:new Float32Array(MAX_TURRETS)}, pivot:{value:[...Array(MAX_TURRETS)].map(()=>new THREE.Vector3())}, axis:{value:[...Array(MAX_TURRETS)].map(()=>new THREE.Vector3(0,1,0))} };
  [M.dark, M.metal, M.hull2].forEach(m=>rigMaterial(m, rig));
  function rigTurret(grp){ if(turrets.length>=MAX_TURRETS) return 0; grp.updateMatrix(); const id=turrets.length+1;
    const T={pivot:grp.position.clone(), axis:new THREE.Vector3(0,1,0).applyQuaternion(grp.quaternion).normalize(), fwd:new THREE.Vector3(0,0,1).applyQuaternion(grp.quaternion).normalize()};
    turrets.push(T); rig.pivot.value[id-1].copy(T.pivot); rig.axis.value[id-1].copy(T.axis);
    grp.traverse(o=>{ if(o.isMesh) o.userData.turret=id; }); return id; }
  const nav=P?0xffcf80:0xff6a50;
  const CH = 0.2;
  const add=(m,x=0,y=0,z=0,chunk=false)=>{ m.position.set(x,y,z); m.userData.chunk=chunk; body.add(m); return m; };
  const pickHull=()=> M.hull;
  const pick2=a=>a[Math.floor(R()*a.length)];
  // --- kit ---
  // layered drive plume: white-hot core with shock diamonds, turbulent sheath, soft outer glow and a nozzle flare
  function makePlume(r,x,y,z){
    const grp=new THREE.Group(); grp.position.set(x,y,z); body.add(grp);
    const hot=new THREE.Color(P?0xf2f8ff:0xfff2dc), col=new THREE.Color(P?0x5aaeff:0xff7a36);
    const layer=(rNear,rFar,len,o)=>{ const g=new THREE.CylinderGeometry(rFar,rNear,len,28,32,true); g.translate(0,len/2,0); g.rotateX(-Math.PI/2);
      const m=new THREE.ShaderMaterial({transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide,
        uniforms:{uColor:{value:o.col||col}, uHot:{value:hot}, uPow:{value:0.3}, uTime:{value:0}, uLen:{value:len}, uDiamonds:{value:o.d||0}, uEdge:{value:o.edge}, uNoise:{value:o.noise}, uI:{value:o.i}, uSeed:{value:Math.random()*10}},
        vertexShader:PLUME_VS, fragmentShader:PLUME_FS});
      grp.add(new THREE.Mesh(g,m)); return m; };
    const mats=[
      layer(r*0.26, r*0.13, r*11, {d:7, edge:1.3, noise:0.35, i:0.7, col:hot.clone().lerp(col,0.45)}),   // core + shock diamonds
      layer(r*0.55, r*0.95, r*7.5, {edge:1.5, noise:1.0, i:0.55}),                                        // turbulent sheath
      layer(r*0.9, r*1.8, r*4.5, {edge:2.2, noise:1.0, i:0.22}),                                       // outer bloom
    ];
    const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex, color:hot.clone().lerp(col,0.35), transparent:true, blending:THREE.AdditiveBlending, depthWrite:false}));
    spr.position.z=-r*0.15; grp.add(spr);
    const mach=new THREE.Mesh(new THREE.CircleGeometry(r*0.3,24),new THREE.MeshBasicMaterial({color:hot, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide}));
    mach.position.z=-r*0.9; grp.add(mach);
    return {group:grp, mats, sprite:spr, mach, r, col, base:new THREE.Vector3(x,y,z)};
  }
  function deck(z0,z1,w0,h0,w1,h1,o={}){
    const mat=o.mat||pickHull(); const ch=o.ch!==undefined?o.ch:CH;
    const m=add(new THREE.Mesh(deckGeometry(z1-z0,w0,h0,w1,h1,ch),mat), o.x||0, o.y||0, (z0+z1)/2, true);
    const d={z0,z1,w0,h0,w1,h1,x:o.x||0,y:o.y||0,ch}; if(o.greeble!==false) decks.push(d); return m;
  }
  function collar(z0,z1,w,h,o={}){ // recessed seam between decks, ribbed
    deck(z0,z1,w,h,w,h,{mat:M.dark,greeble:false,...o});
    const n=Math.max(2,Math.round((z1-z0)/0.025)); for(let i=0;i<n;i++){ const z=lerp(z0,z1,(i+0.5)/n); greebles.metal.push([o.x||0,o.y||0,z, w*1.04, h*1.04, 0.008]); }
  }
  function truss(z0,z1,w,h,o={}){ // exposed open framework (frontier style)
    const x0=o.x||0, y0=o.y||0, hw=w/2, hh=h/2; const corners=[[hw,hh],[-hw,hh],[-hw,-hh],[hw,-hh]];
    corners.forEach(([a,b])=>rod(new THREE.Vector3(x0+a,y0+b,z0),new THREE.Vector3(x0+a,y0+b,z1),0.014,M.metal));
    const segs=Math.max(1,Math.round((z1-z0)/0.18));
    for(let s=0;s<segs;s++){ const za=lerp(z0,z1,s/segs), zb=lerp(z0,z1,(s+1)/segs);
      for(let k=0;k<4;k++){ const [a,b]=corners[k], [c,d]=corners[(k+1)%4]; rod(new THREE.Vector3(x0+a,y0+b,za),new THREE.Vector3(x0+c,y0+d,zb),0.008,M.metal); rod(new THREE.Vector3(x0+a,y0+b,za),new THREE.Vector3(x0+c,y0+d,za),0.008,M.metal); } }
    // spine pipes through the truss
    rod(new THREE.Vector3(x0+hw*0.3,y0,z0),new THREE.Vector3(x0+hw*0.3,y0,z1),0.03,M.dark); rod(new THREE.Vector3(x0-hw*0.35,y0+hh*0.2,z0),new THREE.Vector3(x0-hw*0.35,y0+hh*0.2,z1),0.022,M.hull2);
  }
  const UP=new THREE.Vector3(0,1,0);
  function rod(a,b,r,mat,seg=6){ const len=a.distanceTo(b); const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,seg,1),mat);
    m.position.copy(a).lerp(b,0.5); m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize()); body.add(m); return m; }
  function tube(r,z0,z1,x,y,mat=M.dark,seg=16){ const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,z1-z0,seg),mat); m.rotation.x=Math.PI/2; return add(m,x,y,(z0+z1)/2); }
  function engine(r,x,y,z){
    const prof=[]; for(let i=0;i<=18;i++){ const t=i/18; prof.push(new THREE.Vector2(r*(0.36+0.64*Math.pow(t,0.75)), -t*r*1.5)); }
    const bg=new THREE.LatheGeometry(prof,48); bg.rotateX(Math.PI/2);
    add(new THREE.Mesh(bg,M.bell),x,y,z);
    const inner=new THREE.Mesh(bg.clone().scale(0.96,0.96,1),M.bellIn); add(inner,x,y,z);
    // throat housing, gimbal ring and actuators
    tube(r*0.52, z-0.02, z+r*0.35, x, y, M.dark, 24);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(r*0.5,r*0.07,8,32),M.metal); add(ring,x,y,z-r*0.12);
    for(let k=0;k<4;k++){ const a=k*Math.PI/2+Math.PI/4; rod(new THREE.Vector3(x+Math.cos(a)*r*0.55,y+Math.sin(a)*r*0.55,z+r*0.2), new THREE.Vector3(x+Math.cos(a)*r*0.72,y+Math.sin(a)*r*0.72,z-r*0.55), r*0.045, M.dark); }
    const rim=new THREE.Mesh(new THREE.TorusGeometry(r,r*0.035,6,48),M.dark); add(rim,x,y,z-r*1.5);
    const disk=new THREE.Mesh(new THREE.CircleGeometry(r*0.36,24),M.glow); disk.rotation.y=Math.PI; add(disk,x,y,z-0.005);
    engines.push(makePlume(r,x,y,z-r*1.5));
  }
  function pdc(x,y,z,dir=1,axis='y'){ // dir: which way the turret faces out (up/down or left/right)
    const grp=new THREE.Group();
    const base=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.06,0.03,16),M.dark); grp.add(base);
    const dome=new THREE.Mesh(new THREE.SphereGeometry(0.048,20,12,0,Math.PI*2,0,Math.PI/2),M.metal); dome.position.y=0.015; grp.add(dome);
    [-0.014,0.014].forEach(o=>{ const b=new THREE.Mesh(new THREE.CylinderGeometry(0.007,0.007,0.13,8),M.dark); b.rotation.x=Math.PI/2-0.35; b.position.set(o,0.05,0.055); grp.add(b);
      const mz=new THREE.Mesh(new THREE.CylinderGeometry(0.01,0.01,0.02,8),M.dark); mz.rotation.x=Math.PI/2-0.35; mz.position.set(o,0.072,0.115); grp.add(mz); });
    const sensor=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.018,0.03),M.dark); sensor.position.set(0.035,0.04,0.0); grp.add(sensor);
    if(axis==='y'){ if(dir<0) grp.rotation.z=Math.PI; } else grp.rotation.z = -dir*Math.PI/2;
    grp.rotation.y = R()*0.8-0.4; add(grp,x,y,z);
    const out= axis==='y'? new THREE.Vector3(0,dir,0) : new THREE.Vector3(dir,0,0);
    mounts.pdc.push({p:new THREE.Vector3(x,y,z).addScaledVector(out,0.07), out, grp, t:rigTurret(grp)});
  }
  function radiator(x,y,z,w,d,tilt=0){ // flat fin radiating off the hull, ribbed and heat-glowing at the root
    const p=new THREE.Mesh(new THREE.PlaneGeometry(w,d,1,1),M.rad); p.rotation.set(-Math.PI/2,0,0); p.rotation.y=tilt;
    const grp=new THREE.Group(); grp.add(p); p.rotation.z = x>0? 0 : Math.PI;
    const spar=new THREE.Mesh(new THREE.BoxGeometry(w,0.02,0.03),M.dark); spar.position.z=d/2; grp.add(spar);
    const spar2=spar.clone(); spar2.position.z=-d/2; grp.add(spar2);
    const root=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,d,8),M.metal); root.rotation.x=Math.PI/2; root.position.x= x>0?-w/2:w/2; grp.add(root);
    grp.rotation.z = x>0? -tilt : tilt; add(grp,x,y,z);
  }
  function dish(x,y,z,r){ const prof=[]; for(let i=0;i<=10;i++){ const t=i/10; prof.push(new THREE.Vector2(r*t, r*0.35*t*t)); }
    const d=new THREE.Mesh(new THREE.LatheGeometry(prof,32),new THREE.MeshStandardMaterial({color:0x9da2a6,metalness:0.4,roughness:0.6,side:THREE.DoubleSide}));
    const grp=new THREE.Group(); grp.add(d); const mast=new THREE.Mesh(new THREE.CylinderGeometry(0.01,0.014,r*1.1,8),M.dark); mast.position.y=-r*0.5; grp.add(mast);
    const feed=new THREE.Mesh(new THREE.CylinderGeometry(0.004,0.004,r*0.6,6),M.dark); feed.position.y=r*0.3; grp.add(feed);
    grp.rotation.set(-0.6,R()*6,0.3); add(grp,x,y+r*0.5,z); }
  function windows(x,y,z,len,n,axis='z'){ for(let i=0;i<n;i++){ const t=(i+0.5)/n; const w=new THREE.Mesh(new THREE.BoxGeometry(axis==='z'?0.012:0.025,0.012,axis==='z'?len/n*0.55:0.012),M.window);
      add(w, x, y, z + (t-0.5)*len); } }
  function stripe(z0,z1,w,y,x=0){ [-1,1].forEach(k=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(0.025,0.006,z1-z0),M.accent); add(m,x+k*w*0.32,y,(z0+z1)/2); }); }
  function decal(text,x,y,z,s,flip){ const m=new THREE.Mesh(new THREE.PlaneGeometry(s*4,s),new THREE.MeshBasicMaterial({map:decalTex(text,side),transparent:true,depthWrite:false}));
    m.rotation.y = flip? -Math.PI/2 : Math.PI/2; add(m,x,y,z); }
  function tank(x,y,z,r,len,mat=M.hull2){ const m=new THREE.Mesh(new THREE.CapsuleGeometry(r,len,8,20),mat); m.rotation.x=Math.PI/2; add(m,x,y,z,true);
    for(let i=-1;i<=1;i+=2){ const s=new THREE.Mesh(new THREE.TorusGeometry(r*1.04,0.008,6,24),M.dark); add(s,x,y,z+i*len*0.3); } }
  function rail(y,z0,z1,s){ const h=deck(z0,z1,s,s,s*0.9,s*0.9,{y,mat:M.dark,ch:0.3,greeble:false});
    const n=Math.round((z1-z0)/0.09); for(let i=0;i<n;i++){ const c=new THREE.Mesh(new THREE.TorusGeometry(s*0.62,s*0.1,6,16),M.metal); add(c,0,y,lerp(z0+0.05,z1-0.05,i/(n-1))); }
    const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(s*0.55,s*0.7,s*0.9,16),M.metal); muzzle.rotation.x=Math.PI/2; add(muzzle,0,y,z1+s*0.3);
    const bore=new THREE.Mesh(new THREE.CircleGeometry(s*0.3,16),new THREE.MeshBasicMaterial({color:0x7fd0ff})); add(bore,0,y,z1+s*0.76); return h; }
  function light(x,y,z,c){ const s=new THREE.Mesh(new THREE.SphereGeometry(0.028,10,8),new THREE.MeshBasicMaterial({color:c})); add(s,x,y,z); lights.push(s); }
  function rcs(x,y,z){ const b=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.05),M.dark); add(b,x,y,z);
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([a,c])=>{ const n=new THREE.Mesh(new THREE.ConeGeometry(0.012,0.025,8,1,true),M.metal); n.rotation.z = a? -a*Math.PI/2 : (c>0?0:Math.PI); add(n,x+a*0.035,y+c*0.035,z); }); }

  // --- per-class hulls, modeled from the reference miniatures ---
  // shared Expanse vocabulary: drum-housed drive at the stern, V-strut truss to an octagonal engineering section,
  // brick-tiled armor decks forward, livery plates, stripes, hull numbers, PDC turrets everywhere
  const L=CLASSES[cls].len, idn=(P?{patrol:'214',corvette:'365',frigate:'436',destroyer:'537',cruiser:'618',carrier:'702',fastattack:'109',dreadnought:'901',tender:'740',ewar:'322'}:{patrol:'81',corvette:'865',frigate:'843',destroyer:'857',cruiser:'861',carrier:'870',fastattack:'88',dreadnought:'899',tender:'874',ewar:'833'})[cls]+(copy?'-'+(copy+1):'');   // extra copies read 537-2, 537-3
  const HULL=M.hull, H2=M.hull2, PL=M.plate, ST=M.stripe;
  function drum(r,len,zf,x=0,y=0){ // drive housing: open drum, ribbed, crenellated rim, bell and plume inside
    const zb=zf-len;
    const shell=new THREE.Mesh(new THREE.CylinderGeometry(r,r*0.97,len,40,1,true),M.drum); shell.rotation.x=Math.PI/2; add(shell,x,y,(zf+zb)/2,true);
    const inner=new THREE.Mesh(new THREE.CylinderGeometry(r*0.9,r*0.9,len*0.98,40,1,true),M.dark); inner.rotation.x=Math.PI/2; add(inner,x,y,(zf+zb)/2);
    for(let i=0;i<18;i++){ const a=i/18*Math.PI*2; greebles.metal.push([x+Math.cos(a)*r*1.01,y+Math.sin(a)*r*1.01,(zf+zb)/2, 0.018,0.018,len*0.9]); }
    for(let i=0;i<12;i++){ const a=(i+0.5)/12*Math.PI*2; const m=new THREE.Mesh(new THREE.BoxGeometry(r*0.36,r*0.14,len*0.22),M.drum);
      m.position.set(x+Math.cos(a)*r*0.96,y+Math.sin(a)*r*0.96,zb-len*0.05); m.rotation.z=a+Math.PI/2; body.add(m); }
    [zf-0.01, zb+len*0.3, zb+0.01].forEach(z=>{ const t=new THREE.Mesh(new THREE.TorusGeometry(r*1.005,r*0.035,8,40),M.metal); add(t,x,y,z); });
    const cap=new THREE.Mesh(new THREE.CircleGeometry(r*0.92,32),M.dark); cap.rotation.y=Math.PI; add(cap,x,y,zf-0.005);
    // drive bell set deep in the drum
    const prof=[]; for(let i=0;i<=16;i++){ const t=i/16; prof.push(new THREE.Vector2(r*(0.25+0.6*Math.pow(t,0.8)), -t*len*0.9)); }
    const bg=new THREE.LatheGeometry(prof,40); bg.rotateX(Math.PI/2); add(new THREE.Mesh(bg,M.bellIn),x,y,zf-len*0.05);
    const disk=new THREE.Mesh(new THREE.CircleGeometry(r*0.26,24),M.glow); disk.rotation.y=Math.PI; add(disk,x,y,zf-len*0.06);
    engines.push(makePlume(r,x,y,zb+len*0.06));
  }
  function struts(z0,z1,r0,r1,x=0,y=0,n=6){ // V truss between drive drum and engineering section, around a central drive shaft
    for(let i=0;i<n;i++){ const a=i/n*Math.PI*2, b=a+Math.PI/n;
      const p0=new THREE.Vector3(x+Math.cos(a)*r0,y+Math.sin(a)*r0,z0), p1=new THREE.Vector3(x+Math.cos(b)*r1,y+Math.sin(b)*r1,z1), p2=new THREE.Vector3(x+Math.cos(a+2*Math.PI/n)*r0,y+Math.sin(a+2*Math.PI/n)*r0,z0);
      rod(p0,p1,0.014,M.metal); rod(p2,p1,0.014,M.metal); }
    tube(Math.min(r0,r1)*0.45,z0,z1,x,y,M.dark,20);
    [0.3,0.7].forEach(t=>{ const g=new THREE.Mesh(new THREE.TorusGeometry(Math.min(r0,r1)*0.5,0.012,6,24),M.metal); add(g,x,y,lerp(z0,z1,t)); });
  }
  function plate(z0,z1,w0,h0,w1,h1,o={}){ return deck(z0,z1,w0,h0,w1,h1,{mat:o.mat||HULL,...o}); }
  function sidePlates(z0,z1,w,h,y=0,mat=PL,t=0.018){ // livery panels hugging both flanks
    [-1,1].forEach(s=>{ deck(z0,z1,t,h,t,h*0.92,{x:s*(w/2+t/2),y,mat,ch:0.1,greeble:false}); }); }
  function topPlate(z0,z1,w0,w1,y,mat=PL,t=0.016){ deck(z0,z1,w0,t,w1,t,{y:y+t/2,mat,ch:0.05,greeble:false}); }
  function stripes(z0,z1,y,sep,w=0.02){ [-1,1].forEach(s=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,0.008,z1-z0),ST); add(m,s*sep,y,(z0+z1)/2); }); }
  function chevron(z,y,w){ [-1,1].forEach(s=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w*0.62,0.008,0.05),ST); m.rotation.y=s*0.55; add(m,s*w*0.24,y,z); }); }
  function barrels(xs,y,z0,z1,r=0.014){ xs.forEach(x=>{ tube(r,z0,z1,x,y,M.metal,10); tube(r*1.8,z0,z0+0.08,x,y,M.dark,10); tube(r*1.35,z1-0.03,z1,x,y,M.dark,10); }); }
  function grille(z,y,w,h){ // recessed bow face with framed viewports
    const back=new THREE.Mesh(new THREE.PlaneGeometry(w,h),M.dark); add(back,0,y,z+0.004);
    const rows=2, cols=Math.max(3,Math.round(w/0.09));
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){ const win=new THREE.Mesh(new THREE.PlaneGeometry(w/cols*0.62,h/rows*0.36), r===0?M.window:M.dark); add(win,-w/2+(c+0.5)*w/cols,y+h*0.22-r*h*0.46,z+0.007); }
    [[0,h/2],[0,-h/2]].forEach(([_,dy])=>{ const f=new THREE.Mesh(new THREE.BoxGeometry(w*1.02,0.02,0.02),PL); add(f,0,y+dy,z+0.01); });
  }
  function number(text,x,y,z,s,face){ // hull number decal: face 'top' | 'l' | 'r'
    const m=new THREE.Mesh(new THREE.PlaneGeometry(s*2.4,s),new THREE.MeshBasicMaterial({map:decalTex(text,side),transparent:true,depthWrite:false}));
    if(face==='top'){ m.rotation.x=-Math.PI/2; m.rotation.z=-Math.PI/2; } else m.rotation.y = face==='r'? Math.PI/2 : -Math.PI/2; add(m,x,y,z); }
  function turretBlock(z,y,w){ plate(z-w*0.6,z+w*0.6,w,0.07,w*0.9,0.07,{y:y+0.035,mat:PL,ch:0.25,greeble:false}); pdc(0,y+0.07,z,1); }
  // --- weapon fittings (v42): every weapon in a loadout fires from one of these ---
  const lensMat=new THREE.MeshBasicMaterial({color:P?0xffb44a:0xff5a3a});
  function emitter(slot,x,y,z,len,r){ // beam emitter: shrouded barrel with cooling rings and a lens facing forward
    tube(r*1.45,z-len,z-len*0.55,x,y,M.dark,16); tube(r,z-len,z,x,y,M.metal,16);
    for(let k=0;k<3;k++){ const t=new THREE.Mesh(new THREE.TorusGeometry(r*1.2,r*0.18,6,16),M.dark); add(t,x,y,z-len*(0.15+0.12*k)); }
    const lens=new THREE.Mesh(new THREE.CircleGeometry(r*0.72,16),lensMat); add(lens,x,y,z+0.003); mount(slot,x,y,z+0.01); }
  function pulseTurret(slot,x,y,z,flip=1,s=1){ // squat armored turret, twin stubby barrels forward; flip -1 hangs under the hull
    const grp=new THREE.Group();
    const base=new THREE.Mesh(new THREE.CylinderGeometry(0.055*s,0.065*s,0.025*s,16),M.dark); grp.add(base);
    const house=new THREE.Mesh(new THREE.BoxGeometry(0.1*s,0.045*s,0.09*s),H2); house.position.set(0,0.032*s,0.005*s); grp.add(house);
    const mant=new THREE.Mesh(new THREE.BoxGeometry(0.08*s,0.03*s,0.02*s),M.dark); mant.position.set(0,0.032*s,0.055*s); grp.add(mant);
    [-1,1].forEach(k=>{ const b=new THREE.Mesh(new THREE.CylinderGeometry(0.009*s,0.009*s,0.11*s,8),M.metal); b.rotation.x=Math.PI/2; b.position.set(k*0.022*s,0.032*s,0.115*s); grp.add(b);
      const sl=new THREE.Mesh(new THREE.CylinderGeometry(0.013*s,0.013*s,0.025*s,8),M.dark); sl.rotation.x=Math.PI/2; sl.position.set(k*0.022*s,0.032*s,0.165*s); grp.add(sl); });
    if(flip<0) grp.rotation.z=Math.PI; add(grp,x,y,z); const t=rigTurret(grp);
    [-1,1].forEach(k=>{ mount(slot, x+k*0.022*s*flip, y+0.032*s*flip, z+0.18*s).t=t; }); }
  function cells(slot,x,y,z,nx,nz,step=0.045){ // vertical launch cells flush with the deck: framed hatches, missiles leave upward
    for(let i=0;i<nx;i++) for(let j=0;j<nz;j++){ const cx=x+(i-(nx-1)/2)*step, cz=z+(j-(nz-1)/2)*step;
      const fr=new THREE.Mesh(new THREE.BoxGeometry(step*0.9,0.008,step*0.9),M.metal); add(fr,cx,y+0.004,cz);
      const h=new THREE.Mesh(new THREE.BoxGeometry(step*0.66,0.01,step*0.66),M.dark); add(h,cx,y+0.006,cz); mount(slot,cx,y+0.012,cz,0,1,0.25); } }
  function tubeMouth(slot,x,y,z,r,dx=0,dz=1){ // launch tube opening on a forward or side face
    const ring=new THREE.Mesh(new THREE.TorusGeometry(r,r*0.22,8,16),M.metal), hole=new THREE.Mesh(new THREE.CircleGeometry(r*0.9,16),M.dark);
    const yaw=Math.atan2(dx,dz); ring.rotation.y=yaw; hole.rotation.y=yaw; add(ring,x,y,z); add(hole,x-dx*0.002,y,z-dz*0.002); mount(slot,x+dx*0.01,y,z+dz*0.01,dx,0,dz); }

  // --- v54 kit, for the hulls rebuilt from Jon's reference sheets ---
  // cylinder along z with UVs in world units, so armour plates stay square on round surfaces; o.r1 is the front radius
  function cyl(r,z0,z1,mat,o={}){ if(o===true) o={open:true}; const len=z1-z0, gq=new THREE.CylinderGeometry(o.r1||r,r,len,o.seg||48,1,!!o.open);
    const uv=gq.attributes.uv; for(let i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i)*Math.PI*2*r*1.05, uv.getY(i)*len*1.05);
    const m=new THREE.Mesh(gq,mat); m.rotation.x=Math.PI/2; return add(m,o.x||0,o.y||0,(z0+z1)/2,true); }
  // drive: a solid armoured cylinder with livery bands (fractions of its length from the stern), armour ribs, a
  // glowing aft ring round the bell, and the plume
  function drive(r,len,zf,x=0,y=0,o={}){
    const zb=zf-len, at=t=>zb+len*t;
    cyl(r,zb+0.02,zf,HULL,{x,y});
    (o.bands||[[0.3,0.55,PL],[0.58,0.64,ST]]).forEach(([a,b,m])=>cyl(r*1.012,at(a),at(b),m,{x,y,open:true}));
    [0.04,0.66,0.97].forEach(t=>{ const tr=new THREE.Mesh(new THREE.TorusGeometry(r*1.02,Math.max(.008,r*0.04),8,48),M.dark); add(tr,x,y,at(t)); });
    const nr=Math.max(8,Math.round(r*44)); for(let i=0;i<nr;i++){ const a=i/nr*Math.PI*2; greebles.dark.push([x+Math.cos(a)*r*1.02,y+Math.sin(a)*r*1.02,at(0.17), r*0.1,r*0.1,len*0.2]); }
    const face=new THREE.Mesh(new THREE.CircleGeometry(r,48),M.dark); face.rotation.y=Math.PI; add(face,x,y,zb+0.021);
    const rim=new THREE.Mesh(new THREE.RingGeometry(r*0.6,r*0.82,48),M.glow); rim.rotation.y=Math.PI; add(rim,x,y,zb+0.018);
    const bell=new THREE.Mesh(new THREE.CylinderGeometry(r*0.48,r*0.58,.06,32),M.bell); bell.rotation.x=Math.PI/2; add(bell,x,y,zb-0.01);
    const front=new THREE.Mesh(new THREE.CircleGeometry(r*0.98,48),M.dark); add(front,x,y,zf+0.001);
    engines.push(makePlume(r*0.55,x,y,zb-0.03));
  }
  // a hull section that remembers its shape, so livery bands can wrap it anywhere along a taper
  function sec(z0,z1,w0,h0,w1,h1,o={}){ plate(z0,z1,w0,h0,w1,h1,o); return {z0,z1,w0,h0,w1,h1,x:o.x||0,y:o.y||0,ch:o.ch!==undefined?o.ch:CH}; }
  const secF=(s,z)=>clamp((z-s.z0)/(s.z1-s.z0),0,1), secW=(s,z)=>lerp(s.w0,s.w1,secF(s,z)), secH=(s,z)=>lerp(s.h0,s.h1,secF(s,z));
  function band(s,za,zb,mat=PL,grow=0.014){ deck(za,zb,secW(s,za)+grow,secH(s,za)+grow,secW(s,zb)+grow,secH(s,zb)+grow,{x:s.x,y:s.y,mat,ch:s.ch,greeble:false}); }
  // open lattice mast from a to b: two rails w apart (across `side`), zig-zag bracing between them
  function lattice(a,b,w,side,mat=M.metal,r=.006){ const o=side.clone().multiplyScalar(w/2), n=Math.max(2,Math.round(a.distanceTo(b)/(w*1.2)));
    const A=a.clone().add(o), B=b.clone().add(o), C=a.clone().sub(o), D=b.clone().sub(o); rod(A,B,r*1.4,mat); rod(C,D,r*1.4,mat);
    for(let i=0;i<n;i++){ const p=A.clone().lerp(B,i/n), q=C.clone().lerp(D,(i+1)/n), p2=A.clone().lerp(B,(i+1)/n); rod(p,q,r,mat); rod(q,p2,r,mat); } }

  if(cls==='patrol'){
    // v55, from reference/patrol-craft.png: a low faceted stealth wedge on three drives (boxed outboard, round in the
    // middle), swept flanks aft carrying a PDC each above and a missile pod each below, tail fins, a twin pulse turret
    // on the dorsal spine
    drive(.1,.2,-0.68,0,-.01,{bands:[[0.3,0.6,PL]]});
    [-1,1].forEach(sd=>{ const x=sd*.22;
      plate(-0.9,-0.66,.2,.18,.2,.18,{x,y:-.01,mat:H2,ch:.25}); band({z0:-0.9,z1:-0.66,w0:.2,h0:.18,w1:.2,h1:.18,x,y:-.01,ch:.25},-0.8,-0.72);
      const sq=new THREE.Mesh(new THREE.PlaneGeometry(.12,.1),M.glow); sq.rotation.y=Math.PI; add(sq,x,-.01,-0.902); engines.push(makePlume(.06,x,-.01,-0.91)); });
    plate(-0.7,-0.45,.64,.2,.68,.22,{mat:H2,ch:.3});                                        // engine block
    const aft=sec(-0.48,0.0,.74,.24,.8,.24,{ch:.42}), bow=sec(0.0,0.92,.8,.24,.04,.04,{ch:.45});
    [-1,1].forEach(sd=>{ const x=sd*.36;
      plate(-0.66,-0.08,.14,.1,.08,.08,{x,y:-.04,mat:HULL,ch:.35});                         // swept flank
      band({z0:-0.66,z1:-0.08,w0:.14,h0:.1,w1:.08,h1:.08,x,y:-.04,ch:.35},-0.5,-0.4);
      const fin=plate(-0.8,-0.55,.02,.2,.02,.08,{x:sd*.3,y:.13,mat:H2,ch:.15,greeble:false}); fin.rotation.z=-sd*0.25;   // tail fins
      deck(-0.76,-0.68,.024,.12,.024,.1,{x:sd*.3,y:.13,mat:PL,ch:.1,greeble:false}).rotation.z=-sd*0.25;
      plate(-0.42,-0.12,.06,.06,.06,.06,{x:sd*.3,y:-.16,mat:M.dark,ch:.3,greeble:false}); tubeMouth(1,sd*.3,-.16,-0.118,.02);   // missile pods under the flanks
      pdc(x,.06,-0.52,1); });                                                              // PDCs port and starboard
    band(aft,-0.3,-0.2); band(bow,0.22,0.3); band(bow,0.34,0.37,ST); band(bow,0.56,0.62);
    plate(-0.4,0.5,.24,.07,.08,.04,{y:.14,mat:H2,ch:.42});                                 // dorsal spine
    const slope=Math.atan2(.1,.92);   // white stripes flush on the bow's top face
    [-.03,.03].forEach(x=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(.03,.006,.4),ST); m.rotation.x=slope; add(m,x,.051,.68); });
    pulseTurret(0,0,.175,.15,1,.85);
    const dome=new THREE.Mesh(new THREE.SphereGeometry(.035,16,10),M.dark); add(dome,0,.19,-0.25); light(0,.225,-0.25,0x7fffcf);
    [-.02,.02].forEach(x=>rod(new THREE.Vector3(x,.17,-0.15),new THREE.Vector3(x,.3,-0.15),.004,M.metal));
    [-.035,.035].forEach(x=>{ const h=new THREE.Mesh(new THREE.BoxGeometry(.025,.012,.01),M.window); add(h,x,-.01,0.905); });   // bow lamps
    number(idn,.33,.0,0.2,.05,'r'); number(idn,-.33,.0,0.2,.05,'l');
    light(.43,-.04,-0.6,nav); light(-.43,-.04,-0.6,nav); light(.3,.25,-0.76,0xff3020); light(-.3,.25,-0.76,0xff3020);
  } else if(cls==='corvette'){
    // v55, from reference/corvette.png: three drives (two above, one below), a banded engineering block, a pinched
    // waist of pipework, a missile block on the dorsal deck, a canopy bridge and a rounded bow with twin light
    // railguns under it
    drive(.13,.4,-0.75,.15,.08,{bands:[[0.3,0.6,PL],[0.63,0.69,ST]]}); drive(.13,.4,-0.75,-.15,.08,{bands:[[0.3,0.6,PL],[0.63,0.69,ST]]}); drive(.13,.4,-0.75,0,-.14,{bands:[[0.3,0.6,PL],[0.63,0.69,ST]]});
    const eng=sec(-0.77,-0.42,.56,.44,.56,.44,{mat:H2,ch:.22}); band(eng,-0.7,-0.6); band(eng,-0.6,-0.56,ST);
    collar(-0.43,-0.39,.42,.36); truss(-0.4,-0.14,.36,.3); tank(0,.02,-0.27,.05,.14,H2);
    const mid=sec(-0.16,0.45,.6,.42,.58,.4,{ch:.24}), fore=sec(0.45,1.15,.58,.4,.12,.1,{ch:.36});
    band(mid,-0.1,0.02); band(mid,0.02,0.06,ST); band(mid,0.3,0.4); band(fore,0.6,0.64,ST); band(fore,0.64,0.74); band(fore,0.9,0.96,ST);
    plate(-0.1,0.3,.3,.06,.28,.06,{y:.22,mat:H2,ch:.3}); cells(1,0,.25,.1,2,2,.055);         // missile block
    plate(0.4,0.72,.24,.08,.16,.06,{y:.21,ch:.35}); windows(0,.25,.62,.12,3);               // canopy bridge
    [-.03,.03].forEach(x=>rod(new THREE.Vector3(x,.25,.48),new THREE.Vector3(x,.4,.48),.005,M.metal));
    [-.07,.07].forEach(x=>{ tube(.015,0.72,1.02,x,-.13,M.metal,10); tube(.026,0.68,0.8,x,-.13,M.dark,10); tube(.02,1.0,1.03,x,-.13,M.dark,10); mount(0,x,-.13,1.04); });   // light railguns under the bow
    pdc(.17,.22,-0.6,1); pdc(-.17,.22,-0.6,1); pdc(.3,.05,0.2,1,'x'); pdc(-.3,.05,0.2,-1,'x'); pdc(.15,-.21,-0.3,-1); pdc(-.15,-.21,-0.3,-1);   // 2 dorsal, 2 flank, 2 ventral
    number(idn,.302,.0,0.0,.06,'r'); number(idn,-.302,.0,0.0,.06,'l'); number(idn,0,.21,-0.6,.06,'top');
    light(.29,.1,-0.5,nav); light(-.29,.1,-0.5,nav); light(0,0,1.16,0xffffff); rcs(.24,.12,.6); rcs(-.24,.12,.6);
  } else if(cls==='frigate'){
    // v54, from reference/frigate.png: one big banded drive, an open truss, then a hull tapering to a needle bow with
    // twin beam projectors under it and a 2x2 block of missile cells on the dorsal deck
    drive(.27,.55,-0.75,0,0,{bands:[[0.12,0.3,PL],[0.32,0.37,ST],[0.45,0.7,PL],[0.72,0.77,ST]]});
    collar(-0.77,-0.72,.36,.3);
    truss(-0.72,-0.36,.3,.22); tank(0,0,-0.54,.06,.22,H2); tank(.09,-.05,-0.54,.03,.24,M.metal); tank(-.09,-.05,-0.54,.03,.24,M.metal);
    const mid=sec(-0.38,0.32,.46,.3,.46,.3,{ch:.22}), bow=sec(0.32,1.3,.46,.3,.05,.05,{ch:.3});
    plate(-0.3,0.55,.16,.06,.12,.04,{y:-.17,mat:H2,ch:.3});                                  // keel
    [-1,1].forEach(sd=>{ plate(-0.3,0.25,.07,.16,.07,.16,{x:sd*.26,mat:H2,ch:.25}); plate(-0.3,-0.22,.075,.17,.075,.17,{x:sd*.26,mat:PL,ch:.2,greeble:false}); });   // flank sponsons
    plate(-0.34,0.3,.28,.07,.22,.06,{y:.18,mat:H2,ch:.3});                                 // dorsal block with the launch cells
    band(mid,-0.3,-0.2); band(mid,-0.2,-0.17,ST); band(mid,0.12,0.2); band(bow,0.5,0.62); band(bow,0.65,0.69,ST); band(bow,0.86,0.96); band(bow,1.02,1.05,ST);
    cells(1,0,.215,-0.08,2,2,.05);
    plate(0.08,0.24,.14,.06,.1,.05,{y:.24,ch:.3}); windows(0,.27,.16,.12,3);                 // conning block and antennas
    [-.03,.03].forEach(x=>rod(new THREE.Vector3(x,.27,.18),new THREE.Vector3(x,.42,.18),.005,M.metal));
    [-.04,.04].forEach(x=>{ tube(.016,0.98,1.24,x,-.08,M.metal,10); tube(.028,0.95,1.06,x,-.08,M.dark,10);   // twin beam projectors under the bow
      const l=new THREE.Mesh(new THREE.CircleGeometry(.013,12),lensMat); add(l,x,-.08,1.242); mount(0,x,-.08,1.25); });
    pdc(.16,.15,-0.3,1); pdc(-.13,.145,0.42,1);                                           // 2 dorsal, 4 flank, 1 ventral
    pdc(.3,0,-0.2,1,'x'); pdc(-.3,0,-0.2,-1,'x'); pdc(.18,0,0.62,1,'x'); pdc(-.18,0,0.62,-1,'x'); pdc(0,-.2,0.1,-1);
    number(idn,.3,.0,0.08,.055,'r'); number(idn,-.3,.0,0.08,.055,'l'); number(idn,0,.153,0.62,.06,'top');
    light(.2,.1,-0.42,nav); light(-.2,.1,-0.42,nav); light(0,0,1.31,0xffffff); rcs(.22,.1,.3); rcs(-.22,.1,.3);
  } else if(cls==='destroyer'){
    // v54, from reference/destroyer.png: four drives in a 2x2 block, a long armoured hull under a raised citadel, a
    // sloping prow carrying the pulse battery, torpedo blisters low on either side, and a railgun along the keel
    [[-1,1],[1,1],[-1,-1],[1,-1]].forEach(([sx,sy])=>drive(.19,.5,-0.95,sx*.2,sy*.19,{bands:[[0.3,0.62,PL],[0.66,0.72,ST]]}));
    plate(-0.97,-0.78,.66,.6,.7,.56,{mat:H2,ch:.15});                                      // drive mount
    const main=sec(-0.78,0.55,.7,.5,.68,.48,{ch:.2}), prow=sec(0.55,1.5,.68,.48,.04,.06,{ch:.3});
    plate(-0.6,0.15,.4,.12,.34,.1,{y:.3,mat:H2,ch:.3});                                    // dorsal citadel
    plate(-0.45,-0.05,.2,.1,.18,.08,{y:.4,ch:.3}); windows(0,.45,-0.25,.3,5);
    [-.05,0,.06].forEach((x,i)=>rod(new THREE.Vector3(x,.44,-0.35+i*.05),new THREE.Vector3(x,.6+i*.03,-0.35+i*.05),.005,M.metal));
    plate(-0.5,0.5,.2,.07,.2,.07,{y:-.28,mat:H2,ch:.3}); plate(0.5,1.0,.16,.2,.1,.26,{y:-.22,mat:H2,ch:.3});   // keel
    band(main,-0.62,-0.5); band(main,-0.5,-0.46,ST); band(main,-0.05,0.08); band(main,0.3,0.34,ST); band(main,0.34,0.46); band(prow,0.75,0.8,ST); band(prow,0.8,0.92); band(prow,1.18,1.26);
    rail(-.36,-0.3,0.98,.07); mount(0,0,-.36,1.04);                                          // keel railgun
    plate(0.58,0.86,.42,.06,.34,.05,{y:.235,mat:H2,ch:.3,greeble:false});                  // pulse battery on the prow
    [-1,1].forEach(sd=>{ pulseTurret(1,sd*.12,.265,.7,1,1.3);
      plate(0.5,0.86,.12,.13,.1,.12,{x:sd*.27,y:-.1,mat:H2,ch:.25}); tubeMouth(2,sd*.27,-.1,.861,.035); });   // torpedo blisters
    pdc(.26,.25,-0.62,1); pdc(-.26,.25,-0.62,1); pdc(.25,.25,0.3,1); pdc(-.25,.25,0.3,1);    // 4 dorsal, 4 flank, 2 ventral
    pdc(.36,0,-0.32,1,'x'); pdc(-.36,0,-0.32,-1,'x'); pdc(.355,-.05,0.42,1,'x'); pdc(-.355,-.05,0.42,-1,'x'); pdc(.2,-.25,-0.5,-1); pdc(-.2,-.25,0.3,-1);
    number(idn,.352,.06,0.1,.09,'r'); number(idn,-.352,.06,0.1,.09,'l'); number(idn,0,.36,-0.45,.08,'top');
    light(.36,.2,-0.85,nav); light(-.36,.2,-0.85,nav); light(0,0,1.51,0xffffff); rcs(.3,.15,1.0); rcs(-.3,.15,1.0); rcs(.3,-.2,-0.7); rcs(-.3,-.2,-0.7);
  } else if(cls==='cruiser'){
    // v54, from reference/heavy-cruiser.png: one great drive drum, an open truss round the tanks, a broad body with
    // beam emitters on its shoulders, then a long gun spine to a launcher head: the spinal railgun's bore in the
    // middle of a 3x3 grid, eight torpedo tubes round it
    drive(.4,.7,-1.15,0,0,{bands:[[0.22,0.44,PL],[0.47,0.52,ST],[0.6,0.8,PL]]});
    collar(-1.17,-1.12,.5,.5);
    truss(-1.12,-0.76,.46,.36); [-1,1].forEach(sd=>tank(sd*.12,-.04,-0.94,.07,.24,H2)); tank(0,.1,-0.94,.06,.24,M.metal);
    const body=sec(-0.78,0.25,.6,.46,.56,.44,{ch:.22}), neck=sec(0.25,0.7,.56,.44,.32,.3,{ch:.25}), spine=sec(0.7,1.55,.32,.3,.3,.28,{ch:.25}), head=sec(1.55,1.85,.4,.34,.38,.32,{ch:.18});
    [-1,1].forEach(sd=>{ const sh=sec(-0.7,0.1,.24,.3,.2,.26,{x:sd*.42,y:-.02,ch:.25});      // shoulder pods with the heavy beams
      band(sh,-0.5,-0.36); band(sh,-0.36,-0.32,ST);
      plate(-0.25,0.0,.14,.08,.12,.07,{x:sd*.42,y:.16,mat:H2,ch:.3}); emitter(1,sd*.42,.22,0.22,.32,.035); });
    band(body,-0.6,-0.45); band(body,-0.45,-0.41,ST); band(body,-0.1,0.05); band(neck,0.36,0.42,ST); band(spine,0.95,1.1); band(spine,1.1,1.14,ST); band(spine,1.22,1.34); band(head,1.6,1.65,ST);
    plate(-0.45,-0.12,.24,.08,.2,.07,{y:.265,mat:H2,ch:.3}); windows(0,.31,-0.28,.25,5);  // bridge
    [-.04,.04].forEach(x=>rod(new THREE.Vector3(x,.3,-0.4),new THREE.Vector3(x,.48,-0.4),.005,M.metal));
    tube(.035,0.3,1.55,0,.17,M.dark,12); for(let i=0;i<8;i++){ const c=new THREE.Mesh(new THREE.TorusGeometry(.04,.008,6,16),M.metal); add(c,0,.17,0.4+i*.15); }   // spinal conduit
    for(let r=0;r<3;r++) for(let c=0;c<3;c++) if(r!==1||c!==1) tubeMouth(2,(c-1)*.1,(r-1)*.09,1.852,.032);
    tube(.04,1.82,1.86,0,0,M.metal,16); { const bore=new THREE.Mesh(new THREE.CircleGeometry(.025,16),new THREE.MeshBasicMaterial({color:0x7fd0ff})); add(bore,0,0,1.862); mount(0,0,0,1.87); }
    pdc(.2,.23,-0.62,1); pdc(-.2,.23,-0.62,1); pdc(0,.23,0.1,1); pdc(.1,.155,0.85,1); pdc(-.1,.155,1.3,1);   // 5 dorsal, 4 flank, 1 ventral
    pdc(.545,0,-0.5,1,'x'); pdc(-.545,0,-0.5,-1,'x'); pdc(.165,0,1.4,1,'x'); pdc(-.165,0,1.4,-1,'x'); pdc(0,-.24,-0.3,-1);
    number(idn,.163,.0,0.95,.06,'r'); number(idn,-.163,.0,0.95,.06,'l'); number(idn,0,.232,-0.6,.08,'top');
    light(.3,.2,-0.75,nav); light(-.3,.2,-0.75,nav); light(0,.2,1.86,0xffffff); rcs(.2,.12,1.6); rcs(-.2,.12,1.6);
  } else if(cls==='carrier'){
    // v54, from reference/fleet-carrier.png: three drives abreast, a slab-sided hull under a flight deck with an island
    // aft to starboard, five lit launch bays down each flank and one in the bow, pulse turrets on the bow deck
    [-1,0,1].forEach(sx=>drive(.2,.5,-1.15,sx*.34,0,{bands:[[0.35,0.6,PL],[0.63,0.69,ST]]}));
    plate(-1.18,-0.98,1.0,.5,1.02,.54,{mat:H2,ch:.12});
    const main=sec(-0.98,1.3,1.0,.56,1.0,.56,{ch:.1}), bow=sec(1.3,1.62,1.0,.56,.78,.44,{ch:.22});
    band(main,-0.85,-0.75); band(main,-0.75,-0.71,ST); band(main,0.92,0.98,ST); band(main,0.98,1.06); band(bow,1.4,1.46);
    topPlate(-0.92,1.25,.72,.72,.28,M.deckTop);                                           // flight deck and markings
    for(let i=0;i<9;i++){ const m=new THREE.Mesh(new THREE.BoxGeometry(.012,.006,.1),ST); add(m,0,.3,-0.7+i*.18); }
    [-1,1].forEach(sd=>{ for(let i=0;i<14;i++){ const w=new THREE.Mesh(new THREE.BoxGeometry(.012,.008,.012),M.window); add(w,sd*.33,.3,-0.85+i*.15); } });
    { const sq=new THREE.Mesh(new THREE.BoxGeometry(.34,.006,.34),PL); add(sq,0,.299,0.82);
      const a=new THREE.Mesh(new THREE.BoxGeometry(.3,.007,.07),ST), b=new THREE.Mesh(new THREE.BoxGeometry(.07,.007,.3),ST); add(a,0,.301,0.82); add(b,0,.301,0.82); }
    plate(-0.98,-0.42,.24,.22,.2,.2,{x:-.38,y:.38,mat:H2,ch:.25});                       // island
    plate(-0.86,-0.58,.18,.12,.16,.1,{x:-.38,y:.54,ch:.3}); windows(-.38,.6,-0.72,.24,5);
    [-.42,-.36,-.33].forEach((x,i)=>rod(new THREE.Vector3(x,.58,-0.8+i*.06),new THREE.Vector3(x,.78-i*.04,-0.8+i*.06),.006,M.metal)); dish(-.38,.6,-0.48,.08);
    [-1,1].forEach(sd=>{ for(let i=0;i<5;i++){ const z=-0.55+i*.3;                           // flank launch bays
      plate(z-.12,z+.12,.02,.16,.02,.16,{x:sd*.505,y:-.08,mat:M.dark,ch:.1,greeble:false});
      const slot=new THREE.Mesh(new THREE.PlaneGeometry(.2,.1),M.bay); slot.rotation.y=sd*Math.PI/2; add(slot,sd*.517,-.08,z); mount(0,sd*.53,-.08,z,sd,0,0.4); } });
    { const fr=new THREE.Mesh(new THREE.BoxGeometry(.48,.18,.02),M.dark); add(fr,0,-.03,1.62);   // bow bay
      const bb=new THREE.Mesh(new THREE.PlaneGeometry(.42,.12),M.bay); add(bb,0,-.03,1.632); mount(0,0,-.03,1.645); }
    [-1,1].forEach(sd=>pulseTurret(1,sd*.3,.296,1.18,1,1.3));
    pdc(.43,.29,-0.3,1); pdc(.43,.29,0.5,1); pdc(-.43,.29,0.9,1);                             // 3 dorsal, 4 flank, 3 ventral
    pdc(.51,.12,-0.85,1,'x'); pdc(-.51,.12,-0.85,-1,'x'); pdc(.51,.12,1.1,1,'x'); pdc(-.51,.12,1.1,-1,'x'); pdc(.3,-.29,-0.5,-1); pdc(-.3,-.29,-0.5,-1); pdc(0,-.29,0.6,-1);
    number(idn,.25,.297,-0.55,.11,'top'); number(idn,.511,.13,-0.4,.09,'r'); number(idn,-.511,.13,-0.4,.09,'l');
    light(.5,.25,-0.95,nav); light(-.5,.25,-0.95,nav); light(-.38,.8,-0.75,0xff3030); rcs(.5,.2,1.4); rcs(-.5,.2,1.4);
  } else if(cls==='fastattack'){
    // v53, from Jon's reference art (reference/fast-attack-*.png): a fat drive drum, an open truss round the fuel
    // tanks, then an arrowhead hull with a missile pod on each flank, a raised armoured block with a sensor dome, and a
    // twin pulse turret ahead of it. Proportions are the plan view's, as fractions of length from the stern.
    { // 0 to 22%: the drive, a solid armoured cylinder (not the open drum other hulls use) with orange and white
      // bands, armour rings, and a glowing aft rim round the nozzle
      const zf=-0.54, zb=-0.95, r=.27;
      cyl(r,zb+0.03,zf,HULL); cyl(r*1.012,-0.84,-0.71,PL,true); cyl(r*1.014,-0.70,-0.675,ST,true); cyl(r*1.012,-0.64,-0.58,PL,true);
      [zb+0.035,-0.775,-0.61,zf].forEach(z=>{ const t=new THREE.Mesh(new THREE.TorusGeometry(r*1.02,.012,8,48),M.dark); add(t,0,0,z); });
      for(let i=0;i<10;i++){ const a=i/10*Math.PI*2, b=new THREE.Mesh(new THREE.BoxGeometry(.045,.03,.36),M.dark); b.position.set(Math.cos(a)*r*1.03,Math.sin(a)*r*1.03,(zb+zf)/2+0.02); b.rotation.z=a; body.add(b); }
      const face=new THREE.Mesh(new THREE.CircleGeometry(r,48),M.dark); face.rotation.y=Math.PI; add(face,0,0,zb+0.031);
      const rim=new THREE.Mesh(new THREE.RingGeometry(r*0.62,r*0.82,48),M.glow); rim.rotation.y=Math.PI; add(rim,0,0,zb+0.028);   // the glowing aft ring
      const bell=new THREE.Mesh(new THREE.CylinderGeometry(r*0.5,r*0.6,.06,32),M.bell); bell.rotation.x=Math.PI/2; add(bell,0,0,zb+0.0);
      const front=new THREE.Mesh(new THREE.CircleGeometry(r*0.98,48),M.dark); add(front,0,0,zf+0.001);
      engines.push(makePlume(r*0.55,0,0,zb-0.02));
    }
    collar(-0.56,-0.52,.30,.30);
    truss(-0.53,-0.18,.26,.16);                                                   // 22 to 41%: open truss
    tank(0,.005,-0.355,.052,.2,H2); tank(.07,-.03,-0.355,.028,.2,M.metal); tank(-.07,-.03,-0.355,.028,.2,M.metal);
    plate(-0.19,0.23,.50,.15,.48,.15,{ch:.18});                                    // 41% to the bow: the hull
    plate(0.23,0.95,.48,.15,.02,.03,{ch:.35});
    plate(-0.1,0.6,.22,.07,.1,.04,{y:-.095,mat:H2,ch:.3});                         // keel
    [-1,1].forEach(sd=>{                                                          // missile pods, 2 x 2 tubes each
      const x=sd*.255;
      plate(-0.17,0.23,.14,.12,.14,.12,{x,mat:M.dark,ch:.15,greeble:false});
      plate(-0.22,-0.16,.12,.1,.12,.1,{x,mat:M.dark,ch:.2,greeble:false});
      deck(-0.12,0.21,.13,.016,.13,.016,{x,y:.068,mat:PL,ch:.05,greeble:false});
      const st=new THREE.Mesh(new THREE.BoxGeometry(.13,.008,.025),ST); add(st,x,.078,-0.04);
      [[-.032,.03],[.032,.03],[-.032,-.03],[.032,-.03]].forEach(([dx,dy])=>tubeMouth(0,x+dx,dy,.232,.022));
    });
    plate(-0.15,0.15,.24,.08,.20,.07,{y:.11,mat:H2,ch:.3});                        // armoured block, sensor dome, antennas
    const dome=new THREE.Mesh(new THREE.SphereGeometry(.042,20,14),M.dark); add(dome,0,.19,-0.05); light(0,.235,-0.05,nav);
    [-.025,.025].forEach(x=>rod(new THREE.Vector3(x,.15,-0.11),new THREE.Vector3(x,.27,-0.11),.005,M.metal));
    pulseTurret(1,0,.075,.21,1,1.15);                                             // twin pulse turret
    // livery: white stripes and orange panels running down the sloping bow
    const slope=Math.atan2(.075-.015,0.95-0.23);
    [-.022,.022].forEach(x=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(.014,.006,.66),ST); m.rotation.x=slope; add(m,x,.0465,.6); });
    const topAt=z=>.075-(.075-.015)*(z-0.23)/0.72;   // the bow's top surface, for flush livery
    [-1,1].forEach(sd=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(.06,.006,.22),PL); m.rotation.x=slope; add(m,sd*.06,topAt(.62)+.004,.62); });
    number(idn,0,.079,.33,.055,'top');
    pdc(0,-.13,.05,-1);
    light(0,.0,.955,0xffffff); light(.22,.1,-0.72,nav); light(-.22,.1,-0.72,nav); light(0,-.27,-0.7,0xff3020); rcs(.2,.06,.4); rcs(-.2,.06,.4);
  } else if(cls==='dreadnought'){
    // v54, from reference/dreadnought.png: six drives in a 2x3 block, a massive armoured hull with belts down both
    // flanks, a deckhouse and bridge tower, a spinal railgun along the dorsal centreline to the prow, heavy beam
    // emitters on raised blocks, light railguns on the prow flanks
    [[-1,1],[0,1],[1,1],[-1,-1],[0,-1],[1,-1]].forEach(([sx,sy])=>drive(.21,.65,-1.62,sx*.43,sy*.22,{bands:[[0.3,0.55,PL],[0.58,0.64,ST]]}));
    plate(-1.65,-1.35,1.2,.76,1.24,.74,{mat:H2,ch:.15});                                   // drive mount
    const main=sec(-1.35,0.85,1.24,.74,1.18,.7,{ch:.2}), prow=sec(0.85,2.3,1.18,.7,.08,.1,{ch:.3});
    [-1,1].forEach(sd=>{ const belt=sec(-1.2,0.75,.08,.5,.08,.46,{x:sd*.64,y:-.04,mat:H2,ch:.2});   // armour belts
      band(belt,-0.85,-0.65); band(belt,-0.65,-0.6,ST); band(belt,0.25,0.4); });
    band(main,-1.1,-0.88); band(main,-0.88,-0.83,ST); band(main,0.35,0.41,ST); band(main,0.41,0.62); band(prow,1.2,1.27,ST); band(prow,1.27,1.42);
    plate(-1.25,0.2,.7,.14,.6,.12,{y:.42,mat:H2,ch:.3});                                   // deckhouse
    plate(-0.7,-0.2,.4,.2,.34,.16,{y:.58,ch:.3}); windows(0,.68,-0.45,.4,7);                // bridge tower
    plate(-0.62,-0.36,.2,.1,.16,.08,{y:.72,mat:H2,ch:.3}); dish(.24,.5,-1.0,.12);
    [-.06,0,.06].forEach((x,i)=>rod(new THREE.Vector3(x,.76,-0.55+i*.07),new THREE.Vector3(x,.98-i*.05,-0.55+i*.07),.007,M.metal));
    tube(.05,0.2,2.0,0,.45,M.dark,20); for(let i=0;i<10;i++){ const c=new THREE.Mesh(new THREE.TorusGeometry(.055,.01,6,20),M.metal); add(c,0,.45,0.3+i*.18); }   // spinal railgun
    plate(0.75,1.95,.05,.24,.04,.32,{y:.31,mat:H2,ch:.3,greeble:false});                  // its pylon down the prow
    { const mz=new THREE.Mesh(new THREE.CylinderGeometry(.05,.07,.1,20),M.metal); mz.rotation.x=Math.PI/2; add(mz,0,.45,2.05);
      const bore=new THREE.Mesh(new THREE.CircleGeometry(.03,16),new THREE.MeshBasicMaterial({color:0x7fd0ff})); add(bore,0,.45,2.102); mount(0,0,.45,2.11); }
    [-1,1].forEach(sd=>{ plate(1.15,1.5,.12,.12,.1,.1,{x:sd*.4,y:-.1,mat:H2,ch:.3}); });  // light railguns on the prow flanks
    barrels([-.4,.4],-.1,1.45,1.85,.02); mount(1,-.4,-.1,1.86); mount(2,.4,-.1,1.86);
    [-1,1].forEach(sd=>{ plate(0.35,0.75,.24,.14,.22,.12,{x:sd*.4,y:.42,mat:H2,ch:.3}); band({z0:0.35,z1:0.75,w0:.24,h0:.14,w1:.22,h1:.12,x:sd*.4,y:.42,ch:.3},0.45,0.55);   // heavy beam emitters on raised blocks
      emitter(sd<0?3:4,sd*.4,.52,0.98,.38,.045); });
    [-1,1].forEach(sd=>pulseTurret(5,sd*.2,.49,0.02,1,1.5));
    [[.45,.37,-1.0],[-.45,.37,-1.0],[.45,.37,0.2],[-.45,.37,0.2],[.26,.27,1.3],[-.26,.27,1.3]].forEach(([x,y,z])=>pdc(x,y,z,1));   // 6 dorsal, 6 flank, 3 ventral
    [-0.9,-0.2,0.5].forEach(z=>{ pdc(.685,-.16,z,1,'x'); pdc(-.685,-.16,z,-1,'x'); });
    pdc(0,-.37,-0.9,-1); pdc(0,-.37,0.0,-1); pdc(0,-.3,1.1,-1);
    number(idn,.683,.1,-0.55,.12,'r'); number(idn,-.683,.1,-0.55,.12,'l'); number(idn,.3,.375,-1.15,.14,'top');
    light(.62,.3,-1.4,nav); light(-.62,.3,-1.4,nav); light(0,1.0,-0.55,0xffffff); light(0,0,2.31,0xffffff); rcs(.45,.3,1.6); rcs(-.45,.3,1.6); rcs(.62,.3,-1.0); rcs(-.62,.3,-1.0);
  } else if(cls==='tender'){
    // v54, from reference/repair-tender.png: four drives, a working spine flanked by banded cargo tanks, yellow gantry
    // cranes over an open repair bay with a hull in the dock, and a sharp bow carrying the pulse turrets
    [[-1,1],[1,1],[-1,-1],[1,-1]].forEach(([sx,sy])=>drive(.16,.45,-1.05,sx*.17,sy*.16,{bands:[[0.35,0.6,PL],[0.63,0.69,ST]]}));
    const aft=sec(-1.07,-0.55,.7,.46,.72,.46,{mat:H2,ch:.15}), spine=sec(-0.55,0.7,.36,.36,.36,.36,{ch:.2});
    const fore=sec(0.7,1.1,.74,.44,.66,.4,{ch:.2}), bow=sec(1.1,1.5,.66,.4,.12,.1,{ch:.3});
    band(aft,-0.85,-0.75); band(aft,-0.75,-0.72,ST); band(fore,0.76,0.8,ST); band(bow,1.16,1.28);
    [-1,1].forEach(sd=>[[-0.52,-0.04],[0.1,0.66]].forEach(([z0,z1])=>{ const x=sd*.37, r=.17, at=t=>lerp(z0,z1,t);   // cargo tanks
      cyl(r,z0+.04,z1-.04,HULL,{x}); cyl(r,z1-.04,z1,H2,{x,r1:r*.7}); cyl(r*.7,z0,z0+.04,H2,{x,r1:r});
      [[0.12,0.4,PL],[0.43,0.5,ST],[0.58,0.88,PL]].forEach(([a,b,m])=>cyl(r*1.012,at(a),at(b),m,{x,open:true}));
      [0.1,0.52,0.9].forEach(t=>{ const tr=new THREE.Mesh(new THREE.TorusGeometry(r*1.02,.009,8,40),M.dark); add(tr,x,0,at(t)); }); }));
    plate(-0.5,0.62,.26,.02,.26,.02,{y:.18,mat:M.dark,ch:.05,greeble:false});             // repair bay, with a hull in the dock
    plate(-0.35,0.45,.12,.08,.04,.04,{y:.23,mat:H2,ch:.3,greeble:false}); light(0,.25,-0.36,0x7fff9f);
    [-0.25,0.4].forEach(z=>{ [-1,1].forEach(sd=>rod(new THREE.Vector3(sd*.42,.14,z),new THREE.Vector3(sd*.42,.52,z),.016,M.crane));   // gantry cranes
      rod(new THREE.Vector3(-.44,.52,z),new THREE.Vector3(.44,.52,z),.016,M.crane); });
    [-1,1].forEach(sd=>rod(new THREE.Vector3(sd*.42,.52,-0.25),new THREE.Vector3(sd*.42,.52,0.4),.014,M.crane));
    [0.0,0.25].forEach((z,i)=>{ const tr=new THREE.Mesh(new THREE.BoxGeometry(.9,.03,.05),M.crane); add(tr,0,.5,z); const hk=new THREE.Mesh(new THREE.BoxGeometry(.05,.05,.05),PL); add(hk,i?-.12:.15,.42,z);
      rod(new THREE.Vector3(i?-.12:.15,.49,z),new THREE.Vector3(i?-.12:.15,.44,z),.004,M.dark); });
    plate(0.62,0.9,.3,.12,.26,.1,{y:.27,ch:.3}); windows(0,.33,.76,.22,4);                // bridge
    [-.05,.05].forEach(x=>rod(new THREE.Vector3(x,.32,.7),new THREE.Vector3(x,.5,.7),.005,M.metal));
    [-1,1].forEach(sd=>pulseTurret(0,sd*.14,.17,1.16,1,1.3));
    pdc(.22,.24,-0.88,1); pdc(-.22,.24,-0.88,1); pdc(.37,-.08,0.82,1,'x'); pdc(-.37,-.08,0.82,-1,'x'); pdc(0,-.19,0.3,-1);   // 2 dorsal, 2 flank, 1 ventral
    number(idn,.371,.07,0.92,.08,'r'); number(idn,-.371,.07,0.92,.08,'l'); number(idn,0,.205,1.0,.07,'top');
    light(.36,.2,-0.9,nav); light(-.36,.2,-0.9,nav); light(0,0,1.51,0xffffff); rcs(.36,.18,1.0); rcs(-.36,.18,1.0);
  } else if(cls==='ewar'){
    // v54, from reference/ew-ship.png: four drives in a diamond, a slim hull to a needle bow and a long antenna,
    // sensor dishes and radomes along the back, lattice masts with emitter bars out to both sides
    [[0,1],[0,-1],[1,0],[-1,0]].forEach(([sx,sy])=>drive(.12,.36,-0.84,sx*.17,sy*.17,{bands:[[0.3,0.6,PL],[0.63,0.7,ST]]}));
    plate(-0.86,-0.7,.42,.42,.4,.38,{mat:H2,ch:.3});
    const main=sec(-0.7,0.25,.36,.32,.34,.3,{ch:.3}), nose=sec(0.25,1.2,.34,.3,.03,.03,{ch:.35});
    band(main,-0.55,-0.45); band(main,-0.45,-0.42,ST); band(main,-0.12,-0.08,ST); band(nose,0.45,0.58); band(nose,0.6,0.64,ST);
    rod(new THREE.Vector3(0,0,1.18),new THREE.Vector3(0,0,1.7),.008,M.metal); [1.3,1.45].forEach(z=>{ const t=new THREE.Mesh(new THREE.TorusGeometry(.016,.004,6,12),M.metal); add(t,0,0,z); });
    dish(.12,.16,-0.28,.2); dish(.1,.16,0.18,.13); dish(-.14,.1,-0.05,.14);
    [[.1,-0.62],[-.1,-0.62],[-.08,0.35]].forEach(([x,z])=>{ const s=new THREE.Mesh(new THREE.SphereGeometry(.05,20,12),M.metal); add(s,x,.18,z); });
    const X=new THREE.Vector3(1,0,0), Z=new THREE.Vector3(0,0,1), bar=(x,y,z)=>{ const b=new THREE.Mesh(new THREE.BoxGeometry(.02,.07,.02),M.dark); add(b,x,y,z); light(x,y+.04,z,0xffa040); };
    lattice(new THREE.Vector3(0,.15,-0.45),new THREE.Vector3(0,.62,-0.45),.05,Z);           // dorsal mast with crossbars
    [.36,.52].forEach(y=>{ lattice(new THREE.Vector3(-.36,y,-0.45),new THREE.Vector3(.36,y,-0.45),.03,Z); [-1,1].forEach(sd=>bar(sd*.36,y,-0.45)); });
    [-1,1].forEach(sd=>{ lattice(new THREE.Vector3(sd*.17,0,-0.1),new THREE.Vector3(sd*.5,0,-0.1),.05,Z); bar(sd*.5,0,-0.1); bar(sd*.36,0,-0.1);   // flank outriggers
      lattice(new THREE.Vector3(sd*.17,-.05,-0.55),new THREE.Vector3(sd*.42,-.05,-0.55),.04,Z); bar(sd*.42,-.05,-0.55); });
    pdc(0,-.16,-0.15,-1); emitter(0,0,-.19,0.36,.3,.025);                                   // ventral PDC and light beam emitter
    windows(0,.165,.3,.2,4); number(idn,.181,.0,-0.3,.06,'r'); number(idn,-.181,.0,-0.3,.06,'l');
    light(.2,0,-0.75,nav); light(-.2,0,-0.75,nav); light(0,0,1.71,0xb88cff); light(0,.66,-0.45,0xb88cff); rcs(.17,.08,.2); rcs(-.17,.08,.2);
  }
  // greebles scattered over every armored deck
  for(const d of decks){
    const area=(d.z1-d.z0)*(d.w0+d.h0); const n=Math.round(area*40);
    for(let i=0;i<n;i++){ const t=R(), z=lerp(d.z0,d.z1,t), w=lerp(d.w0,d.w1,t), h=lerp(d.h0,d.h1,t); const f=R();
      const sx=0.015+R()*0.06, sy=0.006+R()*0.022, sz=0.015+R()*0.09; const bin = R()<0.55? greebles.dark : R()<0.6? greebles.hull : greebles.metal;
      const insetW=w/2*(1-d.ch*1.6), insetH=h/2*(1-d.ch*1.6);
      if(f<0.4) bin.push([d.x+(R()*2-1)*insetW, d.y+h/2+sy/2, z, sx,sy,sz]);
      else if(f<0.6) bin.push([d.x+(R()*2-1)*insetW, d.y-h/2-sy/2, z, sx,sy,sz]);
      else { const s=R()<0.5?-1:1; bin.push([d.x+s*(w/2+sy/2), d.y+(R()*2-1)*insetH, z, sy,sx,sz]); } }
  }
  const unit=new THREE.BoxGeometry(1,1,1), mtx=new THREE.Matrix4();
  for(const [k,list] of Object.entries(greebles)){ if(!list.length) continue;
    const mat=k==='dark'?M.dark:k==='metal'?M.metal:(P?M.hull2:M.hull); const im=new THREE.InstancedMesh(unit,mat,list.length);
    list.forEach((a,i)=>{ mtx.makeScale(a[3],a[4],a[5]).setPosition(a[0],a[1],a[2]); im.setMatrixAt(i,mtx); }); body.add(im); }
  // conduit runs along straight decks, plus a fine-detail layer (vents, valves, clamps) that only draws up close
  const pipes=[], fine=[];
  for(const d of decks){ const len=d.z1-d.z0; if(len<0.18) continue;
    const straight=Math.abs(d.w0-d.w1)<0.05 && Math.abs(d.h0-d.h1)<0.05, w=Math.min(d.w0,d.w1), h=Math.min(d.h0,d.h1);
    if(straight){ const np=1+Math.floor(R()*3);
      for(let i=0;i<np;i++){ const r=0.006+R()*0.008, za=d.z0+len*R()*0.25, zb=d.z1-len*R()*0.25, top=R()<0.45, sd=R()<0.5?-1:1;
        const x= top? d.x+(R()*2-1)*w*0.28 : d.x+sd*(w/2+r*0.6), y= top? d.y+h/2+r*0.6 : d.y+(R()*2-1)*h*0.25;
        pipes.push([x,y,(za+zb)/2,r,zb-za]); const nc=Math.floor((zb-za)/0.06);
        for(let k=1;k<nc;k++) fine.push([x,y,lerp(za,zb,k/nc), r*2.6,r*2.6,0.008]); } }
    const n=Math.round(len*(d.w0+d.h0)*140);
    for(let i=0;i<n;i++){ const t=R(), z=lerp(d.z0,d.z1,t), ww=lerp(d.w0,d.w1,t), hh=lerp(d.h0,d.h1,t), a=0.004+R()*0.012, b=0.003+R()*0.008, c=0.004+R()*0.02;
      const iw=ww/2*(1-d.ch*1.7), ih=hh/2*(1-d.ch*1.7); if(R()<0.6) fine.push([d.x+(R()*2-1)*iw, d.y+hh/2+b/2, z, a,b,c]); else { const sd=R()<0.5?-1:1; fine.push([d.x+sd*(ww/2+b/2), d.y+(R()*2-1)*ih, z, b,a,c]); } }
  }
  if(pipes.length){ const pg=new THREE.CylinderGeometry(1,1,1,8); pg.rotateX(Math.PI/2); const im=new THREE.InstancedMesh(pg,M.metal,pipes.length);
    pipes.forEach((a,i)=>{ mtx.makeScale(a[3],a[3],a[4]).setPosition(a[0],a[1],a[2]); im.setMatrixAt(i,mtx); }); body.add(im); }
  let fineMesh=null;
  if(fine.length){ fineMesh=new THREE.InstancedMesh(unit,M.dark,fine.length); fine.forEach((a,i)=>{ mtx.makeScale(a[3],a[4],a[5]).setPosition(a[0],a[1],a[2]); fineMesh.setMatrixAt(i,mtx); }); fineMesh.visible=false; body.add(fineMesh); }
  // shield bubble
  const shMat=new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    uniforms:{uColor:{value:new THREE.Color(COL.cyan)}, uFlash:{value:0}, uHit:{value:new THREE.Vector3(0,0,1)}, uTime:{value:0}},
    vertexShader:`varying vec3 vN; varying vec3 vL; varying vec3 vW; void main(){ vL=normalize(position); vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader:`varying vec3 vN; varying vec3 vL; varying vec3 vW; uniform vec3 uColor; uniform float uFlash; uniform vec3 uHit; uniform float uTime;
      void main(){ vec3 v=normalize(cameraPosition-vW); float f=pow(max(1.0-abs(dot(vN,v)),0.0),2.2);   /* see the plume shader: pow of a negative is NaN, which bloom smears */ float h=pow(max(dot(vL,uHit),0.0),5.0);
        float rip=0.5+0.5*sin(acos(clamp(dot(vL,uHit),-1.0,1.0))*18.0-uTime*14.0);
        float a=(f*0.55+h*(0.8+rip*0.6))*uFlash; gl_FragColor=vec4(uColor*a,1.0); }`});
  const shield=new THREE.Mesh(new THREE.SphereGeometry(1,32,20),shMat); shield.scale.set(L*0.36,L*0.26,L*0.62); shield.visible=false; g.add(shield);
  const pickMesh=new THREE.Mesh(new THREE.SphereGeometry(L*0.5,8,6), new THREE.MeshBasicMaterial()); pickMesh.visible=false; g.add(pickMesh);
  enableShadows(g);
  mergeShipParts({group:g, body, engines, lights, shieldMesh:shield, pickMesh, fineMesh});
  // the model's own length, bow tip to nozzle: opaque hull only, no plumes, glows or shield (v47 sizes ships from it)
  const box=new THREE.Box3(), part=new THREE.Box3(); g.updateMatrixWorld(true); const inv=new THREE.Matrix4().copy(g.matrixWorld).invert();
  body.traverse(o=>{ const m=o.material; if(!o.isMesh || !o.visible || !m || Array.isArray(m) || m.transparent || m.isShaderMaterial) return;
    if(!o.geometry.boundingBox) o.geometry.computeBoundingBox(); part.copy(o.isInstancedMesh? (o.computeBoundingBox(), o.boundingBox) : o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); box.union(part); });
  const modelLen=box.max.z-box.min.z;
  return {group:g, body, engines, lights, shieldMesh:shield, shMat, pickMesh, mats:M, fineMesh, mounts, turrets, turretRig:rig, modelLen,
    turretGoal:new Float32Array(turrets.length), turretHold:new Float32Array(turrets.length)};
}

