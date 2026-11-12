// Настройки бизнеса. Всё, что нужно поменять под другого мастера, находится здесь.
export const business = {
  name: 'Борода и ножницы',
  tagline: 'Барбершоп. Запись онлайн за минуту',
  address: 'ул. Примерная, 12',
  timezone: 'Europe/Berlin', // часовой пояс бизнеса: в нём считаются «сегодня» и «уже прошло»
  currency: '€',
  open: '10:00',
  close: '20:00',
  daysOff: [0],              // 0 = воскресенье, 6 = суббота
  slotStep: 30,              // шаг начала записи, минут
  cell: 15,                  // минимальная ячейка расписания, минут (длительности услуг кратны ей)
  leadMinutes: 60,           // нельзя записаться позже чем за час до начала
  horizonDays: 21,           // на сколько дней вперёд открыта запись
  services: [
    { id: 'cut',       name: 'Стрижка',           minutes: 45, price: 25 },
    { id: 'cut-beard', name: 'Стрижка и борода',  minutes: 75, price: 40 },
    { id: 'beard',     name: 'Оформление бороды', minutes: 30, price: 15 },
    { id: 'kids',      name: 'Детская стрижка',   minutes: 30, price: 18 },
  ],
};

export const serviceById = (id) => business.services.find((s) => s.id === id);
