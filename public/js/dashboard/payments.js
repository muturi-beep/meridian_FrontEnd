// public/js/dashboard/payments.js
// Payments view — balances, records, add/edit modal with allocation preview, delete.

function computeTenantBalances(tenants, payments) {
  return (tenants || []).map(t => {
    const ledger = buildTenantLedger(t, payments);
    let status;
    if (ledger.balance <= 0)                                                 status = 'Paid';
    else if (ledger.arrears > 0)                                             status = 'Arrears';
    else if (!ledger.currentMonth.fullyPaid && ledger.currentMonth.paid > 0) status = 'Partial';
    else if (ledger.currentMonth.fullyPaid && ledger.depositBalance > 0)     status = 'Deposit Due';
    else                                                                     status = 'Unpaid';
    if (ledger.monthlyRent <= 0 && ledger.balance <= 0)                      status = 'No rent set';

    return {
      id: t._id,
      name: `${t.firstName || ''} ${t.lastName || ''}`.trim() || '—',
      property: t.property || '',
      unit: t.unitName || '',
      phone: t.phone || '',
      rent: ledger.monthlyRent,
      currentPaid: ledger.currentMonth.paid,
      currentBalance: ledger.currentMonth.balance,
      arrears: ledger.arrears,
      balance: ledger.balance,
      rentBalance: ledger.rentBalance,
      depositBalance: ledger.depositBalance,
      depositPaid: ledger.depositPaid,
      depositDue: ledger.depositDue,
      totalPaid: ledger.totalPaid,
      totalDue: ledger.totalDue,
      currentMonthLabel: ledger.currentMonth.label,
      currentMonthFullyPaid: ledger.currentMonth.fullyPaid,
      ledger,
      status,
    };
  }).sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
}

