// Telegram: уведомление владельцу о новой записи и обработка нажатий кнопок под сообщением.
import crypto from 'node:crypto';
import { business } from './config.js';
import { setStatus, dayBookings } from './bookings.js';
import { fromMin, toMin, formatDateRu, nowIn } from './time.js';

const token = () => process.env.TELEGRAM_BOT_TOKEN;
const chatId = () => process.env.TELEGRAM_CHAT_ID;
export const telegramReady = () => Boolean(token());
export const webhookSecret = () => crypto.createHash('sha256').update(`${token()}:webhook`).digest('hex').slice(0, 32);

export async function tg(method, payload) {
  if (!token()) return null;
  const base = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';
  const res = await fetch(`${base}/bot${token()}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description || res.status}`);
  return json.result;
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const STATUS = { new: '🆕 Новая запись', confirmed: '✅ Подтверждено', cancelled: '❌ Отменено' };

export function bookingText(b) {
  const end = fromMin(toMin(b.time) + b.minutes);
  return [
    `<b>${STATUS[b.status]}</b>`,
    `${esc(b.serviceName)}, ${b.minutes} мин, ${b.price} ${business.currency}`,
    `📅 ${formatDateRu(b.date)}, ${b.time}–${end}`,
    `👤 ${esc(b.name)}`,
    `📞 ${esc(b.phone)}`,
    b.comment ? `💬 ${esc(b.comment)}` : null,
  ].filter(Boolean).join('\n');
}

const keyboard = (b) => {
  if (b.status === 'new') return { inline_keyboard: [[{ text: 'Подтвердить', callback_data: `c:${b.id}` }, { text: 'Отменить', callback_data: `x:${b.id}` }]] };
  if (b.status === 'confirmed') return { inline_keyboard: [[{ text: 'Отменить запись', callback_data: `x:${b.id}` }]] };
  return { inline_keyboard: [] };
};

// Сбой Telegram не должен ломать запись клиента, поэтому ошибку только логируем.
export async function notifyNew(booking) {
  if (!token() || !chatId()) return false;
  try {
    await tg('sendMessage', { chat_id: chatId(), text: bookingText(booking), parse_mode: 'HTML', reply_markup: keyboard(booking) });
    return true;
  } catch (e) { console.error(e.message); return false; }
}

export async function handleUpdate(update) {
  const cb = update.callback_query, msg = update.message;

  if (cb) {
    const from = String(cb.message?.chat?.id ?? '');
    if (!chatId() || from !== String(chatId())) { await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Нет доступа' }); return; }
    const [action, id] = String(cb.data || '').split(':');
    const status = action === 'c' ? 'confirmed' : action === 'x' ? 'cancelled' : null;
    if (!status) { await tg('answerCallbackQuery', { callback_query_id: cb.id }); return; }
    try {
      const b = await setStatus(id, status);
      await tg('editMessageText', { chat_id: from, message_id: cb.message.message_id, text: bookingText(b), parse_mode: 'HTML', reply_markup: keyboard(b) });
      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: status === 'confirmed' ? 'Запись подтверждена' : 'Запись отменена, время свободно' });
    } catch (e) {
      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: e.message, show_alert: true });
    }
    return;
  }

  if (msg?.text) {
    const chat = String(msg.chat.id), text = msg.text.trim().split(/[\s@]/)[0];
    if (text === '/start') {
      const linked = chatId() && chat === String(chatId());
      await tg('sendMessage', { chat_id: chat, parse_mode: 'HTML', text: linked
        ? 'Бот подключён. Сюда будут приходить новые записи.\n/today покажет записи на сегодня.'
        : `Id этого чата: <code>${chat}</code>\nДобавьте его в переменную TELEGRAM_CHAT_ID и передеплойте проект.` });
    } else if (text === '/today' && chatId() && chat === String(chatId())) {
      const { date } = nowIn(business.timezone);
      const items = (await dayBookings(date)).filter((b) => b.status !== 'cancelled');
      await tg('sendMessage', { chat_id: chat, parse_mode: 'HTML', text: items.length
        ? `<b>Сегодня, ${formatDateRu(date)}</b>\n` + items.map((b) => `${b.time} ${esc(b.serviceName)}, ${esc(b.name)} ${b.status === 'confirmed' ? '✅' : '🆕'}`).join('\n')
        : 'На сегодня записей нет.' });
    }
  }
}
