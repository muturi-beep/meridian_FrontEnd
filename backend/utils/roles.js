// backend/utils/roles.js
// Role permission lists — shared across all routes.

const MANAGEMENT    = ['agency-director', 'property-manager'];
const FINANCE_VIEW  = ['agency-director', 'property-manager', 'finance-officer', 'auditor'];
const FINANCE_WRITE = ['agency-director', 'property-manager', 'finance-officer'];
const MAINT_WRITE   = ['agency-director', 'property-manager', 'maintenance-staff'];
const UNIT_WRITE    = ['agency-director', 'property-manager', 'leasing-agent'];

module.exports = { MANAGEMENT, FINANCE_VIEW, FINANCE_WRITE, MAINT_WRITE, UNIT_WRITE };