function renderBalancesPanel() {
  const rows = state.tenantBalances || [];

  if (!rows.length) {
    return `<div class="empty">
      <div class="empty-ico">☺</div>
      <div class="empty-title">No tenants to track yet</div>
      <div class="empty-desc">Add tenants to a property and their rent balances will appear here — who has paid, who hasn't, and exactly how much is outstanding.</div>
      <button class="btn btn-primary" onclick="switchView('tenants')">Go to Tenants</button>
    </div>`;
  }

  const unpaid = rows.filter(r => r.balance > 0);
  const totalRent = rows.reduce((s, r) => s + r.rent, 0);
  const totalPaid = rows.reduce((s, r) => s + r.totalPaid, 0);
  const totalOutstanding = rows.reduce((s, r) => s + r.balance, 0);
  const totalArrears = rows.reduce((s, r) => s + r.arrears, 0);
  const fullyPaid = rows.filter(r => r.balance <= 0).length;
  const rate = totalRent > 0 ? Math.round((rows.reduce((s, r) => s + r.currentPaid, 0) / totalRent) * 100) : 0;
  const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const visible = state.showAllBalances ? rows : unpaid;

  const body = visible.length ? `
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Tenant</th><th>Property / Unit</th><th>Rent Due</th>
        <th>This Month</th><th>Arrears</th><th>Deposit</th><th>Total Balance</th><th>Status</th><th class="actions">Actions</th>
      </tr></thead>
      <tbody>${visible.map(r => `
        <tr>
          <td>
            <div style="font-weight:600">${esc(r.name)}</div>
            ${r.phone ? `<div style="font-size:11px;color:var(--t2)">${esc(r.phone)}</div>` : ''}
          </td>
          <td>
            <div>${esc(r.property || '—')}</div>
            <div style="font-size:11px;color:var(--t2)">Unit ${esc(r.unit || '—')}</div>
          </td>
          <td>${r.rent ? fmtMoney(r.rent) : '—'}</td>
          <td>
            ${fmtMoney(r.currentPaid)}
            ${r.currentBalance > 0 ? `<div style="font-size:10.5px;color:var(--amber);font-weight:600">−${fmtMoney(r.currentBalance)} left</div>` : `<div style="font-size:10.5px;color:var(--green);font-weight:600">✓ Paid</div>`}
          </td>
          <td>${r.arrears > 0 ? `<span style="color:var(--red);font-weight:600">${fmtMoney(r.arrears)}</span>` : '—'}</td>
          <td>
            ${r.depositDue > 0
              ? (r.depositBalance > 0
                  ? `<span style="color:var(--blue);font-weight:600">${fmtMoney(r.depositPaid)}</span><div style="font-size:10.5px;color:var(--t2)">of ${fmtMoney(r.depositDue)}</div>`
                  : `<span style="color:var(--green);font-weight:600">✓ Paid</span>`)
              : '—'}
          </td>
          <td style="font-weight:700;color:${r.balance > 0 ? 'var(--amber)' : 'var(--green)'}">
            ${fmtMoney(r.balance)}
          </td>
          <td><span class="pill ${pillForStatus(r.status)}">${esc(r.status)}</span></td>
          <td class="actions">
            <div class="bal-actions">
              <button class="btn btn-primary btn-sm" onclick='recordForTenant(${JSON.stringify({ tenantId: r.id, amount: r.balance || r.rent, property: r.property, unit: r.unit }).replace(/'/g, "&#39;")})'>Record Payment</button>
            </div>
          </td>
        </tr>`).join('')}</tbody>
    </table></div>` : `
    <div class="empty" style="border:none">
      <div class="empty-ico">✓</div>
      <div class="empty-title">Everyone is fully paid up</div>
      <div class="empty-desc">All ${rows.length} tenant${rows.length === 1 ? '' : 's'} have cleared their rent for ${esc(monthLabel)}. Nothing outstanding.</div>
    </div>`;

  return `
    <div class="stats-grid" style="margin-bottom:18px">
      <div class="stat-card">
        <div class="stat-lbl">Expected Rent</div>
        <div class="stat-val money">${fmtMoney(totalRent)}</div>
        <div class="stat-sub">${rows.length} tenant${rows.length === 1 ? '' : 's'} &middot; ${esc(monthLabel)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-lbl">Total Collected</div>
        <div class="stat-val money" style="color:var(--green)">${fmtMoney(totalPaid)}</div>
        <div class="stat-sub">${fullyPaid} tenant(s) fully settled</div>
      </div>
      <div class="stat-card">
        <div class="stat-lbl">Outstanding</div>
        <div class="stat-val money" style="color:${totalOutstanding > 0 ? 'var(--amber)' : 'var(--green)'}">${fmtMoney(totalOutstanding)}</div>
        <div class="stat-sub">${unpaid.length} tenant(s) owing${totalArrears > 0 ? ` · ${fmtMoney(totalArrears)} arrears` : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-lbl">Collection Rate</div>
        <div class="stat-val">${rate}%</div>
        <div class="stat-sub">Of this month's rent</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <div class="panel-title">Account Balances${state.showAllBalances ? ' — All Tenants' : ` (${unpaid.length})`}</div>
          <div class="section-desc" style="margin-top:3px">
            ${state.showAllBalances
              ? `All ${rows.length} tenant${rows.length === 1 ? '' : 's'} &middot; ${esc(monthLabel)}`
              : `${unpaid.length} of ${rows.length} tenant(s) still owe &middot; ${esc(monthLabel)}`}
          </div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="toggleBalancesView()">${state.showAllBalances ? 'Show only owing' : `Show all ${rows.length}`}</button>
      </div>
      ${body}
    </div>`;
}

function toggleBalancesView() {
  state.showAllBalances = !state.showAllBalances;
  const wrap = document.getElementById('balancesWrap');
  if (wrap) wrap.innerHTML = renderBalancesPanel();
}

function recordForTenant(preset) {
  openPaymentModal(null, preset);
}

