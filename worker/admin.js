// Admin dashboard data (FR-ADM-01..05) and the weekly video link check (FR-LIB-06).
import { HttpError, utcDay, now } from './http.js';
import { limits, platform, models } from './config.js';
import { exerciseLibrary } from './library.js';

export async function summary(env) {
  const today = utcDay();
  const since = utcDay(Date.now() - 13 * 86400000);
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b);
  const [byDay, byModel, topUsers, caps, users, active, alerts, videos, custom] = await env.DB.batch([
    q(`SELECT day, mode, COUNT(*) AS calls, SUM(tokens_in) AS tin, SUM(tokens_out) AS tout, SUM(est_cost_usd_micros) AS micros FROM usage_events WHERE day >= ? GROUP BY day, mode ORDER BY day DESC`, since),
    q(`SELECT provider, model, purpose, mode, COUNT(*) AS calls, SUM(tokens_in) AS tin, SUM(tokens_out) AS tout, SUM(est_cost_usd_micros) AS micros FROM usage_events WHERE day >= ? GROUP BY provider, model, purpose, mode ORDER BY micros DESC`, since),
    q(`SELECT u.email, SUM(e.tokens_in + e.tokens_out) AS tokens, SUM(e.est_cost_usd_micros) AS micros FROM usage_events e JOIN users u ON u.id = e.user_id WHERE e.day = ? GROUP BY e.user_id ORDER BY micros DESC LIMIT 20`, today),
    q(`SELECT c.day, c.kind, c.count, u.email FROM cap_hits c LEFT JOIN users u ON u.id = c.user_id WHERE c.day >= ? ORDER BY c.day DESC LIMIT 100`, since),
    q(`SELECT COUNT(*) AS n FROM users`),
    q(`SELECT COUNT(*) AS n FROM users WHERE last_active_at > ?`, now() - 7 * 86400000),
    q(`SELECT kind, message, day FROM alerts ORDER BY created_at DESC LIMIT 20`),
    q(`SELECT exercise_id, video_id, status, checked_at FROM video_alerts ORDER BY checked_at DESC LIMIT 100`),
    q(`SELECT c.id, c.name, c.details_json, c.review_status, c.created_at, u.email FROM custom_exercises c LEFT JOIN users u ON u.id = c.user_id WHERE c.review_status = 'pending' ORDER BY c.created_at DESC LIMIT 100`),
  ]);
  const p = platform(env);
  return {
    today,
    limits: limits(env),
    platform: { provider: p.provider, model: p.model, cheapModel: p.cheapModel, configured: !!p.apiKey },
    models: models(env),
    users: users.results[0].n, activeUsers7d: active.results[0].n,
    byDay: byDay.results, byModel: byModel.results, topUsersToday: topUsers.results, capHits: caps.results,
    alerts: alerts.results, videoAlerts: videos.results, customExercises: custom.results,
  };
}

export async function reviewCustom(env, body) {
  if (!['approved', 'rejected'].includes(body.status)) throw new HttpError(400, 'bad_status', 'status must be approved or rejected');
  await env.DB.prepare('UPDATE custom_exercises SET review_status = ? WHERE id = ?').bind(body.status, body.id).run();
  return { ok: true };
}

// Weekly cron: flag removed or private YouTube videos. The app then falls back to the next-ranked video.
export async function checkVideos(env, fetchImpl = fetch) {
  await env.DB.prepare('DELETE FROM request_log WHERE at < ?').bind(now() - 2 * 86400000).run();
  const lib = await exerciseLibrary(env);
  let checked = 0;
  for (const ex of Object.values(lib)) {
    for (const v of ex.videos || []) {
      if (v.provider !== 'youtube' || !v.videoId) continue;
      checked++;
      let status = 'ok';
      try {
        const r = await fetchImpl('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + v.videoId));
        if (r.status === 401 || r.status === 403) status = 'private';
        else if (r.status === 404 || r.status === 400) status = 'removed';
        else if (!r.ok) status = 'error';
      } catch { status = 'error'; }
      if (status === 'ok') await env.DB.prepare('DELETE FROM video_alerts WHERE exercise_id = ? AND video_id = ?').bind(ex.id, v.videoId).run();
      else await env.DB.prepare('INSERT INTO video_alerts (exercise_id, video_id, status, checked_at) VALUES (?, ?, ?, ?) ON CONFLICT(exercise_id, video_id) DO UPDATE SET status = excluded.status, checked_at = excluded.checked_at').bind(ex.id, v.videoId, status, now()).run();
    }
  }
  return { checked };
}

export async function brokenVideos(env) {
  const { results } = await env.DB.prepare("SELECT exercise_id, video_id FROM video_alerts WHERE status IN ('removed', 'private')").all();
  return results;
}
