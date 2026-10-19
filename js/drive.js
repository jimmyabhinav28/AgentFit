// Google sign-in (OAuth implicit flow, redirect based so it works inside
// installed web apps on iPhone and Android) and Drive app-data sync.
import { CLIENT_ID } from './config.js';

const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.appdata';
const TOKEN_KEY = 'fit.token';
const USER_KEY = 'fit.user';
const FILE_NAME = 'fitness-data.json';

export const configured = () => !!CLIENT_ID && !CLIENT_ID.startsWith('PASTE');

function redirectUri() {
  // The app folder, without query, hash or a trailing index.html, so it always
  // matches the redirect URI registered in Google Cloud (…/AgentFit/).
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

export function token() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    if (t && t.expiresAt > Date.now() + 30000) return t.accessToken;
  } catch {}
  return null;
}
export function user() { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } }
export const signedInBefore = () => !!user();

// Send the browser to Google. silent = try without showing UI.
export function signIn({ silent = false } = {}) {
  const state = Math.random().toString(36).slice(2);
  sessionStorage.setItem('fit.oauthState', state);
  const p = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: redirectUri(), response_type: 'token',
    scope: SCOPES, include_granted_scopes: 'true', state,
  });
  if (silent) p.set('prompt', 'none');
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p.toString());
}

// Called on every page load. Returns 'ok' | 'denied' | 'none'.
export async function handleRedirect() {
  if (!location.hash.includes('access_token') && !location.hash.includes('error=')) return 'none';
  const h = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', redirectUri());
  const expected = sessionStorage.getItem('fit.oauthState');
  sessionStorage.removeItem('fit.oauthState');
  if (h.get('error')) return h.get('error') === 'interaction_required' || h.get('error') === 'login_required' ? 'none' : 'denied';
  if (expected && h.get('state') !== expected) return 'denied';
  const scope = h.get('scope') || '';
  if (!scope.includes('drive.appdata')) return 'denied';
  const accessToken = h.get('access_token');
  const expiresIn = Number(h.get('expires_in') || 3600);
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken, expiresAt: Date.now() + expiresIn * 1000 }));
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + accessToken } });
    if (r.ok) localStorage.setItem(USER_KEY, JSON.stringify(await r.json()));
  } catch {}
  return 'ok';
}

export function signOut() {
  const t = token();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  if (t) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t), { method: 'POST' }).catch(() => {});
}

// ---------- Drive ----------
async function api(path, opts = {}) {
  const t = token();
  if (!t) throw new Error('no-token');
  const r = await fetch(path, { ...opts, headers: { Authorization: 'Bearer ' + t, ...(opts.headers || {}) } });
  if (r.status === 401) { localStorage.removeItem(TOKEN_KEY); throw new Error('no-token'); }
  if (!r.ok) throw new Error('drive ' + r.status);
  return r;
}
let fileId = null;
async function findFile() {
  if (fileId) return fileId;
  const r = await api(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,modifiedTime)&q=${encodeURIComponent(`name='${FILE_NAME}'`)}`);
  const j = await r.json();
  fileId = j.files && j.files[0] ? j.files[0].id : null;
  return fileId;
}
export async function pull() {
  const id = await findFile();
  if (!id) return null;
  const r = await api(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  return r.json();
}
export async function push(data) {
  const body = JSON.stringify(data);
  const id = await findFile();
  if (id) {
    await api(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    return;
  }
  const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
  const boundary = 'fitboundary' + Date.now();
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const r = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart,
  });
  fileId = (await r.json()).id;
}
