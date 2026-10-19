// State, persistence and the week / level arithmetic.
import { EXERCISES, DAYS, DEFAULT_SETTINGS } from './plan.js';

const KEY = 'fit.data.v1';

export function emptyData() {
  return {
    version: 1,
    startMonday: null,          // ISO date of the Monday of week 1
    levels: {},                 // id -> { level, since (week index the level began), changedAt }
    history: {},                // id -> [{ week, level, at }]
    done: {},                   // date -> { exerciseId: true }
    eaten: {},                  // date -> { mealId: true }
    dinner: {},                 // date -> swap name chosen
    settings: { ...DEFAULT_SETTINGS },
    updatedAt: 0,
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyData();
    const d = { ...emptyData(), ...JSON.parse(raw) };
    d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
    return d;
  } catch { return emptyData(); }
}
export function save(d) {
  d.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {}
}
export function clear() { try { localStorage.removeItem(KEY); } catch {} }

// ---------- dates ----------
export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - wd);
  return x;
}
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const dayIndex = d => (d.getDay() + 6) % 7;

export function ensureStart(data, today = new Date()) {
  if (!data.startMonday) { data.startMonday = iso(mondayOf(today)); save(data); }
}
// 1-based week number for a date
export function weekOf(data, d) {
  const start = fromIso(data.startMonday);
  const m = mondayOf(d);
  return Math.floor((m - start) / 86400000 / 7) + 1;
}

// ---------- levels ----------
// Level state is { level, since }: the level began in week `since` and
// advances one level every 4 weeks on its own, until the top.
export function levelState(data, id, week) {
  const ex = EXERCISES[id];
  const max = ex.levels.length;
  const st = data.levels[id] || { level: 1, since: 1 };
  const elapsed = Math.max(0, week - st.since);
  let level = st.level + Math.floor(elapsed / 4);
  let subWeek = (elapsed % 4) + 1;
  if (level > max) { level = max; }
  return { level, subWeek, max, atTop: level >= max };
}
function bump(data, id, week, delta) {
  const cur = levelState(data, id, week);
  const next = Math.min(cur.max, Math.max(1, cur.level + delta));
  if (next === cur.level && delta !== 0) return false;
  data.levels[id] = { level: next, since: week, changedAt: Date.now() };
  (data.history[id] = data.history[id] || []).push({ week, level: next, at: Date.now() });
  save(data);
  return true;
}
export const progress = (d, id, w) => bump(d, id, w, +1);
export const regress = (d, id, w) => bump(d, id, w, -1);

// ---------- ticks ----------
export function toggleDone(data, date, id) {
  const m = (data.done[date] = data.done[date] || {});
  if (m[id]) delete m[id]; else m[id] = true;
  if (!Object.keys(m).length) delete data.done[date];
  save(data);
}
export function toggleEaten(data, date, id) {
  const m = (data.eaten[date] = data.eaten[date] || {});
  if (m[id]) delete m[id]; else m[id] = true;
  if (!Object.keys(m).length) delete data.eaten[date];
  save(data);
}
export function setDinner(data, date, name) { data.dinner[date] = name; save(data); }

// Day status for the consistency grid: 'done' | 'partial' | 'missed' | 'upcoming' | 'today'
export function dayStatus(data, date, today = new Date()) {
  const d = iso(date);
  const t = iso(today);
  const ids = DAYS[dayIndex(date)].exercises;
  const ticks = data.done[d] || {};
  const n = ids.filter(id => ticks[id]).length;
  if (n === ids.length) return 'done';
  if (d > t) return 'upcoming';
  if (n > 0) return 'partial';
  return d === t ? 'today' : 'missed';
}

// ---------- merge (local vs Drive copy) ----------
export function merge(a, b) {
  if (!a) return b; if (!b) return a;
  const out = emptyData();
  out.startMonday = [a.startMonday, b.startMonday].filter(Boolean).sort()[0] || null;
  const ids = new Set([...Object.keys(a.levels), ...Object.keys(b.levels)]);
  for (const id of ids) {
    const x = a.levels[id], y = b.levels[id];
    out.levels[id] = !x ? y : !y ? x : ((y.changedAt || 0) > (x.changedAt || 0) ? y : x);
  }
  const hids = new Set([...Object.keys(a.history), ...Object.keys(b.history)]);
  for (const id of hids) {
    const seen = new Map();
    for (const e of [...(a.history[id] || []), ...(b.history[id] || [])]) seen.set(e.at, e);
    out.history[id] = [...seen.values()].sort((p, q) => p.at - q.at);
  }
  for (const k of ['done', 'eaten']) {
    for (const date of new Set([...Object.keys(a[k]), ...Object.keys(b[k])])) out[k][date] = { ...(a[k][date] || {}), ...(b[k][date] || {}) };
  }
  out.dinner = { ...a.dinner, ...b.dinner };
  const newer = (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a;
  out.settings = { ...DEFAULT_SETTINGS, ...newer.settings };
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return out;
}
