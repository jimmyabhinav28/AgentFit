// AI steps of the Journey (§3A): assessment explanation + recommended goal (5b, 5c),
// first workout plan (5e), 14-day food chart (6c) and meal swaps.
import { HttpError, readJson, sse } from './http.js';
import { resolveCreds, structuredCall } from './quick.js';
import { runAgent } from './agent.js';
import { toolList, JOURNEY_WORKOUT_TOOLS, JOURNEY_MEAL_TOOLS, planTargets } from './tools.js';
import { JOURNEY_WORKOUT, JOURNEY_MEAL, profileBlock, SAFETY } from './prompts.js';
import { goals } from './library.js';
import { getProfile, errorActions } from './chat.js';
import { ProviderError } from './providers.js';
import { RATINGS, AREAS } from '../public/js/core/norms.js';
import { validateMealPlan } from '../public/js/core/validate.js';

const clampRating = v => Math.max(0, Math.min(3, Math.round(Number(v))));

function fallbackGoal(purpose, areas, catalog) {
  const list = (catalog.templates[purpose] || catalog.templates.general);
  const weakest = Object.entries(areas).sort((a, b) => a[1] - b[1])[0];
  const pick = weakest && weakest[0] === 'back' ? list.find(g => g.id === 'first_pullup') : weakest && weakest[0] === 'core' ? list.find(g => g.id === 'plank_2min') : null;
  const g = pick || list[0];
  return { title: g.title, items: [g.detail], weeks: g.weeks, why: 'It targets your weakest area first, which helps everything else.' };
}

export async function assess(request, env, user) {
  const body = await readJson(request);
  const profile = body.profile || (await getProfile(env, user.id)) || {};
  const base = body.computed || { areas: {}, overall: 1 };
  const catalog = await goals(env);
  const purpose = (profile.purpose && profile.purpose.kind) || 'general';
  const fallback = {
    areas: base.areas, overall: base.overall,
    explanation: `Overall you are ${RATINGS[base.overall] || 'Average'} for your age. We'll start where you are and build up step by step.`,
    goal: fallbackGoal(purpose, base.areas, catalog), source: 'rules',
  };
  let creds;
  try { creds = await resolveCreds(env, user, request, body); } catch (e) { if (e.code === 'daily_limit' || e.code === 'platform_unavailable' || e.code === 'rate_limited') return { ...fallback, notice: e.message }; throw e; }
  const tool = { name: 'submit_assessment', description: 'Return the assessment and one recommended goal', parameters: { type: 'object', properties: {
    areas: { type: 'object', properties: Object.fromEntries(AREAS.map(a => [a.id, { type: 'integer', description: '0 Weak, 1 Average, 2 Good, 3 Elite' }])) },
    overall: { type: 'integer', description: '0–3' },
    explanation: { type: 'string', description: 'Exactly two short sentences, plain and encouraging' },
    goal: { type: 'object', properties: { title: { type: 'string' }, items: { type: 'array', items: { type: 'string' } }, weeks: { type: 'integer' }, why: { type: 'string' } }, required: ['title', 'items', 'weeks', 'why'] },
    purposeNote: { type: 'string', description: 'If the user described their purpose in their own words, a one-line interpretation' },
  }, required: ['areas', 'overall', 'explanation', 'goal'] } };
  try {
    const r = await structuredCall({ env, creds, userId: user.id, purpose: 'journey', maxTokens: 1200,
      system: `You assess a new AgentFit user's fitness from their questionnaire. Ratings are computed from age and gender norms; keep them unless the user's own words clearly justify a change (for example pain, or a number more precise than the choice). Then recommend ONE immediate goal, achievable in 6–12 weeks with their equipment and schedule, with 2–3 measurable milestones. Goal templates you may adapt: ${JSON.stringify(catalog.templates[purpose] || catalog.templates.general)}\n${SAFETY}`,
      prompt: `${profileBlock(profile)}\nAnswers: ${JSON.stringify(body.answers || {})}\nComputed ratings (0 Weak … 3 Elite): ${JSON.stringify(base)}`,
      tool });
    if (!r) return fallback;
    const areas = {};
    for (const a of AREAS) if (base.areas[a.id] != null || (r.areas && r.areas[a.id] != null)) areas[a.id] = clampRating(r.areas && r.areas[a.id] != null ? r.areas[a.id] : base.areas[a.id]);
    const g = r.goal || {};
    return { areas, overall: clampRating(r.overall ?? base.overall), explanation: String(r.explanation || fallback.explanation).slice(0, 400),
      goal: { title: String(g.title || fallback.goal.title).slice(0, 80), items: (g.items || fallback.goal.items).slice(0, 4).map(s => String(s).slice(0, 100)), weeks: Number(g.weeks) || 8, why: String(g.why || '').slice(0, 300) },
      purposeNote: r.purposeNote ? String(r.purposeNote).slice(0, 200) : undefined, source: 'ai' };
  } catch (e) {
    if (e instanceof ProviderError) return { ...fallback, notice: e.message, errorCode: e.code, actions: errorActions(e.code, creds.mode) };
    throw e;
  }
}

