// AI tools (§11). Plans, logs and levels come from the context the app sends with
// each request (PL-08), so the Worker never stores plan data.
import { validateWorkoutPlan, validateMealPlan, formatErrors } from '../public/js/core/validate.js';
import { targets as computeTargets } from '../public/js/core/nutrition.js';
import { diffWorkout, diffMeal } from '../public/js/core/diff.js';
import { exerciseLibrary, searchExercises, foods } from './library.js';
import { newId, now } from './http.js';

const obj = (properties, required = []) => ({ type: 'object', properties, required });
const str = description => ({ type: 'string', description });

export const TOOL_DEFS = {
  get_profile: { description: "The user's full structured profile (body, location, purpose, equipment, schedule, food habits, targets).", parameters: obj({}) },
  get_memory_notes: { description: 'Durable notes remembered from earlier conversations.', parameters: obj({}) },
  get_current_plan: { description: 'The active (and any upcoming) workout or meal plan, as JSON.', parameters: obj({ type: { type: 'string', enum: ['workout', 'meal'] } }, ['type']) },
  get_exercise_state: { description: 'Current level and sub-level for every exercise in the workout plan.', parameters: obj({}) },
  get_recent_logs: { description: 'Workout ticks and meal logs for recent days.', parameters: obj({ days: { type: 'integer', description: '1–28, default 14' } }) },
  get_progress: { description: 'Progress towards targets and the history of Progress/Regress taps.', parameters: obj({ exerciseId: str('optional library id') }) },
  search_past_chats: { description: 'Search titles and summaries of earlier conversations.', parameters: obj({ query: str('words to look for') }, ['query']) },
  search_exercises: { description: "Search the exercise library (the only source of exercises). By default only returns exercises the user's equipment allows.", parameters: obj({ query: str('e.g. "push", "core", "pull-up", "dumbbell legs"'), category: str('optional: Strength, Core, Running, Cardio, Mobility, Skill'), days: { type: 'array', items: { type: 'string' }, description: 'optional weekday codes, to include gym equipment on gym days' }, include_unavailable: { type: 'boolean' } }) },
  get_exercise_info: { description: 'Instructions, cues and common mistakes for a library exercise.', parameters: obj({ exerciseId: str('library id') }, ['exerciseId']) },
  search_foods: { description: 'Common local foods for the user\'s region, with their likes and dislikes.', parameters: obj({ query: str('optional filter') }) },
  save_draft_plan: {
    description: 'Validate a complete workout or meal plan and show it to the user as a draft card. Returns precise errors to fix, or confirms the card is shown.',
    parameters: obj({ type: { type: 'string', enum: ['workout', 'meal'] }, plan: { type: 'object', description: 'the complete plan object' }, summary: str('one line describing the plan or what changed') }, ['type', 'plan', 'summary']),
  },
  activate_plan: { description: 'Called only to explain activation: plans become active when the user taps Accept on the draft card.', parameters: obj({ draftId: str('draft id') }, ['draftId']) },
};

export const CHAT_TOOLS = Object.keys(TOOL_DEFS);
export const JOURNEY_WORKOUT_TOOLS = ['search_exercises', 'get_exercise_info', 'save_draft_plan'];
export const JOURNEY_MEAL_TOOLS = ['search_foods', 'save_draft_plan'];

export function toolList(names) {
  return names.map(name => ({ name, ...TOOL_DEFS[name] }));
}

const STATUS = {
  get_current_plan: i => (i.type === 'meal' ? 'Reading your food chart…' : 'Reading your workout plan…'),
  get_recent_logs: i => `Checking your last ${i.days || 14} days…`,
  get_progress: () => 'Looking at your progress…',
  get_exercise_state: () => 'Checking your levels…',
  search_exercises: () => 'Choosing exercises…',
  get_exercise_info: () => 'Reading exercise notes…',
  search_foods: () => 'Looking at local foods…',
  search_past_chats: () => 'Searching earlier chats…',
  save_draft_plan: i => (i.type === 'meal' ? 'Building your food chart…' : 'Building your workout plan…'),
  get_memory_notes: () => 'Remembering…',
};
export const statusFor = (name, input) => (STATUS[name] ? STATUS[name](input || {}) : null);

