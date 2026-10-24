// One streaming interface over Anthropic, OpenAI and Gemini (§7: single code path).
//
// Messages use a provider-neutral shape:
//   { role: 'user', content: [{ type: 'text', text }, { type: 'tool_result', tool_use_id, name, content, is_error }] }
//   { role: 'assistant', content: [{ type: 'text', text }, { type: 'tool_use', id, name, input }], raw? }
// Tools: { name, description, parameters (JSON Schema) }
// stream() yields: { type: 'text', text } | { type: 'tool_use', id, name, input }
//                  | { type: 'usage', input, cached, output } | { type: 'stop', reason, raw? }

export class ProviderError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}

// Friendly codes the PWA turns into banners with actions (FR-BYOK-05).
function classify(status, text) {
  const t = (text || '').toLowerCase();
  if (status === 401 || status === 403 || t.includes('api key not valid') || t.includes('invalid x-api-key') || t.includes('incorrect api key')) return 'invalid_key';
  if (t.includes('credit balance') || t.includes('quota') || t.includes('insufficient_quota') || t.includes('billing')) return 'quota_exhausted';
  if (status === 429) return 'rate_limited';
  if (status === 404 || t.includes('model_not_found') || t.includes('does not exist') || (t.includes('model') && t.includes('not found'))) return 'model_unavailable';
  if (status >= 500) return 'provider_unavailable';
  return 'provider_error';
}
const MESSAGES = {
  invalid_key: 'The API key was rejected by the provider.',
  quota_exhausted: 'The API key has no credit or quota left.',
  rate_limited: 'The provider is rate-limiting this key. Try again in a minute.',
  model_unavailable: 'That model is not available for this key.',
  provider_unavailable: 'The AI provider is having trouble. Try again shortly.',
  provider_error: 'The AI provider returned an error.',
};
async function failure(r) {
  const text = await r.text().catch(() => '');
  const code = classify(r.status, text);
  console.warn('provider error', r.status, text.slice(0, 300));
  return new ProviderError(code, MESSAGES[code], r.status);
}

async function* sseLines(body) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let event = null, data = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      let line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line === '') { if (data.length) yield { event, data: data.join('\n') }; event = null; data = []; continue; }
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
  }
  if (data.length) yield { event, data: data.join('\n') };
}

