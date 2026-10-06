// public/js/dashboard/documents.js
// Documents view — payment receipts for managers and tenants.
// The actual receipt rendering/PDF lives in receipt.js (loaded separately).

async function loadManagerDocuments() {
  const el = document.getElementById("documentsList");
  if (!el) return;
  el.innerHTML = `<div class="empty" style="border-style:solid"><div class="empty-desc">Loading payment records…</div></div>`;
  try {
    const payments = await api("/payments");
    state.payments = payments;

    if (!payments.length) {
      el.innerHTML = `<div class="empty">
        <div class="empty-ico">▦</div>
        <div class="empty-title">No payment receipts yet</div>
        <div class="empty-desc">Once you record a payment, its receipt will appear here — ready to view or download as PDF.</div>
      </div>`;
      return;
    }

    el.innerHTML = `
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Payment Receipts (${payments.length})</div></div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>Date</th><th>Receipt No.</th><th>Tenant</th><th>Amount</th>
            <th>Type</th><th>Method</th><th>Status</th><th class="actions">Actions</th>
          </tr></thead>
          <tbody>${payments
            .map(
              (p) => `<tr>
            <td>${p.date ? new Date(p.date).toLocaleDateString() : "—"}</td>
            <td>${esc(p.reference || String(p._id).slice(-8).toUpperCase())}</td>
            <td>${esc(p.tenant || "—")}</td>
            <td>${fmtMoney(p.amount)}</td>
            <td>${esc(p.type || "Rent")}</td>
            <td>${esc(p.method || "—")}</td>
            <td><span class="pill ${pillForStatus(p.status)}">${esc(p.status)}</span></td>
            <td class="actions">
              <button class="btn btn-outline btn-sm" onclick='openReceiptModal(${JSON.stringify(p).replace(/'/g, "&#39;")})'>View</button>
              <button class="btn btn-primary btn-sm" onclick='downloadReceiptPDF(${JSON.stringify(p).replace(/'/g, "&#39;")})'>PDF</button>
            </td>
          </tr>`,
            )
            .join("")}</tbody>
        </table></div>
      </div>`;
  } catch (err) {
    el.innerHTML = `<div class="panel-body"><div class="empty-desc">${esc(err.message)}</div></div>`;
  }
}

async function loadTenantDocuments() {
  const el = document.getElementById("documentsList");
  if (!el) return;
  el.innerHTML = `<div class="empty" style="border-style:solid"><div class="empty-desc">Loading your receipts…</div></div>`;
  try {
    const receipts = await api("/api/tenant/receipts");

    if (!receipts.length) {
      el.innerHTML = `<div class="empty">
        <div class="empty-ico">▦</div>
        <div class="empty-title">No receipts yet</div>
        <div class="empty-desc">Receipts for your payments will appear here once your property manager records them.</div>
      </div>`;
      return;
    }

    el.innerHTML = `
      <div class="panel">
        <div class="panel-head"><div class="panel-title">My Receipts (${receipts.length})</div></div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>Date</th><th>Receipt No.</th><th>Amount</th>
            <th>Type</th><th>Method</th><th class="actions">Actions</th>
          </tr></thead>
          <tbody>${receipts
            .map(
              (r) => `<tr>
            <td>${r.date ? new Date(r.date).toLocaleDateString() : "—"}</td>
            <td>${esc(r.reference || String(r._id).slice(-8).toUpperCase())}</td>
            <td>${fmtMoney(r.amount)}</td>
            <td>${esc(r.type || "Rent")}</td>
            <td>${esc(r.method || "—")}</td>
            <td class="actions">
              <button class="btn btn-outline btn-sm" onclick='openReceiptModal(${JSON.stringify(r).replace(/'/g, "&#39;")})'>View</button>
              <button class="btn btn-primary btn-sm" onclick='downloadReceiptPDF(${JSON.stringify(r).replace(/'/g, "&#39;")})'>PDF</button>
            </td>
          </tr>`,
            )
            .join("")}</tbody>
        </table></div>
      </div>`;
  } catch (err) {
    el.innerHTML = `<div class="panel-body"><div class="empty-desc">${esc(err.message)}</div></div>`;
  }
}
