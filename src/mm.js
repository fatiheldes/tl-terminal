// Money markets: CBRT corridor and operations, TRY short rates, liquidity, commercial paper and bank funding, US money markets.
(function () {
  const P = window.TTparse;
  dash.loader('mm_daily', { description: '', fn: P.md(null) });
  dash.loader('mm_weekly', { description: '', fn: P.md(null) });
  dash.loader('usmm', { description: '', fn: P.tsv });
  const R2 = (v) => v == null || isNaN(v) ? null : Math.round(v * 100) / 100;
  const isN = (v) => typeof v === 'number' && !isNaN(v);

  dash.calc('mm_d', { inputs: ['mm_daily', 'rates'], title: 'mm_d', fn: (d, rates) => {
    const rt = {}; (rates || []).forEach((r) => { rt[r.tarih] = r; });
    return (d || []).filter((r) => isN(r.PY_P02_ON) || isN(r.PPIBSM)).sort((a, b) => a.tarih < b.tarih ? -1 : 1).map((r) => {
      const x = rt[r.tarih] || {};
      return { date: r.tarih, lo: r.PY_P01_ON, hi: r.PY_P02_ON, policy: r.PY_P02_1H, ib: r.PY_P06_ON, ib_vol: isN(r.PY_P03_ON) ? r.PY_P03_ON / 1e6 : null, auc: isN(r.APIFON1_IHA) ? r.APIFON1_IHA / 1e3 : null, quot: isN(r.APIFON1_KOT_T) ? r.APIFON1_KOT_T / 1e3 : null, lik: isN(r.APIFON2_LIK) ? r.APIFON2_LIK / 1e3 : null, free: isN(r.PPIBSM) ? r.PPIBSM / 1e3 : null, sod: isN(r.PPIGBTL) ? r.PPIGBTL / 1e3 : null, ondep: r.PY_P06_ONI, tlref: x.tlref, aofm: x.aofm, repo: x.bist_repo };
    });
  } });

  dash.calc('mm_w', { inputs: ['mm_weekly'], title: 'mm_w', fn: (w) => (w || []).sort((a, b) => a.tarih < b.tarih ? -1 : 1).map((r) => ({
    date: r.tarih, d1m: r.TRY_MT01, d3m: r.TRY_MT02, d6m: r.TRY_MT03, d1y: r.TRY_MT04, dall: r.TRY_MT06, loan: r.KTF17,
    cp_nf: isN(r.YIOSBAVADE_C1_D11T) ? r.YIOSBAVADE_C1_D11T / 1e3 : null, cp_bank: isN(r.YIOSBAVADE_C1_D122T) ? r.YIOSBAVADE_C1_D122T / 1e3 : null, cp_ofi: isN(r.YIOSBAVADE_C1_D125T) ? r.YIOSBAVADE_C1_D125T / 1e3 : null
  })) });

  // Last policy decision from the daily 1-week repo quote
  dash.calc('mm_policy', { inputs: ['mm_d'], title: 'mm_policy', fn: (d) => {
    const s = (d || []).filter((r) => isN(r.policy)); if (!s.length) return [];
    let last = null; for (let i = 1; i < s.length; i++) if (s[i].policy !== s[i - 1].policy) last = { date: s[i].date, from: s[i - 1].policy, to: s[i].policy };
    const L = s[s.length - 1];
    return [{ policy: L.policy, lo: L.lo, hi: L.hi, date: L.date, last_date: last ? last.date : null, last_bp: last ? Math.round((last.to - last.from) * 100) : null }];
  } });

  // BTMM-style table: level and changes
  dash.calc('mm_tbl', { inputs: ['mm_d', 'mm_w', 'egri', 'rates'], title: 'mm_tbl', fn: (d, w, egri, rates) => {
    const out = [];
    const ser = (rows, k) => (rows || []).filter((r) => isN(r[k])).map((r) => ({ date: r.date || r.tarih, v: r[k] }));
    const add = (grp, name, s, note, unit) => {
      if (!s.length) return; const L = s[s.length - 1]; const back = (n) => s.length > n ? s[s.length - 1 - n].v : null; const ch = (b) => b == null ? null : Math.round((L.v - b) * 100);
      out.push({ grp, name, value: L.v, date: L.date, c1: unit === 'w' ? null : ch(back(1)), c5: ch(back(unit === 'w' ? 1 : 5)), c21: ch(back(unit === 'w' ? 4 : 21)), note, freq: unit === 'w' ? 'weekly' : 'daily', spark: s.slice(-30).map((x) => x.v) });
    };
    const rr = (rates || []).filter((r) => isN(r.tlref)).sort((a, b) => a.tarih < b.tarih ? -1 : 1).map((r) => ({ date: r.tarih, tlref: r.tlref, aofm: r.aofm, repo: r.bist_repo }));
    add('CBRT', 'One-week repo (policy rate)', ser(d, 'policy'), 'CBRT 1-week repo quote');
    add('CBRT', 'O/N lending (corridor top)', ser(d, 'hi'));
    add('CBRT', 'O/N borrowing (corridor floor)', ser(d, 'lo'));
    add('CBRT', 'O/N deposit auction, wtd avg', ser(d, 'ondep'), 'sterilisation auctions');
    add('CBRT', 'Avg funding cost (AWFC)', ser(rr, 'aofm'));
    add('Market', 'BIST-TLREF', ser(rr, 'tlref'), 'O/N reference rate');
    add('Market', 'BIST O/N repo, wtd avg', ser(rr, 'repo'));
    add('Market', 'Interbank O/N (CBRT market), wtd avg', ser(d, 'ib'));
    (egri || []).slice(0, 1).concat((egri || []).slice(-1)).forEach((b, i) => out.push({ grp: 'T-bills', name: 'T-bill ' + b.kod.replace('TRB', '').slice(0, 6).replace(/(\d\d)(\d\d)(\d\d)/, '$1.$2.$3') + ' (' + b.gun + 'd), simple', value: b.ois_esdegeri, date: b.tarih, c1: null, c5: null, c21: null, note: 'CBRT indicative price', freq: 'daily', spark: [] }));
    add('Bank funding', 'TRY deposits ≤1M (new business)', ser(w, 'd1m'), null, 'w');
    add('Bank funding', 'TRY deposits ≤3M', ser(w, 'd3m'), null, 'w');
    add('Bank funding', 'TRY deposits ≤6M', ser(w, 'd6m'), null, 'w');
    add('Bank funding', 'TRY deposits ≤1Y', ser(w, 'd1y'), null, 'w');
    add('Bank funding', 'Commercial loans, TRY (new business)', ser(w, 'loan'), null, 'w');
    return out;
  } });

  // Short-term private debt (commercial paper proxy): original maturity < 1 year
  dash.calc('mm_cp', { inputs: ['mm_w'], title: 'mm_cp', fn: (w) => {
    const s = (w || []).filter((r) => isN(r.cp_nf)); if (!s.length) return [];
    const L = s[s.length - 1], back = (k) => s.length > k ? s[s.length - 1 - k] : null;
    return [['Non-financial corporates (commercial paper)', 'cp_nf'], ['Banks (bank bills)', 'cp_bank'], ['Factoring, leasing & finance cos.', 'cp_ofi']].map(([name, k]) => {
      const c = (b) => b && b[k] ? R2((L[k] / b[k] - 1) * 100) : null;
      return { name, value: L[k], date: L.date, c1w: c(back(1)), c1m: c(back(4)), c6m: c(s[0]), spark: s.map((r) => r[k]) };
    });
  } });

  dash.calc('mm_us', { inputs: ['usmm'], title: 'mm_us', fn: (u) => {
    const D = { BIL: ['T-bills 1–3M', 'T-bill'], SGOV: ['T-bills 0–3M', 'T-bill'], GBIL: ['T-bills 0–1Y', 'T-bill'], SHV: ['Treasuries 0–1Y', 'T-bill'], TBLL: ['Short Treasuries', 'T-bill'], USFR: ['Floating-rate Treasury notes', 'FRN'], TFLO: ['Floating-rate Treasury notes', 'FRN'], MINT: ['Enhanced cash (active)', 'Ultra-short'], JPST: ['Ultra-short income (CP, CDs)', 'Ultra-short'], ICSH: ['Ultra-short (CP, CDs)', 'Ultra-short'] };
    return (u || []).filter((r) => D[r.symbol]).map((r) => ({ symbol: r.symbol, desc: D[r.symbol][0], grp: D[r.symbol][1], px: r.current_price, dy: r.dividend_yield, lo: r.week_52_low, hi: r.week_52_high, aum_vol: r.avg_volume })).sort((a, b) => ['T-bill', 'FRN', 'Ultra-short'].indexOf(a.grp) - ['T-bill', 'FRN', 'Ultra-short'].indexOf(b.grp));
  } });

  dash.calc('mm_global', { inputs: ['wgb', 'fi_policy'], title: 'mm_global', fn: (w, pol) => {
    const P2 = { 'United States': 'USA', 'United Kingdom': 'GBR', 'Turkey': 'TUR', 'Germany': 'XM', 'Japan': 'JPN', 'Australia': 'AUS', 'Canada': null };
    return Object.keys(P2).map((c) => {
      const g = (t) => { const r = (w || []).find((x) => x.country === c && x.tenor === t); return r && isN(r.yield) ? r.yield : null; };
      const p = (pol || []).find((x) => x.code === P2[c]);
      const y3 = g('3M'), y1 = g('1Y'), y2 = g('2Y');
      return { country: c === 'Turkey' ? 'Türkiye' : c === 'Germany' ? 'Euro area (Germany)' : c, policy: p ? p.rate : null, as_of: p ? p.as_of : null, y3m: y3, y1y: y1, y2y: y2, s2_pol: y2 != null && p ? Math.round((y2 - p.rate) * 100) : null };
    }).filter((r) => r.y2y != null || r.y3m != null);
  } });
})();

