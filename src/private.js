// Private markets through listed proxies: alternative asset managers, BDCs (private credit), real assets & venture ETFs, Turkish REITs/VC trusts and the housing market.
(function () {
  const P = window.TTparse;
  const G = ['1', '2', '3'], W = ['1m', 'ytd', '1y'];
  ['pmq1', 'pmq2', 'pmq3', 'pmqt'].concat(G.flatMap((g) => W.map((w) => `pmr${g}_${w}`)), ['pmrt_1m', 'pmrt_ytd']).forEach((id) => dash.loader(id, { description: '', fn: P.tsv }));
  dash.loader('pm_house', { description: '', fn: P.md() });
  const isN = (v) => typeof v === 'number' && isFinite(v);
  const R2 = (v) => isN(v) ? Math.round(v * 100) / 100 : null;
  const pct = (a, b) => isN(a) && isN(b) && b ? R2((a / b - 1) * 100) : null;
  const META = {
    BX: ['Blackstone', 'United States', 'Diversified'], KKR: ['KKR', 'United States', 'Diversified'], APO: ['Apollo', 'United States', 'Credit-led'], ARES: ['Ares', 'United States', 'Credit-led'], CG: ['Carlyle', 'United States', 'Private equity'], TPG: ['TPG', 'United States', 'Private equity'], BAM: ['Brookfield AM', 'Canada', 'Real assets'], OWL: ['Blue Owl', 'United States', 'Credit & GP stakes'], 'III.L': ['3i Group', 'United Kingdom', 'Private equity (balance sheet)'], 'PGHN.SW': ['Partners Group', 'Switzerland', 'Diversified'],
    ARCC: ['Ares Capital', 'BDC', 'Senior / unitranche'], OBDC: ['Blue Owl Capital Corp', 'BDC', 'Senior secured'], BXSL: ['Blackstone Secured Lending', 'BDC', 'First lien'], FSK: ['FS KKR Capital', 'BDC', 'Senior / mixed'], MAIN: ['Main Street Capital', 'BDC', 'Lower middle market'], HTGC: ['Hercules Capital', 'BDC', 'Venture debt'], GBDC: ['Golub Capital BDC', 'BDC', 'Sponsor first lien'], PSEC: ['Prospect Capital', 'BDC', 'Mixed / CLO equity'], BIZD: ['VanEck BDC Income ETF', 'ETF', 'BDC basket'], PSP: ['Invesco Global Listed PE ETF', 'ETF', 'Listed private equity'],
    VNQ: ['US REITs (Vanguard)', 'Real estate', 'US'], REET: ['Global REITs (iShares)', 'Real estate', 'Global'], VNQI: ['Global ex-US real estate', 'Real estate', 'Global ex-US'], SRVR: ['Data & infrastructure REITs', 'Real estate', 'Data centres, towers'], IGF: ['Global infrastructure', 'Infrastructure', 'Utilities, transport, energy'], PAVE: ['US infrastructure development', 'Infrastructure', 'Construction & materials'], IPO: ['Renaissance IPO ETF', 'Venture & growth', 'Recent IPOs'], ARKK: ['ARK Innovation', 'Venture & growth', 'Disruptive growth'],
    ISGYO: ['İş GYO', 'REIT (GYO)', 'Commercial'], TRGYO: ['Torunlar GYO', 'REIT (GYO)', 'Malls & mixed-use'], ZRGYO: ['Ziraat GYO', 'REIT (GYO)', 'Residential & commercial'], OZKGY: ['Özak GYO', 'REIT (GYO)', 'Residential'], KLGYO: ['Kiler GYO', 'REIT (GYO)', 'Residential'], SNGYO: ['Sinpaş GYO', 'REIT (GYO)', 'Residential'], ISGSY: ['İş Girişim Sermayesi', 'VC trust (GSYO)', 'Private equity'], GOZDE: ['Gözde Girişim', 'VC trust (GSYO)', 'Private equity'], HDFGS: ['Hedef Girişim', 'VC trust (GSYO)', 'Venture'], VERTU: ['Verusaturk Girişim', 'VC trust (GSYO)', 'Venture'] };
  window.PMMETA = META;
  const build = (q, rs) => (q || []).filter((r) => isN(r.current_price)).map((r) => {
    const m = META[r.symbol] || [r.name, '', ''];
    const o = { sym: r.symbol, name: m[0], where: m[1], style: m[2], ccy: r.currency, px: r.current_price, mcap: isN(r.market_cap) ? r.market_cap : null, pe: isN(r.pe_ratio) ? r.pe_ratio : null, pb: isN(r.pb_ratio) ? r.pb_ratio : null, roe: isN(r.roe) ? R2(r.roe * 100) : null, dy: isN(r.dividend_yield) ? r.dividend_yield : null, hi: isN(r.week_52_high) ? r.week_52_high : null, lo: isN(r.week_52_low) ? r.week_52_low : null, beta: isN(r.beta) ? r.beta : null };
    rs.forEach(([w, rows]) => { const x = (rows || []).find((z) => z.asset === r.symbol && z.market !== 'fund'); o[w] = x ? pct(r.current_price, x.start_price) : null; });
    o.from_hi = o.hi ? pct(o.px, o.hi) : null;
    return o;
  });
  G.forEach((g, gi) => dash.calc('pm' + g, { inputs: ['pmq' + g].concat(W.map((w) => `pmr${g}_${w}`)), title: 'pm' + g, fn: (q, ...r) => build(q, W.map((w, i) => [w, r[i]])) }));
  dash.calc('pmt', { inputs: ['pmqt', 'pmrt_1m', 'pmrt_ytd'], title: 'pmt', fn: (q, a, b) => build(q, [['1m', a], ['ytd', b]]) });
  dash.calc('pm_credit', { inputs: ['pm2', 'gq1'], title: 'pm_credit', fn: (b, g) => {
    const q = (s) => ((g || []).find((r) => r.symbol === s) || {});
    const bdc = (b || []).filter((r) => r.where === 'BDC');
    const med = (k) => { const v = bdc.map((r) => r[k]).filter(isN); return v.length ? R2(d3.median(v)) : null; };
    return [{ yield_med: med('dy'), pb_med: med('pb'), hy: q('HYG').dividend_yield, tbill: q('^IRX').current_price, n: bdc.length, below_nav: bdc.filter((r) => isN(r.pb) && r.pb < 1).length }];
  } });
  dash.calc('pm_hs', { inputs: ['pm_house', 'e_cpi'], title: 'pm_hs', fn: (rows, cpi) => {
    const s = (rows || []).filter((r) => r.tarih).sort((a, b) => a.tarih < b.tarih ? -1 : 1);
    const c = (cpi || []).reduce((m, r) => { m[r.date] = r.headline; return m; }, {});
    return s.map((r, i) => { const y = i >= 12 ? s[i - 12] : null; const kfe = y ? pct(r.KFE_TR, y.KFE_TR) : null, ist = y ? pct(r.KFE_TR10, y.KFE_TR10) : null;
      const sum12 = (k) => i >= 11 ? d3.sum(s.slice(i - 11, i + 1), (x) => x[k] || 0) : null;
      return { date: r.tarih, total: r.AKONUTSAT1_KTRTOPLAM, sa: r.AKONUTSAT1_KMA, mortgage: r.AKONUTSAT2_KTRTOPLAM, first: r.AKONUTSAT3_KTRTOPLAM, ist: r.AKONUTSAT1_KTR100, ank: r.AKONUTSAT1_KTR510, izm: r.AKONUTSAT1_KTR310,
        mort_share: isN(r.AKONUTSAT2_KTRTOPLAM) && r.AKONUTSAT1_KTRTOPLAM ? R2(r.AKONUTSAT2_KTRTOPLAM / r.AKONUTSAT1_KTRTOPLAM * 100) : null, first_share: isN(r.AKONUTSAT3_KTRTOPLAM) && r.AKONUTSAT1_KTRTOPLAM ? R2(r.AKONUTSAT3_KTRTOPLAM / r.AKONUTSAT1_KTRTOPLAM * 100) : null,
        yoy: y ? pct(r.AKONUTSAT1_KTRTOPLAM, y.AKONUTSAT1_KTRTOPLAM) : null, sum12: sum12('AKONUTSAT1_KTRTOPLAM'), kfe_yoy: kfe, kfe_ist_yoy: ist, kfe_real: isN(kfe) && isN(c[r.tarih]) ? R2(((1 + kfe / 100) / (1 + c[r.tarih] / 100) - 1) * 100) : null };
    });
  } });
})();

