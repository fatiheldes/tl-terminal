
// ---- Drawings ----
(function () {
  const C = ['#ffa028', '#3cc8f0', '#e8e8e8', '#c86bff', '#2ee66b', '#ff6b9a'];
  const sgn = (v) => v > 0 ? '+' : v < 0 ? '−' : '';
  const txt = (name, id, field, fmt, rowPick, tone) => dash.draw(name, (el) => {
    const d = dash.data(id);
    if (d.status === 'loading') { el.classList.add('dash-skeleton'); return; }
    el.classList.remove('dash-skeleton');
    const rows = d.status === 'ok' ? (Array.isArray(d.data) ? d.data : []) : [];
    const r = rowPick ? rows.find(rowPick) : rows[0];
    const v = r ? r[field] : null;
    el.textContent = v != null ? fmt(v, r) : '—';
    if (tone) { el.classList.toggle('up', typeof v === 'number' && v > 0); el.classList.toggle('dn', typeof v === 'number' && v < 0); }
  });
  const sym = (s) => (r) => r.symbol === s;
  txt('k-tlref', 'ozet', 'tlref', TT.pct);
  txt('k-chg', 'ozet', 'tlref_degisim_bp', TT.bp, null, true);
  txt('k-aofm', 'ozet', 'aofm', TT.pct);
  txt('k-repo', 'ozet', 'bist_repo', TT.pct);
  txt('k-spread', 'ozet', 'tlref_aofm_bp', TT.bp, null, true);
  txt('k-ima', 'fiyatlama', 'ima_ortalama_on', TT.pct);
  txt('k-ima-fark', 'fiyatlama', 'aofm_farki_bp', TT.bp, null, true);
  txt('k-usd', 'fx', 'last', (v) => TT.f4(v), sym('USD'));
  txt('k-usd-chg', 'usd_ozet', 'degisim_yuzde', (v) => sgn(v) + '%' + TT.f2(Math.abs(v)), null, true);
  txt('k-eur', 'fx', 'last', (v) => TT.f4(v), sym('EUR'));
  txt('k-altin', 'fx', 'last', (v) => TT.f2(v), sym('gram-altin'));
  txt('k-brent', 'fx', 'last', (v) => TT.f2(v), sym('BRENT'));
  txt('k-bist', 'bist', 'value', (v) => TT.f2(v));
  txt('k-bist-chg', 'bist', 'change_percent', (v) => sgn(v) + '%' + TT.f2(Math.abs(v)), null, true);
  txt('k-tlref-s', 'ozet', 'tlref', TT.pct);
  txt('k-tlref-tarih', 'ozet', 'tarih', (v) => TT.dt(v));
  txt('k-chg-s', 'ozet', 'tlref_degisim_bp', TT.bp);
  txt('f-gun', 'fiyatlama', 'gun', (v) => TT.f0(v));
  txt('f-ort', 'fiyatlama', 'ima_ortalama_on', TT.pct);
  txt('f-fark', 'fiyatlama', 'aofm_farki_bp', (v) => TT.f0(Math.abs(v)));
  txt('f-yon', 'fiyatlama', 'aofm_farki_bp', (v) => v < 0 ? 'altında (indirim fiyatlanıyor)' : v > 0 ? 'üstünde (artış fiyatlanıyor)' : 'aynısı');

  // Istanbul clock (not data)
  dash.draw('saat', {
    mount: (el) => {
      const f = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const tick = () => { el.textContent = f.format(new Date()); };
      tick();
      return setInterval(tick, 1000);
    },
    update: () => {},
    unmount: (el, id) => clearInterval(id)
  });

  // Borsa connector is sometimes briefly unavailable: retry a failed source a few times, staggered.
  const tries = {}, pending = {};
  dash.onData(() => {
    ['fx', 'bist', 'usd', 'cal_this', 'cal_next'].forEach((id, i) => {
      const d = dash.data(id);
      if (d.status === 'error' && (tries[id] || 0) < 3 && !pending[id]) {
        tries[id] = (tries[id] || 0) + 1; pending[id] = true;
        setTimeout(() => { pending[id] = false; dash.refresh(id); }, 3000 * tries[id] + 1200 * i);
      }
    });
  });

  const failNote = (el, msg) => { d3.select(el).selectAll('*').remove(); const p = document.createElement('div'); p.className = 'tt-empty'; p.textContent = msg; el.appendChild(p); };

  dash.draw('ch-oranlar', (el) => {
    const d = dash.data('rates');
    if (d.status === 'error') return failNote(el, 'Faiz verisi yüklenemedi.');
    if (d.status !== 'ok') return;
    const rows = d.data.slice().sort((a, b) => a.tarih < b.tarih ? -1 : 1);
    const ser = (k) => rows.filter((r) => r[k] != null).map((r) => ({ x: TT.parseD(r.tarih), y: r[k] }));
    TT.chart(el, [
      { name: 'TLREF', color: C[0], values: ser('tlref') },
      { name: 'TCMB AOFM', color: C[2], step: true, width: 1.5, values: ser('aofm') },
      { name: 'BIST O/N repo', color: C[1], dash: true, width: 1.2, values: ser('bist_repo') }
    ], { height: 250 });
  });

  dash.draw('ch-patika', (el) => {
    const e = dash.data('egri'), o = dash.data('ozet');
    if (e.status === 'error' || o.status === 'error') return failNote(el, 'Bono ya da faiz verisi yüklenemedi.');
    if (e.status !== 'ok' || o.status !== 'ok') return;
    const pts = e.data || [], oz = (o.data || [])[0];
    if (!pts.length) return failNote(el, 'Vadesi dolmamış hazine bonosu bulunamadı.');
    const t0 = TT.parseD(pts[0].tarih);
    const path = [{ x: t0, y: pts[0].ima_forward_on }];
    pts.forEach((p, i) => { if (i > 0) path.push({ x: TT.parseD(pts[i - 1].vade), y: p.ima_forward_on }); });
    path.push({ x: TT.parseD(pts[pts.length - 1].vade), y: pts[pts.length - 1].ima_forward_on });
    const avg = pts.map((p) => ({ x: TT.parseD(p.vade), y: p.ima_ortalama_on }));
    const series = [
      { name: 'İma forward O/N', color: C[0], step: true, width: 2.5, values: path },
      { name: 'Vadeye kadar ortalama', color: C[1], dots: true, values: [{ x: t0, y: pts[0].ima_forward_on }].concat(avg) }
    ];
    const refs = [];
    if (oz && oz.tlref != null) refs.push({ y: oz.tlref, label: 'TLREF ' + TT.pct(oz.tlref) });
    if (oz && oz.aofm != null) refs.push({ y: oz.aofm, label: 'AOFM ' + TT.pct(oz.aofm) });
    TT.chart(el, series, { height: 240, refs, xDomain: [t0, TT.parseD(pts[pts.length - 1].vade)], continuous: true });
  });

  dash.draw('t-egri', (tb) => {
    const e = dash.data('egri');
    tb.replaceChildren();
    if (e.status !== 'ok') { if (e.status === 'error') { const tr = tb.insertRow(); const td = tr.insertCell(); td.colSpan = 7; td.className = 'tt-empty'; td.textContent = 'Bono verisi yüklenemedi.'; } return; }
    (e.data || []).forEach((r) => {
      const tr = tb.insertRow();
      [[r.kod, 'hi'], [TT.dt(r.vade)], [TT.f0(r.gun), 'num'], [TT.f3(r.fiyat), 'num'], [TT.pct(r.ois_esdegeri), 'num'], [TT.pct(r.ima_ortalama_on), 'num'], [TT.pct(r.ima_forward_on), 'num']].forEach(([v, c]) => { const td = tr.insertCell(); td.textContent = v; if (c) td.className = c; });
    });
  });

  dash.draw('ch-gecmis', (el) => {
    const g = dash.data('bono_gecmis'), r = dash.data('rates');
    if (g.status === 'error' || r.status === 'error') return failNote(el, 'Veri yüklenemedi.');
    if (g.status !== 'ok' || r.status !== 'ok') return;
    const rows = g.data || [];
    if (!rows.length) return failNote(el, 'Bono verisi yok.');
    const start = d3.min(rows, (d) => d.tarih);
    const codes = Array.from(new Set(rows.map((d) => d.kod)));
    const series = codes.map((k, i) => ({ name: k, color: C[[1, 3, 4, 5][i % 4]], values: rows.filter((d) => d.kod === k).sort((a, b) => a.tarih < b.tarih ? -1 : 1).map((d) => ({ x: TT.parseD(d.tarih), y: d.ima_ortalama_on })) }));
    const rr = r.data.filter((d) => d.tarih >= start).sort((a, b) => a.tarih < b.tarih ? -1 : 1);
    series.unshift({ name: 'TLREF', color: C[0], values: rr.filter((d) => d.tlref != null).map((d) => ({ x: TT.parseD(d.tarih), y: d.tlref })) });
    series.push({ name: 'TCMB AOFM', color: '#8a8a8a', step: true, dash: true, width: 1.2, values: rr.filter((d) => d.aofm != null).map((d) => ({ x: TT.parseD(d.tarih), y: d.aofm })) });
    TT.chart(el, series, { height: 250 });
  });

  const names = { USD: 'USD/TRY', EUR: 'EUR/TRY', 'gram-altin': 'ALTIN GR/TL', BRENT: 'BRENT $/VARİL' };
  dash.draw('t-fx', (tb) => {
    const d = dash.data('fx');
    tb.replaceChildren();
    if (d.status !== 'ok') { if (d.status === 'error') { const tr = tb.insertRow(); const td = tr.insertCell(); td.colSpan = 3; td.className = 'tt-empty'; td.textContent = 'Piyasa verisi yok.'; } return; }
    d.data.forEach((r) => {
      const tr = tb.insertRow(); tr.dataset.key = encodeURIComponent(r.symbol);
      const a = tr.insertCell(); a.className = 'hi'; a.textContent = names[r.symbol] || r.symbol;
      const b = tr.insertCell(); b.className = 'num'; b.textContent = typeof r.last === 'number' ? (r.last < 100 ? TT.f4(r.last) : TT.f2(r.last)) : String(r.last);
      const c = tr.insertCell(); c.className = 'num'; c.textContent = r.as_of ? TT.dt(r.as_of) : '—';
    });
  });

  dash.draw('ch-usd', (el) => {
    const d = dash.data('usd');
    if (d.status === 'error') return failNote(el, 'USD/TRY geçmişi yok.');
    if (d.status !== 'ok') return;
    const v = d.data.filter((r) => typeof r.close === 'number').map((r) => ({ x: TT.parseD(r.date), y: r.close }));
    TT.chart(el, [{ name: 'USD/TRY kapanış · 3 ay', color: C[0], values: v }], { height: 165, yFmt: (x) => TT.f1(x), tipFmt: (x) => TT.f4(x) });
  });

  dash.draw('t-takvim', (tb) => {
    const d = dash.data('takvim');
    tb.replaceChildren();
    if (d.status !== 'ok') return;
    (d.data || []).forEach((r) => {
      const tr = tb.insertRow(); tr.dataset.key = encodeURIComponent(r.time) + ',' + encodeURIComponent(r.event);
      const t = String(r.time || r.date); const dd = TT.parseD(t);
      const a = tr.insertCell(); a.className = 'hi'; a.textContent = TT.dShort(dd) + (t.length > 10 ? ' ' + t.slice(11, 16) : '');
      const b = tr.insertCell(); b.textContent = r.event;
      const c = tr.insertCell(); c.textContent = r.importance === 'high' ? 'YÜKSEK' : r.importance === 'medium' ? 'ORTA' : r.importance === 'low' ? 'DÜŞÜK' : String(r.importance || '');
      if (r.importance === 'high') c.className = 'dn';
      const e = tr.insertCell(); e.className = 'num'; e.textContent = r.previous == null ? '' : String(r.previous);
    });
  });
  dash.draw('t-takvim-bos', (el) => {
    const d = dash.data('takvim');
    el.className = '';
    if (d.status === 'error') { el.className = 'tt-empty'; el.textContent = 'Takvim yok.'; return; }
    if (d.status === 'ok' && !(d.data || []).length) { el.className = 'tt-empty'; el.textContent = 'Bu iki hafta için Türkiye verisi yok.'; return; }
    el.textContent = '';
  });
})();
