/* DebtPayoff AI — UI. Requires window.DebtPayoff (js/debt.js). */
(function () {
  'use strict';
  var D = window.DebtPayoff;
  var LS_DEBTS = 'debtpayoff.debts.v1';
  var LS_EXTRA = 'debtpayoff.extra.v1';

  function loadDebts() {
    try {
      var raw = localStorage.getItem(LS_DEBTS);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }
  function saveDebts(debts) {
    try { localStorage.setItem(LS_DEBTS, JSON.stringify(debts)); } catch (e) {}
  }
  function loadExtra() {
    var v = parseFloat(localStorage.getItem(LS_EXTRA));
    return isNaN(v) ? 150 : v;
  }
  function saveExtra(v) {
    try { localStorage.setItem(LS_EXTRA, String(v)); } catch (e) {}
  }

  function el(id) { return document.getElementById(id); }

  function debtRow(d) {
    if (editingId === d.id) return debtEditRow(d);
    var li = document.createElement('li');
    li.className = 'debt-row';
    li.innerHTML =
      '<div class="debt-info"><strong></strong>' +
      '<span class="debt-meta"></span></div>' +
      '<div class="debt-actions">' +
      '<button class="icon-btn edit-btn" title="Edit" aria-label="Edit debt">' +
      '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M10.5 2.5l1 1L5 10H4V9l6.5-6.5zM12.5 1.5l-1-1-1.5 1.5 1 1 1.5-1.5zM2 12l.5-2L9 3.5l1.5 1.5L4 11.5 2 12z" fill="currentColor"/></svg></button>' +
      '<button class="icon-btn" title="Remove" aria-label="Remove debt">' +
      '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>';
    li.querySelector('strong').textContent = d.name;
    li.querySelector('.debt-meta').textContent =
      D.money(d.balance) + ' @ ' + d.apr + '% APR · min ' + D.money(d.min) + '/mo';
    li.querySelector('.edit-btn').addEventListener('click', function () {
      editingId = d.id;
      render();
    });
    li.querySelectorAll('.icon-btn')[1].addEventListener('click', function () {
      var debts = loadDebts().filter(function (x) { return x.id !== d.id; });
      saveDebts(debts);
      render();
    });
    return li;
  }

  function debtEditRow(d) {
    var li = document.createElement('li');
    li.className = 'debt-row editing';
    li.innerHTML =
      '<div class="debt-edit-grid">' +
      '<input type="text" id="eName" value="" maxlength="60" aria-label="Debt name">' +
      '<input type="number" id="eBalance" min="0" step="0.01" aria-label="Balance">' +
      '<input type="number" id="eApr" min="0" step="0.01" aria-label="APR">' +
      '<input type="number" id="eMin" min="0" step="0.01" aria-label="Minimum payment">' +
      '<button class="btn primary btn-mini" id="eSave">Save</button>' +
      '<button class="btn ghost btn-mini" id="eCancel">Cancel</button></div>' +
      '<p class="error" id="eError"></p>';
    li.querySelector('#eName').value = d.name;
    li.querySelector('#eBalance').value = d.balance;
    li.querySelector('#eApr').value = d.apr;
    li.querySelector('#eMin').value = d.min;
    li.querySelector('#eSave').addEventListener('click', function () {
      var name = li.querySelector('#eName').value.trim();
      var balance = parseFloat(li.querySelector('#eBalance').value);
      var apr = parseFloat(li.querySelector('#eApr').value);
      var min = parseFloat(li.querySelector('#eMin').value);
      if (!name || !(balance > 0)) {
        li.querySelector('#eError').textContent = 'Name and a balance above $0 are required.';
        return;
      }
      var debts = loadDebts().map(function (x) {
        if (x.id !== d.id) return x;
        return { id: x.id, name: name, balance: balance, apr: isNaN(apr) ? 0 : apr, min: isNaN(min) ? 0 : min };
      });
      saveDebts(debts);
      editingId = null;
      render();
    });
    li.querySelector('#eCancel').addEventListener('click', function () {
      editingId = null;
      render();
    });
    return li;
  }

  var editingId = null;

  function strategyCard(title, desc, res, isWinner) {
    var card = document.createElement('div');
    card.className = 'strat-card' + (isWinner ? ' winner' : '');
    var body = isWinner
      ? '<div class="winner-badge">Pays the least interest</div>'
      : '<div class="winner-badge placeholder">&nbsp;</div>';
    if (res.stalled) {
      body += '<p class="stalled">With these payments the balance never shrinks — minimums don\'t cover the interest. Raise the extra payment.</p>';
    } else {
      body +=
        '<div class="big-date">' + D.fmtDate(res.payoffDate) + '</div>' +
        '<div class="stat-grid">' +
        '<div><span class="stat-num">' + res.months + '</span><span class="stat-label">months</span></div>' +
        '<div><span class="stat-num">' + D.money(res.totalInterest) + '</span><span class="stat-label">total interest</span></div>' +
        '<div><span class="stat-num">' + D.money(res.totalPaid) + '</span><span class="stat-label">total paid</span></div>' +
        '</div>';
    }
    card.innerHTML = '<h3>' + title + '</h3><p class="strat-desc">' + desc + '</p>' + body;
    return card;
  }

  function drawChart(cmp) {
    var svg = el('chart');
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var W = 640, H = 260, PAD = 40;
    svg.setAttribute('viewBox', '0 0 ' + W + H);
    var NS = 'http://www.w3.org/2000/svg';
    var maxBal = Math.max(
      cmp.avalanche.schedule[0].balance,
      cmp.snowball.schedule[0].balance, 1);
    var maxM = Math.max(cmp.avalanche.months, cmp.snowball.months, 1);

    function pt(m, b) {
      var x = PAD + (m / maxM) * (W - PAD - 10);
      var y = H - PAD - (b / maxBal) * (H - PAD - 20);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }
    function line(sched, color, dashed) {
      var pl = document.createElementNS(NS, 'polyline');
      pl.setAttribute('points', sched.map(function (p) { return pt(p.month, p.balance); }).join(' '));
      pl.setAttribute('fill', 'none');
      pl.setAttribute('stroke', color);
      pl.setAttribute('stroke-width', '3');
      if (dashed) pl.setAttribute('stroke-dasharray', '7,5');
      pl.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(pl);
    }
    // axes
    var ax = document.createElementNS(NS, 'line');
    ax.setAttribute('x1', PAD); ax.setAttribute('y1', H - PAD);
    ax.setAttribute('x2', W - 10); ax.setAttribute('y2', H - PAD);
    ax.setAttribute('stroke', '#cbd5e1'); svg.appendChild(ax);
    var ay = document.createElementNS(NS, 'line');
    ay.setAttribute('x1', PAD); ay.setAttribute('y1', 10);
    ay.setAttribute('x2', PAD); ay.setAttribute('y2', H - PAD);
    ay.setAttribute('stroke', '#cbd5e1'); svg.appendChild(ay);

    line(cmp.baseline.schedule, '#cbd5e1', true);
    line(cmp.snowball.schedule, '#b3261e', false);
    line(cmp.avalanche.schedule, '#1e2a38', false);

    function label(x, y, text, color) {
      var t = document.createElementNS(NS, 'text');
      t.setAttribute('x', x); t.setAttribute('y', y);
      t.setAttribute('fill', color); t.setAttribute('font-size', '12');
      t.textContent = text; svg.appendChild(t);
    }
    label(PAD, H - 12, 'Debt-free →', '#64748b');
    var lx = W - 150;
    label(lx, 24, '— Avalanche', '#1e2a38');
    label(lx, 42, '— Snowball', '#b3261e');
    label(lx, 60, '- - Minimums only', '#94a3b8');
  }

  function renderScheduleTable(cmp) {
    var box = el('scheduleTable');
    box.innerHTML = '';
    var res = cmp[cmp.winner];
    if (res.stalled || !res.monthly || res.monthly.length < 2) {
      box.innerHTML = '<p class="muted">No schedule to show yet — the current payments never pay the balance down.</p>';
      return;
    }
    var table = document.createElement('table');
    table.className = 'sched-table';
    var html = '<thead><tr><th>#</th><th>Month</th><th class="num">Payment</th><th class="num">Interest</th><th class="num">Principal</th><th class="num">Balance</th></tr></thead><tbody>';
    res.monthly.forEach(function (m) {
      if (m.month === 0) return;
      var principal = Math.max(0, Math.round((m.payment - m.interest) * 100) / 100);
      html += '<tr><td>' + m.month + '</td><td>' + D.fmtDate(m.date instanceof Date ? m.date : new Date(m.date)) + '</td>' +
        '<td class="num">' + D.money(m.payment) + '</td><td class="num neg">' + D.money(m.interest) + '</td>' +
        '<td class="num">' + D.money(principal) + '</td><td class="num"><b>' + D.money(m.balance) + '</b></td></tr>';
    });
    table.innerHTML = html + '</tbody>';
    box.appendChild(table);
    var note = document.createElement('p');
    note.className = 'muted small';
    note.textContent = 'Showing the ' + cmp.winner + ' plan (' + res.months + ' payments).';
    box.appendChild(note);
  }

  function runTargetCalc() {
    var out = el('targetResult');
    var debts = loadDebts();
    var r = D.extraForTargetDate(debts, el('targetDate').value);
    if (!r.ok) {
      out.innerHTML = '<p class="error">' + r.error + '</p>';
      return;
    }
    var stratName = r.strategy === 'avalanche' ? 'Avalanche' : 'Snowball';
    out.innerHTML = r.extraMonthly === 0
      ? '<p class="target-ok">Your minimums already get you there — debt-free by <b>' + D.fmtDate(r.payoffDate) + '</b> with no extra payment.</p>'
      : '<p class="target-ok">Pay an extra <b>' + D.money(r.extraMonthly) + '/mo</b> and you\'re debt-free by <b>' +
        D.fmtDate(r.payoffDate) + '</b> — ' + r.months + ' months via ' + stratName + '.</p>';
  }

  function renderProgress(cmp) {
    var box = el('progressList');
    box.innerHTML = '';
    var res = cmp[cmp.winner];
    var startTotal = res.schedule[0].balance || 1;
    res.perDebt.forEach(function (pd) {
      // current remaining fraction: derive from payoff order is complex;
      // show payoff order + payoff date instead — simple, honest.
      var div = document.createElement('div');
      div.className = 'prog-row';
      var when = pd.payoffMonth == null ? '—' : D.fmtDate(D.addMonths(new Date(), pd.payoffMonth));
      div.innerHTML = '<div class="prog-top"><strong></strong><span></span></div>' +
        '<div class="prog-bar"><div class="prog-fill"></div></div>';
      div.querySelector('strong').textContent = pd.name;
      div.querySelector('.prog-top span').textContent =
        D.money(pd.startBalance) + ' → paid off ' + when;
      // fill = share of time elapsed is unknown pre-payoff; show planned share instead
      var frac = res.months > 0 && pd.payoffMonth != null
        ? Math.min(1, pd.payoffMonth / res.months) : 0;
      div.querySelector('.prog-fill').style.width = Math.round(frac * 100) + '%';
      box.appendChild(div);
    });
  }

  function motivational(cmp, extra) {
    var best = cmp[cmp.winner];
    var msgs = [];
    if (best.stalled) {
      return 'Your minimums don\'t cover the interest right now — every month the balance grows. ' +
        'Nudge the extra payment up until the chart bends downward. Even $25 changes the math.';
    }
    msgs.push('Debt-free by ' + D.fmtDate(best.payoffDate) + ' — ' + best.months + ' months from now.');
    if (cmp.interestSavedVsMinimums > 0) {
      msgs.push('That extra ' + D.money(extra) + '/mo saves you ' + D.money(cmp.interestSavedVsMinimums) +
        ' in interest and ' + cmp.monthsSavedVsMinimums + ' months versus paying minimums only.');
    }
    var diff = Math.abs(cmp.avalanche.totalInterest - cmp.snowball.totalInterest);
    if (diff > 1) {
      var w = cmp.winner === 'avalanche' ? 'Avalanche' : 'Snowball';
      msgs.push(w + ' wins this round, saving ' + D.money(diff) + ' in interest over the other strategy.');
    } else {
      msgs.push('Both strategies cost nearly the same here — pick the one that keeps you motivated.');
    }
    var first = best.perDebt.slice().sort(function (a, b) { return (a.payoffMonth || 1e9) - (b.payoffMonth || 1e9); })[0];
    if (first && first.payoffMonth) {
      msgs.push('First win: "' + first.name + '" is gone by ' + D.fmtDate(D.addMonths(new Date(), first.payoffMonth)) + '. Roll its payment into the next debt.');
    }
    return msgs.join(' ');
  }

  function render() {
    var debts = loadDebts();
    var extra = loadExtra();

    // debt list
    var list = el('debtList');
    list.innerHTML = '';
    if (!debts.length) {
      list.innerHTML = '<li class="empty">No debts yet — add one above, or try the sample data.</li>';
    } else {
      debts.forEach(function (d) { list.appendChild(debtRow(d)); });
    }
    el('debtCount').textContent = debts.length + (debts.length === 1 ? ' debt' : ' debts');
    el('totalOwed').textContent = D.money(debts.reduce(function (s, d) { return s + (Number(d.balance) || 0); }, 0));

    // extra slider
    el('extraRange').value = extra;
    el('extraVal').textContent = D.money(extra) + '/mo';

    var results = el('results');
    if (!debts.length) {
      results.style.display = 'none';
      return;
    }
    results.style.display = '';

    var cmp = D.compare(debts, extra);
    var showdown = el('showdown');
    showdown.innerHTML = '';
    showdown.appendChild(strategyCard(
      'Snowball', 'Pay smallest balance first. Quick wins keep motivation high.',
      cmp.snowball, cmp.winner === 'snowball'));
    showdown.appendChild(strategyCard(
      'Avalanche', 'Pay highest APR first. Mathematically the cheapest route.',
      cmp.avalanche, cmp.winner === 'avalanche'));

    drawChart(cmp);
    renderProgress(cmp);
    renderScheduleTable(cmp);
    el('motivation').textContent = motivational(cmp, extra);
  }

  function addDebtFromForm() {
    var name = el('fName').value.trim();
    var balance = parseFloat(el('fBalance').value);
    var apr = parseFloat(el('fApr').value);
    var min = parseFloat(el('fMin').value);
    if (!name || !(balance > 0)) {
      el('formError').textContent = 'Give the debt a name and a balance above $0.';
      return;
    }
    el('formError').textContent = '';
    var debts = loadDebts();
    debts.push({
      id: 'd' + Date.now(),
      name: name,
      balance: balance,
      apr: isNaN(apr) ? 0 : apr,
      min: isNaN(min) ? 0 : min
    });
    saveDebts(debts);
    el('fName').value = ''; el('fBalance').value = '';
    el('fApr').value = ''; el('fMin').value = '';
    render();
  }

  function loadSample() {
    fetch('data/sample.json')
      .then(function (r) { return r.json(); })
      .then(function (data) { saveDebts(data); render(); })
      .catch(function () {
        el('formError').textContent = 'Could not load sample.json — serve over http:// (not file://).';
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    el('addDebt').addEventListener('click', addDebtFromForm);
    el('sampleBtn').addEventListener('click', loadSample);
    el('clearBtn').addEventListener('click', function () {
      if (confirm('Remove all debts?')) { saveDebts([]); render(); }
    });
    el('extraRange').addEventListener('input', function (e) {
      saveExtra(parseFloat(e.target.value) || 0);
      render();
    });
    el('targetCalc').addEventListener('click', runTargetCalc);
    el('targetDate').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runTargetCalc(); } });
    el('schedCsv').addEventListener('click', function () {
      var debts = loadDebts();
      if (!debts.length) return;
      var cmp = D.compare(debts, loadExtra());
      var csv = D.scheduleToCSV(cmp[cmp.winner]);
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'debtpayoff-schedule-' + cmp.winner + '.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
    el('printPlan').addEventListener('click', function () { window.print(); });
    render();
  });
})();
