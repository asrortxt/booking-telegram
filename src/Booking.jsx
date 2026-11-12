import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { addDays, weekday, weekdayShort, dayNum, monthShort, longDate, endTime } from './dates.js';

export default function Booking() {
  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [slots, setSlots] = useState({ state: 'idle', items: [], error: '' });
  const [form, setForm] = useState({ name: '', phone: '', comment: '' });
  const [errors, setErrors] = useState({});
  const [submit, setSubmit] = useState({ state: 'idle', error: '' });
  const [done, setDone] = useState(null);
  const slotsReq = useRef(0);

  useEffect(() => {
    api.config().then((c) => { setConfig(c); document.title = `${c.name}: онлайн-запись`; }).catch((e) => setLoadError(e.message));
  }, []);

  const service = config?.services.find((s) => s.id === serviceId);
  const days = useMemo(() => {
    if (!config) return [];
    return Array.from({ length: config.horizonDays + 1 }, (_, i) => {
      const d = addDays(config.today, i);
      return { date: d, off: config.daysOff.includes(weekday(d)), today: i === 0 };
    });
  }, [config]);

  const loadSlots = (d = date, s = serviceId) => {
    if (!d || !s) return;
    const id = ++slotsReq.current;                     // ответ на устаревший запрос игнорируем
    setSlots((prev) => ({ ...prev, state: 'loading', error: '' }));
    api.slots(d, s)
      .then((r) => { if (id === slotsReq.current) { setSlots({ state: 'ready', items: r.slots, error: '' }); setTime((t) => (r.slots.some((x) => x.time === t && x.free) ? t : '')); } })
      .catch((e) => { if (id === slotsReq.current) setSlots({ state: 'error', items: [], error: e.message }); });
  };
  useEffect(() => { loadSlots(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [date, serviceId]);

  const missing = !service ? 'Выберите услугу' : !date ? 'Выберите день' : !time ? 'Выберите время' : '';

  const onSubmit = async (e) => {
    e.preventDefault();
    const local = {};
    if (form.name.trim().length < 2) local.name = 'Укажите имя';
    if (form.phone.replace(/\D/g, '').length < 7) local.phone = 'Укажите телефон с кодом, например +49 151 2345678';
    setErrors(local);
    if (missing || Object.keys(local).length) return;
    setSubmit({ state: 'sending', error: '' });
    try {
      const r = await api.book({ serviceId, date, time, ...form });
      setDone(r.booking); setSubmit({ state: 'idle', error: '' });
      window.scrollTo({ top: 0 });
    } catch (err) {
      setErrors(err.fields || {});
      setSubmit({ state: 'idle', error: err.message });
      if (['slot_taken', 'slot_past'].includes(err.code)) { setTime(''); loadSlots(); }
    }
  };

  const reset = () => { setDone(null); setTime(''); setForm((f) => ({ ...f, comment: '' })); loadSlots(); };
  const field = (key) => ({
    value: form[key], 'aria-invalid': errors[key] ? 'true' : undefined, 'aria-describedby': errors[key] ? `${key}-err` : undefined,
    onChange: (e) => { setForm({ ...form, [key]: e.target.value }); if (errors[key]) setErrors({ ...errors, [key]: undefined }); },
  });

  if (loadError) return <Shell><p className="notice bad" role="alert">{loadError}</p></Shell>;
  if (!config) return <Shell><p className="muted">Загружаем расписание…</p></Shell>;

  if (done) {
    return (
      <Shell config={config}>
        <section className="done" aria-live="polite">
          <h2>Вы записаны</h2>
          <p className="done-when">{longDate(done.date)}, {done.time}</p>
          <dl className="facts">
            <div><dt>Услуга</dt><dd>{done.serviceName}</dd></div>
            <div><dt>Время</dt><dd>{done.time}–{endTime(done.time, done.minutes)}</dd></div>
            <div><dt>Стоимость</dt><dd>{done.price} {config.currency}</dd></div>
            <div><dt>Адрес</dt><dd>{config.address}</dd></div>
          </dl>
          <p className="muted">Мастер увидел запись и подтвердит её. Если планы изменятся, предупредите нас заранее.</p>
          <button className="btn ghost" type="button" onClick={reset}>Записаться ещё раз</button>
        </section>
      </Shell>
    );
  }

  return (
    <Shell config={config}>
      <form className="layout" onSubmit={onSubmit} noValidate>
        <div className="steps">
          <section className="step">
            <h2><span className="num">1</span>Услуга</h2>
            <div className="services" role="radiogroup" aria-label="Услуга">
              {config.services.map((s) => (
                <label key={s.id} className={`service${s.id === serviceId ? ' on' : ''}`}>
                  <input type="radio" name="service" value={s.id} checked={s.id === serviceId} onChange={() => setServiceId(s.id)} />
                  <span className="service-name">{s.name}</span>
                  <span className="service-meta">{s.minutes} мин</span>
                  <span className="service-price">{s.price} {config.currency}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="step">
            <h2><span className="num">2</span>День</h2>
            <div className="days" role="radiogroup" aria-label="День">
              {days.map((d) => (
                <button key={d.date} type="button" role="radio" aria-checked={d.date === date} disabled={d.off}
                  className={`day${d.date === date ? ' on' : ''}`} onClick={() => setDate(d.date)}
                  aria-label={`${longDate(d.date)}${d.off ? ', выходной' : ''}`}>
                  <span className="day-wd">{d.today ? 'сегодня' : weekdayShort(d.date)}</span>
                  <span className="day-num">{dayNum(d.date)}</span>
                  <span className="day-mon">{d.off ? 'выходной' : monthShort(d.date)}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="step">
            <h2><span className="num">3</span>Время</h2>
            {(!service || !date) && <p className="muted">Сначала выберите услугу и день: покажем свободное время.</p>}
            {service && date && slots.state === 'error' && (
              <p className="notice bad" role="alert">{slots.error} <button type="button" className="link" onClick={() => loadSlots()}>Загрузить ещё раз</button></p>
            )}
            {service && date && slots.state !== 'error' && slots.items.length > 0 && !slots.items.some((s) => s.free) && (
              <p className="notice">На {longDate(date)} свободного времени нет. Выберите другой день.</p>
            )}
            {service && date && slots.items.length > 0 && (
              <div className={`times${slots.state === 'loading' ? ' busy' : ''}`} role="radiogroup" aria-label="Время">
                {slots.items.map((s) => (
                  <button key={s.time} type="button" role="radio" aria-checked={s.time === time} disabled={!s.free}
                    className={`time${s.time === time ? ' on' : ''}`} onClick={() => setTime(s.time)}
                    aria-label={s.free ? s.time : `${s.time}, занято`}>{s.time}</button>
                ))}
              </div>
            )}
            {service && date && slots.state === 'loading' && slots.items.length === 0 && <p className="muted">Смотрим свободное время…</p>}
          </section>

          <section className="step">
            <h2><span className="num">4</span>Контакты</h2>
            <div className="fields">
              <label className="field">
                <span>Имя</span>
                <input type="text" autoComplete="name" maxLength={60} {...field('name')} />
                {errors.name && <em id="name-err">{errors.name}</em>}
              </label>
              <label className="field">
                <span>Телефон</span>
                <input type="tel" autoComplete="tel" inputMode="tel" placeholder="+49 151 2345678" maxLength={24} {...field('phone')} />
                {errors.phone && <em id="phone-err">{errors.phone}</em>}
              </label>
              <label className="field wide">
                <span>Комментарий <small>необязательно</small></span>
                <textarea rows={3} maxLength={300} {...field('comment')} />
                {errors.comment && <em id="comment-err">{errors.comment}</em>}
              </label>
            </div>
          </section>
        </div>

        <aside className="summary" aria-label="Ваша запись">
          <h2>Ваша запись</h2>
          <dl className="facts">
            <div><dt>Услуга</dt><dd>{service ? service.name : 'не выбрана'}</dd></div>
            <div><dt>День</dt><dd>{date ? longDate(date) : 'не выбран'}</dd></div>
            <div><dt>Время</dt><dd>{time && service ? `${time}–${endTime(time, service.minutes)}` : 'не выбрано'}</dd></div>
            <div className="total"><dt>Стоимость</dt><dd>{service ? `${service.price} ${config.currency}` : '—'}</dd></div>
          </dl>
          {submit.error && <p className="notice bad" role="alert">{submit.error}</p>}
          <button className="btn" type="submit" disabled={Boolean(missing) || submit.state === 'sending'}>
            {submit.state === 'sending' ? 'Записываем…' : missing || 'Записаться'}
          </button>
          <p className="muted small">Оплата на месте. Запись бесплатная.</p>
        </aside>
      </form>
    </Shell>
  );
}

function Shell({ config, children }) {
  return (
    <>
      <div className="pole" aria-hidden="true" />
      <header className="mast">
        <h1>{config ? config.name : 'Онлайн-запись'}</h1>
        {config && <p>{config.tagline}</p>}
        {config && <p className="mast-info">{config.address}. Работаем с {config.open} до {config.close}</p>}
      </header>
      <main className="page">{children}</main>
      <footer className="foot"><a href="#/admin">Вход для мастера</a></footer>
    </>
  );
}
