// Plan-generation evals (§12.3, NFR-09). Runs varied personas through the real
// Journey endpoints against a running Worker and reports whether each plan
// validated, how long it took and what it cost.
//
//   1. npm run dev  (with DEV_AUTH=1 and a real PLATFORM_API_KEY in .dev.vars)
//   2. node tools/eval.js [baseUrl] [--provider anthropic --model claude-haiku-5-5 --key sk-...]
//
// A model joins the allowlist only if every persona passes.
const args = process.argv.slice(2);
const base = args.find(a => a.startsWith('http')) || 'http://127.0.0.1:8787';
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
const byok = opt('key') ? { provider: opt('provider') || 'anthropic', model: opt('model') } : {};

const body = (dob, gender, h, w) => ({ dob, gender, heightCm: h, weightKg: w });
const db = (min, max, step) => ({ dumbbells_adjustable: { min, max, step } });
const PERSONAS = [
  { id: 'beginner-bodyweight', profile: { body: body('1998-02-01', 'female', 160, 62), location: { country: 'India', city: 'Pune', region: 'west' }, purpose: { kind: 'general' }, training: { where: ['home'], equipment: { bodyweight_only: true }, facilities: {} }, schedule: { frequency: 'few', days: ['MON', 'WED', 'FRI'], sessionMinutes: 30 }, food: { dietType: 'vegetarian', eatingWindow: { start: '08:00', end: '21:00' }, whoCooks: 'family', likes: ['Poha', 'Dal tadka'], dislikes: ['Karela'], calorieIntent: 'lose' } },
    assessment: { areas: { upper: 0, back: 0, lower: 1, core: 0, mobility: 1, aerobic: 0 }, overall: 0 }, goal: { title: 'Move every day', items: ['10 push-ups', '1-minute plank'], weeks: 8 } },
  { id: 'eggetarian-dumbbells', profile: { body: body('1993-05-10', 'male', 173, 90), location: { country: 'India', city: 'Bengaluru', region: 'south' }, purpose: { kind: 'strength' }, training: { where: ['home'], equipment: { ...db(2, 40, 2), bands: { levels: ['light', 'medium', 'heavy'] }, mat: true }, facilities: { park_track: true } }, schedule: { frequency: 'daily', days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], sessionMinutes: 60 }, injuries: 'none',
    food: { dietType: 'eggetarian', restrictedDays: ['TUE', 'THU', 'SAT'], eatingWindow: { start: '11:00', end: '20:00' }, whoCooks: 'self', cookingMinutes: 30, proteinGMin: 100, calorieDeltaKcal: -200, fixedMealsText: 'Breakfast 11:00: 200 g Greek yogurt, 1 scoop whey, 80 g pomegranate, 1 banana. Lunch: 6 chapatis of a wheat, pea-protein, soy and besan blend.', dislikes: [] } },
    assessment: { areas: { upper: 0, back: 0, lower: 1, core: 0, mobility: 1, aerobic: 1 }, overall: 0 }, goal: { title: 'Stronger upper body and core', items: ['25 push-ups', '25 kg curls', '6-minute plank'], weeks: 16 } },
  { id: 'gym-both', profile: { body: body('1988-11-20', 'male', 180, 78), location: { country: 'India', city: 'Gurugram', region: 'north' }, purpose: { kind: 'strength' }, training: { where: ['home', 'gym'], gymType: 'commercial', gymWeekdays: ['MON', 'THU'], equipment: { bands: { levels: ['medium'] } }, facilities: {} }, schedule: { frequency: 'few', days: ['MON', 'TUE', 'THU', 'SAT'], sessionMinutes: 60 },
    food: { dietType: 'nonveg', restrictedDays: ['TUE'], eatingWindow: { start: '07:30', end: '21:30' }, whoCooks: 'cook', likes: ['Chicken tikka', 'Rajma'], dislikes: ['Mutton curry'], calorieIntent: 'gain' } },
    assessment: { areas: { upper: 2, back: 1, lower: 2, core: 1, mobility: 1, aerobic: 1 }, overall: 1 }, goal: { title: 'First 10 pull-ups', items: ['10 pull-ups'], weeks: 16 } },
  { id: 'runner-vegan', profile: { body: body('1995-07-07', 'female', 168, 57), location: { country: 'United Kingdom', city: 'Leeds' }, purpose: { kind: 'endurance' }, training: { where: ['outdoors'], equipment: {}, facilities: { park_track: true } }, schedule: { frequency: 'few', days: ['TUE', 'THU', 'SUN'], sessionMinutes: 45 },
    food: { dietType: 'vegan', eatingWindow: { start: '07:00', end: '20:00' }, whoCooks: 'self', cookingMinutes: 15, allergies: 'peanuts', calorieIntent: 'maintain' } },
    assessment: { areas: { lower: 2, core: 1, aerobic: 2, mobility: 2 }, overall: 2 }, goal: { title: 'Run 10 km', items: ['10 km easy'], weeks: 12 } },
  { id: 'knee-injury-jain', profile: { body: body('1975-03-03', 'female', 155, 74), location: { country: 'India', city: 'Ahmedabad', region: 'west' }, purpose: { kind: 'general' }, injuries: 'Left knee pain on stairs and deep squats', training: { where: ['home'], equipment: { bands: { levels: ['light'] }, mat: true }, facilities: {} }, schedule: { frequency: 'alternate', days: ['MON', 'WED', 'FRI', 'SUN'], sessionMinutes: 20 },
    food: { dietType: 'jain', eatingWindow: { start: '08:00', end: '18:30' }, whoCooks: 'self', cookingMinutes: 60, calorieIntent: 'lose' } },
    assessment: { areas: { upper: 0, lower: 0, core: 0, mobility: 0, aerobic: 0 }, overall: 0 }, goal: { title: 'Move more freely', items: ['Walk 30 minutes without knee pain'], weeks: 8 } },
  { id: 'archery-sprint', profile: { body: body('1993-05-10', 'male', 173, 85), location: { country: 'India', city: 'Bengaluru', region: 'south' }, purpose: { kind: 'strength', note: 'Draw a 120 lb bow, 60 shots a session; sprint 400 m above 22 km/h then jog 2 km at 10 km/h' }, training: { where: ['home', 'outdoors'], equipment: { ...db(2, 40, 2), bands: { levels: ['light', 'medium', 'heavy'] }, mat: true, bow: true }, facilities: { park_track: true } }, schedule: { frequency: 'few', days: ['MON', 'WED', 'FRI', 'SAT'], sessionMinutes: 60 },
    food: { dietType: 'eggetarian', restrictedDays: ['TUE', 'THU', 'SAT'], eatingWindow: { start: '11:00', end: '20:00' }, calorieIntent: 'lose', proteinGMin: 110 } },
    assessment: { areas: { upper: 1, back: 0, lower: 1, core: 0, aerobic: 1 }, overall: 1 }, goal: { title: 'Archery and sprint base', items: ['Hold a 50 lb draw for 10 s', '400 m at 18 km/h'], weeks: 12 } },
];

