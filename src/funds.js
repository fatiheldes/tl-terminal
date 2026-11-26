// Funds & ETFs: TEFAS fund monitor, category leaders, fund detail; US ETF monitor and rotation.
(function () {
  const P = window.TTparse;
  const ETG = ['1', '2', '3', '4'], ETW = ['1w', '1m', '3m', 'ytd', '1y'];
  ['fq1', 'fq2', 'fq3', 'fmm', 'fdebt', 'etq1', 'etq2', 'etq3', 'etq4'].concat(ETG.flatMap((g) => ETW.map((w) => `etr${g}_${w}`))).forEach((id) => dash.loader(id, { description: '', fn: P.tsv }));
  const toText = (a) => typeof a === 'string' ? a : (a && Array.isArray(a.content)) ? a.content.map((c) => c.text || '').join('\n') : (a && a.text) || '';
  // Single-fund answer: "key: value" lines plus the allocation tsv block
  const fdParse = ({ answer }) => {
    const t = toText(answer); const o = {};
    t.split('## portfolio')[0].split('\n').forEach((l) => { const m = /^([a-z_0-9]+):\s*(.*)$/.exec(l.trim()); if (m) o[m[1]] = m[2] !== '' && !isNaN(Number(m[2])) && !/^(code|isin|order_cutoff_time)$/.test(m[1]) ? Number(m[2]) : m[2]; });
    const blk = /### allocation\s*```tsv\s*\n([\s\S]*?)```/.exec(t); const alloc = [];
    if (blk) blk[1].trim().split('\n').slice(1).forEach((l) => { const c = l.split('\t'); if (c.length >= 3 && !isNaN(Number(c[2]))) alloc.push({ code: c[0].trim(), label: c[1].trim(), weight: Number(c[2]) }); });
    const pd = /\n## portfolio\s*\ndate:\s*(\S+)/.exec(t);
    if (!o.code) throw new Error(t.slice(0, 200));
    return { columns: ['fund'], rows: [Object.assign(o, { alloc, alloc_date: pd ? pd[1] : null })] };
  };
  ['fd1', 'fd2', 'fd3', 'fd4', 'fd5', 'fd6'].forEach((id) => dash.loader(id, { description: '', fn: fdParse }));

  const isN = (v) => typeof v === 'number' && isFinite(v);
  const nv = (v) => isN(v) ? v : null;
  const R2 = (v) => isN(v) ? Math.round(v * 100) / 100 : null;
  const OVR = { IJC: 'Foreign equity', IPJ: 'Foreign equity', AES: 'Foreign equity', GUM: 'Precious metals', KUT: 'Precious metals', KZL: 'Precious metals', IPV: 'Eurobond (FX)' };
  const group = (r) => {
    if (OVR[r.code]) return OVR[r.code];
    const n = String(r.name || '').toLocaleUpperCase('tr'), c = String(r.category || '');
    if (/PARA PİYASASI/.test(n)) return 'Money market';
    if (/ALTIN|KIYMETLİ|GÜMÜŞ/.test(n) || /Altın/.test(c)) return 'Precious metals';
    if (/Borçlanma/.test(c)) return /DÖVİZ|EUROBOND/.test(n) ? 'Eurobond (FX)' : 'TL debt';
    if (/YABANCI/.test(n)) return 'Foreign equity';
    if (/Hisse/.test(c)) return 'TR equity';
    if (/Değişken|Karma/.test(c)) return 'Variable / mixed';
    if (/Serbest/.test(c)) return 'Hedge (serbest)';
    return c || 'Other';
  };
  const GORDER = ['Money market', 'TL debt', 'Eurobond (FX)', 'Precious metals', 'TR equity', 'Foreign equity', 'Variable / mixed', 'Hedge (serbest)', 'Other'];
  const short = (n) => String(n || '').replace(/\s*\(HİSSE SENEDİ YOĞUN FON ?\)/g, '').replace(/\s+(FONU|FON)$/i, '').replace(/\s+PORTFÖY\b/, '').replace(/\s+/g, ' ').trim();
  window.FUshort = short;

  dash.calc('fu_key', { inputs: ['fq1', 'fq2', 'fq3'], title: 'fu_key', fn: (a, b, c) => {
    const seen = {};
    return [].concat(a || [], b || [], c || []).filter((r) => r.code && !seen[r.code] && (seen[r.code] = 1)).map((r) => ({
      code: r.code, name: short(r.name), full: r.name, group: group(r), price: nv(r.price), d1: nv(r.daily_return), w1: nv(r.weekly_return), m1: nv(r.monthly_return), m3: nv(r.three_month_return), m6: nv(r.six_month_return), ytd: nv(r.ytd_return), y1: nv(r.one_year_return), y3: nv(r.three_year_return), y5: nv(r.five_year_return), aum: nv(r.total_assets), inv: nv(r.investor_count) }))
      .sort((x, y) => GORDER.indexOf(x.group) - GORDER.indexOf(y.group) || (y.aum || 0) - (x.aum || 0));
  } });

  // USD/TRY change over each ETF comparison window, implied by the TRY and USD returns of the same asset
  dash.calc('fu_fx', { inputs: ETW.map((w) => 'etr1_' + w), title: 'fu_fx', fn: (...a) => ETW.map((w, i) => {
    const xs = (a[i] || []).filter((r) => isN(r.return_try) && isN(r.return_usd)).map((r) => (1 + r.return_try) / (1 + r.return_usd) - 1);
    const r0 = (a[i] || [])[0] || {};
    return { win: w, start: r0.start_date || null, end: r0.end_date || null, usdtry: xs.length ? R2(d3.median(xs) * 100) : null };
  }) });

  dash.calc('fu_bench', { inputs: ['fu_key', 'fu_fx', 'inflation', 'fmm'], title: 'fu_bench', fn: (k, fx, inf, mm) => {
    const cpi = (inf || []).filter((r) => isN(r.rate)).sort((a, b) => a.date < b.date ? 1 : -1)[0];
    const f = (w) => ((fx || []).find((r) => r.win === w) || {}).usdtry;
    const med = (key) => { const v = (mm || []).map((r) => r[key]).filter(isN); return v.length ? R2(d3.median(v)) : null; };
    const K = (c) => (k || []).find((r) => r.code === c) || {};
    return [{ cpi: cpi ? cpi.rate : null, cpi_date: cpi ? cpi.date : null, usd_w1: f('1w'), usd_m1: f('1m'), usd_m3: f('3m'), usd_ytd: f('ytd'), usd_y1: f('1y'), mm_w1: med('weekly_return'), mm_m1: med('return_1m'), mm_m3: med('return_3m'), mm_m6: med('return_6m'), mm_y1: med('return_1y'), gold: K('GTA'), eq: K('TI2'), fe: K('TMG') }];
  } });

  const LB = (r) => (r.name ? short(r.name) : r.code);
  const lead = (rows) => (rows || []).filter((r) => r.code).map((r) => ({ code: r.code, name: LB(r), w1: nv(r.weekly_return), m1: nv(r.return_1m), m3: nv(r.return_3m), m6: nv(r.return_6m), y1: nv(r.return_1y), y3: nv(r.return_3y), aum: nv(r.fund_size), inv: nv(r.investor_count), ann: isN(r.return_1m) ? R2((Math.pow(1 + r.return_1m / 100, 365 / 30) - 1) * 100) : null }));
  dash.calc('fs_mm', { inputs: ['fmm'], title: 'fs_mm', fn: lead });
  dash.calc('fs_debt', { inputs: ['fdebt'], title: 'fs_debt', fn: lead });

  // ETFs
  const EG = { 1: 'Broad market', 2: 'US sectors', 3: 'Styles, themes & assets', 4: 'Countries' };
  const ENAME = { SPY: 'S&P 500', QQQ: 'Nasdaq 100', IWM: 'Russell 2000', VTI: 'US total market', ACWI: 'All-country world', EFA: 'Developed ex-US (EAFE)', EEM: 'Emerging markets', VEA: 'Developed ex-US', VWO: 'Emerging markets', VXUS: 'World ex-US',
    XLK: 'Technology', XLF: 'Financials', XLE: 'Energy', XLV: 'Health care', XLI: 'Industrials', XLY: 'Consumer discretionary', XLP: 'Consumer staples', XLU: 'Utilities', XLB: 'Materials', XLC: 'Communication services', XLRE: 'Real estate',
    SMH: 'Semiconductors', IBIT: 'Bitcoin (spot)', GLD: 'Gold', SLV: 'Silver', USO: 'WTI crude (futures)', VUG: 'US growth', VTV: 'US value', SCHD: 'US dividend', MTUM: 'US momentum',
    EWJ: 'Japan', EWG: 'Germany', EWU: 'United Kingdom', FXI: 'China large-cap', INDA: 'India', EWZ: 'Brazil', EWW: 'Mexico', TUR: 'Türkiye', EWY: 'South Korea', EZU: 'Euro area' };
  window.ETNAME = ENAME;
  dash.calc('et_tbl', { inputs: ['etq1', 'etq2', 'etq3', 'etq4'].concat(ETG.flatMap((g) => ETW.map((w) => `etr${g}_${w}`))), title: 'et_tbl', fn: (...a) => {
    const out = [];
    ETG.forEach((g, gi) => (a[gi] || []).forEach((q) => {
      if (!isN(q.current_price)) return;
      const o = { sym: q.symbol, name: ENAME[q.symbol] || q.name, gi: Number(g), group: EG[g], px: q.current_price, hi: nv(q.week_52_high), lo: nv(q.week_52_low), pe: nv(q.pe_ratio), dy: nv(q.dividend_yield), vol: nv(q.volume), avol: nv(q.avg_volume) };
      ETW.forEach((w, wi) => { const r = (a[4 + gi * 5 + wi] || []).find((x) => x.asset === q.symbol); o['u_' + w] = r && isN(r.return_usd) ? R2(r.return_usd * 100) : null; o['t_' + w] = r && isN(r.return_try) ? R2(r.return_try * 100) : null; });
      o.from_hi = o.hi ? R2((o.px / o.hi - 1) * 100) : null;
      out.push(o);
    }));
    // XLRE is quoted in the themes batch but is a sector
    out.forEach((o) => { if (o.sym === 'XLRE') { o.gi = 2; o.group = EG[2]; } });
    return out.sort((x, y) => x.gi - y.gi);
  } });
})();

