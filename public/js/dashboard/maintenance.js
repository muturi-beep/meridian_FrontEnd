// public/js/dashboard/maintenance.js
// Maintenance view — work order list, add/edit modal (tenant + manager branches), delete.

async function loadMaintenance() {
  const el = document.getElementById('maintenanceList');
  el.innerHTML = `<div class="panel-body"><div class="empty-desc">Loading maintenance…</div></div>`;
  try {
    const list = await api('/maintenance');
    state.maintenance = list;
    state.maintLoaded = true;
    document.getElementById('badgeMaint').textContent = list.filter(m => ['Open','In Progress'].includes(m.status)).length;

    if (!list.length) {
      el.innerHTML = `<div class="empty" style="border:none"><div class="empty-ico">⚒</div><div class="empty-title">No maintenance requests</div><div class="empty-desc">${IS_TENANT ? "You haven't submitted any maintenance requests yet." : "When tenants report issues they'll appear here."}</div><button class="btn btn-primary" onclick="openMaintenanceModal()">${IS_TENANT ? '+ Report an Issue' : '+ New Request'}</button></div>`;
      return;
    }

    const actionsHeader = CAN_MANAGE_MAINT ? `<th class="actions">Actions</th>` : '';

    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Request</th><th>Property</th><th>Unit</th><th>Priority</th><th>Status</th><th>Date</th>${actionsHeader}</tr></thead>
      <tbody>${list.map(m => `
        <tr>
          <td>${esc(m.title)}</td>
          <td>${esc(m.property || '—')}</td>
          <td>${esc(m.unit || '—')}</td>
          <td><span class="pill ${pillForStatus(m.priority)}">${esc(m.priority)}</span></td>
          <td><span class="pill ${pillForStatus(m.status)}">${esc(m.status)}</span></td>
          <td>${new Date(m.createdAt).toLocaleDateString()}</td>
          ${CAN_MANAGE_MAINT ? `
          <td class="actions">
            <button class="btn btn-outline btn-sm" onclick='openMaintenanceModal(${JSON.stringify(m).replace(/'/g, "&#39;")})'>Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteMaintenance('${m._id}')">Delete</button>
          </td>` : ''}
        </tr>`).join('')}</tbody></table></div>`;
  } catch (err) {
    el.innerHTML = `<div class="panel-body"><div class="empty-desc">${esc(err.message)}</div></div>`;
  }
}

async function openMaintenanceModal(m = null) {
  if (IS_TENANT) {
    document.getElementById('modalTitle').textContent = 'Report a Maintenance Issue';

    let summary = state.tenantSummary;
    if (!summary) {
      try { summary = await api('/api/tenant/summary'); state.tenantSummary = summary; }
      catch { summary = null; }
    }
    if (!summary || !summary.unit) {
      toast('You need to be assigned to a unit before submitting a request.', 'error');
      return;
    }

    document.getElementById('modalBody').innerHTML = `
      <div class="form-section">
        <div class="form-section-title">Your Unit</div>
        <div style="background:var(--ink-3);border:1px solid var(--border);border-radius:var(--rs);padding:12px 14px">
          <div style="font-family:var(--font-serif);font-size:17px;font-weight:700;color:var(--white)">${esc(summary.property || '—')}</div>
          <div style="font-size:12px;color:var(--t2);margin-top:2px">Unit ${esc(summary.unit.name)}${summary.unit.floor && summary.unit.floor !== '—' ? ` · Floor ${esc(summary.unit.floor)}` : ''}</div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Describe the issue</div>
        <div class="field"><label>Title *</label><input type="text" name="title" required placeholder="e.g. Leaking tap in kitchen"/></div>
        <div class="frow">
          <div class="field"><label>Category</label>
            <select name="category">
              <option value="">— Optional —</option>
              <option>Plumbing</option>
              <option>Electrical</option>
              <option>HVAC / Air Conditioning</option>
              <option>Carpentry</option>
              <option>Appliance</option>
              <option>Pest Control</option>
              <option>Security</option>
              <option>Other</option>
            </select>
          </div>
          <div class="field"><label>Priority</label>
            <select name="priority"><option>Low</option><option selected>Medium</option><option>High</option><option>Urgent</option></select>
          </div>
        </div>
        <div class="field"><label>Description</label><textarea name="description" placeholder="Please describe the issue in detail so the maintenance team can help…"></textarea></div>
      </div>`;

    modalHandler = async () => {
      const form = document.getElementById('modalForm');
      const payload = {
        title:       form.querySelector('[name="title"]').value.trim(),
        category:    form.querySelector('[name="category"]').value,
        priority:    form.querySelector('[name="priority"]').value,
        description: form.querySelector('[name="description"]').value.trim(),
      };
      if (!payload.title) throw new Error('Please enter a title for the request.');
      await api('/maintenance', { method: 'POST', body: JSON.stringify(payload) });
      toast('Maintenance request submitted. Your property manager has been notified.', 'success');
      closeModal();
      state.maintLoaded = false;
      loadMaintenance();
      loadDashboard();
    };

    document.getElementById('modal').classList.add('open');
    return;
  }

  const isEdit = !!m;
  document.getElementById('modalTitle').textContent = isEdit ? 'Edit Maintenance Request' : 'New Maintenance Request';

  if (!state.properties || !state.properties.length) {
    try { state.properties = await api('/api/properties'); state.propsLoaded = true; } catch {}
  }
  if (!state.units || !state.units.length) {
    try { state.units = await api('/products'); state.unitsLoaded = true; } catch {}
  }

  const props = state.properties || [];
  const units = state.units || [];

  document.getElementById('modalBody').innerHTML = `
    <div class="field"><label>Title *</label><input type="text" name="title" required value="${esc(m?.title || '')}" placeholder="e.g. Leaking tap in kitchen"/></div>
    <div class="frow">
      <div class="field"><label>Property</label>
        <select name="property">
          <option value="">— Select —</option>
          ${props.map(p => `<option ${m?.property === p.name ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Unit</label>
        <select name="unit">
          <option value="">— Select —</option>
          ${units.map(u => `<option ${m?.unit === u.name ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="frow">
      <div class="field"><label>Priority</label>
        <select name="priority">${['Low','Medium','High','Urgent'].map(p=>`<option ${m?.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Status</label>
        <select name="status">${['Open','In Progress','Resolved','Closed'].map(s=>`<option ${m?.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </div>
    </div>
    <div class="frow">
      <div class="field"><label>Category</label>
        <select name="category">
          <option value="">— Optional —</option>
          ${['Plumbing','Electrical','HVAC / Air Conditioning','Carpentry','Appliance','Pest Control','Security','Other'].map(c => `<option ${m?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Assigned To</label><input type="text" name="assignedTo" value="${esc(m?.assignedTo || '')}" placeholder="Staff member name"/></div>
    </div>
    <div class="field"><label>Description</label><textarea name="description">${esc(m?.description || '')}</textarea></div>`;

  modalHandler = async () => {
    const form = document.getElementById('modalForm');
    const payload = {
      title:       form.querySelector('[name="title"]').value.trim(),
      property:    form.querySelector('[name="property"]').value,
      unit:        form.querySelector('[name="unit"]').value,
      priority:    form.querySelector('[name="priority"]').value,
      status:      form.querySelector('[name="status"]').value,
      category:    form.querySelector('[name="category"]').value,
      assignedTo:  form.querySelector('[name="assignedTo"]').value.trim(),
      description: form.querySelector('[name="description"]').value.trim(),
    };
    if (!payload.title) throw new Error('Please enter a title for the request.');

    if (isEdit) {
      await api(`/maintenance/${m._id}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Maintenance request updated.', 'success');
    } else {
      await api('/maintenance', { method: 'POST', body: JSON.stringify(payload) });
      toast('Maintenance request created.', 'success');
    }

    closeModal();
    state.maintLoaded = false;
    loadMaintenance();
    loadDashboard();
  };

  document.getElementById('modal').classList.add('open');
}

async function deleteMaintenance(id) {
  if (!CAN_MANAGE_MAINT) {
    toast('You do not have permission to delete maintenance requests.', 'error');
    return;
  }
  if (!confirm('Delete this maintenance record? This cannot be undone.')) return;
  try {
    await api(`/maintenance/${id}`, { method: 'DELETE' });
    toast('Maintenance record deleted.', 'success');
    state.maintLoaded = false;
    loadMaintenance();
    loadDashboard();
  } catch (err) {
    toast(err.message, 'error');
  }
}