// Laniakea's Edge: synthesized sound effects and the generative score.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

/* ---------------- audio ---------------- */
const RAIL_CHARGE = 0.55;   // v65: seconds a railgun charges before it fires; fxRail (rules.js) waits as long
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
    startMusic(); loadSfx();
  }
  const now = () => ctx.currentTime;
  /* v63 (Jon): recorded effects (Kenney, CC0, see assets/CREDITS.md) over or instead of the synthesized ones, which
     stay as the fallback when a file can't load or decode. SFX lists the files for each sound; one is picked at random
     and its pitch varied a little, so repeats don't sound mechanical. */
  const SFX = { pulse:['pulse1','pulse2','pulse3'], rail:['rail1'], launch:['launch1','launch2'],
    hull:['hull1','hull2','hull3'], pop:['pop1'], boomL:['boom4'], rumble:['rumble'] };   // beams and shields have been synthesized since v65
  const bufs={};
  // from SFX_DATA (js/sfxdata.js), not fetch(): a page opened from a file can't fetch its own assets, so v63's sounds
  // were silently missing there
  const b64=s=>{ const bin=atob(s), a=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i); return a.buffer; };
  function loadSfx(){ if(typeof SFX_DATA==='undefined') return;
    for(const n of new Set(Object.values(SFX).flat())) if(SFX_DATA[n])
      new Promise((ok,no)=>ctx.decodeAudioData(b64(SFX_DATA[n]),ok,no)).then(b=>{ bufs[n]=b; }).catch(()=>{}); }
  function sample(key, {gain=1, rate=1, vary=0.06, delay=0, dur=0}={}){   // dur: fade out and stop after this long
    if(!ctx) return false; const list=SFX[key].filter(n=>bufs[n]); if(!list.length) return false;
    const src=ctx.createBufferSource(); src.buffer=bufs[list[Math.floor(Math.random()*list.length)]]; src.playbackRate.value=rate*(1+(Math.random()*2-1)*vary);
    const g=ctx.createGain(), t=now()+delay; g.gain.setValueAtTime(gain,t); src.connect(g); g.connect(sfx); src.start(t);
    if(dur){ g.gain.setTargetAtTime(0.0001, t+dur*0.55, dur*0.15); src.stop(t+dur+0.1); } return true; }
  // v66: a synthesized explosion: a short crack, a band of rumbling noise that darkens as it decays, a falling sub tone,
  // and a crackle of debris. Used for warhead and torpedo hits and the blasts inside a dying ship, so none of them
  // share the recorded explosions that a ship's death uses.
  function blast(dur, {gain=0.3, lo=60, bright=3000, crack=0.5, delay=0}={}){
    noise(0.08,{type:'highpass',f0:2500,f1:900,gain:gain*0.45,delay});
    noise(dur,{type:'lowpass',f0:bright,f1:150,gain,attack:0.015,delay});
    tone(dur*0.9,{type:'sine',f0:lo,f1:lo*0.45,gain:gain*1.1,attack:0.012,delay});
    if(crack) crackle(dur*0.8,{gain:gain*crack*0.5,f:1400,density:28,delay:delay+0.05}); }
  // electric crackle: a spray of tiny band-passed noise bursts at random moments
  function crackle(dur, {gain=0.15, f=3500, density=50, delay=0}={}){ const n=Math.max(3,Math.round(dur*density));
    for(let i=0;i<n;i++){ const k=Math.random(); noise(0.008+Math.random()*0.025, {type:'bandpass', f0:f*(0.6+Math.random()*0.9), f1:f*0.5, q:1.2, gain:gain*(0.3+Math.random()*0.7)*(1-k*0.5), delay:delay+k*dur}); } }
  function noise(dur, {type='lowpass', f0=2000, f1=200, q=1, gain=0.5, attack=0.005, delay=0}={}){
    if(!ctx) return; const t=now()+delay;
    const src=ctx.createBufferSource(); src.buffer=noiseBuf; src.loop=true;
    const flt=ctx.createBiquadFilter(); flt.type=type; flt.Q.value=q; flt.frequency.setValueAtTime(f0,t); flt.frequency.exponentialRampToValueAtTime(Math.max(20,f1), t+dur);
    const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(gain,t+attack); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    src.connect(flt); flt.connect(g); g.connect(sfx); src.start(t, Math.random()); src.stop(t+dur+0.05);
  }
  function tone(dur, {type='sine', f0=440, f1=null, gain=0.3, attack=0.005, delay=0, dest=null}={}){
    if(!ctx) return; const t=now()+delay;
    const o=ctx.createOscillator(); o.type=type; o.frequency.setValueAtTime(f0,t); if(f1) o.frequency.exponentialRampToValueAtTime(f1,t+dur);
    const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(gain,t+attack); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g); g.connect(dest||sfx); o.start(t); o.stop(t+dur+0.05);
  }
  const S = {
    init,
    get on(){ return on; },
    get musicOn(){ return musicOn; },
    _dbg(){ return {ctx, music, sfx, samples:Object.keys(bufs).length}; },
    toggle(){ on=!on; store.set('sound',on); if(sfx) sfx.gain.setTargetAtTime(on?fv():0, now(), 0.05); return on; },
    get musicLevel(){ return musicLevel; }, get fxLevel(){ return fxLevel; },
    setMusicLevel(v){ musicLevel=clamp(v,0,1); store.set('musicVol',musicLevel); if(music && musicOn) music.gain.setTargetAtTime(mv(), now(), 0.08); },
    setFxLevel(v){ fxLevel=clamp(v,0,1); store.set('fxVol',fxLevel); if(sfx && on) sfx.gain.setTargetAtTime(fv(), now(), 0.05); },
    toggleMusic(){ musicOn=!musicOn; store.set('music',musicOn); if(music) music.gain.setTargetAtTime(musicOn?mv():0, now(), musicOn?0.8:0.15); return musicOn; },
    setMood(m){ if(m===mood) return; if(m==='battle' && mood==='menu') pendingJump=8; mood=m; },
    ui(){ tone(0.06,{type:'triangle',f0:1300,f1:900,gain:0.08}); },
    select(){ tone(0.09,{type:'triangle',f0:660,f1:990,gain:0.1}); tone(0.07,{type:'sine',f0:1320,gain:0.05,delay:0.05}); },
    deny(){ tone(0.14,{type:'square',f0:140,f1:110,gain:0.06}); },
    move(){ noise(1.1,{type:'lowpass',f0:300,f1:120,gain:0.35,attack:0.15}); tone(1.0,{type:'sawtooth',f0:55,f1:48,gain:0.06,attack:0.2}); },
    // v65 (Jon): the railgun charges (a rising whine over RAIL_CHARGE seconds, fxRail waits as long), then fires with a thump
    rail(){ duck(0.55,RAIL_CHARGE+0.5); const c=RAIL_CHARGE;
      tone(c,{type:'sine',f0:180,f1:2600,gain:0.05,attack:c*0.8}); tone(c,{type:'square',f0:90,f1:1300,gain:0.012,attack:c*0.8}); noise(c,{type:'bandpass',f0:600,f1:5000,q:4,gain:0.08,attack:c*0.85});
      sample('rail',{gain:0.75,rate:0.55,delay:c,vary:0.04}); tone(0.7,{type:'sine',f0:75,f1:26,gain:0.75,attack:0.006,delay:c}); noise(0.45,{type:'lowpass',f0:700,f1:60,gain:0.4,delay:c}); },   // v66: a low thump
    pulse(){ if(sample('pulse',{gain:0.5,vary:0.1})) return; tone(0.1,{type:'square',f0:980,f1:180,gain:0.09}); noise(0.08,{type:'bandpass',f0:3000,f1:900,q:2,gain:0.12}); },
    // v65: an energy beam: a short ignition, a detuned resonant hum with a slow filter sweep, and a fizz of energy over it
    beam(dur=0.9){ if(!ctx) return; const t=now();
      tone(0.22,{type:'sine',f0:520,f1:160,gain:0.08});
      const o1=ctx.createOscillator(), o2=ctx.createOscillator(), o3=ctx.createOscillator(); o1.type='sawtooth'; o2.type='sawtooth'; o3.type='sine'; o1.frequency.value=98; o2.frequency.value=98.8; o3.frequency.value=49;
      const f=ctx.createBiquadFilter(); f.type='lowpass'; f.Q.value=6; f.frequency.value=900;
      const flfo=ctx.createOscillator(); flfo.frequency.value=7; const fg=ctx.createGain(); fg.gain.value=260; flfo.connect(fg); fg.connect(f.frequency);
      const tail=0.7;   // v67: the hum trails off after the beam instead of stopping with it
      const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.13,t+0.08); g.gain.setValueAtTime(0.13,t+dur*0.75); g.gain.exponentialRampToValueAtTime(0.0001,t+dur+tail);
      const tl=ctx.createOscillator(); tl.frequency.value=38; const tg=ctx.createGain(); tg.gain.value=0.025; tl.connect(tg); tg.connect(g.gain);
      o1.connect(f); o2.connect(f); o3.connect(f); f.connect(g); g.connect(sfx); [o1,o2,o3,flfo,tl].forEach(o=>{ o.start(t); o.stop(t+dur+tail+0.05); });
      // v67 (Jon): a high shimmer over the hum: two detuned sines with a slow vibrato, trailing off with it
      const h1=ctx.createOscillator(), h2=ctx.createOscillator(); h1.type=h2.type='sine'; h1.frequency.value=2093; h2.frequency.value=2111;
      const vib=ctx.createOscillator(); vib.frequency.value=5; const vg=ctx.createGain(); vg.gain.value=9; vib.connect(vg); vg.connect(h1.frequency); vg.connect(h2.frequency);
      const hg=ctx.createGain(); hg.gain.setValueAtTime(0.0001,t); hg.gain.exponentialRampToValueAtTime(0.03,t+0.12); hg.gain.setValueAtTime(0.03,t+dur*0.75); hg.gain.exponentialRampToValueAtTime(0.0001,t+dur+tail);
      h1.connect(hg); h2.connect(hg); hg.connect(sfx); [h1,h2,vib].forEach(o=>{ o.start(t); o.stop(t+dur+tail+0.05); });
      crackle(dur*0.9,{gain:0.05,f:6000,density:25}); },
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
      if(kind==='torpedo'){ blast(0.95,{gain:0.3,lo:55,bright:2000,crack:0.8}); blast(0.45,{gain:0.12,lo:90,bright:2600,crack:0.3,delay:0.14}); return; }   // v66: a heavy warhead, its own sound
      if(kind==='missile' || kind==='fighter'){ blast(0.55,{gain:0.2,lo:75,bright:2600}); return; }   // v66: a small explosion, gentler, no recording
      if(kind==='beam'){ noise(0.7,{type:'highpass',f0:3500,f1:2500,gain:0.12,attack:0.05}); crackle(0.65,{gain:0.12,f:2500,density:45}); noise(0.6,{type:'bandpass',f0:900,f1:500,q:3,gain:0.06,attack:0.05}); return; }   // burning, sizzling
      if(kind==='pulse'){ sample('hull',{gain:0.6,rate:0.85,vary:0.12}); sample('pop',{gain:0.25,rate:1.8,vary:0.15}); noise(0.12,{type:'lowpass',f0:4000,f1:400,gain:0.35}); tone(0.14,{type:'sine',f0:140,f1:55,gain:0.3}); return; }   // a punchy blast
      if(kind==='rail'){ sample('pop',{gain:0.35,rate:0.75,vary:0.1}); noise(0.45,{type:'bandpass',f0:3200,f1:500,q:2.5,gain:0.25,attack:0.005}); tone(0.3,{type:'sawtooth',f0:260,f1:70,gain:0.06}); tone(0.35,{type:'sine',f0:95,f1:35,gain:0.4}); crackle(0.35,{gain:0.15,f:2200,density:60}); return; }   // v66: a slug ripping into metal
      if(sample('hull',{gain:0.75,rate:0.72,vary:0.1})){ tone(0.2,{type:'sine',f0:90,f1:40,gain:0.18}); return; } noise(0.25,{type:'lowpass',f0:2500,f1:200,gain:0.3}); tone(0.2,{type:'sine',f0:90,f1:40,gain:0.3}); },
    intercept(){ if(sample('pop',{gain:0.45,rate:1.35,vary:0.12})) return; noise(0.2,{type:'lowpass',f0:3000,f1:300,gain:0.2}); },
    alarm(){ crackle(0.3,{gain:0.14,f:3000,density:60}); tone(0.3,{type:'square',f0:62,f1:48,gain:0.03}); },   // v66: a system shorting out (was a two-tone beep that read as a doorbell)
    // v66: the blasts running along a dying ship before it goes up
    burst(){ blast(0.35,{gain:0.15,lo:90,bright:2400,crack:0.4}); sample('pop',{gain:0.18,rate:0.9+Math.random()*0.4,vary:0}); },
    // v65 (Jon): shields crackle with static when hit; a beam holds them longer
    shield(kind){
      // v69 (Jon): a warhead on a shield is an explosion close to its hull hit, a little brighter and softer, with a
      // short shield shimmer (a falling resonant tone) instead of the full static, which read as a crunch
      if(kind==='torpedo' || kind==='missile' || kind==='fighter'){ const T=kind==='torpedo';
        blast(T?0.8:0.5,{gain:T?0.24:0.17, lo:T?60:80, bright:T?2800:3200, crack:0.2}); tone(0.35,{type:'sine',f0:T?260:320,f1:T?120:150,gain:0.05}); crackle(0.15,{gain:0.07,f:4000,density:50}); return; }
      const d= kind==='beam'? 0.55 : 0.22; crackle(d,{gain:0.18,f:3500,density:70}); tone(d,{type:'sawtooth',f0:120,f1:110,gain:0.022}); tone(0.06,{type:'square',f0:2400,f1:800,gain:0.03}); },
    boom(size=1){ duck(0.35,1.2);
      // size is about a ship's length over 2.2: Patrol craft ~0.5, Destroyer ~1.6, Dreadnought ~2.8; asteroids 1.1
      // v67 (Jon): every hull uses the capital explosion he liked, pitched up and quieter as ships get smaller; the short
      // recordings used for small and medium hulls clipped and cut off. Levels are lower all round so stacks don't clip.
      const tier= size<0.9? 0 : size<1.8? 1 : 2, P=[{rate:1.45,gain:0.36,rumble:0,sub:0.16},{rate:1.2,gain:0.48,rumble:0.3,sub:0.22},{rate:1,gain:0.6,rumble:0.5,sub:0.3}][tier];
      if(sample('boomL',{gain:P.gain, rate:P.rate, vary:0.05})){ if(P.rumble) sample('rumble',{gain:P.rumble, rate:tier===1?1.2:1, vary:0}); tone(0.9+0.5*size,{type:'sine',f0:70,f1:22,gain:P.sub,attack:0.01}); if(tier===0) blast(0.6,{gain:0.12,lo:90,bright:2400,crack:0.4}); return; }
      noise(1.2+size, {type:'lowpass',f0:1400,f1:40,gain:0.7,attack:0.01}); tone(1.2*size,{type:'sine',f0:70,f1:22,gain:0.7}); noise(0.3,{type:'highpass',f0:3000,f1:800,gain:0.25}); },
    power(){ tone(0.5,{type:'sine',f0:220,f1:880,gain:0.1}); tone(0.5,{type:'triangle',f0:330,f1:1320,gain:0.05,delay:0.05}); },
    turn(side){ const base = side==='player'?392:262; [0,0.12].forEach((d,i)=>tone(0.45,{type:'triangle',f0:base*(i?1.5:1),gain:0.09,delay:d})); },
    // v63 stings: a rising fanfare that resolves into a held chord; defeat falls to a low minor chord over a rumble
    win(){ duck(0.2,3.5); [392,494,587,784].forEach((f,i)=>tone(0.9,{type:'triangle',f0:f,gain:0.1,delay:i*0.14}));
      [392,494,587,784,988].forEach(f=>{ tone(2.6,{type:'triangle',f0:f,gain:0.06,attack:0.25,delay:0.6}); tone(2.6,{type:'sine',f0:f*2,gain:0.02,attack:0.3,delay:0.6}); }); tone(2.8,{type:'sine',f0:98,gain:0.12,attack:0.3,delay:0.6}); },
    lose(){ duck(0.2,3.5); sample('rumble',{gain:0.6,rate:0.8,vary:0}); [330,277,247,196].forEach((f,i)=>tone(1.0,{type:'sawtooth',f0:f,gain:0.04,delay:i*0.2}));
      [196,233,294].forEach(f=>tone(3.0,{type:'triangle',f0:f,gain:0.06,attack:0.4,delay:0.8})); tone(3.2,{type:'sine',f0:49,gain:0.14,attack:0.4,delay:0.8}); },
  };
  /* ---------- cinematic score: generative, scheduled with lookahead ---------- */
  function startMusic(){
    if(!ctx || musicNodes) return;
    musicNodes = true;
    // reverb bus (generated hall impulse)
    const len=Math.floor(ctx.sampleRate*3.4), ir=ctx.createBuffer(2,len,ctx.sampleRate);
    for(let c=0;c<2;c++){ const d=ir.getChannelData(c); for(let i=0;i<len;i++){ const k=i/len; d[i]=(Math.random()*2-1)*Math.pow(1-k,2.6)*(i<ctx.sampleRate*0.02?i/(ctx.sampleRate*0.02):1); } }
    const verb=ctx.createConvolver(); verb.buffer=ir; const revIn=ctx.createGain(); revIn.gain.value=0.9; revIn.connect(verb); verb.connect(music);
    const dry=ctx.createGain(); dry.gain.value=1; dry.connect(music);
    const out=(node, wet)=>{ node.connect(dry); const s=ctx.createGain(); s.gain.value=wet; node.connect(s); s.connect(revIn); };
    const mf=m=>440*Math.pow(2,(m-69)/12);
    const env=(g,t,a,peak,hold,rel)=>{ g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(peak,t+a); g.gain.setValueAtTime(peak,t+a+hold); g.gain.exponentialRampToValueAtTime(0.0001,t+a+hold+rel); };
    const osc=(type,f,t,stop,detune=0)=>{ const o=ctx.createOscillator(); o.type=type; o.frequency.value=f; o.detune.value=detune; o.start(t); o.stop(stop); return o; };

    const I = {
      strings(t,m,dur,vel){ const g=ctx.createGain(), f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=900+vel*1400; f.Q.value=0.8;
        [-9,9].forEach(d=>osc('sawtooth',mf(m),t,t+dur+0.3,d).connect(f)); f.connect(g); env(g,t,0.012,0.05*vel,dur*0.35,dur*0.8); out(g,0.22); },
      choir(t,notes,dur,vel){ notes.forEach(m=>{ const g=ctx.createGain(), f1=ctx.createBiquadFilter(), f2=ctx.createBiquadFilter(), lp=ctx.createBiquadFilter();
          f1.type='bandpass'; f1.frequency.value=720; f1.Q.value=2.5; f2.type='bandpass'; f2.frequency.value=1150; f2.Q.value=3; lp.type='lowpass'; lp.frequency.value=2400;
          [-12,0,11].forEach(d=>{ const o=osc('sawtooth',mf(m),t,t+dur+2.5,d); o.connect(f1); o.connect(f2); });
          f1.connect(lp); f2.connect(lp); lp.connect(g); env(g,t,1.1,0.035*vel,Math.max(0,dur-1.1),2.0); out(g,0.75); }); },
      brass(t,notes,dur,vel){ notes.forEach(m=>{ const g=ctx.createGain(), f=ctx.createBiquadFilter(); f.type='lowpass'; f.Q.value=1.2;
          f.frequency.setValueAtTime(260,t); f.frequency.linearRampToValueAtTime(700+1900*vel,t+0.18); f.frequency.exponentialRampToValueAtTime(600+500*vel,t+dur);
          [-6,6].forEach(d=>osc('sawtooth',mf(m),t,t+dur+0.8,d).connect(f)); f.connect(g); env(g,t,0.07,0.045*vel,dur*0.6,dur*0.5+0.3); out(g,0.4); }); },
      horn(t,m,dur,vel){ const g=ctx.createGain(), f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.setValueAtTime(500,t); f.frequency.linearRampToValueAtTime(1900,t+0.12);
        const o1=osc('sawtooth',mf(m),t,t+dur+0.6), o2=osc('triangle',mf(m),t,t+dur+0.6,4);
        const vib=osc('sine',5.2,t,t+dur+0.6), vg=ctx.createGain(); vg.gain.setValueAtTime(0,t); vg.gain.linearRampToValueAtTime(mf(m)*0.006,t+0.35); vib.connect(vg); vg.connect(o1.frequency); vg.connect(o2.frequency);
        o1.connect(f); o2.connect(f); f.connect(g); env(g,t,0.06,0.07*vel,dur*0.75,0.45); out(g,0.5); },
      bass(t,m,dur,vel){ const g=ctx.createGain(), f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=260;
        osc('sawtooth',mf(m),t,t+dur+0.2).connect(f); osc('sine',mf(m-12),t,t+dur+0.2).connect(f); f.connect(g); env(g,t,0.01,0.16*vel,dur*0.5,dur*0.5); out(g,0.1); },
      taiko(t,vel){ const g=ctx.createGain(); const o=osc('sine',110,t,t+0.7); o.frequency.setValueAtTime(115,t); o.frequency.exponentialRampToValueAtTime(42,t+0.35); o.connect(g); env(g,t,0.003,0.5*vel,0.02,0.55); out(g,0.35);
        const n=ctx.createBufferSource(); n.buffer=noiseBuf; const f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=700; const ng=ctx.createGain(); n.connect(f); f.connect(ng); env(ng,t,0.002,0.35*vel,0.01,0.12); out(ng,0.3); n.start(t,Math.random()); n.stop(t+0.3); },
      snare(t,vel){ const n=ctx.createBufferSource(); n.buffer=noiseBuf; const f=ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=1900; f.Q.value=0.7; const g=ctx.createGain(); n.connect(f); f.connect(g); env(g,t,0.002,0.2*vel,0.01,0.16); out(g,0.45); n.start(t,Math.random()); n.stop(t+0.3); },
      boom(t){ const g=ctx.createGain(); const o=osc('sine',60,t,t+3); o.frequency.exponentialRampToValueAtTime(34,t+2.5); o.connect(g); env(g,t,0.005,0.6,0.1,2.4); out(g,0.6);
        const n=ctx.createBufferSource(); n.buffer=noiseBuf; const f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.setValueAtTime(900,t); f.frequency.exponentialRampToValueAtTime(80,t+1.5); const ng=ctx.createGain(); n.connect(f); f.connect(ng); env(ng,t,0.005,0.35,0.05,1.4); out(ng,0.8); n.start(t); n.stop(t+2); },
      riser(t,dur){ const n=ctx.createBufferSource(); n.buffer=noiseBuf; n.loop=true; const f=ctx.createBiquadFilter(); f.type='bandpass'; f.Q.value=2; f.frequency.setValueAtTime(300,t); f.frequency.exponentialRampToValueAtTime(7000,t+dur);
        const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.12,t+dur); g.gain.linearRampToValueAtTime(0.0001,t+dur+0.05); n.connect(f); f.connect(g); out(g,0.6); n.start(t); n.stop(t+dur+0.1); },
    };

    // D minor: i  VI  III  VII  i  VI  iv  V
    const CH=[[50,53,57],[46,50,53],[53,57,60],[48,52,55],[50,53,57],[46,50,53],[55,58,62],[45,49,52]];
    const MEL=[ [[0,69,8],[8,74,8]], [[0,77,6],[6,76,2],[8,74,8]], [[0,72,8],[8,69,8]], [[0,67,12],[12,64,4]],
                [[0,69,4],[4,74,4],[8,77,8]], [[0,79,8],[8,77,4],[12,74,4]], [[0,70,8],[8,74,8]], [[0,73,12],[12,76,4]] ];
    const TAIKO_FULL={0:1,3:.55,6:.8,8:1,10:.45,11:.7,12:.9,14:.6,15:.5}, TAIKO_LIGHT={0:.8,8:.6,11:.4}, TAIKO_WAR={0:1,2:.5,3:.7,4:.9,6:.7,8:1,10:.6,11:.8,12:1,13:.5,14:.8,15:.9};
    const ACC=new Set([0,3,6,8,11,14]);
    const BPM=90, STEP=60/BPM/4;
    let step=0, nextT=ctx.currentTime+0.25, barOffset=0;

    function schedule(s,t){
      const bar=Math.floor(s/16), st=s%16;
      let sb=bar+barOffset;
      if(mood==='menu') sb = sb%16;                  // intro and build only on the title screen
      const sec = Math.floor((sb%32)/8);             // 0 intro, 1 build, 2 full, 3 war
      const ch=CH[sb%8], root=ch[0]-12;
      const endMood = mood==='end';
      const enemy = mood==='enemy';
      // ostinato strings (3-3-2 accents)
      if(!endMood){ const rate = sec===0 ? 2 : 1; if(st%rate===0){ const tones=[root, root+12, ch[2], root+12, ch[1], root+12, ch[2], root+12]; const m=tones[(st/rate|0)%8];
        const v=(ACC.has(st)?1:0.6)*(sec===0?0.55:sec===1?0.75:1)*(enemy?1.05:1); I.strings(t,m,STEP*rate*0.95,v); } }
      if(st===0){
        I.choir(t, ch.map(m=>m+12), STEP*16, sec===2?1:0.8);
        if(sec>=1 && !endMood) I.bass(t, root, STEP*14, 0.9);
        if((sb%4===0 && sec!==3) || (sec===2 && sb%8===0)) I.boom(t);
        if(sec===2 && !endMood) I.brass(t, [ch[0]-12, ch[2]-12, ch[0]], STEP*15, 0.9);
        if(sec===3 && !endMood) I.brass(t, [ch[0]-12, ch[0]], STEP*3, 1);
      }
      if(sec===3 && !endMood && (st===6||st===11)) I.brass(t, [ch[0]-12, ch[0], ch[2]-12], STEP*2.5, 0.8);
      // melody
      if(sec===2 && !endMood){ for(const [o,m,l] of MEL[sb%8]) if(o===st) I.horn(t, m-12, STEP*l, 1); }
      // percussion
      if(!endMood){
        const pat = sec===0 ? (enemy?TAIKO_LIGHT:null) : sec===1 ? (enemy?TAIKO_FULL:TAIKO_LIGHT) : sec===2 ? TAIKO_FULL : TAIKO_WAR;
        if(pat && pat[st]!==undefined) I.taiko(t, pat[st]*(mood==='menu'?0.6:1));
        if(sec>=2 && (st===4||st===12)) I.snare(t, 0.8);
        if(sec===1 && sb%8===7 && st>=8) I.snare(t, 0.25+(st-8)*0.08);   // roll into the full section
        if(sec===1 && sb%8===6 && st===0) I.riser(t, STEP*32);
      }
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

