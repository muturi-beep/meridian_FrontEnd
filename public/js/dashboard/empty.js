// public/js/dashboard/empty.js
// Reusable empty-state renderer + inline SVG icon set.
// Usage: el.innerHTML = emptyState({ icon: 'building', title: '...', desc: '...', actionLabel: '...', actionHandler: 'openPropertyModal()' });

const EMPTY_ICONS = {
  building: `<svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01"/></svg>`,
  door: `<svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M15 12h.01"/></svg>`,
  person: `<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  wrench: `<svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  dollar: `<svg viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  file: `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  search: `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`,
  inbox: `<svg viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
};

/**
 * Returns HTML string for a polished empty state.
 * @param {Object} opts
 * @param {string} opts.icon        - key from EMPTY_ICONS (default: 'inbox')
 * @param {string} opts.title       - main heading
 * @param {string} opts.desc        - helper text
 * @param {string} [opts.actionLabel]   - button label (optional)
 * @param {string} [opts.actionHandler] - button onclick string (optional)
 */
function emptyState({
  icon = "inbox",
  title,
  desc,
  actionLabel,
  actionHandler,
}) {
  const svg = EMPTY_ICONS[icon] || EMPTY_ICONS.inbox;
  const action =
    actionLabel && actionHandler
      ? `<button class="btn btn-primary" onclick="${actionHandler}">${actionLabel}</button>`
      : "";
  return `
    <div class="empty empty-v2">
      <div class="empty-icon-v2">${svg}</div>
      <div class="empty-title-v2">${esc(title)}</div>
      <div class="empty-desc-v2">${esc(desc)}</div>
      ${action}
    </div>`;
}
