// Laniakea's Edge: scores and records, selection and player actions, HUD, tooltips.
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

/* ---------------- scores and records ----------------
   One permanent key, hardburn.scores = {format, games, bests}. Each record keeps the raw facts of the battle, not
   just its score, so a new formula can rescore old games. Never rename the key; when the format changes, convert
   old records rather than dropping them. Everything read back is checked, since it may come from an imported file. */
const SCORE_FORMULA = 1, SCORES_FORMAT = 1, SCORES_KEEP = 500;
const DIFF_MULT = { easy:0.75, normal:1, hard:1.5 };
// victory 1000 + fleet value kept (0-1000) + enemy value destroyed (0-500) + 20 per unused turn on a win,
// times the difficulty multiplier. A surrender forfeits the fleet, so it earns no fleet-kept points: otherwise
// surrendering on turn 1 with every ship intact outscored fighting and losing.
function scoreBattle(g){
  const win=g.result==='win';
  const parts={ victory:win?1000:0, fleetKept:Math.round(1000*g.valueLeft/Math.max(1,g.valueStart)),
    enemyDestroyed:Math.round(500*g.enemyDestroyed), speed:win? Math.max(0,(g.limit||30)-g.turns)*20 : 0 };
  if(g.result==='surrender') parts.fleetKept=0;
  const raw=parts.victory+parts.fleetKept+parts.enemyDestroyed+parts.speed;
  const mult=DIFF_MULT[g.diff]||1;
  return {score:Math.round(raw*mult), parts, mult};
}
const validGame=g=> !!g && typeof g==='object' && typeof g.score==='number' && isFinite(g.score) && typeof g.date==='string';
const fillGame=g=>({diff:'normal', result:'loss', turns:0, you:'custom', enemy:'custom', left:0, of:0, ...g});
function considerBest(d,g){ if(!DIFF[g.diff] || g.quick) return false;   // v60: Quick battles are listed but don't set bests
  const b=d.bests[g.diff]; if(!b || g.score>b.score){ d.bests[g.diff]=g; return true; } return false; }
function loadScores(){
  let d=store.get('scores',null);
  if(!d || typeof d!=='object' || !Array.isArray(d.games)) d={format:SCORES_FORMAT, games:[], bests:{}};
  // (future formats convert here, e.g. if(d.format===1) ...)
  d.games=d.games.filter(validGame).map(fillGame);
  const old=(d.bests && typeof d.bests==='object')? d.bests : {}; d.bests={};
  for(const b of Object.values(old)) if(validGame(b)) considerBest(d, fillGame(b));
  for(const g of d.games) considerBest(d,g);
  d.format=SCORES_FORMAT; return d;
}
function saveScores(d){ d.games=d.games.slice(-SCORES_KEEP); store.set('scores', d); }
let persistAsked=false;
function requestPersist(){ if(persistAsked) return; persistAsked=true; try{ navigator.storage && navigator.storage.persist && navigator.storage.persist(); }catch(e){} }
function recordBattle(result){
  if(simRunning || state.simulated || state.recorded) return null; state.recorded=true;
  const mine=state.ships.filter(s=>s.side==='player'), theirs=state.ships.filter(s=>s.side==='enemy');
  const cost=l=>l.reduce((a,s)=>a+s.C.cost,0);
  const g={ date:new Date().toISOString(), version:GAME_VERSION, formula:SCORE_FORMULA, diff:state.diff, seed:board.seed, location:state.location, limit:turnLimit(),
    you:lastFleets.youId||'custom', enemy:lastFleets.enemyId||'custom', result, turns:Math.max(1,state.turn),
    left:alive('player').length, of:mine.length,
    hullPct:Math.round(100*mine.reduce((a,s)=>a+Math.max(0,s.hull),0)/Math.max(1,mine.reduce((a,s)=>a+s.hullMax,0))),
    valueStart:cost(mine), valueLeft:Math.round(fleetValue('player')), enemyStart:cost(theirs),
    enemyDestroyed:+Math.max(0,1-fleetValue('enemy')/Math.max(1,cost(theirs))).toFixed(3),
    dealt:Math.round(state.stats.player.dealt), taken:Math.round(state.stats.enemy.dealt),
    budget:lastFleets.budget||'standard', fleetYou:mine.map(x=>x.cls), fleetEnemy:theirs.map(x=>x.cls), ...(state.quick?{quick:true}:{}) };   // with the seed, enough to replay the setup
  Object.assign(g, scoreBattle(g));
  const d=loadScores(); d.games.push(g); const best=considerBest(d,g); saveScores(d); requestPersist();
  return {g, best};
}
const fleetName=id=> id==='custom'? 'Custom' : id==='quick'? 'Quick battle' : String(id).startsWith('quick-')? (QUICK.fleets.find(q=>'quick-'+q.id===id)||{name:'Quick'}).name : String(id).startsWith('ai-')? `AI ${(AI_PLANS[String(id).slice(3)]||{label:'build'}).label}` : (PRESETS.find(p=>p.id===id)||{name:String(id)}).name;
const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtN=n=>Math.round(n).toLocaleString('en-US');
const DIFF_LABEL={easy:'Easy', normal:'Normal', hard:'Hard'};