(function () {
  const L = d3.formatLocale({ decimal: '.', thousands: ',', grouping: [3], currency: ['', ''] });
  const N = (v, d) => v == null || isNaN(v) ? '—' : L.format(',.' + (d == null ? 2 : d) + 'f')(v);
  const sgn = (v) => v > 0 ? '+' : v < 0 ? '−' : '';
  const PC = (v, d) => v == null || isNaN(v) ? '—' : (Math.abs(v) < 0.005 ? '0.00' : sgn(v) + N(Math.abs(v), d == null ? 1 : d)) + '%';
  const rows = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : []; };
  const tone = (el, v) => { el.classList.toggle('up', typeof v === 'number' && v > 0.004); el.classList.toggle('dn', typeof v === 'number' && v < -0.004); };
  const cell = (tr, text, cls) => { const td = tr.insertCell(); td.textContent = text; if (cls) td.className = cls; return td; };
  const heat = (v, s) => v == null ? '' : v > 0 ? `rgba(46,230,107,${Math.min(0.7, Math.abs(v) / (s || 10))})` : `rgba(255,69,69,${Math.min(0.7, Math.abs(v) / (s || 10))})`;
  const BN = (v) => v == null ? '—' : v >= 1e9 ? N(v / 1e9, 1) + 'bn' : N(v / 1e6, 0) + 'm';
  const isN = (v) => typeof v === 'number' && isFinite(v);
  const kv = (name, fn) => dash.draw(name, (el) => { const r = fn(); el.textContent = r && r.text != null ? r.text : '—'; if (r && 'tone' in r) tone(el, r.tone); });
  const seg = (attr, init, cb) => { let v = init; document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest(`[${attr}]`); if (!b) return; v = b.getAttribute(attr); document.querySelectorAll(`[${attr}]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); TT.anim = true; cb(); TT.anim = false; }); return () => v; };
  const rangeBar = (td, lo, hi, v) => { if (lo == null || hi == null || hi <= lo) { td.textContent = '—'; return; } const w = 70; const x = d3.scaleLinear().domain([lo, hi]).range([3, w - 3]).clamp(true); const s = d3.select(td).append('svg').attr('width', w).attr('height', 12).attr('aria-hidden', 'true'); s.append('line').attr('x1', 3).attr('x2', w - 3).attr('y1', 6).attr('y2', 6).style('stroke', '#3a3a3a').style('stroke-width', 2); s.append('circle').attr('cx', x(v)).attr('cy', 6).attr('r', 3.5).style('fill', '#3cc8f0'); };
  const B = () => rows('fu_bench')[0] || {};
  const E = (s) => rows('et_tbl').find((r) => r.sym === s);

  // Horizontal bars with reference lines
  const hbars = (el, data, o) => {
    d3.select(el).selectAll('*').remove(); o = o || {};
    data = data.filter((d) => isN(d.v)); if (!data.length) return;
    const nref = (o.refs || []).filter((rf) => isN(rf.v)).length; const rh = o.rh || 17, W = Math.max(300, el.clientWidth), m = { t: nref ? 6 + nref * 12 : 6, r: 54, b: 18, l: o.lw || 190 }, H = m.t + m.b + data.length * rh;
    const vals = data.map((d) => d.v).concat((o.refs || []).map((r) => r.v).filter(isN), [0]);
    const x = d3.scaleLinear().domain(d3.extent(vals)).nice().range([m.l, W - m.r]);
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', el.getAttribute('aria-label') || 'Bar chart');
    svg.append('g').attr('class', 'grid').attr('transform', `translate(0,${m.t})`).call(d3.axisTop(x).ticks(6).tickSize(-(H - m.t - m.b)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat((v) => v + '%'));
    const an = TT.anim && TT.motion();
    const g = svg.append('g').selectAll('g').data(data).join('g').attr('transform', (d, i) => `translate(0,${m.t + i * rh})`);
    g.append('text').attr('x', m.l - 6).attr('y', rh / 2 + 3.5).attr('text-anchor', 'end').style('fill', (d) => d.hl ? '#ffd23c' : '#d8d8d8').style('font-size', '10.5px').text((d) => d.label);
    const r = g.append('rect').attr('y', 2).attr('height', rh - 4).style('fill', (d) => d.color || (d.v >= 0 ? '#2ee66b' : '#ff4545')).style('opacity', 0.85)
      .attr('x', x(0)).attr('width', an ? 0 : (d) => Math.abs(x(d.v) - x(0)));
    r.filter(() => !an).attr('x', (d) => Math.min(x(0), x(d.v)));
    if (an) r.transition().duration(650).ease(d3.easeCubicOut).delay((d, i) => i * 12).attr('x', (d) => Math.min(x(0), x(d.v))).attr('width', (d) => Math.abs(x(d.v) - x(0)));
    r.append('title').text((d) => `${d.label}: ${PC(d.v, 2)}`);
    g.append('text').attr('x', (d) => d.v >= 0 ? Math.max(x(d.v), x(0)) + 4 : Math.max(x(d.v), x(0)) + 4).attr('y', rh / 2 + 3.5).style('fill', '#aaa').style('font-size', '10px').text((d) => PC(d.v, 1));
    svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', m.t).attr('y2', H - m.b).style('stroke', '#777');
    (o.refs || []).filter((rf) => isN(rf.v)).forEach((rf, i) => {
      svg.append('line').attr('x1', x(rf.v)).attr('x2', x(rf.v)).attr('y1', 12 + i * 12).attr('y2', H - m.b).style('stroke', rf.color || '#ffa028').style('stroke-dasharray', '4 3').style('stroke-width', 1.4);
      const lx = x(rf.v), right = lx > (m.l + W - m.r) / 2; svg.append('text').attr('x', lx + (right ? -4 : 4)).attr('y', 10 + i * 12).attr('text-anchor', right ? 'end' : 'start').style('fill', rf.color || '#ffa028').style('font-size', '10px').text(rf.label + ' ' + PC(rf.v, 1));
    });
  };

  window.TT.hbars = hbars;

  // KPIs
  kv('fu-k-spy', () => { const r = E('SPY'); return r && { text: N(r.px, 2) }; });
  kv('fu-k-spy-c', () => { const r = E('SPY'); return r && { text: PC(r.u_1m) + ' 1M · ' + PC(r.u_ytd) + ' YTD', tone: r.u_1m }; });
  kv('fu-k-qqq', () => { const r = E('QQQ'); return r && { text: N(r.px, 2) }; });
  kv('fu-k-qqq-c', () => { const r = E('QQQ'); return r && { text: PC(r.u_1m) + ' 1M · ' + PC(r.u_ytd) + ' YTD', tone: r.u_1m }; });
  kv('fu-k-eem', () => { const r = E('EEM'); return r && { text: N(r.px, 2) }; });
  kv('fu-k-eem-c', () => { const r = E('EEM'); return r && { text: PC(r.u_1m) + ' 1M · ' + PC(r.u_ytd) + ' YTD', tone: r.u_1m }; });
  kv('fu-k-tur', () => { const r = E('TUR'); return r && { text: N(r.px, 2) }; });
  kv('fu-k-tur-c', () => { const r = E('TUR'); return r && { text: PC(r.u_1m) + ' 1M · ' + PC(r.u_ytd) + ' YTD', tone: r.u_1m }; });
  kv('fu-k-mm', () => { const b = B(); return isN(b.mm_m1) && { text: PC(b.mm_m1, 2) }; });
  kv('fu-k-mm-c', () => { const b = B(); return isN(b.mm_y1) && { text: PC(b.mm_y1) + ' 1Y · real ' + PC(isN(b.cpi) ? ((1 + b.mm_y1 / 100) / (1 + b.cpi / 100) - 1) * 100 : null), tone: b.mm_y1 - (b.cpi || 0) }; });
  kv('fu-k-usd', () => { const b = B(); return isN(b.usd_m1) && { text: PC(b.usd_m1, 2) }; });
  kv('fu-k-usd-c', () => { const b = B(); return isN(b.usd_y1) && { text: PC(b.usd_y1) + ' 1Y · ' + PC(b.usd_ytd) + ' YTD' }; });
  kv('fu-k-cpi', () => { const b = B(); return isN(b.cpi) && { text: N(b.cpi, 2) + '%' }; });
  kv('fu-k-cpi-c', () => { const b = B(); return b.cpi_date && { text: 'y/y · ' + TT.mShort(TT.parseD(b.cpi_date)) }; });

  // FUND: key fund monitor
  const fuv = seg('data-fuv', 'TRY', () => dash.draw('fu-table'));
  const FW = [['d1', null], ['w1', '1w'], ['m1', '1m'], ['m3', '3m'], ['m6', null], ['ytd', 'ytd'], ['y1', '1y'], ['y3', null]];
  const conv = (r, k, w) => {
    const v = r[k]; if (!isN(v)) return null; const view = fuv(), b = B();
    if (view === 'USD') { if (!w) return null; const fx = b['usd_' + (w === '1w' ? 'w1' : w === '1m' ? 'm1' : w === '3m' ? 'm3' : w === 'ytd' ? 'ytd' : 'y1')]; return isN(fx) ? ((1 + v / 100) / (1 + fx / 100) - 1) * 100 : null; }
    if (view === 'REAL') { if (k !== 'y1') return null; return isN(b.cpi) ? ((1 + v / 100) / (1 + b.cpi / 100) - 1) * 100 : null; }
    return v;
  };
  dash.draw('fu-table', (tb) => {
    tb.replaceChildren(); let g = null;
    rows('fu_key').forEach((r) => {
      if (r.group !== g) { g = r.group; const tr = tb.insertRow(); const td = cell(tr, g.toUpperCase(), 'am'); td.colSpan = 13; td.style.fontSize = '10px'; td.style.paddingTop = '6px'; }
      const tr = tb.insertRow(); tr.title = r.full; cell(tr, r.code, 'yl'); cell(tr, r.name, 'hi'); cell(tr, N(r.price, r.price < 10 ? 4 : 2), 'r');
      FW.forEach(([k, w]) => { const v = conv(r, k, w); const td = cell(tr, PC(v), 'r'); td.style.background = heat(v, k === 'd1' ? 4 : k === 'w1' ? 8 : k === 'y3' ? 150 : 40); });
      cell(tr, BN(r.aum), 'r'); cell(tr, r.inv == null ? '—' : N(r.inv, 0), 'r mu');
    });
  });
  const fuper = seg('data-fuper', 'y1', () => dash.draw('fu-bars'));
  dash.draw('fu-bars', (el) => {
    const k = fuper(), b = B(); const map = { m1: 'usd_m1', m3: 'usd_m3', ytd: 'usd_ytd', y1: 'usd_y1' };
    const d = rows('fu_key').filter((r) => isN(r[k])).sort((x, y) => y[k] - x[k]).map((r) => ({ label: r.code + ' · ' + (r.name.length > 26 ? r.name.slice(0, 25) + '…' : r.name), v: r[k] }));
    const refs = [{ v: b[map[k]], label: 'USD/TRY', color: '#3cc8f0' }]; if (k === 'y1') refs.push({ v: b.cpi, label: 'CPI', color: '#ffa028' }); if (k === 'm1' || k === 'm3' || k === 'y1') refs.push({ v: b['mm_' + k], label: 'MMF median', color: '#c86bff' });
    hbars(el, d, { refs, lw: 230 });
  });
  dash.draw('fu-bench', (tb) => {
    tb.replaceChildren(); const b = B(); const K = (o, k) => o && isN(o[k]) ? o[k] : null;
    [['USD/TRY (change)', b.usd_w1, b.usd_m1, b.usd_m3, b.usd_ytd, b.usd_y1], ['Money market funds (median of leaders)', b.mm_w1, b.mm_m1, b.mm_m3, null, b.mm_y1], ['Gold fund · GTA', K(b.gold, 'w1'), K(b.gold, 'm1'), K(b.gold, 'm3'), K(b.gold, 'ytd'), K(b.gold, 'y1')], ['TR equity fund · TI2', K(b.eq, 'w1'), K(b.eq, 'm1'), K(b.eq, 'm3'), K(b.eq, 'ytd'), K(b.eq, 'y1')], ['Foreign equity fund · TMG', K(b.fe, 'w1'), K(b.fe, 'm1'), K(b.fe, 'm3'), K(b.fe, 'ytd'), K(b.fe, 'y1')], ['Consumer prices (CPI, y/y)', null, null, null, null, b.cpi]]
      .forEach(([n, ...v]) => { const tr = tb.insertRow(); cell(tr, n, 'hi'); v.forEach((x) => tone(cell(tr, PC(x), 'r'), x)); });
  });

  // FSRT: category leaders
  const lead = (name, id) => dash.draw(name, (tb) => {
    tb.replaceChildren();
    rows(id).forEach((r, i) => { const tr = tb.insertRow(); cell(tr, String(i + 1), 'mu'); cell(tr, r.code, 'yl'); cell(tr, r.name.length > 44 ? r.name.slice(0, 43) + '…' : r.name, 'hi').title = r.name; ['w1', 'm1', 'm3', 'm6', 'y1', 'y3'].forEach((k) => cell(tr, PC(r[k], 2), 'r')); cell(tr, PC(r.ann, 1), 'r yl'); cell(tr, BN(r.aum), 'r'); cell(tr, r.inv == null ? '—' : N(r.inv, 0), 'r mu'); });
  });
  lead('fs-mm', 'fs_mm'); lead('fs-debt', 'fs_debt');
  dash.draw('fs-scatter', (el) => {
    d3.select(el).selectAll('*').remove();
    const d = [].concat(rows('fs_mm').map((r) => Object.assign({ c: '#c86bff', g: 'Money market' }, r)), rows('fs_debt').map((r) => Object.assign({ c: '#3cc8f0', g: 'Short-term TL debt' }, r))).filter((r) => isN(r.aum) && r.aum > 0 && isN(r.m1));
    if (!d.length) return;
    const W = Math.max(300, el.clientWidth), H = 260, m = { t: 22, r: 16, b: 30, l: 46 };
    const x = d3.scaleLog().domain(d3.extent(d, (r) => r.aum)).nice().range([m.l, W - m.r]);
    const ye = d3.extent(d, (r) => r.m1), y = d3.scaleLinear().domain([ye[0] - 0.05, ye[1] + 0.05]).nice().range([H - m.b, m.t]);
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'Fund size vs 1-month return');
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(W - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((v) => v.toFixed(1) + '%'));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues([1e7, 3e7, 1e8, 3e8, 1e9, 3e9, 1e10, 3e10, 1e11].filter((v) => v >= x.domain()[0] && v <= x.domain()[1])).tickFormat((v) => v >= 1e9 ? v / 1e9 + 'bn' : v / 1e6 + 'm'));
    const lg = svg.append('g').attr('transform', `translate(${m.l + 6},10)`); [['Money market', '#c86bff'], ['Short-term TL debt', '#3cc8f0']].forEach(([t, c], i) => { lg.append('circle').attr('cx', i * 130).attr('cy', -3).attr('r', 4).style('fill', c); lg.append('text').attr('x', i * 130 + 8).attr('y', 1).style('fill', '#aaa').style('font-size', '10px').text(t); });
    const g = svg.append('g').selectAll('g').data(d).join('g').attr('transform', (r) => `translate(${x(r.aum)},${y(r.m1)})`);
    g.append('circle').attr('r', 4.5).style('fill', (r) => r.c).style('opacity', 0.85).append('title').text((r) => `${r.code} ${r.name}\n1M ${PC(r.m1, 2)} · size ${BN(r.aum)} TRY`);
    g.append('text').attr('x', 6).attr('y', 3).style('fill', '#bbb').style('font-size', '9px').text((r) => r.code);
    svg.append('text').attr('x', W - m.r).attr('y', H - m.b - 4).attr('text-anchor', 'end').style('fill', '#777').style('font-size', '10px').text('fund size, TRY (log scale)');
  });

  // FDES: fund detail
  let fdSel = 'fd1';
  const FDS = ['fd1', 'fd2', 'fd3', 'fd4', 'fd5', 'fd6'];
  const fd = () => { const d = dash.data(fdSel); return d.status === 'ok' && d.data && d.data[0] ? d.data[0] : null; };
  dash.draw('fd-btns', (el) => {
    el.replaceChildren();
    FDS.forEach((id) => { const d = dash.data(id); const r = d.status === 'ok' && d.data && d.data[0]; if (!r) return; const b = document.createElement('button'); b.dataset.fdsel = id; b.setAttribute('aria-pressed', String(id === fdSel)); b.textContent = r.code; b.title = r.name; el.appendChild(b); });
  });
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-fdsel]'); if (!b) return; fdSel = b.dataset.fdsel; document.querySelectorAll('[data-fdsel]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); TT.anim = true; ['fd-title', 'fd-info', 'fd-alloc', 'fd-ret'].forEach((n) => dash.draw(n)); TT.anim = false; });
  dash.draw('fd-title', (el) => { const r = fd(); el.textContent = r ? r.code + ' · ' + window.FUshort(r.name) : '—'; });
  dash.draw('fd-info', (tb) => {
    tb.replaceChildren(); const r = fd(); if (!r) return;
    [['Category', r.category], ['ISIN', r.isin], ['Price', N(r.price, r.price < 10 ? 4 : 2) + ' TRY'], ['Fund size', BN(r.total_assets) + ' TRY'], ['Investors', N(r.investor_count, 0)], ['Market share in category', N(r.market_share, 2) + '%'], ['1Y rank in category', isN(r.category_rank) ? r.category_rank + ' of ' + r.category_fund_count : '—'], ['Return 3Y / 5Y', PC(r.return_3y) + ' / ' + PC(r.return_5y)], ['Order cut-off', r.order_cutoff_time || '—'], ['Settlement (buy / sell)', `T+${r.buy_valor_days} / T+${r.sell_valor_days}`], ['Allocation date', r.alloc_date || '—']]
      .forEach(([a, b]) => { const tr = tb.insertRow(); cell(tr, a, 'mu'); cell(tr, b == null ? '—' : String(b), 'r hi'); });
  });
  dash.draw('fd-alloc', (el) => { const r = fd(); if (!r) return; hbars(el, (r.alloc || []).map((a) => ({ label: a.label.length > 34 ? a.label.slice(0, 33) + '…' : a.label, v: a.weight, color: '#3cc8f0' })), { lw: 230, rh: 19 }); });
  dash.draw('fd-ret', (el) => { const r = fd(); if (!r) return; hbars(el, [['1 day', 'daily_return'], ['1 week', 'weekly_return'], ['1 month', 'return_1m'], ['3 months', 'return_3m'], ['6 months', 'return_6m'], ['Year to date', 'return_ytd'], ['1 year', 'return_1y']].map(([l, k]) => ({ label: l, v: r[k] })), { lw: 90, rh: 19, refs: [{ v: B().cpi, label: 'CPI y/y', color: '#ffa028' }] }); });

  // ETF monitor
  const etcur = seg('data-etcur', 'USD', () => dash.draw('et-table'));
  let etGrp = 0;
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-etg]'); if (!b) return; etGrp = Number(b.dataset.etg); document.querySelectorAll('[data-etg]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); dash.draw('et-table'); });
  dash.draw('et-table', (tb) => {
    tb.replaceChildren(); let g = null; const p = etcur() === 'TRY' ? 't_' : 'u_';
    rows('et_tbl').filter((r) => !etGrp || r.gi === etGrp).forEach((r) => {
      if (r.group !== g) { g = r.group; const tr = tb.insertRow(); const td = cell(tr, g.toUpperCase(), 'am'); td.colSpan = 13; td.style.fontSize = '10px'; td.style.paddingTop = '6px'; }
      const tr = tb.insertRow(); cell(tr, r.sym, 'yl'); cell(tr, r.name, 'hi'); cell(tr, N(r.px, 2), 'r');
      ['1w', '1m', '3m', 'ytd', '1y'].forEach((w) => { const v = r[p + w]; const td = cell(tr, PC(v), 'r'); td.style.background = heat(v, w === '1w' ? 6 : w === '1m' ? 12 : 30); });
      rangeBar(tr.insertCell(), r.lo, r.hi, r.px); tone(cell(tr, PC(r.from_hi), 'r'), r.from_hi);
      cell(tr, r.pe == null ? '—' : N(r.pe, 1), 'r'); cell(tr, r.dy == null ? '—' : N(r.dy, 2) + '%', 'r');
    });
  });

  // ETFR: rotation
  const etper = seg('data-etper', '1m', () => { dash.draw('er-sect'); dash.draw('er-ctry'); });
  const grpBars = (name, gi) => dash.draw(name, (el) => {
    const w = etper(); const d = rows('et_tbl').filter((r) => r.gi === gi && isN(r['u_' + w])).sort((a, b) => b['u_' + w] - a['u_' + w]).map((r) => ({ label: r.sym + ' · ' + r.name, v: r['u_' + w], hl: r.sym === 'TUR' }));
    const spy = (rows('et_tbl').find((r) => r.sym === (gi === 4 ? 'ACWI' : 'SPY')) || {})['u_' + w];
    hbars(el, d, { lw: 190, refs: [{ v: spy, label: gi === 4 ? 'ACWI' : 'S&P 500', color: '#ffd23c' }] });
  });
  grpBars('er-sect', 2); grpBars('er-ctry', 4);
  dash.draw('er-mom', (el) => {
    d3.select(el).selectAll('*').remove();
    const d = rows('et_tbl').filter((r) => isN(r.u_1m) && isN(r.u_3m)); if (!d.length) return;
    const COL = { 1: '#ffa028', 2: '#3cc8f0', 3: '#c86bff', 4: '#2ee66b' };
    const W = Math.max(300, el.clientWidth), H = 330, m = { t: 22, r: 18, b: 30, l: 44 };
    const xe = d3.extent(d, (r) => r.u_3m), ye = d3.extent(d, (r) => r.u_1m);
    const x = d3.scaleLinear().domain([Math.min(xe[0], 0) - 2, Math.max(xe[1], 0) + 2]).nice().range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([Math.min(ye[0], 0) - 2, Math.max(ye[1], 0) + 2]).nice().range([H - m.b, m.t]);
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'ETF momentum map');
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(W - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((v) => v + '%'));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(8).tickFormat((v) => v + '%'));
    svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', m.t).attr('y2', H - m.b).style('stroke', '#666');
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0)).style('stroke', '#666');
    [['Leading', W - m.r - 4, m.t + 10, 'end'], ['Improving', m.l + 4, m.t + 10, 'start'], ['Lagging', m.l + 4, H - m.b - 6, 'start'], ['Weakening', W - m.r - 4, H - m.b - 6, 'end']].forEach(([t, xx, yy, a]) => svg.append('text').attr('x', xx).attr('y', yy).attr('text-anchor', a).style('fill', '#555').style('font-size', '11px').style('font-weight', 700).text(t.toUpperCase()));
    const lg = svg.append('g').attr('transform', `translate(${m.l + 6},10)`); [1, 2, 3, 4].forEach((k, i) => { lg.append('circle').attr('cx', i * 190).attr('cy', -3).attr('r', 4).style('fill', COL[k]); lg.append('text').attr('x', i * 190 + 8).attr('y', 1).style('fill', '#aaa').style('font-size', '10px').text({ 1: 'Broad market', 2: 'US sectors', 3: 'Styles, themes & assets', 4: 'Countries' }[k]); });
    svg.append('text').attr('x', W - m.r).attr('y', H - m.b - 18).attr('text-anchor', 'end').style('fill', '#777').style('font-size', '10px').text('→ 3-month return');
    svg.append('text').attr('x', m.l + 4).attr('y', m.t + 24).style('fill', '#777').style('font-size', '10px').text('↑ 1-month return');
    const g = svg.append('g').selectAll('g').data(d).join('g').attr('transform', (r) => `translate(${x(r.u_3m)},${y(r.u_1m)})`);
    g.append('circle').attr('r', 4.5).style('fill', (r) => COL[r.gi]).style('opacity', 0.9).append('title').text((r) => `${r.sym} · ${r.name}\n1M ${PC(r.u_1m)} · 3M ${PC(r.u_3m)}`);
    g.append('text').attr('x', 6).attr('y', 3).style('fill', (r) => r.sym === 'TUR' ? '#ffd23c' : '#bbb').style('font-size', '9px').text((r) => r.sym);
  });
  dash.draw('er-fx', (tb) => {
    tb.replaceChildren();
    rows('fu_fx').forEach((r) => { const tr = tb.insertRow(); cell(tr, { '1w': '1 week', '1m': '1 month', '3m': '3 months', ytd: 'Year to date', '1y': '1 year' }[r.win], 'hi'); cell(tr, (r.start || '—') + ' → ' + (r.end || '—'), 'mu'); tone(cell(tr, PC(r.usdtry, 2), 'r'), r.usdtry); });
  });
})();
