// Token metering (V1-CR-04) and the v1 spend guardrails (V1-CR-05, NFR-06).
import { HttpError, newId, now, utcDay } from './http.js';
import { limits, estimateCostMicros } from './config.js';

export async function recordUsage(env, { userId, conversationId = null, messageId = null, purpose, mode, provider, model, usage }) {
  const cost = estimateCostMicros(env, provider, model, usage);
  await env.DB.prepare(`INSERT INTO usage_events (id, user_id, conversation_id, message_id, purpose, mode, provider, model, tokens_in, tokens_cached, tokens_out, est_cost_usd_micros, day, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(newId('ue_'), userId, conversationId, messageId, purpose, mode, provider, model, usage.input || 0, usage.cached || 0, usage.output || 0, cost, utcDay(), now()).run();
  if (mode === 'platform') await maybeAlert(env);
  return cost;
}

async function noteCapHit(env, userId, kind) {
  await env.DB.prepare('INSERT INTO cap_hits (user_id, day, kind, count) VALUES (?, ?, ?, 1) ON CONFLICT(user_id, day, kind) DO UPDATE SET count = count + 1')
    .bind(userId, utcDay(), kind).run();
}

export async function userUsageToday(env, userId) {
  const day = utcDay();
  const t = await env.DB.prepare(`SELECT COALESCE(SUM(tokens_in + tokens_out), 0) AS tokens FROM usage_events
    WHERE user_id = ? AND day = ? AND mode = 'platform' AND purpose IN ('chat', 'journey')`).bind(userId, day).first();
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM request_log WHERE user_id = ? AND day = ?').bind(userId, day).first();
  return { tokens: t.tokens || 0, requests: r.n || 0 };
}

export async function globalSpendToday(env) {
  const row = await env.DB.prepare(`SELECT COALESCE(SUM(est_cost_usd_micros), 0) AS micros FROM usage_events WHERE day = ? AND mode = 'platform'`).bind(utcDay()).first();
  return (row.micros || 0) / 1e6;
}

// Throws a 429 with a code the PWA shows as "Daily limit reached — try again tomorrow, or use your own key".
export async function assertWithinCaps(env, user) {
  const L = limits(env);
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM request_log WHERE user_id = ? AND at > ?').bind(user.id, now() - 60000).first();
  if ((recent.n || 0) >= L.perMinuteRequests) {
    await noteCapHit(env, user.id, 'rate');
    throw new HttpError(429, 'rate_limited', 'You are sending messages very quickly. Wait a minute and try again.');
  }
  const u = await userUsageToday(env, user.id);
  if (u.tokens >= L.userDailyTokens || u.requests >= L.userDailyRequests) {
    await noteCapHit(env, user.id, u.tokens >= L.userDailyTokens ? 'user_tokens' : 'user_requests');
    throw new HttpError(429, 'daily_limit', 'Daily limit reached — try again tomorrow, or use your own key.', { actions: ['use_own_key'] });
  }
  if ((await globalSpendToday(env)) >= L.globalDailyUsd) {
    await noteCapHit(env, user.id, 'global_spend');
    throw new HttpError(429, 'daily_limit', 'Daily limit reached — try again tomorrow, or use your own key.', { actions: ['use_own_key'] });
  }
  await env.DB.prepare('INSERT INTO request_log (user_id, day, at) VALUES (?, ?, ?)').bind(user.id, utcDay(), now()).run();
}

async function maybeAlert(env) {
  const L = limits(env);
  const spend = await globalSpendToday(env);
  if (spend < L.globalDailyUsd * L.alertAtFraction) return;
  const day = utcDay();
  const res = await env.DB.prepare('INSERT OR IGNORE INTO alerts (id, kind, message, day, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(newId('al_'), 'global_spend', `Platform AI spend reached $${spend.toFixed(2)} of the $${L.globalDailyUsd} daily cap`, day, now()).run();
  if (res.meta && res.meta.changes && env.ALERT_WEBHOOK_URL) {
    // Optional: a Slack/Discord-style webhook for the owner (FR-ADM-05).
    try { await fetch(env.ALERT_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `AgentFit: platform AI spend is $${spend.toFixed(2)} today (cap $${L.globalDailyUsd}).` }) }); } catch { /* best effort */ }
  }
}

export async function creditBalance(env, userId) {
  const row = await env.DB.prepare('SELECT COALESCE(SUM(credits), 0) AS c FROM ledger_entries WHERE user_id = ?').bind(userId).first();
  return row.c || 0;
}
