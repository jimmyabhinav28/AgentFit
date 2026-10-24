// Plan versions, the 14-day meal cycle, the level ladder and prescriptions.
// Pure functions shared by the PWA and the Worker.
import { addDays, daysBetween, weekdayOf, weekdayIndex, WEEKDAYS } from './dates.js';

// ---------- defaults ----------
export const DEFAULT_SUBLEVELS = [
  { sets: 4, reps: 10, note: { label: 'Likelihood of DOMS', animation: 'lightning', tone: 'rose' } },
  { sets: 3, reps: 12, note: { label: 'Start getting accustomed', animation: 'sprout', tone: 'amber' } },
  { sets: 4, reps: 12, note: { label: 'Get in the flow', animation: 'waves', tone: 'indigo' } },
  { sets: 4, reps: 15, note: { label: 'End of level', animation: 'trophy', tone: 'violet' } },
];
export const MAX_EXERCISES_PER_DAY = 5;
export const MEAL_CYCLE_DAYS = 14;

export function planSublevels(plan) {
  const s = plan && Array.isArray(plan.sublevels) && plan.sublevels.length === 4 ? plan.sublevels : DEFAULT_SUBLEVELS;
  return s.map((x, i) => ({ ...DEFAULT_SUBLEVELS[i], ...x, note: { ...DEFAULT_SUBLEVELS[i].note, ...(x.note || {}) } }));
}

// ---------- versions (PL-01 to PL-06) ----------
// history: [{ version, effectiveFrom, acceptedAt, summary, plan }]
export function sortedVersions(history = []) {
  return [...history].sort((a, b) => a.version - b.version);
}
export function nextVersionNumber(history = []) {
  return history.reduce((m, v) => Math.max(m, v.version), 0) + 1;
}
// The version in effect on `date`: the highest version whose effectiveFrom <= date.
export function versionOn(history = [], date) {
  let best = null;
  for (const v of history) if (v.effectiveFrom <= date && (!best || v.version > best.version)) best = v;
  return best;
}
// A version accepted for a future date (shown as "starts tomorrow").
export function upcomingVersion(history = [], today) {
  let best = null;
  for (const v of history) if (v.effectiveFrom > today && (!best || v.version > best.version)) best = v;
  return best;
}
export function makeVersion(history, plan, { today, summary, acceptedAt = new Date().toISOString() }) {
  return { version: nextVersionNumber(history), effectiveFrom: addDays(today, 1), acceptedAt, summary: summary || 'Updated plan', plan };
}
export function firstStartDate(...histories) {
  const all = histories.flat().filter(Boolean).map(v => v.effectiveFrom).sort();
  return all[0] || null;
}

// ---------- meal cycle (PL-09) ----------
// Cycle day 1 always falls on plan.cycleStartWeekday, so weekday rules hold for every cycle day.
export function cycleAnchor(version) {
  const startWd = version.plan.cycleStartWeekday || weekdayOf(version.effectiveFrom);
  const back = (weekdayIndex(weekdayOf(version.effectiveFrom)) - weekdayIndex(startWd) + 7) % 7;
  return addDays(version.effectiveFrom, -back);
}
export function cycleDayOn(version, date) {
  const len = version.plan.cycleLengthDays || MEAL_CYCLE_DAYS;
  const d = daysBetween(cycleAnchor(version), date);
  return (((d % len) + len) % len) + 1;
}
export function weekdayForCycleDay(cycleStartWeekday, cycleDay) {
  return WEEKDAYS[(weekdayIndex(cycleStartWeekday) + cycleDay - 1) % 7];
}
export function mealDayOn(version, date) {
  if (!version) return null;
  const cd = cycleDayOn(version, date);
  return (version.plan.days || []).find(d => d.cycleDay === cd) || null;
}
// All meals for a day, fixed meals merged in and sorted by time.
export function mealsForDay(plan, day) {
  const fixed = (plan.fixedMeals || []).map((m, i) => ({ ...m, key: m.key || `fixed-${m.slot}-${i}`, fixed: true }));
  const planned = ((day && day.meals) || []).map((m, i) => ({ ...m, key: m.key || `${m.slot}-${i}` }));
  const slots = new Set(planned.map(m => m.slot));
  return [...fixed.filter(m => !slots.has(m.slot)), ...planned].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}
