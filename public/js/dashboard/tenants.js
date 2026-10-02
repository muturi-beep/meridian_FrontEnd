// public/js/dashboard/tenants.js
// Tenants view — grouped list, add-tenant modal per property.

async function loadTenants() {
  const el = document.getElementById('tenantsList');
  el.innerHTML = `<div class="empty" style="border-style:solid"><div class="empty-desc">Loading tenants…</div></div>`;
  try {
    const [props, tenants] = await Promise.all([api('/api/properties'), api('/api/tenants')]);
    state.properties = props;
    state.propsLoaded = true;
    state.tenants = tenants;
    state.tenantsLoaded = true;
    document.getElementById('badgeProps').textContent = props.length;
    document.getElementById('badgeTenants').textContent = tenants.length;

    if (!props.length) {
      el.innerHTML = `<div class="empty"><div class="empty-ico">▤</div><div class="empty-title">Add a property first</div><div class="empty-desc">You need at least one property (with units) before you can onboard tenants.</div><button class="btn btn-primary" onclick="switchView('properties'); openPropertyModal();">+ Add Property</button></div>`;
      return;
    }

    const byProp = {};
    tenants.forEach(t => {
      const key = t.property || '__unassigned__';
      (byProp[key] = byProp[key] || []).push(t);
    });

    const propCards = props.map(p => {
      const list = byProp[p.name] || [];
      return `
        <div class="prop-card">
          <div class="prop-head">
            <div class="prop-name">${esc(p.name)}</div>
            <span class="pill ${pillForStatus(p.status)}">${esc(p.status)}</span>
          </div>
          <div class="prop-loc">${esc(p.location || 'No location set')}</div>
          <div class="prop-stats">
            <div><div class="prop-stat-lbl">Units</div><div class="prop-stat-val">${p.unitCount}</div></div>
            <div><div class="prop-stat-lbl">Occupied</div><div class="prop-stat-val">${p.occupiedUnits}</div></div>
            <div><div class="prop-stat-lbl">Vacant</div><div class="prop-stat-val">${p.vacantUnits}</div></div>
            <div><div class="prop-stat-lbl">Tenants</div><div class="prop-stat-val">${list.length}</div></div>
          </div>
          <div class="prop-actions">
            <button class="btn btn-primary btn-sm" onclick="openTenantModalForProperty('${p._id}')">+ Add Tenant</button>
          </div>
          ${!p.unitCount ? `<div style="margin-top:10px;font-size:11.5px;color:var(--amber)">⚠ This property has no units yet — add units first to assign tenants.</div>` : ''}
        </div>`;
    }).join('');

    const unassigned = byProp['__unassigned__'] || [];
    const unassignedBlock = unassigned.length ? `
      <div class="panel" style="margin-top:24px">
        <div class="panel-head"><div class="panel-title">Tenants Without a Property (${unassigned.length})</div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Tenant</th><th>Phone</th><th>Email</th></tr></thead>
          <tbody>${unassigned.map(t => `<tr><td>${esc(t.firstName + ' ' + t.lastName)}</td><td>${esc(t.phone || '—')}</td><td>${esc(t.email || '—')}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>` : '';

    const allBlock = tenants.length ? `
      <div class="panel" style="margin-top:24px">
        <div class="panel-head"><div class="panel-title">All Tenants (${tenants.length})</div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Tenant</th><th>Property</th><th>Unit</th><th>Phone</th><th>Email</th><th>Rent</th></tr></thead>
          <tbody>${tenants.map(t => `<tr><td>${esc(t.firstName + ' ' + t.lastName)}</td><td>${esc(t.property || '—')}</td><td>${esc(t.unitName || '—')}</td><td>${esc(t.phone || '—')}</td><td>${esc(t.email || '—')}</td><td>${t.rent ? fmtMoney(t.rent) : '—'}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>` : '';

    el.innerHTML = `<div class="prop-grid">${propCards}</div>${unassignedBlock}${allBlock}`;
  } catch (err) {
    el.innerHTML = `<div class="empty"><div class="empty-ico">⚠</div><div class="empty-title">Couldn't load tenants</div><div class="empty-desc">${esc(err.message)}</div><button class="btn btn-primary" onclick="loadTenants()">Retry</button></div>`;
  }
}

async function openTenantModalForProperty(propertyId) {
  const property = (state.properties || []).find(p => p._id === propertyId);
  if (!property) return toast('Property not found.', 'error');

  document.getElementById('modalTitle').textContent = `Add Tenant — ${property.name}`;
  document.getElementById('modalBody').innerHTML = `<div class="empty-desc" style="padding:20px;text-align:center">Loading units…</div>`;
  document.getElementById('modal').classList.add('open');

  let unitsInProperty = [];
  try { unitsInProperty = await api(`/api/properties/${propertyId}/units`); }
  catch (err) { toast(err.message, 'error'); closeModal(); return; }

  const vacantUnits = unitsInProperty.filter(u => u.status === 'Vacant' && !u.tenantId);

  document.getElementById('modalBody').innerHTML = `
    <div class="form-section">
      <div class="form-section-title">
        <span>Property</span>
        <span class="form-hint">${unitsInProperty.length} unit(s) · ${vacantUnits.length} vacant</span>
      </div>
      <div style="background:var(--ink-3);border:1px solid var(--border);border-radius:var(--rs);padding:12px 14px">
        <div style="font-family:var(--font-serif);font-size:17px;font-weight:700;color:var(--white)">${esc(property.name)}</div>
        <div style="font-size:12px;color:var(--t2);margin-top:2px">${esc(property.location || 'No location set')}</div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Tenant Details</div>
      <div class="frow">
        <div class="field"><label>First Name *</label><input type="text" name="firstName" required/></div>
        <div class="field"><label>Last Name *</label><input type="text" name="lastName" required/></div>
      </div>
      <div class="frow">
        <div class="field"><label>Email *</label><input type="email" name="email" required/></div>
        <div class="field"><label>Phone</label><input type="tel" name="phone"/></div>
      </div>
      <div class="frow">
        <div class="field"><label>Monthly Rent (KES)</label>
          <input type="number" name="rent" min="0" placeholder="Defaults to the unit's rent"/>
        </div>
        <div class="field"><label>Security Deposit (KES)</label>
          <input type="number" name="deposit" min="0" placeholder="Defaults to 1× rent"/>
        </div>
      </div>
      <div class="field">
        <label>Temporary Password * (min 8 chars — tenant can change later)</label>
        <input type="text" name="password" required minlength="8" value="Welcome${Math.floor(1000 + Math.random() * 9000)}"/>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">
        <span>Assign a Unit</span>
        <span class="form-hint">
          ${vacantUnits.length ? 'Only vacant units are shown' : (unitsInProperty.length ? 'All units are occupied' : 'No units in this property yet')}
        </span>
      </div>
      ${vacantUnits.length ? `
        <div class="field">
          <label>Unit *</label>
          <select name="unitId" required>
            <option value="">— Select a unit —</option>
            ${vacantUnits.map(u => `<option value="${u._id}">${esc(u.name)}${u.floor && u.floor !== '—' ? ` · Floor ${esc(u.floor)}` : ''} · ${fmtMoney(u.price)}</option>`).join('')}
          </select>
        </div>
      ` : `
        <div class="units-empty">
          ${unitsInProperty.length
            ? 'All units in this property are currently occupied. Add more units from the Properties section, or create this tenant without assigning a unit (they will appear under "Tenants Without a Property").'
            : 'This property has no units yet. Add units from the Properties section to assign this tenant, or create them without a unit for now.'}
        </div>
      `}
    </div>`;

  modalHandler = async () => {
    const form = document.getElementById('modalForm');
    const payload = {
      firstName:  form.querySelector('[name="firstName"]').value.trim(),
      lastName:   form.querySelector('[name="lastName"]').value.trim(),
      email:      form.querySelector('[name="email"]').value.trim(),
      phone:      form.querySelector('[name="phone"]').value.trim(),
      password:   form.querySelector('[name="password"]').value,
      propertyId: property._id,
      rent:       Number(form.querySelector('[name="rent"]')?.value)    || undefined,
      deposit:    Number(form.querySelector('[name="deposit"]')?.value) || undefined,
    };
    if (!payload.firstName || !payload.lastName || !payload.email || !payload.password) {
      throw new Error('Please fill in all required fields.');
    }
    const unitSelect = form.querySelector('[name="unitId"]');
    if (unitSelect && unitSelect.value) payload.unitId = unitSelect.value;

    const res = await api('/api/tenants', { method: 'POST', body: JSON.stringify(payload) });
    toast(res.message || 'Tenant added.', 'success');
    closeModal();

    state.tenantsLoaded = false;
    state.unitsLoaded   = false;
    state.propsLoaded   = false;
    loadTenants();
    loadProperties();
    loadDashboard();
    api('/products').then(l => document.getElementById('badgeUnits').textContent = l.length).catch(() => {});
  };
}

function openTenantModal() {
  if (!state.properties || !state.properties.length) {
    toast('Add a property first, then you can add tenants.', 'error');
    switchView('properties');
    return;
  }
  openTenantModalForProperty(state.properties[0]._id);
}