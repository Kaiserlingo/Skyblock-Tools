'use strict';
// Rahmen: Tabellen, die nicht passen, werden automatisch zu Karten (nie seitlich scrollen).
/* ---------- Tabellen passen immer in ihren Bereich ----------
   Jede Zelle bekommt die Spaltenüberschrift als Beschriftung. Ist eine Tabelle breiter als ihr Platz,
   wird sie als Liste von Karten gezeigt (CSS: table.stack) – so muss man nie seitlich scrollen. */
function fitTables(){
  for (const t of document.querySelectorAll('table')){
    const heads = [...t.querySelectorAll('thead th')].map(th => th.innerText.replace(/\s+/g, ' ').replace(/[↑↓]/g, '').trim());
    for (const tr of t.querySelectorAll('tbody tr')){
      let i = 0;
      for (const td of tr.children){
        if (!td.hasAttribute('data-l')) td.setAttribute('data-l', td.colSpan > 1 ? '' : heads[i] || '');
        if (td.colSpan > 1 || td.querySelector('.item, .mk-it')) td.classList.add('wide');
        else if (td.querySelector('[data-star]') && !td.textContent.replace(/[☆★\s]/g, '')) td.classList.add('starcell');
        i += td.colSpan || 1;
      }
    }
    const box = t.parentElement; if (!box || !t.offsetParent) continue;
    t.classList.remove('stack');
    const cs = getComputedStyle(box), room = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (Math.max(t.offsetWidth, t.scrollWidth) > room + 1) t.classList.add('stack');
  }
}
let fitQ = 0;
const fitSoon = () => { if (!fitQ) fitQ = requestAnimationFrame(() => { fitQ = 0; fitTables(); }); };
new MutationObserver(fitSoon).observe(document.body, {childList: true, subtree: true});
addEventListener('resize', fitSoon);
document.addEventListener('toggle', fitSoon, true);   // aufgeklappte <details> neu messen
