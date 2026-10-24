// Settings (§4.6): profile, memory, plans, credits, AI provider, health, schedule, units, data.
import { html, icon, when, esc } from '../lib/dom.js';
import { S, update, toast, profile, setProfile, settings, setSettings, setKey, versions, activeVersion, upcoming, sectionState, syncNow, saveDoc, abandon, today } from '../store.js';
import { api, session } from '../api.js';
import * as drive from '../drive.js';
import * as idb from '../lib/idb.js';
import { emptyDoc } from '../core/merge.js';
import { shortDate, WEEKDAYS } from '../core/dates.js';
import { tabbar, resumeBanner } from './common.js';
import { resetDraft } from './journey.js';
import { go } from '../router.js';

const PROVIDERS = [['anthropic', 'Claude', 'https://console.anthropic.com/settings/keys'], ['openai', 'OpenAI', 'https://platform.openai.com/api-keys'], ['gemini', 'Gemini', 'https://aistudio.google.com/app/apikey']];
const st = { memory: null, keyDraft: {}, testing: null, editNote: null, exporting: false };
const back = html`<a class="iconbtn" href="#/settings" aria-label="Back to settings">${icon('back')}</a>`;
const head = title => html`<div class="topbar">${back}<span class="title">${title}</span><span class="spacer44"></span></div>`;
const seg = (action, value, opts) => html`<div class="seg">${opts.map(([v, l]) => html`<button type="button" class="chip" data-action="${action}" data-v="${v}" aria-pressed="${value === v}">${l}</button>`)}</div>`;

export async function onEnter(params) {
  if (params[0] === 'memory') { st.memory = null; update(); try { st.memory = await api('GET', '/api/memory'); } catch (e) { st.memory = { error: e.message, notes: [] }; } update(); }
}

export function render(params) {
  const s = params[0];
  if (s === 'profile') return profilePage();
  if (s === 'memory') return memoryPage();
  if (s === 'credits') return creditsPage();
  if (s === 'ai') return aiPage();
  if (s === 'health') return healthPage();
  if (s === 'schedule') return schedulePage();
  if (s === 'data') return dataPage();
  return mainPage();
}

function mainPage() {
  const row = (href, ic, t1, t2) => html`<a class="listrow" href="${href}">${icon(ic, 20)}<span class="t" style="flex:1"><span class="t1">${t1}</span>${when(t2, () => html`<span class="t2">${t2}</span>`)}</span>${icon('fwd', 18)}</a>`;
  const plan = k => { const s = sectionState(k); const v = activeVersion(k) || upcoming(k); return v ? `v${v.version} · ${s === 'active' ? 'active since ' + shortDate(v.effectiveFrom) : 'starts ' + shortDate(v.effectiveFrom)}` : s === 'paused' ? 'planning paused' : 'not planned'; };
  const sync = S.sync;
  const syncText = { ok: `Synced to Google Drive ${S.sync.lastAt ? 'at ' + new Date(S.sync.lastAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`, syncing: 'Syncing…', 'needs-auth': 'Drive sync paused: sign in again', offline: 'Offline: saved on this device', error: 'Sync failed: tap to retry', local: 'Saved on this device (dev mode)', idle: 'Saved on this device' }[sync.state] || '';
  return html`<div class="screen">
    <h1 class="h1">Settings</h1>
    ${resumeBanner('workout')}${resumeBanner('food')}
    <div class="row small" style="gap:6px">${icon('cloud', 16)}<button class="linkbtn" style="min-height:32px;font-size:13px;color:var(--text-2)" data-action="${sync.state === 'needs-auth' ? 'reauth' : 'sync-now'}">${syncText}</button></div>
    <div class="card">
      ${row('#/settings/profile', 'user', 'Profile', [profile().name, S.session && S.session.email].filter(Boolean).join(' · '))}
      ${row('#/settings/memory', 'brain', 'Memory', 'What AgentFit knows about you')}
      ${row('#/plans', 'list', 'My plans', `Workout ${plan('workout')} · Food ${plan('food')}`)}
    </div>
    <div class="card">
      ${row('#/settings/credits', 'coin', 'Credits', `${S.me ? S.me.credits : 100} credits`)}
      ${row('#/settings/ai', 'key', 'AI provider', settings().ai.mode === 'byok' ? `Your ${PROVIDERS.find(p => p[0] === settings().ai.provider)[1]} key` : 'AgentFit credits')}
    </div>
    <div class="card">
      ${row('#/settings/health', 'shield', 'Health', 'Disclosures and reports in your Drive')}
      ${row('#/settings/schedule', 'cal', 'Schedule, units and theme', `Week starts ${settings().weekStartsOn === 'SUN' ? 'Sunday' : 'Monday'} · ${settings().units.weight}, ${settings().units.distance}`)}
      ${row('#/settings/data', 'db', 'Data', 'Export, import, delete')}
      ${row('#/tutorial', 'book', 'How AgentFit works', '')}
    </div>
    <div class="card pad"><span class="strong">Reassess</span><span class="small">Run a planner again. You get a new plan version; nothing changes until you accept it.</span>
      <div class="btnrow"><button class="btn secondary sm grow" data-action="rerun" data-kind="workout">Workout planner</button><button class="btn secondary sm grow" data-action="rerun" data-kind="food">Food planner</button></div></div>
    <p class="small" style="text-align:center">General fitness information, not medical advice.</p>
  </div>${tabbar('settings')}`;
}

