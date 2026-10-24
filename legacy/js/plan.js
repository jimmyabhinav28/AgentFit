// The training and food plan. Everything the app shows comes from here.
// Edit this file to rename exercises, change ladders or swap dinners.

// ---------- helpers ----------
const kg = (from, to, step = 2) => {
  const out = [];
  for (let v = from; v <= to; v += step) out.push({ load: `${v} kg`, value: v });
  return out;
};
const seconds = (from, to, step) => {
  const out = [];
  for (let v = from; v <= to; v += step) out.push({ load: fmtSec(v), value: v });
  if (out[out.length - 1].value !== to) out.push({ load: fmtSec(to), value: to });
  return out;
};
export function fmtSec(s) {
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}
const labels = (...names) => names.map(n => ({ load: n }));

// Four-week schemes. Each entry: what the week asks for, and the mood note.
export const NOTES = [
  { text: 'Likelihood of DOMS', mood: 'doms' },
  { text: 'Start getting accustomed', mood: 'accustom' },
  { text: 'Get in the flow', mood: 'flow' },
  { text: 'End of level', mood: 'end' },
];
export const SCHEMES = {
  reps:  ['4 × 10', '3 × 12', '4 × 12', '4 × 15'],
  holds: ['3 holds', '4 holds', '4 holds, shorter rest', '5 holds'],
  sprint:['4 reps', '5 reps', '6 reps', '8 reps'],
  jog:   ['easy, walk breaks allowed', 'easy, continuous', 'steady pace', 'steady, last 500 m at 10 km/h'],
  combo: ['sprint easy, jog with walk breaks', 'sprint firm, jog continuous', 'sprint hard, jog steady', 'full effort, jog at 10 km/h'],
  band:  ['3 × 8 draws, 3 s hold', '3 × 10 draws, 3 s hold', '4 × 10 draws, 4 s hold', '4 × 12 draws, 5 s hold'],
};

