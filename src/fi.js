// ===================== FIXED INCOME =====================
// Bond math, Nelson-Siegel curve fitting, loaders, calculations and drawings for the Fixed Income page.
(function () {
  const P = window.TTparse;
  ['bonds', 'coupons1', 'coupons2', 'funding', 'frn', 'frn_coupons'].forEach((id) => dash.loader(id, { description: '', fn: P.md(null) }));
  dash.loader('polrates1', { description: '', fn: P.md(null) });
  dash.loader('polrates2', { description: '', fn: P.md(null) });
  dash.loader('nonres', { description: '', fn: P.md({ TP_MKNETHAR_M2: 'gdds_stock', TP_MKNETHAR_M8: 'gdds_flow', TP_MKNETHAR_M1: 'equity_stock', TP_MKNETHAR_M16: 'eurobond_stock' }) });
})();

window.FI = (function () {
  const DAY = 864e5;
  const mat = (isin) => { const m = /^TR[TB](\d{2})(\d{2})(\d{2})/.exec(isin); return m ? Date.UTC(2000 + +m[3], +m[2] - 1, +m[1]) : null; };
  const addMonths = (t, k) => { const d = new Date(t); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + k); const dim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, dim)); return d.getTime(); };
  // Remaining cash flows per 100 nominal. cpnSemi: semi-annual coupon in % of par (0 for discount bills)
  function flows(isin, cpnSemi, t0) {
    const T = mat(isin); if (!T || T <= t0) return [];
    if (!cpnSemi) return [{ t: T, cf: 100 }];
    // Turkish Treasury bonds pay coupons every 182 days counted back from maturity
    const out = []; let k = 0, d = T;
    while (d > t0) { out.unshift({ t: d, cf: cpnSemi + (k === 0 ? 100 : 0) }); k++; d = T - k * 182 * DAY; }
    return out;
  }
  const pv = (y, fl, t0) => fl.reduce((s, f) => s + f.cf / Math.pow(1 + y, (f.t - t0) / DAY / 365), 0);
  function ytm(price, fl, t0) {
    if (!fl.length || !(price > 0)) return null;
    let lo = -0.5, hi = 5;
    for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (pv(mid, fl, t0) > price) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  function risk(y, fl, t0) {
    const P0 = pv(y, fl, t0); let mac = 0, cx = 0;
    fl.forEach((f) => { const t = (f.t - t0) / DAY / 365; const v = f.cf / Math.pow(1 + y, t); mac += t * v; cx += t * (t + 1) * v / Math.pow(1 + y, 2); });
    mac /= P0; cx /= P0;
    const mod = mac / (1 + y);
    return { price: P0, mac, mod, conv: cx, dv01: mod * P0 * 1e-4 };
  }
  // Nelson-Siegel: y(t) = b0 + b1*f1 + b2*f2 ; grid search on tau, OLS for betas
  const nsF = (t, tau) => { const x = t / tau; const f1 = x < 1e-8 ? 1 : (1 - Math.exp(-x)) / x; return [1, f1, f1 - Math.exp(-x)]; };
  function solve3(A, b) {
    const M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < 3; c++) {
      let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]]; if (Math.abs(M[c][c]) < 1e-12) return null;
      for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
    }
    return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  }
  function nsFit(pts) {
    if (pts.length < 4) return null;
    let best = null;
    for (let tau = 0.2; tau <= 8; tau += 0.1) {
      const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
      pts.forEach((p) => { const f = nsF(p.t, tau); for (let i = 0; i < 3; i++) { b[i] += f[i] * p.y; for (let j = 0; j < 3; j++) A[i][j] += f[i] * f[j]; } });
      const beta = solve3(A, b); if (!beta) continue;
      const sse = pts.reduce((s, p) => { const f = nsF(p.t, tau); const e = p.y - (beta[0] + beta[1] * f[1] + beta[2] * f[2]); return s + e * e; }, 0);
      if (!best || sse < best.sse) best = { tau, beta, sse };
    }
    if (!best) return null;
    const fn = (t) => { const f = nsF(t, best.tau); return best.beta[0] + best.beta[1] * f[1] + best.beta[2] * f[2]; };
    return { tau: best.tau, b0: best.beta[0], b1: best.beta[1], b2: best.beta[2], rmse: Math.sqrt(best.sse / pts.length), y: fn };
  }
  return { DAY, mat, flows, pv, ytm, risk, nsFit };
})();