/* Live preview inside the payment modal */
function updatePaymentPreview() {
  const box = document.getElementById('paymentPreview');
  if (!box) return;
  const form = document.getElementById('modalForm');
  const tenantId = form.querySelector('[name="tenantId"]')?.value;
  const amount   = Number(form.querySelector('[name="amount"]')?.value) || 0;
  const type     = form.querySelector('[name="type"]')?.value || 'Rent';

  if (!tenantId) {
    box.innerHTML = `<div class="pp-empty">Select a tenant to preview their updated balance.</div>`;
    return;
  }
  const tenant = (state.tenants || []).find(t => String(t._id) === String(tenantId));
  if (!tenant) {
    box.innerHTML = `<div class="pp-empty">Tenant not found.</div>`;
    return;
  }

  const ledger = buildTenantLedger(tenant, state.payments || []);
  const sim = simulateAllocation(ledger, amount, type);

  const before = ledger.balance;
  const after  = sim.newBalance;
  const beforeClass = before > 0 ? 'warn' : 'ok';
  const afterClass  = after  > 0 ? 'warn' : 'ok';

  const allocRows = sim.allocations.length
    ? sim.allocations.map(a => `<div class="pp-alloc-item"><span>${esc(a.label)}</span><span>${fmtMoney(a.amount)}</span></div>`).join('')
    : `<div class="pp-alloc-item" style="opacity:.7"><span>No active obligation to apply to</span><span></span></div>`;

  box.innerHTML = `
    <div class="pp-head">
      <span>Account Preview</span>
      <span>${esc(tenant.firstName || '')} ${esc(tenant.lastName || '')}</span>
    </div>
    <div class="pp-row"><span class="k">Current balance</span><span class="v ${beforeClass}">${fmtMoney(before)}</span></div>
    <div class="pp-row"><span class="k">Rent outstanding</span><span class="v">${fmtMoney(ledger.rentBalance)}</span></div>
    <div class="pp-row"><span class="k">Deposit outstanding</span><span class="v">${fmtMoney(ledger.depositBalance)}</span></div>
    <div class="pp-arrow">↓</div>
    <div class="pp-after">
      <div class="pp-row"><span class="k">After this payment</span><span class="v ${afterClass}">${fmtMoney(after)}</span></div>
    </div>
    ${sim.allocations.length ? `
      <div class="pp-alloc">
        <div style="margin-bottom:6px;font-weight:600;color:var(--t2)">Applied to:</div>
        ${allocRows}
      </div>` : ''}
  `;
}

/* Auto-fills amount with the tenant's outstanding balance */
function autoFillAmount(sel) {
  const t = (state.tenants || []).find(x => String(x._id) === String(sel.value));
  const amtEl = document.querySelector('#modalForm [name="amount"]');
  if (!amtEl) return;
  if (t && !amtEl.value) {
    const ledger = buildTenantLedger(t, state.payments || []);
    amtEl.value = ledger.balance || ledger.monthlyRent || '';
  }
  updatePaymentPreview();
}

