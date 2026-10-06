// public/js/dashboard/settings.js
// Settings view — organization profile (name, type, contact details).

async function loadOrgSettings() {
  try {
    const org = await api("/api/organization");
    document.getElementById("org-name").value = org.name || "";
    document.getElementById("org-type").value = org.type || "Property Manager";
    document.getElementById("org-email").value = org.email || "";
    document.getElementById("org-phone").value = org.phone || "";
    document.getElementById("org-location").value = org.location || "";
    document.getElementById("org-address").value = org.address || "";
    renderInviteCodePanel(org.inviteCode);
  } catch (err) {
    toast(err.message, "error");
  }
}

/**
 * Show the invite code panel only if the backend returned a code.
 * Non-management roles get `undefined` → panel stays hidden.
 */
function renderInviteCodePanel(code) {
  const panel = document.getElementById("org-invite-panel");
  const el = document.getElementById("org-invite-code");
  if (!panel || !el) return;

  if (!code) {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "";
  el.textContent = code;
}

/**
 * Copy the current invite code to the clipboard.
 * Falls back to a hidden textarea if the clipboard API is unavailable.
 */
async function copyInviteCode() {
  const el = document.getElementById("org-invite-code");
  if (!el) return;
  const code = el.textContent.trim();
  if (!code || code === "————-————") return;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(code);
    } else {
      // Fallback for older browsers / non-HTTPS contexts
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    toast("✅ Invite code copied to clipboard", "success");
  } catch (err) {
    toast("Could not copy — please select and copy manually.", "error");
  }
}

/**
 * Ask for confirmation, then regenerate the invite code via the backend.
 * Everyone with the old code loses access to join.
 */
async function regenerateInviteCode() {
  if (
    !confirm(
      "Regenerate the invite code?\n\nThe current code will stop working immediately. Anyone who has it will not be able to join until you share the new code.",
    )
  ) {
    return;
  }

  const btn = document.getElementById("org-invite-regen");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Working…";
  }

  try {
    const res = await api("/organizations/me", {
      method: "PUT",
      body: JSON.stringify({ regenerateInviteCode: true }),
    });
    renderInviteCodePanel(res.inviteCode);
    toast("✅ New invite code generated", "success");
  } catch (err) {
    toast(err.message || "Could not regenerate the code.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Regenerate";
    }
  }
}

// Wire the buttons once, when this script loads.
document
  .getElementById("org-invite-copy")
  ?.addEventListener("click", copyInviteCode);
document
  .getElementById("org-invite-regen")
  ?.addEventListener("click", regenerateInviteCode);

async function saveOrg(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById("org-name").value.trim(),
    type: document.getElementById("org-type").value,
    email: document.getElementById("org-email").value.trim(),
    phone: document.getElementById("org-phone").value.trim(),
    location: document.getElementById("org-location").value.trim(),
    address: document.getElementById("org-address").value.trim(),
  };
  try {
    const res = await api("/api/organization", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    toast(res.message || "Organization updated.", "success");
    setSession({ organizationName: res.organization.name });
    document.getElementById("sbOrgName").textContent = res.organization.name;
    document.getElementById("tbSub").textContent =
      `Here's what's happening at ${res.organization.name} today.`;
  } catch (err) {
    toast(err.message, "error");
  }
}