(function () {
  const R2 = (v) => v == null || isNaN(v) ? null : Math.round(v * 100) / 100;
  const DAY = FI.DAY;
  const parseT = (s) => Date.parse(s + 'T00:00:00Z');
  const couponMap = (c1, c2) => { const m = {}; [c1, c2].forEach((rs) => { const last = (rs || []).slice().sort((a, b) => a.tarih < b.tarih ? -1 : 1).pop(); if (last) Object.keys(last).forEach((k) => { if (k !== 'tarih' && typeof last[k] === 'number') m[k.replace(/_ORAN$/, '')] = last[k]; }); }); return m; };
  // Yields of every bond and bill for one date row
  function yieldsOn(row, cpn, billRow) {
    const t0 = parseT(row.tarih), out = [];
    Object.keys(row).forEach((k) => {
      if (k === 'tarih' || typeof row[k] !== 'number') return;
      const c = cpn[k]; if (c == null) return;
      const fl = FI.flows(k, c, t0); const y = FI.ytm(row[k], fl, t0);
      if (y != null && fl.length) out.push({ isin: k, type: 'Bond', t: (fl[fl.length - 1].t - t0) / DAY / 365, y, price: row[k], fl, t0, cpn: c * 2 });
    });
    if (billRow) Object.keys(billRow).forEach((k) => {
      if (!/^TRB/.test(k) || typeof billRow[k] !== 'number') return;
      const tb = parseT(billRow.tarih); const fl = FI.flows(k, 0, tb); if (!fl.length) return;
      const t = (fl[0].t - tb) / DAY / 365; if (t < 7 / 365) return;
      out.push({ isin: k, type: 'Bill', t, y: Math.pow(100 / billRow[k], 1 / t) - 1, price: billRow[k], fl, t0: tb, cpn: 0 });
    });
    return out.sort((a, b) => a.t - b.t);
  }
  const sortedRows = (rs) => (rs || []).filter((r) => Object.keys(r).some((k) => k !== 'tarih' && typeof r[k] === 'number')).sort((a, b) => a.tarih < b.tarih ? -1 : 1);
  const nearestBill = (bills, d) => { const b = sortedRows(bills).filter((r) => r.tarih <= d); return b[b.length - 1] || null; };

  dash.calc('fi_bonds', { inputs: ['bonds', 'coupons1', 'coupons2', 'bills'], title: 'fi_bonds', fn: (bonds, c1, c2, bills) => {
    const rows = sortedRows(bonds); if (!rows.length) return [];
    const cpn = couponMap(c1, c2);
    const L = rows.length - 1;
    const at = (i) => { const r = rows[Math.max(0, i)]; return yieldsOn(r, cpn, nearestBill(bills, r.tarih)); };
    const now = at(L), d1 = at(L - 1), w1 = at(L - 5), m1 = at(0);
    const fit = FI.nsFit(now.map((p) => ({ t: p.t, y: p.y * 100 })));
    const by = (arr, isin) => (arr.find((x) => x.isin === isin) || {}).y;
    return now.map((p) => {
      const r = FI.risk(p.y, p.fl, p.t0);
      const ch = (arr) => { const v = by(arr, p.isin); return v == null ? null : Math.round((p.y - v) * 1e4); };
      return { isin: p.isin, type: p.type, date: rows[L].tarih, maturity: new Date(FI.mat(p.isin)).toISOString().slice(0, 10), years: R2(p.t), coupon: p.cpn ? R2(p.cpn) : null, price: p.price, ytm: R2(p.y * 100), simple: R2((p.type === 'Bill' ? (Math.pow(1 + p.y, p.t) - 1) / p.t : 2 * (Math.sqrt(1 + p.y) - 1)) * 100), mod_dur: R2(r.mod), mac_dur: R2(r.mac), convexity: R2(r.conv), dv01: Math.round(r.dv01 * 1e4), chg_1d: ch(d1), chg_1w: ch(w1), chg_1m: ch(m1), rich_cheap: fit ? Math.round((p.y * 100 - fit.y(p.t)) * 100) : null };
    });
  } });

  // Fitted curves today / 1W / 1M and the tenor matrix
  dash.calc('fi_curves', { inputs: ['bonds', 'coupons1', 'coupons2', 'bills'], title: 'fi_curves', fn: (bonds, c1, c2, bills) => {
    const rows = sortedRows(bonds); if (!rows.length) return [];
    const cpn = couponMap(c1, c2); const L = rows.length - 1;
    const fits = [['Today', L], ['1D ago', L - 1], ['1W ago', L - 5], ['1M ago', 0]].map(([name, i]) => {
      const r = rows[Math.max(0, i)]; const pts = yieldsOn(r, cpn, nearestBill(bills, r.tarih));
      return { name, date: r.tarih, fit: FI.nsFit(pts.map((p) => ({ t: p.t, y: p.y * 100 }))), maxT: pts.length ? pts[pts.length - 1].t : 8 };
    });
    const out = [];
    fits.forEach((f) => { if (!f.fit) return; for (let t = 0.25; t <= Math.min(10, f.maxT + 0.01); t += 0.125) out.push({ curve: f.name, date: f.date, tenor: R2(t), yield: R2(f.fit.y(t)) }); });
    return out;
  } });

  dash.calc('fi_matrix', { inputs: ['fi_curves'], title: 'fi_matrix', fn: (curves) => {
    const c = curves || []; if (!c.length) return [];
    const at = (name, t) => { const pts = c.filter((r) => r.curve === name); if (!pts.length) return null; const p = pts.reduce((a, b) => Math.abs(b.tenor - t) < Math.abs(a.tenor - t) ? b : a); return Math.abs(p.tenor - t) < 0.2 ? p.yield : null; };
    return [['3M', 0.25], ['6M', 0.5], ['1Y', 1], ['2Y', 2], ['3Y', 3], ['5Y', 5], ['7Y', 7]].map(([lbl, t]) => {
      const y = at('Today', t); const d = (n) => { const v = at(n, t); return y == null || v == null ? null : Math.round((y - v) * 100); };
      return { tenor: lbl, years: t, yield: y, chg_1d: d('1D ago'), chg_1w: d('1W ago'), chg_1m: d('1M ago') };
    }).filter((r) => r.yield != null);
  } });

  // Benchmark (fitted) 2Y / 5Y / 7Y history
  dash.calc('fi_hist', { inputs: ['bonds', 'coupons1', 'coupons2', 'bills'], title: 'fi_hist', fn: (bonds, c1, c2, bills) => {
    const rows = sortedRows(bonds); const cpn = couponMap(c1, c2); const out = [];
    rows.forEach((r) => { const pts = yieldsOn(r, cpn, nearestBill(bills, r.tarih)); const f = FI.nsFit(pts.map((p) => ({ t: p.t, y: p.y * 100 }))); if (!f) return; [[1, '1Y'], [2, '2Y'], [5, '5Y'], [7, '7Y']].forEach(([t, n]) => out.push({ date: r.tarih, tenor: n, yield: R2(f.y(t)) })); });
    return out;
  } });

  dash.calc('fi_frn', { inputs: ['frn', 'frn_coupons'], title: 'fi_frn', fn: (frn, fc) => {
    const rows = sortedRows(frn); if (!rows.length) return [];
    const cpn = couponMap(fc, []); const last = rows[rows.length - 1], prev = rows[rows.length - 2];
    const t0 = parseT(last.tarih);
    return Object.keys(last).filter((k) => k !== 'tarih' && typeof last[k] === 'number').map((k) => {
      const T = FI.mat(k); const fl = FI.flows(k, 1, t0); const next = fl.length ? fl[0].t : null;
      return { isin: k, maturity: new Date(T).toISOString().slice(0, 10), years: R2((T - t0) / DAY / 365), price: last[k], chg_1d: prev && typeof prev[k] === 'number' ? R2(last[k] - prev[k]) : null, coupon: cpn[k] != null ? R2(cpn[k] * 2) : null, next_coupon: next ? new Date(next).toISOString().slice(0, 10) : null };
    }).sort((a, b) => a.years - b.years);
  } });

  dash.calc('fi_liq', { inputs: ['funding'], title: 'fi_liq', fn: (f) => (f || []).filter((r) => typeof r.APIFON3 === 'number').sort((a, b) => a.tarih < b.tarih ? -1 : 1).map((r) => ({ date: r.tarih, funding_bn: R2(r.APIFON1_TOP / 1000), sterilization_bn: R2(r.APIFON2_TOP / 1000), net_bn: R2(r.APIFON3 / 1000), repo_volume_bn: typeof r.IHBAP === 'number' ? R2(r.IHBAP / 1e9) : null })) });

  const COUNTRY = { TUR: 'Türkiye', USA: 'United States', XM: 'Euro area', GBR: 'United Kingdom', JPN: 'Japan', CHN: 'China', BRA: 'Brazil', MEX: 'Mexico', ZAF: 'South Africa', IND: 'India', CZE: 'Czechia', AUS: 'Australia', POL: 'Poland', HUN: 'Hungary', KOR: 'Korea', IDN: 'Indonesia' };
  dash.calc('fi_policy', { inputs: ['polrates1', 'polrates2'], title: 'fi_policy', fn: (a, b) => {
    const rows = {}; [a, b].forEach((rs) => (rs || []).forEach((r) => { Object.keys(r).forEach((k) => { if (k === 'tarih') return; const code = k.replace('BISPOLFAIZ_', ''); (rows[code] = rows[code] || []).push({ d: r.tarih, v: r[k] }); }); }));
    return Object.keys(rows).map((code) => {
      const s = rows[code].filter((x) => typeof x.v === 'number').sort((x, y) => x.d < y.d ? -1 : 1); if (!s.length) return null;
      const last = s[s.length - 1]; const back = (n) => s.length > n ? s[s.length - 1 - n].v : null;
      return { code, country: COUNTRY[code] || code, rate: last.v, as_of: last.d, chg_3m: back(3) == null ? null : Math.round((last.v - back(3)) * 100), chg_12m: back(12) == null ? null : Math.round((last.v - back(12)) * 100), spark: s.map((x) => x.v) };
    }).filter(Boolean).sort((x, y) => y.rate - x.rate);
  } });
})();

