// Hard Burn: renderer, post-processing, quality presets, procedural textures, environment, particles, timing.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

/* ---------------- renderer & scene ---------------- */
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({canvas, antialias:false, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.3;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth/innerHeight, 0.1, 4000);
// HDR pipeline: MSAA half-float scene -> ambient occlusion -> bloom -> tone map + sRGB
// The scene renders into its own multisampled target and is resolved once into the composer's plain targets.
// Effects never draw onto a multisampled buffer: GPUs may discard that memory after each resolve, which showed up as black rectangles.
class MSAARenderPass extends THREE.Pass {
  constructor(scene, camera){ super(); this.scene=scene; this.camera=camera; this.needsSwap=false; this.samples=0;
    this.rt=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType}); this.rt.resolveDepthBuffer=false;
    this.quad=new THREE.FullScreenQuad(new THREE.ShaderMaterial({uniforms:THREE.UniformsUtils.clone(THREE.CopyShader.uniforms), vertexShader:THREE.CopyShader.vertexShader, fragmentShader:THREE.CopyShader.fragmentShader, blending:THREE.NoBlending, depthTest:false, depthWrite:false})); }
  setSamples(n){ if(n!==this.samples){ this.samples=n; this.rt.dispose(); this.rt.samples=n; this.rt.resolveDepthBuffer=false; } }
  setSize(w,h){ this.rt.setSize(w,h); }
  render(renderer, writeBuffer, readBuffer){
    const direct=this.samples===0;
    renderer.setRenderTarget(direct? readBuffer : this.rt); renderer.clear(); renderer.render(this.scene, this.camera);
    if(!direct){ this.quad.material.uniforms.tDiffuse.value=this.rt.texture; renderer.setRenderTarget(readBuffer); this.quad.render(renderer); }
  }
}
const composer = new THREE.EffectComposer(renderer);
const scenePass = new MSAARenderPass(scene, camera);
composer.addPass(scenePass);
const gtao = new THREE.GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.output = THREE.GTAOPass.OUTPUT.Default; gtao.blendIntensity = 0.72;
gtao.updatePdMaterial({lumaPhi:10, depthPhi:2, normalPhi:3, radius:6, rings:2, samples:16});
gtao.overrideVisibility = function(){ const cache=this._visibilityCache; this.scene.traverse(o=>{ cache.set(o,o.visible);
  const m=o.material; if(o.isPoints||o.isLine||o.isSprite||o.userData.noAO||(m && !Array.isArray(m) && (m.transparent||m.isShaderMaterial))) o.visible=false; }); };
composer.addPass(gtao);
const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.42, 0.38, 1.0);
composer.addPass(bloom);
composer.addPass(new THREE.OutputPass());
// edge smoothing as a final image pass: multisampled buffers render with black gaps on Apple Metal and some Windows drivers
const smaa = new THREE.SMAAPass(innerWidth, innerHeight);
composer.addPass(smaa);

