// public/js/dashboard/state.js
// Shared mutable state for the dashboard. No DOM, no side effects.

const state = {
  dashboard: null,
  tenantSummary: null,
  propsLoaded: false, unitsLoaded: false, tenantsLoaded: false,
  maintLoaded: false, payLoaded: false,
  properties: [], units: [], tenants: [], maintenance: [], payments: [],
  tenantBalances: [],
  showAllBalances: false,
};

// Shared mutable globals for modals (used across all views)
let chartInstances = {};
let modalHandler = null;
let unitRows = [];