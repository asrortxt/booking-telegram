import { slotsFor } from '../lib/bookings.js';
import { route } from '../lib/http.js';

export default route({
  GET: async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ slots: await slotsFor(req.query.date, req.query.service) });
  },
});
