import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { makeEnv, makeCtx, fakeAnthropic, readSse } from './harness.js';
import { profile, workoutPlan } from './fixtures.js';

const call = async (env, method, path, body, { token, headers = {} } = {}) => {
  const ctx = makeCtx();
  const res = await worker.fetch(new Request('https://app.test' + path, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  }), env, ctx);
  return { res, ctx };
};
const jsonOf = async p => { const { res, ctx } = await p; const j = await res.json(); await ctx.done(); return { status: res.status, ...j }; };

test('full v1 flow through the Worker', async () => {
  const log = [];
  globalThis.fetch = fakeAnthropic({ log });
  const env = makeEnv({ ADMIN_EMAILS: 'riya@example.com' });

  const { token } = await jsonOf(call(env, 'POST', '/api/auth/dev', { email: 'riya@example.com' }));
  assert.ok(token);
  const me = await jsonOf(call(env, 'GET', '/api/me', null, { token }));
  assert.equal(me.credits, 100);
  assert.equal(me.user.isAdmin, true);
  assert.equal((await call(env, 'GET', '/api/me')).res.status, 401);

  const g = await jsonOf(call(env, 'POST', '/api/auth/google', { accessToken: 'ya29.x' }));
  assert.ok(g.token && g.isNew);

  await jsonOf(call(env, 'PUT', '/api/profile', { profile: { ...profile, health: { conditions: ['x'] } } }, { token }));
  const row = await env.DB.prepare('SELECT profile_json FROM profiles').first();
  assert.ok(!JSON.parse(row.profile_json).health, 'health never stored on the server');

  const a = await jsonOf(call(env, 'POST', '/api/journey/assess', { answers: {}, computed: { areas: { upper: 1, core: 0, back: 0 }, overall: 0 } }, { token }));
  assert.equal(a.goal.title, 'Build a push-up and plank base');
  assert.equal(a.source, 'ai');

  // Workout plan: first attempt has an impossible load, the validator sends it back, second passes.
  const ctxBundle = { today: '2026-10-24', weekday: 'SAT', plans: {} };
  let { res, ctx } = await call(env, 'POST', '/api/journey/plan', { type: 'workout', goal: a.goal, assessment: a, context: ctxBundle }, { token });
  let evs = await readSse(res); await ctx.done();
  assert.deepEqual(evs.map(e => e.ev).filter(e => e !== 'status'), ['meta', 'draft', 'done']);
  const draft = evs.find(e => e.ev === 'draft').data;
  assert.equal(draft.type, 'workout');
  assert.equal(draft.plan.exercises.length, workoutPlan.exercises.length);
  const retry = log.find(b => JSON.stringify(b.messages).includes('13 kg is not possible'));
  assert.ok(retry, 'validator errors were fed back to the model');

  ({ res, ctx } = await call(env, 'POST', '/api/journey/plan', { type: 'meal', context: ctxBundle, cycleStartWeekday: 'MON' }, { token }));
  evs = await readSse(res); await ctx.done();
  const mealDraft = evs.find(e => e.ev === 'draft');
  assert.ok(mealDraft, JSON.stringify(evs.filter(e => e.ev !== 'status')).slice(0, 500));
  assert.equal(mealDraft.data.plan.days.length, 14);

  // Coach chat, first turn: plain answer, title and memory written afterwards.
  ({ res, ctx } = await call(env, 'POST', '/api/chat', { message: 'My left knee hurts on lunges. How do I hold a plank?', context: ctxBundle }, { token }));
  evs = await readSse(res); await ctx.done();
  const meta = evs.find(e => e.ev === 'meta').data;
  assert.equal(meta.mode, 'platform');
  assert.match(evs.filter(e => e.ev === 'text').map(e => e.data.delta).join(''), /straight line/);
  const conv = await jsonOf(call(env, 'GET', '/api/conversations/' + meta.conversationId, null, { token }));
  assert.equal(conv.title, 'Plank question');
  assert.equal(conv.messages.length, 2);
  const mem = await jsonOf(call(env, 'GET', '/api/memory', null, { token }));
  assert.equal(mem.notes[0].text, 'left knee hurts on lunges');
  const system = log.find(b => b.system && b.system[0].text.startsWith('You are the AgentFit coach'));
  assert.ok(system.system[0].cache_control && system.system[1].cache_control, 'static + profile blocks are cached');

  // Revision in the same conversation produces a draft with a change list.
  const withPlan = { ...ctxBundle, plans: { workout: { active: { version: 1, effectiveFrom: '2026-10-25', plan: { ...workoutPlan, exercises: workoutPlan.exercises.slice(0, 3) } } } } };
  ({ res, ctx } = await call(env, 'POST', '/api/chat', { conversationId: meta.conversationId, message: 'Please add squats and rows', context: withPlan }, { token }));
  evs = await readSse(res); await ctx.done();
  const rev = evs.find(e => e.ev === 'draft');
  assert.ok(rev, JSON.stringify(evs).slice(0, 800));
  assert.ok(rev.data.changes.some(c => c.startsWith('Added Goblet squat')));
  const done = evs.find(e => e.ev === 'done').data;
  await jsonOf(call(env, 'POST', '/api/plans/accepted', { messageId: done.messageId, draftId: rev.data.id, type: 'workout', version: 2, effectiveFrom: '2026-10-26' }, { token }));
  const conv2 = await jsonOf(call(env, 'GET', '/api/conversations/' + meta.conversationId, null, { token }));
  assert.equal(conv2.messages[3].drafts[0].accepted, true);

  // Swap keeps only alternatives allowed by the diet (no chicken for an eggetarian).
  const sw = await jsonOf(call(env, 'POST', '/api/journey/swap', { meal: { slot: 'dinner', time: '19:30', dish: 'Paneer tikka' }, weekday: 'TUE' }, { token }));
  assert.ok(sw.alternatives, JSON.stringify(sw));
  assert.deepEqual(sw.alternatives.map(x => x.dish), ['Rajma rice']);
  assert.equal(sw.removed, 1);

  // BYOK with a bad key: the error comes back with recovery actions.
  ({ res, ctx } = await call(env, 'POST', '/api/chat', { message: 'hi', provider: 'anthropic', model: 'claude-haiku-5-5', context: ctxBundle }, { token, headers: { 'x-provider-key': 'bad-key' } }));
  evs = await readSse(res); await ctx.done();
  const err = evs.find(e => e.ev === 'error').data;
  assert.equal(err.code, 'invalid_key');
  assert.deepEqual(err.actions, ['fix_key', 'use_credits']);

  // Usage was metered per call; admin can see it.
  const n = await env.DB.prepare('SELECT COUNT(*) AS n, SUM(est_cost_usd_micros) AS c FROM usage_events').first();
  assert.ok(n.n >= 8 && n.c > 0);
  const adm = await jsonOf(call(env, 'GET', '/api/admin/summary', null, { token }));
  assert.ok(adm.byModel.length && adm.users === 2);
  assert.equal((await jsonOf(call(env, 'GET', '/api/admin/summary', null, { token: g.token }))).status, 403);

  // Export and delete.
  const ex = await jsonOf(call(env, 'GET', '/api/export', null, { token }));
  assert.ok(ex.messages.length >= 4 && ex.profile.name === 'Riya');
  await jsonOf(call(env, 'DELETE', '/api/account', null, { token }));
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM messages').first()).n, 0);
});

