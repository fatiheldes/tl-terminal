// TLREF OIS & MPC pricing (Derivatives › OIS).
// Market-implied policy path: piecewise-constant overnight rate between MPC meetings, fitted by least squares to
// T-bill discount factors (exact, high weight) and, beyond the last bill, to the fitted government bond curve.
// Everything is compared on the same basis: overnight rates are daily-compounded (like TLREF); policy-rate
// equivalents are 1-week simple (like the CBRT funding rate).
(function () {
  const isN = (v) => typeof v === 'number' && isFinite(v);
  const R2 = (v) => isN(v) ? Math.round(v * 100) / 100 : null;
  const DAY = 864e5;
  const T = (s) => Date.parse(String(s).slice(0, 10) + 'T00:00:00Z');
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  // CBRT MPC dates: official to Jun 2027 (TCMB calendar); later dates assumed from the usual 8-meeting pattern
  const MPC = [['2026-07-23', 1], ['2026-09-10', 1], ['2026-10-22', 1], ['2026-12-10', 1], ['2027-01-21', 1], ['2027-03-18', 1], ['2027-04-22', 1], ['2027-06-10', 1], ['2027-07-22', 0], ['2027-09-09', 0], ['2027-10-21', 0], ['2027-12-09', 0], ['2028-01-20', 0], ['2028-03-16', 0], ['2028-04-20', 0], ['2028-06-08', 0], ['2028-07-20', 0], ['2028-09-07', 0], ['2028-10-19', 0], ['2028-12-07', 0]];
  const H_DAYS = 745;
  // rate conversions (rates in %, c = continuously compounded decimal)
  const onToC = (on) => 365 * Math.log(1 + on / 36500);
  const cToOn = (c) => (Math.exp(c / 365) - 1) * 36500;
  const wkToOn = (w) => 365 * (Math.pow(1 + w * 7 / 36500, 1 / 7) - 1) * 100;
  const onToWk = (on) => (Math.pow(1 + on / 36500, 7) - 1) * 36500 / 7;
  const effToOn = (y) => 365 * (Math.pow(1 + y / 100, 1 / 365) - 1) * 100;
  window.OISconv = { wkToOn, onToWk, effToOn };
  ['bills_hist', 'rates_hist'].forEach((id) => dash.loader(id, { description: '', fn: window.TTparse.md() }));
  const mergeBills = (h, b) => { const m = {}; (h || []).concat(b || []).forEach((r) => { if (!r || !r.tarih) return; m[r.tarih] = Object.assign(m[r.tarih] || { tarih: r.tarih }, ...Object.keys(r).filter((k) => /^TRB/.test(k) && isN(r[k])).map((k) => ({ [k]: r[k] }))); }); return Object.values(m).sort((a, b2) => a.tarih < b2.tarih ? -1 : 1); };
  const mergeRates = (h, r) => { const m = {}; (h || []).forEach((x) => { if (isN(x.APIFON4)) m[x.tarih] = { tarih: x.tarih, tlref: isN(x.BISTTLREF_ORAN) ? x.BISTTLREF_ORAN : null, aofm: x.APIFON4 }; }); (r || []).forEach((x) => { if (isN(x.aofm)) m[x.tarih] = { tarih: x.tarih, tlref: isN(x.tlref) ? x.tlref : null, aofm: x.aofm }; }); return Object.values(m).sort((a, b) => a.tarih < b.tarih ? -1 : 1); };

  function solve(A, b) {
    const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]]; if (Math.abs(M[c][c]) < 1e-14) return null;
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[n] / r[i]);
  }

  // Bootstrap the path. obs: [{d: days, ldf: ln DF, w}], stubOn: expected O/N until the first meeting (daily comp %)
  function bootstrap(t0, obs, stubOn) {
    const meets = MPC.map(([d, off]) => ({ date: d, off, d: Math.round((T(d) - t0) / DAY) })).filter((m) => m.d > 0 && m.d < H_DAYS);
    if (!meets.length || !obs.length) return null;
    const b = meets.map((m) => m.d).concat([H_DAYS]), K = meets.length, sc = onToC(stubOn);
    const ov = (d, k) => Math.max(0, Math.min(d, b[k + 1]) - b[k]) / 365; // years of period k inside [0, d]
    const A = Array.from({ length: K }, () => Array(K).fill(0)), y = Array(K).fill(0);
    obs.forEach((o) => {
      const a = meets.map((_, k) => ov(o.d, k)); const rhs = -o.ldf - sc * Math.min(o.d, b[0]) / 365; const w2 = o.w * o.w;
      for (let i = 0; i < K; i++) { y[i] += w2 * a[i] * rhs; for (let j = 0; j < K; j++) A[i][j] += w2 * a[i] * a[j]; }
    });
    const lam = 0.06; // smoothness between consecutive meetings
    for (let k = 1; k < K; k++) { A[k][k] += lam; A[k - 1][k - 1] += lam; A[k][k - 1] -= lam; A[k - 1][k] -= lam; }
    const lam0 = 0.06; A[0][0] += lam0; y[0] += lam0 * sc; // tie the first period loosely to the stub
    const f = solve(A, y); if (!f) return null;
    const fit = obs.map((o) => { const c = sc * Math.min(o.d, b[0]) / 365 + meets.reduce((s, _, k) => s + f[k] * ov(o.d, k), 0); return { d: o.d, w: o.w, mkt: R2(cToOn(-o.ldf / o.d * 365)), model: R2(cToOn(c / o.d * 365)) }; });
    return { meets: meets.map((m, k) => Object.assign({}, m, { on: cToOn(f[k]) })), fit, stubOn };
  }

  const billObs = (row, t0) => row ? Object.keys(row).filter((k) => /^TRB\d{6}/.test(k) && isN(row[k])).map((k) => { const d = Math.round((FI.mat(k) - t0) / DAY); return { kod: k, d, ldf: Math.log(row[k] / 100), w: 12, price: row[k] }; }).filter((o) => o.d >= 7) : [];
  const curveObs = (grid, minD) => (grid || []).filter((g) => g.tenor * 365 > minD + 25 && g.tenor * 365 <= H_DAYS).map((g) => ({ d: Math.round(g.tenor * 365), ldf: -g.tenor * Math.log(1 + g.yield / 100), w: 1, src: 'curve' }));
  const sortRows = (rs) => (rs || []).slice().sort((a, b) => a.tarih < b.tarih ? -1 : 1);
  const asOfRow = (rs, d, keyTest) => { const r = sortRows(rs).filter((x) => x.tarih <= d && keyTest(x)); return r[r.length - 1] || null; };

  dash.calc('ois_path', { inputs: ['bills', 'fi_curves', 'rates', 'pka', 'ois_hist'], title: 'ois_path', fn: (bills, curves, rates, pka, hist) => {
    const done = (hist || []).filter((r) => r.gap_bp != null); const lastDone = done.length ? T(done[done.length - 1].date) : 0;
    const recent = done.filter((r) => T(r.date) > lastDone - 182 * DAY); const gap = recent.length ? d3.median(recent, (r) => r.gap_bp) : null;
    const hasBill = (r) => Object.keys(r).some((k) => /^TRB/.test(k) && isN(r[k]));
    const rr = sortRows(rates).filter((r) => isN(r.tlref) && isN(r.aofm));
    const build = (label, curveName, gapBp) => {
      const g = (curves || []).filter((c) => c.curve === curveName); if (!g.length) return null;
      const date = g[0].date; const brow = asOfRow(bills, date, hasBill); if (!brow) return null;
      const t0 = T(brow.tarih);
      const rhist = rr.filter((r) => r.tarih <= date).slice(-20); if (!rhist.length) return null;
      const aofm = rhist[rhist.length - 1].aofm, aOn = wkToOn(aofm);
      const basis = d3.median(rhist, (r) => r.tlref - wkToOn(r.aofm)); // TLREF vs AWFC on an overnight basis
      const bo = billObs(brow, t0).map((o) => gapBp ? Object.assign({}, o, { ldf: o.ldf + gapBp / 1e4 * o.d / 365 }) : o); const lastBill = d3.max(bo, (o) => o.d) || 0;
      const obs = bo.concat(curveObs(g, lastBill));
      const res = bootstrap(t0, obs, aOn + basis); if (!res) return null;
      let prev = aofm;
      const meets = res.meets.map((m) => { const pol = onToWk(m.on - basis); const o = { date: m.date, official: !!m.off, days: m.d, on: R2(m.on), policy: R2(pol), chg_bp: Math.round((pol - prev) * 100), cum_bp: Math.round((pol - aofm) * 100), src: m.d <= lastBill ? 'bills' : 'bond curve' }; prev = pol; return o; });
      return { label, date: brow.tarih, t0, aofm, aofm_on: R2(aOn), basis_bp: Math.round(basis * 100), tlref: rhist[rhist.length - 1].tlref, stub_on: R2(aOn + basis), last_bill_days: lastBill, last_bill_date: iso(t0 + lastBill * DAY), meets, fit: res.fit, bills: bo };
    };
    const now = build('Today', 'Today'), ago = build('1M ago', '1M ago');
    const p = sortRows(pka).filter((r) => isN(r.ppk_ilk)).pop() || null;
    return [{ now, ago, survey: p, gap_bp: gap != null ? Math.round(gap) : null, gap_n: recent.length, gap_all: done.length ? Math.round(d3.median(done, (r) => r.gap_bp)) : null, gap_from: recent.length ? recent[0].date : null, gap_to: recent.length ? recent[recent.length - 1].date : null }];
  } });

  // Curve in overnight terms: bills, bonds, fitted curve and the path-implied average
  dash.calc('ois_curve', { inputs: ['egri', 'fi_bonds', 'fi_curves', 'ois_path'], title: 'ois_curve', fn: (egri, bonds, curves, path) => {
    const out = [];
    (egri || []).forEach((b) => out.push({ kind: 'Bill', code: b.kod, maturity: b.vade, days: b.gun, price: b.fiyat, simple: b.ois_esdegeri, on: b.ima_ortalama_on, fwd: b.ima_forward_on }));
    (bonds || []).filter((b) => b.type === 'Bond' && b.years <= 3.2).forEach((b) => out.push({ kind: 'Bond', code: b.isin, maturity: b.maturity, days: Math.round(b.years * 365), price: b.price, coupon: b.coupon, ytm: b.ytm, on: R2(effToOn(b.ytm)) }));
    (curves || []).filter((c) => c.curve === 'Today' && c.tenor <= 3).forEach((c) => out.push({ kind: 'Fitted', days: Math.round(c.tenor * 365), on: R2(effToOn(c.yield)) }));
    const P = path && path[0] && path[0].now;
    if (P) { // average O/N implied by the fitted step path, to show fit quality
      const b = P.meets.map((m) => m.days); const stub = P.stub_on;
      for (let d = 15; d <= Math.min(H_DAYS, 3 * 365); d += 15) {
        let c = onToC(stub) * Math.min(d, b[0]); P.meets.forEach((m, k) => { const e = k + 1 < b.length ? b[k + 1] : H_DAYS; c += onToC(m.on) * Math.max(0, Math.min(d, e) - m.days); });
        out.push({ kind: 'Path', days: d, on: R2(cToOn(c / d)) });
      }
    }
    return out.sort((a, b) => a.days - b.days);
  } });

  // 3-month constant-maturity bill-implied O/N, its track record against the TLREF that was actually realised
  dash.calc('ois_hist', { inputs: ['bills_hist', 'bills', 'rates_hist', 'rates'], title: 'ois_hist', fn: (bh, bills, rh, rates) => {
    const R = mergeRates(rh, rates); if (!R.length) return [];
    const lastT = T(R[R.length - 1].tarih);
    // daily carry-forward series of TLREF and AWFC (overnight equivalent) by calendar day
    const day = {}; let ti = 0, cur = null;
    for (let t = T(R[0].tarih); t <= lastT; t += DAY) { while (ti < R.length && T(R[ti].tarih) <= t) { const r = R[ti]; cur = { tl: isN(r.tlref) ? r.tlref : (cur ? cur.tl : null), aw: wkToOn(r.aofm) }; ti++; } day[t] = cur; }
    const N = 91;
    return mergeBills(bh, bills).map((row) => {
      const t0 = T(row.tarih); const o = billObs(row, t0).sort((a, b2) => a.d - b2.d); if (!o.length) return null;
      let ldf; const lo = o.filter((x) => x.d <= N).pop(), hi = o.find((x) => x.d >= N);
      if (lo && hi && hi.d !== lo.d) ldf = lo.ldf + (hi.ldf - lo.ldf) * (N - lo.d) / (hi.d - lo.d); else { const x = hi || lo; ldf = x.ldf / x.d * N; }
      const on = cToOn(-ldf / N * 365); const d0 = day[t0];
      let real = null; if (t0 + (N - 1) * DAY <= lastT) { let sum = 0, k = 0; for (let i = 0; i < N; i++) { const v = day[t0 + i * DAY]; if (v && isN(v.tl)) { sum += onToC(v.tl); k++; } } if (k > N * 0.9) real = cToOn(sum / k); }
      return { date: row.tarih, cm3: R2(on), tlref: d0 ? d0.tl : null, aofm_on: d0 ? R2(d0.aw) : null, spread_bp: d0 ? Math.round((on - d0.aw) * 100) : null, real3: R2(real), gap_bp: real != null ? Math.round((on - real) * 100) : null };
    }).filter(Boolean);
  } });
})();

