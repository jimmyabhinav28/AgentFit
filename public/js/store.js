// App state, local-first persistence (FR-TRK-01) and Drive sync (FR-TRK-02, PL-07).
import * as idb from './lib/idb.js';
import * as drive from './drive.js';
import { api, session } from './api.js';
import { emptyDoc, mergeDocs } from './core/merge.js';
import { todayIso, addDays, weekdayOf } from './core/dates.js';
import { versionOn, upcomingVersion, makeVersion, firstStartDate, stepState, clampState, mapStateToNewLadder, defaultState } from './core/plans.js';
import { targets as computeTargets } from './core/nutrition.js';

export const S = {
  ready: false,
  doc: emptyDoc(),
  session: session.get(),
  me: null,
  data: { library: {}, foods: null, norms: null, goals: null },
  ui: { date: null, expanded: { workout: true, food: false }, openCard: null, sheet: null, toast: null, bannerHidden: {}, saving: false },
  coach: { list: null, current: null, streaming: null, input: '', error: null, prefill: '' },
  online: navigator.onLine,
  sync: { state: 'idle', lastAt: 0, message: '' },
  broken: new Set(),
};

let renderFn = () => {};
let scheduled = false;
export function onRender(fn) { renderFn = fn; }
export function update() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; renderFn(); });
}
export function toast(text, ms = 2600) {
  S.ui.toast = text; update();
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { S.ui.toast = null; update(); }, ms);
}

// ---------- persistence ----------
export async function loadLocal() {
  const d = await idb.get('doc');
  S.doc = d ? { ...emptyDoc(), ...d } : emptyDoc();
  S.byok = (await idb.get('byok')) || {};
}
let syncTimer = null;
export async function saveDoc({ sync = true } = {}) {
  S.doc.updatedAt = Date.now();
  await idb.set('doc', S.doc);
  if (sync) scheduleSync();
  update();
}
export function scheduleSync(delay = 15000) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, delay);
}
export async function syncNow() {
  clearTimeout(syncTimer);
  if (!drive.configured() || S.session?.dev) { S.sync.state = 'local'; return; }
  if (!navigator.onLine) { S.sync.state = 'offline'; update(); return; }
  if (!drive.token()) { S.sync.state = 'needs-auth'; update(); return; }
  S.sync.state = 'syncing'; update();
  try {
    const remote = await drive.pullData();
    const merged = remote ? mergeDocs(S.doc, remote) : S.doc;
    S.doc = merged;
    await idb.set('doc', S.doc);
    await drive.pushData(S.doc);
    S.sync = { state: 'ok', lastAt: Date.now(), message: '' };
  } catch (e) {
    S.sync = { state: e.message === 'no-token' ? 'needs-auth' : 'error', lastAt: S.sync.lastAt, message: e.message };
  }
  update();
}
let profileTimer = null;
function pushProfileSoon() {
  clearTimeout(profileTimer);
  profileTimer = setTimeout(async () => {
    if (!S.doc.profile || !S.session) return;
    const { health, ...rest } = S.doc.profile; // HD-01: health never leaves Drive except reviewed excerpts per request
    try { await api('PUT', '/api/profile', { profile: rest }); } catch { /* retried on next change */ }
  }, 1500);
}

// ---------- static data ----------
export async function loadStatic() {
  const get = p => fetch(p).then(r => r.json());
  const [lib, foods, norms, goals] = await Promise.all([get('./data/exercises.json'), get('./data/foods.json'), get('./data/norms.json'), get('./data/goals.json')]);
  S.data = { library: Object.fromEntries(lib.exercises.map(e => [e.id, e])), foods, norms, goals };
}

// ---------- profile & settings ----------
export function profile() { return S.doc.profile || {}; }
export async function setProfile(patch) {
  S.doc.profile = { ...(S.doc.profile || {}), ...patch };
  S.doc.profileUpdatedAt = Date.now();
  await saveDoc();
  pushProfileSoon();
}
export function settings() {
  return { weekStartsOn: 'MON', units: { weight: 'kg', distance: 'km' }, ai: { mode: 'credits', provider: 'anthropic', model: '' }, theme: 'system', ...S.doc.settings };
}
export async function setSettings(patch) {
  S.doc.settings = { ...settings(), ...patch };
  S.doc.settingsAt = Date.now();
  applyTheme();
  await saveDoc();
}
export function applyTheme() {
  const t = settings().theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}

