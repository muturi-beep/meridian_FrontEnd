// public/js/dashboard/modal.js
// Generic modal open/close + form submission wrapper.
// Every view calls openXModal() which sets modalHandler, then this file runs it.

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.getElementById('modalForm').reset();
  modalHandler = null;
  unitRows = [];
}

async function submitModal(e) {
  e.preventDefault();
  if (!modalHandler) return;
  const btn = document.getElementById('modalSubmit');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Saving…';
  try {
    await modalHandler();
  } catch (err) {
    toast(err.message || 'Something went wrong.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

document.getElementById('modal').addEventListener('click', e => {
  if (e.target.id === 'modal') closeModal();
});