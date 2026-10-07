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
    ['beam', 'Beam', 'every beam, light to heavy, for 0.9 s', ()=>Sound.beam(0.9)],
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
  ['Sequences, with the game\'s timing', [
    ['q-rail', 'Railgun on a hull', 'charge, shot, slug hits', ()=>{ Sound.rail(); at(RAIL_CHARGE+0.03, ()=>Sound.hit('rail')); }],
    ['q-rail-sh', 'Railgun on shields', '', ()=>{ Sound.rail(); at(RAIL_CHARGE+0.03, ()=>Sound.shield('rail')); }],
    ['q-pulse', 'Pulse volley on a hull', 'three bolts, each landing about 0.3 s later', ()=>{ for(let i=0;i<3;i++){ at(i*0.13, ()=>Sound.pulse()); at(i*0.13+0.3, ()=>Sound.hit('pulse')); } }],
    ['q-pulse-sh', 'Pulse volley on shields', '', ()=>{ for(let i=0;i<3;i++){ at(i*0.13, ()=>Sound.pulse()); at(i*0.13+0.3, ()=>Sound.shield('pulse')); } }],
    ['q-beam', 'Beam on a hull', '', ()=>{ Sound.beam(0.9); at(0.25, ()=>Sound.hit('beam')); }],
    ['q-beam-sh', 'Beam on shields', '', ()=>{ Sound.beam(0.9); at(0.25, ()=>Sound.shield('beam')); }],
    ['q-missile', 'Missile salvo on a hull', 'two rounds, about 1.2 s of flight', ()=>{ for(let i=0;i<2;i++){ at(i*0.18, ()=>Sound.missile()); at(i*0.18+1.2, ()=>Sound.hit('missile')); } }],
    ['q-torp', 'Torpedo on a hull', '', ()=>{ Sound.missile(); at(1.4, ()=>Sound.hit('torpedo')); }],
    ['q-int', 'Missile shot down', 'point defense opens up, then the kill', ()=>{ Sound.missile(); at(0.75, ()=>Sound.pdc()); at(1.05, ()=>Sound.intercept()); }],
    ['q-wing', 'Strike wing on a hull', 'six craft', ()=>{ Sound.fighter(); for(let i=0;i<6;i++) at(1.3+i*0.1, ()=>Sound.hit('fighter')); }],
    ['q-pdcgun', 'PDC guns on a hull', 'close-in fire at a ship', ()=>{ Sound.pdc(); for(let i=0;i<8;i++) at(0.15+i*0.09, ()=>Sound.hit('pdc')); }],
    ['q-death', 'Destroyer dies', 'internal blasts, then the explosion', ()=>{ [0,0.35,0.7].forEach(d=>at(d, ()=>Sound.burst())); at(1.2, ()=>Sound.boom(1.6)); }],
  ]],
];

const SfxLab = {
  st: store.get('sfxlab', {}),   // id -> {g, r, n}: volume, pitch, notes
  get(id){ return this.st[id] || (this.st[id]={g:1, r:1, n:''}); },
  save(){ store.set('sfxlab', this.st); },
  play(id){ const row=LAB_SOUNDS.flatMap(g=>g[1]).find(r=>r[0]===id); const v=this.get(id);
    labCur={gain:v.g, rate:v.r}; try{ Sound.labPlay(row[3], labCur); } finally{ labCur=null; } },
  build(){
    const el=document.createElement('div'); el.id='sfxlab'; el.className='screen'; el.setAttribute('role','dialog'); el.setAttribute('aria-label','Sound lab');
    let html=`<div class="sheet lab"><h2>Sound lab</h2><p class="rec-note">Every sound the game makes, on its own or as it plays in battle. Volume and pitch here never change the game: set them by ear, write a note, then <b>Copy notes</b> and paste the text to Claude. <span id="lab-status"></span></p>
      <div class="cta" style="margin-bottom:8px"><button class="btn-primary" id="lab-copy">Copy notes</button><button class="btn-ghost" id="lab-reset">Reset all</button><button class="btn-ghost" id="lab-close">Close</button></div>`;
    for(const [group, rows] of LAB_SOUNDS){ html+=`<h3>${esc(group)}</h3>`;
      for(const [id, label, info] of rows){ html+=`<div class="lab-row" data-id="${id}">
        <button class="lab-play" aria-label="Play ${esc(label)}">▶</button>
        <div class="lab-name"><b>${esc(label)}</b>${info?`<small>${esc(info)}</small>`:''}</div>
        <label class="lab-sl">Vol <input type="range" min="0" max="2" step="0.05" data-k="g"><output></output></label>
        <label class="lab-sl">Pitch <input type="range" min="0.5" max="2" step="0.05" data-k="r"><output></output></label>
        <input class="lab-note" type="text" placeholder="Notes" data-k="n"></div>`; } }
    el.innerHTML=html+'</div>'; document.body.appendChild(el);
    el.querySelectorAll('.lab-row').forEach(r=>{ const id=r.dataset.id, v=this.get(id);
      r.querySelectorAll('input').forEach(inp=>{ const k=inp.dataset.k; inp.value=v[k]; const out=inp.nextElementSibling;
        const show=()=>{ if(out) out.textContent=(+inp.value).toFixed(2); r.classList.toggle('changed', v.g!==1 || v.r!==1 || !!v.n); };
        show(); inp.oninput=()=>{ v[k]= k==='n'? inp.value : +inp.value; show(); this.save(); }; });
      r.querySelector('.lab-play').onclick=()=>this.play(id); });
    $('#lab-copy').onclick=()=>{ const lines=[`Sound lab notes (v${GAME_VERSION})`];
      for(const [group, rows] of LAB_SOUNDS) for(const [id, label] of rows){ const v=this.st[id]; if(!v || (v.g===1 && v.r===1 && !v.n)) continue;
        lines.push(`- ${group} / ${label} [${id}]: volume ${v.g.toFixed(2)}, pitch ${v.r.toFixed(2)}${v.n?` — ${v.n}`:''}`); }
      const text=lines.length>1? lines.join('\n') : 'No changes yet.';
      (navigator.clipboard? navigator.clipboard.writeText(text) : Promise.reject()).then(()=>{ $('#lab-copy').textContent='Copied'; setTimeout(()=>$('#lab-copy').textContent='Copy notes',1500); }, ()=>prompt('Copy these notes:', text)); };
    $('#lab-reset').onclick=()=>{ if(!confirm('Reset every slider and note?')) return; this.st={}; this.save(); el.remove(); this.build(); showScreen('sfxlab'); };
    $('#lab-close').onclick=()=>{ closeScreen(); };
    el.addEventListener('pointerdown', ()=>Sound.init(), {once:true});
    // samples decode after the first click; until then the recorded sounds fall back to their synthesized versions
    setInterval(()=>{ const s=$('#lab-status'); if(!s) return; const d=Sound._dbg(); s.textContent= !Sound.on? 'Effects are muted: press N or turn them on in the top bar.' : !d.ctx? 'Click anywhere to start the audio.' : d.samples<d.of? `Loading recordings ${d.samples}/${d.of}…` : ''; }, 500);
  },
};
if(URLQ.has('sfx')){ SfxLab.build(); showScreen('sfxlab'); }
