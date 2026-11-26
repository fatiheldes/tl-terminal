
// ---- Loaders: connector answers -> rows ----
dash.loader('rates', { description: 'EVDS tablosunu satırlara çevirir; tarihi YYYY-AA-GG yapar ve sütunlara ad verir (tlref, aofm, bist_repo).', fn: ({ answer }) => {
  const text = typeof answer === 'string' ? answer : (answer && Array.isArray(answer.content)) ? answer.content.map((c) => c.text || '').join('\n') : (answer && answer.text) || JSON.stringify(answer);
  const lines = text.split('\n').filter((l) => l.trim().startsWith('|'));
  if (lines.length < 2) throw new Error(text.slice(0, 300));
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim());
  const names = { Tarih: 'tarih', TP_BISTTLREF_ORAN: 'tlref', TP_APIFON4: 'aofm', TP_AOFOBAP: 'bist_repo' };
  const head = cells(lines[0]).map((h) => names[h] || h);
  const rows = lines.slice(2).map((l) => {
    const c = cells(l), o = {};
    head.forEach((h, i) => { if (h === 'tarih') { const p = c[i].split('-'); o.tarih = p[2] + '-' + p[1] + '-' + p[0]; } else o[h] = (c[i] === '' || c[i] == null) ? null : Number(c[i]); });
    return o;
  });
  return { columns: head, rows };
}});

dash.loader('bills', { description: 'EVDS tablosunu satırlara çevirir; her sütun bir hazine bonosunun TCMB gösterge fiyatıdır, adı ISIN kodudur (ör. TRB100227T13).', fn: ({ answer }) => {
  const text = typeof answer === 'string' ? answer : (answer && Array.isArray(answer.content)) ? answer.content.map((c) => c.text || '').join('\n') : (answer && answer.text) || JSON.stringify(answer);
  const lines = text.split('\n').filter((l) => l.trim().startsWith('|'));
  if (lines.length < 2) throw new Error(text.slice(0, 300));
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim());
  const head = cells(lines[0]).map((h) => h === 'Tarih' ? 'tarih' : h.replace(/^TP_/, ''));
  const rows = lines.slice(2).map((l) => {
    const c = cells(l), o = {};
    head.forEach((h, i) => { if (h === 'tarih') { const p = c[i].split('-'); o.tarih = p[2] + '-' + p[1] + '-' + p[0]; } else o[h] = (c[i] === '' || c[i] == null) ? null : Number(c[i]); });
    return o;
  });
  return { columns: head, rows };
}});

['fx', 'usd', 'cal_this', 'cal_next'].forEach((id) => dash.loader(id, { description: 'Borsa cevabındaki sekmeyle ayrılmış tabloyu satırlara çevirir; sayı olan hücreleri sayıya çevirir.', fn: ({ answer }) => {
  const text = typeof answer === 'string' ? answer : (answer && Array.isArray(answer.content)) ? answer.content.map((c) => c.text || '').join('\n') : (answer && answer.text) || JSON.stringify(answer);
  const m = text.match(/```tsv\s*\n([\s\S]*?)```/);
  if (!m) { if (/error|hata|unavailable/i.test(text)) throw new Error(text.slice(0, 300)); return { columns: [], rows: [] }; }
  const ls = m[1].trim().split('\n').filter((l) => l.trim());
  const head = ls[0].split('\t').map((h) => h.trim());
  const rows = ls.slice(1).map((l) => { const c = l.split('\t'); const o = {}; head.forEach((h, i) => { const v = (c[i] || '').trim(); o[h] = /^-?\d+(\.\d+)?$/.test(v) && h !== 'date' ? Number(v) : v; }); return o; });
  return { columns: head, rows };
}}));

dash.loader('bist', { description: 'Borsa endeks cevabındaki "alan: değer" satırlarını tek satıra çevirir.', fn: ({ answer }) => {
  const text = typeof answer === 'string' ? answer : (answer && Array.isArray(answer.content)) ? answer.content.map((c) => c.text || '').join('\n') : (answer && answer.text) || JSON.stringify(answer);
  const i = text.indexOf('## index');
  if (i < 0) throw new Error(text.slice(0, 300));
  const o = {};
  text.slice(i + 8).split('\n').forEach((l) => { const k = l.indexOf(':'); if (k > 0) { const key = l.slice(0, k).trim(); const v = l.slice(k + 1).trim(); o[key] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v; } });
  return [o];
}});

// ---- Calculations ----
dash.calc('ozet', { inputs: ['rates'], title: 'Günün özeti', description: 'Son yayımlanan TLREF, AOFM ve BIST repo; TLREF\'in önceki iş gününe göre değişimi ve TLREF−AOFM farkı (baz puan).', fn: (rates) => {
  const r = rates.filter((d) => d.tlref != null).sort((a, b) => a.tarih < b.tarih ? -1 : 1);
  if (r.length < 2) return [];
  const s = r[r.length - 1], p = r[r.length - 2];
  const rd = (v) => v == null ? null : Math.round(v * 100) / 100;
  return [{ tarih: s.tarih, tlref: rd(s.tlref), tlref_degisim_bp: Math.round((s.tlref - p.tlref) * 100), aofm: rd(s.aofm), bist_repo: rd(s.bist_repo), tlref_aofm_bp: s.aofm == null ? null : Math.round((s.tlref - s.aofm) * 100) }];
}});

