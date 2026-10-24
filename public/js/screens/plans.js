// Plan screen (§4.4): weekly overview, version history with Restore, Edit with coach,
// and small manual edits that create a new version starting tomorrow.
import { html, icon, when } from '../lib/dom.js';
import { S, update, toast, versions, activeVersion, upcoming, restoreVersion, saveManualEdit, profile, today } from '../store.js';
import { WEEKDAYS, WEEKDAY_NAMES, WEEKDAY_SHORT, shortDate, longDate, addDays } from '../core/dates.js';
import { prescription, mealsForDay, dayTotals, mealMacros } from '../core/plans.js';
import { missingEquipment } from '../core/equipment.js';
import { tabbar, units, exName } from './common.js';
import { resumeHref } from './journey.js';
import { go } from '../router.js';

export function render(params) {
  const type = params[0] === 'meal' || params[0] === 'food' ? 'meal' : 'workout';
  const v = upcoming(type) || activeVersion(type);
  const hist = [...versions(type)].reverse();
  const tabs = html`<div class="seg" role="tablist">${[['workout', 'Workout'], ['meal', 'Food']].map(([k, l]) => html`<a class="chip" role="tab" href="#/plans/${k}" aria-pressed="${type === k}" aria-selected="${type === k}" style="display:flex;align-items:center;justify-content:center;text-decoration:none">${l}</a>`)}</div>`;
  return html`<div class="screen">
    <div class="topbar"><a class="iconbtn" href="#/settings" aria-label="Back">${icon('back')}</a><span class="title">My plans</span><span class="spacer44"></span></div>
    ${tabs}
    ${v ? html`
      <div class="row between"><div><h1 class="h2">${type === 'meal' ? '14-day food chart' : v.plan.name || 'Workout plan'}</h1><span class="small">Version ${v.version} · ${v.effectiveFrom > today() ? 'starts ' + longDate(v.effectiveFrom) : 'active since ' + shortDate(v.effectiveFrom)}</span></div></div>
      ${type === 'workout' ? workoutOverview(v) : mealOverview(v)}
      <div class="btnrow"><button class="btn primary md grow" data-action="edit-with-coach" data-t="${type}">${icon('chat', 18)} Edit with coach</button></div>
      <div class="stack tight"><span class="label">Version history</span><div class="card">${hist.map(h => html`<div class="listrow"><span class="t" style="flex:1"><span class="t1">v${h.version} · ${h.summary}</span><span class="t2">${h.effectiveFrom > today() ? 'Starts' : 'From'} ${shortDate(h.effectiveFrom)}${h === hist[0] ? '' : ''}</span></span>
        ${when(h.version !== v.version, () => html`<button class="btn secondary sm" data-action="restore" data-t="${type}" data-v="${h.version}">Restore</button>`)}</div>`)}</div></div>`
    : html`<div class="setup"><span class="strong">No ${type === 'meal' ? 'food' : 'workout'} plan yet</span><a class="btn primary sm" href="${resumeHref(type === 'meal' ? 'food' : 'workout')}">Plan my ${type === 'meal' ? 'food' : 'workout'}</a></div>`}
  </div>${tabbar('settings')}`;
}

function workoutOverview(v) {
  const p = v.plan;
  return html`<div class="stack">${WEEKDAYS.map(w => {
    const exs = p.exercises.filter(e => e.days.includes(w));
    if (!p.dayTypes[w]) return html`<div class="row small" style="padding:0 4px">${WEEKDAY_SHORT[w]} · Rest</div>`;
    return html`<div class="section"><div class="head" style="background:var(--sage-tint);color:var(--sage-ink)"><span class="l">${WEEKDAY_NAMES[w]} · ${p.dayTypes[w].label}</span><span class="r">${exs.length}</span></div>
      ${exs.map(e => html`<div class="listrow"><span class="t" style="flex:1"><span class="t1">${exName(e)}</span><span class="t2">${e.levels.length} levels · ${units(prescription(p, e, { level: 1, sublevel: 1 }).main)} → ${units(e.target.text)}</span></span>
        <button class="btn secondary sm" data-action="swap-ex" data-v="${e.exerciseId}" aria-label="Swap ${exName(e)}">${icon('swap', 16)}</button></div>`)}</div>`;
  })}</div>`;
}

function mealOverview(v) {
  const p = v.plan;
  return html`<div class="stack tight">${p.days.map(d => {
    const meals = mealsForDay(p, d); const t = dayTotals(meals);
    const dinner = d.meals.find(m => m.slot === 'dinner');
    return html`<div class="card pad"><div class="row between"><span class="strong">Day ${d.cycleDay} · ${WEEKDAY_SHORT[d.weekday] || ''}</span><span class="small">${t.kcal} kcal · ${t.proteinG} g (est.)</span></div>
      ${meals.map(m => html`<div class="row between small"><span>${m.slot} · ${m.dish}</span><span>${mealMacros(m).proteinG} g</span></div>`)}
      ${when(dinner && (dinner.alternatives || []).length, () => html`<button class="btn secondary sm" data-action="change-dinner" data-v="${d.cycleDay}">Change dinner</button>`)}</div>`;
  })}</div>`;
}

