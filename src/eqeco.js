// Equities (world indices, BIST 30 map, BIST sectors) and Economics (Türkiye macro: scorecard, inflation, growth, activity, external & fiscal).
(function () {
  const P = window.TTparse;
  const isN = (v) => typeof v === 'number' && isFinite(v);
  const R2 = (v) => isN(v) ? Math.round(v * 100) / 100 : null;
  const pct = (a, b) => isN(a) && isN(b) && b ? R2((a / b - 1) * 100) : null;
  const WG = ['1', '2', '3'], WW = ['1w', '1m', 'ytd', '1y'], BW = ['1w', '1m', 'ytd'];
  ['wiq1', 'wiq2', 'wiq3', 'b30q1', 'b30q2', 'b30q3', 'bsq1', 'bsq2']
    .concat(WG.flatMap((g) => WW.map((w) => `wir${g}_${w}`)), WG.flatMap((g) => BW.map((w) => `b30r${g}_${w}`)), ['1', '2'].flatMap((g) => BW.map((w) => `bsa${g}_${w}`)))
    .forEach((id) => dash.loader(id, { description: '', fn: P.tsv }));
  ['eco_cpi', 'eco_act', 'eco_gdp', 'eco_ext'].forEach((id) => dash.loader(id, { description: '', fn: P.md() }));

  // ---- World equity indices ----
  const WI = { '^GSPC': ['S&P 500', 'United States'], '^IXIC': ['Nasdaq Composite', 'United States'], '^DJI': ['Dow Jones Industrials', 'United States'], '^RUT': ['Russell 2000', 'United States'], '^GSPTSE': ['S&P/TSX Composite', 'Canada'], '^BVSP': ['Ibovespa', 'Brazil'], '^MXX': ['S&P/BMV IPC', 'Mexico'],
    'XU100.IS': ['BIST 100', 'Türkiye'], '^STOXX50E': ['Euro Stoxx 50', 'Euro area'], '^GDAXI': ['DAX', 'Germany'], '^FTSE': ['FTSE 100', 'United Kingdom'], '^FCHI': ['CAC 40', 'France'], '^IBEX': ['IBEX 35', 'Spain'], 'FTSEMIB.MI': ['FTSE MIB', 'Italy'], '^AEX': ['AEX', 'Netherlands'], '^SSMI': ['SMI', 'Switzerland'],
    '^N225': ['Nikkei 225', 'Japan'], '^HSI': ['Hang Seng', 'Hong Kong'], '000001.SS': ['Shanghai Composite', 'China'], '^KS11': ['KOSPI', 'South Korea'], '^TWII': ['TAIEX', 'Taiwan'], '^BSESN': ['Sensex', 'India'], '^AXJO': ['S&P/ASX 200', 'Australia'], '^JKSE': ['Jakarta Composite', 'Indonesia'] };
  dash.calc('wi_tbl', { inputs: ['wiq1', 'wiq2', 'wiq3'].concat(WG.flatMap((g) => WW.map((w) => `wir${g}_${w}`))), title: 'wi_tbl', fn: (...a) => {
    const out = [];
    WG.forEach((g, gi) => (a[gi] || []).forEach((q) => {
      if (!isN(q.current_price)) return;
      const meta = WI[q.symbol] || [q.name, ''];
      const region = q.symbol === 'XU100.IS' ? 'Europe, Middle East & Africa' : ['Americas', 'Europe, Middle East & Africa', 'Asia-Pacific'][gi];
      const o = { sym: q.symbol, name: meta[0], country: meta[1], region, ccy: q.currency, px: q.current_price, hi: isN(q.week_52_high) && q.week_52_high > 0 ? q.week_52_high : null, lo: isN(q.week_52_low) && q.week_52_low > 0 ? q.week_52_low : null };
      WW.forEach((w, wi) => { const r = (a[3 + gi * 4 + wi] || []).find((x) => x.asset === q.symbol); o[w] = r ? pct(q.current_price, r.start_price) : null; o[w + '_start'] = r ? r.start_date : null; });
      o.from_hi = o.hi && o.lo ? pct(o.px, o.hi) : null;
      out.push(o);
    }));
    const RO = ['Americas', 'Europe, Middle East & Africa', 'Asia-Pacific'];
    return out.sort((x, y) => RO.indexOf(x.region) - RO.indexOf(y.region));
  } });

  // ---- BIST 30 ----
  const SEC = { AKBNK: 'Banks', GARAN: 'Banks', ISCTR: 'Banks', YKBNK: 'Banks', VAKBN: 'Banks', KCHOL: 'Holdings', SAHOL: 'Holdings', ASELS: 'Defence & tech', ASTOR: 'Energy & utilities', TUPRS: 'Energy & utilities', PETKM: 'Chemicals', SASA: 'Chemicals', GUBRF: 'Chemicals',
    BIMAS: 'Retail & food', MGROS: 'Retail & food', AEFES: 'Retail & food', EKGYO: 'Real estate & construction', ENKAI: 'Real estate & construction', EREGL: 'Metals & mining', KRDMD: 'Metals & mining', TRMET: 'Metals & mining', TRALT: 'Metals & mining',
    FROTO: 'Autos', TOASO: 'Autos', SISE: 'Industrials', THYAO: 'Transport', PGSUS: 'Transport', TAVHL: 'Transport', TCELL: 'Telecoms', TTKOM: 'Telecoms' };
  dash.calc('b30', { inputs: ['b30q1', 'b30q2', 'b30q3'].concat(WG.flatMap((g) => BW.map((w) => `b30r${g}_${w}`))), title: 'b30', fn: (...a) => {
    const q = [].concat(a[0] || [], a[1] || [], a[2] || []).filter((r) => isN(r.current_price));
    const tot = d3.sum(q, (r) => r.market_cap || 0);
    return q.map((r) => {
      const o = { sym: r.symbol, sector: SEC[r.symbol] || 'Other', px: r.current_price, mcap: r.market_cap, w: tot && r.market_cap ? R2(r.market_cap / tot * 100) : null, pe: isN(r.pe_ratio) ? r.pe_ratio : null, pb: isN(r.pb_ratio) ? r.pb_ratio : null, dy: isN(r.dividend_yield) ? r.dividend_yield : null, hi: r.week_52_high, lo: r.week_52_low, vol: r.volume };
      WG.forEach((g, gi) => BW.forEach((w, wi) => { const x = (a[3 + gi * 3 + wi] || []).find((z) => z.asset === r.symbol); if (x) o[w] = isN(x.return_try) ? R2(x.return_try * 100) : pct(x.end_price, x.start_price); }));
      o.from_hi = isN(r.week_52_high) ? pct(r.current_price, r.week_52_high) : null;
      return o;
    }).sort((x, y) => (y.mcap || 0) - (x.mcap || 0));
  } });
  dash.calc('b30_sec', { inputs: ['b30'], title: 'b30_sec', fn: (b) => {
    const g = d3.group(b || [], (r) => r.sector);
    return Array.from(g, ([s, rs]) => { const cap = d3.sum(rs, (r) => r.mcap || 0); const wavg = (k) => { const v = rs.filter((r) => isN(r[k]) && r.mcap); return v.length ? R2(d3.sum(v, (r) => r[k] * r.mcap) / d3.sum(v, (r) => r.mcap)) : null; }; return { sector: s, n: rs.length, mcap: cap, '1w': wavg('1w'), '1m': wavg('1m'), ytd: wavg('ytd'), pe_med: R2(d3.median(rs.filter((r) => isN(r.pe) && r.pe > 0), (r) => r.pe)), pb_med: R2(d3.median(rs.filter((r) => isN(r.pb)), (r) => r.pb)) }; }).sort((x, y) => y.mcap - x.mcap);
  } });

  // ---- BIST sector indices ----
  const BS = { XBANK: 'Banks', XUSIN: 'Industrials', XHOLD: 'Holdings & investment', XELKT: 'Electricity', XGMYO: 'Real estate inv. trusts', XULAS: 'Transport', XKMYA: 'Chemicals & petroleum', XMANA: 'Basic metals', XUTEK: 'Technology', XGIDA: 'Food & beverage',
    XINSA: 'Construction', XTRZM: 'Tourism', XSGRT: 'Insurance', XILTM: 'Telecoms', XTEKS: 'Textiles & leather', XMESY: 'Metal products & machinery', XTAST: 'Stone & soil (cement)', XUMAL: 'Financials', XKAGT: 'Paper & printing', XFINK: 'Leasing & factoring' };
  const HIDE = { XFINK: 1 }; // source history shows a structural break (52W high ≈ 14× the current level)
  dash.calc('bsec', { inputs: ['bsq1', 'bsq2'].concat(['1', '2'].flatMap((g) => BW.map((w) => `bsa${g}_${w}`)), ['wi_tbl']), title: 'bsec', fn: (q1, q2, ...rest) => {
    const wi = rest[6] || []; const xu = wi.find((r) => r.sym === 'XU100.IS') || {};
    const out = [];
    [q1, q2].forEach((q, gi) => (q || []).forEach((r) => {
      if (!isN(r.current_price) || HIDE[r.symbol]) return;
      const o = { sym: r.symbol, name: BS[r.symbol] || r.symbol, px: r.current_price, hi: r.week_52_high, lo: r.week_52_low };
      BW.forEach((w, wi2) => { const a = (rest[gi * 3 + wi2] || []).find((z) => z.symbol === r.symbol); const d = a && Array.isArray(a.data) ? a.data.filter((x) => isN(x.close)) : []; o[w] = d.length ? pct(r.current_price, d[d.length - 1].close) : null; o['rel_' + w] = isN(o[w]) && isN(xu[w]) ? R2(((1 + o[w] / 100) / (1 + xu[w] / 100) - 1) * 100) : null; });
      o.from_hi = isN(r.week_52_high) ? pct(r.current_price, r.week_52_high) : null;
      out.push(o);
    }));
    return out;
  } });

  // ---- Türkiye macro ----
  const ser = (rows, k) => (rows || []).filter((r) => isN(r[k])).map((r) => ({ d: qdate(r.tarih), v: r[k] })).sort((a, b) => a.d - b.d);
  const qdate = (t) => { const s = String(t); const q = /(\d{4})-Q(\d)/.exec(s); return q ? new Date(Date.UTC(+q[1], (+q[2] - 1) * 3, 1)) : TT.parseD(s.slice(0, 10)); };
  const yoy = (s, lag) => s.map((p, i) => i >= lag ? { d: p.d, v: R2((p.v / s[i - lag].v - 1) * 100) } : null).filter(Boolean);
  const roll = (s, n) => s.map((p, i) => i >= n - 1 ? { d: p.d, v: d3.sum(s.slice(i - n + 1, i + 1), (x) => x.v) } : null).filter(Boolean);
  window.ECOH = { ser, yoy, roll };
  const CPIK = { headline: 'TUKFIY2025_GENEL', coreB: 'FE25_OKTG03', coreC: 'FE25_OKTG04', energy: 'FE25_OKTG09', food: 'FE25_OKTG10', goods: 'FE25_OKTG18', services: 'FE25_OKTG23', rent: 'FE25_OKTG24', ppi: 'TUFE1YI_T1', house: 'KFE_TR' };
  dash.calc('e_cpi', { inputs: ['eco_cpi'], title: 'e_cpi', fn: (rows) => {
    const S = {}; Object.entries(CPIK).forEach(([k, c]) => { S[k] = ser(rows, c); });
    const Y = {}; Object.keys(S).forEach((k) => { Y[k] = yoy(S[k], 12); });
    const dates = Y.headline.map((p) => +p.d);
    return dates.map((d) => {
      const o = { date: new Date(d).toISOString().slice(0, 10) };
      Object.keys(Y).forEach((k) => { const p = Y[k].find((x) => +x.d === d); o[k] = p ? p.v : null; });
      const i = S.headline.findIndex((x) => +x.d === d); o.mom = i > 0 ? R2((S.headline[i].v / S.headline[i - 1].v - 1) * 100) : null;
      const j = S.coreC.findIndex((x) => +x.d === d); o.mom_c = j > 0 ? R2((S.coreC[j].v / S.coreC[j - 1].v - 1) * 100) : null;
      o.house_real = isN(o.house) && isN(o.headline) ? R2(((1 + o.house / 100) / (1 + o.headline / 100) - 1) * 100) : null;
      // 3-month annualised headline momentum
      o.saar3 = i >= 3 ? R2((Math.pow(S.headline[i].v / S.headline[i - 3].v, 4) - 1) * 100) : null;
      return o;
    });
  } });
  dash.calc('e_act', { inputs: ['eco_act'], title: 'e_act', fn: (rows) => {
    const ip = ser(rows, 'TSANAYMT2021_BCD'), mf = ser(rows, 'TSANAYMT2021_C'), ipy = yoy(ip, 12), mfy = yoy(mf, 12);
    return (rows || []).map((r) => { const d = qdate(r.tarih); const f = (s) => { const p = s.find((x) => +x.d === +d); return p ? p.v : null; }; const i = ip.findIndex((x) => +x.d === +d);
      return { date: d.toISOString().slice(0, 10), ip: r.TSANAYMT2021_BCD, ip_yoy: f(ipy), mf_yoy: f(mfy), ip_mom: i > 0 ? R2((ip[i].v / ip[i - 1].v - 1) * 100) : null, kko: r.KKO_MA, rkge: r.GY1_N2, tge: r.TG2_Y01, unemp: r.TIG08, lfpr: r.TIG06, emp: r.TIG07 }; }).sort((a, b) => a.date < b.date ? -1 : 1);
  } });
  dash.calc('e_gdp', { inputs: ['eco_gdp'], title: 'e_gdp', fn: (rows) => {
    const K = { gdp: 'GSYIH60_HY_B1GQ', cons: 'GSYIH60_HY_P311', gov: 'GSYIH60_HY_P32', inv: 'GSYIH60_HY_P51G', exp: 'GSYIH60_HY_P6', imp: 'GSYIH60_HY_P7' };
    const S = {}; Object.entries(K).forEach(([k, c]) => { S[k] = ser(rows, c); });
    return S.gdp.map((p, i) => { const o = { date: p.d.toISOString().slice(0, 10), q: p.d.getUTCFullYear() + ' Q' + (Math.floor(p.d.getUTCMonth() / 3) + 1) };
      Object.keys(S).forEach((k) => { const s = S[k]; const j = s.findIndex((x) => +x.d === +p.d); o[k + '_qq'] = j > 0 ? R2((s[j].v / s[j - 1].v - 1) * 100) : null; o[k + '_yy'] = j >= 4 ? R2((s[j].v / s[j - 4].v - 1) * 100) : null; });
      o.gdp_saar = isN(o.gdp_qq) ? R2((Math.pow(1 + o.gdp_qq / 100, 4) - 1) * 100) : null; return o; });
  } });
  dash.calc('e_ext', { inputs: ['eco_ext'], title: 'e_ext', fn: (rows) => {
    const K = { ca: 'HARICCARIACIK_K1', gold: 'HARICCARIACIK_K4', energy: 'HARICCARIACIK_K7', ca_xg: 'HARICCARIACIK_K8', core: 'HARICCARIACIK_K10', rev: 'KB_GEN01', exp: 'KB_GEN12', int: 'KB_GEN17', prim: 'KB_GEN34', bal: 'KB_GEN35' };
    const S = {}, RL = {}; Object.entries(K).forEach(([k, c]) => { S[k] = ser(rows, c); RL[k] = roll(S[k], 12); });
    const dates = Array.from(new Set([].concat(...Object.values(S)).map((p) => +p.d))).sort((a, b) => a - b);
    return dates.map((d) => { const o = { date: new Date(d).toISOString().slice(0, 10) };
      Object.keys(K).forEach((k) => { const m = S[k].find((x) => +x.d === d), r = RL[k].find((x) => +x.d === d); o[k] = m ? m.v : null; o[k + '_12m'] = r ? r.v : null; });
      // 12m revenue / expenditure growth vs the previous 12 months
      ['rev', 'exp'].forEach((k) => { const i = RL[k].findIndex((x) => +x.d === d); o[k + '_g'] = i >= 12 ? R2((RL[k][i].v / RL[k][i - 12].v - 1) * 100) : null; });
      return o; });
  } });
  dash.calc('e_score', { inputs: ['e_cpi', 'e_act', 'e_gdp', 'e_ext', 'ggdp2', 'makro_ozet'], title: 'e_score', fn: (cpi, act, gdp, ext, g2, mk) => {
    const last = (rs, k) => { const v = (rs || []).filter((r) => isN(r[k])); return v.length ? v[v.length - 1] : null; };
    const prev = (rs, k, n) => { const v = (rs || []).filter((r) => isN(r[k])); return v.length > n ? v[v.length - 1 - n] : null; };
    const spark = (rs, k, n) => (rs || []).filter((r) => isN(r[k])).slice(-(n || 24)).map((r) => r[k]);
    const gdpUsd = (() => { const v = (g2 || []).filter((r) => isN(r.IMFGDPUSDN_TUR)).sort((a, b) => a.tarih < b.tarih ? -1 : 1); return v.length ? v[v.length - 1].IMFGDPUSDN_TUR : null; })();
    const L = []; const add = (group, name, rs, k, unit, opts) => { const a = last(rs, k); if (!a) return; const b = prev(rs, k, (opts && opts.lag) || 1), c = prev(rs, k, (opts && opts.yago) || 12); L.push({ group, name, unit, value: opts && opts.f ? opts.f(a[k]) : a[k], prev: b ? (opts && opts.f ? opts.f(b[k]) : b[k]) : null, yago: c ? (opts && opts.f ? opts.f(c[k]) : c[k]) : null, period: a.q || a.date, good: (opts && opts.good) || 0, spark: spark(rs, k, opts && opts.n).map((v) => opts && opts.f ? opts.f(v) : v) }); };
    add('Prices', 'CPI inflation, y/y', cpi, 'headline', '%', { good: -1 });
    add('Prices', 'CPI, m/m', cpi, 'mom', '%', { good: -1 });
    add('Prices', 'Core C, y/y', cpi, 'coreC', '%', { good: -1 });
    add('Prices', 'Services, y/y', cpi, 'services', '%', { good: -1 });
    add('Prices', 'Producer prices (D-PPI), y/y', cpi, 'ppi', '%', { good: -1 });
    add('Prices', 'House prices, real y/y', cpi, 'house_real', '%');
    add('Growth', 'GDP, q/q s.a.', gdp, 'gdp_qq', '%', { good: 1, yago: 4, n: 12 });
    add('Growth', 'GDP, y/y', gdp, 'gdp_yy', '%', { good: 1, yago: 4, n: 12 });
    add('Activity', 'Industrial production, y/y (s.a.)', act, 'ip_yoy', '%', { good: 1 });
    add('Activity', 'Capacity utilisation (s.a.)', act, 'kko', '%', { good: 1 });
    add('Activity', 'Real sector confidence (s.a.)', act, 'rkge', 'idx', { good: 1 });
    add('Activity', 'Consumer confidence', act, 'tge', 'idx', { good: 1 });
    add('Labour', 'Unemployment rate (s.a.)', act, 'unemp', '%', { good: -1 });
    add('Labour', 'Labour force participation (s.a.)', act, 'lfpr', '%', { good: 1 });
    add('External', 'Current account, 12m sum ($bn)', ext, 'ca_12m', '$bn', { good: 1, f: (v) => R2(v / 1000) });
    add('External', 'Current account ex gold & energy, 12m ($bn)', ext, 'core_12m', '$bn', { good: 1, f: (v) => R2(v / 1000) });
    if (gdpUsd) { const a = last(ext, 'ca_12m'); if (a) L.push({ group: 'External', name: 'Current account, % of GDP (12m)', unit: '%', value: R2(a.ca_12m / 1000 / gdpUsd * 100), prev: null, yago: null, period: a.date, good: 1, spark: [] }); }
    add('Fiscal', 'Budget balance, 12m sum (TRY bn)', ext, 'bal_12m', 'bn', { good: 1, f: (v) => R2(v / 1e6) });
    add('Fiscal', 'Primary balance, 12m sum (TRY bn)', ext, 'prim_12m', 'bn', { good: 1, f: (v) => R2(v / 1e6) });
    add('Fiscal', 'Interest spending, 12m sum (TRY bn)', ext, 'int_12m', 'bn', { good: -1, f: (v) => R2(v / 1e6) });
    const m = (mk || [])[0] || {};
    if (isN(m.tufe_12a)) L.push({ group: 'Expectations', name: 'CPI expected in 12 months (market participants)', unit: '%', value: m.tufe_12a, prev: null, yago: null, period: null, good: -1, spark: [] });
    return L;
  } });
})();

