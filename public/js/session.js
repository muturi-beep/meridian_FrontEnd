// public/js/session.js
// Session storage helpers - persistent login via localStorage.
// mp_session = the auth token + user data, survives tab/browser close.

function getSession() {
  try {
    const raw = localStorage.getItem("mp_session");
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.token || !s.loggedIn) return null;
    return s;
  } catch {
    return null;
  }
}

function setSession(patch) {
  const cur = getSession() || {};
  localStorage.setItem("mp_session", JSON.stringify({ ...cur, ...patch }));
}

function clearSession() {
  localStorage.removeItem("mp_session");
  // Clean up any legacy sessionStorage copies from before this change.
  try {
    sessionStorage.removeItem("mp_session");
  } catch {}
}
