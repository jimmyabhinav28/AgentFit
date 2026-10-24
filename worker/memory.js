// Session memory (rolling summaries, FR-MEM-03), learned memory (FR-MEM-01) and chat titles.
import { structuredCall, backgroundCreds } from './quick.js';
import { newId, now } from './http.js';

const KEEP_VERBATIM = 20; // ~10 turns

export async function loadHistory(env, conversationId) {
  const conv = await env.DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(conversationId).first();
  const { results } = await env.DB.prepare('SELECT id, role, content_json, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC').bind(conversationId).all();
  let msgs = results;
  if (conv && conv.summary_upto_msg_id) {
    const idx = msgs.findIndex(m => m.id === conv.summary_upto_msg_id);
    if (idx >= 0) msgs = msgs.slice(idx + 1);
  }
  return { conv, recent: msgs.slice(-KEEP_VERBATIM), all: results };
}

export function toProviderMessages(rows) {
  const out = [];
  for (const r of rows) {
    const c = JSON.parse(r.content_json);
    let text = c.text || '';
    if (r.role === 'assistant' && c.drafts && c.drafts.length) text += `\n[Showed ${c.drafts.length} draft plan card(s): ${c.drafts.map(d => `${d.type} — ${d.summary}${d.accepted ? ' (accepted)' : ''}`).join('; ')}]`;
    if (!text.trim()) continue;
    const role = r.role === 'assistant' ? 'assistant' : 'user';
    // Providers need alternating roles; merge consecutive same-role turns.
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content[0].text += '\n\n' + text;
    else out.push({ role, content: [{ type: 'text', text }] });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

export async function afterTurn(env, { user, conversationId, userText, assistantText, isFirstTurn }) {
  const creds = backgroundCreds(env);
  const jobs = [];
  if (isFirstTurn) jobs.push(title(env, creds, user, conversationId, userText));
  jobs.push(summarise(env, creds, user, conversationId));
  if (user.memory_enabled) jobs.push(extractMemory(env, creds, user, conversationId, userText, assistantText));
  await Promise.allSettled(jobs);
}

async function title(env, creds, user, conversationId, userText) {
  let t = userText.replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
  if (creds) {
    const r = await structuredCall({ env, creds, userId: user.id, conversationId, purpose: 'title', maxTokens: 64,
      system: 'Write a 2–5 word title for a fitness or food chat. No quotes, no trailing punctuation.',
      prompt: userText.slice(0, 800), tool: { name: 'set_title', description: 'Set the title', parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } } }).catch(() => null);
    if (r && r.title) t = String(r.title).slice(0, 60);
  }
  await env.DB.prepare('UPDATE conversations SET title = ? WHERE id = ?').bind(t || 'New chat', conversationId).run();
}

async function summarise(env, creds, user, conversationId) {
  if (!creds) return;
  const { conv, all } = await loadHistory(env, conversationId);
  const startIdx = conv.summary_upto_msg_id ? all.findIndex(m => m.id === conv.summary_upto_msg_id) + 1 : 0;
  const pending = all.slice(startIdx, Math.max(startIdx, all.length - KEEP_VERBATIM));
  if (pending.length < 8) return;
  const transcript = pending.map(m => `${m.role}: ${JSON.parse(m.content_json).text || ''}`).join('\n').slice(0, 24000);
  const r = await structuredCall({ env, creds, userId: user.id, conversationId, purpose: 'summary', maxTokens: 600,
    system: 'Update the running summary of a fitness coaching chat. Keep decisions, plan changes, preferences, injuries and open questions. Under 180 words.',
    prompt: `Existing summary:\n${conv.summary || '(none)'}\n\nNew messages:\n${transcript}`,
    tool: { name: 'set_summary', description: 'Save the summary', parameters: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] } } }).catch(() => null);
  if (r && r.summary) await env.DB.prepare('UPDATE conversations SET summary = ?, summary_upto_msg_id = ? WHERE id = ?').bind(String(r.summary).slice(0, 3000), pending[pending.length - 1].id, conversationId).run();
}

async function extractMemory(env, creds, user, conversationId, userText, assistantText) {
  if (!creds) return;
  const conv = await env.DB.prepare('SELECT memory_off FROM conversations WHERE id = ?').bind(conversationId).first();
  if (conv && conv.memory_off) return;
  const { results: notes } = await env.DB.prepare('SELECT id, text FROM memory_notes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 60').bind(user.id).all();
  const r = await structuredCall({ env, creds, userId: user.id, conversationId, purpose: 'memory', maxTokens: 500,
    system: `You maintain short durable notes about a fitness app user, like "dislikes karela" or "left knee hurts on lunges". Only record facts the USER stated that will matter for future plans (preferences, dislikes, injuries, schedule constraints, goals). Never record the assistant's suggestions, one-off chit-chat, or anything about plan versions (the app tracks those). Most turns need no change: return empty lists.`,
    prompt: `Existing notes:\n${notes.map(n => `${n.id}: ${n.text}`).join('\n') || '(none)'}\n\nLatest exchange:\nUser: ${userText.slice(0, 3000)}\nAssistant: ${assistantText.slice(0, 2000)}`,
    tool: { name: 'update_notes', description: 'Add, change or remove notes', parameters: { type: 'object', properties: {
      add: { type: 'array', items: { type: 'string' } },
      update: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } }, required: ['id', 'text'] } },
      remove: { type: 'array', items: { type: 'string' } } } } } }).catch(() => null);
  if (!r) return;
  const t = now();
  const ids = new Set(notes.map(n => n.id));
  const stmts = [];
  const have = new Set(notes.map(n => n.text.trim().toLowerCase()));
  for (const text of (r.add || []).slice(0, 5)) if (String(text).trim() && !have.has(String(text).trim().toLowerCase())) stmts.push(env.DB.prepare('INSERT INTO memory_notes (id, user_id, text, source_conversation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(newId('m_'), user.id, String(text).slice(0, 200), conversationId, t, t));
  for (const u of r.update || []) if (ids.has(u.id)) stmts.push(env.DB.prepare('UPDATE memory_notes SET text = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind(String(u.text).slice(0, 200), t, u.id, user.id));
  for (const id of r.remove || []) if (ids.has(id)) stmts.push(env.DB.prepare('DELETE FROM memory_notes WHERE id = ? AND user_id = ?').bind(id, user.id));
  if (stmts.length) await env.DB.batch(stmts);
}
