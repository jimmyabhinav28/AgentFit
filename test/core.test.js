import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { weekNumber, weekdayOf, addDays, weekStart } from '../public/js/core/dates.js';
import { versionOn, upcomingVersion, makeVersion, cycleDayOn, stepState, prescription, nextHint, mapStateToNewLadder, mealDayOn } from '../public/js/core/plans.js';
import { validateWorkoutPlan, validateMealPlan, dietRules } from '../public/js/core/validate.js';
import { allowedLoads, missingEquipment } from '../public/js/core/equipment.js';
import { targets } from '../public/js/core/nutrition.js';
import { assess } from '../public/js/core/norms.js';
import { diffWorkout, diffMeal } from '../public/js/core/diff.js';
import { mergeDocs, emptyDoc } from '../public/js/core/merge.js';
import { profile, workoutPlan, mealPlan } from './fixtures.js';

const lib = Object.fromEntries(JSON.parse(fs.readFileSync(new URL('../public/data/exercises.json', import.meta.url))).exercises.map(e => [e.id, e]));
const norms = JSON.parse(fs.readFileSync(new URL('../public/data/norms.json', import.meta.url)));

test('dates', () => {
  assert.equal(weekdayOf('2026-10-24'), 'SAT');
  assert.equal(weekStart('2026-10-24'), '2026-10-19');
  assert.equal(weekNumber('2026-10-25', '2026-10-25'), 1);
  assert.equal(weekNumber('2026-10-25', '2026-10-26'), 2); // 25 Oct is a Sunday
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('versions take effect the next day and the highest wins', () => {
  let h = [];
  const v1 = makeVersion(h, { a: 1 }, { today: '2026-10-24', summary: 'v1' }); h = [v1];
  assert.equal(v1.version, 1); assert.equal(v1.effectiveFrom, '2026-10-25');
  assert.equal(versionOn(h, '2026-10-24'), null);
  assert.equal(upcomingVersion(h, '2026-10-24').version, 1);
  const v2 = makeVersion(h, { a: 2 }, { today: '2026-11-01' }); const v3 = makeVersion([...h, v2], { a: 3 }, { today: '2026-11-01' });
  h = [v1, v2, v3];
  assert.equal(versionOn(h, '2026-11-01').version, 1);
  assert.equal(versionOn(h, '2026-11-02').version, 3);
});

test('14-day cycle keeps weekdays fixed', () => {
  const v = { version: 1, effectiveFrom: '2026-10-28', plan: { cycleStartWeekday: 'MON', cycleLengthDays: 14 } }; // a Wednesday
  assert.equal(cycleDayOn(v, '2026-10-28'), 3);
  assert.equal(cycleDayOn(v, '2026-11-09'), 1);
  for (let i = 0; i < 40; i++) {
    const date = addDays('2026-10-28', i);
    const cd = cycleDayOn(v, date);
    assert.equal(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][(cd - 1) % 7], weekdayOf(date));
  }
  const full = { version: 1, effectiveFrom: '2026-10-26', plan: mealPlan() };
  assert.equal(mealDayOn(full, '2026-10-27').weekday, 'TUE');
});

test('sub-level ladder steps', () => {
  const ex = workoutPlan.exercises[1];
  assert.deepEqual(stepState(ex, { level: 1, sublevel: 4 }, +1), { level: 2, sublevel: 1 });
  assert.deepEqual(stepState(ex, { level: 2, sublevel: 1 }, -1), { level: 1, sublevel: 4 });
  assert.equal(stepState(ex, { level: 3, sublevel: 4 }, +1), null);
  assert.equal(stepState(ex, { level: 1, sublevel: 1 }, -1), null);
});

test('prescriptions read naturally', () => {
  const [push, press, plank, , band, jog] = workoutPlan.exercises;
  assert.equal(prescription(workoutPlan, press, { level: 2, sublevel: 3 }).main, '12 kg · 4 × 12');
  assert.equal(prescription(workoutPlan, plank, { level: 1, sublevel: 1 }).main, '4 × 25 s');
  assert.equal(prescription(workoutPlan, push, { level: 3, sublevel: 1 }).main, 'Full push-ups · 4 × 6');
  assert.equal(prescription(workoutPlan, band, { level: 2, sublevel: 2 }).main, 'Medium band · 3 × 12');
  assert.equal(prescription(workoutPlan, jog, { level: 1, sublevel: 1 }).main, '4 × 1 km');
  assert.equal(nextHint(workoutPlan, band, { level: 1, sublevel: 4 }), 'Next level: Medium band · 4 × 10');
});

test('ladder mapping keeps the nearest load', () => {
  const old = workoutPlan.exercises[1];
  const neu = { ...old, levels: [8, 10, 11, 12, 14].map((v, i) => ({ level: i + 1, load: { value: v } })) };
  assert.deepEqual(mapStateToNewLadder(old, neu, { level: 2, sublevel: 3 }), { level: 4, sublevel: 3 });
});

test('equipment and loads', () => {
  assert.deepEqual(missingEquipment(['pullup_bar'], profile.training, ['TUE']), ['pullup_bar']);
  assert.equal(missingEquipment(['dumbbell'], profile.training, ['TUE']).length, 0);
  const loads = allowedLoads(['dumbbell'], profile.training);
  assert.ok(loads.includes(14) && !loads.includes(15));
  const gym = { where: ['home', 'gym'], gymWeekdays: ['MON'], equipment: {} };
  assert.deepEqual(missingEquipment(['barbell'], gym, ['MON']), []);
  assert.deepEqual(missingEquipment(['barbell'], gym, ['TUE']), ['barbell']);
});

test('workout validator accepts a good plan and explains a bad one', () => {
  const ok = validateWorkoutPlan(workoutPlan, { library: lib, training: profile.training });
  assert.deepEqual(ok.errors, []);
  const bad = structuredClone(workoutPlan);
  bad.exercises[1].levels[1].load.value = 13;
  bad.exercises.push({ exerciseId: 'pullup', days: ['TUE'], progressionType: 'reps', levels: [{ level: 1 }], target: { text: '5' } });
  bad.exercises.push({ exerciseId: 'made_up', days: ['TUE'], progressionType: 'reps', levels: [{ level: 1 }], target: { text: '5' } });
  for (const id of ['db_bicep_curl', 'db_tricep_kickback']) bad.exercises.push({ exerciseId: id, days: ['TUE'], progressionType: 'load', levels: [{ level: 1, load: { value: 6 } }], target: { text: 'x' } });
  const r = validateWorkoutPlan(bad, { library: lib, training: profile.training });
  const msgs = r.errors.map(e => e.message).join('\n');
  assert.match(msgs, /13 kg is not possible/);
  assert.match(msgs, /needs pullup_bar/);
  assert.match(msgs, /not in the exercise library/);
  assert.match(msgs, /TUE has 7 exercises; the maximum is 5/);
});

test('meal validator enforces diet days, window and targets', () => {
  const t = { proteinGMin: 95, kcal: 1730, kcalFloor: 1200 };
  const good = validateMealPlan(mealPlan(), { food: profile.food, targets: t });
  assert.deepEqual(good.errors, []);
  const bad = mealPlan();
  bad.days[1].meals[0] = { slot: 'breakfast', time: '08:30', dish: 'Egg bhurji', est: { kcal: 420, proteinG: 26 }, tags: [] }; // Tuesday
  bad.days[2].meals[3].time = '22:00';
  bad.days[3].meals[1].dish = 'Karela fry with dal';
  bad.days.pop();
  const r = validateMealPlan(bad, { food: profile.food, targets: t });
  const msgs = r.errors.map(e => e.message).join('\n');
  assert.match(msgs, /contains egg, not allowed on TUE/);
  assert.match(msgs, /outside the eating window/);
  assert.match(msgs, /dislikes/);
  assert.match(msgs, /cycle day 14 is missing/);
  assert.equal(dietRules({ dietType: 'vegetarian' })[0].tags.includes('egg'), true);
});

test('targets and assessment', () => {
  const t = targets(profile, { today: '2026-10-24', trainingDaysPerWeek: 3 });
  assert.ok(t.kcal >= 1200 && t.kcal < 2200, String(t.kcal));
  assert.ok(t.proteinGMin >= 80);
  const a = assess(norms, { upper: { value: 10 }, back: { value: 0 }, core: { value: 20 }, mobility: { value: 1 } }, { age: 30, gender: 'female' });
  assert.equal(a.areas.upper, 1); assert.equal(a.areas.back, 0); assert.equal(a.areas.mobility, 1);
});

test('diffs and merge', () => {
  const p2 = structuredClone(workoutPlan); p2.exercises.pop(); p2.exercises[0].days = ['TUE'];
  const d = diffWorkout(workoutPlan, p2, lib);
  assert.ok(d.some(x => x.startsWith('Removed Easy jog')));
  const m2 = mealPlan(); m2.days[3].meals[3].dish = 'Rajma rice';
  assert.match(diffMeal(mealPlan(), m2)[0], /Day 4 dinner: Paneer tikka .* → Rajma rice/);
  const a = { ...emptyDoc(), workoutLog: { '2026-10-27': { pushup: { done: true, at: 5 } } }, updatedAt: 5 };
  const b = { ...emptyDoc(), workoutLog: { '2026-10-27': { plank: { done: true, at: 6 }, pushup: { done: false, at: 7 } } }, updatedAt: 7 };
  const m = mergeDocs(a, b);
  assert.deepEqual(m.workoutLog['2026-10-27'], { pushup: { done: false, at: 7 }, plank: { done: true, at: 6 } });
});