function profilePage() {
  const p = profile();
  const b = p.body || {}, loc = p.location || {};
  return html`<div class="screen">${head('Profile')}
    <div class="field"><label class="label" for="pn">First name</label><input class="input" id="pn" data-model="name" value="${p.name || ''}"></div>
    <div class="grid2">
      <div class="field"><label class="label" for="ph">Height</label><div class="inputunit"><input id="ph" inputmode="decimal" data-model="body.heightCm" value="${b.heightCm || ''}"><span>cm</span></div></div>
      <div class="field"><label class="label" for="pw">Weight</label><div class="inputunit"><input id="pw" inputmode="decimal" data-model="body.weightKg" value="${b.weightKg || ''}"><span>kg</span></div></div>
    </div>
    <div class="field"><label class="label" for="pd">Date of birth</label><input class="input" id="pd" type="date" data-model="body.dob" value="${b.dob || ''}"></div>
    <div class="grid2"><div class="field"><label class="label" for="pc">Country</label><input class="input" id="pc" data-model="location.country" value="${loc.country || ''}"></div><div class="field"><label class="label" for="pt">City or pincode</label><input class="input" id="pt" data-model="location.city" value="${loc.city || ''}"></div></div>
    <div class="card pad"><span class="strong">From your planners</span>
      <span class="small">Purpose: ${(p.purpose && p.purpose.kind) || '—'}${p.purpose && p.purpose.goal ? ` · goal: ${p.purpose.goal.title}` : ''}</span>
      <span class="small">Training: ${p.training ? (p.training.where || []).join(', ') : '—'}${p.schedule ? ` · ${(p.schedule.days || []).length} days a week, ${p.schedule.sessionMinutes} min` : ''}</span>
      <span class="small">Food: ${p.food ? `${p.food.dietType}${(p.food.restrictedDays || []).length ? `, restricted on ${p.food.restrictedDays.join('/')}` : ''}${p.food.eatingWindow ? `, ${p.food.eatingWindow.start}–${p.food.eatingWindow.end}` : ''}` : '—'}</span>
      <span class="small">Change these by running a planner again, or ask Coach.</span></div>
  </div>${tabbar('settings')}`;
}