// ---------------- drawings ----------------
(function () {
  const C = ['#ffa028', '#3cc8f0', '#e8e8e8', '#c86bff', '#2ee66b', '#ff6b9a', '#ffd23c'];
  const L = d3.formatLocale({ decimal: '.', thousands: ',', grouping: [3], currency: ['', ''] });
  const N = (v, d) => v == null || isNaN(v) ? '—' : L.format(',.' + (d == null ? 2 : d) + 'f')(v);
  const sgn = (v) => v > 0 ? '+' : v < 0 ? '−' : '';
  const BP = (v) => v == null || isNaN(v) ? '—' : sgn(v) + N(Math.abs(v), 0);
  const PCT = (v) => v == null || isNaN(v) ? '—' : N(v, 2) + '%';
  const rows = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : []; };
  const tone = (el, v, inv) => { const x = inv ? -v : v; el.classList.toggle('up', typeof v === 'number' && x > 0); el.classList.toggle('dn', typeof v === 'number' && x < 0); };
  const cell = (tr, text, cls) => { const td = tr.insertCell(); td.textContent = text; if (cls) td.className = cls; return td; };
  const fail = (el, msg) => { d3.select(el).selectAll('*').remove(); const p = document.createElement('div'); p.className = 'tt-empty'; p.textContent = msg; el.appendChild(p); };
  const heat = (v) => v == null ? null : v > 0 ? `rgba(255,69,69,${Math.min(0.75, Math.abs(v) / 120)})` : `rgba(46,230,107,${Math.min(0.75, Math.abs(v) / 120)})`;
  const mtx = (name) => rows('fi_matrix').find((r) => r.tenor === name);

  // KPIs
  const kv = (name, fn) => dash.draw(name, (el) => { const r = fn(); el.textContent = r && r.text != null ? r.text : '—'; if (r && 'tone' in r) tone(el, r.tone, r.inv); });
  ['2Y', '5Y', '7Y'].forEach((t) => { kv('fi-k-' + t, () => { const m = mtx(t); return m && { text: PCT(m.yield) }; }); kv('fi-k-' + t + '-c', () => { const m = mtx(t); return m && { text: BP(m.chg_1d) + ' bp 1D · ' + BP(m.chg_1w) + ' bp 1W', tone: m.chg_1d, inv: true }; }); });
  kv('fi-k-slope', () => { const a = mtx('2Y'), b = mtx('7Y'); return a && b && { text: BP(Math.round((b.yield - a.yield) * 100)) + ' bp', tone: b.yield - a.yield }; });
  kv('fi-k-slope2', () => { const a = mtx('3M'), b = mtx('2Y'); return a && b && { text: BP(Math.round((b.yield - a.yield) * 100)) + ' bp' }; });
  kv('fi-k-net', () => { const r = rows('fi_liq'); const l = r[r.length - 1]; return l && { text: (l.net_bn > 0 ? '+' : '−') + N(Math.abs(l.net_bn), 0) + ' bn TRY', tone: l.net_bn, inv: true }; });
  kv('fi-k-net-c', () => { const r = rows('fi_liq'); const l = r[r.length - 1]; return l && { text: (l.net_bn > 0 ? 'CBRT lending: liquidity deficit' : 'CBRT absorbing: liquidity surplus') + ' · ' + TT.dt(l.date) }; });
  kv('fi-k-nr', () => { const r = rows('nonres').filter((x) => typeof x.gdds_stock === 'number').sort((a, b) => a.tarih < b.tarih ? -1 : 1); const l = r[r.length - 1]; return l && { text: '$' + N(l.gdds_stock / 1000, 2) + ' bn' }; });
  kv('fi-k-nr-c', () => { const r = rows('nonres').filter((x) => typeof x.gdds_flow === 'number').sort((a, b) => a.tarih < b.tarih ? -1 : 1); const l = r[r.length - 1]; return l && { text: (l.gdds_flow >= 0 ? '+' : '−') + '$' + N(Math.abs(l.gdds_flow), 0) + ' mn week to ' + TT.dt(l.tarih), tone: l.gdds_flow }; });

  // Yield curve
  let curveSel = { 'Today': true, '1W ago': true, '1M ago': true, '1D ago': false };
  dash.draw('fi-curve', (el) => {
    const c = rows('fi_curves'), b = rows('fi_bonds');
    if (!c.length) return fail(el, 'Curve could not be fitted.');
    const col = { 'Today': C[0], '1D ago': C[5], '1W ago': C[1], '1M ago': '#8a8a8a' };
    const series = Object.keys(col).filter((n) => curveSel[n]).map((n) => ({ name: n + ' (fitted)', color: col[n], dash: n !== 'Today', width: n === 'Today' ? 2.5 : 1.5, values: c.filter((r) => r.curve === n).map((r) => ({ x: r.tenor, y: r.yield })) }));
    series.push({ name: 'Bonds', color: C[6], dots: true, width: 0, values: b.filter((r) => r.type === 'Bond').map((r) => ({ x: r.years, y: r.ytm })) });
    series.push({ name: 'Bills', color: C[4], dots: true, width: 0, values: b.filter((r) => r.type === 'Bill').map((r) => ({ x: r.years, y: r.ytm })) });
    TT.xy(el, series, { height: 300, xFmt: (v) => v === 0 ? '0' : N(v, v < 1 ? 1 : 0) + 'Y', yFmt: (v) => N(v, 0) + '%', tipX: (v) => N(v, 2) + ' yrs', tipY: (v) => N(v, 2) + '%' });
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-curve]'); if (!b) return;
    curveSel[b.dataset.curve] = !curveSel[b.dataset.curve]; b.setAttribute('aria-pressed', String(curveSel[b.dataset.curve]));
    TT.anim = true; dash.draw('fi-curve'); TT.anim = false;
  });

  dash.draw('fi-matrix', (tb) => {
    tb.replaceChildren();
    rows('fi_matrix').forEach((r) => {
      const tr = tb.insertRow(); cell(tr, r.tenor, 'hi'); cell(tr, PCT(r.yield), 'r');
      ['chg_1d', 'chg_1w', 'chg_1m'].forEach((k) => { const td = cell(tr, BP(r[k]), 'r'); td.style.background = heat(r[k]) || ''; });
    });
  });

  // Screener
  let scrFilter = 'all', scrSort = { k: 'years', dir: 1 };
  dash.draw('fi-screener', (tb) => {
    tb.replaceChildren();
    let b = rows('fi_bonds').slice();
    b = b.filter((r) => scrFilter === 'all' || (scrFilter === 'bill' && r.type === 'Bill') || (scrFilter === 's' && r.type === 'Bond' && r.years < 2) || (scrFilter === 'm' && r.years >= 2 && r.years < 5) || (scrFilter === 'l' && r.years >= 5));
    b.sort((x, y) => ((x[scrSort.k] ?? -1e9) > (y[scrSort.k] ?? -1e9) ? 1 : -1) * scrSort.dir);
    b.forEach((r) => {
      const tr = tb.insertRow(); tr.style.cursor = 'pointer'; tr.addEventListener('click', () => { const s = document.querySelector('#fi-calc-bond'); if (s) { s.value = r.isin; s.dispatchEvent(new Event('change')); s.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } });
      cell(tr, r.isin, 'hi'); cell(tr, r.type, r.type === 'Bill' ? 'cy' : ''); cell(tr, TT.dt(r.maturity)); cell(tr, N(r.years, 2), 'r'); cell(tr, r.coupon == null ? '—' : PCT(r.coupon), 'r'); cell(tr, N(r.price, 3), 'r');
      cell(tr, PCT(r.ytm), 'r yl'); cell(tr, PCT(r.simple), 'r'); cell(tr, N(r.mod_dur, 2), 'r'); cell(tr, N(r.convexity, 2), 'r'); cell(tr, N(r.dv01, 0), 'r');
      ['chg_1d', 'chg_1w', 'chg_1m'].forEach((k) => tone(cell(tr, BP(r[k]), 'r'), r[k], true));
      const rc = cell(tr, r.rich_cheap == null ? '—' : BP(r.rich_cheap) + (r.rich_cheap > 15 ? ' cheap' : r.rich_cheap < -15 ? ' rich' : ''), 'r'); tone(rc, r.rich_cheap);
    });
  });
  document.addEventListener('click', (e) => {
    const f = e.target.closest && e.target.closest('[data-scr]'); if (f) { scrFilter = f.dataset.scr; document.querySelectorAll('[data-scr]').forEach((x) => x.setAttribute('aria-pressed', String(x === f))); dash.draw('fi-screener'); return; }
    const h = e.target.closest && e.target.closest('th[data-sort]'); if (h) { const k = h.dataset.sort; scrSort = { k, dir: scrSort.k === k ? -scrSort.dir : 1 }; dash.draw('fi-screener'); }
  });

  // Yield & spread calculator
  dash.draw('fi-calc-bond', (sel) => {
    const b = rows('fi_bonds'); const cur = sel.value;
    sel.replaceChildren(...b.map((r) => new Option(r.isin + ' · ' + TT.dt(r.maturity) + ' · ' + (r.coupon ? PCT(r.coupon) + ' cpn' : 'discount bill'), r.isin)));
    sel.value = cur && b.some((r) => r.isin === cur) ? cur : (b.find((r) => r.years > 4) || b[0] || {}).isin || '';
  });
  function calcRender() {
    const out = document.querySelector('[data-calc-out]'), cfb = document.querySelector('[data-calc-cf]');
    const sel = document.querySelector('#fi-calc-bond'), mode = document.querySelector('#fi-calc-mode'), inp = document.querySelector('#fi-calc-input');
    if (!out || !sel) return;
    const r = rows('fi_bonds').find((x) => x.isin === sel.value); if (!r) return;
    if (window.FIdes) window.FIdes();
    const t0 = Date.parse(r.date + 'T00:00:00Z'); const fl = FI.flows(r.isin, r.coupon ? r.coupon / 2 : 0, t0);
    if (!inp.dataset.touched || inp.dataset.for !== r.isin + mode.value) { inp.value = mode.value === 'price' ? r.price.toFixed(3) : r.ytm.toFixed(2); inp.dataset.for = r.isin + mode.value; inp.dataset.touched = ''; }
    const v = parseFloat(inp.value);
    const y = mode.value === 'price' ? FI.ytm(v, fl, t0) : v / 100;
    if (y == null || isNaN(y)) { out.textContent = 'Enter a valid number.'; return; }
    const k = FI.risk(y, fl, t0);
    const oz = (rows('ozet')[0] || {}), curve = rows('fi_curves').filter((c) => c.curve === 'Today');
    const fitAt = curve.length ? curve.reduce((a, c) => Math.abs(c.tenor - r.years) < Math.abs(a.tenor - r.years) ? c : a).yield : null;
    const comp = (s) => s == null ? null : (Math.pow(1 + s / 100 / 365, 365) - 1) * 100;
    const items = [
      ['Dirty price', N(k.price, 3)], ['Yield (compounded)', PCT(y * 100)], ['Yield (simple, s.a.)', PCT((r.type === 'Bill' ? (Math.pow(1 + y, r.years) - 1) / r.years : 2 * (Math.sqrt(1 + y) - 1)) * 100)],
      ['Macaulay duration', N(k.mac, 3) + ' yrs'], ['Modified duration', N(k.mod, 3)], ['Convexity', N(k.conv, 3)], ['DV01 per 1mn TRY', 'TRY ' + N(k.dv01 * 1e4, 0)],
      ['Spread to fitted curve', fitAt == null ? '—' : BP(Math.round((y * 100 - fitAt) * 100)) + ' bp'],
      ['Spread to TLREF (comp.)', oz.tlref == null ? '—' : BP(Math.round((y * 100 - comp(oz.tlref)) * 100)) + ' bp'],
      ['Spread to CBRT AWFC (comp.)', oz.aofm == null ? '—' : BP(Math.round((y * 100 - comp(oz.aofm)) * 100)) + ' bp'],
      ['Price for +100 bp', N(FI.pv(y + 0.01, fl, t0), 3) + ' (' + PCT((FI.pv(y + 0.01, fl, t0) / k.price - 1) * 100) + ')'],
      ['Price for −100 bp', N(FI.pv(y - 0.01, fl, t0), 3) + ' (' + PCT((FI.pv(y - 0.01, fl, t0) / k.price - 1) * 100) + ')']
    ];
    out.replaceChildren(...items.map(([a, b]) => { const d = document.createElement('div'); const l = document.createElement('div'); l.className = 'l'; l.textContent = a; const vv = document.createElement('div'); vv.className = 'v'; vv.style.fontSize = '15px'; vv.textContent = b; d.append(l, vv); return d; }));
    cfb.replaceChildren();
    fl.forEach((f) => { const t = (f.t - t0) / FI.DAY / 365; const df = 1 / Math.pow(1 + y, t); const tr = cfb.insertRow(); cell(tr, TT.dt(new Date(f.t)), 'hi'); cell(tr, N(t, 3), 'r'); cell(tr, N(f.cf, 3), 'r'); cell(tr, N(df, 5), 'r'); cell(tr, N(f.cf * df, 3), 'r'); });
  }
  dash.draw('fi-calc', { mount: () => {
    const sel = document.querySelector('#fi-calc-bond'), mode = document.querySelector('#fi-calc-mode'), inp = document.querySelector('#fi-calc-input');
    if (sel) sel.addEventListener('change', () => { inp.dataset.touched = ''; calcRender(); });
    if (mode) mode.addEventListener('change', () => { inp.dataset.touched = ''; calcRender(); });
    if (inp) inp.addEventListener('input', () => { inp.dataset.touched = '1'; calcRender(); });
    return true;
  }, update: () => calcRender(), unmount: () => {} });

  // Scenario & horizon analysis
  function scenario() {
    const sh = document.querySelector('#fi-shift'), hz = document.querySelector('#fi-horizon');
    const shift = sh ? +sh.value : 0, days = hz ? +hz.value : 90;
    const lab = document.querySelector('[data-scn-label]'); if (lab) lab.textContent = (shift > 0 ? '+' : '') + shift + ' bp parallel shift · ' + days + '-day horizon';
    return rows('fi_bonds').map((r) => {
      const t0 = Date.parse(r.date + 'T00:00:00Z'), t1 = t0 + days * FI.DAY, y0 = r.ytm / 100, y1 = y0 + shift / 1e4;
      const fl = FI.flows(r.isin, r.coupon ? r.coupon / 2 : 0, t0);
      const p0 = FI.pv(y0, fl, t0);
      const recv = fl.filter((f) => f.t <= t1), rem = fl.filter((f) => f.t > t1);
      const reinv = recv.reduce((s, f) => s + f.cf * Math.pow(1 + y1, (t1 - f.t) / FI.DAY / 365), 0);
      const p1 = rem.length ? FI.pv(y1, rem, t1) : 0;
      const instant = (FI.pv(y1, fl, t0) / p0 - 1) * 100;
      return { isin: r.isin, years: r.years, instant, total: ((p1 + reinv) / p0 - 1) * 100, ann: (Math.pow((p1 + reinv) / p0, 365 / days) - 1) * 100 };
    });
  }
  dash.draw('fi-scenario', { mount: (el) => {
    const go = () => { TT.anim = false; draw(el); };
    ['#fi-shift', '#fi-horizon'].forEach((s) => { const x = document.querySelector(s); if (x) x.addEventListener('input', go); });
    return true;
  }, update: (el) => draw(el), unmount: () => {} });
  function draw(el) {
    const data = scenario().sort((a, b) => a.years - b.years);
    if (!data.length) return fail(el, 'No bonds.');
    const W = Math.max(300, el.clientWidth), bh = 15, H = data.length * (bh + 5) + 34, ml = 112, mr = 120;
    let svg = d3.select(el).select('svg');
    if (svg.empty()) { d3.select(el).selectAll('*').remove(); svg = d3.select(el).append('svg').attr('role', 'img').attr('aria-label', 'Scenario total returns'); }
    svg.attr('width', W).attr('height', H);
    const ext = d3.extent(data.flatMap((d) => [d.total, d.instant, 0]));
    const x = d3.scaleLinear().domain([Math.min(-1, ext[0]), Math.max(1, ext[1])]).nice().range([ml, W - mr]);
    svg.selectAll('g.ax').data([0]).join('g').attr('class', 'axis ax').attr('transform', `translate(0,${H - 18})`).call(d3.axisBottom(x).ticks(6).tickFormat((v) => v + '%').tickSizeOuter(0));
    svg.selectAll('line.zero').data([0]).join('line').attr('class', 'zero').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 4).attr('y2', H - 18).style('stroke', '#5a5a5a');
    const g = svg.selectAll('g.row').data(data, (d) => d.isin).join((en) => { const gg = en.append('g').attr('class', 'row'); gg.append('text').attr('class', 'nm'); gg.append('rect').attr('class', 'tot'); gg.append('rect').attr('class', 'ins'); gg.append('text').attr('class', 'vl'); return gg; });
    g.attr('transform', (d, i) => `translate(0,${i * (bh + 5) + 6})`);
    g.select('text.nm').attr('x', 0).attr('y', bh - 3).style('fill', '#ffa028').style('font-size', '10.5px').text((d) => d.isin + ' ' + N(d.years, 1) + 'Y');
    const T = (s) => TT.motion() ? s.transition().duration(350).ease(d3.easeCubicOut) : s;
    T(g.select('rect.tot')).attr('x', (d) => x(Math.min(0, d.total))).attr('width', (d) => Math.abs(x(d.total) - x(0))).attr('y', 0).attr('height', bh).style('fill', (d) => d.total >= 0 ? '#22d160' : '#ff3b3b');
    T(g.select('rect.ins')).attr('x', (d) => x(Math.min(0, d.instant))).attr('width', (d) => Math.abs(x(d.instant) - x(0))).attr('y', bh / 2 - 1.5).attr('height', 3).style('fill', '#ffd23c');
    g.select('text.vl').attr('x', W - mr + 6).attr('y', bh - 3).style('fill', '#e8e8e8').style('font-size', '10.5px').text((d) => N(d.total, 2) + '% · ann ' + N(d.ann, 1) + '%');
  }

  dash.draw('fi-bench', (el) => {
    const h = rows('fi_hist'); if (!h.length) return fail(el, 'No history.');
    const col = { '1Y': C[4], '2Y': C[0], '5Y': C[1], '7Y': C[3] };
    TT.chart(el, Object.keys(col).map((k) => ({ name: k + ' fitted', color: col[k], values: h.filter((r) => r.tenor === k).map((r) => ({ x: TT.parseD(r.date), y: r.yield })) })), { height: 230, yFmt: (v) => N(v, 0) + '%' });
  });
  dash.draw('fi-liq', (el) => {
    const r = rows('fi_liq'); if (!r.length) return fail(el, 'No liquidity data.');
    TT.bars(el, r.map((x) => ({ x: TT.parseD(x.date), y: x.net_bn })), { height: 200, label: 'CBRT net funding, bn TRY (+ lending = deficit, − absorbing = surplus)', color: C[1], yFmt: (v) => N(v, 0), tipFmt: (v) => N(v, 1) + ' bn TRY', signColor: true });
  });
  dash.draw('fi-nr', (el) => {
    const r = rows('nonres').filter((x) => typeof x.gdds_flow === 'number').sort((a, b) => a.tarih < b.tarih ? -1 : 1);
    if (!r.length) return fail(el, 'No data.');
    TT.bars(el, r.map((x) => ({ x: TT.parseD(x.tarih), y: x.gdds_flow })), { height: 180, label: 'Non-resident weekly net purchases of GDDS, $ mn', color: C[4], yFmt: (v) => N(v, 0), tipFmt: (v) => '$' + N(v, 0) + ' mn', signColor: true });
  });
  dash.draw('fi-nr-stock', (el) => {
    const r = rows('nonres').filter((x) => typeof x.gdds_stock === 'number').sort((a, b) => a.tarih < b.tarih ? -1 : 1);
    if (!r.length) return fail(el, 'No data.');
    TT.chart(el, [{ name: 'GDDS stock, $ bn', color: C[0], area: true, values: r.map((x) => ({ x: TT.parseD(x.tarih), y: x.gdds_stock / 1000 })) }, { name: 'Eurobonds, $ bn', color: C[1], values: r.map((x) => ({ x: TT.parseD(x.tarih), y: x.eurobond_stock / 1000 })) }], { height: 170, yFmt: (v) => '$' + N(v, 0), tipFmt: (v) => '$' + N(v, 2) + ' bn' });
  });
  dash.draw('fi-frn', (tb) => {
    tb.replaceChildren();
    rows('fi_frn').forEach((r) => { const tr = tb.insertRow(); cell(tr, r.isin, 'hi'); cell(tr, TT.dt(r.maturity)); cell(tr, N(r.years, 2), 'r'); cell(tr, N(r.price, 3), 'r'); tone(cell(tr, r.chg_1d == null ? '—' : (r.chg_1d > 0 ? '+' : '') + N(r.chg_1d, 3), 'r'), r.chg_1d); cell(tr, r.coupon == null ? '—' : PCT(r.coupon), 'r yl'); cell(tr, r.next_coupon ? TT.dt(r.next_coupon) : '—', 'r'); });
  });
  dash.draw('fi-policy', (tb) => {
    tb.replaceChildren();
    rows('fi_policy').forEach((r) => {
      const tr = tb.insertRow(); cell(tr, r.country, r.code === 'TUR' ? 'yl' : 'hi'); cell(tr, PCT(r.rate), 'r');
      tone(cell(tr, BP(r.chg_3m), 'r'), r.chg_3m, true); tone(cell(tr, BP(r.chg_12m), 'r'), r.chg_12m, true);
      const td = tr.insertCell(); const w = 90, h = 18; const s = r.spark; const xs = d3.scaleLinear().domain([0, s.length - 1]).range([1, w - 1]); const ys = d3.scaleLinear().domain(d3.extent(s)[0] === d3.extent(s)[1] ? [s[0] - 1, s[0] + 1] : d3.extent(s)).range([h - 2, 2]);
      const svg = d3.select(td).append('svg').attr('width', w).attr('height', h).attr('aria-hidden', 'true');
      svg.append('path').attr('d', d3.line().x((v, i) => xs(i)).y((v) => ys(v)).curve(d3.curveStepAfter)(s)).style('fill', 'none').style('stroke', r.code === 'TUR' ? '#ffd23c' : '#3cc8f0').style('stroke-width', 1.5);
      cell(tr, TT.mShort(TT.parseD(r.as_of)) + ' ' + r.as_of.slice(0, 4), 'r mu');
    });
  });
})();

