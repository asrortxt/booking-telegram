// Вся бизнес-логика записи: свободные слоты, проверка данных, создание и смена статуса.
import crypto from 'node:crypto';
import { business, serviceById } from './config.js';
import { store } from './store.js';
import { toMin, fromMin, isDate, isTime, addDays, weekday, daysBetween, nowIn } from './time.js';

export class HttpError extends Error {
  constructor(status, code, message, fields) { super(message); this.status = status; this.code = code; this.fields = fields; }
}

const ACTIVE = new Set(['new', 'confirmed']);
const lockKey = (date, cell) => `lock:${date}:${cell}`;
const cellsFor = (time, minutes) => {
  const start = toMin(time), out = [];
  for (let m = start; m < start + minutes; m += business.cell) out.push(fromMin(m));
  return out;
};

export async function dayBookings(date) {
  const ids = await store.smembers(`day:${date}`);
  const raw = await store.mget(ids.map((id) => `booking:${id}`));
  return raw.filter(Boolean).map((r) => (typeof r === 'string' ? JSON.parse(r) : r)).sort((a, b) => a.time.localeCompare(b.time));
}

// Почему день недоступен для записи (или null, если доступен).
export function dayProblem(date, now = nowIn(business.timezone)) {
  if (!isDate(date)) return 'Неверная дата';
  const ahead = daysBetween(now.date, date);
  if (ahead < 0) return 'Этот день уже прошёл';
  if (ahead > business.horizonDays) return `Запись открыта на ${business.horizonDays} дней вперёд`;
  if (business.daysOff.includes(weekday(date))) return 'В этот день мы не работаем';
  return null;
}

// Слоты дня для услуги: [{ time, free }]. Занятые тоже возвращаем, чтобы показать их зачёркнутыми.
export async function slotsFor(date, serviceId, now = nowIn(business.timezone)) {
  const service = serviceById(serviceId);
  if (!service) throw new HttpError(400, 'bad_service', 'Такой услуги нет');
  const problem = dayProblem(date, now);
  if (problem) throw new HttpError(400, 'bad_date', problem);

  const busy = new Set();
  for (const b of await dayBookings(date)) if (ACTIVE.has(b.status)) cellsFor(b.time, b.minutes).forEach((c) => busy.add(c));

  const open = toMin(business.open), close = toMin(business.close), slots = [];
  for (let start = open; start + service.minutes <= close; start += business.slotStep) {
    const time = fromMin(start);
    const past = date === now.date && start < now.minutes + business.leadMinutes;
    const free = !past && cellsFor(time, service.minutes).every((c) => !busy.has(c));
    slots.push({ time, free });
  }
  return slots;
}

const normPhone = (s) => String(s || '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');

export function validateInput(body) {
  const fields = {}, b = body && typeof body === 'object' ? body : {};
  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  const phone = normPhone(b.phone);
  const comment = String(b.comment || '').trim();
  if (!serviceById(b.serviceId)) fields.serviceId = 'Выберите услугу';
  if (!isDate(b.date)) fields.date = 'Выберите день';
  if (!isTime(b.time)) fields.time = 'Выберите время';
  if (name.length < 2 || name.length > 60) fields.name = 'Укажите имя: от 2 до 60 символов';
  const digits = phone.replace(/\D/g, '').length;
  if (digits < 7 || digits > 15) fields.phone = 'Укажите телефон с кодом, например +49 151 2345678';
  if (comment.length > 300) fields.comment = 'Комментарий не длиннее 300 символов';
  if (Object.keys(fields).length) throw new HttpError(400, 'invalid', 'Проверьте поля формы', fields);
  return { serviceId: b.serviceId, date: b.date, time: b.time, name, phone, comment };
}

export async function createBooking(input, now = nowIn(business.timezone)) {
  const v = validateInput(input), service = serviceById(v.serviceId);

  const problem = dayProblem(v.date, now);
  if (problem) throw new HttpError(400, 'bad_date', problem);
  const start = toMin(v.time), open = toMin(business.open), close = toMin(business.close);
  if (start < open || start + service.minutes > close || (start - open) % business.slotStep !== 0) {
    throw new HttpError(400, 'bad_time', 'На это время записаться нельзя');
  }
  if (v.date === now.date && start < now.minutes + business.leadMinutes) {
    throw new HttpError(409, 'slot_past', 'Это время уже недоступно. Выберите более позднее');
  }
  const same = (await dayBookings(v.date)).find((b) => ACTIVE.has(b.status) && b.phone === v.phone);
  if (same) throw new HttpError(409, 'duplicate', `На этот день у вас уже есть запись в ${same.time}`);

  // Защита от двойной записи. Каждая 15-минутная ячейка получает ключ-замок через SET NX:
  // операция атомарна, поэтому из двух одновременных запросов на одно время выигрывает ровно один.
  const id = crypto.randomBytes(6).toString('base64url');
  const cells = cellsFor(v.time, service.minutes), taken = [];
  for (const cell of cells) {
    if (await store.setnx(lockKey(v.date, cell), id)) taken.push(cell);
    else {
      await store.del(...taken.map((c) => lockKey(v.date, c)));
      throw new HttpError(409, 'slot_taken', 'Это время только что заняли. Выберите другое');
    }
  }

  const booking = { id, ...v, serviceName: service.name, minutes: service.minutes, price: service.price, status: 'new', createdAt: new Date().toISOString() };
  await store.set(`booking:${id}`, JSON.stringify(booking));
  await store.sadd(`day:${v.date}`, id);
  return booking;
}

export async function getBooking(id) {
  const raw = await store.get(`booking:${id}`);
  return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
}

// Разрешённые переходы: new → confirmed | cancelled, confirmed → cancelled. Отмена освобождает время.
export async function setStatus(id, status) {
  if (!['confirmed', 'cancelled'].includes(status)) throw new HttpError(400, 'bad_status', 'Неизвестный статус');
  const booking = await getBooking(String(id || ''));
  if (!booking) throw new HttpError(404, 'not_found', 'Запись не найдена');
  if (booking.status === status) return booking;
  if (booking.status === 'cancelled') throw new HttpError(409, 'already_cancelled', 'Запись уже отменена, время могло быть занято снова');
  booking.status = status;
  await store.set(`booking:${id}`, JSON.stringify(booking));
  if (status === 'cancelled') await store.del(...cellsFor(booking.time, booking.minutes).map((c) => lockKey(booking.date, c)));
  return booking;
}

export async function listRange(from, days) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i), items = await dayBookings(date);
    if (items.length) out.push({ date, items });
  }
  return out;
}
