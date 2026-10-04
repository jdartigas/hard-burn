// Laniakea's Edge: screens and buttons: menu pickers, fleet builder, records, settings, pause, surrender, HUD drawers.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

/* ---------------- screens & buttons ---------------- */
function showScreen(id){ document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('on', s.id===id)); const f=$('#'+id+' button'); if(f) f.focus(); hideTooltip(); }
function closeScreen(){ document.querySelectorAll('.screen').forEach(s=>{ if(s.id!=='menu' || state.phase!=='menu') s.classList.remove('on'); }); if(state.phase==='menu') $('#menu').classList.add('on');
  if(state.phase==='end') $('#end').classList.add('on');   // the battle is over: closing pause or help returns to the result, not a dead board
  canvas.focus(); }
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{ Sound.ui(); closeScreen(); });
const DIFF_DESC={easy:'Loose enemy formation, poor gunnery.', normal:'A capable commander who focuses fire.', hard:'Tougher hulls, sharper guns, no mercy.'};
function showDiff(){ document.querySelectorAll('.diff').forEach(x=>{ const on=x.dataset.d===state.diff; x.classList.toggle('on',on); x.setAttribute('aria-checked',on); }); $('#diff-desc').textContent=DIFF_DESC[state.diff]; }
document.querySelectorAll('.diff').forEach(b=>b.onclick=()=>{ Sound.init(); Sound.ui(); state.diff=b.dataset.d; store.set('diff',state.diff); showDiff(); });
showDiff();
$('#btn-start').onclick=()=>startGame(chosenFleets());
// ---- records panel ----
function renderRecords(){
  const d=loadScores(), games=d.games, wins=games.filter(g=>g.result==='win').length;
  $('#rec-bests').innerHTML=['easy','normal','hard'].map(k=>{ const b=d.bests[k];
    return `<div class="rec-best"><div class="d">Best on ${DIFF_LABEL[k]}</div>${b?`<b>${fmtN(b.score)}</b><div class="m">${esc(fleetName(b.you))} vs ${esc(fleetName(b.enemy))}, ${esc(String(b.date).slice(0,10))}</div>`:'<b>—</b><div class="m">No games yet</div>'}</div>`; }).join('');
  $('#rec-sum').textContent= games.length? `${games.length} game${games.length>1?'s':''} played, ${wins} won (${Math.round(wins/games.length*100)}%).` : 'No battles recorded yet. Finish one and it will appear here.';
  const res={win:'Won', loss:'Lost', draw:'Stalemate', surrender:'Surrendered'};
  $('#rec-list').innerHTML= games.length? `<span class="h dt">Date</span><span class="h">Battle</span><span class="h">Result</span><span class="h">Score</span>`+
    games.slice(-15).reverse().map(g=>`<span class="dt">${esc(String(g.date).slice(0,10))}</span><span>${esc(fleetName(g.you))} vs ${esc(fleetName(g.enemy))}, ${esc(DIFF_LABEL[g.diff]||g.diff)}</span><span class="${g.result==='win'?'w':'l'}">${esc(res[g.result]||g.result)} T${esc(g.turns)}</span><b>${fmtN(g.score)}</b>`).join('') : '';
}
$('#btn-records').onclick=()=>{ Sound.init(); Sound.ui(); $('#rec-msg').textContent=''; renderRecords(); showScreen('records'); };
$('#btn-export').onclick=()=>{ const d=loadScores(); const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,1)],{type:'application/json'})); a.download=`laniakeas-edge-records-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),2000); $('#rec-msg').textContent=`Exported ${d.games.length} game${d.games.length!==1?'s':''}.`; };
$('#btn-import').onclick=()=>$('#rec-file').click();
$('#rec-file').onchange=async e=>{ const f=e.target.files[0]; e.target.value=''; if(!f) return; $('#rec-msg').textContent=importScores(await f.text()); renderRecords(); };
// merge a records file into what's stored: games already present are skipped, bests keep the higher score
function importScores(text){
  let inc; try{ inc=JSON.parse(text); }catch(e){ return "That file isn't a Laniakea's Edge records file."; }
  if(!inc || typeof inc!=='object' || !Array.isArray(inc.games)) return "That file isn't a Laniakea's Edge records file.";
  const d=loadScores(), key=g=>g.date+'|'+g.seed+'|'+g.score, have=new Set(d.games.map(key)); let added=0;
  for(const g of inc.games){ if(!validGame(g)) continue; const f=fillGame(g); if(have.has(key(f))) continue; d.games.push(f); have.add(key(f)); considerBest(d,f); added++; }
  if(inc.bests && typeof inc.bests==='object') for(const b of Object.values(inc.bests)) if(validGame(b)) considerBest(d, fillGame(b));
  d.games.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0); saveScores(d); requestPersist();
  return added? `Imported ${added} game${added>1?'s':''}.` : 'Nothing new in that file: every game in it is already here.';
}
// quick play fleet pickers; the enemy's "Random" is rolled again for every new battle, not for a restart
// Your fleet is a preset or 'custom' (built in the fleet builder, stored as hardburn.custom = {budget, fleet}).
// The enemy is Random (any preset), a preset, or 'aibuild': the AI spends your budget itself.
let pickYou=store.get('fleetYou','classic'), pickEnemy=store.get('fleetEnemy','random'), pickLoc=store.get('location','reach');
if(pickLoc!=='random' && !LOCATIONS.some(l=>l.id===pickLoc)) pickLoc='reach';
// the battle's location: Random rolls one per battle; the menu's backdrop shows the chosen one (the Reach for Random)
const rollLocation=()=> pickLoc==='random'? LOCATIONS[Math.floor(Math.random()*LOCATIONS.length)].id : pickLoc;
const menuLocation=()=> pickLoc==='random'? 'reach' : pickLoc;
const validCustom=c=> !!c && BUDGETS[c.budget]!==undefined && Array.isArray(c.fleet) && c.fleet.length>0 && c.fleet.length<=MAX_FLEET && c.fleet.every(k=>CLASSES[k]) && fleetCost(c.fleet)<=BUDGETS[c.budget];
let custom=store.get('custom',null); if(!validCustom(custom)) custom=null;   // e.g. a price change put it over budget
if(pickYou==='custom' ? !custom : !PRESETS.some(p=>p.id===pickYou)) pickYou='classic';
if(pickEnemy!=='random' && pickEnemy!=='aibuild' && !PRESETS.some(p=>p.id===pickEnemy)) pickEnemy='random';
const yourBudget=()=> pickYou==='custom'? custom.budget : 'standard';
function chosenFleets(){
  const you= pickYou==='custom'? {fleet:custom.fleet, id:'custom'} : PRESETS.find(p=>p.id===pickYou);
  if(pickEnemy==='aibuild'){ const plans=Object.keys(AI_PLANS), plan=plans[Math.floor(Math.random()*plans.length)];
    return {player:you.fleet, enemy:aiBuild(BUDGETS[yourBudget()], plan), enemyName:`AI build: ${AI_PLANS[plan].label}`, youId:you.id, enemyId:'ai-'+plan, budget:yourBudget(), location:rollLocation()}; }
  const en= pickEnemy==='random'? PRESETS[Math.floor(Math.random()*PRESETS.length)] : PRESETS.find(p=>p.id===pickEnemy);
  return {player:you.fleet, enemy:en.fleet, enemyName:en.name, youId:you.id, enemyId:en.id, budget:yourBudget(), location:rollLocation()};
}
// Fleet pickers (v44): each is one button that opens a list, a popover beside it on wide screens and a sheet from
// the bottom on phones. Chip grids for 7 and 8 options pushed Begin below the fold on iPad; a native <select> can't
// show what's in each fleet. The list follows the listbox pattern: arrows move, Enter or Space picks, Escape closes.
function youOptions(){ return PRESETS.map(p=>({id:p.id, name:p.name, sub:`${p.fleet.length} ships`, info:fleetSummary(p.fleet)}))
  .concat([{id:'custom', name:'Custom', sub: custom? `${custom.fleet.length} ships` : 'Build your own', info: custom? `${fleetSummary(custom.fleet)}. Edit in the fleet builder.` : 'Choose hulls against a point budget.'}]); }
function enemyOptions(){ return [{id:'random', name:'Random', sub:'Any preset', info:'A different preset fleet every battle.'}]
  .concat(PRESETS.map(p=>({id:p.id, name:p.name, sub:`${p.fleet.length} ships`, info:fleetSummary(p.fleet)})))
  .concat([{id:'aibuild', name:'AI build', sub:`Spends ${BUDGETS[yourBudget()]}`, info:'The AI builds its own fleet to your budget.'}]); }
const PICKERS={ you:{btn:'#pk-you', options:youOptions, get:()=>pickYou, set:id=>{ if(id==='custom'){ openBuilder(); return; } pickYou=id; store.set('fleetYou',pickYou); } },
  enemy:{btn:'#pk-enemy', options:enemyOptions, get:()=>pickEnemy, set:id=>{ pickEnemy=id; store.set('fleetEnemy',pickEnemy); } },
  loc:{btn:'#pk-loc', options:()=>[{id:'random', name:'Random', sub:'Any location', info:'A different place every battle.'}].concat(LOCATIONS.map(l=>({id:l.id, name:l.name, sub:l.sub, info:l.info}))),
    get:()=>pickLoc, set:id=>{ pickLoc=id; store.set('location',pickLoc); if(state.phase==='menu') Loc.set(menuLocation()); } } };
let openPk=null, pkFocus=0;
function renderPicks(){
  for(const k of Object.keys(PICKERS)){ const P=PICKERS[k], o=P.options().find(x=>x.id===P.get()) || P.options()[0];
    $(P.btn).innerHTML=`<b>${o.name}</b><span>${o.sub}</span><i aria-hidden="true"></i>`; }
  if(pickYou==='custom') $('#pick-desc').innerHTML=`Your own fleet, ${fleetCost(custom.fleet)} of the ${BUDGET_LABEL[custom.budget]} budget (${BUDGETS[custom.budget]}). <i>${fleetSummary(custom.fleet)}.</i>`
      + (custom.budget!=='standard' && pickEnemy!=='aibuild'? ` <b style="color:var(--red);font-weight:600">The enemy presets are built to the Standard budget (660), so this won't be an even fight.</b>` : '');
  else { const you=PRESETS.find(p=>p.id===pickYou); $('#pick-desc').innerHTML=`${you.desc} <i>${fleetSummary(you.fleet)}.</i>`; }
}
function openPicker(k){
  if(openPk===k){ closePicker(); return; } Sound.init(); Sound.ui(); openPk=k;
  const P=PICKERS[k], opts=P.options(), list=$('#pk-list'), btn=$(P.btn);
  pkFocus=Math.max(0, opts.findIndex(o=>o.id===P.get()));
  list.innerHTML=opts.map((o,i)=>`<div class="pk-opt${o.id===P.get()?' on':''}" role="option" id="pko-${i}" data-id="${o.id}" aria-selected="${o.id===P.get()}"><b>${o.name}</b><span class="n">${o.sub}</span><span class="i">${o.info}</span></div>`).join('');
  list.setAttribute('aria-label', k==='you'?'Your fleet':k==='enemy'?'Enemy fleet':'Location');
  // beside the button on wide screens, so the rest of the setup stays readable; a bottom sheet on phones (CSS)
  // beside the button when there's room (landscape), otherwise below it, or above it if below would run off the screen
  list.hidden=false; const r=btn.getBoundingClientRect(), w=list.offsetWidth, h=list.offsetHeight;
  if(r.right+12+w <= innerWidth-12){ list.style.left=Math.round(r.right+12)+'px'; list.style.top=Math.round(clamp(r.top-60, 12, innerHeight-12-h))+'px'; }
  else { list.style.left=Math.round(clamp(r.right-w, 12, innerWidth-12-w))+'px'; list.style.top=Math.round(r.bottom+6+h <= innerHeight-12 ? r.bottom+6 : Math.max(12, r.top-6-h))+'px'; } btn.setAttribute('aria-expanded','true'); list.querySelectorAll('.pk-opt').forEach((el,i)=>el.onclick=()=>pickOption(i));
  focusOpt(pkFocus); list.focus();
}
function focusOpt(i){ const els=$('#pk-list').querySelectorAll('.pk-opt'); if(!els.length) return; pkFocus=(i+els.length)%els.length;
  els.forEach((el,j)=>el.classList.toggle('focus', j===pkFocus)); $('#pk-list').setAttribute('aria-activedescendant','pko-'+pkFocus); els[pkFocus].scrollIntoView({block:'nearest'}); }