// Builds the first plan; streams status lines and ends with a 'draft' event.
export async function plan(request, env, ctx, user) {
  const body = await readJson(request);
  const type = body.type === 'meal' ? 'meal' : 'workout';
  const profile = body.profile || (await getProfile(env, user.id));
  if (!profile) throw new HttpError(400, 'no_profile', 'Fill in your profile first.');
  const creds = await resolveCreds(env, user, request, body);
  const context = body.context || {};
  const tgt = planTargets(profile, context);
  const brief = type === 'workout'
    ? `Build the workout plan.\nAssessment: ${JSON.stringify(body.assessment || {})}\nChosen goal: ${JSON.stringify(body.goal || {})}\nSchedule: ${JSON.stringify(profile.schedule || {})}\nNotes from the user: ${body.notes || 'none'}`
    : `Build the 14-day food chart. Daily targets: ${tgt ? `${tgt.kcal} kcal (±150), at least ${tgt.proteinGMin} g protein` : 'not computed'}. Use cycleStartWeekday "${body.cycleStartWeekday || 'MON'}".\nFood answers: ${JSON.stringify(profile.food || {})}\n${body.constraintsText ? `The user described their constraints in their own words: ${body.constraintsText}` : ''}`;
  const system = [
    { text: type === 'workout' ? JOURNEY_WORKOUT : JOURNEY_MEAL, cache: true },
    { text: profileBlock(profile) + (body.healthExcerpt ? `\nHEALTH NOTES the user chose to share (use only to keep the plan safe): ${String(body.healthExcerpt).slice(0, 4000)}` : '') + `\nTODAY: ${context.today || ''}` },
  ];
  const { response, send, close } = sse();
  const run = async () => {
    await send('meta', { mode: creds.mode, model: creds.model });
    await send('status', { text: 'Reading your answers…' });
    const toolCtx = { env, user, profile, context, emit: send, drafts: [], allowedType: type };
    try {
      const r = await runAgent({ env, creds, system, messages: [{ role: 'user', content: [{ type: 'text', text: brief }] }],
        tools: toolList(type === 'workout' ? JOURNEY_WORKOUT_TOOLS : JOURNEY_MEAL_TOOLS), toolChoice: 'any', stopOnDraft: true,
        emit: async (ev, data) => { if (ev !== 'text') await send(ev, data); }, toolCtx, purpose: 'journey', maxSteps: 6, maxTokens: type === 'meal' ? 32000 : 12000 });
      if (!r.drafts.length) await send('error', { code: 'no_plan', message: 'The coach could not finish a plan that passes all the checks. Try again, or simplify your answers.', actions: ['retry'] });
      else await send('done', { usage: r.usage });
    } catch (e) {
      const code = e instanceof ProviderError ? e.code : 'server_error';
      if (!(e instanceof ProviderError)) console.error('journey plan failed', e);
      await send('error', { code, message: e instanceof ProviderError ? e.message : 'Something went wrong. Please try again.', actions: errorActions(code, creds.mode) });
    }
    await close();
  };
  ctx.waitUntil(run());
  return response;
}

// Three alternatives for one meal (Swap on the 14-day chart and on Today).
export async function swap(request, env, user) {
  const body = await readJson(request);
  const profile = body.profile || (await getProfile(env, user.id)) || {};
  const meal = body.meal || {};
  const weekday = body.weekday || 'MON';
  const creds = await resolveCreds(env, user, request, body);
  const mealSchema = { type: 'object', properties: { dish: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, qty: { type: 'string' } } } }, est: { type: 'object', properties: { kcal: { type: 'number' }, proteinG: { type: 'number' }, carbsG: { type: 'number' }, fatG: { type: 'number' } } }, tags: { type: 'array', items: { type: 'string' } } }, required: ['dish', 'est', 'tags'] };
  const tool = { name: 'submit_alternatives', description: 'Return three alternative meals', parameters: { type: 'object', properties: { alternatives: { type: 'array', items: mealSchema } }, required: ['alternatives'] } };
  let r;
  try {
    r = await structuredCall({ env, creds, userId: user.id, purpose: 'journey', maxTokens: 1500,
      system: `Suggest three alternative meals for one slot of an AgentFit food chart. Same slot and time, similar calories (±15%) and at least as much protein. Respect the diet type, the ${weekday} restrictions, likes, dislikes and cooking time. Tag each with what it contains (veg, egg, chicken, mutton, fish, seafood, meat, dairy, onion_garlic, root_veg).\n${SAFETY}`,
      prompt: `${profileBlock(profile)}\nDay: ${weekday}\nMeal to replace: ${JSON.stringify(meal)}\nDo not suggest: ${JSON.stringify(body.exclude || [])}\n${body.request ? 'The user asked: ' + body.request : ''}`, tool });
  } catch (e) {
    if (e instanceof ProviderError) throw new HttpError(502, e.code, e.message, { actions: errorActions(e.code, creds.mode) });
    throw e;
  }
  const alts = ((r && r.alternatives) || []).slice(0, 3).map(a => ({ ...a, slot: meal.slot, time: meal.time }));
  // Keep only alternatives that pass the same diet checks.
  const ok = alts.filter(a => validateMealPlan({ type: 'meal_plan', cycleLengthDays: 14, cycleStartWeekday: weekday, days: [{ cycleDay: 1, meals: [a] }] }, { food: profile.food || {} })
    .errors.filter(x => !/cycle day \d+ is missing/.test(x.message)).length === 0);
  return { alternatives: ok, removed: alts.length - ok.length };
}