// ---------- AI credentials ----------
export function aiRequestOptions() {
  const ai = settings().ai;
  if (ai.mode === 'byok' && S.byok[ai.provider]) return { key: S.byok[ai.provider], provider: ai.provider, model: ai.model };
  return {};
}
export async function setKey(provider, key) {
  if (key) S.byok[provider] = key; else delete S.byok[provider];
  await idb.set('byok', S.byok);
  update();
}

// ---------- dates & plans ----------
export const today = () => todayIso();
export const typeKey = t => (t === 'food' || t === 'meal' ? 'meal' : 'workout');
export const versions = t => S.doc.plans[typeKey(t)] || [];
export const activeVersion = (t, date = today()) => versionOn(versions(t), date);
export const upcoming = t => upcomingVersion(versions(t), today());
export function planStart() {
  return settings().planStartDate || firstStartDate(S.doc.plans.workout, S.doc.plans.meal);
}
// active | tomorrow | paused | none  (+ dismissed for 'none')
export function sectionState(t) {
  const kind = t === 'meal' ? 'food' : t;
  if (activeVersion(kind)) return 'active';
  if (upcoming(kind)) return 'tomorrow';
  if (S.doc.paused[kind]) return 'paused';
  return 'none';
}
export function planTargets() {
  const p = profile();
  const w = activeVersion('workout') || upcoming('workout');
  const days = w ? Object.keys(w.plan.dayTypes || {}).length : (p.schedule && (p.schedule.days || []).length) || 3;
  return computeTargets(p, { today: today(), trainingDaysPerWeek: days });
}

// ---------- exercise state ----------
export function exState(ex) {
  return clampState(ex, S.doc.exerciseState[ex.exerciseId] || defaultState());
}
export async function stepExercise(ex, delta) {
  const cur = exState(ex);
  const next = stepState(ex, cur, delta);
  if (!next) return false;
  S.doc.exerciseState[ex.exerciseId] = { ...next, updatedAt: Date.now() };
  S.doc.levelEvents.push({ id: `${ex.exerciseId}-${Date.now()}`, exerciseId: ex.exerciseId, from: [cur.level, cur.sublevel], to: [next.level, next.sublevel], kind: delta > 0 ? 'progress' : 'regress', at: Date.now() });
  await saveDoc();
  return true;
}

// ---------- logging ----------
export async function toggleDone(date, ex) {
  const day = (S.doc.workoutLog[date] = S.doc.workoutLog[date] || {});
  const cur = day[ex.exerciseId];
  const st = exState(ex);
  day[ex.exerciseId] = { done: !(cur && cur.done), at: Date.now(), level: st.level, sublevel: st.sublevel };
  await saveDoc();
}
export function isDone(date, exId) { const d = S.doc.workoutLog[date]; return !!(d && d[exId] && d[exId].done); }
export function mealEntry(date, key) { const d = S.doc.mealLog[date]; return (d && d[key]) || null; }
export async function setMeal(date, key, status, extra = {}) {
  const day = (S.doc.mealLog[date] = S.doc.mealLog[date] || {});
  const cur = day[key];
  day[key] = cur && cur.status === status && !extra.swappedTo ? { status: null, at: Date.now() } : { status, ...extra, at: Date.now() };
  await saveDoc();
}