test('daily cap and missing platform key', async () => {
  globalThis.fetch = fakeAnthropic();
  const env = makeEnv({ USER_DAILY_REQUEST_CAP: '1' });
  const { token } = await jsonOf(call(env, 'POST', '/api/auth/dev', { email: 'a@b.c' }));
  let { res, ctx } = await call(env, 'POST', '/api/chat', { message: 'hello' }, { token });
  await readSse(res); await ctx.done();
  const r = await jsonOf(call(env, 'POST', '/api/chat', { message: 'again' }, { token }));
  assert.equal(r.status, 429);
  assert.equal(r.error.code, 'daily_limit');
  assert.deepEqual(r.error.actions, ['use_own_key']);
  // BYOK is not capped.
  ({ res, ctx } = await call(env, 'POST', '/api/chat', { message: 'again', provider: 'anthropic' }, { token, headers: { 'x-provider-key': 'good' } }));
  assert.equal(res.status, 200); await readSse(res); await ctx.done();

  const env2 = makeEnv({ PLATFORM_API_KEY: '' });
  const t2 = (await jsonOf(call(env2, 'POST', '/api/auth/dev', { email: 'x@y.z' }))).token;
  const r2 = await jsonOf(call(env2, 'POST', '/api/chat', { message: 'hi' }, { token: t2 }));
  assert.equal(r2.error.code, 'platform_unavailable');
  const a2 = await jsonOf(call(env2, 'POST', '/api/journey/assess', { computed: { areas: { core: 0 }, overall: 1 } }, { token: t2 }));
  assert.equal(a2.source, 'rules', 'assessment still works without AI');
});
