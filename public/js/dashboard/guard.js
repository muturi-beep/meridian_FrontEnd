// public/js/dashboard/guard.js
// Session guard + tenant-specific DOM tweaks. Must run after DOM exists.

const SESSION = getSession();
if (!SESSION) {
  sessionStorage.setItem(
    "mp_flash",
    "Your session has expired. Please sign in again.",
  );
  window.location.replace("auth.html");
}

window.addEventListener("pageshow", (e) => {
  if (e.persisted && !getSession()) {
    window.location.replace("auth.html");
  }
});

const IS_TENANT = SESSION && SESSION.role === "tenant";
const CAN_MANAGE_MAINT =
  SESSION &&
  ["agency-director", "property-manager", "maintenance-staff"].includes(
    SESSION.role,
  );

if (IS_TENANT) {
  const ALLOWED = ["overview", "maintenance", "payments", "documents"];
  document.querySelectorAll(".sb-link[data-view]").forEach((l) => {
    if (!ALLOWED.includes(l.dataset.view)) l.style.display = "none";
  });
  document
    .querySelector('.dd-item[data-view="settings"]')
    ?.setAttribute("style", "display:none");

  document
    .querySelector('.sb-link[data-view="properties"]')
    ?.classList.remove("active");
  document
    .querySelector('.sb-link[data-view="overview"]')
    ?.classList.add("active");
  document.getElementById("view-properties")?.classList.remove("active");
  document.getElementById("view-overview")?.classList.add("active");

  const maintDesc = document.querySelector("#view-maintenance .section-desc");
  if (maintDesc)
    maintDesc.textContent =
      "Report issues with your unit. Your property manager will be notified.";

  const maintBtn = document.querySelector(
    "#view-maintenance .section-head .btn",
  );
  if (maintBtn) maintBtn.textContent = "+ Report an Issue";

  const payDesc = document.querySelector("#view-payments .section-desc");
  if (payDesc)
    payDesc.textContent = "Your rent history and current payment status.";

  // Hide the "+ Record Payment" button — tenants must not record payments.
  const payBtn = document.getElementById("addPaymentBtn");
  if (payBtn) payBtn.style.display = "none";

  const docsDesc = document.querySelector("#view-documents .section-desc");
  if (docsDesc) docsDesc.textContent = "Download receipts for your payments.";
}