// v61 (Jon): the battle summary. Each of your ships, what it did, and the most valuable one. MVP weighs damage dealt,
// kills, missiles and fighters stopped, and hull repaired, so escorts and tenders can earn it too.
const MVP_WEIGHT = { dealt:1, kills:60, ints:15, repaired:0.8 };
const mvpScore = s => s.st.dealt*MVP_WEIGHT.dealt + s.st.kills*MVP_WEIGHT.kills + s.st.ints*MVP_WEIGHT.ints + s.st.repaired*MVP_WEIGHT.repaired;
function mvpCitation(s){ const t=s.st, n=(v,one,many)=>`${fmtN(v)} ${v===1?one:many}`, parts=[];
  if(t.dealt>=1) parts.push(`${fmtN(t.dealt)} damage`); if(t.kills) parts.push(n(t.kills,'kill','kills')); if(t.ints) parts.push(`${n(t.ints,'missile','missiles')} stopped`); if(t.repaired>=1) parts.push(`${fmtN(t.repaired)} hull repaired`);
  return parts.join(', ') || 'held the line'; }
function renderShipSummary(){
  const mine=state.ships.filter(s=>s.side==='player'), mvp=mine.reduce((b,s)=>!b || mvpScore(s)>mvpScore(b) ? s : b, null);
  const anyRep=mine.some(s=>s.st.repaired>=1), anyInt=mine.some(s=>s.st.ints>0);
  $('#end-mvp').innerHTML= mvp && mvpScore(mvp)>0 ? `<div class="mvp"><span>MVP</span><b>${esc(mvp.name)}</b><em>${esc(mvp.C.label)} · ${mvpCitation(mvp)}</em></div>` : '';
  $('#end-ships').innerHTML=`<span class="h">Ship</span><span class="h n">Damage</span><span class="h n">Kills</span>${anyInt?'<span class="h n">Stopped</span>':''}${anyRep?'<span class="h n">Repaired</span>':''}<span class="h n">Taken</span>`+
    mine.slice().sort((a,b)=>mvpScore(b)-mvpScore(a)).map(s=>`<span class="nm${s.alive?'':' lost'}">${esc(s.name)}<small>${esc(s.C.label)}${s.alive?'':' · lost'}</small></span><b>${fmtN(s.st.dealt)}</b><b>${s.st.kills||'—'}</b>${anyInt?`<b>${s.st.ints||'—'}</b>`:''}${anyRep?`<b>${s.st.repaired>=1?fmtN(s.st.repaired):'—'}</b>`:''}<b>${fmtN(s.st.taken)}</b>`).join('');
  $('#end-ships').style.gridTemplateColumns=`minmax(0,1fr) repeat(${3+anyInt+anyRep}, auto)`;
}
function showEnd(win, byValue=null, surrendered=false){
  select(null); state.phase='end'; Sound.setMood('end'); (win?Sound.win:Sound.lose)();
  const draw= byValue && byValue.p===byValue.e;
  const t=$('#end-title'); t.textContent= win?'Victory': draw?'Stalemate': surrendered?'Surrendered':'Fleet lost'; t.className= win?'win':'lose';
  const lostP=state.ships.filter(s=>s.side==='player').length-alive('player').length;
  const leftP=alive('player').length, allP=state.ships.filter(s=>s.side==='player').length;
  $('#end-sub').textContent = surrendered ? `You surrendered on turn ${Math.max(1,state.turn)} with ${leftP} of ${allP} ship${allP>1?'s':''} still in the fight. The enemy holds the field.`
    : byValue ? `Turn limit reached after ${turnLimit()} turns. Fleet value left: yours ${byValue.p}, the enemy's ${byValue.e}. `+
        (win?'You hold the field.': draw?'Neither side can claim it.':'The enemy holds the field.')
    : win ? (lostP===0?`A clean sweep in ${state.turn} turns. Every ship is coming home.`:`The enemy line is broken after ${state.turn} turns, at the cost of ${lostP} ship${lostP>1?'s':''}.`)
                                  : `Your last ship went dark on turn ${state.turn}. The enemy holds the field.`;
  const P=state.stats.player, E=state.stats.enemy; const acc=x=>x.shots?Math.round(x.hits/x.shots*100)+'%':'—';
  $('#end-stats').innerHTML=`<span class="h"></span><span class="h">You</span><span class="h">Enemy</span>
    <span>Ships destroyed</span><b>${P.kills}</b><b>${E.kills}</b>
    <span>Damage dealt</span><b>${Math.round(P.dealt)}</b><b>${Math.round(E.dealt)}</b>
    <span>Shots fired</span><b>${P.shots}</b><b>${E.shots}</b>
    <span>Accuracy</span><b>${acc(P)}</b><b>${acc(E)}</b>
    <span>Missiles and fighters stopped</span><b>${P.ints}${P.screened?` (${P.screened} by escorts)`:''}</b><b>${E.ints}${E.screened?` (${E.screened} by escorts)`:''}</b>`;
  renderShipSummary();
  const rec=recordBattle(surrendered?'surrender': win?'win': draw?'draw':'loss');
  if(rec){ const {g,best}=rec, pt=g.parts;
    $('#end-score').innerHTML=`<div class="sc-top"><span>Score</span><b>${fmtN(g.score)}</b>${best?`<em>New best on ${DIFF_LABEL[g.diff]}</em>`:''}</div>
      <div class="sc-parts">Victory ${fmtN(pt.victory)} · Fleet kept ${fmtN(pt.fleetKept)} · Enemy destroyed ${fmtN(pt.enemyDestroyed)} · Speed ${fmtN(pt.speed)}${g.result==='surrender'?' (a surrendered fleet is forfeit)':''} · ×${g.mult} ${DIFF_LABEL[g.diff]}</div>`;
  } else $('#end-score').innerHTML='';
  showScreen('end');
}