export function mealMacros(meal) {
  const e = meal.est || {};
  return { kcal: Math.round(e.kcal || 0), proteinG: Math.round(e.proteinG || 0), carbsG: Math.round(e.carbsG || 0), fatG: Math.round(e.fatG || 0) };
}
export function dayTotals(meals) {
  return meals.reduce((t, m) => {
    const x = mealMacros(m);
    return { kcal: t.kcal + x.kcal, proteinG: t.proteinG + x.proteinG, carbsG: t.carbsG + x.carbsG, fatG: t.fatG + x.fatG };
  }, { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
}

// ---------- workout days ----------
export function workoutDay(plan, weekday) {
  if (!plan) return null;
  const type = (plan.dayTypes || {})[weekday] || null;
  const exercises = (plan.exercises || []).filter(e => (e.days || []).includes(weekday));
  if (!type && !exercises.length) return null;
  return { weekday, type, exercises };
}

// ---------- ladder (FR-PRG-01 to 04) ----------
export function defaultState() { return { level: 1, sublevel: 1 }; }
export function clampState(ex, st) {
  const max = Math.max(1, (ex.levels || []).length);
  const level = Math.min(max, Math.max(1, st?.level || 1));
  const sublevel = Math.min(4, Math.max(1, st?.sublevel || 1));
  return { level, sublevel };
}
export function stepState(ex, st, delta) {
  const max = Math.max(1, (ex.levels || []).length);
  let { level, sublevel } = clampState(ex, st);
  if (delta > 0) {
    if (sublevel < 4) sublevel++;
    else if (level < max) { level++; sublevel = 1; }
    else return null; // top of the ladder
  } else {
    if (sublevel > 1) sublevel--;
    else if (level > 1) { level--; sublevel = 4; }
    else return null; // bottom of the ladder
  }
  return { level, sublevel };
}
export const atTop = (ex, st) => stepState(ex, st, +1) === null;
export const atBottom = (ex, st) => stepState(ex, st, -1) === null;

// When a revision changes the ladder, keep the user at the nearest equivalent level.
export function mapStateToNewLadder(oldEx, newEx, st) {
  if (!st) return defaultState();
  const oldLevel = oldEx && (oldEx.levels || [])[st.level - 1];
  const newLevels = newEx.levels || [];
  const val = l => (l && l.load ? l.load.value : l && (l.durationSec ?? l.distanceM ?? l.drawLb ?? l.shots ?? l.reps));
  const ov = val(oldLevel);
  if (ov != null && newLevels.some(l => val(l) != null)) {
    let best = 0, bestDiff = Infinity;
    newLevels.forEach((l, i) => { const v = val(l); if (v != null && Math.abs(v - ov) < bestDiff) { bestDiff = Math.abs(v - ov); best = i; } });
    return { level: best + 1, sublevel: st.sublevel };
  }
  return clampState(newEx, st);
}

// ---------- prescription text ----------
export function fmtDuration(sec) {
  if (sec == null) return '';
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}
export function fmtDistance(m) {
  if (m == null) return '';
  return m >= 1000 ? `${+(m / 1000).toFixed(2)} km` : `${m} m`;
}
function loadText(load) {
  if (!load || load.value == null) return '';
  const unit = load.unit || 'kg';
  if (unit === 'kg_per_hand' || unit === 'kg') return `${load.value} kg`;
  if (unit === 'kg_total') return `${load.value} kg total`;
  if (unit === 'lb_per_hand' || unit === 'lb') return `${load.value} lb`;
  return `${load.value} ${unit}`;
}
// What a level and sub-level asks for. Returns { main, sets, reps, durationSec, ... }.
export function prescription(plan, ex, st) {
  const { level, sublevel } = clampState(ex, st);
  const lv = (ex.levels || [])[level - 1] || {};
  const scheme = planSublevels(plan)[sublevel - 1];
  const own = Array.isArray(lv.sublevels) && lv.sublevels[sublevel - 1] ? lv.sublevels[sublevel - 1] : null;
  const type = ex.progressionType || 'load';
  const p = { level, sublevel, note: scheme.note };
  // Sub-level fields: the level's own override, else the plan scheme.
  const sets = own?.sets ?? scheme.sets;
  let reps = own?.reps ?? (type === 'load' || type === 'reps' || type === 'variation' ? scheme.reps : undefined);
  if (own && own.reps === undefined && (own.durationSec || own.distanceM)) reps = undefined;
  const durationSec = own?.durationSec ?? lv.durationSec;
  const distanceM = own?.distanceM ?? lv.distanceM;
  const paceKmh = own?.paceKmh ?? lv.paceKmh;
  const shots = own?.shots ?? lv.shots;
  Object.assign(p, { sets, reps, durationSec, distanceM, paceKmh, shots, load: lv.load, variation: lv.variation, drawLb: lv.drawLb });

  if (own?.text) { p.main = own.text; return p; }
  const parts = [];
  if (lv.variation) parts.push(lv.variation);
  if (lv.load) parts.push(loadText(lv.load));
  if (lv.drawLb) parts.push(`${lv.drawLb} lb draw`);
  let work = '';
  if (reps != null) work = `${sets} × ${reps}`;
  else if (distanceM != null) work = `${sets > 1 ? sets + ' × ' : ''}${fmtDistance(distanceM)}${paceKmh ? ` at ${paceKmh} km/h` : ''}`;
  else if (durationSec != null) work = `${sets > 1 ? sets + ' × ' : ''}${fmtDuration(durationSec)}`;
  else if (shots != null) work = `${shots} shots`;
  if (shots != null && reps != null) work += ` · ${shots} shots`;
  if (work) parts.push(work + (ex.perSide ? ' each side' : ''));
  p.main = parts.join(' · ') || lv.label || `Level ${level}`;
  return p;
}
// The short "Next:" hint under the staircase.
export function nextHint(plan, ex, st) {
  const nxt = stepState(ex, st, +1);
  if (!nxt) return 'Top of the ladder';
  const p = prescription(plan, ex, nxt);
  return nxt.level !== st.level ? `Next level: ${p.main}` : `Next: ${p.main}`;
}
export function levelLabel(plan, ex, level) {
  return prescription(plan, ex, { level, sublevel: 1 }).main;
}
