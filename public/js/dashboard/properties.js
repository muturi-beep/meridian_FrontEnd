// public/js/dashboard/properties.js
// Properties view — list, add/edit modal (with inline unit rows), delete.

async function loadProperties() {
  const el = document.getElementById("propertiesList");
  el.innerHTML = `<div class="empty" style="border-style:solid"><div class="empty-desc">Loading your properties…</div></div>`;
  try {
    const list = await api("/api/properties");
    state.properties = list;
    state.propsLoaded = true;
    document.getElementById("badgeProps").textContent = list.length;
    renderPropertiesList();
  } catch (err) {
    el.innerHTML = `<div class="empty"><div class="empty-ico">⚠</div><div class="empty-title">Couldn't load properties</div><div class="empty-desc">${esc(err.message)}</div><button class="btn btn-primary" onclick="loadProperties()">Retry</button></div>`;
  }
}

let propsSearchTerm = "";

function renderPropertiesList() {
  const el = document.getElementById("propertiesList");
  const all = state.properties || [];
  const term = propsSearchTerm.trim().toLowerCase();
  const list = term ? all.filter((p) => matchesProperty(p, term)) : all;

  if (!all.length) {
    el.innerHTML = emptyState({
      icon: "building",
      title: "No properties yet",
      desc: "Add your first property to get started. You can create units for it in the same step.",
      actionLabel: "+ Add Property",
      actionHandler: "openPropertyModal()",
    });
  }

  if (!list.length) {
    el.innerHTML = emptyState({
      icon: "search",
      title: "No matches",
      desc: `No properties match "${propsSearchTerm}".`,
    });
  }

  el.innerHTML = `<div class="prop-grid">${list
    .map(
      (p) => `
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
        <div><div class="prop-stat-lbl">Expected Rent</div><div class="prop-stat-val money">${fmtMoney(p.expectedRent)}</div></div>
      </div>
      <div class="prop-actions">
        <button class="btn btn-outline btn-sm" onclick='openPropertyModal(${JSON.stringify(p).replace(/'/g, "&#39;")})'>Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProperty('${p._id}')">Delete</button>
      </div>
    </div>`,
    )
    .join("")}</div>`;
}

function matchesProperty(p, term) {
  return [
    p.name,
    p.location,
    p.address,
    p.type,
    p.contactName,
    p.contactPhone,
    p.status,
  ].some((v) =>
    String(v || "")
      .toLowerCase()
      .includes(term),
  );
}

// Wire the search input once.
document.getElementById("searchProps")?.addEventListener("input", (e) => {
  propsSearchTerm = e.target.value;
  renderPropertiesList();
});

function renderUnitRows() {
  const box = document.getElementById("unitRows");
  if (!box) return;
  if (!unitRows.length) {
    box.innerHTML = `<div class="units-empty">No units added yet. Use <strong>Quick add</strong> above, or click <strong>+ Add unit</strong> to add rows manually.</div>`;
    return;
  }
  box.innerHTML = unitRows
    .map(
      (u, i) => `
    <div class="unit-row">
      <input type="text"   placeholder="Unit #"    value="${esc(u.name || "")}"   oninput="updateUnitRow(${i},'name',this.value)"/>
      <input type="text"   placeholder="Floor"     value="${esc(u.floor || "")}"  oninput="updateUnitRow(${i},'floor',this.value)"/>
      <input type="number" placeholder="Rent KES"  value="${u.price ?? ""}"     oninput="updateUnitRow(${i},'price',this.value)"/>
      <select onchange="updateUnitRow(${i},'status',this.value)">
        ${["Vacant", "Occupied", "Reserved", "Maintenance"].map((s) => `<option ${u.status === s ? "selected" : ""}>${s}</option>`).join("")}
      </select>
      <button type="button" class="unit-remove" title="Remove" onclick="removeUnitRow(${i})">×</button>
    </div>
  `,
    )
    .join("");
}

function updateUnitRow(i, key, val) {
  if (!unitRows[i]) return;
  unitRows[i][key] = key === "price" ? Number(val || 0) : val;
}
function addUnitRow() {
  unitRows.push({ name: "", floor: "", price: "", status: "Vacant" });
  renderUnitRows();
  const rows = document.querySelectorAll("#unitRows .unit-row");
  rows[rows.length - 1]?.querySelector("input")?.focus();
}
function removeUnitRow(i) {
  unitRows.splice(i, 1);
  renderUnitRows();
}

function quickAddUnits() {
  const prefix = document.getElementById("qkPrefix").value.trim();
  const start = parseInt(document.getElementById("qkStart").value, 10) || 1;
  const count = parseInt(document.getElementById("qkCount").value, 10) || 0;
  const floor = document.getElementById("qkFloor").value.trim();
  const rent = Number(document.getElementById("qkRent").value) || 0;

  if (!prefix) return toast('Enter a unit prefix (e.g. "A").', "error");
  if (count < 1) return toast("Count must be at least 1.", "error");
  if (count > 200) return toast("Max 200 units per quick-add.", "error");

  for (let i = 0; i < count; i++) {
    unitRows.push({
      name: `${prefix}-${start + i}`,
      floor: floor || "",
      price: rent,
      status: "Vacant",
    });
  }
  renderUnitRows();
  toast(`${count} unit row(s) added.`, "success");
}