// ===================== GLOBAL SOVEREIGN MONITOR & TÜRKİYE SOVEREIGN DEBT MONITOR =====================
(function () {
  const P = window.TTparse;
  ['gcpi', 'gca', 'ggdp1', 'ggdp2'].forEach((id) => dash.loader(id, { description: '', fn: P.md(null) }));
  const R2 = (v) => v == null || isNaN(v) ? null : Math.round(v * 100) / 100;
  const REGION = { USA: 'DM', XM: 'DM', GBR: 'DM', JPN: 'DM', AUS: 'DM', KOR: 'DM', CZE: 'CEE', POL: 'CEE', HUN: 'CEE', TUR: 'CEE', BRA: 'LatAm', MEX: 'LatAm', ZAF: 'EMEA', IND: 'Asia EM', IDN: 'Asia EM', CHN: 'Asia EM' };
  const col = (rows, key) => (rows || []).filter((r) => typeof r[key] === 'number').sort((a, b) => a.tarih < b.tarih ? -1 : 1);
  dash.calc('gsov', { inputs: ['fi_policy', 'gcpi', 'gca', 'ggdp1', 'ggdp2'], title: 'gsov', fn: (pol, cpi, ca, g1, g2) => {
    const gdp = {}; [g1, g2].forEach((rs) => { const last = (rs || []).slice().sort((a, b) => a.tarih < b.tarih ? -1 : 1).pop(); if (last) Object.keys(last).forEach((k) => { if (k !== 'tarih' && typeof last[k] === 'number') gdp[k.replace('IMFGDPUSDN_', '')] = last[k]; }); });
    return (pol || []).map((p) => {
      const cc = p.code === 'XM' ? 'DEU' : p.code;
      const s = col(cpi, 'IMFCPIND_' + cc); let yoy = null, cpiAsOf = null;
      if (s.length) { const l = s[s.length - 1]; const y0 = String(+l.tarih.slice(0, 4) - 1) + l.tarih.slice(4); const b = s.find((r) => r.tarih === y0); if (b) { yoy = R2((l['IMFCPIND_' + cc] / b['IMFCPIND_' + cc] - 1) * 100); cpiAsOf = l.tarih; } }
      const q = p.code === 'XM' ? [] : col(ca, 'IMFCA_' + p.code); const last4 = q.slice(-4);
      const caGdp = last4.length === 4 && gdp[p.code] ? R2(last4.reduce((x, r) => x + r['IMFCA_' + p.code], 0) / 1e9 / gdp[p.code] * 100) : null;
      return { code: p.code, country: p.code === 'XM' ? 'Euro area' : p.country, region: REGION[p.code] || 'Other', policy: p.rate, chg_12m: p.chg_12m, cpi_yoy: yoy, cpi_note: p.code === 'XM' ? 'Germany CPI used' : null, cpi_as_of: cpiAsOf, real_policy: yoy == null ? null : R2(p.rate - yoy), ca_gdp: caGdp, gdp_bn: gdp[p.code] || null };
    });
  } });

  // Türkiye sovereign debt monitor: benchmarks, curve spreads, butterfly, real yield with 1M statistics
  dash.calc('tr_sdm', { inputs: ['fi_hist', 'makro_ozet'], title: 'tr_sdm', fn: (h, mk) => {
    const dates = Array.from(new Set((h || []).map((r) => r.date))).sort();
    if (!dates.length) return [];
    const y = (d, t) => { const r = h.find((x) => x.date === d && x.tenor === t); return r ? r.yield : null; };
    const exp12 = ((mk || [])[0] || {}).tufe_12a;
    const defs = [
      ['Benchmarks', '1Y yield', (d) => y(d, '1Y'), '%'], ['Benchmarks', '2Y yield', (d) => y(d, '2Y'), '%'], ['Benchmarks', '5Y yield', (d) => y(d, '5Y'), '%'], ['Benchmarks', '7Y yield', (d) => y(d, '7Y'), '%'],
      ['Curves', '2s5s', (d) => (y(d, '5Y') - y(d, '2Y')) * 100, 'bp'], ['Curves', '2s7s', (d) => (y(d, '7Y') - y(d, '2Y')) * 100, 'bp'], ['Curves', '5s7s', (d) => (y(d, '7Y') - y(d, '5Y')) * 100, 'bp'], ['Curves', '1s2s', (d) => (y(d, '2Y') - y(d, '1Y')) * 100, 'bp'],
      ['Butterflies', '2s5s7s', (d) => (2 * y(d, '5Y') - y(d, '2Y') - y(d, '7Y')) * 100, 'bp'], ['Butterflies', '1s2s5s', (d) => (2 * y(d, '2Y') - y(d, '1Y') - y(d, '5Y')) * 100, 'bp'],
      ['Real', '1Y real (vs 12M CPI exp.)', (d) => exp12 == null ? null : y(d, '1Y') - exp12, '%'], ['Real', '2Y real (vs 12M CPI exp.)', (d) => exp12 == null ? null : y(d, '2Y') - exp12, '%']
    ];
    return defs.map(([group, name, f, unit]) => {
      const s = dates.map((d) => f(d)).filter((v) => v != null && !isNaN(v));
      if (!s.length) return null;
      const cur = s[s.length - 1], prev = s[s.length - 2], avg = d3.mean(s), sd = d3.deviation(s) || 0;
      return { group, name, unit, value: R2(cur), chg_1d: prev == null ? null : R2(unit === '%' ? (cur - prev) * 100 : cur - prev), low: R2(d3.min(s)), high: R2(d3.max(s)), avg: R2(avg), z: sd ? R2((cur - avg) / sd) : 0, spark: s.map(R2) };
    }).filter(Boolean);
  } });
})();

