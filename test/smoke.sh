#!/bin/bash
# DebtPayoff AI smoke tests — file presence, syntax, core logic sanity.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL: $1"; }

# 1-7. expected files exist
for f in index.html css/style.css js/debt.js js/app.js data/sample.json README.md test/e2e.sh; do
  [ -f "$f" ] && ok "file exists: $f" || bad "missing file: $f"
done

# 8-9. JS syntax valid
for f in js/debt.js js/app.js; do
  node --check "$f" 2>/dev/null && ok "syntax ok: $f" || bad "syntax error: $f"
done

# 10+. logic checks via node
node << 'NODEEOF'
const D = require('/home/hatch/workspace/debtpayoff-ai/js/debt.js');
let pass = 0, fail = 0;
const ok  = (n) => { pass++; console.log('PASS: ' + n); };
const bad = (n) => { fail++; console.log('FAIL: ' + n); };

// exact one-month math: $1000 @ 12% APR, $100 min -> interest $10, balance $910
const one = D.simulate([{ name: 'T', balance: 1000, apr: 12, min: 100 }], 'avalanche', 0, new Date(2026, 0, 1));
Math.abs(one.schedule[1].balance - 910) < 0.01
  ? ok('month-1 math exact: $910.00 remaining') : bad('month-1 math wrong: ' + one.schedule[1].balance);
one.months > 1 && !one.stalled ? ok('single debt pays off, not stalled') : bad('single debt broken');

// avalanche vs snowball target different debts first
const debts = [
  { id: 'a', name: 'A', balance: 2000, apr: 10, min: 50 },
  { id: 'b', name: 'B', balance: 5000, apr: 24, min: 100 },
];
const av = D.simulate(debts, 'avalanche', 200, new Date(2026, 0, 1));
const sn = D.simulate(debts, 'snowball', 200, new Date(2026, 0, 1));
const avB = av.perDebt.find(d => d.id === 'b').payoffMonth;
const avA = av.perDebt.find(d => d.id === 'a').payoffMonth;
avB < avA ? ok('avalanche kills highest-APR debt first') : bad('avalanche order wrong');
const snA = sn.perDebt.find(d => d.id === 'a').payoffMonth;
const snB = sn.perDebt.find(d => d.id === 'b').payoffMonth;
snA < snB ? ok('snowball kills smallest balance first') : bad('snowball order wrong');
av.totalInterest <= sn.totalInterest
  ? ok('avalanche interest <= snowball interest (' + D.money(av.totalInterest) + ' vs ' + D.money(sn.totalInterest) + ')')
  : bad('avalanche should be cheapest');

// stalled detection: minimums below interest
const stalled = D.simulate([{ name: 'X', balance: 10000, apr: 24, min: 50 }], 'avalanche', 0, new Date(2026, 0, 1));
stalled.stalled ? ok('stalled detected when minimums < interest') : bad('stall not detected');

// rollover: extra + freed minimums accelerate payoff
const slow = D.simulate(debts, 'avalanche', 0, new Date(2026, 0, 1));
const fast = D.simulate(debts, 'avalanche', 200, new Date(2026, 0, 1));
fast.months < slow.months ? ok('extra payment shortens payoff (' + fast.months + ' < ' + slow.months + ' mo)') : bad('extra payment had no effect');

// helpers
D.money(1234.5) === '$1,234.50' ? ok('money() formats') : bad('money() broken: ' + D.money(1234.5));
const pd = D.addMonths(new Date(2026, 0, 15), 3);
(pd.getFullYear() === 2026 && pd.getMonth() === 3) ? ok('addMonths() works') : bad('addMonths() broken');
const cmp = D.compare(debts, 200, new Date(2026, 0, 1));
['avalanche', 'snowball'].includes(cmp.winner) ? ok('compare() picks a winner: ' + cmp.winner) : bad('compare() winner broken');
cmp.interestSavedVsMinimums >= 0 ? ok('savings vs minimums computed: ' + D.money(cmp.interestSavedVsMinimums)) : bad('savings negative');

// --- new features ---
// monthly rows: payment/interest/balance per month, sums reconcile
const mPay = av.monthly.reduce((s, m) => s + m.payment, 0);
const mInt = av.monthly.reduce((s, m) => s + m.interest, 0);
(Math.abs(mPay - av.totalPaid) < 1 && Math.abs(mInt - av.totalInterest) < 1 && av.monthly.length === av.months + 1)
  ? ok('monthly rows: ' + av.monthly.length + ' rows, sums reconcile with totals') : bad('monthly rows broken');
av.monthly.every(m => m.date instanceof Date && typeof m.payment === 'number' && typeof m.interest === 'number')
  ? ok('monthly rows carry date/payment/interest') : bad('monthly row shape');