function pickOption(i){ const k=openPk, P=PICKERS[k], o=P.options()[i]; closePicker(); Sound.ui(); P.set(o.id); renderPicks(); }
function closePicker(){ if(!openPk) return; $(PICKERS[openPk].btn).setAttribute('aria-expanded','false'); $('#pk-list').hidden=true; const b=$(PICKERS[openPk].btn); openPk=null; b.focus(); }
$('#pk-you').onclick=()=>openPicker('you'); $('#pk-enemy').onclick=()=>openPicker('enemy'); $('#pk-loc').onclick=()=>openPicker('loc');
$('#pk-list').addEventListener('keydown', e=>{ if(!openPk) return; const k=e.key;
  if(k==='ArrowDown'){ focusOpt(pkFocus+1); e.preventDefault(); } else if(k==='ArrowUp'){ focusOpt(pkFocus-1); e.preventDefault(); }
  else if(k==='Home'){ focusOpt(0); e.preventDefault(); } else if(k==='End'){ focusOpt(-1); e.preventDefault(); }
  else if(k==='Enter'||k===' '){ pickOption(pkFocus); e.preventDefault(); } else if(k==='Escape'||k==='Tab'){ closePicker(); e.preventDefault(); }
  e.stopPropagation(); });
document.addEventListener('pointerdown', e=>{ if(openPk && !e.target.closest('#pk-list') && !e.target.closest('.picker')) closePicker(); }, true);
addEventListener('resize', ()=>closePicker());
// ---- fleet builder: every class in CLASSES shows up here, so a new ship class needs no builder changes ----
let draft=null;
function openBuilder(){
  draft= custom? {budget:custom.budget, fleet:custom.fleet.slice()} : {budget:'standard', fleet:PRESETS.find(p=>p.id===pickYou)?.fleet.slice()||[]};
  renderBuilder(); showScreen('builder');
}
function renderBuilder(){
  const B=BUDGETS[draft.budget], spent=fleetCost(draft.fleet), n=draft.fleet.length, count=c=>draft.fleet.filter(x=>x===c).length;
  $('#bl-budget').innerHTML=Object.keys(BUDGETS).map(k=>`<button class="fchip${k===draft.budget?' on':''}" role="radio" aria-checked="${k===draft.budget}" data-b="${k}"><b>${BUDGET_LABEL[k]}</b><span>${BUDGETS[k]} points</span></button>`).join('');
  const classes=Object.keys(CLASSES).sort((a,b)=>CLASSES[b].cost-CLASSES[a].cost);
  $('#bl-rows').innerHTML=classes.map(c=>{ const C=CLASSES[c], k=count(c);
    return `<div class="bl-row${k?' has':''}"><button class="bl-pic" data-v="${c}" aria-label="View the ${C.label} in 3D"><img data-thumb="${c}" alt="" ${SV.thumb(c)?`src="${SV.thumb(c)}"`:''}></button>
      <div><b>${C.label}</b><span class="r">${C.role}</span>
      <div class="st">${C.m} m · Hull ${C.hull} · Shields ${C.shield} · ${Math.round(classDpt(c))} damage/turn · Move ${C.mp} · ${weaponNames(c)}</div>
      <div class="st ab">${abilityLine(c)}${C.passive?`<br>Always on: ${C.passive}.`:''}</div></div>
      <span class="c">${C.cost} pts</span>
      <div class="bl-step"><button data-c="${c}" data-d="-1" aria-label="One fewer ${C.label}" ${k?'':'disabled'}>−</button><span>${k}</span><button data-c="${c}" data-d="1" aria-label="One more ${C.label}" ${spent+C.cost<=B && n<MAX_FLEET?'':'disabled'}>+</button></div></div>`; }).join('');
  const over=spent>B; $('.bl-meter').classList.toggle('over',over);
  $('#bl-bar').style.width=Math.min(100,spent/B*100)+'%';
  $('#bl-total').textContent=`${spent} / ${B} points · ${n} / ${MAX_FLEET} ships${over?' · over budget':''}`;
  $('#bl-presets').innerHTML=PRESETS.map(p=>`<button class="bl-link" data-p="${p.id}">${p.name}</button>`).join(' ');
  $('#bl-done').disabled= over || n===0;
  $('#bl-budget').querySelectorAll('button').forEach(b=>b.onclick=()=>{ Sound.ui(); draft.budget=b.dataset.b; renderBuilder(); });
  $('#bl-rows').querySelectorAll('.bl-pic').forEach(b=>b.onclick=()=>{ Sound.ui(); SV.open(b.dataset.v, 'builder'); });
  $('#bl-rows').querySelectorAll('.bl-step button').forEach(b=>b.onclick=()=>{ Sound.ui(); const c=b.dataset.c;
    if(+b.dataset.d>0) draft.fleet.push(c); else draft.fleet.splice(draft.fleet.lastIndexOf(c),1); renderBuilder(); });
  $('#bl-presets').querySelectorAll('button').forEach(b=>b.onclick=()=>{ Sound.ui(); const p=PRESETS.find(x=>x.id===b.dataset.p); draft.fleet=p.fleet.slice(); if(fleetCost(draft.fleet)>BUDGETS[draft.budget]) draft.budget='standard'; renderBuilder(); });
}
$('#bl-clear').onclick=()=>{ Sound.ui(); draft.fleet=[]; renderBuilder(); };
$('#bl-done').onclick=()=>{ if(!validCustom(draft)) return; Sound.ui();
  custom={budget:draft.budget, fleet:draft.fleet.slice().sort((a,b)=>CLASSES[b].cost-CLASSES[a].cost)}; store.set('custom',custom);
  pickYou='custom'; store.set('fleetYou','custom');
  // presets are Standard-budget fleets: against another budget, or a Random preset, default to an opponent built to yours
  if(pickEnemy==='random' || custom.budget!=='standard'){ pickEnemy='aibuild'; store.set('fleetEnemy','aibuild'); }
  closeScreen(); renderPicks(); };
