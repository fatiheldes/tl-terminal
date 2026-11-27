// KAAN tab: a friendly Fenerbahçe-vs-Galatasaray joke page on top of real BIST club-stock data.
// Prices are real (Yahoo Finance via Borsa); ratings, headlines and the "pain index" are jokes, not advice.
(function () {
  const P = window.TTparse;
  ['kq', 'kh1y', 'kh1m'].forEach((id) => dash.loader(id, { description: '', fn: P.tsv }));
  const isN = (v) => typeof v === 'number' && isFinite(v);
  const R2 = (v) => isN(v) ? Math.round(v * 100) / 100 : null;
  const CLUBS = { FENER: { name: 'Fenerbahçe', color: '#ffd23c', note: 'GÜÇLÜ AL', why: 'Tarihsel büyüklük henüz fiyatlanmadı' },
    GSRAY: { name: 'Galatasaray', color: '#ff4545', note: 'SAT', why: 'Gerekçe: Kaan alıyor' },
    BJKAS: { name: 'Beşiktaş', color: '#d0d0d0', note: 'TUT', why: 'Komşuya saygı, pozisyona mesafe' },
    TSPOR: { name: 'Trabzonspor', color: '#3cc8f0', note: 'TUT', why: 'Karadeniz primi dahil' } };
  window.KAAN_CLUBS = CLUBS;
  const closes = (rows, s) => { const r = (rows || []).find((x) => x.symbol === s); return r && Array.isArray(r.data) ? r.data.filter((d) => isN(d.close)).map((d) => ({ date: String(d.date).slice(0, 10), close: d.close })) : []; };
  dash.calc('k_tbl', { inputs: ['kq', 'kh1m', 'kh1y'], title: 'k_tbl', fn: (q, m, y) => {
    const t = (q || []).filter((r) => CLUBS[r.symbol] && isN(r.current_price)).map((r) => {
      const c1 = closes(m, r.symbol), cy = closes(y, r.symbol);
      const px = r.current_price;
      return { sym: r.symbol, name: CLUBS[r.symbol].name, color: CLUBS[r.symbol].color, note: CLUBS[r.symbol].note, why: CLUBS[r.symbol].why, px, mcap: r.market_cap, pb: r.pb_ratio, hi: r.week_52_high, lo: r.week_52_low,
        from_hi: isN(r.week_52_high) ? R2((px / r.week_52_high - 1) * 100) : null, to_lo: isN(r.week_52_low) ? R2((px / r.week_52_low - 1) * 100) : null,
        m1: c1.length ? R2((px / c1[0].close - 1) * 100) : null, y1: cy.length ? R2((px / cy[0].close - 1) * 100) : null, spark: c1.map((d) => d.close), hist1m: c1, hist1y: cy };
    }).sort((a, b) => (b.mcap || 0) - (a.mcap || 0));
    t.forEach((r, i) => { r.rank = i + 1; });
    return t;
  } });
  dash.calc('k_pain', { inputs: ['k_tbl'], title: 'k_pain', fn: (t) => {
    const g = (t || []).find((r) => r.sym === 'GSRAY'), f = (t || []).find((r) => r.sym === 'FENER'); if (!g || !f) return [];
    const cl = (v) => Math.max(0, Math.min(100, v));
    const parts = [
      ['52 haftalık zirveden düşüş', cl(Math.abs(Math.min(0, g.from_hi || 0)) * 1.4), (g.from_hi || 0).toFixed(0) + '%'],
      ['Son 1 ay Fener\'e göre', cl(50 + ((f.m1 || 0) - (g.m1 || 0)) * 5), ((g.m1 || 0) - (f.m1 || 0) >= 0 ? '+' : '') + ((g.m1 || 0) - (f.m1 || 0)).toFixed(1) + ' puan'],
      ['Defter değerine iskonto', cl((1 - (g.pb || 1)) * 140), 'P/DD ' + (g.pb || 0).toFixed(2) + '×'],
      ['Piyasa değeri sıralaması', g.rank === 1 ? 0 : g.rank === 2 ? 60 : 100, g.rank + '. sıra']];
    const score = Math.round(d3.mean(parts, (p) => p[1]));
    return [{ score, parts, label: score >= 75 ? 'AKUT' : score >= 55 ? 'KRONİK' : score >= 35 ? 'HAFİF SIZI' : 'KAAN BUGÜN MUTLU' }];
  } });
})();

