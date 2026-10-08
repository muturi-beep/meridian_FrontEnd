// public/js/dashboard/units.js
// Units view - grouped list, add/edit modal, delete.
// Grouping prefers propertyId (rename-proof); falls back to name for orphans.

async function loadUnits() {
  const el = document.getElementById("unitsList");
  el.innerHTML = `<div class="empty" style="border-style:solid"><div class="empty-desc">Loading units...</div></div>`;
  try {
    const [props, list] = await Promise.all([
      api("/api/properties"),
      api("/products"),
    ]);

    // Lookup: propertyId (string) -> Property
    const propById = new Map();
    props.forEach((p) => propById.set(String(p._id), p));

    // Enrich each unit with the resolved propertyName
    const enriched = list.map((u) => {
      const p = u.propertyId ? propById.get(String(u.propertyId)) : null;
      return {
        ...u,
        propertyName: p ? p.name : u.property || "",
      };
    });

    state.properties = props;
    state.propsLoaded = true;
    state.units = enriched;
    state.unitsLoaded = true;
    document.getElementById("badgeProps").textContent = props.length;
    document.getElementById("badgeUnits").textContent = list.length;
    renderUnitsList();
  } catch (err) {
    el.innerHTML = `<div class="empty"><div class="empty-ico"></div><div class="empty-title">Couldn't load units</div><div class="empty-desc">${esc(err.message)}</div><button class="btn btn-primary" onclick="loadUnits()">Retry</button></div>`;
  }
}

let unitsSearchTerm = "";

function renderUnitsList() {
  const el = document.getElementById("unitsList");
  const props = state.properties || [];
  const all = state.units || [];
  const term = unitsSearchTerm.trim().toLowerCase();
  const list = term ? all.filter((u) => matchesUnit(u, term)) : all;

  if (!all.length) {
    el.innerHTML = emptyState({
      icon: "door",
      title: "No units yet",
      desc: "Add units to a property. You can also create them in bulk when adding a property.",
      actionLabel: "+ Add Unit",
      actionHandler: "openUnitModal()",
    });
    return;
  }

  if (!list.length) {
    el.innerHTML = emptyState({
      icon: "search",
      title: "No matches",
      desc: `No units match "${unitsSearchTerm}".`,
    });
    return;
  }

  // Group by resolved propertyName
  const grouped = {};
  list.forEach((u) => {
    const key = u.propertyName || "__unassigned__";
    (grouped[key] = grouped[key] || []).push(u);
  });

  const sections = [];
  const knownNames = new Set(props.map((p) => p.name));

  // One section per registered property (in the order they came from the API)
  props.forEach((p) => {
    const unitsInProp = grouped[p.name];
    if (!unitsInProp || !unitsInProp.length) return;
    sections.push(
      renderUnitGroup({
        title: p.name,
        subtitle: `${p.location || "No location set"} - ${unitsInProp.length} unit${unitsInProp.length === 1 ? "" : "s"}`,
        units: unitsInProp,
        propertyId: p._id,
        propertyName: p.name,
      }),
    );
  });

  // Anything left over that doesn't match a real property = orphans
  const orphanUnits = list.filter(
    (u) => !u.propertyName || !knownNames.has(u.propertyName),
  );
  if (orphanUnits.length) {
    sections.push(
      renderUnitGroup({
        title: "Unassigned Units",
        subtitle: `Not linked to any registered property - ${orphanUnits.length} unit${orphanUnits.length === 1 ? "" : "s"} - click Fix to assign`,
        units: orphanUnits,
        propertyId: null,
        propertyName: null,
      }),
    );
  }

  el.innerHTML = sections.join("");
  el.querySelectorAll("[data-add-unit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pid = btn.getAttribute("data-add-unit");
      const p = props.find((x) => x._id === pid);
      openUnitModal(null, p?.name || null);
    });
  });
}

function matchesUnit(u, term) {
  return [u.name, u.propertyName, u.property, u.floor, u.tenant, u.status].some(
    (v) =>
      String(v || "")
        .toLowerCase()
        .includes(term),
  );
}

document.getElementById("searchUnits")?.addEventListener("input", (e) => {
  unitsSearchTerm = e.target.value;
  renderUnitsList();
});

function renderUnitGroup({ title, subtitle, units, propertyId, propertyName }) {
  const occupied = units.filter((u) => u.status === "Occupied").length;
  const vacant = units.filter((u) => u.status === "Vacant").length;
  const monthly = units.reduce((s, u) => s + (u.price || 0), 0);

  const addBtn = propertyId
    ? `<button class="btn btn-outline btn-sm" data-add-unit="${propertyId}">+ Add Unit to this property</button>`
    : "";

  const rows = units
    .map(
      (u) => `
    <tr>
      <td>${esc(u.name)}</td>
      <td>${esc(u.propertyName || u.property || "-")}</td>
      <td>${esc(u.floor || "-")}</td>
      <td>${fmtMoney(u.price)}</td>
      <td>${esc(u.tenant && u.tenant !== "-" ? u.tenant : "-")}</td>
      <td><span class="pill ${pillForStatus(u.status)}">${esc(u.status)}</span></td>
      <td class="actions">
        <button class="btn btn-outline btn-sm" onclick='openUnitModal(${JSON.stringify(u).replace(/'/g, "&#39;")})'>Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteUnit('${u._id}')">Delete</button>
      </td>
    </tr>`,
    )
    .join("");

  return `
    <div class="units-group">
      <div class="units-group-head">
        <div>
          <div class="units-group-title">${esc(title)}</div>
          <div class="units-group-sub">${esc(subtitle)} &middot; ${occupied} occupied &middot; ${vacant} vacant &middot; ${fmtMoney(monthly)}/month</div>
        </div>
        ${addBtn}
      </div>
      <div class="panel"><div class="table-wrap"><table>
        <thead><tr><th>Unit</th><th>Property</th><th>Floor</th><th>Rent</th><th>Tenant</th><th>Status</th><th class="actions">Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>
    </div>`;
}

