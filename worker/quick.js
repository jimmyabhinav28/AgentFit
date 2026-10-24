// One-shot structured calls (forced tool) and credential resolution.
import { stream } from './providers.js';
import { recordUsage, assertWithinCaps } from './usage.js';
import { platform, findModel, models, baseUrl } from './config.js';
import { HttpError } from './http.js';

// Which key pays for this request (§7.1).
export async function resolveCreds(env, user, request, body, { checkCaps = true } = {}) {
  const key = request.headers.get('x-provider-key');
  if (key) {
    const provider = body.provider;
    const list = models(env)[provider];
    if (!list) throw new HttpError(400, 'bad_provider', 'Choose Claude, OpenAI or Gemini.');
    const m = findModel(env, provider, body.model) || list[0];
    return { mode: 'byok', provider, model: m.id, apiKey: key, maxOutput: m.maxOutput, baseUrl: baseUrl(env, provider) };
  }
  const p = platform(env);
  if (!p.apiKey) throw new HttpError(503, 'platform_unavailable', 'AgentFit credits are not available right now. You can use your own API key.', { actions: ['use_own_key'] });
  if (checkCaps) await assertWithinCaps(env, user);
  return { mode: 'platform', provider: p.provider, model: p.model, apiKey: p.apiKey, maxOutput: (findModel(env, p.provider, p.model) || {}).maxOutput, baseUrl: baseUrl(env, p.provider) };
}

// Background jobs always run on AgentFit's cheapest model (FR-BYOK-07); skipped if no platform key.
export function backgroundCreds(env) {
  const p = platform(env);
  if (!p.apiKey) return null;
  return { mode: 'platform', provider: p.provider, model: p.cheapModel, apiKey: p.apiKey, baseUrl: baseUrl(env, p.provider) };
}

export async function structuredCall({ env, creds, system, prompt, tool, purpose, userId, conversationId = null, maxTokens = 2048, fetchImpl = fetch }) {
  let input = null, text = '';
  for await (const ev of stream({ provider: creds.provider, apiKey: creds.apiKey, model: creds.model, baseUrl: creds.baseUrl, system: [{ text: system }], messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }], tools: [tool], toolChoice: tool.name, maxTokens, fetchImpl })) {
    if (ev.type === 'tool_use' && ev.name === tool.name) input = ev.input;
    if (ev.type === 'text') text += ev.text;
    if (ev.type === 'usage') await recordUsage(env, { userId, conversationId, purpose, mode: creds.mode, provider: creds.provider, model: creds.model, usage: ev });
  }
  if (input && typeof input === 'object') {
    // Gemini may send object-typed fields as JSON strings.
    for (const [k, v] of Object.entries(input)) if (typeof v === 'string' && /^[[{]/.test(v.trim())) { try { input[k] = JSON.parse(v); } catch { /* keep string */ } }
  }
  return input;
}
