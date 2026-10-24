// AgentFit Worker: the API under /api/*, everything else is the static PWA (public/).
import { HttpError, json, errorResponse, readJson, newId, now, utcDay } from './http.js';
import { requireUser, googleSignIn, devSignIn, isAdmin } from './auth.js';
import { handleChat, listConversations, getConversation, draftAccepted, getProfile } from './chat.js';
import * as journey from './journey.js';
import { creditBalance, userUsageToday } from './usage.js';
import { limits, platform, models, findModel, baseUrl } from './config.js';
import { summary, reviewCustom, checkVideos, brokenVideos } from './admin.js';
import { testKey, ProviderError } from './providers.js';

const routes = [];
const route = (method, pattern, handler, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler, ...opts });

// ---------- auth ----------
route('POST', '/api/auth/google', async ({ request, env }) => json(await googleSignIn(env, await readJson(request))), { public: true });
route('POST', '/api/auth/dev', async ({ request, env }) => json(await devSignIn(env, await readJson(request))), { public: true });
route('GET', '/api/health', async () => json({ ok: true }), { public: true });

// ---------- account ----------
route('GET', '/api/me', async ({ env, user }) => {
  const p = platform(env);
  return json({
    user: { id: user.id, email: user.email, name: user.name, memoryEnabled: !!user.memory_enabled, isAdmin: isAdmin(env, user), createdAt: user.created_at },
    credits: await creditBalance(env, user.id),
    usageToday: await userUsageToday(env, user.id),
    limits: { userDailyTokens: limits(env).userDailyTokens, userDailyRequests: limits(env).userDailyRequests },
    platform: { available: !!p.apiKey, provider: p.provider, model: p.model },
    models: Object.fromEntries(Object.entries(models(env)).map(([k, v]) => [k, v.map(m => ({ id: m.id, label: m.label }))])),
  });
});
route('PUT', '/api/me/settings', async ({ request, env, user }) => {
  const b = await readJson(request);
  if (typeof b.memoryEnabled === 'boolean') await env.DB.prepare('UPDATE users SET memory_enabled = ? WHERE id = ?').bind(b.memoryEnabled ? 1 : 0, user.id).run();
  return json({ ok: true });
});
route('PUT', '/api/profile', async ({ request, env, user }) => {
  const b = await readJson(request);
  const profile = { ...(b.profile || {}) };
  delete profile.health; // HD-01: never stored on AgentFit servers
  await env.DB.prepare('INSERT INTO profiles (user_id, profile_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at')
    .bind(user.id, JSON.stringify(profile), now()).run();
  if (profile.name && profile.name !== user.name) await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(String(profile.name).slice(0, 80), user.id).run();
  return json({ ok: true });
});
route('GET', '/api/profile', async ({ env, user }) => json({ profile: await getProfile(env, user.id) }));
route('GET', '/api/export', async ({ env, user }) => {
  const q = (sql) => env.DB.prepare(sql).bind(user.id);
  const [p, m, c, msg, u] = await env.DB.batch([
    q('SELECT profile_json FROM profiles WHERE user_id = ?'),
    q('SELECT text, created_at, updated_at FROM memory_notes WHERE user_id = ?'),
    q('SELECT id, title, summary, created_at, updated_at FROM conversations WHERE user_id = ?'),
    q('SELECT m.conversation_id, m.role, m.content_json, m.created_at FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = ? ORDER BY m.created_at'),
    q('SELECT day, purpose, mode, provider, model, tokens_in, tokens_out, est_cost_usd_micros FROM usage_events WHERE user_id = ?'),
  ]);
  return json({ exportedAt: new Date().toISOString(), account: { email: user.email, createdAt: user.created_at }, profile: p.results[0] ? JSON.parse(p.results[0].profile_json) : null,
    memory: m.results, conversations: c.results, messages: msg.results.map(r => ({ ...r, content: JSON.parse(r.content_json), content_json: undefined })), usage: u.results });
});
route('DELETE', '/api/account', async ({ env, user }) => {
  const tables = ['memory_notes', 'profiles', 'plan_meta', 'custom_exercises', 'ledger_entries', 'usage_events', 'cap_hits'];
  await env.DB.batch([
    env.DB.prepare('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)').bind(user.id),
    env.DB.prepare('DELETE FROM conversations WHERE user_id = ?').bind(user.id),
    ...tables.map(t => env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(user.id)),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  return json({ ok: true });
});

// ---------- memory (FR-MEM-02) ----------
route('GET', '/api/memory', async ({ env, user }) => {
  const { results } = await env.DB.prepare('SELECT id, text, updated_at FROM memory_notes WHERE user_id = ? ORDER BY updated_at DESC').bind(user.id).all();
  return json({ notes: results, enabled: !!user.memory_enabled });
});
route('POST', '/api/memory', async ({ request, env, user }) => {
  const b = await readJson(request);
  const text = String(b.text || '').trim().slice(0, 200);
  if (!text) throw new HttpError(400, 'empty', 'Write the note first.');
  const id = newId('m_');
  await env.DB.prepare('INSERT INTO memory_notes (id, user_id, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, user.id, text, now(), now()).run();
  return json({ id });
});
route('PATCH', '/api/memory/:id', async ({ request, env, user, params }) => {
  const b = await readJson(request);
  await env.DB.prepare('UPDATE memory_notes SET text = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind(String(b.text || '').slice(0, 200), now(), params.id, user.id).run();
  return json({ ok: true });
});
route('DELETE', '/api/memory/:id', async ({ env, user, params }) => {
  await env.DB.prepare('DELETE FROM memory_notes WHERE id = ? AND user_id = ?').bind(params.id, user.id).run();
  return json({ ok: true });
});
route('POST', '/api/memory/forget', async ({ request, env, user }) => {
  // HD-04: deleting health disclosures deletes related notes. The app sends the words to forget.
  const b = await readJson(request);
  const terms = (b.terms || []).map(t => String(t).toLowerCase()).filter(t => t.length > 2).slice(0, 20);
  if (b.all) { await env.DB.prepare('DELETE FROM memory_notes WHERE user_id = ?').bind(user.id).run(); return json({ ok: true }); }
  for (const t of terms) await env.DB.prepare('DELETE FROM memory_notes WHERE user_id = ? AND lower(text) LIKE ?').bind(user.id, '%' + t + '%').run();
  return json({ ok: true });
});

// ---------- coach ----------
route('POST', '/api/chat', async ({ request, env, ctx, user }) => handleChat(request, env, ctx, user));
route('GET', '/api/conversations', async ({ env, user }) => json({ conversations: await listConversations(env, user) }));
route('GET', '/api/conversations/:id', async ({ env, user, params }) => json(await getConversation(env, user, params.id)));
route('PATCH', '/api/conversations/:id', async ({ request, env, user, params }) => {
  const b = await readJson(request);
  if (typeof b.memoryOff === 'boolean') await env.DB.prepare('UPDATE conversations SET memory_off = ? WHERE id = ? AND user_id = ?').bind(b.memoryOff ? 1 : 0, params.id, user.id).run();
  if (b.title) await env.DB.prepare('UPDATE conversations SET title = ? WHERE id = ? AND user_id = ?').bind(String(b.title).slice(0, 60), params.id, user.id).run();
  return json({ ok: true });
});
route('DELETE', '/api/conversations/:id', async ({ env, user, params }) => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM messages WHERE conversation_id = (SELECT id FROM conversations WHERE id = ? AND user_id = ?)').bind(params.id, user.id),
    env.DB.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').bind(params.id, user.id),
  ]);
  return json({ ok: true });
});
route('POST', '/api/plans/accepted', async ({ request, env, user }) => json(await draftAccepted(env, user, await readJson(request))));

// ---------- journey ----------
route('POST', '/api/journey/assess', async ({ request, env, user }) => json(await journey.assess(request, env, user)));
route('POST', '/api/journey/plan', async ({ request, env, ctx, user }) => journey.plan(request, env, ctx, user));
route('POST', '/api/journey/swap', async ({ request, env, user }) => json(await journey.swap(request, env, user)));

// ---------- BYOK ----------
route('POST', '/api/byok/test', async ({ request, env }) => {
  const b = await readJson(request);
  const key = request.headers.get('x-provider-key');
  if (!key) throw new HttpError(400, 'missing_key', 'Paste a key first.');
  const m = findModel(env, b.provider, b.model) || (models(env)[b.provider] || [])[0];
  if (!m) throw new HttpError(400, 'bad_provider', 'Choose Claude, OpenAI or Gemini.');
  try { await testKey({ provider: b.provider, apiKey: key, model: m.id, baseUrl: baseUrl(env, b.provider) }); return json({ ok: true, model: m.id }); }
  catch (e) { if (e instanceof ProviderError) return json({ ok: false, code: e.code, message: e.message }); throw e; }
});

// ---------- library ----------
route('GET', '/api/videos/broken', async ({ env }) => json({ broken: await brokenVideos(env) }));

// ---------- admin ----------
route('GET', '/api/admin/summary', async ({ env }) => json(await summary(env)), { admin: true });
route('POST', '/api/admin/custom-exercises', async ({ request, env }) => json(await reviewCustom(env, await readJson(request))), { admin: true });
route('POST', '/api/admin/check-videos', async ({ env }) => json(await checkVideos(env)), { admin: true });

async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  for (const r of routes) {
    if (r.method !== request.method) continue;
    const m = r.re.exec(url.pathname);
    if (!m) continue;
    const args = { request, env, ctx, url, params: m.groups || {} };
    if (!r.public) {
      args.user = await requireUser(request, env);
      if (r.admin && !isAdmin(env, args.user)) throw new HttpError(403, 'forbidden', 'Admins only.');
      // last_active_at feeds "active users" without a write on every call
      if (!args.user.last_active_at || now() - args.user.last_active_at > 6 * 3600000) ctx.waitUntil(env.DB.prepare('UPDATE users SET last_active_at = ? WHERE id = ?').bind(now(), args.user.id).run());
    }
    return r.handler(args);
  }
  throw new HttpError(404, 'not_found', 'No such API route.');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await handleApi(request, env, ctx); } catch (e) { return errorResponse(e); }
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkVideos(env).catch(e => console.error('video check failed', e)));
  },
};

export { utcDay };
