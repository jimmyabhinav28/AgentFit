// Coach (§4.3): conversation list, streaming chat, draft plan cards with diffs,
// inline error banners with recovery actions, mode switch.
import { html, icon, md, when } from '../lib/dom.js';
import { S, update, toast, settings, setSettings, contextBundle, aiRequestOptions, acceptDraft, activeVersion, upcoming, versions, today, profile, isDone } from '../store.js';
import { api, stream } from '../api.js';
import { WEEKDAY_SHORT, WEEKDAY_NAMES, weekdayOf, addDays, longDate, WEEKDAYS } from '../core/dates.js';
import { prescription, mealsForDay, dayTotals, mealMacros, workoutDay } from '../core/plans.js';
import { forbiddenOnDay, dietRules } from '../core/validate.js';
import { tabbar, errorBanner, resumeBanner, units, exName } from './common.js';
import { go } from '../router.js';

const PROVIDER_NAMES = { anthropic: 'Claude', openai: 'OpenAI', gemini: 'Gemini' };
const C = () => S.coach;

function parseParams(params) {
  const [first = '', ...rest] = params;
  const [id, q] = first.split('?');
  return { id, query: new URLSearchParams(q || ''), rest };
}

export async function onEnter(params) {
  const { id, query } = parseParams(params);
  if (!id) { loadList(); return; }
  if (id === 'new') {
    if (!C().current || C().current.id || C().current.messages.length) C().current = { id: null, title: 'New chat', messages: [], memoryOff: false };
    const about = query.get('about');
    if (about === 'today') C().input = "Talk me through today's plan.";
    else if (about === 'progress') C().input = 'Review my progress so far. What should I change?';
    else if (about === 'swap') C().input = `Give me another idea instead of ${query.get('meal') || 'this meal'} for today.`;
    if (C().prefill) { C().input = C().prefill; C().prefill = ''; }
    update();
    return;
  }
  if (C().current && C().current.id === id && C().current.messages.length) return;
  C().current = { id, title: '…', messages: [], loading: true };
  update();
  try {
    const conv = await api('GET', '/api/conversations/' + id);
    C().current = { id, title: conv.title, memoryOff: !!conv.memory_off, messages: conv.messages };
  } catch (e) { C().current = { id: null, title: 'New chat', messages: [] }; toast(e.message); }
  update();
  scrollDown();
}
async function loadList() {
  try { C().list = (await api('GET', '/api/conversations')).conversations; } catch (e) { C().listError = e.message; }
  update();
}
function scrollDown() { requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight)); }

// ---------------- header / mode ----------------
function modeLabel() {
  const ai = settings().ai;
  if (ai.mode === 'byok' && S.byok[ai.provider]) return `Your ${PROVIDER_NAMES[ai.provider]} key`;
  return `Credits · ${S.me ? S.me.credits : 100}`;
}

export function render(params) {
  const { id } = parseParams(params);
  if (!id) return renderList();
  return renderChat();
}

function renderList() {
  const list = C().list;
  return html`<div class="screen">
    <div class="row between"><h1 class="h1">Coach</h1><a class="btn primary sm" href="#/coach/new">${icon('plus', 16)} New chat</a></div>
    ${resumeBanner('workout')}${resumeBanner('food')}
    <button class="modebtn" style="align-self:flex-start" data-action="mode-sheet">${icon(settings().ai.mode === 'byok' ? 'key' : 'coin', 14)} ${modeLabel()}</button>
    ${list === null || list === undefined ? html`<div class="spinner" role="status" aria-label="Loading"></div>` : list.length ? html`<div class="card convlist">${list.map(c => html`<a class="listrow" href="#/coach/${c.id}"><span class="t"><span class="t1">${c.title}</span><span class="t2">${new Date(c.updated_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span></span>${icon('fwd', 18)}</a>`)}</div>`
      : html`<div class="card pad"><span class="strong">No chats yet</span><span class="small">Ask about your plan, swap a meal, or change your week.</span><a class="btn primary md" href="#/coach/new">Start a chat</a></div>`}
    ${when(C().listError, () => html`<div class="note">${C().listError}</div>`)}
  </div>${tabbar('coach')}`;
}

