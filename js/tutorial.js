// Laniakea's Edge: the first-battle tutorial (v85, review roadmap round 4). A real battle on a fixed seed against the
// normal AI on Easy, with a step card that moves on when the player does what it asks. Each step's `done` is a check on
// the game state, polled from frame(), so nothing in the combat code knows the tutorial exists. Once the steps run
// out it gives tips as situations come up. Tutorial battles are never recorded (recordBattle checks state.tutorial).
// Plain script, not a module: all js/ files share one global scope and are loaded in order by index.html,
// so anything used at load time must be defined in an earlier file (or earlier in this one).
'use strict';

const TUT = { seed:1207, location:'reach', diff:'easy',
  player:['frigate','destroyer','patrol'], enemy:['corvette','corvette','patrol'] };
const touchUI = () => document.documentElement.classList.contains('touch');
const tapWord = () => touchUI()? 'Tap' : 'Click';

// text may be a function, so it can read the battle; `next:true` waits for the Next button instead of a check
const TUT_STEPS = [
  // the first ship is selected for you, so selecting is taught here rather than as a step of its own
  { text:()=>`${state.selected? `${state.selected.name} is selected; ${tapWord().toLowerCase()} any of your ships, or its card, to switch.` : `${tapWord()} one of your ships, or its card, to give it orders.`} The blue hexes are where it can move this turn. ${tapWord()} one to move there. ${touchUI()? 'Drag to orbit the view, pinch to zoom.' : 'Drag to orbit the view, scroll to zoom.'}`,
    done:()=>alive('player').some(s=>s.mp<s.mpMax) },
  { desktop:true, text:'Hover over an enemy ship. Its card shows each of your weapons\' hit chance and expected damage, its point defense and its systems.',
    done:()=>!!(state.hoverShip && state.hoverShip.side==='enemy') },
  { text:()=>`${tapWord()} an enemy to fire every weapon that can reach it. ${touchUI()? 'Your weapon buttons pick a single one.' : 'Keys 1 to 3 pick a single weapon; F goes back to all.'} If a shot can't be taken, the reason shows at the top of the screen.`,
    done:()=>state.stats.player.shots>0 },
  { text:()=>`${touchUI()? 'Tap the Threat button' : 'Press T, or the Threat button,'} to see where enemy fire could reach this ship next turn. Red is the most dangerous. Your other ships can still move and fire.`,
    done:()=>state.threat },
  { id:'end', text:'When your ships are done, end the turn. Anything you leave unused is simply skipped.', done:()=>state.phase==='enemy' },
  { id:'enemy', text:'The enemy moves and fires. Missiles can be shot down: every ship\'s PDCs intercept some, and a Frigate screens every ally within 3 hexes.',
    done:()=>state.phase==='player' },
  { next:true, text:()=>{ const n=state.stats.player.ints; return `${n? `Your point defense stopped ${n} missile${n>1?'s':''}.` : 'None of their missiles were stopped this time.'} Hits that reach a hull can knock out a system: the chips on the ship panel turn amber when damaged and red when offline.`; } },
  { text:()=>`Every ship has one ability, on the button beside its weapons${touchUI()? '' : ' (Q)'}. It recharges over a few turns. Try one.`,
    done:()=>alive('player').some(s=>s.ability.wait>0) },
  { next:true, last:true, text:()=>`Win by destroying their fleet, or by holding more fleet value when turn ${turnLimit()} ends. Tips will appear here as things happen.` },
];
// shown once each, after the steps, when the situation comes up
const TUT_TIPS = [
  { when:()=>state.phase==='player' && alive('player').some(s=>alive('enemy').some(e=>hdist(s,e)<=2)),
    text:'An enemy is within 2 hexes. Your PDC guns can fire on it, but that ship then can\'t intercept missiles until its next turn.' },
  { when:()=>state.phase==='player' && alive('enemy').some(e=>e.hull/e.hullMax<BLAST_WARN),
    text:'An enemy is badly hurt. A dying ship explodes and hurts every ship within 1 hex, friend or foe. Its card warns you before you fire.' },
  { when:()=>alive('player').some(s=>damagedSystems(s).length),
    text:'One of your ships has a damaged system. Its chips show which; crews repair them over a few turns.' },
];

