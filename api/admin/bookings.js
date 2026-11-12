import { listRange, setStatus } from '../../lib/bookings.js';
import { business } from '../../lib/config.js';
import { nowIn } from '../../lib/time.js';
import { store } from '../../lib/store.js';
import { telegramReady } from '../../lib/telegram.js';
import { route, requireAdmin } from '../../lib/http.js';

export default route({
  GET: async (req, res) => {
    requireAdmin(req);
    res.setHeader('Cache-Control', 'no-store');
    const today = nowIn(business.timezone).date;
    res.status(200).json({
      today, currency: business.currency, days: await listRange(today, business.horizonDays + 1),
      storage: store.kind, telegram: { bot: telegramReady(), chat: Boolean(process.env.TELEGRAM_CHAT_ID) },
    });
  },
  PATCH: async (req, res) => {
    requireAdmin(req);
    res.status(200).json({ booking: await setStatus(req.query.id, req.body?.status) });
  },
});
