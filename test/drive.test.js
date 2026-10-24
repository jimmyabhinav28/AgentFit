// The AgentFit folder in Google Drive, against an in-memory fake of the Drive v3 API.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---- browser globals the module expects ----
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.location = { origin: 'https://app.test', pathname: '/', hash: '' };
globalThis.history = { replaceState() {} };
localStorage.setItem('af.gtoken', JSON.stringify({ accessToken: 'tok', expiresAt: Date.now() + 3600e3 }));

// ---- fake Drive ----
let files, seq;
function reset() { files = new Map(); seq = 0; }
const add = f => { const id = 'f' + ++seq; files.set(id, { trashed: false, parents: ['root'], appProperties: {}, ...f, id }); return id; };
function matches(f, q, appData) {
  if (appData !== (f.parents[0] === 'appDataFolder')) return false;
  if (!q) return true;
  let m;
  if ((m = /appProperties has \{ key='agentfit' and value='(\w+)' \}/.exec(q)) && f.appProperties.agentfit !== m[1]) return false;
  if ((m = /mimeType='([^']+)'/.exec(q)) && f.mimeType !== m[1]) return false;
  if ((m = /name='((?:[^'\\]|\\.)*)'/.exec(q)) && f.name !== m[1].replace(/\\'/g, "'")) return false;
  if ((m = /'(\w+)' in parents/.exec(q)) && !f.parents.includes(m[1])) return false;
  if (/trashed=false/.test(q) && f.trashed) return false;
  return true;
}
async function fakeFetch(url, init = {}) {
  const u = new URL(url);
  const method = init.method || 'GET';
  assert.equal(init.headers.Authorization, 'Bearer tok');
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
  let m;
  if (u.pathname === '/drive/v3/files' && method === 'GET') {
    const appData = u.searchParams.get('spaces') === 'appDataFolder';
    return json({ files: [...files.values()].filter(f => matches(f, u.searchParams.get('q'), appData)).map(f => ({ id: f.id, name: f.name, size: String((f.content || '').length) })) });
  }
  if (u.pathname === '/drive/v3/files' && method === 'POST') {
    const meta = JSON.parse(init.body);
    return json({ id: add({ ...meta, parents: meta.parents || ['root'] }) });
  }
  if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
    const meta = JSON.parse(await init.body.get('metadata').text());
    return json({ id: add({ ...meta, content: await init.body.get('file').text() }) });
  }
  if ((m = /^\/upload\/drive\/v3\/files\/(\w+)$/.exec(u.pathname)) && method === 'PATCH') {
    files.get(m[1]).content = typeof init.body === 'string' ? init.body : await init.body.text();
    return json({ id: m[1] });
  }
  if ((m = /^\/drive\/v3\/files\/(\w+)$/.exec(u.pathname)) && method === 'GET') {
    const f = files.get(m[1]);
    return f ? new Response(f.content) : json({}, 404);
  }
  if ((m = /^\/drive\/v3\/files\/(\w+)$/.exec(u.pathname)) && method === 'DELETE') {
    const del = id => { for (const f of [...files.values()]) if (f.parents.includes(id)) del(f.id); files.delete(id); };
    del(m[1]);
    return new Response(null, { status: 204 });
  }
  throw new Error('unexpected ' + method + ' ' + url);
}
globalThis.fetch = fakeFetch;

const drive = await import('../public/js/drive.js');
const byName = name => [...files.values()].find(f => f.name === name);

test('creates a visible AgentFit folder with the data, answers and about files', async () => {
  reset(); drive.resetCache();
  const doc = { profile: { name: 'Riya' }, paused: { workout: { step: 'goal', startedAt: 1, answers: { upper: { value: 10 } } }, food: null }, answers: { food: { answers: { food: { dietType: 'eggetarian' } }, completedAt: 2, planVersion: 1 } } };
  await drive.pushData(doc);
  const folder = byName('AgentFit');
  assert.equal(folder.mimeType, 'application/vnd.google-apps.folder');
  assert.deepEqual(folder.parents, ['root']);
  for (const n of ['agentfit-data.json', 'planner-answers.json', 'About this folder.txt']) assert.deepEqual(byName(n).parents, [folder.id], n);
  const answers = JSON.parse(byName('planner-answers.json').content);
  assert.equal(answers.workout.inProgress.step, 'goal');
  assert.equal(answers.food.lastCompleted.answers.food.dietType, 'eggetarian');
  assert.deepEqual(await drive.pullData(), doc);

  // A second push updates in place rather than creating duplicates.
  await drive.pushData({ ...doc, profile: { name: 'Riya S' } });
  assert.equal([...files.values()].filter(f => f.name === 'agentfit-data.json').length, 1);

  // Renaming the folder in Drive doesn't lose it (found by appProperties).
  folder.name = 'My fitness';
  drive.resetCache();
  assert.equal((await drive.pullData()).profile.name, 'Riya S');
  assert.equal([...files.values()].filter(f => f.mimeType === 'application/vnd.google-apps.folder').length, 1);
  assert.match(await drive.folderUrl(), new RegExp(folder.id + '$'));
});

test('health reports go into a subfolder; account deletion removes everything', async () => {
  reset(); drive.resetCache();
  await drive.uploadHealthFile(new File(['pdf'], 'Checkup.pdf', { type: 'application/pdf' }));
  await drive.uploadHealthFile(new File(['pdf2'], 'Checkup.pdf', { type: 'application/pdf' }));
  const list = await drive.listHealthFiles();
  assert.equal(list.length, 2);
  assert.notEqual(list[0].name, list[1].name);
  const hf = byName('Health reports');
  assert.equal(hf.parents[0], byName('AgentFit').id);
  await drive.deleteFile(list[0].id);
  assert.equal((await drive.listHealthFiles()).length, 1);
  await drive.pushData({ profile: {} });
  add({ name: 'fitness-data.json', parents: ['appDataFolder'], content: '{"levels":{}}' });
  await drive.deleteAllAppData();
  assert.deepEqual([...files.values()].map(f => f.name), ['fitness-data.json'], 'only the old app backup survives');
});

test('data from the hidden app folder is picked up once; the old app backup can be imported', async () => {
  reset(); drive.resetCache();
  add({ name: 'agentfit-data.json', parents: ['appDataFolder'], content: '{"profile":{"name":"Old"}}' });
  add({ name: 'fitness-data.json', parents: ['appDataFolder'], content: '{"startMonday":"2026-10-19"}' });
  assert.equal((await drive.pullData()).profile.name, 'Old');
  assert.equal((await drive.pullLegacy()).startMonday, '2026-10-19');
});