function memoryPage() {
  const m = st.memory;
  return html`<div class="screen">${head('Memory')}
    <div><h1 class="h1">What AgentFit knows about you</h1><p class="lead">Short notes the coach remembers between chats. Edit or delete any of them.</p></div>
    ${!m ? html`<div class="spinner" role="status" aria-label="Loading"></div>` : html`
      <label class="row card pad" style="flex-direction:row;justify-content:space-between"><span class="stack tight"><span class="strong">Remember things from chats</span><span class="small">When off, nothing new is saved and notes aren't used.</span></span><input type="checkbox" data-change="memory-toggle" ${m.enabled ? 'checked' : ''} style="width:22px;height:22px"></label>
      ${when(m.error, () => html`<div class="note">${m.error}</div>`)}
      <div class="card">${m.notes.length ? m.notes.map(n => st.editNote === n.id ? html`<div class="listrow" style="gap:8px"><input class="input" style="height:42px" id="note-${n.id}" value="${n.text}" aria-label="Edit note"><button class="btn primary sm" data-action="save-note" data-v="${n.id}">Save</button></div>`
        : html`<div class="listrow"><span class="t" style="flex:1"><span class="t1">${n.text}</span><span class="t2">${new Date(n.updated_at).toLocaleDateString()}</span></span>
          <button class="iconbtn sm ghost" data-action="edit-note" data-v="${n.id}" aria-label="Edit note">${icon('edit', 16)}</button><button class="iconbtn sm ghost" data-action="delete-note" data-v="${n.id}" aria-label="Delete note">${icon('trash', 16)}</button></div>`)
        : html`<div class="listrow"><span class="small">Nothing yet. Notes appear as you chat with Coach.</span></div>`}</div>
      <div class="row"><input class="input" id="newnote" placeholder="Add a note, e.g. dislikes karela" aria-label="New note"><button class="btn primary sm" data-action="add-note">Add</button></div>
      ${when(m.notes.length, () => html`<button class="btn danger md" data-action="forget-all">Delete all notes</button>`)}`}
  </div>${tabbar('settings')}`;
}

function creditsPage() {
  const me = S.me;
  return html`<div class="screen">${head('Credits')}
    <div class="card pad" style="align-items:flex-start"><span class="small">Balance</span><span class="h1" style="font-size:36px">${me ? me.credits : 100}</span><span class="small">credits</span></div>
    <div class="note">During the first release nothing is deducted. Coach and planning use AgentFit's AI with a daily limit${me ? ` (${Math.round((me.usageToday.tokens / me.limits.userDailyTokens) * 100)}% used today)` : ''}. Add your own API key for unlimited use.</div>
    <button class="btn secondary md" disabled>Top-ups coming soon</button>
    <a class="btn secondary md" href="#/settings/ai">Use my own API key</a>
  </div>${tabbar('settings')}`;
}

function aiPage() {
  const ai = settings().ai;
  const models = (S.me && S.me.models) || {};
  return html`<div class="screen">${head('AI provider')}
    <div class="stack tight"><span class="label">Who pays for the AI</span>${seg('ai-mode', ai.mode === 'byok' ? 'byok' : 'credits', [['credits', 'AgentFit credits'], ['byok', 'My own key']])}</div>
    <div class="note">A Claude Pro or ChatGPT Plus subscription does not include API credits. Your own key is billed by the provider. Keys stay on this device only and are sent with each request, never stored by AgentFit.</div>
    ${PROVIDERS.map(([p, name, url]) => {
      const has = !!S.byok[p];
      const list = models[p] || [];
      return html`<div class="card pad">
        <div class="row between"><span class="strong">${name}</span>${has ? html`<span class="pill sage" style="height:24px">${icon('check', 12, 2.5)} Key saved</span>` : html`<a class="small" href="${url}" target="_blank" rel="noopener">Get a key</a>`}</div>
        ${has ? html`<div class="btnrow"><button class="btn secondary sm grow" data-action="use-key" data-v="${p}" ${ai.mode === 'byok' && ai.provider === p ? 'disabled' : ''}>${ai.mode === 'byok' && ai.provider === p ? 'In use' : 'Use this key'}</button><button class="btn secondary sm" data-action="test-key" data-v="${p}">${st.testing === p ? 'Testing…' : 'Test'}</button><button class="btn danger sm" data-action="remove-key" data-v="${p}">Remove</button></div>`
          : html`<div class="row"><input class="input" type="password" autocomplete="off" id="key-${p}" placeholder="Paste your ${name} API key" aria-label="${name} API key" style="height:44px"><button class="btn primary sm" data-action="save-key" data-v="${p}">${st.testing === p ? 'Checking…' : 'Save'}</button></div>`}
        ${when(list.length && has, () => html`<label class="small" for="model-${p}">Model</label><select class="select" style="height:44px" id="model-${p}" data-change="model" data-p="${p}">${list.map(m => html`<option value="${m.id}" ${ai.provider === p && ai.model === m.id ? 'selected' : ''}>${m.label}</option>`)}</select>`)}
      </div>`;
    })}
  </div>${tabbar('settings')}`;
}

