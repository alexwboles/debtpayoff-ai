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

console.log('---');
console.log('E2E PASS: ' + pass + '  FAIL: ' + fail);
process.exit(fail ? 1 : 0);
NODEEOF
