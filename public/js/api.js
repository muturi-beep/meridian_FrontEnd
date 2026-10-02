// public/js/api.js
// Fetch wrapper: attaches the JWT, handles 401 by redirecting to auth.html.

async function api(path, opts = {}) {
  const s = getSession();
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  if (s?.token) headers.Authorization = `Bearer ${s.token}`;

  const fullUrl = `${API}${path}`;
  let res;
  try {
    res = await fetch(fullUrl, { ...opts, headers });
  } catch (err) {
    throw new Error(`Cannot reach server at ${fullUrl}. ${err.message}`);
  }

  if (res.status === 401) {
    clearSession();
    sessionStorage.setItem('mp_flash', 'Your session has expired. Please sign in again.');
    window.location.replace('auth.html');
    throw new Error('Unauthorized');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || `HTTP ${res.status}`;
    throw new Error(`${msg} — ${opts.method || 'GET'} ${fullUrl}`);
  }
  return data;
}