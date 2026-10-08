// public/js/dashboard/documents.js
// Documents view - payment receipts for managers and tenants.
// The actual receipt rendering/PDF lives in receipt.js (loaded separately).

// Module state
let docsLoaded = false;
let docsMode = "manager"; // "manager" | "tenant"
let docsReceipts = [];
let docsSearchTerm = "";
let docsMonthFilter = "";

// ══════════════════════════════════════════════════════════
// Loaders
// ══════════════════════════════════════════════════════════
async function loadManagerDocuments() {
  const el = document.getElementById("documentsList");
  if (!el) return;
  el.innerHTML = `<div class="empty" style="border-style:solid"><div class="empty-desc">Loading payment records...</div></div>`;
  try {
    const payments = await api("/payments");
    state.payments = payments;
    docsReceipts = payments;
    docsLoaded = true;
    docsMode = "manager";
    renderDocumentsList();
  } catch (err) {
    el.innerHTML = `<div class="panel-body"><div class="empty-desc">${esc(err.message)}</div></div>`;
  }
}

async function loadTenantDocuments() {
  const el = document.getElementById("documentsList");
  if (!el) return;
  el.innerHTML = `<div class="empty" style="border-style:solid"><div class="empty-desc">Loading your receipts...</div></div>`;
  try {
    const receipts = await api("/api/tenant/receipts");
    docsReceipts = receipts;
    docsLoaded = true;
    docsMode = "tenant";
    renderDocumentsList();
  } catch (err) {
    el.innerHTML = `<div class="panel-body"><div class="empty-desc">${esc(err.message)}</div></div>`;
  }
}

// ══════════════════════════════════════════════════════════
// Rendering
// ══════════════════════════════════════════════════════════
function renderDocumentsList() {
  const el = document.getElementById("documentsList");
  if (!el) return;
  if (docsMode === "tenant") renderTenantDocs(el);
  else renderManagerDocs(el);
}

function renderTenantDocs(el) {
  const all = docsReceipts || [];
  let list = all;

  if (docsMonthFilter) {
    list = all.filter((r) => {
      const d = r.date
        ? new Date(r.date)
        : r.createdAt
          ? new Date(r.createdAt)
          : null;
      if (!d || isNaN(d)) return false;
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return ym === docsMonthFilter;
    });
  }

  if (!all.length) {
    el.innerHTML = emptyState({
      icon: "file",
      title: "No receipts yet",
      desc: "Receipts for your payments will appear here once your property manager records them.",
    });
    return;
  }

  if (!list.length) {
    el.innerHTML = emptyState({
      icon: "search",
      title: "No receipts for this month",
      desc: "Try a different month, or clear the filter to see all receipts.",
    });
    return;
  }

  el.innerHTML = `
    <div class="panel">
      <div class="panel-head"><div class="panel-title">My Receipts (${list.length}${docsMonthFilter ? ` of ${all.length}` : ""})</div></div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Date</th><th>Receipt No.</th><th>Amount</th>
          <th>Type</th><th>Method</th><th class="actions">Actions</th>
        </tr></thead>
        <tbody>${list
          .map(
            (r) => `<tr>
          <td>${r.date ? new Date(r.date).toLocaleDateString() : "-"}</td>
          <td>${esc(r.reference || String(r._id).slice(-8).toUpperCase())}</td>
          <td>${fmtMoney(r.amount)}</td>
          <td>${esc(r.type || "Rent")}</td>
          <td>${esc(r.method || "-")}</td>
          <td class="actions">
            <button class="btn btn-outline btn-sm" onclick='openReceiptModal(${JSON.stringify(r).replace(/'/g, "&#39;")})'>View</button>
            <button class="btn btn-primary btn-sm" onclick='downloadReceiptPDF(${JSON.stringify(r).replace(/'/g, "&#39;")})'>PDF</button>
          </td>
        </tr>`,
          )
          .join("")}</tbody>
      </table></div>
    </div>`;
}

function renderManagerDocs(el) {
  const all = state.payments || [];
  const term = docsSearchTerm.trim().toLowerCase();
  const list = term ? all.filter((p) => matchesDocument(p, term)) : all;

  if (!all.length) {
    el.innerHTML = emptyState({
      icon: "file",
      title: "No payment receipts yet",
      desc: "Once you record a payment, its receipt will appear here - ready to view or download as PDF.",
    });
    return;
  }

  if (!list.length) {
    el.innerHTML = emptyState({
      icon: "search",
      title: "No matches",
      desc: `No receipts match "${docsSearchTerm}".`,
    });
    return;
  }

  el.innerHTML = `
    <div class="panel">
      <div class="panel-head"><div class="panel-title">Payment Receipts (${list.length}${term ? ` of ${all.length}` : ""})</div></div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Date</th><th>Receipt No.</th><th>Tenant</th><th>Amount</th>
          <th>Type</th><th>Method</th><th>Status</th><th class="actions">Actions</th>
        </tr></thead>
        <tbody>${list
          .map(
            (p) => `<tr>
          <td>${p.date ? new Date(p.date).toLocaleDateString() : "-"}</td>
          <td>${esc(p.reference || String(p._id).slice(-8).toUpperCase())}</td>
          <td>${esc(p.tenant || "-")}</td>
          <td>${fmtMoney(p.amount)}</td>
          <td>${esc(p.type || "Rent")}</td>
          <td>${esc(p.method || "-")}</td>
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
}

function matchesDocument(d, term) {
  return [
    d.tenant,
    d.reference,
    d.type,
    d.method,
    d.status,
    d.property,
    d.unit,
  ].some((v) =>
    String(v || "")
      .toLowerCase()
      .includes(term),
  );
}

// ══════════════════════════════════════════════════════════
// Search wiring
// ══════════════════════════════════════════════════════════
if (IS_TENANT) {
  // Tenants filter by month, not text.
  const textSearch = document.getElementById("searchDocs");
  if (textSearch) textSearch.style.display = "none";

  const monthSearch = document.getElementById("monthDocs");
  if (monthSearch) {
    monthSearch.style.display = "";
    monthSearch.addEventListener("input", (e) => {
      docsMonthFilter = e.target.value; // "YYYY-MM" or ""
      if (docsLoaded) renderDocumentsList();
    });
  }
} else {
  document.getElementById("searchDocs")?.addEventListener("input", (e) => {
    docsSearchTerm = e.target.value;
    if (docsLoaded) renderDocumentsList();
  });
}
