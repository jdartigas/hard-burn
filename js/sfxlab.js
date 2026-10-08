// Laniakea's Edge: the sound lab (v90). Open the game with ?sfx to audition every game sound on its own, or a weapon's
// firing and impact together with the game's own timing. Each row has volume and pitch sliders and a notes field, all
// remembered in this browser; "Copy notes" gathers every changed row into text to paste back to Claude. Debug only:
// nothing here is reachable without the URL flag, and the sliders never change the game's sounds.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

// each entry: [id, label, what it is in the game, play()]. Sequences schedule their parts on real time.
// a delayed part re-enters Sound.labPlay with the row's volume and pitch (labCur), so the whole sequence follows the sliders
let labCur=null;
const at = (s, f) => { if(!s) return f(); const o=labCur; setTimeout(()=>o? Sound.labPlay(f,o) : f(), s*1000); };
const LAB_SOUNDS = [
  ['Weapons firing', [
    ['rail', 'Railgun', 'charge whine, then the shot (light, standard and spinal)', ()=>Sound.rail()],
    ['pulse', 'Pulse bolt', 'one bolt; a volley fires them 0.13 s apart', ()=>Sound.pulse()],
    ['beam', 'Beam laser', 'Frigate; 0.9 s', ()=>Sound.beam(0.9, 24/34)],
    ['beam-l', 'Light beam', 'EW ship', ()=>Sound.beam(0.9, 14/34)],
    ['beam-h', 'Heavy beam', 'Heavy cruiser, Dreadnought', ()=>Sound.beam(0.9, 1)],
    ['missile', 'Missile or torpedo launch', 'one round leaving the tube', ()=>Sound.missile()],
    ['fighter', 'Strike wing launch', 'once per wing', ()=>Sound.fighter()],
    ['pdc', 'Point defense burst', 'PDCs firing at a warhead', ()=>Sound.pdc()],
  ]],
  ['Hits on a hull', [
    ['hit-rail', 'Railgun slug', '', ()=>Sound.hit('rail')],
    ['hit-pulse', 'Pulse bolt', '', ()=>Sound.hit('pulse')],
    ['hit-beam', 'Beam', '', ()=>Sound.hit('beam')],
    ['hit-missile', 'Missile', '', ()=>Sound.hit('missile')],
    ['hit-torpedo', 'Torpedo', '', ()=>Sound.hit('torpedo')],
    ['hit-fighter', 'Strike wing', '', ()=>Sound.hit('fighter')],
    ['hit-pdc', 'PDC gun rounds', 'thinned so a burst does not stack', ()=>Sound.hit('pdc')],
    ['hit-other', 'Generic hull hit', 'fallback, and splash damage', ()=>Sound.hit('')],
  ]],
  ['Hits on shields', [
    ['sh-rail', 'Railgun slug', '', ()=>Sound.shield('rail')],
    ['sh-pulse', 'Pulse bolt', '', ()=>Sound.shield('pulse')],
    ['sh-beam', 'Beam', 'held longer than other hits', ()=>Sound.shield('beam')],
    ['sh-missile', 'Missile', '', ()=>Sound.shield('missile')],
    ['sh-torpedo', 'Torpedo', '', ()=>Sound.shield('torpedo')],
    ['sh-fighter', 'Strike wing', '', ()=>Sound.shield('fighter')],
    ['sh-pdc', 'PDC gun rounds', '', ()=>Sound.shield('pdc')],
  ]],
  ['Interception', [
    ['intercept', 'Warhead shot down', '', ()=>Sound.intercept()],
  ]],
  ['Explosions and damage', [
    ['boom-s', 'Small ship destroyed', 'Patrol craft', ()=>Sound.boom(0.5)],
    ['boom-m', 'Medium ship destroyed', 'Destroyer', ()=>Sound.boom(1.6)],
    ['boom-l', 'Capital ship destroyed', 'Dreadnought', ()=>Sound.boom(2.8)],
    ['boom-rock', 'Asteroid shattered', '', ()=>Sound.boom(1.1)],
    ['burst', 'Internal blast', 'the blasts along a dying ship, and a magazine cook-off', ()=>Sound.burst()],
    ['alarm', 'System damaged', 'one of your ships loses a system', ()=>Sound.alarm()],
  ]],
  ['Abilities and movement', [
    ['power', 'Ability', 'Hard burn, ECM, PD surge and the rest', ()=>Sound.power()],
    ['overcharge', 'Shield overcharge', '', ()=>Sound.shield()],
    ['move', 'Ship moving', 'drive burn while a ship moves', ()=>Sound.move()],
  ]],
  ['Interface and stings', [
    ['ui', 'Click', '', ()=>Sound.ui()],
    ['select', 'Select a ship', '', ()=>Sound.select()],
    ['deny', 'Refused order', '', ()=>Sound.deny()],
    ['turn-p', 'Your turn', '', ()=>Sound.turn('player')],
    ['turn-e', 'Enemy turn', '', ()=>Sound.turn('enemy')],
    ['win', 'Victory', '', ()=>Sound.win()],
    ['lose', 'Defeat', '', ()=>Sound.lose()],
  ]],
  ['Misses', [
    ['miss', 'Miss (energy ricochet)', 'railgun, beam or pulse glancing away', ()=>Sound.miss('pulse')],
    ['miss-pdc', 'PDC round missing', '', ()=>Sound.miss('pdc')],
  ]],
  ['Music: the score and its battle drums (music bus: needs the music on; volume and pitch sliders do not apply)', [
    ['dr-odaiko', 'Odaiko, the big drum', 'one-shot; also hits on every ship destroyed', ()=>Sound.drumHit('odaiko',1.1)],
    ['dr-chu', 'Chu-daiko', 'one-shot; also hits on every ability', ()=>Sound.drumHit('chu',0.9)],
    ['dr-shime', 'Shime', 'the fast high drum', ()=>Sound.drumHit('shime',1)],
    ['dr-ka', 'Ka, the rim click', '', ()=>Sound.drumHit('ka',1)],
    ['dr-0', 'Score at intensity 0: tension', 'drone, pads and choir, a slow heartbeat. Menu and setup. 12 s from the next bar', ()=>Sound.drumPreview(0)],
    ['dr-1', 'Score at intensity 1: stalking', 'adds the bass and stalking drums. Your turn, nothing happening', ()=>Sound.drumPreview(1)],
    ['dr-2', 'Score at intensity 2: battle', 'low string pulse, braams, risers, driving drums. Enemy turn, and 4 s after any shot', ()=>Sound.drumPreview(2)],
    ['dr-3', 'Score at intensity 3: full assault', 'everything, plus the horn motif. 6 s after a kill, or a side down to two ships', ()=>Sound.drumPreview(3)],
    ['dr-off', 'End the preview', 'back to the level the game sets', ()=>Sound.drumPreview(null)],
  ]],
  ['Spatial (v102): a railgun slug on a hull, from different places', [
    ['sp-left', 'Left of the screen', 'the normal battle view', ()=>Sound.at({pan:-0.85, dist:50, off:false}, ()=>Sound.hit('rail'))],
    ['sp-centre', 'Centre', '', ()=>Sound.at({pan:0, dist:50, off:false}, ()=>Sound.hit('rail'))],
    ['sp-right', 'Right of the screen', '', ()=>Sound.at({pan:0.85, dist:50, off:false}, ()=>Sound.hit('rail'))],
    ['sp-close', 'Close', 'camera right on top of it', ()=>Sound.at({pan:0.2, dist:10, off:false}, ()=>Sound.hit('rail'))],
    ['sp-far', 'Far', 'zoomed right out', ()=>Sound.at({pan:-0.3, dist:120, off:false}, ()=>Sound.hit('rail'))],
    ['sp-off', 'Off screen, right', 'out of view', ()=>Sound.at({pan:0.85, dist:60, off:true}, ()=>Sound.hit('rail'))],
    ['sp-sweep', 'Left to right', 'a pulse volley walking across the screen', ()=>{ [-0.85,-0.3,0.3,0.85].forEach((p,i)=>at(i*0.18, ()=>Sound.at({pan:p, dist:50, off:false}, ()=>Sound.hit('pulse')))); }],
  ]],
  ['Sequences, with the game\'s timing', [
    ['q-rail', 'Railgun on a hull', 'charge, shot, slug hits', ()=>{ Sound.rail(); at(RAIL_CHARGE+0.03, ()=>Sound.hit('rail')); }],
    ['q-rail-sh', 'Railgun on shields', '', ()=>{ Sound.rail(); at(RAIL_CHARGE+0.03, ()=>Sound.shield('rail')); }],
    ['q-pulse', 'Pulse volley on a hull', 'three bolts, each landing about 0.3 s later', ()=>{ for(let i=0;i<3;i++){ at(i*0.13, ()=>Sound.pulse()); at(i*0.13+0.3, ()=>Sound.hit('pulse')); } }],
    ['q-pulse-sh', 'Pulse volley on shields', '', ()=>{ for(let i=0;i<3;i++){ at(i*0.13, ()=>Sound.pulse()); at(i*0.13+0.3, ()=>Sound.shield('pulse')); } }],
    ['q-beam', 'Beam on a hull', '', ()=>{ Sound.beam(0.9, 24/34); at(0.25, ()=>Sound.hit('beam')); }],
    ['q-beam-sh', 'Beam on shields', '', ()=>{ Sound.beam(0.9, 24/34); at(0.25, ()=>Sound.shield('beam')); }],
    ['q-missile', 'Missile salvo on a hull', 'two rounds, about 1.2 s of flight', ()=>{ for(let i=0;i<2;i++){ at(i*0.18, ()=>Sound.missile()); at(i*0.18+1.2, ()=>Sound.hit('missile')); } }],
    ['q-torp', 'Torpedo on a hull', '', ()=>{ Sound.missile(); at(1.4, ()=>Sound.hit('torpedo')); }],
    ['q-int', 'Missile shot down', 'point defense opens up, then the kill', ()=>{ Sound.missile(); at(0.75, ()=>Sound.pdc()); at(1.05, ()=>Sound.intercept()); }],
    ['q-wing', 'Strike wing on a hull', 'six craft', ()=>{ Sound.fighter(); for(let i=0;i<6;i++) at(1.3+i*0.1, ()=>Sound.hit('fighter')); }],
    ['q-pdcgun', 'PDC guns on a hull', 'close-in fire at a ship', ()=>{ Sound.pdc(); for(let i=0;i<8;i++) at(0.15+i*0.09, ()=>Sound.hit('pdc')); }],
    ['q-miss', 'Pulse volley that misses', 'three bolts glancing away', ()=>{ for(let i=0;i<3;i++){ at(i*0.13, ()=>Sound.pulse()); at(i*0.13+0.3, ()=>Sound.miss('pulse')); } }],
    ['q-capital', 'Dreadnought dies', 'internal blasts, then the capital explosion', ()=>{ [0,0.3,0.6,0.85].forEach(d=>at(d, ()=>Sound.burst())); at(1.3, ()=>Sound.boom(2.8)); }],
    ['q-death', 'Destroyer dies', 'internal blasts, then the explosion', ()=>{ [0,0.35,0.7].forEach(d=>at(d, ()=>Sound.burst())); at(1.2, ()=>Sound.boom(1.6)); }],
  ]],
];