renderPicks();
$('#btn-how').onclick=()=>{ Sound.init(); Sound.ui(); showScreen('help'); };
$('#btn-help').onclick=()=>{ Sound.ui(); showScreen('help'); };
$('#btn-howp').onclick=()=>{ Sound.ui(); showScreen('help'); };
$('#btn-pause').onclick=()=>{ Sound.ui(); openPause(); };
// HUD drawers: fleet lists and the log fold away; the choice is remembered (hardburn.hud)
const hudPrefs=Object.assign({roster:true, enemies:true, log:false}, store.get('hud',{}));
function applyHudPrefs(){ const h=$('#hud'); h.classList.toggle('roster-off',!hudPrefs.roster); h.classList.toggle('enemies-off',!hudPrefs.enemies); h.classList.toggle('log-open',hudPrefs.log);
  $('#tg-roster').textContent= hudPrefs.roster?'‹':'Fleet ›'; $('#tg-enemies').textContent= hudPrefs.enemies?'›':'‹ Enemy';
  $('#tg-log').textContent= hudPrefs.log?'Less':'More';
  $('#tg-roster').setAttribute('aria-expanded',hudPrefs.roster); $('#tg-enemies').setAttribute('aria-expanded',hudPrefs.enemies); $('#tg-log').setAttribute('aria-expanded',hudPrefs.log); }
