// Weak / Average / Good / Elite ratings against age and gender norms (Journey step 5b).
export const RATINGS = ['Weak', 'Average', 'Good', 'Elite'];
export const AREAS = [
  { id: 'upper', label: 'Upper body' },
  { id: 'lower', label: 'Lower body' },
  { id: 'core', label: 'Core' },
  { id: 'back', label: 'Back / pull' },
  { id: 'mobility', label: 'Mobility' },
  { id: 'aerobic', label: 'Aerobic' },
];

function bandFor(table, age) {
  return table.find(b => age <= b.ageMax) || table[table.length - 1];
}

// value is the measured quantity (reps, seconds, minutes). Returns 0..3.
export function rateValue(norms, area, value, age, gender) {
  const a = norms && norms.areas && norms.areas[area];
  if (!a || value == null) return null;
  if (a.direct) return Math.max(0, Math.min(3, value));
  const g = gender === 'female' ? 'female' : gender === 'male' ? 'male' : 'other';
  const table = a.bands[g] || a.bands.male;
  const [avg, good, elite] = bandFor(table, age).cuts;
  if (value >= elite) return 3;
  if (value >= good) return 2;
  if (value >= avg) return 1;
  return 0;
}

export function assess(norms, answers, { age, gender }) {
  const areas = {};
  let sum = 0, n = 0;
  for (const { id } of AREAS) {
    const ans = answers[id];
    const r = ans ? rateValue(norms, id, ans.value, age, gender) : null;
    if (r != null) { areas[id] = r; sum += r; n++; }
  }
  const overall = n ? Math.round(sum / n) : 1;
  return { areas, overall };
}
