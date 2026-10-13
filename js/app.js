/* DebtPayoff AI — UI. Requires window.DebtPayoff (js/debt.js). */
(function () {
  'use strict';
  var D = window.DebtPayoff;
  var LS_DEBTS = 'debtpayoff.debts.v1';
  var LS_EXTRA = 'debtpayoff.extra.v1';
  var LS_STRATEGY = 'debtpayoff.strategy.v1';
  var LS_CHECKINS = 'debtpayoff.checkins.v1';

  function loadStrategy() {
    try {
      var s = localStorage.getItem(LS_STRATEGY);
      return s === 'snowball' || s === 'avalanche' ? s : null;
    } catch (e) { return null; }
  }
  function saveStrategy(s) {
    try { localStorage.setItem(LS_STRATEGY, s); } catch (e) {}
  }
  function loadCheckins() {
    try { return JSON.parse(localStorage.getItem(LS_CHECKINS)) || {}; } catch (e) { return {}; }
  }
  function saveCheckins(c) {
    try { localStorage.setItem(LS_CHECKINS, JSON.stringify(c)); } catch (e) {}
  }

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

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Per-debt minimum-vs-interest warnings: flag debts whose minimum doesn't
  // cover a month of interest (the balance grows while paying minimums).
  function renderMinWarn(debts) {
    var box = el('minWarn');
    if (!box) return;
    var flags = D.minShortfalls(debts);
    if (!flags.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
    box.style.display = '';
    box.innerHTML = '<strong>Heads up:</strong> ' + flags.map(function (f) {
      return escHtml(f.name) + '\u2019s minimum (' + D.money(f.min) + ') doesn\u2019t cover its monthly interest (' +
        D.money(f.monthlyInterest) + ') \u2014 the balance grows ' + D.money(f.shortfall) + '/mo on minimums alone';
    }).join('; ') + '.';
  }

  function debtRow(d) {
    if (editingId === d.id) return debtEditRow(d);
    if (checkinId === d.id) return debtCheckinRow(d);
    var li = document.createElement('li');
    li.className = 'debt-row';
    li.innerHTML =
      '<div class="debt-info"><strong></strong>' +
      '<span class="debt-meta"></span></div>' +
      '<div class="debt-actions">' +
      '<button class="icon-btn checkin-btn" title="Log a balance check-in" aria-label="Log balance check-in">' +
      '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1v8M4 6l3 3 3-3M2 11h10v2H2z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '<button class="icon-btn edit-btn" title="Edit" aria-label="Edit debt">' +
      '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M10.5 2.5l1 1L5 10H4V9l6.5-6.5zM12.5 1.5l-1-1-1.5 1.5 1 1 1.5-1.5zM2 12l.5-2L9 3.5l1.5 1.5L4 11.5 2 12z" fill="currentColor"/></svg></button>' +
      '<button class="icon-btn" title="Remove" aria-label="Remove debt">' +
      '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>';
    li.querySelector('strong').textContent = d.name;
    var meta = D.money(d.balance) + ' @ ' + d.apr + '% APR · min ' + D.money(d.min) + '/mo';
    li.querySelector('.debt-meta').textContent = meta;
    if (d.deadline) {
      var badge = document.createElement('span');
      badge.className = 'deadline-badge';
      var dlDate = D.parseISODate(d.deadline);
      var req = D.deadlinePayment(d.balance, d.apr, d.deadline, new Date(), 1);
      badge.textContent = 'due ' + (dlDate ? D.fmtDate(dlDate) : d.deadline) + ' → ' + D.money(req) + '/mo';
      badge.title = 'Guaranteed pay-off date: the plan pays ' + D.money(req) + '/mo to clear this debt on time.';
      li.querySelector('.debt-info').appendChild(badge);
    }
    li.querySelector('.checkin-btn').addEventListener('click', function () {
      checkinId = d.id;
      render();
    });
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
      '<input type="date" id="eDeadline" aria-label="Pay off by (optional)" title="Pay off by (optional)">' +
      '<button class="btn primary btn-mini" id="eSave">Save</button>' +
      '<button class="btn ghost btn-mini" id="eCancel">Cancel</button></div>' +
      '<p class="error" id="eError"></p>';
    li.querySelector('#eName').value = d.name;
    li.querySelector('#eBalance').value = d.balance;
    li.querySelector('#eApr').value = d.apr;
    li.querySelector('#eMin').value = d.min;
    li.querySelector('#eDeadline').value = d.deadline || '';
    li.querySelector('#eSave').addEventListener('click', function () {
      var name = li.querySelector('#eName').value.trim();
      var balance = parseFloat(li.querySelector('#eBalance').value);
      var apr = parseFloat(li.querySelector('#eApr').value);
      var min = parseFloat(li.querySelector('#eMin').value);
      var deadline = li.querySelector('#eDeadline').value;
      if (!name || !(balance > 0)) {
        li.querySelector('#eError').textContent = 'Name and a balance above $0 are required.';
        return;
      }
      if (deadline && !D.parseISODate(deadline)) {
        li.querySelector('#eError').textContent = 'That pay-off-by date is not valid.';
        return;
      }
      var debts = loadDebts().map(function (x) {
        if (x.id !== d.id) return x;
        return { id: x.id, name: name, balance: balance, apr: isNaN(apr) ? 0 : apr, min: isNaN(min) ? 0 : min, deadline: deadline || '' };
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
  var checkinId = null;

  function todayISO() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  // Inline balance check-in row: log the current statement balance so the
  // plan tracks reality, and build a per-debt payoff history.
  function debtCheckinRow(d) {
    var hist = (loadCheckins()[d.id] || []);
    var last = hist.length ? hist[hist.length - 1].balance : d.balance;
    var li = document.createElement('li');
    li.className = 'debt-row editing';
    li.innerHTML =
      '<div class="debt-checkin-grid">' +
      '<span class="chk-label">Check-in: <strong></strong></span>' +
      '<input type="date" id="cDate" value="' + todayISO() + '" aria-label="Statement date">' +
      '<input type="number" id="cBalance" min="0" step="0.01" value="' + last + '" aria-label="Current balance">' +
      '<button class="btn primary btn-mini" id="cSave">Save</button>' +
      '<button class="btn ghost btn-mini" id="cCancel">Cancel</button></div>' +
      '<p class="muted small">' + hist.length + ' check-in' + (hist.length === 1 ? '' : 's') +
      (hist.length ? ' · first logged: ' + D.money(hist[0].balance) + ' on ' + hist[0].date : '') + '</p>' +
      '<p class="error" id="cError"></p>';
    li.querySelector('.chk-label strong').textContent = d.name;
    li.querySelector('#cSave').addEventListener('click', function () {
      var bal = parseFloat(li.querySelector('#cBalance').value);
      var dt = li.querySelector('#cDate').value;
      if (!(bal >= 0) || !/^\d{4}-\d{2}-\d{2}$/.test(dt)) {
        li.querySelector('#cError').textContent = 'Enter a valid date and a balance of $0 or more.';
        return;
      }
      var all = loadCheckins();
      var h = all[d.id] || (all[d.id] = []);
      var ex = h.filter(function (x) { return x.date === dt; })[0];
      if (ex) ex.balance = bal; else h.push({ date: dt, balance: bal });
      h.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      saveCheckins(all);
      // the plan now runs on the real balance
      var debts = loadDebts().map(function (x) {
        return x.id === d.id
          ? { id: x.id, name: x.name, balance: bal, apr: x.apr, min: x.min }
          : x;
      });
      saveDebts(debts);
      checkinId = null;
      render();
    });
    li.querySelector('#cCancel').addEventListener('click', function () {
      checkinId = null;
      render();
    });
    return li;
  }

  function strategyCard(key, title, desc, res, isWinner, isFollowing) {
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
    card.innerHTML = '<h3>' + title + '</h3><p class="strat-desc">' + desc + '</p>' + body +
      '<button class="btn ' + (isFollowing ? 'ghost' : 'primary') + ' btn-mini follow-btn" data-strategy="' + key + '"' +
      (isFollowing ? ' disabled' : '') + '>' + (isFollowing ? '✓ Your plan' : 'Follow this plan') + '</button>';
    return card;
  }

  function drawChart(cmp, chosen) {
    var svg = el('chart');
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var W = 680, H = 300, PADL = 52, PADR = 14, PADT = 16, PADB = 44;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var NS = 'http://www.w3.org/2000/svg';
    var maxBal = Math.max(
      cmp.avalanche.schedule[0].balance,
      cmp.snowball.schedule[0].balance, 1);
    var maxM = Math.max(cmp.avalanche.months, cmp.snowball.months, 1);
    var cw = W - PADL - PADR, ch = H - PADT - PADB;

    function pt(m, b) {
      var x = PADL + (m / maxM) * cw;
      var y = PADT + ch - (b / maxBal) * ch;
      return { x: x, y: y };
    }
    function mk(tag, attrs) {
      var n = document.createElementNS(NS, tag);
      for (var k in attrs) n.setAttribute(k, attrs[k]);
      svg.appendChild(n);
      return n;
    }
    function txt(x, y, s, cls, anchor) {
      var t = mk('text', { x: x, y: y, 'class': cls || 'chart-axis' });
      if (anchor) t.setAttribute('text-anchor', anchor);
      t.textContent = s;
      return t;
    }
    // gridlines + $k axis
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      var v = Math.round(maxBal * f / 500) * 500;
      var p = pt(0, v);
      mk('line', { x1: PADL, y1: p.y, x2: W - PADR, y2: p.y, 'class': 'chart-grid' });
      txt(PADL - 8, p.y + 4, v >= 1000 ? '$' + (v / 1000) + 'k' : '$' + v, 'chart-axis', 'end');
    });
    // month labels
    var step = maxM > 24 ? 6 : maxM > 12 ? 3 : 2;
    for (var m = 0; m <= maxM; m += step) {
      var p2 = pt(m, 0);
      txt(p2.x, H - PADB + 18, 'mo ' + m, 'chart-axis', 'middle');
    }
    txt(PADL, H - 8, 'months →', 'chart-axis');
    // baseline (minimums only)
    function line(sched, cls, width, dash) {
      var pl = mk('polyline', {
        points: sched.map(function (p) { var q = pt(p.month, p.balance); return q.x.toFixed(1) + ',' + q.y.toFixed(1); }).join(' '),
        fill: 'none', 'class': cls, 'stroke-width': width || '2.5'
      });
      if (dash) pl.setAttribute('stroke-dasharray', dash);
      return pl;
    }
    line(cmp.baseline.schedule, 'chart-baseline', '2', '6,5');
    // area fill under the followed strategy
    var res = cmp[chosen];
    var areaPts = res.schedule.map(function (p) { var q = pt(p.month, p.balance); return q.x.toFixed(1) + ',' + q.y.toFixed(1); });
    var pStart = pt(0, 0), pEnd = pt(maxM, 0);
    mk('polygon', { points: areaPts.join(' ') + ' ' + pEnd.x.toFixed(1) + ',' + pEnd.y.toFixed(1) + ' ' + pStart.x.toFixed(1) + ',' + pStart.y.toFixed(1), 'class': 'chart-area' });
    var other = chosen === 'snowball' ? 'avalanche' : 'snowball';
    line(cmp[other].schedule, 'chart-' + other, '2');
    line(res.schedule, 'chart-' + chosen + ' chart-chosen', '4');
    // zero axis
    var z = pt(0, 0);
    mk('line', { x1: PADL, y1: z.y, x2: W - PADR, y2: z.y, 'class': 'chart-zero' });
    // "you are here" start marker
    var s0 = pt(0, res.schedule[0].balance);
    mk('circle', { cx: s0.x, cy: s0.y, r: 5, 'class': 'chart-start' });
    txt(s0.x + 10, s0.y + 4, 'you are here', 'chart-note');
    // payoff milestones: each debt's death month on the followed plan
    (res.perDebt || []).forEach(function (pd) {
      if (pd.payoffMonth == null || pd.payoffMonth > maxM) return;
      var q = pt(pd.payoffMonth, 0);
      var c = mk('circle', { cx: q.x, cy: q.y, r: 5, 'class': 'chart-milestone' });
      var title = document.createElementNS(NS, 'title');
      title.textContent = pd.name + ' paid off — ' + D.fmtDate(D.addMonths(new Date(), pd.payoffMonth));
      c.appendChild(title);
    });
    // legend
    var lx = W - 172;
    txt(lx, 22, '— Avalanche', 'chart-legend chart-avalanche');
    txt(lx, 40, '— Snowball', 'chart-legend chart-snowball');
    txt(lx, 58, '- - Minimums only', 'chart-legend chart-baseline');
    txt(lx, 76, '● debt paid off', 'chart-legend');
  }

  function renderScheduleTable(cmp, chosen) {
    var box = el('scheduleTable');
    box.innerHTML = '';
    var res = cmp[chosen];
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
    note.textContent = 'Showing the ' + chosen + ' plan (' + res.months + ' payments).';
    box.appendChild(note);
  }

  function runLumpCalc() {
    var out = el('lumpResult');
    var debts = loadDebts();
    var amt = parseFloat(el('lumpAmt').value);
    var month = parseInt(el('lumpMonth').value, 10);
    if (!debts.length) { out.innerHTML = '<p class="error">Add a debt first.</p>'; return; }
    if (!(amt > 0) || !(month >= 1)) {
      out.innerHTML = '<p class="error">Enter an amount above $0 and a month number of 1 or more.</p>';
      return;
    }
    var extra = loadExtra();
    var chosen = loadStrategy() || D.compare(debts, extra).winner;
    var base = D.simulate(debts, chosen, extra, new Date());
    var lump = D.simulate(debts, chosen, extra, new Date(), [{ month: month, amount: amt }]);
    var stratName = chosen === 'avalanche' ? 'Avalanche' : 'Snowball';
    if (base.stalled && lump.stalled) {
      out.innerHTML = '<p class="target-ok">Even with ' + D.money(amt) + ' in month ' + month +
        ', the minimums don\'t cover the interest — raise the monthly extra payment too.</p>';
      return;
    }
    if (base.stalled && !lump.stalled) {
      out.innerHTML = '<p class="target-ok">That lump sum gets your plan unstuck — debt-free by <b>' +
        D.fmtDate(lump.payoffDate) + '</b> (' + lump.months + ' months via ' + stratName + ').</p>';
      return;
    }
    var monthsSaved = base.months - lump.months;
    var interestSaved = Math.max(0, base.totalInterest - lump.totalInterest);
    if (monthsSaved <= 0 && interestSaved <= 0.005) {
      out.innerHTML = '<p class="muted">That lump lands after you\'re already debt-free — no change to the plan. Try an earlier month.</p>';
      return;
    }
    out.innerHTML = '<p class="target-ok">Paying <b>' + D.money(amt) + '</b> in month ' + month + ' (' +
      D.fmtDate(D.addMonths(new Date(), month)) + ') cuts <b>' + monthsSaved + ' month' +
      (monthsSaved === 1 ? '' : 's') + '</b> off your plan and saves <b>' + D.money(interestSaved) +
      '</b> in interest — debt-free by <b>' + D.fmtDate(lump.payoffDate) + '</b> via ' + stratName + '.</p>';
  }

  function runRefiCalc() {
    var out = el('refiResult');
    var debts = loadDebts();
    if (!debts.length) { out.innerHTML = '<p class="error">Add a debt first.</p>'; return; }
    var r = D.refinanceImpact(debts, loadExtra(), el('refiDebt').value, parseFloat(el('refiApr').value), new Date());
    if (!r.ok) { out.innerHTML = '<p class="error">' + escHtml(r.error) + '</p>'; return; }
    if (r.base.stalled && r.refi.stalled) {
      out.innerHTML = '<p class="target-ok">Even at ' + r.newApr + '% APR the minimums don\u2019t cover the interest \u2014 raise the monthly extra payment too.</p>';
      return;
    }
    if (r.base.stalled && !r.refi.stalled) {
      out.innerHTML = '<p class="target-ok">That refinance gets your plan unstuck \u2014 debt-free by <b>' +
        D.fmtDate(r.refi.payoffDate) + '</b> (' + r.refi.months + ' months).</p>';
      return;
    }
    var saved = [];
    if (r.interestSaved > 0.005) saved.push('saves <b>' + D.money(r.interestSaved) + '</b> in interest');
    if (r.monthsSaved > 0) saved.push('cuts <b>' + r.monthsSaved + ' month' + (r.monthsSaved === 1 ? '' : 's') + '</b> off your plan');
    out.innerHTML = saved.length
      ? '<p class="target-ok">Refinancing <b>' + escHtml(r.debt) + '</b> from ' + r.oldApr + '% to <b>' + r.newApr +
        '%</b> ' + saved.join(' and ') + ' \u2014 debt-free by <b>' + D.fmtDate(r.refi.payoffDate) + '</b>.</p>'
      : '<p class="muted">No change \u2014 ' + escHtml(r.debt) + ' is paid off early enough that the rate cut barely matters.</p>';
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

  function renderProgress(cmp, chosen) {
    var box = el('progressList');
    box.innerHTML = '';
    var res = cmp[chosen];
    var checkins = loadCheckins();
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
      var sub = D.money(pd.startBalance) + ' → paid off ' + when;
      // real-world progress from balance check-ins, when the user logs them
      var hist = (checkins[pd.id] || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      if (hist.length >= 1 && hist[0].balance > 0) {
        var first = hist[0], last = hist[hist.length - 1];
        var paid = Math.max(0, first.balance - last.balance);
        var pct = Math.min(100, Math.round(paid / first.balance * 100));
        sub += ' · checked in ' + D.money(last.balance) + ' — ' + D.money(paid) + ' paid down (' + pct + '%) since ' + first.date;
      }
      div.querySelector('.prog-top span').textContent = sub;
      // fill = share of time elapsed is unknown pre-payoff; show planned share instead
      var frac = res.months > 0 && pd.payoffMonth != null
        ? Math.min(1, pd.payoffMonth / res.months) : 0;
      div.querySelector('.prog-fill').style.width = Math.round(frac * 100) + '%';
      box.appendChild(div);
    });
  }

  function motivational(cmp, chosen, extra) {
    var best = cmp[chosen];
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
      if (chosen === cmp.winner) {
        msgs.push(w + ' wins this round, saving ' + D.money(diff) + ' in interest over the other strategy.');
      } else {
        msgs.push('You\'re following the ' + (chosen === 'snowball' ? 'Snowball' : 'Avalanche') + ' even though ' + w +
          ' is ' + D.money(diff) + ' cheaper — the plan you stick with beats the cheapest one you abandon.');
      }
    } else {
      msgs.push('Both strategies cost nearly the same here — pick the one that keeps you motivated.');
    }
    var first = best.perDebt.slice().sort(function (a, b) { return (a.payoffMonth || 1e9) - (b.payoffMonth || 1e9); })[0];
    if (first && first.payoffMonth) {
      msgs.push('First win: "' + first.name + '" is gone by ' + D.fmtDate(D.addMonths(new Date(), first.payoffMonth)) + '. Roll its payment into the next debt.');
    }
    return msgs.join(' ');
  }

  function renderBattlePlan(debts, chosen, extra) {
    var box = el('battlePlan');
    var plan = D.firstMonthPlan(debts, chosen, extra, new Date());
    if (!plan.rows.length) { box.innerHTML = '<p class="muted">Add a debt to see your battle plan.</p>'; return; }
    var stratName = plan.strategy === 'snowball' ? 'Snowball' : 'Avalanche';
    var html = '<div class="battle-target">Attack target: <strong>' + escHtml(plan.target ? plan.target.name : '—') +
      '</strong> <span class="muted">(' + stratName + ' order)</span></div>';
    html += '<div class="battle-rows">' + plan.rows.map(function (r) {
      var tags = [];
      if (r.isTarget) tags.push('<span class="tag attack">attack</span>');
      if (r.deadline) tags.push('<span class="tag deadline">due ' + escHtml(D.fmtDate(D.parseISODate(r.deadline))) + '</span>');
      return '<div class="battle-row' + (r.isTarget ? ' is-target' : '') + '"><span class="battle-name">' +
        escHtml(r.name) + ' ' + tags.join(' ') + '<br><span class="muted small">' +
        (r.deadlineTop > 0
          ? 'min ' + D.money(r.min) + ' + ' + D.money(r.deadlineTop) + ' deadline guarantee'
          : r.isTarget ? 'min ' + D.money(r.min) + ' + ' + D.money(extra) + ' attack' : 'minimum') +
        '</span></span><span class="battle-pay">' + D.money(r.payment) + '</span></div>';
    }).join('') + '</div>';
    html += '<div class="battle-total"><span>Total this month</span><strong>' + D.money(plan.total) + '</strong></div>';
    var dlExtra = plan.rows.reduce(function (s, r) { return s + r.deadlineTop; }, 0);
    if (dlExtra > 0) {
      html += '<p class="muted small">Includes ' + D.money(Math.round(dlExtra * 100) / 100) +
        '/mo in deadline guarantees — the price of those pay-off-by dates.</p>';
    }
    box.innerHTML = html;
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
    renderMinWarn(debts);

    // extra slider
    el('extraRange').value = extra;
    el('extraVal').textContent = D.money(extra) + '/mo';

    var results = el('results');
    if (!debts.length) {
      results.style.display = 'none';
      return;
    }
    results.style.display = '';

    // refinance picker follows the debt list
    var rsel = el('refiDebt');
    if (rsel) {
      var cur = rsel.value;
      rsel.innerHTML = debts.map(function (d) {
        return '<option value="' + d.id + '">' + escHtml(d.name) + ' (' + d.apr + '% APR)</option>';
      }).join('');
      if (cur) rsel.value = cur;
    }

    var cmp = D.compare(debts, extra);
    var chosen = loadStrategy() || cmp.winner;
    var showdown = el('showdown');
    showdown.innerHTML = '';
    showdown.appendChild(strategyCard(
      'snowball', 'Snowball', 'Pay smallest balance first. Quick wins keep motivation high.',
      cmp.snowball, cmp.winner === 'snowball', chosen === 'snowball'));
    showdown.appendChild(strategyCard(
      'avalanche', 'Avalanche', 'Pay highest APR first. Mathematically the cheapest route.',
      cmp.avalanche, cmp.winner === 'avalanche', chosen === 'avalanche'));
    showdown.querySelectorAll('.follow-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        saveStrategy(b.getAttribute('data-strategy'));
        render();
      });
    });

    drawChart(cmp, chosen);
    renderBattlePlan(debts, chosen, extra);
    renderProgress(cmp, chosen);
    renderScheduleTable(cmp, chosen);
    el('motivation').textContent = motivational(cmp, chosen, extra);
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
    el('lumpCalc').addEventListener('click', runLumpCalc);
    el('lumpAmt').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runLumpCalc(); } });
    el('lumpMonth').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runLumpCalc(); } });
    el('refiCalc').addEventListener('click', runRefiCalc);
    el('refiApr').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runRefiCalc(); } });
    el('debtCsv').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var res = D.debtsFromCSV(rd.result);
        var msg = el('debtCsvMsg');
        if (res.debts.length) {
          var debts = loadDebts();
          var t = Date.now();
          res.debts.forEach(function (d, i) {
            debts.push({ id: 'd' + t + '-' + i, name: d.name, balance: d.balance, apr: d.apr, min: d.min });
          });
          saveDebts(debts);
          render();
          el('debtCsvMsg').innerHTML = '<span class="target-ok" style="margin:0">Imported ' + res.debts.length +
            ' debt' + (res.debts.length === 1 ? '' : 's') +
            (res.errors.length ? ' (' + res.errors.length + ' row' + (res.errors.length === 1 ? '' : 's') + ' skipped)' : '') + '.</span>';
        } else {
          msg.innerHTML = '<span class="error">No debts imported: ' + escHtml(res.errors.join('; ')) + '</span>';
        }
        e.target.value = '';
      };
      rd.readAsText(f);
    });
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
