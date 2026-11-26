// ---- Parsers: raw connector answers -> rows ----
(function () {
  const toText = (a) => typeof a === 'string' ? a : (a && Array.isArray(a.content)) ? a.content.map((c) => c.text || '').join('\n') : (a && a.text) || JSON.stringify(a);
  const num = (v) => (v === '' || v == null) ? null : (isNaN(Number(v)) ? v : Number(v));
  // EVDS markdown table. names: header -> column name
  const md = (names) => ({ answer }) => {
    const text = toText(answer);
    const lines = text.split('\n').filter((l) => l.trim().startsWith('|'));
    if (lines.length < 2) throw new Error(text.slice(0, 300));
    const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim());
    const head = cells(lines[0]).map((h) => h === 'Tarih' ? 'tarih' : (names && names[h]) || h.replace(/^TP_/, ''));
    const rows = lines.slice(2).map((l) => {
      const c = cells(l), o = {};
      head.forEach((h, i) => {
        const v = c[i] == null ? '' : c[i];
        if (h === 'tarih') {
          const p = v.split('-');
          o.tarih = p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : p[0] + '-' + String(p[1]).padStart(2, '0') + '-01';
        } else if (h === 'YEARWEEK') o[h] = v;
        else o[h] = num(v);
      });
      return o;
    });
    return { columns: head, rows };
  };
  // Borsa ```tsv block. Cells that look like JSON arrays are parsed.
  const tsv = ({ answer }) => {
    const text = toText(answer);
    const m = text.match(/```tsv\s*\n([\s\S]*?)```/);
    if (!m) { if (/error|hata|unavailable/i.test(text)) throw new Error(text.slice(0, 300)); return { columns: [], rows: [] }; }
    const ls = m[1].trim().split('\n').filter((l) => l.trim());
    const head = ls[0].split('\t').map((h) => h.trim());
    const rows = ls.slice(1).map((l) => {
      const c = l.split('\t'), o = {};
      head.forEach((h, i) => {
        const v = (c[i] || '').trim();
        if (v.startsWith('[')) { try { o[h] = JSON.parse(v); return; } catch (e) { /* keep text */ } }
        o[h] = (h === 'date' || h === 'time' || h === 'as_of' || h === 'previous' || h === 'symbol' || h === 'name') ? v : num(v);
      });
      return o;
    });
    return { columns: head, rows };
  };
  const kv = ({ answer }) => {
    const text = toText(answer);
    const i = text.indexOf('## index');
    if (i < 0) throw new Error(text.slice(0, 300));
    const o = {};
    text.slice(i + 8).split('\n').forEach((l) => { const k = l.indexOf(':'); if (k > 0) { const v = l.slice(k + 1).trim(); o[l.slice(0, k).trim()] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v; } });
    return [o];
  };
  const L = (id, fn) => dash.loader(id, { description: '', fn });
  L('rates', md({ TP_BISTTLREF_ORAN: 'tlref', TP_APIFON4: 'aofm', TP_AOFOBAP: 'bist_repo' }));
  L('bills', md(null));
  L('pka', md({ TP_PKAUO_S01_D_U: 'tufe_ys', TP_PKAUO_S01_E_U: 'tufe_12a', TP_PKAUO_S04_C_U: 'ppk_ilk', TP_PKAUO_S04_H_U: 'ppk_ys', TP_PKAUO_S04_D_U: 'ppk_12a', TP_PKAUO_S05_C_U: 'usd_12a' }));
  L('reserves', md({ TP_AB_TOPLAM: 'toplam', TP_AB_C1: 'altin', TP_AB_C2: 'doviz' }));
  ['fx', 'usd', 'gold_hist', 'xu100_hist', 'crypto', 'bist_quotes', 'bist_hist', 'us_quotes', 'inflation', 'cal_this', 'cal_next', 'cal_global'].forEach((id) => L(id, tsv));
  L('bist', kv);
})();