// extraForTargetDate: reachable target, errors, whole-dollar rounding
const tgt = D.extraForTargetDate(debts, '2027-06-01', new Date(2026, 0, 1));
(tgt.ok && tgt.extraMonthly > 0 && Number.isInteger(tgt.extraMonthly))
  ? ok('extraForTargetDate: ' + D.money(tgt.extraMonthly) + '/mo to be free by Jun 2027') : bad('extraForTargetDate: ' + JSON.stringify(tgt));
const vfy = D.simulate(debts, tgt.strategy, tgt.extraMonthly, new Date(2026, 0, 1));
(!vfy.stalled && vfy.payoffDate <= D.parseISODate('2027-06-01'))
  ? ok('extraForTargetDate verifies: simulation hits the target') : bad('target verification failed');
(!D.extraForTargetDate(debts, '2025-01-01', new Date(2026, 0, 1)).ok && !D.extraForTargetDate(debts, 'junk', new Date(2026, 0, 1)).ok)
  ? ok('extraForTargetDate rejects past and malformed dates') : bad('extraForTargetDate error paths');

// scheduleToCSV: header + row count + final balance ~0
const scsv = D.scheduleToCSV(av);
const slines = scsv.split('\r\n');
(slines[0] === 'Month,Date,Payment,Interest,Principal,Balance' && slines.length === av.months + 2)
  ? ok('scheduleToCSV: header + ' + (slines.length - 1) + ' rows') : bad('scheduleToCSV: ' + slines.length + ' lines');

// --- second sweep: refinance what-if, minimum warnings, debt CSV import ---
// minShortfalls: min < monthly interest flagged, sorted desc, healthy ignored
const ms = D.minShortfalls([
  { id: 'x', name: 'Bad card', balance: 10000, apr: 24, min: 50 },
  { id: 'y', name: 'Worse card', balance: 5000, apr: 36, min: 10 },
  { id: 'z', name: 'Fine loan', balance: 2000, apr: 6, min: 200 }
]);
(ms.length === 2 && ms[0].id === 'x' && ms[0].shortfall === 150 && ms[1].id === 'y')
  ? ok('minShortfalls: 2 flagged, sorted by shortfall desc, healthy ignored') : bad('minShortfalls: ' + JSON.stringify(ms));
(D.minShortfalls([]).length === 0) ? ok('minShortfalls: empty -> []') : bad('minShortfalls empty');

// debtsFromCSV: header mapping, quoting, bad rows reported
const csvIn = 'name,balance,apr,min\nVisa,1200.50,24.99,35\n"Store, Card",800,19.99,25\nBad row,0,5,5\n,500,5,5';
const imp = D.debtsFromCSV(csvIn);
(imp.debts.length === 2 && imp.errors.length === 2 && imp.debts[0].name === 'Visa' &&
 imp.debts[0].balance === 1200.5 && imp.debts[1].name === 'Store, Card')
  ? ok('debtsFromCSV: 2 parsed (quoting ok), 2 bad rows reported') : bad('debtsFromCSV: ' + JSON.stringify(imp));
(D.debtsFromCSV('').errors.length === 1 && D.debtsFromCSV('foo,bar\n1,2').debts.length === 0)
  ? ok('debtsFromCSV: empty + headerless rejected') : bad('debtsFromCSV edge cases');

// refinanceImpact: cheaper APR saves interest; higher APR / unknown debt rejected
const rdebts = [
  { id: 'c1', name: 'Card', balance: 8000, apr: 24, min: 200 },
  { id: 'l1', name: 'Loan', balance: 4000, apr: 8, min: 150 }
];
const refi = D.refinanceImpact(rdebts, 300, 'c1', 12, new Date(2026, 0, 1));
(refi.ok && refi.interestSaved > 0 && refi.monthsSaved >= 0 && refi.newApr === 12 && refi.oldApr === 24 && refi.debt === 'Card')
  ? ok('refinanceImpact: 24%->12% saves ' + D.money(refi.interestSaved) + ', ' + refi.monthsSaved + ' mo') : bad('refinanceImpact: ' + JSON.stringify({ ok: refi.ok, saved: refi.interestSaved }));
(!D.refinanceImpact(rdebts, 300, 'c1', 29, new Date(2026, 0, 1)).ok && !D.refinanceImpact(rdebts, 300, 'nope', 5, new Date(2026, 0, 1)).ok)
  ? ok('refinanceImpact: higher APR + unknown debt rejected') : bad('refinanceImpact error paths');

// monthsToDeadline: payment-month counting (Mar 15 from Oct 13 = 5 payments)
(D.monthsToDeadline('2027-03-15', new Date(2026, 9, 13)) === 5)
  ? ok('monthsToDeadline: Oct 13 -> Mar 15 = 5 payment months') : bad('monthsToDeadline: ' + D.monthsToDeadline('2027-03-15', new Date(2026, 9, 13)));
