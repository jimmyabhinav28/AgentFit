// Google sign-in (redirect flow, works inside installed web apps) and the user's
// AgentFit folder in Google Drive, where plans, logs, planner answers and health
// reports live (PL-07, HD-01).
//
// My Drive/
//   AgentFit/                     ← created by the app (found by appProperties, so renaming is fine)
//     agentfit-data.json          ← everything the app syncs: profile, plan versions, logs, levels, answers
//     planner-answers.json        ← a readable copy of your workout and food planner answers
//     About this folder.txt
//     Health reports/             ← reports you upload in the Health step
//
// The drive.file permission only lets AgentFit see files it created. drive.appdata
// (the hidden app folder) is kept only to import the earlier app's backup.
import { CLIENT_ID } from './config.js';

const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata';
const TOKEN_KEY = 'af.gtoken';
const DATA_FILE = 'agentfit-data.json';
const ANSWERS_FILE = 'planner-answers.json';
const ABOUT_FILE = 'About this folder.txt';
const FOLDER_NAME = 'AgentFit';
const HEALTH_FOLDER_NAME = 'Health reports';
const LEGACY_FILE = 'fitness-data.json'; // the earlier personal app, in the hidden app folder
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export const configured = () => !!CLIENT_ID && !CLIENT_ID.startsWith('PASTE');

function redirectUri() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

export function token() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    if (t && t.expiresAt > Date.now() + 30000) return t.accessToken;
  } catch { /* ignore */ }
  return null;
}
export function forgetToken() { localStorage.removeItem(TOKEN_KEY); }

export function signIn({ silent = false, hint = '' } = {}) {
  const state = Math.random().toString(36).slice(2);
  sessionStorage.setItem('af.oauthState', state);
  sessionStorage.setItem('af.returnTo', location.hash || '#/today');
  const p = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: redirectUri(), response_type: 'token', scope: SCOPES, include_granted_scopes: 'true', state });
  if (silent) p.set('prompt', 'none');
  if (hint) p.set('login_hint', hint);
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p.toString());
}

// On load: returns { status: 'ok' | 'denied' | 'none', accessToken?, returnTo? }
export function handleRedirect() {
  if (!location.hash.includes('access_token') && !location.hash.includes('error=')) return { status: 'none' };
  const h = new URLSearchParams(location.hash.slice(1));
  const returnTo = sessionStorage.getItem('af.returnTo') || '#/today';
  history.replaceState(null, '', redirectUri() + returnTo);
  const expected = sessionStorage.getItem('af.oauthState');
  sessionStorage.removeItem('af.oauthState');
  if (h.get('error')) return { status: ['interaction_required', 'login_required', 'consent_required'].includes(h.get('error')) ? 'none' : 'denied', returnTo };
  if (expected && h.get('state') !== expected) return { status: 'denied', returnTo };
  // Google lets people untick permissions; the AgentFit folder needs drive.file.
  if (!(h.get('scope') || '').includes('drive.file')) return { status: 'denied', returnTo, reason: 'drive' };
  const accessToken = h.get('access_token');
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken, expiresAt: Date.now() + Number(h.get('expires_in') || 3600) * 1000 }));
  return { status: 'ok', accessToken, returnTo };
}

export function signOut() {
  const t = token();
  forgetToken();
  if (t) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t), { method: 'POST' }).catch(() => {});
}

export async function userinfo() {
  const r = await api('https://www.googleapis.com/oauth2/v3/userinfo');
  return r.json();
}

async function api(url, opts = {}) {
  const t = token();
  if (!t) throw new Error('no-token');
  const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + t, ...(opts.headers || {}) } });
  if (r.status === 401) { forgetToken(); throw new Error('no-token'); }
  if (!r.ok) throw new Error('drive ' + r.status);
  return r;
}
const q = s => encodeURIComponent(s);
const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// ---------- folders ----------
const cache = { root: null, health: null, files: {} };
export function resetCache() { cache.root = null; cache.health = null; cache.files = {}; }

async function findByAppProperty(value) {
  const j = await (await api(`${API}/files?fields=files(id,name)&q=${q(`appProperties has { key='agentfit' and value='${value}' } and mimeType='${FOLDER_MIME}' and trashed=false`)}`)).json();
  return j.files && j.files[0] ? j.files[0].id : null;
}
async function createFolder(name, value, parent) {
  const r = await api(`${API}/files?fields=id`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, appProperties: { agentfit: value }, ...(parent ? { parents: [parent] } : {}) }),
  });
  return (await r.json()).id;
}
async function rootFolder() {
  if (cache.root) return cache.root;
  cache.root = (await findByAppProperty('root')) || (await createFolder(FOLDER_NAME, 'root'));
  return cache.root;
}
async function healthFolder() {
  if (cache.health) return cache.health;
  cache.health = (await findByAppProperty('health')) || (await createFolder(HEALTH_FOLDER_NAME, 'health', await rootFolder()));
  return cache.health;
}
export async function folderUrl() {
  return 'https://drive.google.com/drive/folders/' + (await rootFolder());
}

