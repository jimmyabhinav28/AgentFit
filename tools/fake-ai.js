// Local stand-in for the Anthropic API, for trying the app without spending tokens.
// Run: node tools/fake-ai.js   then set ANTHROPIC_BASE_URL=http://localhost:8799 in .dev.vars
import http from 'node:http';
import { fakeAnthropic } from '../test/harness.js';

const fake = fakeAnthropic({ badFirstPlan: false });
http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  try {
    const r = await fake('https://api.anthropic.com' + req.url, { method: req.method, headers: req.headers, body });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    const reader = r.body.getReader();
    for (;;) { const { value, done } = await reader.read(); if (done) break; res.write(value); }
    res.end();
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(8799, () => console.log('fake AI on http://localhost:8799'));
