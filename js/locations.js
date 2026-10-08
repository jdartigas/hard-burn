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
  { id:'earth', name:'Earth orbit', where:'in high Earth orbit', sub:'High orbit', heroAz:305, info:'Geostationary height, 36,000 km up. Earth below, the Moon at its true size, the real stars.',
    // the Sun's ecliptic longitude sets the date: 190 degrees is early October. Earth and Moon are placed for that day.
    sunLon:190, sunAz:205, sunEl:8, sunDist:1400, sunDiam:0.53,
    earth:{ az:305, el:-17, dist:1200, diam:17.4, faceLon:-15 },   // geostationary: Earth spans 17.4 degrees
    moon:{ elong:95, lat:4, dist:1300, diam:0.52 } },   // a little past first quarter; the Moon's true size
  // Mars: on Phobos' own orbit (9,376 km from Mars' centre), 600 km behind Phobos. The only way to see Phobos as more
  // than a dot is to be near it, and from there Mars is genuinely huge, 42 degrees across.
  { id:'mars', heroAz:20, name:'Mars orbit', where:'off Phobos, in Mars orbit', sub:'Beside Phobos', info:'On Phobos\u2019 orbit, 600 km from it and 6,000 km above Mars. Mars fills the sky below; Deimos is a faint point. Real stars.',
    sunDist:1400, sunDiam:0.35, sunEl:8, zodi:0.7,
    mars:{ az:20, el:-8,   /* high enough that from overhead only its lower limb shows: lower, it sat behind the far half of the board */ radiusKm:3389.5, distKm:9376, dist:1300, faceLon:-70, pole:[317.68,52.89] },   // Valles Marineris toward the board
    phobos:{ distKm:600, dist:1000, axesKm:[13.4,11.1,9.1], el:3 },
    deimos:{ el:-1, azOff:-150 } },
  { id:'belt', heroAz:150, name:'Asteroid belt', where:'in the asteroid belt', sub:'2.7 AU', info:'Between Mars and Jupiter, 2.7 times Earth\u2019s distance from the Sun. A small, distant Sun; Jupiter the brightest star; dark carbon-rich rocks drifting past.',
    sunLon:240, sunAz:150, sunEl:8, sunDist:1400, sunDiam:0.20, zodi:0.45,
    planets:[ {name:'Jupiter', elong:140, lat:0.8, size:4.2, color:[1.0,0.92,0.80], gain:2.4}, {name:'Mars', elong:-70, lat:-1.2, size:2.2, color:[1.0,0.62,0.45], gain:0.7} ] },
  // Jupiter (v51, Jon: much closer): 230,000 km out, just beyond Thebe's orbit and inside Io's, in Jupiter's equatorial
  // plane. Jupiter is 36 degrees across; the four large moons, all farther out than us, line up along its equator just
  // beyond its limb. Their orbital phases are chosen so all four are in view.
  { id:'jupiter', heroAz:250, name:'Jupiter orbit', where:'in Jupiter orbit', sub:'Inside Io\u2019s orbit', info:'230,000 km from Jupiter, inside the orbit of Io. Jupiter fills 36 degrees of sky; Io, Europa, Ganymede and Callisto strung along its equator.',
    sunDist:1400, sunDiam:0.10, sunEl:8, zodi:0.15,
    jupiter:{ az:250, el:-8, radiusKm:71492, distKm:230000, dist:900, depthExp:0.2, faceLon:-50, pole:[268.057,64.495], sunAngle:110 },
    moons:[ {name:'Io', map:'io', rKm:1821.6, orbitKm:421700, phase:130, tint:[1,1,1]},
            {name:'Europa', map:'europa', rKm:1560.8, orbitKm:671100, phase:-125, tint:[1.0,0.93,0.82]},
            {name:'Ganymede', map:null, rKm:2634.1, orbitKm:1070400, phase:150, tint:[1,1,1]},
            {name:'Callisto', map:'callisto', rKm:2410.3, orbitKm:1882700, phase:-150, tint:[0.78,0.70,0.60]} ] },
];
const OBLIQUITY = 23.44*Math.PI/180;
const dirAzEl=(az,el)=>{ const a=az*Math.PI/180, e=el*Math.PI/180; return new THREE.Vector3(Math.cos(e)*Math.cos(a), Math.sin(e), Math.cos(e)*Math.sin(a)); };
// ecliptic longitude and latitude to equatorial J2000 (x toward RA 0h, y toward 6h, z north)
function eclToEq(lonDeg, latDeg=0){ const l=lonDeg*Math.PI/180, b=latDeg*Math.PI/180, x=Math.cos(b)*Math.cos(l), y=Math.cos(b)*Math.sin(l), z=Math.sin(b);
  return new THREE.Vector3(x, y*Math.cos(OBLIQUITY)-z*Math.sin(OBLIQUITY), y*Math.sin(OBLIQUITY)+z*Math.cos(OBLIQUITY)); }
