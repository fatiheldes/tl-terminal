// Commodities: monitor and performance heatmap, energy curves and spreads, metals ratios and gold in TRY, agriculture.
(function () {
  const P = window.TTparse;
  ['cmq1', 'cmq2', 'cmh1', 'cmh2', 'cmc_cl', 'cmc_bz', 'cmc_ng'].forEach((id) => dash.loader(id, { description: '', fn: P.tsv }));
  const R2 = (v) => v == null || isNaN(v) ? null : Math.round(v * 100) / 100;
  const isN = (v) => typeof v === 'number' && !isNaN(v);
  const hist = (h, sym) => { const r = (h || []).find((x) => x.symbol === sym); return r && Array.isArray(r.data) ? r.data.map((d) => ({ date: String(d.date).slice(0, 10), close: d.close })).filter((d) => isN(d.close)).sort((a, b) => a.date < b.date ? -1 : 1) : []; };
  const std = (a) => { if (a.length < 2) return null; const m = d3.mean(a); return Math.sqrt(d3.sum(a.map((x) => (x - m) ** 2)) / (a.length - 1)); };

  // symbol, name, group, unit label, divisor (cents -> dollars)
  const CM = [
    ['BZ=F', 'Brent crude', 'Energy', '$/bbl', 1], ['CL=F', 'WTI crude', 'Energy', '$/bbl', 1], ['NG=F', 'Natural gas (Henry Hub)', 'Energy', '$/MMBtu', 1], ['TTF=F', 'Natural gas (Dutch TTF)', 'Energy', '€/MWh', 1],
    ['RB=F', 'Gasoline (RBOB)', 'Energy', '$/gal', 1], ['HO=F', 'Heating oil / diesel', 'Energy', '$/gal', 1],
    ['GC=F', 'Gold', 'Precious metals', '$/oz', 1], ['SI=F', 'Silver', 'Precious metals', '$/oz', 1], ['PL=F', 'Platinum', 'Precious metals', '$/oz', 1], ['PA=F', 'Palladium', 'Precious metals', '$/oz', 1],
    ['HG=F', 'Copper', 'Industrial metals', '$/lb', 1], ['ALI=F', 'Aluminium', 'Industrial metals', '$/t', 1],
    ['ZW=F', 'Wheat', 'Agriculture', '¢/bu', 1], ['ZC=F', 'Corn', 'Agriculture', '¢/bu', 1], ['ZS=F', 'Soybeans', 'Agriculture', '¢/bu', 1], ['KC=F', 'Coffee (arabica)', 'Agriculture', '¢/lb', 1],
    ['SB=F', 'Sugar No.11', 'Agriculture', '¢/lb', 1], ['CC=F', 'Cocoa', 'Agriculture', '$/t', 1], ['CT=F', 'Cotton', 'Agriculture', '¢/lb', 1], ['LE=F', 'Live cattle', 'Agriculture', '¢/lb', 1]];
  window.CMLIST = CM;

  dash.calc('cm_tbl', { inputs: ['cmq1', 'cmq2', 'cmh1', 'cmh2'], title: 'cm_tbl', fn: (a, b, h1, h2) => {
    const q = (a || []).concat(b || []), h = (h1 || []).concat(h2 || []);
    return CM.map(([sym, name, group, unit]) => {
      const r = q.find((x) => x.symbol === sym); if (!r || !isN(r.current_price)) return null;
      const s = hist(h, sym); const px = r.current_price; const back = (n) => s.length > n ? s[s.length - 1 - n].close : null;
      const chg = (v) => v ? R2((px / v - 1) * 100) : null;
      const rets = []; for (let i = 1; i < s.length; i++) rets.push(Math.log(s[i].close / s[i - 1].close));
      const lo = r.week_52_low, hi = r.week_52_high;
      return { sym, name, group, unit, px, w1: chg(back(1)), m1: chg(back(4)), m3: chg(back(13)), m6: s.length ? chg(s[0].close) : null, vol: rets.length > 4 ? R2(std(rets) * Math.sqrt(52) * 100) : null, lo, hi, pos52: isN(lo) && isN(hi) && hi > lo ? R2((px - lo) / (hi - lo) * 100) : null, from_hi: isN(hi) ? R2((px / hi - 1) * 100) : null, spark: s.map((x) => x.close) };
    }).filter(Boolean);
  } });

  // Futures curves
  const MON = { F: 0, G: 1, H: 2, J: 3, K: 4, M: 5, N: 6, Q: 7, U: 8, V: 9, X: 10, Z: 11 };
  const parse = (sym) => { const m = /^(CL|BZ|NG)([FGHJKMNQUVXZ])(\d{2})\./.exec(sym || ''); return m ? new Date(Date.UTC(2000 + Number(m[3]), MON[m[2]], 1)) : null; };
  const asof = (() => { const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(String(window.TT_ASOF || '')); return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : new Date(); })();
  // Brent last-day financial: contract month M expires on the last business day of M-2, so drop it once that month is reached.
  const live = (r, brent) => !brent || (r.date.getUTCFullYear() * 12 + r.date.getUTCMonth() - 2) > (asof.getUTCFullYear() * 12 + asof.getUTCMonth());
  const curve = (rows, brent) => (rows || []).map((r) => ({ sym: r.symbol, date: parse(r.symbol), px: r.current_price })).filter((r) => r.date && isN(r.px) && live(r, brent)).sort((a, b) => a.date - b.date);
  dash.calc('cm_curves', { inputs: ['cmc_cl', 'cmc_bz', 'cmc_ng'], title: 'cm_curves', fn: (cl, bz, ng) => {
    const out = [];
    [['WTI', cl], ['Brent', bz], ['Henry Hub gas', ng]].forEach(([name, rows]) => curve(rows, name === 'Brent').forEach((r, i, a) => out.push({ curve: name, sym: r.sym, date: r.date.toISOString().slice(0, 10), px: r.px, months: Math.round((r.date - a[0].date) / (30.44 * 864e5)), vs_front: R2((r.px / a[0].px - 1) * 100) })));
    return out;
  } });
  dash.calc('cm_curve_stats', { inputs: ['cm_curves'], title: 'cm_curve_stats', fn: (c) => ['WTI', 'Brent', 'Henry Hub gas'].map((name) => {
    const s = (c || []).filter((r) => r.curve === name); if (s.length < 2) return null;
    const f = s[0], m2 = s[1], y1 = s.reduce((a, b) => Math.abs(b.months - 12) < Math.abs(a.months - 12) ? b : a), L = s[s.length - 1];
    const roll = R2((f.px / y1.px - 1) * 100 * 12 / Math.max(1, y1.months));
    return { curve: name, front: f.px, front_sym: f.sym, m1m2: R2(f.px - m2.px), m1_12: R2(f.px - y1.px), y1_months: y1.months, roll_ann: roll, shape: f.px > y1.px ? 'Backwardation' : 'Contango', last: L.px, last_sym: L.sym };
  }).filter(Boolean) });

  // Spreads over time (weekly)
  dash.calc('cm_spreads', { inputs: ['cmh1', 'cmh2', 'fxh1'], title: 'cm_spreads', fn: (h1, h2, fx) => {
    const h = (h1 || []).concat(h2 || []);
    const s = (sym) => hist(h, sym); const by = (arr) => { const o = {}; arr.forEach((x) => { o[x.date] = x.close; }); return o; };
    const cl = s('CL=F'), bz = by(s('BZ=F')), rb = by(s('RB=F')), ho = by(s('HO=F')), gc = by(s('GC=F')), si = by(s('SI=F')), hg = by(s('HG=F')), pl = by(s('PL=F')), pa = by(s('PA=F')), ng = by(s('NG=F')), ttf = by(s('TTF=F'));
    const eu = by(hist(fx, 'EURUSD=X'));
    return cl.map((x) => {
      const d = x.date, e = eu[d] || null;
      return { date: d, brent_wti: bz[d] != null ? R2(bz[d] - x.close) : null, crack321: rb[d] != null && ho[d] != null ? R2((2 * rb[d] * 42 + ho[d] * 42 - 3 * x.close) / 3) : null, gold_silver: gc[d] && si[d] ? R2(gc[d] / si[d]) : null, copper_gold: hg[d] && gc[d] ? R2(hg[d] / gc[d] * 1000) : null, pt_pd: pl[d] != null && pa[d] != null ? R2(pl[d] - pa[d]) : null, ttf_usd: ttf[d] != null && e ? R2(ttf[d] * e / 3.412) : null, hh: ng[d] != null ? ng[d] : null };
    });
  } });

  // Gold in TRY
  dash.calc('cm_gold_try', { inputs: ['fx', 'gold_hist', 'cm_tbl'], title: 'cm_gold_try', fn: (fx, gh, t) => {
    const gram = ((fx || []).find((r) => r.symbol === 'gram-altin') || {}).last, usd = ((fx || []).find((r) => r.symbol === 'USD') || {}).last;
    const gc = ((t || []).find((r) => r.sym === 'GC=F') || {}).px;
    const s = (gh || []).filter((r) => isN(r.close)).sort((a, b) => a.date < b.date ? -1 : 1);
    const last = s.length ? TT.parseD(s[s.length - 1].date) : null;
    const back = (days) => { if (!last) return null; const t = last - days * 864e5; let v = null; s.forEach((r) => { if (TT.parseD(r.date) <= t) v = r.close; }); return v; };
    const implied = isN(gc) && isN(usd) ? gc / 31.1035 * usd : null;
    return [{ gram, usd, gc, implied: R2(implied), premium: isN(gram) && implied ? R2((gram / implied - 1) * 100) : null, d1: back(1) && isN(gram) ? R2((gram / back(1) - 1) * 100) : null, w1: back(7) && isN(gram) ? R2((gram / back(7) - 1) * 100) : null, m1: back(30) && isN(gram) ? R2((gram / back(30) - 1) * 100) : null, m3: s.length && isN(gram) ? R2((gram / s[0].close - 1) * 100) : null, quarter: isN(gram) ? R2(gram * 1.6065) : null, ounce_try: isN(gc) && isN(usd) ? R2(gc * usd) : null }];
  } });
})();

