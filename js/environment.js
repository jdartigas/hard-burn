// Hard Burn: scenery beyond the board. A distant asteroid belt with a dust band, a midground layer of rocks,
// large foreground rocks around the rim, and micro-debris drifting past the camera.
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

  const top = QUALITY.high.env;
  const far = rockLayer(ENV.far, farSpin, 7001); far.build(top.far);
  const mid = rockLayer(ENV.mid, midSpin, 8001); mid.build(top.mid);
  const dust = dustLayer(top.dust);
  const near = nearLayer();
  const motes = moteLayer(top.motes);

  return {
    group: planeGroup, motes,
    setQuality(q){ const c=QUALITY[q].env; far.setCount(c.far); mid.setCount(c.mid); dust.setCount(c.dust); near.setCount(c.near); motes.setCount(c.motes); },
    update(dt){ farSpin.rotation.y+=dt*ENV.far.spin; midSpin.rotation.y+=dt*ENV.mid.spin; near.update(dt); motes.update(dt); },
  };
})();
Env.setQuality(quality);
