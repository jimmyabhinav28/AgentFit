// Models, prices and limits. Everything here can be overridden with environment
// variables (wrangler.toml [vars] or `wrangler secret put`), so changing a model
// or a cap never needs a code change (FR-ADM-01).

// Prices are USD per million tokens, used only for the cost estimate (V1-CR-04).
// Check them against each provider's pricing page; only models that pass the
// plan-generation evals belong here (NFR-09, §12.3).
export const DEFAULT_MODELS = {
  anthropic: [
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', price: { in: 0.10, out: 0.50, cachedIn: 0.01 }, maxOutput: 64000 },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', price: { in: 2, out: 10, cachedIn: 0.2 }, maxOutput: 64000 },
  ],
  openai: [
    { id: 'gpt-5-mini', label: 'GPT-5 mini', price: { in: 0.25, out: 2, cachedIn: 0.025 }, maxOutput: 64000 },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini', price: { in: 0.15, out: 0.6, cachedIn: 0.075 }, maxOutput: 16384 },
  ],
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', price: { in: 0.30, out: 2.5, cachedIn: 0.075 }, maxOutput: 65536 },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', price: { in: 0.10, out: 0.40, cachedIn: 0.025 }, maxOutput: 65536 },
  ],
};

export function models(env) {
  if (env.MODEL_ALLOWLIST_JSON) {
    try { return JSON.parse(env.MODEL_ALLOWLIST_JSON); } catch { /* fall back */ }
  }
  return DEFAULT_MODELS;
}

export function findModel(env, provider, id) {
  return (models(env)[provider] || []).find(m => m.id === id) || null;
}

export function platform(env) {
  const provider = env.PLATFORM_PROVIDER || 'anthropic';
  const list = models(env)[provider] || [];
  return {
    provider,
    model: env.PLATFORM_MODEL || (list[0] && list[0].id),
    cheapModel: env.CHEAP_MODEL || env.PLATFORM_MODEL || (list[0] && list[0].id),
    apiKey: env.PLATFORM_API_KEY || '',
  };
}

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
export function limits(env) {
  return {
    userDailyTokens: num(env.USER_DAILY_TOKEN_CAP, 600000),     // platform-key mode only
    userDailyRequests: num(env.USER_DAILY_REQUEST_CAP, 60),
    globalDailyUsd: num(env.GLOBAL_DAILY_USD_CAP, 3),            // all platform-key spend per UTC day
    alertAtFraction: num(env.GLOBAL_ALERT_FRACTION, 0.8),
    perMinuteRequests: num(env.PER_MINUTE_REQUEST_CAP, 8),
    starterCredits: num(env.STARTER_CREDITS, 100),
  };
}

export function estimateCostMicros(env, provider, modelId, usage) {
  const m = findModel(env, provider, modelId);
  const p = (m && m.price) || { in: 1, out: 5, cachedIn: 0.1 };
  const fresh = Math.max(0, (usage.input || 0) - (usage.cached || 0));
  const usd = (fresh * p.in + (usage.cached || 0) * (p.cachedIn ?? p.in) + (usage.output || 0) * p.out) / 1e6;
  return Math.round(usd * 1e6);
}

// Optional base URLs, e.g. a Cloudflare AI Gateway in front of each provider
// (ANTHROPIC_BASE_URL = "https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/anthropic").
export function baseUrl(env, provider) {
  return { anthropic: env.ANTHROPIC_BASE_URL, openai: env.OPENAI_BASE_URL, gemini: env.GEMINI_BASE_URL }[provider] || undefined;
}
