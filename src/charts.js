
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
      svg.append('path').datum(vals).attr('d', line).style('fill', 'none').style('stroke', s.color).style('stroke-width', s.width || 2).style('stroke-dasharray', s.dash ? '5 3' : null);
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
    const y = d3.scaleLinear().domain([Math.min(0, d3.min(data, (d) => d.y)), d3.max(data, (d) => d.y)]).nice().range([H - m.b, m.t]);
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', o.label || 'Sütun grafik');
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(3).tickSize(-(W - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(3).tickFormat((v) => '%' + TT.f1(v)).tickSizeOuter(0));
    const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor((W - m.l - m.r) / 60))));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(x.domain().filter((d, i) => i % every === 0)).tickFormat((d) => TT.mShort(new Date(d))).tickSizeOuter(0));
    const tip = d3.select(el).append('div').attr('class', 'tt-tip').style('display', 'none');
    svg.append('g').selectAll('rect').data(data).join('rect')
      .attr('x', (d) => x(+d.x)).attr('width', x.bandwidth())
      .attr('y', (d) => y(Math.max(0, d.y))).attr('height', (d) => Math.abs(y(d.y) - y(0)))
      .style('fill', o.color || '#3cc8f0')
      .on('pointerenter', (ev, d) => { tip.selectAll('*').remove(); tip.append('div').attr('class', 'tt-tip-d').text(TT.mShort(d.x) + ' ' + d.x.getUTCFullYear()); tip.append('div').text((o.label || '') + ': %' + TT.f2(d.y)); const px = x(+d.x); tip.style('display', null).style('top', '20px').style('left', Math.min(px + 10, W - 140) + 'px'); })
      .on('pointerleave', () => tip.style('display', 'none'));
  };
})();
