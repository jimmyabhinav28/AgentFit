// Merging this device's data with the copy in Google Drive.
// Every record carries a timestamp, so two devices never lose each other's ticks.

export function emptyDoc() {
  return {
    schema: 1,
    profile: null, profileUpdatedAt: 0,
    plans: { workout: [], meal: [] },
    exerciseState: {},      // exerciseId -> { level, sublevel, updatedAt }
    levelEvents: [],        // { id, exerciseId, from:[l,s], to:[l,s], kind, at }
    workoutLog: {},         // date -> { exerciseId -> { done, at, actual? } }
    mealLog: {},            // date -> { mealKey -> { status, swappedTo?, at } }
    paused: { workout: null, food: null }, pausedAt: { workout: 0, food: 0 },
    answers: { workout: null, food: null }, // last completed planner answers: { answers, completedAt, planVersion }
    ui: { dismissedSetup: { workout: false, food: false } }, uiAt: 0,
    settings: {}, settingsAt: 0,
    legacy: null,
    updatedAt: 0,
  };
}

const newer = (a, b, ka, kb = ka) => ((b && b[kb]) || 0) > ((a && a[ka]) || 0);

function mergeVersions(a = [], b = []) {
  const by = new Map();
  for (const v of [...a, ...b]) {
    const cur = by.get(v.version);
    if (!cur || (v.acceptedAt || '') > (cur.acceptedAt || '')) by.set(v.version, v);
  }
  return [...by.values()].sort((x, y) => x.version - y.version);
}
function mergeStamped(a = {}, b = {}, key = 'at') {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) if (!out[k] || (v && (v[key] || 0) > (out[k][key] || 0))) out[k] = v;
  return out;
}
function mergeDayLogs(a = {}, b = {}) {
  const out = {};
  for (const date of new Set([...Object.keys(a), ...Object.keys(b)])) out[date] = mergeStamped(a[date], b[date]);
  return out;
}

export function mergeDocs(a, b) {
  if (!a) return b; if (!b) return a;
  const out = { ...emptyDoc(), ...a };
  if (newer(a, b, 'profileUpdatedAt')) { out.profile = b.profile; out.profileUpdatedAt = b.profileUpdatedAt; }
  out.plans = { workout: mergeVersions(a.plans?.workout, b.plans?.workout), meal: mergeVersions(a.plans?.meal, b.plans?.meal) };
  out.exerciseState = mergeStamped(a.exerciseState, b.exerciseState, 'updatedAt');
  const ev = new Map();
  for (const e of [...(a.levelEvents || []), ...(b.levelEvents || [])]) ev.set(e.id, e);
  out.levelEvents = [...ev.values()].sort((x, y) => x.at - y.at);
  out.workoutLog = mergeDayLogs(a.workoutLog, b.workoutLog);
  out.mealLog = mergeDayLogs(a.mealLog, b.mealLog);
  out.paused = { ...(a.paused || {}) }; out.pausedAt = { ...(a.pausedAt || {}) };
  for (const t of ['workout', 'food']) if (((b.pausedAt || {})[t] || 0) > ((a.pausedAt || {})[t] || 0)) { out.paused[t] = b.paused[t]; out.pausedAt[t] = b.pausedAt[t]; }
  out.answers = { ...(a.answers || {}) };
  for (const t of ['workout', 'food']) { const x = (a.answers || {})[t], y = (b.answers || {})[t]; if (y && (!x || (y.completedAt || 0) > (x.completedAt || 0))) out.answers[t] = y; }
  if (newer(a, b, 'uiAt')) { out.ui = b.ui; out.uiAt = b.uiAt; }
  if (newer(a, b, 'settingsAt')) { out.settings = b.settings; out.settingsAt = b.settingsAt; }
  out.legacy = a.legacy || b.legacy || null;
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return out;
}
