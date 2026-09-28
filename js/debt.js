/* DebtPayoff AI — debt payoff simulation engine.
 * Pure logic, no DOM. Works in the browser (window.DebtPayoff)
 * and in node (module.exports) so tests can require() it. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.DebtPayoff = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_MONTHS = 600;

  function round2(n) { return Math.round(n * 100) / 100; }

  function totalBalance(ds) {
    return ds.reduce(function (s, d) { return s + Math.max(0, d.balance); }, 0);
  }

  function cloneDebts(debts) {
    return (debts || []).map(function (d, i) {
      return {
        id: d.id != null ? d.id : i,
        name: String(d.name || ('Debt ' + (i + 1))),
        balance: Math.max(0, Number(d.balance) || 0),
        apr: Math.max(0, Number(d.apr) || 0),
        min: Math.max(0, Number(d.min) || 0)
      };
    });
  }

  // Avalanche: highest APR first. Snowball: lowest balance first.
  function payoffOrder(debts, strategy) {
    return debts.slice().sort(function (a, b) {
      if (strategy === 'avalanche') {
        return (b.apr - a.apr) || (b.balance - a.balance);
      }
      return (a.balance - b.balance) || (b.apr - a.apr);
    });
  }

  function addMonths(date, n) {
    var d = new Date(date.getTime());
    d.setMonth(d.getMonth() + n);
    return d;
  }

  function money(n) {
    var v = round2(Number(n) || 0);
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtDate(d) {
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  /**
   * Simulate paying off debts month by month.
   * Each month: accrue interest, pay minimums on every unpaid debt,
   * then throw (extraMonthly + rolled-over minimums of paid-off debts)
   * at the single target debt chosen by the strategy.
   *
   * Returns { months, totalInterest, totalPaid, payoffDate, schedule,
   *           perDebt, stalled, strategy }
   */
  function simulate(debts, strategy, extraMonthly, fromDate) {
    var strat = strategy === 'snowball' ? 'snowball' : 'avalanche';
    var ds = cloneDebts(debts).filter(function (d) { return d.balance > 0; });
    var extra = Math.max(0, Number(extraMonthly) || 0);
    var start = fromDate instanceof Date ? new Date(fromDate.getTime()) : new Date();
    var totalInterest = 0, totalPaid = 0, month = 0;
    var schedule = [{ month: 0, balance: round2(totalBalance(ds)) }];
    var perDebt = ds.map(function (d) {
      return { id: d.id, name: d.name, startBalance: round2(d.balance), payoffMonth: null };
    });
    var stalled = ds.length === 0 ? false : false;

    function recOf(d) {
      for (var i = 0; i < perDebt.length; i++) {
        if (perDebt[i].id === d.id) return perDebt[i];
      }
      return null;
    }

    while (ds.some(function (d) { return d.balance > 0.005; })) {
      if (month >= MAX_MONTHS) { stalled = true; break; }
      var prevTotal = totalBalance(ds);
      month += 1;

      // 1. accrue a month of interest on every unpaid debt
      ds.forEach(function (d) {
        if (d.balance > 0) {
          var interest = d.balance * (d.apr / 100) / 12;
          d.balance += interest;
          totalInterest += interest;
        }
      });

      // 2. minimums of already-paid-off debts roll into the attack pool
      var rollover = ds.filter(function (d) { return d.balance <= 0.005; })
                       .reduce(function (s, d) { return s + d.min; }, 0);
      var pool = extra + rollover;

      // 3. pay minimums on every unpaid debt
      ds.forEach(function (d) {
        if (d.balance > 0.005 && d.min > 0) {
          var p = Math.min(d.min, d.balance);
          d.balance -= p;
          totalPaid += p;
        }
      });

      // 4. attack the strategy's target debt with the pool
      var unpaid = ds.filter(function (d) { return d.balance > 0.005; });
      var target = payoffOrder(unpaid, strat)[0];
      if (target && pool > 0) {
        var p2 = Math.min(pool, target.balance);
        target.balance -= p2;
        totalPaid += p2;
      }

      // 5. stamp payoff months
      ds.forEach(function (d) {
        var rec = recOf(d);
        if (rec && rec.payoffMonth === null && d.balance <= 0.005) {
          rec.payoffMonth = month;
        }
      });

      var now = totalBalance(ds);
      schedule.push({ month: month, balance: round2(Math.max(0, now)) });

      // stalled: payments don't even cover the interest
      if (now > 0.005 && now >= prevTotal - 1e-9) { stalled = true; break; }
    }

    return {
      strategy: strat,
      months: month,
      totalInterest: round2(totalInterest),
      totalPaid: round2(totalPaid),
      payoffDate: addMonths(start, month),
      schedule: schedule,
      perDebt: perDebt,
      stalled: stalled
    };
  }

  /**
   * Run both strategies (plus a minimums-only baseline) for the showdown.
   */
  function compare(debts, extraMonthly, fromDate) {
    var avalanche = simulate(debts, 'avalanche', extraMonthly, fromDate);
    var snowball = simulate(debts, 'snowball', extraMonthly, fromDate);
    var baseline = simulate(debts, 'avalanche', 0, fromDate);
    var winner = avalanche.totalInterest <= snowball.totalInterest ? 'avalanche' : 'snowball';
    return {
      avalanche: avalanche,
      snowball: snowball,
      baseline: baseline,
      winner: winner,
      interestSavedVsMinimums: round2(baseline.totalInterest - Math.min(avalanche.totalInterest, snowball.totalInterest)),
      monthsSavedVsMinimums: baseline.months - Math.min(avalanche.months, snowball.months)
    };
  }

  return {
    simulate: simulate,
    compare: compare,
    cloneDebts: cloneDebts,
    payoffOrder: payoffOrder,
    addMonths: addMonths,
    money: money,
    fmtDate: fmtDate,
    MAX_MONTHS: MAX_MONTHS
  };
}));
