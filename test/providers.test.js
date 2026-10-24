// The OpenAI and Gemini adapters parse streaming text and tool calls into the same events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stream, ProviderError } from '../worker/providers.js';

const sse = lines => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(lines.map(l => `data: ${l}\n\n`).join(''))); c.close(); } }));
const collect = async it => { const out = []; for await (const e of it) out.push(e); return out; };
const base = { system: [{ text: 'sys' }], messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }, { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'get_profile', input: {} }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', name: 'get_profile', content: '{}' }] }], tools: [{ name: 'save_draft_plan', description: 'd', parameters: { type: 'object', properties: { plan: { type: 'object' }, type: { type: 'string' } }, additionalProperties: false } }] };

test('openai stream: text, tool call split across chunks, usage', async () => {
  let sent;
  const fetchImpl = async (url, init) => { sent = JSON.parse(init.body); return sse([
    JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] }),
    JSON.stringify({ choices: [{ delta: { content: 'lo' } }] }),
    JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'save_draft_plan', arguments: '{"type":"wor' } }] } }] }),
    JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'kout"}' } }] }, finish_reason: 'tool_calls' }] }),
    JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 50 } } }), '[DONE]']); };
  const ev = await collect(stream({ provider: 'openai', apiKey: 'k', model: 'gpt-5-mini', fetchImpl, toolChoice: 'save_draft_plan', ...base }));
  assert.equal(ev.filter(e => e.type === 'text').map(e => e.text).join(''), 'Hello');
  assert.deepEqual(ev.find(e => e.type === 'tool_use'), { type: 'tool_use', id: 'call_1', name: 'save_draft_plan', input: { type: 'workout' } });
  assert.deepEqual(ev.find(e => e.type === 'usage'), { type: 'usage', input: 100, cached: 50, output: 20 });
  assert.equal(sent.messages[2].role, 'assistant');
  assert.equal(sent.messages[3].role, 'tool');
  assert.deepEqual(sent.tool_choice, { type: 'function', function: { name: 'save_draft_plan' } });
});

test('gemini stream: function call, schema sanitised, raw parts kept', async () => {
  let sent, url;
  const fetchImpl = async (u, init) => { url = u; sent = JSON.parse(init.body); return sse([
    JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Ok ' }] } }] }),
    JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'save_draft_plan', args: { type: 'meal', plan: '{"a":1}' } }, thoughtSignature: 'sig' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 30, thoughtsTokenCount: 5 } })]); };
  const ev = await collect(stream({ provider: 'gemini', apiKey: 'k', model: 'gemini-2.5-flash', fetchImpl, ...base }));
  assert.match(url, /streamGenerateContent\?alt=sse/);
  const params = sent.tools[0].functionDeclarations[0].parameters;
  assert.equal(params.properties.plan.type, 'string');
  assert.equal(params.additionalProperties, undefined);
  assert.equal(sent.contents[2].parts[0].functionResponse.name, 'get_profile');
  const call = ev.find(e => e.type === 'tool_use');
  assert.equal(call.name, 'save_draft_plan');
  assert.equal(ev.find(e => e.type === 'usage').output, 35);
  assert.equal(ev.find(e => e.type === 'stop').raw.gemini[1].thoughtSignature, 'sig');
});

test('provider errors map to friendly codes', async () => {
  const cases = [[401, 'bad', 'invalid_key'], [429, 'slow down', 'rate_limited'], [400, 'Your credit balance is too low', 'quota_exhausted'], [404, 'model_not_found', 'model_unavailable'], [529, 'overloaded', 'provider_unavailable']];
  for (const [status, body, code] of cases) {
    const fetchImpl = async () => new Response(body, { status });
    await assert.rejects(collect(stream({ provider: 'anthropic', apiKey: 'k', model: 'm', fetchImpl, ...base })), e => e instanceof ProviderError && e.code === code);
  }
});
