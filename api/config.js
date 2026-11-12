import { business } from '../lib/config.js';
import { nowIn } from '../lib/time.js';
import { route } from '../lib/http.js';

// Публичные настройки для страницы записи. «Сегодня» отдаёт сервер, чтобы не зависеть от часов клиента.
export default route({
  GET: async (req, res) => {
    const { name, tagline, address, currency, open, close, daysOff, horizonDays, services } = business;
    res.status(200).json({ name, tagline, address, currency, open, close, daysOff, horizonDays, services, today: nowIn(business.timezone).date });
  },
});
