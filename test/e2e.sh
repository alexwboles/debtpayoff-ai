#!/bin/bash
# DebtPayoff AI e2e tests — full payoff flows on the sample debts.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
node << 'NODEEOF'
const D = require('/home/hatch/workspace/debtpayoff-ai/js/debt.js');
const fs = require('fs');
let pass = 0, fail = 0;
const ok  = (n) => { pass++; console.log('PASS: ' + n); };
const bad = (n) => { fail++; console.log('FAIL: ' + n); };

const debts = JSON.parse(fs.readFileSync('/home/hatch/workspace/debtpayoff-ai/data/sample.json', 'utf8'));
const start = new Date(2026, 8, 28); // fixed "today" for determinism

// Flow 1: sample data loads 4 debts
debts.length === 4 ? ok('flow1: sample.json has 4 debts') : bad('flow1: ' + debts.length + ' debts');

// Flow 2: avalanche pays everything off, schedule reconciles
const av = D.simulate(debts, 'avalanche', 150, start);
!av.stalled && av.months > 0 ? ok('flow2: avalanche pays off in ' + av.months + ' months') : bad('flow2: avalanche stalled/broken');
const last = av.schedule[av.schedule.length - 1];
last.month === av.months && last.balance < 0.01
  ? ok('flow2: schedule ends at month ' + last.month + ' with ~$0 balance')
  : bad('flow2: schedule does not reconcile');
av.schedule[0].balance > av.schedule[av.schedule.length - 1].balance
  ? ok('flow2: balance strictly decreases overall (' + D.money(av.schedule[0].balance) + ' -> $0)')
  : bad('flow2: balance did not decrease');

// Flow 3: snowball also completes; every debt gets a payoff month
const sn = D.simulate(debts, 'snowball', 150, start);
!sn.stalled ? ok('flow3: snowball completes in ' + sn.months + ' months') : bad('flow3: snowball stalled');
sn.perDebt.every(d => d.payoffMonth !== null && d.payoffMonth <= sn.months)
  ? ok('flow3: all 4 debts have payoff months within the plan')
  : bad('flow3: missing payoff months');

// Flow 4: avalanche is cheapest on the sample data
av.totalInterest <= sn.totalInterest
  ? ok('flow4: avalanche cheapest (' + D.money(av.totalInterest) + ' vs ' + D.money(sn.totalInterest) + ')')
  : bad('flow4: avalanche not cheapest');

// Flow 5: extra-payment slider matters — $0 vs $150 vs $500
const zero = D.simulate(debts, 'avalanche', 0, start);
const big = D.simulate(debts, 'avalanche', 500, start);
(zero.months > av.months && av.months > big.months)
  ? ok('flow5: more extra = fewer months (' + zero.months + ' > ' + av.months + ' > ' + big.months + ')')
  : bad('flow5: extra payment scaling broken');
(zero.totalInterest > av.totalInterest && av.totalInterest > big.totalInterest)
  ? ok('flow5: more extra = less interest (' + D.money(zero.totalInterest) + ' > ' + D.money(av.totalInterest) + ' > ' + D.money(big.totalInterest) + ')')
  : bad('flow5: interest scaling broken');

// Flow 6: compare() bundle is coherent
const cmp = D.compare(debts, 150, start);
cmp.winner === 'avalanche' ? ok('flow6: compare() winner = avalanche on sample data') : bad('flow6: unexpected winner ' + cmp.winner);
cmp.interestSavedVsMinimums > 0 && cmp.monthsSavedVsMinimums > 0
  ? ok('flow6: $150/mo saves ' + D.money(cmp.interestSavedVsMinimums) + ' and ' + cmp.monthsSavedVsMinimums + ' months vs minimums-only')
  : bad('flow6: savings vs minimums not positive');
cmp.baseline.months >= cmp.avalanche.months
  ? ok('flow6: minimums-only baseline is the slowest path')
  : bad('flow6: baseline incoherent');

// Flow 7: payoff date lands the right number of months out
const expectDate = D.addMonths(start, av.months);
expectDate.getFullYear() === av.payoffDate.getFullYear() && expectDate.getMonth() === av.payoffDate.getMonth()
  ? ok('flow7: debt-free date = ' + D.fmtDate(av.payoffDate))
  : bad('flow7: payoff date mismatch');