(function () {
  const L = d3.formatLocale({ decimal: '.', thousands: ',', grouping: [3], currency: ['', ''] });
  const N = (v, d) => v == null || isNaN(v) ? '—' : L.format(',.' + (d == null ? 2 : d) + 'f')(v);
  const sgn = (v) => v > 0 ? '+' : v < 0 ? '−' : '';
  const rows = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : []; };
  const tone = (el, v, inv) => { const x = inv ? -v : v; el.classList.toggle('up', typeof v === 'number' && x > 0); el.classList.toggle('dn', typeof v === 'number' && x < 0); };
  const cell = (tr, text, cls) => { const td = tr.insertCell(); td.textContent = text; if (cls) td.className = cls; return td; };
  const RC = { DM: '#3cc8f0', CEE: '#ffa028', LatAm: '#2ee66b', EMEA: '#c86bff', 'Asia EM': '#ff6b9a', Other: '#8a8a8a' };
  let gsSort = { k: 'real_policy', dir: -1 };

  dash.draw('g-sov', (tb) => {
    tb.replaceChildren();
    const r = rows('gsov').slice().sort((a, b) => ((a[gsSort.k] ?? -1e9) > (b[gsSort.k] ?? -1e9) ? 1 : -1) * gsSort.dir);
    r.forEach((x) => {
      const tr = tb.insertRow();
      const c = cell(tr, x.country, x.code === 'TUR' ? 'yl' : 'hi'); if (x.cpi_note) c.title = x.cpi_note;
      const rg = cell(tr, x.region); rg.style.color = RC[x.region];
      cell(tr, N(x.policy, 2) + '%', 'r'); tone(cell(tr, x.chg_12m == null ? '—' : sgn(x.chg_12m) + N(Math.abs(x.chg_12m), 0), 'r'), x.chg_12m, true);
      cell(tr, x.cpi_yoy == null ? '—' : N(x.cpi_yoy, 1) + '%' + (x.cpi_note ? '*' : ''), 'r');
      tone(cell(tr, x.real_policy == null ? '—' : sgn(x.real_policy) + N(Math.abs(x.real_policy), 2), 'r'), x.real_policy);
      tone(cell(tr, x.ca_gdp == null ? '—' : (Math.abs(x.ca_gdp) < 0.05 ? '' : sgn(x.ca_gdp)) + N(Math.abs(x.ca_gdp), 1) + '%', 'r'), Math.abs(x.ca_gdp) < 0.05 ? 0 : x.ca_gdp);
      cell(tr, x.gdp_bn == null ? '—' : '$' + N(x.gdp_bn / 1000, 2) + 'tn', 'r mu');
      cell(tr, x.cpi_as_of ? TT.mShort(TT.parseD(x.cpi_as_of)) + ' ' + x.cpi_as_of.slice(2, 4) : '—', 'r mu');
    });
  });
  document.addEventListener('click', (e) => { const h = e.target.closest && e.target.closest('th[data-gsort]'); if (!h) return; const k = h.dataset.gsort; gsSort = { k, dir: gsSort.k === k ? -gsSort.dir : -1 }; dash.draw('g-sov'); });

  // Bubble chart: CPI vs policy rate, bubble = GDP
  dash.draw('g-scatter', (el) => {
    d3.select(el).selectAll('*').remove();
    const d = rows('gsov').filter((x) => x.cpi_yoy != null);
    if (!d.length) return;
    const lg = d3.select(el).append('div').attr('class', 'tt-legend');
    Object.keys(RC).filter((k) => d.some((x) => x.region === k)).forEach((k) => lg.append('span').style('--sw', RC[k]).text(k));
    lg.append('span').attr('class', 'dash').style('--sw', '#5a5a5a').text('real rate = 0');
    const W = Math.max(300, el.clientWidth), H = 300, m = { t: 10, r: 16, b: 30, l: 42 };
    const useLog = d3.max(d, (x) => x.policy) > 20;
    const x = (useLog ? d3.scaleSymlog().constant(2) : d3.scaleLinear()).domain([Math.min(0, d3.min(d, (q) => q.cpi_yoy)), d3.max(d, (q) => q.cpi_yoy) * 1.1]).range([m.l, W - m.r]);
    const y = (useLog ? d3.scaleSymlog().constant(2) : d3.scaleLinear()).domain([0, d3.max(d, (q) => q.policy) * 1.1]).range([H - m.b, m.t]);
    const r = d3.scaleSqrt().domain([0, d3.max(d, (q) => q.gdp_bn || 0)]).range([4, 26]);
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'Inflation vs policy rate by country');
    const tv = [0, 1, 2, 5, 10, 20, 30, 40].filter((v) => v <= x.domain()[1]); const tvy = [0, 1, 2, 5, 10, 20, 30, 40].filter((v) => v <= y.domain()[1]);
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(tvy).tickSize(-(W - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(tvy).tickFormat((v) => v + '%').tickSizeOuter(0));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(tv).tickFormat((v) => v + '%').tickSizeOuter(0));
    svg.append('text').attr('x', W - m.r).attr('y', H - 4).attr('text-anchor', 'end').style('fill', '#8a8a8a').style('font-size', '10px').text('CPI y/y →');
    svg.append('text').attr('x', m.l + 4).attr('y', m.t + 8).style('fill', '#8a8a8a').style('font-size', '10px').text('↑ policy rate' + (useLog ? ' (log-like scale)' : ''));
    const lo = Math.max(x.domain()[0], y.domain()[0]), hi = Math.min(x.domain()[1], y.domain()[1]);
    const diag = d3.range(lo, hi, (hi - lo) / 60).concat([hi]);
    svg.append('path').attr('d', d3.line().x((v) => x(v)).y((v) => y(v))(diag)).style('stroke', '#5a5a5a').style('stroke-dasharray', '4 3').style('fill', 'none');
    const anim = TT.anim && TT.motion();
    const g = svg.append('g').selectAll('g').data(d.sort((a, b) => (b.gdp_bn || 0) - (a.gdp_bn || 0))).join('g').attr('transform', (q) => `translate(${x(q.cpi_yoy)},${y(q.policy)})`);
    const c = g.append('circle').attr('r', anim ? 0 : (q) => r(q.gdp_bn || 0)).style('fill', (q) => RC[q.region]).style('fill-opacity', 0.35).style('stroke', (q) => RC[q.region]).style('stroke-width', (q) => q.code === 'TUR' ? 2.5 : 1);
    if (anim) c.transition().delay((q, i) => i * 60).duration(700).ease(d3.easeBackOut).attr('r', (q) => r(q.gdp_bn || 0));
    g.append('text').attr('y', 3).attr('text-anchor', 'middle').style('fill', '#e8e8e8').style('font-size', '9.5px').style('font-weight', (q) => q.code === 'TUR' ? 700 : 400).text((q) => q.code);
    const tip = d3.select(el).append('div').attr('class', 'tt-tip').style('display', 'none');
    g.on('pointerenter', (ev, q) => { tip.selectAll('*').remove(); tip.append('div').attr('class', 'tt-tip-d').text(q.country); tip.append('div').text('Policy ' + N(q.policy, 2) + '% · CPI ' + N(q.cpi_yoy, 1) + '%'); tip.append('div').text('Real policy rate ' + sgn(q.real_policy) + N(Math.abs(q.real_policy), 2) + ' pp'); if (q.ca_gdp != null) tip.append('div').text('Current account ' + N(q.ca_gdp, 1) + '% of GDP'); const [px, py] = d3.pointer(ev, el); tip.style('display', null).style('left', Math.min(px + 12, W - 190) + 'px').style('top', Math.max(0, py - 10) + 'px'); })
      .on('pointerleave', () => tip.style('display', 'none'));
  });

  // Türkiye sovereign debt monitor table with 1M range bars, z-scores and sparklines
  dash.draw('tr-sdm', (tb) => {
    tb.replaceChildren();
    let grp = null;
    rows('tr_sdm').forEach((r) => {
      if (r.group !== grp) { grp = r.group; const tr = tb.insertRow(); const td = cell(tr, grp.toUpperCase(), 'am'); td.colSpan = 9; td.style.fontSize = '10px'; td.style.letterSpacing = '.06em'; td.style.paddingTop = '6px'; }
      const tr = tb.insertRow(); const isPct = r.unit === '%';
      cell(tr, r.name, 'hi'); cell(tr, isPct ? N(r.value, 2) + '%' : sgn(r.value) + N(Math.abs(r.value), 0) + ' bp', 'r');
      tone(cell(tr, r.chg_1d == null ? '—' : sgn(r.chg_1d) + N(Math.abs(r.chg_1d), 0) + ' bp', 'r'), r.chg_1d, isPct);
      const sp = tr.insertCell(); const w = 80, h = 16; const xs = d3.scaleLinear().domain([0, r.spark.length - 1]).range([1, w - 1]); const ex = d3.extent(r.spark); const ys = d3.scaleLinear().domain(ex[0] === ex[1] ? [ex[0] - 1, ex[0] + 1] : ex).range([h - 2, 2]);
      const s1 = d3.select(sp).append('svg').attr('width', w).attr('height', h).attr('aria-hidden', 'true'); s1.append('path').attr('d', d3.line().x((v, i) => xs(i)).y((v) => ys(v))(r.spark)).style('fill', 'none').style('stroke', '#ffa028').style('stroke-width', 1.3);
      cell(tr, isPct ? N(r.low, 2) : N(r.low, 0), 'r mu');
      const rg = tr.insertCell(); const rw = 90; const rs = d3.scaleLinear().domain([r.low, r.high === r.low ? r.low + 1 : r.high]).range([3, rw - 3]);
      const s2 = d3.select(rg).append('svg').attr('width', rw).attr('height', 12).attr('aria-hidden', 'true');
      s2.append('line').attr('x1', 3).attr('x2', rw - 3).attr('y1', 6).attr('y2', 6).style('stroke', '#3a3a3a').style('stroke-width', 2);
      s2.append('path').attr('d', d3.symbol(d3.symbolDiamond, 30)()).attr('transform', `translate(${rs(r.avg)},6)`).style('fill', '#ffa028');
      s2.append('circle').attr('cx', rs(r.value)).attr('cy', 6).attr('r', 3.5).style('fill', '#3cc8f0');
      cell(tr, isPct ? N(r.high, 2) : N(r.high, 0), 'r mu'); cell(tr, isPct ? N(r.avg, 2) : N(r.avg, 0), 'r');
      const zc = cell(tr, (r.z > 0 ? '+' : '') + N(r.z, 2), 'r'); zc.style.background = Math.abs(r.z) >= 1.5 ? (r.z > 0 ? 'rgba(255,69,69,.35)' : 'rgba(46,230,107,.35)') : '';
    });
  });

  // Security description for the bond selected in the calculator
  const META = { TRT100227T13: ['2025-02-12', '24T2'], TRT131027T36: ['2025-10-15', '24T2'], TRT150328T24: ['2026-03-18', '24T2'], TRT081128T15: ['2023-11-15', '61T2'], TRT120929T12: ['2024-09-18', '61T2'], TRT021030T18: ['2025-10-08', '61T2'], TRT160431T35: ['2026-04-22', '61T2'], TRT051033T12: ['2023-10-18', '121T2'], TRT270934T18: ['2024-10-09', '121T2'], TRB100227T13: ['2026-06-17', '8B'], TRB170327T15: ['2026-04-08', '11B'] };
  window.FIdes = function () {
    const box = document.querySelector('[data-des]'); const sel = document.querySelector('#fi-calc-bond');
    if (!box || !sel) return;
    const r = rows('fi_bonds').find((x) => x.isin === sel.value); if (!r) return;
    const t0 = Date.parse(r.date + 'T00:00:00Z'); const fl = FI.flows(r.isin, r.coupon ? r.coupon / 2 : 0, t0);
    const m = META[r.isin] || [];
    const next = fl.length ? fl[0].t : null, prevCpn = next && r.coupon ? next - 182 * FI.DAY : null;
    const accrued = r.coupon && prevCpn ? (r.coupon / 2) * Math.max(0, (t0 - prevCpn) / FI.DAY) / 182 : 0;
    const items = [
      ['Issuer', 'Republic of Türkiye (Treasury)'], ['ISIN', r.isin], ['CBRT code', m[1] || '—'], ['Currency', 'TRY'],
      ['Type', r.type === 'Bill' ? 'Zero-coupon T-bill' : 'Fixed-coupon bond'], ['Coupon (annual)', r.coupon ? N(r.coupon, 2) + '%' : '—'], ['Frequency', r.type === 'Bill' ? 'At maturity' : 'Semi-annual (182 days)'], ['Day count', 'Act/365'],
      ['Issue date', m[0] ? TT.dt(m[0]) : '—'], ['Maturity', TT.dt(r.maturity)], ['Next coupon', r.coupon && next ? TT.dt(new Date(next)) : '—'], ['Coupons left', r.coupon ? String(fl.length) : '—'],
      ['Accrued (per 100)', r.coupon ? N(accrued, 3) : '0.000'], ['Clean price', N(r.price - accrued, 3)], ['Dirty price', N(r.price, 3)], ['Price source', 'CBRT indicative, ' + TT.dt(r.date)]
    ];
    box.replaceChildren(...items.map(([a, b]) => { const d = document.createElement('div'); const l = document.createElement('div'); l.className = 'l'; l.textContent = a; const v = document.createElement('div'); v.className = 'c'; v.style.color = '#e8e8e8'; v.style.fontSize = '12px'; v.textContent = b; d.append(l, v); return d; }));
  };
})();

