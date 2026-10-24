// Plan validators (FR-PLAN-01, 04, 05; FR-PRG-07; PL-09).
// They return precise errors so the AI can correct itself (§12.3).
import { WEEKDAYS } from './dates.js';
import { MAX_EXERCISES_PER_DAY, MEAL_CYCLE_DAYS, weekdayForCycleDay, prescription, mealsForDay, dayTotals } from './plans.js';
import { missingEquipment, allowedLoads } from './equipment.js';

const PROGRESSION_TYPES = ['load', 'reps', 'variation', 'duration', 'distance', 'pace', 'draw', 'shots'];
const DAY_COLORS = ['violet', 'blue', 'green', 'amber', 'rose', 'teal', 'slate', 'indigo'];

// ---------- diet ----------
export const MEAT_TAGS = ['chicken', 'mutton', 'fish', 'seafood', 'meat', 'pork', 'beef'];
const FORBIDDEN = {
  vegetarian: ['egg', ...MEAT_TAGS],
  eggetarian: [...MEAT_TAGS],
  nonveg: [],
  vegan: ['egg', ...MEAT_TAGS, 'dairy', 'honey'],
  jain: ['egg', ...MEAT_TAGS, 'onion_garlic', 'root_veg'],
};
const KEYWORDS = {
  egg: /\beggs?\b|omelet|omelette|\banda\b|egg bhurji/i,
  chicken: /chicken|murgh/i,
  mutton: /mutton|\blamb\b|\bgoat\b/i,
  fish: /\bfish\b|prawn|shrimp|\bcrab\b|pomfret|surmai|rohu|\bmeen\b|\bseer\b|tuna|salmon/i,
  meat: /\bbeef\b|\bpork\b|bacon|\bham\b|sausage|salami/i,
};

// Rules the validator enforces regardless of what the AI wrote into the plan.
export function dietRules(food = {}) {
  const type = food.dietType || 'vegetarian';
  const rules = [];
  const always = FORBIDDEN[type] || [];
  if (always.length) rules.push({ type: 'exclude_tags', tags: always, days: [...WEEKDAYS], reason: `${type} diet` });
  const restricted = food.restrictedDays || [];
  if (restricted.length) {
    if (type === 'nonveg') rules.push({ type: 'exclude_tags', tags: ['egg', ...MEAT_TAGS], days: restricted, reason: 'vegetarian on these days' });
    if (type === 'eggetarian') rules.push({ type: 'exclude_tags', tags: ['egg'], days: restricted, reason: 'egg-free on these days' });
  }
  return rules;
}

function mealText(m) {
  return [m.dish, ...(m.items || []).map(i => (typeof i === 'string' ? i : i.name))].filter(Boolean).join(' ');
}
export function mealTags(m) {
  const tags = new Set((m.tags || []).map(t => String(t).toLowerCase()));
  for (const i of m.items || []) for (const t of (i && i.tags) || []) tags.add(String(t).toLowerCase());
  const text = mealText(m);
  for (const [tag, re] of Object.entries(KEYWORDS)) if (re.test(text)) tags.add(tag);
  return tags;
}
export function forbiddenOnDay(rules, weekday) {
  const out = new Map();
  for (const r of rules) if (r.type === 'exclude_tags' && r.days.includes(weekday)) for (const t of r.tags) out.set(t, r.reason);
  return out;
}

const toMin = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };

export function validateMealPlan(plan, { food = {}, targets = null, draft = false } = {}) {
  const errors = [], warnings = [];
  const err = (path, message) => errors.push({ path, message });
  if (!plan || plan.type !== 'meal_plan') { err('type', 'type must be "meal_plan"'); return { ok: false, errors, warnings }; }
  const len = plan.cycleLengthDays || MEAL_CYCLE_DAYS;
  if (len !== MEAL_CYCLE_DAYS) err('cycleLengthDays', `cycleLengthDays must be ${MEAL_CYCLE_DAYS}`);
  if (!WEEKDAYS.includes(plan.cycleStartWeekday)) err('cycleStartWeekday', `cycleStartWeekday must be one of ${WEEKDAYS.join(', ')}`);
  const win = plan.eatingWindow || food.eatingWindow;
  const ws = toMin(win && win.start), we = toMin(win && win.end);
  const rules = dietRules(food);
  const dislikes = (food.dislikes || []).map(s => String(s).toLowerCase()).filter(s => s.length > 2);
  const days = Array.isArray(plan.days) ? plan.days : [];
  const seen = new Set();

  const checkMeal = (m, path, weekday) => {
    if (!m.slot) err(`${path}.slot`, 'slot is required (breakfast, lunch, snack, dinner, ...)');
    if (!m.dish && !(m.items || []).length) err(`${path}.dish`, 'dish or items is required');
    const t = toMin(m.time);
    if (t == null) err(`${path}.time`, 'time must be HH:MM');
    else if (ws != null && we != null && (t < ws || t > we)) err(`${path}.time`, `${m.time} is outside the eating window ${win.start}–${win.end}`);
    const e = m.est || {};
    if (!(e.kcal > 0)) err(`${path}.est.kcal`, 'est.kcal (estimated calories) is required');
    if (!(e.proteinG >= 0)) err(`${path}.est.proteinG`, 'est.proteinG is required');
    if (e.kcal > 0 && e.proteinG >= 0 && e.carbsG >= 0 && e.fatG >= 0) {
      const calc = 4 * e.proteinG + 4 * e.carbsG + 9 * e.fatG;
      if (Math.abs(calc - e.kcal) > Math.max(60, e.kcal * 0.25)) warnings.push({ path: `${path}.est`, message: `macros add up to ${Math.round(calc)} kcal, not ${e.kcal}` });
    }
    if (weekday) {
      const forbidden = forbiddenOnDay(rules, weekday);
      for (const tag of mealTags(m)) if (forbidden.has(tag)) err(path, `"${m.dish || mealText(m)}" contains ${tag}, not allowed on ${weekday} (${forbidden.get(tag)})`);
    }
    const text = mealText(m).toLowerCase();
    for (const d of dislikes) if (text.includes(d)) err(path, `"${m.dish}" uses ${d}, which the user dislikes`);
  };

  (plan.fixedMeals || []).forEach((m, i) => {
    // Fixed meals are eaten every day, so they must be allowed on every day.
    checkMeal(m, `fixedMeals[${i}]`, null);
    for (const wd of WEEKDAYS) {
      const forbidden = forbiddenOnDay(rules, wd);
      for (const tag of mealTags(m)) if (forbidden.has(tag)) { err(`fixedMeals[${i}]`, `fixed meal contains ${tag}, not allowed on ${wd}`); break; }
    }
  });

  days.forEach((d, i) => {
    const path = `days[${i}]`;
    if (!Number.isInteger(d.cycleDay) || d.cycleDay < 1 || d.cycleDay > len) { err(`${path}.cycleDay`, `cycleDay must be 1–${len}`); return; }
    if (seen.has(d.cycleDay)) err(`${path}.cycleDay`, `cycleDay ${d.cycleDay} appears twice`);
    seen.add(d.cycleDay);
    const wd = WEEKDAYS.includes(plan.cycleStartWeekday) ? weekdayForCycleDay(plan.cycleStartWeekday, d.cycleDay) : d.weekday;
    if (d.weekday && wd && d.weekday !== wd) err(`${path}.weekday`, `cycle day ${d.cycleDay} falls on ${wd}, not ${d.weekday}`);
    (d.meals || []).forEach((m, j) => {
      checkMeal(m, `${path}.meals[${j}]`, wd);
      (m.alternatives || []).forEach((a, k) => {
        if (typeof a !== 'object') { err(`${path}.meals[${j}].alternatives[${k}]`, 'alternatives must be full meal objects with dish, est and tags'); return; }
        checkMeal({ ...a, slot: a.slot || m.slot, time: a.time || m.time }, `${path}.meals[${j}].alternatives[${k}]`, wd);
      });
    });
    const all = mealsForDay(plan, d);
    if (!all.length) err(`${path}.meals`, 'a day needs at least one meal');
    if (targets) {
      const tot = dayTotals(all);
      if (tot.proteinG < targets.proteinGMin - 3) err(`${path}`, `day ${d.cycleDay} has ${tot.proteinG} g protein, below the ${targets.proteinGMin} g target`);
      if (tot.kcal < targets.kcalFloor) err(`${path}`, `day ${d.cycleDay} has ${tot.kcal} kcal, below the safety floor of ${targets.kcalFloor}`);
      if (Math.abs(tot.kcal - targets.kcal) > 200) err(`${path}`, `day ${d.cycleDay} has ${tot.kcal} kcal; aim for ${targets.kcal} (±150)`);
    }
  });
  for (let c = 1; c <= len; c++) if (!seen.has(c)) err('days', `cycle day ${c} is missing; all ${len} days are required`);
  return { ok: errors.length === 0, errors, warnings };
}

