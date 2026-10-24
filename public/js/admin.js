// Admin dashboard (FR-ADM-01..05): AI spend, users, caps, alerts, custom exercises, videos.
// Uses the same session as the app; the Worker only answers for ADMIN_EMAILS.
import { html } from './lib/dom.js';
import { api } from './api.js';

const root = document.getElementById('admin');
const usd = micros => '$' + ((micros || 0) / 1e6).toFixed(micros > 1e6 ? 2 : 4);
const table = (cols, rows) => html`<div class="scroll"><table><thead><tr>${cols.map(c => html`<th>${c[0]}</th>`)}</tr></thead><tbody>${rows.length ? rows.map(r => html`<tr>${cols.map(c => html`<td>${c[1](r)}</td>`)}</tr>`) : html`<tr><td colspan="${cols.length}" class="small">Nothing yet</td></tr>`}</tbody></table></div>`;

async function load() {
  let d;
  try { d = await api('GET', '/api/admin/summary'); }
  catch (e) { root.innerHTML = String(html`<h1 class="h1">Admin</h1><p class="lead">${e.status === 403 ? 'This account is not an admin. Add your email to ADMIN_EMAILS.' : e.status === 401 ? 'Sign in to the app first, then reopen this page.' : e.message}</p><a href="./">Open the app</a>`); return; }
  const todayRows = d.byDay.filter(r => r.day === d.today);
  const spendToday = todayRows.filter(r => r.mode === 'platform').reduce((s, r) => s + r.micros, 0);
  const week = d.byDay.filter(r => r.mode === 'platform').reduce((s, r) => s + r.micros, 0);
  root.innerHTML = String(html`
    <div class="row between"><h1 class="h1">AgentFit admin</h1><a class="btn secondary sm" href="./">Open the app</a></div>
    <div class="kpis">
      <div class="card pad"><span class="small">Platform AI spend today</span><span class="h2">${usd(spendToday)}</span><span class="small">cap $${d.limits.globalDailyUsd}/day</span></div>
      <div class="card pad"><span class="small">Last 14 days</span><span class="h2">${usd(week)}</span></div>
      <div class="card pad"><span class="small">Users</span><span class="h2">${d.users}</span><span class="small">${d.activeUsers7d} active in 7 days</span></div>
      <div class="card pad"><span class="small">Platform model</span><span class="h2" style="font-size:15px">${d.platform.provider} · ${d.platform.model}</span><span class="small">${d.platform.configured ? 'key configured' : 'NO KEY: set PLATFORM_API_KEY'}</span></div>
    </div>
    <div class="card pad"><span class="strong">Limits (edit in wrangler.toml [vars])</span><span class="small">Per user per day: ${d.limits.userDailyTokens.toLocaleString()} tokens, ${d.limits.userDailyRequests} requests · ${d.limits.perMinuteRequests} requests a minute · global $${d.limits.globalDailyUsd}/day, alert at ${Math.round(d.limits.alertAtFraction * 100)}%</span></div>
    ${d.alerts.length ? html`<div class="banner warn">${d.alerts.map(a => html`<span>${a.day}: ${a.message}</span>`)}</div>` : ''}
    <div class="card pad"><span class="strong">Spend by day</span>${table([['Day', r => r.day], ['Mode', r => r.mode], ['Calls', r => r.calls], ['Tokens in', r => (r.tin || 0).toLocaleString()], ['Tokens out', r => (r.tout || 0).toLocaleString()], ['Est. cost', r => usd(r.micros)]], d.byDay)}</div>
    <div class="card pad"><span class="strong">By model and purpose (14 days)</span>${table([['Provider', r => r.provider], ['Model', r => r.model], ['Purpose', r => r.purpose], ['Mode', r => r.mode], ['Calls', r => r.calls], ['Est. cost', r => usd(r.micros)]], d.byModel)}</div>
    <div class="card pad"><span class="strong">Top users today</span>${table([['Email', r => r.email], ['Tokens', r => (r.tokens || 0).toLocaleString()], ['Est. cost', r => usd(r.micros)]], d.topUsersToday)}</div>
    <div class="card pad"><span class="strong">Users hitting caps</span>${table([['Day', r => r.day], ['Email', r => r.email || '—'], ['Cap', r => r.kind], ['Times', r => r.count]], d.capHits)}</div>
    <div class="card pad"><span class="strong">Custom exercises to review</span><span class="small">Approved ones still need adding to tools/build-library.py to get a library id and instructions.</span>
      ${table([['Name', r => r.name], ['From', r => r.email || '—'], ['Date', r => new Date(r.created_at).toLocaleDateString()], ['', r => html`<button class="btn secondary sm" data-review="${r.id}" data-s="approved">Approve</button> <button class="btn danger sm" data-review="${r.id}" data-s="rejected">Reject</button>`]], d.customExercises)}</div>
    <div class="card pad"><div class="row between"><span class="strong">Video link alerts</span><button class="btn secondary sm" id="checkvids">Check videos now</button></div>${table([['Exercise', r => r.exercise_id], ['Video', r => r.video_id], ['Status', r => r.status], ['Checked', r => new Date(r.checked_at).toLocaleString()]], d.videoAlerts)}</div>
    <div class="card pad"><span class="strong">Model allowlist</span><span class="small">Override with MODEL_ALLOWLIST_JSON. Only add models that pass the plan evals.</span>${table([['Provider', r => r.p], ['Model', r => r.id], ['Label', r => r.label], ['$/M in', r => r.price ? r.price.in : ''], ['$/M out', r => r.price ? r.price.out : '']], Object.entries(d.models).flatMap(([p, list]) => list.map(m => ({ p, ...m }))))}</div>
  `);
}
root.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-review]');
  if (b) { await api('POST', '/api/admin/custom-exercises', { id: b.dataset.review, status: b.dataset.s }); load(); }
  if (ev.target.id === 'checkvids') { ev.target.textContent = 'Checking…'; const r = await api('POST', '/api/admin/check-videos'); ev.target.textContent = `Checked ${r.checked}`; load(); }
});
load();
