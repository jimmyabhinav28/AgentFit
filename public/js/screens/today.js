// Today (§4.1): single current week, independent Workout and Food sections.
import { html, icon, when } from '../lib/dom.js';
import { S, update, toast, today, settings, planStart, sectionState, activeVersion, upcoming, exState, stepExercise, toggleDone, isDone, mealEntry, setMeal, dismissSetup, profile, planTargets } from '../store.js';
import { weekDates, weekNumber, weekdayOf, WEEKDAY_NAMES, longDate, fromIso, addDays, shortDate } from '../core/dates.js';
import { workoutDay, prescription, nextHint, atTop, atBottom, planSublevels, mealDayOn, mealsForDay, mealMacros, dayTotals } from '../core/plans.js';
import { forbiddenOnDay, dietRules } from '../core/validate.js';
import { tabbar, resumeBanner, units, exColor, NOTE_ICONS, exName } from './common.js';
import { resumeHref } from './journey.js';
import { go } from '../router.js';

const TONE = { rose: ['var(--rose-tint)', 'var(--rose)'], amber: ['var(--amber-tint)', 'var(--amber-mid)'], indigo: ['var(--primary-tint)', 'var(--primary)'], violet: ['var(--violet-tint)', 'var(--violet)'] };

function selDate() {
  const t = today();
  const wk = weekDates(t, settings().weekStartsOn);
  if (!S.ui.date || !wk.includes(S.ui.date)) S.ui.date = t;
  return S.ui.date;
}

export function render() {
  const t = today();
  const date = selDate();
  const wk = weekDates(t, settings().weekStartsOn);
  const start = planStart();
  const wState = sectionState('workout'), fState = sectionState('food');
  const dismissed = (S.doc.ui && S.doc.ui.dismissedSetup) || {};
  const wv = activeVersion('workout', date), fv = activeVersion('food', date);
  const wday = wv ? workoutDay(wv.plan, weekdayOf(date)) : null;

  let badge;
  if (!start) badge = html`<span class="badge soft">Week 1 starts when you plan</span>`;
  else if (start > t) badge = html`<span class="badge soft">Week 1 starts ${start === addDays(t, 1) ? 'tomorrow' : shortDate(start)}</span>`;
  else badge = html`<span class="badge">Week ${weekNumber(start, date, settings().weekStartsOn)}</span>`;

  let sub;
  if (wday && wday.type) sub = `${wday.type.label} · ${wday.exercises.length} exercise${wday.exercises.length === 1 ? '' : 's'}${wv.plan.sessionMinutes ? ` · about ${wv.plan.sessionMinutes} min` : ''}`;
  else if (wv) sub = 'Rest day';
  else if (wState === 'none' && fState === 'none') sub = 'Nothing planned yet. Each plan takes a few minutes.';
  else sub = '';

  // UI-TD-05/07: the planned section leads; with nothing planned, Workout first.
  const rank = s => ({ active: 0, tomorrow: 0, paused: 1, none: 2 }[s]);
  const order = rank(fState) < rank(wState) ? ['food', 'workout'] : ['workout', 'food'];
  const sections = [], rows = [];
  for (const k of order) {
    const s = k === 'workout' ? wState : fState;
    if (s === 'none' && dismissed[k]) rows.push(thinRow(k));
    else sections.push(k === 'workout' ? workoutSection(date, wState, wv, wday) : foodSection(date, fState, fv));
  }
  const notices = ['workout', 'food'].map(k => {
    const u = upcoming(k);
    return u && (activeVersion(k)) && (u.acceptedAt || '').slice(0, 10) === t ? html`<div class="notice">${icon('sparkle', 16)} New ${k === 'food' ? 'food chart' : 'workout plan'} (v${u.version}) starts tomorrow</div>` : '';
  });

  return html`<div class="screen">
    <div class="weekbadge">${badge}<span class="small">${longDate(date)}</span></div>
    <div class="daystrip">
      <button class="iconbtn sm" data-action="day-prev" aria-label="Previous day" ${date <= wk[0] ? 'disabled' : ''}>${icon('back', 16)}</button>
      <div class="days7">${wk.map(d => dayChip(d, t, date))}</div>
      <button class="iconbtn sm" data-action="day-next" aria-label="Next day" ${date >= wk[6] ? 'disabled' : ''}>${icon('fwd', 16)}</button>
    </div>
    <div class="stack tight" style="gap:2px"><h1 class="h1">${WEEKDAY_NAMES[weekdayOf(date)]}</h1>${when(sub, () => html`<span class="lead">${sub}</span>`)}</div>
    ${notices}
    ${sections}
    ${when(wState !== 'none' || fState !== 'none', () => html`<a class="btn secondary md block" href="#/coach/new?about=today" style="color:var(--primary)">${icon('chat', 18)} Ask Coach about today</a>`)}
    ${when(wState === 'none' && fState === 'none', () => html`<a class="card pad" href="#/tutorial" style="flex-direction:row;align-items:center;gap:12px;text-decoration:none;color:inherit">${icon('play')}<span style="flex:1"><span class="strong">How planning works</span><br><span class="small">A 1-minute tutorial</span></span>${icon('fwd', 18)}</a>`)}
    ${rows}
  </div>${tabbar('today')}`;
}

