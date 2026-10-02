// public/js/config.js
// Detect dev vs prod, expose API base URL globally.

const isLocalDev =
  location.protocol === 'file:' ||
  location.hostname === 'localhost' ||
  location.hostname === '127.0.0.1' ||
  location.hostname === '' ||
  location.hostname.startsWith('192.168.') ||
  location.hostname.startsWith('10.');

const API = isLocalDev ? 'http://localhost:3000' : '';

console.log('[dashboard] API base =', API || '(same-origin)');