// What the user has, and whether an exercise or a load fits it (FR-PLAN-04).

// Requirement tokens used by the exercise library.
export const GYM_PROVIDES = ['dumbbell', 'kettlebell', 'barbell', 'band', 'pullup_bar', 'bench', 'mat', 'rope', 'treadmill', 'cycle', 'rower', 'gym_machine', 'cable'];

export function emptyTraining() {
  return {
    where: [],               // 'home' | 'gym' | 'outdoors'
    gymType: '',             // 'commercial' | 'society' | 'box'
    gymDaysPerWeek: null,
    gymWeekdays: [],         // when training at both
    equipment: {},           // see describeEquipment
    facilities: {},          // park_track, stairs, pool, cycle_route
    otherEquipment: '',
  };
}

// Tokens available on a given set of weekdays.
export function availableTokens(training = {}, days = null) {
  const eq = training.equipment || {};
  const fac = training.facilities || {};
  const t = new Set(['none', 'mat']); // a towel on the floor works as a mat
  if (eq.dumbbells_adjustable || (eq.dumbbells_fixed && (eq.dumbbells_fixed.weights || []).length)) t.add('dumbbell');
  if (eq.kettlebell) t.add('kettlebell');
  if (eq.barbell) t.add('barbell');
  if (eq.bands) t.add('band');
  if (eq.pullup_bar) t.add('pullup_bar');
  if (eq.bench) t.add('bench');
  if (eq.mat) t.add('mat');
  if (eq.rope) t.add('rope');
  for (const c of eq.cardio || []) t.add(c);
  if (eq.bow) t.add('bow');
  if (fac.park_track || (training.where || []).includes('outdoors')) t.add('track');
  if (fac.stairs) t.add('stairs');
  if (fac.pool) t.add('pool');
  if (fac.cycle_route) t.add('cycle_route');
  if (gymApplies(training, days)) GYM_PROVIDES.forEach(x => t.add(x));
  // Free text such as "a 16 kg kettlebell, a recurve bow"
  const other = (training.otherEquipment || '').toLowerCase();
  if (/\bbow\b|archery/.test(other)) t.add('bow');
  if (/kettlebell/.test(other)) t.add('kettlebell');
  if (/pull-?up bar|chin-?up bar/.test(other)) t.add('pullup_bar');
  if (/bench/.test(other)) t.add('bench');
  if (/barbell/.test(other)) t.add('barbell');
  return t;
}

function gymApplies(training, days) {
  const where = training.where || [];
  if (!where.includes('gym')) return false;
  if (!where.includes('home')) return true;
  const gymDays = training.gymWeekdays || [];
  if (!gymDays.length || !days) return true;
  return days.every(d => gymDays.includes(d));
}

export function missingEquipment(requirements = [], training, days) {
  const have = availableTokens(training, days);
  return requirements.filter(r => r !== 'none' && !have.has(r));
}

// Allowed loads for a load unit, or null when anything goes (e.g. at a gym).
export function allowedLoads(requirements = [], training = {}, days = null) {
  const eq = training.equipment || {};
  if (gymApplies(training, days)) return null;
  const set = new Set();
  if (requirements.includes('dumbbell')) {
    const a = eq.dumbbells_adjustable;
    if (a && a.step > 0) for (let v = a.min; v <= a.max + 1e-9; v += a.step) set.add(round(v));
    for (const w of (eq.dumbbells_fixed && eq.dumbbells_fixed.weights) || []) set.add(round(w));
  }
  if (requirements.includes('kettlebell')) {
    for (const w of (eq.kettlebell && eq.kettlebell.weights) || []) set.add(round(w));
    if (!(eq.kettlebell && (eq.kettlebell.weights || []).length)) return null; // weight unknown
  }
  if (requirements.includes('barbell')) {
    const max = (eq.barbell && eq.barbell.maxKg) || 0;
    for (let v = 20; v <= max; v += 2.5) set.add(round(v));
    if (!max) return null;
  }
  return set.size ? [...set].sort((x, y) => x - y) : null;
}
const round = v => Math.round(v * 100) / 100;

export function describeEquipment(training = {}) {
  const eq = training.equipment || {};
  const out = [];
  if (eq.dumbbells_adjustable) { const a = eq.dumbbells_adjustable; out.push(`adjustable dumbbells ${a.min}–${a.max} kg in ${a.step} kg steps`); }
  if (eq.dumbbells_fixed && (eq.dumbbells_fixed.weights || []).length) out.push(`fixed dumbbells (${eq.dumbbells_fixed.weights.join(', ')} kg)`);
  if (eq.kettlebell) out.push(`kettlebell${(eq.kettlebell.weights || []).length ? ` (${eq.kettlebell.weights.join(', ')} kg)` : ''}`);
  if (eq.barbell) out.push(`barbell and plates${eq.barbell.maxKg ? ` up to ${eq.barbell.maxKg} kg` : ''}`);
  if (eq.bands) out.push(`resistance bands (${(eq.bands.levels || []).join(', ') || 'unspecified'})`);
  if (eq.pullup_bar) out.push('pull-up bar');
  if (eq.bench) out.push(`${eq.bench === true ? '' : eq.bench + ' '}bench`.trim());
  if (eq.mat) out.push('yoga mat');
  if (eq.rope) out.push('skipping rope');
  for (const c of eq.cardio || []) out.push(c);
  if (eq.bow) out.push('bow');
  if (eq.bodyweight_only) out.push('bodyweight only');
  if (training.otherEquipment) out.push(training.otherEquipment);
  const fac = training.facilities || {};
  const nearby = [fac.park_track && 'park or track', fac.stairs && 'stairs', fac.pool && 'pool', fac.cycle_route && 'safe cycling route'].filter(Boolean);
  const where = (training.where || []).join(' and ') || 'not stated';
  return `Trains at: ${where}${training.gymType ? ` (${training.gymType} gym)` : ''}${(training.gymWeekdays || []).length ? `; gym days ${training.gymWeekdays.join(', ')}` : ''}. Home equipment: ${out.join('; ') || 'none'}. Nearby: ${nearby.join(', ') || 'none'}.`;
}
