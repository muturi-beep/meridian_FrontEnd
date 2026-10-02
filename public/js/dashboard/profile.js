// public/js/dashboard/profile.js
// Profile view — personal info + password change.

async function loadProfile() {
  try {
    const me = await api('/api/profile');
    document.getElementById('p-first').value = me.firstName || '';
    document.getElementById('p-last').value  = me.lastName  || '';
    document.getElementById('p-email').value = me.email     || '';
    document.getElementById('p-phone').value = me.phone     || '';
    document.getElementById('profileName').textContent = `${me.firstName} ${me.lastName}`.trim();
    document.getElementById('profileRole').textContent = me.role || '';
    const av = document.getElementById('profileAvatar');
    if (me.avatar) av.innerHTML = `<img src="${esc(me.avatar)}" alt="">`;
    else av.textContent = initials(me.firstName, me.lastName);
  } catch (err) { toast(err.message, 'error'); }
}

async function saveProfile(e) {
  e.preventDefault();
  const payload = {
    firstName: document.getElementById('p-first').value.trim(),
    lastName:  document.getElementById('p-last').value.trim(),
    phone:     document.getElementById('p-phone').value.trim(),
  };
  try {
    const res = await api('/api/profile', { method: 'PUT', body: JSON.stringify(payload) });
    toast(res.message || 'Profile updated successfully.', 'success');
    setSession({ firstName: res.user.firstName, lastName: res.user.lastName, phone: res.user.phone });
    paintIdentity({
      firstName: res.user.firstName, lastName: res.user.lastName,
      role: res.user.role, organizationName: SESSION.organizationName, avatar: res.user.avatar,
    });
    document.getElementById('profileName').textContent = `${res.user.firstName} ${res.user.lastName}`.trim();
  } catch (err) { toast(err.message, 'error'); }
}

async function savePassword(e) {
  e.preventDefault();
  const cur = document.getElementById('p-cur').value;
  const nw  = document.getElementById('p-new').value;
  const cf  = document.getElementById('p-confirm').value;
  if (nw.length < 8) return toast('New password must be at least 8 characters.', 'error');
  if (nw !== cf)     return toast('New passwords do not match.', 'error');
  try {
    const res = await api('/api/profile', { method: 'PUT', body: JSON.stringify({ currentPassword: cur, newPassword: nw }) });
    toast(res.message || 'Password updated.', 'success');
    document.getElementById('passwordForm').reset();
  } catch (err) { toast(err.message, 'error'); }
}