function dayChip(d, t, sel) {
  const wv = activeVersion('workout', d);
  const wday = wv ? workoutDay(wv.plan, weekdayOf(d)) : null;
  const n = wday ? wday.exercises.length : 0;
  const done = n && wday.exercises.every(e => isDone(d, e.exerciseId));
  const cls = ['dayc', d === sel ? 'sel' : '', d > t ? 'future' : '', done ? 'done' : ''].join(' ');
  const dot = d === sel ? 'sel' : done ? 'done' : d < t && n ? 'missed' : '';
  return html`<button class="${cls}" data-action="pick-day" data-v="${d}" aria-label="${longDate(d)}${done ? ', done' : ''}" ${d === sel ? 'aria-current="date"' : ''}>
    <span class="wd">${weekdayOf(d)[0]}</span><span class="num">${fromIso(d).getDate()}</span><span class="dot ${dot}"></span></button>`;
}

function setupCard(kind, compact) {
  const w = kind === 'workout';
  return html`<div class="setup ${compact ? 'compact' : ''}">
    <div class="row"><span class="ic ${w ? 'sage' : 'amber'}" style="width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex:none">${icon(w ? 'dumbbell' : 'bowl')}</span>
      <span class="stack tight" style="gap:2px"><span class="strong">No ${w ? 'workout' : 'food'} plan yet</span><span class="small">${w ? 'A quick strength check, then a plan with levels · about 4 minutes' : 'A 14-day chart around what you like · about 3 minutes'}</span></span></div>
    <div class="btnrow"><a class="btn primary sm grow" href="${w ? resumeHref('workout') : resumeHref('food')}">Plan my ${w ? 'workout' : 'food'}</a><button class="btn secondary sm" data-action="not-now" data-kind="${kind}">Not now</button></div>
  </div>`;
}
function thinRow(kind) {
  return html`<a class="thinrow" href="${resumeHref(kind)}">${icon('plus', 18)} Add a ${kind === 'workout' ? 'workout' : 'food'} plan</a>`;
}

// ---------------- workout ----------------
function workoutSection(date, state, v, day) {
  const other = sectionState('food');
  if (state === 'none') return setupCard('workout', other === 'active' || other === 'tomorrow');
  const open = S.ui.expanded.workout;
  if (state === 'paused') return html`<div class="section workout"><div class="head"><span class="l">${icon('dumbbell', 18)}Workout</span><span class="r">Not planned yet</span></div><div style="padding:12px">${resumeBanner('workout', { inline: true })}</div></div>`;
  if (state === 'tomorrow' || !v) {
    const u = upcoming('workout');
    return html`<div class="section workout"><div class="head"><span class="l">${icon('dumbbell', 18)}Workout</span><span class="r">Starts ${u && u.effectiveFrom === addDays(today(), 1) ? 'tomorrow' : u ? shortDate(u.effectiveFrom) : ''}</span></div>
      <div class="listrow"><span class="t"><span class="t1">${u ? u.plan.name || 'Your plan' : ''}</span><span class="t2">${u ? Object.keys(u.plan.dayTypes).map(d => d[0] + d.slice(1).toLowerCase()).join(', ') : ''} · nothing to tick today</span></span></div></div>`;
  }
  const exs = day ? day.exercises : [];
  const doneN = exs.filter(e => isDone(date, e.exerciseId)).length;
  return html`<div class="section workout">
    <button class="head" data-action="toggle-section" data-v="workout" aria-expanded="${open}"><span class="l">${icon('dumbbell', 18)}Workout</span><span class="r"><span>${exs.length ? `${doneN} of ${exs.length} done` : 'Rest day'}</span>${icon(open ? 'up' : 'down', 16)}</span></button>
    ${when(open, exs.length ? exs.map(ex => exerciseCard(v.plan, ex, date)) : html`<div class="listrow"><span class="t"><span class="t1">Rest and recover</span><span class="t2">A walk or some stretching is a good idea.</span></span></div>`)}
  </div>`;
}

