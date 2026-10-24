// The agent loop: stream a model turn, run any tools it calls, feed results back,
// until it answers in text (chat) or a valid draft exists (Journey).
import { stream } from './providers.js';
import { runTool, statusFor } from './tools.js';
import { recordUsage } from './usage.js';

export async function runAgent({
  env, creds, system, messages, tools, emit, toolCtx,
  maxSteps = 8, toolChoice = 'auto', stopOnDraft = false, purpose = 'chat',
  conversationId = null, maxTokens = 4096, fetchImpl = fetch, signal,
}) {
  if (creds.maxOutput) maxTokens = Math.min(maxTokens, creds.maxOutput);
  const convo = [...messages];
  const total = { input: 0, cached: 0, output: 0 };
  let finalText = '';
  for (let step = 0; step < maxSteps; step++) {
    const content = [];
    let text = '';
    let raw = null, stop = 'end_turn';
    const calls = [];
    for await (const ev of stream({ provider: creds.provider, apiKey: creds.apiKey, model: creds.model, baseUrl: creds.baseUrl, system, messages: convo, tools, toolChoice, maxTokens, fetchImpl, signal })) {
      if (ev.type === 'text') { text += ev.text; await emit('text', { delta: ev.text }); }
      else if (ev.type === 'tool_use') calls.push(ev);
      else if (ev.type === 'usage') {
        total.input += ev.input; total.cached += ev.cached; total.output += ev.output;
        await recordUsage(env, { userId: toolCtx.user.id, conversationId, purpose, mode: creds.mode, provider: creds.provider, model: creds.model, usage: ev });
      } else if (ev.type === 'stop') { stop = ev.reason; raw = ev.raw || null; }
    }
    if (text) { content.push({ type: 'text', text }); finalText += (finalText && text ? '\n\n' : '') + text; }
    for (const c of calls) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input });
    convo.push({ role: 'assistant', content: content.length ? content : [{ type: 'text', text: ' ' }], ...(raw ? { raw } : {}) });
    if (!calls.length) break;

    const results = [];
    for (const c of calls) {
      const s = statusFor(c.name, c.input);
      if (s) await emit('status', { text: s });
      let out;
      if (c.input && c.input._unparsed !== undefined) {
        out = { content: stop === 'max_tokens'
          ? 'Your output was cut off before the plan was complete. Make it more compact (shorter explanations, fewer alternatives, short item names) and call the tool again with the complete plan.'
          : 'The tool input was not valid JSON. Call the tool again with valid JSON.', isError: true };
      } else {
        try { out = await runTool(c.name, c.input || {}, toolCtx); }
        catch (e) { console.error('tool failed', c.name, e); out = { content: `The tool ${c.name} failed. Continue without it.`, isError: true }; }
      }
      const r = typeof out === 'string' ? { content: out } : out;
      results.push({ type: 'tool_result', tool_use_id: c.id, name: c.name, content: r.content, ...(r.isError ? { is_error: true } : {}) });
    }
    convo.push({ role: 'user', content: results });
    if (stopOnDraft && toolCtx.finished) break;
  }
  return { text: finalText, messages: convo, usage: total, drafts: toolCtx.drafts };
}
