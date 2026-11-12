import { handleUpdate, webhookSecret, telegramReady } from '../lib/telegram.js';
import { route } from '../lib/http.js';

// Вебхук Telegram. Секрет в заголовке гарантирует, что запрос пришёл от Telegram, а не от постороннего.
export default route({
  POST: async (req, res) => {
    if (!telegramReady() || req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret()) return res.status(401).json({ ok: false });
    try { await handleUpdate(req.body || {}); } catch (e) { console.error(e); }
    res.status(200).json({ ok: true }); // всегда 200, иначе Telegram будет повторять запрос
  },
});
