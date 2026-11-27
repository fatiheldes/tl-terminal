// Markets overview (tab 0): one-screen cross-asset monitor, risk regime signals, Türkiye at a glance,
// cross-asset scoreboard, central banks, week ahead, headlines and alerts. Builds only on calcs from the other tabs.
(function () {
  const isN = (v) => typeof v === 'number' && isFinite(v);
  const R2 = (v) => isN(v) ? Math.round(v * 100) / 100 : null;
  const pctOf = (v, lo, hi) => isN(v) && isN(lo) && isN(hi) && hi > lo && lo > 0 ? R2((v - lo) / (hi - lo) * 100) : null;
  const find = (a, k, v) => (a || []).find((r) => r[k] === v) || null;

  const EQ = [['^GSPC', 'S&P 500'], ['^IXIC', 'Nasdaq Composite'], ['^RUT', 'Russell 2000'], ['^STOXX50E', 'Euro Stoxx 50'], ['^GDAXI', 'DAX'], ['^FTSE', 'FTSE 100'], ['^N225', 'Nikkei 225'], ['^HSI', 'Hang Seng'], ['000001.SS', 'Shanghai Comp.'], ['^KS11', 'KOSPI'], ['^BSESN', 'Sensex'], ['^BVSP', 'Ibovespa'], ['XU100.IS', 'BIST 100']];
  const FXP = [['EUR', 'EUR/USD'], ['GBP', 'GBP/USD'], ['JPY', 'USD/JPY'], ['CNY', 'USD/CNY'], ['MXN', 'USD/MXN'], ['TRY', 'USD/TRY']];
  const CM = [['BZ=F', 'Brent crude'], ['CL=F', 'WTI crude'], ['NG=F', 'Henry Hub gas'], ['TTF=F', 'Dutch TTF gas'], ['GC=F', 'Gold'], ['SI=F', 'Silver'], ['HG=F', 'Copper'], ['ZW=F', 'Wheat']];
  const VO = [['^VIX', 'VIX (S&P 500)'], ['^VIX3M', 'VIX 3-month'], ['^VVIX', 'VVIX (vol of VIX)'], ['^MOVE', 'MOVE (Treasuries)']];
  const CR = [['LQD', 'US investment grade'], ['HYG', 'US high yield'], ['EMB', 'EM sovereign $'], ['EMLC', 'EM local currency']];
  const hist = (h, sym) => { const r = (h || []).find((x) => x.symbol === sym); return r && Array.isArray(r.data) ? r.data.map((d) => ({ date: String(d.date).slice(0, 10), close: d.close })).filter((d) => isN(d.close)).sort((a, b) => a.date < b.date ? -1 : 1) : []; };

  dash.calc('ov_mon', { inputs: ['wi_tbl', 'ust', 'wb', 'tr_sdm', 'rates', 'wcrs', 'try_mon', 'gq2', 'fxh2', 'cm_tbl', 'dv_tbl', 'gbond_etf', 'emtia', 'et_tbl'], title: 'ov_mon', fn: (wi, ust, wb, sdm, rates, wc, tm, g2, h2, cm, dv, gb, em, et) => {
    const out = [];
    const add = (o) => out.push(Object.assign({ unit: '%', d: 2 }, o));
    EQ.forEach(([s, n]) => { const r = find(wi, 'sym', s); if (!r) return; add({ grp: 'Equities', name: n, sym: s, last: r.px, d: r.px > 1000 ? 0 : 2, w1: r['1w'], m1: r['1m'], ytd: r.ytd, pos: pctOf(r.px, r.lo, r.hi), from_hi: r.lo > 0 ? r.from_hi : null, note: r.ccy === 'USD' ? 'local currency' : 'local currency (' + r.ccy + ')' }); });
    // rates: yields in %, changes in bp
    (ust || []).filter((r) => r.sym !== '2YY=F').sort((a, b) => a.yrs - b.yrs).forEach((r) => add({ grp: 'Rates', name: 'UST ' + r.tenor, sym: r.sym, last: r.yield, d: 3, unit: 'bp', w1: r.chg_1w, m1: r.chg_1m, pos: pctOf(r.yield, r.lo, r.hi), spark: r.spark }));
    [['Germany', 'Bund 10Y'], ['United Kingdom', 'Gilt 10Y'], ['Japan', 'JGB 10Y']].forEach(([c, n]) => { const r = find(wb, 'country', c); if (r && isN(r.y10)) add({ grp: 'Rates', name: n, last: r.y10, d: 3, unit: 'bp', d1: r.chg10, note: 'daily change ' + (isN(r.chg10) ? (r.chg10 > 0 ? '+' : '') + r.chg10 + ' bp' : 'n/a') + ' · investing.com' }); });
    const tl = (rates || []).filter((r) => isN(r.tlref)).sort((a, b) => a.tarih < b.tarih ? -1 : 1);
    if (tl.length) { const l = tl[tl.length - 1].tlref, b = (n) => tl.length > n ? Math.round((l - tl[tl.length - 1 - n].tlref) * 100) : null; add({ grp: 'Rates', name: 'TLREF overnight', last: l, unit: 'bp', w1: b(5), m1: b(21), pos: pctOf(l, d3.min(tl, (r) => r.tlref), d3.max(tl, (r) => r.tlref)), spark: tl.slice(-60).map((r) => r.tlref), note: '6-month range' }); }
    ['2Y yield', '5Y yield'].forEach((k) => { const r = find(sdm, 'name', k); if (!r) return; const s = r.spark || [], b = (n) => s.length > n ? Math.round((r.value - s[s.length - 1 - n]) * 100) : null; add({ grp: 'Rates', name: 'Türkiye ' + k.replace(' yield', ' (fitted)'), last: r.value, unit: 'bp', w1: b(5), m1: b(21), pos: pctOf(r.value, r.low, r.high), spark: s, note: 'fitted par yield, compounded · ~5-week range' }); });
    // FX: pair quotes, % change of the pair
    const dx = find(g2, 'symbol', 'DX-Y.NYB'), dh = hist(h2, 'DX-Y.NYB');
    if (dx && isN(dx.current_price)) { const p = dx.current_price, b = (n) => dh.length > n ? R2((p / dh[dh.length - 1 - n].close - 1) * 100) : null; add({ grp: 'FX', name: 'Dollar index (DXY)', last: p, w1: b(1), m1: b(4), pos: pctOf(p, dx.week_52_low, dx.week_52_high), spark: dh.map((x) => x.close).concat([p]) }); }
    FXP.forEach(([c, n]) => { const r = find(wc, 'code', c); if (!r) return; const pc = (v) => isN(v) ? (r.inv ? v : R2((1 / (1 + v / 100) - 1) * 100)) : null; add({ grp: 'FX', name: n, last: r.quote, d: r.quote > 100 ? 2 : 4, w1: pc(r.w1), m1: pc(r.m1), pos: isN(r.pos52) ? (r.inv ? r.pos52 : R2(100 - r.pos52)) : null, spark: r.inv ? r.spark : (r.spark || []).map((v) => 1 / v), note: 'pair change' }); });
    const eu = find(tm, 'code', 'EUR'); if (eu) add({ grp: 'FX', name: 'EUR/TRY', last: eu.per, d: 4, w1: eu.w1, m1: eu.m1 });
    CM.forEach(([s, n]) => { const r = find(cm, 'sym', s); if (r) add({ grp: 'Commodities', name: n, sym: s, last: r.px, d: r.px > 1000 ? 0 : r.px < 10 ? 3 : 2, w1: r.w1, m1: r.m1, pos: r.pos52, from_hi: r.from_hi, spark: r.spark, note: r.unit + ' · front future' }); });
    VO.forEach(([s, n]) => { const r = find(dv, 'sym', s); if (r) add({ grp: 'Volatility', name: n, sym: s, last: r.v, unit: 'pt', w1: r.w1, m1: r.m1, pos: r.pct52, from_hi: r.hi ? R2((r.v / r.hi - 1) * 100) : null, spark: r.spark }); });
    CR.forEach(([s, n]) => { const r = find(gb, 'sym', s); if (r) add({ grp: 'Credit (ETF price)', name: n + ' · ' + s, sym: s, last: r.px, w1: r.r1w, m1: r.r1m, pos: pctOf(r.px, r.lo, r.hi), from_hi: r.hi ? R2((r.px / r.hi - 1) * 100) : null, spark: r.spark, note: isN(r.dy) ? 'distribution yield ' + r.dy + '%' : '' }); });
    const bt = (em || []).find((x) => x.ad === 'Bitcoin' && /USD/.test(x.birim || '')) || (em || []).find((x) => x.ad === 'Bitcoin'), ib = find(et, 'sym', 'IBIT');
    if (bt) add({ grp: 'Crypto', name: 'Bitcoin · USD', last: bt.son, d: 0, w1: ib ? ib.u_1w : null, m1: ib ? ib.u_1m : null, pos: ib ? pctOf(ib.px, ib.lo, ib.hi) : null, from_hi: ib ? ib.from_hi : null, note: 'spot from Coinbase; changes and range from the IBIT spot bitcoin ETF' });
    return out;
  } });

  // Cross-asset scoreboard in USD terms
  dash.calc('ov_score', { inputs: ['et_tbl', 'gbond_etf', 'cm_tbl', 'wcrs', 'ov_mon'], title: 'ov_score', fn: (et, gb, cm, wc, mon) => {
    const o = [];
    const e = (s, n) => { const r = find(et, 'sym', s); if (r) o.push({ cls: 'Equities', name: n, w1: r.u_1w, m1: r.u_1m, m3: r.u_3m }); };
    [['SPY', 'US equities'], ['EZU', 'Euro area equities'], ['EWJ', 'Japan equities'], ['EEM', 'EM equities'], ['FXI', 'China equities'], ['TUR', 'Türkiye equities ($)']].forEach((x) => e(...x));
    [['IEF', 'UST 7–10Y'], ['TLT', 'UST 20Y+'], ['LQD', 'US IG credit'], ['HYG', 'US HY credit'], ['EMB', 'EM sovereign $'], ['EMLC', 'EM local bonds']].forEach(([s, n]) => { const r = find(gb, 'sym', s); if (r) o.push({ cls: 'Bonds', name: n, w1: r.r1w, m1: r.r1m, m3: r.r3m }); });
    [['GC=F', 'Gold'], ['BZ=F', 'Brent'], ['HG=F', 'Copper'], ['ZW=F', 'Wheat']].forEach(([s, n]) => { const r = find(cm, 'sym', s); if (r) o.push({ cls: 'Commodities', name: n, w1: r.w1, m1: r.m1, m3: r.m3 }); });
    const ib = find(et, 'sym', 'IBIT'); if (ib) o.push({ cls: 'Crypto', name: 'Bitcoin (IBIT)', w1: ib.u_1w, m1: ib.u_1m, m3: ib.u_3m });
    const dx = find(mon, 'name', 'Dollar index (DXY)'); if (dx) o.push({ cls: 'FX', name: 'US dollar (DXY)', w1: dx.w1, m1: dx.m1, m3: null });
    [['EUR', 'Euro'], ['JPY', 'Yen'], ['TRY', 'Turkish lira']].forEach(([c, n]) => { const r = find(wc, 'code', c); if (r) o.push({ cls: 'FX', name: n + ' vs USD', w1: r.w1, m1: r.m1, m3: r.m3 }); });
    return o;
  } });

  // Risk regime: rule-based signals, +1 risk-on, 0 neutral, −1 risk-off
  dash.calc('ov_regime', { inputs: ['dv_tbl', 'ust_spreads', 'gbond_etf', 'ov_mon', 'wi_tbl', 'wcrs', 'cm_tbl', 'pm_credit'], title: 'ov_regime', fn: (dv, us, gb, mon, wi, wc, cm, pc) => {
    const S = [], v = (s) => (find(dv, 'sym', s) || {}).v;
    const push = (area, value, score, rule) => S.push({ area, value, score, rule });
    const vix = v('^VIX'), v3 = v('^VIX3M'), mv = v('^MOVE');
    if (isN(vix)) push('Equity volatility', 'VIX ' + vix.toFixed(1), vix < 16 ? 1 : vix > 25 ? -1 : 0, 'below 16 calm · above 25 stressed');
    if (isN(vix) && isN(v3)) { const r = vix / v3; push('VIX term structure', (r > 1 ? 'inverted ' : 'upward ') + r.toFixed(2), r > 1.02 ? -1 : r < 0.92 ? 1 : 0, 'VIX / VIX3M above 1 = near-term fear'); }
    if (isN(mv)) push('Rates volatility', 'MOVE ' + mv.toFixed(0), mv < 85 ? 1 : mv > 115 ? -1 : 0, 'below 85 calm · above 115 stressed');
    const hy = find(gb, 'sym', 'HYG'); if (hy && isN(hy.r1m)) push('High-yield credit', 'HYG 1M ' + (hy.r1m > 0 ? '+' : '') + hy.r1m.toFixed(1) + '%', hy.r1m > 0.5 ? 1 : hy.r1m < -1 ? -1 : 0, 'price return; below −1% = spreads widening');
    if (pc && pc[0] && isN(pc[0].pb_med)) push('Private credit', 'BDC P/NAV ' + pc[0].pb_med.toFixed(2) + '×', pc[0].pb_med >= 1 ? 1 : pc[0].pb_med < 0.9 ? -1 : 0, 'BDCs below 0.9× book = credit doubts');
    const c = find(us, 'name', 'UST 3M10Y'); if (c && isN(c.bp)) push('US yield curve', '3M10Y ' + (c.bp > 0 ? '+' : '') + c.bp + ' bp', c.bp < 0 ? -1 : c.bp > 50 ? 1 : 0, 'inverted = recession signal');
    const eqs = (wi || []).filter((r) => isN(r['1m'])); if (eqs.length) { const up = eqs.filter((r) => r['1m'] > 0).length / eqs.length; push('Equity breadth', Math.round(up * 100) + '% of indices up 1M', up > 0.6 ? 1 : up < 0.4 ? -1 : 0, 'share of 24 world indices with a positive month'); }
    const dx = find(mon, 'name', 'Dollar index (DXY)'); if (dx && isN(dx.m1)) push('US dollar', 'DXY 1M ' + (dx.m1 > 0 ? '+' : '') + dx.m1.toFixed(1) + '%', dx.m1 > 2 ? -1 : dx.m1 < -1 ? 1 : 0, 'a rising dollar tightens global and EM conditions');
    const emc = (wc || []).filter((r) => r.region !== 'G10' && isN(r.m1)); if (emc.length) { const m = d3.median(emc, (r) => r.m1); push('EM currencies', 'median 1M ' + (m > 0 ? '+' : '') + m.toFixed(1) + '%', m > 0.5 ? 1 : m < -1 ? -1 : 0, 'vs USD, 13 EM currencies'); }
    const cu = find(cm, 'sym', 'HG=F'), au = find(cm, 'sym', 'GC=F'); if (cu && au && isN(cu.m1) && isN(au.m1)) { const d = cu.m1 - au.m1; push('Copper vs gold', (d > 0 ? '+' : '') + d.toFixed(1) + ' pp 1M', d > 2 ? 1 : d < -2 ? -1 : 0, 'growth metal beating haven = risk-on'); }
    return S;
  } });

  // Türkiye at a glance
  dash.calc('ov_tr', { inputs: ['mm_policy', 'ozet', 'tr_sdm', 'makro_ozet', 'try_mon', 'wb', 'wi_tbl', 'pm_hs', 'cr_l', 'cr_r', 'fu_bench'], title: 'ov_tr', fn: (pol, oz, sdm, mk, tm, wb, wi, hs, cl, cr, fb) => {
    const p = (pol || [])[0] || {}, o = (oz || [])[0] || {}, m = (mk || [])[0] || {}, last = (a, k) => { const x = (a || []).filter((r) => isN(r[k])); return x[x.length - 1] || null; };
    const y2 = find(sdm, 'name', '2Y yield'), y7 = find(sdm, 'name', '7Y yield'), u = find(tm, 'code', 'USD'), tr = find(wb, 'country', 'Turkey') || find(wb, 'country', 'Türkiye'), xu = find(wi, 'sym', 'XU100.IS');
    const h = last(hs, 'yoy'), l = last(cl, 'total_13'), c = last(cr, 'comm'), b = (fb || [])[0] || {};
    const sgn = (v, d, s) => isN(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + (s || '') : '—';
    return [
      { k: 'CBRT POLICY RATE', v: isN(p.policy) ? p.policy.toFixed(2) + '%' : '—', c: isN(p.last_bp) ? 'last move ' + sgn(p.last_bp, 0, ' bp') + ' · ' + (p.last_date || '') : '', t: p.last_bp, link: 'mm/MMKT' },
      { k: 'TLREF O/N', v: isN(o.tlref) ? o.tlref.toFixed(2) + '%' : '—', c: isN(o.tlref_aofm_bp) ? sgn(o.tlref_aofm_bp, 0, ' bp') + ' vs avg funding' : '', t: null, link: 'mm' },
      { k: '2Y / 7Y BOND', v: y2 ? y2.value.toFixed(2) + '%' : '—', c: y7 ? '7Y ' + y7.value.toFixed(2) + '% · 2Y 1D ' + sgn(y2 && y2.chg_1d, 0, ' bp') : '', t: y2 && -y2.chg_1d, link: 'fixed/GOVT' },
      { k: 'CPI Y/Y', v: isN(m.tufe) ? m.tufe.toFixed(2) + '%' : '—', c: isN(m.tufe_ay) ? 'm/m ' + m.tufe_ay.toFixed(2) + '% · 12M exp. ' + (isN(m.tufe_12a) ? m.tufe_12a.toFixed(1) + '%' : '—') : '', t: null, link: 'eco/INFL' },
      { k: 'REAL RATE (EX-ANTE)', v: isN(m.reel_ante) ? m.reel_ante.toFixed(2) + '%' : '—', c: 'TLREF − 12M CPI expectation', t: m.reel_ante, link: 'mm' },
      { k: 'USD/TRY', v: u ? u.per.toFixed(4) : '—', c: u ? '1M ' + sgn(u.m1, 1, '%') + ' · 12M exp. ' + (isN(m.usd_12a) ? m.usd_12a.toFixed(1) : '—') : '', t: u && -u.m1, link: 'fx/TRY' },
      { k: '5Y CDS', v: tr && isN(tr.cds) ? tr.cds.toFixed(0) + ' bp' : '—', c: tr ? 'S&P ' + (tr.sp || '—') + ' · Moody\'s ' + (tr.moodys || '—') + ' · Fitch ' + (tr.fitch || '—') : '', t: null, link: 'fixed/WCDS' },
      { k: 'FX RESERVES', v: isN(m.rez) ? '$' + m.rez.toFixed(1) + 'bn' : '—', c: isN(m.rez_chg) ? sgn(m.rez_chg, 1, 'bn') + ' in the latest week · gross' : '', t: m.rez_chg, link: 'fx' },
      { k: 'BIST 100', v: xu ? Math.round(xu.px).toLocaleString('en-US') : '—', c: xu ? 'YTD ' + sgn(xu.ytd, 1, '%') + ' TRY · USD/TRY YTD ' + sgn(b.usd_ytd, 1, '%') : '', t: xu && xu.ytd, link: 'equity' },
      { k: 'COMMERCIAL LOAN RATE', v: c ? c.comm.toFixed(2) + '%' : '—', c: c ? 'deposit ' + (isN(c.dep) ? c.dep.toFixed(2) + '%' : '—') + ' · spread ' + (isN(c.sp_comm) ? c.sp_comm.toFixed(1) + ' pp' : '—') : '', t: null, link: 'credit/TRCR' },
      { k: 'LOAN GROWTH', v: l ? sgn(l.total_13, 1, '%') : '—', c: l ? '13W annualised · 52W ' + sgn(l.total_52, 1, '%') : '', t: null, link: 'credit/LOAN' },
      { k: 'HOME SALES', v: h ? sgn(h.yoy, 1, '%') : '—', c: h ? 'y/y · ' + TT.mShort(TT.parseD(h.date)) + ' · house prices ' + sgn(h.kfe_yoy, 1, '%') : '', t: h && h.yoy, link: 'private/TRPM' }];
  } });

  // Week ahead: Türkiye + global calendar, deduplicated, upcoming first
  dash.calc('ov_cal', { inputs: ['cal_this', 'cal_next', 'cal_global'], title: 'ov_cal', fn: (a, b, g) => {
    const seen = new Set(), a0 = /(\d\d)\.(\d\d)\.(\d{4})/.exec(String(window.TT_ASOF || '')), now = a0 ? a0[3] + '-' + a0[2] + '-' + a0[1] : '';
    return [].concat(a || [], b || [], g || []).filter((r) => r && r.event).filter((r) => { const k = r.time + r.country + r.event; if (seen.has(k)) return false; seen.add(k); return true; })
      .filter((r) => String(r.date || r.time).slice(0, 10) >= now).sort((x, y) => String(x.time) < String(y.time) ? -1 : 1);
  } });
})();

(function () {
  const L = d3.formatLocale({ decimal: '.', thousands: ',', grouping: [3], currency: ['', ''] });
  const N = (v, d) => v == null || isNaN(v) ? '—' : L.format(',.' + (d == null ? 2 : d) + 'f')(v);
  const isN = (v) => typeof v === 'number' && isFinite(v);
  const sgn = (v) => v > 0 ? '+' : v < 0 ? '−' : '';
  const rows = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : []; };
  const tone = (el, v) => { el.classList.toggle('up', isN(v) && v > 0.004); el.classList.toggle('dn', isN(v) && v < -0.004); };
  const cell = (tr, text, cls) => { const td = tr.insertCell(); td.textContent = text; if (cls) td.className = cls; return td; };
  const find = (id, k, v) => rows(id).find((r) => r[k] === v);
  const chg = (v, u) => !isN(v) ? '—' : u === 'bp' ? sgn(v) + N(Math.abs(v), 0) : u === 'pt' ? sgn(v) + N(Math.abs(v), 2) : sgn(v) + N(Math.abs(v), 2) + '%';
  const heat = (v, s) => !isN(v) ? '' : v > 0 ? `rgba(46,230,107,${Math.min(0.6, Math.abs(v) / s)})` : `rgba(255,69,69,${Math.min(0.6, Math.abs(v) / s)})`;
  const spark = (td, s, up) => { if (!s || s.length < 3) return; const w = 76, h = 16; const x = d3.scaleLinear().domain([0, s.length - 1]).range([1, w - 1]); const y = d3.scaleLinear().domain(d3.extent(s)).range([h - 2, 2]); const svg = d3.select(td).append('svg').attr('width', w).attr('height', h).attr('aria-hidden', 'true'); svg.append('path').attr('d', d3.line().x((_, i) => x(i)).y((v) => y(v))(s)).style('fill', 'none').style('stroke', up ? '#2ee66b' : '#ff4545').style('stroke-width', 1.2); };
  const range = (td, p) => { if (!isN(p)) { td.textContent = '—'; td.classList.add('mu'); return; } const w = 70; const svg = d3.select(td).append('svg').attr('width', w).attr('height', 12).attr('aria-hidden', 'true'); svg.append('line').attr('x1', 3).attr('x2', w - 3).attr('y1', 6).attr('y2', 6).style('stroke', '#3a3a3a').style('stroke-width', 2); svg.append('circle').attr('cx', 3 + (w - 6) * Math.max(0, Math.min(100, p)) / 100).attr('cy', 6).attr('r', 3.5).style('fill', p > 85 ? '#2ee66b' : p < 15 ? '#ff4545' : '#3cc8f0'); };
  const kv = (name, fn) => dash.draw(name, (el) => { const r = fn(); el.textContent = r && r.text != null ? r.text : '—'; if (r && 'tone' in r) tone(el, r.tone); });

  // KPI strip
  const M = (n) => rows('ov_mon').find((r) => r.name === n);
  const K = [['ov-k-spx', 'S&P 500', 0, (r) => '1W ' + chg(r.w1) + ' · YTD ' + chg(r.ytd), (r) => r.w1], ['ov-k-xu', 'BIST 100', 0, (r) => '1W ' + chg(r.w1) + ' · YTD ' + chg(r.ytd) + ' TRY', (r) => r.w1], ['ov-k-ust', 'UST 10Y', 3, (r) => '1W ' + chg(r.w1, 'bp') + ' bp · 1M ' + chg(r.m1, 'bp') + ' bp', (r) => -r.w1, '%'],
    ['ov-k-tr2', 'Türkiye 2Y (fitted)', 2, (r) => '1W ' + chg(r.w1, 'bp') + ' bp · 1M ' + chg(r.m1, 'bp') + ' bp', (r) => -r.w1, '%'], ['ov-k-try', 'USD/TRY', 4, (r) => '1W ' + chg(r.w1) + ' · 1M ' + chg(r.m1), (r) => -r.m1],
    ['ov-k-brent', 'Brent crude', 2, (r) => '1W ' + chg(r.w1) + ' · 1M ' + chg(r.m1), (r) => r.w1], ['ov-k-gold', 'Gold', 0, (r) => '1W ' + chg(r.w1) + ' · 1M ' + chg(r.m1), (r) => r.w1], ['ov-k-vix', 'VIX (S&P 500)', 2, (r) => '1W ' + chg(r.w1, 'pt') + ' pt · 52W pct ' + N(r.pos, 0), (r) => -r.w1]];
  K.forEach(([id, n, d, cap, t, suf]) => { kv(id, () => { const r = M(n); return r && { text: N(r.last, d) + (suf || '') }; }); kv(id + '-c', () => { const r = M(n); return r && { text: cap(r), tone: t(r) }; }); });

  // Cross-asset monitor
  dash.draw('ov-mon', (tb) => {
    tb.replaceChildren(); let g = null;
    rows('ov_mon').forEach((r) => {
      if (r.grp !== g) { g = r.grp; const tr = tb.insertRow(); const td = cell(tr, g.toUpperCase() + (r.unit === 'bp' ? ' · yield %, changes in bp' : r.unit === 'pt' ? ' · index points' : ''), 'am'); td.colSpan = 7; td.style.fontSize = '10px'; td.style.paddingTop = '6px'; }
      const tr = tb.insertRow(); if (r.note) tr.title = r.note;
      cell(tr, r.name, 'hi'); cell(tr, N(r.last, r.d), 'r yl');
      [['w1', r.unit === 'bp' ? 25 : r.unit === 'pt' ? 6 : 6], ['m1', r.unit === 'bp' ? 60 : r.unit === 'pt' ? 12 : 12]].forEach(([k, s]) => { const td = cell(tr, chg(r[k], r.unit), 'r'); td.style.background = heat(r.unit === 'bp' || r.unit === 'pt' ? -r[k] : r[k], s); });
      range(tr.insertCell(), r.pos); const fh = cell(tr, isN(r.from_hi) ? chg(r.from_hi) : '—', 'r'); tone(fh, r.from_hi); if (!isN(r.from_hi)) fh.classList.add('mu');
      const sp = tr.insertCell(); spark(sp, r.spark, r.spark && r.spark.length > 1 && r.spark[r.spark.length - 1] >= r.spark[0]);
    });
  });

  // Scoreboard
  const scP = (() => { let v = 'm1'; document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-ovp]'); if (!b) return; v = b.getAttribute('data-ovp'); document.querySelectorAll('[data-ovp]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); TT.anim = true; dash.draw('ov-score'); TT.anim = false; }); return () => v; })();
  const CC = { Equities: '#3cc8f0', Bonds: '#2ee66b', Commodities: '#ffa028', Crypto: '#c86bff', FX: '#ffd23c' };
  dash.draw('ov-score', (el) => { const k = scP(); const d = rows('ov_score').filter((r) => isN(r[k])).sort((a, b) => b[k] - a[k]); TT.hbars(el, d.map((r) => ({ label: r.name, v: r[k], color: CC[r.cls] })), { lw: 170, rh: 15 }); });

  // Regime
  dash.draw('ov-regime', (el) => {
    el.replaceChildren(); const S = rows('ov_regime'); if (!S.length) return;
    const tot = d3.sum(S, (s) => s.score), n = S.length, on = S.filter((s) => s.score > 0).length, off = S.filter((s) => s.score < 0).length;
    const head = document.createElement('div'); head.className = 'ov-gauge';
    const lbl = tot >= 3 ? 'RISK-ON' : tot <= -3 ? 'RISK-OFF' : tot > 0 ? 'LEANING RISK-ON' : tot < 0 ? 'LEANING RISK-OFF' : 'MIXED';
    const col = tot >= 3 ? 'var(--up)' : tot <= -3 ? 'var(--dn)' : 'var(--am)';
    head.innerHTML = `<div class="ov-gl" style="color:${col}">${lbl}</div><div class="ov-gb"><span style="left:${(tot + n) / (2 * n) * 100}%"></span></div><div class="ov-gs">${on} risk-on · ${n - on - off} neutral · ${off} risk-off · score ${tot > 0 ? '+' : ''}${tot} of ±${n}</div>`;
    el.appendChild(head);
    const t = document.createElement('table'); t.className = 'tb'; const tb = t.createTBody(); el.appendChild(t);
    S.forEach((s) => { const tr = tb.insertRow(); tr.title = s.rule; const d = cell(tr, s.score > 0 ? '●' : s.score < 0 ? '●' : '●'); d.style.color = s.score > 0 ? 'var(--up)' : s.score < 0 ? 'var(--dn)' : 'var(--am)'; d.style.width = '14px'; cell(tr, s.area, 'hi'); cell(tr, s.value, 'r yl'); const ru = cell(tr, s.rule, 'mu'); ru.style.fontSize = '10px'; ru.style.whiteSpace = 'normal'; ru.style.lineHeight = '1.25'; });
  });

  // Türkiye at a glance
  dash.draw('ov-tr', (el) => {
    el.replaceChildren();
    rows('ov_tr').forEach((r) => { const a = document.createElement('a'); a.href = '#' + r.link; a.className = 'ov-tile'; const l = document.createElement('div'); l.className = 'l'; l.textContent = r.k; const v = document.createElement('div'); v.className = 'v'; v.textContent = r.v; tone(v, r.t); const c = document.createElement('div'); c.className = 'c'; c.textContent = r.c; c.title = r.c; a.append(l, v, c); el.appendChild(a); });
  });

  // Central banks
  dash.draw('ov-cb', (tb) => {
    tb.replaceChildren(); const pol = rows('wb');
    rows('cb_moves').slice().sort((a, b) => String(b.last_date) < String(a.last_date) ? -1 : 1).forEach((r) => {
      const tr = tb.insertRow(); cell(tr, r.country, 'hi'); cell(tr, N(r.rate, 2) + '%', 'r yl');
      const mv = cell(tr, isN(r.last_bp) && r.last_bp ? sgn(r.last_bp) + N(Math.abs(r.last_bp), 0) + ' bp' : 'hold', 'r'); tone(mv, isN(r.last_bp) ? -r.last_bp : null);
      cell(tr, r.last_date ? TT.mShort(TT.parseD(r.last_date)) + ' ' + String(r.last_date).slice(2, 4) : '—', 'r mu');
      cell(tr, (r.hikes || 0) + ' / ' + (r.cuts || 0), 'r mu');
      const st = cell(tr, r.stance || '—', ''); st.className = r.stance === 'Easing' ? 'up' : r.stance === 'Tightening' ? 'dn' : 'mu';
    });
  });

  // Week ahead
  dash.draw('ov-cal', (tb) => {
    tb.replaceChildren(); const c = rows('ov_cal').slice(0, 14);
    if (!c.length) { const tr = tb.insertRow(); const td = cell(tr, 'No upcoming events in the calendar feed.', 'mu'); td.colSpan = 5; return; }
    c.forEach((r) => { const tr = tb.insertRow(); const dt = TT.parseD(String(r.date || r.time).slice(0, 10)); cell(tr, dt ? d3.timeFormat('%a %d %b')(dt) : '—', 'mu'); cell(tr, String(r.time || '').slice(11, 16), 'mu'); cell(tr, r.country || '', 'yl'); const ev = cell(tr, String(r.event).replace(/\s*\(-\)\s*$/, ''), r.importance === 'high' ? 'hi' : ''); ev.title = r.event; cell(tr, r.previous || '—', 'r mu'); });
  });

  // Headlines
  dash.draw('ov-news', (tb) => {
    tb.replaceChildren();
    rows('news').slice(0, 8).forEach((r) => { const tr = tb.insertRow(); cell(tr, r.date ? d3.timeFormat('%d %b')(TT.parseD(r.date)) : '', 'mu'); const td = tr.insertCell(); const a = document.createElement('a'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = r.title; td.appendChild(a); cell(tr, r.source || '', 'mu'); cell(tr, r.tag || '', 'am').style.fontSize = '10px'; });
  });
})();