function openers() {
  const out = [];
  const t = today();
  const wd = weekdayOf(t);
  const fv = activeVersion('food');
  const wv = activeVersion('workout');
  if (fv) {
    const forbidden = forbiddenOnDay(dietRules(profile().food || {}), wd);
    if (forbidden.has('egg') && profile().food && profile().food.dietType === 'eggetarian') out.push(`${WEEKDAY_NAMES[wd]}'s egg-free. Something enjoyable for dinner?`);
    else out.push("What's a good high-protein dinner tonight?");
  } else out.push('Help me plan my food');
  if (wv) {
    const day = workoutDay(wv.plan, wd);
    if (day && day.exercises.length) out.push(`What's the focus of today's ${day.type ? day.type.label.toLowerCase() : 'session'}?`);
    else out.push('It is a rest day. What should I do to recover?');
    out.push('How am I doing this week?');
    out.push('Make my plan a bit harder');
  } else out.push('Help me plan my workout');
  return out.slice(0, 4);
}

function renderChat() {
  const c = C().current || { messages: [] };
  const streaming = C().streaming;
  const busy = !!streaming;
  return html`<div class="chatwrap">
    <div class="chathead">
      <a class="iconbtn sm ghost" href="#/coach" aria-label="All chats">${icon('back', 18)}</a>
      <div class="mid"><span class="t">${c.title || 'New chat'}</span><button class="modebtn" data-action="mode-sheet">${icon(settings().ai.mode === 'byok' ? 'key' : 'coin', 14)} ${modeLabel()}</button></div>
      <button class="iconbtn sm ghost" data-action="chat-menu" aria-label="Chat options">${icon('dots', 18)}</button>
    </div>
    <div class="msgs" aria-live="polite">
      ${when(c.loading, () => html`<div class="spinner" role="status" aria-label="Loading"></div>`)}
      ${when(!c.messages.length && !c.loading, () => html`<div class="stack loose" style="padding-top:24px">
        <div><h1 class="h1">Hi${profile().name ? ' ' + profile().name : ''}</h1><p class="lead">Ask about today, change your plan, or swap a meal. Plan changes show up as cards you can accept.</p></div>
        ${when(S.coach.pendingDraft, () => html`<div class="note">I'll have your draft ${S.coach.pendingDraft && S.coach.pendingDraft.type === 'meal' ? 'food chart' : 'workout plan'} in front of me.</div>`)}
        <div class="stack tight">${openers().map(o => html`<button class="choice" style="min-height:48px;font-size:14px" data-action="send-text" data-v="${o}">${o}</button>`)}</div>
      </div>`)}
      ${c.messages.map((m, i) => message(m, i === c.messages.length - 1))}
    </div>
    <div class="composer">
      ${when(c.messages.length && !busy, () => html`<div class="quick">${['3 days a week', 'Only dumbbells', 'Make dinner lighter', 'Make it harder', 'I missed a session'].map(q => html`<button class="chip" data-action="send-text" data-v="${q}">${q}</button>`)}</div>`)}
      <form class="inrow" data-form="chat">
        <label class="sr-only" for="chatin">Message</label>
        <textarea id="chatin" rows="1" data-model="coach.input" placeholder="Message your coach" enterkeyhint="send">${C().input || ''}</textarea>
        ${busy ? html`<button type="button" class="sendbtn" data-action="stop" aria-label="Stop">${icon('stop', 18)}</button>` : html`<button type="button" class="sendbtn" data-action="send" aria-label="Send">${icon('send', 18)}</button>`}
      </form>
    </div>
  </div>${tabbar('coach')}`;
}

function message(m, isLast) {
  if (m.role === 'user') return html`<div class="msg user">${m.text}</div>`;
  const streaming = m.streaming;
  return html`<div class="msg assistant">
    ${when(m.text, () => md(m.text))}
    ${when(streaming && m.status, () => html`<div class="status">${m.status}</div>`)}
    ${when(streaming && !m.text && !m.status, () => html`<div class="status">Thinking…</div>`)}
    ${(m.drafts || []).map(d => draftCard(d, m))}
    ${when(m.error, () => errorBanner(m.error, 'retry-last'))}
    ${when(!streaming && m.text, () => html`<div class="msgtools"><button data-action="copy" data-v="${m.id || ''}" aria-label="Copy reply">${icon('copy', 14)} Copy</button>${when(isLast, () => html`<button data-action="regenerate" aria-label="Regenerate reply">${icon('refresh', 14)} Regenerate</button>`)}</div>`)}
  </div>`;
}

