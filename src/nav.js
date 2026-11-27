// Navigation: 11 top-level tabs, Bloomberg-style function bars inside each tab, a global command line,
// deep links (#page/FUNCTION), keyboard shortcuts and monitor mode.
(function () {
  const PAGES = ['piyasa', 'equity', 'fixed', 'fx', 'cmdty', 'deriv', 'mm', 'eco', 'funds', 'credit', 'private', 'kaan'];
  const KEYS = { '0': 'piyasa', '1': 'equity', '2': 'fixed', '3': 'fx', '4': 'cmdty', '5': 'deriv', '6': 'mm', '7': 'eco', '8': 'funds', '9': 'credit', 'p': 'private', 'P': 'private', 'k': 'kaan', 'K': 'kaan' };
  const MON_MS = 15000;
  let cur = 'piyasa', monTimer = null;
  const fnOf = {}; // page -> current function
  try { Object.assign(fnOf, JSON.parse(localStorage.getItem('tlft-fns') || '{}')); } catch (e) { /* storage blocked */ }

  const fnsIn = (page) => Array.from(document.querySelectorAll('#' + page + ' > .fnbar button[data-fn]')).map((b) => b.dataset.fn);
  const hashFor = (page) => '#' + page + (fnOf[page] && fnsIn(page).length ? '/' + fnOf[page] : '');
  const save = () => { try { localStorage.setItem('tlft-fns', JSON.stringify(fnOf)); } catch (e) { /* ignore */ } };

  function animate(root) {
    if (!root || !TT.motion()) return;
    root.querySelectorAll('.pn').forEach((p, i) => { if (p.offsetParent === null) return; p.classList.remove('enter'); void p.offsetWidth; p.style.animationDelay = (i * 50) + 'ms'; p.classList.add('enter'); });
  }
  function applyFn(page) {
    const fns = fnsIn(page); if (!fns.length) return;
    if (!fns.includes(fnOf[page])) fnOf[page] = fns[0];
    const sec = document.getElementById(page);
    sec.querySelectorAll(':scope > .fsub').forEach((s) => { s.hidden = s.dataset.fn !== fnOf[page]; });
    sec.querySelectorAll(':scope > .fnbar button[data-fn]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.fn === fnOf[page])));
  }
  function render(root) {
    animate(root);
    TT.anim = true; if (window.TTrun) window.TTrun(); TT.anim = false;
    if (root && TT.motion()) root.querySelectorAll('.kv .v, .heat div').forEach((v) => { if (v.offsetParent === null) return; v.classList.remove('flash'); void v.offsetWidth; v.classList.add('flash'); });
  }
  function show(page, fn) {
    if (!PAGES.includes(page)) page = 'piyasa';
    cur = page;
    if (fn) fnOf[page] = fn;
    document.querySelectorAll('section.page').forEach((s) => { s.hidden = s.id !== page; });
    document.querySelectorAll('.tabs button[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === page)));
    applyFn(page); save();
    try { history.replaceState(null, '', hashFor(page)); } catch (e) { /* file:// */ }
    render(document.getElementById(page));
  }
  function setFn(fn) {
    const fns = fnsIn(cur); if (!fns.includes(fn)) return false;
    fnOf[cur] = fn; applyFn(cur); save();
    try { history.replaceState(null, '', hashFor(cur)); } catch (e) { /* file:// */ }
    const sub = document.querySelector('#' + cur + ' > .fsub[data-fn="' + fn + '"]');
    render(sub);
    return true;
  }
  function step(dir) { const fns = fnsIn(cur); if (!fns.length) return; const i = fns.indexOf(fnOf[cur]); setFn(fns[(i + dir + fns.length) % fns.length]); }
  function monitor(on) {
    const b = document.querySelector('.tabs .mon');
    clearInterval(monTimer); monTimer = null;
    if (b) { b.setAttribute('aria-pressed', String(on)); b.style.setProperty('--mon', (MON_MS / 1000) + 's'); b.firstChild.textContent = on ? '■ MONITOR ON' : '▶ MONITOR'; }
    if (on) monTimer = setInterval(() => show(PAGES[(PAGES.indexOf(cur) + 1) % PAGES.length]), MON_MS);
    try { localStorage.setItem('tlft-monitor', on ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  // Global command line: page names, function codes and common Bloomberg aliases
  const ALIAS = {
    MKT: ['piyasa', 'MKT'], MARKETS: ['piyasa', 'MKT'], OV: ['piyasa', 'MKT'], RISK: ['piyasa', 'MKT'], TRMK: ['piyasa', 'TRMK'], TR: ['piyasa', 'TRMK'], EQ: ['equity'], EQUITY: ['equity'], WEI: ['equity', 'WEI'], WI: ['equity', 'WEI'], IMAP: ['equity', 'IMAP'], BI30: ['equity', 'IMAP'], BSEC: ['equity', 'BSEC'], SECT: ['equity', 'BSEC'], EQUITIES: ['equity'], FI: ['fixed'], FIXED: ['fixed'], GOVT: ['fixed', 'GOVT'], YCRV: ['fixed', 'GOVT'], GC: ['fixed', 'GOVT'], SRCH: ['fixed', 'YAS'], DES: ['fixed', 'YAS'], YA: ['fixed', 'YAS'], FIHZ: ['fixed', 'YAS'], IYC: ['fixed', 'WB'], WBX: ['fixed', 'WB'],
    FX: ['fx'], FXC: ['fx', 'FXC'], WCRS: ['fx', 'WCRS'], FRD: ['fx', 'FRD'], FXFA: ['fx', 'FRD'], FXFC: ['fx', 'FRD'], CARRY: ['fx', 'FRD'], FXV: ['fx', 'FXV'], CBFX: ['fx', 'CBFX'], REER: ['fx', 'CBFX'], FXIP: ['fx', 'FXC'], CMDTY: ['cmdty'], GLCO: ['cmdty', 'GLCO'], CMBQ: ['cmdty', 'GLCO'], BCOM: ['cmdty', 'GLCO'], ENGY: ['cmdty', 'ENGY'], CL1: ['cmdty', 'ENGY'], CO1: ['cmdty', 'ENGY'], CRCK: ['cmdty', 'ENGY'], NG1: ['cmdty', 'ENGY'], METL: ['cmdty', 'METL'], GC1: ['cmdty', 'METL'], XAU: ['cmdty', 'METL'], AGRI: ['cmdty', 'AGRI'], AGR: ['cmdty', 'AGRI'], DERIV: ['deriv'], VOL: ['deriv', 'VOL'], VIX: ['deriv', 'VOL'], MOVE: ['deriv', 'VOL'], FMON: ['deriv', 'FMON'], BASIS: ['deriv', 'FMON'], OIS: ['deriv', 'OIS'], SWPM: ['deriv', 'OIS'], IRSB: ['deriv', 'OIS'], FUT: ['deriv', 'FUT'], CTM: ['deriv', 'FUT'], VOL: ['deriv', 'VOL'],
    MM: ['mm'], MONEY: ['mm'], BTMM: ['mm', 'BTMM'], MMR: ['mm', 'BTMM'], LIQ: ['mm', 'LIQ'], CP: ['mm', 'CP'], USMM: ['mm', 'USMM'], WIRP: ['mm', 'USMM'], FEDS: ['mm', 'USMM'],
    ECO: ['eco', 'ECO'], ECST: ['eco', 'ECST'], ECFC: ['eco', 'ECST'], INFL: ['eco', 'INFL'], CPI: ['eco', 'INFL'], GDP: ['eco', 'GDP'], ACT: ['eco', 'ACT'], IP: ['eco', 'ACT'], BOP: ['eco', 'BOP'], CA: ['eco', 'BOP'], BUDG: ['eco', 'BOP'], ECON: ['eco'], ECFC: ['eco', 'ECO'], CAL: ['eco', 'CAL'], ECOC: ['eco', 'CAL'], CB: ['eco', 'CB'], WIR: ['eco', 'CB'], CENB: ['eco', 'CB'],
    FUNDS: ['funds'], FUND: ['funds', 'FUND'], TEFAS: ['funds', 'FUND'], FSRC: ['funds', 'FSRT'], FSRT: ['funds', 'FSRT'], FDES: ['funds', 'FDES'], ETF: ['funds', 'ETF'], ETFS: ['funds', 'ETF'], ETFR: ['funds', 'ETFR'], RRG: ['funds', 'ETFR'], BETF: ['funds', 'BETF'], CREDIT: ['credit'], TRCR: ['credit', 'TRCR'], LOANR: ['credit', 'TRCR'], LOAN: ['credit', 'LOAN'], NPL: ['credit', 'LOAN'], CRPR: ['credit', 'CRPR'], WCDS: ['credit', 'CRPR'], SOVR: ['credit', 'CRPR'], RATC: ['credit', 'CRPR'], CDSW: ['credit', 'CRPR'], CORP: ['credit', 'CORP'], IGHY: ['credit', 'CORP'],
    PRIVATE: ['private'], KAAN: ['kaan'], FB: ['kaan'], GS: ['kaan'], FENER: ['kaan'], GSRAY: ['kaan'], PE: ['private', 'ALTS'], PREQ: ['private', 'ALTS'], ALTS: ['private', 'ALTS'], PCRD: ['private', 'PCRD'], BDC: ['private', 'PCRD'], RLAS: ['private', 'RLAS'], REIT: ['private', 'RLAS'], TRPM: ['private', 'TRPM'], GYO: ['private', 'TRPM'], HOUS: ['private', 'TRPM'], TECH: ['equity', 'TECH'], EQS: ['equity', 'EQS'], NIM: ['fixed', 'NIM'], NEWS: ['fixed', 'NEWS'], TOP: ['fixed', 'NEWS'], UST: ['fixed', 'UST'], WB: ['fixed', 'WB'], YAS: ['fixed', 'YAS'], STRC: ['deriv', 'STRC'], MTGE: ['deriv', 'STRC']
  };
  function go(text) {
    const v = String(text || '').trim().toUpperCase().replace(/\s*<?GO>?$/, '');
    if (!v) return false;
    let t = ALIAS[v];
    if (!t) { for (const p of PAGES) if (fnsIn(p).includes(v)) { t = [p, v]; break; } }
    if (!t) return false;
    show(t[0], t[1]); if (monTimer) monitor(true);
    return true;
  }
  window.TTshow = show; window.TTgo = go; window.FIfn = setFn;

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tabs button[data-tab]').forEach((b) => b.addEventListener('click', () => { show(b.dataset.tab); if (monTimer) monitor(true); }));
    document.querySelectorAll('.fnbar button[data-fn]').forEach((b) => b.addEventListener('click', () => setFn(b.dataset.fn)));
    const mb = document.querySelector('.tabs .mon'); if (mb) mb.addEventListener('click', () => monitor(!monTimer));
    const cmd = document.getElementById('cmd');
    if (cmd) cmd.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { cmd.value = ''; cmd.blur(); return; }
      if (e.key !== 'Enter') return;
      if (go(cmd.value)) { cmd.value = ''; cmd.classList.remove('bad'); cmd.blur(); } else cmd.classList.add('bad');
    });
    document.addEventListener('keydown', (e) => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (KEYS[e.key]) { show(KEYS[e.key]); if (monTimer) monitor(true); return; }
      if (e.key === 'm' || e.key === 'M') { monitor(!monTimer); return; }
      if (e.key === ']' || e.key === '.') { step(1); return; }
      if (e.key === '[' || e.key === ',') { step(-1); return; }
      if (e.key === '/' && cmd) { e.preventDefault(); cmd.focus(); }
    });
    const h = (location.hash || '#piyasa').slice(1).split('/');
    const legacy = { faiz: ['deriv', 'OIS'], makro: ['eco', 'ECO'], hisse: ['equity', 'EQS'], takvim: ['eco', 'CAL'], teknik: ['equity', 'TECH'] };
    if (legacy[h[0]]) show(legacy[h[0]][0], legacy[h[0]][1]); else show(h[0], h[1] && h[1].toUpperCase());
    let saved = null; try { saved = localStorage.getItem('tlft-monitor'); } catch (e) { /* ignore */ }
    if (saved === '1') monitor(true);
  });
})();