export const sheets = {
  swapEx(sh) {
    const v = upcoming('workout') || activeVersion('workout');
    const ex = v.plan.exercises.find(e => e.exerciseId === sh.id);
    const lib = S.data.library;
    const used = new Set(v.plan.exercises.map(e => e.exerciseId));
    const cur = lib[ex.exerciseId] || {};
    const options = Object.values(lib).filter(e => !used.has(e.id) && e.category === cur.category && e.progressionTypes.includes(ex.progressionType) && !missingEquipment(e.equipment, profile().training || {}, ex.days).length)
      .sort((a, b) => b.muscles.filter(m => (cur.muscles || []).includes(m)).length - a.muscles.filter(m => (cur.muscles || []).includes(m)).length).slice(0, 12);
    return html`<h2 class="h2">Swap ${exName(ex)}</h2><p class="small">Same kind of exercise, same ladder. Starts tomorrow as a new version. For bigger changes, ask Coach.</p>
      <div class="card">${options.length ? options.map(o => html`<button class="listrow" data-action="do-swap-ex" data-from="${ex.exerciseId}" data-to="${o.id}"><span class="t" style="flex:1"><span class="t1">${o.name}</span><span class="t2">${o.muscles.slice(0, 3).join(', ')}</span></span>${icon('swap', 16)}</button>`) : html`<div class="listrow"><span class="small">No close match with your equipment. Ask Coach instead.</span></div>`}</div>
      <button class="btn secondary md" data-action="close-sheet">Cancel</button>`;
  },
  changeDinner(sh) {
    const v = upcoming('meal') || activeVersion('meal');
    const d = v.plan.days.find(x => x.cycleDay === sh.day);
    const dinner = d.meals.find(m => m.slot === 'dinner');
    return html`<h2 class="h2">Day ${sh.day} dinner</h2><p class="small">Now: ${dinner.dish}. Pick one of the approved alternatives. Starts tomorrow as a new version.</p>
      <div class="card">${(dinner.alternatives || []).map((a, i) => html`<button class="listrow" data-action="do-change-dinner" data-day="${sh.day}" data-i="${i}"><span class="t" style="flex:1"><span class="t1">${a.dish}</span><span class="t2">${mealMacros(a).kcal} kcal · ${mealMacros(a).proteinG} g</span></span>${icon('swap', 16)}</button>`)}</div>
      <button class="btn secondary md" data-action="close-sheet">Cancel</button>`;
  },
};

export const actions = {
  restore: async el => {
    if (!confirm(`Restore version ${el.dataset.v}? It becomes a new version starting tomorrow.`)) return;
    const v = await restoreVersion(el.dataset.t, Number(el.dataset.v));
    toast(`Version ${v.version} starts tomorrow`);
  },
  'edit-with-coach': el => {
    S.coach.current = { id: null, title: 'New chat', messages: [] };
    S.coach.prefill = el.dataset.t === 'meal' ? 'I want to change my food chart: ' : 'I want to change my workout plan: ';
    go('#/coach/new');
  },
  'swap-ex': el => { S.ui.sheet = { kind: 'swapEx', id: el.dataset.v }; update(); },
  'do-swap-ex': async el => {
    const v = upcoming('workout') || activeVersion('workout');
    const plan = structuredClone(v.plan);
    const ex = plan.exercises.find(e => e.exerciseId === el.dataset.from);
    ex.exerciseId = el.dataset.to; delete ex.name;
    const nv = await saveManualEdit('workout', plan, `${S.data.library[el.dataset.from].name} → ${S.data.library[el.dataset.to].name}`);
    S.doc.exerciseState[el.dataset.to] = { ...(S.doc.exerciseState[el.dataset.from] || { level: 1, sublevel: 1 }), updatedAt: Date.now() };
    S.ui.sheet = null; toast(`Version ${nv.version} starts tomorrow`); update();
  },
  'change-dinner': el => { S.ui.sheet = { kind: 'changeDinner', day: Number(el.dataset.v) }; update(); },
  'do-change-dinner': async el => {
    const v = upcoming('meal') || activeVersion('meal');
    const plan = structuredClone(v.plan);
    const d = plan.days.find(x => x.cycleDay === Number(el.dataset.day));
    const i = d.meals.findIndex(m => m.slot === 'dinner');
    const old = d.meals[i];
    const alt = old.alternatives[Number(el.dataset.i)];
    d.meals[i] = { ...alt, slot: old.slot, time: old.time, alternatives: [{ ...old, alternatives: undefined }, ...old.alternatives.filter(a => a !== alt)] };
    const nv = await saveManualEdit('meal', plan, `Day ${d.cycleDay} dinner: ${old.dish} → ${alt.dish}`);
    S.ui.sheet = null; toast(`Version ${nv.version} starts tomorrow`); update();
  },
};
