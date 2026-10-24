// Progress (§4.2): stat tiles, consistency grid, trackers by category, nutrition summary.
import { html, icon, when } from '../lib/dom.js';
import { S, update, today, settings, planStart, activeVersion, upcoming, exState, isDone, mealEntry, versions, planTargets } from '../store.js';
import { weekNumber, weekStart, addDays, weekdayOf, shortDate, daysBetween } from '../core/dates.js';
import { workoutDay, prescription, atTop, mealDayOn, mealsForDay, mealMacros } from '../core/plans.js';
import { tabbar, resumeBanner, units, DAY_COLORS, exName } from './common.js';
import { resumeHref } from './journey.js';

const CAT = { Strength: 'var(--sage)', Core: 'var(--violet-bar)', Running: 'var(--primary)', Cardio: 'var(--teal)', Mobility: 'var(--amber)', Skill: 'var(--rose)' };
const catColor = c => CAT[c] || 'var(--slate)';

function workoutStats(start, t) {
  let planned = 0, done = 0;
  if (!start) return { planned, done };
  for (let d = start; d <= t; d = addDays(d, 1)) {
    const v = activeVersion('workout', d);
    const day = v && workoutDay(v.plan, weekdayOf(d));
    if (!day || !day.exercises.length) continue;
    if (d < t || day.exercises.some(e => isDone(d, e.exerciseId))) planned++;
    if (day.exercises.every(e => isDone(d, e.exerciseId))) done++;
  }
  return { planned, done };
}

function grid(start, t) {
  const ws = settings().weekStartsOn;
  const weeks = [];
  let w0 = weekStart(start, ws);
  const last = weekStart(t, ws);
  const n = Math.floor(daysBetween(w0, last) / 7) + 1;
  if (n > 16) w0 = addDays(last, -15 * 7);
  for (let w = w0; w <= last; w = addDays(w, 7)) {
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(w, i);
      if (d < start) continue;
      const v = activeVersion('workout', d);
      const day = v && workoutDay(v.plan, weekdayOf(d));
      if (!day || !day.exercises.length || !day.type) continue;
      const color = DAY_COLORS[day.type.color] || 'var(--sage)';
      const all = day.exercises.every(e => isDone(d, e.exerciseId));
      const some = day.exercises.some(e => isDone(d, e.exerciseId));
      const style = d > t ? 'background:var(--surface);border:1px solid var(--border)' : all ? `background:${color}` : some ? `background:${color};opacity:.45` : 'background:var(--border)';
      cells.push(html`<span style="${style}" title="${shortDate(d)} · ${day.type.label}${d > t ? '' : all ? ' · done' : some ? ' · partly done' : ' · missed'}"></span>`);
    }
    weeks.push(html`<div class="col"><span class="wk" style="background:none;width:auto;height:14px">${weekNumber(start, w, ws) > 0 ? weekNumber(start, w, ws) : ''}</span>${cells}</div>`);
  }
  return weeks;
}

function nutrition(t) {
  const since = addDays(t, -27);
  let daysLogged = 0, proteinHit = 0, kcalSum = 0, planned = 0, eatenN = 0;
  for (let d = since; d <= t; d = addDays(d, 1)) {
    const v = activeVersion('food', d);
    if (!v) continue;
    const meals = mealsForDay(v.plan, mealDayOn(v, d));
    const tg = v.plan.dailyTargets || {};
    let p = 0, k = 0, any = false;
    for (const m of meals) {
      const e = mealEntry(d, m.key);
      if (d < t || e) planned++;
      if (e && (e.status === 'eaten' || e.status === 'swapped')) {
        const x = mealMacros(e.swappedTo ? { ...m, ...e.swappedTo } : m);
        p += x.proteinG; k += x.kcal; any = true; eatenN++;
      }
    }
    if (any) { daysLogged++; kcalSum += k; if (tg.proteinGMin && p >= tg.proteinGMin) proteinHit++; }
  }
  return { daysLogged, proteinHit, avgKcal: daysLogged ? Math.round(kcalSum / daysLogged) : 0, adherence: planned ? Math.round((eatenN / planned) * 100) : 0 };
}

