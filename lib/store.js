// Хранилище «ключ → значение» с двумя реализациями:
//  - Upstash Redis через REST (обычный fetch, без зависимостей) для продакшена;
//  - память + файл для локальной разработки и тестов.
// Главная операция здесь setnx: «записать, только если ключа ещё нет». На ней держится защита от двойной записи.
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

function redisStore() {
  const call = async (suffix, body) => {
    const res = await fetch(url.replace(/\/$/, '') + suffix, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) throw new Error(`Redis: HTTP ${res.status}`);
    return json;
  };
  const cmd = async (...args) => { const r = await call('', args); if (r.error) throw new Error(`Redis: ${r.error}`); return r.result; };
  const pipeline = async (cmds) => {
    if (!cmds.length) return [];
    const r = await call('/pipeline', cmds);
    return r.map((x) => { if (x.error) throw new Error(`Redis: ${x.error}`); return x.result; });
  };
  return {
    kind: 'redis',
    get: (k) => cmd('GET', k),
    set: (k, v) => cmd('SET', k, v),
    setnx: async (k, v) => (await cmd('SET', k, v, 'NX')) === 'OK',
    del: (...keys) => (keys.length ? cmd('DEL', ...keys) : 0),
    mget: (keys) => pipeline(keys.map((k) => ['GET', k])),
    sadd: (k, m) => cmd('SADD', k, m),
    smembers: (k) => cmd('SMEMBERS', k),
  };
}

function memoryStore() {
  const file = process.env.DATA_FILE;
  let data = new Map();
  if (file && fs.existsSync(file)) { try { data = new Map(Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))); } catch { /* начинаем с пустого */ } }
  const save = () => { if (!file) return; fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(Object.fromEntries(data))); };
  return {
    kind: 'memory',
    get: async (k) => (data.has(k) ? data.get(k) : null),
    set: async (k, v) => { data.set(k, v); save(); },
    setnx: async (k, v) => { if (data.has(k)) return false; data.set(k, v); save(); return true; },
    del: async (...keys) => { keys.forEach((k) => data.delete(k)); save(); },
    mget: async (keys) => keys.map((k) => (data.has(k) ? data.get(k) : null)),
    sadd: async (k, m) => { const s = new Set(data.get(k) || []); s.add(m); data.set(k, [...s]); save(); },
    smembers: async (k) => [...(data.get(k) || [])],
    clear: () => { data = new Map(); save(); },
  };
}

export const store = url && token ? redisStore() : memoryStore();