function openPropertyModal(p = null) {
  const isEdit = !!p;
  document.getElementById("modalTitle").textContent = isEdit
    ? "Edit Property"
    : "Add Property";
  unitRows = [];

  document.getElementById("modalBody").innerHTML = `
    <div class="form-section">
      <div class="form-section-title">Property Details</div>
      <div class="field"><label>Property Name *</label><input type="text" name="name" required value="${esc(p?.name || "")}" placeholder="e.g. Meridian Heights"/></div>
      <div class="frow">
        <div class="field"><label>Type</label>
          <select name="type">${["Apartment", "House", "Commercial", "Mixed-Use", "Villa", "Townhouse"].map((t) => `<option ${p?.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Status</label>
          <select name="status"><option ${p?.status === "Active" ? "selected" : ""}>Active</option><option ${p?.status === "Inactive" ? "selected" : ""}>Inactive</option></select>
        </div>
      </div>
      <div class="frow">
        <div class="field"><label>Location</label><input type="text" name="location" placeholder="e.g. Westlands, Nairobi" value="${esc(p?.location || "")}"/></div>
        <div class="field"><label>Address</label><input type="text" name="address" value="${esc(p?.address || "")}"/></div>
      </div>
      <div class="frow">
        <div class="field"><label>Contact Name</label><input type="text" name="contactName" value="${esc(p?.contactName || "")}"/></div>
        <div class="field"><label>Contact Phone</label><input type="tel" name="contactPhone" value="${esc(p?.contactPhone || "")}"/></div>
      </div>
      <div class="field"><label>Description</label><textarea name="description">${esc(p?.description || "")}</textarea></div>
    </div>

    <div class="form-section">
      <div class="form-section-title">
        <span>Apartments / Units in this property</span>
        <span class="form-hint">${isEdit ? "Existing units stay as they are; rows added here will be appended." : "Optional — you can also add these later from the Units section."}</span>
      </div>
      <div class="quick-add">
        <input id="qkPrefix" placeholder="Prefix (A)"/>
        <input id="qkStart" type="number" min="1" value="101" placeholder="Start #"/>
        <input id="qkCount" type="number" min="1" value="10"  placeholder="Count"/>
        <input id="qkFloor" placeholder="Floor"/>
        <input id="qkRent"  type="number" min="0" placeholder="Rent (KES)"/>
        <button type="button" class="btn btn-outline btn-sm" onclick="quickAddUnits()">Quick add</button>
      </div>
      <div id="unitRows" class="unit-rows"></div>
      <button type="button" class="btn btn-outline btn-sm" style="margin-top:10px" onclick="addUnitRow()">+ Add unit</button>
    </div>
  `;
  renderUnitRows();

  modalHandler = async () => {
    const form = document.getElementById("modalForm");
    const payload = {
      name: form.querySelector('[name="name"]').value.trim(),
      type: form.querySelector('[name="type"]').value,
      status: form.querySelector('[name="status"]').value,
      location: form.querySelector('[name="location"]').value.trim(),
      address: form.querySelector('[name="address"]').value.trim(),
      contactName: form.querySelector('[name="contactName"]').value.trim(),
      contactPhone: form.querySelector('[name="contactPhone"]').value.trim(),
      description: form.querySelector('[name="description"]').value.trim(),
    };
    if (!payload.name) throw new Error("Property name is required.");

    const cleanUnits = unitRows
      .filter((u) => u.name && u.name.trim())
      .map((u) => ({
        name: u.name.trim(),
        floor: u.floor || "",
        price: Number(u.price) || 0,
        status: u.status || "Vacant",
      }));

    if (isEdit) {
      await api(`/api/properties/${p._id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (cleanUnits.length) {
        await api(`/api/properties/${p._id}/units`, {
          method: "POST",
          body: JSON.stringify({ units: cleanUnits }),
        });
      }
      toast(
        `Property updated${cleanUnits.length ? ` · ${cleanUnits.length} unit(s) added` : ""}.`,
        "success",
      );
    } else {
      payload.units = cleanUnits;
      await api("/api/properties", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast(
        `Property added${cleanUnits.length ? ` with ${cleanUnits.length} unit(s)` : ""}.`,
        "success",
      );
    }

    closeModal();
    state.propsLoaded = false;
    state.unitsLoaded = false;
    loadProperties();
    loadDashboard();
    api("/products")
      .then(
        (l) => (document.getElementById("badgeUnits").textContent = l.length),
      )
      .catch(() => {});
  };

  document.getElementById("modal").classList.add("open");
}

async function deleteProperty(id) {
  if (
    !confirm("Delete this property? Units assigned to it will also be deleted.")
  )
    return;
  try {
    const res = await api(`/api/properties/${id}`, { method: "DELETE" });
    toast(res.message || "Property deleted.", "success");
    state.propsLoaded = false;
    state.unitsLoaded = false;
    loadProperties();
    loadDashboard();
    api("/products")
      .then(
        (l) => (document.getElementById("badgeUnits").textContent = l.length),
      )
      .catch(() => {});
  } catch (err) {
    toast(err.message, "error");
  }
}
