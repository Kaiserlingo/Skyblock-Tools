'use strict';
// Markt-Analyse: Klicks und Eingaben; Schnittstelle window.Markt für den Rahmen.
/* =========================================================
   Eingaben
   ========================================================= */
document.addEventListener('click', e => {
  if (S.tool !== 'markt') return;
  const t = e.target, q = s => t.closest(s); let el;
  if ((el = q('[data-mkitem]'))){ e.preventDefault(); nav('markt/item/' + encodeURIComponent(el.dataset.mkitem)); return; }
  if ((el = q('[data-mksec]'))){ K.list.sec = el.dataset.mksec; K.list.preset = null; K.list.page = 0; nav('markt/items'); return; }
  if ((el = q('[data-mkpreset]'))){ const k = el.dataset.mkpreset, p = MK_PRESETS[k]; if (K.list.preset === k){ K.list.preset = null; K.list.sort = 'to'; K.list.dir = -1; } else { K.list.preset = k; K.list.sort = p.sort; K.list.dir = p.dir; } K.list.page = 0; if (K.tab !== 'items') nav('markt/items'); else { document.querySelectorAll('[data-mkpreset]').forEach(b => b.classList.toggle('on', b.dataset.mkpreset === K.list.preset)); drawList(); } return; }
  if ((el = q('[data-mkmkt]'))){ K.list.mkt = el.dataset.mkmkt; K.list.page = 0; document.querySelectorAll('[data-mkmkt]').forEach(b => b.classList.toggle('on', b === el)); drawList(); return; }
  if ((el = q('[data-mksort]'))){ const k = el.dataset.mksort; if (K.list.sort === k) K.list.dir *= -1; else { K.list.sort = k; K.list.dir = k === 'name' ? 1 : -1; } K.list.page = 0; drawList(); return; }
  if ((el = q('[data-mkpg]'))){ K.list.page = Math.max(0, K.list.page + +el.dataset.mkpg); drawList(); window.scrollTo({top: 0}); return; }
  if ((el = q('[data-mkclear]'))){ K.list.q = ''; const s = $('#msearch'); if (s){ s.value = ''; s.parentElement.classList.remove('has'); s.focus(); } drawList(); return; }
  if ((el = q('[data-mkrange]'))){ K.idx.range = +el.dataset.mkrange; document.querySelectorAll('[data-mkrange]').forEach(b => b.classList.toggle('on', b === el)); feedIndexChart(); return; }
  if ((el = q('[data-mkmayor]'))){ K.mayorSel = el.dataset.mkmayor; redraw(); const m = $('.mk-mf'); if (m) m.scrollIntoView({block: 'nearest', behavior: 'smooth'}); return; }
  if ((el = q('[data-mitab]'))){ K.itTab = el.dataset.mitab; drawItem(true); return; }
  if ((el = q('[data-fcside]'))){ K.fcSide = el.dataset.fcside; drawItem(true); return; }
  if ((el = q('[data-mkmob]'))){ K.mob = el.dataset.mkmob; drawItem(false); return; }
  if ((el = q('[data-mkcopy]'))){ const txt = el.dataset.mkcopy; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => { el.textContent = 'Kopiert'; setTimeout(() => el.textContent = 'Name kopieren', 1500); }).catch(() => {}); return; }
});
document.addEventListener('change', e => {
  if (S.tool !== 'markt') return;
  const t = e.target;
  if (t.dataset.mkopt){ K.idx[t.dataset.mkopt] = t.checked; feedIndexChart(); }
  else if (t.hasAttribute('data-mkcmp')){ K.idx.cmp = t.value; feedIndexChart(); }
  else if (t.hasAttribute('data-mksecsel')){ K.list.sec = t.value; K.list.page = 0; drawList(); }
  else if (t.dataset.mkcalc){
    const v = parseCoins(t.value.replace('%', ''));
    const ok = isFinite(v) && v > 0 && (t.dataset.mkcalc !== 'share' || v <= 100);
    if (ok){ K.calc[t.dataset.mkcalc] = v; try{ localStorage.setItem('mk:calc', JSON.stringify(K.calc)); }catch{} drawItem(false); }
    else { t.parentElement.classList.add('bad'); setTimeout(() => t.parentElement.classList.remove('bad'), 1200); }
  }
});
document.addEventListener('input', e => {
  if (S.tool === 'markt' && e.target.id === 'pg-date'){
    K.fcDate = e.target.value; const I = K.it, F = I && I.fc, el = $('#pg-dres');
    if (F && !F.err && el) el.innerHTML = pgDateResult(I, F, fcSide(I, F));
    return;
  }
  if (S.tool === 'markt' && e.target.id === 'pg-target'){
    K.fcTarget = e.target.value.trim();
    clearTimeout(K.fcT); K.fcT = setTimeout(() => { const I = K.it, F = I && I.fc, el = $('#pg-tres'); if (F && !F.err && el) el.innerHTML = fcTargetResult(I, F, fcSide(I, F)); }, 250);
    return;
  }
  if (S.tool !== 'markt' || e.target.id !== 'msearch') return;
  K.list.q = e.target.value; K.list.page = 0; e.target.parentElement.classList.toggle('has', !!e.target.value); drawList();
});
document.addEventListener('keydown', e => {
  if (S.tool !== 'markt') return;
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.mkcalc){ e.target.blur(); return; }
  if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)){ const s = $('#msearch'); if (s){ e.preventDefault(); s.focus(); } }
});

function mkHubMeta(){ return ''; }
function openCategory(k){ K.list.sec = k; K.list.preset = null; K.list.q = ''; K.list.page = 0; nav('markt/items'); }
// Für die Startseite (oberste Ebene): Daten laden und lesen, ohne die Seiten der Markt-Analyse
function mkEnsure(){ return Promise.allSettled([loadMD(), loadPx(), loadLive(), loadHy().then(() => loadColl()), loadCat()]); }
function mkData(){ const m = curMayor(); return {md: K.md, px: K.px, pxErr: K.pxErr, mdErr: K.mdErr, mayor: m, mayorEnd: m && m.term ? m.term.end : nextMayorChange(Date.now()), election: K.election, fires: K.fires, pxAge: pxAge()}; }
window.Markt = {render: mkRender, mount: mkMount, update: mkUpdate, leave: mkLeave, pageTitle: mkPageTitle, hubMeta: mkHubMeta, ensure: mkEnsure, data: mkData, nm, catOf, secLabel, universe, ahFee, openCategory, _K: K, _analyze: analyze, _bzPoints: bzPoints, _ahPoints: ahPoints};
if (S.tool === 'markt') renderMain(true);

document.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('pg-days')) K.fcDays = e.target.open; }, true);