// equatorial J2000 to galactic (the IAU rotation), for drawing the Milky Way where it really is
const EQ_TO_GAL = new THREE.Matrix3().set(-0.0548755604,-0.8734370902,-0.4838350155, 0.4941094279,-0.4448296300,0.7469822445, -0.8676661490,-0.1980763734,0.4559837762);

const raDecToEq=(raDeg,decDeg)=>{ const a=raDeg*Math.PI/180, d=decDeg*Math.PI/180; return new THREE.Vector3(Math.cos(d)*Math.cos(a), Math.cos(d)*Math.sin(a), Math.sin(d)); };
// the rotation taking two equatorial directions onto two scene directions (the second is made perpendicular to the first)
function frameFrom(aEq, bEq, aSc, bSc){
  const basis=(a,b)=>{ const x=a.clone().normalize(), z=b.clone().addScaledVector(x,-b.dot(x)).normalize(), y=new THREE.Vector3().crossVectors(z,x);
    return new THREE.Matrix3().set(x.x,y.x,z.x, x.y,y.y,z.y, x.z,y.z,z.z); };
  return basis(aSc,bSc).multiply(basis(aEq,bEq).transpose());
}
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
function buildRealSky(R, root, sunSc, zodi=1){
  const D=STAR_DATA.d, n=STAR_DATA.n, pos=new Float32Array(n*3), col=new Float32Array(n*3), size=new Float32Array(n), v=new THREE.Vector3();
  for(let i=0;i<n;i++){ const k=i*5; v.set(D[k],D[k+1],D[k+2]).normalize().applyMatrix3(R).multiplyScalar(1500); pos.set([v.x,v.y,v.z],i*3);
    const m=D[k+3], b=Math.min(Math.pow(10,-0.4*m*0.55)*1.6, 2.6)*LOOK.starGain, c=starColor(D[k+4]);   // a softened magnitude scale: what the eye reads, not raw flux
    col.set([c.r*b, c.g*b, c.b*b], i*3); size[i]=clamp(5.2-0.6*m,1.6,7.0)*LOOK.starSize; }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('color',new THREE.BufferAttribute(col,3)); g.setAttribute('size',new THREE.BufferAttribute(size,1));
  const mat=new THREE.ShaderMaterial({ depthWrite:false, transparent:true, blending:THREE.AdditiveBlending, uniforms:{uPR:{value:1}},
    vertexShader:`attribute float size; attribute vec3 color; varying vec3 vC; uniform float uPR; void main(){ vC=color; gl_PointSize=size*uPR; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`varying vec3 vC; void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c)*2.0; float a=exp(-d*d*3.0); if(a<0.01) discard; gl_FragColor=vec4(vC*a,1.0); }` });
  const stars=new THREE.Points(g, mat); stars.frustumCulled=false; stars.userData.noAO=true; root.add(stars);
  // v59: faint filler stars below the catalogue's naked-eye limit, crowding toward the Milky Way so the sky isn't bare
  { const toGalF=new THREE.Matrix3().multiplyMatrices(EQ_TO_GAL, new THREE.Matrix3().copy(R).transpose()), FR=mulberry32(4242), nf=LOOK.faintStars;
    const fp=new Float32Array(nf*3), fc=new Float32Array(nf*3), fs=new Float32Array(nf).fill(1.5*LOOK.starSize), gv=new THREE.Vector3();
    for(let i=0;i<nf;i++){ do { v.set(FR()*2-1,FR()*2-1,FR()*2-1); } while(v.lengthSq()>1 || v.lengthSq()<1e-4);
      v.normalize(); gv.copy(v).applyMatrix3(toGalF); if(FR()>0.35+0.65*Math.exp(-gv.z*gv.z/0.04)){ i--; continue; }
      fp.set([v.x*1500,v.y*1500,v.z*1500],i*3); const b=(0.05+0.17*Math.pow(FR(),2))*LOOK.starGain, t=FR(); fc.set(t<0.2?[b,b*0.9,b*0.78]:t<0.35?[b*0.8,b*0.88,b]:[b,b,b], i*3); }
    const fg=new THREE.BufferGeometry(); fg.setAttribute('position',new THREE.BufferAttribute(fp,3)); fg.setAttribute('color',new THREE.BufferAttribute(fc,3)); fg.setAttribute('size',new THREE.BufferAttribute(fs,1));
    const faint=new THREE.Points(fg, mat); faint.frustumCulled=false; faint.userData.noAO=true; root.add(faint); }
  // the Milky Way: a glow along the galactic plane with the bulge toward Sagittarius and the dark rift through it
  const rt=new THREE.Matrix3().copy(R).transpose(), toGal=new THREE.Matrix3().multiplyMatrices(EQ_TO_GAL, rt);
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1800,48,24), new THREE.ShaderMaterial({ side:THREE.BackSide, depthWrite:false, uniforms:{uGal:{value:toGal}, uGain:{value:LOOK.skyGain}, uSun:{value:sunSc.clone()}, uEcl:{value:eclToEq(0,90).applyMatrix3(R).normalize()}, uZodi:{value:zodi}},
    vertexShader:`varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`varying vec3 vDir; uniform mat3 uGal; uniform float uGain; uniform vec3 uSun; uniform vec3 uEcl; uniform float uZodi;
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
        vec3 col=vec3(0.0016,0.0022,0.0040) + vec3(0.050,0.046,0.040)*glow*${LOOK.mwGain.toFixed(2)};
        // zodiacal light: sunlight on interplanetary dust, a glow along the ecliptic that brightens toward the sun
        vec3 d=normalize(vDir); float eb=dot(d,uEcl), es=max(dot(d,uSun),-1.0);
        col+=vec3(0.040,0.036,0.028)*uZodi*exp(-eb*eb/0.018)*(exp((es-1.0)*2.2)+0.12);
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
  glare.position.copy(disc.position); glare.scale.setScalar(Math.max(r*16, 22)*LOOK.glare); root.add(glare);   // the sun stays blinding even where its disc is tiny
  return disc;
}

// Planets and moons are lit by the sun alone: the game's ambient and fill lights, there to keep ships readable, would
// light a night side that from orbit is black. Clouds ride on the same shader as a second map.
// v109 (Jon: the v108 illustrated Mars "sucks"; this reference instead, a rich, high-contrast Mars render): a colour
// grade. The real map keeps every detail, but each point is recoloured along a gradient measured from Jon's reference image
// (its darks, mids and lights, which are far more saturated than the Viking mosaic's greys), by where it falls in the
// map's own brightness range (lo, mid, hi: the map's 5th, 50th and 95th percentiles). Bright polar ice blends back to its
// own colour. Done in display space, as the measurements were. The reference image itself is never shipped.
const MARS_GRADE = { lo:0.239, mid:0.392, hi:0.557, dark:[0.323,0.189,0.162], midC:[0.570,0.286,0.207], light:[0.909,0.416,0.246], keep:0.15, ice0:0.6, ice1:0.8, contrast:1.35, expo:0.72 };   // expo: the lit level for the graded body (its colours are already bright)
function bodyMaterial(map, clouds=null, nightGain=0.0, tint=[1,1,1], grade=null){
  const G=grade, f=v=>`(${v.toFixed(3)})`, v3=a=>`vec3(${a.map(v=>v.toFixed(3)).join(',')})`;   // numbers parenthesised: a negative after a minus breaks GLSL
  return new THREE.ShaderMaterial({ uniforms:{ uMap:{value:map}, uClouds:{value:clouds}, uHasClouds:{value:clouds?1:0}, uSun:{value:sunDir}, uNight:{value:nightGain}, uTint:{value:new THREE.Color(...tint)} },
    vertexShader:`varying vec2 vUv; varying vec3 vN; void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`uniform sampler2D uMap; uniform sampler2D uClouds; uniform float uHasClouds; uniform vec3 uSun; uniform float uNight; uniform vec3 uTint; varying vec2 vUv; varying vec3 vN;
      void main(){ vec3 n=normalize(vN); float d=dot(n,uSun); float lit=smoothstep(-0.04,0.25,d)*max(d,0.0)*0.8+smoothstep(-0.04,0.1,d)*0.12;
        vec3 c=texture2D(uMap,vUv).rgb*uTint;
        if(uHasClouds>0.5){ float k=texture2D(uClouds,vUv).g; c=mix(c, vec3(1.0), k*0.92); }
        ${G? `
        vec3 dc=pow(max(c,vec3(0.0)),vec3(1.0/2.2)); float L=dot(dc,vec3(0.3,0.59,0.11));
        float t= L<${f(G.mid)}? 0.5*clamp((L-${f(G.lo)})/${f(G.mid-G.lo)},0.0,1.0) : 0.5+0.5*clamp((L-${f(G.mid)})/${f(G.hi-G.mid)},0.0,1.0);
        t=clamp((t-0.5)*${f(G.contrast)}+0.5,0.0,1.0);
        vec3 g= t<0.5? mix(${v3(G.dark)},${v3(G.midC)},t*2.0) : mix(${v3(G.midC)},${v3(G.light)},t*2.0-1.0);
        g=mix(g, g*(dc/max(vec3(L),vec3(0.001))), ${f(G.keep)});                    // a little of the map's own hue variation
        g=mix(g, dc, smoothstep(${f(G.ice0)},${f(G.ice1)},L));                         // the polar ice stays ice
        c=pow(max(g,vec3(0.0)),vec3(2.2));` : ''}
        gl_FragColor=vec4(c*(lit*${(2.6*LOOK.bodyGain*(G? G.expo : 1)).toFixed(2)}+uNight),1.0); }` });
}
const texLoader = new THREE.TextureLoader();
const loadTex = (url, srgb=true) => { const t=texLoader.load(url); t.anisotropy=MAX_ANISO; if(srgb) t.colorSpace=THREE.SRGBColorSpace; return t; };

