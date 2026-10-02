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

let chartInstances = {};