async function loadPayments() {
  const el = document.getElementById('paymentsList');
  el.innerHTML = `<div class="panel-body"><div class="empty-desc">Loading payments…</div></div>`;

  try {
    if (IS_TENANT) {
      const summary = await api('/api/tenant/summary');
      state.tenantSummary = summary;

      if (!summary.unit) {
        el.innerHTML = `<div class="empty"><div class="empty-ico">⌂</div><div class="empty-title">No unit assigned</div><div class="empty-desc">You are not yet assigned to a unit. Contact your property manager.</div></div>`;
        state.payLoaded = true;
        return;
      }

      const cm = summary.currentMonth;
      const pctPaid = cm.due > 0 ? Math.min(100, Math.round((cm.paid / cm.due) * 100)) : 0;
      let statusPill = 'pill-mute';
      if (cm.status === 'Fully Paid') statusPill = 'pill-green';
      else if (cm.status === 'Partial') statusPill = 'pill-amber';
      else if (cm.status === 'Unpaid') statusPill = 'pill-red';

      const payments = summary.payments || [];

      el.innerHTML = `
        <div class="panel" style="margin-bottom:18px">
          <div class="panel-head"><div class="panel-title">My Unit</div></div>
          <div class="panel-body">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px">
              <div><div class="prop-stat-lbl">Property</div><div class="prop-stat-val">${esc(summary.property || '—')}</div></div>
              <div><div class="prop-stat-lbl">Unit</div><div class="prop-stat-val">${esc(summary.unit.name)}</div></div>
              <div><div class="prop-stat-lbl">Floor</div><div class="prop-stat-val">${esc(summary.unit.floor || '—')}</div></div>
              <div><div class="prop-stat-lbl">Monthly Rent</div><div class="prop-stat-val money">${fmtMoney(summary.rent)}</div></div>
            </div>
          </div>
        </div>

        <div class="panel" style="margin-bottom:18px">
          <div class="panel-head">
            <div class="panel-title">Payment Status — ${esc(cm.monthLabel || 'This Month')}</div>
            <span class="pill ${statusPill}">${esc(cm.status)}</span>
          </div>
          <div class="panel-body">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:16px">
              <div><div style="font-size:10.5px;color:var(--t2);text-transform:uppercase;letter-spacing:.09em;margin-bottom:4px">Due</div><div style="font-family:var(--font-serif);font-size:22px;font-weight:700;color:var(--white)">${fmtMoney(cm.due)}</div></div>
              <div><div style="font-size:10.5px;color:var(--t2);text-transform:uppercase;letter-spacing:.09em;margin-bottom:4px">Paid</div><div style="font-family:var(--font-serif);font-size:22px;font-weight:700;color:var(--green)">${fmtMoney(cm.paid)}</div></div>
              <div><div style="font-size:10.5px;color:var(--t2);text-transform:uppercase;letter-spacing:.09em;margin-bottom:4px">Balance</div><div style="font-family:var(--font-serif);font-size:22px;font-weight:700;color:${cm.balance > 0 ? 'var(--amber)' : 'var(--green)'}">${fmtMoney(cm.balance)}</div></div>
            </div>
            <div style="height:10px;background:var(--ink-3);border-radius:6px;overflow:hidden"><div style="height:100%;width:${pctPaid}%;background:linear-gradient(90deg,var(--copper),var(--copper-l))"></div></div>
            <div style="font-size:11.5px;color:var(--t2);margin-top:8px">${pctPaid}% paid this month</div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><div class="panel-title">Payment History (${payments.length})</div></div>
          ${payments.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Date</th><th>Amount</th><th>Type</th><th>Method</th><th>Reference</th><th>Status</th><th class="actions">Receipt</th></tr></thead>
            <tbody>${payments.map(p => `<tr>
              <td>${p.date ? new Date(p.date).toLocaleDateString() : '—'}</td>
              <td>${fmtMoney(p.amount)}</td>
              <td>${esc(p.type || 'Rent')}</td>
              <td>${esc(p.method || '—')}</td>
              <td>${esc(p.reference || '—')}</td>
              <td><span class="pill ${pillForStatus(p.status)}">${esc(p.status)}</span></td>
              <td class="actions"><button class="btn btn-outline btn-sm" onclick='openReceiptModal(${JSON.stringify(p).replace(/'/g, "&#39;")})'>View</button></td>
            </tr>`).join('')}</tbody>
          </table></div>` : `<div class="empty" style="border:none"><div class="empty-ico">₭</div><div class="empty-title">No payments yet</div><div class="empty-desc">Your payment history will appear here once payments are recorded.</div></div>`}
        </div>`;

      state.payLoaded = true;
      return;
    }

    /* ── MANAGER VIEW ─────────────────────────────────── */
    const [list, tenants] = await Promise.all([
      api('/payments'),
      api('/api/tenants').catch(() => state.tenants || []),
    ]);

    state.payments = list;
    state.tenants  = Array.isArray(tenants) ? tenants : [];
    state.tenantsLoaded = true;
    state.payLoaded = true;
    state.tenantBalances = computeTenantBalances(state.tenants, list);

    const badgeT = document.getElementById('badgeTenants');
    if (badgeT) badgeT.textContent = state.tenants.length;

    // Attach running-balance info to each payment record for display
    const paymentRow = (p) => {
      const tenant = state.tenants.find(t =>
        String(t._id) === String(p.tenantId) ||
        `${t.firstName} ${t.lastName}`.trim().toLowerCase() === String(p.tenant || '').trim().toLowerCase()
      );
      let balanceNote = '';
      if (tenant) {
        const ledger = buildTenantLedger(tenant, list);
        const snap = ledger.runningBalances.get(String(p._id));
        const accountNowClear = ledger.balance <= 0;
        if (snap && snap.balanceAfter > 0) {
          if (accountNowClear) {
            balanceNote = `<div style="font-size:10.5px;color:var(--green);margin-top:3px">Was ${fmtMoney(snap.balanceAfter)} · ✓ since cleared</div>`;
          } else {
            balanceNote = `<div style="font-size:10.5px;color:var(--amber);margin-top:3px">Bal. after: ${fmtMoney(snap.balanceAfter)}</div>`;
          }
        } else if (snap && snap.balanceAfter === 0) {
          balanceNote = `<div style="font-size:10.5px;color:var(--green);margin-top:3px">✓ Settled up</div>`;
        }
      }
      return `<tr>
        <td>${esc(p.tenant)}</td>
        <td>${esc(p.property || '—')}</td>
        <td>${esc(p.unit || '—')}</td>
        <td>
          ${fmtMoney(p.amount)}
          ${balanceNote}
        </td>
        <td>${p.date ? new Date(p.date).toLocaleDateString() : '—'}</td>
        <td>${esc(p.method)}</td>
        <td><span class="pill ${pillForStatus(p.status)}">${esc(p.status)}</span></td>
        <td class="actions">
          <button class="btn btn-outline btn-sm" onclick='openReceiptModal(${JSON.stringify(p).replace(/'/g, "&#39;")})'>Receipt</button>
          <button class="btn btn-outline btn-sm" onclick='openPaymentModal(${JSON.stringify(p).replace(/'/g, "&#39;")})'>Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deletePayment('${p._id}')">Delete</button>
        </td>
      </tr>`;
    };

    const paymentsTable = list.length
      ? `<div class="table-wrap"><table>
          <thead><tr><th>Tenant</th><th>Property</th><th>Unit</th><th>Amount</th><th>Date</th><th>Method</th><th>Status</th><th class="actions">Actions</th></tr></thead>
          <tbody>${list.map(paymentRow).join('')}</tbody>
        </table></div>`
      : `<div class="empty" style="border:none"><div class="empty-ico">₭</div><div class="empty-title">No payments recorded</div><div class="empty-desc">Log rent payments here as they come in.</div><button class="btn btn-primary" onclick="openPaymentModal()">+ Record Payment</button></div>`;

    el.innerHTML = `
      <div id="balancesWrap">${renderBalancesPanel()}</div>
      <div class="panel" style="margin-top:24px">
        <div class="panel-head"><div class="panel-title">Payment Records (${list.length})</div></div>
        ${paymentsTable}
      </div>`;
  } catch (err) {
    el.innerHTML = `<div class="panel-body"><div class="empty-desc">${esc(err.message)}</div></div>`;
  }
}

async function openPaymentModal(payment = null, preset = null) {
  const isEdit = !!payment;
  document.getElementById('modalTitle').textContent = isEdit ? 'Edit Payment' : 'Record Payment';

  if (!state.properties || !state.properties.length) {
    try { state.properties = await api('/api/properties'); } catch {}
  }
  if (!state.units || !state.units.length) {
    try { state.units = await api('/products'); } catch {}
  }
  if (!state.tenants || !state.tenants.length) {
    try { state.tenants = await api('/api/tenants'); } catch {}
  }
  if (!state.payments || !state.payments.length) {
    try { state.payments = await api('/payments'); } catch {}
  }

  const props   = state.properties || [];
  const units   = state.units      || [];
  const tenants = state.tenants    || [];

  const selectedTenantId = String(payment?.tenantId || preset?.tenantId || '');
  const selectedProperty = payment?.property || preset?.property || '';
  const selectedUnit     = payment?.unit     || preset?.unit     || '';
  const amountValue      = payment?.amount ?? preset?.amount ?? '';

  const dateVal = payment?.date
    ? new Date(payment.date).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  document.getElementById('modalBody').innerHTML = `
    <div class="payment-preview" id="paymentPreview">
      <div class="pp-empty">Select a tenant to preview their updated balance.</div>
    </div>

    <div class="field"><label>Tenant *</label>
      <select name="tenantId" required onchange="autoFillAmount(this)">
        <option value="">— Select tenant —</option>
        ${tenants.map(t => `<option value="${t._id}" ${selectedTenantId === String(t._id) ? 'selected' : ''}>${esc(t.firstName + ' ' + t.lastName)}</option>`).join('')}
      </select>
    </div>
    <div class="frow">
      <div class="field"><label>Amount (KES) *</label>
        <input type="number" name="amount" min="0" required value="${amountValue}" oninput="updatePaymentPreview()"/>
      </div>
      <div class="field"><label>Type</label>
        <select name="type" onchange="updatePaymentPreview()">
          ${['Rent','Deposit','Service Charge','Other'].map(t => `<option ${payment?.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="frow">
      <div class="field"><label>Method</label>
        <select name="method">
          ${['M-Pesa','Bank','Cash','Other'].map(m => `<option ${payment?.method === m ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Status</label>
        <select name="status">
          ${['Paid','Pending','Failed','Overdue'].map(s => `<option ${payment?.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="frow">
      <div class="field"><label>Property</label>
        <select name="property">
          <option value="">— Optional —</option>
          ${props.map(p => `<option ${selectedProperty === p.name ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Unit</label>
        <select name="unit">
          <option value="">— Optional —</option>
          ${units.map(u => `<option ${selectedUnit === u.name ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="frow">
      <div class="field"><label>Date</label>
        <input type="date" name="date" value="${dateVal}"/>
      </div>
      <div class="field"><label>Reference</label>
        <input type="text" name="reference" value="${esc(payment?.reference || '')}" placeholder="M-Pesa code, bank ref, etc."/>
      </div>
    </div>`;

  // Initial preview
  setTimeout(updatePaymentPreview, 0);

  modalHandler = async () => {
    const form = document.getElementById('modalForm');
    const payload = {
      tenantId:  form.querySelector('[name="tenantId"]').value,
      amount:    Number(form.querySelector('[name="amount"]').value) || 0,
      type:      form.querySelector('[name="type"]').value,
      method:    form.querySelector('[name="method"]').value,
      status:    form.querySelector('[name="status"]').value,
      property:  form.querySelector('[name="property"]').value,
      unit:      form.querySelector('[name="unit"]').value,
      date:      form.querySelector('[name="date"]').value || new Date(),
      reference: form.querySelector('[name="reference"]').value.trim(),
    };

    if (isEdit) {
      await api(`/payments/${payment._id}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Payment updated.', 'success');
    } else {
      await api('/payments', { method: 'POST', body: JSON.stringify(payload) });
      toast('Payment recorded.', 'success');
    }
    closeModal();
    state.payLoaded = false;
    loadPayments();
    loadDashboard();
    if (getActiveView() === 'documents') loadManagerDocuments();
  };
  document.getElementById('modal').classList.add('open');
}

async function deletePayment(id) {
  if (!confirm('Delete this payment record? This cannot be undone.')) return;
  try {
    await api(`/payments/${id}`, { method: 'DELETE' });
    toast('Payment deleted.', 'success');
    state.payLoaded = false;
    loadPayments();
    loadDashboard();
    if (getActiveView() === 'documents') loadManagerDocuments();
  } catch (err) { toast(err.message, 'error'); }
}