(function () {
  const L = d3.formatLocale({ decimal: ',', thousands: '.', grouping: [3], currency: ['', ''] });
  const N = (v, d) => v == null || isNaN(v) ? '—' : L.format(',.' + (d == null ? 2 : d) + 'f')(v);
  const isN = (v) => typeof v === 'number' && isFinite(v);
  const sgn = (v) => v > 0 ? '+' : v < 0 ? '−' : '';
  const PC = (v) => isN(v) ? sgn(v) + N(Math.abs(v), 1) + '%' : '—';
  const rows = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : []; };
  const tone = (el, v) => { el.classList.toggle('up', isN(v) && v > 0.004); el.classList.toggle('dn', isN(v) && v < -0.004); };
  const cell = (tr, text, cls) => { const td = tr.insertCell(); td.textContent = text; if (cls) td.className = cls; return td; };
  const C = (s) => rows('k_tbl').find((r) => r.sym === s);
  const BN = (v) => isN(v) ? N(v / 1e9, 1) + ' mlr TL' : '—';
  const kv = (name, fn) => dash.draw(name, (el) => { const r = fn(); el.textContent = r && r.text != null ? r.text : '—'; if (r && 'tone' in r) tone(el, r.tone); });

  kv('kn-k-big', () => { const f = C('FENER'); return f && { text: f.rank === 1 ? '#1' : '#' + f.rank }; });
  kv('kn-k-big-c', () => { const f = C('FENER'); return f && { text: f.rank === 1 ? 'piyasa değerinde lider · ' + BN(f.mcap) : 'geçici teknik sapma · ' + BN(f.mcap) }; });
  kv('kn-k-ratio', () => { const f = C('FENER'), g = C('GSRAY'); return f && g && { text: N(f.mcap / g.mcap, 2) + '×' }; });
  kv('kn-k-ratio-c', () => { const f = C('FENER'), g = C('GSRAY'); return f && g && { text: 'Fener / Galatasaray piyasa değeri' }; });
  kv('kn-k-fener', () => { const f = C('FENER'); return f && { text: N(f.px) + ' TL' }; });
  kv('kn-k-fener-c', () => { const f = C('FENER'); return f && { text: '1A ' + PC(f.m1) + ' · not: ' + f.note, tone: f.m1 }; });
  kv('kn-k-gs', () => { const g = C('GSRAY'); return g && { text: N(g.px) + ' TL' }; });
  kv('kn-k-gs-c', () => { const g = C('GSRAY'); return g && { text: '1A ' + PC(g.m1) + ' · zirveden ' + PC(g.from_hi), tone: g.m1 }; });
  kv('kn-k-pb', () => { const g = C('GSRAY'); return g && { text: N(g.pb) + '×' }; });
  kv('kn-k-pb-c', () => { const g = C('GSRAY'); return g && { text: isN(g.pb) && g.pb < 1 ? 'GSRAY P/DD: piyasa defterin ' + N(g.pb * 100, 0) + '%\'ini veriyor' : 'GSRAY P/DD' }; });
  kv('kn-k-pain', () => { const p = rows('k_pain')[0]; return p && { text: p.score + '/100' }; });
  kv('kn-k-pain-c', () => { const p = rows('k_pain')[0]; return p && { text: 'Kaan Acı Endeksi · ' + p.label }; });

  dash.draw('kn-tbl', (tb) => {
    tb.replaceChildren();
    rows('k_tbl').forEach((r) => {
      const tr = tb.insertRow(); if (r.sym === 'FENER') tr.className = 'kn-fb';
      cell(tr, r.rank + '.', 'mu'); const s = cell(tr, r.sym, ''); s.style.color = r.color; s.style.fontWeight = 700; cell(tr, r.name, 'hi');
      cell(tr, N(r.px), 'r yl'); cell(tr, BN(r.mcap), 'r'); cell(tr, isN(r.pb) ? N(r.pb) + '×' : '—', 'r');
      tone(cell(tr, PC(r.m1), 'r'), r.m1); tone(cell(tr, PC(r.y1), 'r'), r.y1); tone(cell(tr, PC(r.from_hi), 'r'), r.from_hi);
      const n = cell(tr, r.note, 'r'); n.className = 'r ' + (r.note === 'GÜÇLÜ AL' ? 'up' : r.note === 'SAT' ? 'dn' : 'am'); n.style.fontWeight = 700;
      cell(tr, r.why, 'mu').style.fontSize = '10.5px';
    });
  });
  dash.draw('kn-league', (el) => {
    const t = rows('k_tbl'); if (!t.length) return;
    TT.hbars(el, t.map((r) => ({ label: r.rank + '. ' + r.name, v: r.mcap / 1e9, color: r.color, hl: r.sym === 'FENER' })), { lw: 150, rh: 24, fmt: (v) => N(v, 1) + ' mlr' });
  });
  const reb = (h) => h.length ? h.map((d) => ({ x: TT.parseD(d.date), y: d.close / h[0].close * 100 })) : [];
  const lines = (key) => (el) => {
    const t = rows('k_tbl'); if (!t.length) return;
    const order = ['GSRAY', 'BJKAS', 'TSPOR', 'FENER'];
    TT.chart(el, order.map((s) => t.find((r) => r.sym === s)).filter(Boolean).map((r) => ({ name: r.sym === 'GSRAY' ? 'GSRAY (Kaan\'ın portföyü)' : r.sym === 'FENER' ? 'FENER (en büyük)' : r.name, color: r.color, width: r.sym === 'FENER' ? 3 : 1.4, dash: r.sym === 'GSRAY', values: reb(r[key]) })),
      { height: 230, yFmt: (v) => N(v, 0), tipFmt: (v) => N(v, 1), refs: [{ y: 100, label: '100' }] });
  };
  dash.draw('kn-1m', lines('hist1m'));
  dash.draw('kn-1y', lines('hist1y'));

  dash.draw('kn-pain', (el) => {
    el.replaceChildren(); const p = rows('k_pain')[0]; if (!p) return;
    const head = document.createElement('div'); head.className = 'ov-gauge';
    head.innerHTML = `<div class="ov-gl" style="color:${p.score >= 55 ? 'var(--dn)' : 'var(--am)'}">${p.label} · ${p.score}/100</div><div class="ov-gb kn-gb"><span style="left:${p.score}%"></span></div><div class="ov-gs">0 = Kaan mutlu · 100 = Kaan telefonu kapattı</div>`;
    el.appendChild(head);
    const t = document.createElement('table'); t.className = 'tb'; const tb = t.createTBody(); el.appendChild(t);
    p.parts.forEach(([n, v, s]) => { const tr = tb.insertRow(); cell(tr, n, 'hi'); cell(tr, s, 'r yl'); const td = tr.insertCell(); td.style.width = '45%'; const b = document.createElement('div'); b.className = 'kn-bar'; b.style.width = Math.round(v) + '%'; td.appendChild(b); cell(tr, Math.round(v) + '', 'r mu'); });
  });

  dash.draw('kn-wire', (el) => {
    el.replaceChildren(); const f = C('FENER'), g = C('GSRAY'); if (!f || !g) return;
    const now = (window.TT_ASOF || '').slice(11, 16) || '09:35';
    const h = [];
    h.push(f.rank === 1 ? 'FENERBAHÇE PİYASA DEĞERİNDE ZİRVEDE: "EN BÜYÜK" ARTIK SLOGAN DEĞİL, VERİ (' + BN(f.mcap) + ')' : 'FENERBAHÇE PİYASA DEĞERİNDE GEÇİCİ TEKNİK MOLADA; YÖNETİM "ZİRVE KISA SÜREDE GERİ ALINACAK" DİYOR');
    if (isN(g.pb) && g.pb < 1) h.push('GSRAY DEFTER DEĞERİNİN ' + N(g.pb * 100, 0) + '%\'İNDEN İŞLEM GÖRÜYOR: MUHASEBECİLER PİYASADAN DAHA İYİMSER');
    if (isN(g.from_hi)) h.push('GSRAY 52 HAFTALIK ZİRVESİNİN ' + PC(g.from_hi) + ' ALTINDA; KAAN: "BU BİR DÜŞÜŞ DEĞİL, İNDİRİM"');
    if (isN(g.to_lo) && g.to_lo < 12) h.push('GSRAY 52 HAFTALIK DİBE ' + N(g.to_lo, 1) + '% MESAFEDE: TERMİNAL KAAN İÇİN DESTEK HATTI AÇTI');
    if (isN(f.y1) && isN(g.y1) && f.y1 < g.y1) h.push('FENER 1 YILDA ' + PC(f.y1) + ', GSRAY ' + PC(g.y1) + ': SARI-LACİVERT YATIRIMCILAR BUNA "BÜYÜKLÜĞÜN VOLATİLİTESİ" DİYOR');
    if (isN(f.m1) && isN(g.m1)) h.push(f.m1 >= g.m1 ? 'SON 1 AYDA FENER GSRAY\'İ ' + N(f.m1 - g.m1, 1) + ' PUAN GERİDE BIRAKTI; KAAN YORUM YAPMAYI REDDETTİ' : 'SON 1 AYDA GSRAY ÖNDE (' + PC(g.m1) + '); ANALİSTLER: "TEKNİK TEPKİ, KAAN ERKEN SEVİNMESİN"');
    h.push('KAAN: "GELECEK SEZON BİZİM" — TERMİNAL AÇIKLAMAYI ARŞİVE ALDI, AYNI CÜMLENİN YIL İÇİNDEKİ KAÇINCI TEKRARI OLDUĞU HESAPLANIYOR');
    h.push('ANALİSTLER: KAAN\'IN SARSILMAZ İYİMSERLİĞİ KORUNMASI GEREKEN NADİR BİR VARLIK');
    h.push('KAAN PORTFÖYÜNÜ ÇEŞİTLENDİRME ÖNERİSİNİ REDDETTİ: "TEK HİSSE, TEK AŞK"');
    h.push('KAAN\'A GÖRE SON DÜŞÜŞLER "UZUN VADELİ STRATEJİNİN PARÇASI"; UZUN VADE HENÜZ TANIMLANMADI');
    h.push('TCMB FAİZİ DEĞERLENDİRİYOR; KAAN\'IN BEKLENTİLERİ İSE ENFLASYON KADAR YÜKSEK');
    h.forEach((t, i) => { const d = document.createElement('div'); d.className = 'kn-hl'; const tm = document.createElement('span'); tm.className = 'kn-t'; tm.textContent = i === 0 ? now : '•'; const x = document.createElement('span'); x.textContent = t; d.append(tm, x); el.appendChild(d); });
  });

  dash.draw('kn-alerts', (el) => {
    el.replaceChildren(); const f = C('FENER'), g = C('GSRAY'); if (!f || !g) return;
    const a = [];
    if (f.rank === 1) a.push(['high', 'EN BÜYÜK', 'Fenerbahçe piyasa değerinde 1. sırada (' + BN(f.mcap) + ')']);
    if (f.mcap > g.mcap) a.push(['high', 'FARK', 'Fener, Galatasaray\'dan ' + N(f.mcap / g.mcap, 2) + ' kat büyük (piyasa değeri)']);
    if (isN(g.pb) && g.pb < 1) a.push(['medium', 'İSKONTO', 'GSRAY defter değerinin altında: P/DD ' + N(g.pb) + '×']);
    if (isN(g.to_lo) && g.to_lo < 12) a.push(['medium', 'DİP', 'GSRAY 52 haftalık dibe %' + N(g.to_lo, 1) + ' uzaklıkta']);
    if (isN(g.m1) && isN(f.m1) && g.m1 > f.m1) a.push(['low', 'DİKKAT', 'GSRAY son 1 ayda Fener\'den iyi (' + PC(g.m1) + ' vs ' + PC(f.m1) + '); muhtemelen geçici']);
    a.push(['low', 'KAAN', 'Kaan\'ın bu sayfayı açma olasılığı: yüksek. Tepki olasılığı: çok yüksek.']);
    a.forEach(([lv, k, t]) => { const d = document.createElement('div'); d.className = lv; const b = document.createElement('span'); b.className = 'lv'; b.textContent = lv === 'high' ? 'HIGH' : lv === 'medium' ? 'MED' : 'LOW'; const kk = document.createElement('span'); kk.className = 'k'; kk.textContent = k; const m = document.createElement('span'); m.textContent = t; d.append(b, kk, m); el.appendChild(d); });
  });
})();
