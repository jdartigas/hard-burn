// Laniakea's Edge: battle locations. The board and rules are the same everywhere; the sky, the sun and the bodies
// around the board change. The Shattered Reach is the fictional scenery built in render.js and environment.js;
// the real locations use the real star catalogue (js/stardata.js) and NASA maps (assets/, see assets/CREDITS.md).
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

/* ---------------- locations ---------------- */
// Directions in the scene are azimuth (degrees, atan2 of z over x, as in environment.js) and elevation. The camera
// never looks more than about 16 degrees above the horizon, so a visible sun sits low (Jon: low and visible).
const LOCATIONS = [
  { id:'reach', name:'The Shattered Reach', where:'in the Shattered Reach', sub:'Uncharted', info:'A broken dwarf planet bleeding debris into an asteroid belt, under a banded gas giant. Not on any chart.' },
  { id:'earth', name:'Earth orbit', where:'in high Earth orbit', sub:'High orbit', info:'Geostationary height, 36,000 km up. Earth below, the Moon at its true size, the real stars.',
    // the Sun's ecliptic longitude sets the date: 190 degrees is early October. Earth and Moon are placed for that day.
    sunLon:190, sunAz:205, sunEl:8, sunDist:1400, sunDiam:0.53,
    earth:{ az:305, el:-17, dist:1200, diam:17.4, faceLon:-15 },   // geostationary: Earth spans 17.4 degrees
    moon:{ elong:95, lat:4, dist:1300, diam:0.52 } },   // a little past first quarter; the Moon's true size
];
const OBLIQUITY = 23.44*Math.PI/180;
const dirAzEl=(az,el)=>{ const a=az*Math.PI/180, e=el*Math.PI/180; return new THREE.Vector3(Math.cos(e)*Math.cos(a), Math.sin(e), Math.cos(e)*Math.sin(a)); };
// ecliptic longitude and latitude to equatorial J2000 (x toward RA 0h, y toward 6h, z north)
function eclToEq(lonDeg, latDeg=0){ const l=lonDeg*Math.PI/180, b=latDeg*Math.PI/180, x=Math.cos(b)*Math.cos(l), y=Math.cos(b)*Math.sin(l), z=Math.sin(b);
  return new THREE.Vector3(x, y*Math.cos(OBLIQUITY)-z*Math.sin(OBLIQUITY), y*Math.sin(OBLIQUITY)+z*Math.cos(OBLIQUITY)); }
// equatorial J2000 to galactic (the IAU rotation), for drawing the Milky Way where it really is
const EQ_TO_GAL = new THREE.Matrix3().set(-0.0548755604,-0.8734370902,-0.4838350155, 0.4941094279,-0.4448296300,0.7469822445, -0.8676661490,-0.1980763734,0.4559837762);

// The sky's orientation for a location: the real sun direction (from the date) lands on the chosen scene direction,
// and the ecliptic lies close to the horizon, so the Moon and planets, which keep near it, stay where the camera looks.
function skyFrame(L){
  const sEq=eclToEq(L.sunLon), pEq=eclToEq(0,90), sSc=dirAzEl(L.sunAz, L.sunEl), up=new THREE.Vector3(0,1,0);
  const pSc=up.clone().addScaledVector(sSc,-up.dot(sSc)).normalize();
  const bEq=new THREE.Matrix3(), bSc=new THREE.Matrix3();
  const e2=new THREE.Vector3().crossVectors(pEq,sEq), s2=new THREE.Vector3().crossVectors(pSc,sSc);
  bEq.set(sEq.x,e2.x,pEq.x, sEq.y,e2.y,pEq.y, sEq.z,e2.z,pEq.z); bSc.set(sSc.x,s2.x,pSc.x, sSc.y,s2.y,pSc.y, sSc.z,s2.z,pSc.z);
  return bSc.multiply(bEq.transpose());   // scene = R * equatorial
}