(function () {
  const L = d3.formatLocale({ decimal: '.', thousands: ',', grouping: [3], currency: ['', ''] });
  const N = (v, d) => v == null || isNaN(v) ? '—' : L.format(',.' + (d == null ? 2 : d) + 'f')(v);
  const isN = (v) => typeof v === 'number' && isFinite(v);
  const sgn = (v) => v > 0 ? '+' : v < 0 ? '−' : '±';
  const BP = (v) => isN(v) ? sgn(v) + N(Math.abs(v), 0) : '—';
  const rows = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : []; };
  const tone = (el, v) => { el.classList.toggle('up', isN(v) && v > 0.004); el.classList.toggle('dn', isN(v) && v < -0.004); };
  const cell = (tr, text, cls) => { const td = tr.insertCell(); td.textContent = text; if (cls) td.className = cls; return td; };
  const P = () => (rows('ois_path')[0] || {});
  const D = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z');
  const fmtD = d3.utcFormat('%d %b %y'), fmtDs = d3.utcFormat('%d %b');
  const kv = (name, fn) => dash.draw(name, (el) => { const r = fn(); el.textContent = r && r.text != null ? r.text : '—'; if (r && 'tone' in r) tone(el, r.tone); });
  const at = (p, months) => { if (!p || !p.meets.length) return null; const t = p.t0 + months * 30.44 * 864e5; const m = p.meets.filter((x) => D(x.date) <= t).pop(); return m || null; };

  // KPIs and summary
  kv('ois-k-awfc-c', () => { const p = P().now; return p && { text: 'O/N equivalent ' + N(p.aofm_on) + '%' }; });
  kv('ois-k-gap', () => { const p = P(); return isN(p.gap_bp) && { text: BP(p.gap_bp) + ' bp', tone: p.gap_bp }; });
  kv('ois-k-gap-c', () => { const p = P(); return isN(p.gap_bp) && { text: '3M bills vs realised TLREF · 6M median · 1Y ' + BP(p.gap_all) }; });
  kv('ois-k-m1', () => { const p = P().now; const m = p && p.meets[0]; return m && { text: BP(m.chg_bp) + ' bp', tone: -m.chg_bp }; });
  kv('ois-k-m1-c', () => { const p = P(); const m = p.now && p.now.meets[0]; return m && { text: 'priced for ' + fmtDs(D(m.date)) + ' MPC · survey ' + (p.survey ? BP(Math.round((p.survey.ppk_ilk - p.now.aofm) * 100)) + ' bp' : '—') }; });
  kv('ois-k-6m', () => { const m = at(P().now, 6.5); return m && { text: BP(m.cum_bp) + ' bp', tone: -m.cum_bp }; });
  kv('ois-k-6m-c', () => { const m = at(P().now, 6.5); return m && { text: 'cumulative to ' + fmtD(D(m.date)) + ' · policy ' + N(m.policy) + '%' }; });
  kv('ois-k-12', () => { const m = at(P().now, 12); return m && { text: N(m.policy) + '%' }; });
  kv('ois-k-12-c', () => { const p = P(); const m = at(p.now, 12); return m && { text: 'market policy in 12M · survey ' + (p.survey ? N(p.survey.ppk_12a) + '%' : '—'), tone: p.survey ? p.survey.ppk_12a - m.policy : null }; });
  dash.draw('ois-sum', (el) => {
    const p = P(), n = p.now; el.replaceChildren(); if (!n) { el.textContent = 'Not enough market data to build the policy path.'; return; }
    const m1 = n.meets[0], m6 = at(n, 6.5), m12 = at(n, 12), s = p.survey;
    const k = document.createElement('span'); k.className = 'k'; k.textContent = 'SUMMARY'; el.appendChild(k);
    const add = (t, b) => { const e = document.createElement(b ? 'b' : 'span'); e.textContent = t; el.appendChild(e); };
    add('CBRT funding rate '); add(N(n.aofm) + '%', 1); add(' (TLREF ' + N(n.tlref) + '%). Bills and bonds price '); add(BP(m1.chg_bp) + ' bp', 1); add(' at the ' + fmtDs(D(m1.date)) + ' meeting');
    if (m6) { add(', '); add(BP(m6.cum_bp) + ' bp', 1); add(' in total by ' + fmtD(D(m6.date))); }
    if (m12) { add(' and a policy rate of '); add(N(m12.policy) + '%', 1); add(' in a year'); }
    add('. Survey: '); add(s ? N(s.ppk_ilk) + '%' : '—', 1); add(' at the next meeting, '); add(s ? N(s.ppk_12a) + '%' : '—', 1); add(' in 12 months.');
    if (isN(p.gap_bp)) { add(' Caution: over the past six months of completed windows, bills priced the 3-month overnight rate '); add(Math.abs(p.gap_bp) + ' bp', 1); add(' below what TLREF then averaged, so near-term cuts look larger than they probably are; beyond March 2027 the path comes from bonds and includes term premium.'); }
  });

  // OIS 1: policy path chart
  dash.draw('ois-path', (el) => {
    d3.select(el).selectAll('*').remove();
    const p = P(), n = p.now; if (!n) { el.innerHTML = '<div class="tt-empty">No data.</div>'; return; }
    const lg = d3.select(el).append('div').attr('class', 'tt-legend');
    [['Market-implied', '#ffd23c'], ['1 month ago', '#8a8a8a', 1], ['Next 3M, adjusted for the usual bill gap', '#ff8c3c', 1], ['Survey (CBRT SMP)', '#3cc8f0'], ['CBRT funding rate', '#5a5a5a', 1]].forEach(([t, c, d]) => lg.append('span').attr('class', d ? 'dash' : null).style('--sw', c).text(t));
    const W = Math.max(320, el.clientWidth), H = 320, m = { t: 22, r: 16, b: 36, l: 44 };
    const t0 = n.t0, tEnd = t0 + 745 * 864e5;
    const step = (q) => { if (!q) return []; const v = [{ x: new Date(q.t0), y: q.aofm }]; q.meets.forEach((x) => v.push({ x: D(x.date), y: x.policy })); v.push({ x: new Date(Math.max(tEnd, q.t0)), y: q.meets.length ? q.meets[q.meets.length - 1].policy : q.aofm }); return v; };
    const clip = (v) => { if (!v.length) return v; const before = v.filter((q) => +q.x <= t0).pop(); return [{ x: new Date(t0), y: before ? before.y : v[0].y }].concat(v.filter((q) => +q.x > t0)); };
    const sv = step(n), sa = p.ago ? clip(step(p.ago)) : [], hl = rows('ois_hist').slice(-1)[0], g3 = isN(p.gap_bp) && hl ? window.OISconv.onToWk(hl.cm3 - p.gap_bp / 100 - n.basis_bp / 100) : null, sj = isN(g3) ? [{ x: new Date(t0), y: g3 }, { x: new Date(t0 + 91 * 864e5), y: g3 }] : [];
    const s = p.survey, sd = s ? D(s.tarih) : null;
    const surv = s ? [{ x: new Date(t0), y: n.aofm, lab: '' }, { x: D(n.meets[0].date), y: s.ppk_ilk, lab: 'next MPC ' + N(s.ppk_ilk) }, { x: new Date(Date.UTC(sd.getUTCFullYear(), 11, 31)), y: s.ppk_ys, lab: 'year-end ' + N(s.ppk_ys) }, { x: new Date(Date.UTC(sd.getUTCFullYear() + 1, sd.getUTCMonth(), 1)), y: s.ppk_12a, lab: '12M ' + N(s.ppk_12a) }].filter((v) => +v.x >= t0).sort((a, b) => a.x - b.x) : [];
    for (let i = surv.length - 1; i > 1; i--) if (surv[i].x - surv[i - 1].x < 40 * 864e5 && Math.abs(surv[i].y - surv[i - 1].y) < 0.3) { surv[i - 1].lab = surv[i - 1].lab.replace(/ [\d.]+$/, '') + ' / ' + surv[i].lab; surv.splice(i, 1); }
    const ys = sv.concat(sa, sj, surv).map((v) => v.y).concat([n.aofm]);
    const y = d3.scaleLinear().domain([d3.min(ys) - 1, d3.max(ys) + 1]).nice().range([H - m.b, m.t]);
    const x = d3.scaleUtc().domain([new Date(t0 - 3 * 864e5), new Date(tEnd)]).range([m.l, W - m.r]);
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'Market-implied CBRT policy path');
    const lb = n.t0 + n.last_bill_days * 864e5;
    svg.append('rect').attr('x', x(new Date(lb))).attr('y', m.t).attr('width', Math.max(0, W - m.r - x(new Date(lb)))).attr('height', H - m.b - m.t).style('fill', '#ffffff').style('opacity', 0.025);
    svg.append('text').attr('x', x(new Date(lb)) + 6).attr('y', m.t + 11).style('fill', '#6a6a6a').style('font-size', '10px').text('beyond the last bill (' + fmtDs(new Date(lb)) + '): fitted bond curve, approximate');
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(W - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((v) => v + '%'));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(d3.utcMonth.every(3)).tickFormat(d3.utcFormat('%b %y')).tickSizeOuter(0));
    // meeting markers
    const mg = svg.append('g');
    n.meets.forEach((mt) => { const xx = x(D(mt.date)); mg.append('line').attr('x1', xx).attr('x2', xx).attr('y1', m.t).attr('y2', H - m.b).style('stroke', mt.official ? '#3a3a3a' : '#262626').style('stroke-dasharray', mt.official ? null : '2 3'); });
    svg.append('text').attr('x', W - m.r).attr('y', H - 4).attr('text-anchor', 'end').style('fill', '#6a6a6a').style('font-size', '10px').text('vertical lines: MPC meetings (solid official, dotted assumed after Jun 2027)');
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(n.aofm)).attr('y2', y(n.aofm)).style('stroke', '#6a6a6a').style('stroke-dasharray', '5 3');
    svg.append('text').attr('x', W - m.r - 4).attr('y', y(n.aofm) - 4).attr('text-anchor', 'end').style('fill', '#8a8a8a').style('font-size', '10px').text('funding rate today ' + N(n.aofm) + '%');
    const line = d3.line().x((d) => x(d.x)).y((d) => y(d.y)).curve(d3.curveStepAfter);
    if (sa.length) svg.append('path').datum(sa).attr('d', line).style('fill', 'none').style('stroke', '#8a8a8a').style('stroke-width', 1.4).style('stroke-dasharray', '5 3');
    if (sj.length) { svg.append('path').datum(sj).attr('d', d3.line().x((d) => x(d.x)).y((d) => y(d.y))).style('fill', 'none').style('stroke', '#ff8c3c').style('stroke-width', 2.2).style('stroke-dasharray', '6 3'); svg.append('text').attr('x', x(sj[1].x) + 4).attr('y', y(g3) + 3).style('fill', '#ff8c3c').style('font-size', '10px').text(N(g3) + '% avg (gap ' + BP(p.gap_bp) + ' bp removed)'); }
    const pth = svg.append('path').datum(sv).attr('d', line).style('fill', 'none').style('stroke', '#ffd23c').style('stroke-width', 2.6);
    if (TT.anim && TT.motion()) { const len = pth.node().getTotalLength(); pth.style('stroke-dasharray', len + ' ' + len).style('stroke-dashoffset', len).transition().duration(1400).ease(d3.easeCubicOut).style('stroke-dashoffset', 0); }
    // change labels at official meetings and every second assumed one
    n.meets.forEach((mt, i) => { if (!mt.official && i % 2) return; if (Math.abs(mt.chg_bp) < 5) return; svg.append('text').attr('x', x(D(mt.date)) + 3).attr('y', y(mt.policy) + (mt.chg_bp < 0 ? 13 : -5)).style('fill', mt.chg_bp < 0 ? '#2ee66b' : '#ff6b6b').style('font-size', '10px').text(BP(mt.chg_bp)); });
    if (surv.length) {
      svg.append('path').datum(surv).attr('d', d3.line().x((d) => x(d.x)).y((d) => y(d.y))).style('fill', 'none').style('stroke', '#3cc8f0').style('stroke-width', 1.2).style('opacity', 0.7);
      const g = svg.append('g').selectAll('g').data(surv.filter((v) => v.lab)).join('g').attr('transform', (d) => `translate(${x(d.x)},${y(d.y)})`);
      g.append('circle').attr('r', 4.5).style('fill', '#000').style('stroke', '#3cc8f0').style('stroke-width', 2);
      g.append('text').attr('x', 7).attr('y', -6).style('fill', '#3cc8f0').style('font-size', '10px').text((d) => d.lab);
    }
    // tooltip on meetings
    const tip = d3.select(el).append('div').attr('class', 'tt-tip').style('display', 'none');
    const rule = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).style('stroke', '#ffa028').style('stroke-opacity', 0.6).style('display', 'none');
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).style('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [mx] = d3.pointer(ev); const t = x.invert(mx); const mt = n.meets.filter((q) => D(q.date) <= t).pop(); if (!mt) { tip.style('display', 'none'); rule.style('display', 'none'); return; }
        const ag = p.ago ? p.ago.meets.find((q) => q.date === mt.date) : null;
        rule.style('display', null).attr('x1', x(D(mt.date))).attr('x2', x(D(mt.date)));
        tip.style('display', 'block').style('left', Math.min(mx + 14, W - 230) + 'px').style('top', '40px').html('');
        tip.append('div').attr('class', 'd').text('MPC ' + fmtD(D(mt.date)) + (mt.official ? '' : ' (assumed date)'));
        tip.append('div').text('Implied policy: ' + N(mt.policy) + '%');
        tip.append('div').text('Change at meeting: ' + BP(mt.chg_bp) + ' bp');
        tip.append('div').text('Cumulative: ' + BP(mt.cum_bp) + ' bp');
        if (ag) tip.append('div').text('1M ago: ' + N(ag.policy) + '%');
        tip.append('div').text('Source: ' + mt.src);
      }).on('mouseleave', () => { tip.style('display', 'none'); rule.style('display', 'none'); });
  });

  // OIS 2: meeting table and cumulative pricing bars
  dash.draw('ois-meet', (tb) => {
    tb.replaceChildren(); const p = P(), n = p.now; if (!n) return; const s = p.survey;
    n.meets.forEach((mt, i) => {
      const tr = tb.insertRow(); if (!mt.official) tr.style.opacity = 0.72;
      cell(tr, fmtD(D(mt.date)) + (mt.official ? '' : '*'), mt.official ? 'yl' : 'mu'); cell(tr, N(mt.days, 0), 'r mu');
      cell(tr, N(mt.policy) + '%', 'r hi'); tone(cell(tr, BP(mt.chg_bp), 'r'), -mt.chg_bp); tone(cell(tr, BP(mt.cum_bp), 'r'), -mt.cum_bp);
      const ag = p.ago ? p.ago.meets.find((q) => q.date === mt.date) : null; cell(tr, ag ? N(ag.policy) + '%' : '—', 'r mu');
      const dv = ag ? Math.round((mt.policy - ag.policy) * 100) : null; tone(cell(tr, BP(dv), 'r'), dv == null ? null : -dv);
      cell(tr, i === 0 && s ? N(s.ppk_ilk) + '%' : '—', 'r cy'); cell(tr, mt.src, 'mu').style.fontSize = '10px';
    });
  });
  dash.draw('ois-cum', (el) => { const n = P().now; if (!n) return; TT.bars(el, n.meets.map((m) => ({ x: D(m.date), y: m.cum_bp }))
    , { label: 'Cumulative change priced vs today\'s funding rate (bp)', color: '#2ee66b', signColor: true, height: 170, yFmt: (v) => N(v, 0), tipFmt: (v) => BP(v) + ' bp' }); });

  // OIS 3: curve in overnight terms
  dash.draw('ois-curve', (el) => {
    const c = rows('ois_curve'), n = P().now; if (!c.length) return;
    const yr = (d) => d / 365;
    const ser = [
      { name: 'Fitted bond curve', color: '#8a8a8a', width: 1.4, dash: true, values: c.filter((r) => r.kind === 'Fitted').map((r) => ({ x: yr(r.days), y: r.on })) },
      { name: 'Step path (model)', color: '#ffd23c', width: 2, values: c.filter((r) => r.kind === 'Path').map((r) => ({ x: yr(r.days), y: r.on })) },
      { name: 'Bonds', color: '#ff6b6b', dots: true, width: 0, values: c.filter((r) => r.kind === 'Bond').map((r) => ({ x: yr(r.days), y: r.on })) },
      { name: 'Bills', color: '#3cc8f0', dots: true, width: 0, values: c.filter((r) => r.kind === 'Bill').map((r) => ({ x: yr(r.days), y: r.on })) }];
    if (n) ser.push({ name: 'AWFC (O/N equiv.)', color: '#5a5a5a', dash: true, width: 1, values: [{ x: 0, y: n.aofm_on }, { x: 3, y: n.aofm_on }] });
    TT.xy(el, ser, { height: 250, xFmt: (v) => v === 0 ? '0' : v < 1 ? Math.round(v * 12) + 'M' : N(v, Math.abs(v - Math.round(v)) < 0.01 ? 0 : 1) + 'Y', yFmt: (v) => N(v, 0) + '%', tipX: (v) => N(v * 12, 1) + ' months', tipY: (v) => N(v, 2) + '%' });
  });
  dash.draw('ois-curve-t', (tb) => {
    tb.replaceChildren();
    rows('ois_curve').filter((r) => r.kind === 'Bill' || r.kind === 'Bond').forEach((r) => {
      const tr = tb.insertRow(); cell(tr, r.code, r.kind === 'Bill' ? 'cy' : 'hi'); cell(tr, r.kind === 'Bill' ? 'discount' : N(r.coupon, 1) + '%', 'mu'); cell(tr, fmtD(D(r.maturity)), ''); cell(tr, N(r.days, 0), 'r mu'); cell(tr, N(r.price, 3), 'r');
      cell(tr, r.kind === 'Bill' ? N(r.simple) + '%' : N(r.ytm) + '%', 'r'); cell(tr, N(r.on) + '%', 'r yl');
    });
  });

  // OIS 4: track record of bill pricing
  dash.draw('ois-hist', (el) => {
    const h = rows('ois_hist'); if (!h.length) return;
    TT.chart(el, [
      { name: '3M bill-implied O/N (priced on the day)', color: '#ffd23c', width: 2, values: h.map((r) => ({ x: D(r.date), y: r.cm3 })) },
      { name: 'TLREF actually averaged over the next 3M', color: '#ffffff', width: 1.8, values: h.filter((r) => isN(r.real3)).map((r) => ({ x: D(r.date), y: r.real3 })) },
      { name: 'TLREF daily', color: '#ffa028', width: 1, values: h.filter((r) => isN(r.tlref)).map((r) => ({ x: D(r.date), y: r.tlref })) },
      { name: 'AWFC (O/N equiv.)', color: '#8a8a8a', width: 1.2, dash: true, step: true, values: h.filter((r) => isN(r.aofm_on)).map((r) => ({ x: D(r.date), y: r.aofm_on })) }],
    { height: 230, yFmt: (v) => N(v, 0) + '%', tipFmt: (v) => N(v) + '%' });
  });
  dash.draw('ois-spread', (el) => {
    const h = rows('ois_hist'); if (!h.length) return;
    const v = h.map((r) => ({ x: D(r.date), y: isN(r.gap_bp) ? r.gap_bp : r.spread_bp, open: !isN(r.gap_bp) }));
    d3.select(el).selectAll('*').remove();
    const lg = d3.select(el).append('div').attr('class', 'tt-legend'); lg.append('span').style('--sw', '#ff4545').text('Pricing error: implied minus realised 3M TLREF (bp)'); lg.append('span').style('--sw', '#5a5a5a').text('Outcome not known yet: implied minus current AWFC');
    const d = v.filter((r) => isN(r.y)); const W = Math.max(300, el.clientWidth), H = 140, m = { t: 6, r: 14, b: 22, l: 44 };
    const x = d3.scaleUtc().domain(d3.extent(d, (r) => r.x)).range([m.l, W - m.r]); const y = d3.scaleLinear().domain([Math.min(0, d3.min(d, (r) => r.y)), Math.max(0, d3.max(d, (r) => r.y))]).nice().range([H - m.b, m.t]);
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'Pricing error');
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((q) => N(q, 0)));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(d3.utcFormat('%b %y')).tickSizeOuter(0));
    const bw = Math.max(1, (W - m.l - m.r) / d.length * 0.8);
    svg.append('g').selectAll('rect').data(d).join('rect').attr('x', (r) => x(r.x) - bw / 2).attr('width', bw).attr('y', (r) => y(Math.max(0, r.y))).attr('height', (r) => Math.abs(y(r.y) - y(0))).style('fill', (r) => r.open ? '#5a5a5a' : r.y < 0 ? '#ff4545' : '#2ee66b');
  });

  // OIS 5: survey history with the actual policy rate
  dash.draw('ois-survey', (el) => {
    const pk = rows('pka').filter((r) => isN(r.ppk_ilk)).sort((a, b) => a.tarih < b.tarih ? -1 : 1); if (!pk.length) return;
    const pol = rows('polrates1').filter((r) => isN(r.BISPOLFAIZ_TUR)).sort((a, b) => a.tarih < b.tarih ? -1 : 1);
    const yrs = Array.from(new Set(pk.map((r) => r.tarih.slice(0, 4))));
    const cols = ['#3cc8f0', '#2ee66b', '#c86bff'];
    const ser = [{ name: 'Actual policy rate (BIS)', color: '#ffffff', width: 2, step: true, values: pol.map((r) => ({ x: D(r.tarih), y: r.BISPOLFAIZ_TUR })) },
      { name: 'Expected at next MPC', color: '#ffa028', width: 1.6, values: pk.map((r) => ({ x: D(r.tarih), y: r.ppk_ilk })) }];
    yrs.forEach((yy, i) => ser.push({ name: 'Expected end-' + yy, color: cols[i % 3], width: 1.6, values: pk.filter((r) => r.tarih.slice(0, 4) === yy).map((r) => ({ x: D(r.tarih), y: r.ppk_ys })) }));
    ser.push({ name: 'Expected in 12 months', color: '#c86bff', width: 1.4, dash: true, values: pk.map((r) => ({ x: D(r.tarih), y: r.ppk_12a })) });
    TT.chart(el, ser, { height: 250, yFmt: (v) => N(v, 0) + '%', tipFmt: (v) => N(v) + '%' });
  });
})();