async function call(token, path, payload) {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, ...(opt('key') ? { 'x-provider-key': opt('key') } : {}) }, body: JSON.stringify({ ...payload, ...byok }) });
  if (!r.ok) return { error: (await r.json().catch(() => ({}))).error };
  const text = await r.text();
  const events = text.trim().split('\n\n').filter(Boolean).map(c => ({ ev: /event: (.*)/.exec(c)[1], data: JSON.parse(/data: (.*)/s.exec(c)[1]) }));
  return { events };
}

const today = new Date().toISOString().slice(0, 10);
const rows = [];
for (const p of PERSONAS) {
  const { token } = await (await fetch(base + '/api/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `eval-${p.id}@agentfit.local` }) })).json();
  await fetch(base + '/api/profile', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ profile: p.profile }) });
  for (const type of ['workout', 'meal']) {
    const t0 = Date.now();
    const r = await call(token, '/api/journey/plan', { type, profile: p.profile, assessment: p.assessment, goal: p.goal, context: { today, plans: {} }, cycleStartWeekday: 'MON', constraintsText: p.profile.food.fixedMealsText || '' });
    const evs = r.events || [];
    const draft = evs.find(e => e.ev === 'draft');
    const err = r.error || (evs.find(e => e.ev === 'error') || {}).data;
    const builds = evs.filter(e => e.ev === 'status' && /Building/.test(e.data.text)).length;
    const usage = (evs.find(e => e.ev === 'done') || {}).data;
    rows.push({ persona: p.id, type, pass: !!draft && builds <= 2, attempts: builds, seconds: Math.round((Date.now() - t0) / 1000), tokensOut: usage ? usage.usage.output : '', error: err ? err.code + ': ' + err.message : '' });
    console.log(rows[rows.length - 1]);
  }
}
console.table(rows);
const failed = rows.filter(r => !r.pass);
console.log(failed.length ? `${failed.length} of ${rows.length} failed — do not allowlist this model yet.` : `All ${rows.length} passed.`);
process.exit(failed.length ? 1 : 0);
