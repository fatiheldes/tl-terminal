// FX: TRY monitor and cross matrix, world currencies, CIP forwards and carry, realised volatility, CBRT FX operations and REER.
(function () {
  const P = window.TTparse;
  ['fxq1', 'fxq2', 'fxh1', 'fxh2', 'fxh3'].forEach((id) => dash.loader(id, { description: '', fn: P.tsv }));
  ['reer', 'fxops'].forEach((id) => dash.loader(id, { description: '', fn: P.md(null) }));
  const R2 = (v) => v == null || isNaN(v) ? null : Math.round(v * 100) / 100;
  const isN = (v) => typeof v === 'number' && !isNaN(v);
  const hist = (h, sym) => { const r = (h || []).find((x) => x.symbol === sym); return r && Array.isArray(r.data) ? r.data.map((d) => ({ date: String(d.date).slice(0, 10), close: d.close })).filter((d) => isN(d.close)).sort((a, b) => a.date < b.date ? -1 : 1) : []; };
  const std = (a) => { if (a.length < 2) return null; const m = d3.mean(a); return Math.sqrt(d3.sum(a.map((x) => (x - m) ** 2)) / (a.length - 1)); };

  // Currency universe: code, name, region, Yahoo symbol, quoted as USD per unit (true) or units per USD (false), BIS policy code
  const CCY = [
    ['EUR', 'Euro', 'G10', 'EURUSD=X', true, 'XM'], ['GBP', 'British pound', 'G10', 'GBPUSD=X', true, 'GBR'], ['JPY', 'Japanese yen', 'G10', 'USDJPY=X', false, 'JPN'], ['CHF', 'Swiss franc', 'G10', 'USDCHF=X', false, null],
    ['AUD', 'Australian dollar', 'G10', 'AUDUSD=X', true, 'AUS'], ['CAD', 'Canadian dollar', 'G10', 'USDCAD=X', false, null],
    ['TRY', 'Turkish lira', 'EMEA', 'USDTRY=X', false, 'TUR'], ['PLN', 'Polish zloty', 'EMEA', 'USDPLN=X', false, 'POL'], ['HUF', 'Hungarian forint', 'EMEA', 'USDHUF=X', false, 'HUN'], ['CZK', 'Czech koruna', 'EMEA', 'USDCZK=X', false, 'CZE'], ['ZAR', 'South African rand', 'EMEA', 'USDZAR=X', false, 'ZAF'],
    ['BRL', 'Brazilian real', 'LatAm', 'USDBRL=X', false, 'BRA'], ['MXN', 'Mexican peso', 'LatAm', 'USDMXN=X', false, 'MEX'], ['CLP', 'Chilean peso', 'LatAm', 'USDCLP=X', false, null], ['COP', 'Colombian peso', 'LatAm', 'USDCOP=X', false, null],
    ['CNY', 'Chinese yuan', 'Asia', 'USDCNY=X', false, 'CHN'], ['INR', 'Indian rupee', 'Asia', 'USDINR=X', false, 'IND'], ['KRW', 'Korean won', 'Asia', 'USDKRW=X', false, 'KOR'], ['IDR', 'Indonesian rupiah', 'Asia', 'USDIDR=X', false, 'IDN']];
  window.FXCCY = CCY;

  // World currencies vs USD: % change of the currency's value in USD (positive = stronger)
  dash.calc('wcrs', { inputs: ['fxq1', 'fxq2', 'fxh1', 'fxh2', 'fxh3', 'fi_policy', 'gq1'], title: 'wcrs', fn: (q1, q2, h1, h2, h3, pol, g1) => {
    const q = (q1 || []).concat(q2 || []), h = (h1 || []).concat(h2 || [], h3 || []);
    const us3m = ((g1 || []).find((x) => x.symbol === '^IRX') || {}).current_price;
    return CCY.map(([code, name, region, sym, inv, bis]) => {
      const r = q.find((x) => x.symbol === sym); if (!r || !isN(r.current_price)) return null;
      const s = hist(h, sym); const val = (px) => inv ? px : 1 / px; // value of 1 unit in USD
      const v0 = val(r.current_price); const back = (n) => s.length > n ? val(s[s.length - 1 - n].close) : null;
      const chg = (b) => b ? R2((v0 / b - 1) * 100) : null;
      const rets = []; for (let i = 1; i < s.length; i++) rets.push(Math.log(val(s[i].close) / val(s[i - 1].close)));
      const vol = rets.length > 4 ? R2(std(rets) * Math.sqrt(52) * 100) : null;
      const p = bis ? (pol || []).find((x) => x.code === bis) : null;
      const carry = p && isN(us3m) ? R2(p.rate - us3m) : null;
      const lo = inv ? r.week_52_low : 1 / r.week_52_high, hi = inv ? r.week_52_high : 1 / r.week_52_low; // in value terms
      return { code, name, region, sym, quote: r.current_price, inv, w1: chg(back(1)), m1: chg(back(4)), m3: chg(back(13)), m6: s.length ? chg(val(s[0].close)) : null, vol, policy: p ? p.rate : null, carry, carry_vol: carry != null && vol ? R2(carry / vol) : null, pos52: hi > lo ? R2((v0 - lo) / (hi - lo) * 100) : null, spark: s.map((x) => val(x.close)) };
    }).filter(Boolean);
  } });

  // TRY monitor: TRY per unit of each currency, from the TRY quotes (fx) and USD crosses
  dash.calc('try_mon', { inputs: ['fx', 'wcrs', 'fxq1'], title: 'try_mon', fn: (fx, w, q1) => {
    const usd = ((fx || []).find((r) => r.symbol === 'USD') || {}).last; if (!isN(usd)) return [];
    const usdY = ((q1 || []).find((r) => r.symbol === 'USDTRY=X') || {}).current_price;
    const tr = (w || []).find((r) => r.code === 'TRY');
    return (w || []).filter((r) => r.code !== 'TRY').map((r) => {
      const inUsd = r.inv ? r.quote : 1 / r.quote; const per = usd * inUsd; const scale = ['JPY', 'KRW', 'IDR', 'CLP', 'COP', 'HUF'].includes(r.code) ? 100 : 1;
      const chg = (k) => r[k] != null && tr && tr[k] != null ? R2(((1 + r[k] / 100) / (1 + tr[k] / 100) - 1) * 100) : null; // change of the currency vs TRY
      return { code: r.code, name: r.name, region: r.region, per: per * scale, scale, w1: chg('w1'), m1: chg('m1'), m3: chg('m3'), m6: chg('m6') };
    }).concat([{ code: 'USD', name: 'US dollar', region: 'USD', per: usd, scale: 1, w1: tr ? R2((1 / (1 + tr.w1 / 100) - 1) * 100) : null, m1: tr ? R2((1 / (1 + tr.m1 / 100) - 1) * 100) : null, m3: tr ? R2((1 / (1 + tr.m3 / 100) - 1) * 100) : null, m6: tr ? R2((1 / (1 + tr.m6 / 100) - 1) * 100) : null, src: usdY }]);
  } });

  // Cross matrix among majors + TRY (row currency priced in column currency)
  dash.calc('fx_matrix', { inputs: ['wcrs'], title: 'fx_matrix', fn: (w) => {
    const val = { USD: 1 }; (w || []).forEach((r) => { val[r.code] = r.inv ? r.quote : 1 / r.quote; });
    const C = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CNY', 'TRY'].filter((c) => val[c]);
    return C.map((a) => { const o = { ccy: a }; C.forEach((b) => { o[b] = a === b ? null : val[a] / val[b]; }); return o; });
  } });

  // Basket and REER
  dash.calc('fx_basket', { inputs: ['fx', 'usd', 'wcrs'], title: 'fx_basket', fn: (fx, usdh, w) => {
    const u = ((fx || []).find((r) => r.symbol === 'USD') || {}).last, e = ((fx || []).find((r) => r.symbol === 'EUR') || {}).last;
    if (!isN(u) || !isN(e)) return [];
    const tr = (w || []).find((r) => r.code === 'TRY'), eu = (w || []).find((r) => r.code === 'EUR');
    return [{ basket: R2((u + e) / 2 * 100) / 100, usd: u, eur: e, eurusd: R2(e / u * 10000) / 10000 }];
  } });

  // CIP forwards: USD/TRY and EUR/TRY
  const TENORS = [['1W', 7], ['1M', 30], ['2M', 61], ['3M', 91], ['6M', 182], ['9M', 273], ['1Y', 365]];
  dash.calc('fx_fwd', { inputs: ['fx', 'egri', 'fi_curves', 'wgb', 'gq1', 'fi_policy', 'pka', 'ozet'], title: 'fx_fwd', fn: (fx, egri, curves, wgb, g1, pol, pka, oz) => {
    const S = ((fx || []).find((r) => r.symbol === 'USD') || {}).last, SE = ((fx || []).find((r) => r.symbol === 'EUR') || {}).last;
    if (!isN(S)) return [];
    // TRY simple rate by days: bills (OIS-equivalent, simple) up to the last bill; beyond, fitted government curve converted to simple
    const bills = (egri || []).filter((b) => isN(b.ois_esdegeri)).map((b) => ({ d: b.gun, r: b.ois_esdegeri }));
    const tl = ((oz || [])[0] || {}).tlref;
    const pts = [{ d: 1, r: tl }].concat(bills).filter((p) => isN(p.r));
    const fit = (curves || []).filter((c) => c.curve === 'Today');
    const fitAt = (t) => { if (!fit.length) return null; const p = fit.reduce((a, b) => Math.abs(b.tenor - t) < Math.abs(a.tenor - t) ? b : a); return p.yield; };
    const tryRate = (d) => {
      const last = pts[pts.length - 1];
      if (d <= last.d) { for (let i = 1; i < pts.length; i++) if (d <= pts[i].d) { const a = pts[i - 1], b = pts[i]; return a.r + (b.r - a.r) * (d - a.d) / (b.d - a.d); } return last.r; }
      const y = fitAt(d / 365); if (y == null) return last.r; const t = d / 365; return (Math.pow(1 + y / 100, t) - 1) / t * 100;
    };
    const g = (c, t) => { const r = (wgb || []).find((x) => x.country === c && x.tenor === t); return r && isN(r.yield) ? r.yield : null; };
    const us3 = ((g1 || []).find((x) => x.symbol === '^IRX') || {}).current_price ?? g('United States', '3M'), us1 = g('United States', '1Y'), us2 = g('United States', '2Y');
    const usdRate = (d) => { if (us3 == null) return null; if (d <= 91) return us3; if (us1 == null) return us3; if (d <= 365) return us3 + (us1 - us3) * (d - 91) / (365 - 91); return us1; };
    const ecb = ((pol || []).find((x) => x.code === 'XM') || {}).rate, de2 = g('Germany', '2Y');
    const eurRate = (d) => ecb == null ? null : de2 == null ? ecb : ecb + (de2 - ecb) * Math.min(1, d / 730);
    const exp12 = (() => { const s = (pka || []).filter((r) => isN(r.usd_12a)).sort((a, b) => a.tarih < b.tarih ? -1 : 1); return s.length ? s[s.length - 1].usd_12a : null; })();
    return TENORS.map(([lbl, d]) => {
      const rt = tryRate(d), ru = usdRate(d), re = eurRate(d);
      const F = rt != null && ru != null ? S * (1 + rt / 100 * d / 365) / (1 + ru / 100 * d / 360) : null;
      const FE = isN(SE) && rt != null && re != null ? SE * (1 + rt / 100 * d / 365) / (1 + re / 100 * d / 360) : null;
      return { tenor: lbl, days: d, spot: S, try_rate: R2(rt), usd_rate: R2(ru), eur_rate: R2(re), fwd: F, points: F == null ? null : Math.round((F - S) * 10000), dep_ann: F == null ? null : R2((F / S - 1) * 365 / d * 100), dep_period: F == null ? null : R2((F / S - 1) * 100), fwd_eur: FE, spot_eur: SE, survey12: lbl === '1Y' ? exp12 : null };
    });
  } });

  // Realised volatility of USD/TRY from daily closes
  dash.calc('fx_rvol', { inputs: ['usd'], title: 'fx_rvol', fn: (u) => {
    const s = (u || []).filter((r) => isN(r.close)).sort((a, b) => a.date < b.date ? -1 : 1);
    const out = [];
    for (let i = 21; i < s.length; i++) { const r = []; for (let j = i - 19; j <= i; j++) r.push(Math.log(s[j].close / s[j - 1].close)); out.push({ date: s[i].date, vol20: R2(std(r) * Math.sqrt(252) * 100), close: s[i].close, dchg: R2((s[i].close / s[i - 1].close - 1) * 100) }); }
    return out;
  } });

  dash.calc('fx_reer', { inputs: ['reer'], title: 'fx_reer', fn: (r) => (r || []).filter((x) => isN(x.RK_T1_Y)).sort((a, b) => a.tarih < b.tarih ? -1 : 1).map((x) => ({ date: x.tarih, all: x.RK_T1_Y, em: x.RK_T2_Y, dm: x.RK_T3_Y })) });
  const todayISO = () => { const a = /(\d\d)\.(\d\d)\.(\d{4})/.exec(window.TT_ASOF || ''); return a ? a[3] + '-' + a[2] + '-' + a[1] : new Date().toISOString().slice(0, 10); };
  dash.calc('fx_ops', { inputs: ['fxops'], title: 'fx_ops', fn: (r) => (r || []).filter((x) => isN(x.SWAPTEKTAR_TOTALSTOKSATIMYONLU) && x.tarih <= todayISO()).sort((a, b) => a.tarih < b.tarih ? -1 : 1).map((x) => ({ date: x.tarih, swap_sell: x.SWAPTEKTAR_TOTALSTOKSATIMYONLU / 1000, swap_buy: x.SWAPTEKTAR_TOTALSTOKALIMYONLU / 1000, fwd_total: x.TLUZVADDOV_S3 / 1000, fwd_cbrt: x.TLUZVADDOV_S2 / 1000 })) });
})();