export function render() {
  const t = today();
  const start = planStart();
  const ws = settings().weekStartsOn;
  const wv = activeVersion('workout') || upcoming('workout');
  const fv = activeVersion('food') || upcoming('food');
  const st = workoutStats(start, t);
  const exs = wv ? wv.plan.exercises : [];
  const reached = exs.filter(e => atTop(e, exState(e))).length;
  const weeksIn = start && start <= t ? weekNumber(start, t, ws) : 0;
  const cats = {};
  for (const e of exs) (cats[e.category || 'Strength'] = cats[e.category || 'Strength'] || []).push(e);
  const nut = fv ? nutrition(t) : null;
  const tg = planTargets();
  return html`<div class="screen">
    <div class="weekbadge">${start && start <= t ? html`<span class="badge">Week ${weeksIn}</span>` : html`<span class="badge soft">No weeks yet</span>`}</div>
    <h1 class="h1">Progress</h1>
    ${resumeBanner('workout')}${resumeBanner('food')}
    <div class="tiles">
      <div class="tile violet"><span class="v">${weeksIn}</span><span class="k">weeks in</span></div>
      <div class="tile green"><span class="v">${st.done}<span style="font-size:14px;font-weight:500">/${st.planned}</span></span><span class="k">sessions done</span></div>
      <div class="tile amber"><span class="v">${reached}<span style="font-size:14px;font-weight:500">/${exs.length}</span></span><span class="k">targets reached</span></div>
    </div>
    ${wv ? html`
      <div class="card pad"><div class="row between"><span class="strong">Consistency</span><span class="small">one square per training day</span></div>
        ${start && start <= t ? html`<div class="grid-cons" role="img" aria-label="Training days by week">${grid(start, t)}</div>` : html`<p class="small">Your first week starts ${start ? shortDate(start) : 'soon'}.</p>`}
        <div class="legend">${Object.values(wv.plan.dayTypes).filter((x, i, a) => a.findIndex(y => y.label === x.label) === i).map(x => html`<span><i style="background:${DAY_COLORS[x.color] || 'var(--sage)'}"></i>${x.label}</span>`)}<span><i style="background:var(--border)"></i>Missed</span></div></div>
      ${Object.entries(cats).map(([c, list]) => html`<div class="stack tight"><span class="label" style="display:flex;align-items:center;gap:6px"><i style="width:10px;height:10px;border-radius:3px;background:${catColor(c)};display:inline-block"></i>${c}</span>
        <div class="card">${list.map(e => tracker(wv.plan, e, c))}</div></div>`)}`
    : html`<a class="thinrow" href="${resumeHref('workout')}">${icon('plus', 18)} Add a workout plan to see consistency and trackers</a>`}
    ${fv ? html`<div class="card pad"><div class="row between"><span class="strong">Nutrition · last 4 weeks</span><span class="small">estimates</span></div>
        <div class="grid3">
          <div class="stack tight"><span class="h2">${nut.proteinHit}</span><span class="small">days protein target hit${tg ? ` (${tg.proteinGMin} g)` : ''}</span></div>
          <div class="stack tight"><span class="h2">${nut.avgKcal ? nut.avgKcal.toLocaleString() : '—'}</span><span class="small">avg kcal on logged days${tg ? ` · target ${tg.kcal.toLocaleString()}` : ''}</span></div>
          <div class="stack tight"><span class="h2">${nut.adherence}%</span><span class="small">meals eaten as planned</span></div>
        </div></div>`
    : html`<a class="thinrow" href="${resumeHref('food')}">${icon('plus', 18)} Add a food plan</a>`}
    ${when(wv || fv, () => html`<a class="btn secondary md block" href="#/coach/new?about=progress" style="color:var(--primary)">${icon('chat', 18)} Ask Coach to review my progress</a>`)}
  </div>${tabbar('progress')}`;
}

function tracker(plan, e, c) {
  const st = exState(e);
  const frac = ((st.level - 1) * 4 + st.sublevel) / (e.levels.length * 4);
  const top = atTop(e, st);
  return html`<button class="tracker ${top ? 'reached celebrate' : ''}" data-action="tracker" data-v="${e.exerciseId}">
    <div class="row between"><span class="strong">${exName(e)}</span>${top ? html`<span class="pill" style="background:var(--gold-tint);color:var(--gold);height:22px">${icon('trophy', 14)} Target reached</span>` : html`<span class="small">Level ${st.level}/${e.levels.length}</span>`}</div>
    <div class="bar"><i style="width:${Math.round(frac * 100)}%;background:${catColor(c)}"></i></div>
    <div class="ends"><span>${units(prescription(plan, e, st).main)}</span><span>${units(e.target.text)}</span></div>
  </button>`;
}

export const sheets = {
  tracker(sh) {
    const v = activeVersion('workout') || upcoming('workout');
    const e = v.plan.exercises.find(x => x.exerciseId === sh.id);
    const ev = S.doc.levelEvents.filter(x => x.exerciseId === sh.id).slice().reverse();
    const st = exState(e);
    return html`<h2 class="h2">${exName(e)}</h2>
      <p class="small">Now: level ${st.level} of ${e.levels.length}, sub-level ${st.sublevel} · ${units(prescription(v.plan, e, st).main)}. Target: ${units(e.target.text)}.</p>
      <div class="card">${ev.length ? ev.slice(0, 30).map(x => html`<div class="listrow"><span class="t"><span class="t1">${x.kind === 'progress' ? 'Progress' : 'Regress'} to level ${x.to[0]}.${x.to[1]}</span><span class="t2">${new Date(x.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>${icon(x.kind === 'progress' ? 'up' : 'down', 16)}</div>`) : html`<div class="listrow"><span class="small">No Progress or Regress taps yet.</span></div>`}</div>
      <a class="btn secondary md" href="#/exercise/${e.exerciseId}">${icon('info', 18)} Exercise info</a>
      <button class="btn secondary md" data-action="close-sheet">Close</button>`;
  },
};
export const actions = {
  tracker: el => { S.ui.sheet = { kind: 'tracker', id: el.dataset.v }; update(); },
};
