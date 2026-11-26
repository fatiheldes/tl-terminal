// Minimal offline runtime: runs the terminal's loaders, calculations and drawings on embedded data.
(function () {
  const RAW = window.TT_RAW || {};
  const loaders = {}, calcs = {}, draws = {}, ondata = [], cache = {};
  function get(id) {
    if (cache[id]) return cache[id];
    let res;
    try {
      if (Object.prototype.hasOwnProperty.call(RAW, id)) {
        const out = loaders[id] ? loaders[id]({ answer: RAW[id], items: [RAW[id]], args: {} }) : RAW[id];
        const rows = Array.isArray(out) ? out : (out.rows || out.data || []);
        res = { status: 'ok', data: rows, columns: out.columns };
      } else if (calcs[id]) {
        const c = calcs[id];
        const ins = c.inputs.map((i) => { const d = get(i); return d.status === 'ok' ? d.data : []; });
        res = { status: 'ok', data: c.fn.apply(null, ins) };
      } else res = { status: 'missing', data: [] };
    } catch (e) { console.error(id, e); res = { status: 'error', data: [], message: String(e) }; }
    return (cache[id] = res);
  }
  window.dash = {
    colors: ['#ffa028', '#3cc8f0', '#e8e8e8', '#c86bff', '#2ee66b', '#ff6b9a'],
    loader: (id, o) => { loaders[id] = o.fn; },
    calc: (id, o) => { calcs[id] = o; },
    draw: (name, fn) => { draws[name] = fn; },
    onData: (fn) => { ondata.push(fn); },
    data: get,
    refresh: () => {}, params: () => ({}), setParams: () => {}, resetParams: () => {}, setLink: () => {}
  };
  function run() {
    ondata.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
    Object.keys(draws).forEach((n) => document.querySelectorAll('[data-draw="' + n + '"]').forEach((el) => {
      const d = draws[n];
      try {
        if (typeof d === 'function') d(el);
        else { if (!el.__m) { el.__m = true; el.__made = d.mount ? d.mount(el) : undefined; } if (d.update) d.update(el, el.__made); }
      } catch (e) { console.error(n, e); }
    }));
  }
  window.TTrun = run;
  document.addEventListener('DOMContentLoaded', () => {
    run();
    let w = window.innerWidth, t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (window.innerWidth !== w) { w = window.innerWidth; run(); } }, 150); });
  });
})();