// ===================== WORLD BOND MARKETS (US Treasuries, global bond & credit ETFs, risk gauges) =====================
(function () {
  const P = window.TTparse;
  ['gq1', 'gq2', 'gq3', 'us_yh', 'etf_h', 'etf_h2'].forEach((id) => dash.loader(id, { description: '', fn: P.tsv }));
  const R2 = (v) => v == null || isNaN(v) ? null : Math.round(v * 100) / 100;
  const hist = (h, sym) => { const r = (h || []).find((x) => x.symbol === sym); return r && Array.isArray(r.data) ? r.data.map((d) => ({ date: String(d.date).slice(0, 10), close: d.close })).sort((a, b) => a.date < b.date ? -1 : 1) : []; };
  const back = (s, n) => s.length > n ? s[s.length - 1 - n].close : null;
  const UST = [['^IRX', '3M', 0.25], ['2YY=F', '2Y', 2], ['^FVX', '5Y', 5], ['^TNX', '10Y', 10], ['^TYX', '30Y', 30]];
  dash.calc('ust', { inputs: ['gq1', 'gq3', 'us_yh'], title: 'ust', fn: (q1, q3, h) => {
    const q = (q1 || []).concat(q3 || []);
    return UST.map(([sym, tenor, yrs]) => {
      const r = q.find((x) => x.symbol === sym); if (!r || typeof r.current_price !== 'number') return null;
      const s = hist(h, sym); const y = r.current_price; const d = (n) => { const v = back(s, n); return v == null ? null : Math.round((y - v) * 100); };
      return { sym, tenor, yrs, yield: y, chg_1w: d(1), chg_1m: d(4), chg_3m: d(13), chg_6m: s.length ? Math.round((y - s[0].close) * 100) : null, lo: r.week_52_low, hi: r.week_52_high, spark: s.map((p) => p.close).concat([y]), src: sym === '2YY=F' ? 'CME 2Y yield futures' : 'Cboe/Treasury index' };
    }).filter(Boolean);
  } });
  dash.calc('ust_spreads', { inputs: ['ust', 'us_yh', 'fi_matrix'], title: 'ust_spreads', fn: (u, h, mx) => {
    const y = (t) => ((u || []).find((r) => r.tenor === t) || {}).yield;
    const s = (sym) => hist(h, sym);
    const ser = (a, b) => { const A = s(a), B = s(b); return A.map((p, i) => B[i] ? Math.round((p.close - B[i].close) * 100) : null).filter((v) => v != null); };
    const out = [];
    const add = (name, now, series, note) => { if (now == null || isNaN(now)) return; const ch = series && series.length > 4 ? now - series[series.length - 5] : null; out.push({ name, bp: Math.round(now), chg_1m: ch == null ? null : Math.round(ch), lo: series && series.length ? Math.min(...series, now) : null, hi: series && series.length ? Math.max(...series, now) : null, note }); };
    if (y('3M') != null && y('10Y') != null) add('UST 3M10Y', (y('10Y') - y('3M')) * 100, ser('^TNX', '^IRX'));
    if (y('2Y') != null && y('10Y') != null) add('UST 2s10s', (y('10Y') - y('2Y')) * 100, null, '2Y from CME yield futures');
    if (y('5Y') != null && y('30Y') != null) add('UST 5s30s', (y('30Y') - y('5Y')) * 100, ser('^TYX', '^FVX'));
    if (y('10Y') != null && y('30Y') != null) add('UST 10s30s', (y('30Y') - y('10Y')) * 100, ser('^TYX', '^TNX'));
    const m = (t) => ((mx || []).find((r) => r.tenor === t) || {}).yield;
    if (m('2Y') != null && y('2Y') != null) add('TRY 2Y − UST 2Y', (m('2Y') - y('2Y')) * 100, null, 'local-currency differential');
    if (m('5Y') != null && y('5Y') != null) add('TRY 5Y − UST 5Y', (m('5Y') - y('5Y')) * 100, null, 'local-currency differential');
    return out;
  } });
  const ETF = [
    ['SHY', 'UST 1-3Y', 'US Treasuries'], ['IEF', 'UST 7-10Y', 'US Treasuries'], ['TLT', 'UST 20Y+', 'US Treasuries'], ['TIP', 'US TIPS (inflation-linked)', 'US Treasuries'], ['AGG', 'US Aggregate', 'US Aggregate'],
    ['LQD', 'USD IG corporates', 'Credit'], ['HYG', 'USD high yield', 'Credit'], ['JNK', 'USD high yield (alt.)', 'Credit'],
    ['BWX', 'Intl treasuries (unhedged)', 'DM ex-US'], ['IGOV', 'Intl treasuries (DM)', 'DM ex-US'], ['BNDX', 'Intl aggregate (USD-hedged)', 'DM ex-US'],
    ['EMB', 'EM sovereign, hard currency', 'Emerging markets'], ['VWOB', 'EM government, hard currency', 'Emerging markets'], ['EMLC', 'EM local-currency bonds', 'Emerging markets'], ['CEW', 'EM currency basket', 'Emerging markets'], ['TUR', 'MSCI Türkiye equities', 'Emerging markets']];
  dash.calc('gbond_etf', { inputs: ['gq1', 'gq2', 'gq3', 'etf_h', 'etf_h2'], title: 'gbond_etf', fn: (a, b, c, h1, h2) => {
    const h = (h1 || []).concat(h2 || []);
    const q = (a || []).concat(b || [], c || []);
    return ETF.map(([sym, desc, group]) => {
      const r = q.find((x) => x.symbol === sym); if (!r || typeof r.current_price !== 'number') return null;
      const s = hist(h, sym), px = r.current_price; const ret = (n) => { const v = back(s, n); return v ? R2((px / v - 1) * 100) : null; };
      return { sym, desc, group, px, r1w: ret(1), r1m: ret(4), r3m: ret(13), r6m: s.length ? R2((px / s[0].close - 1) * 100) : null, lo: r.week_52_low, hi: r.week_52_high, dy: typeof r.dividend_yield === 'number' ? r.dividend_yield : null, spark: s.map((p) => p.close).concat([px]) };
    }).filter(Boolean);
  } });
})();

