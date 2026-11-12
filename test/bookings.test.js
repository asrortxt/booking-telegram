import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_PASSWORD = 'secret';
process.env.TELEGRAM_BOT_TOKEN = '123:TEST';
process.env.TELEGRAM_CHAT_ID = '777';

const { store } = await import('../lib/store.js');
const { slotsFor, createBooking, setStatus, getBooking, HttpError } = await import('../lib/bookings.js');
const { notifyNew, handleUpdate } = await import('../lib/telegram.js');
const { login, requireAdmin } = await import('../lib/http.js');

const NOW = { date: '2026-11-12', minutes: 9 * 60 };   // четверг, 09:00
const DAY = '2026-11-16';                              // понедельник
const person = (n) => ({ name: `Клиент ${n}`, phone: `+4915100000${String(n).padStart(2, '0')}` });
const book = (over, n = 1) => createBooking({ serviceId: 'cut', date: DAY, time: '10:00', ...person(n), ...over }, NOW);
const code = async (p) => { try { await p; return 'ok'; } catch (e) { assert.ok(e instanceof HttpError, e.stack); return e.code; } };
const free = async (service) => (await slotsFor(DAY, service, NOW)).filter((s) => s.free).map((s) => s.time);

test.beforeEach(() => store.clear());

test('слоты: шаг 30 минут, последний начинается так, чтобы услуга закончилась до закрытия', async () => {
  const slots = await slotsFor(DAY, 'cut', NOW);
  assert.equal(slots.length, 19);
  assert.equal(slots[0].time, '10:00');
  assert.equal(slots.at(-1).time, '19:00');
  assert.equal((await slotsFor(DAY, 'cut-beard', NOW)).at(-1).time, '18:30');
});

test('запись занимает своё время для всех услуг', async () => {
  await book();                                        // 10:00–10:45
  const f = await free('kids');
  assert.ok(!f.includes('10:00') && !f.includes('10:30'));
  assert.ok(f.includes('11:00'));
});

test('гонка: из 10 одновременных запросов на одно время проходит один', async () => {
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => code(book({}, i))));
  assert.equal(results.filter((r) => r === 'ok').length, 1);
  assert.equal(results.filter((r) => r === 'slot_taken').length, 9);
});

test('пересечение по времени отклоняется, а частично взятые замки освобождаются', async () => {
  await book({ serviceId: 'kids', time: '11:00' }, 1); // 11:00–11:30
  assert.equal(await code(book({ serviceId: 'cut-beard', time: '10:00' }, 2)), 'slot_taken'); // 10:00–11:15 задевает 11:00
  assert.equal(await code(book({ serviceId: 'kids', time: '10:00' }, 3)), 'ok');               // 10:00 осталось свободным
});

test('отмена освобождает время, отменённую запись нельзя вернуть', async () => {
  const b = await book();
  assert.equal((await setStatus(b.id, 'confirmed')).status, 'confirmed');
  await setStatus(b.id, 'cancelled');
  assert.ok((await free('cut')).includes('10:00'));
  assert.equal(await code(setStatus(b.id, 'confirmed')), 'already_cancelled');
  assert.equal(await code(book({}, 2)), 'ok');
});

test('проверка данных и правил', async () => {
  assert.equal(await code(book({ name: 'A' })), 'invalid');
  assert.equal(await code(book({ phone: '123' })), 'invalid');
  assert.equal(await code(book({ serviceId: 'nope' })), 'invalid');
  assert.equal(await code(book({ time: '10:15' })), 'bad_time');            // не по сетке
  assert.equal(await code(book({ time: '19:30' })), 'bad_time');            // не успеет до закрытия
  assert.equal(await code(book({ date: '2026-11-15' })), 'bad_date');       // воскресенье
  assert.equal(await code(book({ date: '2026-11-10' })), 'bad_date');       // прошлое
  assert.equal(await code(book({ date: '2027-01-10' })), 'bad_date');       // слишком далеко
  assert.equal(await code(setStatus('missing', 'cancelled')), 'not_found');
});

test('сегодня нельзя записаться позже чем за час до начала', async () => {
  const noon = { date: DAY, minutes: 12 * 60 };
  const slots = await slotsFor(DAY, 'cut', noon);
  assert.equal(slots.find((s) => s.time === '12:30').free, false);
  assert.equal(slots.find((s) => s.time === '13:00').free, true);
  assert.equal(await code(createBooking({ serviceId: 'cut', date: DAY, time: '12:30', ...person(1) }, noon)), 'slot_past');
});

test('один телефон: одна активная запись в день', async () => {
  await book({}, 1);
  assert.equal(await code(book({ time: '15:00' }, 1)), 'duplicate');
});

test('Telegram: уведомление с кнопками, подтверждение по кнопке, чужой чат без доступа', async () => {
  const calls = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { calls.push({ method: String(url).split('/').pop(), body: JSON.parse(opts.body) }); return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) }; };
  try {
    const b = await book({ comment: '<b>тег</b>' });
    assert.equal(await notifyNew(b), true);
    assert.equal(calls[0].method, 'sendMessage');
    assert.equal(calls[0].body.chat_id, '777');
    assert.match(calls[0].body.text, /&lt;b&gt;тег/);                       // текст клиента экранирован
    assert.equal(calls[0].body.reply_markup.inline_keyboard[0][0].callback_data, `c:${b.id}`);

    await handleUpdate({ callback_query: { id: 'q1', data: `c:${b.id}`, message: { message_id: 5, chat: { id: 999 } } } });
    assert.equal((await getBooking(b.id)).status, 'new');                   // чужой чат ничего не меняет

    await handleUpdate({ callback_query: { id: 'q2', data: `c:${b.id}`, message: { message_id: 5, chat: { id: 777 } } } });
    assert.equal((await getBooking(b.id)).status, 'confirmed');
    assert.ok(calls.some((c) => c.method === 'editMessageText' && /Подтверждено/.test(c.body.text)));

    await handleUpdate({ callback_query: { id: 'q3', data: `x:${b.id}`, message: { message_id: 5, chat: { id: 777 } } } });
    assert.equal((await getBooking(b.id)).status, 'cancelled');
    assert.ok((await free('cut')).includes('10:00'));
  } finally { globalThis.fetch = realFetch; }
});

test('админ: вход и проверка токена', () => {
  assert.throws(() => login('wrong'), (e) => e.code === 'bad_password');
  const token = login('secret');
  assert.doesNotThrow(() => requireAdmin({ headers: { authorization: `Bearer ${token}` } }));
  assert.throws(() => requireAdmin({ headers: {} }), (e) => e.code === 'unauthorized');
  assert.throws(() => requireAdmin({ headers: { authorization: `Bearer ${Date.now() + 1e9}.fake` } }), (e) => e.code === 'unauthorized');
  assert.throws(() => requireAdmin({ headers: { authorization: `Bearer ${Date.now() - 1}.${token.split('.')[1]}` } }), (e) => e.code === 'unauthorized');
});