// v92: Jon's reference effects (Epidemic Sound, in the gitignored sfx/ folder). Licensed for his videos only, so they are
// never committed or embedded: the Reference buttons exist only when the game runs on localhost and the file is there,
// and they play the file as it is, for comparison. Nothing is sampled or resynthesized from them.
const REF_FILES = {
  sniper:'ES_Scifi, Weapon, Sniper Rifle, Single Shots - Epidemic Sound - 4276-7138.wav',
  cannon:'ES_Scifi, Weapon, Hand Cannon, Single Shots - Epidemic Sound.mp3',
  huge:'ES_Scifi, Weapon, Huge, Blaster Shot, Cannon, Distortion 01 - Epidemic Sound.mp3',
  metal1:'ES_Bullets, Impact, Hit, Metal 01 - Epidemic Sound.mp3', metal2:'ES_Bullets, Impact, Hit, Metal 02 - Epidemic Sound.mp3',
  rTank:'ES_Bullets, Ricochet, Metal, Tank - Epidemic Sound.mp3', rHarsh:'ES_Bullets, Ricochet, Metal, Harsh - Epidemic Sound.mp3',
  rSharp:'ES_Bullets, Ricochet, Metal, Sharp - Epidemic Sound.mp3', rTonal:'ES_Bullets, Ricochet, Metal, Small, Tonal - Epidemic Sound.mp3',
  boom4:'ES_Lasers, Gun, Blaster, Laser, Boom x4 - Epidemic Sound - 1995-3258.wav', boomS:'ES_Lasers, Gun, Blaster, Laser, Boom, Small - Epidemic Sound.mp3',
  shot4:'ES_Scifi, Shot 04 - Epidemic Sound.mp3', boomH:'ES_Lasers, Gun, Blaster, Laser, Boom, Heavy - Epidemic Sound.mp3',
  drone:'ES_Lasers, Gun, Blaster, Laser, Deep Drone - Epidemic Sound.mp3',
  plasma:'ES_Scifi, Energy, Electric Discharge, Beam, Plasma, Hard - Epidemic Sound.mp3',
  dischg:'ES_Scifi, Weapon, Gun, Blaster, Blast, Discharge, Energy, Beam 01 - Epidemic Sound.mp3',
  fx1:'ES_Explosions, Designed, Futuristic Explosion 01 - Epidemic Sound.mp3', fx2:'ES_Explosions, Designed, Futuristic Explosion 02 - Epidemic Sound.mp3',
  fx3:'ES_Explosions, Designed, Futuristic Explosion 03 - Epidemic Sound.mp3', fx5:'ES_Explosions, Designed, Futuristic Explosion 05 - Epidemic Sound.mp3',
  tnt:'ES_Explosions, Designed, TNT, Heavy Blast - Epidemic Sound.mp3',
  ricBurst:'ES_Bullets, Ricochet, Laser Projectiles Bouncing Off Surface, Bursts - Epidemic Sound.mp3',
  ricCont:'ES_Bullets, Ricochet, Laser Projectiles Bouncing Off Surface, Continuous 02 - Epidemic Sound.mp3',
  ricCrunch:'ES_Bullets, Ricochet, Classic, Fast, Crunchy 02 - Epidemic Sound.mp3',
};
// which references go with which lab row (the target table in BACKLOG, "Sound direction")
const REF_ROWS = {
  rail:['sniper','cannon','huge'], 'q-rail':['sniper','cannon','huge'],
  'hit-rail':['metal1','metal2','rTank'], 'hit-pdc':['rHarsh','rSharp','rTonal','metal2'], 'hit-other':['metal1','metal2','rTank'], 'q-pdcgun':['rHarsh','rSharp','metal1'],
  pulse:['boom4','boomS','shot4'], 'q-pulse':['boom4','boomS','shot4'],
  beam:['plasma','dischg','drone','boomH'], 'q-beam':['plasma','dischg'], 'hit-beam':['plasma','dischg'], 'sh-beam':['plasma'],
  'hit-torpedo':['fx2','fx3','fx5','tnt'], 'q-torp':['fx2','fx5','tnt'], 'boom-l':['fx3','fx2','tnt'], 'boom-m':['fx1','fx5'], 'boom-s':['fx1'], 'q-death':['fx1','fx2'],
  miss:['ricBurst','ricCont','ricCrunch'], 'q-miss':['ricBurst'], 'q-capital':['fx3','tnt'],
};
const refLocal = ['localhost','127.0.0.1','[::1]'].includes(location.hostname) || location.protocol==='file:';
let refAudio=null;
function stopRef(){ if(refAudio){ refAudio.pause(); refAudio=null; } }