(D.monthsToDeadline('2026-11-05', new Date(2026, 9, 20)) === 0)
  ? ok('monthsToDeadline: deadline day before start day -> 0 (clear now)') : bad('monthsToDeadline day edge');
(D.monthsToDeadline('not-a-date', new Date(2026, 9, 13)) === 0)
  ? ok('monthsToDeadline: invalid -> 0') : bad('monthsToDeadline invalid');

// deadlinePayment: amortizing math ($2400 at 0% over 5 months = $480)
(D.deadlinePayment(2400, 0, '2027-03-15', new Date(2026, 9, 13), 1) === 480)
  ? ok('deadlinePayment: $2400 at 0% / 5 mo = $480') : bad('deadlinePayment: ' + D.deadlinePayment(2400, 0, '2027-03-15', new Date(2026, 9, 13), 1));
(Math.abs(D.deadlinePayment(1000, 12, '2027-03-15', new Date(2026, 9, 13), 1) - 206.04) < 0.05)
  ? ok('deadlinePayment: $1000 at 12% / 5 mo ~ $206.04') : bad('deadlinePayment APR math');
(D.deadlinePayment(1000, 12, '', new Date(2026, 9, 13), 1) === 0)
  ? ok('deadlinePayment: no deadline -> 0') : bad('deadlinePayment empty');

// simulate honors a per-debt deadline: promo cleared by month 5
const dlDebts = [
  { id: 'a', name: 'Promo', balance: 2400, apr: 0, min: 50, deadline: '2027-03-15' },
  { id: 'b', name: 'Card', balance: 3000, apr: 24, min: 75 }
];
const dlSim = D.simulate(dlDebts, 'avalanche', 200, new Date(2026, 9, 13));
const dlPromo = dlSim.perDebt.find(function (d) { return d.id === 'a'; });
(dlPromo && dlPromo.payoffMonth <= 5 && !dlSim.stalled)
  ? ok('simulate: deadline debt cleared in month ' + dlPromo.payoffMonth + ' (deadline month 5)') : bad('deadline not honored: ' + JSON.stringify(dlPromo));
// deadline top-up is extra spending, not taken from the attack pool
const noDl = D.simulate(dlDebts.map(function (d) { var c = {}; for (var k in d) c[k] = d[k]; c.deadline = ''; return c; }), 'avalanche', 200, new Date(2026, 9, 13));
(dlSim.monthly[1].payment > noDl.monthly[1].payment)
  ? ok('simulate: deadline month-1 payment ' + D.money(dlSim.monthly[1].payment) + ' > no-deadline ' + D.money(noDl.monthly[1].payment)) : bad('deadline top-up missing');
// cloneDebts carries valid deadlines, drops invalid ones
const cl = D.cloneDebts([{ name: 'X', balance: 1, deadline: '2027-01-01' }, { name: 'Y', balance: 1, deadline: 'junk' }]);
(cl[0].deadline === '2027-01-01' && cl[1].deadline === '')
  ? ok('cloneDebts: keeps valid deadline, drops invalid') : bad('cloneDebts deadline');

// firstMonthPlan: concrete month-one payments with deadline + attack target
const bmp = D.firstMonthPlan(dlDebts, 'avalanche', 200, new Date(2026, 9, 13));
const bPromo = bmp.rows.find(function (r) { return r.id === 'a'; });
const bCard = bmp.rows.find(function (r) { return r.id === 'b'; });
(bmp.target && bmp.target.id === 'b' && bPromo.payment === 480 && bPromo.deadlineTop === 430 &&
  bCard.isTarget && bCard.payment === 275 && Math.abs(bmp.total - 755) < 0.01)
  ? ok('firstMonthPlan: promo $480 (min $50 + $430 deadline), card $275 attack, total $755') : bad('firstMonthPlan: ' + JSON.stringify(bmp.rows));

console.log('---');
console.log('NODE PASS: ' + pass + '  FAIL: ' + fail);
process.exit(fail ? 1 : 0);
NODEEOF
[ $? -eq 0 ] && ok "node logic checks green" || bad "node logic checks had failures"

# new UI hooks in index.html
for id in targetDate targetCalc targetResult scheduleTable schedCsv printPlan refiDebt refiApr refiCalc refiResult debtCsv debtCsvMsg minWarn battlePlan; do
  grep -q "id=\"$id\"" index.html && ok "index.html has #$id" || bad "index.html missing #$id"
done
# deadline + battle-plan + chart hooks in app.js/css
for hook in eDeadline deadline-badge renderBattlePlan firstMonthPlan chart-milestone chart-area chart-grid; do
  grep -q "$hook" js/app.js css/style.css index.html && ok "deadline/chart hook present: $hook" || bad "missing hook: $hook"
done
[ -f REDESIGN-AUDIT.md ] && ok "REDESIGN-AUDIT.md present" || bad "REDESIGN-AUDIT.md missing"

echo "---"
echo "SMOKE PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" -eq 0 ]
