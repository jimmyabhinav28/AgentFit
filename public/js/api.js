// Calls to the AgentFit Worker. BYOK keys travel only in a header, per request (FR-BYOK-03).
import { API_BASE } from './config.js';

const SESSION_KEY = 'af.session';
export const session = {
  get() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } },
  set(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); },
  clear() { localStorage.removeItem(SESSION_KEY); },
};

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) { super(message); this.status = status; this.code = code; Object.assign(this, extra); }
}

function headers(extra = {}) {
  const s = session.get();
  return { 'content-type': 'application/json', ...(s && s.token ? { authorization: 'Bearer ' + s.token } : {}), ...extra };
}

export async function api(method, path, body, { key } = {}) {
  let r;
  try {
    r = await fetch(API_BASE + path, { method, headers: headers(key ? { 'x-provider-key': key } : {}), body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'offline', 'You seem to be offline. Coach needs a connection.');
  }
  const ct = r.headers.get('content-type') || '';
  const j = ct.includes('json') ? await r.json() : {};
  if (!r.ok) {
    const e = j.error || {};
    if (r.status === 401) window.dispatchEvent(new CustomEvent('af:unauthorized'));
    throw new ApiError(r.status, e.code || 'error', e.message || 'Request failed.', { actions: e.actions || [] });
  }
  return j;
}

// Server-sent events: calls onEvent(type, data) for each event. Returns when the stream ends.
export async function stream(path, body, { key, signal, onEvent }) {
  let r;
  try {
    r = await fetch(API_BASE + path, { method: 'POST', headers: headers(key ? { 'x-provider-key': key } : {}), body: JSON.stringify(body), signal });
  } catch (e) {
    if (e.name === 'AbortError') return;
    throw new ApiError(0, 'offline', 'You seem to be offline. Coach needs a connection.');
  }
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    const e = j.error || {};
    if (r.status === 401) window.dispatchEvent(new CustomEvent('af:unauthorized'));
    throw new ApiError(r.status, e.code || 'error', e.message || 'Request failed.', { actions: e.actions || [] });
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = /^event: (.*)$/m.exec(chunk), data = /^data: (.*)$/m.exec(chunk);
        if (ev && data) onEvent(ev[1], JSON.parse(data[1]));
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') throw new ApiError(0, 'stream_broken', 'The connection dropped. Try again.');
  }
}
