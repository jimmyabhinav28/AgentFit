// A tiny key-value store on IndexedDB (falls back to memory if unavailable).
const DB = 'agentfit', STORE = 'kv';
let dbp = null;
const mem = new Map();

function open() {
  if (dbp) return dbp;
  dbp = new Promise(resolve => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}
function tx(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    if (!db) { resolve(fn(null)); return; }
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
  }));
}
export async function get(key) {
  const db = await open();
  if (!db) return mem.get(key);
  return new Promise(resolve => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(undefined);
  });
}
export async function set(key, value) {
  const db = await open();
  if (!db) { mem.set(key, value); return; }
  await tx('readwrite', s => s.put(value, key));
}
export async function del(key) {
  const db = await open();
  if (!db) { mem.delete(key); return; }
  await tx('readwrite', s => s.delete(key));
}
