// Terminal-style ambient motion: tick flashes on visible numbers, blinking LIVE markers, blinking command cursor.
// Purely cosmetic: values only change when the data is refreshed (see UPDATED in the header). Off for reduced motion.
(function () {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  const SEL = 'td.r, td.yl, .kv .v, .ov-tile .v, .tape-in b, .tape-in span';
  const recent = new Set();
  const dirOf = (el) => {
    const own = el.textContent.trim();
    if (/^\+/.test(own) || el.classList.contains('up')) return 'up';
    if (/^[−-]\d/.test(own) || el.classList.contains('dn')) return 'dn';
    const tr = el.closest('tr');
    if (tr) { for (const c of tr.cells) { const t = c.textContent.trim(); if (/^\+\d/.test(t) || c.classList.contains('up')) return 'up'; if (/^[−-]\d/.test(t) || c.classList.contains('dn')) return 'dn'; } }
    const box = el.parentElement && el.parentElement.querySelector('.c');
    if (box) { const t = box.textContent; const m = /([+−-])\d/.exec(t); if (m) return m[1] === '+' ? 'up' : 'dn'; }
    return 'am';
  };
  const visible = (el) => { if (!el.offsetParent) return false; const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0 && el.textContent.trim() && el.textContent.trim() !== '—'; };
  const tick = () => {
    if (document.hidden) return;
    const page = document.querySelector('section.page:not([hidden])'); if (!page) return;
    const pool = Array.from(page.querySelectorAll(SEL)).filter((el) => !recent.has(el) && visible(el));
    const markets = page.id === 'piyasa', n = markets ? 3 : 2;
    for (let i = 0; i < n && pool.length; i++) {
      const el = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const cls = 'tk-' + dirOf(el);
      el.classList.remove('tk-up', 'tk-dn', 'tk-am'); void el.offsetWidth; el.classList.add(cls);
      recent.add(el); setTimeout(() => { el.classList.remove(cls); recent.delete(el); }, 1400);
    }
  };
  let timer = null;
  const start = () => { clearInterval(timer); const page = document.querySelector('section.page:not([hidden])'); timer = setInterval(tick, page && page.id === 'piyasa' ? 420 : 750); };
  window.addEventListener('hashchange', () => setTimeout(start, 50));
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-tab]')) setTimeout(start, 50); });
  document.addEventListener('keydown', () => setTimeout(start, 50));
  setTimeout(start, 1200);

  // blinking block cursor in the command line while it is empty and not focused
  const cmd = document.getElementById('cmd');
  if (cmd) {
    const cur = document.createElement('span'); cur.className = 'cmd-cur blink'; cur.setAttribute('aria-hidden', 'true'); cur.textContent = '█';
    cmd.parentElement.insertBefore(cur, cmd);
    const sync = () => { cur.style.display = document.activeElement === cmd || cmd.value ? 'none' : ''; };
    ['focus', 'blur', 'input'].forEach((ev) => cmd.addEventListener(ev, sync)); sync();
  }
})();