(function () {
  const L = d3.formatLocale({ decimal: '.', thousands: ',', grouping: [3], currency: ['', ''] });
  const N = (v, d) => v == null || isNaN(v) ? '—' : L.format(',.' + (d == null ? 2 : d) + 'f')(v);
  const sgn = (v) => v > 0 ? '+' : v < 0 ? '−' : '';
  const rows = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : []; };
  const tone = (el, v, inv) => { const x = inv ? -v : v; el.classList.toggle('up', typeof v === 'number' && x > 0); el.classList.toggle('dn', typeof v === 'number' && x < 0); };
  const cell = (tr, text, cls) => { const td = tr.insertCell(); td.textContent = text; if (cls) td.className = cls; return td; };
  const BP = (v) => v == null ? '—' : sgn(v) + N(Math.abs(v), 0);
  const spark = (td, s, color) => { if (!s || s.length < 2) return; const w = 56, h = 16; const x = d3.scaleLinear().domain([0, s.length - 1]).range([1, w - 1]); const e = d3.extent(s); const y = d3.scaleLinear().domain(e[0] === e[1] ? [e[0] - 1, e[0] + 1] : e).range([h - 2, 2]); d3.select(td).append('svg').attr('width', w).attr('height', h).attr('aria-hidden', 'true').append('path').attr('d', d3.line().x((v, i) => x(i)).y((v) => y(v))(s)).style('fill', 'none').style('stroke', color || '#ffa028').style('stroke-width', 1.3); };
  const range = (td, lo, hi, v) => { if (lo == null || hi == null || hi <= lo) { td.textContent = '—'; return; } const w = 64; const x = d3.scaleLinear().domain([lo, hi]).range([3, w - 3]).clamp(true); const s = d3.select(td).append('svg').attr('width', w).attr('height', 12).attr('aria-hidden', 'true'); s.append('line').attr('x1', 3).attr('x2', w - 3).attr('y1', 6).attr('y2', 6).style('stroke', '#3a3a3a').style('stroke-width', 2); s.append('circle').attr('cx', x(v)).attr('cy', 6).attr('r', 3.5).style('fill', '#3cc8f0'); };

  // KPIs for the global strip
  const kv = (name, fn) => dash.draw(name, (el) => { const r = fn(); el.textContent = r && r.text != null ? r.text : '—'; if (r && 'tone' in r) tone(el, r.tone, r.inv); });
  const u = (t) => rows('ust').find((r) => r.tenor === t);
  kv('g-k-10y', () => { const r = u('10Y'); return r && { text: N(r.yield, 3) + '%' }; });
  kv('g-k-10y-c', () => { const r = u('10Y'); return r && { text: BP(r.chg_1w) + ' bp 1W · ' + BP(r.chg_1m) + ' bp 1M', tone: r.chg_1w, inv: true }; });
  kv('g-k-2s10s', () => { const s = rows('ust_spreads').find((r) => r.name === 'UST 2s10s'); return s && { text: BP(s.bp) + ' bp', tone: s.bp }; });
  kv('g-k-try', () => { const s = rows('ust_spreads').find((r) => r.name === 'TRY 2Y − UST 2Y'); return s && { text: N(s.bp, 0) + ' bp' }; });
  const g = (sym) => rows('gbond_etf').find((r) => r.sym === sym);
  const qv = (sym) => { const all = ['gq2'].flatMap((id) => rows(id)); return all.find((r) => r.symbol === sym); };
  kv('g-k-vix', () => { const r = qv('^VIX'); return r && { text: N(r.current_price, 2) }; });
  kv('g-k-dxy', () => { const r = qv('DX-Y.NYB'); return r && { text: N(r.current_price, 2) }; });
  kv('g-k-emb', () => { const r = g('EMB'); return r && { text: sgn(r.r1m) + N(Math.abs(r.r1m), 2) + '% 1M', tone: r.r1m }; });

  dash.draw('g-ust-curve', (el) => {
    const r = rows('ust'); if (!r.length) return;
    const pts = (f) => r.map((x) => ({ x: x.yrs, y: f(x) })).filter((p) => p.y != null);
    TT.xy(el, [
      { name: 'Today', color: '#ffa028', width: 2.5, dots: true, values: pts((x) => x.yield) },
      { name: '1M ago', color: '#3cc8f0', dash: true, width: 1.5, values: pts((x) => x.chg_1m == null ? null : x.yield - x.chg_1m / 100) },
      { name: '6M ago', color: '#8a8a8a', dash: true, width: 1.5, values: pts((x) => x.chg_6m == null ? null : x.yield - x.chg_6m / 100) }
    ], { height: 230, xFmt: (v) => v === 0 ? '0' : N(v, 0) + 'Y', yFmt: (v) => N(v, 1) + '%', tipX: (v) => N(v, 2) + ' yrs', tipY: (v) => N(v, 3) + '%' });
  });
  dash.draw('g-ust', (tb) => {
    tb.replaceChildren();
    rows('ust').forEach((r) => {
      const tr = tb.insertRow(); const c = cell(tr, 'UST ' + r.tenor, 'hi'); c.title = r.src;
      cell(tr, N(r.yield, 3) + '%', 'r yl');
      ['chg_1w', 'chg_1m', 'chg_3m', 'chg_6m'].forEach((k) => tone(cell(tr, BP(r[k]), 'r'), r[k], true));
      spark(tr.insertCell(), r.spark); range(tr.insertCell(), r.lo, r.hi, r.yield);
    });
  });
  dash.draw('g-spreads', (tb) => {
    tb.replaceChildren();
    rows('ust_spreads').forEach((r) => {
      const tr = tb.insertRow(); const c = cell(tr, r.name, r.name.startsWith('TRY') ? 'yl' : 'hi'); if (r.note) c.title = r.note;
      tone(cell(tr, BP(r.bp) + ' bp', 'r'), r.bp); tone(cell(tr, BP(r.chg_1m), 'r'), r.chg_1m);
      cell(tr, r.lo == null ? '—' : BP(r.lo), 'r mu'); cell(tr, r.hi == null ? '—' : BP(r.hi), 'r mu');
    });
  });
  // Normalised performance chart (6M = 100)
  const PERF = [['TLT', '#3cc8f0'], ['TIP', '#7fd4ff'], ['LQD', '#2ee66b'], ['HYG', '#c86bff'], ['BWX', '#ffd23c'], ['EMB', '#ffa028'], ['EMLC', '#ff4545']];
  dash.draw('g-perf', (el) => {
    const r = rows('gbond_etf'); if (!r.length) return;
    const h = dash.data('etf_h').status === 'ok' ? dash.data('etf_h').data : [];
    const series = PERF.map(([sym, color]) => { const x = h.find((q) => q.symbol === sym); if (!x || !Array.isArray(x.data) || !x.data.length) return null; const base = x.data[0].close; return { name: sym, color, width: sym === 'EMB' || sym === 'EMLC' ? 2.2 : 1.5, values: x.data.map((d) => ({ x: TT.parseD(d.date), y: d.close / base * 100 })) }; }).filter(Boolean);
    TT.chart(el, series, { height: 230, yFmt: (v) => N(v, 0), tipFmt: (v) => N(v, 2), refs: [{ y: 100, label: '100' }] });
  });
  dash.draw('g-etf', (tb) => {
    tb.replaceChildren(); let grp = null;
    rows('gbond_etf').forEach((r) => {
      if (r.group !== grp) { grp = r.group; const tr = tb.insertRow(); const td = cell(tr, grp.toUpperCase(), 'am'); td.colSpan = 11; td.style.fontSize = '10px'; td.style.letterSpacing = '.06em'; td.style.paddingTop = '6px'; }
      const tr = tb.insertRow(); cell(tr, r.sym, r.sym === 'TUR' ? 'yl' : 'hi'); cell(tr, r.desc, 'mu'); cell(tr, N(r.px, 2), 'r');
      ['r1w', 'r1m', 'r3m', 'r6m'].forEach((k) => tone(cell(tr, r[k] == null ? '—' : sgn(r[k]) + N(Math.abs(r[k]), 2) + '%', 'r'), r[k]));
      spark(tr.insertCell(), r.spark, (r.r6m || 0) >= 0 ? '#2ee66b' : '#ff4545'); range(tr.insertCell(), r.lo, r.hi, r.px);
      cell(tr, r.dy == null ? '—' : N(r.dy, 2) + '%', 'r');
    });
  });
})();