function draftCard(d, m) {
  const isMeal = d.type === 'meal';
  const accepted = d.accepted;
  const lib = S.data.library;
  let preview;
  if (isMeal) {
    const day = d.plan.days.find(x => x.cycleDay === 1) || d.plan.days[0];
    const meals = mealsForDay(d.plan, day);
    const avg = Math.round(d.plan.days.reduce((s, x) => s + dayTotals(mealsForDay(d.plan, x)).proteinG, 0) / d.plan.days.length);
    preview = html`<span class="small">Day 1 (${WEEKDAY_SHORT[day.weekday] || ''}) · about ${avg} g protein a day</span>${meals.map(x => html`<div class="row between"><span>${cap(x.slot)} · ${x.dish}</span><span class="small">${mealMacros(x).proteinG} g</span></div>`)}`;
  } else {
    preview = WEEKDAYS.filter(w => d.plan.dayTypes[w]).map(w => html`<div><span class="strong">${WEEKDAY_SHORT[w]} · ${d.plan.dayTypes[w].label}</span><br><span class="small">${d.plan.exercises.filter(e => e.days.includes(w)).map(e => `${(lib[e.exerciseId] || e).name} (${units(prescription(d.plan, e, { level: 1, sublevel: 1 }).main)})`).join(' · ')}</span></div>`);
  }
  return html`<div class="draft">
    <div class="dh"><span class="t">${isMeal ? 'Draft food chart' : 'Draft workout plan'}</span><span class="pill ${accepted ? 'sage' : 'gray'}" style="height:24px">${accepted ? `Accepted · v${d.version || ''}` : 'Not active yet'}</span></div>
    <div class="db">
      ${when(d.summary, () => html`<span class="strong">${d.summary}</span>`)}
      ${when(d.changes && d.changes.length, () => html`<div class="changes">${d.changes.slice(0, 8).map(x => html`<span>${x}</span>`)}</div>`)}
      ${preview}
      ${when(accepted, () => html`<span class="small">Starts ${longDate(addDays((d.acceptedOn || today()), 1))}.</span>`)}
    </div>
    ${when(!accepted, () => html`<div class="da">
      <button class="btn primary" data-action="accept-draft" data-mid="${m.id || ''}" data-d="${d.id}">Accept</button>
      <button class="btn secondary" data-action="swap-item" data-d="${d.id}">Swap item</button>
      <button class="btn secondary" data-action="edit-draft" data-d="${d.id}">Edit</button>
      <button class="btn secondary" data-action="view-draft" data-mid="${m.id || ''}" data-d="${d.id}">View full</button></div>`)}
  </div>`;
}
const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

function findDraft(id) {
  for (const m of (C().current && C().current.messages) || []) for (const d of m.drafts || []) if (d.id === id) return { d, m };
  return {};
}

// ---------------- sending ----------------
async function send(text) {
  text = (text || '').trim();
  if (!text || C().streaming) return;
  const c = C().current || (C().current = { id: null, title: 'New chat', messages: [] });
  c.messages.push({ role: 'user', text });
  const reply = { role: 'assistant', text: '', drafts: [], streaming: true, status: '' };
  c.messages.push(reply);
  C().input = '';
  C().lastSent = text;
  const ai = aiRequestOptions();
  const abort = new AbortController();
  C().streaming = { abort };
  update(); scrollDown();
  const context = contextBundle(location.hash.includes('about=') ? location.hash.split('about=')[1] : 'coach');
  if (S.coach.pendingDraft) context.pendingDraft = S.coach.pendingDraft;
  try {
    await stream('/api/chat', { conversationId: c.id, message: text, context, memoryOff: !!c.memoryOff, provider: ai.provider, model: ai.model }, {
      key: ai.key, signal: abort.signal,
      onEvent: (ev, data) => {
        if (ev === 'meta') { if (!c.id) { c.id = data.conversationId; history.replaceState(null, '', '#/coach/' + c.id); } }
        else if (ev === 'text') { reply.text += data.delta; reply.status = ''; }
        else if (ev === 'status') reply.status = data.text;
        else if (ev === 'draft') reply.drafts.push(data);
        else if (ev === 'error') reply.error = data;
        else if (ev === 'done') { reply.id = data.messageId; }
        update();
        if (ev === 'draft' || ev === 'done') scrollDown();
      },
    });
  } catch (e) {
    reply.error = { code: e.code, message: e.message, actions: e.actions && e.actions.length ? e.actions : ['retry'] };
  }
  reply.streaming = false;
  C().streaming = null;
  if (!reply.text && !reply.drafts.length && !reply.error) reply.text = abort.signal.aborted ? '_Stopped._' : '';
  update();
  refreshMe();
  if (c.title === 'New chat') setTimeout(async () => { try { const conv = await api('GET', '/api/conversations/' + c.id); c.title = conv.title; update(); } catch { /* ignore */ } }, 2500);
}
async function refreshMe() { try { S.me = await api('GET', '/api/me'); update(); } catch { /* offline */ } }

