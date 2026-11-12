// Локальный сервер без зависимостей: запускает функции из /api так же, как это делает Vercel,
// и раздаёт собранный фронт из dist/ (после `npm run build`).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.DATA_FILE ||= path.join(root, '.data', 'dev.json');
if (!process.env.ADMIN_PASSWORD) { process.env.ADMIN_PASSWORD = 'admin'; console.log('ADMIN_PASSWORD не задан, для разработки используется пароль: admin'); }

const port = Number(process.env.PORT || 3001);
const staticDir = path.resolve(root, process.env.STATIC_DIR || 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    const file = path.join(root, `${url.pathname.replace(/\/$/, '')}.js`);
    if (!file.startsWith(path.join(root, 'api')) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('{"error":"not_found"}'); }
    let raw = ''; for await (const chunk of req) raw += chunk;
    req.query = Object.fromEntries(url.searchParams);
    req.body = raw && /json/.test(req.headers['content-type'] || '') ? JSON.parse(raw) : raw || undefined;
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
    const mod = await import(pathToFileURL(file).href);
    return mod.default(req, res);
  }
  let file = path.join(staticDir, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(staticDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(staticDir, 'index.html');
  if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('Фронт не собран: запустите npm run build или npm run dev'); }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`API и сайт: http://localhost:${port}`));
