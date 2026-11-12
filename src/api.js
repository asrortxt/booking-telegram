// Тонкая обёртка над fetch: JSON туда и обратно, ошибки сервера превращаются в исключения с кодом и полями.
const TOKEN_KEY = 'admin-token';

export const auth = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* приватный режим */ } },
};

async function request(path, { method = 'GET', body, admin = false } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (admin && auth.get()) headers.Authorization = `Bearer ${auth.get()}`;
  let res;
  try { res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw Object.assign(new Error('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз'), { code: 'network' }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Сервер ответил ошибкой. Попробуйте ещё раз'), { code: data.error, fields: data.fields, status: res.status });
  return data;
}

export const api = {
  config: () => request('/api/config'),
  slots: (date, service) => request(`/api/slots?date=${date}&service=${encodeURIComponent(service)}`),
  book: (body) => request('/api/bookings', { method: 'POST', body }),
  login: (password) => request('/api/admin/login', { method: 'POST', body: { password } }),
  adminList: () => request('/api/admin/bookings', { admin: true }),
  setStatus: (id, status) => request(`/api/admin/bookings?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: { status }, admin: true }),
  telegramSetup: () => request('/api/admin/telegram-setup', { method: 'POST', body: {}, admin: true }),
};