export async function onInput(el) {
  if (el.dataset.model === 'coach.input') {
    C().input = el.value;
    el.style.height = 'auto';
    el.style.height = Math.min(160, el.scrollHeight) + 'px';
  }
}
export function onKeydown(ev) {
  if (ev.target.id === 'chatin' && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && window.matchMedia('(pointer: fine)').matches) {
    ev.preventDefault();
    send(C().input);
  }
}

// ---------------- sheets ----------------
export const sheets = {
  mode() {
    const ai = settings().ai;
    const keys = Object.keys(S.byok || {});
    return html`<h2 class="h2">Who pays for the AI?</h2>
      <p class="small">Switching never resets the conversation.</p>
      <button class="card-choice" data-action="set-mode" data-v="credits" aria-pressed="${ai.mode !== 'byok'}"><span class="ic indigo">${icon('coin', 22)}</span><span class="tx"><span class="t1">AgentFit credits</span><span class="t2">${S.me ? S.me.credits : 100} credits · free during v1, with a daily limit</span></span></button>
      ${keys.map(p => html`<button class="card-choice" data-action="set-mode" data-v="byok" data-p="${p}" aria-pressed="${ai.mode === 'byok' && ai.provider === p}"><span class="ic sage">${icon('key', 22)}</span><span class="tx"><span class="t1">My ${PROVIDER_NAMES[p]} key</span><span class="t2">Billed by ${PROVIDER_NAMES[p]} · no daily limit</span></span></button>`)}
      <a class="btn secondary md" href="#/settings/ai">${keys.length ? 'Manage keys' : 'Add my own API key'}</a>`;
  },
  chatmenu() {
    const c = C().current || {};
    return html`<h2 class="h2">This chat</h2>
      <div class="card">
        <a class="listrow" href="#/settings/memory">${icon('brain', 20)}<span class="t" style="flex:1"><span class="t1">What AgentFit knows about you</span></span>${icon('fwd', 18)}</a>
        <button class="listrow" data-action="toggle-chat-memory">${icon('lock', 20)}<span class="t" style="flex:1"><span class="t1">${c.memoryOff ? 'Memory is off for this chat' : 'Turn memory off for this chat'}</span><span class="t2">${c.memoryOff ? 'Nothing from this chat is remembered' : 'Nothing from this chat will be remembered'}</span></span></button>
        ${when(c.id, () => html`<button class="listrow" data-action="delete-chat" style="color:var(--danger)">${icon('trash', 20)}<span class="t" style="flex:1"><span class="t1">Delete this chat</span></span></button>`)}
      </div>
      <button class="btn secondary md" data-action="close-sheet">Close</button>`;
  },
  draft(sh) {
    const { d } = findDraft(sh.id);
    if (!d) return html`<p>Draft not found.</p>`;
    const lib = S.data.library;
    if (d.type === 'meal') return html`<h2 class="h2">Food chart · 14 days</h2>${d.plan.days.map(day => {
      const meals = mealsForDay(d.plan, day); const tot = dayTotals(meals);
      return html`<div class="card pad"><div class="row between"><span class="strong">Day ${day.cycleDay} · ${WEEKDAY_SHORT[day.weekday] || ''}</span><span class="small">${tot.kcal} kcal · ${tot.proteinG} g</span></div>${meals.map(x => html`<div class="row between small"><span>${cap(x.slot)} ${x.time} · ${x.dish}</span><span>${mealMacros(x).proteinG} g</span></div>`)}</div>`;
    })}<button class="btn secondary md" data-action="close-sheet">Close</button>`;
    return html`<h2 class="h2">${d.plan.name || 'Workout plan'}</h2>${WEEKDAYS.filter(w => d.plan.dayTypes[w]).map(w => html`<div class="card pad"><span class="strong">${WEEKDAY_NAMES[w]} · ${d.plan.dayTypes[w].label}</span>
      ${d.plan.exercises.filter(e => e.days.includes(w)).map(e => html`<div class="stack tight" style="gap:2px"><span>${(lib[e.exerciseId] || e).name}</span><span class="small">${e.levels.length} levels: ${units(prescription(d.plan, e, { level: 1, sublevel: 1 }).main)} → ${units(e.target.text)}</span></div>`)}</div>`)}
      <button class="btn secondary md" data-action="close-sheet">Close</button>`;
  },
};

