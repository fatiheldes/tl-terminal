// Derivatives (volatility monitor, index & FX futures basis) and Credit (Türkiye loan rates, loan growth, non-performing loans).
(function () {
  const P = window.TTparse;
  ['volq1', 'volq2', 'volh', 'spxd', 'futq', 'futs_spot'].forEach((id) => dash.loader(id, { description: '', fn: P.tsv }));
  ['cr_rates', 'cr_loans'].forEach((id) => dash.loader(id, { description: '', fn: P.md() }));
  const isN = (v) => typeof v === 'number' && isFinite(v);
  const R2 = (v) => isN(v) ? Math.round(v * 100) / 100 : null;
  const asof = () => { const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(String(window.TT_ASOF || '')); return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : new Date(); };
  const hist = (h, sym) => { const r = (h || []).find((x) => x.symbol === sym); return r && Array.isArray(r.data) ? r.data.filter((d) => isN(d.close)).map((d) => ({ date: String(d.date).slice(0, 10), close: d.close })) : []; };

  // ---- Volatility ----
  const VOL = { '^VIX9D': ['S&P 500 · 9-day', 'Equity', 9], '^VIX': ['S&P 500 · 30-day (VIX)', 'Equity', 30], '^VIX3M': ['S&P 500 · 3-month', 'Equity', 93], '^VIX6M': ['S&P 500 · 6-month', 'Equity', 182], '^VIX1Y': ['S&P 500 · 1-year', 'Equity', 365],
    '^VXN': ['Nasdaq 100', 'Equity', 30], '^VXD': ['Dow Jones', 'Equity', 30], '^VXEEM': ['Emerging markets (EEM)', 'Equity', 30], '^VVIX': ['Vol of VIX (VVIX)', 'Vol-of-vol', 30], '^SKEW': ['S&P 500 tail skew (SKEW)', 'Skew', 30],
    '^MOVE': ['US Treasury (MOVE)', 'Rates', 30], '^VXTLT': ['20Y+ Treasury ETF (TLT)', 'Rates', 30], '^OVX': ['Crude oil (USO)', 'Commodities', 30], '^GVZ': ['Gold (GLD)', 'Commodities', 30], '^VXSLV': ['Silver (SLV)', 'Commodities', 30] };
  window.DVOL = VOL;
  dash.calc('dv_tbl', { inputs: ['volq1', 'volq2', 'volh'], title: 'dv_tbl', fn: (a, b, h) => [].concat(a || [], b || []).filter((q) => isN(q.current_price) && VOL[q.symbol]).map((q) => {
    const s = hist(h, q.symbol), back = (n) => s.length > n ? s[s.length - 1 - n].close : null;
    const hi = isN(q.week_52_high) && q.week_52_high > 0 ? q.week_52_high : null, lo = isN(q.week_52_low) && q.week_52_low > 0 ? q.week_52_low : null;
    return { sym: q.symbol, name: VOL[q.symbol][0], cls: VOL[q.symbol][1], days: VOL[q.symbol][2], v: q.current_price, hi, lo, pct52: hi && lo && hi > lo ? R2((q.current_price - lo) / (hi - lo) * 100) : null, w1: back(1) != null ? R2(q.current_price - back(1)) : null, m1: back(4) != null ? R2(q.current_price - back(4)) : null, spark: s.map((x) => x.close) };
  }) });
  dash.calc('dv_term', { inputs: ['dv_tbl'], title: 'dv_term', fn: (t) => (t || []).filter((r) => /^\^VIX(9D|3M|6M|1Y)?$/.test(r.sym)).sort((a, b) => a.days - b.days) });
  dash.calc('dv_hist', { inputs: ['volh'], title: 'dv_hist', fn: (h) => { const v = hist(h, '^VIX'), v3 = hist(h, '^VIX3M'), mv = hist(h, '^MOVE'), vv = hist(h, '^VVIX');
    return v.map((x, i) => ({ date: x.date, vix: x.close, vix3m: v3[i] ? v3[i].close : null, move: mv[i] ? mv[i].close : null, vvix: vv[i] ? vv[i].close : null, ratio: v3[i] ? R2(x.close / v3[i].close) : null })); } });
  // Realised vs implied
  dash.calc('dv_rv', { inputs: ['spxd', 'dv_tbl'], title: 'dv_rv', fn: (h, t) => {
    const imp = (s) => ((t || []).find((r) => r.sym === s) || {}).v;
    return [['^GSPC', 'S&P 500', '^VIX'], ['^NDX', 'Nasdaq 100', '^VXN']].map(([sym, name, vs]) => {
      const s = hist(h, sym); const r = []; for (let i = 1; i < s.length; i++) r.push(Math.log(s[i].close / s[i - 1].close));
      const rv = (n) => { const x = r.slice(-n); if (x.length < Math.min(n, 5)) return null; const m = d3.mean(x); return R2(Math.sqrt(d3.sum(x.map((v) => (v - m) ** 2)) / (x.length - 1)) * Math.sqrt(252) * 100); };
      const big = r.length ? R2(d3.max(r.map(Math.abs)) * 100) : null;
      const roll = s.map((p, i) => { if (i < 10) return null; const x = r.slice(i - 10, i); const m = d3.mean(x); return { date: p.date, rv10: R2(Math.sqrt(d3.sum(x.map((v) => (v - m) ** 2)) / (x.length - 1)) * Math.sqrt(252) * 100) }; }).filter(Boolean);
      const iv = imp(vs), rv20 = rv(20);
      return { sym, name, implied: iv, implied_sym: vs, rv10: rv(10), rv20, vrp: isN(iv) && isN(rv20) ? R2(iv - rv20) : null, maxmove: big, n: r.length, roll, move1d: isN(iv) ? R2(iv / Math.sqrt(252)) : null };
    });
  } });

  // ---- Futures basis ----
  const thirdFri = (y, m) => { const d = new Date(Date.UTC(y, m, 1)); const off = (5 - d.getUTCDay() + 7) % 7; return new Date(Date.UTC(y, m, 1 + off + 14)); };
  const nextQ = (t) => { for (let k = 0; k < 6; k++) { const y = t.getUTCFullYear() + Math.floor((t.getUTCMonth() + k) / 12), m = (t.getUTCMonth() + k) % 12; if (m % 3 !== 2) continue; const e = thirdFri(y, m); if (e > t) return e; } return null; };
  const fxExp = (e) => new Date(+e - 4 * 864e5); // CME FX futures stop two business days before the third Wednesday, i.e. the Monday before
  dash.calc('df_eq', { inputs: ['futq', 'futs_spot', 'wiq1', 'wiq3', 'gq1'], title: 'df_eq', fn: (f, sp, w1, w3, g) => {
    const t = asof(), exp = nextQ(t), d = exp ? Math.max(1, Math.round((exp - t) / 864e5)) : null;
    const q = (rs, s) => ((rs || []).find((r) => r.symbol === s) || {}).current_price;
    const tb = q(g, '^IRX');
    return [['ES=F', 'E-mini S&P 500', '^GSPC', w1], ['NQ=F', 'E-mini Nasdaq 100', '^NDX', sp], ['YM=F', 'E-mini Dow', '^DJI', w1], ['RTY=F', 'E-mini Russell 2000', '^RUT', w1], ['NKD=F', 'Nikkei 225 (USD)', '^N225', w3]].map(([fs, name, ss, src]) => {
      const F = q(f, fs), S = q(src, ss); if (!isN(F) || !isN(S)) return null;
      const basis = F - S, carry = d ? R2((F / S - 1) * 360 / d * 100) : null;
      return { fut: fs, name, spot: ss, F, S, basis: R2(basis), basis_pct: R2((F / S - 1) * 100), days: d, expiry: exp ? exp.toISOString().slice(0, 10) : null, carry, tbill: tb, div_implied: isN(carry) && isN(tb) ? R2(tb - carry) : null };
    }).filter(Boolean);
  } });
  dash.calc('df_fx', { inputs: ['futq', 'fxq1', 'fi_policy'], title: 'df_fx', fn: (f, fx, pol) => {
    const t = asof(), e = nextQ(t), exp = e ? fxExp(e) : null, d = exp ? Math.max(1, Math.round((exp - t) / 864e5)) : null;
    const q = (rs, s) => ((rs || []).find((r) => r.symbol === s) || {}).current_price;
    const P2 = (c) => ((pol || []).find((r) => r.code === c) || {}).rate;
    const us = P2('USA');
    return [['6E=F', 'EUR/USD', 'EURUSD=X', false, 'XM'], ['6B=F', 'GBP/USD', 'GBPUSD=X', false, 'GBR'], ['6S=F', 'CHF/USD', 'USDCHF=X', true, null], ['6A=F', 'AUD/USD', 'AUDUSD=X', false, 'AUS'], ['6C=F', 'CAD/USD', 'USDCAD=X', true, null]].map(([fs, name, ss, inv, pc]) => {
      const F = q(f, fs), S0 = q(fx, ss); if (!isN(F) || !isN(S0)) return null; const S = inv ? 1 / S0 : S0;
      const diff = d ? R2((F / S - 1) * 360 / d * 100) : null, pd = isN(us) && pc && isN(P2(pc)) ? R2(us - P2(pc)) : null;
      return { fut: fs, name, F, S: R2(S * 1e4) / 1e4, pts: R2((F - S) * 1e4), days: d, expiry: exp ? exp.toISOString().slice(0, 10) : null, implied: diff, policy: pd };
    }).filter(Boolean);
  } });

  // ---- Credit (Türkiye) ----
  const wk = (rows) => (rows || []).filter((r) => r.tarih).sort((a, b) => a.tarih < b.tarih ? -1 : 1);
  dash.calc('cr_r', { inputs: ['cr_rates', 'inflation'], title: 'cr_r', fn: (rows, inf) => {
    const cs = (inf || []).filter((r) => isN(r.rate)).sort((a, b) => a.date < b.date ? -1 : 1);
    // CPI print in force for each week: the latest month that ended before the week (published early the next month)
    const cpiAt = (d) => { let c = null; cs.forEach((x) => { const t = TT.parseD(x.date); const pub = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 3)); if (pub <= TT.parseD(d)) c = x; }); return c; };
    return wk(rows).map((r) => { const cpi = cpiAt(r.tarih); return ({ date: r.tarih, cons: r.KTFTUK, gpl: r.KTF101, auto: r.KTF11, house: r.KTF12, comm: r.KTF17, comm_x: r.KTF18, comm_usd: r.KTF17_USD, comm_eur: r.KTF17_EUR, dep: r.TRY_MT06, dep_usd: r.USD_MT06,
      sp_comm: isN(r.KTF17) && isN(r.TRY_MT06) ? R2(r.KTF17 - r.TRY_MT06) : null, sp_cons: isN(r.KTFTUK) && isN(r.TRY_MT06) ? R2(r.KTFTUK - r.TRY_MT06) : null,
      real_comm: isN(r.KTF17) && cpi ? R2(((1 + r.KTF17 / 100) / (1 + cpi.rate / 100) - 1) * 100) : null, real_dep: isN(r.TRY_MT06) && cpi ? R2(((1 + r.TRY_MT06 / 100) / (1 + cpi.rate / 100) - 1) * 100) : null, cpi: cpi ? cpi.rate : null }); });
  } });
  const LK = { total: 'HPBITABLO6_1', cons: 'HPBITABLO6_2', house: 'HPBITABLO6_3', auto: 'HPBITABLO6_7', gpl: 'HPBITABLO6_11', card: 'HPBITABLO6_16', comm: 'HPBITABLO6_20', ccard: 'HPBITABLO6_33', npl_cons: 'HPBITABLO6_50', npl_comm: 'HPBITABLO6_55' };
  dash.calc('cr_l', { inputs: ['cr_loans'], title: 'cr_l', fn: (rows) => {
    const s = wk(rows);
    return s.map((r, i) => { const o = { date: r.tarih };
      Object.entries(LK).forEach(([k, c]) => { o[k] = isN(r[c]) ? r[c] * 1000 : null; const b13 = i >= 13 ? s[i - 13][c] : null, b52 = i >= 52 ? s[i - 52][c] : null; o[k + '_13'] = isN(r[c]) && isN(b13) && b13 ? R2((Math.pow(r[c] / b13, 52 / 13) - 1) * 100) : null; o[k + '_52'] = isN(r[c]) && isN(b52) && b52 ? R2((r[c] / b52 - 1) * 100) : null; });
      const nc = r[LK.npl_cons], nm = r[LK.npl_comm], c = r[LK.cons];
      o.npl_cons_r = isN(nc) && isN(c) ? R2(nc / (c + nc) * 100) : null; o.npl_comm_r = isN(nm) && isN(r[LK.comm]) ? R2(nm / (r[LK.comm] + nm) * 100) : null;
      o.npl_r = isN(nc) && isN(nm) && isN(r[LK.total]) ? R2((nc + nm) / (r[LK.total] + nc + nm) * 100) : null;
      return o; });
  } });
})();