/* ---------------- selection & player actions ---------------- */
function select(s, quiet=false){
  const prev=state.selected;
  state.selected=s && s.alive && s.side==='player' ? s : null; state.mode=null; state.weaponSel='all';
  if(state.selected && !quiet) Sound.select();
  recomputeHighlights(); updateHUD();
  if(state.selected && (state.selected!==prev || !quiet)) focusShip(state.selected);   // after updateHUD, so the safe area allows for the ship panel
}
function recomputeHighlights(){
  const map=new Map(); const s=state.selected;
  state.reach=null;
  if(s && state.phase==='player' && !state.busy){
    if(state.mode==='target'){ const col=new THREE.Color(s.ability.def.target==='enemy'?0x5a2a7a:0x3b8a30); for(const o of abilityTargets(s)) map.set(cellAt(o.q,o.r).idx,col); }
    else {
      if(state.weaponSel!=='all'){ const w=s.weapons[state.weaponSel].def; for(const c of board.list){ const d=hdist(c,s); if(d>0 && d<=(isFinite(w.range)? w.range : w.reach) && c.t!=='rock') map.set(c.idx,new THREE.Color(0x3a1410)); } }
      if(s.mp>0){ state.reach=reachable(s); for(const [,c] of state.reach){ if(c.cost===0||c.blocked) continue; const cell=cellAt(c.q,c.r); const k=c.cost/s.mp; map.set(cell.idx,new THREE.Color(0x13506e).multiplyScalar(1.15-k*0.45)); } }
    }
  }
  setTiles(map); updatePathPreview();
}
function updatePathPreview(){
  const s=state.selected, h=state.hoverCell;
  pathLine.visible=false;
  if(!s || !h || !state.reach || state.mode) return;
  const k=key(h.q,h.r); const c=state.reach.get(k); if(!c || c.cost===0 || c.blocked) return;
  const path=pathTo(state.reach,k); const pts=path.map(p=>hexToWorld(p.q,p.r,0.12));
  pathLine.geometry.dispose(); pathLine.geometry=new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3(pts,false,'centripetal').getPoints(Math.max(8,pts.length*8)));
  pathLine.visible=true;
}
function weaponsForAttack(s, tgt){ if(state.weaponSel==='all') return firingOrder(s).filter(i=>weaponReady(s.weapons[i])&&hitChance(s,s.weapons[i].def,tgt)>0); const i=state.weaponSel; return weaponReady(s.weapons[i])&&hitChance(s,s.weapons[i].def,tgt)>0?[i]:[]; }
async function playerAttack(tgt){
  const s=state.selected; if(!s) return;
  const list=weaponsForAttack(s,tgt);
  if(!list.length){ Sound.deny(); log(`${tgt.name} is out of reach for ${state.weaponSel==='all'?'any ready weapon':s.weapons[state.weaponSel].def.name.toLowerCase()} on ${s.name}`,'sys'); return; }
  state.busy=true; hideTooltip(); recomputeHighlights();
  if(frameShot(s,tgt)) await wait(0.35);   // both ends of the shot on screen before it fires
  if(state.weaponSel==='all') await fireAll(s,tgt); else await fireWeapon(s,state.weaponSel,tgt);
  state.busy=false;
  if(state.weaponSel!=='all' && !weaponReady(s.weapons[state.weaponSel])) state.weaponSel='all';
  if(state.selected && !state.selected.alive) state.selected=null;
  recomputeHighlights(); updateHUD(); updateHover();
}
async function playerMove(k){
  const s=state.selected; const path=pathTo(state.reach,k);
  state.busy=true; pathLine.visible=false; setTiles(new Map());
  await moveShip(s,path); state.busy=false; recomputeHighlights(); updateHUD(); updateHover();
}
async function playerAbility(){
  const s=state.selected; if(!s || state.busy || state.phase!=='player') return;
  if(!abilityReady(s)){ Sound.deny(); return; }
  if(s.ability.def.targeted){ const d=s.ability.def; if(state.mode==='target'){ state.mode=null; } else { if(!abilityTargets(s).length){ Sound.deny(); log(`No ${d.target==='enemy'?'enemy':'ally'} within ${d.range} hexes to ${d.verb}`,'sys'); return; } state.mode='target'; Sound.ui(); } recomputeHighlights(); updateHUD(); return; }
  state.busy=true; await useAbility(s); state.busy=false; recomputeHighlights(); updateHUD();
}
function setWeapon(i){
  const s=state.selected; if(!s || state.busy) return;
  if(i!=='all' && (i>=s.weapons.length)) return;
  if(i!=='all' && !weaponReady(s.weapons[i])){ Sound.deny(); return; }
  state.weaponSel = state.weaponSel===i ? 'all' : i; state.mode=null; Sound.ui(); recomputeHighlights(); updateHUD(); updateHover();
}
function nextShip(){
  const list=alive('player').sort((a,b)=>ORDER.indexOf(b.cls)-ORDER.indexOf(a.cls)); if(!list.length) return;
  const hasOrders=s=>s.mp>0||s.weapons.some(w=>!isPdcGun(w) && weaponReady(w));
  const idx=list.indexOf(state.selected); for(let k=1;k<=list.length;k++){ const s=list[(idx+k)%list.length]; if(hasOrders(s)||k===list.length){ select(s); return; } }
}