// ---------------- Anthropic ----------------
async function* anthropic({ apiKey, model, system, messages, tools, toolChoice, maxTokens, fetchImpl, signal, baseUrl }) {
  const sys = system.map((b, i) => ({ type: 'text', text: b.text, ...(b.cache ? { cache_control: { type: 'ephemeral' } } : {}) }));
  const body = {
    model, max_tokens: maxTokens, stream: true, system: sys,
    messages: messages.map(m => ({ role: m.role, content: m.content.map(c => {
      if (c.type === 'text') return { type: 'text', text: c.text || ' ' };
      if (c.type === 'tool_use') return { type: 'tool_use', id: c.id, name: c.name, input: c.input || {} };
      if (c.type === 'tool_result') return { type: 'tool_result', tool_use_id: c.tool_use_id, content: c.content, ...(c.is_error ? { is_error: true } : {}) };
      return c;
    }) })),
  };
  if (tools && tools.length) body.tools = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  if (toolChoice === 'any') body.tool_choice = { type: 'any' };
  else if (toolChoice && toolChoice !== 'auto') body.tool_choice = { type: 'tool', name: toolChoice };
  const r = await fetchImpl(`${baseUrl || 'https://api.anthropic.com'}/v1/messages`, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw await failure(r);
  const blocks = {};
  let usage = { input: 0, cached: 0, output: 0 }, stop = 'end_turn';
  for await (const { data } of sseLines(r.body)) {
    if (!data || data === '[DONE]') continue;
    const e = JSON.parse(data);
    if (e.type === 'message_start') {
      const u = e.message.usage || {};
      usage.input = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      usage.cached = u.cache_read_input_tokens || 0;
    } else if (e.type === 'content_block_start') {
      blocks[e.index] = { ...e.content_block, json: '' };
    } else if (e.type === 'content_block_delta') {
      if (e.delta.type === 'text_delta') yield { type: 'text', text: e.delta.text };
      else if (e.delta.type === 'input_json_delta') blocks[e.index].json += e.delta.partial_json;
    } else if (e.type === 'content_block_stop') {
      const b = blocks[e.index];
      if (b && b.type === 'tool_use') {
        let input = {};
        try { input = b.json ? JSON.parse(b.json) : {}; } catch { input = { _unparsed: b.json }; }
        yield { type: 'tool_use', id: b.id, name: b.name, input };
      }
    } else if (e.type === 'message_delta') {
      if (e.usage && e.usage.output_tokens != null) usage.output = e.usage.output_tokens;
      if (e.delta && e.delta.stop_reason) stop = e.delta.stop_reason;
    } else if (e.type === 'error') {
      throw new ProviderError(e.error && e.error.type === 'overloaded_error' ? 'provider_unavailable' : 'provider_error', MESSAGES.provider_unavailable, 500);
    }
  }
  yield { type: 'usage', ...usage };
  yield { type: 'stop', reason: stop === 'max_tokens' ? 'max_tokens' : stop };
}

// ---------------- OpenAI ----------------
async function* openai({ apiKey, model, system, messages, tools, toolChoice, maxTokens, fetchImpl, signal, baseUrl }) {
  const msgs = [{ role: 'system', content: system.map(b => b.text).join('\n\n') }];
  for (const m of messages) {
    if (m.role === 'assistant') {
      const text = m.content.filter(c => c.type === 'text').map(c => c.text).join('');
      const calls = m.content.filter(c => c.type === 'tool_use').map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.input || {}) } }));
      msgs.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      const text = m.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      for (const c of m.content.filter(c => c.type === 'tool_result')) msgs.push({ role: 'tool', tool_call_id: c.tool_use_id, content: c.content });
      if (text) msgs.push({ role: 'user', content: text });
    }
  }
  const body = { model, messages: msgs, stream: true, stream_options: { include_usage: true }, max_completion_tokens: maxTokens };
  if (tools && tools.length) {
    body.tools = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    if (toolChoice === 'any') body.tool_choice = 'required';
    else if (toolChoice && toolChoice !== 'auto') body.tool_choice = { type: 'function', function: { name: toolChoice } };
  }
  const r = await fetchImpl(`${baseUrl || 'https://api.openai.com'}/v1/chat/completions`, {
    method: 'POST', signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey }, body: JSON.stringify(body),
  });
  if (!r.ok) throw await failure(r);
  const calls = {};
  let usage = { input: 0, cached: 0, output: 0 }, stop = 'end_turn';
  for await (const { data } of sseLines(r.body)) {
    if (!data || data === '[DONE]') continue;
    const e = JSON.parse(data);
    if (e.usage) {
      usage = { input: e.usage.prompt_tokens || 0, cached: (e.usage.prompt_tokens_details && e.usage.prompt_tokens_details.cached_tokens) || 0, output: e.usage.completion_tokens || 0 };
    }
    const ch = e.choices && e.choices[0];
    if (!ch) continue;
    const d = ch.delta || {};
    if (d.content) yield { type: 'text', text: d.content };
    for (const tc of d.tool_calls || []) {
      const c = (calls[tc.index] = calls[tc.index] || { id: tc.id, name: '', args: '' });
      if (tc.id) c.id = tc.id;
      if (tc.function && tc.function.name) c.name += tc.function.name;
      if (tc.function && tc.function.arguments) c.args += tc.function.arguments;
    }
    if (ch.finish_reason) stop = ch.finish_reason === 'length' ? 'max_tokens' : ch.finish_reason;
  }
  for (const c of Object.values(calls)) {
    let input = {};
    try { input = c.args ? JSON.parse(c.args) : {}; } catch { input = { _unparsed: c.args }; }
    yield { type: 'tool_use', id: c.id, name: c.name, input };
  }
  yield { type: 'usage', ...usage };
  yield { type: 'stop', reason: stop };
}