function healthPage() {
  const h = profile().health || {};
  return html`<div class="screen">${head('Health')}
    <div><h1 class="h1">Health</h1><p class="lead">Stored only in the AgentFit folder in your Google Drive and on this device. Used only to keep plans safe.</p></div>
    <div class="card pad"><span class="small">Disclosures</span><span>${(h.conditions || []).join(', ') || 'None'}</span>${when(h.notes, () => html`<span class="small">${h.notes}</span>`)}
      <span class="small">Shared with the coach: ${h.shareWithCoach ? 'yes, the reviewed text only' : 'no'}</span></div>
    <a class="btn secondary md" href="#/journey/start/health">Edit health answers and reports</a>
    <button class="btn danger md" data-action="delete-health">Delete all health data</button>
    <p class="small">Deleting removes your answers, the reports in your Drive and any coach notes that mention them.</p>
  </div>${tabbar('settings')}`;
}

function schedulePage() {
  const s = settings();
  return html`<div class="screen">${head('Schedule, units and theme')}
    <div class="field"><label class="label" for="psd">Plan start date (week 1)</label><input class="input" id="psd" type="date" data-change="start-date" value="${s.planStartDate || ''}"><span class="small">Leave empty to start from your first plan.</span></div>
    <div class="stack tight"><span class="label">Week starts on</span>${seg('week-start', s.weekStartsOn, [['MON', 'Monday'], ['SUN', 'Sunday']])}</div>
    <div class="stack tight"><span class="label">Weight</span>${seg('unit-weight', s.units.weight, [['kg', 'kg'], ['lb', 'lb']])}</div>
    <div class="stack tight"><span class="label">Distance</span>${seg('unit-distance', s.units.distance, [['km', 'km'], ['mi', 'mi']])}</div>
    <div class="stack tight"><span class="label">Theme</span>${seg('theme', s.theme, [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']])}</div>
  </div>${tabbar('settings')}`;
}

function dataPage() {
  return html`<div class="screen">${head('Data')}
    <div class="card pad"><span class="strong">Your data in Google Drive</span>
      <span class="small">Plans, logs, levels, your planner answers and health reports are kept in a folder called <b>AgentFit</b> in your Google Drive, plus a copy on this device. AgentFit's servers keep only your account, chats and memory notes.</span>
      <button class="btn secondary sm" data-action="open-folder">${icon('cloud', 16)} Open the AgentFit folder</button></div>
    <div class="card">
      <button class="listrow" data-action="export">${icon('db', 20)}<span class="t" style="flex:1"><span class="t1">${st.exporting ? 'Preparing…' : 'Export all my data'}</span><span class="t2">Plans, logs, profile, chats and memory as JSON</span></span></button>
      <button class="listrow" data-action="import-legacy">${icon('refresh', 20)}<span class="t" style="flex:1"><span class="t1">Import from the old AgentFit</span><span class="t2">Reads its backup from your Drive and gives Coach a summary</span></span></button>
      <button class="listrow" data-action="sync-now">${icon('cloud', 20)}<span class="t" style="flex:1"><span class="t1">Sync now</span><span class="t2">Plans and logs sync with your Google Drive</span></span></button>
      <button class="listrow" data-action="sign-out">${icon('logout', 20)}<span class="t" style="flex:1"><span class="t1">Sign out</span><span class="t2">Removes data from this device; your Drive copy stays</span></span></button>
    </div>
    <button class="btn danger md" data-action="delete-account">Delete my account</button>
    <p class="small">Deletes your AgentFit account, chats and memory, and the AgentFit folder in your Google Drive. This cannot be undone.</p>
  </div>${tabbar('settings')}`;
}

