import { EXERCISES, DAYS, GROUPS, KIND_COLOR, NOTES, FIXED_MEALS, DINNERS, SWAPS, prescription, monthStory, calorieTarget } from './plan.js';
import * as S from './store.js';
import * as D from './drive.js';
import { PROVIDERS, ask, chatPrompt } from './ai.js';

const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// Dev bypass: localStorage.setItem('fit.devBypass','1') lets the app run without Google.
const devBypass = () => { try { return localStorage.getItem('fit.devBypass') === '1'; } catch { return false; } };

const ui = {
  view: 'today', dayIdx: S.dayIndex(new Date()), workoutOpen: true, foodOpen: true, tip: null,
  sync: 'idle', syncMsg: '', coachBusy: false, coachAnswer: '', coachError: '', swapOpen: false, signinError: '',
};
let data = S.load();
let today = new Date();

// ---------- sync ----------
let syncTimer = null;
function touched() {
  S.save(data);
  render();
  if (D.token() && navigator.onLine) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => pushNow(), 1500);
  }
}
async function pushNow() {
  if (!D.token()) return;
  ui.sync = 'syncing'; renderSyncBadge();
  try { await D.push(data); ui.sync = 'ok'; ui.syncMsg = 'Saved to Drive'; }
  catch (e) { ui.sync = 'error'; ui.syncMsg = e.message === 'no-token' ? 'Sign-in expired' : 'Could not reach Drive'; }
  renderSyncBadge();
}
async function fullSync() {
  if (!D.token()) return;
  ui.sync = 'syncing'; ui.syncMsg = 'Syncing'; renderSyncBadge();
  try {
    const remote = await D.pull();
    const merged = S.merge(data, remote);
    const localChanged = JSON.stringify(merged) !== JSON.stringify(remote);
    data = merged; S.save(data);
    if (localChanged) await D.push(data);
    ui.sync = 'ok'; ui.syncMsg = 'Synced with Drive';
  } catch (e) {
    ui.sync = 'error'; ui.syncMsg = e.message === 'no-token' ? 'Sign-in expired' : 'Could not reach Drive';
  }
  render();
}

