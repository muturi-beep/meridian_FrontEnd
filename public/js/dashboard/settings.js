// public/js/dashboard/settings.js
// Settings view — organization profile (name, type, contact details).

async function loadOrgSettings() {
  try {
    const org = await api('/api/organization');
    document.getElementById('org-name').value     = org.name || '';
    document.getElementById('org-type').value     = org.type || 'Property Manager';
    document.getElementById('org-email').value    = org.email || '';
    document.getElementById('org-phone').value    = org.phone || '';
    document.getElementById('org-location').value = org.location || '';
    document.getElementById('org-address').value  = org.address || '';
  } catch (err) { toast(err.message, 'error'); }
}

async function saveOrg(e) {
  e.preventDefault();
  const payload = {
    name:     document.getElementById('org-name').value.trim(),
    type:     document.getElementById('org-type').value,
    email:    document.getElementById('org-email').value.trim(),
    phone:    document.getElementById('org-phone').value.trim(),
    location: document.getElementById('org-location').value.trim(),
    address:  document.getElementById('org-address').value.trim(),
  };
  try {
    const res = await api('/api/organization', { method: 'PUT', body: JSON.stringify(payload) });
    toast(res.message || 'Organization updated.', 'success');
    setSession({ organizationName: res.organization.name });
    document.getElementById('sbOrgName').textContent = res.organization.name;
    document.getElementById('tbSub').textContent = `Here's what's happening at ${res.organization.name} today.`;
  } catch (err) { toast(err.message, 'error'); }
}