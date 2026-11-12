import { createBooking } from '../lib/bookings.js';
import { notifyNew } from '../lib/telegram.js';
import { route } from '../lib/http.js';

export default route({
  POST: async (req, res) => {
    const booking = await createBooking(req.body);
    await notifyNew(booking);
    const { id, serviceName, date, time, minutes, price, status } = booking;
    res.status(201).json({ booking: { id, serviceName, date, time, minutes, price, status } });
  },
});