for(const k of ['roster','enemies','log']) $('#tg-'+k).onclick=e=>{ e.stopPropagation(); hudPrefs[k]=!hudPrefs[k]; store.set('hud',hudPrefs); applyHudPrefs(); Sound.ui(); };
applyHudPrefs();
// --hud-bottom: height of the bottom command area, so the log and fleet lists sit above it however it wraps
function measureHud(){ const top=Math.min($('#shippanel').getBoundingClientRect().top, $('#endturn').getBoundingClientRect().top);
  document.documentElement.style.setProperty('--hud-bottom', Math.max(0,Math.round(innerHeight-top))+'px'); }
try{ const ro=new ResizeObserver(measureHud); ro.observe($('#shippanel')); ro.observe($('#endturn')); }catch(e){}
addEventListener('resize', measureHud); measureHud();
// Surrender takes two presses: the first arms it, the second (within 4 s) ends the battle as a loss.
// It can't be undone, so it lives in the pause menu rather than beside End turn.
let surrenderArmed=0;
function disarmSurrender(){ surrenderArmed=0; const b=$('#btn-surrender'); b.classList.remove('armed'); b.textContent='Surrender'; }
function openPause(){ disarmSurrender(); $('#btn-surrender').style.display= (state.over||state.phase==='menu'||state.phase==='end')?'none':''; showScreen('pause'); }
$('#btn-surrender').onclick=()=>{
  if(state.over) return;
  if(!surrenderArmed || performance.now()-surrenderArmed>4000){ surrenderArmed=performance.now(); const b=$('#btn-surrender'); b.classList.add('armed'); b.textContent='Confirm surrender'; Sound.ui(); return; }
  disarmSurrender(); closeScreen(); surrender();
};
function surrender(){
  if(state.over) return;
  state.over=true; state.result='enemy'; state.surrendered=true;
  log(`You surrendered on turn ${Math.max(1,state.turn)}.`, 'sys');
  after(0.4, ()=>showEnd(false, null, true));
}
$('#btn-restart').onclick=()=>{ closeScreen(); startGame(); };
$('#btn-again').onclick=()=>startGame(chosenFleets());
$('#btn-tomenu').onclick=()=>toMenu(); $('#btn-endmenu').onclick=()=>toMenu();
$('#endturn').onclick=()=>endPlayerTurn();
$('#ver-menu').textContent=`Version ${GAME_VERSION}`; $('#ver-pause').textContent=`Version ${GAME_VERSION}`;
function toggleSound(){ Sound.init(); const on=Sound.toggle(); $('#btn-sound').textContent= on?'Effects on':'Effects off'; $('#btn-sound').setAttribute('aria-pressed',on); }
function toggleMusic(){ Sound.init(); const on=Sound.toggleMusic(); $('#btn-music').textContent= on?'Music on':'Music off'; $('#btn-music').setAttribute('aria-pressed',on); }
// settings sheet (v44): music and effects volume, graphics. Opened from the menu or from pause, and returns there.
let settingsFrom='menu';
function syncVol(){ for(const [id,v] of [['music',Sound.musicLevel],['fx',Sound.fxLevel]]){ $('#vol-'+id).value=Math.round(v*100); $('#vol-'+id+'-v').textContent=Math.round(v*100)+'%';
  $('#vol-'+id).style.setProperty('--fill', Math.round(v*100)+'%'); } }
document.querySelectorAll('.btn-settings').forEach(b=>b.onclick=()=>{ Sound.init(); Sound.ui(); settingsFrom= $('#pause').classList.contains('on')? 'pause' : 'menu'; syncVol(); showScreen('settings'); });
$('#vol-music').oninput=e=>{ Sound.init(); Sound.setMusicLevel(e.target.value/100); syncVol(); };
$('#vol-fx').oninput=e=>{ Sound.init(); Sound.setFxLevel(e.target.value/100); syncVol(); };
$('#vol-fx').onchange=()=>Sound.ui();   // a sample at the new level
$('#settings [data-close]').onclick=()=>{ Sound.ui(); if(settingsFrom==='pause') showScreen('pause'); else closeScreen(); };
$('#btn-sound').onclick=toggleSound; $('#btn-sound').textContent= Sound.on?'Effects on':'Effects off';
$('#btn-music').onclick=toggleMusic; $('#btn-music').textContent= Sound.musicOn?'Music on':'Music off';