(function () {
  const L = d3.formatLocale({ decimal: '.', thousands: ',', grouping: [3], currency: ['', ''] });
  const N = (v, d) => v == null || isNaN(v) ? '—' : L.format(',.' + (d == null ? 2 : d) + 'f')(v);
  const sgn = (v) => v > 0 ? '+' : v < 0 ? '−' : '';
  const PC = (v, d) => v == null || isNaN(v) ? '—' : (Math.abs(v) < 0.005 ? '0.0' : sgn(v) + N(Math.abs(v), d == null ? 1 : d)) + '%';
  const isN = (v) => typeof v === 'number' && isFinite(v);
  const rows = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : []; };
  const tone = (el, v) => { el.classList.toggle('up', isN(v) && v > 0.004); el.classList.toggle('dn', isN(v) && v < -0.004); };
  const cell = (tr, text, cls) => { const td = tr.insertCell(); td.textContent = text; if (cls) td.className = cls; return td; };
  const heat = (v, s) => v == null ? '' : v > 0 ? `rgba(46,230,107,${Math.min(0.7, Math.abs(v) / (s || 10))})` : `rgba(255,69,69,${Math.min(0.7, Math.abs(v) / (s || 10))})`;
  const seg = (attr, init, cb) => { let v = init; document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest(`[${attr}]`); if (!b) return; v = b.getAttribute(attr); document.querySelectorAll(`[${attr}]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); TT.anim = true; cb(); TT.anim = false; }); return () => v; };
  const rangeBar = (td, lo, hi, v) => { if (!isN(lo) || !isN(hi) || hi <= lo) { td.textContent = '—'; return; } const w = 70; const x = d3.scaleLinear().domain([lo, hi]).range([3, w - 3]).clamp(true); const s = d3.select(td).append('svg').attr('width', w).attr('height', 12).attr('aria-hidden', 'true'); s.append('line').attr('x1', 3).attr('x2', w - 3).attr('y1', 6).attr('y2', 6).style('stroke', '#3a3a3a').style('stroke-width', 2); s.append('circle').attr('cx', x(v)).attr('cy', 6).attr('r', 3.5).style('fill', '#3cc8f0'); };
  const spark = (td, s, color) => { s = (s || []).filter(isN); if (s.length < 2) return; const w = 70, h = 16; const x = d3.scaleLinear().domain([0, s.length - 1]).range([1, w - 1]); const e = d3.extent(s); const y = d3.scaleLinear().domain(e[0] === e[1] ? [e[0] - 1, e[0] + 1] : e).range([h - 2, 2]); d3.select(td).append('svg').attr('width', w).attr('height', h).attr('aria-hidden', 'true').append('path').attr('d', d3.line().x((v, i) => x(i)).y((v) => y(v))(s)).style('fill', 'none').style('stroke', color || '#ffa028').style('stroke-width', 1.3); };
  const kv = (name, fn) => dash.draw(name, (el) => { const r = fn(); el.textContent = r && r.text != null ? r.text : '—'; if (r && 'tone' in r) tone(el, r.tone); });
  const grpRow = (tb, text, span) => { const tr = tb.insertRow(); const td = cell(tr, text.toUpperCase(), 'am'); td.colSpan = span; td.style.fontSize = '10px'; td.style.paddingTop = '6px'; };
  const D = (s) => TT.parseD(s);

  // ===== Equities =====
  const W = (s) => rows('wi_tbl').find((r) => r.sym === s);
  [['spx', '^GSPC'], ['sx5e', '^STOXX50E'], ['nky', '^N225'], ['xu100', 'XU100.IS']].forEach(([k, s]) => {
    kv('eq-k-' + k, () => { const r = W(s); return r && { text: N(r.px, 0) }; });
    kv('eq-k-' + k + '-c', () => { const r = W(s); return r && { text: PC(r['1m']) + ' 1M · ' + PC(r.ytd) + ' YTD', tone: r['1m'] }; });
  });
  kv('eq-k-b30', () => { const b = rows('b30'); return b.length && { text: N(d3.sum(b, (r) => r.mcap || 0) / 1e12, 2) + 'tn' }; });
  kv('eq-k-b30-c', () => { const b = rows('b30').filter((r) => isN(r.pe) && r.pe > 0); return b.length && { text: 'TRY mkt cap · median P/E ' + N(d3.median(b, (r) => r.pe), 1) }; });
  kv('eq-k-br', () => { const b = rows('b30').filter((r) => isN(r['1w'])); return b.length && { text: b.filter((r) => r['1w'] > 0).length + ' / ' + b.length }; });
  kv('eq-k-br-c', () => { const b = rows('b30').filter((r) => isN(r['1m'])); return b.length && { text: 'up 1W · ' + b.filter((r) => r['1m'] > 0).length + ' up 1M' }; });

  // WEI
  const weiPer = seg('data-weip', 'ytd', () => dash.draw('wei-bars'));
  dash.draw('wei-table', (tb) => {
    tb.replaceChildren(); let g = null;
    rows('wi_tbl').forEach((r) => {
      if (r.region !== g) { g = r.region; grpRow(tb, g, 11); }
      const tr = tb.insertRow(); tr.title = r.sym; cell(tr, r.name, 'hi' + (r.sym === 'XU100.IS' ? ' yl' : '')); cell(tr, r.country, 'mu'); cell(tr, N(r.px, r.px < 2000 ? 2 : 0), 'r'); cell(tr, r.ccy, 'mu');
      [['1w', 5], ['1m', 10], ['ytd', 30], ['1y', 40]].forEach(([k, s]) => { const td = cell(tr, PC(r[k]), 'r'); td.style.background = heat(r[k], s); });
      rangeBar(tr.insertCell(), r.lo, r.hi, r.px); tone(cell(tr, PC(r.from_hi), 'r'), r.from_hi);
    });
  });
  dash.draw('wei-bars', (el) => { const k = weiPer(); TT.hbars(el, rows('wi_tbl').filter((r) => isN(r[k])).sort((a, b) => b[k] - a[k]).map((r) => ({ label: r.name + ' · ' + r.country, v: r[k], hl: r.sym === 'XU100.IS' })), { lw: 270 }); });

  // IMAP: BIST 30 treemap
  const imPer = seg('data-imp', '1m', () => { dash.draw('im-map'); dash.draw('im-sec'); });
  dash.draw('im-map', (el) => {
    d3.select(el).selectAll('*').remove();
    const k = imPer(), b = rows('b30').filter((r) => isN(r.mcap) && r.mcap > 0); if (!b.length) return;
    const W2 = Math.max(320, el.clientWidth), H = 420;
    const root = d3.hierarchy({ children: Array.from(d3.group(b, (r) => r.sector), ([s, c]) => ({ name: s, children: c })) }).sum((d) => d.mcap || 0).sort((a, c) => c.value - a.value);
    d3.treemap().size([W2, H]).paddingTop(14).paddingInner(2).paddingOuter(1).round(true)(root);
    const svg = d3.select(el).append('svg').attr('width', W2).attr('height', H).attr('role', 'img').attr('aria-label', 'BIST 30 market map');
    const an = TT.anim && TT.motion();
    const sec = svg.selectAll('g.sec').data(root.children).join('g');
    sec.append('rect').attr('x', (d) => d.x0).attr('y', (d) => d.y0).attr('width', (d) => d.x1 - d.x0).attr('height', (d) => d.y1 - d.y0).style('fill', '#111').style('stroke', '#333');
    sec.append('text').attr('x', (d) => d.x0 + 4).attr('y', (d) => d.y0 + 10).style('fill', '#ffa028').style('font-size', '9.5px').style('font-weight', 700).text((d) => (d.x1 - d.x0) > 50 ? d.data.name.toUpperCase() : '');
    const lf = svg.selectAll('g.lf').data(root.leaves()).join('g').attr('transform', (d) => `translate(${d.x0},${d.y0})`);
    lf.append('rect').attr('width', (d) => Math.max(0, d.x1 - d.x0)).attr('height', (d) => Math.max(0, d.y1 - d.y0)).style('fill', (d) => { const v = d.data[k]; return v == null ? '#222' : v >= 0 ? d3.interpolateRgb('#123d22', '#1fd760')(Math.min(1, v / (k === '1w' ? 8 : k === '1m' ? 15 : 50))) : d3.interpolateRgb('#3d1212', '#ff3b3b')(Math.min(1, -v / (k === '1w' ? 8 : k === '1m' ? 15 : 50))); })
      .style('opacity', an ? 0 : 1).transition().duration(an ? 500 : 0).delay((d, i) => an ? i * 15 : 0).style('opacity', 1);
    lf.append('title').text((d) => `${d.data.sym} · ${d.data.sector}\n${N(d.data.px, 2)} TRY · ${PC(d.data[k])}\nMkt cap ${N(d.data.mcap / 1e9, 0)}bn TRY · weight ${N(d.data.w, 1)}%`);
    lf.append('text').attr('x', 4).attr('y', 14).style('fill', '#fff').style('font-size', (d) => (d.x1 - d.x0) > 70 ? '12px' : '10px').style('font-weight', 700).text((d) => (d.x1 - d.x0) > 30 && (d.y1 - d.y0) > 16 ? d.data.sym : '');
    lf.append('text').attr('x', 4).attr('y', 27).style('fill', '#eee').style('font-size', '10px').text((d) => (d.x1 - d.x0) > 40 && (d.y1 - d.y0) > 30 ? PC(d.data[k]) : '');
  });
  dash.draw('im-table', (tb) => {
    tb.replaceChildren();
    rows('b30').forEach((r) => { const tr = tb.insertRow(); cell(tr, r.sym, 'yl'); cell(tr, r.sector, 'mu'); cell(tr, N(r.px, 2), 'r');
      [['1w', 6], ['1m', 12], ['ytd', 40]].forEach(([k, s]) => { const td = cell(tr, PC(r[k]), 'r'); td.style.background = heat(r[k], s); });
      cell(tr, r.pe == null ? '—' : N(r.pe, 1), 'r'); cell(tr, r.pb == null ? '—' : N(r.pb, 1), 'r'); cell(tr, r.dy == null ? '—' : N(r.dy, 1) + '%', 'r'); cell(tr, N(r.mcap / 1e9, 0), 'r'); cell(tr, N(r.w, 1) + '%', 'r mu'); rangeBar(tr.insertCell(), r.lo, r.hi, r.px); tone(cell(tr, PC(r.from_hi), 'r'), r.from_hi); });
  });
  dash.draw('im-sec', (el) => { const k = imPer(); TT.hbars(el, rows('b30_sec').filter((r) => isN(r[k])).sort((a, b) => b[k] - a[k]).map((r) => ({ label: r.sector + ' (' + r.n + ')', v: r[k] })), { lw: 190 }); });
  dash.draw('im-val', (el) => {
    d3.select(el).selectAll('*').remove();
    const d = rows('b30').filter((r) => isN(r.pe) && r.pe > 0 && r.pe < 60 && isN(r.pb)); if (!d.length) return;
    const W2 = Math.max(300, el.clientWidth), H = 300, m = { t: 14, r: 16, b: 30, l: 40 };
    const x = d3.scaleLinear().domain([0, d3.max(d, (r) => r.pb) * 1.1]).nice().range([m.l, W2 - m.r]), y = d3.scaleLinear().domain([0, d3.max(d, (r) => r.pe) * 1.1]).nice().range([H - m.b, m.t]);
    const rr = d3.scaleSqrt().domain([0, d3.max(d, (r) => r.mcap)]).range([3, 16]);
    const svg = d3.select(el).append('svg').attr('width', W2).attr('height', H).attr('role', 'img').attr('aria-label', 'P/E vs P/B');
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(W2 - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((v) => v + 'x'));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(8).tickFormat((v) => v + 'x'));
    svg.append('text').attr('x', W2 - m.r).attr('y', H - m.b - 6).attr('text-anchor', 'end').style('fill', '#777').style('font-size', '10px').text('→ price / book');
    svg.append('text').attr('x', m.l + 4).attr('y', m.t + 8).style('fill', '#777').style('font-size', '10px').text('↑ price / earnings');
    const COL = d3.scaleOrdinal().domain(Array.from(new Set(d.map((r) => r.sector)))).range(['#3cc8f0', '#ffa028', '#2ee66b', '#c86bff', '#ffd23c', '#ff6b6b', '#7fd4ff', '#ff9a5c', '#9be37a', '#e08cff', '#f5e663', '#62e0c8', '#d0d0d0']);
    const g = svg.append('g').selectAll('g').data(d).join('g').attr('transform', (r) => `translate(${x(r.pb)},${y(r.pe)})`);
    g.append('circle').attr('r', (r) => rr(r.mcap)).style('fill', (r) => COL(r.sector)).style('opacity', 0.55).style('stroke', (r) => COL(r.sector)).append('title').text((r) => `${r.sym} · ${r.sector}\nP/E ${N(r.pe, 1)} · P/B ${N(r.pb, 1)}`);
    g.append('text').attr('x', (r) => rr(r.mcap) + 2).attr('y', 3).style('fill', '#ccc').style('font-size', '9px').text((r) => r.sym);
  });

  // BSEC
  const bsPer = seg('data-bsp', '1m', () => dash.draw('bs-bars'));
  dash.draw('bs-bars', (el) => { const k = bsPer(); const xu = (W('XU100.IS') || {})[k]; TT.hbars(el, rows('bsec').filter((r) => isN(r[k])).sort((a, b) => b[k] - a[k]).map((r) => ({ label: r.sym + ' · ' + r.name, v: r[k] })), { lw: 230, refs: [{ v: xu, label: 'BIST 100', color: '#ffd23c' }] }); });
  dash.draw('bs-table', (tb) => {
    tb.replaceChildren(); const xu = W('XU100.IS');
    if (xu) { const tr = tb.insertRow(); cell(tr, 'XU100', 'yl'); cell(tr, 'BIST 100 (benchmark)', 'hi'); cell(tr, N(xu.px, 0), 'r'); ['1w', '1m', 'ytd'].forEach((k) => tone(cell(tr, PC(xu[k]), 'r'), xu[k])); ['1w', '1m', 'ytd'].forEach(() => cell(tr, '—', 'r mu')); rangeBar(tr.insertCell(), xu.lo, xu.hi, xu.px); tone(cell(tr, PC(xu.from_hi), 'r'), xu.from_hi); }
    rows('bsec').slice().sort((a, b) => (b.rel_ytd || -999) - (a.rel_ytd || -999)).forEach((r) => { const tr = tb.insertRow(); cell(tr, r.sym, 'yl'); cell(tr, r.name, 'hi'); cell(tr, N(r.px, r.px < 3000 ? 2 : 0), 'r');
      ['1w', '1m', 'ytd'].forEach((k) => tone(cell(tr, PC(r[k]), 'r'), r[k]));
      [['rel_1w', 4], ['rel_1m', 8], ['rel_ytd', 25]].forEach(([k, s]) => { const td = cell(tr, PC(r[k]), 'r'); td.style.background = heat(r[k], s); });
      rangeBar(tr.insertCell(), r.lo, r.hi, r.px); tone(cell(tr, PC(r.from_hi), 'r'), r.from_hi); });
  });

  // ===== Economics =====
  const LST = (id, k) => { const v = rows(id).filter((r) => isN(r[k])); return v.length ? v[v.length - 1] : null; };
  const kvE = (name, id, k, fmt, sub) => { kv(name, () => { const r = LST(id, k); return r && { text: fmt(r[k]) }; }); kv(name + '-c', () => { const r = LST(id, k); return r && { text: sub(r) }; }); };
  const mo = (d) => d ? TT.mShort(D(d)) + ' ' + String(d).slice(0, 4) : '';
  kvE('ec-k-cpi', 'e_cpi', 'headline', (v) => N(v, 2) + '%', (r) => 'y/y · m/m ' + PC(r.mom, 2) + ' · ' + mo(r.date));
  kvE('ec-k-core', 'e_cpi', 'coreC', (v) => N(v, 2) + '%', (r) => 'core C y/y · services ' + N(r.services, 1) + '%');
  kvE('ec-k-gdp', 'e_gdp', 'gdp_yy', (v) => PC(v), (r) => 'y/y · q/q s.a. ' + PC(r.gdp_qq) + ' · ' + r.q);
  kvE('ec-k-ip', 'e_act', 'ip_yoy', (v) => PC(v), (r) => 'IP y/y s.a. · m/m ' + PC(r.ip_mom) + ' · ' + mo(r.date));
  kvE('ec-k-un', 'e_act', 'unemp', (v) => N(v, 1) + '%', (r) => 'unemployment s.a. · ' + mo(r.date));
  kvE('ec-k-ca', 'e_ext', 'ca_12m', (v) => sgn(v) + '$' + N(Math.abs(v) / 1000, 1) + 'bn', (r) => '12m current account · ' + mo(r.date));
  kvE('ec-k-bud', 'e_ext', 'bal_12m', (v) => sgn(v) + N(Math.abs(v) / 1e9, 2) + 'tn', (r) => '12m budget, TRY · ' + mo(r.date));

  // ECST scorecard
  dash.draw('ec-score', (tb) => {
    tb.replaceChildren(); let g = null;
    rows('e_score').forEach((r) => {
      if (r.group !== g) { g = r.group; grpRow(tb, g, 7); }
      const tr = tb.insertRow(); cell(tr, r.name, 'hi'); const fm = (v) => v == null ? '—' : r.unit === '%' ? N(v, Math.abs(v) < 10 ? 2 : 1) + '%' : r.unit === '$bn' ? N(v, 1) : r.unit === 'bn' ? N(v, 0) : N(v, 1);
      cell(tr, fm(r.value), 'r yl'); cell(tr, fm(r.prev), 'r'); cell(tr, fm(r.yago), 'r mu');
      const ch = isN(r.value) && isN(r.prev) ? r.value - r.prev : null; const td = cell(tr, ch == null ? '—' : sgn(ch) + N(Math.abs(ch), Math.abs(ch) < 10 ? 2 : 0), 'r'); if (ch != null && r.good) tone(td, ch * r.good);
      cell(tr, r.period ? (String(r.period).includes('Q') ? r.period : mo(r.period)) : '—', 'mu'); spark(tr.insertCell(), r.spark, '#ffa028');
    });
  });

  const line = (name, id, specs, o) => dash.draw(name, (el) => { const s = rows(id); if (!s.length) return; TT.chart(el, specs.map(([lbl, k, color, w, dash2]) => ({ name: lbl, color, width: w || 1.8, dash: dash2, values: s.filter((r) => isN(r[k])).map((r) => ({ x: D(r.date), y: r[k] })) })).filter((x) => x.values.length), Object.assign({ height: 230, yFmt: (v) => N(v, 0) + '%', tipFmt: (v) => N(v, 2) + '%' }, o || {})); });
  const bars = (name, id, k, o) => dash.draw(name, (el) => { const s = rows(id).filter((r) => isN(r[k])); if (!s.length) return; TT.bars(el, s.map((r) => ({ x: D(r.date), y: r[k] })), Object.assign({ height: 150, signColor: true }, o || {})); });

  // INFL
  line('in-main', 'e_cpi', [['Headline CPI', 'headline', '#ffd23c', 2.4], ['Core C', 'coreC', '#ff9a5c', 1.8], ['Core B', 'coreB', '#ffa028', 1.4, true], ['Producer prices (D-PPI)', 'ppi', '#7fd4ff', 1.6]]);
  line('in-groups', 'e_cpi', [['Services', 'services', '#c86bff', 2], ['Rent', 'rent', '#ff6b6b', 1.6], ['Core goods', 'goods', '#3cc8f0', 1.8], ['Food & non-alcoholic bev.', 'food', '#2ee66b', 1.6], ['Energy', 'energy', '#ffa028', 1.6]]);
  bars('in-mom', 'e_cpi', 'mom', { label: 'Headline CPI, m/m', yFmt: (v) => N(v, 1) + '%', tipFmt: (v) => N(v, 2) + '%', signColor: false, color: '#ffd23c' });
  line('in-house', 'e_cpi', [['House prices, nominal y/y', 'house', '#3cc8f0', 2], ['House prices, real y/y', 'house_real', '#2ee66b', 2], ['Headline CPI', 'headline', '#ffd23c', 1.2, true]]);
  dash.draw('in-table', (tb) => {
    tb.replaceChildren(); const s = rows('e_cpi'); if (!s.length) return; const a = s[s.length - 1], b = s[s.length - 2], c = s[s.length - 7], d0 = s[s.length - 13];
    [['Headline CPI', 'headline'], ['Core B', 'coreB'], ['Core C', 'coreC'], ['Services', 'services'], ['Rent', 'rent'], ['Core goods', 'goods'], ['Food & non-alcoholic beverages', 'food'], ['Energy', 'energy'], ['Producer prices (D-PPI)', 'ppi'], ['House prices (CBRT)', 'house'], ['House prices, real', 'house_real']].forEach(([n, k]) => {
      const tr = tb.insertRow(); cell(tr, n, 'hi'); cell(tr, a && isN(a[k]) ? N(a[k], 2) + '%' : '—', 'r yl'); cell(tr, b && isN(b[k]) ? N(b[k], 2) + '%' : '—', 'r'); const ch = a && b && isN(a[k]) && isN(b[k]) ? a[k] - b[k] : null; const td = cell(tr, ch == null ? '—' : sgn(ch) + N(Math.abs(ch), 2), 'r'); tone(td, ch == null ? null : -ch); cell(tr, c && isN(c[k]) ? N(c[k], 1) + '%' : '—', 'r mu'); cell(tr, d0 && isN(d0[k]) ? N(d0[k], 1) + '%' : '—', 'r mu'); spark(tr.insertCell(), s.slice(-24).map((r) => r[k]), '#ffa028');
    });
  });
  kv('in-asof', () => { const s = rows('e_cpi'); return s.length && { text: 'latest: ' + mo(s[s.length - 1].date) + ' · 3M annualised headline ' + N(s[s.length - 1].saar3, 1) + '%' }; });

  // GDP
  dash.draw('gd-qq', (el) => { const s = rows('e_gdp').filter((r) => isN(r.gdp_qq)); if (!s.length) return; TT.bars(el, s.map((r) => ({ x: D(r.date), y: r.gdp_qq })), { height: 180, label: 'GDP, q/q % (seasonally and calendar adjusted)', signColor: true, yFmt: (v) => N(v, 1) + '%', tipFmt: (v) => N(v, 2) + '%' }); });
  line('gd-yy', 'e_gdp', [['GDP', 'gdp_yy', '#ffd23c', 2.4], ['Household consumption', 'cons_yy', '#3cc8f0', 1.6], ['Investment (GFCF)', 'inv_yy', '#2ee66b', 1.6], ['Exports', 'exp_yy', '#c86bff', 1.4, true], ['Imports', 'imp_yy', '#ff6b6b', 1.4, true]], { height: 240 });
  dash.draw('gd-table', (tb) => {
    tb.replaceChildren(); const s = rows('e_gdp').slice(-6);
    const head = tb.closest('table').querySelector('thead tr'); if (head) { head.replaceChildren(); ['Component'].concat(s.map((r) => r.q)).forEach((t, i) => { const th = document.createElement('th'); th.textContent = t; if (i) th.className = 'r'; head.appendChild(th); }); }
    [['GDP, q/q', 'gdp_qq'], ['GDP, y/y', 'gdp_yy'], ['Household consumption, y/y', 'cons_yy'], ['Government consumption, y/y', 'gov_yy'], ['Investment (GFCF), y/y', 'inv_yy'], ['Exports, y/y', 'exp_yy'], ['Imports, y/y', 'imp_yy']].forEach(([n, k]) => { const tr = tb.insertRow(); cell(tr, n, 'hi'); s.forEach((r) => tone(cell(tr, PC(r[k]), 'r'), r[k])); });
  });

  // ACT
  dash.draw('ac-ip', (el) => { const s = rows('e_act').filter((r) => isN(r.ip_yoy)); if (!s.length) return; TT.chart(el, [{ name: 'Industrial production, y/y (s.a.)', color: '#ffd23c', width: 2.2, values: s.map((r) => ({ x: D(r.date), y: r.ip_yoy })) }, { name: 'Manufacturing, y/y', color: '#3cc8f0', width: 1.4, dash: true, values: s.filter((r) => isN(r.mf_yoy)).map((r) => ({ x: D(r.date), y: r.mf_yoy })) }], { height: 210, yFmt: (v) => N(v, 0) + '%', tipFmt: (v) => N(v, 2) + '%', refs: [{ y: 0, label: '0' }] }); });
  line('ac-conf', 'e_act', [['Real sector confidence (s.a.)', 'rkge', '#ffa028', 2], ['Consumer confidence', 'tge', '#3cc8f0', 2]], { height: 210, yFmt: (v) => N(v, 0), tipFmt: (v) => N(v, 1), refs: [{ y: 100, label: '100 = neutral (real sector)' }] });
  line('ac-kko', 'e_act', [['Capacity utilisation, manufacturing (s.a.)', 'kko', '#2ee66b', 2.2]], { height: 190, yFmt: (v) => N(v, 0) + '%', tipFmt: (v) => N(v, 1) + '%' });
  line('ac-lab', 'e_act', [['Unemployment rate (s.a.)', 'unemp', '#ff6b6b', 2.2], ['Employment rate (s.a.)', 'emp', '#3cc8f0', 1.4, true], ['Participation rate (s.a.)', 'lfpr', '#c86bff', 1.4, true]], { height: 190, yFmt: (v) => N(v, 0) + '%', tipFmt: (v) => N(v, 1) + '%' });

  // BOP & fiscal
  dash.draw('bp-ca', (el) => { const s = rows('e_ext').filter((r) => isN(r.ca_12m)); if (!s.length) return; const f = (k, n, c, w, d2) => ({ name: n, color: c, width: w, dash: d2, values: s.filter((r) => isN(r[k])).map((r) => ({ x: D(r.date), y: r[k] / 1000 })) }); TT.chart(el, [f('ca_12m', 'Current account', '#ffd23c', 2.4), f('ca_xg_12m', 'Ex gold', '#3cc8f0', 1.6), f('core_12m', 'Ex gold & energy (core)', '#2ee66b', 1.8), f('energy_12m', 'Energy balance', '#ff6b6b', 1.4, true)], { height: 230, yFmt: (v) => '$' + N(v, 0) + 'bn', tipFmt: (v) => '$' + N(v, 1) + 'bn', refs: [{ y: 0, label: '0' }] }); });
  bars('bp-cam', 'e_ext', 'ca', { label: 'Current account, monthly ($m)', yFmt: (v) => N(v / 1000, 0) + 'bn', tipFmt: (v) => '$' + N(v, 0) + 'm', height: 150 });
  dash.draw('fs-bal', (el) => { const s = rows('e_ext').filter((r) => isN(r.bal_12m)); if (!s.length) return; const f = (k, n, c, w, d2) => ({ name: n, color: c, width: w, dash: d2, values: s.filter((r) => isN(r[k])).map((r) => ({ x: D(r.date), y: r[k] / 1e9 })) }); TT.chart(el, [f('bal_12m', 'Budget balance', '#ffd23c', 2.4), f('prim_12m', 'Primary balance', '#2ee66b', 1.8), f('int_12m', 'Interest spending', '#ff6b6b', 1.4, true)], { height: 230, yFmt: (v) => N(v, 1) + 'tn', tipFmt: (v) => N(v, 2) + 'tn TRY', refs: [{ y: 0, label: '0' }] }); });
  line('fs-g', 'e_ext', [['Revenue growth, 12m vs prior 12m', 'rev_g', '#2ee66b', 2], ['Spending growth, 12m vs prior 12m', 'exp_g', '#ff6b6b', 2]], { height: 190, refs: [] });
})();