function exerciseCard(plan, ex, date) {
  const t = today();
  const logged = (S.doc.workoutLog[date] || {})[ex.exerciseId];
  const st = logged && logged.done && date !== t ? { level: logged.level, sublevel: logged.sublevel } : exState(ex);
  const p = prescription(plan, ex, st);
  const [color, light] = exColor(plan, ex.exerciseId);
  const done = isDone(date, ex.exerciseId);
  const name = exName(ex);
  const levels = ex.levels.length;
  const tone = TONE[p.note.tone] || TONE.indigo;
  const isToday = date === t;
  const expanded = S.ui.openCard === ex.exerciseId;
  const top = atTop(ex, st);
  const toNext = st.sublevel === 4 && !top;
  // Staircase: one bar per level (up to 10 shown), the current one split into 4 segments.
  const shown = Math.min(levels, 10);
  const first = Math.max(1, Math.min(st.level - 4, levels - shown + 1));
  const bars = [];
  for (let l = first; l < first + shown; l++) {
    const h = 8 + Math.round(((l - first) / Math.max(1, shown - 1)) * 28);
    if (l < st.level) bars.push(html`<span style="height:${h}px;background:${color}"></span>`);
    else if (l === st.level) bars.push(html`<span class="cur">${[1, 2, 3, 4].map(s => html`<i style="background:${s <= st.sublevel ? color : light}"></i>`)}</span>`);
    else bars.push(html`<span style="height:${h}px"></span>`);
  }
  return html`<div class="excard" style="border-left-color:${color}">
    <div class="row between" style="align-items:flex-start">
      <div class="stack tight" style="gap:4px;min-width:0"><button class="name" data-action="open-card" data-v="${ex.exerciseId}" aria-expanded="${expanded}">${name}</button><span class="rx">${units(p.main)}</span></div>
      <button class="tick" data-action="tick" data-v="${ex.exerciseId}" aria-pressed="${done}" aria-label="Mark ${name} done" ${date > t ? 'disabled' : ''}>${icon('check', 18, 2.4)}</button>
    </div>
    <span class="pill" style="background:${tone[0]};color:${tone[1]}"><span class="anim ${p.note.animation}">${icon(NOTE_ICONS[p.note.animation] || 'sparkle', 14)}</span>${p.note.label}</span>
    <div class="row" style="align-items:flex-end;gap:12px"><div class="stairs" aria-hidden="true">${bars}</div>
      <div class="ladderinfo"><span class="a">Level ${st.level} of ${levels} · sub-level ${st.sublevel} of 4</span><span>${units(nextHint(plan, ex, st))}</span></div></div>
    ${when(expanded, () => expandedCard(plan, ex, st))}
    ${when(isToday, () => html`<div class="btnrow"><button class="regress" data-action="regress" data-v="${ex.exerciseId}" ${atBottom(ex, st) ? 'disabled' : ''}>Regress</button><button class="progressb" data-action="progress" data-v="${ex.exerciseId}" ${top ? 'disabled' : ''}>${top ? 'Top of the ladder' : toNext ? `Progress to level ${st.level + 1}` : 'Progress'}</button></div>`)}
  </div>`;
}

function expandedCard(plan, ex, st) {
  const subs = planSublevels(plan);
  const ev = S.doc.levelEvents.filter(e => e.exerciseId === ex.exerciseId).slice(-1)[0];
  const nextLevel = st.level < ex.levels.length ? prescription(plan, ex, { level: st.level + 1, sublevel: 1 }).main : null;
  return html`<div class="stack">
    <span class="label">This level, sub-level by sub-level</span>
    <div class="sublist">${[1, 2, 3, 4].map(s => html`<div class="${s === st.sublevel ? 'now' : ''}"><span class="strong">${s}${s === st.sublevel ? ' · now' : ''}</span><span>${units(prescription(plan, ex, { level: st.level, sublevel: s }).main)}</span><span class="small">${subs[s - 1].note.label}</span></div>`)}</div>
    <p class="small">Level ${st.level} of ${ex.levels.length}${nextLevel ? ` · then ${units(nextLevel)}` : ''}. Target: ${units(ex.target.text)}.</p>
    ${when(ex.explanation, () => html`<p style="font-size:14px;line-height:1.5">${ex.explanation}</p>`)}
    <div class="row between"><a class="linkbtn" href="#/exercise/${ex.exerciseId}">${icon('video', 18)}&nbsp;Form and video</a>${when(ev, () => html`<span class="small">Last change: ${ev && (ev.kind === 'progress' ? 'Progress' : 'Regress')}, ${ev && shortDate(new Date(ev.at).toISOString().slice(0, 10))}</span>`)}</div>
  </div>`;
}

