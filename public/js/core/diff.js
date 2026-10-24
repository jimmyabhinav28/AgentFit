// "What changed" summaries for plan revisions (UI-CH-05).
import { WEEKDAY_SHORT } from './dates.js';
import { levelLabel, mealsForDay, mealMacros } from './plans.js';

const name = (ex, library) => ex.name || (library[ex.exerciseId] && library[ex.exerciseId].name) || ex.exerciseId;
const days = d => (d || []).map(x => WEEKDAY_SHORT[x] || x).join(', ');

export function diffWorkout(oldPlan, newPlan, library = {}) {
  if (!oldPlan) return ['New workout plan'];
  const out = [];
  const oldBy = new Map((oldPlan.exercises || []).map(e => [e.exerciseId, e]));
  const newBy = new Map((newPlan.exercises || []).map(e => [e.exerciseId, e]));
  for (const [id, e] of newBy) {
    const o = oldBy.get(id);
    if (!o) { out.push(`Added ${name(e, library)} (${days(e.days)})`); continue; }
    if (days(o.days) !== days(e.days)) out.push(`${name(e, library)}: ${days(o.days)} → ${days(e.days)}`);
    const oStart = levelLabel(oldPlan, o, 1), nStart = levelLabel(newPlan, e, 1);
    if (oStart !== nStart) out.push(`${name(e, library)}: starts at ${nStart} (was ${oStart})`);
    if ((o.levels || []).length !== (e.levels || []).length) out.push(`${name(e, library)}: ${(e.levels || []).length} levels (was ${(o.levels || []).length})`);
    if ((o.target && o.target.text) !== (e.target && e.target.text)) out.push(`${name(e, library)}: target ${e.target.text}`);
  }
  for (const [id, o] of oldBy) if (!newBy.has(id)) out.push(`Removed ${name(o, library)}`);
  const oT = oldPlan.dayTypes || {}, nT = newPlan.dayTypes || {};
  for (const d of new Set([...Object.keys(oT), ...Object.keys(nT)])) {
    if (!oT[d]) out.push(`${WEEKDAY_SHORT[d]} is now a training day (${nT[d].label})`);
    else if (!nT[d]) out.push(`${WEEKDAY_SHORT[d]} is now a rest day`);
    else if (oT[d].label !== nT[d].label) out.push(`${WEEKDAY_SHORT[d]}: ${oT[d].label} → ${nT[d].label}`);
  }
  if ((oldPlan.sessionMinutes || 0) !== (newPlan.sessionMinutes || 0) && newPlan.sessionMinutes) out.push(`Sessions: about ${newPlan.sessionMinutes} min`);
  return out.length ? out : ['No changes to exercises or days'];
}

export function diffMeal(oldPlan, newPlan) {
  if (!oldPlan) return ['New 14-day food chart'];
  const out = [];
  const byDay = p => new Map((p.days || []).map(d => [d.cycleDay, d]));
  const o = byDay(oldPlan), n = byDay(newPlan);
  for (const [cd, nd] of n) {
    const od = o.get(cd);
    const om = new Map(mealsForDay(oldPlan, od).map(m => [m.slot, m]));
    for (const m of mealsForDay(newPlan, nd)) {
      const prev = om.get(m.slot);
      if (!prev) { out.push(`Day ${cd} ${m.slot}: added ${m.dish}`); continue; }
      if (prev.dish !== m.dish) {
        const dp = mealMacros(m).proteinG - mealMacros(prev).proteinG;
        out.push(`Day ${cd} ${m.slot}: ${prev.dish} → ${m.dish}${dp ? `; ${dp > 0 ? '+' : ''}${dp} g protein` : ''}`);
      }
    }
  }
  if (JSON.stringify(oldPlan.eatingWindow) !== JSON.stringify(newPlan.eatingWindow) && newPlan.eatingWindow) out.push(`Eating window ${newPlan.eatingWindow.start}–${newPlan.eatingWindow.end}`);
  if (out.length > 14) return [...out.slice(0, 12), `…and ${out.length - 12} more changes`];
  return out.length ? out : ['No changes to meals'];
}
