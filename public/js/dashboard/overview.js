// public/js/dashboard/overview.js
// Overview view — dashboard loader + charts (manager and tenant variants).

function paintIdentity({
  firstName,
  lastName,
  role,
  organizationName,
  avatar,
}) {
  document.getElementById("sbOrgName").textContent = organizationName || "—";
  document.getElementById("avName").textContent = firstName
    ? `${firstName} ${lastName || ""}`.trim()
    : "—";
  document.getElementById("avRole").textContent = role || "—";
  document.getElementById("ddName").textContent = firstName
    ? `${firstName} ${lastName || ""}`.trim()
    : "—";
  document.getElementById("ddEmail").textContent = SESSION.email || "—";
  document.getElementById("tbTitle").textContent =
    `${greeting()}, ${firstName || "there"}`;
  document.getElementById("tbSub").textContent = organizationName
    ? `Here's what's happening at ${organizationName} today.`
    : "Here's what's happening with your property portfolio today.";

  const av = document.getElementById("avatar");
  if (avatar) av.innerHTML = `<img src="${esc(avatar)}" alt="">`;
  else av.textContent = initials(firstName, lastName);
}

async function loadDashboard() {
  try {
    if (IS_TENANT) {
      const data = await api("/api/tenant/summary");
      state.tenantSummary = data;
      paintIdentity({
        firstName: data.user.firstName,
        lastName: data.user.lastName,
        role: data.user.role,
        organizationName: SESSION.organizationName,
        avatar: data.user.avatar,
      });
      renderTenantOverview(data);
      return;
    }

    const data = await api("/api/dashboard");
    state.dashboard = data;

    // Update all sidebar badges from the dashboard stats — no extra API calls needed.
    const badgeProps = document.getElementById("badgeProps");
    const badgeUnits = document.getElementById("badgeUnits");
    const badgeTenants = document.getElementById("badgeTenants");
    const badgeMaint = document.getElementById("badgeMaint");

    const setBadge = (el, val) => {
      if (!el) return;
      el.textContent = val || 0;
      el.classList.remove("is-loading");
    };

    setBadge(badgeProps, data.stats.totalProperties);
    setBadge(badgeUnits, data.stats.totalUnits);
    setBadge(badgeTenants, data.stats.totalTenants);
    setBadge(badgeMaint, data.stats.maintenanceRequests);
    // Cache for instant paint on next page load
    setSession({
      cachedStats: {
        totalProperties: data.stats.totalProperties || 0,
        totalUnits: data.stats.totalUnits || 0,
        totalTenants: data.stats.totalTenants || 0,
        maintenanceRequests: data.stats.maintenanceRequests || 0,
      },
    });

    paintIdentity({
      firstName: data.user.firstName,
      lastName: data.user.lastName,
      role: data.user.role,
      organizationName: data.organization.name,
      avatar: data.user.avatar,
    });
    setSession({
      firstName: data.user.firstName,
      lastName: data.user.lastName,
      role: data.user.role,
      avatar: data.user.avatar,
      organizationName: data.organization.name,
      organizationId: data.organization.id,
    });
    renderOverview(data);
  } catch (err) {
    toast(err.message || "Unable to load your dashboard.", "error");
    document.getElementById("overviewLoading").innerHTML =
      `<div class="empty"><div class="empty-ico">⚠</div><div class="empty-title">Couldn't load your dashboard</div><div class="empty-desc">${esc(err.message)}</div><button class="btn btn-primary" onclick="loadDashboard()">Retry</button></div>`;
  }
}