// ---------- boot ----------
async function boot() {
  const r = await D.handleRedirect();
  if (r === 'denied') ui.signinError = 'The app needs permission to keep its own file in your Drive. Please allow it to continue.';
  const signedIn = !!D.token() || devBypass();
  if (!signedIn && D.signedInBefore() && D.configured() && navigator.onLine && r === 'none' && !sessionStorage.getItem('fit.silentTried')) {
    sessionStorage.setItem('fit.silentTried', '1');
    D.signIn({ silent: true });
    return;
  }
  if (signedIn || (D.signedInBefore() && !navigator.onLine)) {
    S.ensureStart(data, today);
    ui.view = 'today';
    render();
    if (D.token() && navigator.onLine) fullSync();
  } else {
    ui.view = 'signin';
    render();
  }
  setInterval(() => { const t = new Date(); if (S.iso(t) !== S.iso(today)) { today = t; ui.dayIdx = S.dayIndex(today); render(); } }, 60000);
  window.addEventListener('online', () => { if (D.token()) fullSync(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ---------- icons ----------
const I = {
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  fwd: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  chev: '<svg class="chev" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  dumbbell: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"/></svg>',
  fork: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M17 3c-2 2-3 5-3 8h3v10"/></svg>',
  today: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  chart: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
  gear: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  shield: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>',
  google: '<svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.1 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.1 0 11.3-2 15.1-5.5l-7.5-5.8c-2 1.4-4.6 2.3-7.6 2.3-6.3 0-11.7-4.1-13.6-9.8l-7.8 6C6.5 42.6 14.6 48 24 48z"/></svg>',
};
function moodIcon(mood, color) {
  switch (mood) {
    case 'doms': return `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" class="anim-shake"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="${color}"/></svg>`;
    case 'accustom': return `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" class="anim-grow"><path d="M12 22V11" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/><path d="M12 12c0-4 3-7 8-7 0 4-3 7-8 7z" fill="${color}"/><path d="M12 16c0-3-2.5-5.5-6-5.5 0 3 2.5 5.5 6 5.5z" fill="${color}" opacity=".75"/></svg>`;
    case 'flow': return `<svg width="26" height="22" viewBox="0 0 26 22" aria-hidden="true" style="overflow:hidden"><g class="anim-flow"><path d="M0 7c3-3 6-3 9 0s6 3 9 0 6-3 9 0 6 3 9 0" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/><path d="M0 14c3-3 6-3 9 0s6 3 9 0 6-3 9 0 6 3 9 0" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" opacity=".55"/></g></svg>`;
    default: return `<svg width="26" height="24" viewBox="0 0 26 24" aria-hidden="true"><g class="anim-hop"><path d="M8 3h10v5a5 5 0 0 1-10 0V3z" fill="${color}"/><path d="M8 5H5a3 3 0 0 0 3 4M18 5h3a3 3 0 0 1-3 4" fill="none" stroke="${color}" stroke-width="1.8"/><path d="M11 13h4v3h-4zM9 17h8v2H9z" fill="${color}"/></g><path class="anim-tw" d="M3 2l.8 1.8L5.6 4.6l-1.8.8L3 7.2l-.8-1.8L.4 4.6l1.8-.8z" fill="${color}"/><path class="anim-tw2" d="M23 1l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7z" fill="${color}"/><path class="anim-tw3" d="M22 15l.6 1.3 1.3.6-1.3.6-.6 1.3-.6-1.3-1.3-.6 1.3-.6z" fill="${color}"/></svg>`;
  }
}
const MOOD_STYLE = { doms: ['#FFE3DD', '#C2351C'], accustom: ['#FFECC7', '#9A5B00'], flow: ['#DCEBFF', '#1D4FBF'], end: ['#EADFFF', '#5B2DB3'] };

// ---------- render ----------
function render() {
  const app = $('#app');
  if (ui.view === 'signin') { app.innerHTML = viewSignIn(); return; }
  app.innerHTML = `
    <header class="top">
      <div class="week-badge"><span class="shine"></span>Week ${S.weekOf(data, today)}</div>
      <button class="icon-btn gear" data-act="view" data-view="settings" aria-label="Settings">${I.gear}</button>
    </header>
    <main>${ui.view === 'today' ? viewToday() : ui.view === 'progress' ? viewProgress() : viewSettings()}</main>
    <nav class="tabs">
      <button data-act="view" data-view="today" class="${ui.view === 'today' ? 'on' : ''}">${I.today}<span>Today</span></button>
      <button data-act="view" data-view="progress" class="${ui.view === 'progress' ? 'on' : ''}">${I.chart}<span>Progress</span></button>
    </nav>`;
  renderSyncBadge();
}
function renderSyncBadge() {
  const el = $('#sync');
  if (!el) return;
  el.className = 'sync ' + ui.sync;
  el.textContent = ui.syncMsg;
}

function viewSignIn() {
  const ok = D.configured();
  return `<section class="signin">
    <div class="signin-top">
      <div class="logo">${I.dumbbell}</div>
      <h1>Your plan,<br>one week at a time.</h1>
      <p>Workouts, levels and meals for the week you are in. Progress builds up month by month.</p>
    </div>
    <div class="signin-bottom">
      <div class="privacy">${I.shield}<div>Your data is saved in a private app folder in your own Google Drive, so it follows you across devices. The app cannot see any other file in your Drive.</div></div>
      ${ui.signinError ? `<div class="err">${esc(ui.signinError)}</div>` : ''}
      ${ok
        ? `<button class="google-btn" data-act="signin"><span class="shine"></span>${I.google}<span>Continue with Google</span></button>
           <div class="hint">Google will ask you to allow this app to store its own files in your Drive.</div>`
        : `<button class="google-btn" disabled>${I.google}<span>Setup needed</span></button>
           <div class="hint">Paste your Google client ID into <code>js/config.js</code>. The README explains how to get one.</div>`}
    </div>
  </section>`;
}

function selectedDate() { return S.addDays(S.mondayOf(today), ui.dayIdx); }

function viewToday() {
  const date = selectedDate();
  const d = S.iso(date), t = S.iso(today);
  const day = DAYS[ui.dayIdx];
  const week = S.weekOf(data, today);
  const editable = d <= t;
  const ticks = data.done[d] || {};
  const doneCount = day.exercises.filter(id => ticks[id]).length;
  const strip = DAYS.map((x, i) => {
    const dd = S.addDays(S.mondayOf(today), i);
    const st = S.dayStatus(data, dd, today);
    const cls = i === ui.dayIdx ? 'on' : S.iso(dd) > t ? 'future' : '';
    return `<button class="day ${cls} k-${x.kind}" data-act="day" data-i="${i}" aria-label="${x.name}"><span>${x.short}</span><i class="dot s-${st}"></i></button>`;
  }).join('');
  return `
    <div class="date-line">${fmtDate(date)}${d === t ? '' : d < t ? ' · earlier this week' : ' · later this week'}</div>
    <div class="strip">
      <button class="icon-btn" data-act="nav" data-n="-1" ${ui.dayIdx === 0 ? 'disabled' : ''} aria-label="Previous day">${I.back}</button>
      <div class="days">${strip}</div>
      <button class="icon-btn" data-act="nav" data-n="1" ${ui.dayIdx === 6 ? 'disabled' : ''} aria-label="Next day">${I.fwd}</button>
    </div>
    <div class="sections">
      <button class="sec-head workout" data-act="toggle" data-k="workoutOpen"><span class="shine"></span>
        <span class="sec-ico">${I.dumbbell}</span>
        <span class="sec-txt"><b>Workout</b><small>${day.title}, ${doneCount} of ${day.exercises.length} done</small></span>
        ${I.chev.replace('class="chev"', `class="chev ${ui.workoutOpen ? 'open' : ''}"`)}
      </button>
      ${ui.workoutOpen ? day.exercises.map(id => exerciseCard(id, d, week, editable, ticks[id])).join('') : ''}
      ${foodSection(date, editable)}
    </div>`;
}

function exerciseCard(id, d, week, editable, done) {
  const ex = EXERCISES[id];
  if (ex.type === 'checklist') {
    return `<article class="card ex" style="--accent:#5B3FD1">
      <div class="row"><div class="grow"><div class="name">${esc(ex.name)}</div><div class="how">${esc(ex.how)}</div></div>
      <button class="tick ${done ? 'on' : ''}" data-act="tick" data-id="${id}" data-date="${d}" ${editable ? '' : 'disabled'} aria-label="Mark done">${I.check}</button></div>
    </article>`;
  }
  const st = S.levelState(data, id, week);
  const note = NOTES[st.subWeek - 1];
  const [nbg, nfg] = MOOD_STYLE[note.mood];
  const bars = ex.levels.map((_, i) => {
    const n = i + 1, total = ex.levels.length;
    const h = Math.round(14 + i * (32 / Math.max(1, total - 1)));
    const cls = n < st.level ? 'full' : n === st.level ? 'cur' : '';
    const inner = n === st.level ? Math.round(st.subWeek / 4 * 100) : 0;
    return `<i class="bar ${cls}" style="height:${h}px"><b style="height:${inner}%"></b></i>`;
  }).join('');
  const next = st.atTop ? 'Target reached' : `Next level: ${ex.levels[st.level].load.toLowerCase()}`;
  const tipOpen = ui.tip === id;
  return `<article class="card ex" style="--accent:${ex.color}">
    <div class="row">
      <div class="grow">
        <div class="name-row"><div class="name">${esc(ex.name)}</div>
          <button class="info ${tipOpen ? 'on' : ''}" data-act="tip" data-id="${id}" aria-label="Explain this month’s plan">${I.info}</button></div>
        <div class="rx">${esc(prescription(id, st.level, st.subWeek))}</div>
        <div class="mood" style="background:${nbg};color:${nfg}">${moodIcon(note.mood, nfg)}<span>${note.text}</span></div>
      </div>
      <button class="tick ${done ? 'on' : ''}" data-act="tick" data-id="${id}" data-date="${d}" ${editable ? '' : 'disabled'} aria-label="Mark done">${I.check}</button>
    </div>
    ${tipOpen ? `<div class="tip">${esc(monthStory(id, st.level, st.subWeek))}</div>` : ''}
    <div class="chart-row">
      <div class="bars">${bars}</div>
      <div class="lvl"><small>Level ${st.level} of ${st.max}, week ${st.subWeek} of 4</small><b>${esc(next)}</b></div>
    </div>
    <div class="btns">
      <button class="btn red" data-act="regress" data-id="${id}" ${st.level === 1 ? 'disabled' : ''}>Regress</button>
      <button class="btn green" data-act="progress" data-id="${id}" ${st.atTop ? 'disabled' : ''}>Progress</button>
    </div>
  </article>`;
}

function mealsFor(date) {
  const s = data.settings;
  const meals = FIXED_MEALS.map(m => m.id === 'snack'
    ? { ...m, name: `Trail mix, ${s.trailMixGrams} g`, kcal: Math.round(m.kcalPerGram * s.trailMixGrams), protein: Math.round(m.proteinPerGram * s.trailMixGrams) }
    : m);
  const wd = S.dayIndex(date);
  const plan = DINNERS[wd];
  const pool = plan.egg ? SWAPS.egg : SWAPS.noegg;
  const chosen = data.dinner[S.iso(date)];
  const dinner = (chosen && pool.find(x => x.name === chosen)) || plan.main;
  return { meals, dinner, egg: plan.egg, pool: pool.filter(x => x.name !== dinner.name) };
}

function foodSection(date, editable) {
  const d = S.iso(date);
  const { meals, dinner, egg, pool } = mealsFor(date);
  const eaten = data.eaten[d] || {};
  const target = calorieTarget(data.settings);
  const pTarget = data.settings.proteinTarget;
  const all = [...meals, { id: 'dinner', ...dinner, color: '#B8600A' }];
  const got = all.filter(m => eaten[m.id]);
  const kcal = got.reduce((a, m) => a + m.kcal, 0);
  const prot = got.reduce((a, m) => a + m.protein, 0);
  const planned = all.reduce((a, m) => a + m.kcal, 0);
  const plannedP = all.reduce((a, m) => a + m.protein, 0);
  const seg = all.map(m => `<i style="width:${Math.min(100, m.kcal / target * 100)}%;background:${eaten[m.id] ? m.color : '#F6D9B8'}"></i>`).join('');
  return `
    <button class="sec-head food" data-act="toggle" data-k="foodOpen"><span class="shine"></span>
      <span class="sec-ico">${I.fork}</span>
      <span class="sec-txt"><b>Food</b><small>${egg ? 'Egg day' : 'No-egg day'}, ${kcal.toLocaleString()} of ${target.toLocaleString()} kcal</small></span>
      ${I.chev.replace('class="chev"', `class="chev ${ui.foodOpen ? 'open' : ''}"`)}
    </button>
    ${!ui.foodOpen ? '' : `
    <article class="card">
      <div class="kv"><b>Calories</b><span><strong>${kcal.toLocaleString()}</strong> of ${target.toLocaleString()}</span></div>
      <div class="seg">${seg}</div>
      <div class="legend">${all.map(m => `<span><i style="background:${m.color}"></i>${m.id === 'dinner' ? 'Dinner' : m.id[0].toUpperCase() + m.id.slice(1)}</span>`).join('')}</div>
      <div class="kv" style="margin-top:10px"><b>Protein</b><span><strong style="color:${prot >= pTarget ? '#1E7A52' : '#16201B'}">${prot} g</strong> of ${pTarget} g</span></div>
      <div class="pbar"><i style="width:${Math.min(100, prot / pTarget * 100)}%"></i></div>
      <div class="muted">${prot >= pTarget ? 'Protein target hit' : `Full day as planned: ${planned.toLocaleString()} kcal, ${plannedP} g protein`} · eating window ${esc(data.settings.eatingWindow)}</div>
    </article>
    ${meals.map(m => `<article class="card meal" style="--accent:${m.color}">
      <div class="grow"><small style="color:${m.color}">${esc(m.slot)}</small><div class="name">${esc(m.name)}</div><div class="muted">${m.kcal} kcal, ${m.protein} g protein</div></div>
      <button class="tick ${eaten[m.id] ? 'on' : ''}" data-act="eat" data-id="${m.id}" data-date="${d}" ${editable ? '' : 'disabled'} aria-label="Mark eaten">${I.check}</button>
    </article>`).join('')}
    <article class="card dinner">
      <div class="kv"><small class="amber">Tonight, ${egg ? 'egg day' : 'no-egg day'}</small><small class="muted">19:30</small></div>
      <div class="dname">${esc(dinner.name)}</div>
      <div class="muted">${esc(dinner.detail)}. About ${dinner.kcal} kcal, ${dinner.protein} g protein, ${dinner.carbs} g carbs, ${dinner.fat} g fat, ${dinner.fibre} g fibre. Ends the day at ${planned.toLocaleString()} kcal, ${plannedP} g protein.</div>
      ${ui.swapOpen ? `<div class="swaps">${pool.map(x => `<button class="swap" data-act="swap" data-date="${d}" data-name="${esc(x.name)}"><b>${esc(x.name)}</b><small>${x.kcal} kcal, ${x.protein} g protein</small></button>`).join('')}</div>` : ''}
      <div class="btns">
        <button class="btn outline" data-act="toggle" data-k="swapOpen">${ui.swapOpen ? 'Close' : 'Swap dinner'}</button>
        <button class="btn amber ${eaten.dinner ? 'on' : ''}" data-act="eat" data-id="dinner" data-date="${d}" ${editable ? '' : 'disabled'}>${eaten.dinner ? 'Eaten ✓' : 'Eaten'}</button>
      </div>
    </article>`}`;
}

function viewProgress() {
  const week = S.weekOf(data, today);
  const start = S.fromIso(data.startMonday);
  let planned = 0, done = 0;
  const t = S.iso(today);
  const weeks = [];
  for (let w = 0; w < week; w++) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const dd = S.addDays(start, w * 7 + i);
      const st = S.dayStatus(data, dd, today);
      if (S.iso(dd) <= t) { planned++; if (st === 'done') done++; }
      const c = KIND_COLOR[DAYS[i].kind];
      const bg = st === 'done' ? c : st === 'partial' ? c + '66' : st === 'missed' ? '#E3E8EE' : '#FFFFFF';
      days.push(`<i style="background:${bg};${st === 'upcoming' || st === 'today' ? 'border:1px solid #D5DAD7' : ''}" title="${DAYS[i].name}, week ${w + 1}: ${st}"></i>`);
    }
    weeks.push(`<div class="wk">${days.join('')}</div>`);
  }
  const shown = weeks.slice(-16);
  const trackers = GROUPS.flatMap(g => g.ids);
  const reached = trackers.filter(id => S.levelState(data, id, week).atTop).length;
  const groups = GROUPS.map(g => `<article class="card group" style="--accent:${g.color}">
    <div class="kv"><b style="color:${g.color}">${g.title}</b><small class="muted">${g.ids.length} trackers</small></div>
    ${g.ids.map(id => {
      const ex = EXERCISES[id]; const st = S.levelState(data, id, week);
      const pct = Math.round(st.level / st.max * 100);
      return `<div class="trk">
        <div class="kv"><span class="name">${esc(ex.name)}</span><small style="color:${st.atTop ? '#B8600A' : '#5E6A64'}">${st.atTop ? 'Target reached' : `Level ${st.level} of ${st.max}`}</small></div>
        <div class="pbar"><i style="width:${pct}%;background:${st.atTop ? '#E07B14' : g.color}"></i></div>
        <div class="kv muted"><small>${esc(ex.levels[st.level - 1].load)}</small><small>${esc(ex.target)}</small></div>
      </div>`;
    }).join('')}
  </article>`).join('');
  return `
    <div class="date-line">Started ${fmtShort(start)}</div>
    <div class="stats">
      <div class="stat violet"><b>${week}</b><small>${week === 1 ? 'week in' : 'weeks in'}</small></div>
      <div class="stat green"><b>${done}<span>/${planned}</span></b><small>sessions done</small></div>
      <div class="stat amber"><b>${reached}<span>/${trackers.length}</span></b><small>targets reached</small></div>
    </div>
    <div class="sections">
      <article class="card">
        <div class="kv"><b>Consistency</b><small class="muted">one column per week${weeks.length > 16 ? ', last 16' : ''}</small></div>
        <div class="grid">${shown.join('')}</div>
        <div class="legend"><span><i style="background:#5B3FD1"></i>stretch</span><span><i style="background:#2A7DE1"></i>cardio</span><span><i style="background:#1E7A52"></i>weights</span><span><i style="background:#1E7A5266"></i>partly done</span><span><i style="background:#E3E8EE"></i>missed</span></div>
      </article>
      ${groups}
    </div>`;
}

function viewSettings() {
  const s = data.settings;
  const u = D.user();
  const num = (k, label, step = 1) => `<label><span>${label}</span><input type="number" step="${step}" data-set="${k}" value="${s[k]}"></label>`;
  return `
    <div class="date-line">Settings</div>
    <div class="sections">
      <article class="card">
        <div class="kv"><b>Account</b><span id="sync" class="sync ${ui.sync}">${esc(ui.syncMsg)}</span></div>
        <div class="muted">${u ? `Signed in as ${esc(u.email || u.name || '')}` : devBypass() ? 'Local mode, not signed in' : 'Not signed in'}. Data lives in a private app folder in your Google Drive and in this browser.</div>
        <div class="btns">
          <button class="btn outline" data-act="syncnow" ${D.token() ? '' : 'disabled'}>Sync now</button>
          <button class="btn red" data-act="signout">Sign out</button>
        </div>
      </article>
      <article class="card">
        <div class="kv"><b>You</b><small class="muted">used for the calorie target</small></div>
        <div class="form">
          ${num('age', 'Age')}
          <label><span>Sex</span><select data-set="sex"><option value="male" ${s.sex === 'male' ? 'selected' : ''}>Male</option><option value="female" ${s.sex === 'female' ? 'selected' : ''}>Female</option></select></label>
          ${num('weightKg', 'Weight, kg', 0.5)}${num('heightCm', 'Height, cm')}
          <label><span>Activity</span><select data-set="activity">${[[1.2, 'Mostly sitting'], [1.375, 'Light'], [1.45, 'Moderate, this plan'], [1.55, 'High']].map(([v, l]) => `<option value="${v}" ${Number(s.activity) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          ${num('deficit', 'Daily deficit, kcal', 50)}${num('proteinTarget', 'Protein target, g', 5)}${num('trailMixGrams', 'Trail mix, g a day', 5)}
        </div>
        <div class="muted">Calorie target now: <b>${calorieTarget(s).toLocaleString()} kcal</b> a day.</div>
      </article>
      <article class="card">
        <div class="kv"><b>AI coach</b><small class="muted">optional</small></div>
        <div class="muted">Uses your own API key, stored only in your browser and your Drive file. Chat subscriptions can’t be linked directly; use “Copy for chat” instead and paste into claude.ai, ChatGPT or Gemini.</div>
        <div class="form">
          <label><span>Provider</span><select data-set="aiProvider">${Object.entries(PROVIDERS).map(([k, p]) => `<option value="${k}" ${s.aiProvider === k ? 'selected' : ''}>${p.label}</option>`).join('')}</select></label>
          <label><span>API key</span><input type="password" data-set="aiKey" value="${esc(s.aiKey)}" placeholder="paste key" autocomplete="off"></label>
          <label><span>Model</span><input type="text" data-set="aiModel" value="${esc(s.aiModel)}" placeholder="${esc(PROVIDERS[s.aiProvider]?.model || 'default')}"></label>
        </div>
        <textarea id="coach-q" rows="3" placeholder="Ask anything about this week, e.g. my shoulders ache after floor press, should I regress?">${esc(ui.coachQ || '')}</textarea>
        <div class="btns">
          <button class="btn outline" data-act="copychat">Copy for chat</button>
          <button class="btn green" data-act="askai" ${ui.coachBusy ? 'disabled' : ''}>${ui.coachBusy ? 'Asking…' : 'Ask coach'}</button>
        </div>
        ${ui.coachError ? `<div class="err">${esc(ui.coachError)}</div>` : ''}
        ${ui.coachAnswer ? `<div class="tip">${esc(ui.coachAnswer)}</div>` : ''}
      </article>
      <article class="card">
        <div class="kv"><b>Data</b><small class="muted">week 1 began ${fmtShort(S.fromIso(data.startMonday))}</small></div>
        <div class="btns">
          <button class="btn outline" data-act="export">Export JSON</button>
          <label class="btn outline file">Import JSON<input type="file" accept="application/json" data-act="import"></label>
        </div>
      </article>
    </div>`;
}

// ---------- context for the coach ----------
function coachContext() {
  const week = S.weekOf(data, today);
  const lines = [`Today is ${fmtDate(today)}, week ${week} of the plan.`];
  for (const d of DAYS) {
    const items = d.exercises.filter(id => EXERCISES[id].type !== 'checklist').map(id => {
      const st = S.levelState(data, id, week);
      return `${EXERCISES[id].name}: ${prescription(id, st.level, st.subWeek)} (level ${st.level} of ${st.max}, target ${EXERCISES[id].target})`;
    });
    if (items.length) lines.push(`${d.name} (${d.title}): ${items.join('; ')}`);
  }
  const mon = S.mondayOf(today);
  const ticks = [];
  for (let i = 0; i < 7; i++) {
    const dd = S.addDays(mon, i); if (S.iso(dd) > S.iso(today)) break;
    ticks.push(`${DAYS[i].name}: ${S.dayStatus(data, dd, today)}`);
  }
  lines.push(`This week so far: ${ticks.join(', ')}.`);
  const { meals, dinner } = mealsFor(today);
  lines.push(`Food today: ${[...meals, dinner].map(m => `${m.name} (${m.kcal} kcal, ${m.protein} g protein)`).join('; ')}. Calorie target ${calorieTarget(data.settings)} kcal, protein target ${data.settings.proteinTarget} g.`);
  return lines.join('\n');
}

// ---------- events ----------
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.tagName === 'INPUT') return;
  const act = b.dataset.act;
  const week = S.weekOf(data, today);
  switch (act) {
    case 'signin': D.signIn(); break;
    case 'view': ui.view = b.dataset.view; ui.tip = null; ui.swapOpen = false; render(); window.scrollTo(0, 0); break;
    case 'day': ui.dayIdx = Number(b.dataset.i); ui.tip = null; ui.swapOpen = false; render(); break;
    case 'nav': ui.dayIdx = Math.min(6, Math.max(0, ui.dayIdx + Number(b.dataset.n))); ui.tip = null; ui.swapOpen = false; render(); break;
    case 'toggle': ui[b.dataset.k] = !ui[b.dataset.k]; render(); break;
    case 'tip': ui.tip = ui.tip === b.dataset.id ? null : b.dataset.id; render(); break;
    case 'tick': S.toggleDone(data, b.dataset.date, b.dataset.id); touched(); break;
    case 'eat': S.toggleEaten(data, b.dataset.date, b.dataset.id); touched(); break;
    case 'swap': S.setDinner(data, b.dataset.date, b.dataset.name); ui.swapOpen = false; touched(); break;
    case 'progress': if (S.progress(data, b.dataset.id, week)) touched(); break;
    case 'regress': if (S.regress(data, b.dataset.id, week)) touched(); break;
    case 'syncnow': fullSync(); break;
    case 'signout': if (confirm('Sign out and remove the copy on this device? Your Drive copy stays.')) { D.signOut(); S.clear(); data = S.emptyData(); location.reload(); } break;
    case 'export': {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `fitness-${S.iso(today)}.json`; a.click();
      break;
    }
    case 'copychat': {
      const q = $('#coach-q')?.value || '';
      try { await navigator.clipboard.writeText(chatPrompt(coachContext(), q)); ui.coachAnswer = 'Copied. Paste it into claude.ai, ChatGPT or Gemini.'; ui.coachError = ''; }
      catch { ui.coachError = 'Clipboard blocked by the browser. Long-press the text in Export instead.'; }
      render(); break;
    }
    case 'askai': {
      ui.coachQ = $('#coach-q')?.value || '';
      ui.coachBusy = true; ui.coachError = ''; ui.coachAnswer = ''; render();
      try { ui.coachAnswer = await ask(data.settings, coachContext(), ui.coachQ || 'How am I doing this week, and should I progress or regress anything?'); }
      catch (err) { ui.coachError = err.message; }
      ui.coachBusy = false; render(); break;
    }
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.set) {
    const k = el.dataset.set;
    const v = el.type === 'number' || k === 'activity' ? Number(el.value) : el.value;
    data.settings[k] = v; touched();
    return;
  }
  if (el.dataset.act === 'import' && el.files[0]) {
    el.files[0].text().then(txt => {
      try { data = S.merge(data, JSON.parse(txt)); touched(); ui.syncMsg = 'Imported'; render(); }
      catch { alert('That file is not a valid export.'); }
    });
  }
});
document.addEventListener('input', e => { if (e.target.id === 'coach-q') ui.coachQ = e.target.value; });

boot();
