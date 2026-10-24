// Small HTTP helpers shared by the routes.

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) { super(message); this.status = status; this.code = code; this.extra = extra; }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}

export function errorResponse(e) {
  if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message, ...e.extra } }, e.status);
  console.error('unhandled', e && e.stack ? e.stack : e);
  return json({ error: { code: 'server_error', message: 'Something went wrong on our side. Please try again.' } }, 500);
}

export async function readJson(request, maxBytes = 1_500_000) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) throw new HttpError(413, 'too_large', 'Request is too large.');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'too_large', 'Request is too large.');
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'bad_json', 'Request body must be JSON.'); }
}

export const newId = (prefix = '') => prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
export const now = () => Date.now();
export const utcDay = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);

// Server-sent events. Returns { response, send, close }.
export function sse() {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  let closed = false;
  const send = async (event, data) => {
    if (closed) return;
    try { await writer.write(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { closed = true; }
  };
  const close = async () => { if (closed) return; closed = true; try { await writer.close(); } catch { /* client gone */ } };
  const response = new Response(readable, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
  });
  return { response, send, close, isClosed: () => closed };
}
