// Laniakea's Edge: synthesized sound effects and the generative score.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

/* ---------------- audio ---------------- */
const Sound = (() => {
  let ctx=null, master, sfx, music, noiseBuf, on = store.get('sound', true), musicOn = store.get('music', true), musicNodes=null, mood='menu', pendingJump=null;
  // volumes (v44): the Settings sliders scale the music and the effects, 0 to 1, remembered across visits
  let musicLevel=clamp(+store.get('musicVol',0.8)||0,0,1), fxLevel=clamp(+store.get('fxVol',1)||0,0,1);
  const mv=()=>0.42*musicLevel*1.25, fv=()=>0.9*fxLevel;
  function duck(level,hold){ if(!ctx||!musicOn) return; const t=ctx.currentTime; music.gain.cancelScheduledValues(t); music.gain.setTargetAtTime(mv()*level,t,0.03); music.gain.setTargetAtTime(mv(),t+hold,0.5); }
  function init(){
    if(ctx) { if(ctx.state==='suspended') ctx.resume(); return; }
    try{ ctx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return; }
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value=-14; comp.ratio.value=4; comp.connect(master);
    sfx = ctx.createGain(); sfx.gain.value=on?fv():0; sfx.connect(comp);
    music = ctx.createGain(); music.gain.value=0.0; music.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate*2, ctx.sampleRate);
    const d=noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    startMusic();
  }
  const now = () => ctx.currentTime;
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
    _dbg(){ return {ctx, music, sfx}; },
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
    rail(){ duck(0.55,0.5); tone(0.25,{type:'sine',f0:180,f1:900,gain:0.08}); noise(0.35,{type:'highpass',f0:6000,f1:1500,gain:0.35,delay:0.25}); tone(0.5,{type:'sine',f0:120,f1:35,gain:0.6,delay:0.25}); noise(0.6,{type:'lowpass',f0:1800,f1:120,gain:0.4,delay:0.26}); },
    pulse(){ tone(0.1,{type:'square',f0:980,f1:180,gain:0.09}); noise(0.08,{type:'bandpass',f0:3000,f1:900,q:2,gain:0.12}); },
    beam(dur=0.9){ if(!ctx) return; const t=now();
      const o1=ctx.createOscillator(), o2=ctx.createOscillator(); o1.type='sawtooth'; o2.type='sawtooth'; o1.frequency.value=110; o2.frequency.value=221;
      const f=ctx.createBiquadFilter(); f.type='bandpass'; f.Q.value=3; f.frequency.setValueAtTime(400,t); f.frequency.exponentialRampToValueAtTime(2200,t+dur);
      const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.16,t+0.06); g.gain.setValueAtTime(0.16,t+dur-0.12); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
      const lfo=ctx.createOscillator(); lfo.frequency.value=22; const lg=ctx.createGain(); lg.gain.value=0.05; lfo.connect(lg); lg.connect(g.gain);
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(sfx); [o1,o2,lfo].forEach(o=>{o.start(t); o.stop(t+dur+0.05);}); },
    missile(){ noise(0.7,{type:'bandpass',f0:500,f1:2600,q:1.5,gain:0.25,attack:0.05}); tone(0.12,{type:'triangle',f0:300,f1:120,gain:0.08}); },
    fighter(){ noise(1.0,{type:'bandpass',f0:1200,f1:3200,q:4,gain:0.12,attack:0.2}); },
    pdc(){ if(!ctx) return; for(let i=0;i<9;i++) noise(0.03,{type:'highpass',f0:2500,f1:2000,gain:0.12,delay:i*0.035}); },
    hit(){ noise(0.25,{type:'lowpass',f0:2500,f1:200,gain:0.3}); tone(0.2,{type:'sine',f0:90,f1:40,gain:0.3}); },
    shield(){ tone(0.35,{type:'sine',f0:880,f1:660,gain:0.07}); tone(0.35,{type:'sine',f0:1320,f1:990,gain:0.05}); noise(0.2,{type:'bandpass',f0:4000,f1:2000,q:3,gain:0.08}); },
    boom(size=1){ duck(0.35,1.2); noise(1.2+size, {type:'lowpass',f0:1400,f1:40,gain:0.7,attack:0.01}); tone(1.2*size,{type:'sine',f0:70,f1:22,gain:0.7}); noise(0.3,{type:'highpass',f0:3000,f1:800,gain:0.25}); },
    power(){ tone(0.5,{type:'sine',f0:220,f1:880,gain:0.1}); tone(0.5,{type:'triangle',f0:330,f1:1320,gain:0.05,delay:0.05}); },
    turn(side){ const base = side==='player'?392:262; [0,0.12].forEach((d,i)=>tone(0.45,{type:'triangle',f0:base*(i?1.5:1),gain:0.09,delay:d})); },
    win(){ [392,494,587,784].forEach((f,i)=>tone(0.9,{type:'triangle',f0:f,gain:0.1,delay:i*0.14})); },
    lose(){ [330,277,247,196].forEach((f,i)=>tone(1.0,{type:'sawtooth',f0:f,gain:0.05,delay:i*0.2})); },
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

