// Hard Burn: ship models: armor textures, materials, per-class builders, drive plumes, mesh merging.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

/* ---------------- ship models ---------------- */
/* ---------------- ship models (Expanse-inspired: stacked decks, drive at the stern, keel guns, PDC turrets) ----------------
   Player fleet: sleek naval style, chamfered armored decks, grey with amber markings.
   Enemy fleet: cobbled frontier style, boxy modules, exposed trusses, strapped-on tanks, patchwork plating. */
// Armor tile set: color, normal (from a height field), and packed occlusion/roughness/metalness, all generated.
// Tiles run lengthwise along the hull like the reference models; panel seams every quarter; chipped paint shows bare metal.
function armorTextures(seed){
  const S=1024, R=mulberry32(seed);
  const H=new Float32Array(S*S), Cc=new Float32Array(S*S), Ro=new Float32Array(S*S), Me=new Float32Array(S*S), Ao=new Float32Array(S*S);
  H.fill(0.08); Cc.fill(0.46); Ro.fill(0.8); Ao.fill(0.62);
  const rect=(x0,y0,w,h,fn)=>{ for(let y=Math.max(0,y0|0); y<Math.min(S,(y0+h)|0); y++) for(let x=Math.max(0,x0|0); x<Math.min(S,(x0+w)|0); x++) fn(y*S+x, x-x0, y-y0); };
  const CW=32;
  for(let cx=0; cx<S; cx+=CW){
    let y=-Math.floor(R()*90);
    while(y<S){
      const bl=58+Math.floor(R()*58), shade=0.62+R()*0.1-(R()<0.06?0.1:0), rough=0.55+R()*0.2, tilt=(R()-0.5)*0.05;
      rect(cx+2,y+2,CW-4,bl-4,(i,lx,ly)=>{ const ex=Math.min(lx,CW-5-lx), ey=Math.min(ly,bl-5-ly), e=Math.min(ex,ey);
        const bevel=Math.min(1,e/3.5); H[i]=0.5+0.42*bevel+tilt*(ly/bl-0.5); Cc[i]=shade*(0.94+0.06*bevel); Ro[i]=rough; Ao[i]=0.8+0.2*bevel; });
      y+=bl;
    }
  }
  // panel seams and recessed service hatches
  for(let k=0;k<4;k++){ const ys=k*256+Math.floor(R()*30); rect(0,ys,S,5,(i)=>{ H[i]=0.02; Ao[i]=0.3; Cc[i]*=0.6; }); }
  for(let k=0;k<6;k++){ const hx=Math.floor(R()*28)*CW+2, hy=Math.floor(R()*S), hw=CW*(1+Math.floor(R()*2))-4, hh=40+Math.floor(R()*50);
    rect(hx,hy,hw,hh,(i,lx,ly)=>{ const e=Math.min(lx,ly,hw-1-lx,hh-1-ly); if(e<2){ H[i]=0.15; Ao[i]=0.4; } else { H[i]=0.62; Cc[i]=0.5; Ro[i]=0.5; } }); }
  // chipped paint -> bare metal along tile edges
  for(let k=0;k<900;k++){ const cx=Math.floor(R()*S/CW)*CW+(R()<0.5?2:CW-6)+Math.floor(R()*4), cy=Math.floor(R()*S), r=1+R()*3.2;
    rect(cx-r,cy-r*2,r*2+1,r*4+1,(i,lx,ly)=>{ const dx=lx-r, dy=(ly-r*2)/2; if(dx*dx+dy*dy<=r*r){ Cc[i]=0.78; Ro[i]=0.32; Me[i]=0.95; H[i]-=0.04; } }); }
  // grime streaks running aft
  for(let k=0;k<160;k++){ const x=Math.floor(R()*S), y=Math.floor(R()*S), len=40+R()*160, w=1+Math.floor(R()*3), a=0.05+R()*0.1;
    rect(x,y,w,len,(i,lx,ly)=>{ Cc[i]*=1-a*(1-ly/len); Ro[i]=Math.min(1,Ro[i]+a); }); }
  const toCanvas=(fn)=>canvasTex(S,S,(g)=>{ const img=g.createImageData(S,S), d=img.data; for(let i=0;i<S*S;i++){ const [r,gg,b]=fn(i); d[i*4]=r; d[i*4+1]=gg; d[i*4+2]=b; d[i*4+3]=255; } g.putImageData(img,0,0); }, false);
  const map=toCanvas(i=>{ const v=Math.round(clamp(Cc[i],0,1)*255); return [v,v,v]; }); map.colorSpace=THREE.SRGBColorSpace;
  const normal=toCanvas(i=>{ const x=i%S, y=(i/S)|0; const hL=H[y*S+((x-1+S)%S)], hR=H[y*S+((x+1)%S)], hU=H[((y-1+S)%S)*S+x], hD=H[((y+1)%S)*S+x];
    const nx=(hL-hR)*4, ny=(hD-hU)*4, nz=1, l=Math.hypot(nx,ny,nz); return [Math.round((nx/l*0.5+0.5)*255), Math.round((ny/l*0.5+0.5)*255), Math.round((nz/l*0.5+0.5)*255)]; });
  const orm=toCanvas(i=>[Math.round(clamp(Ao[i],0,1)*255), Math.round(clamp(Ro[i],0.05,1)*255), Math.round(clamp(0.12+Me[i]*0.85,0,1)*255)]);
  const emis=canvasTex(S,S,(g,w,h)=>{ g.fillStyle='#000'; g.fillRect(0,0,w,h);
    for(let i=0;i<16;i++){ const x=Math.floor(R()*32)*CW+10, y=Math.floor(R()*h), n=2+Math.floor(R()*5); g.fillStyle='rgba(255,210,150,1)'; for(let k=0;k<n;k++) g.fillRect(x,y+k*11,10,6); } });
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
    hull: hull(P?0x8a8a8e:0xcfd3d6),
    hull2: hull(P?0x606066:0xa9aeb3, 0.95),
    plate: hull(P?0xe8672a:0xb03a2c, 0.95, 1, false),
    deckTop: hull(P?0x4a4a4e:0x8d9297, 1, 1, false),
    stripe: new THREE.MeshStandardMaterial({color: P?0xefefea:0xc93a2c, metalness:0.1, roughness:0.45}),
    drum: new THREE.MeshStandardMaterial({color: P?0x3c3c42:0x4c5156, metalness:0.85, roughness:0.38, side:THREE.DoubleSide}),
    bay: new THREE.MeshBasicMaterial({color:0x9a7a4a}),
    patches: [],
    dark: new THREE.MeshStandardMaterial({color: P?0x2f353b:0x2d2723, metalness:0.8, roughness:0.42}),
    metal: new THREE.MeshStandardMaterial({color: P?0x9aa1a8:0x8f8479, metalness:1.0, roughness:0.26}),
    accent: new THREE.MeshStandardMaterial({color: P?COL.player:COL.enemy, metalness:0.3, roughness:0.5, emissive: P?COL.player:COL.enemy, emissiveIntensity:0.1}),
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
    const d=new THREE.Mesh(new THREE.LatheGeometry(prof,32),new THREE.MeshStandardMaterial({color:0xd8dcdf,metalness:0.4,roughness:0.5,side:THREE.DoubleSide}));
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

  if(cls==='patrol'){
    const SM=new THREE.MeshStandardMaterial({map:smoothTex.map, color:P?0x8c9095:0xa9adb2, metalness:0.55, roughness:0.42});
    const SM2=new THREE.MeshStandardMaterial({map:smoothTex.map, color:P?0x5a5e63:0x7c8186, metalness:0.7, roughness:0.38});
    // angular stealth hunter: stacked knife-edged plates, twin ventral drive pods
    const spine=plate(-0.82,0.92,.32,.18,.03,.04,{ch:.46,mat:SM,greeble:false}); 
    plate(-0.7,0.6,.14,.12,.03,.03,{y:.12,ch:.46,mat:SM2,greeble:false});
    [-1,1].forEach(s=>{
      const w=plate(-0.78,0.38,.26,.13,.1,.08,{x:s*.25,y:.02,ch:.4,mat:SM,greeble:false}); w.rotation.z=-s*0.32;
      const c=plate(-0.2,0.62,.14,.1,.04,.05,{x:s*.14,y:.07,ch:.45,mat:SM2,greeble:false}); c.rotation.z=-s*0.5;
      plate(-0.82,0.05,.17,.17,.14,.14,{x:s*.19,y:-.14,ch:.3,mat:M.dark});
      for(let i=0;i<4;i++){ const b=new THREE.Mesh(new THREE.CylinderGeometry(.035,.04,.05,16),M.metal); add(b,s*.19,-.24,-0.6+i*.17); }
      drum(.08,.1,-0.82,s*.19,-.14);
      const fin=plate(-0.78,-0.4,.012,.18,.012,.06,{x:s*.36,y:.1,ch:.2,mat:SM2,greeble:false}); fin.rotation.z=s*0.4;
    });
    stripes(-0.5,0.4,.095,.05,.012); pdc(0,.17,-.2,1); pdc(0,-.1,.35,-1);
    pulseTurret(0,0,.14,.4,1,.8);
    [-1,1].forEach(s=>{ plate(-0.12,0.3,.07,.05,.07,.05,{x:s*.33,y:-.04,mat:M.dark,ch:.3,greeble:false}); tubeMouth(1,s*.33,-.04,.302,.016); });   // missile pods under the wings
    windows(0,.11,.55,.14,3); number(idn,.0,.187,-.35,.06,'top');
    light(.44,.12,-.75,nav); light(-.44,.12,-.75,nav);
  } else if(cls==='corvette'){
    drum(.2,.3,-0.86);
    struts(-0.86,-0.68,.17,.2);
    plate(-0.68,-0.2,.44,.42,.44,.42,{mat:H2}); sidePlates(-0.62,-0.28,.44,.3); turretBlock(-0.44,.21,.16);
    collar(-0.2,-0.14,.34,.32);
    plate(-0.14,0.52,.48,.38,.54,.38); sidePlates(-0.05,0.45,.5,.2,-.04);
    plate(0.52,1.12,.54,.38,.1,.08,{ch:.34,y:-.02}); 
    [-1,1].forEach(s=>{ const p=plate(0.5,1.0,.03,.26,.02,.1,{x:s*.22,y:-.05,mat:PL,ch:.1,greeble:false}); p.rotation.y=s*0.36; });
    topPlate(0.0,0.5,.3,.3,.19,H2); stripes(0.55,0.95,.12,.09); chevron(0.9,.08,.14);
    barrels([-.05,.05],-.14,0.7,1.34,.012); mount(0,-.05,-.14,1.35); mount(0,.05,-.14,1.35);   // twin light railguns under the bow
    cells(1,0,.206,.4,2,2);
    pdc(.27,.1,.2,1,'x'); pdc(-.27,.1,.2,-1,'x'); pdc(0,-.2,.3,-1); pdc(.25,-.1,-.45,1,'x'); pdc(-.25,-.1,-.45,-1,'x');
    windows(0,.14,.8,.2,4); number(idn,0,.2,.2,.08,'top'); number(idn,.276,-.02,-.02,.07,'r'); number(idn,-.276,-.02,-.02,.07,'l');
    light(.24,0,-.5,nav); light(-.24,0,-.5,nav); rcs(.25,.2,.5); rcs(-.25,.2,.5);
  } else if(cls==='frigate'){
    drum(.17,.24,-1.0);
    struts(-1.0,-0.9,.15,.18);
    plate(-0.9,0.5,.5,.3,.5,.3,{ch:.16});
    [-1,1].forEach(s=>{ plate(-0.85,0.45,.1,.07,.1,.07,{x:s*.2,y:.18,ch:.25,mat:H2}); });  // raised trench rails
    plate(-0.35,-0.05,.18,.12,.16,.1,{y:.2,ch:.3,mat:PL}); pdc(0,.26,-.2,1); pdc(0,.16,.25,1);
    sidePlates(-0.8,0.45,.5,.22,-.01);
    plate(0.5,1.24,.5,.3,.64,.1,{ch:.2,y:-.03,mat:PL}); topPlate(0.55,1.2,.36,.5,.07,HULL); chevron(1.0,.095,.3); chevron(1.1,.08,.36);
    barrels([-.06,.06],-.1,0.9,1.52,.013);   // twin beam projectors: lenses at the muzzles
    [-.06,.06].forEach(x=>{ const l=new THREE.Mesh(new THREE.CircleGeometry(.012,12),lensMat); add(l,x,-.1,1.523); mount(0,x,-.1,1.53); });
    cells(1,0,.152,.06,2,2);
    stripes(-0.8,0.4,.155,.21,.015);
    pdc(.27,0,-.5,1,'x'); pdc(-.27,0,-.5,-1,'x'); pdc(0,-.17,.0,-1); pdc(.3,-.02,.8,1,'x'); pdc(-.3,-.02,.8,-1,'x');
    windows(0,.19,.3,.3,4); number(idn,.3,-.05,1.05,.06,'r'); number(idn,-.3,-.05,1.05,.06,'l'); number(idn,0,.19,-.6,.07,'top');
    light(.27,0,-.85,nav); light(-.27,0,-.85,nav); rcs(.26,.15,.4); rcs(-.26,.15,.4);
  } else if(cls==='destroyer'){
    drum(.25,.34,-1.16);
    struts(-1.16,-1.0,.21,.24);
    plate(-1.0,-0.55,.52,.5,.52,.5,{mat:H2}); sidePlates(-0.95,-0.62,.52,.34); turretBlock(-0.78,.25,.18);
    plate(-0.55,-0.25,.4,.38,.42,.38); turretBlock(-0.4,.19,.2);
    collar(-0.25,-0.19,.36,.34);
    plate(-0.19,0.9,.62,.44,.72,.46);
    plate(-0.1,0.8,.24,.08,.3,.08,{y:.27,ch:.3,mat:H2}); // raised spine ridge
    [-1,1].forEach(s=>{ plate(0.0,0.82,.1,.3,.1,.32,{x:s*.39,y:-.02,mat:PL,ch:.2}); });
    plate(0.9,1.46,.82,.54,.76,.48,{ch:.24}); sidePlates(0.95,1.4,.82,.3,-.02); topPlate(1.0,1.42,.5,.46,.27,PL);
    plate(0.95,1.4,.5,.12,.46,.1,{y:-.3,ch:.3,mat:H2});
    grille(1.46,-.02,.56,.26);
    rail(-.37,0.5,1.42,.06); mount(0,0,-.37,1.47);   // keel railgun
    [-1,1].forEach(s=>{ pulseTurret(1,s*.14,.286,1.2); tubeMouth(2,s*.32,-.02,1.462,.03); });   // pulse battery on the bow, torpedo tubes in its face
    stripes(0.95,1.42,.29,.33,.02); stripes(-0.1,0.8,.235,.33,.018);
    pdc(.36,.24,.9,1); pdc(-.36,.24,.9,1); pdc(.42,0,1.2,1,'x'); pdc(-.42,0,1.2,-1,'x'); pdc(.45,-.1,.4,1,'x'); pdc(-.45,-.1,.4,-1,'x'); pdc(0,-.25,.3,-1); pdc(.22,-.36,1.2,-1);
    windows(0,.31,.3,.4,6); number(idn,0,.285,.55,.1,'top'); number(idn,.414,.05,-.3,.08,'r'); number(idn,-.414,.05,-.3,.08,'l');
    light(.3,.2,-.95,nav); light(-.3,.2,-.95,nav); rcs(.34,.28,1.3); rcs(-.34,.28,1.3); rcs(.28,-.24,-.7); rcs(-.28,-.24,-.7);
  } else if(cls==='cruiser'){
    // four drives in a 2x2 cluster, heavy midships, long gun spine to a launcher head
    [[-1,1],[1,1],[-1,-1],[1,-1]].forEach(([sx,sy])=>{ drum(.16,.3,-1.4,sx*.2,sy*.18); });
    struts(-1.4,-1.28,.34,.36,0,0,8);
    plate(-1.28,-0.7,.9,.62,.86,.58,{mat:H2}); sidePlates(-1.2,-0.8,.9,.4);
    [-1,1].forEach(s=>{ plate(-1.1,-0.1,.22,.34,.2,.3,{x:s*.56,y:-.04,mat:HULL,ch:.25}); topPlate(-1.0,-0.2,.14,.12,.13,PL);
      const fin=plate(-1.0,-0.45,.02,.3,.02,.14,{x:s*.66,y:.22,mat:H2,ch:.1,greeble:false}); fin.rotation.z=s*0.3; });
    plate(-0.7,0.25,.6,.52,.5,.44); plate(-0.55,0.05,.26,.16,.22,.12,{y:.34,ch:.3,mat:H2}); windows(0,.42,-.25,.4,6); dish(.18,.3,-.4,.1);
    collar(0.25,0.32,.3,.3);
    plate(0.32,1.55,.28,.28,.26,.26,{ch:.22}); topPlate(0.35,1.5,.1,.1,.14,PL); stripes(0.35,1.5,.145,.1,.014);
    [-1,1].forEach(s=>{ plate(0.4,1.3,.05,.12,.05,.1,{x:s*.17,y:-.02,mat:H2,ch:.2}); });
    plate(1.55,1.86,.38,.36,.36,.34,{ch:.15,mat:H2}); sidePlates(1.58,1.82,.38,.26);
    for(let r=0;r<3;r++) for(let c=0;c<3;c++){ const t=new THREE.Mesh(new THREE.CircleGeometry(.038,16),M.dark); add(t,(c-1)*.1,(r-1)*.095,1.865); if(r!==1||c!==1) mount(2,(c-1)*.1,(r-1)*.095,1.875); }   // torpedo tubes round the bore
    const bore=new THREE.Mesh(new THREE.CircleGeometry(.025,16),new THREE.MeshBasicMaterial({color:0x7fd0ff})); add(bore,0,0,1.868); mount(0,0,0,1.875);   // spinal railgun
    [-1,1].forEach(s=>emitter(1,s*.2,.29,.28,.32,.03));   // heavy beam emitters on the shoulders
    pdc(.3,.28,-.3,1); pdc(-.3,.28,-.3,1); pdc(.46,-.05,-1.0,1,'x'); pdc(-.46,-.05,-1.0,-1,'x'); pdc(0,.15,.9,1); pdc(0,-.15,1.2,-1); pdc(.2,.2,1.7,1); pdc(-.2,.2,1.7,1); pdc(.68,-.05,-.6,1,'x'); pdc(-.68,-.05,-.6,-1,'x');
    number(idn,0,.285,-1.0,.09,'top'); number(idn,.195,0,1.72,.06,'r'); number(idn,-.195,0,1.72,.06,'l');
    light(.46,.2,-1.25,nav); light(-.46,.2,-1.25,nav); light(0,.36,1.84,0xffffff); rcs(.2,.2,1.6); rcs(-.2,.2,1.6);
  } else if(cls==='carrier'){
    // broad-beamed flight hull in the same yard style: three drives, launch bays down both flanks and in the bow
    drum(.2,.3,-1.4,.34,0); drum(.2,.3,-1.4,-.34,0); drum(.24,.34,-1.4,0,.02);
    struts(-1.4,-1.26,.3,.46,0,0,8);
    plate(-1.26,-0.8,.9,.56,.94,.56,{mat:H2}); sidePlates(-1.2,-0.86,.94,.36);
    plate(-0.8,1.2,1.0,.5,1.0,.5,{ch:.18});
    [-1,1].forEach(s=>{ for(let i=0;i<5;i++){ const slot=new THREE.Mesh(new THREE.PlaneGeometry(.26,.12),M.bay); slot.rotation.y=s*Math.PI/2; add(slot,s*.503,-.06,-.6+i*.38); mount(0,s*.52,-.06,-.6+i*.38,s,0,0.4); }
      plate(-0.7,1.1,.02,.08,.02,.08,{x:s*.51,y:.12,mat:PL,ch:.1,greeble:false}); });
    topPlate(-0.7,1.1,.56,.56,.25,M.deckTop); stripes(-0.7,1.1,.268,.2,.012);
    for(let i=0;i<6;i++){ const m=new THREE.Mesh(new THREE.BoxGeometry(.06,.006,.02),ST); add(m,0,.268,-0.5+i*.3); }
    plate(-0.35,0.25,.16,.26,.14,.2,{x:.38,y:.38,ch:.25,mat:H2}); windows(.38,.5,-.05,.4,5); dish(.38,.52,-.25,.1);
    plate(1.2,1.62,1.0,.5,.86,.42,{ch:.22}); sidePlates(1.25,1.55,.98,.3,-.02);
    const bb=new THREE.Mesh(new THREE.PlaneGeometry(.56,.2),M.bay); add(bb,0,-.03,1.625); mount(0,0,-.03,1.64);   // launch bays: flanks and bow
    [-1,1].forEach(s=>pulseTurret(1,s*.25,.235,1.33));
    grille(1.625,.13,.5,.08);
    pdc(.4,.27,.9,1); pdc(-.4,.27,.9,1); pdc(-.3,.27,-.3,1); pdc(.53,.1,-.8,1,'x'); pdc(-.53,.1,-.8,-1,'x'); pdc(.46,.1,1.4,1,'x'); pdc(-.46,.1,1.4,-1,'x'); pdc(0,-.27,.4,-1); pdc(.3,-.27,-.4,-1); pdc(-.3,-.27,-.4,-1);
    number(idn,-.2,.27,.4,.12,'top'); number(idn,.52,.15,1.4,.08,'r'); number(idn,-.52,.15,1.4,.08,'l');
    light(.5,.2,-1.2,nav); light(-.5,.2,-1.2,nav); light(.38,.52,.2,0xff3030); rcs(.5,.25,1.5); rcs(-.5,.25,1.5);
  } else if(cls==='fastattack'){
    // a needle hull bolted to an oversized drive: nearly all engine, two missile pods, very little armor
    drum(.18,.34,-0.6);
    struts(-0.6,-0.44,.16,.12,0,0,6);
    plate(-0.44,0.22,.2,.17,.2,.17,{mat:H2}); topPlate(-0.36,0.18,.12,.12,.085,PL);
    plate(0.22,0.95,.2,.17,.03,.04,{ch:.42}); stripes(-0.3,0.7,.1,.045,.012); chevron(0.7,.07,.12);
    [-1,1].forEach(s=>{ plate(-0.3,0.42,.1,.11,.1,.09,{x:s*.17,y:-.02,mat:M.dark,ch:.25});   // missile pods, two tubes each
      [.026,-.026].forEach(dy=>{ const t=new THREE.Mesh(new THREE.CircleGeometry(.024,12),M.metal); add(t,s*.17,-.02+dy,.422); mount(0,s*.17,-.02+dy,.43); });
      const fin=plate(-0.55,-0.25,.012,.16,.012,.05,{x:s*.14,y:.12,mat:H2,ch:.2,greeble:false}); fin.rotation.z=s*0.5; });
    pdc(0,.1,-.15,1); pulseTurret(1,0,.1,.1,1,.8); windows(0,.09,.6,.14,3); number(idn,0,.087,-.05,.05,'top');
    light(.26,0,-.5,nav); light(-.26,0,-.5,nav); rcs(.12,.08,.5); rcs(-.12,.08,.5);
  } else if(cls==='dreadnought'){
    // the largest hull afloat: six drives, armored belts, a bridge tower, a spinal railgun running the length of
    // a thick armored prow, light railguns on its flanks and two heavy beam emitters
    [[-1,1],[0,1],[1,1],[-1,-1],[0,-1],[1,-1]].forEach(([sx,sy])=>drum(.17,.34,-1.95,sx*.34,sy*.2));
    struts(-1.95,-1.8,.5,.5,0,0,10);
    plate(-1.8,-1.1,1.2,.72,1.16,.7,{mat:H2}); sidePlates(-1.72,-1.2,1.2,.46);
    collar(-1.1,-1.02,.9,.6);
    plate(-1.02,0.9,1.1,.66,1.06,.62);
    [-1,1].forEach(s=>plate(-0.95,0.85,.12,.5,.12,.46,{x:s*.6,y:-.02,mat:PL,ch:.2}));   // armor belts
    topPlate(-0.95,0.85,.7,.66,.31,PL); stripes(-0.9,0.8,.325,.3,.02);
    plate(-0.8,0.1,.4,.3,.34,.24,{y:.46,ch:.28,mat:H2}); windows(0,.62,-.35,.5,7); dish(.2,.6,-.65,.12); dish(-.2,.6,-.2,.09);   // bridge tower
    plate(0.9,2.2,1.06,.62,.5,.34,{ch:.26}); sidePlates(1.0,2.0,1.0,.36,-.02); chevron(1.9,.2,.6); chevron(2.05,.16,.46);   // armored prow
    tube(.1,-0.6,2.45,0,.43,M.dark,20);   // spinal railgun
    for(let i=0;i<15;i++){ const c=new THREE.Mesh(new THREE.TorusGeometry(.105,.016,6,20),M.metal); add(c,0,.43,-0.5+i*.2); }
    { const mz=new THREE.Mesh(new THREE.CylinderGeometry(.085,.12,.12,20),M.metal); mz.rotation.x=Math.PI/2; add(mz,0,.43,2.5);
      const bore=new THREE.Mesh(new THREE.CircleGeometry(.045,16),new THREE.MeshBasicMaterial({color:0x7fd0ff})); add(bore,0,.43,2.562); mount(0,0,.43,2.57); }
    barrels([-.44,.44],.1,1.3,2.25,.018); mount(1,-.44,.1,2.26); mount(2,.44,.1,2.26);   // light railguns along the prow flanks
    [-1,1].forEach(s=>pulseTurret(5,s*.2,.326,.5));
    [-1,1].forEach(s=>{ plate(0.95,1.35,.2,.1,.18,.08,{x:s*.36,y:.36,mat:H2,ch:.3,greeble:false});   // heavy beam emitters
      tube(.045,1.3,1.62,s*.36,.42,M.metal,16); const lens=new THREE.Mesh(new THREE.CircleGeometry(.032,16),new THREE.MeshBasicMaterial({color:P?0xffb44a:0xff5a3a})); add(lens,s*.36,.42,1.625); mount(s<0?3:4,s*.36,.42,1.63); });
    [[.45,.33,-0.8],[-.45,.33,-0.8],[.45,.33,.6],[-.45,.33,.6],[.35,.2,1.5],[-.35,.2,1.5]].forEach(([x,y,z])=>pdc(x,y,z,1));
    [[.66,0,-0.3],[.66,0,.5],[.6,0,1.3]].forEach(([x,y,z])=>{ pdc(x,y,z,1,'x'); pdc(-x,y,z,-1,'x'); });
    pdc(0,-.33,-0.4,-1); pdc(0,-.33,.8,-1); pdc(0,-.2,1.7,-1);
    number(idn,0,.335,.3,.14,'top'); number(idn,.52,.05,1.35,.1,'r'); number(idn,-.52,.05,1.35,.1,'l');
    light(.6,.25,-1.7,nav); light(-.6,.25,-1.7,nav); light(0,.64,-.2,0xffffff); rcs(.4,.3,2.0); rcs(-.4,.3,2.0); rcs(.6,.3,-1.0); rcs(-.6,.3,-1.0);
  } else if(cls==='tender'){
    // a working yard ship: two drives, a boxy cargo spine lined with pods, gantry cranes over an open repair bay
    drum(.2,.3,-1.35,.26,0); drum(.2,.3,-1.35,-.26,0);
    struts(-1.35,-1.2,.3,.34,0,0,8);
    plate(-1.2,-0.7,.8,.5,.8,.5,{mat:H2}); sidePlates(-1.15,-0.75,.8,.34);
    plate(-0.7,0.9,.9,.44,.9,.44,{ch:.12});
    [-1,1].forEach(s=>{ for(let i=0;i<4;i++) tank(s*.52,.02,-0.5+i*.36,.12,.16,H2); });
    const bay=new THREE.Mesh(new THREE.PlaneGeometry(.6,.7),M.bay); bay.rotation.x=-Math.PI/2; add(bay,0,.226,.2);
    [-.1,.5].forEach(z=>{ [-1,1].forEach(s=>rod(new THREE.Vector3(s*.34,.22,z),new THREE.Vector3(s*.34,.54,z),.016,M.metal));
      rod(new THREE.Vector3(-.34,.54,z),new THREE.Vector3(.34,.54,z),.016,M.metal); rod(new THREE.Vector3(.1,.54,z),new THREE.Vector3(.1,.47,z),.005,M.dark);
      const hook=new THREE.Mesh(new THREE.BoxGeometry(.06,.05,.06),PL); add(hook,.1,.45,z); });
    plate(-0.6,-0.1,.3,.2,.26,.16,{y:.32,ch:.28,mat:H2}); windows(0,.42,-.35,.4,5); dish(.2,.42,-.6,.1);
    plate(0.9,1.45,.9,.44,.6,.32,{ch:.24}); sidePlates(0.95,1.35,.86,.26,-.02); grille(1.45,0,.44,.18);
    stripes(0.95,1.4,.225,.28,.02); chevron(1.3,.23,.5); [-1,1].forEach(s=>pulseTurret(0,s*.15,.2,1.06));
    pdc(.3,.24,-.9,1); pdc(-.3,.24,-.9,1); pdc(0,-.23,.3,-1); pdc(.46,0,1.1,1,'x'); pdc(-.46,0,1.1,-1,'x');
    number(idn,-.25,.225,-.45,.09,'top'); number(idn,.458,.05,1.15,.07,'r'); number(idn,-.458,.05,1.15,.07,'l');
    light(.42,.2,-1.1,nav); light(-.42,.2,-1.1,nav); light(0,.57,.2,0x7fff9f); rcs(.4,.2,1.3); rcs(-.4,.2,1.3);
  } else if(cls==='ewar'){
    // a slim sensor hull bristling with arrays: dishes, lattice masts with emitter bars, a long spike antenna forward
    drum(.17,.26,-1.05);
    struts(-1.05,-0.92,.15,.2,0,0,6);
    plate(-0.92,0.5,.34,.3,.34,.3,{ch:.2});
    plate(0.5,1.05,.34,.3,.1,.1,{ch:.35}); topPlate(-0.8,0.45,.2,.2,.15,PL); stripes(-0.8,0.45,.16,.12,.014);
    dish(0,.3,-.55,.16); dish(.16,.24,0.05,.11); dish(-.16,.24,0.3,.09);
    [-1,1].forEach(s=>{
      rod(new THREE.Vector3(s*.17,.1,-0.2),new THREE.Vector3(s*.45,.42,-0.2),.012,M.metal);
      rod(new THREE.Vector3(s*.45,.42,-0.2),new THREE.Vector3(s*.45,.42,0.25),.012,M.metal);
      for(let i=0;i<4;i++){ const b=new THREE.Mesh(new THREE.BoxGeometry(.03,.09,.03),M.dark); add(b,s*.45,.42,-0.15+i*.12); }
      const fin=plate(-0.8,-0.4,.012,.26,.012,.08,{x:s*.19,y:-.18,mat:H2,ch:.2,greeble:false}); fin.rotation.z=-s*0.35; });
    rod(new THREE.Vector3(0,.02,1.05),new THREE.Vector3(0,.02,1.55),.012,M.metal);
    pdc(0,-.15,.2,-1); emitter(0,0,-.12,.98,.42,.026);   // ventral beam emitter
    windows(0,.155,.65,.3,4); number(idn,0,.152,-.2,.06,'top');
    light(.2,0,-.85,nav); light(-.2,0,-.85,nav); light(0,.02,1.57,0xb88cff); light(0,.52,-.55,0xb88cff); rcs(.18,.1,.9); rcs(-.18,.1,.9);
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
  return {group:g, body, engines, lights, shieldMesh:shield, shMat, pickMesh, mats:M, fineMesh, mounts, turrets, turretRig:rig,
    turretGoal:new Float32Array(turrets.length), turretHold:new Float32Array(turrets.length)};
}