scene.add(new THREE.AmbientLight(0x3a4a5c, 0.55));
const sunDir = new THREE.Vector3(-0.62, 0.55, -0.56).normalize();
const sun = new THREE.DirectionalLight(0xfff0dc, 6.5); sun.position.copy(sunDir).multiplyScalar(100); scene.add(sun); scene.add(sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(4096,4096); sun.shadow.bias = -0.0004;
const fill = new THREE.DirectionalLight(0x4a6aa8, 0.8); fill.position.set(60,-20,80); scene.add(fill);
// shadow frustum follows the camera and tightens as you zoom in, snapped to texels so edges don't crawl
const SH_X = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), sunDir).normalize(), SH_Y = new THREE.Vector3().crossVectors(sunDir, SH_X), SH_C = new THREE.Vector3();
function updateShadowFrustum(){
  if(!sun.castShadow) return;
  const raw=clamp(cam.radius*0.85, 4, 80), ext=Math.pow(2, Math.ceil(Math.log2(raw)*4)/4), texel=2*ext/sun.shadow.mapSize.x, t=cam.target;
  SH_C.copy(SH_X).multiplyScalar(Math.round(t.dot(SH_X)/texel)*texel).addScaledVector(SH_Y, Math.round(t.dot(SH_Y)/texel)*texel).addScaledVector(sunDir, t.dot(sunDir));
  sun.target.position.copy(SH_C); sun.position.copy(SH_C).addScaledVector(sunDir,120); sun.target.updateMatrixWorld();
  const sc=sun.shadow.camera; if(sc.right!==ext){ sc.left=-ext; sc.right=ext; sc.top=ext; sc.bottom=-ext; sc.near=1; sc.far=260; sc.updateProjectionMatrix(); sun.shadow.normalBias=texel*1.2; }
}
function enableShadows(obj, cast=true, receive=true){ obj.traverse(o=>{ if(o.isMesh && !o.userData.noShadow){ const m=o.material; if(m && (m.transparent || m.isMeshBasicMaterial || m.isShaderMaterial)) return; o.castShadow=cast; o.receiveShadow=receive; } }); }
// graphics quality presets
// env: how many scenery instances each layer draws (js/environment.js); the layers are built once at the High count
const QUALITY = { high:{label:'High', pr:2, shadow:4096, ao:true, aa:true, env:{far:1800, mid:240, dust:16000, near:16, motes:12000, lmRocks:400, lmDust:4000}},
  medium:{label:'Medium', pr:1, shadow:2048, ao:false, aa:true, env:{far:1100, mid:150, dust:10000, near:12, motes:8000, lmRocks:250, lmDust:2500}},
  low:{label:'Low', pr:1, shadow:0, ao:false, aa:false, env:{far:500, mid:70, dust:5000, near:8, motes:4000, lmRocks:120, lmDust:1200}} };
// diagnostics: ?debug shows GPU info and errors; ?shadows=0 ?aa=0 ?ao=0 ?pr=1 switch single features off to isolate driver problems
const URLQ = new URLSearchParams(location.search);
const DEBUG = URLQ.has('debug');
if(DEBUG) renderer.info.autoReset=false;   // count draws across every pass of a frame, reset in frame()
let quality = store.get('gfx', (window.matchMedia && matchMedia('(pointer:coarse)').matches) || innerWidth<900 ? 'medium' : 'high');
if(!QUALITY[quality]) quality='high';

