// Calorie and protein targets and safety floors (FR-PLAN-05).
import { ageOn } from './dates.js';

const ACTIVITY = [[0, 1.3], [1, 1.375], [3, 1.465], [5, 1.55]];

export function bmr({ weightKg, heightCm, age, gender }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (gender === 'male') return base + 5;
  if (gender === 'female') return base - 161;
  return base - 78;
}

// Weight used for protein when BMI is high, so targets stay realistic.
export function referenceWeight({ weightKg, heightCm }) {
  const h = heightCm / 100;
  const bmi = weightKg / (h * h);
  return bmi > 30 ? Math.round(27 * h * h) : weightKg;
}

export function calorieFloor(gender) {
  return gender === 'male' ? 1500 : gender === 'female' ? 1200 : 1350;
}

export function targets(profile, { today, trainingDaysPerWeek = 3 } = {}) {
  const b = profile.body || {};
  if (!b.weightKg || !b.heightCm || !b.dob) return null;
  const age = ageOn(b.dob, today);
  const basal = bmr({ weightKg: b.weightKg, heightCm: b.heightCm, age, gender: b.gender });
  let factor = ACTIVITY[0][1];
  for (const [d, f] of ACTIVITY) if (trainingDaysPerWeek >= d) factor = f;
  const maintenance = Math.round(basal * factor);
  const food = profile.food || {};
  const intent = food.calorieIntent || 'maintain';
  const defaultDelta = intent === 'lose' ? -300 : intent === 'gain' ? 250 : 0;
  const delta = Number.isFinite(food.calorieDeltaKcal) ? food.calorieDeltaKcal : defaultDelta;
  const floor = calorieFloor(b.gender);
  const kcal = Math.max(floor, Math.round((maintenance + delta) / 10) * 10);
  const refW = referenceWeight(b);
  const purpose = (profile.purpose && profile.purpose.kind) || 'general';
  const perKg = intent === 'gain' || purpose === 'strength' ? 1.6 : 1.2;
  const proteinDefault = Math.round(refW * perKg / 5) * 5;
  const protein = Number.isFinite(food.proteinGMin) && food.proteinGMin > 0 ? food.proteinGMin : proteinDefault;
  return {
    maintenanceKcal: maintenance,
    calorieDeltaKcal: delta,
    kcal,
    proteinGMin: Math.max(protein, Math.round(refW * 0.8)),
    kcalFloor: floor,
    proteinFloor: Math.round(refW * 0.8),
  };
}