// Flow 8: monthly rows reconcile with the headline numbers
const mSum = av.monthly.reduce((s, m) => s + m.payment, 0);
const iSum = av.monthly.reduce((s, m) => s + m.interest, 0);
const mLast = av.monthly[av.monthly.length - 1];
(Math.abs(mSum - av.totalPaid) < 1 && Math.abs(iSum - av.totalInterest) < 1)
  ? ok('flow8: monthly payments sum to ' + D.money(mSum) + ' ≈ totalPaid; interest sums to ' + D.money(iSum))
  : bad('flow8: monthly sums off (paid ' + mSum + ' vs ' + av.totalPaid + ')');
(mLast.month === av.months && mLast.balance < 0.01 && av.monthly[1].interest > 0 && av.monthly[1].payment > av.monthly[1].interest)
  ? ok('flow8: monthly rows carry date/payment/interest/balance; final row ~$0') : bad('flow8: monthly row shape wrong');
const decreasing = av.monthly.every((m, i) => i === 0 || m.balance <= av.monthly[i - 1].balance + 0.01);
decreasing ? ok('flow8: balance never rises month-to-month on a paying plan') : bad('flow8: balance rose mid-plan');

// Flow 9: target-date reverse calculator
const early = D.addMonths(start, Math.max(2, Math.floor(av.months / 2)));
const earlyISO = early.getFullYear() + '-' + String(early.getMonth() + 1).padStart(2, '0') + '-' + String(early.getDate()).padStart(2, '0');
const r = D.extraForTargetDate(debts, earlyISO, start);
(r.ok && r.extraMonthly > 150 && Number.isInteger(r.extraMonthly))
  ? ok('flow9: beating ' + D.fmtDate(av.payoffDate) + ' by ~half needs ' + D.money(r.extraMonthly) + '/mo extra (whole dollars)')
  : bad('flow9: reverse calc failed: ' + JSON.stringify(r).slice(0, 100));
const verify = D.simulate(debts, r.strategy, r.extraMonthly, start);
(!verify.stalled && verify.payoffDate <= D.parseISODate(earlyISO))
  ? ok('flow9: paying ' + D.money(r.extraMonthly) + '/mo extra really hits the target (' + D.fmtDate(verify.payoffDate) + ')')
  : bad('flow9: verification simulation missed the target');
const past = D.extraForTargetDate(debts, '2020-01-01', start);
const junk = D.extraForTargetDate(debts, 'not-a-date', start);
const none = D.extraForTargetDate([], earlyISO, start);
(!past.ok && !junk.ok && !none.ok)
  ? ok('flow9: past date, bad date, and no debts all return errors') : bad('flow9: error paths broken');
const easy = D.extraForTargetDate(debts, '2035-01-01', start);
(easy.ok && easy.extraMonthly === 0)
  ? ok('flow9: far-future target needs $0 extra (minimums already get there)') : bad('flow9: easy target: ' + JSON.stringify(easy));

// Flow 10: schedule CSV export round-trips the winning plan
const csv = D.scheduleToCSV(av);
const csvRows = csv.split('\r\n');
(csvRows[0] === 'Month,Date,Payment,Interest,Principal,Balance' && csvRows.length === av.months + 2)
  ? ok('flow10: CSV header + ' + (csvRows.length - 1) + ' monthly rows (incl. month 0)')
  : bad('flow10: csv rows=' + csvRows.length + ', want ' + (av.months + 2));
const lastRow = csvRows[csvRows.length - 1].split(',');
(parseFloat(lastRow[5]) < 0.01 && parseInt(lastRow[0], 10) === av.months)
  ? ok('flow10: final CSV row = month ' + av.months + ' at ~$0.00 balance') : bad('flow10: final row: ' + csvRows[csvRows.length - 1]);

// Flow 11: parseISODate validation
(D.parseISODate('2027-03-15') instanceof Date && D.parseISODate('2027-13-01') === null && D.parseISODate('15/03/2027') === null && D.parseISODate('') === null)
  ? ok('flow11: parseISODate accepts YYYY-MM-DD only') : bad('flow11: parseISODate');

console.log('---');
console.log('E2E PASS: ' + pass + '  FAIL: ' + fail);
process.exit(fail ? 1 : 0);
NODEEOF
