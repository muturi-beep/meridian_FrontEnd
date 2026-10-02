// public/js/session.js
// Session storage helpers — single source of truth for the mp_session key.

function getSession() {
  try {
    const raw = sessionStorage.getItem('mp_session');
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.token || !s.loggedIn) return null;
    return s;
  } catch { return null; }
}

function setSession(patch) {
  const cur = getSession() || {};
  sessionStorage.setItem('mp_session', JSON.stringify({ ...cur, ...patch }));
}

function clearSession() {
  sessionStorage.removeItem('mp_session');
  localStorage.removeItem('mp_session');
}