dash.calc('egri', { inputs: ['bills'], title: 'Yaklaşık OIS eğrisi', description: 'Son günün bono fiyatlarından: vade ISIN kodundan okunur (TRBggaayy), OIS eşdeğeri = (100/P−1)×365/gün, ima O/N = 365×((100/P)^(1/gün)−1), forward = önceki bonodan bu bonoya kadar aynı hesap.', fn: (bills) => {
  const mat = (k) => { const m = /^TRB(\d{2})(\d{2})(\d{2})/.exec(k); return m ? Date.UTC(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null; };
  if (!bills.length) return [];
  const codes = Object.keys(bills[0]).filter((k) => mat(k) != null);
  const rows = bills.filter((b) => codes.some((k) => b[k] != null)).sort((a, b) => a.tarih < b.tarih ? -1 : 1);
  const last = rows[rows.length - 1];
  if (!last) return [];
  const t0 = Date.parse(last.tarih + 'T00:00:00Z');
  const pts = codes.filter((k) => last[k] != null).map((k) => ({ kod: k, vade: new Date(mat(k)).toISOString().slice(0, 10), gun: Math.round((mat(k) - t0) / 864e5), fiyat: last[k] })).filter((p) => p.gun > 0).sort((a, b) => a.gun - b.gun);
  let pg = 1, pd = 0;
  const rd = (v) => Math.round(v * 100) / 100;
  return pts.map((p) => {
    const g = 100 / p.fiyat;
    const out = { kod: p.kod, tarih: last.tarih, vade: p.vade, gun: p.gun, fiyat: p.fiyat, ois_esdegeri: rd((g - 1) * 365 / p.gun * 100), ima_ortalama_on: rd(365 * (Math.pow(g, 1 / p.gun) - 1) * 100), ima_forward_on: rd(365 * (Math.pow(g / pg, 1 / (p.gun - pd)) - 1) * 100) };
    pg = g; pd = p.gun;
    return out;
  });
}});

dash.calc('fiyatlama', { inputs: ['egri', 'ozet'], title: 'Piyasa fiyatlaması', description: 'En kısa vadeli bononun ima ettiği ortalama gecelik faiz ile son TCMB fonlama maliyeti arasındaki fark (baz puan).', fn: (egri, ozet) => {
  const e = (egri || [])[0], o = (ozet || [])[0];
  if (!e || !o || o.aofm == null) return [];
  return [{ kod: e.kod, gun: e.gun, ima_ortalama_on: e.ima_ortalama_on, aofm: o.aofm, aofm_farki_bp: Math.round((e.ima_ortalama_on - o.aofm) * 100) }];
}});

dash.calc('bono_gecmis', { inputs: ['bills'], title: 'Bono ima O/N geçmişi', description: 'Her gün ve her bono için vadeye kadarki ima edilen ortalama gecelik faiz: 365×((100/P)^(1/gün)−1); vadeye 5 günden az kalan günler çıkarılır.', fn: (bills) => {
  const mat = (k) => { const m = /^TRB(\d{2})(\d{2})(\d{2})/.exec(k); return m ? Date.UTC(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null; };
  if (!bills.length) return [];
  const codes = Object.keys(bills[0]).filter((k) => mat(k) != null);
  const out = [];
  bills.forEach((b) => {
    const t = Date.parse(b.tarih + 'T00:00:00Z');
    codes.forEach((k) => {
      if (b[k] == null) return;
      const d = Math.round((mat(k) - t) / 864e5);
      if (d < 5) return;
      out.push({ tarih: b.tarih, kod: k, gun: d, ima_ortalama_on: Math.round(365 * (Math.pow(100 / b[k], 1 / d) - 1) * 10000) / 100 });
    });
  });
  return out;
}});

dash.calc('takvim', { inputs: ['cal_this', 'cal_next'], title: 'Ekonomik takvim', description: 'Bu haftanın ve gelecek haftanın Türkiye verileri, zamana göre sıralı.', fn: (cal_this, cal_next) => {
  const seen = new Set();
  return (cal_this || []).concat(cal_next || []).filter((r) => { const k = r.time + '|' + r.event; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => String(a.time) < String(b.time) ? -1 : 1);
}});

dash.calc('usd_ozet', { inputs: ['usd'], title: 'USD/TRY günlük değişim', description: 'Son iki kapanış arasındaki yüzde değişim.', fn: (usd) => {
  const r = (usd || []).filter((d) => typeof d.close === 'number').sort((a, b) => a.date < b.date ? -1 : 1);
  if (r.length < 2) return [];
  const s = r[r.length - 1], p = r[r.length - 2];
  return [{ date: s.date, close: s.close, degisim_yuzde: Math.round((s.close - p.close) / p.close * 10000) / 100 }];
}});