// ---------- plan versions ----------
export async function acceptDraft(draft, { messageId = null, summary } = {}) {
  const k = typeKey(draft.type);
  const hist = S.doc.plans[k];
  const prev = upcoming(k) || activeVersion(k);
  const v = makeVersion(hist, draft.plan, { today: today(), summary: summary || draft.summary || (hist.length ? 'Updated plan' : 'Initial plan') });
  hist.push(v);
  if (k === 'workout') {
    // FR-PRG-04: keep levels when a revision changes a ladder.
    const old = prev ? new Map(prev.plan.exercises.map(e => [e.exerciseId, e])) : new Map();
    for (const ex of draft.plan.exercises) {
      const st = S.doc.exerciseState[ex.exerciseId];
      if (st && old.has(ex.exerciseId)) S.doc.exerciseState[ex.exerciseId] = { ...mapStateToNewLadder(old.get(ex.exerciseId), ex, st), updatedAt: Date.now() };
      else if (!st) S.doc.exerciseState[ex.exerciseId] = { ...defaultState(), updatedAt: Date.now() };
    }
  }
  const pk = k === 'meal' ? 'food' : 'workout';
  S.doc.paused[pk] = null; S.doc.pausedAt[pk] = Date.now();
  await saveDoc();
  syncNow();
  api('POST', '/api/plans/accepted', { type: k, version: v.version, effectiveFrom: v.effectiveFrom, messageId, draftId: draft.id }).catch(() => {});
  return v;
}
export async function restoreVersion(type, version) {
  const k = typeKey(type);
  const old = S.doc.plans[k].find(v => v.version === version);
  if (!old) return null;
  const v = makeVersion(S.doc.plans[k], structuredClone(old.plan), { today: today(), summary: `Restored version ${version}` });
  S.doc.plans[k].push(v);
  await saveDoc();
  syncNow();
  return v;
}
export async function saveManualEdit(type, plan, summary) {
  const k = typeKey(type);
  const v = makeVersion(S.doc.plans[k], plan, { today: today(), summary });
  S.doc.plans[k].push(v);
  await saveDoc();
  syncNow();
  return v;
}

// ---------- paused journeys (J-07 .. J-10) ----------
export function paused(kind) { return S.doc.paused[kind] || null; }
// Saved after every planner step (J-02) and synced to the AgentFit folder in Drive.
export async function savePaused(kind, state) {
  S.doc.paused[kind] = { ...state, updatedAt: Date.now(), startedAt: state.startedAt || Date.now() };
  S.doc.pausedAt[kind] = Date.now();
  await saveDoc();
}
// Keeps the answers a plan was built from, after the planner is finished.
export async function recordAnswers(kind, answers, planVersion) {
  const clean = structuredClone(answers);
  delete clean.assessment?.notice;
  S.doc.answers = { ...(S.doc.answers || {}), [kind]: { answers: clean, completedAt: Date.now(), planVersion } };
  await saveDoc();
}
export async function abandon(kind) {
  S.doc.paused[kind] = null; S.doc.pausedAt[kind] = Date.now();
  await saveDoc();
}
export async function dismissSetup(kind, value = true) {
  S.doc.ui = { ...(S.doc.ui || {}), dismissedSetup: { ...((S.doc.ui || {}).dismissedSetup || {}), [kind]: value } };
  S.doc.uiAt = Date.now();
  await saveDoc();
}

// ---------- context the Worker needs (PL-08) ----------
export function contextBundle(screen = null) {
  const t = today();
  const pick = k => {
    const a = activeVersion(k), u = upcoming(k);
    return (a || u) ? { active: a || null, upcoming: u || null } : null;
  };
  const since = addDays(t, -14);
  const recent = log => Object.fromEntries(Object.entries(log || {}).filter(([d]) => d >= since));
  const p = profile();
  const tg = planTargets();
  return {
    today: t, weekday: weekdayOf(t), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    plans: { workout: pick('workout'), meal: pick('meal') },
    exerciseState: S.doc.exerciseState,
    recentLogs: { workout: recent(S.doc.workoutLog), meal: recent(S.doc.mealLog) },
    levelEvents: S.doc.levelEvents.slice(-40),
    targets: tg,
    healthExcerpt: p.health && p.health.shareWithCoach ? healthText(p.health) : null,
    legacySummary: S.doc.legacy ? S.doc.legacy.summary : null,
    screen,
  };
}
export function healthText(h) {
  if (!h) return '';
  const parts = [];
  if ((h.conditions || []).length) parts.push('Conditions: ' + h.conditions.join(', '));
  if (h.notes) parts.push('Notes: ' + h.notes);
  if (h.excerpt) parts.push('From reports (reviewed by the user): ' + h.excerpt);
  return parts.join('. ');
}