// star colour from its B-V index: temperature (Ballesteros), then a blackbody tint, kept mostly white as the eye sees it
function starColor(bv){
  const T=4600*(1/(0.92*bv+1.7)+1/(0.92*bv+0.62)), t=T/100;
  let r= t<=66? 255 : 329.7*Math.pow(t-60,-0.1332), g= t<=66? 99.47*Math.log(t)-161.1 : 288.1*Math.pow(t-60,-0.0755), b= t>=66? 255 : t<=19? 0 : 138.5*Math.log(t-10)-305.0;
  const c=new THREE.Color(clamp(r,0,255)/255, clamp(g,0,255)/255, clamp(b,0,255)/255);
  return c.lerp(new THREE.Color(1,1,1), 0.45);
}

// the real night sky: every naked-eye star in its place, sized and lit by its magnitude, plus the Milky Way's glow
function buildRealSky(R, root){
  const D=STAR_DATA.d, n=STAR_DATA.n, pos=new Float32Array(n*3), col=new Float32Array(n*3), size=new Float32Array(n), v=new THREE.Vector3();
  for(let i=0;i<n;i++){ const k=i*5; v.set(D[k],D[k+1],D[k+2]).normalize().applyMatrix3(R).multiplyScalar(1500); pos.set([v.x,v.y,v.z],i*3);
    const m=D[k+3], b=Math.min(Math.pow(10,-0.4*m*0.55)*1.6, 2.6), c=starColor(D[k+4]);   // a softened magnitude scale: what the eye reads, not raw flux
    col.set([c.r*b, c.g*b, c.b*b], i*3); size[i]=clamp(5.2-0.6*m,1.6,7.0); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('color',new THREE.BufferAttribute(col,3)); g.setAttribute('size',new THREE.BufferAttribute(size,1));
  const mat=new THREE.ShaderMaterial({ depthWrite:false, transparent:true, blending:THREE.AdditiveBlending, uniforms:{uPR:{value:1}},
    vertexShader:`attribute float size; attribute vec3 color; varying vec3 vC; uniform float uPR; void main(){ vC=color; gl_PointSize=size*uPR; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`varying vec3 vC; void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c)*2.0; float a=exp(-d*d*3.0); if(a<0.01) discard; gl_FragColor=vec4(vC*a,1.0); }` });
  const stars=new THREE.Points(g, mat); stars.frustumCulled=false; stars.userData.noAO=true; root.add(stars);
  // the Milky Way: a glow along the galactic plane with the bulge toward Sagittarius and the dark rift through it
  const rt=new THREE.Matrix3().copy(R).transpose(), toGal=new THREE.Matrix3().multiplyMatrices(EQ_TO_GAL, rt);
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1800,48,24), new THREE.ShaderMaterial({ side:THREE.BackSide, depthWrite:false, uniforms:{uGal:{value:toGal}, uGain:{value:1}},
    vertexShader:`varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`varying vec3 vDir; uniform mat3 uGal; uniform float uGain;
      float h(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
      float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float fbm(vec3 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*n3(p); p*=2.05; a*=0.5; } return v; }
      void main(){ vec3 g=normalize(uGal*normalize(vDir)); float l=atan(g.y,g.x), b=asin(clamp(g.z,-1.0,1.0));
        float cl=cos(l);   // 1 toward the galactic centre
        float width=0.10+0.07*max(cl,0.0);
        float band=exp(-b*b/(width*width)) * (0.55+0.45*max(cl,0.0));
        float bulge=exp(-(l*l)/0.18 - (b*b)/0.03)*1.3;
        float clump=fbm(g*7.0)*0.9+fbm(g*19.0)*0.35;
        float rift=1.0-0.75*exp(-pow((b-0.012)/0.03,2.0))*smoothstep(-0.2,0.6,cl)*smoothstep(0.35,0.7,fbm(g*11.0+3.0));
        float glow=(band*clump+bulge*clump)*rift;
        vec3 col=vec3(0.0016,0.0022,0.0040) + vec3(0.050,0.046,0.040)*glow;
        gl_FragColor=vec4(col*uGain,1.0); }` }));
  sky.userData.noAO=true; root.add(sky);
  return {stars, sky};
}