// ---------------- Gemini ----------------
// Gemini accepts a subset of JSON Schema; an object with no properties becomes a JSON string.
function geminiSchema(s) {
  if (!s || typeof s !== 'object') return s;
  if (s.type === 'object' && (!s.properties || !Object.keys(s.properties).length)) {
    return { type: 'string', description: (s.description ? s.description + ' ' : '') + '(JSON-encoded object)' };
  }
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (['additionalProperties', '$schema', 'default', 'examples', 'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern'].includes(k)) continue;
    if (k === 'properties') out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, geminiSchema(pv)]));
    else if (k === 'items') out.items = geminiSchema(v);
    else out[k] = v;
  }
  return out;
}

async function* gemini({ apiKey, model, system, messages, tools, toolChoice, maxTokens, fetchImpl, signal, baseUrl }) {
  const contents = [];
  for (const m of messages) {
    if (m.role === 'assistant') {
      if (m.raw && m.raw.gemini) { contents.push({ role: 'model', parts: m.raw.gemini }); continue; }
      const parts = [];
      for (const c of m.content) {
        if (c.type === 'text' && c.text) parts.push({ text: c.text });
        if (c.type === 'tool_use') parts.push({ functionCall: { name: c.name, args: c.input || {} } });
      }
      contents.push({ role: 'model', parts: parts.length ? parts : [{ text: ' ' }] });
    } else {
      const parts = [];
      for (const c of m.content) {
        if (c.type === 'text') parts.push({ text: c.text || ' ' });
        if (c.type === 'tool_result') parts.push({ functionResponse: { name: c.name, response: { content: c.content } } });
      }
      contents.push({ role: 'user', parts });
    }
  }
  const body = {
    systemInstruction: { parts: [{ text: system.map(b => b.text).join('\n\n') }] },
    contents,
    generationConfig: { maxOutputTokens: maxTokens },
  };
  if (tools && tools.length) {
    body.tools = [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parameters: geminiSchema(t.parameters) })) }];
    if (toolChoice === 'any') body.toolConfig = { functionCallingConfig: { mode: 'ANY' } };
    else if (toolChoice && toolChoice !== 'auto') body.toolConfig = { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [toolChoice] } };
  }
  const r = await fetchImpl(`${baseUrl || 'https://generativelanguage.googleapis.com'}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body),
  });
  if (!r.ok) throw await failure(r);
  let usage = { input: 0, cached: 0, output: 0 }, stop = 'end_turn';
  const rawParts = [];
  let n = 0;
  for await (const { data } of sseLines(r.body)) {
    if (!data) continue;
    const e = JSON.parse(data);
    if (e.usageMetadata) usage = { input: e.usageMetadata.promptTokenCount || 0, cached: e.usageMetadata.cachedContentTokenCount || 0, output: (e.usageMetadata.candidatesTokenCount || 0) + (e.usageMetadata.thoughtsTokenCount || 0) };
    const cand = e.candidates && e.candidates[0];
    if (!cand) continue;
    for (const p of (cand.content && cand.content.parts) || []) {
      rawParts.push(p);
      if (p.thought) continue;
      if (p.text) yield { type: 'text', text: p.text };
      if (p.functionCall) yield { type: 'tool_use', id: p.functionCall.id || `g${Date.now()}_${n++}`, name: p.functionCall.name, input: p.functionCall.args || {} };
    }
    if (cand.finishReason) stop = cand.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn';
  }
  yield { type: 'usage', ...usage };
  yield { type: 'stop', reason: stop, raw: { gemini: rawParts } };
}

const ADAPTERS = { anthropic, openai, gemini };

export function stream(opts) {
  const fn = ADAPTERS[opts.provider];
  if (!fn) throw new ProviderError('provider_error', 'Unknown AI provider.', 400);
  return fn({ maxTokens: 4096, fetchImpl: fetch, ...opts });
}

// Minimal call used to check a key when the user adds it (FR-BYOK-02).
export async function testKey({ provider, apiKey, model, baseUrl, fetchImpl = fetch }) {
  let text = '';
  for await (const ev of stream({ provider, apiKey, model, baseUrl, fetchImpl, maxTokens: 16, system: [{ text: 'Reply with OK.' }], messages: [{ role: 'user', content: [{ type: 'text', text: 'Say OK' }] }] })) {
    if (ev.type === 'text') text += ev.text;
  }
  return text.length >= 0;
}