// ---------------- food ----------------
function foodSection(date, state, v) {
  const other = sectionState('workout');
  if (state === 'none') return setupCard('food', other === 'active' || other === 'tomorrow');
  if (state === 'paused') return html`<div class="section food"><div class="head"><span class="l">${icon('bowl', 18)}Food</span><span class="r">Not planned yet</span></div><div style="padding:12px">${resumeBanner('food', { inline: true })}</div></div>`;
  if (state === 'tomorrow' || !v) {
    const u = upcoming('food');
    return html`<div class="section food"><div class="head"><span class="l">${icon('bowl', 18)}Food</span><span class="r">Starts ${u && u.effectiveFrom === addDays(today(), 1) ? 'tomorrow' : u ? shortDate(u.effectiveFrom) : ''}</span></div>
      <div class="listrow"><span class="t"><span class="t1">14-day food chart</span><span class="t2">${u && u.plan.dailyTargets ? `${u.plan.dailyTargets.proteinGMin} g protein a day · ` : ''}nothing to tick today</span></span></div></div>`;
  }
  const open = S.ui.expanded.food;
  const plan = v.plan;
  const day = mealDayOn(v, date);
  const meals = mealsForDay(plan, day);
  const tg = plan.dailyTargets || planTargets() || {};
  const wd = weekdayOf(date);
  const forbidden = forbiddenOnDay(dietRules(profile().food || {}), wd);
  const diet = (profile().food || {}).dietType;
  const restrictedLabel = (diet === 'nonveg' && forbidden.has('chicken')) ? 'Veg day' : (diet === 'eggetarian' && forbidden.has('egg')) ? 'Egg-free day' : null;
  const eaten = meals.filter(m => (mealEntry(date, m.key) || {}).status === 'eaten' || (mealEntry(date, m.key) || {}).status === 'swapped');
  const shownMeal = m => { const e = mealEntry(date, m.key); return e && e.status === 'swapped' && e.swappedTo ? { ...m, ...e.swappedTo } : m; };
  const eatenTot = dayTotals(eaten.map(shownMeal));
  const planTot = dayTotals(meals);
  const kcalTarget = tg.kcal || planTot.kcal || 1;
  const segColors = ['var(--amber)', 'var(--sage)', 'var(--primary)', 'var(--violet-bar)', 'var(--teal)', 'var(--rose)'];
  return html`<div class="section food">
    <button class="head" data-action="toggle-section" data-v="food" aria-expanded="${open}"><span class="l">${icon('bowl', 18)}Food</span><span class="r"><span>${restrictedLabel ? restrictedLabel + ' · ' : ''}${eatenTot.proteinG} of ${tg.proteinGMin || planTot.proteinG} g protein</span>${icon(open ? 'up' : 'down', 16)}</span></button>
    ${when(open, () => html`
      <div class="bars">
        <div class="row between small"><span>Calories · ${eatenTot.kcal.toLocaleString()} of ${kcalTarget.toLocaleString()} kcal (est.)</span><span>Window ${plan.eatingWindow ? `${plan.eatingWindow.start}–${plan.eatingWindow.end}` : ''}</span></div>
        <div class="bar" role="img" aria-label="Calories by meal">${meals.map((m, i) => { const x = mealMacros(shownMeal(m)); const on = eaten.includes(m); return html`<i style="width:${Math.min(100, (x.kcal / Math.max(kcalTarget, planTot.kcal)) * 100)}%;background:${segColors[i % segColors.length]};opacity:${on ? 1 : 0.25}"></i>`; })}</div>
        <div class="row between small"><span>Protein · ${eatenTot.proteinG} of ${tg.proteinGMin || '—'} g</span>${when(restrictedLabel, () => html`<span class="pill amber" style="height:22px">${restrictedLabel}</span>`)}</div>
        <div class="bar"><i style="width:${Math.min(100, (eatenTot.proteinG / Math.max(1, tg.proteinGMin || planTot.proteinG)) * 100)}%;background:var(--sage)"></i></div>
      </div>
      ${meals.map(m => mealCard(date, m, shownMeal(m)))}
    `)}
  </div>`;
}