function renderTenantOverview(data) {
  document.getElementById("overviewLoading").style.display = "none";
  const c = document.getElementById("overviewContent");
  c.style.display = "block";

  if (!data.unit) {
    c.innerHTML = `
      <div class="empty">
        <div class="empty-ico">⌂</div>
        <div class="empty-title">No unit assigned yet</div>
        <div class="empty-desc">You haven't been assigned to a unit yet. Please contact your property manager to get set up.</div>
      </div>`;
    return;
  }

  const cm = data.currentMonth;
  let statusPill = "pill-mute";
  if (cm.status === "Fully Paid") statusPill = "pill-green";
  else if (cm.status === "Partial") statusPill = "pill-amber";
  else if (cm.status === "Unpaid") statusPill = "pill-red";
  const pctPaid =
    cm.due > 0 ? Math.min(100, Math.round((cm.paid / cm.due) * 100)) : 0;
  const recentPayments = (data.payments || []).slice(0, 5);

  c.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-lbl">My Property</div><div class="stat-val" style="font-size:20px">${esc(data.property || "—")}</div><div class="stat-sub">Assigned property</div></div>
      <div class="stat-card"><div class="stat-lbl">My Unit</div><div class="stat-val" style="font-size:20px">${esc(data.unit.name)}</div><div class="stat-sub">${data.unit.floor && data.unit.floor !== "—" ? `Floor ${esc(data.unit.floor)}` : "Floor not set"}</div></div>
      <div class="stat-card"><div class="stat-lbl">Monthly Rent</div><div class="stat-val money">${fmtMoney(data.rent)}</div><div class="stat-sub">Due each month</div></div>
      <div class="stat-card"><div class="stat-lbl">Payment Status</div><div class="stat-val" style="font-size:16px;padding-top:8px"><span class="pill ${statusPill}">${esc(cm.status)}</span></div><div class="stat-sub">${esc(cm.monthLabel || "This month")}</div></div>
      <div class="stat-card"><div class="stat-lbl">Open Requests</div><div class="stat-val">${data.maintenance.open}</div><div class="stat-sub">Maintenance issues in progress</div></div>
    </div>

    <div class="panel" style="margin-bottom:24px">
      <div class="panel-head">
        <div class="panel-title">Rent Status — ${esc(cm.monthLabel || "This Month")}</div>
        <span class="pill ${statusPill}">${esc(cm.status)}</span>
      </div>
      <div class="panel-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:16px">
          <div><div style="font-size:10.5px;color:var(--t2);text-transform:uppercase;letter-spacing:.09em;margin-bottom:4px">Due</div><div style="font-family:var(--font-serif);font-size:22px;font-weight:700;color:var(--white)">${fmtMoney(cm.due)}</div></div>
          <div><div style="font-size:10.5px;color:var(--t2);text-transform:uppercase;letter-spacing:.09em;margin-bottom:4px">Paid</div><div style="font-family:var(--font-serif);font-size:22px;font-weight:700;color:var(--green)">${fmtMoney(cm.paid)}</div></div>
          <div><div style="font-size:10.5px;color:var(--t2);text-transform:uppercase;letter-spacing:.09em;margin-bottom:4px">Balance</div><div style="font-family:var(--font-serif);font-size:22px;font-weight:700;color:${cm.balance > 0 ? "var(--amber)" : "var(--green)"}">${fmtMoney(cm.balance)}</div></div>
        </div>
        <div style="height:10px;background:var(--ink-3);border-radius:6px;overflow:hidden"><div style="height:100%;width:${pctPaid}%;background:linear-gradient(90deg,var(--copper),var(--copper-l))"></div></div>
        <div style="font-size:11.5px;color:var(--t2);margin-top:8px">${pctPaid}% of this month's rent received</div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-head"><div><div class="chart-title">My Payments — Last 6 Months</div><div class="chart-sub">Paid vs outstanding, in KES</div></div></div>
        <div class="chart-body"><canvas id="tenant-chart-payments"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-head"><div><div class="chart-title">My Maintenance Requests</div><div class="chart-sub">By current status</div></div></div>
        <div class="chart-body chart-sm"><canvas id="tenant-chart-maint"></canvas></div>
      </div>
    </div>

    <div class="panel" style="margin-bottom:24px">
      <div class="panel-head"><div class="panel-title">Quick Actions</div></div>
      <div class="panel-body">
        <div class="quick-grid" style="margin-top:0">
          <div class="quick-card" onclick="openMaintenanceModal()"><div class="quick-num">+</div><h4>Report an issue</h4><p>Submit a maintenance request for your unit.</p></div>
          <div class="quick-card" onclick="switchView('payments')"><div class="quick-num">₭</div><h4>View payments</h4><p>See your rent history and current balance.</p></div>
          <div class="quick-card" onclick="switchView('documents')"><div class="quick-num">▦</div><h4>My receipts</h4><p>Download receipts for payments you've made.</p></div>
        </div>
      </div>
    </div>

    ${
      recentPayments.length
        ? `
    <div class="panel">
      <div class="panel-head"><div class="panel-title">Recent Payments</div><button class="btn btn-outline btn-sm" onclick="switchView('payments')">View All</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th></tr></thead>
        <tbody>${recentPayments
          .map(
            (p) => `
          <tr>
            <td>${p.date ? new Date(p.date).toLocaleDateString() : "—"}</td>
            <td>${fmtMoney(p.amount)}</td>
            <td>${esc(p.method || "—")}</td>
            <td>${esc(p.reference || "—")}</td>
            <td><span class="pill ${pillForStatus(p.status)}">${esc(p.status)}</span></td>
          </tr>`,
          )
          .join("")}</tbody>
      </table></div>
    </div>`
        : ""
    }`;

  renderTenantCharts(data);
}

function renderTenantCharts(data) {
  if (typeof Chart === "undefined") return;
  const charts = data.charts || {};
  const paymentsByMonth = charts.paymentsByMonth || [];
  const maintByStatus = charts.maintByStatus || {
    Open: 0,
    "In Progress": 0,
    Resolved: 0,
    Closed: 0,
  };

  Chart.defaults.color = "#7a83a0";
  Chart.defaults.borderColor = "rgba(255,255,255,.07)";
  Chart.defaults.font.family = "Outfit, sans-serif";
  Chart.defaults.font.size = 11;

  const gridOpts = { color: "rgba(255,255,255,.05)" };
  const tickOpts = { color: "#7a83a0" };

  ["tenantPaymentsChart", "tenantMaintChart"].forEach((k) => {
    if (chartInstances[k]) {
      try {
        chartInstances[k].destroy();
      } catch {}
      delete chartInstances[k];
    }
  });

  const payEl = document.getElementById("tenant-chart-payments");
  if (payEl && paymentsByMonth.length) {
    const labels = paymentsByMonth.map((m) => m.label);
    const paid = paymentsByMonth.map((m) => m.paid);
    const pending = paymentsByMonth.map((m) => m.pending);

    const ctx = payEl.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 240);
    grad.addColorStop(0, "rgba(184,131,74,.35)");
    grad.addColorStop(1, "rgba(184,131,74,0)");

    chartInstances.tenantPaymentsChart = new Chart(payEl, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Paid",
            data: paid,
            borderColor: "#b8834a",
            backgroundColor: grad,
            borderWidth: 2,
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointBackgroundColor: "#b8834a",
            pointBorderColor: "#131722",
            pointBorderWidth: 2,
          },
          {
            label: "Pending / Overdue",
            data: pending,
            borderColor: "#f5a623",
            backgroundColor: "rgba(245,166,35,0)",
            borderWidth: 2,
            borderDash: [5, 4],
            fill: false,
            tension: 0.35,
            pointRadius: 4,
            pointBackgroundColor: "#f5a623",
            pointBorderColor: "#131722",
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
              padding: 14,
            },
          },
          tooltip: {
            backgroundColor: "#1a2030",
            borderColor: "rgba(255,255,255,.12)",
            borderWidth: 1,
            titleColor: "#edf0f8",
            bodyColor: "#edf0f8",
            padding: 10,
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: tickOpts },
          y: {
            beginAtZero: true,
            grid: gridOpts,
            ticks: {
              ...tickOpts,
              callback: (v) => (v >= 1000 ? v / 1000 + "k" : v),
            },
          },
        },
      },
    });
  }

  const maintEl = document.getElementById("tenant-chart-maint");
  if (maintEl) {
    const labels = ["Open", "In Progress", "Resolved", "Closed"];
    const values = [
      maintByStatus.Open || 0,
      maintByStatus["In Progress"] || 0,
      maintByStatus.Resolved || 0,
      maintByStatus.Closed || 0,
    ];
    const total = values.reduce((a, b) => a + b, 0);

    if (total > 0) {
      chartInstances.tenantMaintChart = new Chart(maintEl, {
        type: "pie",
        data: {
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: ["#f5a623", "#4a9ef5", "#3ecf8e", "#7a83a0"],
              borderColor: "#131722",
              borderWidth: 3,
              hoverOffset: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                boxWidth: 10,
                boxHeight: 10,
                usePointStyle: true,
                padding: 12,
              },
            },
            tooltip: {
              backgroundColor: "#1a2030",
              borderColor: "rgba(255,255,255,.12)",
              borderWidth: 1,
              titleColor: "#edf0f8",
              bodyColor: "#edf0f8",
              padding: 10,
            },
          },
        },
      });
    } else {
      maintEl.parentElement.innerHTML = `<div class="chart-empty">No maintenance requests yet — you're all clear.</div>`;
    }
  }
}