// ---- Calculations ----
const TRB_MAT = (k) => { const m = /^TRB(\d{2})(\d{2})(\d{2})/.exec(k); return m ? Date.UTC(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null; };
const R2 = (v) => v == null || isNaN(v) ? null : Math.round(v * 100) / 100;
const C = (id, inputs, fn) => dash.calc(id, { inputs, fn, title: id });

C('ozet', ['rates'], (rates) => {
  const r = rates.filter((d) => d.tlref != null).sort((a, b) => a.tarih < b.tarih ? -1 : 1);
  if (r.length < 2) return [];
  const s = r[r.length - 1], p = r[r.length - 2];
  return [{ tarih: s.tarih, tlref: R2(s.tlref), tlref_degisim_bp: Math.round((s.tlref - p.tlref) * 100), aofm: R2(s.aofm), bist_repo: R2(s.bist_repo), tlref_aofm_bp: s.aofm == null ? null : Math.round((s.tlref - s.aofm) * 100) }];
});

C('egri', ['bills'], (bills) => {
  if (!bills.length) return [];
  const codes = Object.keys(bills[0]).filter((k) => TRB_MAT(k) != null);
  const rows = bills.filter((b) => codes.some((k) => b[k] != null)).sort((a, b) => a.tarih < b.tarih ? -1 : 1);
  const last = rows[rows.length - 1];
  if (!last) return [];
  const t0 = Date.parse(last.tarih + 'T00:00:00Z');
  const pts = codes.filter((k) => last[k] != null).map((k) => ({ kod: k, vade: new Date(TRB_MAT(k)).toISOString().slice(0, 10), gun: Math.round((TRB_MAT(k) - t0) / 864e5), fiyat: last[k] })).filter((p) => p.gun > 0).sort((a, b) => a.gun - b.gun);
  let pg = 1, pd = 0;
  return pts.map((p) => {
    const g = 100 / p.fiyat;
    const out = { kod: p.kod, tarih: last.tarih, vade: p.vade, gun: p.gun, fiyat: p.fiyat, ois_esdegeri: R2((g - 1) * 365 / p.gun * 100), ima_ortalama_on: R2(365 * (Math.pow(g, 1 / p.gun) - 1) * 100), ima_forward_on: R2(365 * (Math.pow(g / pg, 1 / (p.gun - pd)) - 1) * 100) };
    pg = g; pd = p.gun;
    return out;
  });
});

C('fiyatlama', ['egri', 'ozet'], (egri, ozet) => {
  const e = (egri || [])[0], o = (ozet || [])[0];
  if (!e || !o || o.aofm == null) return [];
  return [{ kod: e.kod, gun: e.gun, ima_ortalama_on: e.ima_ortalama_on, aofm: o.aofm, aofm_farki_bp: Math.round((e.ima_ortalama_on - o.aofm) * 100) }];
});

C('bono_gecmis', ['bills'], (bills) => {
  if (!bills.length) return [];
  const codes = Object.keys(bills[0]).filter((k) => TRB_MAT(k) != null);
  const out = [];
  bills.forEach((b) => {
    const t = Date.parse(b.tarih + 'T00:00:00Z');
    codes.forEach((k) => {
      if (b[k] == null) return;
      const d = Math.round((TRB_MAT(k) - t) / 864e5);
      if (d < 5) return;
      out.push({ tarih: b.tarih, kod: k, gun: d, ima_ortalama_on: Math.round(365 * (Math.pow(100 / b[k], 1 / d) - 1) * 10000) / 100 });
    });
  });
  return out;
});

C('takvim', ['cal_this', 'cal_next'], (a, b) => {
  const seen = new Set();
  return (a || []).concat(b || []).filter((r) => { const k = r.time + '|' + r.event; if (seen.has(k)) return false; seen.add(k); return true; }).sort((x, y) => String(x.time) < String(y.time) ? -1 : 1);
});

C('usd_ozet', ['usd'], (usd) => {
  const r = (usd || []).filter((d) => typeof d.close === 'number').sort((a, b) => a.date < b.date ? -1 : 1);
  if (r.length < 2) return [];
  const s = r[r.length - 1], p = r[r.length - 2];
  return [{ date: s.date, close: s.close, degisim_yuzde: R2((s.close - p.close) / p.close * 100) }];
});

// FX table with crosses
C('fx_tablo', ['fx'], (fx) => {
  const g = (s) => { const r = (fx || []).find((x) => x.symbol === s); return r && typeof r.last === 'number' ? r : null; };
  const usd = g('USD'), eur = g('EUR'), gbp = g('GBP'), chf = g('CHF'), jpy = g('JPY');
  const out = [];
  const add = (kod, son, tarih, d) => { if (son != null && !isNaN(son)) out.push({ kod, son, tarih, d }); };
  if (usd) add('USD/TRY', usd.last, usd.as_of, 4);
  if (eur) add('EUR/TRY', eur.last, eur.as_of, 4);
  if (gbp) add('GBP/TRY', gbp.last, gbp.as_of, 4);
  if (chf) add('CHF/TRY', chf.last, chf.as_of, 4);
  if (jpy) add('100 JPY/TRY', jpy.last, jpy.as_of, 4);
  if (eur && usd) add('EUR/USD', eur.last / usd.last, eur.as_of, 4);
  if (gbp && usd) add('GBP/USD', gbp.last / usd.last, gbp.as_of, 4);
  if (chf && usd) add('USD/CHF', usd.last / chf.last, usd.as_of, 4);
  if (jpy && usd) add('USD/JPY', usd.last / jpy.last * 100, usd.as_of, 2);
  return out;
});

C('emtia', ['fx', 'crypto'], (fx, crypto) => {
  const g = (s) => { const r = (fx || []).find((x) => x.symbol === s); return r && typeof r.last === 'number' ? r.last : null; };
  const c = (s) => { const r = (crypto || []).find((x) => x.symbol === s); return r && typeof r.price === 'number' ? r.price : null; };
  const usd = g('USD'), gram = g('gram-altin'), brent = g('BRENT'), btc = c('BTC-USD'), eth = c('ETH-USD');
  const out = [];
  if (gram != null) out.push({ ad: 'Gram altın', son: gram, birim: '₺/g', d: 2 });
  if (gram != null && usd) out.push({ ad: 'Ons altın (türetilmiş)', son: gram / usd * 31.1035, birim: '$/oz', d: 2 });
  if (brent != null) out.push({ ad: 'Brent', son: brent, birim: '$/varil', d: 2 });
  if (btc != null) out.push({ ad: 'Bitcoin', son: btc, birim: '$', d: 0 });
  if (btc != null && usd) out.push({ ad: 'Bitcoin', son: btc * usd, birim: '₺', d: 0 });
  if (eth != null) out.push({ ad: 'Ethereum', son: eth, birim: '$', d: 2 });
  return out;
});

C('bist_tablo', ['bist_quotes', 'bist_hist'], (q, h) => {
  return (q || []).map((r) => {
    const hh = (h || []).find((x) => x.symbol === r.symbol);
    const d = hh && Array.isArray(hh.data) ? hh.data.slice().sort((a, b) => a.date < b.date ? -1 : 1) : [];
    const last = d.length ? d[d.length - 1].close : null, prev = d.length > 1 ? d[d.length - 2].close : null, first = d.length ? d[0].close : null;
    const px = typeof r.current_price === 'number' ? r.current_price : last;
    return { symbol: r.symbol, son: px, gun: prev ? R2((px - prev) / prev * 100) : null, g5: first ? R2((px - first) / first * 100) : null, fk: r.pe_ratio, pddd: r.pb_ratio, temettu: r.dividend_yield, pd_mlr: typeof r.market_cap === 'number' ? r.market_cap / 1e9 : null, dip: r.week_52_low, tepe: r.week_52_high, hacim_mn: typeof r.volume === 'number' ? r.volume / 1e6 : null };
  });
});

C('makro_ozet', ['inflation', 'pka', 'ozet', 'reserves', 'usd'], (inf, pka, ozet, rez, usd) => {
  const i = (inf || []).filter((x) => typeof x.rate === 'number').sort((a, b) => a.date < b.date ? -1 : 1);
  const p = (pka || []).slice().sort((a, b) => a.tarih < b.tarih ? -1 : 1);
  const z = (rez || []).filter((x) => typeof x.toplam === 'number').sort((a, b) => a.tarih < b.tarih ? -1 : 1);
  const u = (usd || []).filter((x) => typeof x.close === 'number').sort((a, b) => a.date < b.date ? -1 : 1);
  const o = (ozet || [])[0] || {};
  const li = i[i.length - 1], lp = p[p.length - 1], lz = z[z.length - 1], pz = z[z.length - 2], lu = u[u.length - 1];
  return [{
    tufe: li ? li.rate : null, tufe_ay: li ? li.change : null, tufe_tarih: li ? li.date : null,
    tufe_ys: lp ? lp.tufe_ys : null, tufe_12a: lp ? lp.tufe_12a : null, ppk_ilk: lp ? lp.ppk_ilk : null, ppk_ys: lp ? lp.ppk_ys : null, ppk_12a: lp ? lp.ppk_12a : null, usd_12a: lp ? lp.usd_12a : null,
    reel_ante: lp && o.tlref != null ? R2(o.tlref - lp.tufe_12a) : null,
    reel_post: li && o.tlref != null ? R2(o.tlref - li.rate) : null,
    rez: lz ? lz.toplam / 1000 : null, rez_chg: lz && pz ? (lz.toplam - pz.toplam) / 1000 : null,
    usd_12a_fark: lp && lu ? R2((lp.usd_12a / lu.close - 1) * 100) : null
  }];
});