const SfxLab = {
  st: store.get('sfxlab', {}),   // id -> {g, r, n}: volume, pitch, notes
  get(id){ return this.st[id] || (this.st[id]={g:1, r:1, n:''}); },
  save(){ store.set('sfxlab', this.st); },
  play(id){ const row=LAB_SOUNDS.flatMap(g=>g[1]).find(r=>r[0]===id); const v=this.get(id);
    const m=this.master(); labCur={gain:v.g, rate:v.r, drive:m.drive, verb:m.verb, width:m.width}; try{ Sound.labPlay(row[3], labCur); } finally{ labCur=null; } },
  master(){ return this.st._fx || (this.st._fx={drive:0.6, verb:0.3, width:0.65}); },   // the game's FX since v93
  ref(id, btn){ const list=REF_ROWS[id]; if(!list) return; stopRef(); const v=this.get(id); v.ri=((v.ri??-1)+1)%list.length;
    refAudio=new Audio('sfx/'+encodeURIComponent(REF_FILES[list[v.ri]])); refAudio.play().catch(()=>{});
    btn.textContent=`Ref ${v.ri+1}/${list.length}`; btn.title=REF_FILES[list[v.ri]].replace(' - Epidemic Sound','').replace(/^ES_/,''); },
  build(){
    const el=document.createElement('div'); el.id='sfxlab'; el.className='screen'; el.setAttribute('role','dialog'); el.setAttribute('aria-label','Sound lab');
    let html=`<div class="sheet lab"><h2>Sound lab</h2><p class="rec-note">Every sound the game makes, on its own or as it plays in battle. Volume and pitch here never change the game: set them by ear, write a note, then <b>Copy notes</b> and paste the text to Claude. <span id="lab-status"></span></p>
      <div class="cta" style="margin-bottom:8px"><button class="btn-primary" id="lab-copy">Copy notes</button><button class="btn-ghost" id="lab-reset">Reset all</button><button class="btn-ghost" id="lab-stop">Stop reference</button><button class="btn-ghost" id="lab-close">Close</button></div>
      <div class="lab-master"><b>Effects chain, every sound <small>(the game uses drive 0.60, reverb 0.30, width 0.65 since v93)</small></b>
        <label class="lab-sl">Drive <input type="range" min="0" max="1" step="0.05" data-m="drive"><output></output></label>
        <label class="lab-sl">Reverb <input type="range" min="0" max="1" step="0.05" data-m="verb"><output></output></label>
        <label class="lab-sl">Width <input type="range" min="0" max="1" step="0.05" data-m="width"><output></output></label></div>
      ${refLocal? '<p class="rec-note">Ref buttons play your reference files from sfx/ (local only, never shipped). Each press plays the next one.</p>' : ''}`;
    for(const [group, rows] of LAB_SOUNDS){ html+=`<h3>${esc(group)}</h3>`;
      for(const [id, label, info] of rows){ html+=`<div class="lab-row" data-id="${id}">
        <button class="lab-play" aria-label="Play ${esc(label)}">▶</button>
        <div class="lab-name"><b>${esc(label)}</b>${info?`<small>${esc(info)}</small>`:''}</div>
        <label class="lab-sl">Vol <input type="range" min="0" max="2" step="0.05" data-k="g"><output></output></label>
        <label class="lab-sl">Pitch <input type="range" min="0.5" max="2" step="0.05" data-k="r"><output></output></label>
        <input class="lab-note" type="text" placeholder="Notes" data-k="n">${refLocal && REF_ROWS[id]? `<button class="lab-ref">Ref</button>` : ''}</div>`; } }
    el.innerHTML=html+'</div>'; document.body.appendChild(el);
    el.querySelectorAll('.lab-row').forEach(r=>{ const id=r.dataset.id, v=this.get(id);
      r.querySelectorAll('input').forEach(inp=>{ const k=inp.dataset.k; inp.value=v[k]; const out=inp.nextElementSibling;
        const show=()=>{ if(out) out.textContent=(+inp.value).toFixed(2); r.classList.toggle('changed', v.g!==1 || v.r!==1 || !!v.n); };
        show(); inp.oninput=()=>{ v[k]= k==='n'? inp.value : +inp.value; show(); this.save(); }; });
      r.querySelector('.lab-play').onclick=()=>this.play(id); const rb=r.querySelector('.lab-ref'); if(rb) rb.onclick=()=>this.ref(id, rb); });
    const m=this.master(); el.querySelectorAll('[data-m]').forEach(inp=>{ const k=inp.dataset.m, out=inp.nextElementSibling; inp.value=m[k]; out.textContent=(+m[k]).toFixed(2);
      inp.oninput=()=>{ m[k]=+inp.value; out.textContent=m[k].toFixed(2); this.save(); }; });
    $('#lab-stop').onclick=stopRef;
    $('#lab-copy').onclick=()=>{ const mm=this.master(), lines=[`Sound lab notes (v${GAME_VERSION})`]; if(mm.drive!==0.6||mm.verb!==0.3||mm.width!==0.65) lines.push(`- Effects chain on every sound: drive ${mm.drive.toFixed(2)}, reverb ${mm.verb.toFixed(2)}, width ${mm.width.toFixed(2)}`);
      for(const [group, rows] of LAB_SOUNDS) for(const [id, label] of rows){ const v=this.st[id]; if(!v || (v.g===1 && v.r===1 && !v.n)) continue;
        if(v.ri!==undefined && REF_ROWS[id]) v.refName=REF_FILES[REF_ROWS[id][v.ri]].replace(' - Epidemic Sound','').replace(/^ES_/,'').replace(/\.(mp3|wav)$/,'');
        lines.push(`- ${group} / ${label} [${id}]: volume ${v.g.toFixed(2)}, pitch ${v.r.toFixed(2)}${v.n?` — ${v.n}`:''}${v.refName?` (last reference played: ${v.refName})`:''}`); }
      const text=lines.length>1? lines.join('\n') : 'No changes yet.';
      (navigator.clipboard? navigator.clipboard.writeText(text) : Promise.reject()).then(()=>{ $('#lab-copy').textContent='Copied'; setTimeout(()=>$('#lab-copy').textContent='Copy notes',1500); }, ()=>prompt('Copy these notes:', text)); };
    $('#lab-reset').onclick=()=>{ if(!confirm('Reset every slider and note?')) return; this.st={}; this.save(); el.remove(); this.build(); showScreen('sfxlab'); };
    $('#lab-close').onclick=()=>{ stopRef(); Sound.drumPreview(null); closeScreen(); };
    el.addEventListener('pointerdown', ()=>Sound.init(), {once:true});
    // samples decode after the first click; until then the recorded sounds fall back to their synthesized versions
    setInterval(()=>{ const s=$('#lab-status'); if(!s) return; const d=Sound._dbg(); s.textContent= !Sound.on? 'Effects are muted: press N or turn them on in the top bar.' : !d.ctx? 'Click anywhere to start the audio.' : d.samples<d.of? `Loading recordings ${d.samples}/${d.of}…` : ''; }, 500);
  },
};
if(URLQ.has('sfx')){ SfxLab.build(); showScreen('sfxlab'); }