/* ---------------- procedural textures ---------------- */
function canvasTex(w,h,draw,srgb=true){ const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h); const t=new THREE.CanvasTexture(c); t.anisotropy=MAX_ANISO; if(srgb) t.colorSpace=THREE.SRGBColorSpace; return t; }
const toLinear = v => Math.pow(v, 2.2);
function panelTexture(seed){
  const R=mulberry32(seed);
  const map = canvasTex(512,512,(g,w,h)=>{
    g.fillStyle='#7d858c'; g.fillRect(0,0,w,h);
    for(let i=0;i<260;i++){ const x=Math.floor(R()*16)*32, y=Math.floor(R()*16)*32, pw=32*(1+Math.floor(R()*4)), ph=32*(1+Math.floor(R()*3));
      const v=110+Math.floor(R()*50); g.fillStyle=`rgb(${v},${v+4},${v+9})`; g.fillRect(x+1,y+1,pw-2,ph-2); }
    g.strokeStyle='rgba(20,24,28,.55)'; g.lineWidth=2;
    for(let i=0;i<120;i++){ const x=Math.floor(R()*16)*32, y=Math.floor(R()*16)*32; g.strokeRect(x,y,32*(1+Math.floor(R()*5)),32*(1+Math.floor(R()*3))); }
    g.fillStyle='rgba(30,34,38,.8)'; for(let i=0;i<400;i++) g.fillRect(R()*w,R()*h,2,2);
    g.fillStyle='rgba(0,0,0,.25)'; for(let i=0;i<30;i++) g.fillRect(R()*w,R()*h,R()*120,3);
  });
  const emis = canvasTex(512,512,(g,w,h)=>{
    g.fillStyle='#000'; g.fillRect(0,0,w,h);
    for(let i=0;i<70;i++){ const x=R()*w, y=R()*h, n=1+Math.floor(R()*6); g.fillStyle= R()<.85?'rgba(255,220,170,.9)':'rgba(140,210,255,.9)'; for(let k=0;k<n;k++) g.fillRect(x+k*6,y,3,2); }
  });
  return {map, emis};
}
const glowTex = canvasTex(128,128,(g,w,h)=>{ const gr=g.createRadialGradient(64,64,0,64,64,64); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.25,'rgba(255,255,255,.55)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,w,h); }, false);

/* ---------------- environment ---------------- */
(function buildEnvironment(){
  // nebula backdrop
  const neb = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), new THREE.ShaderMaterial({
    side:THREE.BackSide, depthWrite:false,
    uniforms:{ uSun:{value:sunDir}, uGain:{value:1}, uFill:{value:0} },
    vertexShader:`varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`varying vec3 vDir; uniform vec3 uSun; uniform float uGain; uniform float uFill;
      float h(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
      float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float fbm(vec3 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*n3(p); p*=2.03; a*=0.5; } return v; }
      void main(){ vec3 d=normalize(vDir);
        float n=fbm(d*2.6+vec3(3.1,1.7,0.4)); float m=fbm(d*5.0+n*1.8);
        float band=smoothstep(0.45,0.0,abs(d.y+0.15*sin(d.x*3.0)));
        vec3 col=vec3(0.006,0.01,0.022);
        col+=vec3(0.03,0.07,0.11)*pow(m,2.2)*band*1.4;
        col+=vec3(0.10,0.045,0.03)*pow(n,3.0)*band*1.2;
        float s=max(dot(d,uSun),0.0); col+=vec3(0.5,0.32,0.18)*pow(s,24.0)*0.35 + vec3(0.2,0.14,0.1)*pow(s,4.0)*0.12;
        vec3 lin=pow(max(col,vec3(0.0)),vec3(2.2))*uGain; float k=dot(d,uSun)*0.5+0.5;
        lin+=uFill*mix(vec3(0.030,0.042,0.060), vec3(0.085,0.068,0.050), k*k) * (0.75+0.25*smoothstep(-0.6,0.6,d.y));
        gl_FragColor=vec4(lin,1.0); }`
  }));
  neb.userData.noAO=true; scene.add(neb);
  // stars, in two tiers from a fixed seed: a faint field that crowds along the nebula's band, and a sparse bright
  // layer. Tints are subtle: mostly neutral, some warm, some cool.
  const SR=mulberry32(5150), TINTS=[[1,0.97,0.93],[1,0.86,0.70],[0.78,0.87,1]];
  const band=v=>Math.max(0, 1-Math.abs(v.y+0.15*Math.sin(v.x*3))/0.45);   // the same band the nebula shader draws
  function starTier(n, size, bright, bandBias){
    const pos=new Float32Array(n*3), col=new Float32Array(n*3), v=new THREE.Vector3();
    for(let i=0;i<n;i++){
      do { v.set(SR()*2-1,SR()*2-1,SR()*2-1); } while(v.lengthSq()>1 || v.lengthSq()<1e-4 || SR()>1-bandBias+bandBias*band(v.normalize()));
      v.normalize().multiplyScalar(1500); pos.set([v.x,v.y,v.z],i*3);
      const b=bright[0]+(bright[1]-bright[0])*Math.pow(SR(),2.2), r=SR(), t=TINTS[r<0.62?0:r<0.8?1:2];
      col.set([b*t[0],b*t[1],b*t[2]].map(toLinear), i*3); }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('color',new THREE.BufferAttribute(col,3));
    const pts=new THREE.Points(g, new THREE.PointsMaterial({size, sizeAttenuation:false, vertexColors:true, depthWrite:false})); pts.userData.noAO=true; scene.add(pts);
  }
  starTier(7000, 1.3, [0.08,0.5], 0.6);
  starTier(420, 2.2, [0.45,1.0], 0.25);
  starTier(28, 3.2, [0.85,1.0], 0);
  // sun glow
  const sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex, color:0xffd9a8, blending:THREE.AdditiveBlending, depthWrite:false, transparent:true}));
  sunSpr.position.copy(sunDir).multiplyScalar(1400); sunSpr.scale.setScalar(260); scene.add(sunSpr);
  // gas giant
  const ptex = canvasTex(1024,512,(g,w,h)=>{ const R=mulberry32(7);
    for(let y=0;y<h;y++){ const t=y/h; const b=Math.sin(t*38+Math.sin(t*9)*2)*0.5+0.5, c=Math.sin(t*13)*0.5+0.5;
      const r=Math.floor(120+70*b-30*c), gg=Math.floor(88+50*b-20*c), bb=Math.floor(62+30*b); g.fillStyle=`rgb(${r},${gg},${bb})`; g.fillRect(0,y,w,1); }
    for(let i=0;i<500;i++){ g.fillStyle=`rgba(${R()<.5?255:60},${R()<.5?220:40},${150},${R()*0.07})`; const y=R()*h; g.fillRect(0,y,w,R()*6); }
    g.fillStyle='rgba(170,80,50,.5)'; g.beginPath(); g.ellipse(640,300,46,22,0,0,Math.PI*2); g.fill(); });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(140,64,32), new THREE.MeshStandardMaterial({map:ptex, color:0x6a6560, roughness:1, metalness:0}));
  planet.position.set(620,-230,-1100); planet.rotation.z=0.35; scene.add(planet);
  const atm = new THREE.Mesh(new THREE.SphereGeometry(146,64,32), new THREE.ShaderMaterial({ transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.BackSide,
    uniforms:{uSun:{value:sunDir}},
    vertexShader:`varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader:`varying vec3 vN; varying vec3 vW; uniform vec3 uSun; void main(){ vec3 v=normalize(cameraPosition-vW); float f=pow(max(1.0-abs(dot(vN,v)),0.0),3.0);   /* max(): interpolated normals can push |dot| past 1, and pow of a negative is NaN */ float l=clamp(dot(-vN,uSun)*0.5+0.6,0.0,1.0); gl_FragColor=vec4(pow(vec3(1.0,0.65,0.4)*f*l*0.9,vec3(2.2))*1.6,1.0); }`}));
  atm.position.copy(planet.position); scene.add(atm);
  planet.userData.spin = true; window.__planet = planet; planet.userData.noAO = true;
  // image-based lighting: bake the sky, sun and planet into a prefiltered environment map so metal reflects the scene
  const es=new THREE.Scene();
  const nebEnv=new THREE.Mesh(neb.geometry, neb.material.clone()); nebEnv.material.uniforms.uGain.value=5; nebEnv.material.uniforms.uFill.value=1; es.add(nebEnv);
  const sunBall=new THREE.Mesh(new THREE.SphereGeometry(55,24,12), new THREE.MeshBasicMaterial({color:new THREE.Color(1,0.86,0.68).multiplyScalar(40)})); sunBall.position.copy(sunDir).multiplyScalar(1400); es.add(sunBall);
  const pEnv=new THREE.Mesh(planet.geometry, new THREE.MeshBasicMaterial({map:ptex, color:0x6a5a4c})); pEnv.position.copy(planet.position); es.add(pEnv);
  const pmrem=new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(es, 0.02, 1, 3000).texture; scene.environmentIntensity = 2.2;
  pmrem.dispose();
})();

