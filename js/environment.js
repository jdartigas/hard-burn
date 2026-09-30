// Hard Burn: scenery beyond the board. A distant asteroid belt with a dust band, and a midground layer of rocks.
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

  function makeMat(c){
    const m=new THREE.MeshStandardMaterial({vertexColors:true, flatShading:true, roughness:1, metalness:0, envMapIntensity:0.2, color:new THREE.Color(...c)}), H=ENV.haze;
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

  const top = QUALITY.high.env;
  const far = rockLayer(ENV.far, farSpin, 7001); far.build(top.far);
  const mid = rockLayer(ENV.mid, midSpin, 8001); mid.build(top.mid);
  const dust = dustLayer(top.dust);

  return {
    group: planeGroup,
    setQuality(q){ const c=QUALITY[q].env; far.setCount(c.far); mid.setCount(c.mid); dust.setCount(c.dust); },
    update(dt){ farSpin.rotation.y+=dt*ENV.far.spin; midSpin.rotation.y+=dt*ENV.mid.spin; },
  };
})();
Env.setQuality(quality);