function trainingDaysPerWeek(profile, ctx) {
  const w = ctx.plans && ctx.plans.workout && (ctx.plans.workout.upcoming || ctx.plans.workout.active);
  if (w && w.plan && w.plan.dayTypes) return Object.keys(w.plan.dayTypes).length;
  return (profile && profile.schedule && (profile.schedule.days || []).length) || 3;
}

export function planTargets(profile, ctx) {
  const t = profile ? computeTargets(profile, { today: ctx.today || new Date().toISOString().slice(0, 10), trainingDaysPerWeek: trainingDaysPerWeek(profile, ctx) }) : null;
  return t || ctx.targets || null;
}

// ctx: { env, user, profile, context, emit, drafts, mode }
export async function runTool(name, input, ctx) {
  const c = ctx.context || {};
  const plans = c.plans || {};
  switch (name) {
    case 'get_profile': return JSON.stringify({ ...(ctx.profile || {}), health: undefined, targets: planTargets(ctx.profile, c) });
    case 'get_memory_notes': {
      if (!ctx.user.memory_enabled) return 'Memory is turned off by the user.';
      const { results } = await ctx.env.DB.prepare('SELECT text FROM memory_notes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50').bind(ctx.user.id).all();
      return results.length ? results.map(r => '- ' + r.text).join('\n') : 'No notes yet.';
    }
    case 'get_current_plan': {
      const type = input.type === 'meal' ? 'meal' : 'workout';
      const p = plans[type];
      const draft = c.pendingDraft && c.pendingDraft.type === type ? c.pendingDraft : null;
      if ((!p || (!p.active && !p.upcoming)) && !draft) return `The user has no ${type === 'meal' ? 'food' : 'workout'} plan yet.`;
      return JSON.stringify({ active: (p && p.active) || null, upcoming: (p && p.upcoming) || null, ...(draft ? { unacceptedDraftFromPlanner: draft.plan } : {}) });
    }
    case 'get_exercise_state': return JSON.stringify(c.exerciseState || {});
    case 'get_recent_logs': {
      const days = Math.min(28, Math.max(1, input.days || 14));
      const cut = new Date(Date.parse((c.today || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z') - days * 86400000).toISOString().slice(0, 10);
      const pick = log => Object.fromEntries(Object.entries(log || {}).filter(([d]) => d >= cut));
      return JSON.stringify({ workout: pick(c.recentLogs && c.recentLogs.workout), meals: pick(c.recentLogs && c.recentLogs.meal) });
    }
    case 'get_progress': {
      const events = (c.levelEvents || []).filter(e => !input.exerciseId || e.exerciseId === input.exerciseId);
      return JSON.stringify({ progress: c.progress || null, levelEvents: events.slice(-40), exerciseState: c.exerciseState || {} });
    }
    case 'search_past_chats': {
      const q = '%' + String(input.query || '').slice(0, 60) + '%';
      const { results } = await ctx.env.DB.prepare('SELECT id, title, summary, updated_at FROM conversations WHERE user_id = ? AND (title LIKE ? OR summary LIKE ?) ORDER BY updated_at DESC LIMIT 5').bind(ctx.user.id, q, q).all();
      return results.length ? JSON.stringify(results.map(r => ({ title: r.title, summary: r.summary, date: new Date(r.updated_at).toISOString().slice(0, 10) }))) : 'No matching conversations.';
    }
    case 'search_exercises': {
      const res = await searchExercises(ctx.env, { query: input.query || '', category: input.category || '', training: input.include_unavailable ? null : ctx.profile && ctx.profile.training, days: input.days || null });
      return res.length ? JSON.stringify(res) : 'No matches. Try a broader word such as "push", "pull", "legs", "core" or "run".';
    }
    case 'get_exercise_info': {
      const lib = await exerciseLibrary(ctx.env);
      const e = lib[input.exerciseId];
      if (!e) return `No exercise with id "${input.exerciseId}". Use search_exercises.`;
      return JSON.stringify({ ...e, videos: e.videos.length ? `${e.videos.length} video(s)` : 'none yet' });
    }
    case 'search_foods': {
      const f = await foods(ctx.env);
      const region = ctx.profile && ctx.profile.location && ctx.profile.location.region;
      const india = ctx.profile && /india/i.test((ctx.profile.location && ctx.profile.location.country) || '');
      let list = india ? [...f.india.common, ...((region && f.india.regions[region]) || [])] : f.global;
      if (input.query) list = list.filter(x => (x.name + ' ' + x.note).toLowerCase().includes(String(input.query).toLowerCase()));
      const food = (ctx.profile && ctx.profile.food) || {};
      return JSON.stringify({ region: region || null, foods: list.slice(0, 60).map(x => x.name), likes: food.likes || [], dislikes: food.dislikes || [] });
    }
    case 'save_draft_plan': return saveDraft(input, ctx);
    case 'activate_plan': return 'Plans are activated by the user tapping Accept on the draft card. Ask them to tap Accept if they are happy; it starts tomorrow.';
    default: return `Unknown tool ${name}.`;
  }
}

async function saveDraft(input, ctx) {
  let plan = input.plan;
  if (typeof plan === 'string') { try { plan = JSON.parse(plan); } catch { return { content: 'plan must be a JSON object.', isError: true }; } }
  const type = input.type === 'meal' ? 'meal' : 'workout';
  const c = ctx.context || {};
  const profile = ctx.profile || {};
  if (ctx.allowedType && ctx.allowedType !== type) return { content: `Only a ${ctx.allowedType} plan can be saved here.`, isError: true };
  let result;
  let tgt = null;
  if (type === 'workout') {
    plan = { schemaVersion: '1.0', ...plan, type: 'workout_plan' };
    result = validateWorkoutPlan(plan, { library: await exerciseLibrary(ctx.env), training: profile.training || {} });
  } else {
    tgt = planTargets(profile, c);
    plan = { schemaVersion: '1.0', cycleLengthDays: 14, ...plan, type: 'meal_plan', dailyTargets: tgt ? { proteinGMin: tgt.proteinGMin, kcal: tgt.kcal } : plan.dailyTargets };
    if (!plan.eatingWindow && profile.food && profile.food.eatingWindow) plan.eatingWindow = profile.food.eatingWindow;
    result = validateMealPlan(plan, { food: profile.food || {}, targets: tgt });
  }
  ctx.attempts = (ctx.attempts || 0) + 1;
  if (!result.ok) {
    return { content: `The plan has ${result.errors.length} problem(s). Fix them and call save_draft_plan again with the complete plan:\n${formatErrors(result)}`, isError: true };
  }
  const current = c.plans && c.plans[type] && (c.plans[type].upcoming || c.plans[type].active);
  const lib = type === 'workout' ? await exerciseLibrary(ctx.env) : null;
  const changes = type === 'workout' ? diffWorkout(current && current.plan, plan, lib) : diffMeal(current && current.plan, plan);
  const draft = { id: newId('d_'), type, plan, summary: String(input.summary || '').slice(0, 200), changes, warnings: result.warnings.slice(0, 10), targets: tgt };
  ctx.drafts.push(draft);
  await ctx.emit('draft', draft);
  // FR-LIB-07: custom exercises are queued for admin review.
  if (type === 'workout') {
    for (const ex of plan.exercises) if (String(ex.exerciseId).startsWith('custom:')) {
      await ctx.env.DB.prepare('INSERT OR IGNORE INTO custom_exercises (id, user_id, name, details_json, review_status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(ctx.user.id + ':' + ex.exerciseId, ctx.user.id, ex.name, JSON.stringify(ex), 'pending', now()).run();
    }
  }
  ctx.finished = true;
  return { content: `Draft ${draft.id} is now shown to the user as a card with Accept. Changes: ${changes.join('; ')}. Briefly tell the user what it is (one or two sentences); do not repeat the whole plan.` };
}
