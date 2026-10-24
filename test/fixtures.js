// Sample profile and plans used by tests and by the mock AI provider.
export const profile = {
  name: 'Riya',
  body: { dob: '1996-08-14', gender: 'female', heightCm: 163, weightKg: 68 },
  location: { country: 'India', city: 'Bengaluru', region: 'south' },
  purpose: { kind: 'strength', note: '' },
  training: {
    where: ['home', 'outdoors'],
    equipment: { dumbbells_adjustable: { min: 2, max: 40, step: 2 }, bands: { levels: ['light', 'medium', 'heavy'] }, mat: true },
    facilities: { park_track: true, stairs: true },
    gymWeekdays: [],
  },
  schedule: { frequency: 'few', days: ['TUE', 'THU', 'SAT'], sessionMinutes: 45 },
  food: {
    dietType: 'eggetarian', restrictedDays: ['TUE', 'THU', 'SAT'], eatingWindow: { start: '08:00', end: '20:30' },
    whoCooks: 'self', cookingMinutes: 30, likes: ['Idli', 'Paneer'], dislikes: ['Karela'], calorieIntent: 'lose', proteinGMin: 95,
  },
};

const sub = (sets, reps) => ({ sets, reps });
export const workoutPlan = {
  schemaVersion: '1.0',
  type: 'workout_plan',
  name: 'Push-up and plank base',
  goal: { title: 'Build a push-up and plank base', items: ['20 clean push-ups', '2-minute plank'] },
  weekStartsOn: 'MON',
  sessionMinutes: 45,
  dayTypes: {
    TUE: { type: 'push', label: 'Push and core', color: 'green' },
    THU: { type: 'pull', label: 'Pull and legs', color: 'blue' },
    SAT: { type: 'full', label: 'Full body and easy jog', color: 'violet' },
  },
  exercises: [
    { exerciseId: 'pushup', category: 'Strength', days: ['TUE', 'SAT'], progressionType: 'variation',
      levels: [{ level: 1, variation: 'Incline push-ups' }, { level: 2, variation: 'Knee push-ups' }, { level: 3, variation: 'Full push-ups', sublevels: [sub(4, 6), sub(4, 8), sub(4, 10), sub(3, 15)] }],
      target: { text: '20 push-ups in one go' }, explanation: 'Start on a table edge, then the floor.' },
    { exerciseId: 'db_floor_press', category: 'Strength', days: ['TUE'], progressionType: 'load',
      levels: [{ level: 1, load: { value: 10, unit: 'kg_per_hand' } }, { level: 2, load: { value: 12, unit: 'kg_per_hand' } }, { level: 3, load: { value: 14, unit: 'kg_per_hand' } }],
      target: { text: '20 kg each hand', value: 20, unit: 'kg' } },
    { exerciseId: 'plank', category: 'Core', days: ['TUE', 'THU', 'SAT'], progressionType: 'duration',
      levels: [{ level: 1, durationSec: 25 }, { level: 2, durationSec: 40 }, { level: 3, durationSec: 60 }],
      target: { text: '2-minute plank', value: 120, unit: 's' } },
    { exerciseId: 'goblet_squat', category: 'Strength', days: ['THU'], progressionType: 'load',
      levels: [{ level: 1, load: { value: 10, unit: 'kg' } }, { level: 2, load: { value: 12, unit: 'kg' } }],
      target: { text: '20 kg goblet squat' } },
    { exerciseId: 'band_row', category: 'Strength', days: ['THU'], progressionType: 'variation',
      levels: [{ level: 1, variation: 'Light band' }, { level: 2, variation: 'Medium band' }, { level: 3, variation: 'Heavy band' }],
      target: { text: 'Heavy band, 4 × 15' } },
    { exerciseId: 'easy_jog', category: 'Running', days: ['SAT'], progressionType: 'distance',
      levels: [{ level: 1, distanceM: 1000 }, { level: 2, distanceM: 1500 }, { level: 3, distanceM: 2000 }],
      target: { text: '5 km easy' } },
  ],
  maxExercisesPerDay: 5,
};

const meal = (slot, time, dish, kcal, p, c, f, tags = ['veg']) => ({ slot, time, dish, items: [{ name: dish }], est: { kcal, proteinG: p, carbsG: c, fatG: f }, tags });
export function mealPlan(startWd = 'MON', target = null, restricted = ['TUE', 'THU', 'SAT']) {
  const days = [];
  const wds = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const s0 = wds.indexOf(startWd);
  for (let d = 1; d <= 14; d++) {
    const wd = wds[(s0 + d - 1) % 7];
    const eggOk = !restricted.includes(wd);
    const meals = [
      eggOk ? meal('breakfast', '08:30', 'Masala omelette with toast', 420, 26, 40, 17, ['egg']) : meal('breakfast', '08:30', 'Idli with sambar and sprouts', 420, 20, 66, 8),
      meal('lunch', '13:00', 'Dal, ragi mudde and beans palya', 560, 26, 80, 15),
      meal('snack', '17:00', 'Roasted chana and buttermilk', 230, 14, 28, 6),
      { ...meal('dinner', '19:30', 'Paneer tikka with 2 phulkas and salad', 520, 36, 40, 22, ['veg', 'dairy']),
        alternatives: [meal('dinner', '19:30', 'Soya chunk pulao with raita', 520, 34, 62, 14, ['veg', 'dairy']), meal('dinner', '19:30', 'Rajma with brown rice', 520, 30, 70, 12)] },
    ];
    if (target) {
      // Top up the snack so each day lands on the requested targets.
      const kcal = meals.reduce((a, m) => a + m.est.kcal, 0), prot = meals.reduce((a, m) => a + m.est.proteinG, 0);
      const snack = meals[2].est;
      snack.kcal += target.kcal - kcal;
      snack.proteinG += Math.max(0, target.proteinGMin - prot + 2);
      if (snack.kcal < 80) snack.kcal = 80;
    }
    days.push({ cycleDay: d, weekday: wd, meals });
  }
  return { schemaVersion: '1.0', type: 'meal_plan', cycleLengthDays: 14, cycleStartWeekday: startWd, eatingWindow: { start: '08:00', end: '20:30' }, dailyTargets: { proteinGMin: 95, kcal: 1730 }, fixedMeals: [], days };
}
