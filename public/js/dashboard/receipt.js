// public/js/dashboard/receipt.js
// Payment receipt — modal viewer + PDF download.
// Resolves ledger context so receipts show balance-before / balance-after correctly.

let currentReceiptPayment = null;

/** Resolve the tenant + ledger context for a payment record. */
function resolveReceiptContext(payment) {
  let tenant = null;
  let payments = [];

  if (IS_TENANT) {
    const s = state.tenantSummary;
    if (s?.user) {
      tenant = {
        _id: s.user._id,
        firstName: s.user.firstName,
        lastName: s.user.lastName,
        rent: s.rent,
        deposit: s.deposit,
        property: s.property,
        unitName: s.unit?.name,
      };
      payments = s.payments || [];
    }
  } else {
    tenant = (state.tenants || []).find(
      (t) =>
        String(t._id) === String(payment.tenantId) ||
        `${t.firstName} ${t.lastName}`.trim().toLowerCase() ===
          String(payment.tenant || "")
            .trim()
            .toLowerCase(),
    );
    payments = state.payments || [];
  }

  if (!tenant) return { tenant: null, ledger: null, snapshot: null };

  const ledger = buildTenantLedger(tenant, payments);
  const snapshot = ledger.runningBalances.get(String(payment._id)) || null;
  return { tenant, ledger, snapshot };
}

/**
 * Compute balance before/after for a specific payment.
 * Deterministic: replays all paid payments in date order.
 * Does not rely on ledger.runningBalances (that map has been unreliable).
 */
function computeReceiptBalances(payment) {
  const { ledger } = resolveReceiptContext(payment);
  if (!ledger) return { before: 0, after: 0 };

  const amount = Number(payment.amount) || 0;

  // Sort all paid payments oldest → newest
  const sorted = [...ledger.payments].sort((a, b) => {
    const da = new Date(a.date || 0).getTime() || 0;
    const db = new Date(b.date || 0).getTime() || 0;
    return da - db;
  });

  // Sum of amounts applied before this payment
  let paidBefore = 0;
  for (const p of sorted) {
    if (String(p._id) === String(payment._id)) break;
    paidBefore += Number(p.amount) || 0;
  }

  const before = Math.max(0, ledger.totalDue - paidBefore);
  const after = Math.max(0, before - amount);
  return { before, after };
}

