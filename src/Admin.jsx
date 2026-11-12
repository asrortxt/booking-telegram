import { useCallback, useEffect, useState } from 'react';
import { api, auth } from './api.js';
import { longDate, endTime } from './dates.js';

const STATUS = { new: 'Ждёт подтверждения', confirmed: 'Подтверждена', cancelled: 'Отменена' };

export default function Admin() {
  const [authed, setAuthed] = useState(Boolean(auth.get()));
  const logout = useCallback(() => { auth.set(null); setAuthed(false); }, []);
  return (
    <>
      <div className="pole" aria-hidden="true" />
      <main className="page admin">
        {authed ? <Dashboard onLogout={logout} /> : <Login onDone={() => setAuthed(true)} />}
      </main>
      <footer className="foot"><a href="#/">Страница записи</a></footer>
    </>
  );
}

function Login({ onDone }) {
  const [password, setPassword] = useState('');
  const [state, setState] = useState({ busy: false, error: '' });
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: '' });
    try { const r = await api.login(password); auth.set(r.token); onDone(); }
    catch (err) { setState({ busy: false, error: err.message }); }
  };
  return (
    <form className="login" onSubmit={submit}>
      <h1>Вход для мастера</h1>
      <label className="field">
        <span>Пароль</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </label>
      {state.error && <p className="notice bad" role="alert">{state.error}</p>}
      <button className="btn" type="submit" disabled={!password || state.busy}>{state.busy ? 'Входим…' : 'Войти'}</button>
    </form>
  );
}

function Dashboard({ onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);
  const [pending, setPending] = useState('');
  const [hook, setHook] = useState({ busy: false, text: '', bad: false });

  const load = useCallback(async () => {
    try { setData(await api.adminList()); setError(''); }
    catch (e) { if (e.status === 401) onLogout(); else setError(e.message); }
  }, [onLogout]);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const change = async (b, status) => {
    if (status === 'cancelled' && !window.confirm(`Отменить запись: ${b.name}, ${b.time}? Время снова станет свободным.`)) return;
    setPending(b.id);
    try { await api.setStatus(b.id, status); await load(); }
    catch (e) { if (e.status === 401) onLogout(); else setError(e.message); }
    finally { setPending(''); }
  };

  const connect = async () => {
    setHook({ busy: true, text: '', bad: false });
    try { const r = await api.telegramSetup(); setHook({ busy: false, text: `Вебхук подключён: ${r.url}. Теперь отправьте боту /start.`, bad: false }); }
    catch (e) { setHook({ busy: false, text: e.message, bad: true }); }
  };

  if (!data) return error ? <p className="notice bad" role="alert">{error}</p> : <p className="muted">Загружаем записи…</p>;

  const days = data.days
    .map((d) => ({ ...d, items: d.items.filter((b) => showCancelled || b.status !== 'cancelled') }))
    .filter((d) => d.items.length);
  const todayCount = (data.days.find((d) => d.date === data.today)?.items || []).filter((b) => b.status !== 'cancelled').length;
  const waiting = data.days.flatMap((d) => d.items).filter((b) => b.status === 'new').length;

  return (
    <>
      <header className="admin-head">
        <div>
          <h1>Записи</h1>
          <p className="muted">Сегодня: {todayCount}. Ждут подтверждения: {waiting}.</p>
        </div>
        <div className="admin-tools">
          <label className="check"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Показывать отменённые</label>
          <button className="btn ghost sm" type="button" onClick={load}>Обновить</button>
          <button className="btn ghost sm" type="button" onClick={onLogout}>Выйти</button>
        </div>
      </header>

      {error && <p className="notice bad" role="alert">{error}</p>}
      {data.storage === 'memory' && (
        <p className="notice">Записи хранятся в памяти сервера и пропадут при перезапуске. Подключите Upstash Redis: шаги описаны в README.</p>
      )}
      {(!data.telegram.bot || !data.telegram.chat) && (
        <div className="notice">
          <p>{!data.telegram.bot
            ? 'Telegram не подключён: задайте переменную TELEGRAM_BOT_TOKEN, и новые записи будут приходить в чат.'
            : 'Бот найден, но не задан чат. Подключите вебхук, отправьте боту /start и добавьте присланный id в TELEGRAM_CHAT_ID.'}</p>
          {data.telegram.bot && <button className="btn sm" type="button" onClick={connect} disabled={hook.busy}>{hook.busy ? 'Подключаем…' : 'Подключить вебхук'}</button>}
        </div>
      )}
      {data.telegram.bot && data.telegram.chat && !hook.text && (
        <p className="muted small">Telegram подключён. Кнопки под сообщениями не работают? <button type="button" className="link" onClick={connect}>Подключить вебхук заново</button></p>
      )}
      {hook.text && <p className={`notice${hook.bad ? ' bad' : ' good'}`} role="status">{hook.text}</p>}

      {days.length === 0 && (
        <p className="empty">Записей на ближайшие дни нет. Откройте <a href="#/">страницу записи</a> и создайте тестовую, чтобы проверить, как всё работает.</p>
      )}

      {days.map((d) => (
        <section key={d.date} className="adm-day">
          <h2>{d.date === data.today ? `Сегодня, ${longDate(d.date)}` : longDate(d.date)}</h2>
          <ul className="adm-list">
            {d.items.map((b) => (
              <li key={b.id} className={`adm-item s-${b.status}`}>
                <div className="adm-time">{b.time}<small>до {endTime(b.time, b.minutes)}</small></div>
                <div className="adm-main">
                  <strong>{b.name}</strong>
                  <span>{b.serviceName}, {b.minutes} мин, {b.price} {data.currency}</span>
                  <a href={`tel:${b.phone}`}>{b.phone}</a>
                  {b.comment && <p>{b.comment}</p>}
                </div>
                <div className="adm-side">
                  <span className="badge">{STATUS[b.status]}</span>
                  {b.status !== 'cancelled' && (
                    <div className="adm-actions">
                      {b.status === 'new' && <button className="btn sm" type="button" disabled={pending === b.id} onClick={() => change(b, 'confirmed')}>Подтвердить</button>}
                      <button className="btn ghost sm" type="button" disabled={pending === b.id} onClick={() => change(b, 'cancelled')}>Отменить</button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