// ---------------- actions ----------------
function setPath(obj, path, value) { const k = path.split('.'); let o = obj; for (let i = 0; i < k.length - 1; i++) o = o[k[i]] = { ...(o[k[i]] || {}) }; o[k[k.length - 1]] = value; }
export async function onInput(el) {
  const m = el.dataset.model;
  if (!m) return;
  const p = structuredClone(profile());
  const num = /Cm$|Kg$/.test(m);
  setPath(p, m, num ? Number(el.value) || null : el.value);
  await setProfile({ name: p.name, body: p.body, location: p.location });
}
export const changes = {
  'memory-toggle': async el => { await api('PUT', '/api/me/settings', { memoryEnabled: el.checked }).catch(e => toast(e.message)); st.memory.enabled = el.checked; update(); },
  model: async el => { await setSettings({ ai: { ...settings().ai, provider: el.dataset.p, model: el.value } }); },
  'start-date': async el => { await setSettings({ planStartDate: el.value || undefined }); },
};
export const actions = {
  'sync-now': () => syncNow(),
  'open-folder': async () => {
    if (S.session && S.session.dev) { toast('Developer sign-in has no Google Drive.'); return; }
    const w = window.open('', '_blank');
    try { await syncNow(); const url = await drive.folderUrl(); if (w) w.location = url; else location.assign(url); }
    catch (e) { if (w) w.close(); toast(e.message === 'no-token' ? 'Sign in with Google again first.' : 'Could not reach Google Drive.'); }
  },
  reauth: () => drive.signIn({ hint: S.session && S.session.email }),
  rerun: async el => {
    const k = el.dataset.kind;
    if (S.doc.paused[k] && !confirm('You have a paused planner. Start again from the beginning?')) { go(k === 'food' ? '#/journey/food/' + S.doc.paused[k].step : '#/journey/workout/' + S.doc.paused[k].step); return; }
    await abandon(k); resetDraft(k);
    go(k === 'food' ? '#/journey/food/habits' : '#/journey/workout/upper');
  },
  'edit-note': el => { st.editNote = el.dataset.v; update(); },
  'save-note': async el => {
    const v = document.getElementById('note-' + el.dataset.v).value.trim();
    await api('PATCH', '/api/memory/' + el.dataset.v, { text: v }).catch(e => toast(e.message));
    st.memory.notes.find(n => n.id === el.dataset.v).text = v; st.editNote = null; update();
  },
  'delete-note': async el => { await api('DELETE', '/api/memory/' + el.dataset.v).catch(e => toast(e.message)); st.memory.notes = st.memory.notes.filter(n => n.id !== el.dataset.v); update(); },
  'add-note': async () => {
    const i = document.getElementById('newnote'); const text = i.value.trim(); if (!text) return;
    try { const r = await api('POST', '/api/memory', { text }); st.memory.notes.unshift({ id: r.id, text, updated_at: Date.now() }); i.value = ''; update(); } catch (e) { toast(e.message); }
  },
  'forget-all': async () => { if (!confirm('Delete every note?')) return; await api('POST', '/api/memory/forget', { all: true }).catch(() => {}); st.memory.notes = []; update(); },
  'ai-mode': async el => {
    if (el.dataset.v === 'byok' && !Object.keys(S.byok).length) { toast('Add a key below first.'); return; }
    const ai = settings().ai;
    await setSettings({ ai: { ...ai, mode: el.dataset.v, provider: el.dataset.v === 'byok' && !S.byok[ai.provider] ? Object.keys(S.byok)[0] : ai.provider } });
  },
  'save-key': async el => {
    const p = el.dataset.v;
    const key = document.getElementById('key-' + p).value.trim();
    if (!key) return;
    st.testing = p; update();
    try {
      const r = await api('POST', '/api/byok/test', { provider: p }, { key });
      if (!r.ok) { toast(r.message || 'That key did not work.'); st.testing = null; update(); return; }
      await setKey(p, key);
      await setSettings({ ai: { ...settings().ai, mode: 'byok', provider: p, model: r.model } });
      toast(`${PROVIDERS.find(x => x[0] === p)[1]} key saved and in use`);
    } catch (e) { toast(e.message); }
    st.testing = null; update();
  },
  'test-key': async el => {
    const p = el.dataset.v; st.testing = p; update();
    try { const r = await api('POST', '/api/byok/test', { provider: p, model: settings().ai.provider === p ? settings().ai.model : undefined }, { key: S.byok[p] }); toast(r.ok ? 'The key works' : r.message); } catch (e) { toast(e.message); }
    st.testing = null; update();
  },
  'use-key': async el => { await setSettings({ ai: { ...settings().ai, mode: 'byok', provider: el.dataset.v, model: '' } }); },
  'remove-key': async el => {
    const p = el.dataset.v;
    await setKey(p, null);
    if (settings().ai.provider === p && settings().ai.mode === 'byok') await setSettings({ ai: { ...settings().ai, mode: Object.keys(S.byok).length ? 'byok' : 'credits', provider: Object.keys(S.byok)[0] || 'anthropic' } });
    update();
  },
  'week-start': async el => setSettings({ weekStartsOn: el.dataset.v }),
  'unit-weight': async el => setSettings({ units: { ...settings().units, weight: el.dataset.v } }),
  'unit-distance': async el => setSettings({ units: { ...settings().units, distance: el.dataset.v } }),
  theme: async el => setSettings({ theme: el.dataset.v }),
  'delete-health': async () => {
    if (!confirm('Delete all your health answers and reports?')) return;
    const h = profile().health || {};
    const terms = [...(h.conditions || []), ...String(h.notes || '').split(/\W+/).filter(w => w.length > 4)];
    try { for (const f of await drive.listHealthFiles()) await drive.deleteFile(f.id); } catch { toast('Could not reach Google Drive for the reports. Try again when online.'); }
    await api('POST', '/api/memory/forget', { terms: [...terms, 'health', 'knee', 'back pain', 'diabetes', 'hypertension', 'blood pressure', 'sugar'] }).catch(() => {});
    await setProfile({ health: null });
    toast('Health data deleted');
  },
  export: async () => {
    st.exporting = true; update();
    let server = null;
    try { server = await api('GET', '/api/export'); } catch { /* offline: export local data only */ }
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), app: 'AgentFit', device: S.doc, server }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `agentfit-export-${today()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    st.exporting = false; update();
  },
  'import-legacy': async () => {
    try {
      const old = await drive.pullLegacy();
      if (!old) { toast('No backup from the old app was found in your Drive.'); return; }
      const levels = Object.entries(old.levels || {}).map(([id, v]) => `${id.replace(/_/g, ' ')} level ${v.level}`);
      const ticks = Object.values(old.done || {}).reduce((n, d) => n + Object.keys(d).length, 0);
      S.doc.legacy = { importedAt: Date.now(), startMonday: old.startMonday, summary: `Trained since ${old.startMonday || 'unknown'}; ${ticks} exercises ticked. Levels reached: ${levels.join(', ') || 'none'}.`, raw: { levels: old.levels, settings: old.settings } };
      await saveDoc();
      toast('Imported. Coach now knows your history from the old app.');
    } catch (e) { toast(e.message === 'no-token' ? 'Sign in with Google again first.' : 'Could not read the old backup.'); }
  },
  'sign-out': async () => {
    if (!confirm('Sign out? Data on this device is removed; your Drive copy stays.')) return;
    await syncNow().catch(() => {});
    drive.signOut(); session.clear();
    await idb.del('doc'); await idb.del('byok');
    S.doc = emptyDoc(); S.session = null; S.me = null; S.byok = {};
    go('#/welcome');
  },
  'delete-account': async () => {
    if (!confirm('Delete your AgentFit account and all its data? This cannot be undone.')) return;
    if (prompt('Type DELETE to confirm') !== 'DELETE') return;
    try { await api('DELETE', '/api/account'); } catch (e) { toast(e.message); return; }
    try { await drive.deleteAllAppData(); } catch { /* Drive not reachable; files stay in the user's Drive app folder */ }
    drive.signOut(); session.clear();
    await idb.del('doc'); await idb.del('byok');
    S.doc = emptyDoc(); S.session = null; S.me = null;
    toast('Account deleted');
    go('#/welcome');
  },
};