async function openUnitModal(u = null, presetProperty = null) {
  document.getElementById("modalTitle").textContent = u
    ? "Edit Unit"
    : "Add Unit";

  if (!state.properties || !state.properties.length) {
    try {
      state.properties = await api("/api/properties");
      state.propsLoaded = true;
    } catch {}
  }
  if (!state.tenants || !state.tenants.length) {
    try {
      state.tenants = await api("/api/tenants");
      state.tenantsLoaded = true;
    } catch {
      state.tenants = [];
    }
  }

  const props = state.properties || [];
  const tenants = state.tenants || [];

  // Prefer propertyId for preselect; fall back to the string name for orphans
  let selectedPropertyId = "";
  if (
    u &&
    u.propertyId &&
    props.find((p) => String(p._id) === String(u.propertyId))
  ) {
    selectedPropertyId = String(u.propertyId);
  } else if (u && u.property) {
    const match = props.find((p) => p.name === u.property);
    if (match) selectedPropertyId = String(match._id);
  } else if (presetProperty) {
    const match = props.find((p) => p.name === presetProperty);
    if (match) selectedPropertyId = String(match._id);
  } else if (props[0]) {
    selectedPropertyId = String(props[0]._id);
  }

  document.getElementById("modalBody").innerHTML = `
    <div class="field"><label>Unit Name / Number *</label><input type="text" name="name" required value="${esc(u?.name || "")}" placeholder="e.g. A-101"/></div>
    <div class="frow">
      <div class="field"><label>Property</label>
        <select name="propertyId">
          <option value="">- Unassigned -</option>
          ${props.map((p) => `<option value="${p._id}" ${selectedPropertyId === String(p._id) ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Floor</label><input type="text" name="floor" value="${esc(u?.floor && u.floor !== "-" ? u.floor : "")}"/></div>
    </div>
    <div class="frow">
      <div class="field"><label>Monthly Rent (KES) *</label><input type="number" name="price" required min="0" value="${u?.price ?? ""}"/></div>
      <div class="field"><label>Status</label>
        <select name="status">${["Vacant", "Occupied", "Reserved", "Maintenance"].map((s) => `<option ${u?.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      </div>
    </div>
    <div class="field">
      <label>Assign Tenant</label>
      <select name="tenantId">
        <option value="">- Unassigned -</option>
        ${tenants
          .map((t) => {
            const label = `${esc(t.firstName)} ${esc(t.lastName)}${t.email ? ` - ${esc(t.email)}` : ""}`;
            return `<option value="${t._id}" ${String(u?.tenantId || "") === String(t._id) ? "selected" : ""}>${label}</option>`;
          })
          .join("")}
      </select>
      <div style="font-size:11px;color:var(--t2);margin-top:4px">Assigning a tenant will automatically mark this unit as <strong>Occupied</strong>.</div>
    </div>`;

  modalHandler = async () => {
    const form = document.getElementById("modalForm");
    const propId = form.querySelector('[name="propertyId"]').value;
    const propName = propId
      ? props.find((p) => String(p._id) === propId)?.name || ""
      : "";

    const payload = {
      name: form.querySelector('[name="name"]').value.trim(),
      property: propName,
      propertyId: propId || null,
      floor: form.querySelector('[name="floor"]').value.trim(),
      price: Number(form.querySelector('[name="price"]').value) || 0,
      status: form.querySelector('[name="status"]').value,
      tenantId: form.querySelector('[name="tenantId"]').value,
    };
    if (!payload.name) throw new Error("Unit name is required.");

    if (u)
      await api(`/products/${u._id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    else
      await api("/products", { method: "POST", body: JSON.stringify(payload) });
    toast(u ? "Unit updated." : "Unit added.", "success");

    closeModal();
    state.unitsLoaded = false;
    state.propsLoaded = false;
    state.tenantsLoaded = false;
    loadUnits();
    loadProperties();
    loadDashboard();
    api("/api/tenants")
      .then(
        (l) => (document.getElementById("badgeTenants").textContent = l.length),
      )
      .catch(() => {});
  };

  document.getElementById("modal").classList.add("open");
}

async function deleteUnit(id) {
  if (!confirm("Delete this unit?")) return;
  try {
    await api(`/products/${id}`, { method: "DELETE" });
    toast("Unit deleted.", "success");
    state.unitsLoaded = false;
    state.propsLoaded = false;
    loadUnits();
    loadProperties();
    loadDashboard();
  } catch (e) {
    toast(e.message, "error");
  }
}