(function () {
  const L = d3.formatLocale({ decimal: '.', thousands: ',', grouping: [3], currency: ['', ''] });
  const N = (v, d) => v == null || isNaN(v) ? '—' : L.format(',.' + (d == null ? 2 : d) + 'f')(v);
  const sgn = (v) => v > 0 ? '+' : v < 0 ? '−' : '';
  const isN = (v) => typeof v === 'number' && isFinite(v);
  const PC = (v, d) => !isN(v) ? '—' : sgn(v) + N(Math.abs(v), d == null ? 1 : d) + '%';
  const SN = (v, d) => !isN(v) ? '—' : sgn(v) + N(Math.abs(v), d == null ? 2 : d);
  const rows = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : []; };
  const tone = (el, v) => { el.classList.toggle('up', isN(v) && v > 0.004); el.classList.toggle('dn', isN(v) && v < -0.004); };
  const cell = (tr, text, cls) => { const td = tr.insertCell(); td.textContent = text; if (cls) td.className = cls; return td; };
  const kv = (name, fn) => dash.draw(name, (el) => { const r = fn(); el.textContent = r && r.text != null ? r.text : '—'; if (r && 'tone' in r) tone(el, r.tone); });
  const D = (s) => TT.parseD(s);
  const spark = (td, s, color) => { s = (s || []).filter(isN); if (s.length < 2) return; const w = 70, h = 16; const x = d3.scaleLinear().domain([0, s.length - 1]).range([1, w - 1]); const e = d3.extent(s); const y = d3.scaleLinear().domain(e[0] === e[1] ? [e[0] - 1, e[0] + 1] : e).range([h - 2, 2]); d3.select(td).append('svg').attr('width', w).attr('height', h).attr('aria-hidden', 'true').append('path').attr('d', d3.line().x((v, i) => x(i)).y((v) => y(v))(s)).style('fill', 'none').style('stroke', color || '#ffa028').style('stroke-width', 1.3); };
  const pctBar = (td, p) => { if (!isN(p)) { td.textContent = '—'; return; } const w = 70; const s = d3.select(td).append('svg').attr('width', w).attr('height', 12).attr('aria-hidden', 'true'); s.append('rect').attr('x', 2).attr('y', 4).attr('width', w - 4).attr('height', 4).style('fill', '#2a2a2a'); s.append('rect').attr('x', 2).attr('y', 4).attr('width', (w - 4) * Math.max(0, Math.min(100, p)) / 100).attr('height', 4).style('fill', p > 75 ? '#ff4545' : p > 40 ? '#ffa028' : '#2ee66b'); };
  const V = (s) => rows('dv_tbl').find((r) => r.sym === s);
  const line = (name, id, specs, o) => dash.draw(name, (el) => { const s = rows(id); if (!s.length) return; TT.chart(el, specs.map(([lbl, k, color, w, dash2]) => ({ name: lbl, color, width: w || 1.8, dash: dash2, values: s.filter((r) => isN(r[k])).map((r) => ({ x: D(r.date), y: r[k] })) })).filter((x) => x.values.length), Object.assign({ height: 220, yFmt: (v) => N(v, 0) + '%', tipFmt: (v) => N(v, 2) + '%' }, o || {})); });

  // ===== Derivatives KPIs =====
  kv('dv-k-vix', () => { const r = V('^VIX'); return r && { text: N(r.v, 2) }; });
  kv('dv-k-vix-c', () => { const r = V('^VIX'); return r && { text: SN(r.w1) + ' 1W · ' + N(r.pct52, 0) + '% of 52W range', tone: -(r.w1 || 0) }; });
  kv('dv-k-term', () => { const a = V('^VIX'), b = V('^VIX3M'); return a && b && { text: N(a.v / b.v, 2) }; });
  kv('dv-k-term-c', () => { const a = V('^VIX'), b = V('^VIX3M'); return a && b && { text: a.v > b.v ? 'VIX/VIX3M · backwardation (stress)' : 'VIX/VIX3M · contango (calm)', tone: b.v - a.v }; });
  kv('dv-k-move', () => { const r = V('^MOVE'); return r && { text: N(r.v, 1) }; });
  kv('dv-k-move-c', () => { const r = V('^MOVE'); return r && { text: SN(r.m1, 1) + ' 1M · bond vol', tone: -(r.m1 || 0) }; });
  kv('dv-k-vvix', () => { const r = V('^VVIX'); return r && { text: N(r.v, 1) }; });
  kv('dv-k-vvix-c', () => { const r = V('^SKEW'); return r && { text: 'SKEW ' + N(r.v, 1) }; });
  kv('dv-k-rv', () => { const r = rows('dv_rv')[0]; return r && { text: N(r.rv20, 1) + '%' }; });
  kv('dv-k-rv-c', () => { const r = rows('dv_rv')[0]; return r && { text: 'S&P 20D realised · VIX premium ' + SN(r.vrp, 1), tone: r.vrp }; });
  kv('dv-k-ovx', () => { const r = V('^OVX'); return r && { text: N(r.v, 1) }; });
  kv('dv-k-ovx-c', () => { const r = V('^GVZ'); return r && { text: 'oil · gold GVZ ' + N(r.v, 1) }; });

  // VOL
  dash.draw('dv-term', (el) => { const t = rows('dv_term'); if (!t.length) return; TT.xy(el, [{ name: 'VIX term structure, today', color: '#ffa028', width: 2.4, dots: true, values: t.map((r) => ({ x: r.days, y: r.v })) }], { height: 220, xFmt: (v) => v + 'd', yFmt: (v) => N(v, 0), tipX: (v) => N(v, 0) + ' days', tipY: (v) => N(v, 2) }); });
  dash.draw('dv-table', (tb) => {
    tb.replaceChildren(); let g = null; const ord = ['Equity', 'Vol-of-vol', 'Skew', 'Rates', 'Commodities'];
    rows('dv_tbl').slice().sort((a, b) => ord.indexOf(a.cls) - ord.indexOf(b.cls) || a.days - b.days).forEach((r) => {
      if (r.cls !== g) { g = r.cls; const tr = tb.insertRow(); const td = cell(tr, g.toUpperCase(), 'am'); td.colSpan = 9; td.style.fontSize = '10px'; td.style.paddingTop = '6px'; }
      const tr = tb.insertRow(); cell(tr, r.sym.replace('^', ''), 'yl'); cell(tr, r.name, 'hi'); cell(tr, N(r.v, 2), 'r'); tone(cell(tr, SN(r.w1), 'r'), -(r.w1 || 0)); tone(cell(tr, SN(r.m1), 'r'), -(r.m1 || 0)); cell(tr, r.lo == null ? '—' : N(r.lo, 1), 'r mu'); cell(tr, r.hi == null ? '—' : N(r.hi, 1), 'r mu'); pctBar(tr.insertCell(), r.pct52); spark(tr.insertCell(), r.spark, '#ffa028');
    });
  });
  line('dv-hist', 'dv_hist', [['VIX (30-day)', 'vix', '#ffa028', 2.2], ['VIX3M (3-month)', 'vix3m', '#3cc8f0', 1.6]], { height: 210, yFmt: (v) => N(v, 0), tipFmt: (v) => N(v, 2) });
  line('dv-move', 'dv_hist', [['MOVE (US Treasury implied vol, bp)', 'move', '#c86bff', 2.2], ['VVIX', 'vvix', '#7fd4ff', 1.4, true]], { height: 210, yFmt: (v) => N(v, 0), tipFmt: (v) => N(v, 1) });
  dash.draw('dv-ratio', (el) => { const s = rows('dv_hist').filter((r) => isN(r.ratio)); if (!s.length) return; TT.chart(el, [{ name: 'VIX ÷ VIX3M (above 1 = inverted, stress)', color: '#ff6b6b', width: 2, values: s.map((r) => ({ x: D(r.date), y: r.ratio })) }], { height: 160, yFmt: (v) => N(v, 2), tipFmt: (v) => N(v, 3), refs: [{ y: 1, label: '1.00' }] }); });
  dash.draw('dv-rv', (tb) => {
    tb.replaceChildren();
    rows('dv_rv').forEach((r) => { const tr = tb.insertRow(); cell(tr, r.name, 'hi'); cell(tr, r.implied_sym.replace('^', '') + ' ' + N(r.implied, 2), 'r yl'); cell(tr, N(r.rv10, 1) + '%', 'r'); cell(tr, N(r.rv20, 1) + '%', 'r'); tone(cell(tr, SN(r.vrp, 1), 'r'), r.vrp); cell(tr, '±' + N(r.move1d, 2) + '%', 'r'); cell(tr, N(r.maxmove, 2) + '%', 'r mu'); });
  });
  dash.draw('dv-rvc', (el) => { const r = rows('dv_rv'); if (!r.length) return; const vix = r[0].implied, vxn = r[1] && r[1].implied;
    TT.chart(el, [{ name: 'S&P 500 realised vol, 10-day', color: '#ffa028', width: 2, values: r[0].roll.map((p) => ({ x: D(p.date), y: p.rv10 })) }].concat(r[1] ? [{ name: 'Nasdaq 100 realised vol, 10-day', color: '#3cc8f0', width: 1.6, values: r[1].roll.map((p) => ({ x: D(p.date), y: p.rv10 })) }] : []), { height: 200, yFmt: (v) => N(v, 0) + '%', tipFmt: (v) => N(v, 1) + '%', refs: [{ y: vix, label: 'VIX ' + N(vix, 1) }].concat(isN(vxn) ? [{ y: vxn, label: 'VXN ' + N(vxn, 1) }] : []) }); });

  // FMON
  dash.draw('df-eq', (tb) => {
    tb.replaceChildren();
    rows('df_eq').forEach((r) => { const tr = tb.insertRow(); cell(tr, r.fut, 'yl'); cell(tr, r.name, 'hi'); cell(tr, N(r.F, 2), 'r'); cell(tr, r.spot.replace('^', '') + ' ' + N(r.S, 2), 'r mu'); tone(cell(tr, SN(r.basis, 2), 'r'), r.basis); cell(tr, PC(r.basis_pct, 2), 'r'); cell(tr, r.days + 'd', 'r mu'); tone(cell(tr, PC(r.carry, 2), 'r'), r.carry); cell(tr, r.tbill == null ? '—' : N(r.tbill, 2) + '%', 'r mu'); cell(tr, PC(r.div_implied, 2), 'r'); const bad = isN(r.div_implied) && (r.div_implied < -1 || r.div_implied > 5); const f = cell(tr, bad ? 'timing gap?' : 'ok', bad ? 'dn' : 'mu'); f.title = bad ? 'An implied dividend yield this far from normal (0–4%) usually means the futures and cash prices were taken at different times.' : ''; });
  });
  dash.draw('df-fx', (tb) => {
    tb.replaceChildren();
    rows('df_fx').forEach((r) => { const tr = tb.insertRow(); cell(tr, r.fut, 'yl'); cell(tr, r.name, 'hi'); cell(tr, N(r.F, 4), 'r'); cell(tr, N(r.S, 4), 'r mu'); tone(cell(tr, SN(r.pts, 1), 'r'), r.pts); cell(tr, r.days + 'd', 'r mu'); tone(cell(tr, PC(r.implied, 2), 'r'), r.implied); cell(tr, r.policy == null ? '—' : SN(r.policy, 2) + '%', 'r'); const bad = isN(r.implied) && isN(r.policy) && Math.abs(r.implied - r.policy) > 1.5; const f = cell(tr, r.policy == null ? '—' : bad ? 'timing gap?' : 'ok', bad ? 'dn' : 'mu'); f.title = bad ? 'Implied gap far from the policy-rate gap: spot and futures were probably quoted at different times.' : ''; });
  });
  dash.draw('df-bars', (el) => { const d = rows('df_eq').concat(rows('df_fx').map((r) => ({ name: r.name + ' (FX)', carry: r.implied }))); TT.hbars(el, d.filter((r) => isN(r.carry)).map((r) => ({ label: r.name, v: r.carry, color: /FX/.test(r.name) ? '#3cc8f0' : '#ffa028' })), { lw: 190, refs: [{ v: (rows('df_eq')[0] || {}).tbill, label: '3M T-bill', color: '#2ee66b' }] }); });

  // ===== Credit KPIs =====
  const LR = (id, k) => { const v = rows(id).filter((r) => isN(r[k])); return v.length ? v[v.length - 1] : null; };
  const PR = (id, k, n) => { const v = rows(id).filter((r) => isN(r[k])); return v.length > n ? v[v.length - 1 - n] : null; };
  const wkd = (r) => r ? TT.dShort(D(r.date)) : '';
  [['cr-k-comm', 'comm', 'TL commercial loans'], ['cr-k-cons', 'cons', 'TL consumer loans'], ['cr-k-dep', 'dep', 'TL deposits']].forEach(([n, k, lbl]) => {
    kv(n, () => { const r = LR('cr_r', k); return r && { text: N(r[k], 2) + '%' }; });
    kv(n + '-c', () => { const r = LR('cr_r', k), p = PR('cr_r', k, 4); return r && { text: lbl + ' · ' + SN(p ? r[k] - p[k] : null, 2) + ' 4W · ' + wkd(r), tone: p ? -(r[k] - p[k]) : 0 }; });
  });
  kv('cr-k-sp', () => { const r = LR('cr_r', 'sp_comm'); return r && { text: N(r.sp_comm * 100, 0) + 'bp' }; });
  kv('cr-k-sp-c', () => { const r = LR('cr_r', 'real_comm'); return r && { text: 'commercial − deposit · real loan rate ' + N(r.real_comm, 1) + '%' }; });
  kv('cr-k-gr', () => { const r = LR('cr_l', 'total_13'); return r && { text: N(r.total_13, 1) + '%' }; });
  kv('cr-k-gr-c', () => { const r = LR('cr_l', 'total_52'); return r && { text: 'loan growth 13W ann. · y/y ' + N(r.total_52, 1) + '%' }; });
  kv('cr-k-npl', () => { const r = LR('cr_l', 'npl_r'); return r && { text: N(r.npl_r, 2) + '%' }; });
  kv('cr-k-npl-c', () => { const r = LR('cr_l', 'npl_r'), p = PR('cr_l', 'npl_r', 13); return r && { text: 'NPL ratio · ' + SN(p ? r.npl_r - p.npl_r : null, 2) + 'pp 13W', tone: p ? -(r.npl_r - p.npl_r) : 0 }; });

  // TRCR
  line('cr-rates', 'cr_r', [['Consumer (GPL + auto + housing)', 'cons', '#ffa028', 2], ['General-purpose incl. overdraft', 'gpl', '#ff6b6b', 1.4, true], ['Housing', 'house', '#2ee66b', 1.6], ['Auto', 'auto', '#7fd4ff', 1.2, true], ['Commercial', 'comm', '#c86bff', 2], ['TL deposits (all maturities)', 'dep', '#ffd23c', 2]], { height: 240 });
  line('cr-spread', 'cr_r', [['Commercial − deposit', 'sp_comm', '#c86bff', 2], ['Consumer − deposit', 'sp_cons', '#ffa028', 2]], { height: 190, yFmt: (v) => N(v, 0) + 'pp', tipFmt: (v) => N(v, 2) + 'pp' });
  line('cr-fx', 'cr_r', [['USD commercial loans', 'comm_usd', '#3cc8f0', 2], ['EUR commercial loans', 'comm_eur', '#2ee66b', 1.6], ['USD deposits', 'dep_usd', '#ffd23c', 1.6, true]], { height: 190, yFmt: (v) => N(v, 1) + '%', tipFmt: (v) => N(v, 2) + '%' });
  dash.draw('cr-rtab', (tb) => {
    tb.replaceChildren(); const s = rows('cr_r'); if (!s.length) return; const a = s[s.length - 1], b = s[s.length - 5], c = s[s.length - 14], y = s[0];
    [['Consumer loans (GPL + auto + housing)', 'cons'], ['General-purpose incl. overdraft', 'gpl'], ['Auto loans', 'auto'], ['Housing loans', 'house'], ['Commercial loans', 'comm'], ['Commercial ex overdraft & corporate cards', 'comm_x'], ['Commercial loans, USD', 'comm_usd'], ['Commercial loans, EUR', 'comm_eur'], ['TL deposits', 'dep'], ['USD deposits', 'dep_usd']].forEach(([n, k]) => {
      const tr = tb.insertRow(); cell(tr, n, 'hi'); cell(tr, N(a[k], 2) + '%', 'r yl'); [b, c, y].forEach((p) => { const ch = p && isN(p[k]) && isN(a[k]) ? a[k] - p[k] : null; tone(cell(tr, SN(ch, 2), 'r'), ch == null ? null : -ch); }); spark(tr.insertCell(), s.map((r) => r[k]), '#ffa028');
    });
    const h = tb.closest('table').querySelector('thead tr'); if (h && y) h.children[4].textContent = 'Since ' + TT.dShort(D(y.date)) + ' ' + y.date.slice(2, 4);
  });
  dash.draw('cr-growth', (el) => { const s = rows('cr_l').filter((r) => isN(r.total_13)); if (!s.length) return; const f = (k, n, c, w, d2) => ({ name: n, color: c, width: w, dash: d2, values: s.filter((r) => isN(r[k])).map((r) => ({ x: D(r.date), y: r[k] })) }); TT.chart(el, [f('total_13', 'Total loans', '#ffd23c', 2.4), f('comm_13', 'Commercial', '#c86bff', 1.8), f('cons_13', 'Consumer', '#ffa028', 1.8), f('card_13', 'Personal credit cards', '#ff6b6b', 1.2, true), f('house_13', 'Housing', '#2ee66b', 1.2, true)], { height: 230, yFmt: (v) => N(v, 0) + '%', tipFmt: (v) => N(v, 1) + '%' }); });
  dash.draw('cr-gtab', (tb) => {
    tb.replaceChildren(); const s = rows('cr_l'); if (!s.length) return; const a = s[s.length - 1];
    [['Total loans to residents', 'total'], ['Commercial loans', 'comm'], ['Corporate credit cards', 'ccard'], ['Consumer loans', 'cons'], ['General-purpose loans', 'gpl'], ['Personal credit cards', 'card'], ['Housing loans', 'house'], ['Auto loans', 'auto'], ['NPL, consumer', 'npl_cons'], ['NPL, commercial & other', 'npl_comm']].forEach(([n, k]) => {
      const tr = tb.insertRow(); cell(tr, n, 'hi'); cell(tr, N(a[k] / 1e12, 2), 'r yl'); [['13', 40], ['52', 40]].forEach(([w]) => tone(cell(tr, PC(a[k + '_' + w]), 'r'), /npl/.test(k) ? -(a[k + '_' + w] || 0) : a[k + '_' + w])); cell(tr, a.total ? N(a[k] / a.total * 100, 1) + '%' : '—', 'r mu'); spark(tr.insertCell(), s.slice(-26).map((r) => r[k]), /npl/.test(k) ? '#ff6b6b' : '#ffa028');
    });
  });
  line('cr-npl', 'cr_l', [['NPL ratio, total', 'npl_r', '#ffd23c', 2.4], ['Consumer', 'npl_cons_r', '#ffa028', 1.8], ['Commercial & other', 'npl_comm_r', '#c86bff', 1.8]], { height: 220, yFmt: (v) => N(v, 1) + '%', tipFmt: (v) => N(v, 2) + '%' });
  line('cr-real', 'cr_r', [['Real commercial loan rate', 'real_comm', '#c86bff', 2], ['Real TL deposit rate', 'real_dep', '#ffd23c', 2]], { height: 190, yFmt: (v) => N(v, 0) + '%', tipFmt: (v) => N(v, 2) + '%', refs: [{ y: 0, label: '0' }] });
})();
