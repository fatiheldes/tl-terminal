// ---- Drawings ----
(function () {
  const C = ['#ffa028', '#3cc8f0', '#e8e8e8', '#c86bff', '#2ee66b', '#ff6b9a', '#ffd23c'];
  const L = d3.formatLocale({ decimal: ',', thousands: '.', grouping: [3], currency: ['', ''] });
  const nf = (d) => L.format(',.' + d + 'f');
  const N = (v, d) => v == null || isNaN(v) ? '—' : nf(d == null ? 2 : d)(v);
  const sgn = (v) => v > 0 ? '+' : v < 0 ? '−' : '';
  const P = (v) => v == null || isNaN(v) ? '—' : sgn(v) + '%' + nf(2)(Math.abs(v));
  const tone = (el, v) => { el.classList.toggle('up', typeof v === 'number' && v > 0); el.classList.toggle('dn', typeof v === 'number' && v < 0); };
  const rows = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : []; };
  const first = (id) => rows(id)[0] || null;

  // ---- tabs ----
  const PAGES = ['piyasa', 'faiz', 'makro', 'hisse', 'takvim'];
  function show(name) {
    if (!PAGES.includes(name)) name = 'piyasa';
    document.querySelectorAll('section.page').forEach((s) => { s.hidden = s.id !== name; });
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    try { history.replaceState(null, '', '#' + name); } catch (e) { /* file:// */ }
    if (window.TTrun) window.TTrun();
  }
  window.TTshow = show;
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
    document.addEventListener('keydown', (e) => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      const i = ['1', '2', '3', '4', '5'].indexOf(e.key);
      if (i >= 0 && !e.metaKey && !e.ctrlKey && !e.altKey) show(PAGES[i]);
    });
    show((location.hash || '#piyasa').slice(1));
  });

  // ---- clock ----
  dash.draw('saat', { mount: (el) => { const f = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }); const t = () => { el.textContent = f.format(new Date()); }; t(); return setInterval(t, 1000); }, update: () => {}, unmount: (el, id) => clearInterval(id) });

  // ---- simple value drawings ----
  const val = (name, id, field, fmt, toned) => dash.draw(name, (el) => {
    const r = first(id); const v = r ? r[field] : null;
    el.textContent = v != null ? fmt(v, r) : '—';
    if (toned) tone(el, v);
  });
  val('k-tlref', 'ozet', 'tlref', TT.pct); val('k-tlref-s', 'ozet', 'tlref', TT.pct);
  val('k-tlref-tarih', 'ozet', 'tarih', (v) => TT.dt(v));
  val('k-chg', 'ozet', 'tlref_degisim_bp', TT.bp, true); val('k-chg-s', 'ozet', 'tlref_degisim_bp', TT.bp);
  val('k-aofm', 'ozet', 'aofm', TT.pct); val('k-repo', 'ozet', 'bist_repo', TT.pct);
  val('k-spread', 'ozet', 'tlref_aofm_bp', TT.bp, true);
  val('k-ima', 'fiyatlama', 'ima_ortalama_on', TT.pct); val('k-ima-fark', 'fiyatlama', 'aofm_farki_bp', TT.bp, true);
  val('f-gun', 'fiyatlama', 'gun', (v) => N(v, 0)); val('f-ort', 'fiyatlama', 'ima_ortalama_on', TT.pct);
  val('f-fark', 'fiyatlama', 'aofm_farki_bp', (v) => N(Math.abs(v), 0));
  val('f-yon', 'fiyatlama', 'aofm_farki_bp', (v) => v < 0 ? 'altında (indirim fiyatlanıyor)' : v > 0 ? 'üstünde (artış fiyatlanıyor)' : 'aynısı');
  val('k-ppk', 'makro_ozet', 'ppk_ilk', TT.pct); val('k-ppk-s', 'makro_ozet', 'ppk_ilk', TT.pct);
  val('k-ppk-ys', 'makro_ozet', 'ppk_ys', TT.pct); val('k-ppk-12', 'makro_ozet', 'ppk_12a', TT.pct);
  val('k-tufe', 'makro_ozet', 'tufe', TT.pct);
  val('k-tufe-ay', 'makro_ozet', 'tufe_ay', (v, r) => 'aylık ' + TT.pct(v) + ' · ' + (r.tufe_tarih ? TT.mShort(TT.parseD(r.tufe_tarih)) + ' ' + String(r.tufe_tarih).slice(0, 4) : ''));
  val('k-bek-ys', 'makro_ozet', 'tufe_ys', TT.pct); val('k-bek-12', 'makro_ozet', 'tufe_12a', TT.pct);
  val('k-reel', 'makro_ozet', 'reel_ante', (v) => sgn(v) + N(Math.abs(v), 2) + ' pp', true);
  val('k-reel-post', 'makro_ozet', 'reel_post', (v) => sgn(v) + N(Math.abs(v), 2) + ' pp', true);
  val('k-rez', 'makro_ozet', 'rez', (v) => N(v, 1) + ' mlr $');
  val('k-rez-chg', 'makro_ozet', 'rez_chg', (v) => sgn(v) + N(Math.abs(v), 1) + ' mlr $', true);
  val('k-usd12', 'makro_ozet', 'usd_12a', (v) => N(v, 2));
  val('k-usd12-fark', 'makro_ozet', 'usd_12a_fark', (v) => 'spota göre ' + P(v));

  const fail = (el, msg) => { d3.select(el).selectAll('*').remove(); const p = document.createElement('div'); p.className = 'tt-empty'; p.textContent = msg; el.appendChild(p); };
  const cell = (tr, text, cls) => { const td = tr.insertCell(); td.textContent = text; if (cls) td.className = cls; return td; };
  const rangeCell = (tr, lo, hi, px) => {
    const td = tr.insertCell();
    if ([lo, hi, px].some((x) => typeof x !== 'number') || hi <= lo) { td.textContent = '—'; return; }
    const s = document.createElement('span'); s.className = 'rng';
    const i = document.createElement('i'); i.style.left = Math.max(0, Math.min(100, (px - lo) / (hi - lo) * 100)) + '%';
    s.appendChild(i); td.appendChild(s);
  };

  // ---- ticker tape ----
  dash.draw('tape', (el) => {
    const items = [];
    const o = first('ozet'); if (o) { items.push(['TLREF', TT.pct(o.tlref), o.tlref_degisim_bp, TT.bp(o.tlref_degisim_bp) + 'bp']); items.push(['AOFM', TT.pct(o.aofm)]); }
    const f = first('fiyatlama'); if (f) items.push(['İMA O/N', TT.pct(f.ima_ortalama_on), f.aofm_farki_bp, TT.bp(f.aofm_farki_bp) + 'bp']);
    rows('fx_tablo').forEach((r) => items.push([r.kod, N(r.son, r.d)]));
    const u = first('usd_ozet'); if (u) items.push(['USD/TRY gün', P(u.degisim_yuzde), u.degisim_yuzde]);
    rows('emtia').forEach((r) => items.push([r.ad.replace(' (türetilmiş)', '') + ' ' + r.birim, N(r.son, r.d)]));
    const b = first('bist'); if (b) items.push(['XU100', N(b.value, 2), b.change_percent, P(b.change_percent)]);
    rows('us_quotes').forEach((r) => items.push([r.symbol, N(r.current_price, 2)]));
    rows('bist_tablo').forEach((r) => items.push([r.symbol, N(r.son, 2), r.gun, P(r.gun)]));
    const m = first('makro_ozet'); if (m) { items.push(['TÜFE', TT.pct(m.tufe)]); items.push(['PPK BEKL.', TT.pct(m.ppk_ilk)]); }
    el.replaceChildren();
    const build = () => items.forEach(([k, v, c, ct]) => {
      const s = document.createElement('span'); s.className = 'it';
      const b1 = document.createElement('b'); b1.textContent = k; s.appendChild(b1);
      s.appendChild(document.createTextNode(v));
      if (ct) { const x = document.createElement('span'); x.textContent = ' ' + ct; tone(x, c); s.appendChild(x); }
      el.appendChild(s);
    });
    build(); build();
    el.classList.toggle('run', items.length > 0);
  });

  // ---- PİYASA ----
  dash.draw('t-fx', (tb) => { tb.replaceChildren(); rows('fx_tablo').forEach((r) => { const tr = tb.insertRow(); cell(tr, r.kod, 'hi'); cell(tr, N(r.son, r.d), 'r'); cell(tr, r.tarih ? TT.dt(r.tarih) : '—', 'r mu'); }); if (!tb.rows.length) { const tr = tb.insertRow(); const td = cell(tr, 'Döviz verisi yok.', 'tt-empty'); td.colSpan = 3; } });
  dash.draw('t-emtia', (tb) => { tb.replaceChildren(); rows('emtia').forEach((r) => { const tr = tb.insertRow(); cell(tr, r.ad, 'hi'); cell(tr, N(r.son, r.d), 'r'); cell(tr, r.birim, 'r mu'); }); });
  dash.draw('t-endeks', (tb) => {
    tb.replaceChildren();
    const b = first('bist');
    if (b) { const tr = tb.insertRow(); cell(tr, 'BIST 100', 'hi'); cell(tr, N(b.value, 2), 'r'); tone(cell(tr, P(b.change_percent), 'r'), b.change_percent); cell(tr, '—', 'r mu'); }
    rows('us_quotes').filter((r) => ['SPY', 'QQQ', 'DIA'].includes(r.symbol)).forEach((r) => {
      const tr = tb.insertRow(); cell(tr, { SPY: 'S&P 500 (SPY)', QQQ: 'Nasdaq 100 (QQQ)', DIA: 'Dow Jones (DIA)' }[r.symbol], 'hi'); cell(tr, N(r.current_price, 2), 'r'); cell(tr, '—', 'r mu');
      const td = tr.insertCell(); td.className = 'r'; const s = document.createElement('span'); s.className = 'rng'; const i = document.createElement('i');
      i.style.left = Math.max(0, Math.min(100, (r.current_price - r.week_52_low) / (r.week_52_high - r.week_52_low) * 100)) + '%'; s.appendChild(i); td.appendChild(s);
    });
  });
  dash.draw('heat', (el) => {
    el.replaceChildren();
    const rs = rows('bist_tablo');
    if (!rs.length) return fail(el, 'Hisse verisi yok.');
    const col = d3.scaleLinear().domain([-4, 0, 4]).range(['#ff3b3b', '#3a3a3a', '#22d160']).clamp(true);
    rs.slice().sort((a, b) => (b.gun || 0) - (a.gun || 0)).forEach((r) => {
      const d = document.createElement('div'); d.style.background = col(r.gun || 0); if (Math.abs(r.gun || 0) < 1) d.style.color = '#fff';
      const a = document.createElement('span'); a.textContent = r.symbol; const e = document.createElement('em'); e.textContent = P(r.gun); const s = document.createElement('small'); s.textContent = N(r.son, 2) + ' ₺ · 5G ' + P(r.g5);
      d.append(a, e, s); el.appendChild(d);
    });
  });
  const histChart = (name, id, xField, yField, label, fmt, d) => dash.draw(name, (el) => {
    const rs = rows(id).filter((r) => typeof r[yField] === 'number');
    if (dash.data(id).status === 'error') return fail(el, 'Veri yüklenemedi.');
    if (!rs.length) return fail(el, 'Veri yok.');
    TT.chart(el, [{ name: label, color: C[0], values: rs.map((r) => ({ x: TT.parseD(r[xField]), y: r[yField] })) }], { height: 150, yFmt: fmt, tipFmt: (v) => N(v, d) });
  });
  histChart('ch-xu', 'xu100_hist', 'date', 'close', 'XU100 haftalık kapanış', (v) => N(v, 0), 2);
  histChart('ch-usd', 'usd', 'date', 'close', 'USD/TRY kapanış', (v) => N(v, 1), 4);
  histChart('ch-gold', 'gold_hist', 'date', 'close', 'Gram altın ₺', (v) => N(v, 0), 2);

  // ---- FAİZ ----
  dash.draw('ch-oranlar', (el) => {
    const rs = rows('rates').slice().sort((a, b) => a.tarih < b.tarih ? -1 : 1);
    if (!rs.length) return fail(el, 'Faiz verisi yok.');
    const ser = (k) => rs.filter((r) => r[k] != null).map((r) => ({ x: TT.parseD(r.tarih), y: r[k] }));
    TT.chart(el, [{ name: 'TLREF', color: C[0], values: ser('tlref') }, { name: 'TCMB AOFM', color: C[2], step: true, width: 1.5, values: ser('aofm') }, { name: 'BIST O/N repo', color: C[1], dash: true, width: 1.2, values: ser('bist_repo') }], { height: 230 });
  });
  dash.draw('ch-patika', (el) => {
    const pts = rows('egri'), oz = first('ozet');
    if (!pts.length) return fail(el, 'Vadesi dolmamış hazine bonosu bulunamadı.');
    const t0 = TT.parseD(pts[0].tarih);
    const path = [{ x: t0, y: pts[0].ima_forward_on }];
    pts.forEach((p, i) => { if (i > 0) path.push({ x: TT.parseD(pts[i - 1].vade), y: p.ima_forward_on }); });
    path.push({ x: TT.parseD(pts[pts.length - 1].vade), y: pts[pts.length - 1].ima_forward_on });
    const refs = [];
    if (oz && oz.tlref != null) refs.push({ y: oz.tlref, label: 'TLREF ' + TT.pct(oz.tlref) });
    if (oz && oz.aofm != null) refs.push({ y: oz.aofm, label: 'AOFM ' + TT.pct(oz.aofm) });
    TT.chart(el, [{ name: 'İma forward O/N', color: C[0], step: true, width: 2.5, values: path }, { name: 'Vadeye kadar ortalama', color: C[1], dots: true, values: [{ x: t0, y: pts[0].ima_forward_on }].concat(pts.map((p) => ({ x: TT.parseD(p.vade), y: p.ima_ortalama_on }))) }], { height: 230, refs, xDomain: [t0, TT.parseD(pts[pts.length - 1].vade)], continuous: true });
  });
  dash.draw('t-egri', (tb) => { tb.replaceChildren(); rows('egri').forEach((r) => { const tr = tb.insertRow(); cell(tr, r.kod, 'hi'); cell(tr, TT.dt(r.vade)); cell(tr, N(r.gun, 0), 'r'); cell(tr, N(r.fiyat, 3), 'r'); cell(tr, TT.pct(r.ois_esdegeri), 'r'); cell(tr, TT.pct(r.ima_ortalama_on), 'r'); cell(tr, TT.pct(r.ima_forward_on), 'r'); }); });
  dash.draw('ch-gecmis', (el) => {
    const g = rows('bono_gecmis'), r = rows('rates');
    if (!g.length) return fail(el, 'Bono verisi yok.');
    const start = d3.min(g, (d) => d.tarih);
    const codes = Array.from(new Set(g.map((d) => d.kod)));
    const series = codes.map((k, i) => ({ name: k, color: C[[1, 3, 4, 5][i % 4]], values: g.filter((d) => d.kod === k).sort((a, b) => a.tarih < b.tarih ? -1 : 1).map((d) => ({ x: TT.parseD(d.tarih), y: d.ima_ortalama_on })) }));
    const rr = r.filter((d) => d.tarih >= start).sort((a, b) => a.tarih < b.tarih ? -1 : 1);
    series.unshift({ name: 'TLREF', color: C[0], values: rr.filter((d) => d.tlref != null).map((d) => ({ x: TT.parseD(d.tarih), y: d.tlref })) });
    series.push({ name: 'TCMB AOFM', color: '#8a8a8a', step: true, dash: true, width: 1.2, values: rr.filter((d) => d.aofm != null).map((d) => ({ x: TT.parseD(d.tarih), y: d.aofm })) });
    TT.chart(el, series, { height: 230 });
  });
  dash.draw('ch-ppk', (el) => {
    const p = rows('pka').slice().sort((a, b) => a.tarih < b.tarih ? -1 : 1);
    if (!p.length) return fail(el, 'Anket verisi yok.');
    const s = (k) => p.filter((r) => typeof r[k] === 'number').map((r) => ({ x: TT.parseD(r.tarih), y: r[k] }));
    const a = rows('rates').filter((r) => r.aofm != null && r.tarih >= p[0].tarih).sort((x, y) => x.tarih < y.tarih ? -1 : 1).map((r) => ({ x: TT.parseD(r.tarih), y: r.aofm }));
    TT.chart(el, [{ name: 'İlk toplantı', color: C[0], values: s('ppk_ilk') }, { name: 'Yıl sonu', color: C[1], values: s('ppk_ys') }, { name: '12 ay sonra', color: C[3], values: s('ppk_12a') }, { name: 'TCMB AOFM', color: '#8a8a8a', step: true, dash: true, width: 1.2, values: a }], { height: 230 });
  });

  // ---- MAKRO ----
  dash.draw('ch-tufe', {
    mount: (el) => { const a = document.createElement('div'); a.className = 'tt-chart sm'; const b = document.createElement('div'); b.className = 'tt-chart sm'; b.style.minHeight = '110px'; el.style.minHeight = '0'; el.append(a, b); return { a, b }; },
    update: (el, m) => {
      const i = rows('inflation').filter((r) => typeof r.rate === 'number').sort((x, y) => x.date < y.date ? -1 : 1);
      if (!i.length) return fail(m.a, 'Enflasyon verisi yok.');
      TT.chart(m.a, [{ name: 'TÜFE yıllık %', color: C[0], values: i.map((r) => ({ x: TT.parseD(r.date), y: r.rate })) }], { height: 150 });
      TT.bars(m.b, i.map((r) => ({ x: TT.parseD(r.date), y: r.change })), { height: 110, label: 'Aylık %', color: C[1] });
    }
  });
  dash.draw('ch-bek', (el) => {
    const p = rows('pka').slice().sort((a, b) => a.tarih < b.tarih ? -1 : 1);
    const i = rows('inflation').filter((r) => typeof r.rate === 'number').sort((x, y) => x.date < y.date ? -1 : 1);
    if (!p.length) return fail(el, 'Anket verisi yok.');
    const s = (k) => p.filter((r) => typeof r[k] === 'number').map((r) => ({ x: TT.parseD(r.tarih), y: r[k] }));
    TT.chart(el, [{ name: 'Gerçekleşen TÜFE', color: C[2], values: i.filter((r) => r.date >= p[0].tarih).map((r) => ({ x: TT.parseD(r.date), y: r.rate })) }, { name: 'Yıl sonu beklenti', color: C[0], values: s('tufe_ys') }, { name: '12 ay beklenti', color: C[1], values: s('tufe_12a') }], { height: 260 });
  });
  dash.draw('ch-rez', (el) => {
    const z = rows('reserves').filter((r) => typeof r.toplam === 'number').sort((a, b) => a.tarih < b.tarih ? -1 : 1);
    if (!z.length) return fail(el, 'Rezerv verisi yok.');
    const s = (k) => z.map((r) => ({ x: TT.parseD(r.tarih), y: r[k] / 1000 }));
    TT.chart(el, [{ name: 'Toplam', color: C[0], values: s('toplam') }, { name: 'Altın', color: C[6], values: s('altin') }, { name: 'Döviz', color: C[1], values: s('doviz') }], { height: 260, yFmt: (v) => N(v, 0), tipFmt: (v) => N(v, 1) + ' mlr $' });
  });
  dash.draw('t-anket', (tb) => {
    tb.replaceChildren();
    const p = rows('pka').slice().sort((a, b) => a.tarih < b.tarih ? -1 : 1);
    if (p.length < 2) return;
    const a = p[p.length - 2], b = p[p.length - 1];
    [['Cari yıl sonu TÜFE', 'tufe_ys', 2, '%'], ['12 ay sonrası TÜFE', 'tufe_12a', 2, '%'], ['İlk PPK toplantısı', 'ppk_ilk', 2, '%'], ['Yıl sonu politika faizi', 'ppk_ys', 2, '%'], ['12 ay sonrası politika faizi', 'ppk_12a', 2, '%'], ['12 ay sonrası USD/TRY', 'usd_12a', 4, '']].forEach(([lbl, k, d, u]) => {
      const tr = tb.insertRow(); cell(tr, lbl, 'hi'); cell(tr, u + N(a[k], d), 'r'); cell(tr, u + N(b[k], d), 'r');
      const diff = (typeof a[k] === 'number' && typeof b[k] === 'number') ? b[k] - a[k] : null; cell(tr, diff == null ? '—' : sgn(diff) + N(Math.abs(diff), d), 'r mu');
    });
    const tr = tb.insertRow(); const td = cell(tr, 'Anket ayları: ' + TT.mShort(TT.parseD(a.tarih)) + ' ' + a.tarih.slice(0, 4) + ' → ' + TT.mShort(TT.parseD(b.tarih)) + ' ' + b.tarih.slice(0, 4), 'mu'); td.colSpan = 4;
  });

  // ---- HİSSE ----
  dash.draw('t-bist', (tb) => {
    tb.replaceChildren();
    rows('bist_tablo').forEach((r) => {
      const tr = tb.insertRow(); cell(tr, r.symbol, 'hi'); cell(tr, N(r.son, 2), 'r'); tone(cell(tr, P(r.gun), 'r'), r.gun); tone(cell(tr, P(r.g5), 'r'), r.g5);
      cell(tr, N(r.fk, 1), 'r'); cell(tr, N(r.pddd, 1), 'r'); cell(tr, r.temettu ? N(r.temettu, 2) : '—', 'r'); cell(tr, N(r.pd_mlr, 1), 'r');
      cell(tr, N(r.dip, 2), 'r mu'); rangeCell(tr, r.dip, r.tepe, r.son); cell(tr, N(r.tepe, 2), 'r mu'); cell(tr, N(r.hacim_mn, 1), 'r mu');
    });
  });
  dash.draw('t-us', (tb) => {
    tb.replaceChildren();
    rows('us_quotes').forEach((r) => {
      const tr = tb.insertRow(); cell(tr, r.symbol, 'hi'); cell(tr, String(r.name || '').slice(0, 34)); cell(tr, N(r.current_price, 2), 'r'); cell(tr, N(r.pe_ratio, 1), 'r'); cell(tr, N(r.pb_ratio, 1), 'r');
      cell(tr, typeof r.market_cap === 'number' ? N(r.market_cap / 1e9, 0) : '—', 'r'); cell(tr, N(r.week_52_low, 2), 'r mu'); rangeCell(tr, r.week_52_low, r.week_52_high, r.current_price); cell(tr, N(r.week_52_high, 2), 'r mu');
      const off = typeof r.week_52_high === 'number' ? (r.current_price / r.week_52_high - 1) * 100 : null; tone(cell(tr, P(off), 'r'), off);
    });
  });

  // ---- TAKVİM ----
  const imp = (v) => v === 'high' ? 'YÜKSEK' : v === 'medium' ? 'ORTA' : v === 'low' ? 'DÜŞÜK' : String(v || '');
  const when = (r) => { const t = String(r.time || r.date); return TT.dShort(TT.parseD(t)) + (t.length > 10 ? ' ' + t.slice(11, 16) : ''); };
  dash.draw('t-takvim', (tb) => { tb.replaceChildren(); rows('takvim').forEach((r) => { const tr = tb.insertRow(); cell(tr, when(r), 'hi'); cell(tr, r.event); const c = cell(tr, imp(r.importance)); if (r.importance === 'high') c.className = 'dn'; cell(tr, r.previous == null ? '' : String(r.previous), 'r'); }); });
  dash.draw('t-takvim-bos', (el) => { el.className = ''; el.textContent = rows('takvim').length ? '' : 'Bu iki hafta için Türkiye verisi yok.'; if (!rows('takvim').length) el.className = 'tt-empty'; });
  dash.draw('t-global', (tb) => { tb.replaceChildren(); rows('cal_global').slice().sort((a, b) => String(a.time) < String(b.time) ? -1 : 1).forEach((r) => { const tr = tb.insertRow(); cell(tr, when(r), 'hi'); cell(tr, r.country, 'cy'); cell(tr, r.event); cell(tr, r.previous == null ? '' : String(r.previous), 'r'); }); });
  dash.draw('t-global-bos', (el) => { el.className = ''; el.textContent = rows('cal_global').length ? '' : 'Kaynak bu hafta için küresel yüksek önemli veri döndürmedi.'; if (!rows('cal_global').length) el.className = 'tt-empty'; });
})();