// ---------- workout ----------
export function validateWorkoutPlan(plan, { library = {}, training = {}, maxPerDay = MAX_EXERCISES_PER_DAY } = {}) {
  const errors = [], warnings = [];
  const err = (path, message) => errors.push({ path, message });
  if (!plan || plan.type !== 'workout_plan') { err('type', 'type must be "workout_plan"'); return { ok: false, errors, warnings }; }
  const cap = Math.min(MAX_EXERCISES_PER_DAY, plan.maxExercisesPerDay || maxPerDay);
  const dayTypes = plan.dayTypes || {};
  for (const [k, v] of Object.entries(dayTypes)) {
    if (!WEEKDAYS.includes(k)) err(`dayTypes.${k}`, `day keys must be ${WEEKDAYS.join(', ')}`);
    if (!v || !v.label) err(`dayTypes.${k}.label`, 'label is required');
    if (v && v.color && !DAY_COLORS.includes(v.color)) err(`dayTypes.${k}.color`, `color must be one of ${DAY_COLORS.join(', ')}`);
  }
  if (plan.sublevels && (!Array.isArray(plan.sublevels) || plan.sublevels.length !== 4)) err('sublevels', 'sublevels must have exactly 4 entries');
  const exercises = Array.isArray(plan.exercises) ? plan.exercises : [];
  if (!exercises.length) err('exercises', 'at least one exercise is required');
  const perDay = Object.fromEntries(WEEKDAYS.map(d => [d, 0]));
  const ids = new Set();

  exercises.forEach((ex, i) => {
    const path = `exercises[${i}]`;
    const id = ex.exerciseId;
    const lib = library[id];
    if (!id) err(`${path}.exerciseId`, 'exerciseId is required');
    else if (!lib && !String(id).startsWith('custom:')) err(`${path}.exerciseId`, `"${id}" is not in the exercise library; call search_exercises and use a library id`);
    if (String(id).startsWith('custom:') && !ex.name) err(`${path}.name`, 'custom exercises need a name');
    if (ids.has(id)) err(`${path}.exerciseId`, `"${id}" appears twice; put both days in one entry`);
    ids.add(id);
    const days = ex.days || [];
    if (!days.length) err(`${path}.days`, 'days is required');
    for (const d of days) {
      if (!WEEKDAYS.includes(d)) err(`${path}.days`, `"${d}" is not a weekday code`);
      else { perDay[d]++; if (!dayTypes[d]) err(`${path}.days`, `${d} has no dayTypes entry`); }
    }
    if (!PROGRESSION_TYPES.includes(ex.progressionType)) err(`${path}.progressionType`, `progressionType must be one of ${PROGRESSION_TYPES.join(', ')}`);
    if (lib) {
      const missing = missingEquipment(lib.equipment || [], training, days);
      if (missing.length) err(path, `${lib.name} needs ${missing.join(', ')}, which the user does not have on ${days.join('/')}`);
    }
    const levels = Array.isArray(ex.levels) ? ex.levels : [];
    if (!levels.length) err(`${path}.levels`, 'levels is required (a ladder from the baseline to the target)');
    if (levels.length > 30) err(`${path}.levels`, 'at most 30 levels');
    const allowed = lib && ex.progressionType === 'load' ? allowedLoads(lib.equipment || [], training, days) : null;
    let prevLoad = -Infinity;
    levels.forEach((lv, j) => {
      const lp = `${path}.levels[${j}]`;
      if (lv.level !== j + 1) err(`${lp}.level`, `levels must be numbered 1, 2, 3… (found ${lv.level} at position ${j + 1})`);
      if (lv.sublevels && (!Array.isArray(lv.sublevels) || lv.sublevels.length !== 4)) err(`${lp}.sublevels`, 'a level override needs exactly 4 sub-levels');
      if (ex.progressionType === 'load') {
        if (!lv.load || !(lv.load.value > 0)) err(`${lp}.load`, 'load.value is required for load progressions');
        else {
          if (allowed && !allowed.includes(Math.round(lv.load.value * 100) / 100)) err(`${lp}.load`, `${lv.load.value} kg is not possible with the user's equipment; allowed: ${allowed.slice(0, 25).join(', ')}`);
          if (lv.load.value < prevLoad) err(`${lp}.load`, 'loads must not go down as levels go up');
          prevLoad = lv.load.value;
        }
      }
      if (ex.progressionType === 'duration' && !(lv.durationSec > 0) && !lv.sublevels) err(`${lp}.durationSec`, 'durationSec is required for duration progressions');
      if ((ex.progressionType === 'distance' || ex.progressionType === 'pace') && !(lv.distanceM > 0) && !lv.sublevels) err(`${lp}.distanceM`, 'distanceM is required for distance and pace progressions');
      if (ex.progressionType === 'variation' && !lv.variation) err(`${lp}.variation`, 'variation is required for variation progressions');
      if (ex.progressionType === 'draw' && !(lv.drawLb > 0) && !lv.variation) err(`${lp}.drawLb`, 'drawLb (or a band variation) is required for draw progressions');
      try {
        for (let s = 1; s <= 4; s++) if (!prescription(plan, ex, { level: j + 1, sublevel: s }).main) err(lp, `level ${j + 1} sub-level ${s} has no prescription`);
      } catch (e) { err(lp, 'level could not be read: ' + e.message); }
    });
    if (!ex.target || !ex.target.text) err(`${path}.target.text`, 'target.text is required');
  });
  for (const [d, n] of Object.entries(perDay)) if (n > cap) err('exercises', `${d} has ${n} exercises; the maximum is ${cap} per day`);
  for (const d of Object.keys(dayTypes)) if (WEEKDAYS.includes(d) && !perDay[d]) warnings.push({ path: `dayTypes.${d}`, message: `${d} is a training day with no exercises` });
  return { ok: errors.length === 0, errors, warnings };
}

export function formatErrors(result, limit = 25) {
  return result.errors.slice(0, limit).map(e => `- ${e.path}: ${e.message}`).join('\n') + (result.errors.length > limit ? `\n…and ${result.errors.length - limit} more` : '');
}
