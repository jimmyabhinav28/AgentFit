// AgentFit PWA entry: boot, routing, rendering and event delegation.
import { html, raw } from './lib/dom.js';
import { S, update, onRender, toast, loadLocal, loadStatic, syncNow, applyTheme, profile, abandon, paused } from './store.js';
import { api, session } from './api.js';
import * as drive from './drive.js';
import { parse, go } from './router.js';
import * as journey from './screens/journey.js';
import * as today from './screens/today.js';
import * as progress from './screens/progress.js';
import * as coach from './screens/coach.js';
import * as settingsScreen from './screens/settings.js';
import * as plans from './screens/plans.js';
import { welcome, exercise, tutorial } from './screens/misc.js';
import { resumeHref } from './screens/journey.js';

const SCREENS = { welcome, journey, today, progress, coach, settings: settingsScreen, plans, exercise, tutorial };
const ALL_SHEETS = { ...today.sheets, ...progress.sheets, ...coach.sheets, ...plans.sheets };
const PUBLIC = new Set(['welcome', 'tutorial']);
let route = parse();
const app = document.getElementById('app');

function current() { return SCREENS[route.name] || today; }

function render() {
  if (!S.ready) return;
  const scr = current();
  // Keep focus and caret across re-renders (inputs are re-created).
  const a = document.activeElement;
  const focusId = a && a.id;
  const sel = a && 'selectionStart' in a ? [a.selectionStart, a.selectionEnd] : null;
  let body;
  try { body = scr.render(route.params); }
  catch (e) { console.error(e); body = html`<div class="screen"><h1 class="h1">Something went wrong</h1><p class="lead">${e.message}</p><a class="btn secondary md" href="#/today">Go to Today</a></div>`; }
  const sheetFn = S.ui.sheet && ALL_SHEETS[S.ui.sheet.kind];
  const sheet = sheetFn ? html`<div class="overlay" data-action="close-sheet" data-self="1"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${sheetFn(S.ui.sheet)}</div></div>` : '';
  const toastEl = S.ui.toast ? html`<div class="toast" role="status">${S.ui.toast}</div>` : '';
  app.innerHTML = String(html`<div class="shell">${body}</div>${sheet}${toastEl}`);
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el && el !== document.activeElement) {
      el.focus({ preventScroll: true });
      if (sel && 'setSelectionRange' in el) { try { el.setSelectionRange(sel[0], sel[1]); } catch { /* not a text input */ } }
    }
  }
}
onRender(render);

async function navigate() {
  const prev = route;
  route = parse();
  if (prev.name === 'journey' && journey.onLeave && (route.name !== 'journey' || prev.params[1] !== route.params[1])) journey.onLeave();
  if (!S.session && !PUBLIC.has(route.name)) { route = { name: 'welcome', params: [] }; history.replaceState(null, '', '#/welcome'); }
  else if (S.session && route.name === 'welcome' && profile().body && !location.hash.includes('welcome')) go('#/today', { replace: true });
  // Not onboarded yet: the Journey starts from the profile.
  if (S.session && !profile().body && ['today', 'progress'].includes(route.name)) { route = { name: 'welcome', params: [] }; }
  if (S.ui.sheet && prev.name !== route.name) S.ui.sheet = null;
  if (prev.name !== route.name || prev.params.join('/') !== route.params.join('/')) window.scrollTo(0, 0);
  const scr = current();
  render();
  if (scr.onEnter) await scr.onEnter(route.params);
}

// ---------- event delegation ----------
const GLOBAL = {
  'close-sheet': (el, ev) => { if (el.dataset.self && ev.target !== el) return; S.ui.sheet = null; update(); },
  'history-back': () => (history.length > 1 ? history.back() : go('#/today')),
  'hide-banner': el => { S.ui.bannerHidden[el.dataset.kind] = true; update(); },
  'resume-journey': el => go(resumeHref(el.dataset.kind)),
  'abandon-journey': async el => {
    if (!confirm('Abandon this half-finished plan? Your current plans stay as they are.')) return;
    journey.resetDraft(el.dataset.kind);
    await abandon(el.dataset.kind);
    toast('Discarded. Nothing else changed.');
  },
  go: el => go(el.dataset.href),
};
app.addEventListener('click', ev => {
  const el = ev.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const name = el.dataset.action;
  const scr = current();
  const fn = (scr.actions && scr.actions[name]) || GLOBAL[name];
  if (!fn) return;
  ev.preventDefault();
  Promise.resolve(fn(el, ev, route.params)).catch(e => { console.error(e); toast(e.message || 'Something went wrong'); });
});
app.addEventListener('input', ev => {
  const el = ev.target;
  if (!el.dataset.model) return;
  const scr = current();
  if (scr.onInput) scr.onInput(el, route.params);
});
app.addEventListener('change', ev => {
  const el = ev.target;
  const name = el.dataset.change;
  if (!name) return;
  const scr = current();
  const fn = scr.changes && scr.changes[name];
  if (fn) Promise.resolve(fn(el, ev)).catch(e => toast(e.message));
});
app.addEventListener('submit', ev => {
  ev.preventDefault();
  const scr = current();
  const fn = scr.forms && scr.forms[ev.target.dataset.form];
  if (fn) fn(ev.target);
});
app.addEventListener('keydown', ev => {
  const scr = current();
  if (scr.onKeydown) scr.onKeydown(ev);
  if (ev.key === 'Escape' && S.ui.sheet) { S.ui.sheet = null; update(); }
});
window.addEventListener('hashchange', navigate);
window.addEventListener('online', () => { S.online = true; syncNow(); });
window.addEventListener('offline', () => { S.online = false; update(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && S.session) syncNow(); });
window.addEventListener('af:unauthorized', () => { session.clear(); S.session = null; go('#/welcome'); });
window.addEventListener('af:signed-in', () => afterSignIn());

async function afterSignIn() {
  S.ui.authError = null;
  refreshMe();
  await syncNow();
  if (profile().body) { const p = { ...profile() }; delete p.health; api('PUT', '/api/profile', { profile: p }).catch(() => {}); }
  go(profile().body ? '#/today' : '#/welcome', { replace: true });
}
async function refreshMe() {
  try { S.me = await api('GET', '/api/me'); } catch { /* offline */ }
  try { const b = await api('GET', '/api/videos/broken'); S.broken = new Set(b.broken.map(x => `${x.exercise_id}:${x.video_id}`)); } catch { /* ignore */ }
  update();
}

// ---------- boot ----------
async function boot() {
  applyTheme();
  await Promise.all([loadLocal(), loadStatic()]);
  applyTheme();
  const r = drive.handleRedirect();
  if (r.status === 'ok') {
    try {
      const info = await drive.userinfo().catch(() => ({}));
      const out = await api('POST', '/api/auth/google', { accessToken: r.accessToken, name: info.given_name || info.name });
      session.set({ token: out.token, email: info.email, name: info.given_name || info.name });
      S.session = session.get();
      if (!profile().name && info.given_name) S.doc.profile = { ...(S.doc.profile || {}), name: info.given_name };
    } catch (e) { S.ui.authError = e.message; }
  } else if (r.status === 'denied') {
    S.ui.authError = r.reason === 'drive' ? 'AgentFit needs permission to keep your plans in an AgentFit folder in your Google Drive. Please sign in again and leave that box ticked.' : 'Google sign-in was cancelled.';
  }
  S.ready = true;
  route = parse();
  await navigate();
  if (S.session) {
    refreshMe();
    syncNow().then(() => { if (route.name === 'welcome' && profile().body) go('#/today', { replace: true }); else update(); });
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
}
boot();
export { raw };
