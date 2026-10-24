// Coach chat (§4.3, §5.3) over server-sent events.
import { HttpError, readJson, newId, now, sse } from './http.js';
import { resolveCreds } from './quick.js';
import { runAgent } from './agent.js';
import { toolList, CHAT_TOOLS } from './tools.js';
import { COACH, profileBlock, memoryBlock, contextBlock } from './prompts.js';
import { loadHistory, toProviderMessages, afterTurn } from './memory.js';
import { ProviderError } from './providers.js';

export async function getProfile(env, userId) {
  const row = await env.DB.prepare('SELECT profile_json FROM profiles WHERE user_id = ?').bind(userId).first();
  return row ? JSON.parse(row.profile_json) : null;
}

export function errorActions(code, mode) {
  if (code === 'invalid_key') return ['fix_key', 'use_credits'];
  if (code === 'quota_exhausted' || code === 'model_unavailable') return mode === 'byok' ? ['fix_key', 'use_credits'] : ['retry'];
  if (code === 'rate_limited' || code === 'provider_unavailable') return mode === 'byok' ? ['retry', 'use_credits'] : ['retry'];
  return ['retry'];
}

export async function handleChat(request, env, ctx, user) {
  const body = await readJson(request);
  const message = String(body.message || '').trim();
  if (!message) throw new HttpError(400, 'empty', 'Type a message first.');
  if (message.length > 8000) throw new HttpError(400, 'too_long', 'That message is too long. Please shorten it.');
  const creds = await resolveCreds(env, user, request, body);

  let conversationId = body.conversationId;
  let isFirstTurn = false;
  if (conversationId) {
    const c = await env.DB.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?').bind(conversationId, user.id).first();
    if (!c) throw new HttpError(404, 'not_found', 'That conversation no longer exists.');
  } else {
    conversationId = newId('c_');
    isFirstTurn = true;
    await env.DB.prepare('INSERT INTO conversations (id, user_id, title, memory_off, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(conversationId, user.id, 'New chat', body.memoryOff ? 1 : 0, now(), now()).run();
  }
  const profile = (await getProfile(env, user.id)) || body.profile || null;
  const notes = user.memory_enabled && !body.memoryOff
    ? (await env.DB.prepare('SELECT text FROM memory_notes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 25').bind(user.id).all()).results
    : [];
  const { conv, recent } = await loadHistory(env, conversationId);
  const history = toProviderMessages(recent);
  const userMsgId = newId('msg_');
  await env.DB.prepare('INSERT INTO messages (id, conversation_id, role, content_json, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userMsgId, conversationId, 'user', JSON.stringify({ text: message }), now()).run();
  const messages = [...history, { role: 'user', content: [{ type: 'text', text: message }] }];
  // Merge if history ended on a user turn (e.g. an earlier failed reply).
  for (let i = messages.length - 1; i > 0; i--) if (messages[i].role === 'user' && messages[i - 1].role === 'user') { messages[i - 1].content.push(...messages[i].content); messages.splice(i, 1); }

  const context = body.context || {};
  const system = [
    { text: COACH, cache: true },
    { text: profileBlock(profile), cache: true },
    { text: [memoryBlock(notes), conv && conv.summary ? `EARLIER IN THIS CHAT (summary): ${conv.summary}` : '', contextBlock(context)].filter(Boolean).join('\n\n') },
  ];

  const { response, send, close } = sse();
  const run = async () => {
    await send('meta', { conversationId, mode: creds.mode, provider: creds.provider, model: creds.model });
    const toolCtx = { env, user, profile, context, emit: send, drafts: [] };
    let result = null;
    try {
      result = await runAgent({ env, creds, system, messages, tools: toolList(CHAT_TOOLS), emit: send, toolCtx, conversationId, purpose: 'chat', maxTokens: 12000 });
    } catch (e) {
      const code = e instanceof ProviderError ? e.code : 'server_error';
      if (!(e instanceof ProviderError)) console.error('chat failed', e);
      await send('error', { code, message: e instanceof ProviderError ? e.message : 'Something went wrong. Please try again.', actions: errorActions(code, creds.mode) });
      await close();
      return;
    }
    const assistantId = newId('msg_');
    const text = result.text || (result.drafts.length ? 'Here is the draft. Tap Accept if it looks right; it starts tomorrow.' : '');
    await env.DB.batch([
      env.DB.prepare('INSERT INTO messages (id, conversation_id, role, content_json, tokens_in, tokens_out, model, billing_mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(assistantId, conversationId, 'assistant', JSON.stringify({ text, drafts: result.drafts }), result.usage.input, result.usage.output, creds.model, creds.mode, now() + 1),
      env.DB.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(now(), conversationId),
    ]);
    if (!result.text && result.drafts.length) await send('text', { delta: text });
    await send('done', { messageId: assistantId, userMessageId: userMsgId, usage: result.usage });
    await close();
    ctx.waitUntil(afterTurn(env, { user, conversationId, userText: message, assistantText: text, isFirstTurn }).catch(e => console.error('afterTurn', e)));
  };
  ctx.waitUntil(run());
  return response;
}

export async function listConversations(env, user) {
  const { results } = await env.DB.prepare('SELECT id, title, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100').bind(user.id).all();
  return results;
}

export async function getConversation(env, user, id) {
  const conv = await env.DB.prepare('SELECT id, title, memory_off, updated_at FROM conversations WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!conv) throw new HttpError(404, 'not_found', 'That conversation no longer exists.');
  const { results } = await env.DB.prepare('SELECT id, role, content_json, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC').bind(id).all();
  return { ...conv, messages: results.map(r => ({ id: r.id, role: r.role, createdAt: r.created_at, ...JSON.parse(r.content_json) })) };
}

// Marks a draft card as accepted so reopened chats show it that way, and records plan_meta (§9.1).
export async function draftAccepted(env, user, body) {
  const t = now();
  const stmts = [];
  if (body.type && body.version && body.effectiveFrom) {
    stmts.push(env.DB.prepare('INSERT INTO plan_meta (user_id, type, current_version, effective_from, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, type) DO UPDATE SET current_version = excluded.current_version, effective_from = excluded.effective_from, updated_at = excluded.updated_at')
      .bind(user.id, body.type, body.version, body.effectiveFrom, t));
  }
  if (body.messageId && body.draftId) {
    const row = await env.DB.prepare('SELECT m.content_json FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = ? AND c.user_id = ?').bind(body.messageId, user.id).first();
    if (row) {
      const c = JSON.parse(row.content_json);
      for (const d of c.drafts || []) if (d.id === body.draftId) { d.accepted = true; d.version = body.version; }
      stmts.push(env.DB.prepare('UPDATE messages SET content_json = ? WHERE id = ?').bind(JSON.stringify(c), body.messageId));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  return { ok: true };
}
