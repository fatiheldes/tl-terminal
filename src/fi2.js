// Fixed Income, part 2: world bonds (WB/IYC), rate expectations (WIRP), central bank decisions,
// sovereign CDS and ratings (WCDS/CRPR), structured products (MTGE), issuance (NIM), credit and news.
(function () {
  const P = window.TTparse;
  ['wgb', 'cds', 'ratings', 'tr_ratings', 'news', 'futs1', 'futs2', 'struct'].forEach((id) => dash.loader(id, { description: '', fn: P.tsv }));
  ['debt', 'ibs'].forEach((id) => dash.loader(id, { description: '', fn: P.md(null) }));
  const R2 = (v) => v == null || isNaN(v) ? null : Math.round(v * 100) / 100;
  const num = (v) => typeof v === 'number' ? v : (v == null || v === '' ? null : Number(String(v).replace(',', '.')));

  // Rating scale -> notch (AAA = 1 ... D = 22)
  const SP = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-', 'BB+', 'BB', 'BB-', 'B+', 'B', 'B-', 'CCC+', 'CCC', 'CCC-', 'CC', 'C', 'D'];
  const MO = ['Aaa', 'Aa1', 'Aa2', 'Aa3', 'A1', 'A2', 'A3', 'Baa1', 'Baa2', 'Baa3', 'Ba1', 'Ba2', 'Ba3', 'B1', 'B2', 'B3', 'Caa1', 'Caa2', 'Caa3', 'Ca', 'C', 'D'];
  const notch = (r, moody) => { if (!r) return null; const i = (moody ? MO : SP).indexOf(String(r).trim()); return i < 0 ? null : i + 1; };
  window.FIrating = { SP, MO, notch };
  const ALIAS = { 'Turkey': 'Türkiye' };
  const nm = (c) => ALIAS[c] || c;

  // World government bond monitor: one row per country
  dash.calc('wb', { inputs: ['wgb', 'cds', 'ratings'], title: 'wb', fn: (w, cds, rat) => {
    const by = {};
    (w || []).forEach((r) => { const c = r.country; (by[c] = by[c] || { country: nm(c), raw: c, group: r.group, t: {} }).t[r.tenor] = { y: num(r.yield), p: num(r.prev), time: r.time }; });
    const us = by['United States'], de = by['Germany'];
    const y = (o, t) => o && o.t[t] ? o.t[t].y : null;
    return Object.values(by).map((o) => {
      const c = (cds || []).find((x) => x.country === o.raw) || {}; const rt = (rat || []).find((x) => x.country === o.raw) || {};
      const y10 = y(o, '10Y'), p10 = o.t['10Y'] ? o.t['10Y'].p : null;
      const stale = Object.values(o.t).some((v) => /\d+\/\d+/.test(String(v.time || '')));
      return {
        country: o.country, raw: o.raw, group: o.group, y3m: y(o, '3M'), y2: y(o, '2Y'), y5: y(o, '5Y'), y10, y30: y(o, '30Y'),
        chg10: y10 != null && p10 != null ? Math.round((y10 - p10) * 100) : null,
        s2s10: y10 != null && y(o, '2Y') != null ? Math.round((y10 - y(o, '2Y')) * 100) : null,
        s5s30: y(o, '30Y') != null && y(o, '5Y') != null ? Math.round((y(o, '30Y') - y(o, '5Y')) * 100) : null,
        vs_ust: y10 != null && y(us, '10Y') != null ? Math.round((y10 - y(us, '10Y')) * 100) : null,
        vs_bund: y10 != null && y(de, '10Y') != null ? Math.round((y10 - y(de, '10Y')) * 100) : null,
        sp: rt.sp || c.sp || null, moodys: rt.moodys || null, fitch: rt.fitch || null, cds: num(c.cds5y), stale
      };
    });
  } });

  // Fed funds and SOFR futures: implied rate path
  const MON = { F: 0, G: 1, H: 2, J: 3, K: 4, M: 5, N: 6, Q: 7, U: 8, V: 9, X: 10, Z: 11 };
  const parseFut = (sym) => { const m = /^(ZQ|SR3)([FGHJKMNQUVXZ])(\d{2})\./.exec(sym || ''); return m ? { kind: m[1], date: new Date(Date.UTC(2000 + Number(m[3]), MON[m[2]], 1)) } : null; };
  dash.calc('wirp', { inputs: ['futs1', 'futs2', 'fi_policy'], title: 'wirp', fn: (a, b, pol) => {
    const us = (pol || []).find((p) => p.code === 'USA');
    const out = [];
    (a || []).concat(b || []).forEach((r) => { const f = parseFut(r.symbol); if (!f || typeof r.current_price !== 'number') return; out.push({ symbol: r.symbol, kind: f.kind === 'ZQ' ? 'Fed funds (1M)' : 'SOFR (3M)', date: f.date.toISOString().slice(0, 10), price: r.current_price, rate: R2(100 - r.current_price), lo: r.week_52_low, hi: r.week_52_high, volume: r.volume }); });
    out.sort((x, y) => x.date < y.date ? -1 : 1);
    const ff0 = out.find((x) => x.kind.startsWith('Fed'));
    out.forEach((x) => { x.vs_front = ff0 && x.kind.startsWith('Fed') ? Math.round((x.rate - ff0.rate) * 100) : null; x.vs_policy = us ? Math.round((x.rate - us.rate) * 100) : null; });
    return out;
  } });

  // Last policy move per central bank (BIS monthly series)
  dash.calc('cb_moves', { inputs: ['polrates1', 'polrates2', 'fi_policy'], title: 'cb_moves', fn: (a, b, pol) => {
    const s = {}; [a, b].forEach((rs) => (rs || []).forEach((r) => Object.keys(r).forEach((k) => { if (k === 'tarih' || typeof r[k] !== 'number') return; (s[k.replace('BISPOLFAIZ_', '')] = s[k.replace('BISPOLFAIZ_', '')] || []).push({ d: r.tarih, v: r[k] }); })));
    return Object.keys(s).map((code) => {
      const x = s[code].sort((p, q) => p.d < q.d ? -1 : 1); let last = null, moves = 0, hikes = 0, cuts = 0;
      for (let i = 1; i < x.length; i++) if (x[i].v !== x[i - 1].v) { last = { d: x[i].d, from: x[i - 1].v, to: x[i].v }; moves++; if (x[i].v > x[i - 1].v) hikes++; else cuts++; }
      const p = (pol || []).find((q) => q.code === code) || {};
      return { code, country: p.country || code, rate: x[x.length - 1].v, as_of: x[x.length - 1].d, last_date: last ? last.d : null, last_bp: last ? Math.round((last.to - last.from) * 100) : null, hikes, cuts, stance: !last ? 'On hold' : (last.to > last.from ? 'Tightening' : 'Easing') };
    }).sort((p, q) => (q.last_date || '') < (p.last_date || '') ? -1 : 1);
  } });

  // Sovereign CDS with ratings
  dash.calc('cds_tbl', { inputs: ['cds', 'ratings', 'wb'], title: 'cds_tbl', fn: (c, rat, wb) => (c || []).map((r) => {
    const rt = (rat || []).find((x) => x.country === r.country) || {}; const w = (wb || []).find((x) => x.raw === r.country) || {};
    const ns = [notch(rt.sp || r.sp), notch(rt.moodys, true), notch(rt.fitch)].filter((v) => v != null);
    return { country: nm(r.country), raw: r.country, sp: rt.sp || r.sp, moodys: rt.moodys || null, fitch: rt.fitch || null, avg_notch: ns.length ? R2(d3.mean(ns)) : null, cds: num(r.cds5y), var1m: num(r.var1m), var6m: num(r.var6m), pd: num(r.pd), date: r.date, y10: w.y10 == null ? null : w.y10 };
  }).filter((r) => r.cds != null) });

  // Debt issuance and outstanding (CBRT securities statistics, weekly; HMB domestic debt stock, monthly)
  dash.calc('nim', { inputs: ['debt'], title: 'nim', fn: (d) => (d || []).filter((r) => typeof r.DIBSVADE_C5_ST === 'number').sort((a, b) => a.tarih < b.tarih ? -1 : 1).map((r, i, arr) => ({
    date: r.tarih, dibs: r.DIBSVADE_C5_ST / 1e6, dibs_short: r.DIBSVADE_C3_ST / 1e6, dibs_chg: i ? (r.DIBSVADE_C5_ST - arr[i - 1].DIBSVADE_C5_ST) / 1e3 : null,
    ebond_sov: r.EBONDYAZDEG_ST / 1e3, corp_nf: r.YIOSBAYAZDEG_S11T / 1e3, corp_bank: r.YIOSBAYAZDEG_S122T / 1e3, corp_ofi: r.YIOSBAYAZDEG_S125T / 1e3,
    ebond_nf: r.YDOSBAYAZDEG_S11T / 1e3, ebond_bank: r.YDOSBAYAZDEG_S122T / 1e3
  })) });
  dash.calc('nim_tbl', { inputs: ['nim'], title: 'nim_tbl', fn: (n) => {
    if (!n || !n.length) return [];
    const L = n[n.length - 1], back = (k) => n.length > k ? n[n.length - 1 - k] : null;
    const defs = [['DİBS (TRY govt bonds & bills)', 'dibs', 'TRY tn', 1], ['  of which <1Y remaining', 'dibs_short', 'TRY tn', 1], ['Sovereign Eurobonds', 'ebond_sov', '$ bn', 0],
      ['Corporate bonds, non-financial (TRY)', 'corp_nf', 'TRY bn', 0], ['Bank bonds & bills (TRY)', 'corp_bank', 'TRY bn', 0], ['Other financial intermediaries (TRY)', 'corp_ofi', 'TRY bn', 0],
      ['Corporate Eurobonds, non-financial', 'ebond_nf', '$ bn', 0], ['Bank Eurobonds', 'ebond_bank', '$ bn', 0]];
    return defs.map(([name, k, unit]) => { const c = (b) => b && b[k] ? R2((L[k] / b[k] - 1) * 100) : null; return { name, unit, value: L[k], c1w: c(back(1)), c1m: c(back(4)), c6m: c(n[0]), spark: n.map((r) => r[k]), date: L.date }; });
  } });

  const DESC = { MBB: ['Agency MBS', 'US agency mortgage pass-throughs'], VMBS: ['Agency MBS', 'US agency mortgage pass-throughs'], CMBS: ['CMBS', 'Agency/investment-grade commercial MBS'], JAAA: ['CLO', 'AAA-rated CLO tranches (floating)'], BKLN: ['Leveraged loans', 'Senior secured bank loans (floating)'], FLOT: ['IG floaters', 'Investment-grade floating-rate notes'],
    'ZF=F': ['UST futures', '5-year Treasury note, front contract'], 'UB=F': ['UST futures', 'Ultra Treasury bond, front contract'], 'ZT=F': ['UST futures', '2-year Treasury note, front contract'] };
  dash.calc('mtge', { inputs: ['struct', 'futs2', 'gq3'], title: 'mtge', fn: (s, f2, q3) => {
    const all = (s || []).concat((f2 || []).filter((r) => r.symbol === 'ZT=F'), (q3 || []).filter((r) => ['ZN=F', 'ZB=F'].includes(r.symbol)));
    const seen = {};
    return all.filter((r) => DESC[r.symbol] || ['ZN=F', 'ZB=F'].includes(r.symbol)).filter((r) => !seen[r.symbol] && (seen[r.symbol] = 1)).map((r) => {
      const d = DESC[r.symbol] || ['UST futures', r.symbol === 'ZN=F' ? '10-year Treasury note, front contract' : 'Treasury bond, front contract'];
      const lo = r.week_52_low, hi = r.week_52_high, px = r.current_price;
      return { symbol: r.symbol, group: d[0], desc: d[1], px, lo, hi, pos: lo != null && hi > lo ? R2((px - lo) / (hi - lo) * 100) : null, from_hi: hi ? R2((px / hi - 1) * 100) : null, dy: typeof r.dividend_yield === 'number' ? r.dividend_yield : null };
    });
  } });

  // Credit: yield pick-up of credit ETFs over Treasuries (trailing distribution yields, a rough proxy only)
  dash.calc('credit_pick', { inputs: ['gbond_etf', 'mtge'], title: 'credit_pick', fn: (e, m) => {
    const all = (e || []).concat(m || []); const dy = (s) => { const r = all.find((x) => (x.sym || x.symbol) === s); return r ? r.dy : null; };
    const base = dy('IEF'), sh = dy('SHY');
    return [['LQD', 'USD investment grade', base], ['HYG', 'USD high yield', base], ['JNK', 'USD high yield (alt.)', base], ['EMB', 'EM sovereign USD', base], ['VWOB', 'EM government USD', base], ['EMLC', 'EM local currency', base], ['MBB', 'Agency MBS', base], ['JAAA', 'AAA CLO', sh], ['BKLN', 'Leveraged loans', sh]]
      .map(([s, n, b]) => ({ sym: s, name: n, dy: dy(s), bench: b === sh ? 'SHY' : 'IEF', pick: dy(s) != null && b != null ? Math.round((dy(s) - b) * 100) : null })).filter((r) => r.dy != null);
  } });
})();

