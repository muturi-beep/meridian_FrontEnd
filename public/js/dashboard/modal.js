// public/js/dashboard/modal.js
// Generic modal open/close + form submission wrapper.
// Every view calls openXModal() which sets modalHandler, then this file runs it.

function closeModal() {
  document.getElementById("modal").classList.remove("open");
  document.getElementById("modalForm").reset();
  modalHandler = null;
  unitRows = [];
}

async function submitModal(e) {
  e.preventDefault();
  if (!modalHandler) return;
  const btn = document.getElementById("modalSubmit");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Saving…";
  try {
    await modalHandler();
  } catch (err) {
    toast(err.message || "Something went wrong.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

document.getElementById("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});

// Esc closes whatever is open — modal, receipt, payment prompt, or mobile sidebar.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;

  const modal = document.getElementById("modal");
  if (modal && modal.classList.contains("open")) {
    closeModal();
    return;
  }

  const receipt = document.getElementById("receiptModal");
  if (receipt && receipt.classList.contains("open")) {
    closeReceiptModal();
    return;
  }

  const payment = document.getElementById("paymentModal");
  if (payment && payment.classList.contains("open")) {
    payment.classList.remove("open");
    return;
  }

  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");
  if (sidebar && sidebar.classList.contains("open")) {
    sidebar.classList.remove("open");
    overlay?.classList.remove("open");
  }
});
