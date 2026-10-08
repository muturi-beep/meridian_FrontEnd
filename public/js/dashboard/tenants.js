// public/js/dashboard/tenants.js
// Tenants view - grouped list, add-tenant modal per property.

async function loadTenants() {
  const el = document.getElementById("tenantsList");
  el.innerHTML = `<div class="empty" style="border-style:solid"><div class="empty-desc">Loading tenants...</div></div>`;
  try {
    const [props, tenants] = await Promise.all([
      api("/api/properties"),
      api("/api/tenants"),
    ]);
    state.properties = props;
    state.propsLoaded = true;
    state.tenants = tenants;
    state.tenantsLoaded = true;
    document.getElementById("badgeProps").textContent = props.length;
    document.getElementById("badgeTenants").textContent = tenants.length;
    renderTenantsList();
  } catch (err) {
    el.innerHTML = `<div class="empty"><div class="empty-ico"></div><div class="empty-title">Couldn't load tenants</div><div class="empty-desc">${esc(err.message)}</div><button class="btn btn-primary" onclick="loadTenants()">Retry</button></div>`;
  }
}

let tenantsSearchTerm = "";

function renderTenantsList() {
  const el = document.getElementById("tenantsList");
  const props = state.properties || [];
  const all = state.tenants || [];
  const term = tenantsSearchTerm.trim().toLowerCase();
  const list = term ? all.filter((t) => matchesTenant(t, term)) : all;

  if (!props.length) {
    el.innerHTML = emptyState({
      icon: "building",
      title: "Add a property first",
      desc: "You need at least one property (with units) before you can onboard tenants.",
      actionLabel: "+ Add Property",
      actionHandler: "switchView('properties'); openPropertyModal();",
    });
  }

  const byProp = {};
  list.forEach((t) => {
    const key = t.property || "__unassigned__";
    (byProp[key] = byProp[key] || []).push(t);
  });

  const propCards = props
    .map((p) => {
      const list = byProp[p.name] || [];
      // When searching, hide properties with zero matches
      if (term && !list.length) return "";
      return `
      <div class="prop-card">
        <div class="prop-head">
          <div class="prop-name">${esc(p.name)}</div>
          <span class="pill ${pillForStatus(p.status)}">${esc(p.status)}</span>
        </div>
        <div class="prop-loc">${esc(p.location || "No location set")}</div>
        <div class="prop-stats">
          <div><div class="prop-stat-lbl">Units</div><div class="prop-stat-val">${p.unitCount}</div></div>
          <div><div class="prop-stat-lbl">Occupied</div><div class="prop-stat-val">${p.occupiedUnits}</div></div>
          <div><div class="prop-stat-lbl">Vacant</div><div class="prop-stat-val">${p.vacantUnits}</div></div>
          <div><div class="prop-stat-lbl">Tenants</div><div class="prop-stat-val">${list.length}</div></div>
        </div>
        <div class="prop-actions">
          <button class="btn btn-primary btn-sm" onclick="openTenantModalForProperty('${p._id}')">+ Add Tenant</button>
        </div>
        ${!p.unitCount ? `<div style="margin-top:10px;font-size:11.5px;color:var(--amber)"> This property has no units yet - add units first to assign tenants.</div>` : ""}
      </div>`;
    })
    .join("");

  const unassigned = byProp["__unassigned__"] || [];
  const unassignedBlock = unassigned.length
    ? `
    <div class="panel" style="margin-top:24px">
      <div class="panel-head"><div class="panel-title">Tenants Without a Property (${unassigned.length})</div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Tenant</th><th>Phone</th><th>Email</th></tr></thead>
        <tbody>${unassigned.map((t) => `<tr><td>${esc(t.firstName + " " + t.lastName)}</td><td>${esc(t.phone || "-")}</td><td>${esc(t.email || "-")}</td></tr>`).join("")}</tbody>
      </table></div>
    </div>`
    : "";

  const allBlock = list.length
    ? `
    <div class="panel" style="margin-top:24px">
      <div class="panel-head"><div class="panel-title">All Tenants (${list.length})</div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Tenant</th><th>Property</th><th>Unit</th><th>Phone</th><th>Email</th><th>Rent</th><th class="actions">Actions</th></tr></thead>
        <tbody>${list
          .map(
            (t) => `
          <tr>
            <td>${esc(t.firstName + " " + t.lastName)}</td>
            <td>${esc(t.property || "-")}</td>
            <td>${esc(t.unitName || "-")}</td>
            <td>${esc(t.phone || "-")}</td>
            <td>${esc(t.email || "-")}</td>
            <td>${t.rent ? fmtMoney(t.rent) : "-"}</td>
            <td class="actions">
              <button class="btn btn-outline btn-sm" onclick='openEditTenantModal(${JSON.stringify(t).replace(/'/g, "&#39;")})'>Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteTenant('${t._id}')">Delete</button>
            </td>
          </tr>`,
          )
          .join("")}</tbody>
      </table></div>
    </div>`
    : "";

  const noMatches = term && !list.length;
  if (noMatches) {
    el.innerHTML = emptyState({
      icon: "search",
      title: "No matches",
      desc: `No tenants match "${tenantsSearchTerm}".`,
    });
  }

  el.innerHTML = `<div class="prop-grid">${propCards}</div>${unassignedBlock}${allBlock}`;
}