// ---------- files in the AgentFit folder ----------
async function findInFolder(name, parent) {
  const key = parent + '/' + name;
  if (cache.files[key]) return cache.files[key];
  const j = await (await api(`${API}/files?fields=files(id,name)&q=${q(`name='${esc(name)}' and '${parent}' in parents and trashed=false`)}`)).json();
  cache.files[key] = j.files && j.files[0] ? j.files[0].id : null;
  return cache.files[key];
}
async function writeFile(name, body, mime, parent) {
  const id = await findInFolder(name, parent);
  if (id) {
    await api(`${UPLOAD}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': mime }, body });
    return id;
  }
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name, parents: [parent] })], { type: 'application/json' }));
  form.append('file', body instanceof Blob ? body : new Blob([body], { type: mime }));
  const r = await api(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', body: form });
  const newId = (await r.json()).id;
  cache.files[parent + '/' + name] = newId;
  return newId;
}
async function readJson(id) {
  return (await api(`${API}/files/${id}?alt=media`)).json();
}

const ABOUT = `This folder was created by AgentFit.

agentfit-data.json     Your profile, plan versions, workout and meal logs, levels and planner answers.
                       AgentFit reads and writes it; please don't edit it by hand.
planner-answers.json   A readable copy of your answers to the workout and food planners.
Health reports/        Reports you added in the Health step. They are never stored on AgentFit's servers.

AgentFit can only see files it created here. Deleting this folder removes your AgentFit data
from Google Drive (the app keeps a copy on your device until you sign out).
`;

export async function pullData() {
  const folder = await rootFolder();
  const id = await findInFolder(DATA_FILE, folder);
  if (id) return readJson(id);
  // Data written by an earlier build into the hidden app folder is picked up once.
  return readHidden(DATA_FILE);
}
export async function pushData(data) {
  const folder = await rootFolder();
  const isNew = !(await findInFolder(DATA_FILE, folder));
  await writeFile(DATA_FILE, JSON.stringify(data), 'application/json', folder);
  await writeFile(ANSWERS_FILE, JSON.stringify(answersView(data), null, 2), 'application/json', folder);
  if (isNew && !(await findInFolder(ABOUT_FILE, folder))) await writeFile(ABOUT_FILE, ABOUT, 'text/plain', folder);
}

// A readable summary of the planner answers, written next to the data file.
export function answersView(data) {
  const out = { note: 'Your answers to the AgentFit planners. "inProgress" is a planner you have not finished; "lastCompleted" is what your current plan was built from.', updatedAt: new Date().toISOString() };
  for (const kind of ['workout', 'food']) {
    const done = data.answers && data.answers[kind];
    const open = data.paused && data.paused[kind];
    out[kind] = {
      lastCompleted: done ? { completedAt: new Date(done.completedAt).toISOString(), planVersion: done.planVersion, answers: done.answers } : null,
      inProgress: open ? { step: open.step, startedAt: new Date(open.startedAt).toISOString(), answers: open.answers } : null,
    };
  }
  out.profile = data.profile ? { ...data.profile, health: data.profile.health ? 'see Health in agentfit-data.json' : null } : null;
  return out;
}

// ---------- the hidden app folder (legacy import only) ----------
async function readHidden(name) {
  const j = await (await api(`${API}/files?spaces=appDataFolder&fields=files(id,name)&q=${q(`name='${esc(name)}'`)}`)).json();
  const id = j.files && j.files[0] ? j.files[0].id : null;
  return id ? readJson(id) : null;
}
export const pullLegacy = () => readHidden(LEGACY_FILE);

// ---------- health reports (§3A.1): up to 5 files ----------
export async function listHealthFiles() {
  const folder = await healthFolder();
  const j = await (await api(`${API}/files?fields=files(id,name,size,mimeType,modifiedTime)&q=${q(`'${folder}' in parents and trashed=false`)}`)).json();
  return (j.files || []).map(f => ({ ...f, displayName: f.name }));
}
export async function uploadHealthFile(file) {
  const folder = await healthFolder();
  const existing = await listHealthFiles();
  let name = file.name;
  if (existing.some(f => f.name === name)) name = name.replace(/(\.[^.]+)?$/, ` (${Date.now()})$1`);
  return writeFile(name, file, file.type || 'application/octet-stream', folder);
}
export async function deleteFile(id) {
  await api(`${API}/files/${id}`, { method: 'DELETE' });
  for (const k of Object.keys(cache.files)) if (cache.files[k] === id) delete cache.files[k];
}
// Account deletion: removes the whole AgentFit folder (and anything AgentFit put in the hidden folder).
export async function deleteAllAppData() {
  const root = (await findByAppProperty('root'));
  if (root) await api(`${API}/files/${root}`, { method: 'DELETE' });
  const j = await (await api(`${API}/files?spaces=appDataFolder&fields=files(id,name)`)).json();
  for (const f of j.files || []) if (f.name !== LEGACY_FILE) await api(`${API}/files/${f.id}`, { method: 'DELETE' });
  resetCache();
}
