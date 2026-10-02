// Laniakea's Edge: scenery beyond the board. A distant asteroid belt with a dust band, a midground layer of rocks,
// large foreground rocks around the rim, micro-debris drifting past the camera, a shattered dwarf planet as a
// landmark, two small moons for the gas giant, and a far nebula and galaxy near the horizon.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

/* ---------------- environment layers ----------------
   Scenery only: never picked, never casts or receives shadows, kept out of the AO pass, and built from its own
   fixed seed with mulberry32 so it never touches gameRand and the battlefield always looks the same.
   Everything sits well below or well beyond the board. The camera never goes below the board plane, so nothing
   here can clip into it, and nothing here can be mistaken for a gameplay asteroid: darker, flat-shaded, no dust haloes.
   Each layer is built once at its High count; quality presets only change how many instances are drawn. */
const ENV = {
  seed: 36001,
  // the belt plane: dropped below the board and tilted, so it sweeps under the battlefield from horizon to depth
  plane: { y:-200, tiltX:0.42, tiltZ:-0.14 },
  far: { rMin:650, rMax:1000, gap:[0.60,0.66], thick:30, size:[1.2,6.5], detail:2, variants:6, color:[0.34,0.36,0.40], spin:0.0012 },
  // the midground is a slab of scattered rock deep under the board, thinning toward the middle so the play area stays clean
  mid: { rMax:470, clear:90, top:-140, depth:420, size:[2,7], detail:4, variants:6, color:[0.40,0.41,0.44], spin:0.0022 },
  // distance haze: scenery fades toward the dark of the sky, so depth reads and nothing competes with the board
  haze: { near:120, far:900, max:0.72, color:[0.004,0.006,0.012] },
  dust: { rMin:620, rMax:1040, thick:44, size:1.6 },
  // angular structure shared by the belt: gaps where almost nothing is, clusters where rocks crowd
  gaps: [{a:1.15, w:0.20}, {a:4.05, w:0.14}],
  clusters: 18, clusterShare: 0.35,
  // large rocks in a loose ring well outside the board, level with its plane: silhouettes on the horizon in tilted
  // and close views. Anything below the plane on the far side projects onto the cells in a tilted view, so these sit
  // high enough to always land beyond the board's far edge on screen, and far enough out that the camera can't reach one.
  near: { seed:37001, rMin:230, rMax:340, yMin:-6, ySpan:24, size:[5,14], detail:12, variants:5, color:[0.46,0.45,0.44], spin:0.01,
          haze:{ near:80, far:400, max:0.68 } },
  // micro-debris: a box of specks that wraps around the camera, so there is always some near it wherever it goes.
  // The box scales with zoom (boxK × camera distance), so about the same number sits in view close in or far out.
  // Tiny and dim; only a few catch the sun, and they fade out near the lens and at the box edge so nothing pops.
  // the landmark: a dwarf planet broken open, on the far side of the sky from the gas giant, bleeding a trail of
  // fragments and dust down into the belt. Placed in the belt's frame at the azimuth given by `toward`, then lifted to
  // `elevation` degrees: the belt is low on that side, and anything much below the horizon lands behind the board
  // in tilted views, where it crowds the ships. At about the gas giant's height it sits past the board's far edge.
  landmark: { seed:38001, toward:[-0.5,0,0.8], elevation:-6, ringR:1090, radius:74, detail:30, color:[0.60,0.58,0.55],
    trail:{ start:0.1, span:0.46, sink:100, spread:[34,80], size:[0.9,5.5], detail:2, variants:5, color:[0.40,0.40,0.42] },
    // chunks: a loose spray thrown off the fracture, well separated. Big ones packed along the trail read as one
    // lumpy chain lying across the break (Jon, v38), so they stay small and scatter sideways as they fly out.
    chunks:7, chunkSize:[2.5,9], chunkStep:0.5, chunkSpread:0.5, haze:{ near:500, far:2200, max:0.32 } },
  // two small moons beside the gas giant: offsets in its screen plane (right, up) and toward the viewer, and radius
  moons: [ { seed:38101, right:-300, up:75, toward:60, radius:11, color:[0.64,0.65,0.68] },
           { seed:38102, right:245, up:-95, toward:-30, radius:6.5, color:[0.52,0.44,0.37] } ],
  // far nebula and galaxy: flat panels facing the board, each drawing its own shader, so they only cost the pixels
  // they cover. The camera never looks more than about 16° above the horizon, so both sit low. Directions are given
  // as azimuth (degrees, atan2 of z over x) and elevation, clear of the sun, the gas giant and the landmark.
  nebula: { az:30, el:3, dist:1650, width:1250, roll:0.2, gain:0.4, stars:90, seed:40001,
            steel:[0.32,0.46,0.60], rose:[0.62,0.44,0.46] },
  // el 2: at the usual tilt the top of the screen is only about 5° up, and at 7° nobody saw it (Jon, v40)
  galaxy: { az:172, el:2, dist:1650, width:330, tilt:0.5, gain:0.5, incline:2.4 },
  motes: { seed:37002, boxK:0.55, boxMin:6, boxMax:55, size:0.0014, drift:0.004, glint:0.03 },
};

