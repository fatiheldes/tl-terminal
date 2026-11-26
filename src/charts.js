
(function () {
  const L = d3.formatLocale({ decimal: ',', thousands: '.', grouping: [3], currency: ['', ' ₺'] });
  const f2 = L.format(',.2f'), f1 = L.format(',.1f'), f0 = L.format(',.0f'), f4 = L.format(',.4f'), f3 = L.format(',.3f');
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const dt = (s) => { const d = (s instanceof Date) ? s : new Date(String(s).slice(0, 10) + 'T00:00:00Z'); return d.getUTCDate() + ' ' + months[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
  const dShort = (d) => d.getUTCDate() + ' ' + months[d.getUTCMonth()];
  const mShort = (d) => months[d.getUTCMonth()] + (d.getUTCMonth() === 0 ? ' ' + String(d.getUTCFullYear()).slice(2) : '');
  window.TT = {
    pct: (v) => (v == null || isNaN(v)) ? '—' : '%' + f2(v),
    bp: (v) => (v == null || isNaN(v)) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + f0(Math.abs(v)),
    f0, f1, f2, f3, f4, dt, dShort, mShort,
    parseD: (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z'),
    ok: (id) => dash.data(id).status === 'ok',
    settle: (el, ok) => { el.classList.remove('dash-skeleton'); if (!ok) el.textContent = '—'; }
  };

  // Generic line chart. series: [{name, color, dash, step, values:[{x:Date,y}]}]
  window.TT.chart = function (el, series, o) {
    o = o || {};
    d3.select(el).selectAll('*').remove();
    const all = series.flatMap((s) => s.values).filter((v) => v.y != null && !isNaN(v.y));
    if (!all.length) { const p = document.createElement('div'); p.className = 'tt-empty'; p.textContent = o.empty || 'Veri yok.'; el.appendChild(p); return; }
    const lg = d3.select(el).append('div').attr('class', 'tt-legend');
    series.forEach((s) => lg.append('span').attr('class', s.dash ? 'dash' : null).style('--sw', s.color).text(s.name));
    const W = Math.max(260, el.clientWidth), H = o.height || 240;
    const yExt = d3.extent(all.concat((o.refs || []).map((r) => ({ y: r.y }))), (d) => d.y);
    const pad = Math.max(0.25, (yExt[1] - yExt[0]) * 0.08);
    const y = d3.scaleLinear().domain([yExt[0] - pad, yExt[1] + pad]).nice();
    const x = d3.scaleUtc().domain(o.xDomain || d3.extent(all, (d) => d.x));
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', el.getAttribute('aria-label') || 'Grafik');
    const ticksY = H < 200 ? 4 : 5;
    const yFmt = o.yFmt || ((v) => '%' + TT.f0(v));
    const gy = svg.append('g').attr('class', 'axis');
    gy.call(d3.axisLeft(y).ticks(ticksY).tickFormat(yFmt).tickSizeOuter(0));
    let ml = 0; gy.selectAll('text').each(function () { ml = Math.max(ml, this.getComputedTextLength()); });
    const m = { t: 8, r: 14, b: 24, l: Math.ceil(ml) + 12 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    y.range([m.t + ih, m.t]); x.range([m.l, m.l + iw]);
    gy.attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(ticksY).tickFormat(yFmt).tickSizeOuter(0));
    svg.insert('g', ':first-child').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(ticksY).tickSize(-iw).tickFormat(''));
    const nx = Math.max(2, Math.min(7, Math.floor(iw / 80)));
    const span = x.domain()[1] - x.domain()[0];
    const xFmt = span > 100 * 864e5 ? TT.mShort : TT.dShort;
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${m.t + ih})`).call(d3.axisBottom(x).ticks(nx).tickFormat(xFmt).tickSizeOuter(0));
    (o.refs || []).forEach((r) => {
      svg.append('line').attr('x1', m.l).attr('x2', m.l + iw).attr('y1', y(r.y)).attr('y2', y(r.y)).style('stroke', '#5a5a5a').style('stroke-dasharray', '4 3');
      svg.append('text').attr('x', m.l + iw).attr('y', y(r.y) - 4).attr('text-anchor', 'end').style('fill', '#8a8a8a').style('font-size', '10.5px').text(r.label);
    });
    series.forEach((s) => {
      const vals = s.values.filter((v) => v.y != null && !isNaN(v.y));
      const line = d3.line().defined((d) => d.y != null).x((d) => x(d.x)).y((d) => y(d.y)).curve(s.step ? d3.curveStepAfter : d3.curveLinear);
      const pth = svg.append('path').datum(vals).attr('d', line).style('fill', 'none').style('stroke', s.color).style('stroke-width', s.width || 2).style('stroke-dasharray', s.dash ? '5 3' : null);
      if (TT.anim && !s.dash && TT.motion()) { const len = pth.node().getTotalLength(); pth.style('stroke-dasharray', len + ' ' + len).style('stroke-dashoffset', len).transition().duration(1400).ease(d3.easeCubicOut).style('stroke-dashoffset', 0).on('end', function () { d3.select(this).style('stroke-dasharray', null); }); }
      if (s.area && vals.length) { const ar = d3.area().x((d) => x(d.x)).y0(m.t + ih).y1((d) => y(d.y)); const g = svg.insert('path', ':first-child').datum(vals).attr('d', ar).style('fill', s.color).style('opacity', TT.anim && TT.motion() ? 0 : 0.12); if (TT.anim && TT.motion()) g.transition().delay(600).duration(900).style('opacity', 0.12); }
      if (s.dots) svg.append('g').selectAll('circle').data(vals).join('circle').attr('cx', (d) => x(d.x)).attr('cy', (d) => y(d.y)).attr('r', 3.5).style('fill', s.color);
    });
    // tooltip
    const tip = d3.select(el).append('div').attr('class', 'tt-tip').style('display', 'none');
    const rule = svg.append('line').attr('y1', m.t).attr('y2', m.t + ih).style('stroke', '#ffa028').style('stroke-opacity', 0.5).style('display', 'none');
    const xsAll = Array.from(new Set(all.map((d) => +d.x))).sort((a, b) => a - b);
    const near = (vals, t, step) => {
      if (step) { let best = null; for (const v of vals) { if (+v.x <= t) best = v; } return best; }
      let best = null, bd = Infinity; for (const v of vals) { const dd = Math.abs(+v.x - t); if (dd < bd) { bd = dd; best = v; } } return best;
    };
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', iw).attr('height', ih).style('fill', 'transparent')
      .on('pointermove', (ev) => {
        const [px] = d3.pointer(ev);
        const t0 = +x.invert(px);
        const i = d3.bisectLeft(xsAll, t0);
        const cand = [xsAll[i - 1], xsAll[i]].filter((v) => v != null);
        const t = o.continuous ? t0 : cand.reduce((a, b) => Math.abs(b - t0) < Math.abs(a - t0) ? b : a);
        rule.style('display', null).attr('x1', x(t)).attr('x2', x(t));
        tip.selectAll('*').remove();
        tip.append('div').attr('class', 'tt-tip-d').text(TT.dt(new Date(t)));
        series.forEach((s) => {
          const v = near(s.values.filter((q) => q.y != null), t, s.step);
          if (v && (s.step || Math.abs(+v.x - t) < 4 * 864e5)) tip.append('div').text(s.name + ': ' + (o.tipFmt || TT.pct)(v.y));
        });
        const bw = el.clientWidth; const left = x(t) + 12;
        tip.style('display', null).style('top', (m.t + 30) + 'px');
        const tw = tip.node().offsetWidth;
        tip.style('left', (left + tw > bw ? x(t) - tw - 12 : left) + 'px');
      })
      .on('pointerleave', () => { tip.style('display', 'none'); rule.style('display', 'none'); });
  };
  // Simple bar chart: data [{x:Date,y}]
  window.TT.bars = function (el, data, o) {
    o = o || {};
    d3.select(el).selectAll('*').remove();
    if (!data.length) return;
    const lg = d3.select(el).append('div').attr('class', 'tt-legend');
    lg.append('span').style('--sw', o.color).text(o.label || '');
    const W = Math.max(260, el.clientWidth), H = o.height || 110;
    const m = { t: 6, r: 14, b: 22, l: 40 };
    const x = d3.scaleBand().domain(data.map((d) => +d.x)).range([m.l, W - m.r]).padding(0.25);
    const y = d3.scaleLinear().domain([Math.min(0, d3.min(data, (d) => d.y)), Math.max(0, d3.max(data, (d) => d.y))]).nice().range([H - m.b, m.t]);
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', o.label || 'Sütun grafik');
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(3).tickSize(-(W - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(3).tickFormat((v) => '%' + TT.f1(v)).tickSizeOuter(0));
    const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor((W - m.l - m.r) / 60))));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(x.domain().filter((d, i) => i % every === 0)).tickFormat((d) => TT.mShort(new Date(d))).tickSizeOuter(0));
    const tip = d3.select(el).append('div').attr('class', 'tt-tip').style('display', 'none');
    svg.append('g').selectAll('rect').data(data).join('rect')
      .attr('x', (d) => x(+d.x)).attr('width', x.bandwidth())
      .attr('y', (d) => TT.anim && TT.motion() ? y(0) : y(Math.max(0, d.y))).attr('height', (d) => TT.anim && TT.motion() ? 0 : Math.abs(y(d.y) - y(0)))
      .style('fill', o.color || '#3cc8f0')
      .on('pointerenter', (ev, d) => { tip.selectAll('*').remove(); tip.append('div').attr('class', 'tt-tip-d').text(TT.mShort(d.x) + ' ' + d.x.getUTCFullYear()); tip.append('div').text((o.label || '') + ': %' + TT.f2(d.y)); const px = x(+d.x); tip.style('display', null).style('top', '20px').style('left', Math.min(px + 10, W - 140) + 'px'); })
      .on('pointerleave', () => tip.style('display', 'none'));
    if (TT.anim && TT.motion()) svg.selectAll('rect').filter((d) => d && d.x).transition().delay((d, i) => i * 35).duration(600).ease(d3.easeCubicOut).attr('y', (d) => y(Math.max(0, d.y))).attr('height', (d) => Math.abs(y(d.y) - y(0)));
  };

  window.TT.motion = () => !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Candlestick chart with optional reference lines, crosshair and animated entry. data: [{x:Date,o,h,l,c,v}]
  window.TT.candles = function (el, data, o) {
    o = o || {};
    d3.select(el).selectAll('*').remove();
    if (!data.length) return;
    const lg = d3.select(el).append('div').attr('class', 'tt-legend');
    lg.append('span').style('--sw', '#2ee66b').text('yükselen gün'); lg.append('span').style('--sw', '#ff4545').text('düşen gün');
    (o.refs || []).forEach((r) => lg.append('span').attr('class', 'dash').style('--sw', r.color).text(r.label));
    const W = Math.max(280, el.clientWidth), H = o.height || 300, vh = 46;
    const m = { t: 8, r: 58, b: 22, l: 8 };
    const x = d3.scaleBand().domain(data.map((d) => +d.x)).range([m.l, W - m.r]).padding(0.25);
    const lo = d3.min(data, (d) => d.l), hi = d3.max(data, (d) => d.h);
    const ext = [Math.min(lo, ...(o.refs || []).map((r) => r.y)), Math.max(hi, ...(o.refs || []).map((r) => r.y))];
    const y = d3.scaleLinear().domain(ext).nice().range([H - m.b - vh - 6, m.t]);
    const yv = d3.scaleLinear().domain([0, d3.max(data, (d) => d.v || 0)]).range([H - m.b, H - m.b - vh]);
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', el.getAttribute('aria-label') || 'Mum grafik');
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${W - m.r},0)`).call(d3.axisRight(y).ticks(6).tickSize(-(W - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${W - m.r},0)`).call(d3.axisRight(y).ticks(6).tickFormat((v) => TT.f0(v)).tickSizeOuter(0));
    const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor((W - m.l - m.r) / 70))));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(x.domain().filter((d, i) => i % every === 0)).tickFormat((d) => TT.dShort(new Date(d))).tickSizeOuter(0));
    (o.refs || []).forEach((r) => { svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(r.y)).attr('y2', y(r.y)).style('stroke', r.color).style('stroke-dasharray', '5 3').style('opacity', 0.8); });
    const anim = TT.anim && TT.motion();
    const g = svg.append('g').selectAll('g').data(data).join('g').attr('transform', (d) => `translate(${x(+d.x) + x.bandwidth() / 2},0)`);
    const col = (d) => d.c >= d.o ? '#2ee66b' : '#ff4545';
    g.append('rect').attr('x', -x.bandwidth() / 2).attr('width', x.bandwidth()).attr('y', (d) => yv(d.v || 0)).attr('height', (d) => H - m.b - yv(d.v || 0)).style('fill', col).style('opacity', 0.25);
    const wick = g.append('line').attr('y1', (d) => y(d.h)).attr('y2', (d) => y(d.l)).style('stroke', col);
    const body = g.append('rect').attr('x', -x.bandwidth() / 2).attr('width', x.bandwidth()).attr('y', (d) => y(Math.max(d.o, d.c))).attr('height', (d) => Math.max(1, Math.abs(y(d.o) - y(d.c)))).style('fill', col);
    if (anim) {
      wick.style('opacity', 0).transition().delay((d, i) => i * 45).duration(300).style('opacity', 1);
      body.attr('y', (d) => y(d.o)).attr('height', 1).transition().delay((d, i) => i * 45).duration(500).ease(d3.easeCubicOut).attr('y', (d) => y(Math.max(d.o, d.c))).attr('height', (d) => Math.max(1, Math.abs(y(d.o) - y(d.c))));
    }
    const last = data[data.length - 1];
    const tag = svg.append('g').attr('transform', `translate(${W - m.r},${y(last.c)})`);
    tag.append('rect').attr('x', 0).attr('y', -8).attr('width', m.r - 2).attr('height', 16).style('fill', col(last));
    tag.append('text').attr('x', 4).attr('y', 4).style('font-size', '10px').style('fill', '#000').style('font-weight', 700).text(TT.f0(last.c));
    const tip = d3.select(el).append('div').attr('class', 'tt-tip').style('display', 'none');
    const vline = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).style('stroke', '#ffa028').style('stroke-opacity', 0.5).style('display', 'none');
    const hline = svg.append('line').attr('x1', m.l).attr('x2', W - m.r).style('stroke', '#ffa028').style('stroke-opacity', 0.5).style('display', 'none');
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).style('fill', 'transparent')
      .on('pointermove', (ev) => {
        const [px, py] = d3.pointer(ev);
        const i = Math.max(0, Math.min(data.length - 1, Math.floor((px - m.l) / ((W - m.l - m.r) / data.length))));
        const d = data[i]; const cx = x(+d.x) + x.bandwidth() / 2;
        vline.style('display', null).attr('x1', cx).attr('x2', cx); hline.style('display', null).attr('y1', py).attr('y2', py);
        tip.selectAll('*').remove();
        tip.append('div').attr('class', 'tt-tip-d').text(TT.dt(d.x));
        [['Açılış', d.o], ['Yüksek', d.h], ['Düşük', d.l], ['Kapanış', d.c]].forEach(([k, v]) => tip.append('div').text(k + ': ' + TT.f2(v)));
        const prev = data[i - 1]; if (prev) tip.append('div').text('Değişim: ' + (d.c >= prev.c ? '+' : '−') + '%' + TT.f2(Math.abs(d.c / prev.c - 1) * 100));
        tip.style('display', null).style('top', '28px');
        const tw = tip.node().offsetWidth; tip.style('left', (cx + 12 + tw > W ? cx - tw - 12 : cx + 12) + 'px');
      })
      .on('pointerleave', () => { tip.style('display', 'none'); vline.style('display', 'none'); hline.style('display', 'none'); });
  };

  // Semicircle gauge 0-100 with zones and an animated needle (RSI)
  window.TT.gauge = function (el, value, o) {
    o = o || {};
    d3.select(el).selectAll('*').remove();
    const W = Math.max(180, Math.min(el.clientWidth, 320)), H = W * 0.62, r = W * 0.36, cx = W / 2, cy = H - 18;
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', (o.label || 'Gösterge') + ' ' + TT.f1(value));
    const a = d3.scaleLinear().domain([0, 100]).range([-Math.PI / 2, Math.PI / 2]);
    const arc = d3.arc().innerRadius(r * 0.78).outerRadius(r);
    [[0, 30, '#2ee66b'], [30, 70, '#3a3a3a'], [70, 100, '#ff4545']].forEach(([f, t, c]) => svg.append('path').attr('transform', `translate(${cx},${cy})`).attr('d', arc({ startAngle: a(f), endAngle: a(t) })).style('fill', c).style('opacity', 0.85));
    [0, 30, 50, 70, 100].forEach((v) => { const ang = a(v) - Math.PI / 2; svg.append('text').attr('x', cx + Math.cos(ang) * (r + 10)).attr('y', cy + Math.sin(ang) * (r + 10) + 3).attr('text-anchor', 'middle').style('fill', '#8a8a8a').style('font-size', '9px').text(v); });
    const needle = svg.append('line').attr('x1', cx).attr('y1', cy).attr('x2', cx).attr('y2', cy - r * 0.92).style('stroke', '#ffd23c').style('stroke-width', 3).style('stroke-linecap', 'round');
    svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 5).style('fill', '#ffd23c');
    const deg = (v) => (v - 50) * 1.8;
    const lbl = svg.append('text').attr('x', cx).attr('y', cy - r * 0.35).attr('text-anchor', 'middle').style('fill', '#e8e8e8').style('font-size', Math.round(r * 0.3) + 'px').text(TT.f1(value));
    svg.append('text').attr('x', cx).attr('y', cy + 14).attr('text-anchor', 'middle').style('fill', '#ffa028').style('font-size', '10px').text(o.label || '');
    if (TT.anim && TT.motion()) {
      needle.attr('transform', `rotate(${deg(0)},${cx},${cy})`).transition().duration(1600).ease(d3.easeElasticOut.amplitude(1).period(0.45)).attr('transform', `rotate(${deg(value)},${cx},${cy})`);
      lbl.transition().duration(1200).tween('text', function () { const i = d3.interpolate(0, value); return (t) => { this.textContent = TT.f1(i(t)); }; });
    } else needle.attr('transform', `rotate(${deg(value)},${cx},${cy})`);
  };
})();