function mealCard(date, base, m) {
  const e = mealEntry(date, base.key) || {};
  const x = mealMacros(m);
  const t = today();
  const eaten = e.status === 'eaten' || e.status === 'swapped';
  const items = (m.items || []).map(i => (typeof i === 'string' ? i : `${i.name}${i.qty ? ` (${i.qty})` : ''}`)).join(', ');
  return html`<div class="mealcard">
    <button class="tick food" data-action="eat" data-k="${base.key}" aria-pressed="${eaten}" aria-label="Mark ${m.dish} eaten" ${date > t ? 'disabled' : ''}>${icon('check', 18, 2.4)}</button>
    <div class="body">
      <span class="slot">${cap(base.slot)} · ${base.time}${base.fixed ? ' · fixed' : ''}${e.status === 'skipped' ? ' · skipped' : ''}</span>
      <span class="dish">${m.dish}</span>
      ${when(items && base.fixed, () => html`<span class="small">${items}</span>`)}
      <span class="small">${x.kcal} kcal · ${x.proteinG} g protein</span>
      ${when(!base.fixed && date <= t, () => html`<div class="acts"><button class="btn secondary sm" data-action="swap-sheet" data-k="${base.key}">${icon('swap', 16)} Swap</button><button class="btn secondary sm" data-action="skip-meal" data-k="${base.key}">${e.status === 'skipped' ? 'Undo skip' : 'Skip'}</button></div>`)}
    </div>
  </div>`;
}
const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

// ---------------- sheets ----------------
export const sheets = {
  swap(sh) {
    const v = activeVersion('food', sh.date);
    const day = mealDayOn(v, sh.date);
    const m = mealsForDay(v.plan, day).find(x => x.key === sh.key);
    const alts = m.alternatives || [];
    return html`<h2 class="h2">Swap ${m.slot}</h2><p class="small">Instead of ${m.dish}. These were approved with your chart.</p>
      <div class="stack tight">${alts.length ? alts.map((a, i) => html`<button class="listrow card flat" style="border:1px solid var(--border)" data-action="pick-swap" data-k="${sh.key}" data-i="${i}"><span class="t"><span class="t1">${a.dish}</span><span class="t2">${mealMacros(a).kcal} kcal · ${mealMacros(a).proteinG} g protein</span></span>${icon('swap', 18)}</button>`) : html`<p class="small">No alternatives saved for this meal.</p>`}</div>
      <a class="btn secondary md" href="#/coach/new?about=swap&meal=${encodeURIComponent(m.dish)}">${icon('chat', 18)} Ask Coach for ideas</a>
      <button class="btn secondary md" data-action="close-sheet">Cancel</button>`;
  },
};

// ---------------- actions ----------------
function findEx(id) {
  const v = activeVersion('workout', selDate());
  return v && v.plan.exercises.find(e => e.exerciseId === id);
}
export const actions = {
  'pick-day': el => { S.ui.date = el.dataset.v; S.ui.openCard = null; update(); },
  'day-prev': () => { S.ui.date = addDays(selDate(), -1); update(); },
  'day-next': () => { S.ui.date = addDays(selDate(), 1); update(); },
  'toggle-section': el => { S.ui.expanded[el.dataset.v] = !S.ui.expanded[el.dataset.v]; update(); },
  'open-card': el => { S.ui.openCard = S.ui.openCard === el.dataset.v ? null : el.dataset.v; update(); },
  tick: async el => { const ex = findEx(el.dataset.v); if (ex) await toggleDone(selDate(), ex); },
  progress: async el => {
    const ex = findEx(el.dataset.v);
    const before = ex && exState(ex);
    if (ex && await stepExercise(ex, +1)) {
      const after = exState(ex);
      if (after.level > before.level) toast(`Level ${after.level}: ${units(prescription(activeVersion('workout').plan, ex, after).main)}`);
    }
  },
  regress: async el => { const ex = findEx(el.dataset.v); if (ex) await stepExercise(ex, -1); },
  'not-now': async el => { await dismissSetup(el.dataset.kind); },
  // Ticking a swapped meal again clears it (setMeal toggles when the status repeats).
  eat: async el => { const e = mealEntry(selDate(), el.dataset.k); await setMeal(selDate(), el.dataset.k, e && e.status === 'swapped' ? 'swapped' : 'eaten'); },
  'skip-meal': async el => { await setMeal(selDate(), el.dataset.k, 'skipped'); },
  'swap-sheet': el => { S.ui.sheet = { kind: 'swap', date: selDate(), key: el.dataset.k }; update(); },
  'pick-swap': async el => {
    const sh = S.ui.sheet;
    const v = activeVersion('food', sh.date);
    const m = mealsForDay(v.plan, mealDayOn(v, sh.date)).find(x => x.key === sh.key);
    const a = m.alternatives[Number(el.dataset.i)];
    await setMeal(sh.date, sh.key, 'swapped', { swappedTo: { dish: a.dish, est: a.est, items: a.items, tags: a.tags } });
    S.ui.sheet = null; toast(`Swapped to ${a.dish}`); update();
  },
};