(function () {
  const L = d3.formatLocale({ decimal: '.', thousands: ',', grouping: [3], currency: ['', ''] });
  const N = (v, d) => v == null || isNaN(v) ? '—' : L.format(',.' + (d == null ? 2 : d) + 'f')(v);
  const sgn = (v) => v > 0 ? '+' : v < 0 ? '−' : '';
  const BP = (v) => v == null || isNaN(v) ? '—' : sgn(v) + N(Math.abs(v), 0);
  const rows = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : []; };
  const tone = (el, v, inv) => { const x = inv ? -v : v; el.classList.toggle('up', typeof v === 'number' && x > 0); el.classList.toggle('dn', typeof v === 'number' && x < 0); };
  const cell = (tr, text, cls) => { const td = tr.insertCell(); td.textContent = text; if (cls) td.className = cls; return td; };
  const PCT = (v, d) => v == null || isNaN(v) ? '—' : N(v, d == null ? 2 : d) + '%';
  const rcol = (n) => n == null ? '#8a8a8a' : n <= 4 ? '#2ee66b' : n <= 7 ? '#7fd4ff' : n <= 10 ? '#ffd23c' : n <= 13 ? '#ffa028' : '#ff4545';
  const ratingCell = (tr, r, moody) => { const c = cell(tr, r || '—', 'r'); c.style.color = rcol(window.FIrating.notch(r, moody)); return c; };
  const spark = (td, s, color) => { s = (s || []).filter((v) => v != null); if (s.length < 2) return; const w = 64, h = 16; const x = d3.scaleLinear().domain([0, s.length - 1]).range([1, w - 1]); const e = d3.extent(s); const y = d3.scaleLinear().domain(e[0] === e[1] ? [e[0] - 1, e[0] + 1] : e).range([h - 2, 2]); d3.select(td).append('svg').attr('width', w).attr('height', h).attr('aria-hidden', 'true').append('path').attr('d', d3.line().x((v, i) => x(i)).y((v) => y(v))(s)).style('fill', 'none').style('stroke', color || '#ffa028').style('stroke-width', 1.3); };
  const rangeBar = (td, lo, hi, v) => { if (lo == null || hi == null || hi <= lo) { td.textContent = '—'; return; } const w = 70; const x = d3.scaleLinear().domain([lo, hi]).range([3, w - 3]).clamp(true); const s = d3.select(td).append('svg').attr('width', w).attr('height', 12).attr('aria-hidden', 'true'); s.append('line').attr('x1', 3).attr('x2', w - 3).attr('y1', 6).attr('y2', 6).style('stroke', '#3a3a3a').style('stroke-width', 2); s.append('circle').attr('cx', x(v)).attr('cy', 6).attr('r', 3.5).style('fill', '#3cc8f0'); };
  const tip = (el) => { let t = d3.select(el).select('.tt-tip'); if (t.empty()) t = d3.select(el).append('div').attr('class', 'tt-tip'); return t.style('display', 'none'); };
  const showTip = (t, el, ev, lines) => { t.selectAll('*').remove(); lines.forEach((l, i) => t.append('div').attr('class', i ? null : 'tt-tip-d').text(l)); const [px, py] = d3.pointer(ev, el); t.style('display', null).style('left', Math.min(px + 12, el.clientWidth - 200) + 'px').style('top', Math.max(0, py - 10) + 'px'); };
  const anim = () => TT.anim && TT.motion();
  const MS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const my = (iso, long) => { const d = TT.parseD(iso); return MS[d.getUTCMonth()] + ' ' + (long ? d.getUTCFullYear() : String(d.getUTCFullYear()).slice(2)); };
  const ISO = { 'United States': 'US', 'United Kingdom': 'UK', 'South Korea': 'KR', 'South Africa': 'ZA', 'Switzerland': 'CH', 'Sweden': 'SE', 'Denmark': 'DK', 'Germany': 'DE', 'Netherlands': 'NL', 'Finland': 'FI', 'Australia': 'AU', 'Ireland': 'IE', 'Austria': 'AT', 'Portugal': 'PT', 'Japan': 'JP', 'Spain': 'ES', 'China': 'CN', 'Canada': 'CA', 'Belgium': 'BE', 'Greece': 'GR', 'Italy': 'IT', 'Israel': 'IL', 'India': 'IN', 'France': 'FR', 'Indonesia': 'ID', 'Mexico': 'MX', 'Brazil': 'BR', 'Egypt': 'EG' };

  // ---------- WB: world government bond monitor ----------
  let wbFilter = 'ALL', wbSort = { k: 'y10', dir: -1 };
  const inGroup = (r) => wbFilter === 'ALL' || r.group === wbFilter || (wbFilter === 'DM' && (r.group === 'US' || r.group === 'EZ'));
  dash.draw('wb-table', (tb) => {
    tb.replaceChildren();
    rows('wb').filter(inGroup).sort((a, b) => ((a[wbSort.k] ?? -1e9) > (b[wbSort.k] ?? -1e9) ? 1 : -1) * wbSort.dir).forEach((r) => {
      const tr = tb.insertRow(); const c = cell(tr, r.country + (r.stale ? ' ·' : ''), r.raw === 'Turkey' ? 'yl' : 'hi'); if (r.stale) c.title = 'Some quotes are older than today';
      ['y2', 'y5', 'y10', 'y30'].forEach((k) => cell(tr, r[k] == null ? '—' : N(r[k], r[k] >= 10 ? 2 : 3), 'r' + (k === 'y10' ? ' yl' : '')));
      tone(cell(tr, BP(r.chg10), 'r'), r.chg10, true);
      tone(cell(tr, BP(r.s2s10), 'r'), r.s2s10); cell(tr, BP(r.vs_ust), 'r'); cell(tr, BP(r.vs_bund), 'r');
      ratingCell(tr, r.sp); ratingCell(tr, r.moodys, true); ratingCell(tr, r.fitch);
      cell(tr, r.cds == null ? '—' : N(r.cds, 0), 'r');
    });
  });
  document.addEventListener('click', (e) => {
    const f = e.target.closest && e.target.closest('[data-wbf]'); if (f) { wbFilter = f.dataset.wbf; document.querySelectorAll('[data-wbf]').forEach((x) => x.setAttribute('aria-pressed', String(x === f))); TT.anim = true; dash.draw('wb-table'); dash.draw('wb-bars'); TT.anim = false; return; }
    const h = e.target.closest && e.target.closest('th[data-wbs]'); if (h) { const k = h.dataset.wbs; wbSort = { k, dir: wbSort.k === k ? -wbSort.dir : -1 }; dash.draw('wb-table'); }
  });

  // 10Y yield ranking (horizontal bars, axis capped so double-digit yields do not flatten the rest)
  dash.draw('wb-bars', (el) => {
    d3.select(el).selectAll('*').remove();
    const d = rows('wb').filter(inGroup).filter((r) => r.y10 != null).sort((a, b) => b.y10 - a.y10);
    if (!d.length) return;
    const W = Math.max(300, el.clientWidth), rowH = d.length > 30 ? 12 : 15, m = { t: 6, r: 52, b: 22, l: 104 }, H = m.t + m.b + d.length * rowH;
    const cap = Math.min(d3.max(d, (r) => r.y10), 14);
    const x = d3.scaleLinear().domain([0, cap]).range([m.l, W - m.r]).nice();
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', '10-year government bond yields by country');
    svg.append('g').attr('class', 'grid').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickSize(-(H - m.t - m.b)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat((v) => v + '%').tickSizeOuter(0));
    const col = (r) => r.raw === 'Turkey' ? '#ffd23c' : r.group === 'EM' ? '#ffa028' : r.group === 'EZ' ? '#3cc8f0' : r.group === 'US' ? '#ff6b9a' : '#7fd4ff';
    const g = svg.append('g').selectAll('g').data(d).join('g').attr('transform', (r, i) => `translate(0,${m.t + i * rowH})`);
    g.append('text').attr('x', m.l - 6).attr('y', rowH / 2 + 3.5).attr('text-anchor', 'end').style('fill', (r) => r.raw === 'Turkey' ? '#ffd23c' : '#cfcfcf').style('font-size', '10.5px').text((r) => r.country);
    const b = g.append('rect').attr('x', m.l).attr('y', 2).attr('height', rowH - 4).style('fill', col).style('opacity', 0.85).attr('width', anim() ? 0 : (r) => Math.max(1, x(Math.min(r.y10, cap)) - m.l));
    if (anim()) b.transition().delay((r, i) => i * 18).duration(600).ease(d3.easeCubicOut).attr('width', (r) => Math.max(1, x(Math.min(r.y10, cap)) - m.l));
    g.append('text').attr('x', (r) => x(Math.min(r.y10, cap)) + 4).attr('y', rowH / 2 + 3.5).style('fill', '#e8e8e8').style('font-size', '10px').text((r) => N(r.y10, 2) + (r.y10 > cap ? ' ▸' : ''));
  });

  // IYC: compare curves across countries
  const IYC_ALL = [['United States', '#ff6b9a'], ['Germany', '#3cc8f0'], ['United Kingdom', '#2ee66b'], ['France', '#c86bff'], ['Italy', '#ffa028'], ['Japan', '#e8e8e8'], ['Canada', '#7fd4ff'], ['Australia', '#ffd23c'], ['Brazil', '#9be15d'], ['Mexico', '#ff9a5c'], ['South Africa', '#d0a3ff'], ['Turkey', '#ffd23c']];
  const iycSel = { 'United States': true, 'Germany': true, 'United Kingdom': true, 'Japan': true, 'Italy': true, 'France': false, 'Canada': false, 'Australia': false, 'Brazil': false, 'Mexico': false, 'South Africa': false, 'Turkey': false };
  const T = { '3M': 0.25, '1Y': 1, '2Y': 2, '5Y': 5, '10Y': 10, '30Y': 30 };
  dash.draw('iyc-btns', (el) => {
    el.replaceChildren(...IYC_ALL.map(([c, color]) => { const b = document.createElement('button'); b.dataset.iyc = c; b.setAttribute('aria-pressed', String(!!iycSel[c])); b.textContent = c === 'Turkey' ? 'TÜRKİYE' : c.toUpperCase(); b.style.setProperty('--sw', color); return b; }));
  });
  dash.draw('iyc', (el) => {
    const w = rows('wgb');
    const series = IYC_ALL.filter(([c]) => iycSel[c]).map(([c, color]) => ({ name: c === 'Turkey' ? 'Türkiye' : c, color, dots: true, width: 2, values: w.filter((r) => r.country === c && T[r.tenor] != null && typeof r.yield === 'number').map((r) => ({ x: T[r.tenor], y: r.yield })).sort((a, b) => a.x - b.x) })).filter((s) => s.values.length > 1);
    if (!series.length) { d3.select(el).selectAll('*').remove(); return; }
    TT.xy(el, series, { height: 300, xFmt: (v) => v === 0 ? '0' : N(v, 0) + 'Y', yFmt: (v) => N(v, 1) + '%', tipX: (v) => (v < 1 ? N(v * 12, 0) + 'M' : N(v, 0) + 'Y'), tipY: (v) => N(v, 3) + '%' });
  });
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-iyc]'); if (!b) return; iycSel[b.dataset.iyc] = !iycSel[b.dataset.iyc]; b.setAttribute('aria-pressed', String(iycSel[b.dataset.iyc])); TT.anim = true; dash.draw('iyc'); TT.anim = false; });

  // KPIs on the WB page
  const kv = (name, fn) => dash.draw(name, (el) => { const r = fn(); el.textContent = r && r.text != null ? r.text : '—'; if (r && 'tone' in r) tone(el, r.tone, r.inv); });
  const wbRow = (c) => rows('wb').find((r) => r.raw === c);
  [['de', 'Germany'], ['uk', 'United Kingdom'], ['jp', 'Japan'], ['it', 'Italy'], ['fr', 'France'], ['us', 'United States']].forEach(([k, c]) => {
    kv('wb-k-' + k, () => { const r = wbRow(c); return r && { text: N(r.y10, 3) + '%' }; });
    kv('wb-k-' + k + '-c', () => { const r = wbRow(c); return r && { text: BP(r.chg10) + ' bp 1D · ' + (c === 'Germany' ? 'vs UST ' + BP(r.vs_ust) : 'vs Bund ' + BP(r.vs_bund)), tone: r.chg10, inv: true }; });
  });

  // ---------- WIRP: implied policy path ----------
  dash.draw('wirp-chart', (el) => {
    const r = rows('wirp'); if (!r.length) return;
    const pol = rows('fi_policy').find((p) => p.code === 'USA');
    const s = [['Fed funds (1M)', '#ffa028'], ['SOFR (3M)', '#3cc8f0']].map(([k, color]) => ({ name: k + ' futures, implied', color, width: 2.2, values: r.filter((x) => x.kind === k).map((x) => ({ x: TT.parseD(x.date), y: x.rate })) }));
    TT.chart(el, s, { height: 250, yFmt: (v) => N(v, 2) + '%', tipFmt: (v) => N(v, 3) + '%', refs: pol ? [{ y: pol.rate, label: 'Fed policy rate (BIS, ' + TT.mShort(TT.parseD(pol.as_of)) + ') ' + N(pol.rate, 3) + '%' }] : [] });
  });
  dash.draw('wirp-table', (tb) => {
    tb.replaceChildren();
    rows('wirp').forEach((r) => {
      const tr = tb.insertRow(); cell(tr, r.symbol.replace('.CBT', '').replace('.CME', ''), 'hi'); cell(tr, r.kind, 'mu'); cell(tr, my(r.date)); cell(tr, N(r.price, 3), 'r');
      cell(tr, N(r.rate, 3) + '%', 'r yl'); tone(cell(tr, BP(r.vs_policy), 'r'), r.vs_policy, true); tone(cell(tr, r.vs_front == null ? '—' : BP(r.vs_front), 'r'), r.vs_front, true);
      cell(tr, r.vs_policy == null ? '—' : (r.vs_policy / 25 >= 0 ? '+' : '') + N(r.vs_policy / 25, 1), 'r');
    });
  });
  dash.draw('cb-moves', (tb) => {
    tb.replaceChildren();
    rows('cb_moves').forEach((r) => {
      const tr = tb.insertRow(); cell(tr, r.country, r.code === 'TUR' ? 'yl' : 'hi'); cell(tr, PCT(r.rate, 2), 'r');
      cell(tr, r.last_date ? my(r.last_date, true) : 'no move in window', r.last_date ? '' : 'mu');
      tone(cell(tr, r.last_bp == null ? '—' : BP(r.last_bp) + ' bp', 'r'), r.last_bp, true);
      const st = cell(tr, r.stance); st.className = r.stance === 'Tightening' ? 'dn' : r.stance === 'Easing' ? 'up' : 'mu';
      cell(tr, r.hikes + ' / ' + r.cuts, 'r mu');
    });
  });

  // ---------- WCDS / CRPR ----------
  dash.draw('cds-bars', (el) => {
    d3.select(el).selectAll('*').remove();
    const d = rows('cds_tbl').filter((r) => r.cds < 2000).sort((a, b) => b.cds - a.cds);
    const ex = rows('cds_tbl').filter((r) => r.cds >= 2000);
    if (!d.length) return;
    const W = Math.max(300, el.clientWidth), rowH = 15, m = { t: 6, r: 64, b: 22, l: 104 }, H = m.t + m.b + d.length * rowH;
    const x = d3.scaleLinear().domain([0, d3.max(d, (r) => r.cds) * 1.05]).range([m.l, W - m.r]).nice();
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', '5-year sovereign CDS by country');
    svg.append('g').attr('class', 'grid').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickSize(-(H - m.t - m.b)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat((v) => v + ' bp').tickSizeOuter(0));
    const g = svg.append('g').selectAll('g').data(d).join('g').attr('transform', (r, i) => `translate(0,${m.t + i * rowH})`);
    g.append('text').attr('x', m.l - 6).attr('y', rowH / 2 + 3.5).attr('text-anchor', 'end').style('fill', (r) => r.raw === 'Turkey' ? '#ffd23c' : '#cfcfcf').style('font-size', '10.5px').text((r) => r.country);
    const b = g.append('rect').attr('x', m.l).attr('y', 2).attr('height', rowH - 4).style('fill', (r) => rcol(window.FIrating.notch(r.sp))).style('opacity', 0.85).attr('width', anim() ? 0 : (r) => Math.max(1, x(r.cds) - m.l));
    if (anim()) b.transition().delay((r, i) => i * 18).duration(600).ease(d3.easeCubicOut).attr('width', (r) => Math.max(1, x(r.cds) - m.l));
    g.append('text').attr('x', (r) => x(r.cds) + 4).attr('y', rowH / 2 + 3.5).style('fill', '#e8e8e8').style('font-size', '10px').text((r) => N(r.cds, 0) + ' · ' + (r.sp || ''));
    if (ex.length) { const p = document.createElement('p'); p.className = 'note'; p.textContent = 'Off scale: ' + ex.map((r) => r.country + ' ' + N(r.cds, 0) + ' bp').join(', ') + '.'; el.appendChild(p); }
  });
  let cdsSort = { k: 'cds', dir: -1 };
  dash.draw('cds-table', (tb) => {
    tb.replaceChildren();
    rows('cds_tbl').slice().sort((a, b) => ((a[cdsSort.k] ?? -1e9) > (b[cdsSort.k] ?? -1e9) ? 1 : -1) * cdsSort.dir).forEach((r) => {
      const tr = tb.insertRow(); cell(tr, r.country, r.raw === 'Turkey' ? 'yl' : 'hi');
      ratingCell(tr, r.sp); ratingCell(tr, r.moodys, true); ratingCell(tr, r.fitch);
      cell(tr, N(r.cds, r.cds < 100 ? 1 : 0), 'r yl'); tone(cell(tr, r.var1m == null ? '—' : sgn(r.var1m) + N(Math.abs(r.var1m), 1) + '%', 'r'), r.var1m, true); tone(cell(tr, r.var6m == null ? '—' : sgn(r.var6m) + N(Math.abs(r.var6m), 1) + '%', 'r'), r.var6m, true);
      cell(tr, N(r.pd, 2) + '%', 'r'); cell(tr, r.y10 == null ? '—' : N(r.y10, 2) + '%', 'r mu'); cell(tr, r.date, 'r mu');
    });
  });
  document.addEventListener('click', (e) => { const h = e.target.closest && e.target.closest('th[data-cdss]'); if (!h) return; const k = h.dataset.cdss; cdsSort = { k, dir: cdsSort.k === k ? -cdsSort.dir : -1 }; dash.draw('cds-table'); });

  // CDS vs average rating notch (log scale), Türkiye highlighted
  dash.draw('cds-scatter', (el) => {
    d3.select(el).selectAll('*').remove();
    const d = rows('cds_tbl').filter((r) => r.avg_notch != null && r.cds > 0 && r.cds < 2000);
    if (!d.length) return;
    const W = Math.max(300, el.clientWidth), H = 280, m = { t: 10, r: 16, b: 34, l: 46 };
    const x = d3.scaleLinear().domain([0.5, d3.max(d, (r) => r.avg_notch) + 0.8]).range([m.l, W - m.r]);
    const y = d3.scaleLog().domain([5, d3.max(d, (r) => r.cds) * 1.4]).range([H - m.b, m.t]);
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'CDS versus credit rating');
    const yt = [5, 10, 20, 50, 100, 200, 500].filter((v) => v <= y.domain()[1]);
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(yt).tickSize(-(W - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(yt).tickFormat((v) => v).tickSizeOuter(0));
    const xt = d3.range(1, Math.floor(x.domain()[1]) + 1);
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(xt).tickFormat((v) => window.FIrating.SP[v - 1]).tickSizeOuter(0)).selectAll('text').style('font-size', '9px');
    svg.append('text').attr('x', m.l + 4).attr('y', m.t + 8).style('fill', '#8a8a8a').style('font-size', '10px').text('↑ 5Y CDS, bp (log)');
    svg.append('text').attr('x', W - m.r).attr('y', H - 2).attr('text-anchor', 'end').style('fill', '#8a8a8a').style('font-size', '10px').text('average rating (S&P scale) →');
    // fitted line: log(cds) on notch
    const xs = d.map((r) => r.avg_notch), ys = d.map((r) => Math.log(r.cds)); const mx = d3.mean(xs), my = d3.mean(ys);
    const bb = d3.sum(xs.map((v, i) => (v - mx) * (ys[i] - my))) / d3.sum(xs.map((v) => (v - mx) ** 2)); const aa = my - bb * mx;
    svg.append('path').attr('d', d3.line().x((v) => x(v)).y((v) => y(Math.exp(aa + bb * v)))(d3.range(1, x.domain()[1], 0.25))).style('stroke', '#5a5a5a').style('stroke-dasharray', '4 3').style('fill', 'none');
    const t = tip(el);
    const g = svg.append('g').selectAll('g').data(d).join('g').attr('transform', (r) => `translate(${x(r.avg_notch)},${y(r.cds)})`);
    g.append('circle').attr('r', (r) => r.raw === 'Turkey' ? 6 : 4).style('fill', (r) => rcol(r.avg_notch)).style('fill-opacity', 0.75).style('stroke', (r) => r.raw === 'Turkey' ? '#fff' : 'none');
    g.append('text').attr('x', 6).attr('y', 3).style('fill', (r) => r.raw === 'Turkey' ? '#ffd23c' : '#9a9a9a').style('font-size', '9px').text((r) => r.raw === 'Turkey' ? 'TÜRKİYE' : (ISO[r.raw] || r.country.slice(0, 3).toUpperCase()));
    g.on('pointerenter', (ev, r) => { const fair = Math.exp(aa + bb * r.avg_notch); showTip(t, el, ev, [r.country, 'CDS ' + N(r.cds, 0) + ' bp · ' + [r.sp, r.moodys, r.fitch].filter(Boolean).join(' / '), 'Rating-implied ' + N(fair, 0) + ' bp → ' + (r.cds > fair ? 'trades wide by ' : 'trades tight by ') + N(Math.abs(r.cds - fair), 0) + ' bp']); }).on('pointerleave', () => t.style('display', 'none'));
  });
  dash.draw('tr-ratings', (tb) => {
    tb.replaceChildren();
    rows('tr_ratings').forEach((r) => {
      const tr = tb.insertRow(); cell(tr, /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? TT.dt(r.date) : my(r.date + '-01', true)); cell(tr, r.agency, 'hi');
      ratingCell(tr, r.rating, r.agency === "Moody's"); const o = cell(tr, r.outlook); o.className = r.outlook === 'positive' ? 'up' : r.outlook === 'negative' ? 'dn' : 'mu';
      const a = cell(tr, r.action); if (/upgrad/i.test(r.action)) a.className = 'up'; else if (/downgrad/i.test(r.action)) a.className = 'dn';
    });
  });
  const cdsRow = (c) => rows('cds_tbl').find((r) => r.raw === c);
  kv('cr-k-tr', () => { const r = cdsRow('Turkey'); return r && { text: N(r.cds, 0) + ' bp' }; });
  kv('cr-k-tr-c', () => { const r = cdsRow('Turkey'); return r && { text: sgn(r.var1m) + N(Math.abs(r.var1m), 1) + '% 1M · PD ' + N(r.pd, 2) + '%', tone: r.var1m, inv: true }; });
  kv('cr-k-rt', () => ({ text: 'BB- / Ba3 / BB-' }));
  [['us', 'United States'], ['fr', 'France'], ['it', 'Italy'], ['br', 'Brazil']].forEach(([k, c]) => kv('cr-k-' + k, () => { const r = cdsRow(c); return r && { text: N(r.cds, 0) + ' bp', tone: r.var1m, inv: true }; }));

  // ---------- MTGE / futures ----------
  dash.draw('mtge-table', (tb) => {
    tb.replaceChildren(); let grp = null;
    rows('mtge').forEach((r) => {
      if (r.group !== grp) { grp = r.group; const tr = tb.insertRow(); const td = cell(tr, grp.toUpperCase(), 'am'); td.colSpan = 8; td.style.fontSize = '10px'; td.style.letterSpacing = '.06em'; td.style.paddingTop = '6px'; }
      const tr = tb.insertRow(); cell(tr, r.symbol, 'hi'); cell(tr, r.desc, 'mu'); cell(tr, N(r.px, r.px > 100 && r.group === 'UST futures' ? 4 : 2), 'r');
      rangeBar(tr.insertCell(), r.lo, r.hi, r.px); cell(tr, r.pos == null ? '—' : N(r.pos, 0) + '%', 'r');
      tone(cell(tr, r.from_hi == null ? '—' : N(r.from_hi, 2) + '%', 'r'), r.from_hi);
      cell(tr, r.dy == null ? '—' : N(r.dy, 2) + '%', 'r');
    });
  });
  dash.draw('credit-pick', (tb) => {
    tb.replaceChildren();
    rows('credit_pick').forEach((r) => {
      const tr = tb.insertRow(); cell(tr, r.sym, 'hi'); cell(tr, r.name, 'mu'); cell(tr, N(r.dy, 2) + '%', 'r'); cell(tr, r.bench, 'r mu');
      const td = cell(tr, BP(r.pick) + ' bp', 'r'); tone(td, r.pick);
      const bar = tr.insertCell(); const w = 90; const xs = d3.scaleLinear().domain([-100, 400]).range([0, w]).clamp(true);
      const s = d3.select(bar).append('svg').attr('width', w).attr('height', 10).attr('aria-hidden', 'true');
      s.append('line').attr('x1', xs(0)).attr('x2', xs(0)).attr('y1', 0).attr('y2', 10).style('stroke', '#5a5a5a');
      s.append('rect').attr('x', Math.min(xs(0), xs(r.pick))).attr('width', Math.abs(xs(r.pick) - xs(0))).attr('y', 2).attr('height', 6).style('fill', r.pick >= 0 ? '#ffa028' : '#3cc8f0');
    });
  });

  // ---------- NIM: debt stock and issuance ----------
  dash.draw('nim-dibs', (el) => {
    const n = rows('nim'); if (!n.length) return;
    TT.bars(el, n.filter((r) => r.dibs_chg != null).map((r) => ({ x: TT.parseD(r.date), y: r.dibs_chg })), { height: 200, label: 'Weekly change in DİBS outstanding (net issuance less redemptions), bn TRY', color: '#ffa028', yFmt: (v) => N(v, 0), tipFmt: (v) => sgn(v) + N(Math.abs(v), 1) + ' bn TRY', signColor: true });
  });
  dash.draw('nim-dibs-stock', (el) => {
    const n = rows('nim'); if (!n.length) return;
    TT.chart(el, [{ name: 'DİBS outstanding, TRY tn', color: '#ffa028', values: n.map((r) => ({ x: TT.parseD(r.date), y: r.dibs })) }, { name: 'of which <1Y remaining', color: '#3cc8f0', values: n.map((r) => ({ x: TT.parseD(r.date), y: r.dibs_short })) }], { height: 170, yFmt: (v) => N(v, 1), tipFmt: (v) => N(v, 2) + ' tn' });
  });
  dash.draw('nim-ibs', (el) => {
    const d = rows('ibs').filter((r) => typeof r.KB_A09 === 'number').sort((a, b) => a.tarih < b.tarih ? -1 : 1);
    if (!d.length) return;
    TT.chart(el, [{ name: 'Domestic debt stock, total', color: '#ffa028', width: 2.2, values: d.map((r) => ({ x: TT.parseD(r.tarih), y: r.KB_A09 / 1e9 })) }, { name: 'Bonds', color: '#3cc8f0', values: d.map((r) => ({ x: TT.parseD(r.tarih), y: r.KB_A01 / 1e9 })) }], { height: 190, yFmt: (v) => N(v, 1), tipFmt: (v) => N(v, 2) + ' tn TRY' });
  });
  dash.draw('nim-table', (tb) => {
    tb.replaceChildren();
    rows('nim_tbl').forEach((r) => {
      const tr = tb.insertRow(); cell(tr, r.name, r.name.startsWith('  ') ? 'mu' : 'hi'); cell(tr, N(r.value, r.unit.endsWith('tn') ? 2 : 1) + ' ' + r.unit, 'r');
      ['c1w', 'c1m', 'c6m'].forEach((k) => { const v = r[k] == null || Math.abs(r[k]) < 0.05 ? (r[k] == null ? null : 0) : r[k]; tone(cell(tr, v == null ? '—' : sgn(v) + N(Math.abs(v), 1) + '%', 'r'), v); });
      spark(tr.insertCell(), r.spark);
    });
  });
  dash.draw('corp-tr', (el) => {
    const n = rows('nim'); if (!n.length) return;
    TT.chart(el, [['Banks', 'corp_bank', '#3cc8f0'], ['Other financial intermediaries', 'corp_ofi', '#c86bff'], ['Non-financial corporates', 'corp_nf', '#ffa028']].map(([name, k, color]) => ({ name, color, values: n.map((r) => ({ x: TT.parseD(r.date), y: r[k] })) })), { height: 220, yFmt: (v) => N(v, 0), tipFmt: (v) => N(v, 1) + ' bn TRY' });
  });

  // ---------- NEWS ----------
  let newsTag = 'All';
  dash.draw('news-tags', (el) => {
    const tags = ['All'].concat(Array.from(new Set(rows('news').map((r) => r.tag))));
    el.replaceChildren(...tags.map((t) => { const b = document.createElement('button'); b.dataset.ntag = t; b.setAttribute('aria-pressed', String(t === newsTag)); b.textContent = t.toUpperCase(); return b; }));
  });
  dash.draw('news-list', (tb) => {
    tb.replaceChildren();
    rows('news').filter((r) => newsTag === 'All' || r.tag === newsTag).sort((a, b) => a.date < b.date ? 1 : -1).forEach((r) => {
      const tr = tb.insertRow(); cell(tr, /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? TT.dShort(TT.parseD(r.date)) : r.date, 'mu'); const tg = cell(tr, r.tag); tg.className = 'am';
      const td = tr.insertCell(); const a = document.createElement('a'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = r.title; a.className = 'nlink'; td.appendChild(a);
      cell(tr, r.source, 'mu');
    });
  });
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-ntag]'); if (!b) return; newsTag = b.dataset.ntag; document.querySelectorAll('[data-ntag]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); dash.draw('news-list'); });

})();