function matchesTenant(t, term) {
  return [
    t.firstName,
    t.lastName,
    `${t.firstName || ""} ${t.lastName || ""}`,
    t.email,
    t.phone,
    t.property,
    t.unitName,
  ].some((v) =>
    String(v || "")
      .toLowerCase()
      .includes(term),
  );
}

document.getElementById("searchTenants")?.addEventListener("input", (e) => {
  tenantsSearchTerm = e.target.value;
  renderTenantsList();
});

async function openTenantModalForProperty(propertyId) {
  const property = (state.properties || []).find((p) => p._id === propertyId);
  if (!property) return toast("Property not found.", "error");

  document.getElementById("modalTitle").textContent =
    `Add Tenant - ${property.name}`;
  document.getElementById("modalBody").innerHTML =
    `<div class="empty-desc" style="padding:20px;text-align:center">Loading units...</div>`;
  document.getElementById("modal").classList.add("open");

  let unitsInProperty = [];
  try {
    unitsInProperty = await api(`/api/properties/${propertyId}/units`);
  } catch (err) {
    toast(err.message, "error");
    closeModal();
    return;
  }

  const vacantUnits = unitsInProperty.filter(
    (u) => u.status === "Vacant" && !u.tenantId,
  );

  document.getElementById("modalBody").innerHTML = `
    <div class="form-section">
      <div class="form-section-title">
        <span>Property</span>
        <span class="form-hint">${unitsInProperty.length} unit(s) &middot; ${vacantUnits.length} vacant</span>
      </div>
      <div style="background:var(--ink-3);border:1px solid var(--border);border-radius:var(--rs);padding:12px 14px">
        <div style="font-family:var(--font-serif);font-size:17px;font-weight:700;color:var(--white)">${esc(property.name)}</div>
        <div style="font-size:12px;color:var(--t2);margin-top:2px">${esc(property.location || "No location set")}</div>
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
          <input type="number" name="deposit" min="0" placeholder="Defaults to half of rent"/>
        </div>
      </div>
      <div class="field">
        <label>Temporary Password * (min 8 chars - tenant can change later)</label>
        <input type="text" name="password" required minlength="8" value="Welcome${Math.floor(1000 + Math.random() * 9000)}"/>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">
        <span>Assign a Unit</span>
        <span class="form-hint">
          ${vacantUnits.length ? "Only vacant units are shown" : unitsInProperty.length ? "All units are occupied" : "No units in this property yet"}
        </span>
      </div>
      ${
        vacantUnits.length
          ? `
        <div class="field">
          <label>Unit *</label>
          <select name="unitId" required>
            <option value="">- Select a unit -</option>
            ${vacantUnits.map((u) => `<option value="${u._id}">${esc(u.name)}${u.floor && u.floor !== "-" ? ` &middot; Floor ${esc(u.floor)}` : ""} &middot; ${fmtMoney(u.price)}</option>`).join("")}
          </select>
        </div>
      `
          : `
        <div class="units-empty">
          ${
            unitsInProperty.length
              ? 'All units in this property are currently occupied. Add more units from the Properties section, or create this tenant without assigning a unit (they will appear under "Tenants Without a Property").'
              : "This property has no units yet. Add units from the Properties section to assign this tenant, or create them without a unit for now."
          }
        </div>
      `
      }
    </div>`;

  modalHandler = async () => {
    const form = document.getElementById("modalForm");
    const payload = {
      firstName: form.querySelector('[name="firstName"]').value.trim(),
      lastName: form.querySelector('[name="lastName"]').value.trim(),
      email: form.querySelector('[name="email"]').value.trim(),
      phone: form.querySelector('[name="phone"]').value.trim(),
      password: form.querySelector('[name="password"]').value,
      propertyId: property._id,
      rent: Number(form.querySelector('[name="rent"]')?.value) || undefined,
      deposit:
        Number(form.querySelector('[name="deposit"]')?.value) || undefined,
    };
    if (
      !payload.firstName ||
      !payload.lastName ||
      !payload.email ||
      !payload.password
    ) {
      throw new Error("Please fill in all required fields.");
    }
    const unitSelect = form.querySelector('[name="unitId"]');
    if (unitSelect && unitSelect.value) payload.unitId = unitSelect.value;

    const res = await api("/api/tenants", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    toast(res.message || "Tenant added.", "success");
    closeModal();

    state.tenantsLoaded = false;
    state.unitsLoaded = false;
    state.propsLoaded = false;
    loadTenants();
    loadProperties();
    loadDashboard();
    api("/products")
      .then(
        (l) => (document.getElementById("badgeUnits").textContent = l.length),
      )
      .catch(() => {});
  };
}

function openTenantModal() {
  if (!state.properties || !state.properties.length) {
    toast("Add a property first, then you can add tenants.", "error");
    switchView("properties");
    return;
  }
  openTenantModalForProperty(state.properties[0]._id);
}

// 
// EDIT TENANT MODAL
// 
async function openEditTenantModal(tenant) {
  document.getElementById("modalTitle").textContent =
    `Edit Tenant - ${tenant.firstName} ${tenant.lastName}`;

  // Ensure we have units in state to pick from
  if (!state.units || !state.units.length) {
    try {
      state.units = await api("/products");
      state.unitsLoaded = true;
    } catch {}
  }
  const units = state.units || [];

  // Find the tenant's currently assigned unit id
  const currentUnit = units.find(
    (u) => String(u.tenantId) === String(tenant._id),
  );
  const currentUnitId = currentUnit ? String(currentUnit._id) : "";

  document.getElementById("modalBody").innerHTML = `
    <div class="form-section">
      <div class="form-section-title">Tenant Details</div>
      <div class="frow">
        <div class="field"><label>First Name *</label><input type="text" name="firstName" required value="${esc(tenant.firstName || "")}"/></div>
        <div class="field"><label>Last Name *</label><input type="text" name="lastName" required value="${esc(tenant.lastName || "")}"/></div>
      </div>
      <div class="frow">
        <div class="field"><label>Email *</label><input type="email" name="email" required value="${esc(tenant.email || "")}"/></div>
        <div class="field"><label>Phone</label><input type="tel" name="phone" value="${esc(tenant.phone || "")}"/></div>
      </div>
      <div class="frow">
        <div class="field"><label>Monthly Rent (KES)</label><input type="number" name="rent" min="0" value="${tenant.rent || ""}"/></div>
        <div class="field"><label>Security Deposit (KES)</label><input type="number" name="deposit" min="0" value="${tenant.deposit || ""}" placeholder="Defaults to half of rent"/></div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">
        <span>Assigned Unit</span>
        <span class="form-hint">Changing this frees the old unit and assigns the new one</span>
      </div>
      <div class="field">
        <label>Unit</label>
        <select name="unitId">
          <option value="">- Unassigned -</option>
          ${units
            .map((u) => {
              const isCurrent = String(u._id) === currentUnitId;
              const occupied = u.tenantId && !isCurrent;
              const label = `${esc(u.name)}${u.property ? " - " + esc(u.property) : ""}${u.floor && u.floor !== "-" ? " (Floor " + esc(u.floor) + ")" : ""}${occupied ? " [OCCUPIED]" : ""}`;
              const disabled = occupied ? " disabled" : "";
              const selected = isCurrent ? " selected" : "";
              return `<option value="${u._id}"${selected}${disabled}>${label}</option>`;
            })
            .join("")}
        </select>
      </div>
    </div>`;

  modalHandler = async () => {
    const form = document.getElementById("modalForm");
    const payload = {
      firstName: form.querySelector('[name="firstName"]').value.trim(),
      lastName: form.querySelector('[name="lastName"]').value.trim(),
      email: form.querySelector('[name="email"]').value.trim(),
      phone: form.querySelector('[name="phone"]').value.trim(),
      rent: Number(form.querySelector('[name="rent"]').value) || undefined,
      deposit:
        Number(form.querySelector('[name="deposit"]').value) || undefined,
      unitId: form.querySelector('[name="unitId"]').value || null,
    };
    if (!payload.firstName || !payload.lastName || !payload.email) {
      throw new Error("First name, last name and email are required.");
    }

    await api(`/api/tenants/${tenant._id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    toast("Tenant updated.", "success");
    closeModal();

    state.tenantsLoaded = false;
    state.unitsLoaded = false;
    state.payLoaded = false;
    loadTenants();
    loadDashboard();
    if (getActiveView() === "payments") loadPayments();
  };

  document.getElementById("modal").classList.add("open");
}

// 
// DELETE TENANT
// 
async function deleteTenant(id) {
  if (
    !confirm(
      "Delete this tenant?\n\nTheir unit will be freed and marked Vacant. This cannot be undone.",
    )
  )
    return;

  try {
    const res = await api(`/api/tenants/${id}`, { method: "DELETE" });
    toast(res.message || "Tenant deleted.", "success");

    state.tenantsLoaded = false;
    state.unitsLoaded = false;
    state.payLoaded = false;
    loadTenants();
    loadDashboard();
    if (getActiveView() === "payments") loadPayments();
  } catch (err) {
    toast(err.message, "error");
  }
}
