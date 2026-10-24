// Runs the Worker in Node with a SQLite-backed D1 stand-in, static assets from
// public/, and a scripted fake of the Anthropic streaming API.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { workoutPlan, mealPlan } from './fixtures.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Stmt(this.db, this.sql, args.map(a => (a === undefined ? null : typeof a === 'boolean' ? (a ? 1 : 0) : a))); }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { meta: { changes: Number(r.changes) } }; }
}
export function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(root, 'migrations/0001_init.sql'), 'utf8'));
  return {
    _db: db,
    prepare: sql => new Stmt(db, sql),
    batch: async stmts => { const out = []; for (const s of stmts) out.push(/^\s*(select)/i.test(s.sql) ? await s.all() : await s.run()); return out; },
  };
}

export const assets = {
  async fetch(req) {
    const p = new URL(req.url).pathname;
    const file = path.join(root, 'public', p);
    if (!fs.existsSync(file)) return new Response('not found', { status: 404 });
    return new Response(fs.readFileSync(file), { headers: { 'content-type': p.endsWith('.json') ? 'application/json' : 'text/plain' } });
  },
};

export function makeEnv(extra = {}) {
  return { DB: d1(), ASSETS: assets, SESSION_SECRET: 'x'.repeat(40), GOOGLE_CLIENT_ID: 'test-client', DEV_AUTH: '1', PLATFORM_API_KEY: 'sk-test', PLATFORM_PROVIDER: 'anthropic', PLATFORM_MODEL: 'claude-haiku-5-5', ...extra };
}
export function makeCtx() {
  const waits = [];
  return { waitUntil: p => waits.push(p), done: () => Promise.allSettled(waits) };
}

// ---- fake Anthropic ----
function sseBody(events) {
  const text = events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); } }), { headers: { 'content-type': 'text/event-stream' } });
}
const start = { type: 'message_start', message: { usage: { input_tokens: 1200, cache_read_input_tokens: 800 } } };
const textReply = t => sseBody([start, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }, { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 40 } }, { type: 'message_stop' }]);
const toolReply = (name, input, id = 'tu_' + Math.random().toString(36).slice(2, 8)) => sseBody([start,
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id, name, input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
  { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 300 } }, { type: 'message_stop' }]);

export function fakeAnthropic({ log = [], badFirstPlan = true } = {}) {
  let planAttempts = 0;
  return async (url, init) => {
    if (String(url).startsWith('https://oauth2.googleapis.com/tokeninfo')) return new Response(JSON.stringify({ aud: 'test-client', email: 'g@example.com', email_verified: 'true', sub: 'g1' }));
    if (!String(url).startsWith('https://api.anthropic.com/')) throw new Error('unexpected fetch ' + url);
    if (init.headers['x-api-key'] === 'bad-key') return new Response('{"error":{"type":"authentication_error","message":"invalid x-api-key"}}', { status: 401 });
    const body = JSON.parse(init.body);
    log.push(body);
    const sys = body.system.map(s => s.text).join('\n');
    const forced = body.tool_choice && body.tool_choice.name;
    if (forced === 'set_title') return toolReply('set_title', { title: 'Plank question' });
    if (forced === 'update_notes') return toolReply('update_notes', { add: ['left knee hurts on lunges'] });
    if (forced === 'set_summary') return toolReply('set_summary', { summary: 's' });
    if (forced === 'submit_assessment') return toolReply('submit_assessment', { areas: { upper: 1, core: 0, back: 0 }, overall: 1, explanation: 'One. Two.', goal: { title: 'Build a push-up and plank base', items: ['20 push-ups'], weeks: 8, why: 'core first' } });
    if (forced === 'submit_alternatives') return toolReply('submit_alternatives', { alternatives: [
      { dish: 'Rajma rice', est: { kcal: 500, proteinG: 22 }, tags: ['veg'] }, { dish: 'Chicken curry and rice', est: { kcal: 520, proteinG: 35 }, tags: ['chicken'] }] });
    const last = body.messages[body.messages.length - 1];
    const results = last.content.filter(c => c.type === 'tool_result');
    const lastResult = results[results.length - 1];
    const isMeal = sys.includes('food planner');
    const isJourney = sys.includes("AgentFit's planner") || isMeal;
    if (lastResult && lastResult.content.startsWith('Draft')) return textReply('Here is your revised plan.');
    if (isJourney || (lastResult && lastResult.tool_use_id && lastResult.content.includes('"active"'))) {
      if (isMeal) {
        planAttempts++;
        const brief = JSON.stringify(body.messages[0].content);
        const wd = (/cycleStartWeekday \\"(\w+)\\"/.exec(brief) || [])[1] || 'MON';
        const tm = /Daily targets: (\d+) kcal \(±150\), at least (\d+) g protein/.exec(brief);
        const rdays = (/"restrictedDays":\[([^\]]*)\]/.exec(brief.replace(/\\"/g, '"')) || [])[1];
        const p = mealPlan(wd, tm ? { kcal: +tm[1], proteinGMin: +tm[2] } : null, rdays !== undefined ? (rdays.match(/[A-Z]{3}/g) || []) : undefined);
        if (badFirstPlan && planAttempts === 1) p.days.pop();
        return toolReply('save_draft_plan', { type: 'meal', plan: p, summary: '14-day chart' });
      }
      if (!lastResult) return toolReply('search_exercises', { query: 'push' });
      planAttempts++;
      const p = structuredClone(workoutPlan);
      if (badFirstPlan && planAttempts === 1) p.exercises[1].levels[1].load.value = 13;
      return toolReply('save_draft_plan', { type: 'workout', plan: p, summary: 'First plan' });
    }
    // Coach chat: read the plan first, then revise it.
    if (/add|change|revise/i.test(JSON.stringify(last.content))) return toolReply('get_current_plan', { type: 'workout' });
    return textReply('Hold the plank with a straight line from head to heels.');
  };
}

export async function readSse(res) {
  const text = await res.text();
  return text.trim().split('\n\n').filter(Boolean).map(chunk => {
    const ev = /event: (.*)/.exec(chunk)[1];
    const data = JSON.parse(/data: (.*)/s.exec(chunk)[1]);
    return { ev, data };
  });
}
