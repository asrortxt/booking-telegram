// Даты приходят строками 'YYYY-MM-DD' в часовом поясе бизнеса, поэтому считаем и форматируем их в UTC.
const at = (date) => new Date(`${date}T00:00:00Z`);
const fmt = (opts) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', ...opts });

export const addDays = (date, n) => { const d = at(date); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekday = (date) => at(date).getUTCDay();
export const weekdayShort = (date) => fmt({ weekday: 'short' }).format(at(date));
export const dayNum = (date) => at(date).getUTCDate();
export const monthShort = (date) => fmt({ month: 'short' }).format(at(date)).replace('.', '');
export const longDate = (date) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(at(date));
export const endTime = (time, minutes) => {
  const [h, m] = time.split(':').map(Number), t = h * 60 + m + minutes;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
