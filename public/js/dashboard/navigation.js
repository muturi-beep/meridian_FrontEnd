// public/js/dashboard/navigation.js
// Sidebar wiring, avatar dropdown, view switching, logout, active-view helper.

const sidebar   = document.getElementById('sidebar');
const overlay   = document.getElementById('overlay');
const hamburger = document.getElementById('hamburger');
const dropdown  = document.getElementById('dropdown');
const avatarBtn = document.getElementById('avatarBtn');

hamburger.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
});
overlay.addEventListener('click', () => {
  sidebar.classList.remove('open');
  overlay.classList.remove('open');
});

avatarBtn.addEventListener('click', e => {
  e.stopPropagation();
  dropdown.classList.toggle('open');
});
document.addEventListener('click', e => {
  if (!dropdown.contains(e.target) && e.target !== avatarBtn) dropdown.classList.remove('open');
});

document.querySelectorAll('[data-view]').forEach(el => {
  el.addEventListener('click', () => switchView(el.dataset.view));
});

function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.sb-link[data-view]').forEach(l => l.classList.toggle('active', l.dataset.view === name));
  dropdown.classList.remove('open');
  if (window.innerWidth <= 1024) { sidebar.classList.remove('open'); overlay.classList.remove('open'); }

  if (name === 'properties' && !state.propsLoaded) loadProperties();
  if (name === 'units'      && !state.unitsLoaded) loadUnits();
  if (name === 'tenants'    && !state.tenantsLoaded) loadTenants();
  if (name === 'maintenance'&& !state.maintLoaded) loadMaintenance();
  if (name === 'payments'   && !state.payLoaded) loadPayments();
  if (name === 'settings')   loadOrgSettings();
  if (name === 'profile')    loadProfile();
  if (name === 'documents') {
    if (IS_TENANT) loadTenantDocuments();
    else loadManagerDocuments();
  }

  if (name === 'overview') {
    loadDashboard();
    requestAnimationFrame(() => {
      Object.values(chartInstances).forEach(ch => {
        try { ch.resize(); } catch {}
      });
    });
  }
}

function logout() {
  clearSession();
  ['mp_session','mp_user','mp_token','user','token','auth'].forEach(k => {
    try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch {}
  });
  window.location.replace('auth.html');
}
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('dropdownLogout').addEventListener('click', logout);

function getActiveView() {
  const active = document.querySelector('.view.active');
  return active ? active.id.replace('view-', '') : 'overview';
}