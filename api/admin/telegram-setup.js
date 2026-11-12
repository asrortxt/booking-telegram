import { tg, telegramReady, webhookSecret } from '../../lib/telegram.js';
import { HttpError } from '../../lib/bookings.js';
import { route, requireAdmin } from '../../lib/http.js';

// Регистрирует адрес этого сайта как вебхук бота. Вызывается кнопкой в админке один раз после деплоя.
export default route({
  POST: async (req, res) => {
    requireAdmin(req);
    if (!telegramReady()) throw new HttpError(400, 'no_token', 'Сначала задайте переменную TELEGRAM_BOT_TOKEN');
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const url = `https://${host}/api/telegram`;
    try {
      await tg('setWebhook', { url, secret_token: webhookSecret(), allowed_updates: ['message', 'callback_query'] });
    } catch (e) { throw new HttpError(502, 'telegram', `Telegram не принял адрес: ${e.message}`); }
    res.status(200).json({ ok: true, url });
  },
});
