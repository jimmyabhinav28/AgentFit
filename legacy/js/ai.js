// Optional AI coach. The user pastes their own API key; calls go straight
// from the browser to the provider. Nothing passes through any server.

export const PROVIDERS = {
  none: { label: 'Off' },
  claude: { label: 'Claude (Anthropic API key)', model: 'claude-haiku-4-5' },
  openai: { label: 'ChatGPT (OpenAI API key)', model: 'gpt-4o-mini' },
  gemini: { label: 'Gemini (Google AI Studio key)', model: 'gemini-2.0-flash' },
};

const SYSTEM = 'You are a friendly, concise strength and running coach. The user trains at home with two adjustable dumbbells (2 to 40 kg each, 2 kg steps), resistance bands and a mat, and follows a fixed weekly plan where each exercise has a level and a 4-week ramp. Answer in plain English, under 200 words, with specific advice. Never suggest equipment they do not own.';

export async function ask(settings, context, question) {
  const provider = settings.aiProvider;
  const key = (settings.aiKey || '').trim();
  const model = (settings.aiModel || '').trim() || PROVIDERS[provider]?.model;
  if (provider === 'none' || !key) throw new Error('Add an API key in Settings first.');
  const userText = `${context}\n\nQuestion: ${question}`;
  if (provider === 'claude') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: 600, system: SYSTEM, messages: [{ role: 'user', content: userText }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || 'Claude request failed');
    return j.content.map(c => c.text || '').join('');
  }
  if (provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, max_tokens: 600, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userText }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || 'OpenAI request failed');
    return j.choices[0].message.content;
  }
  if (provider === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ system_instruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: userText }] }], generationConfig: { maxOutputTokens: 600 } }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || 'Gemini request failed');
    return j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  }
  throw new Error('Unknown provider');
}

// Text to paste into claude.ai, ChatGPT or Gemini when using a chat subscription.
export function chatPrompt(context, question) {
  return `${SYSTEM}\n\n${context}\n\nQuestion: ${question || 'How am I doing this week, and should I progress or regress anything?'}`;
}