// ---------------- actions ----------------
export const actions = {
  send: () => send(C().input),
  'send-text': el => send(el.dataset.v),
  stop: () => { if (C().streaming) C().streaming.abort.abort(); },
  'retry-last': () => { const c = C().current; if (c && c.messages.length >= 2) { c.messages.splice(-2, 2); } send(C().lastSent || ''); },
  regenerate: () => { const c = C().current; const lastUser = [...c.messages].reverse().find(m => m.role === 'user'); if (!lastUser) return; c.messages.splice(c.messages.lastIndexOf(lastUser)); send(lastUser.text); },
  copy: el => {
    const m = C().current.messages.find(x => x.id === el.dataset.v) || C().current.messages.filter(x => x.role === 'assistant').slice(-1)[0];
    navigator.clipboard.writeText(m.text || '').then(() => toast('Copied'), () => toast('Could not copy'));
  },
  'mode-sheet': () => { S.ui.sheet = { kind: 'mode' }; update(); },
  'chat-menu': () => { S.ui.sheet = { kind: 'chatmenu' }; update(); },
  'set-mode': async el => {
    const ai = { ...settings().ai, mode: el.dataset.v };
    if (el.dataset.p) ai.provider = el.dataset.p;
    await setSettings({ ai });
    S.ui.sheet = null; update();
  },
  'toggle-chat-memory': async () => {
    const c = C().current;
    c.memoryOff = !c.memoryOff;
    if (c.id) api('PATCH', '/api/conversations/' + c.id, { memoryOff: c.memoryOff }).catch(() => {});
    update();
  },
  'delete-chat': async () => {
    if (!confirm('Delete this chat? This cannot be undone.')) return;
    await api('DELETE', '/api/conversations/' + C().current.id).catch(() => {});
    C().current = null; S.ui.sheet = null; C().list = null; go('#/coach');
  },
  'accept-draft': async el => {
    const { d } = findDraft(el.dataset.d);
    if (!d) return;
    const v = await acceptDraft(d, { messageId: el.dataset.mid || null });
    d.accepted = true; d.version = v.version; d.acceptedOn = today();
    if (S.coach.pendingDraft && S.coach.pendingDraft.type === d.type) S.coach.pendingDraft = null;
    toast(`Version ${v.version} starts tomorrow`);
    update();
  },
  'swap-item': () => { C().input = 'Swap '; update(); requestAnimationFrame(() => document.getElementById('chatin')?.focus()); },
  'edit-draft': () => { C().input = 'Change the draft: '; update(); requestAnimationFrame(() => document.getElementById('chatin')?.focus()); },
  'view-draft': el => { S.ui.sheet = { kind: 'draft', id: el.dataset.d }; update(); },
  'err-use_credits': async () => { await setSettings({ ai: { ...settings().ai, mode: 'credits' } }); actions['retry-last'](); },
  'err-use_own_key': async () => {
    const keys = Object.keys(S.byok || {});
    if (!keys.length) { go('#/settings/ai'); return; }
    await setSettings({ ai: { ...settings().ai, mode: 'byok', provider: keys[0] } });
    actions['retry-last']();
  },
  'err-fix_key': () => go('#/settings/ai'),
};
export const forms = { chat: () => send(C().input) };
