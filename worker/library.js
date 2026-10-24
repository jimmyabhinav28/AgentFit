// Static reference data (exercise library, food lists, goals), read from the
// site's own static assets so the Worker and the PWA always use the same files (FR-LIB-08).
import { availableTokens, missingEquipment } from '../public/js/core/equipment.js';

const cache = {};
async function asset(env, path) {
  if (cache[path]) return cache[path];
  const r = await env.ASSETS.fetch(new Request('https://assets.local' + path));
  if (!r.ok) throw new Error('missing asset ' + path);
  cache[path] = await r.json();
  return cache[path];
}

export async function exerciseLibrary(env) {
  const data = await asset(env, '/data/exercises.json');
  if (!data._byId) Object.defineProperty(data, '_byId', { value: Object.fromEntries(data.exercises.map(e => [e.id, e])) });
  return data._byId;
}
export const foods = env => asset(env, '/data/foods.json');
export const goals = env => asset(env, '/data/goals.json');

const words = s => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1);

export async function searchExercises(env, { query = '', category = '', equipment = null, training = null, days = null, limit = 12 }) {
  const lib = await exerciseLibrary(env);
  const q = words(query);
  const have = training ? availableTokens(training, days) : null;
  const out = [];
  for (const e of Object.values(lib)) {
    if (category && e.category.toLowerCase() !== category.toLowerCase()) continue;
    if (equipment && equipment.length && !e.equipment.some(t => equipment.includes(t))) continue;
    if (have && missingEquipment(e.equipment, training, days).length) continue;
    const hay = words([e.id, e.name, ...e.aliases, ...e.tags, ...e.muscles, e.category].join(' '));
    let score = q.length ? 0 : 1;
    for (const w of q) if (hay.some(h => h === w)) score += 3; else if (hay.some(h => h.startsWith(w) || w.startsWith(h))) score += 1;
    if (score > 0) out.push({ score, e });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit).map(({ e }) => ({ id: e.id, name: e.name, category: e.category, equipment: e.equipment, progressionTypes: e.progressionTypes, muscles: e.muscles }));
}
