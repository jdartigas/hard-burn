// Laniakea's Edge: synthesized sound effects and the generative score.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

/* ---------------- audio ---------------- */
const RAIL_CHARGE = 0.7;    // v65: seconds a railgun charges before it fires; fxRail (rules.js) waits as long (v91: 0.55 to 0.7)
const Sound = (() => {
  let ctx=null, master, sfx, music, noiseBuf, on = store.get('sound', true), musicOn = store.get('music', true), musicNodes=null, mood='menu', pendingJump=null;
  // volumes (v44): the Settings sliders scale the music and the effects, 0 to 1, remembered across visits
  let musicLevel=clamp(+store.get('musicVol',0.8)||0,0,1), fxLevel=clamp(+store.get('fxVol',1)||0,0,1);
  const mv=()=>0.42*musicLevel*1.25, fv=()=>0.9*fxLevel;
  function duck(level,hold){ if(!ctx||!musicOn) return; const t=ctx.currentTime; music.gain.cancelScheduledValues(t); music.gain.setTargetAtTime(mv()*level,t,0.03); music.gain.setTargetAtTime(mv(),t+hold,0.5); }
  function init(){
    if(ctx) { if(ctx.state==='suspended') ctx.resume(); return; }
    try{ ctx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return; }
    master = ctx.createGain(); master.gain.value = 0.8;
    // v66: a limiter last in line, so stacked hits and explosions can't clip
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value=-3; lim.knee.value=0; lim.ratio.value=20; lim.attack.value=0.002; lim.release.value=0.12;
    master.connect(lim); lim.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value=-14; comp.ratio.value=4; comp.connect(master);
    sfx = ctx.createGain(); sfx.gain.value=on?fv():0; sfx.connect(comp);
    music = ctx.createGain(); music.gain.value=0.0; music.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate*2, ctx.sampleRate);
    const d=noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    buildFx(); startMusic(); loadSfx();
  }
  const now = () => ctx.currentTime;
  /* v63 (Jon): recorded effects (Kenney, CC0, see assets/CREDITS.md) over or instead of the synthesized ones, which
     stay as the fallback when a file can't load or decode. SFX lists the files for each sound; one is picked at random
     and its pitch varied a little, so repeats don't sound mechanical. */
  const SFX = { pulse:['pulse1','pulse2','pulse3'], rail:['rail1'], launch:['launch1','launch2'],
    hull:['hull1','hull2','hull3'], pop:['pop1'], boomL:['boom4'], rumble:['rumble'] };   // beams and shields have been synthesized since v65
  const bufs={}; let lastPdcHit=0, lastPdcShield=0, lastMiss=0;
  let labRate=1;   // v90: the sound lab's pitch (1 in the game)
  /* v94: the battle drums. The score's percussion is the taiko ensemble from js/taiko-battle-drums.js (Jon), ported into
     the score's own scheduler so it shares its clock, tempo, reverb and the music bus (M mutes it, the music slider sets
     it). Its intensity, 0 to 3, follows the battle: the floor comes from the mood (menu 0, your turn 1, enemy turn 2), and
     events lift it: weapons fire to 2 for DRUMS.fireHold s, a kill to 3 for DRUMS.killHold s, and a side down to two ships
     or fewer holds 3. It rises at the next bar and falls one level a bar. Times are the audio clock, not timeScale, so
     the big-moment slow motion never drags the music. */
  const DRUMS = { fireHold:4, killHold:6, gain:0.9, drive:2.2, makeup:1.0, verb:0.14, calm:0.7, lowShelf:6 };   // calm: the level-0 and level-1 drums' share   // v97: louder, through their own punchy bus
  let drumLv=0, drumRose=false, lastFire=-99, lastKill=-99, lastStand=false, drumPreview=null;
  /* v92: the effects chain. Every voice now goes into fx.in, not straight to the sfx bus. fx.in feeds the bus dry, plus
     two parallel sends: drive (a tanh waveshaper, for grit and weight) and verb (a short, dark, synthesized room, for the
     report after a crack and the roll of an explosion). A voice can also send to either on its own ({drive, verb}) and
     sit in the stereo field ({pan}). FX sets the sends for every sound: 0 keeps the game exactly as before v92; the
     sound lab tries other values without touching the game. */
  const FX = { drive:0.6, verb:0.3, spread:0.65 };   // v93: Jon's settings from the sound lab   // spread: each voice panned at random up to this far (0 to 1)
  let fx=null, shapeCurve=null, irBuf=null, spread=FX.spread;
  function makeFx(dest, drive, verb){
    const inp=ctx.createGain(); inp.connect(dest);
    const dIn=ctx.createGain(), sh=ctx.createWaveShaper(), dOut=ctx.createGain(); sh.curve=shapeCurve; sh.oversample='2x'; dOut.gain.value=0.55;
    dIn.connect(sh); sh.connect(dOut); dOut.connect(dest);
    const vIn=ctx.createGain(), cv=ctx.createConvolver(); cv.buffer=irBuf; vIn.connect(cv); cv.connect(dest);
    const gd=ctx.createGain(); gd.gain.value=drive; inp.connect(gd); gd.connect(dIn);
    const gv=ctx.createGain(); gv.gain.value=verb; inp.connect(gv); gv.connect(vIn);
    return {in:inp, dist:dIn, verb:vIn}; }
  function buildFx(){
    shapeCurve=new Float32Array(1024); const k=3; for(let i=0;i<1024;i++){ const x=i/511.5-1; shapeCurve[i]=Math.tanh(k*x)/Math.tanh(k); }
    const sr=ctx.sampleRate, len=Math.floor(sr*1.6), pre=Math.floor(sr*0.012); irBuf=ctx.createBuffer(2,len,sr);
    for(let c=0;c<2;c++){ const d=irBuf.getChannelData(c); let lp=0;
      for(let i=pre;i<len;i++){ const k2=(i-pre)/(len-pre); lp+= (Math.random()*2-1 - lp)*(0.5-0.42*k2); d[i]=lp*Math.exp(-k2*5.5); } }   // darker as it decays
    fx=makeFx(sfx, FX.drive, FX.verb); }
  // where a voice's gain stage goes: the chain's input, panned when asked or when the lab spreads voices, plus its own sends
  function route(g, {drive=0, verb=0, pan=null, dry=false}={}){
    if(dry){ g.connect(sfx); return; }   // v93: interface sounds skip the chain: no grit, no room, centred
    let p=pan; if(p===null && spread>0) p=(Math.random()*2-1)*spread;
    if(p && ctx.createStereoPanner){ const pn=ctx.createStereoPanner(); pn.pan.value=clamp(p,-1,1); g.connect(pn); pn.connect(fx.in); } else g.connect(fx.in);
    if(drive){ const d=ctx.createGain(); d.gain.value=drive; g.connect(d); d.connect(fx.dist); }
    if(verb){ const v=ctx.createGain(); v.gain.value=verb; g.connect(v); v.connect(fx.verb); } }
  // from SFX_DATA (js/sfxdata.js), not fetch(): a page opened from a file can't fetch its own assets, so v63's sounds
  // were silently missing there
  const b64=s=>{ const bin=atob(s), a=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i); return a.buffer; };
  function loadSfx(){ if(typeof SFX_DATA==='undefined') return;
    for(const n of new Set(Object.values(SFX).flat())) if(SFX_DATA[n])
      new Promise((ok,no)=>ctx.decodeAudioData(b64(SFX_DATA[n]),ok,no)).then(b=>{ bufs[n]=b; }).catch(()=>{}); }
  function sample(key, {gain=1, rate=1, vary=0.06, delay=0, dur=0, drive=0, verb=0, pan=null}={}){   // dur: fade out and stop after this long
    if(!ctx) return false; const list=SFX[key].filter(n=>bufs[n]); if(!list.length) return false;
    const src=ctx.createBufferSource(); src.buffer=bufs[list[Math.floor(Math.random()*list.length)]]; src.playbackRate.value=rate*labRate*(1+(Math.random()*2-1)*vary);
    const g=ctx.createGain(), t=now()+delay; g.gain.setValueAtTime(gain,t); src.connect(g); route(g,{drive,verb,pan}); src.start(t);
    if(dur){ g.gain.setTargetAtTime(0.0001, t+dur*0.55, dur*0.15); src.stop(t+dur+0.1); } return true; }
  // v66: a synthesized explosion: a short crack, a band of rumbling noise that darkens as it decays, a falling sub tone,
  // and a crackle of debris. Used for warhead and torpedo hits and the blasts inside a dying ship, so none of them
  // share the recorded explosions that a ship's death uses.
  function blast(dur, {gain=0.3, lo=60, bright=3000, crack=0.5, delay=0}={}){
    noise(0.08,{type:'highpass',f0:2500,f1:900,gain:gain*0.45,delay});
    noise(dur,{type:'lowpass',f0:bright,f1:150,gain,attack:0.015,delay});
    tone(dur*0.9,{type:'sine',f0:lo,f1:lo*0.45,gain:gain*1.1,attack:0.012,delay});
    if(crack) crackle(dur*0.8,{gain:gain*crack*0.5,f:1400,density:28,delay:delay+0.05}); }
  // v93: struck metal by modal synthesis: a click excites a set of inharmonic partials (the ratios of a struck plate),
  // each ringing down on its own, over a bright noise burst; base is the lowest partial in Hz
  function metal(base, {gain=0.2, decay=0.5, delay=0, drive=0.3, verb=0.25, parts=[1,2.32,4.25,6.63,9.38,12.1], bright=1}={}){   // bright scales the click and the noise burst (v96)
    noise(0.012,{type:'highpass',f0:4000,f1:2000,gain:gain*1.6*bright,attack:0.001,delay,drive});
    noise(0.09,{type:'bandpass',f0:3200*(0.5+bright*0.5),f1:1400*(0.5+bright*0.5),q:1.5,gain:gain*1.1*bright,attack:0.002,delay,drive});
    parts.forEach((r,i)=>tone(decay*(1-i*0.11),{type:'sine',f0:base*r*(1+(Math.random()-0.5)*0.03),gain:gain*0.5/(1+i*0.6),attack:0.002,delay,verb}));
    tone(0.16,{type:'sine',f0:120,f1:50,gain:gain*1.2,attack:0.003,delay,drive}); }
  // v93: an electric discharge: noise through a sharp band-pass whose centre jumps at random every 25 ms, a gated buzz,
  // crackle and fizz. Used for the beam, a beam on a hull and a beam on shields
  // grit (v96, 0 to 1) scales the crackle, the drive and the band-pass sharpness: 1 is the full v93 discharge
  function discharge(dur, {gain=0.2, delay=0, tail=0.25, grit=1}={}){ if(!ctx) return; const t=now()+delay, T=dur+tail;
    const src=ctx.createBufferSource(); src.buffer=noiseBuf; src.loop=true;
    const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=2+5*grit;
    for(let x=0;x<T;x+=0.025) bp.frequency.setValueAtTime((900+Math.random()*3600)*labRate, t+x);
    const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(gain,t+0.02); g.gain.setValueAtTime(gain,t+dur); g.gain.exponentialRampToValueAtTime(0.0001,t+T);
    src.connect(bp); bp.connect(g); route(g,{drive:0.5*grit, verb:0.3}); src.start(t, Math.random()); src.stop(t+T+0.05);
    const o=ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=58*labRate; const gate=ctx.createOscillator(); gate.type='square'; gate.frequency.value=31;
    const bz=ctx.createGain(); bz.gain.setValueAtTime(0.0001,t); bz.gain.exponentialRampToValueAtTime(gain*0.22*grit+0.0002,t+0.03); bz.gain.setValueAtTime(gain*0.22*grit+0.0002,t+dur); bz.gain.exponentialRampToValueAtTime(0.0001,t+T);
    // v96 fix: the gate's depth follows the buzz level (it was a fixed 0.5, so the buzz ran near full scale whatever its level)
    const gg=ctx.createGain(); gg.gain.value=gain*0.22*grit; gate.connect(gg); gg.connect(bz.gain); o.connect(bz); route(bz,{drive:0.6*grit}); [o,gate].forEach(x=>{ x.start(t); x.stop(t+T+0.05); });
    crackle(dur,{gain:gain*0.9*grit,f:3500,density:Math.max(15,120*grit),delay}); noise(T,{type:'highpass',f0:6000,f1:4000,gain:gain*0.25*grit,attack:0.02,delay}); }
  // v93: one concussive boom: a sharp transient, a driven low noise burst and a sub drop
  function concuss(delay, {gain=0.3, lo=70, len=0.5, verb=0.4}={}){
    noise(0.03,{type:'highpass',f0:2500,f1:900,gain:gain*0.5,attack:0.001,delay,drive:0.5});
    noise(len,{type:'lowpass',f0:1600,f1:90,gain,attack:0.004,delay,drive:0.7,verb});
    tone(len*1.1,{type:'sine',f0:lo,f1:lo*0.4,gain:gain*1.2,attack:0.004,delay}); }
  // electric crackle: a spray of tiny band-passed noise bursts at random moments
  function crackle(dur, {gain=0.15, f=3500, density=50, delay=0}={}){ const n=Math.max(3,Math.round(dur*density));
    for(let i=0;i<n;i++){ const k=Math.random(); noise(0.008+Math.random()*0.025, {type:'bandpass', f0:f*(0.6+Math.random()*0.9), f1:f*0.5, q:1.2, gain:gain*(0.3+Math.random()*0.7)*(1-k*0.5), delay:delay+k*dur}); } }
  function noise(dur, {type='lowpass', f0=2000, f1=200, q=1, gain=0.5, attack=0.005, delay=0, drive=0, verb=0, pan=null}={}){
    if(!ctx) return; const t=now()+delay;
    const src=ctx.createBufferSource(); src.buffer=noiseBuf; src.loop=true;
    const flt=ctx.createBiquadFilter(); flt.type=type; flt.Q.value=q; flt.frequency.setValueAtTime(f0*labRate,t); flt.frequency.exponentialRampToValueAtTime(Math.max(20,f1*labRate), t+dur);
    const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(gain,t+attack); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    src.connect(flt); flt.connect(g); route(g,{drive,verb,pan}); src.start(t, Math.random()); src.stop(t+dur+0.05);
  }
  function tone(dur, {type='sine', f0=440, f1=null, gain=0.3, attack=0.005, delay=0, dest=null, drive=0, verb=0, pan=null, dry=false}={}){
    if(!ctx) return; const t=now()+delay;
    const o=ctx.createOscillator(); o.type=type; o.frequency.setValueAtTime(f0*labRate,t); if(f1) o.frequency.exponentialRampToValueAtTime(f1*labRate,t+dur);
    const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(gain,t+attack); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g); if(dest) g.connect(dest); else route(g,{drive,verb,pan,dry}); o.start(t); o.stop(t+dur+0.05);
  }
  const S = {
    init,
    get on(){ return on; },
    get musicOn(){ return musicOn; },
    _dbg(){ return {ctx, music, sfx, samples:Object.keys(bufs).length, of:new Set(Object.values(SFX).flat()).size}; },
    // v90: the sound lab (?sfx, js/sfxlab.js) plays one sound through its own gain stage and with every sample rate and
    // synthesized frequency scaled by `rate`, without touching the game's levels. The beam's hum and shimmer use their own
    // oscillators, so only its ignition and fizz follow the pitch control.
    // v92: and through its own copy of the effects chain, with the lab's master drive, reverb and stereo spread
    labPlay(fn, {gain=1, rate=1, drive=FX.drive, verb=FX.verb, width=FX.spread}={}){ init(); if(!ctx || !fx) return; const bus=ctx.createGain(); bus.gain.value=gain; bus.connect(sfx);
      const keep=fx; fx=makeFx(bus, drive, verb); labRate=rate; spread=width; try{ fn(); } finally{ fx=keep; labRate=1; spread=FX.spread; } },
    toggle(){ on=!on; store.set('sound',on); if(sfx) sfx.gain.setTargetAtTime(on?fv():0, now(), 0.05); return on; },
    get musicLevel(){ return musicLevel; }, get fxLevel(){ return fxLevel; },
    setMusicLevel(v){ musicLevel=clamp(v,0,1); store.set('musicVol',musicLevel); if(music && musicOn) music.gain.setTargetAtTime(mv(), now(), 0.08); },
    setFxLevel(v){ fxLevel=clamp(v,0,1); store.set('fxVol',fxLevel); if(sfx && on) sfx.gain.setTargetAtTime(fv(), now(), 0.05); },
    toggleMusic(){ musicOn=!musicOn; store.set('music',musicOn); if(music) music.gain.setTargetAtTime(musicOn?mv():0, now(), musicOn?0.8:0.15); return musicOn; },
    setMood(m){ if(m===mood) return; if(m==='battle' && mood==='menu') pendingJump=8; mood=m; },
    ui(){ tone(0.06,{dry:true,type:'triangle',f0:1300,f1:900,gain:0.08}); },
    select(){ tone(0.09,{dry:true,type:'triangle',f0:660,f1:990,gain:0.1}); tone(0.07,{dry:true,type:'sine',f0:1320,gain:0.05,delay:0.05}); },
    deny(){ tone(0.14,{dry:true,type:'square',f0:140,f1:110,gain:0.06}); },
    move(){ noise(1.1,{type:'lowpass',f0:300,f1:120,gain:0.35,attack:0.15}); tone(1.0,{type:'sawtooth',f0:55,f1:48,gain:0.06,attack:0.2}); },
    // v65 (Jon): the railgun charges (a rising whine over RAIL_CHARGE seconds, fxRail waits as long), then fires with a thump
    // v91 (Jon, sound lab): a slower charge, pitched down a tenth, with electric crackle building over it; the shot is a
    // low-pitched crack (a sharp transient over a short, dark body) rather than v66's thump
    rail(){ duck(0.55,RAIL_CHARGE+0.5); const c=RAIL_CHARGE;
      tone(c,{type:'sine',f0:162,f1:2340,gain:0.05,attack:c*0.8}); tone(c,{type:'square',f0:81,f1:1170,gain:0.012,attack:c*0.8}); noise(c,{type:'bandpass',f0:540,f1:4500,q:4,gain:0.08,attack:c*0.85});
      crackle(c*0.55,{gain:0.05,f:4200,density:35,delay:c*0.2}); crackle(c*0.35,{gain:0.1,f:3200,density:90,delay:c*0.62});
      // v93 (Jon: the sniper-rifle reference, keeping the charge): a hard click, a driven crack, a deep body, and the report
      // ringing out through the room with a slapback
      sample('rail',{gain:0.4,rate:0.5,delay:c,vary:0.04});
      noise(0.006,{type:'highpass',f0:5000,f1:3000,gain:0.7,attack:0.0008,delay:c,drive:0.8});
      noise(0.14,{type:'bandpass',f0:2200,f1:420,q:1,gain:0.55,attack:0.002,delay:c,drive:0.9,verb:0.7});
      tone(0.4,{type:'sine',f0:110,f1:38,gain:0.45,attack:0.003,delay:c,drive:0.3}); tone(0.18,{type:'sawtooth',f0:180,f1:60,gain:0.08,attack:0.002,delay:c,drive:0.6});
      noise(0.5,{type:'lowpass',f0:1800,f1:120,gain:0.16,attack:0.01,delay:c+0.09,verb:0.8});   // the report
      crackle(0.18,{gain:0.08,f:2000,density:70,delay:c+0.01}); },
    pulse(){ if(sample('pulse',{gain:0.5,vary:0.1})) return; tone(0.1,{type:'square',f0:980,f1:180,gain:0.09}); noise(0.08,{type:'bandpass',f0:3000,f1:900,q:2,gain:0.12}); },
    // v65: an energy beam: a short ignition, a detuned resonant hum with a slow filter sweep, and a fizz of energy over it
    // v93 (Jon: the electric-discharge reference): a short ignition, then a hard plasma discharge for the length of the beam,
    // trailing off (replaces v65's detuned hum and v67's shimmer)
    // v96 (Jon: the beam laser and the EW ship's light beam were far too loud and static): about half the level and a third
    // of the grit, scaled by the weapon (weight: light beam 0.4, beam laser 0.7, heavy beam 1), with a smooth low hum
    // under it so it still reads as a beam
    beam(dur=0.9, weight=0.7){ if(!ctx) return; const w=clamp(weight,0.3,1);
      tone(0.22,{type:'sine',f0:520,f1:160,gain:0.07+0.05*w}); noise(0.04,{type:'highpass',f0:4000,f1:2000,gain:0.08+0.08*w,attack:0.001});
      discharge(dur,{gain:0.1+0.12*w, tail:0.4, grit:0.2+0.15*w}); tone(dur+0.3,{type:'sawtooth',f0:98,f1:92,gain:0.04+0.035*w,attack:0.06,verb:0.3}); },
    // v65: a fast missile leaving the tube: a quick rising whoosh and a whine, a little of the thruster recording for body
    missile(){ noise(0.45,{type:'bandpass',f0:900,f1:5200,q:2.5,gain:0.22,attack:0.02}); noise(0.3,{type:'highpass',f0:6000,f1:3000,gain:0.07}); tone(0.35,{type:'sawtooth',f0:420,f1:1700,gain:0.018}); sample('launch',{gain:0.22,rate:2.2,dur:0.35,vary:0.1}); },
    fighter(){ noise(1.0,{type:'bandpass',f0:1200,f1:3200,q:4,gain:0.12,attack:0.2}); },
    // v68 (Jon): point defense as a gatling: the barrels spin up with a motor whine, then a fast, even stream of rounds
    // (each a sharp crack with a little low thump), slightly uneven in pitch and level, and a spin-down
    pdc(){ if(!ctx) return; const n=18, gap=0.038, spin=0.12, len=spin+n*gap;
      tone(len+0.3,{type:'sawtooth',f0:110,f1:230,gain:0.018,attack:spin}); tone(len+0.3,{type:'triangle',f0:220,f1:460,gain:0.012,attack:spin});
      for(let i=0;i<n;i++){ const d=spin+i*gap+(Math.random()-0.5)*0.006, v=0.75+Math.random()*0.35;
        noise(0.03,{type:'bandpass',f0:2200+Math.random()*1400,f1:900,q:1.4,gain:0.17*v,attack:0.002,delay:d});
        tone(0.035,{type:'square',f0:190+Math.random()*40,f1:70,gain:0.028*v,attack:0.002,delay:d}); } },
    // v65 (Jon): what a hull hit sounds like depends on what hit it
    hit(kind){
      // v93 (Jon: the Metal 02 reference): each PDC round a short, bright metal strike, base pitch varied per round; still
      // thinned so a burst doesn't stack up (v74)
      if(kind==='pdc'){ if(!ctx) return; const t=now(); if(t-lastPdcHit<0.09) return; lastPdcHit=t;
        // v96 (Jon): lower and heavier, a metallic thump: a lower struck plate, less click, a low body
        metal(210+Math.random()*90,{gain:0.17,decay:0.32,drive:0.35,verb:0.15,parts:[1,2.32,4.25,6.63],bright:0.45});
        tone(0.15,{type:'sine',f0:115,f1:52,gain:0.24,attack:0.002}); noise(0.08,{type:'lowpass',f0:900,f1:180,gain:0.13,attack:0.002}); return; }
      // v93 (Jon: the TNT heavy-blast reference): one huge concussion, a long low rolling tail through the room, debris crackle
      if(kind==='torpedo'){ concuss(0,{gain:0.42,lo:52,len:0.9,verb:0.6}); blast(1.4,{gain:0.3,lo:45,bright:1600,crack:1});
        noise(2.6,{type:'lowpass',f0:700,f1:50,gain:0.22,attack:0.05,delay:0.1,verb:0.6}); sample('rumble',{gain:0.35,rate:1.0,vary:0.05});
        tone(2.0,{type:'sine',f0:48,f1:18,gain:0.4,attack:0.01}); crackle(1.6,{gain:0.07,f:1800,density:25,delay:0.3}); return; }
      // v91: missiles and strike craft land as small explosions with a report: a sharp crack on the impact, then the blast
      if(kind==='missile' || kind==='fighter'){ const F=kind==='fighter';
        if(!sample('pop',{gain:F?0.22:0.3,rate:F?1.15:0.95,vary:0.1})) noise(0.05,{type:'highpass',f0:3200,f1:1500,gain:0.3,attack:0.001});
        noise(0.05,{type:'highpass',f0:3000,f1:1400,gain:F?0.2:0.28,attack:0.001}); tone(0.08,{type:'square',f0:F?340:300,f1:80,gain:0.04});
        blast(F?0.5:0.65,{gain:F?0.2:0.25,lo:F?85:70,bright:F?3000:2600,crack:F?0.5:0.6,delay:0.015}); return; }
      if(kind==='beam'){ discharge(0.6,{gain:0.2, tail:0.25}); crackle(0.5,{gain:0.06,f:1500,density:60}); return; }   // v93: the discharge burning into the hull
      if(kind==='pulse'){ sample('hull',{gain:0.6,rate:0.85,vary:0.12}); sample('pop',{gain:0.25,rate:1.8,vary:0.15}); noise(0.12,{type:'lowpass',f0:4000,f1:400,gain:0.35}); tone(0.14,{type:'sine',f0:140,f1:55,gain:0.3}); return; }   // a punchy blast
      // v93 (Jon: the Metal 01 reference, pitch 1.05): a slug striking plate: a heavy, ringing metal hit with the hull recording under it
      if(kind==='rail'){ metal(441,{gain:0.24,decay:0.7,drive:0.35,verb:0.35}); sample('hull',{gain:0.35,rate:0.8,vary:0.08}); tone(0.35,{type:'sine',f0:95,f1:35,gain:0.35}); return; }
      // v91 (Jon): the generic hull hit rips metal: the hull recording, a resonant tearing rasp, a rattle and a short ring
      if(!sample('hull',{gain:0.7,rate:0.72,vary:0.1})) noise(0.25,{type:'lowpass',f0:2500,f1:200,gain:0.3});
      noise(0.4,{type:'bandpass',f0:2400,f1:600,q:5,gain:0.17,attack:0.004}); crackle(0.35,{gain:0.12,f:1500,density:90});
      tone(0.5,{type:'triangle',f0:520,f1:470,gain:0.025}); tone(0.45,{type:'triangle',f0:1310,f1:1240,gain:0.015}); tone(0.2,{type:'sine',f0:90,f1:40,gain:0.2}); },
    // v93 (Jon: the energy-ricochet reference): a direct-fire shot that misses glances away. v96 (Jon: the pitched zip
    // whistled like a bird on pulse and PDC misses): no tone at all now, just a noise streak sweeping down past one side,
    // shorter, darker and quieter for PDC rounds
    miss(kind){ if(!ctx) return; const t=now(), P=kind==='pdc'; if(t-lastMiss<(P?0.15:0.08)) return; lastMiss=t;
      const p=(Math.random()<0.5?-1:1)*(0.4+Math.random()*0.5), f=1800+Math.random()*1200;
      noise(P?0.09:0.2,{type:'bandpass',f0:P?f*0.7:f,f1:P?f*0.35:f*0.3,q:2.2,gain:P?0.05:0.08,attack:P?0.004:0.012,pan:p,verb:0.3});
      noise(P?0.06:0.12,{type:'highpass',f0:5000,f1:2500,gain:P?0.015:0.025,attack:0.006,pan:p}); },
    intercept(){ if(sample('pop',{gain:0.45,rate:1.35,vary:0.12})) return; noise(0.2,{type:'lowpass',f0:3000,f1:300,gain:0.2}); },
    alarm(){ crackle(0.3,{gain:0.14,f:3000,density:60}); tone(0.3,{type:'square',f0:62,f1:48,gain:0.03}); },   // v66: a system shorting out (was a two-tone beep that read as a doorbell)
    // v66: the blasts running along a dying ship before it goes up
    burst(){ blast(0.35,{gain:0.15,lo:90,bright:2400,crack:0.4}); sample('pop',{gain:0.18,rate:0.9+Math.random()*0.4,vary:0}); },
    // v65 (Jon): shields crackle with static when hit; a beam holds them longer
    shield(kind){
      if(kind==='pdc'){ if(!ctx) return; const t=now(); if(t-lastPdcShield<0.1) return; lastPdcShield=t; crackle(0.08,{gain:0.1,f:4000,density:60}); return; }
      // v69 (Jon): a warhead on a shield is an explosion close to its hull hit, a little brighter and softer, with a
      // short shield shimmer (a falling resonant tone) instead of the full static, which read as a crunch
      if(kind==='torpedo' || kind==='missile' || kind==='fighter'){ const T=kind==='torpedo';
        blast(T?0.8:0.5,{gain:T?0.24:0.17, lo:T?60:80, bright:T?2800:3200, crack:0.2}); tone(0.35,{type:'sine',f0:T?260:320,f1:T?120:150,gain:0.05}); crackle(0.15,{gain:0.07,f:4000,density:50}); return; }
      if(kind==='beam'){ discharge(0.5,{gain:0.17, tail:0.2}); tone(0.4,{type:'sine',f0:300,f1:140,gain:0.04}); return; }   // v93 (Jon): the discharge on the shield
      // v96 (Jon: a slug on shields rang like a cowbell): a short electrical static shot, far gentler than a beam, no pitched tone
      if(kind==='rail'){ noise(0.12,{type:'bandpass',f0:2200,f1:700,q:1.5,gain:0.3,attack:0.002,drive:0.3,verb:0.3}); crackle(0.25,{gain:0.14,f:3000,density:80});
        tone(0.22,{type:'sine',f0:150,f1:60,gain:0.24,attack:0.003}); noise(0.3,{type:'highpass',f0:5000,f1:3500,gain:0.06,attack:0.01}); return; }
      const d=0.22; crackle(d,{gain:0.18,f:3500,density:70}); tone(d,{type:'sawtooth',f0:120,f1:110,gain:0.022}); tone(0.06,{type:'square',f0:2400,f1:800,gain:0.03}); },
    boom(size=1){ duck(0.35,1.2);
      // v93 (Jon): a medium hull goes up in stacked, concussive booms; a capital in fast consecutive booms that ring out
      // (a low, slowly fading ring through the room). Both lead into the recorded explosion below
      const tierN= size<0.9? 0 : size<1.8? 1 : 2;
      if(tierN===1){ [0,0.17,0.36].forEach((d,i)=>concuss(d,{gain:0.24+i*0.05,lo:75-i*8,len:0.45+i*0.1,verb:0.45})); }
      if(tierN===2){ for(let i=0;i<6;i++) concuss(i*0.11+Math.random()*0.03,{gain:0.2+i*0.03,lo:70-i*4,len:0.4,verb:0.6});
        [55,82.5,110,165].forEach((f,i)=>tone(3.2-i*0.4,{type:'sine',f0:f,f1:f*0.97,gain:0.07/(1+i*0.5),attack:0.05,delay:0.25,verb:0.8})); }
      // size is about a ship's length over 2.2: Patrol craft ~0.5, Destroyer ~1.6, Dreadnought ~2.8; asteroids 1.1
      // v67 (Jon): every hull uses the capital explosion he liked, pitched up and quieter as ships get smaller; the short
      // recordings used for small and medium hulls clipped and cut off. Levels are lower all round so stacks don't clip.
      const tier= size<0.9? 0 : size<1.8? 1 : 2, P=[{rate:1.45,gain:0.36,rumble:0,sub:0.16},{rate:1.2,gain:0.48,rumble:0.3,sub:0.22},{rate:1,gain:0.6,rumble:0.5,sub:0.3}][tier];
      if(sample('boomL',{gain:P.gain, rate:P.rate, vary:0.05})){ if(P.rumble) sample('rumble',{gain:P.rumble, rate:tier===1?1.2:1, vary:0}); tone(0.9+0.5*size,{type:'sine',f0:70,f1:22,gain:P.sub,attack:0.01}); if(tier===0) blast(0.6,{gain:0.12,lo:90,bright:2400,crack:0.4}); return; }
      noise(1.2+size, {type:'lowpass',f0:1400,f1:40,gain:0.7,attack:0.01}); tone(1.2*size,{type:'sine',f0:70,f1:22,gain:0.7}); noise(0.3,{type:'highpass',f0:3000,f1:800,gain:0.25}); },
    // v94: what the battle tells the drums. drum('fire') on every volley, drum('kill') on a kill, drum('stand', bool) when a
    // side is down to two ships or fewer; drumHit(kind) a one-shot on the music bus (silent with the music off)
    drum(ev, v){ if(!ctx) return; const t=ctx.currentTime; if(ev==='fire') lastFire=t; else if(ev==='kill') lastKill=t; else if(ev==='stand') lastStand=!!v; },
    drumHit(kind, vel=1){ if(!ctx || !musicOn || !drumOne || !DRUM_KINDS[kind]) return; drumOne(kind, vel); },
    drumPreview(lv, secs=12){ init(); if(!ctx) return; drumPreview= lv===null? null : {lv, until:ctx.currentTime+secs}; },
    get drumLevel(){ return drumLv; },
    power(){ tone(0.5,{type:'sine',f0:220,f1:880,gain:0.1}); tone(0.5,{type:'triangle',f0:330,f1:1320,gain:0.05,delay:0.05}); },
    turn(side){ const base = side==='player'?392:262; [0,0.12].forEach((d,i)=>tone(0.45,{dry:true,type:'triangle',f0:base*(i?1.5:1),gain:0.09,delay:d})); },
    // v63 stings: a rising fanfare that resolves into a held chord; defeat falls to a low minor chord over a rumble
    win(){ duck(0.2,3.5); [392,494,587,784].forEach((f,i)=>tone(0.9,{dry:true,type:'triangle',f0:f,gain:0.1,delay:i*0.14}));
      [392,494,587,784,988].forEach(f=>{ tone(2.6,{dry:true,type:'triangle',f0:f,gain:0.06,attack:0.25,delay:0.6}); tone(2.6,{dry:true,type:'sine',f0:f*2,gain:0.02,attack:0.3,delay:0.6}); }); tone(2.8,{dry:true,type:'sine',f0:98,gain:0.12,attack:0.3,delay:0.6}); },
    lose(){ duck(0.2,3.5); sample('rumble',{gain:0.6,rate:0.8,vary:0}); [330,277,247,196].forEach((f,i)=>tone(1.0,{dry:true,type:'sawtooth',f0:f,gain:0.04,delay:i*0.2}));
      [196,233,294].forEach(f=>tone(3.0,{dry:true,type:'triangle',f0:f,gain:0.06,attack:0.4,delay:0.8})); tone(3.2,{dry:true,type:'sine',f0:49,gain:0.14,attack:0.4,delay:0.8}); },
  };
  // v94: the drum voices (from js/taiko-battle-drums.js); wet is each one's share of the score's hall reverb
  // v97 (Jon: hit harder, more Battlestar): each kind is played as an ensemble (players, a few ms apart and slightly detuned,
  // so every stroke is thick), with a beater click, a body that drops in pitch, a second body partial and the skin noise
  const DRUM_KINDS = {
    odaiko:{ f0:86,  f1:31,  dur:1.8,  g:1.0,  p2:1.6, click:0.12, nHz:180,  nQ:0.7, nAmt:0.55, nType:'bandpass', nDur:0.16, players:4, sub:0.8 },   // v98: lower, longer, a sub layer
    chu:   { f0:150, f1:62,  dur:0.7,  g:0.85, p2:1.7, click:0.25, nHz:480,  nQ:0.8, nAmt:0.55, nType:'bandpass', nDur:0.1,  players:3, sub:0.3 },
    shime: { f0:380, f1:230, dur:0.18, g:0.5,  p2:2.1, click:0.6,  nHz:2600, nQ:0.9, nAmt:0.8,  nType:'bandpass', nDur:0.05, players:2 },
    ka:    { f0:950, f1:720, dur:0.05, g:0.3,  p2:0,   click:0.9,  nHz:1900, nQ:0.5, nAmt:1.0,  nType:'highpass', nDur:0.05, players:2 },
  };
  let drumOne=null, drumBus=null;   // the score's drum voice, for one-shot hits outside the patterns (set in startMusic)
  /* ---------- cinematic score: generative, scheduled with lookahead ---------- */
  function startMusic(){
    if(!ctx || musicNodes) return;
    musicNodes = true;
    // reverb bus (generated hall impulse)
    const len=Math.floor(ctx.sampleRate*4.6), ir=ctx.createBuffer(2,len,ctx.sampleRate);   // v95: a longer hall
    for(let c=0;c<2;c++){ const d=ir.getChannelData(c); for(let i=0;i<len;i++){ const k=i/len; d[i]=(Math.random()*2-1)*Math.pow(1-k,2.6)*(i<ctx.sampleRate*0.02?i/(ctx.sampleRate*0.02):1); } }
    const verb=ctx.createConvolver(); verb.buffer=ir; const revIn=ctx.createGain(); revIn.gain.value=1.05; revIn.connect(verb); verb.connect(music);
    const dry=ctx.createGain(); dry.gain.value=1; dry.connect(music);
    const out=(node, wet)=>{ node.connect(dry); const s=ctx.createGain(); s.gain.value=wet; node.connect(s); s.connect(revIn); };
    // v97: the drums' own bus, close and punchy: soft saturation, a fast compressor and makeup gain, straight to the music
    // bus with only a little of the hall (the score's voices sit in the hall; the drums sit in front of them)
    drumBus=ctx.createGain(); { const sh=ctx.createWaveShaper(), cv=new Float32Array(1024), kd=DRUMS.drive; for(let i=0;i<1024;i++){ const x=i/511.5-1; cv[i]=Math.tanh(kd*x)/Math.tanh(kd); } sh.curve=cv;
      const cp=ctx.createDynamicsCompressor(); cp.threshold.value=-20; cp.knee.value=4; cp.ratio.value=5; cp.attack.value=0.004; cp.release.value=0.12;
      const ls=ctx.createBiquadFilter(); ls.type='lowshelf'; ls.frequency.value=140; ls.gain.value=DRUMS.lowShelf; const hc=ctx.createBiquadFilter(); hc.type='lowpass'; hc.frequency.value=7000;   // v98: more low end, softer top
      const mk=ctx.createGain(); mk.gain.value=DRUMS.makeup; drumBus.connect(ls); ls.connect(hc); hc.connect(sh); sh.connect(cp); cp.connect(mk); mk.connect(dry); const ws=ctx.createGain(); ws.gain.value=DRUMS.verb; mk.connect(ws); ws.connect(revIn); }
    const mf=m=>440*Math.pow(2,(m-69)/12);
    const env=(g,t,a,peak,hold,rel)=>{ g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(peak,t+a); g.gain.setValueAtTime(peak,t+a+hold); g.gain.exponentialRampToValueAtTime(0.0001,t+a+hold+rel); };
    const osc=(type,f,t,stop,detune=0)=>{ const o=ctx.createOscillator(); o.type=type; o.frequency.value=f; o.detune.value=detune; o.start(t); o.stop(stop); return o; };

    const I = {
      choir(t,notes,dur,vel){ notes.forEach(m=>{ const g=ctx.createGain(), f1=ctx.createBiquadFilter(), f2=ctx.createBiquadFilter(), lp=ctx.createBiquadFilter();
          f1.type='bandpass'; f1.frequency.value=720; f1.Q.value=2.5; f2.type='bandpass'; f2.frequency.value=1150; f2.Q.value=3; lp.type='lowpass'; lp.frequency.value=2400;
          [-12,0,11].forEach(d=>{ const o=osc('sawtooth',mf(m),t,t+dur+2.5,d); o.connect(f1); o.connect(f2); });
          f1.connect(lp); f2.connect(lp); lp.connect(g); env(g,t,1.1,0.035*vel,Math.max(0,dur-1.1),2.0); out(g,0.75); }); },
      horn(t,m,dur,vel){ const g=ctx.createGain(), f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.setValueAtTime(500,t); f.frequency.linearRampToValueAtTime(1900,t+0.12);
        const o1=osc('sawtooth',mf(m),t,t+dur+0.6), o2=osc('triangle',mf(m),t,t+dur+0.6,4);
        const vib=osc('sine',5.2,t,t+dur+0.6), vg=ctx.createGain(); vg.gain.setValueAtTime(0,t); vg.gain.linearRampToValueAtTime(mf(m)*0.006,t+0.35); vib.connect(vg); vg.connect(o1.frequency); vg.connect(o2.frequency);
        o1.connect(f); o2.connect(f); f.connect(g); env(g,t,0.06,0.07*vel,dur*0.75,0.45); out(g,0.5); },
      bass(t,m,dur,vel){ const g=ctx.createGain(), f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=260;
        osc('sawtooth',mf(m),t,t+dur+0.2).connect(f); osc('sine',mf(m-12),t,t+dur+0.2).connect(f); f.connect(g); env(g,t,0.01,0.16*vel,dur*0.5,dur*0.5); out(g,0.1); },
      // v95: cinematic voices. pad: slow-swelling strings; drone: a low pedal; pulse: short low strings; braam: a low,
      // dense brass hit whose filter tears open
      pad(t,notes,dur,vel){ notes.forEach(m=>{ const g=ctx.createGain(), f=ctx.createBiquadFilter(); f.type='lowpass'; f.Q.value=0.7;
          f.frequency.setValueAtTime(500,t); f.frequency.linearRampToValueAtTime(700+vel*1100,t+dur*0.4);
          [-11,0,11].forEach(d=>osc('sawtooth',mf(m),t,t+dur+2.5,d).connect(f)); f.connect(g); env(g,t,dur*0.35,0.022*vel,dur*0.3,2.2); out(g,0.65); }); },
      drone(t,m,dur){ const g=ctx.createGain(), f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=230;
        osc('sawtooth',mf(m),t,t+dur+3).connect(f); osc('sawtooth',mf(m),t,t+dur+3,7).connect(f); osc('sine',mf(m-12),t,t+dur+3).connect(f);
        f.connect(g); env(g,t,2.0,0.09,Math.max(0,dur-2),3.0); out(g,0.5); },
      pulse(t,m,dur,vel){ const g=ctx.createGain(), f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=520+vel*300;
        [-7,7].forEach(d=>osc('sawtooth',mf(m),t,t+dur+0.2,d).connect(f)); f.connect(g); env(g,t,0.008,0.05*vel,dur*0.35,0.18); out(g,0.25); },
      braam(t,notes,dur,vel){ notes.forEach((m,i)=>{ const g=ctx.createGain(), f=ctx.createBiquadFilter(); f.type='lowpass'; f.Q.value=1.4;
          f.frequency.setValueAtTime(140,t); f.frequency.exponentialRampToValueAtTime(1500*vel,t+0.22); f.frequency.exponentialRampToValueAtTime(420,t+dur);
          [-16,-5,6,17].forEach(d=>osc('sawtooth',mf(m),t,t+dur+1.2,d).connect(f)); f.connect(g); env(g,t,0.05,0.05*vel/(1+i*0.3),dur*0.45,dur*0.6+0.4); out(g,0.55); });
        const sg=ctx.createGain(); osc('sine',mf(notes[0]-12),t,t+dur+1).connect(sg); env(sg,t,0.03,0.18*vel,dur*0.4,dur*0.6); out(sg,0.3); },
      // v94: the taiko ensemble (voices from js/taiko-battle-drums.js): a pitch-dropping body and a filtered skin attack
      drum(kind,t,vel){ const k=DRUM_KINDS[kind], v0=Math.min(1.2,vel)*k.g*DRUMS.gain/Math.sqrt(k.players);
        for(let pl=0; pl<k.players; pl++){ const tt=t+(pl? Math.random()*0.011 : 0), dt=1+(Math.random()-0.5)*0.05, v=v0*(pl? 0.8+Math.random()*0.2 : 1);
          const o=osc('sine',k.f0*dt,tt,tt+k.dur+0.05); o.frequency.setValueAtTime(k.f0*dt,tt); o.frequency.exponentialRampToValueAtTime(k.f1*dt,tt+Math.min(0.14,k.dur*0.22));
          const og=ctx.createGain(); og.gain.setValueAtTime(0.0001,tt); og.gain.exponentialRampToValueAtTime(v,tt+0.003); og.gain.exponentialRampToValueAtTime(0.0001,tt+k.dur); o.connect(og); og.connect(drumBus);
          if(k.sub){ const o3=osc('sine',k.f1*1.35*dt,tt,tt+k.dur+0.1); o3.frequency.exponentialRampToValueAtTime(k.f1*0.9*dt,tt+k.dur*0.6); const g3=ctx.createGain();   // v98: the felt sub
            g3.gain.setValueAtTime(0.0001,tt); g3.gain.exponentialRampToValueAtTime(v*k.sub,tt+0.012); g3.gain.exponentialRampToValueAtTime(0.0001,tt+k.dur*1.05); o3.connect(g3); g3.connect(drumBus); }
          if(k.p2){ const o2=osc('sine',k.f0*k.p2*dt,tt,tt+k.dur*0.5); o2.frequency.exponentialRampToValueAtTime(k.f1*k.p2*dt,tt+0.1); const g2=ctx.createGain();
            g2.gain.setValueAtTime(0.0001,tt); g2.gain.exponentialRampToValueAtTime(v*0.35,tt+0.003); g2.gain.exponentialRampToValueAtTime(0.0001,tt+k.dur*0.45); o2.connect(g2); g2.connect(drumBus); }
          const n=ctx.createBufferSource(); n.buffer=noiseBuf; const nf=ctx.createBiquadFilter(); nf.type=k.nType; nf.frequency.value=k.nHz; nf.Q.value=k.nQ;
          const ng=ctx.createGain(); ng.gain.setValueAtTime(v*k.nAmt,tt); ng.gain.exponentialRampToValueAtTime(0.0001,tt+k.nDur); n.connect(nf); nf.connect(ng); ng.connect(drumBus); n.start(tt,Math.random()*0.5); n.stop(tt+k.nDur+0.02);
          const c=ctx.createBufferSource(); c.buffer=noiseBuf; const cf=ctx.createBiquadFilter(); cf.type='highpass'; cf.frequency.value=3000;   // the beater
          const cg=ctx.createGain(); cg.gain.setValueAtTime(v*k.click,tt); cg.gain.exponentialRampToValueAtTime(0.0001,tt+0.012); c.connect(cf); cf.connect(cg); cg.connect(drumBus); c.start(tt,Math.random()*0.5); c.stop(tt+0.03); } },
      boom(t){ const g=ctx.createGain(); const o=osc('sine',60,t,t+3); o.frequency.exponentialRampToValueAtTime(34,t+2.5); o.connect(g); env(g,t,0.005,0.6,0.1,2.4); out(g,0.6);
        const n=ctx.createBufferSource(); n.buffer=noiseBuf; const f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.setValueAtTime(900,t); f.frequency.exponentialRampToValueAtTime(80,t+1.5); const ng=ctx.createGain(); n.connect(f); f.connect(ng); env(ng,t,0.005,0.35,0.05,1.4); out(ng,0.8); n.start(t); n.stop(t+2); },
      riser(t,dur){ const n=ctx.createBufferSource(); n.buffer=noiseBuf; n.loop=true; const f=ctx.createBiquadFilter(); f.type='bandpass'; f.Q.value=2; f.frequency.setValueAtTime(300,t); f.frequency.exponentialRampToValueAtTime(7000,t+dur);
        const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.12,t+dur); g.gain.linearRampToValueAtTime(0.0001,t+dur+0.05); n.connect(f); f.connect(g); out(g,0.6); n.start(t); n.stop(t+dur+0.1); },
    };

    // v95 (Jon: more cinematic, less upbeat): D minor, a chord every two bars over a low D pedal: i bVI iv i, i bVI bII i
    // (the Eb is the Phrygian flat two, the dread chord). No major lift and no theme tune.
    const CH=[[50,53,57],[46,50,53],[43,46,50],[50,53,57],[50,53,57],[46,50,53],[51,55,58],[50,53,57]];
    const MOTIF=[[0,62,6],[6,65,2],[8,64,8]];   // three low horn notes, only at full intensity
    const ACC=new Set([0,3,6,8,11,14]);
    drumOne=(kind,vel)=>{ const t=ctx.currentTime+0.01; I.drum(kind,t,vel); };
    const BPM=72, STEP=60/BPM/4;
    let step=0, nextT=ctx.currentTime+0.25, barOffset=0;
    // v94: patterns from js/taiko-battle-drums.js, 16 steps a bar, 4-bar phrases; X accent, x hit, g ghost, . rest
    // patterns: levels 0 and 1 from js/taiko-battle-drums.js, 16 steps a bar (a 32-step row plays at double time, v97);
    // X accent, x hit, g ghost, . rest; 4-bar phrases
    const DRUM_P = {
      0:{ odaiko:['X...............','................','....X...........','................'] },   // tension, a slow heartbeat
      1:{ odaiko:['X.....x.X.......','X.....x.........','X.....x.X.......','X.....x...x.x...'],          // stalking
          chu:   ['................','....x.......x...','................','....x.......x.x.'] },
      // v98 (Jon: more low end, less busy, like the New Caprica battle in Exodus): weight over speed. Big low hits with
      // space, the chu doubling the odaiko on the unison accents, the shime and ka only in the fill at a phrase's end
      2:{ odaiko:['X.....X...X.....','X.....X...X...x.','X.....X...X.....','X.....X...X.X.XX'],          // battle
          chu:   ['X.....X...X.....','..........x.....','X.....X...X.....','..........X.X.XX'],
          shime: ['................','................','................','............xxxx'] },
      3:{ odaiko:['X..X..X.X...X.x.','X..X..X.X...X...','X..X..X.X...X.x.','X..X..X.XXxXXXXX'],          // full assault
          chu:   ['X..X..X.....X...','X..X..X.....X.x.','X..X..X.....X...','X..X..X.XxXxXXXX'],
          shime: ['................','................','................','........ggxxxxXX'],
          ka:    ['................','................','................','X..X..X.........'] },
    };
    const DRUM_VEL = { X:1.0, x:0.72, g:0.32 };
    // the level for the coming bar: the mood's floor, raised by recent fire, a recent kill, a last stand or a lab preview;
    // up at once, down one level a bar
    function drumBar(){ const now=ctx.currentTime;
      let want= mood==='menu'? 0 : mood==='enemy'? 2 : 1;
      if(now-lastFire<DRUMS.fireHold) want=Math.max(want,2);
      if(now-lastKill<DRUMS.killHold || (lastStand && mood!=='menu')) want=3;
      if(drumPreview && now<drumPreview.until) want=drumPreview.lv;
      const was=drumLv; drumLv= want>drumLv? want : want<drumLv? drumLv-1 : drumLv; drumRose= drumLv>was; }

    // v95: the whole score follows the battle's intensity (drumLv, set once a bar by drumBar), not a fixed 32-bar cycle:
    // 0 drone, pads and choir; 1 adds the bass and the drums' heartbeat; 2 adds a low string pulse, braams at phrase starts
    // and risers; 3 drives the pulse harder, adds a braam whenever it arrives and a sparse low horn motif. The drums carry
    // the energy throughout, Battlestar style, over dark, slow-moving harmony.
    function schedule(s,t){
      const bar=Math.floor(s/16), st=s%16, sb=bar+barOffset;
      const menu= mood==='menu', endMood= mood==='end';
      if(st===0 && !endMood) drumBar();
      const lv=drumLv, ch=CH[Math.floor(sb/2)%8], root=ch[0]-12, chordStart= st===0 && sb%2===0;
      if(st===0 && sb%4===0) I.drone(t, 38, STEP*64);
      if(chordStart){ I.pad(t, ch, STEP*32, menu? 0.5 : 0.6+lv*0.15); I.choir(t, ch.map(m=>m+12), STEP*32, menu? 0.7 : lv===3? 1 : 0.8);
        if(!menu && !endMood && lv>=1) I.bass(t, root, STEP*30, 0.6+lv*0.12); }
      if(endMood) return;
      if(st===0 && ((lv>=2 && sb%4===0) || (lv===3 && drumRose))) I.braam(t, [root-12, root, root+7], STEP*12, lv===3? 1 : 0.8);
      if(st===0 && (menu? sb%8===0 : lv<=1? sb%4===0 : chordStart)) I.boom(t);
      if(lv>=2 && st%2===0){ const v=(ACC.has(st)?1:0.55)*(lv===3?1:0.8); I.pulse(t, root, STEP*1.6, v); if(lv===3 && st%4===0) I.pulse(t, root+12, STEP*1.6, v*0.6); }
      if(lv===3 && sb%8===0) for(const [o,m,l] of MOTIF) if(o===st) I.horn(t, m, STEP*l, 0.85);
      if(lv>=2 && sb%8===6 && st===0) I.riser(t, STEP*32);
      // percussion (v94): the taiko ensemble at the battle's intensity
      const pat=DRUM_P[lv], ph=bar%4, quiet=(menu? 0.6 : 1)*(lv<=1? DRUMS.calm : 1);
      for(const kind in pat){ const row=pat[kind][ph], dbl= row.length===32;   // v97: 32-step rows play two steps per score step
        for(let h=0; h<(dbl?2:1); h++){ const c=row[dbl? st*2+h : st]; if(c==='.' || c===undefined) continue;
          I.drum(kind, Math.max(ctx.currentTime, t+h*STEP/2+(Math.random()-0.5)*0.008), DRUM_VEL[c]*(0.92+Math.random()*0.16)*quiet); } }
    }
    setInterval(()=>{
      if(!ctx) return;
      if(nextT < ctx.currentTime-0.2) nextT=ctx.currentTime+0.05;    // tab was throttled: skip ahead instead of bursting
      while(nextT < ctx.currentTime+0.18){
        if(musicOn && ctx.state==='running') schedule(step,nextT);
        if(pendingJump!==null && step%16===15){ const bar=Math.floor((step+1)/16); barOffset = ((pendingJump-bar)%32+32)%32; pendingJump=null; }
        step++; nextT+=STEP;
      }
    }, 40);
    music.gain.setTargetAtTime(musicOn?mv():0, ctx.currentTime, 1.5);
  }
  return S;
})();