const Tut = {
  on:false, i:0, tip:null, seen:new Set(), prevDiff:null, shown:'',
  // called by startGame with the fleets about to be played: the tutorial's own, or anything else (which ends it)
  setup(f){ if(!f.tutorial){ this.stop(); return; }
    if(this.prevDiff===null) this.prevDiff=state.diff;
    state.diff=TUT.diff; state.tutorial=true; this.on=true; this.i=0; this.tip=null; this.seen.clear(); this.shown=''; },
  play(){ Sound.init(); closeScreen(); startGame({ player:TUT.player, enemy:TUT.enemy, enemyName:'Training', youId:'tutorial', enemyId:'tutorial',
    quick:true, tutorial:true, seed:TUT.seed, location:TUT.location }); },
  stop(){ if(this.prevDiff!==null){ state.diff=this.prevDiff; this.prevDiff=null; } state.tutorial=false; this.on=false; this.render(null); },
  finish(){ store.set('tutorial','done'); this.on=false; this.render(null); },   // the battle carries on, still unrecorded
  step(){ while(this.i<TUT_STEPS.length && TUT_STEPS[this.i].desktop && touchUI()) this.i++; return TUT_STEPS[this.i]; },
  next(){ Sound.ui(); if(this.tip){ this.tip=null; return; } if(this.step() && this.step().last) store.set('tutorial','done'); this.i++; },
  tick(){ if(!this.on) return;
    if(state.phase==='end'){ this.finish(); return; }
    if(state.phase==='menu' || state.phase==='starting') return this.render(null);
    let st=this.step();
    // ending the turn early skips whatever was left before it
    if(st && state.phase==='enemy' && this.i<TUT_STEPS.findIndex(s=>s.id==='enemy')){ this.i=TUT_STEPS.findIndex(s=>s.id==='enemy'); st=this.step(); }
    while(st && !st.next && st.done()){ this.i++; st=this.step(); }
    if(st){ const t=st.text; return this.render(typeof t==='function'? t() : t, `Tutorial ${this.i+1} / ${TUT_STEPS.length}`, !!st.next); }
    if(!this.tip) for(const [k,tp] of TUT_TIPS.entries()) if(!this.seen.has(k) && tp.when()){ this.seen.add(k); this.tip=tp.text; break; }
    this.render(this.tip, 'Tip', true);
  },
  // the card is redrawn only when its text changes
  render(text, label='', withNext=false){ const el=$('#tut'), key=text? label+'|'+text+'|'+withNext : '';
    if(key===this.shown) return; this.shown=key;
    el.classList.toggle('on', !!text); document.body.classList.toggle('tut-on', !!text);
    if(text){ $('#tut-n').textContent=label; $('#tut-t').textContent=text; $('#tut-next').hidden=!withNext; $('#tut-skip').hidden=label==='Tip';
      const tb=$('#topbar').getBoundingClientRect(); el.style.top=Math.max(tb.bottom+8, 12)+'px';
      const r=el.getBoundingClientRect();   // on phones the CSS puts it above the command bar instead
      if(r.top<innerHeight*0.4) document.documentElement.style.setProperty('--busy-top', (r.bottom+8)+'px'); else document.documentElement.style.removeProperty('--busy-top'); }
    else document.documentElement.style.removeProperty('--busy-top');
    safeRect(true); },
};
$('#tut-next').onclick=()=>{ Tut.next(); Tut.tick(); };
$('#tut-skip').onclick=()=>{ Sound.ui(); Tut.finish(); };
$('#btn-tut').onclick=()=>Tut.play();
// a first-time player (no tutorial seen, no battles recorded) is offered the tutorial before their first Quick battle
$('#btn-quick').onclick=()=>{ if(!store.get('tutorial',null) && !loadScores().games.length){ Sound.init(); Sound.ui(); showScreen('tutask'); } else startGame(quickFleets()); };
$('#btn-tutask-play').onclick=()=>Tut.play();
$('#btn-tutask-quick').onclick=()=>{ store.set('tutorial','declined'); closeScreen(); startGame(quickFleets()); };