(function () {
  const L = d3.formatLocale({ decimal: '.', thousands: ',', grouping: [3], currency: ['', ''] });
  const N = (v, d) => v == null || isNaN(v) ? '—' : L.format(',.' + (d == null ? 2 : d) + 'f')(v);
  const sgn = (v) => v > 0 ? '+' : v < 0 ? '−' : '';
  const BP = (v) => v == null || isNaN(v) ? '—' : (v === 0 ? '0' : sgn(v) + N(Math.abs(v), 0));
  const rows = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : []; };
  const tone = (el, v, inv) => { const x = inv ? -v : v; el.classList.toggle('up', typeof v === 'number' && x > 0); el.classList.toggle('dn', typeof v === 'number' && x < 0); };
  const cell = (tr, text, cls) => { const td = tr.insertCell(); td.textContent = text; if (cls) td.className = cls; return td; };
  const spark = (td, s, color) => { s = (s || []).filter((v) => v != null); if (s.length < 2) return; const w = 64, h = 16; const x = d3.scaleLinear().domain([0, s.length - 1]).range([1, w - 1]); const e = d3.extent(s); const y = d3.scaleLinear().domain(e[0] === e[1] ? [e[0] - 1, e[0] + 1] : e).range([h - 2, 2]); d3.select(td).append('svg').attr('width', w).attr('height', h).attr('aria-hidden', 'true').append('path').attr('d', d3.line().x((v, i) => x(i)).y((v) => y(v)).curve(d3.curveStepAfter)(s)).style('fill', 'none').style('stroke', color || '#ffa028').style('stroke-width', 1.3); };
  const MS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dd = (iso) => { const d = TT.parseD(iso); return d.getUTCDate() + ' ' + MS[d.getUTCMonth()]; };
  const kv = (name, fn) => dash.draw(name, (el) => { const r = fn(); el.textContent = r && r.text != null ? r.text : '—'; if (r && 'tone' in r) tone(el, r.tone, r.inv); });
  const pol = () => rows('mm_policy')[0];
  const lastOf = (k) => { const s = rows('mm_d').filter((r) => typeof r[k] === 'number'); return s.length ? s[s.length - 1] : null; };

  kv('mm-k-pol', () => { const p = pol(); return p && { text: N(p.policy, 2) + '%' }; });
  kv('mm-k-pol-c', () => { const p = pol(); return p && { text: p.last_date ? 'last move ' + BP(p.last_bp) + ' bp · ' + dd(p.last_date) : 'unchanged in window', tone: p.last_bp, inv: true }; });
  kv('mm-k-cor', () => { const p = pol(); return p && { text: N(p.lo, 2) + ' – ' + N(p.hi, 2) }; });
  kv('mm-k-ib', () => { const r = lastOf('ib'); return r && { text: N(r.ib, 2) + '%' }; });
  kv('mm-k-ib-c', () => { const r = lastOf('ib'), p = pol(); return r && p && { text: BP(Math.round((r.ib - p.policy) * 100)) + ' bp vs policy' }; });
  kv('mm-k-free', () => { const r = lastOf('free'); return r && { text: N(r.free / 1000, 2) + ' tn' }; });
  kv('mm-k-free-c', () => { const r = lastOf('free'); return r && { text: 'banks’ free reserves · ' + dd(r.date) }; });
  kv('mm-k-auc', () => { const r = lastOf('auc'); return r && { text: N(r.auc, 0) + ' bn' }; });

  // Corridor and market rates
  dash.draw('mm-corridor', (el) => {
    const d = rows('mm_d').filter((r) => typeof r.hi === 'number'); if (!d.length) return;
    const S = (name, k, color, o) => Object.assign({ name, color, values: d.filter((r) => typeof r[k] === 'number').map((r) => ({ x: TT.parseD(r.date), y: r[k] })) }, o || {});
    TT.chart(el, [S('O/N lending (top)', 'hi', '#ff4545', { dash: true, step: true }), S('1W repo (policy)', 'policy', '#ffd23c', { step: true, width: 2.4 }), S('O/N borrowing (floor)', 'lo', '#2ee66b', { dash: true, step: true }), S('TLREF', 'tlref', '#ffa028'), S('AWFC', 'aofm', '#3cc8f0'), S('BIST O/N repo', 'repo', '#c86bff')], { height: 260, yFmt: (v) => N(v, 1) + '%', tipFmt: (v) => N(v, 2) + '%' });
  });
  dash.draw('mm-table', (tb) => {
    tb.replaceChildren(); let g = null;
    rows('mm_tbl').forEach((r) => {
      if (r.grp !== g) { g = r.grp; const tr = tb.insertRow(); const td = cell(tr, g.toUpperCase(), 'am'); td.colSpan = 8; td.style.fontSize = '10px'; td.style.letterSpacing = '.06em'; td.style.paddingTop = '6px'; }
      const tr = tb.insertRow(); const c = cell(tr, r.name, 'hi'); if (r.note) c.title = r.note;
      cell(tr, N(r.value, 2) + '%', 'r yl');
      ['c1', 'c5', 'c21'].forEach((k) => tone(cell(tr, r[k] == null ? '—' : BP(r[k]), 'r'), r[k], true));
      spark(tr.insertCell(), r.spark); cell(tr, r.date ? dd(r.date) : '—', 'r mu'); cell(tr, r.freq, 'mu');
    });
  });
  dash.draw('mm-liq', (el) => {
    const d = rows('mm_d').filter((r) => typeof r.free === 'number'); if (!d.length) return;
    TT.chart(el, [
      { name: 'Banks’ free reserves, bn TRY', color: '#3cc8f0', values: d.map((r) => ({ x: TT.parseD(r.date), y: r.free })) },
      { name: 'Start-of-day total liquidity, bn TRY', color: '#c86bff', values: d.filter((r) => typeof r.sod === 'number').map((r) => ({ x: TT.parseD(r.date), y: r.sod })) },
      { name: 'CBRT 1W repo auctions outstanding, bn TRY', color: '#ffa028', width: 2.2, values: d.filter((r) => typeof r.auc === 'number').map((r) => ({ x: TT.parseD(r.date), y: r.auc })) }
    ], { height: 230, yFmt: (v) => N(v, 0), tipFmt: (v) => N(v, 0) + ' bn' });
  });
  dash.draw('mm-ibvol', (el) => {
    const d = rows('mm_d').filter((r) => typeof r.ib_vol === 'number'); if (!d.length) return;
    TT.bars(el, d.map((r) => ({ x: TT.parseD(r.date), y: r.ib_vol })), { height: 150, label: 'CBRT interbank market O/N volume, bn TRY', color: '#3cc8f0', yFmt: (v) => N(v, 0), tipFmt: (v) => N(v, 1) + ' bn TRY' });
  });
  dash.draw('mm-dep', (el) => {
    const w = rows('mm_w').filter((r) => typeof r.d1m === 'number'); if (!w.length) return;
    const p = pol();
    const S = (name, k, color, o) => Object.assign({ name, color, values: w.filter((r) => typeof r[k] === 'number').map((r) => ({ x: TT.parseD(r.date), y: r[k] })) }, o || {});
    TT.chart(el, [S('Deposits ≤1M', 'd1m', '#ffa028'), S('≤3M', 'd3m', '#3cc8f0'), S('≤6M', 'd6m', '#2ee66b'), S('≤1Y', 'd1y', '#c86bff'), S('Commercial loans', 'loan', '#ff4545', { dash: true })], { height: 240, yFmt: (v) => N(v, 0) + '%', tipFmt: (v) => N(v, 2) + '%', refs: p ? [{ y: p.policy, label: 'policy ' + N(p.policy, 2) + '%' }] : [] });
  });
  dash.draw('mm-cp-chart', (el) => {
    const w = rows('mm_w').filter((r) => typeof r.cp_nf === 'number'); if (!w.length) return;
    TT.chart(el, [['Factoring, leasing & finance cos.', 'cp_ofi', '#c86bff'], ['Banks (bank bills)', 'cp_bank', '#3cc8f0'], ['Non-financial corporates (CP)', 'cp_nf', '#ffa028']].map(([name, k, color]) => ({ name, color, values: w.map((r) => ({ x: TT.parseD(r.date), y: r[k] })) })), { height: 230, yFmt: (v) => N(v, 0), tipFmt: (v) => N(v, 1) + ' bn TRY' });
  });
  dash.draw('mm-cp-table', (tb) => {
    tb.replaceChildren();
    rows('mm_cp').forEach((r) => {
      const tr = tb.insertRow(); cell(tr, r.name, 'hi'); cell(tr, N(r.value, 1) + ' bn', 'r');
      ['c1w', 'c1m', 'c6m'].forEach((k) => { const v = r[k] == null ? null : Math.abs(r[k]) < 0.05 ? 0 : r[k]; tone(cell(tr, v == null ? '—' : sgn(v) + N(Math.abs(v), 1) + '%', 'r'), v); });
      spark(tr.insertCell(), r.spark); cell(tr, dd(r.date), 'r mu');
    });
  });
  dash.draw('mm-spreads', (tb) => {
    tb.replaceChildren();
    const p = pol(); const w = rows('mm_w').filter((r) => typeof r.d1m === 'number'); const L = w[w.length - 1]; const d = rows('mm_d'); const li = lastOf('ib');
    const rr = rows('ozet')[0] || {};
    if (!p || !L) return;
    [['TLREF − policy', rr.tlref], ['AWFC − policy', rr.aofm], ['Interbank O/N − policy', li && li.ib], ['Deposits ≤1M − policy', L.d1m], ['Deposits ≤3M − policy', L.d3m], ['Commercial loans − policy', L.loan], ['Commercial loans − deposits ≤3M', L.loan != null && L.d3m != null ? p.policy + (L.loan - L.d3m) : null]].forEach(([n, v]) => {
      if (v == null) return; const bp = Math.round((v - p.policy) * 100);
      const tr = tb.insertRow(); cell(tr, n, 'hi'); tone(cell(tr, BP(bp) + ' bp', 'r'), bp);
      const td = tr.insertCell(); const W = 120; const x = d3.scaleLinear().domain([-500, 1500]).range([0, W]).clamp(true);
      const s = d3.select(td).append('svg').attr('width', W).attr('height', 10).attr('aria-hidden', 'true');
      s.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', 10).style('stroke', '#5a5a5a');
      s.append('rect').attr('x', Math.min(x(0), x(bp))).attr('width', Math.abs(x(bp) - x(0))).attr('y', 2).attr('height', 6).style('fill', bp >= 0 ? '#ffa028' : '#3cc8f0');
    });
  });
  dash.draw('mm-us', (tb) => {
    tb.replaceChildren(); let g = null;
    rows('mm_us').forEach((r) => {
      if (r.grp !== g) { g = r.grp; const tr = tb.insertRow(); const td = cell(tr, g.toUpperCase(), 'am'); td.colSpan = 5; td.style.fontSize = '10px'; td.style.paddingTop = '6px'; }
      const tr = tb.insertRow(); cell(tr, r.symbol, 'hi'); cell(tr, r.desc, 'mu'); cell(tr, N(r.px, 2), 'r'); cell(tr, N(r.dy, 2) + '%', 'r yl');
      cell(tr, r.hi ? N((r.px / r.hi - 1) * 100, 2) + '%' : '—', 'r mu');
    });
  });
  dash.draw('mm-global', (tb) => {
    tb.replaceChildren();
    rows('mm_global').forEach((r) => {
      const tr = tb.insertRow(); cell(tr, r.country, r.country === 'Türkiye' ? 'yl' : 'hi'); cell(tr, r.policy == null ? '—' : N(r.policy, 2) + '%', 'r');
      cell(tr, r.y3m == null ? '—' : N(r.y3m, 3) + '%', 'r'); cell(tr, r.y1y == null ? '—' : N(r.y1y, 3) + '%', 'r'); cell(tr, r.y2y == null ? '—' : N(r.y2y, 3) + '%', 'r');
      tone(cell(tr, BP(r.s2_pol), 'r'), r.s2_pol);
    });
  });
  kv('mm-k-us3m', () => { const r = rows('gq1').find((x) => x.symbol === '^IRX'); return r && { text: N(r.current_price, 3) + '%' }; });
  kv('mm-k-ff', () => { const r = rows('wirp').find((x) => x.kind.startsWith('Fed')); return r && { text: N(r.rate, 3) + '%' }; });
  kv('mm-k-ff-c', () => { const r = rows('wirp').find((x) => x.kind.startsWith('Fed')); return r && { text: TT.dShort(TT.parseD(r.date)).replace(/^\d+ /, '') + ' contract, implied' }; });
  kv('mm-k-sofr', () => { const r = rows('wirp').find((x) => x.kind.startsWith('SOFR')); return r && { text: N(r.rate, 3) + '%' }; });
  kv('mm-k-bil', () => { const r = rows('mm_us').find((x) => x.symbol === 'SGOV'); return r && { text: N(r.dy, 2) + '%' }; });
})();