(function () {
  const L = d3.formatLocale({ decimal: '.', thousands: ',', grouping: [3], currency: ['', ''] });
  const N = (v, d) => v == null || isNaN(v) ? '—' : L.format(',.' + (d == null ? 2 : d) + 'f')(v);
  const sgn = (v) => v > 0 ? '+' : v < 0 ? '−' : '';
  const PC = (v, d) => v == null || isNaN(v) ? '—' : (Math.abs(v) < 0.005 ? '0.00' : sgn(v) + N(Math.abs(v), d == null ? 2 : d)) + '%';
  const rows = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : []; };
  const tone = (el, v, inv) => { const x = inv ? -v : v; el.classList.toggle('up', typeof v === 'number' && x > 0.004); el.classList.toggle('dn', typeof v === 'number' && x < -0.004); };
  const cell = (tr, text, cls) => { const td = tr.insertCell(); td.textContent = text; if (cls) td.className = cls; return td; };
  const heat = (v, s) => v == null ? '' : v > 0 ? `rgba(46,230,107,${Math.min(0.7, Math.abs(v) / (s || 4))})` : `rgba(255,69,69,${Math.min(0.7, Math.abs(v) / (s || 4))})`;
  const spark = (td, s, color) => { s = (s || []).filter((v) => v != null); if (s.length < 2) return; const w = 64, h = 16; const x = d3.scaleLinear().domain([0, s.length - 1]).range([1, w - 1]); const e = d3.extent(s); const y = d3.scaleLinear().domain(e[0] === e[1] ? [e[0] - 1, e[0] + 1] : e).range([h - 2, 2]); d3.select(td).append('svg').attr('width', w).attr('height', h).attr('aria-hidden', 'true').append('path').attr('d', d3.line().x((v, i) => x(i)).y((v) => y(v))(s)).style('fill', 'none').style('stroke', color || '#ffa028').style('stroke-width', 1.3); };
  const kv = (name, fn) => dash.draw(name, (el) => { const r = fn(); el.textContent = r && r.text != null ? r.text : '—'; if (r && 'tone' in r) tone(el, r.tone, r.inv); });
  const dp = (v) => v >= 1000 ? 0 : v >= 100 ? 2 : v >= 10 ? 3 : 4;
  const W = (c) => rows('wcrs').find((r) => r.code === c);

  // KPIs
  const fxl = (s) => (rows('fx').find((r) => r.symbol === s) || {}).last;
  kv('fx-k-usd', () => ({ text: N(fxl('USD'), 4) }));
  kv('fx-k-usd-c', () => { const t = W('TRY'); return t && { text: 'TRY ' + PC(t.m1) + ' 1M vs USD', tone: t.m1 }; });
  kv('fx-k-eur', () => ({ text: N(fxl('EUR'), 4) }));
  kv('fx-k-bsk', () => { const b = rows('fx_basket')[0]; return b && { text: N(b.basket, 4) }; });
  kv('fx-k-1y', () => { const f = rows('fx_fwd').find((r) => r.tenor === '1Y'); return f && { text: N(f.fwd, 2) }; });
  kv('fx-k-1y-c', () => { const f = rows('fx_fwd').find((r) => r.tenor === '1Y'); return f && { text: 'implied ' + PC(f.dep_period, 1) + ' · survey ' + N(f.survey12, 2) }; });
  kv('fx-k-vol', () => { const v = rows('fx_rvol'); const l = v[v.length - 1]; return l && { text: N(l.vol20, 1) + '%' }; });
  kv('fx-k-reer', () => { const r = rows('fx_reer'); const l = r[r.length - 1], y = r[r.length - 13]; return l && { text: N(l.all, 2) }; });
  kv('fx-k-reer-c', () => { const r = rows('fx_reer'); const l = r[r.length - 1], y = r[r.length - 13]; return l && y && { text: PC((l.all / y.all - 1) * 100, 1) + ' y/y · ' + TT.mShort(TT.parseD(l.date)) + (TT.parseD(l.date).getUTCMonth() ? ' ' + l.date.slice(0, 4) : ''), tone: l.all - y.all, inv: true }; });
  kv('fx-k-dxy', () => { const r = rows('gq2').find((x) => x.symbol === 'DX-Y.NYB'); return r && { text: N(r.current_price, 2) }; });

  // TRY monitor
  dash.draw('fx-try', (tb) => {
    tb.replaceChildren();
    rows('try_mon').sort((a, b) => (a.code === 'USD' ? -1 : b.code === 'USD' ? 1 : 0)).forEach((r) => {
      const tr = tb.insertRow(); cell(tr, (r.scale > 1 ? r.scale + ' ' : '') + r.code + '/TRY', r.code === 'USD' || r.code === 'EUR' ? 'yl' : 'hi'); cell(tr, r.name, 'mu');
      cell(tr, N(r.per, dp(r.per)), 'r');
      ['w1', 'm1', 'm3', 'm6'].forEach((k) => { const td = cell(tr, PC(r[k]), 'r'); td.style.background = heat(r[k] == null ? null : -r[k], 6); });
    });
  });
  dash.draw('fx-matrix', (tb) => {
    const m = rows('fx_matrix'); const C = m.map((r) => r.ccy);
    const tbl = tb.closest('table'); const head = tbl.tHead; head.replaceChildren(); const hr = head.insertRow(); const th0 = document.createElement('th'); th0.textContent = '1 unit of ↓ in →'; hr.appendChild(th0); C.forEach((c) => { const th = document.createElement('th'); th.className = 'r'; th.textContent = c; hr.appendChild(th); });
    tb.replaceChildren();
    m.forEach((r) => { const tr = tb.insertRow(); cell(tr, r.ccy, 'hi'); C.forEach((c) => { const v = r[c]; const td = cell(tr, v == null ? '—' : N(v, dp(v)), 'r' + (c === 'TRY' || r.ccy === 'TRY' ? ' yl' : '')); if (v == null) td.style.background = '#1a1a1a'; }); });
  });
  dash.draw('fx-usdtry', (el) => {
    const u = rows('usd').filter((r) => typeof r.close === 'number').sort((a, b) => a.date < b.date ? -1 : 1); if (!u.length) return;
    const f = rows('fx_fwd');
    TT.chart(el, [{ name: 'USD/TRY, CBRT daily', color: '#ffa028', width: 2.2, area: true, values: u.map((r) => ({ x: TT.parseD(r.date), y: r.close })) }], { height: 230, yFmt: (v) => N(v, 2), tipFmt: (v) => N(v, 4) });
  });

  // WCRS: world currencies
  let wPer = 'm1', wReg = 'ALL';
  dash.draw('fx-wcrs-bars', (el) => {
    d3.select(el).selectAll('*').remove();
    const d = rows('wcrs').filter((r) => wReg === 'ALL' || r.region === wReg).filter((r) => r[wPer] != null).sort((a, b) => b[wPer] - a[wPer]);
    if (!d.length) return;
    const Wd = Math.max(300, el.clientWidth), rowH = 16, m = { t: 6, r: 56, b: 22, l: 128 }, H = m.t + m.b + d.length * rowH;
    const ext = d3.max(d, (r) => Math.abs(r[wPer])) || 1;
    const x = d3.scaleLinear().domain([-ext, ext]).range([m.l, Wd - m.r]).nice();
    const svg = d3.select(el).append('svg').attr('width', Wd).attr('height', H).attr('role', 'img').attr('aria-label', 'Currency performance versus the US dollar');
    svg.append('g').attr('class', 'grid').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickSize(-(H - m.t - m.b)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat((v) => v + '%').tickSizeOuter(0));
    svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', m.t).attr('y2', H - m.b).style('stroke', '#5a5a5a');
    const g = svg.append('g').selectAll('g').data(d).join('g').attr('transform', (r, i) => `translate(0,${m.t + i * rowH})`);
    g.append('text').attr('x', m.l - 6).attr('y', rowH / 2 + 3.5).attr('text-anchor', 'end').style('fill', (r) => r.code === 'TRY' ? '#ffd23c' : '#cfcfcf').style('font-size', '10.5px').text((r) => r.code + ' · ' + r.name);
    const an = TT.anim && TT.motion();
    const b = g.append('rect').attr('y', 2).attr('height', rowH - 4).style('fill', (r) => r[wPer] >= 0 ? '#2ee66b' : '#ff4545').style('opacity', 0.85).attr('x', an ? x(0) : (r) => Math.min(x(0), x(r[wPer]))).attr('width', an ? 0 : (r) => Math.abs(x(r[wPer]) - x(0)));
    if (an) b.transition().delay((r, i) => i * 20).duration(600).ease(d3.easeCubicOut).attr('x', (r) => Math.min(x(0), x(r[wPer]))).attr('width', (r) => Math.abs(x(r[wPer]) - x(0)));
    g.append('text').attr('x', (r) => r[wPer] >= 0 ? x(r[wPer]) + 4 : x(r[wPer]) - 4).attr('text-anchor', (r) => r[wPer] >= 0 ? 'start' : 'end').attr('y', rowH / 2 + 3.5).style('fill', '#e8e8e8').style('font-size', '10px').text((r) => PC(r[wPer]));
  });
  dash.draw('fx-wcrs', (tb) => {
    tb.replaceChildren(); let g = null;
    rows('wcrs').filter((r) => wReg === 'ALL' || r.region === wReg).forEach((r) => {
      if (r.region !== g && wReg === 'ALL') { g = r.region; const tr = tb.insertRow(); const td = cell(tr, g.toUpperCase(), 'am'); td.colSpan = 11; td.style.fontSize = '10px'; td.style.paddingTop = '6px'; }
      const tr = tb.insertRow(); cell(tr, r.code, r.code === 'TRY' ? 'yl' : 'hi'); cell(tr, (r.inv ? r.code + '/USD' : 'USD/' + r.code), 'mu'); cell(tr, N(r.quote, dp(r.quote)), 'r');
      ['w1', 'm1', 'm3', 'm6'].forEach((k) => { const td = cell(tr, PC(r[k]), 'r'); td.style.background = heat(r[k]); });
      spark(tr.insertCell(), r.spark, (r.m6 || 0) >= 0 ? '#2ee66b' : '#ff4545');
      cell(tr, r.vol == null ? '—' : N(r.vol, 1) + '%', 'r'); cell(tr, r.pos52 == null ? '—' : N(r.pos52, 0) + '%', 'r mu');
    });
  });
  document.addEventListener('click', (e) => {
    const p = e.target.closest && e.target.closest('[data-fxper]'); if (p) { wPer = p.dataset.fxper; document.querySelectorAll('[data-fxper]').forEach((x) => x.setAttribute('aria-pressed', String(x === p))); TT.anim = true; dash.draw('fx-wcrs-bars'); TT.anim = false; return; }
    const r = e.target.closest && e.target.closest('[data-fxreg]'); if (r) { wReg = r.dataset.fxreg; document.querySelectorAll('[data-fxreg]').forEach((x) => x.setAttribute('aria-pressed', String(x === r))); TT.anim = true; dash.draw('fx-wcrs-bars'); dash.draw('fx-wcrs'); TT.anim = false; }
  });

  // FRD: forwards
  dash.draw('fx-fwd', (tb) => {
    tb.replaceChildren();
    rows('fx_fwd').forEach((r) => {
      const tr = tb.insertRow(); cell(tr, r.tenor, 'hi'); cell(tr, N(r.days, 0), 'r mu'); cell(tr, N(r.try_rate, 2) + '%', 'r'); cell(tr, N(r.usd_rate, 2) + '%', 'r');
      cell(tr, N(r.fwd, 4), 'r yl'); cell(tr, N(r.points, 0), 'r'); cell(tr, PC(r.dep_period, 2), 'r'); cell(tr, N(r.dep_ann, 2) + '%', 'r'); cell(tr, N(r.fwd_eur, 4), 'r');
    });
  });
  dash.draw('fx-fwd-chart', (el) => {
    const f = rows('fx_fwd'); if (!f.length) return;
    const s = [{ name: 'USD/TRY CIP forward', color: '#ffa028', dots: true, width: 2.4, values: [{ x: 0, y: f[0].spot }].concat(f.map((r) => ({ x: r.days / 30.4, y: r.fwd }))) }];
    const y12 = f.find((r) => r.survey12 != null);
    if (y12) s.push({ name: 'CBRT survey: USD/TRY 12 months ahead', color: '#3cc8f0', dots: true, width: 0, values: [{ x: 12, y: y12.survey12 }] });
    TT.xy(el, s, { height: 250, xFmt: (v) => v === 0 ? 'spot' : N(v, 0) + 'M', yFmt: (v) => N(v, 1), tipX: (v) => v === 0 ? 'spot' : N(v, 1) + ' months', tipY: (v) => N(v, 4) });
  });
  let cSort = { k: 'carry_vol', dir: -1 };
  dash.draw('fx-carry', (tb) => {
    tb.replaceChildren();
    rows('wcrs').filter((r) => r.carry != null).sort((a, b) => ((a[cSort.k] ?? -1e9) > (b[cSort.k] ?? -1e9) ? 1 : -1) * cSort.dir).forEach((r) => {
      const tr = tb.insertRow(); cell(tr, r.code, r.code === 'TRY' ? 'yl' : 'hi'); cell(tr, r.name, 'mu'); cell(tr, N(r.policy, 2) + '%', 'r'); tone(cell(tr, sgn(r.carry) + N(Math.abs(r.carry), 2) + ' pp', 'r'), r.carry);
      cell(tr, r.vol == null ? '—' : N(r.vol, 1) + '%', 'r'); const c = cell(tr, r.carry_vol == null ? '—' : N(r.carry_vol, 2), 'r yl'); c.style.background = heat(r.carry_vol, 3);
      const td = cell(tr, PC(r.m6), 'r'); tone(td, r.m6);
      const tot = r.m6 != null && r.carry != null ? r.m6 + r.carry / 2 : null; tone(cell(tr, PC(tot), 'r'), tot);
    });
  });
  document.addEventListener('click', (e) => { const h = e.target.closest && e.target.closest('th[data-carrys]'); if (!h) return; const k = h.dataset.carrys; cSort = { k, dir: cSort.k === k ? -cSort.dir : -1 }; dash.draw('fx-carry'); });

  // FXV: volatility
  dash.draw('fx-rvol', (el) => {
    const v = rows('fx_rvol'); if (!v.length) return;
    TT.chart(el, [{ name: 'USD/TRY 20-day realised volatility, annualised %', color: '#c86bff', width: 2.2, area: true, values: v.map((r) => ({ x: TT.parseD(r.date), y: r.vol20 })) }], { height: 220, yFmt: (x) => N(x, 1) + '%', tipFmt: (x) => N(x, 2) + '%' });
  });
  dash.draw('fx-dchg', (el) => {
    const v = rows('fx_rvol'); if (!v.length) return;
    TT.bars(el, v.map((r) => ({ x: TT.parseD(r.date), y: r.dchg })), { height: 160, label: 'USD/TRY daily change, %', color: '#ffa028', yFmt: (x) => N(x, 2) + '%', tipFmt: (x) => PC(x, 3), signColor: true });
  });
  dash.draw('fx-vol-bars', (el) => {
    d3.select(el).selectAll('*').remove();
    const d = rows('wcrs').filter((r) => r.vol != null).sort((a, b) => b.vol - a.vol); if (!d.length) return;
    const Wd = Math.max(300, el.clientWidth), rowH = 15, m = { t: 6, r: 50, b: 22, l: 60 }, H = m.t + m.b + d.length * rowH;
    const x = d3.scaleLinear().domain([0, d3.max(d, (r) => r.vol) * 1.05]).range([m.l, Wd - m.r]).nice();
    const svg = d3.select(el).append('svg').attr('width', Wd).attr('height', H).attr('role', 'img').attr('aria-label', 'Realised volatility by currency');
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat((v) => v + '%').tickSizeOuter(0));
    const g = svg.append('g').selectAll('g').data(d).join('g').attr('transform', (r, i) => `translate(0,${m.t + i * rowH})`);
    g.append('text').attr('x', m.l - 6).attr('y', rowH / 2 + 3.5).attr('text-anchor', 'end').style('fill', (r) => r.code === 'TRY' ? '#ffd23c' : '#cfcfcf').style('font-size', '10.5px').text((r) => r.code);
    g.append('rect').attr('x', m.l).attr('y', 2).attr('height', rowH - 4).attr('width', (r) => x(r.vol) - m.l).style('fill', (r) => r.region === 'G10' ? '#3cc8f0' : '#ffa028').style('opacity', 0.85);
    g.append('text').attr('x', (r) => x(r.vol) + 4).attr('y', rowH / 2 + 3.5).style('fill', '#e8e8e8').style('font-size', '10px').text((r) => N(r.vol, 1) + '%');
  });

  // CBRT FX: REER and operations
  dash.draw('fx-reer', (el) => {
    const r = rows('fx_reer'); if (!r.length) return;
    TT.chart(el, [['All countries', 'all', '#ffa028', 2.4], ['Emerging economies', 'em', '#3cc8f0', 1.5], ['Advanced economies', 'dm', '#2ee66b', 1.5]].map(([n, k, c, w]) => ({ name: n, color: c, width: w, values: r.map((x) => ({ x: TT.parseD(x.date), y: x[k] })) })), { height: 240, yFmt: (v) => N(v, 0), tipFmt: (v) => N(v, 2), refs: [{ y: 100, label: '2025 = 100' }] });
  });
  dash.draw('fx-ops', (el) => {
    const r = rows('fx_ops'); if (!r.length) return;
    TT.chart(el, [{ name: 'CBRT swaps outstanding, sell-side, $ bn', color: '#ffa028', width: 2.2, values: r.map((x) => ({ x: TT.parseD(x.date), y: x.swap_sell })) }, { name: 'buy-side, $ bn', color: '#3cc8f0', values: r.map((x) => ({ x: TT.parseD(x.date), y: x.swap_buy })) }, { name: 'TRY-settled FX forwards sold, $ bn', color: '#c86bff', values: r.map((x) => ({ x: TT.parseD(x.date), y: x.fwd_total })) }], { height: 240, yFmt: (v) => N(v, 1), tipFmt: (v) => '$' + N(v, 2) + ' bn' });
  });
  dash.draw('fx-ops-table', (tb) => {
    tb.replaceChildren(); const r = rows('fx_ops'); if (!r.length) return; const L = r[r.length - 1], B4 = r[r.length - 5], B0 = r[0];
    [['CBRT FX/TRY & gold swaps, sell-side stock', 'swap_sell'], ['CBRT swaps, buy-side stock', 'swap_buy'], ['TRY-settled FX forwards sold (BIST + CBRT)', 'fwd_total'], ['  of which at the CBRT', 'fwd_cbrt']].forEach(([n, k]) => {
      const tr = tb.insertRow(); cell(tr, n, n.startsWith('  ') ? 'mu' : 'hi'); cell(tr, '$' + N(L[k], 2) + ' bn', 'r');
      const c4 = B4 ? L[k] - B4[k] : null, c0 = L[k] - B0[k]; tone(cell(tr, c4 == null ? '—' : sgn(c4) + N(Math.abs(c4), 2), 'r'), c4, true); tone(cell(tr, sgn(c0) + N(Math.abs(c0), 2), 'r'), c0, true);
    });
  });
})();
