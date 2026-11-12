// Общая обвязка для функций: выбор обработчика по методу, единый формат ошибок, проверка админа.
import crypto from 'node:crypto';
import { HttpError } from './bookings.js';

export function route(handlers) {
  return async (req, res) => {
    const fn = handlers[req.method];
    try {
      if (!fn) throw new HttpError(405, 'method', 'Метод не поддерживается');
      if (typeof req.body === 'string') { try { req.body = JSON.parse(req.body); } catch { req.body = {}; } }
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.code, message: e.message, fields: e.fields });
      console.error(e);
      return res.status(500).json({ error: 'server', message: 'Что-то сломалось на сервере. Попробуйте ещё раз через минуту' });
    }
  };
}

// Токен админа: «срок.подпись», подпись считается HMAC от пароля. Состояние на сервере не хранится.
const TTL = 12 * 60 * 60 * 1000;
const secret = () => process.env.ADMIN_PASSWORD || '';
const sign = (exp) => crypto.createHmac('sha256', `admin:${secret()}`).update(String(exp)).digest('base64url');
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function login(password) {
  if (!secret()) throw new HttpError(503, 'no_password', 'Админка выключена: задайте переменную ADMIN_PASSWORD');
  const h = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
  if (!same(h(password), h(secret()))) throw new HttpError(401, 'bad_password', 'Неверный пароль');
  const exp = Date.now() + TTL;
  return `${exp}.${sign(exp)}`;
}

export function requireAdmin(req) {
  const header = req.headers.authorization || '';
  const [exp, sig] = header.replace(/^Bearer\s+/i, '').split('.');
  if (!secret() || !exp || !sig || !same(sig, sign(exp)) || Number(exp) < Date.now()) {
    throw new HttpError(401, 'unauthorized', 'Войдите в админку заново');
  }
}