function renderOverview(data) {
  document.getElementById("overviewLoading").style.display = "none";
  const c = document.getElementById("overviewContent");
  c.style.display = "block";

  const s = data.stats;

  if (s.totalProperties === 0 && s.totalUnits === 0) {
    c.innerHTML = `
      <div class="empty">
        <div class="empty-ico">◎</div>
        <div class="empty-title">Welcome to Meridian Properties, ${esc(data.user.firstName)}.</div>
        <div class="empty-desc">Your property management workspace is ready. Start by adding your first property — you can add units and tenants after that.</div>
        <button class="btn btn-primary" onclick="openPropertyModal()">+ Add Your First Property</button>
      </div>
      <div class="quick-grid">
        <div class="quick-card" onclick="openPropertyModal()"><div class="quick-num">1</div><h4>Add your first property</h4><p>Register a building or apartment complex to your portfolio.</p></div>
        <div class="quick-card" onclick="openUnitModal()"><div class="quick-num">2</div><h4>Add rental units</h4><p>Create the individual units inside your properties.</p></div>
        <div class="quick-card" onclick="openTenantModal()"><div class="quick-num">3</div><h4>Add tenants</h4><p>Assign tenants to units and start tracking rent.</p></div>
        <div class="quick-card" onclick="switchView('settings')"><div class="quick-num">4</div><h4>Configure your agency</h4><p>Set your contact details so tenants can reach you.</p></div>
      </div>`;
    return;
  }

  c.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-lbl">Total Properties</div><div class="stat-val">${s.totalProperties}</div><div class="stat-sub">Across your portfolio</div></div>
      <div class="stat-card"><div class="stat-lbl">Total Units</div><div class="stat-val">${s.totalUnits}</div><div class="stat-sub">${s.occupiedUnits} occupied · ${s.vacantUnits} vacant</div></div>
      <div class="stat-card"><div class="stat-lbl">Occupied Units</div><div class="stat-val">${s.occupiedUnits}</div><div class="stat-sub">${s.vacantUnits} vacant units</div></div>
      <div class="stat-card"><div class="stat-lbl">Occupancy Rate</div><div class="stat-val">${s.occupancyRate}%</div><div class="stat-sub">Of your total units</div></div>
      <div class="stat-card"><div class="stat-lbl">Monthly Revenue</div><div class="stat-val money">${fmtMoney(s.monthlyRevenue)}</div><div class="stat-sub">Recorded this month</div></div>
      <div class="stat-card"><div class="stat-lbl">Pending Rent</div><div class="stat-val money">${fmtMoney(s.pendingRent)}</div><div class="stat-sub">Pending + overdue</div></div>
      <div class="stat-card"><div class="stat-lbl">Open Maintenance</div><div class="stat-val">${s.maintenanceRequests}</div><div class="stat-sub">Needs your attention</div></div>
    </div>

    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-head"><div><div class="chart-title">Revenue &amp; Pending Rent — Last 6 Months</div><div class="chart-sub">Paid vs outstanding, in KES</div></div></div>
        <div class="chart-body"><canvas id="chart-revenue"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-head"><div><div class="chart-title">Unit Status</div><div class="chart-sub">Across all properties</div></div></div>
        <div class="chart-body chart-sm"><canvas id="chart-occupancy"></canvas></div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-head"><div><div class="chart-title">Portfolio Performance</div><div class="chart-sub">Occupied vs vacant units per property</div></div></div>
        <div class="chart-body"><canvas id="chart-properties"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-head"><div><div class="chart-title">Payment Status</div><div class="chart-sub">Counts of payment records</div></div></div>
        <div class="chart-body chart-sm"><canvas id="chart-payments"></canvas></div>
      </div>
    </div>

    <div class="panel" style="margin-bottom:24px">
      <div class="panel-head"><div class="panel-title">Quick Actions</div></div>
      <div class="panel-body">
        <div class="quick-grid" style="margin-top:0">
          <div class="quick-card" onclick="openPropertyModal()"><div class="quick-num">+</div><h4>Add a property</h4><p>Expand your portfolio.</p></div>
          <div class="quick-card" onclick="openUnitModal()"><div class="quick-num">+</div><h4>Add a unit</h4><p>Grow your unit count.</p></div>
          <div class="quick-card" onclick="openTenantModal()"><div class="quick-num">+</div><h4>Add a tenant</h4><p>Onboard a new resident.</p></div>
          <div class="quick-card" onclick="openPaymentModal()"><div class="quick-num">+</div><h4>Record a payment</h4><p>Log rent received.</p></div>
        </div>
      </div>
    </div>`;

  renderOverviewCharts(data);
}

function renderOverviewCharts(data) {
  if (typeof Chart === "undefined") return;
  const charts = data.charts || {};
  const s = data.stats;

  Chart.defaults.color = "#7a83a0";
  Chart.defaults.borderColor = "rgba(255,255,255,.07)";
  Chart.defaults.font.family = "Outfit, sans-serif";
  Chart.defaults.font.size = 11;

  const gridOpts = { color: "rgba(255,255,255,.05)" };
  const tickOpts = { color: "#7a83a0" };

  Object.values(chartInstances).forEach((ch) => {
    try {
      ch.destroy();
    } catch {}
  });
  chartInstances = {};

  const revEl = document.getElementById("chart-revenue");
  if (revEl && charts.revenueByMonth) {
    const labels = charts.revenueByMonth.map((m) => m.label);
    const paid = charts.revenueByMonth.map((m) => m.paid);
    const pend = charts.revenueByMonth.map((m) => m.pending);
    const ctx = revEl.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 240);
    grad.addColorStop(0, "rgba(184,131,74,.35)");
    grad.addColorStop(1, "rgba(184,131,74,0)");

    chartInstances.revenue = new Chart(revEl, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Paid",
            data: paid,
            borderColor: "#b8834a",
            backgroundColor: grad,
            borderWidth: 2,
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointBackgroundColor: "#b8834a",
            pointBorderColor: "#131722",
            pointBorderWidth: 2,
          },
          {
            label: "Pending / Overdue",
            data: pend,
            borderColor: "#f5a623",
            backgroundColor: "rgba(245,166,35,0)",
            borderWidth: 2,
            borderDash: [5, 4],
            fill: false,
            tension: 0.35,
            pointRadius: 4,
            pointBackgroundColor: "#f5a623",
            pointBorderColor: "#131722",
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
              padding: 14,
            },
          },
          tooltip: {
            backgroundColor: "#1a2030",
            borderColor: "rgba(255,255,255,.12)",
            borderWidth: 1,
            titleColor: "#edf0f8",
            bodyColor: "#edf0f8",
            padding: 10,
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: tickOpts },
          y: {
            beginAtZero: true,
            grid: gridOpts,
            ticks: {
              ...tickOpts,
              callback: (v) => (v >= 1000 ? v / 1000 + "k" : v),
            },
          },
        },
      },
    });
  }

  const occEl = document.getElementById("chart-occupancy");
  if (occEl) {
    const unitList = Array.isArray(state.units) ? state.units : [];
    const norm = (v) =>
      String(v ?? "")
        .trim()
        .toLowerCase();

    const computed = { occupied: 0, vacant: 0, reserved: 0, maintenance: 0 };
    unitList.forEach((u) => {
      const st = norm(u.status);
      if (st === "occupied") computed.occupied++;
      else if (st === "vacant") computed.vacant++;
      else if (st === "reserved") computed.reserved++;
      else if (st === "maintenance") computed.maintenance++;
    });

    const occ = Math.max(Number(s.occupiedUnits || 0), computed.occupied);
    const vac = Math.max(Number(s.vacantUnits || 0), computed.vacant);
    const res = Math.max(Number(s.reservedUnits || 0), computed.reserved);
    const maint = Math.max(Number(s.maintUnits || 0), computed.maintenance);

    if (occ + vac + res + maint > 0) {
      chartInstances.occupancy = new Chart(occEl, {
        type: "doughnut",
        data: {
          labels: ["Occupied", "Vacant", "Reserved", "Maintenance"],
          datasets: [
            {
              data: [occ, vac, res, maint],
              backgroundColor: ["#3ecf8e", "#f5a623", "#4a9ef5", "#f06060"],
              borderColor: "#131722",
              borderWidth: 3,
              hoverOffset: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "68%",
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                boxWidth: 10,
                boxHeight: 10,
                usePointStyle: true,
                padding: 12,
              },
            },
            tooltip: {
              backgroundColor: "#1a2030",
              borderColor: "rgba(255,255,255,.12)",
              borderWidth: 1,
              titleColor: "#edf0f8",
              bodyColor: "#edf0f8",
              padding: 10,
            },
          },
        },
      });
    } else {
      occEl.parentElement.innerHTML = `<div class="chart-empty">No units yet — add units to see this chart.</div>`;
    }
  }

  const propEl = document.getElementById("chart-properties");
  if (propEl && charts.propertyBreakdown) {
    const rows = charts.propertyBreakdown.filter((p) => p.units > 0);
    if (rows.length) {
      chartInstances.properties = new Chart(propEl, {
        type: "bar",
        data: {
          labels: rows.map((p) => p.name),
          datasets: [
            {
              label: "Occupied",
              data: rows.map((p) => p.occupied),
              backgroundColor: "#3ecf8e",
              borderRadius: 6,
              maxBarThickness: 40,
            },
            {
              label: "Vacant",
              data: rows.map((p) => p.vacant),
              backgroundColor: "#f5a623",
              borderRadius: 6,
              maxBarThickness: 40,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                boxWidth: 10,
                boxHeight: 10,
                usePointStyle: true,
                padding: 14,
              },
            },
            tooltip: {
              backgroundColor: "#1a2030",
              borderColor: "rgba(255,255,255,.12)",
              borderWidth: 1,
              titleColor: "#edf0f8",
              bodyColor: "#edf0f8",
              padding: 10,
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: tickOpts },
            y: {
              beginAtZero: true,
              grid: gridOpts,
              ticks: { ...tickOpts, precision: 0 },
            },
          },
        },
      });
    } else {
      propEl.parentElement.innerHTML = `<div class="chart-empty">Add units to your properties to see portfolio performance.</div>`;
    }
  }

  const payEl = document.getElementById("chart-payments");
  if (payEl && charts.paymentStatus) {
    const ps = charts.paymentStatus;
    const hasData = ps.Paid + ps.Pending + ps.Overdue + ps.Failed > 0;
    if (hasData) {
      chartInstances.payments = new Chart(payEl, {
        type: "doughnut",
        data: {
          labels: ["Paid", "Pending", "Overdue", "Failed"],
          datasets: [
            {
              data: [ps.Paid, ps.Pending, ps.Overdue, ps.Failed],
              backgroundColor: ["#3ecf8e", "#f5a623", "#f06060", "#7a83a0"],
              borderColor: "#131722",
              borderWidth: 3,
              hoverOffset: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "68%",
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                boxWidth: 10,
                boxHeight: 10,
                usePointStyle: true,
                padding: 12,
              },
            },
            tooltip: {
              backgroundColor: "#1a2030",
              borderColor: "rgba(255,255,255,.12)",
              borderWidth: 1,
              titleColor: "#edf0f8",
              bodyColor: "#edf0f8",
              padding: 10,
            },
          },
        },
      });
    } else {
      payEl.parentElement.innerHTML = `<div class="chart-empty">No payment records yet — record a payment to see this chart.</div>`;
    }
  }
}