const Loc = (() => {
  const built = {}, current = {id:null};
  function buildEarth(L){
    const root=new THREE.Group(); root.visible=false; scene.add(root);
    const R=skyFrame(L), sunDirSc=eclToEq(L.sunLon).applyMatrix3(R).normalize(); buildRealSky(R, root, sunDirSc, 1.0);
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
  // ---- shared pieces for the real locations ----
  const newRoot=()=>{ const r=new THREE.Group(); r.visible=false; scene.add(r); return r; };
  const ECL_POLE=eclToEq(0,90);
  // turn a body so its north pole points along `pole` and longitude `lon` faces `toward`. On a three.js sphere,
  // longitude 0 (texture u=0.5) is local +x and longitude L lies at +x turned L degrees about +y.
  function orient(obj, pole, toward, lon=0){
    const Y=pole.clone().normalize(), t=toward.clone().addScaledVector(Y,-toward.dot(Y)).normalize(), w=new THREE.Vector3().crossVectors(t,Y), L=lon*Math.PI/180;
    const X=t.clone().multiplyScalar(Math.cos(L)).addScaledVector(w,Math.sin(L)), Z=t.clone().multiplyScalar(-Math.sin(L)).addScaledVector(w,Math.cos(L));
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X,Y,Z));
  }
  function sphereBody(root, mat, r, pos, segs=64){ const m=new THREE.Mesh(new THREE.SphereGeometry(r,segs,Math.round(segs*0.66)), mat); m.position.copy(pos); m.userData.noAO=true; root.add(m); return m; }
  // a thin limb of atmosphere, brightest on the sunlit side
  function limb(root, pos, r, color, gain){
    const m=new THREE.Mesh(new THREE.SphereGeometry(r,96,64), new THREE.ShaderMaterial({ transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.BackSide,
      uniforms:{uSun:{value:sunDir}, uCol:{value:new THREE.Color(...color)}, uGain:{value:gain}},
      vertexShader:`varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader:`varying vec3 vN; varying vec3 vW; uniform vec3 uSun; uniform vec3 uCol; uniform float uGain; void main(){ vec3 v=normalize(cameraPosition-vW); float f=pow(max(1.0-abs(dot(vN,v)),0.0),2.5); float l=smoothstep(-0.25,0.35,dot(vN,uSun)); gl_FragColor=vec4(uCol*f*l*uGain,1.0); }` }));
    m.position.copy(pos); root.add(m); return m;
  }
  // a body too small or far to show a disc (Deimos, Jupiter from the belt): a point of light
  function pointBody(root, dir, dist, size, color){
    const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(dir.clone().multiplyScalar(dist).toArray(),3));
    const p=new THREE.Points(g, new THREE.PointsMaterial({size, sizeAttenuation:false, color:new THREE.Color(...color), transparent:true, blending:THREE.AdditiveBlending, depthWrite:false}));
    p.frustumCulled=false; p.userData.noAO=true; root.add(p); return p;
  }
  // the second light for each place, and its reflections: the sun, the big body nearby and a faint sky
  function envOf(sunSc, body=null, sky=0.05){
    const es=new THREE.Scene();
    const sb=new THREE.Mesh(new THREE.SphereGeometry(55,24,12), new THREE.MeshBasicMaterial({color:new THREE.Color(1,0.95,0.88).multiplyScalar(40)})); sb.position.copy(sunSc).multiplyScalar(1400); es.add(sb);
    if(body){ const b=new THREE.Mesh(new THREE.SphereGeometry(body.r,32,16), new THREE.MeshBasicMaterial({color:new THREE.Color(...body.color)})); b.position.copy(body.pos); es.add(b); }
    es.add(new THREE.Mesh(new THREE.SphereGeometry(1800,16,8), new THREE.MeshBasicMaterial({color:new THREE.Color(sky,sky*1.1,sky*1.4), side:THREE.BackSide})));
    return bakeEnvironment(es);
  }
  // a direction at the given elevation on the great circle perpendicular to `pole`, at least `minAngle` from `away`
  function onCircleAtEl(pole, away, elDeg, minAngle){
    const u=away.clone().addScaledVector(pole,-away.dot(pole)).normalize(), v=new THREE.Vector3().crossVectors(pole,u), target=Math.sin(elDeg*Math.PI/180);
    let best=null, bd=Infinity;
    for(let t=0;t<Math.PI*2;t+=0.0005){ const d=u.clone().multiplyScalar(Math.cos(t)).addScaledVector(v,Math.sin(t)); if(d.angleTo(away)<minAngle*Math.PI/180) continue; const e=Math.abs(d.y-target); if(e<bd){ bd=e; best=d; } }
    return best;
  }
  // Ganymede has no clean public global map: grey-brown dark terrain, paler grooved regions, bright young craters
  function ganymedeTex(){ const R=mulberry32(4711); return canvasTex(512,256,(g,w,h)=>{
    g.fillStyle='#6f665b'; g.fillRect(0,0,w,h);
    for(let i=0;i<70;i++){ g.fillStyle=`rgba(${170+R()*30},${160+R()*30},${148+R()*25},${0.25+R()*0.35})`; g.beginPath(); g.ellipse(R()*w,h*(0.15+R()*0.7),18+R()*60,6+R()*22,R()*3,0,7); g.fill(); }
    g.fillStyle='rgba(60,52,44,0.6)'; g.beginPath(); g.ellipse(w*0.62,h*0.38,70,40,0.2,0,7); g.fill();   // a dark region like Galileo Regio
    for(let i=0;i<160;i++){ g.fillStyle=`rgba(235,232,225,${0.3+R()*0.6})`; g.beginPath(); g.arc(R()*w,R()*h,0.6+R()*2.2,0,7); g.fill(); }
    g.fillStyle='rgba(225,225,225,0.55)'; g.fillRect(0,0,w,h*0.07); g.fillRect(0,h*0.93,w,h*0.07); }); }   // frosty poles

  function buildMars(L){
    const root=newRoot(), M=L.mars, P=L.phobos;
    const marsDir=dirAzEl(M.az, M.el);
    // Phobos is 600 km ahead on our shared orbit, so it sits just under 90 degrees from Mars' centre
    const phAng=(90-P.distKm/M.distKm*90/Math.PI)*Math.PI/180, cosD=(Math.cos(phAng)-Math.sin(M.el*Math.PI/180)*Math.sin(P.el*Math.PI/180))/(Math.cos(M.el*Math.PI/180)*Math.cos(P.el*Math.PI/180));
    const phDir=dirAzEl(M.az+Math.acos(clamp(cosD,-1,1))*180/Math.PI, P.el);
    let poleSc=new THREE.Vector3().crossVectors(marsDir, phDir).normalize(); if(poleSc.y<0) poleSc.negate();   // the plane of Mars' equator holds Mars, us and Phobos
    const poleEq=raDecToEq(...M.pole), sunEq=new THREE.Vector3().crossVectors(ECL_POLE, poleEq).normalize();   // the sun at Mars' equinox, in its equatorial plane
    const sunSc=onCircleAtEl(poleSc, marsDir, L.sunEl, 100), R=frameFrom(sunEq, poleEq, sunSc, poleSc);
    buildRealSky(R, root, sunSc, L.zodi); buildSun(sunSc, L.sunDist, L.sunDiam, root);
    const mR=M.dist*M.radiusKm/M.distKm, mPos=marsDir.clone().multiplyScalar(M.dist);
    const mars=sphereBody(root, bodyMaterial(loadTex('assets/sol/mars.jpg'), null, 0.0, [1,1,1], MARS_GRADE), mR, mPos, 128);   // v109: graded to Jon's reference orient(mars, poleSc, marsDir.clone().negate(), M.faceLon);
    limb(root, mPos, mR*1.012, [0.95,0.62,0.42], 0.9);
    // Phobos: its real shape (a 27 x 22 x 18 km lump), long axis toward Mars, dark as coal; Mars lights its night side a little
    const k=P.dist/P.distKm, phPos=phDir.clone().multiplyScalar(P.dist);
    const phobos=sphereBody(root, bodyMaterial(loadTex('assets/sol/phobos.jpg'), null, 0.025, [0.52,0.49,0.46]), 1, phPos, 64);
    { const pg=phobos.geometry, ps=pg.attributes.position, v=new THREE.Vector3();   // lumpy, not a smooth ellipsoid
      for(let i=0;i<ps.count;i++){ v.fromBufferAttribute(ps,i); v.multiplyScalar(1+RockNoise.fbm(v.x*1.6,v.y*1.6,v.z*1.6,31,4)*0.16); ps.setXYZ(i,v.x,v.y,v.z); } pg.computeVertexNormals(); }
    phobos.scale.set(P.axesKm[0]*k, P.axesKm[2]*k, P.axesKm[1]*k); orient(phobos, poleSc, mPos.clone().sub(phPos), 0);
    // Deimos: 12 km across and 15,000 km away, too small to show a disc
    const dmDir=marsDir.clone().applyAxisAngle(poleSc, L.deimos.azOff*Math.PI/180); pointBody(root, dmDir, 1500, 2.2, [0.75,0.72,0.68]);
    return {root, sun:sunSc, env:envOf(sunSc, {pos:mPos, r:mR*1.1, color:[0.75,0.42,0.26]}),
      light:{ fill:{dir:marsDir.clone(), color:0xd8906a, intensity:2.2}, ambient:0.78 } };
  }

  function buildBelt(L){
    const root=newRoot(), R=skyFrame(L), sunSc=eclToEq(L.sunLon).applyMatrix3(R).normalize();
    buildRealSky(R, root, sunSc, L.zodi); buildSun(sunSc, L.sunDist, L.sunDiam, root);
    for(const pl of L.planets) pointBody(root, eclToEq(L.sunLon+pl.elong, pl.lat).applyMatrix3(R).normalize(), 1450, pl.size, pl.color.map(c=>c*pl.gain));
    // a sparse field of dark, carbon-rich rocks drifting past, kept below the board and beyond where the camera goes
    const Rr=mulberry32(4802), geos=[0,1,2,3,4].map(i=>makeRockGeometry(4802+i*29, 3, false));
    const mat=new THREE.MeshStandardMaterial({vertexColors:true, flatShading:true, roughness:1, metalness:0, envMapIntensity:0.3, color:new THREE.Color(0.46,0.45,0.44)});
    const per=70, mtx=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(), s=new THREE.Vector3(), pos=new THREE.Vector3();
    geos.forEach(g=>{ const im=new THREE.InstancedMesh(g, mat, per);
      for(let i=0;i<per;i++){ const a=Rr()*Math.PI*2, r=90+520*Math.pow(Rr(),0.7), y= r<175? -30-Rr()*130 : -130+Rr()*150, size=(1.2+Rr()*2.5)*(0.6+r/260);
        pos.set(Math.cos(a)*r, y, Math.sin(a)*r); e.set(Rr()*6.3,Rr()*6.3,Rr()*6.3); q.setFromEuler(e); s.set(size*(0.7+Rr()*0.6), size*(0.7+Rr()*0.6), size*(0.7+Rr()*0.6));
        im.setMatrixAt(i, mtx.compose(pos,q,s)); }
      im.frustumCulled=false; im.userData.noAO=true; root.add(im); });
    // nothing nearby reflects much light out here, so the fill is a cool, faint skylight: a concession to readability
    const fillDir=sunSc.clone().negate().add(new THREE.Vector3(0,0.9,0)).normalize();
    return {root, sun:sunSc, env:envOf(sunSc, null, 0.07), light:{ fill:{dir:fillDir, color:0x8fa0c0, intensity:1.6}, ambient:0.82 } };
  }

  function buildJupiter(L){
    const root=newRoot(), J=L.jupiter, jupDir=dirAzEl(J.az, J.el), e8=L.sunEl*Math.PI/180, ej=J.el*Math.PI/180;
    // the sun sits low, J.sunAngle degrees round from Jupiter, which sets how much of Jupiter's face is lit
    const cosD=(Math.cos(J.sunAngle*Math.PI/180)-Math.sin(ej)*Math.sin(e8))/(Math.cos(ej)*Math.cos(e8)), sunSc=dirAzEl(J.az+Math.acos(clamp(cosD,-1,1))*180/Math.PI, L.sunEl);
    let poleSc=new THREE.Vector3().crossVectors(sunSc, jupDir).normalize(); if(poleSc.y<0) poleSc.negate();   // Jupiter's equator holds us, Jupiter, the moons, and (within 3 degrees) the sun
    const poleEq=raDecToEq(...J.pole), sunEq=new THREE.Vector3().crossVectors(ECL_POLE, poleEq).normalize(), R=frameFrom(sunEq, poleEq, sunSc, poleSc);
    buildRealSky(R, root, sunSc, L.zodi); buildSun(sunSc, L.sunDist, L.sunDiam, root);
    const jR=J.dist*J.radiusKm/J.distKm, jPos=jupDir.clone().multiplyScalar(J.dist);
    const jup=sphereBody(root, bodyMaterial(loadTex('assets/sol/jupiter.jpg')), jR, jPos, 128); orient(jup, poleSc, jupDir.clone().negate(), J.faceLon);
    limb(root, jPos, jR*1.01, [0.95,0.85,0.70], 0.6);
    // the moons, placed by their real orbits and the chosen phases; nearer than Jupiter means nearer in the scene too
    const e1=jupDir.clone().negate(), e2=new THREE.Vector3().crossVectors(poleSc, e1).normalize(), moons=[];
    for(const m of L.moons){ const ph=m.phase*Math.PI/180, rel=e1.clone().multiplyScalar(m.orbitKm*Math.cos(ph)-J.distKm).addScaledVector(e2, m.orbitKm*Math.sin(ph));
      const dKm=rel.length(), dir=rel.normalize(), sd=J.dist*Math.pow(dKm/J.distKm,J.depthExp||0.35), pos=dir.clone().multiplyScalar(sd);
      const tex= m.map? loadTex(`assets/sol/${m.map}.jpg`) : ganymedeTex();
      const body=sphereBody(root, bodyMaterial(tex, null, 0.004, m.tint), sd*m.rKm/dKm, pos, 48); orient(body, poleSc, jPos.clone().sub(pos), 0); moons.push(body); }
    return {root, sun:sunSc, env:envOf(sunSc, {pos:jPos, r:jR*1.4, color:[0.62,0.52,0.40]}), jupiter:jup, moons,
      light:{ fill:{dir:jupDir.clone(), color:0xe0c8a8, intensity:1.8}, ambient:0.8 } };
  }

  const builders={ earth:buildEarth, mars:buildMars, belt:buildBelt, jupiter:buildJupiter };
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
    fill.position.copy(Lt.fill.dir).multiplyScalar(100); fill.color.setHex(Lt.fill.color); fill.intensity=Lt.fill.intensity*LOOK.fillGain; amb.intensity=Lt.ambient*LOOK.ambientGain;
    current.id=id;
  }
  // the menu camera's heading for the current location: the hero body on the right of the screen, clear of the menu
  // panel, with a slow sway. null means circle freely (the Reach).
  function menuTheta(){
    const L=LOCATIONS.find(l=>l.id===current.id); if(!L || L.heroAz==null) return null;
    const a=L.heroAz*Math.PI/180, base=Math.atan2(-Math.cos(a), -Math.sin(a)), hx=Math.cos(a), hz=Math.sin(a);
    const side=[0.26,-0.26].find(d=>{ const t=base+d; return hx*Math.cos(t)-hz*Math.sin(t)>0; }) ?? 0.26;   // the side that puts it screen-right
    return base+side+Math.sin(performance.now()/1000*0.06)*0.1;
  }
  return { set, menuTheta, get id(){ return current.id; }, built,
    update(){ for(const k of Object.keys(built)) if(built[k].root.visible){ const st=built[k].root.children[0]; if(st && st.material.uniforms) st.material.uniforms.uPR.value=renderer.getPixelRatio(); } } };
})();
Loc.set('reach');
