// public/js/ledger.js
// Tenant ledger engine — computes balances from payments.
// Pure functions: no DOM, no fetch, no globals.

const DEPOSIT_MONTHS = 1; // fallback when a tenant has no explicit deposit

function normPayType(t) {
  return String(t || 'Rent').trim().toLowerCase();
}

function buildTenantLedger(tenant, allPayments) {
  const monthlyRent = Number(tenant.rent) || 0;
  const depositRequired =
    Number(tenant.deposit) > 0 ? Number(tenant.deposit) : monthlyRent * DEPOSIT_MONTHS;

  /* ---- 1. Match this tenant's payment records -------------------------- */
  const tName = `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim().toLowerCase();
  const matched = (allPayments || []).filter(p => {
    if (p.tenantId != null && String(p.tenantId) === String(tenant._id)) return true;
    if (p.tenantId == null && p.tenant && String(p.tenant).trim().toLowerCase() === tName) return true;
    return false;
  });

  /* ---- 2. Only "paid" records move the ledger, oldest first ------------ */
  const paidPayments = matched
    .map((p, i) => ({ p, i }))
    .filter(x => String(x.p.status || '').toLowerCase() === 'paid')
    .sort((a, b) => {
      const da = new Date(a.p.date || 0).getTime() || 0;
      const db = new Date(b.p.date || 0).getTime() || 0;
      return (da - db) || (a.i - b.i);
    })
    .map(x => x.p);

  /* ---- 3. When does the account start? --------------------------------- */
  const anchors = [tenant.moveInDate, tenant.startDate, paidPayments[0]?.date]
    .map(d => new Date(d))
    .filter(d => !isNaN(d));
  const anchor = anchors.length
    ? new Date(Math.min(...anchors.map(d => d.getTime())))
    : new Date();

  const startMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const now = new Date();
  const endMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  /* ---- 4. Obligations -------------------------------------------------- */
  const obligations = [];
  if (depositRequired > 0) {
    obligations.push({
      id: 'deposit', type: 'Deposit', label: 'Security Deposit',
      amount: depositRequired, date: new Date(startMonth), paid: 0,
    });
  }
  let cursor = new Date(startMonth);
  let guard = 0;
  while (cursor <= endMonth && guard++ < 240) {
    obligations.push({
      id: `rent-${cursor.getFullYear()}-${cursor.getMonth()}`,
      type: 'Rent',
      label: cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      amount: monthlyRent,
      date: new Date(cursor),
      paid: 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const rentObls   = obligations.filter(o => o.type === 'Rent');
  const depositObl = obligations.find(o => o.type === 'Deposit');

  const payInto = (o, amount) => {
    if (!o || amount <= 0) return 0;
    const room = Math.max(0, o.amount - o.paid);
    const applied = Math.min(room, amount);
    o.paid += applied;
    return applied;
  };

  /* ---- 5. Allocate every payment --------------------------------------- */
  const runningBalances = new Map();
  let totalPaidTracked = 0;
  let totalCredit = 0;

  for (const p of paidPayments) {
    const amt   = Number(p.amount) || 0;
    const pDate = new Date(p.date || new Date());
    const pType = normPayType(p.type);

    const dueObls   = obligations.filter(o => new Date(o.date) <= pDate);
    const dueUpTo   = dueObls.reduce((s, o) => s + o.amount, 0);
    const paidBefore = dueObls.reduce((s, o) => s + Math.min(o.paid, o.amount), 0);
    const balanceBefore = Math.max(0, dueUpTo - paidBefore);

    let remaining = amt;
    const allocations = [];

    const runRent = () => {
      for (const o of rentObls) {
        if (remaining <= 0) break;
        const applied = payInto(o, remaining);
        if (applied > 0) {
          remaining -= applied;
          allocations.push({ label: o.label + ' rent', amount: applied, type: 'Rent', period: o.label });
        }
      }
    };
    const runDeposit = () => {
      if (remaining <= 0 || !depositObl) return;
      const applied = payInto(depositObl, remaining);
      if (applied > 0) {
        remaining -= applied;
        allocations.push({ label: depositObl.label, amount: applied, type: 'Deposit' });
      }
    };

    if (pType === 'deposit') { runDeposit(); runRent(); }
    else                     { runRent();    runDeposit(); }

    const credit = remaining;
    totalCredit += credit;
    totalPaidTracked += amt;

    const paidAfter    = dueObls.reduce((s, o) => s + Math.min(o.paid, o.amount), 0);
    const balanceAfter = Math.max(0, dueUpTo - paidAfter);

    runningBalances.set(String(p._id), {
      amount: amt, dueUpTo, balanceBefore, balanceAfter,
      allocations, credit,
      type: p.type || 'Rent', date: p.date, reference: p.reference,
    });
  }

  /* ---- 6. Totals — derived from the obligations themselves ------------- */
  const totalDue       = obligations.reduce((s, o) => s + o.amount, 0);
  const totalAllocated = obligations.reduce((s, o) => s + Math.min(o.paid, o.amount), 0);
  const balance        = Math.max(0, totalDue - totalAllocated);

  const depositPaid = depositObl ? Math.min(depositObl.paid, depositObl.amount) : 0;
  const rentDue     = rentObls.reduce((s, o) => s + o.amount, 0);
  const rentPaid    = rentObls.reduce((s, o) => s + Math.min(o.paid, o.amount), 0);

  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const arrears = rentObls
    .filter(o => new Date(o.date) < currentMonthStart)
    .reduce((s, o) => s + Math.max(0, o.amount - o.paid), 0);

  const cm = rentObls.find(
    o => o.date.getMonth() === now.getMonth() && o.date.getFullYear() === now.getFullYear()
  );

  return {
    tenant, monthlyRent, depositRequired, obligations,
    payments: paidPayments,
    totalDue,
    totalPaid: totalPaidTracked,
    balance,
    credit: totalCredit,
    depositDue: depositRequired,
    depositPaid,
    depositBalance: Math.max(0, depositRequired - depositPaid),
    rentDue, rentPaid,
    rentBalance: Math.max(0, rentDue - rentPaid),
    runningBalances, arrears,
    currentMonth: {
      due: cm?.amount || 0,
      paid: cm?.paid || 0,
      balance: cm ? Math.max(0, cm.amount - cm.paid) : 0,
      label: now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      fullyPaid: cm ? cm.paid >= cm.amount : true,
    },
  };
}

/* Non-mutating clone used by the payment-modal preview */
function simulateAllocation(ledger, amount, type) {
  const obligations = ledger.obligations.map(o => ({ ...o }));
  const amt = Number(amount) || 0;
  const t   = normPayType(type);

  const rentObls   = obligations.filter(o => o.type === 'Rent');
  const depositObl = obligations.find(o => o.type === 'Deposit');

  const payInto = (o, a) => {
    if (!o || a <= 0) return 0;
    const room = Math.max(0, o.amount - o.paid);
    const applied = Math.min(room, a);
    o.paid += applied;
    return applied;
  };

  let remaining = amt;
  const allocations = [];

  const runRent = () => {
    for (const o of rentObls) {
      if (remaining <= 0) break;
      const applied = payInto(o, remaining);
      if (applied > 0) {
        remaining -= applied;
        allocations.push({ label: o.label + ' rent', amount: applied, type: 'Rent', period: o.label });
      }
    }
  };
  const runDeposit = () => {
    if (remaining <= 0 || !depositObl) return;
    const applied = payInto(depositObl, remaining);
    if (applied > 0) {
      remaining -= applied;
      allocations.push({ label: depositObl.label, amount: applied, type: 'Deposit' });
    }
  };

  if (t === 'deposit') { runDeposit(); runRent(); }
  else                 { runRent();    runDeposit(); }

  const totalDue       = obligations.reduce((s, o) => s + o.amount, 0);
  const totalAllocated = obligations.reduce((s, o) => s + Math.min(o.paid, o.amount), 0);
  const newBalance     = Math.max(0, totalDue - totalAllocated);

  const depositPaid = depositObl ? Math.min(depositObl.paid, depositObl.amount) : 0;
  const rentDue     = rentObls.reduce((s, o) => s + o.amount, 0);
  const rentPaid    = rentObls.reduce((s, o) => s + Math.min(o.paid, o.amount), 0);

  return {
    allocations,
    newBalance,
    newDepositPaid: depositPaid,
    newRentPaid: rentPaid,
    newDepositBalance: Math.max(0, (depositObl?.amount || 0) - depositPaid),
    newRentBalance: Math.max(0, rentDue - rentPaid),
    credit: remaining,
  };
}