/* ---------------- particles ---------------- */
const Particles = (() => {
  const MAX=6000;
  const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(MAX*3), col=new Float32Array(MAX*3), size=new Float32Array(MAX), alpha=new Float32Array(MAX);
  const vel=new Float32Array(MAX*3), life=new Float32Array(MAX), maxLife=new Float32Array(MAX), drag=new Float32Array(MAX), grow=new Float32Array(MAX), size0=new Float32Array(MAX);
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col,3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size,1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha,1).setUsage(THREE.DynamicDrawUsage));
  const mat=new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    uniforms:{uScale:{value:600}},
    vertexShader:`attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale;
      void main(){ vC=pow(color,vec3(2.2))*0.95; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*uScale/max(-mv.z,0.1); gl_Position=projectionMatrix*mv; }`,
    fragmentShader:`varying vec3 vC; varying float vA; void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c); if(d>0.5) discard; float a=smoothstep(0.5,0.0,d); a*=a; gl_FragColor=vec4(vC*a*vA,1.0); }`});
  const pts=new THREE.Points(geo,mat); pts.frustumCulled=false; scene.add(pts);
  let next=0, active=0;
  function emit(p, v, color, sz, lf, dr=1.5, gr=0){
    const i=next; next=(next+1)%MAX;
    pos[i*3]=p.x; pos[i*3+1]=p.y; pos[i*3+2]=p.z; vel[i*3]=v.x; vel[i*3+1]=v.y; vel[i*3+2]=v.z;
    col[i*3]=color.r; col[i*3+1]=color.g; col[i*3+2]=color.b; size0[i]=size[i]=sz; life[i]=maxLife[i]=lf; drag[i]=dr; grow[i]=gr; alpha[i]=1;
  }
  const tmp=new THREE.Vector3();
  function burst(p, n, {speed=6, color=new THREE.Color(1,.6,.2), size=0.5, life=0.8, drag=2, grow=0, spread=1, up=0, jitter=0.2}={}){
    for(let i=0;i<n;i++){ tmp.randomDirection().multiplyScalar(speed*(0.3+Math.random()*0.7)*spread); tmp.y+=up;
      const c=color.clone().offsetHSL(rand(-.03,.03),0,rand(-jitter,jitter)*0.5);
      emit(p, tmp, c, size*(0.6+Math.random()*0.8), life*(0.6+Math.random()*0.6), drag, grow); }
  }
  function update(dt){
    for(let i=0;i<MAX;i++){ if(life[i]<=0) continue; life[i]-=dt;
      if(life[i]<=0){ alpha[i]=0; size[i]=0; continue; }
      const k=Math.max(0,1-drag[i]*dt);
      vel[i*3]*=k; vel[i*3+1]*=k; vel[i*3+2]*=k;
      pos[i*3]+=vel[i*3]*dt; pos[i*3+1]+=vel[i*3+1]*dt; pos[i*3+2]+=vel[i*3+2]*dt;
      const t=life[i]/maxLife[i]; alpha[i]=t<0.7? t/0.7 : 1; size[i]=size0[i]+grow[i]*(1-t)*maxLife[i];
    }
    geo.attributes.position.needsUpdate=true; geo.attributes.color.needsUpdate=true; geo.attributes.size.needsUpdate=true; geo.attributes.alpha.needsUpdate=true;
  }
  return {emit, burst, update, mat};
})();

/* ---------------- timing helpers ---------------- */
const tweens=[], timers=[], fxList=[];
let timeScale=1;
function tween(dur, fn, ease=easeInOut){ return new Promise(res=>{ if(dur<=0){ fn(1); res(); return; } tweens.push({t:0,dur,fn,ease,res}); }); }
function wait(sec){ return new Promise(res=>timers.push({t:sec, fn:res})); }
function after(sec, fn){ timers.push({t:sec, fn}); }
function addFx(obj){ fxList.push(obj); return obj; }

