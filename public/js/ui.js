// public/js/ui.js
// Small UI helpers: toast notifications, money formatting, status pills, escaping.

function toast(msg, type = 'info') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3800);
}

function initials(first, last) {
  return `${(first||'?')[0]||''}${(last||'?')[0]||''}`.toUpperCase();
}

function fmtMoney(n) {
  return 'KES ' + (Number(n) || 0).toLocaleString('en-KE');
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function pillForStatus(s) {
  const map = {
    'Occupied':'pill-green', 'Vacant':'pill-amber', 'Reserved':'pill-blue', 'Maintenance':'pill-red',
    'Paid':'pill-green', 'Pending':'pill-amber', 'Failed':'pill-red', 'Overdue':'pill-red',
    'Partial':'pill-amber', 'Unpaid':'pill-red', 'No rent set':'pill-mute',
    'Arrears':'pill-red', 'Deposit Due':'pill-blue',
    'Open':'pill-amber', 'In Progress':'pill-blue', 'Resolved':'pill-green', 'Closed':'pill-mute',
    'Active':'pill-green', 'Inactive':'pill-mute',
    'Low':'pill-mute', 'Medium':'pill-blue', 'High':'pill-amber', 'Urgent':'pill-red',
  };
  return map[s] || 'pill-mute';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}