// a sun at its true angular size: a white-hot disc, with a modest glare (bloom does the rest)
function buildSun(dir, dist, diamDeg, root){
  const r=dist*Math.tan(diamDeg*Math.PI/360);
  const disc=new THREE.Mesh(new THREE.CircleGeometry(r,48), new THREE.MeshBasicMaterial({color:new THREE.Color(1,0.97,0.92).multiplyScalar(4), depthWrite:false}));   // no brighter: a tiny, very hot source blooms into a square
  disc.position.copy(dir).multiplyScalar(dist); disc.lookAt(0,0,0); disc.userData.noAO=true; root.add(disc);
  const glare=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex, color:0xfff1dc, blending:THREE.AdditiveBlending, depthWrite:false, transparent:true, opacity:0.8}));
  glare.position.copy(disc.position); glare.scale.setScalar(r*16); root.add(glare);
  return disc;
}

// Planets and moons are lit by the sun alone: the game's ambient and fill lights, there to keep ships readable, would
// light a night side that from orbit is black. Clouds ride on the same shader as a second map.
function bodyMaterial(map, clouds=null, nightGain=0.0){
  return new THREE.ShaderMaterial({ uniforms:{ uMap:{value:map}, uClouds:{value:clouds}, uHasClouds:{value:clouds?1:0}, uSun:{value:sunDir}, uNight:{value:nightGain} },
    vertexShader:`varying vec2 vUv; varying vec3 vN; void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`uniform sampler2D uMap; uniform sampler2D uClouds; uniform float uHasClouds; uniform vec3 uSun; uniform float uNight; varying vec2 vUv; varying vec3 vN;
      void main(){ vec3 n=normalize(vN); float d=dot(n,uSun); float lit=smoothstep(-0.04,0.25,d)*max(d,0.0)*0.8+smoothstep(-0.04,0.1,d)*0.12;
        vec3 c=texture2D(uMap,vUv).rgb;
        if(uHasClouds>0.5){ float k=texture2D(uClouds,vUv).g; c=mix(c, vec3(1.0), k*0.92); }
        gl_FragColor=vec4(c*(lit*2.6+uNight),1.0); }` });
}
const texLoader = new THREE.TextureLoader();
const loadTex = (url, srgb=true) => { const t=texLoader.load(url); t.anisotropy=MAX_ANISO; if(srgb) t.colorSpace=THREE.SRGBColorSpace; return t; };

const Loc = (() => {
  const built = {}, current = {id:null};
  function buildEarth(L){
    const root=new THREE.Group(); root.visible=false; scene.add(root);
    const R=skyFrame(L); buildRealSky(R, root);
    const sunDirSc=eclToEq(L.sunLon).applyMatrix3(R).normalize();
    buildSun(sunDirSc, L.sunDist, L.sunDiam, root);
    // Earth: the real surface, its axis on the real celestial pole, clouds, and a thin blue limb
    const E=L.earth, eDir=dirAzEl(E.az,E.el), eR=E.dist*Math.sin(E.diam*Math.PI/360), ePos=eDir.clone().multiplyScalar(E.dist);
    const earthTex=loadTex('assets/sol/earth.jpg'), cloudTex=loadTex('assets/sol/clouds.jpg', false);
    const earth=new THREE.Mesh(new THREE.SphereGeometry(eR,96,64), bodyMaterial(earthTex, cloudTex));
    const pole=new THREE.Vector3(0,0,1).applyMatrix3(R).normalize();
    earth.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), pole);
    // turn about the axis so the chosen longitude faces the board (the sphere's u=0.5 is longitude 0)
    const toUs=ePos.clone().negate().normalize(), q=earth.quaternion, front=new THREE.Vector3(0,0,1).applyQuaternion(q), flat=toUs.clone().addScaledVector(pole,-toUs.dot(pole)).normalize();
    const spin=Math.atan2(new THREE.Vector3().crossVectors(front,flat).dot(pole), front.dot(flat)) - (E.faceLon+90)*Math.PI/180;
    earth.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(pole, spin));
    earth.position.copy(ePos); earth.userData.noAO=true; root.add(earth);
    const atm=new THREE.Mesh(new THREE.SphereGeometry(eR*1.025,96,64), new THREE.ShaderMaterial({ transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.BackSide,
      uniforms:{uSun:{value:sunDir}},
      vertexShader:`varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader:`varying vec3 vN; varying vec3 vW; uniform vec3 uSun; void main(){ vec3 v=normalize(cameraPosition-vW); float f=pow(max(1.0-abs(dot(vN,v)),0.0),2.5); float l=smoothstep(-0.25,0.35,dot(vN,uSun));   /* vN is the outward normal: the lit limb faces the sun */ gl_FragColor=vec4(vec3(0.25,0.55,1.0)*f*l*1.6,1.0); }` }));
    atm.position.copy(ePos); root.add(atm);
    // the Moon: true size, lit by the real sun so its phase is right, near side turned toward Earth
    const M=L.moon, mDir=eclToEq(L.sunLon+M.elong, M.lat).applyMatrix3(R).normalize(), mR=M.dist*Math.tan(M.diam*Math.PI/360), mPos=mDir.clone().multiplyScalar(M.dist);
    const moon=new THREE.Mesh(new THREE.SphereGeometry(mR,48,32), bodyMaterial(loadTex('assets/sol/moon.jpg'), null, 0.004));   // a trace of earthshine
    moon.position.copy(mPos); moon.lookAt(ePos); moon.rotateY(-Math.PI/2); moon.userData.noAO=true; root.add(moon);
    // reflections: the sun, a bright blue Earth below, and a faint sky. With the sun this low, earthshine is what
    // keeps the ships readable, as it really is in high orbit: Earth reflects about a third of the light that hits it.
    const es=new THREE.Scene();
    const sb=new THREE.Mesh(new THREE.SphereGeometry(55,24,12), new THREE.MeshBasicMaterial({color:new THREE.Color(1,0.95,0.88).multiplyScalar(40)})); sb.position.copy(sunDirSc).multiplyScalar(1400); es.add(sb);
    const eb=new THREE.Mesh(new THREE.SphereGeometry(eR*1.6,32,16), new THREE.MeshBasicMaterial({color:new THREE.Color(0.30,0.48,0.80).multiplyScalar(1.6)})); eb.position.copy(ePos); es.add(eb);
    es.add(new THREE.Mesh(new THREE.SphereGeometry(1800,16,8), new THREE.MeshBasicMaterial({color:new THREE.Color(0.05,0.055,0.07), side:THREE.BackSide})));
    return {root, sun:sunDirSc, env:bakeEnvironment(es), earth, moon,
      light:{ fill:{dir:eDir.clone(), color:0x7aa4e0, intensity:2.4}, ambient:0.8 } };
  }
  const builders={ earth:buildEarth };
  const reachSun=sunDir.clone(), amb=scene.children.find(o=>o.isAmbientLight);
  const reachLight={ fill:{dir:fill.position.clone().normalize(), color:fill.color.getHex(), intensity:fill.intensity}, ambient:amb.intensity };
  function set(id){
    if(!LOCATIONS.some(l=>l.id===id)) id='reach';
    if(current.id===id) return;
    if(id!=='reach' && !built[id]) built[id]=builders[id](LOCATIONS.find(l=>l.id===id));
    reachSky.visible = Env.reachRoot.visible = id==='reach';
    for(const k of Object.keys(built)) built[k].root.visible = k===id;
    setSunDir(id==='reach'? reachSun : built[id].sun);
    scene.environment = id==='reach'? reachEnv : built[id].env;
    const Lt= id==='reach'? reachLight : built[id].light;   // the second light: the Reach's blue fill, or earthshine
    fill.position.copy(Lt.fill.dir).multiplyScalar(100); fill.color.setHex(Lt.fill.color); fill.intensity=Lt.fill.intensity; amb.intensity=Lt.ambient;
    current.id=id;
  }
  return { set, get id(){ return current.id; }, built,
    update(){ for(const k of Object.keys(built)) if(built[k].root.visible){ const st=built[k].root.children[0]; if(st && st.material.uniforms) st.material.uniforms.uPR.value=renderer.getPixelRatio(); } } };
})();
Loc.set('reach');