const Env = (() => {
  const R = mulberry32(ENV.seed);
  const planeGroup = new THREE.Group();
  planeGroup.position.y = ENV.plane.y; planeGroup.rotation.set(ENV.plane.tiltX, 0, ENV.plane.tiltZ);
  scene.add(planeGroup);
  const farSpin = new THREE.Group(), midSpin = new THREE.Group();
  planeGroup.add(farSpin); scene.add(midSpin);

  const gapFade = a => { let k=1; for(const g of ENV.gaps){ let d=Math.abs(((a-g.a)%(Math.PI*2)+Math.PI*3)%(Math.PI*2)-Math.PI); k*=clamp(d/g.w,0,1)**2; } return k; };
  const density = a => (0.3 + 0.7*(0.5+0.5*Math.sin(3*a+1.3))**2) * gapFade(a);
  const clusterAt = [...Array(ENV.clusters)].map(()=>({a:R()*Math.PI*2, u:0.15+R()*0.7, s:0.03+R()*0.06}));
  // a point on the belt: angle, radial position (0 inner edge .. 1 outer edge) and height off the plane
  function beltPoint(L, gap){
    let a, u;
    if(R()<ENV.clusterShare){ const c=clusterAt[Math.floor(R()*clusterAt.length)]; a=c.a+(R()-0.5)*c.s*2; u=clamp(c.u+(R()-0.5)*c.s*3,0,1); }
    else { do { a=R()*Math.PI*2; } while(R()>density(a)); u=(R()+R()+R())/3; }
    if(gap && u>gap[0] && u<gap[1] && R()<0.9) u = u<(gap[0]+gap[1])/2 ? gap[0]-R()*0.04 : gap[1]+R()*0.04;
    const r=L.rMin+(L.rMax-L.rMin)*u, h=(R()+R()+R()-1.5)*L.thick*(0.6+0.8*(1-Math.abs(u-0.5)*2));
    return new THREE.Vector3(Math.cos(a)*r, h, Math.sin(a)*r);
  }
  function slabPoint(L){
    const a=R()*Math.PI*2, r=L.clear+(L.rMax-L.clear)*Math.pow(R(),0.6), y=L.top-L.depth*Math.pow(R(),0.8);
    return new THREE.Vector3(Math.cos(a)*r, y, Math.sin(a)*r);
  }

  function makeMat(c, flat=true, haze={}){
    const m=new THREE.MeshStandardMaterial({vertexColors:true, flatShading:flat, roughness:1, metalness:0, envMapIntensity:0.2, color:new THREE.Color(...c)}), H={...ENV.haze, ...haze};
    m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>',
      `gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(${H.color.join(',')}), smoothstep(${H.near.toFixed(1)}, ${H.far.toFixed(1)}, length(vViewPosition))*${H.max});\n#include <fog_fragment>`); };
    return m; }

  // a rock layer: one InstancedMesh per shape variant, filled at full count; the draw count is set per quality
  function rockLayer(L, parent, seedBase){
    const geos=[...Array(L.variants)].map((_,i)=>makeRockGeometry(seedBase+i*31, L.detail, false));
    const mat=makeMat(L.color), per=[], meshes=[];
    return {
      build(max){
        const n=Math.ceil(max/L.variants), m=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(), s=new THREE.Vector3(), col=new THREE.Color();
        geos.forEach((g,i)=>{
          const im=new THREE.InstancedMesh(g, mat, n);
          for(let k=0;k<n;k++){
            const p=L.depth?slabPoint(L):beltPoint(L, L.gap), size=L.size[0]*Math.pow(L.size[1]/L.size[0], Math.pow(R(),2.4));
            e.set(R()*6.3,R()*6.3,R()*6.3); q.setFromEuler(e); s.set(size*(0.8+R()*0.4), size*(0.8+R()*0.4), size*(0.8+R()*0.4));
            im.setMatrixAt(k, m.compose(p,q,s));
            const v=0.72+R()*0.4; im.setColorAt(k, col.setRGB(v, v*(0.97+R()*0.04), v*(0.95+R()*0.08)));
          }
          im.frustumCulled=false; im.userData.noAO=true; im.userData.noShadow=true; im.castShadow=im.receiveShadow=false;
          parent.add(im); meshes.push(im); per.push(n);
        });
      },
      setCount(total){ const n=Math.ceil(total/L.variants); meshes.forEach((im,i)=>im.count=Math.min(n,per[i])); },
    };
  }

  // the dust band: a haze of dim specks along the far belt, one draw call
  function dustLayer(max){
    const D=ENV.dust, pos=new Float32Array(max*3), col=new Float32Array(max*3);
    for(let i=0;i<max;i++){ const p=beltPoint({rMin:D.rMin, rMax:D.rMax, thick:D.thick}, null); pos.set([p.x,p.y,p.z], i*3);
      const b=0.09+Math.pow(R(),2)*0.2; col.set([b, b*0.93, b*0.84].map(toLinear), i*3); }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('color',new THREE.BufferAttribute(col,3));
    const pts=new THREE.Points(g, new THREE.PointsMaterial({size:D.size, sizeAttenuation:false, vertexColors:true, depthWrite:false}));
    pts.frustumCulled=false; pts.userData.noAO=true; farSpin.add(pts);
    return {setCount(n){ g.setDrawRange(0, Math.min(n,max)); }};
  }

  // large foreground rocks: separate meshes (a handful), each tumbling slowly on its own axis
  function nearLayer(){
    const L=ENV.near, Rn=mulberry32(L.seed), mat=makeMat(L.color, false, L.haze), group=new THREE.Group(), rocks=[];
    const geos=[...Array(L.variants)].map((_,i)=>makeRockGeometry(L.seed+i*37, L.detail, true));
    for(let i=0;i<QUALITY.high.env.near;i++){
      // golden-angle spacing, so any leading subset (what lower presets draw) is still spread all the way round
      const a=i*2.39996+Rn()*0.5, r=L.rMin+(L.rMax-L.rMin)*Rn(), size=L.size[0]+(L.size[1]-L.size[0])*Math.pow(Rn(),1.6);
      const m=new THREE.Mesh(geos[i%L.variants], mat);
      m.position.set(Math.cos(a)*r, Math.max(L.yMin+Rn()*L.ySpan, size*0.8-16), Math.sin(a)*r); m.scale.setScalar(size); m.rotation.set(Rn()*6.3,Rn()*6.3,Rn()*6.3);
      m.userData.spin=new THREE.Vector3(Rn()-0.5,Rn()-0.5,Rn()-0.5).multiplyScalar(L.spin); m.userData.noAO=true; m.userData.noShadow=true;
      group.add(m); rocks.push(m); }
    scene.add(group);
    return { setCount(n){ rocks.forEach((m,i)=>m.visible=i<n); },
      update(dt){ for(const m of rocks) if(m.visible){ const s=m.userData.spin; m.rotation.x+=s.x*dt; m.rotation.y+=s.y*dt; m.rotation.z+=s.z*dt; } } };
  }

  // micro-debris: positions live in a box that the vertex shader wraps around the camera
  function moteLayer(max){
    const M=ENV.motes, Rm=mulberry32(M.seed), pos=new Float32Array(max*3), seed=new Float32Array(max);
    for(let i=0;i<max;i++){ pos.set([Rm(), Rm(), Rm()], i*3); seed[i]=Rm(); }   // unit box, scaled in the shader
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('seed',new THREE.BufferAttribute(seed,1));
    const mat=new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
      uniforms:{ uCam:{value:camera.position}, uTime:{value:0}, uScale:{value:600}, uGain:{value:1}, uBox:{value:40} },
      vertexShader:`attribute float seed; uniform vec3 uCam; uniform float uTime; uniform float uScale; uniform float uGain; uniform float uBox; varying float vB;
        void main(){
          vec3 drift=vec3(sin(seed*40.0), cos(seed*23.0)*0.4, cos(seed*57.0))*${M.drift.toFixed(4)}*uTime;
          vec3 p=(fract(position+drift-uCam/uBox+0.5)-0.5)*uBox+uCam;
          vec4 mv=modelViewMatrix*vec4(p,1.0); float d=-mv.z;
          float fade=smoothstep(uBox*0.04,uBox*0.12,d)*(1.0-smoothstep(uBox*0.3,uBox*0.48,length(p-uCam)));
          // a few specks tumble into the sun and glint; the rest are barely there
          float glint=step(${(1-M.glint).toFixed(3)},seed)*pow(max(sin(uTime*(0.6+seed*2.0)+seed*90.0),0.0),8.0);
          vB=fade*uGain*(0.05+0.04*fract(seed*13.7)+glint*0.9);
          gl_PointSize=clamp(${M.size.toFixed(4)}*uBox*uScale/max(d,0.01), 1.0, 2.5);
          gl_Position=projectionMatrix*mv; }`,
      fragmentShader:`varying float vB; void main(){ vec2 c=gl_PointCoord-0.5; float a=smoothstep(0.5,0.1,length(c)); gl_FragColor=vec4(vec3(1.0,0.93,0.84)*vB*a,1.0); }` });
    const pts=new THREE.Points(g, mat); pts.frustumCulled=false; pts.userData.noAO=true; scene.add(pts);
    return { mat, setCount(n){ g.setDrawRange(0, Math.min(n,max)); },
      update(dt){ const u=mat.uniforms; u.uTime.value+=dt; u.uScale.value=Particles.mat.uniforms.uScale.value; u.uBox.value=clamp(cam.radius*M.boxK, M.boxMin, M.boxMax); } };
  }

  // a round body with relief and craters; with a shatter normal, everything beyond the cut plane is pushed back
  // into a scooped, jagged fracture face in lighter exposed rock. Built with +z as the shatter direction.
  function bodyGeometry(seed, detail, shatter){
    const Rb=mulberry32(seed), N=RockNoise, g=icoSphere(detail), pos=g.attributes.position, col=new Float32Array(pos.count*3), v=new THREE.Vector3();
    const rdir=()=>new THREE.Vector3(Rb()*2-1,Rb()*2-1,Rb()*2-1).normalize();
    const craters=[...Array(28)].map(()=>({c:rdir(), r:0.04+Math.pow(Rb(),2)*0.3, d:0.015+Rb()*0.035}));
    const cuts=shatter?[{n:new THREE.Vector3(0,0,1), o:0.4, scoop:0.3}, {n:new THREE.Vector3(0.62,0.35,0.7).normalize(), o:0.72, scoop:0.1}]:[];
    for(let i=0;i<pos.count;i++){
      v.fromBufferAttribute(pos,i).normalize(); const u=v.clone();
      let h=1+N.fbm(u.x*2,u.y*2,u.z*2,seed,4)*0.05+N.ridged(u.x*5,u.y*5,u.z*5,seed+3,3)*0.02, cr=0;
      for(const c of craters){ const a=Math.acos(clamp(u.dot(c.c),-1,1))/c.r; if(a<1){ const b=1-a*a; h-=c.d*b; cr=Math.max(cr,b); } else h+=c.d*0.35*Math.exp(-Math.pow((a-1)/0.2,2)); }
      v.multiplyScalar(h);
      let face=0;
      for(const c of cuts){ const d=v.dot(c.n); if(d>c.o){ const off=v.clone().addScaledVector(c.n,-d), rr=Math.min(1,off.length());
          const jag=N.ridged(u.x*7,u.y*7,u.z*7,seed+9,4)*0.09+N.fbm(u.x*16,u.y*16,u.z*16,seed+11,3)*0.03;
          v.addScaledVector(c.n, -(d-c.o) - c.scoop*(1-rr*rr) + jag); face=Math.max(face, clamp((d-c.o)*6,0,1)); } }
      pos.setXYZ(i,v.x,v.y,v.z);
      const maria=clamp((N.fbm(u.x*1.4,u.y*1.4,u.z*1.4,seed+7,4)-0.02)*5,0,1);   // broad dark plains, for contrast at a distance
      let shade=0.46+N.fbm(u.x*3,u.y*3,u.z*3,seed+5,4)*0.14-maria*0.13-cr*0.07+(Rb()-0.5)*0.02;
      // the fracture face: paler, warmer rock with dark seams, so the break reads from across the sky
      const seam=Math.max(0,N.ridged(u.x*9,u.y*9,u.z*9,seed+13,3)-0.55);
      const fr=[0.58-seam*0.5, 0.52-seam*0.5, 0.44-seam*0.45];
      col[i*3]=toLinear(shade+(fr[0]-shade)*face); col[i*3+1]=toLinear(shade*0.97+(fr[1]-shade*0.97)*face); col[i*3+2]=toLinear(shade*0.93+(fr[2]-shade*0.93)*face);
    }
    g.setAttribute('color',new THREE.BufferAttribute(col,3)); g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  }

  // the shattered dwarf planet, its broken-off chunks, and the fragment trail it sheds into the belt
  function landmarkLayer(maxRocks, maxDust){
    const L=ENV.landmark, T=L.trail, Rl=mulberry32(L.seed), group=new THREE.Group(); planeGroup.add(group);
    // pick the angle on the belt ring whose world direction best matches the chosen side of the sky
    planeGroup.updateMatrixWorld(true);
    const want=new THREE.Vector3(...L.toward).setY(0).normalize(), w=new THREE.Vector3(); let aL=0, best=-2;
    for(let a=0;a<Math.PI*2;a+=0.005){ w.set(Math.cos(a)*L.ringR, 0, Math.sin(a)*L.ringR); planeGroup.localToWorld(w); const d=w.setY(0).normalize().dot(want); if(d>best){ best=d; aL=a; } }
    // then find the height off the belt plane that puts it at the chosen elevation
    let lift=0; for(let i=0;i<30;i++){ w.set(Math.cos(aL)*L.ringR, lift, Math.sin(aL)*L.ringR); planeGroup.localToWorld(w);
      const el=Math.atan2(w.y, Math.hypot(w.x,w.z))*180/Math.PI; lift+=(L.elevation-el)*Math.PI/180*L.ringR*0.9; }
    const dir = Math.sin(aL+0.3)>0 ? 1 : -1;   // which way along the ring the trail runs
    const trailPoint=(t, spread)=>{ const a=aL+dir*(T.start+T.span*t), r=L.ringR-T.sink*t;
      const s=(T.spread[0]+(T.spread[1]-T.spread[0])*t)*spread;
      return new THREE.Vector3(Math.cos(a)*r+(Rl()+Rl()-1)*s, lift*(1-t)*(1-t*0.3)+(Rl()+Rl()-1)*s*0.45, Math.sin(a)*r+(Rl()+Rl()-1)*s); };
    const center=new THREE.Vector3(Math.cos(aL)*L.ringR, lift, Math.sin(aL)*L.ringR);
    // the body. Its fracture sits on the limb across the sunlit side (so the round, lit surface still reads as a world),
    // on the side the trail leaves from, tipped toward the board and a little into the sun so the break face is lit
    const body=new THREE.Mesh(bodyGeometry(L.seed, L.detail, true), makeMat(L.color, false, L.haze));
    body.scale.setScalar(L.radius); body.position.copy(center); group.add(body);
    planeGroup.updateMatrixWorld(true);
    const cw=planeGroup.localToWorld(center.clone()), tw=planeGroup.localToWorld(center.clone().add(new THREE.Vector3(-Math.sin(aL)*dir, 0, Math.cos(aL)*dir))).sub(cw);
    const toView=cw.clone().negate().normalize(), sunSide=sunDir.clone().addScaledVector(toView,-sunDir.dot(toView)).normalize();
    const across=new THREE.Vector3().crossVectors(toView, sunSide); if(across.dot(tw)<0) across.negate();
    body.lookAt(cw.clone().add(across.multiplyScalar(0.85).addScaledVector(toView,0.4).addScaledVector(sunSide,0.25)));
    // broken-off chunks, flung out of the fracture along its normal and fanning sideways, bending toward the trail
    const chunkMat=makeMat(L.color, false, L.haze), chunks=[], out=new THREE.Vector3(0,0,1).applyQuaternion(body.quaternion);
    const side1=new THREE.Vector3().crossVectors(out, new THREE.Vector3(0,1,0)).normalize(), side2=new THREE.Vector3().crossVectors(out, side1);
    for(let i=0;i<L.chunks;i++){ const m=new THREE.Mesh(makeRockGeometry(L.seed+50+i*7, 8, true), chunkMat), k=(i+1)/L.chunks;
      const a=Rl()*Math.PI*2, lat=L.radius*L.chunkSpread*(0.3+k)*(0.5+Rl()*0.5);
      const p=center.clone().addScaledVector(out, L.radius*(1.25+i*L.chunkStep+Rl()*0.25)).addScaledVector(side1, Math.cos(a)*lat).addScaledVector(side2, Math.sin(a)*lat);
      m.position.copy(p.lerp(trailPoint(0.05+k*0.12, 0.6), k*0.45));
      m.scale.setScalar(L.chunkSize[0]+(L.chunkSize[1]-L.chunkSize[0])*Math.pow(Rl(),1.5));
      m.rotation.set(Rl()*6.3,Rl()*6.3,Rl()*6.3); m.userData.spin=new THREE.Vector3(Rl()-0.5,Rl()-0.5,Rl()-0.5).multiplyScalar(0.006); group.add(m); chunks.push(m); }
    // the fragment trail: instanced rock thinning out along the ring into the belt
    const geos=[...Array(T.variants)].map((_,i)=>makeRockGeometry(L.seed+200+i*13, T.detail, false)), mat=makeMat(T.color), per=Math.ceil(maxRocks/T.variants), ims=[];
    const M4=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(), s=new THREE.Vector3();
    geos.forEach(gm=>{ const im=new THREE.InstancedMesh(gm, mat, per);
      for(let k=0;k<per;k++){ const t=Math.pow(Rl(),1.15), size=T.size[0]+(T.size[1]-T.size[0])*Math.pow(Rl(),2.5)*(1-t*0.6);
        e.set(Rl()*6.3,Rl()*6.3,Rl()*6.3); q.setFromEuler(e); s.set(size*(0.8+Rl()*0.4),size*(0.8+Rl()*0.4),size*(0.8+Rl()*0.4));
        im.setMatrixAt(k, M4.compose(trailPoint(t,1),q,s)); }
      im.frustumCulled=false; group.add(im); ims.push(im); });
    // and a dust plume along the same path, one draw call
    const dp=new Float32Array(maxDust*3), dc=new Float32Array(maxDust*3);
    for(let i=0;i<maxDust;i++){ const t=Math.pow(Rl(),1.3), p=trailPoint(t,1.6);
      // one in five specks hangs just off the fracture, so the break visibly feeds the spray
      if(i%5===0){ const a=Rl()*Math.PI*2, lat=L.radius*0.55*Math.sqrt(Rl()); p.copy(center).addScaledVector(out, L.radius*(0.95+Rl()*0.9)).addScaledVector(side1, Math.cos(a)*lat).addScaledVector(side2, Math.sin(a)*lat); }
      dp.set([p.x,p.y,p.z],i*3);
      const b=(0.1+Math.pow(Rl(),2)*0.22)*(1-t*0.5); dc.set([b,b*0.9,b*0.8].map(toLinear),i*3); }
    const dg=new THREE.BufferGeometry(); dg.setAttribute('position',new THREE.BufferAttribute(dp,3)); dg.setAttribute('color',new THREE.BufferAttribute(dc,3));
    const dust=new THREE.Points(dg, new THREE.PointsMaterial({size:1.6, sizeAttenuation:false, vertexColors:true, depthWrite:false})); dust.frustumCulled=false; group.add(dust);
    group.traverse(o=>{ o.userData.noAO=true; o.userData.noShadow=true; });
    return { setCount(n, nd){ ims.forEach(im=>im.count=Math.min(per, Math.ceil(n/T.variants))); dg.setDrawRange(0, Math.min(nd,maxDust)); },
      update(dt){ body.rotateZ(dt*0.0015); for(const m of chunks){ const sp=m.userData.spin; m.rotation.x+=sp.x*dt; m.rotation.y+=sp.y*dt; m.rotation.z+=sp.z*dt; } } };
  }

  // the gas giant's moons: small cratered spheres placed around it as seen from the board
  function moonLayer(){
    const P=window.__planet; if(!P) return;
    const view=P.position.clone().normalize(), right=new THREE.Vector3().crossVectors(view, new THREE.Vector3(0,1,0)).normalize(), up=new THREE.Vector3().crossVectors(right, view);
    for(const m of ENV.moons){
      const mesh=new THREE.Mesh(bodyGeometry(m.seed, 12, false), new THREE.MeshStandardMaterial({vertexColors:true, roughness:1, metalness:0, envMapIntensity:0.15, color:new THREE.Color(...m.color)}));
      mesh.position.copy(P.position).addScaledVector(right,m.right).addScaledVector(up,m.up).addScaledVector(view,-m.toward);
      mesh.scale.setScalar(m.radius); mesh.rotation.set(m.seed%7, m.seed%5, 0); mesh.userData.noAO=true; mesh.userData.noShadow=true; scene.add(mesh); }
  }

  const skyDir=(az,el)=>{ const a=az*Math.PI/180, e=el*Math.PI/180; return new THREE.Vector3(Math.cos(e)*Math.cos(a), Math.sin(e), Math.cos(e)*Math.sin(a)); };
  const NOISE2=`float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*n2(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return v; }`;
  const PANEL_VS=`varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  function skyPanel(C, mat){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(C.width, C.width), mat);
    m.position.copy(skyDir(C.az, C.el).multiplyScalar(C.dist)); m.lookAt(0,0,0); m.rotateZ(C.roll||0);
    m.frustumCulled=true; m.userData.noAO=true; m.userData.noShadow=true; m.renderOrder=-1; scene.add(m); m.updateMatrixWorld(true); return m;
  }

  // the nebula: domain-warped gas, steel-blue at the core fading to dusty rose at the edges, with dark dust lanes
  // that dim the stars behind them (premultiplied blending: the colour adds, the alpha dims)
  function nebulaLayer(){
    const C=ENV.nebula, s=C.steel.join(','), r=C.rose.join(',');
    const mat=new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.CustomBlending,
      blendSrc:THREE.OneFactor, blendDst:THREE.OneMinusSrcAlphaFactor, uniforms:{ uGain:{value:C.gain} }, vertexShader:PANEL_VS,
      fragmentShader:`varying vec2 vP; uniform float uGain; ${NOISE2}
        void main(){ vec2 p=vP;
          vec2 q=vec2(fbm(p*2.2+3.1), fbm(p*2.2+7.7));
          float n=fbm(p*2.6+q*1.6);
          float r=length(p*vec2(0.85,1.75))+(q.x-0.5)*0.6;      // wider than tall, with a ragged edge
          float env=smoothstep(1.05,0.2,r)*smoothstep(1.0,0.7,max(abs(p.x),abs(p.y))), core=clamp(smoothstep(0.9,0.1,r)+(n-0.5)*1.2,0.0,1.0);   // noise breaks up the colour boundary
          float gas=(smoothstep(0.28,0.78,n)*0.8+0.2)*env*mix(env,1.0,0.4);
          vec3 tint=pow(mix(vec3(${r}), vec3(${s}), core), vec3(2.2));   // gamma on the colour only; the gas falls off linearly
          float lanes=smoothstep(0.5,0.62,fbm(p*4.2+q*2.6+11.0))*env;
          gl_FragColor=vec4(tint*gas*(1.0-lanes*0.65)*uGain, lanes*0.4*env); }` });
    const panel=skyPanel(C, mat);
    // a scatter of brighter young stars inside the cloud, drawn just in front of it
    const Rs=mulberry32(C.seed), pos=new Float32Array(C.stars*3), col=new Float32Array(C.stars*3), v=new THREE.Vector3();
    for(let i=0;i<C.stars;i++){ const g=()=>(Rs()+Rs()+Rs()-1.5)/1.5;
      v.set(g()*C.width*0.32, g()*C.width*0.19, 20); panel.localToWorld(v); pos.set([v.x,v.y,v.z],i*3);
      const b=0.35+Math.pow(Rs(),2)*0.6; col.set([b*0.86,b*0.93,b].map(toLinear),i*3); }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('color',new THREE.BufferAttribute(col,3));
    const pts=new THREE.Points(g, new THREE.PointsMaterial({size:1.8, sizeAttenuation:false, vertexColors:true, depthWrite:false})); pts.userData.noAO=true; scene.add(pts);
    return mat;
  }

  // the galaxy: a small inclined disc with a warm core and faint bluish spiral arms, far beyond everything else
  function galaxyLayer(){
    const C=ENV.galaxy;
    const mat=new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, uniforms:{ uGain:{value:C.gain} }, vertexShader:PANEL_VS,
      fragmentShader:`varying vec2 vP; uniform float uGain;
        void main(){ vec2 d=vec2(vP.x, vP.y*${C.incline.toFixed(2)}); float r=length(d), th=atan(d.y,d.x);
          float arms=0.5+0.5*sin(2.0*th-log(r+0.02)*5.0);
          float disk=exp(-r*4.5)*(0.35+0.65*arms*smoothstep(0.05,0.25,r));
          float core=exp(-r*r*140.0);
          vec3 col=(vec3(0.72,0.78,0.95)*disk*0.95+vec3(1.0,0.9,0.72)*core)*smoothstep(1.0,0.7,length(vP));
          gl_FragColor=vec4(pow(col,vec3(2.2))*uGain,1.0); }` });
    skyPanel({...C, roll:C.tilt}, mat);
    return mat;
  }

  const top = QUALITY.high.env;
  const far = rockLayer(ENV.far, farSpin, 7001); far.build(top.far);
  const mid = rockLayer(ENV.mid, midSpin, 8001); mid.build(top.mid);
  const dust = dustLayer(top.dust);
  const near = nearLayer();
  const motes = moteLayer(top.motes);
  const landmark = landmarkLayer(top.lmRocks, top.lmDust);
  moonLayer();
  const nebula = nebulaLayer(), galaxy = galaxyLayer();

  return {
    group: planeGroup, motes, nebula, galaxy,
    setQuality(q){ const c=QUALITY[q].env; far.setCount(c.far); mid.setCount(c.mid); dust.setCount(c.dust); near.setCount(c.near); motes.setCount(c.motes); landmark.setCount(c.lmRocks, c.lmDust); },
    update(dt){ farSpin.rotation.y+=dt*ENV.far.spin; midSpin.rotation.y+=dt*ENV.mid.spin; near.update(dt); motes.update(dt); landmark.update(dt); },
  };
})();
Env.setQuality(quality);
