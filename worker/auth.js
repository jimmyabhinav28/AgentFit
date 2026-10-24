// Sign-in with Google (FR-ACC-01) and AgentFit session tokens.
// The PWA already holds a Google access token for Drive; it sends it once here.
// We check it was issued to our OAuth client, then issue our own signed session token.
import { HttpError, newId, now } from './http.js';
import { limits } from './config.js';

const SESSION_DAYS = 30;
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = s => b64url(new TextEncoder().encode(s));
const fromB64url = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));

async function hmacKey(secret) {
  if (!secret || secret.length < 32) throw new HttpError(500, 'misconfigured', 'SESSION_SECRET is not set (32+ characters).');
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signSession(env, payload) {
  const body = b64urlText(JSON.stringify({ ...payload, exp: now() + SESSION_DAYS * 86400000 }));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env.SESSION_SECRET), new TextEncoder().encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(env, token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const key = await hmacKey(env.SESSION_SECRET);
  const sigBytes = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const ok = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(body));
  if (!ok) return null;
  const p = JSON.parse(fromB64url(body));
  if (!p.exp || p.exp < now()) return null;
  return p;
}

export async function requireUser(request, env) {
  const h = request.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const p = await verifySession(env, token);
  if (!p) throw new HttpError(401, 'unauthorized', 'Please sign in again.');
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(p.uid).first();
  if (!user) throw new HttpError(401, 'unauthorized', 'Please sign in again.');
  return user;
}

export function isAdmin(env, user) {
  const admins = (env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  return !!user.is_admin || admins.includes(String(user.email).toLowerCase());
}

async function verifyGoogleAccessToken(env, accessToken, fetchImpl = fetch) {
  const r = await fetchImpl('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken));
  if (!r.ok) throw new HttpError(401, 'google_token_invalid', 'Google sign-in could not be confirmed. Please sign in again.');
  const info = await r.json();
  const aud = info.aud || info.azp;
  if (!env.GOOGLE_CLIENT_ID || aud !== env.GOOGLE_CLIENT_ID) throw new HttpError(401, 'google_token_wrong_client', 'This Google sign-in was not issued for AgentFit.');
  if (!info.email || String(info.email_verified) !== 'true') throw new HttpError(401, 'google_email_unverified', 'Your Google email needs to be verified.');
  return { sub: info.sub, email: info.email };
}

async function upsertUser(env, { sub, email, name, provider }) {
  let user = sub
    ? await env.DB.prepare('SELECT * FROM users WHERE google_sub = ?').bind(sub).first()
    : await env.DB.prepare('SELECT * FROM users WHERE email = ? AND auth_provider = ?').bind(email, provider).first();
  const t = now();
  let isNew = false;
  if (!user) {
    isNew = true;
    const id = newId('u_');
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users (id, google_sub, email, name, auth_provider, created_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, sub || null, email, name || null, provider, t, t),
      // V1-CR-01: the starter grant, recorded once.
      env.DB.prepare('INSERT OR IGNORE INTO ledger_entries (id, user_id, type, credits, ref_type, ref_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(newId('l_'), id, 'grant', limits(env).starterCredits, 'starter_grant', id, 'v1 starter credits', t),
    ]);
    user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  } else {
    await env.DB.prepare('UPDATE users SET last_active_at = ?, email = ? WHERE id = ?').bind(t, email, user.id).run();
  }
  return { user, isNew };
}

export async function googleSignIn(env, body, fetchImpl) {
  if (!body.accessToken) throw new HttpError(400, 'missing_token', 'accessToken is required.');
  const g = await verifyGoogleAccessToken(env, body.accessToken, fetchImpl);
  const { user, isNew } = await upsertUser(env, { sub: g.sub, email: g.email, name: body.name, provider: 'google' });
  return { token: await signSession(env, { uid: user.id }), isNew };
}

// Local development only (DEV_AUTH = "1"): sign in with just an email.
export async function devSignIn(env, body) {
  if (env.DEV_AUTH !== '1') throw new HttpError(404, 'not_found', 'Not found.');
  const email = String(body.email || 'dev@example.com').toLowerCase();
  const { user, isNew } = await upsertUser(env, { sub: 'dev:' + email, email, name: body.name || 'Dev', provider: 'dev' });
  return { token: await signSession(env, { uid: user.id }), isNew };
}