// ---------- exercises ----------
// type: reps | holds | sprint | jog | combo | band | checklist
// levels: the ladder, first entry is the starting level
// target: human text of the end state
export const EXERCISES = {
  floor_press: { name: 'Dumbbell floor press', type: 'reps', levels: kg(22, 40), target: '40 kg in each hand', unit: 'per hand', color: '#1E7A52',
    how: 'Lie on the mat, dumbbells at chest, press up until arms are straight, lower until the upper arms touch the floor.' },
  pushups: { name: 'Push-ups', type: 'reps', levels: labels('Knee push-ups', 'Full push-ups', 'Feet-elevated push-ups'), target: '25 full push-ups in one go', color: '#2A7DE1',
    how: 'Hands under shoulders, body in one line. Chest to a fist’s height from the floor, then press back up.' },
  curls: { name: 'Bicep curls', type: 'reps', levels: kg(10, 26), target: '25 kg in each hand', unit: 'per hand', color: '#5B3FD1',
    how: 'Elbows pinned to your sides, curl up without swinging, lower slowly.' },
  kickbacks: { name: 'Triceps kickbacks', type: 'reps', levels: kg(8, 16), target: '15 kg in each hand', unit: 'per hand', color: '#D6336C',
    how: 'Hinge forward, upper arm parallel to the floor and still; straighten the elbow fully and squeeze.' },
  row: { name: 'Single-arm dumbbell row', type: 'reps', levels: kg(26, 40), target: '40 kg, the heaviest dumbbell you own', unit: 'per hand', color: '#0F8B8D',
    how: 'One hand on your knee or a chair, pull the dumbbell to your hip, elbow close to the body. This builds the pulling strength for pull-ups.' },
  ohp: { name: 'Dumbbell overhead press', type: 'reps', levels: kg(10, 26), target: '26 kg in each hand', unit: 'per hand', color: '#E07B14',
    how: 'Standing or seated, press from shoulders to straight arms overhead without arching the lower back.' },
  pullover: { name: 'Dumbbell pullover', type: 'reps', levels: kg(10, 30), target: '30 kg', color: '#0F8B8D',
    how: 'Lie on the mat holding one dumbbell over the chest with both hands, lower it in an arc behind your head, pull it back with the lats.' },
  farmer: { name: 'Farmer’s hold', type: 'holds', levels: kg(20, 40), target: 'two 40 kg dumbbells for 45 s holds', unit: 'per hand', hold: '30 to 45 s', color: '#5B3FD1',
    how: 'Stand tall with a dumbbell in each hand, shoulders back, grip hard. Grip strength for pull-ups.' },
  bow_draw: { name: 'Band bow-draw holds', type: 'band', levels: labels('Light band', 'Medium band', 'Heavy band', 'Two bands', 'Two heavy bands'), target: 'the heaviest band pair you own, 60 clean draws', color: '#5B3FD1',
    how: 'Hold the band like a bow: front arm straight, draw to the corner of your mouth with the back elbow high, hold, release slowly. Alternate sides.' },
  pull_aparts: { name: 'Band pull-aparts and face pulls', type: 'reps', levels: labels('Light band', 'Medium band', 'Heavy band', 'Two bands'), target: 'the heaviest band, 4 × 15', color: '#2A7DE1',
    how: 'Arms straight in front, pull the band apart to your chest. Alternate sets with face pulls to the forehead, elbows high.' },
  wall_sit: { name: 'Wall sit', type: 'holds', levels: seconds(30, 180, 15), target: '3 minutes', color: '#D6336C',
    how: 'Back flat on the wall, thighs parallel to the floor, knees over ankles.' },
  squats: { name: 'Squats', type: 'reps', levels: [{ load: 'Bodyweight' }, ...kg(4, 16).map(l => ({ load: `Goblet ${l.load}` }))], target: 'goblet squats with 16 kg, 4 × 15', color: '#E07B14',
    how: 'Feet shoulder width, sit down between your heels, chest up, stand tall. Once you hold a dumbbell, keep it at your chest.' },
  plank: { name: 'Plank', type: 'holds', levels: seconds(30, 360, 30), target: '6 minutes', color: '#1E7A52',
    how: 'Forearms down, body in one line, glutes squeezed. Breathe.' },
  hollow: { name: 'Hollow hold', type: 'holds', levels: seconds(15, 60, 10), target: '60 s', color: '#5B3FD1',
    how: 'On your back, lower back pressed into the mat, shoulders and legs lifted a few inches.' },
  side_plank: { name: 'Side plank', type: 'holds', levels: seconds(20, 90, 15), target: '90 s per side', unit: 'per side', color: '#2A7DE1',
    how: 'Elbow under the shoulder, hips lifted and stacked. Each hold is done on both sides.' },
  leg_raises: { name: 'Leg raises', type: 'reps', levels: labels('Bent-knee', 'Straight-leg', 'Straight-leg, slow lowering'), target: 'straight-leg raises, 4 × 15, slow', color: '#D6336C',
    how: 'On your back, hands under hips, lift the legs to vertical and lower without letting the lower back arch.' },
  sprints: { name: 'Sprint intervals', type: 'sprint', levels: [100, 150, 200, 250, 300, 350, 400].map(m => ({ load: `${m} m reps`, value: m })), target: '400 m at 22 km/h', color: '#2A7DE1',
    how: 'Warm up with 5 minutes of jogging and drills: high knees, A-skips, leg swings. Then the reps at hard effort, walking back as recovery.' },
  jog: { name: 'Steady jog', type: 'jog', levels: [1, 1.5, 2, 2.5, 3, 3.5, 4].map(k => ({ load: `${k} km`, value: k })), target: '4 km with the last part at 10 km/h', color: '#1E7A52',
    how: 'Start with 3 minutes of brisk walking, then run the distance. Nose breathing pace in the early weeks.' },
  combo: { name: 'Sprint then jog', type: 'combo', levels: [[100, 0.5], [150, 0.75], [200, 1], [250, 1.25], [300, 1.5], [350, 1.75], [400, 2]].map(([m, k]) => ({ load: `${m} m + ${k} km`, value: m })), target: '400 m sprint at 22 km/h, then 2 km at 10 km/h', color: '#E07B14',
    how: 'Warm up as on sprint day. One sprint of the listed distance, straight into the jog without stopping.' },
  // Monday checklist, no levels
  mon_1: { name: 'Cat-cow and thoracic rotations', type: 'checklist', how: '10 slow cat-cows, then 8 thoracic rotations each side on all fours.' },
  mon_2: { name: 'Hip flexor and hamstring stretches', type: 'checklist', how: 'Half-kneeling hip flexor stretch 45 s each side, then a seated hamstring stretch 45 s each side.' },
  mon_3: { name: 'Band shoulder dislocates and light pull-aparts', type: 'checklist', how: '2 × 10 dislocates with a light band held wide, 2 × 15 easy pull-aparts.' },
  mon_4: { name: 'Calf and ankle mobility', type: 'checklist', how: 'Wall calf stretch 45 s each side, 10 ankle circles each way, 10 knee-to-wall reaches each side.' },
  mon_5: { name: '20-minute easy walk', type: 'checklist', how: 'Outside if you can. Conversation pace.' },
};