(function () {
  const L = d3.formatLocale({ decimal: '.', thousands: ',', grouping: [3], currency: ['', ''] });
  const N = (v, d) => v == null || isNaN(v) ? '—' : L.format(',.' + (d == null ? 2 : d) + 'f')(v);
  const sgn = (v) => v > 0 ? '+' : v < 0 ? '−' : '';
  const isN = (v) => typeof v === 'number' && isFinite(v);
  const PC = (v, d) => !isN(v) ? '—' : (Math.abs(v) < 0.005 ? '0.0' : sgn(v) + N(Math.abs(v), d == null ? 1 : d)) + '%';
  const rows = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : []; };
  const tone = (el, v) => { el.classList.toggle('up', isN(v) && v > 0.004); el.classList.toggle('dn', isN(v) && v < -0.004); };
  const cell = (tr, text, cls) => { const td = tr.insertCell(); td.textContent = text; if (cls) td.className = cls; return td; };
  const heat = (v, s) => v == null ? '' : v > 0 ? `rgba(46,230,107,${Math.min(0.7, Math.abs(v) / (s || 10))})` : `rgba(255,69,69,${Math.min(0.7, Math.abs(v) / (s || 10))})`;
  const kv = (name, fn) => dash.draw(name, (el) => { const r = fn(); el.textContent = r && r.text != null ? r.text : '—'; if (r && 'tone' in r) tone(el, r.tone); });
  const rangeBar = (td, lo, hi, v) => { if (!isN(lo) || !isN(hi) || hi <= lo) { td.textContent = '—'; return; } const w = 70; const x = d3.scaleLinear().domain([lo, hi]).range([3, w - 3]).clamp(true); const s = d3.select(td).append('svg').attr('width', w).attr('height', 12).attr('aria-hidden', 'true'); s.append('line').attr('x1', 3).attr('x2', w - 3).attr('y1', 6).attr('y2', 6).style('stroke', '#3a3a3a').style('stroke-width', 2); s.append('circle').attr('cx', x(v)).attr('cy', 6).attr('r', 3.5).style('fill', '#3cc8f0'); };
  const BN = (v, c) => !isN(v) ? '—' : (c === 'GBp' ? N(v / 100 / 1e9, 1) : N(v / 1e9, 1)) + 'bn';
  const seg = (attr, init, cb) => { let v = init; document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest(`[${attr}]`); if (!b) return; v = b.getAttribute(attr); document.querySelectorAll(`[${attr}]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); TT.anim = true; cb(); TT.anim = false; }); return () => v; };
  const D = (s) => TT.parseD(s);
  const R = (id, s) => rows(id).find((r) => r.sym === s);

  // KPIs
  kv('pm-k-psp', () => { const r = R('pm2', 'PSP'); return r && { text: PC(r.ytd) }; });
  kv('pm-k-psp-c', () => { const r = R('pm2', 'PSP'); return r && { text: 'listed PE (PSP) YTD · 1M ' + PC(r['1m']), tone: r['1m'] }; });
  kv('pm-k-alts', () => { const a = rows('pm1').filter((r) => isN(r.ytd)); return a.length && { text: PC(d3.median(a, (r) => r.ytd)) }; });
  kv('pm-k-alts-c', () => { const a = rows('pm1').filter((r) => isN(r['1m'])); return a.length && { text: 'median alt manager YTD · 1M ' + PC(d3.median(a, (r) => r['1m'])), tone: d3.median(a, (r) => r['1m']) }; });
  kv('pm-k-bdc', () => { const c = rows('pm_credit')[0]; return c && isN(c.yield_med) && { text: N(c.yield_med, 1) + '%' }; });
  kv('pm-k-bdc-c', () => { const c = rows('pm_credit')[0]; return c && { text: 'BDC median · HY ETF ' + N(c.hy, 1) + '%' }; });
  kv('pm-k-nav', () => { const c = rows('pm_credit')[0]; return c && isN(c.pb_med) && { text: N(c.pb_med, 2) + '×' }; });
  kv('pm-k-nav-c', () => { const c = rows('pm_credit')[0]; return c && { text: 'BDC price/book · ' + c.below_nav + ' of ' + c.n + ' below NAV', tone: c.pb_med - 1 }; });
  kv('pm-k-gyo', () => { const t = rows('pmt').filter((r) => /GYO/.test(r.where) && isN(r.pb)); return t.length && { text: N(d3.median(t, (r) => r.pb), 2) + '×' }; });
  kv('pm-k-gyo-c', () => { const t = rows('pmt').filter((r) => /GYO/.test(r.where) && isN(r.pb)); return t.length && { text: 'GYO median P/B · ' + PC((d3.median(t, (r) => r.pb) - 1) * 100, 0) + ' vs book' }; });
  kv('pm-k-hs', () => { const s = rows('pm_hs').filter((r) => isN(r.yoy)); const a = s[s.length - 1]; return a && { text: PC(a.yoy) }; });
  kv('pm-k-hs-c', () => { const s = rows('pm_hs').filter((r) => isN(r.yoy)); const a = s[s.length - 1]; return a && { text: 'home sales y/y · ' + TT.mShort(D(a.date)) + ' · SA ' + N(a.sa / 1000, 0) + 'k', tone: a.yoy }; });

  // Generic monitor table
  const table = (name, id, opts) => dash.draw(name, (tb) => {
    tb.replaceChildren(); let g = null;
    const d = rows(id).slice(); if (opts.sort) d.sort(opts.sort);
    d.forEach((r) => {
      if (opts.group && r[opts.group] !== g) { g = r[opts.group]; const tr = tb.insertRow(); const td = cell(tr, String(g).toUpperCase(), 'am'); td.colSpan = 16; td.style.fontSize = '10px'; td.style.paddingTop = '6px'; }
      const tr = tb.insertRow(); tr.title = r.style; cell(tr, r.sym, 'yl'); cell(tr, r.name, 'hi'); if (opts.style) cell(tr, r.style, 'mu');
      cell(tr, N(r.px, r.px < 10 ? 2 : r.px < 1000 ? 2 : 0) + (opts.ccy ? ' ' + (r.ccy === 'GBp' ? 'p' : r.ccy === 'USD' ? '' : r.ccy) : ''), 'r');
      if (opts.mcap) cell(tr, BN(r.mcap, r.ccy), 'r');
      (opts.cols || []).forEach(([k, fmt]) => { const v = r[k]; const td = cell(tr, fmt(v, r), 'r'); if (k === 'pb' && isN(v) && opts.navTone) tone(td, v - 1); });
      (opts.rets || ['1m', 'ytd', '1y']).forEach((w) => { const td = cell(tr, PC(r[w]), 'r'); td.style.background = heat(r[w], w === '1m' ? 12 : 40); });
      rangeBar(tr.insertCell(), r.lo, r.hi, r.px); tone(cell(tr, PC(r.from_hi), 'r'), r.from_hi);
    });
  });
  const X = (d) => (v) => isN(v) ? N(v, d) : '—';
  table('pm-alts', 'pm1', { style: true, ccy: true, mcap: true, cols: [['pe', X(1)], ['pb', X(1)], ['roe', (v) => isN(v) ? N(v, 1) + '%' : '—'], ['dy', (v) => isN(v) ? N(v, 2) + '%' : '—'], ['beta', X(2)]], sort: (a, b) => (b.mcap || 0) * (b.ccy === 'GBp' ? 0.0127 : 1) - (a.mcap || 0) * (a.ccy === 'GBp' ? 0.0127 : 1) });
  table('pm-bdc', 'pm2', { style: true, mcap: true, navTone: true, cols: [['pb', (v) => isN(v) ? N(v, 2) + '×' : '—'], ['pb', (v) => isN(v) ? PC((v - 1) * 100, 0) : '—'], ['dy', (v) => isN(v) ? N(v, 2) + '%' : '—'], ['roe', (v) => isN(v) ? N(v, 1) + '%' : '—']], sort: (a, b) => (a.where === 'ETF') - (b.where === 'ETF') || (b.mcap || 0) - (a.mcap || 0) });
  table('pm-real', 'pm3', { group: 'where', style: true, cols: [['pe', X(1)], ['dy', (v) => isN(v) ? N(v, 2) + '%' : '—']], sort: (a, b) => ['Real estate', 'Infrastructure', 'Venture & growth'].indexOf(a.where) - ['Real estate', 'Infrastructure', 'Venture & growth'].indexOf(b.where) });
  table('pm-tr', 'pmt', { group: 'where', style: true, mcap: true, navTone: true, rets: ['1m', 'ytd'], cols: [['pb', (v) => isN(v) ? N(v, 2) + '×' : '—'], ['pb', (v) => isN(v) ? PC((v - 1) * 100, 0) : '—'], ['dy', (v) => isN(v) ? N(v, 2) + '%' : '—']], sort: (a, b) => a.where < b.where ? -1 : a.where > b.where ? 1 : (b.mcap || 0) - (a.mcap || 0) });

  const altP = seg('data-pmp', 'ytd', () => dash.draw('pm-bars'));
  dash.draw('pm-bars', (el) => { const k = altP(); const d = rows('pm1').concat(rows('pm2').filter((r) => r.where === 'ETF')).filter((r) => isN(r[k])).sort((a, b) => b[k] - a[k]); TT.hbars(el, d.map((r) => ({ label: r.name, v: r[k], hl: r.sym === 'PSP', color: r.sym === 'PSP' || r.sym === 'BIZD' ? '#ffd23c' : undefined })), { lw: 200, refs: [{ v: ((rows('et_tbl').find((r) => r.sym === 'SPY') || {})['u_' + k]), label: 'S&P 500', color: '#3cc8f0' }] }); });
  dash.draw('pm-scatter', (el) => {
    d3.select(el).selectAll('*').remove();
    const d = rows('pm2').filter((r) => r.where === 'BDC' && isN(r.pb) && isN(r.dy)); if (!d.length) return;
    const c = rows('pm_credit')[0] || {};
    const W2 = Math.max(300, el.clientWidth), H = 280, m = { t: 14, r: 18, b: 30, l: 42 };
    const x = d3.scaleLinear().domain([Math.min(0.2, d3.min(d, (r) => r.pb)) - 0.05, Math.max(1.8, d3.max(d, (r) => r.pb)) + 0.05]).range([m.l, W2 - m.r]);
    const y = d3.scaleLinear().domain([0, d3.max(d, (r) => r.dy) * 1.1]).nice().range([H - m.b, m.t]);
    const svg = d3.select(el).append('svg').attr('width', W2).attr('height', H).attr('role', 'img').attr('aria-label', 'BDC yield vs price to book');
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(W2 - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((v) => v + '%'));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(8).tickFormat((v) => v.toFixed(1) + '×'));
    svg.append('line').attr('x1', x(1)).attr('x2', x(1)).attr('y1', m.t).attr('y2', H - m.b).style('stroke', '#888').style('stroke-dasharray', '4 3');
    svg.append('text').attr('x', x(1) + 4).attr('y', m.t + 10).style('fill', '#888').style('font-size', '10px').text('price = book (NAV)');
    [['HY bond ETF yield', c.hy, '#ff6b6b'], ['3M T-bill', c.tbill, '#2ee66b']].forEach(([t, v, col]) => { if (!isN(v)) return; svg.append('line').attr('x1', m.l).attr('x2', W2 - m.r).attr('y1', y(v)).attr('y2', y(v)).style('stroke', col).style('stroke-dasharray', '5 3'); svg.append('text').attr('x', W2 - m.r - 4).attr('y', y(v) - 3).attr('text-anchor', 'end').style('fill', col).style('font-size', '10px').text(t + ' ' + N(v, 1) + '%'); });
    const g = svg.append('g').selectAll('g').data(d).join('g').attr('transform', (r) => `translate(${x(r.pb)},${y(r.dy)})`);
    g.append('circle').attr('r', 5).style('fill', '#ffa028').style('opacity', 0.85).append('title').text((r) => `${r.sym} · ${r.name}\nP/B ${N(r.pb, 2)} · yield ${N(r.dy, 2)}%`);
    g.append('text').attr('x', 7).attr('y', 3).style('fill', '#ccc').style('font-size', '9.5px').text((r) => r.sym);
    svg.append('text').attr('x', W2 - m.r).attr('y', H - m.b - 6).attr('text-anchor', 'end').style('fill', '#777').style('font-size', '10px').text('→ price / book');
  });
  dash.draw('pm-realbars', (el) => { const d = rows('pm3').filter((r) => isN(r.ytd)).sort((a, b) => b.ytd - a.ytd); TT.hbars(el, d.map((r) => ({ label: r.name, v: r.ytd, color: r.where === 'Real estate' ? '#3cc8f0' : r.where === 'Infrastructure' ? '#2ee66b' : '#c86bff' })), { lw: 210 }); });

  // Housing
  const hl = (name, specs, o) => dash.draw(name, (el) => { const s = rows('pm_hs'); if (!s.length) return; TT.chart(el, specs.map(([lbl, k, color, w, d2]) => ({ name: lbl, color, width: w || 1.8, dash: d2, values: s.filter((r) => isN(r[k])).map((r) => ({ x: D(r.date), y: r[k] })) })).filter((x) => x.values.length), Object.assign({ height: 220 }, o || {})); });
  hl('pm-hs', [['Home sales, seasonally adjusted', 'sa', '#ffd23c', 2.4], ['Home sales, raw', 'total', '#888', 1.2, true]], { yFmt: (v) => N(v / 1000, 0) + 'k', tipFmt: (v) => N(v, 0) });
  hl('pm-hshare', [['Mortgaged share of sales', 'mort_share', '#3cc8f0', 2], ['First-hand (new) share', 'first_share', '#2ee66b', 2]], { height: 190, yFmt: (v) => N(v, 0) + '%', tipFmt: (v) => N(v, 1) + '%' });
  hl('pm-kfe', [['House prices, Türkiye y/y', 'kfe_yoy', '#ffa028', 2], ['İstanbul y/y', 'kfe_ist_yoy', '#c86bff', 1.6], ['Türkiye, real y/y', 'kfe_real', '#2ee66b', 2]], { height: 190, yFmt: (v) => N(v, 0) + '%', tipFmt: (v) => N(v, 1) + '%', refs: [{ y: 0, label: '0' }] });
  dash.draw('pm-hstab', (tb) => {
    tb.replaceChildren(); const s = rows('pm_hs'); if (!s.length) return; const a = s[s.length - 1], y = s[s.length - 13];
    [['Total home sales', 'total'], ['Seasonally adjusted', 'sa'], ['Mortgaged sales', 'mortgage'], ['First-hand sales', 'first'], ['İstanbul', 'ist'], ['Ankara', 'ank'], ['İzmir', 'izm']].forEach(([n, k]) => { const tr = tb.insertRow(); cell(tr, n, 'hi'); cell(tr, N(a[k], 0), 'r yl'); cell(tr, y ? N(y[k], 0) : '—', 'r mu'); const ch = y && isN(y[k]) && y[k] ? (a[k] / y[k] - 1) * 100 : null; tone(cell(tr, PC(ch), 'r'), ch); });
    const tr = tb.insertRow(); cell(tr, '12-month total', 'hi'); cell(tr, N(a.sum12, 0), 'r yl'); cell(tr, y ? N(y.sum12, 0) : '—', 'r mu'); const ch = y && y.sum12 ? (a.sum12 / y.sum12 - 1) * 100 : null; tone(cell(tr, PC(ch), 'r'), ch);
    const h = tb.closest('table').querySelector('thead tr'); if (h) { h.children[1].textContent = TT.mShort(D(a.date)) + ' ' + a.date.slice(0, 4); if (y) h.children[2].textContent = TT.mShort(D(y.date)) + ' ' + y.date.slice(0, 4); }
  });
})();