function buildReceiptHTML(payment) {
  const { tenant, ledger, snapshot } = resolveReceiptContext(payment);
  const org = SESSION.organizationName || "Meridian Properties";
  const receiptNo =
    payment.receiptNumber ||
    payment.reference ||
    String(payment._id || "")
      .slice(-8)
      .toUpperCase() ||
    "RCP-0001";
  const dateStr = payment.date
    ? new Date(payment.date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

  const amount = Number(payment.amount) || 0;
  const { before: balanceBefore, after: balanceAfter } =
    computeReceiptBalances(payment);
  const allocations = snapshot?.allocations || [];
  const accountNowClear = ledger ? ledger.balance <= 0 : false;

  // Status
  let badgeClass = "mute",
    badgeLabel = "Recorded";
  if (String(payment.status).toLowerCase() === "paid") {
    if (balanceAfter <= 0) {
      badgeClass = "ok";
      badgeLabel = "Paid in Full";
    } else {
      badgeClass = "warn";
      badgeLabel = "Partial Payment";
    }
  } else if (String(payment.status).toLowerCase() === "pending") {
    badgeClass = "warn";
    badgeLabel = "Pending";
  } else if (
    ["overdue", "failed"].includes(String(payment.status).toLowerCase())
  ) {
    badgeClass = "danger";
    badgeLabel = String(payment.status);
  }

  const allocRows = allocations.length
    ? `<div class="receipt-section">
        <div class="receipt-section-title">Applied To</div>
        <table class="receipt-alloc-table">
          ${allocations.map((a) => `<tr><td>${esc(a.label)}</td><td>${fmtMoney(a.amount)}</td></tr>`).join("")}
        </table>
      </div>`
    : "";

  let summaryBlock = "";
  if (ledger) {
    const depState =
      ledger.depositDue > 0
        ? ledger.depositBalance > 0
          ? `<span class="v warn">${fmtMoney(ledger.depositPaid)} / ${fmtMoney(ledger.depositDue)}</span>`
          : `<span class="v ok">✓ ${fmtMoney(ledger.depositPaid)}</span>`
        : `<span class="v">—</span>`;

    summaryBlock = `
      <div class="receipt-section">
        <div class="receipt-section-title">Account Summary</div>
        <div class="receipt-summary-row"><span class="k">Rent due (to date)</span><span class="v">${fmtMoney(ledger.rentDue)}</span></div>
        <div class="receipt-summary-row"><span class="k">Rent paid</span><span class="v ok">${fmtMoney(ledger.rentPaid)}</span></div>
        <div class="receipt-summary-row"><span class="k">Rent balance</span><span class="v ${ledger.rentBalance > 0 ? "warn" : "ok"}">${ledger.rentBalance > 0 ? fmtMoney(ledger.rentBalance) : "✓ Settled"}</span></div>
        <div class="receipt-summary-row"><span class="k">Deposit (paid / required)</span>${depState}</div>
      </div>`;
  }

  let footMessage;
  if (balanceAfter > 0) {
    if (accountNowClear) {
      footMessage = `This receipt was issued with <strong>${fmtMoney(balanceAfter)}</strong> outstanding.<br>The account has since been <strong style="color:#1a9e6a">fully settled</strong>.`;
    } else {
      footMessage = `Partial payment received. <strong>${fmtMoney(balanceAfter)}</strong> remains outstanding on this account.`;
    }
  } else {
    footMessage = `Account is fully settled as of this payment. Thank you!`;
  }

  return `
    <div class="receipt">
      <div class="receipt-bar"></div>
      <div class="receipt-inner">
        <div class="receipt-head">
          <div>
            <div class="receipt-title">Payment Receipt</div>
            <div class="receipt-org">${esc(org)}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
            <div class="receipt-badge ${badgeClass}">${esc(badgeLabel)}</div>
            ${
              ledger && ledger.balance <= 0 && balanceAfter <= 0
                ? `<div class="receipt-badge ok" style="font-size:9.5px">Account Closed</div>`
                : ""
            }
          </div>
        </div>

        <div class="receipt-meta">
          <div class="receipt-meta-item"><span class="k">Receipt No.</span><span class="v">${esc(receiptNo)}</span></div>
          <div class="receipt-meta-item"><span class="k">Date</span><span class="v">${dateStr}</span></div>
          <div class="receipt-meta-item"><span class="k">Tenant</span><span class="v">${esc(payment.tenant || "—")}</span></div>
          <div class="receipt-meta-item"><span class="k">Property / Unit</span><span class="v">${esc(payment.property || "—")}${payment.unit ? " · " + esc(payment.unit) : ""}</span></div>
          <div class="receipt-meta-item"><span class="k">Payment Type</span><span class="v">${esc(payment.type || "Rent")}</span></div>
          <div class="receipt-meta-item"><span class="k">Method</span><span class="v">${esc(payment.method || "—")}</span></div>
        </div>

        <div class="receipt-amount-box">
          <div class="k">Amount Paid</div>
          <div class="v">${fmtMoney(amount)}</div>
        </div>

        <div class="receipt-balance">
          <div class="col">
            <div class="lbl">Balance Before</div>
            <div class="val ${balanceBefore > 0 ? "warn" : "ok"}">${fmtMoney(balanceBefore)}</div>
          </div>
          <div class="arrow">→</div>
          <div class="col">
            <div class="lbl">Balance After</div>
            <div class="val ${balanceAfter > 0 ? "warn" : "ok"}">${fmtMoney(balanceAfter)}</div>
            ${
              balanceAfter > 0 && accountNowClear
                ? `<div style="font-size:10px;color:#1a9e6a;font-weight:700;margin-top:6px">✓ Since cleared</div>`
                : ""
            }
          </div>
        </div>

        ${allocRows}
        ${summaryBlock}

        <div class="receipt-foot">${footMessage}<br>This is a computer-generated receipt. No signature required.</div>
      </div>
    </div>`;
}

function openReceiptModal(payment) {
  currentReceiptPayment = payment;
  const body = document.getElementById("receiptModalBody");
  body.innerHTML = buildReceiptHTML(payment);
  document.getElementById("receiptPdfBtn").onclick = () =>
    downloadReceiptPDF(payment);
  document.getElementById("receiptModal").classList.add("open");
}

function closeReceiptModal() {
  document.getElementById("receiptModal").classList.remove("open");
  currentReceiptPayment = null;
}

function downloadReceiptPDF(payment) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    toast(
      "PDF library not loaded yet — please try again in a moment.",
      "error",
    );
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  const { ledger, snapshot } = resolveReceiptContext(payment);
  const org = SESSION.organizationName || "Meridian Properties";
  const receiptNo =
    payment.receiptNumber ||
    payment.reference ||
    String(payment._id || "")
      .slice(-8)
      .toUpperCase() ||
    "RCP-0001";
  const dateStr = payment.date
    ? new Date(payment.date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

  const amount = Number(payment.amount) || 0;
  const { before: balanceBefore, after: balanceAfter } =
    computeReceiptBalances(payment);
  const accountNowClear = ledger ? ledger.balance <= 0 : false;

  // Status label
  let statusLabel = String(payment.status || "Recorded");
  let statusColor = [120, 120, 120];
  if (String(payment.status).toLowerCase() === "paid") {
    if (balanceAfter <= 0) {
      statusLabel = "PAID IN FULL";
      statusColor = [26, 158, 106];
    } else {
      statusLabel = "PARTIAL PAYMENT";
      statusColor = [199, 126, 20];
    }
  } else if (
    ["overdue", "failed"].includes(String(payment.status).toLowerCase())
  ) {
    statusColor = [201, 64, 64];
  } else if (String(payment.status).toLowerCase() === "pending") {
    statusColor = [199, 126, 20];
  }

  // Copper top bar
  doc.setFillColor(184, 131, 74);
  doc.rect(0, 0, W, 8, "F");

  // Title
  doc.setFont("times", "bold");
  doc.setFontSize(26);
  doc.setTextColor(20, 20, 20);
  doc.text("Payment Receipt", 40, 80);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(184, 131, 74);
  doc.text(org.toUpperCase(), 40, 100);

  // Status badge (top-right)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.text(statusLabel, W - 40, 80, { align: "right" });

  let y = 130;

  // Meta block
  const meta = [
    ["Receipt No.", receiptNo],
    ["Date", dateStr],
    ["Tenant", payment.tenant || "—"],
    [
      "Property / Unit",
      `${payment.property || "—"}${payment.unit ? " · " + payment.unit : ""}`,
    ],
    ["Payment Type", payment.type || "Rent"],
    ["Method", payment.method || "—"],
  ];

  meta.forEach(([k, v]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(150, 150, 150);
    doc.text(String(k).toUpperCase(), 40, y);

    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text(String(v), W - 40, y, { align: "right" });

    doc.setDrawColor(235, 235, 235);
    doc.line(40, y + 7, W - 40, y + 7);
    y += 24;
  });

  y += 14;

  // Amount box
  doc.setFillColor(250, 246, 241);
  doc.roundedRect(40, y, W - 80, 62, 8, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(138, 106, 68);
  doc.text("AMOUNT PAID", W / 2, y + 18, { align: "center" });
  doc.setFont("times", "bold");
  doc.setFontSize(28);
  doc.setTextColor(184, 131, 74);
  doc.text("KES " + amount.toLocaleString("en-KE"), W / 2, y + 48, {
    align: "center",
  });
  y += 84;

  // Balance before → after
  const halfW = (W - 80) / 2 - 10;
  doc.setFillColor(247, 248, 250);
  doc.roundedRect(40, y, halfW, 56, 6, 6, "F");
  doc.roundedRect(40 + halfW + 20, y, halfW, 56, 6, 6, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(150, 150, 150);
  doc.text("BALANCE BEFORE", 40 + halfW / 2, y + 18, { align: "center" });
  doc.text("BALANCE AFTER", 40 + halfW + 20 + halfW / 2, y + 18, {
    align: "center",
  });

  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.setTextColor(
    balanceBefore > 0 ? 199 : 26,
    balanceBefore > 0 ? 126 : 158,
    balanceBefore > 0 ? 20 : 106,
  );
  doc.text(fmtMoney(balanceBefore), 40 + halfW / 2, y + 42, {
    align: "center",
  });

  doc.setTextColor(
    balanceAfter > 0 ? 199 : 26,
    balanceAfter > 0 ? 126 : 158,
    balanceAfter > 0 ? 20 : 106,
  );
  doc.text(fmtMoney(balanceAfter), 40 + halfW + 20 + halfW / 2, y + 42, {
    align: "center",
  });

  if (balanceAfter > 0 && accountNowClear) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(26, 158, 106);
    doc.text("✓ SINCE CLEARED", 40 + halfW + 20 + halfW / 2, y + 56, {
      align: "center",
    });
  }
  y += 80;

  // Allocation table
  if (snapshot?.allocations?.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(138, 106, 68);
    doc.text("APPLIED TO", 40, y);
    doc.setDrawColor(235, 235, 235);
    doc.line(40, y + 6, W - 40, y + 6);
    y += 20;

    snapshot.allocations.forEach((a) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(60, 60, 60);
      doc.text(String(a.label), 40, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text(fmtMoney(a.amount), W - 40, y, { align: "right" });
      y += 18;
    });
    y += 6;
  }

  // Account summary
  if (ledger) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(138, 106, 68);
    doc.text("ACCOUNT SUMMARY", 40, y);
    doc.setDrawColor(235, 235, 235);
    doc.line(40, y + 6, W - 40, y + 6);
    y += 20;

    const summary = [
      ["Rent due (to date)", ledger.rentDue],
      ["Rent paid", ledger.rentPaid],
      ["Rent balance", ledger.rentBalance],
    ];
    if (ledger.depositDue > 0) {
      summary.push(["Deposit paid", ledger.depositPaid]);
      summary.push(["Deposit required", ledger.depositDue]);
    }
    summary.forEach(([k, v]) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(110, 110, 110);
      doc.text(String(k), 40, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text(fmtMoney(v), W - 40, y, { align: "right" });
      y += 16;
    });
    y += 10;
  }

  // Footer message
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (balanceAfter > 0) {
    if (accountNowClear) {
      doc.setTextColor(199, 126, 20);
      doc.text(
        `This receipt was issued with ${fmtMoney(balanceAfter)} outstanding.`,
        W / 2,
        y,
        { align: "center" },
      );
      y += 14;
      doc.setTextColor(26, 158, 106);
      doc.text("The account has since been fully settled.", W / 2, y, {
        align: "center",
      });
    } else {
      doc.setTextColor(199, 126, 20);
      doc.text(
        `Partial payment received. ${fmtMoney(balanceAfter)} remains outstanding on this account.`,
        W / 2,
        y,
        { align: "center" },
      );
    }
  } else {
    doc.setTextColor(26, 158, 106);
    doc.text("Account fully settled as of this payment. Thank you!", W / 2, y, {
      align: "center",
    });
  }
  y += 16;
  doc.setFontSize(8);
  doc.setTextColor(160, 160, 160);
  doc.text(
    "This is a computer-generated receipt. No signature required.",
    W / 2,
    y,
    { align: "center" },
  );

  doc.save(`Receipt-${receiptNo}.pdf`);
}

document.getElementById("receiptModal").addEventListener("click", function (e) {
  if (e.target === this) closeReceiptModal();
});