// ---------- week layout (0 = Monday) ----------
export const DAYS = [
  { name: 'Monday', short: 'M', kind: 'stretch', title: 'Light and stretching', exercises: ['mon_1', 'mon_2', 'mon_3', 'mon_4', 'mon_5'] },
  { name: 'Tuesday', short: 'T', kind: 'cardio', title: 'Sprint day', exercises: ['sprints', 'wall_sit', 'squats', 'plank', 'hollow'] },
  { name: 'Wednesday', short: 'W', kind: 'weights', title: 'Push and arms', exercises: ['floor_press', 'pushups', 'curls', 'kickbacks', 'row'] },
  { name: 'Thursday', short: 'T', kind: 'cardio', title: 'Jog day', exercises: ['jog', 'wall_sit', 'squats', 'plank', 'side_plank'] },
  { name: 'Friday', short: 'F', kind: 'weights', title: 'Pull', exercises: ['row', 'bow_draw', 'pull_aparts', 'farmer', 'pullover'] },
  { name: 'Saturday', short: 'S', kind: 'cardio', title: 'Combo run', exercises: ['combo', 'wall_sit', 'squats', 'plank', 'leg_raises'] },
  { name: 'Sunday', short: 'S', kind: 'weights', title: 'Push and arms', exercises: ['floor_press', 'pushups', 'curls', 'kickbacks', 'ohp'] },
];
export const KIND_COLOR = { stretch: '#5B3FD1', cardio: '#2A7DE1', weights: '#1E7A52' };

export const GROUPS = [
  { title: 'Strength', color: '#1E7A52', ids: ['floor_press', 'pushups', 'curls', 'kickbacks', 'row', 'ohp', 'pullover', 'farmer'] },
  { title: 'Core and legs', color: '#D6336C', ids: ['plank', 'hollow', 'side_plank', 'leg_raises', 'wall_sit', 'squats'] },
  { title: 'Running', color: '#2A7DE1', ids: ['sprints', 'jog', 'combo'] },
  { title: 'Archery', color: '#5B3FD1', ids: ['bow_draw', 'pull_aparts'] },
];

// What a given exercise asks for at a level and week (1-4).
export function prescription(id, level, week) {
  const ex = EXERCISES[id];
  const lv = ex.levels[level - 1];
  const w = week - 1;
  switch (ex.type) {
    case 'reps': return `${lv.load}, ${SCHEMES.reps[w]}`;
    case 'holds': return `${lv.load}, ${SCHEMES.holds[w]}`;
    case 'band': return `${lv.load}, ${SCHEMES.band[w]}`;
    case 'sprint': return `${lv.load}, ${SCHEMES.sprint[w]}`;
    case 'jog': return `${lv.load}, ${SCHEMES.jog[w]}`;
    case 'combo': return `${lv.load}, ${SCHEMES.combo[w]}`;
    default: return '';
  }
}

// Plain-English explanation of the whole month for the tooltip.
export function monthStory(id, level, week) {
  const ex = EXERCISES[id];
  const lv = ex.levels[level - 1];
  const next = ex.levels[level];
  const last = level >= ex.levels.length;
  const s = SCHEMES[ex.type === 'holds' ? 'holds' : ex.type === 'band' ? 'band' : ex.type === 'sprint' ? 'sprint' : ex.type === 'jog' ? 'jog' : ex.type === 'combo' ? 'combo' : 'reps'];
  const unit = ex.unit ? ` ${ex.unit}` : '';
  const intro = {
    reps: `This month ${ex.name.toLowerCase()} are at ${lv.load}${unit}.`,
    holds: `This month each ${ex.name.toLowerCase()} is ${lv.load}${unit}${ex.hold ? ` (holds of ${ex.hold})` : ''}.`,
    band: `This month you draw with the ${lv.load.toLowerCase()}.`,
    sprint: `This month every sprint rep is ${lv.load}.`,
    jog: `This month the jog is ${lv.load}.`,
    combo: `This month it is a ${lv.load} jog, back to back.`,
  }[ex.type];
  const weeks = [
    `Week 1 is ${s[0]}, the adjustment week, so expect some soreness the day after.`,
    `Week 2 eases to ${s[1]} while your body settles in.`,
    `Week 3 is ${s[2]} and should start to feel smooth.`,
    `Week 4 is ${s[3]}, the hardest week and the end of this level.`,
  ];
  const now = `You are in week ${week} now.`;
  const after = last
    ? `This is the top of the ladder: ${ex.target}. From here the month just repeats to keep you there.`
    : `Clear week 4 and next month moves you up to ${next.load.toLowerCase()}${unit}, on the way to ${ex.target}.`;
  return `${intro} ${weeks.join(' ')} ${now} ${after} ${ex.how}`;
}

// ---------- food ----------
export const FIXED_MEALS = [
  { id: 'breakfast', slot: 'Breakfast, 11:00', name: 'Greek yogurt bowl with whey, and a banana', kcal: 454, protein: 45, color: '#1E7A52',
    detail: '200 g Greek yogurt, 1 scoop whey, 5 g psyllium husk, 80 g pomegranate, 6 blueberries, 1 banana' },
  { id: 'lunch', slot: 'Lunch, 14:00', name: '6 chapatis, protein flour blend', kcal: 553, protein: 49, color: '#2A7DE1',
    detail: '147 g dry blend: whole wheat, pea protein, soy flour, besan' },
  { id: 'snack', slot: 'Snack, 17:00', name: 'Trail mix', kcalPerGram: 5.38, proteinPerGram: 0.169, color: '#E07B14',
    detail: 'Almond, amla candy, pumpkin seed, cashew, Brazil nut, sunflower seed, walnut, watermelon seed, raisin' },
];