/* ---------------- HUD ---------------- */
function log(msg, cls=''){ const d=document.createElement('div'); d.className=cls; d.textContent=msg; const b=$('#logbody'); b.prepend(d); while(b.children.length>50) b.lastChild.remove(); }
function pct(a,b){ return clamp(a/b*100,0,100).toFixed(1)+'%'; }
function refreshTags(){ for(const s of state.ships){ s.tagSh.style.width=pct(s.shield,s.shieldMax); s.tagHu.style.width=pct(s.hull,s.hullMax); s.tagHuBar.classList.toggle('low', s.hull/s.hullMax<0.35);
  const fx=[]; if(s.fx.pdcFired) fx.push('PDCs spent'); if(s.fx.ecm) fx.push('ECM'); if(s.fx.brace) fx.push('Braced'); if(s.fx.pdsurge) fx.push('PD surge'); if(s.blackout) fx.push('Blackout'); const dmg=s.alive? damagedSystems(s).length : 0; if(dmg) fx.push(`\u26a0 ${dmg} damaged`); s.tagFx.textContent=fx.join(', '); s.tagFx.classList.toggle('dmg', !!dmg); } }
function weaponStatus(w){ if(weaponOffline(w)) return `Offline, ${w.sys.t} turn${w.sys.t>1?'s':''}`; if(w.ammo===0) return 'Out of ammo'; if(w.wait>0) return w.firedTurn===state.turn?'Fired':`Reloading, ${w.wait} turn${w.wait>1?'s':''}`; return w.ammo!==undefined?`Ready, ${w.ammo} salvo${w.ammo>1?'s':''} left`:'Ready'; }
// v79: point-defense state for the ship panel and hover card: own PDCs ready or spent, and the share of
// missile-rack missiles its cover (its own or a Frigate's screen) stops
function pdLine(s){ if(!s.alive) return ''; const c=pdCover(s), p=Math.round(interceptChance(s, WEAPONS.missL)*100);
  const own= s.fx.pdcFired? 'Own PDCs spent until its next turn' : 'PDCs ready';
  return `<div class="pdl${s.fx.pdcFired?' spent':''}">${own} · stops ${p}% of missiles${c.by!==s?` (${c.by.name}'s screen)`:''}</div>`; }
// v80: system status chips for the ship panel and hover cards: weapons (the worst of its guns), engines, shields,
// point defense, sensors and, on missile ships, the magazine. Dim when working, amber damaged, red offline with turns left
const SYS_CHIP = { weapons:'WPN', engines:'ENG', shields:'SHD', pdc:'PD', sensors:'SNS', magazine:'MAG' };
function sysChips(s){ if(!s.alive || !s.sys) return '';
  const say=st=> st.state==='offline'? `offline, ${st.t} turn${st.t>1?'s':''}` : st.state;
  const chip=(k,st,tip)=>`<span class="sc ${st.state}" title="${esc(tip)}">${SYS_CHIP[k]}${st.state==='offline'?' '+st.t:''}</span>`;
  const main=s.weapons.filter(w=>!isPdcGun(w)), hurt=main.filter(w=>w.sys.state!=='ok');
  const worst=hurt.reduce((a,w)=>SEVERITY[w.sys.state]>SEVERITY[a.state]?w.sys:a, {state:'ok',t:0});
  let html=chip('weapons', worst, hurt.length? hurt.map(w=>`${w.def.name} ${say(w.sys)}`).join(', ') : 'Weapons ok');
  for(const k of SYS_KEYS){ if((k==='pdc' && !(s.pdc>0)) || (k==='magazine' && !hasMagazine(s))) continue;
    html+=chip(k, s.sys[k], `${SYS_LABEL[k]} ${say(s.sys[k])}`); }
  return `<div class="sysc">${html}</div>`; }
function updateHUD(){
  $('#ti-turn').textContent=`Turn ${Math.max(1,state.turn)} / ${turnLimit()}`;
  $('#ti-phase').textContent= state.phase==='player'?'Your orders': state.phase==='enemy'?'Enemy maneuvering':'';
  const str=side=>{ const all=state.ships.filter(s=>s.side===side); const t=all.reduce((a,s)=>a+s.hullMax,0); return all.reduce((a,s)=>a+Math.max(0,s.hull),0)/t*100; };
  $('#sb-p i').style.width=str('player')+'%'; $('#sb-e i').style.width=str('enemy')+'%';
  // roster
  const ro=$('#roster'); ro.innerHTML='';
  for(const s of state.ships.filter(s=>s.side==='player').sort((a,b)=>ORDER.indexOf(b.cls)-ORDER.indexOf(a.cls))){
    const b=document.createElement('button'); b.className='card'+(s===state.selected?' sel':'')+(s.alive?'':' dead');
    const ready=s.weapons.filter(w=>!isPdcGun(w) && weaponReady(w)).length;
    b.innerHTML=`<div class="row"><span class="nm">${s.name}</span><span class="cl">${s.C.label}</span></div>
      <div class="bars"><div class="mbar sh"><i style="width:${pct(s.shield,s.shieldMax)}"></i></div><div class="mbar hu ${s.hull/s.hullMax<.35?'low':''}"><i style="width:${pct(s.hull,s.hullMax)}"></i></div></div>
      <div class="st">${s.alive?`<span class="${s.mp>0?'ok':''}">Move ${s.mp}/${s.mpMax}</span><span class="${ready?'ok':''}">${ready} weapon${ready!==1?'s':''} ready</span>`:'<span>Destroyed</span>'}</div>${s.alive&&damagedSystems(s).length?`<div class="dmgl">${damageSummary(s)}</div>`:''}`;
    if(s.alive) b.onclick=()=>{ if(state.phase==='player'&&!state.busy){ select(s); } };
    b.onmouseenter=()=>{ state.rosterHover=s; }; b.onmouseleave=()=>{ state.rosterHover=null; };
    ro.appendChild(b);
  }
  const el=$('#elist'); el.innerHTML='';
  for(const s of state.ships.filter(s=>s.side==='enemy').sort((a,b)=>ORDER.indexOf(b.cls)-ORDER.indexOf(a.cls))){
    const d=document.createElement('div'); d.className='erow'+(s.alive?'':' dead');
    d.innerHTML=`<div class="row">${s.name}<span>${s.alive?s.C.label:'Destroyed'}</span></div><div class="mbar sh"><i style="width:${pct(s.shield,s.shieldMax)}"></i></div><div class="mbar hu"><i style="width:${pct(s.hull,s.hullMax)}"></i></div>${s.alive&&damagedSystems(s).length?`<div class="dmgl">${damageSummary(s)}</div>`:''}`;
    if(s.alive) d.onclick=()=>{ const sel=state.selected; if(sel) frameShot(sel,s); else keepInView([s]); };   // picking a contact brings it into view, beside your selected ship
    d.onmouseenter=()=>{ state.rosterHover=s; }; d.onmouseleave=()=>{ state.rosterHover=null; };
    el.appendChild(d);
  }
  // ship panel
  const s=state.selected;
  $('#sp-empty').style.display= s?'none':'block'; $('#sp-body').style.display= s?'flex':'none';
  $('#sp-empty').textContent = state.phase==='enemy' ? 'The enemy is maneuvering. Stand by.' : 'Select one of your ships to give it orders.';
  if(s){
    $('#sp-name').textContent=s.name; $('#sp-class').textContent=`${s.C.label}, ${s.C.role.toLowerCase()}`; $('#sp-class').title=s.C.passive||'';
    $('#sp-stats').innerHTML=`<div class="sr"><span>Hull</span><b>${Math.ceil(s.hull)} / ${s.hullMax}</b><div class="mbar hu ${s.hull/s.hullMax<.35?'low':''}"><i style="width:${pct(s.hull,s.hullMax)}"></i></div></div>
      <div class="sr" title="Regenerates ${s.regen} a turn"><span>Shields</span><b>${Math.round(s.shield)} / ${s.shieldMax}</b><div class="mbar sh"><i style="width:${pct(s.shield,s.shieldMax)}"></i></div></div>
      <div class="sx">Move <b>${s.mp}/${s.mpMax}</b> · Armor <b>${s.armor}${s.fx.brace?'×2':''}</b> · Evasion <b>${s.ev}${s.fx.ecm?'+20':''}</b></div>${damagedSystems(s).length?`<div class="dmgl">${damageSummary(s)}</div>`:''}`+sysChips(s)+pdLine(s);
    const wc=$('#sp-weapons'); wc.innerHTML='';
    s.weapons.forEach((w,i)=>{ const d=w.def; const b=document.createElement('button'); b.className='wbtn'+(state.weaponSel===i?' on':'')+(w.sys&&w.sys.state!=='ok'?' sys-'+w.sys.state:''); b.disabled=!weaponReady(w)||state.busy||state.phase!=='player';
      b.innerHTML=`<span class="k">${i+1}</span><span class="wn">${d.name}</span><span class="wd">${isFinite(d.range)? 'Range '+d.range : 'Range '+d.reach+'+'}, ${d.shots>1?d.shots+'×':''}${d.dmg} dmg</span><span class="ws">${weaponStatus(w)}${w.sys&&w.sys.state==='damaged'?' · damaged':''}</span>`;
      b.onclick=()=>setWeapon(i); b.title=weaponBlurb(d); wc.appendChild(b); });
    const ab=document.createElement('button'); ab.className='wbtn'+(state.weaponSel==='all'?' on':''); ab.disabled=state.busy||state.phase!=='player'||!s.weapons.some(w=>!isPdcGun(w) && weaponReady(w));
    ab.innerHTML=`<span class="k">F</span><span class="wn">All weapons</span><span class="wd">Fire everything in reach</span><span class="ws">${s.weapons.filter(w=>!isPdcGun(w) && weaponReady(w)).length} ready</span>`; ab.onclick=()=>setWeapon('all'); wc.appendChild(ab);
    const bot=$('#sp-bottom'); bot.innerHTML=''; const a=s.ability;
    const bb=document.createElement('button'); bb.id='abil'; bb.className='wbtn'+(state.mode==='target'?' on':''); bb.disabled=!abilityReady(s)||state.busy||state.phase!=='player'; bb.title=a.def.desc;
    bb.innerHTML=`<span class="k">Q</span><span class="wn">${a.def.name}</span><span class="wd">${state.mode==='target'?`Click ${a.def.target==='enemy'?'an enemy':'an ally'} to ${a.def.verb}`:'Ability'}</span><span class="ws">${state.mode==='target'?'Q to cancel': a.wait?`Recharging, ${a.wait} turn${a.wait>1?'s':''}`:'Ready'}</span>`;
    bb.onclick=playerAbility; bot.appendChild(bb);
  }
  const et=$('#endturn'); et.disabled= state.phase!=='player'||state.busy;
  const spent = state.phase==='player' && alive('player').every(s=>s.mp===0 && !s.weapons.some(w=>weaponReady(w) && alive('enemy').some(t=>hitChance(s,w.def,t)>0)));
  et.classList.toggle('ready', spent && !state.busy);
}
function weaponBlurb(d){ return {pulse:'Rapid bolts. Strong against shields, weak against armor.', beam:'Highly accurate, falls off fast with range.', rail:'Long range, pierces armor, weak against shields. Needs line of sight.', missile:'Guided, ignores asteroids. Point defense can intercept.', fighter:'Fighters with long reach, hard to intercept. Rearms every other turn.', pdc:'Point defense turned on a ship at knife range: many small rounds, strong on hull, weak on shields. No missile defense until your next turn.'}[d.kind]; }

/* ---------------- tooltip & hover ---------------- */
const tip=$('#tooltip'); let mouse={x:0,y:0};
function hideTooltip(){ tip.style.display='none'; }
// v73 (Jon): the card follows the cursor but stays inside the area the docked panels leave free (safeRect, input.js),
// so hovering a ship near the bottom no longer covers the weapon buttons or End turn
/* v73: the busy chip. While your own move, volley or ability plays out the game takes no new orders; the chip says
   so after a short delay (quick actions never flash it), and a click meanwhile, or during the enemy's turn, pulses it. */
let busySince=-1, busyShown=false, nudgeT=0;
function updateBusy(dt){
  const el=$('#busy'), resolving=state.busy && state.phase==='player' && !cam.menu;
  busySince= resolving? (busySince<0? 0 : busySince+dt) : -1; nudgeT=Math.max(0, nudgeT-dt);
  const show=(resolving && busySince>0.35) || nudgeT>0;
  if(show!==busyShown){ busyShown=show; el.classList.toggle('on', show); }
  if(show && !nudgeT && el.textContent!=='Resolving…') el.textContent='Resolving…';
}
function nudgeBusy(text='Resolving…'){ const el=$('#busy'); el.textContent=text; nudgeT=1.1; el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
function showTooltip(html){ tip.innerHTML=html; tip.style.display='block'; const w=tip.offsetWidth, h=tip.offsetHeight; let x=mouse.x+18, y=mouse.y+14;
  const S= typeof safeRect==='function' ? safeRect() : {l:8, t:8, r:innerWidth-8, b:innerHeight-8};
  if(x+w>S.r) x=mouse.x-w-14; if(y+h>S.b) y=mouse.y-h-14;
  if(S.r-S.l>=w) x=clamp(x, S.l, S.r-w); if(S.b-S.t>=h) y=clamp(y, S.t, S.b-h);
  tip.style.left=x+'px'; tip.style.top=y+'px'; }
function updateHover(){
  const h=state.hoverShip || state.hoverRock, s=state.selected; tgtRing.visible=false;
  for(const sh of state.ships) sh.tagHit.classList.remove('show');
  if(state.phase==='player' && s && !state.busy && !state.mode){
    for(const t of alive('enemy')){ const list=weaponsForAttack(s,t); if(!list.length) continue;
      if(state.weaponSel==='all'){ const e=list.reduce((a,i)=>a+expected(s,s.weapons[i].def,t).dmg,0); t.tagHit.textContent='~'+Math.round(e); }
      else { const w=s.weapons[state.weaponSel], p=hitChance(s,w.def,t); t.tagHit.textContent=(p?clamp(p+slotAcc(w),5,95):0)+'%'; }
      t.tagHit.classList.add('show'); }
  }
  if(!h || state.phase==='menu'){ hideTooltip(); return; }
  if(h.side==='enemy' || h.isRock){
    tgtRing.visible=true; tgtRing.position.copy(hexToWorld(h.q,h.r,0.04));
    let html= h.isRock ? `<h4>Asteroid</h4><div class="tr"><span>Blocks movement and line of sight</span></div><div class="tr"><span>Integrity</span><b>${Math.ceil(h.hull)} / ${h.hullMax}</b></div>`
      : `<h4>${h.name}</h4><div class="tr"><span>${h.C.label}</span><span>Hull <b>${Math.ceil(h.hull)}</b> Shields <b>${Math.round(h.shield)}</b></span></div>`;
    if(s && state.mode==='target' && s.ability.def.target==='enemy' && !h.isRock) html+= abilityTargets(s).includes(h)? (h.blackout?`<div class="hint">Already blacked out</div>`:`<div class="sum">Click to ${s.ability.def.verb} ${h.name}</div>`) : `<div class="hint">Out of range</div>`;
    if(s && state.phase==='player' && !state.mode){
      html+=`<div style="height:5px"></div>`; let tot=0; const idx= state.weaponSel==='all'? firingOrder(s) : [state.weaponSel];
      for(const i of idx){ const w=s.weapons[i]; const d=w.def; const ready=weaponReady(w); const e=expected(s,d,h); const p=e.p? clamp(e.p+slotAcc(w),5,95) : 0;
        let note= !ready?weaponStatus(w).toLowerCase(): !p ? (hdist(s,h)>d.range?'out of range':'no line of sight') : `${p}% · ~${Math.round(e.dmg)}`;
        if(ready&&p) tot+=e.dmg;
        html+=`<div class="tr ${ready&&p?'':'off'}"><span>${d.name}</span><b>${note}</b></div>`; }
      const cover=cellAt(h.q,h.r).t==='debris';
      if(tot>0) html+=`<div class="sum">Expected damage ~${Math.round(tot)}${h.isRock&&tot>=h.hull?', likely shatters it':''}</div><div class="hint">Click to fire${cover?'. Target has debris cover':''}${h.fx.ecm?'. Target is under ECM':''}</div>`;
      else html+=`<div class="hint">Nothing can reach this target from here</div>`;
    } else if(h.isRock) html+=`<div class="hint">Select a ship, then click to shoot it apart</div>`;
    else html+=`<div class="tr"><span>Armor ${h.armor}</span><span>Evasion ${h.ev}</span></div><div class="tr"><span>Weapons</span><span>${h.weapons.map(w=>w.def.name).join(', ')}</span></div>`;
    if(!h.isRock && damagedSystems(h).length) html+=`<div class="hint dmgl">${damageSummary(h)}</div>`;
    if(!h.isRock) html+=sysChips(h)+pdLine(h);
    showTooltip(html);
  } else {
    let html=`<h4>${h.name}</h4><div class="tr"><span>${h.C.label}</span><span>Move <b>${h.mp}/${h.mpMax}</b></span></div><div class="tr"><span>Hull <b>${Math.ceil(h.hull)}/${h.hullMax}</b></span><span>Shields <b>${Math.round(h.shield)}/${h.shieldMax}</b></span></div>`;
    if(state.mode==='target' && s && s.ability.def.target==='ally' && h!==s) html+= abilityTargets(s).includes(h)?`<div class="sum">Click to ${s.ability.def.verb} ${h.name}</div>`:`<div class="hint">Out of range</div>`;
    html+=sysChips(h)+pdLine(h);
    showTooltip(html);
  }
}