(function () {
  const L = d3.formatLocale({ decimal: '.', thousands: ',', grouping: [3], currency: ['', ''] });
  const N = (v, d) => v == null || isNaN(v) ? '—' : L.format(',.' + (d == null ? 2 : d) + 'f')(v);
  const sgn = (v) => v > 0 ? '+' : v < 0 ? '−' : '';
  const PC = (v, d) => v == null || isNaN(v) ? '—' : (Math.abs(v) < 0.005 ? '0.00' : sgn(v) + N(Math.abs(v), d == null ? 2 : d)) + '%';
  const rows = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : []; };
  const tone = (el, v, inv) => { const x = inv ? -v : v; el.classList.toggle('up', typeof v === 'number' && x > 0.004); el.classList.toggle('dn', typeof v === 'number' && x < -0.004); };
  const cell = (tr, text, cls) => { const td = tr.insertCell(); td.textContent = text; if (cls) td.className = cls; return td; };
  const heat = (v, s) => v == null ? '' : v > 0 ? `rgba(46,230,107,${Math.min(0.75, Math.abs(v) / (s || 10))})` : `rgba(255,69,69,${Math.min(0.75, Math.abs(v) / (s || 10))})`;
  const spark = (td, s, color) => { s = (s || []).filter((v) => v != null); if (s.length < 2) return; const w = 64, h = 16; const x = d3.scaleLinear().domain([0, s.length - 1]).range([1, w - 1]); const e = d3.extent(s); const y = d3.scaleLinear().domain(e[0] === e[1] ? [e[0] - 1, e[0] + 1] : e).range([h - 2, 2]); d3.select(td).append('svg').attr('width', w).attr('height', h).attr('aria-hidden', 'true').append('path').attr('d', d3.line().x((v, i) => x(i)).y((v) => y(v))(s)).style('fill', 'none').style('stroke', color || '#ffa028').style('stroke-width', 1.3); };
  const rangeBar = (td, lo, hi, v) => { if (lo == null || hi == null || hi <= lo) { td.textContent = '—'; return; } const w = 70; const x = d3.scaleLinear().domain([lo, hi]).range([3, w - 3]).clamp(true); const s = d3.select(td).append('svg').attr('width', w).attr('height', 12).attr('aria-hidden', 'true'); s.append('line').attr('x1', 3).attr('x2', w - 3).attr('y1', 6).attr('y2', 6).style('stroke', '#3a3a3a').style('stroke-width', 2); s.append('circle').attr('cx', x(v)).attr('cy', 6).attr('r', 3.5).style('fill', '#3cc8f0'); };
  const kv = (name, fn) => dash.draw(name, (el) => { const r = fn(); el.textContent = r && r.text != null ? r.text : '—'; if (r && 'tone' in r) tone(el, r.tone, r.inv); });
  const C = (s) => rows('cm_tbl').find((r) => r.sym === s);
  const dp = (v) => v >= 1000 ? 1 : v >= 100 ? 2 : v >= 10 ? 2 : 3;

  [['bz', 'BZ=F'], ['cl', 'CL=F'], ['ng', 'NG=F'], ['gc', 'GC=F'], ['si', 'SI=F'], ['hg', 'HG=F']].forEach(([k, s]) => {
    kv('cm-k-' + k, () => { const r = C(s); return r && { text: N(r.px, dp(r.px)) }; });
    kv('cm-k-' + k + '-c', () => { const r = C(s); return r && { text: PC(r.w1) + ' 1W · ' + PC(r.m1) + ' 1M', tone: r.m1 }; });
  });
  kv('cm-k-gt', () => { const g = rows('cm_gold_try')[0]; return g && { text: N(g.gram, 2) }; });
  kv('cm-k-gt-c', () => { const g = rows('cm_gold_try')[0]; return g && { text: 'TRY/g · ' + PC(g.m1) + ' 1M', tone: g.m1 }; });

  // CMBQ: monitor
  let grp = 'ALL';
  dash.draw('cm-table', (tb) => {
    tb.replaceChildren(); let g = null;
    rows('cm_tbl').filter((r) => grp === 'ALL' || r.group === grp).forEach((r) => {
      if (r.group !== g) { g = r.group; const tr = tb.insertRow(); const td = cell(tr, g.toUpperCase(), 'am'); td.colSpan = 12; td.style.fontSize = '10px'; td.style.paddingTop = '6px'; }
      const tr = tb.insertRow(); cell(tr, r.name, 'hi'); cell(tr, r.sym.replace('=F', ''), 'mu'); cell(tr, N(r.px, dp(r.px)), 'r yl'); cell(tr, r.unit, 'mu');
      ['w1', 'm1', 'm3', 'm6'].forEach((k) => { const td = cell(tr, PC(r[k], 1), 'r'); td.style.background = heat(r[k], 15); });
      spark(tr.insertCell(), r.spark, (r.m6 || 0) >= 0 ? '#2ee66b' : '#ff4545'); rangeBar(tr.insertCell(), r.lo, r.hi, r.px);
      cell(tr, r.vol == null ? '—' : N(r.vol, 0) + '%', 'r');
    });
  });
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-cmg]'); if (!b) return; grp = b.dataset.cmg; document.querySelectorAll('[data-cmg]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); dash.draw('cm-table'); });

  // Heatmap: commodities x periods, tiles sized equally
  let hmPer = 'm1';
  dash.draw('cm-heat', (el) => {
    d3.select(el).selectAll('*').remove();
    const d = rows('cm_tbl').filter((r) => r[hmPer] != null); if (!d.length) return;
    const W = Math.max(300, el.clientWidth), cols = W > 700 ? 5 : 4, gap = 3, tw = (W - gap * (cols - 1)) / cols, th = 56;
    const H = Math.ceil(d.length / cols) * (th + gap);
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'Commodity performance heatmap');
    const g = svg.selectAll('g').data(d).join('g').attr('transform', (r, i) => `translate(${(i % cols) * (tw + gap)},${Math.floor(i / cols) * (th + gap)})`);
    const an = TT.anim && TT.motion();
    g.append('rect').attr('width', tw).attr('height', th).style('fill', (r) => r[hmPer] >= 0 ? '#0f3a1c' : '#3d1111').style('stroke', '#222');
    g.append('rect').attr('width', tw).attr('height', th).style('fill', (r) => heat(r[hmPer], 15)).style('opacity', an ? 0 : 1).transition().duration(an ? 600 : 0).delay((r, i) => an ? i * 25 : 0).style('opacity', 1);
    g.append('text').attr('x', 7).attr('y', 16).style('fill', '#e8e8e8').style('font-size', '10.5px').style('font-weight', 700).text((r) => r.name.length > 22 ? r.name.slice(0, 21) + '…' : r.name);
    g.append('text').attr('x', 7).attr('y', 34).style('fill', '#ffd23c').style('font-size', '12px').text((r) => N(r.px, dp(r.px)) + ' ' + r.unit);
    g.append('text').attr('x', 7).attr('y', 50).style('fill', (r) => r[hmPer] >= 0 ? '#2ee66b' : '#ff6b6b').style('font-size', '11.5px').style('font-weight', 700).text((r) => PC(r[hmPer], 1));
  });
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-cmper]'); if (!b) return; hmPer = b.dataset.cmper; document.querySelectorAll('[data-cmper]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); TT.anim = true; dash.draw('cm-heat'); TT.anim = false; });

  // ENGY
  const CC = { WTI: '#ffa028', Brent: '#3cc8f0', 'Henry Hub gas': '#2ee66b' };
  dash.draw('cm-oil-curve', (el) => {
    const c = rows('cm_curves').filter((r) => r.curve !== 'Henry Hub gas'); if (!c.length) return;
    TT.chart(el, ['WTI', 'Brent'].map((n) => ({ name: n + ' futures curve', color: CC[n], width: 2.2, dots: true, values: c.filter((r) => r.curve === n).map((r) => ({ x: TT.parseD(r.date), y: r.px })) })), { height: 230, yFmt: (v) => '$' + N(v, 0), tipFmt: (v) => '$' + N(v, 2) });
  });
  dash.draw('cm-gas-curve', (el) => {
    const c = rows('cm_curves').filter((r) => r.curve === 'Henry Hub gas'); if (!c.length) return;
    TT.chart(el, [{ name: 'Henry Hub futures curve, $/MMBtu', color: '#2ee66b', width: 2.2, dots: true, values: c.map((r) => ({ x: TT.parseD(r.date), y: r.px })) }], { height: 180, yFmt: (v) => '$' + N(v, 2), tipFmt: (v) => '$' + N(v, 3) });
  });
  dash.draw('cm-curve-stats', (tb) => {
    tb.replaceChildren();
    rows('cm_curve_stats').forEach((r) => {
      const tr = tb.insertRow(); cell(tr, r.curve, 'hi'); cell(tr, '$' + N(r.front, r.front < 10 ? 3 : 2), 'r yl'); tone(cell(tr, sgn(r.m1m2) + N(Math.abs(r.m1m2), r.front < 10 ? 3 : 2), 'r'), r.m1m2);
      tone(cell(tr, sgn(r.m1_12) + N(Math.abs(r.m1_12), r.front < 10 ? 3 : 2), 'r'), r.m1_12); const s = cell(tr, r.shape); s.className = r.shape === 'Backwardation' ? 'up' : 'dn';
      tone(cell(tr, PC(r.roll_ann, 1), 'r'), r.roll_ann);
    });
  });
  const spreadChart = (name, specs, o) => dash.draw(name, (el) => {
    const s = rows('cm_spreads'); if (!s.length) return;
    TT.chart(el, specs.map(([lbl, k, color, w]) => ({ name: lbl, color, width: w || 2, values: s.filter((r) => r[k] != null).map((r) => ({ x: TT.parseD(r.date), y: r[k] })) })), o);
  });
  spreadChart('cm-crack', [['3-2-1 crack spread, $/bbl', 'crack321', '#ffa028', 2.2], ['Brent − WTI, $/bbl', 'brent_wti', '#3cc8f0']], { height: 220, yFmt: (v) => '$' + N(v, 0), tipFmt: (v) => '$' + N(v, 2) });
  spreadChart('cm-gas', [['Dutch TTF, $/MMBtu', 'ttf_usd', '#c86bff', 2.2], ['Henry Hub, $/MMBtu', 'hh', '#2ee66b']], { height: 220, yFmt: (v) => '$' + N(v, 0), tipFmt: (v) => '$' + N(v, 2) });

  // METL
  spreadChart('cm-gsr', [['Gold / silver ratio', 'gold_silver', '#ffd23c', 2.2]], { height: 200, yFmt: (v) => N(v, 0), tipFmt: (v) => N(v, 1) });
  spreadChart('cm-cg', [['Copper / gold ratio (×1000)', 'copper_gold', '#ff9a5c', 2.2]], { height: 200, yFmt: (v) => N(v, 2), tipFmt: (v) => N(v, 3) });
  spreadChart('cm-ptpd', [['Platinum − palladium, $/oz', 'pt_pd', '#7fd4ff', 2.2]], { height: 200, yFmt: (v) => '$' + N(v, 0), tipFmt: (v) => '$' + N(v, 0) });
  dash.draw('cm-goldtry', (el) => {
    const s = rows('gold_hist').filter((r) => typeof r.close === 'number').sort((a, b) => a.date < b.date ? -1 : 1); if (!s.length) return;
    TT.chart(el, [{ name: 'Gram gold, TRY', color: '#ffd23c', width: 2.2, area: true, values: s.map((r) => ({ x: TT.parseD(r.date), y: r.close })) }], { height: 220, yFmt: (v) => N(v, 0), tipFmt: (v) => N(v, 2) + ' TRY' });
  });
  dash.draw('cm-goldtry-tbl', (tb) => {
    tb.replaceChildren(); const g = rows('cm_gold_try')[0]; if (!g) return;
    [['Gram gold (market), TRY', N(g.gram, 2)], ['Gram gold implied by COMEX × USD/TRY', N(g.implied, 2)], ['Local premium / discount', PC(g.premium, 2)], ['Quarter coin (≈1.6065 g, 22k) gold value', N(g.quarter, 0) + ' TRY'], ['Ounce in TRY', N(g.ounce_try, 0)], ['Gram gold, 1 day', PC(g.d1)], ['Gram gold, 1 week', PC(g.w1)], ['Gram gold, 1 month', PC(g.m1)], ['Gram gold, 3 months', PC(g.m3)]].forEach(([a, b]) => { const tr = tb.insertRow(); cell(tr, a, 'hi'); const c = cell(tr, b, 'r'); if (/%$/.test(b)) tone(c, parseFloat(b.replace('−', '-'))); });
  });

  // AGRI
  dash.draw('cm-ag-bars', (el) => {
    d3.select(el).selectAll('*').remove();
    const d = rows('cm_tbl').filter((r) => r.group === 'Agriculture'); if (!d.length) return;
    const per = ['w1', 'm1', 'm3', 'm6'], lbl = { w1: '1W', m1: '1M', m3: '3M', m6: '6M' }, col = { w1: '#7fd4ff', m1: '#3cc8f0', m3: '#ffa028', m6: '#c86bff' };
    const W = Math.max(300, el.clientWidth), H = 260, m = { t: 22, r: 10, b: 30, l: 40 };
    const x0 = d3.scaleBand().domain(d.map((r) => r.name)).range([m.l, W - m.r]).padding(0.2), x1 = d3.scaleBand().domain(per).range([0, x0.bandwidth()]).padding(0.08);
    const ext = d3.max(d, (r) => d3.max(per, (k) => Math.abs(r[k] || 0))) || 1;
    const y = d3.scaleLinear().domain([-ext, ext]).nice().range([H - m.b, m.t]);
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'Agricultural commodity returns');
    const lg = svg.append('g').attr('transform', `translate(${m.l},10)`); per.forEach((k, i) => { lg.append('rect').attr('x', i * 46).attr('y', -7).attr('width', 9).attr('height', 9).style('fill', col[k]); lg.append('text').attr('x', i * 46 + 13).attr('y', 1).style('fill', '#aaa').style('font-size', '10px').text(lbl[k]); });
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(W - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((v) => v + '%'));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x0).tickSizeOuter(0)).selectAll('text').style('font-size', '9.5px');
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0)).style('stroke', '#666');
    const an = TT.anim && TT.motion();
    const g = svg.append('g').selectAll('g').data(d).join('g').attr('transform', (r) => `translate(${x0(r.name)},0)`);
    const b = g.selectAll('rect').data((r) => per.map((k) => ({ k, v: r[k] || 0 }))).join('rect').attr('x', (p) => x1(p.k)).attr('width', x1.bandwidth()).style('fill', (p) => col[p.k]).attr('y', an ? y(0) : (p) => Math.min(y(0), y(p.v))).attr('height', an ? 0 : (p) => Math.abs(y(p.v) - y(0)));
    if (an) b.transition().duration(700).ease(d3.easeCubicOut).attr('y', (p) => Math.min(y(0), y(p.v))).attr('height', (p) => Math.abs(y(p.v) - y(0)));
  });

  // Rebased (6 months ago = 100) weekly history for a set of front-month contracts
  const PAL = ['#ffa028', '#3cc8f0', '#2ee66b', '#c86bff', '#ffd23c', '#ff6b6b', '#7fd4ff', '#ff9a5c'];
  const rebase = (name, syms) => dash.draw(name, (el) => {
    const h1 = dash.data('cmh1'), h2 = dash.data('cmh2'); const h = [].concat(h1.data || [], h2.data || []);
    const ser = syms.map((sym, i) => { const r = h.find((x) => x.symbol === sym); if (!r || !Array.isArray(r.data) || !r.data.length) return null; const d = r.data.filter((x) => typeof x.close === 'number'); const b = d[0].close; return { name: ((window.CMLIST || []).find((c) => c[0] === sym) || [sym, sym])[1], color: PAL[i % PAL.length], width: 1.8, values: d.map((x) => ({ x: TT.parseD(x.date), y: x.close / b * 100 })) }; }).filter(Boolean);
    if (!ser.length) return;
    TT.chart(el, ser, { height: 240, yFmt: (v) => N(v, 0), tipFmt: (v) => N(v, 1), refs: [{ y: 100, label: '100' }] });
  });
  rebase('cm-rb-prec', ['GC=F', 'SI=F', 'PL=F', 'PA=F', 'HG=F', 'ALI=F']);
  rebase('cm-rb-grain', ['ZW=F', 'ZC=F', 'ZS=F', 'LE=F']);
  rebase('cm-rb-soft', ['KC=F', 'SB=F', 'CC=F', 'CT=F']);
  rebase('cm-rb-engy', ['BZ=F', 'CL=F', 'NG=F', 'TTF=F', 'RB=F', 'HO=F']);
})();