// Dinners by weekday (0 = Monday). egg: whether eggs are allowed that day.
export const DINNERS = [
  { egg: true, main: { name: 'Egg roll', detail: '2 atta chapatis, 3 whole eggs + 2 whites, onion, capsicum, mint chutney, 1 tsp oil; 150 g curd', kcal: 630, protein: 40, carbs: 50, fat: 22, fibre: 7 } },
  { egg: false, main: { name: 'Soya pulav', detail: '50 g dry soya chunks, 150 g cooked rice, 100 g peas, carrot and beans, 1 tbsp ghee; 150 g Greek yogurt raita', kcal: 660, protein: 48, carbs: 72, fat: 18, fibre: 10 } },
  { egg: true, main: { name: 'Boiled eggs and sweet potato', detail: '4 whole eggs + 2 whites, 250 g roasted sweet potato, salad with 1 tsp olive oil, 150 g curd', kcal: 690, protein: 41, carbs: 60, fat: 25, fibre: 10 } },
  { egg: false, main: { name: 'Sattu paratha', detail: '2 atta parathas stuffed with 70 g sattu, onion, chilli, ajwain; 2 tsp ghee; 200 g Greek yogurt; salad', kcal: 720, protein: 41, carbs: 93, fat: 17, fibre: 20 } },
  { egg: true, main: { name: 'Egg chowmein', detail: '80 g whole-wheat noodles, 4 eggs + 2 whites, 150 g cabbage, capsicum, carrot, spring onion, 1 tbsp oil', kcal: 770, protein: 44, carbs: 60, fat: 32, fibre: 9 } },
  { egg: false, main: { name: 'Paneer roll', detail: '2 atta chapatis, 120 g paneer tikka, onion, capsicum, mint chutney, 1 tsp oil; 150 g Greek yogurt raita', kcal: 720, protein: 45, carbs: 50, fat: 29, fibre: 7 } },
  { egg: true, main: { name: 'Aloo paratha and omelette', detail: '2 atta aloo parathas (150 g potato filling), 2 tsp ghee, omelette of 3 eggs + 2 whites, 150 g curd, pickle', kcal: 750, protein: 41, carbs: 72, fat: 27, fibre: 9 } },
];
export const SWAPS = {
  egg: [
    { name: 'Omelette with chapatis', detail: 'Omelette of 3 eggs + 2 whites, 2 atta chapatis, 1 tsp oil, 150 g curd', kcal: 590, protein: 38, carbs: 48, fat: 21, fibre: 7 },
    { name: 'Egg chowmein', detail: '80 g whole-wheat noodles, 4 eggs + 2 whites, 150 g mixed veg, 1 tbsp oil', kcal: 770, protein: 44, carbs: 60, fat: 32, fibre: 9 },
    { name: 'Boiled eggs and sweet potato', detail: '4 whole eggs + 2 whites, 250 g roasted sweet potato, salad, 150 g curd', kcal: 690, protein: 41, carbs: 60, fat: 25, fibre: 10 },
  ],
  noegg: [
    { name: 'Veg chowmein with soya', detail: '80 g whole-wheat noodles, 50 g dry soya chunks, 150 g mixed veg, 1 tbsp oil', kcal: 660, protein: 39, carbs: 70, fat: 18, fibre: 8 },
    { name: 'Veg chowmein with paneer', detail: '80 g whole-wheat noodles, 100 g paneer, 150 g mixed veg, 1 tbsp oil', kcal: 720, protein: 32, carbs: 62, fat: 30, fibre: 7 },
    { name: 'Soya pulav', detail: '50 g dry soya chunks, 150 g rice, 100 g veg, 1 tbsp ghee; 150 g Greek yogurt raita', kcal: 660, protein: 48, carbs: 72, fat: 18, fibre: 10 },
  ],
};

export const DEFAULT_SETTINGS = {
  age: 30, sex: 'male', weightKg: 90, heightCm: 173, activity: 1.45, deficit: 200,
  proteinTarget: 100, trailMixGrams: 50, eatingWindow: '11:00 to 20:00',
  aiProvider: 'none', aiKey: '', aiModel: '',
};

export function calorieTarget(s) {
  const bmr = 10 * s.weightKg + 6.25 * s.heightCm - 5 * s.age + (s.sex === 'female' ? -161 : 5);
  return Math.round(bmr * s.activity - s.deficit);
}
