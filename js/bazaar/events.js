'use strict';
// Bazaar Flipper: Klicks, Eingaben, Tastatur.
/* =========================================================
   Events
   ========================================================= */
document.addEventListener('click', e => {
  const t = e.target, q = sel => t.closest(sel);
  let el;
  if ((el = q('[data-star]'))){ e.stopPropagation(); toggleWatch(el.dataset.star); renderMain(true); rerenderModal(); return; }
  if ((el = q('[data-delalert]'))){ e.stopPropagation(); S.alerts.splice(+el.dataset.delalert, 1); save('alerts', S.alerts); renderMain(true); rerenderModal(); return; }
  if ((el = q('[data-nav]'))){ nav(el.dataset.nav); return; }
  if ((el = q('[data-tab]'))){ e.preventDefault(); closeDetail(); nav(S.tool + '/' + el.dataset.tab); return; }
  if ((el = q('[data-preset]'))){ applyPreset(el.dataset.preset); return; }
  if ((el = q('[data-coinset]'))){ const [k, v] = el.dataset.coinset.split(':'); setSetting(k, +v); refreshControls(); return; }
  if ((el = q('[data-setv]'))){ const v = el.dataset.val, k = el.dataset.setv; setSetting(k, isNaN(+v) ? v : +v); refreshControls(); return; }
  if ((el = q('th[data-sort]'))){
    const tab = S.tab, k = el.dataset.sort, cur = S.sort[tab];
    if (cur.k === k) cur.d *= -1; else { cur.k = k; cur.d = k === 'name' ? 1 : -1; }
    save('sort', S.sort); S.pageNo[tab] = 0; renderMain(true); return;
  }
  if ((el = q('[data-pg]'))){ S.pageNo[S.tab] = Math.max(0, (S.pageNo[S.tab] || 0) + +el.dataset.pg); renderMain(true); window.scrollTo({top:0}); return; }
  if ((el = q('[data-mrange]'))){ chartPrefs.mrange = el.dataset.mrange; savePrefs(); loadModalChart(); return; }
  if ((el = q('[data-arange]'))){ chartPrefs.arange = el.dataset.arange; savePrefs(); loadAnalysisChart(); return; }
  if ((el = q('[data-tool]'))){ setAnaTool(el.dataset.tool); return; }
  if ((el = q('[data-cset]'))){ calcPrefs[el.dataset.cset] = el.dataset.val; saveCalc(); refreshCalc(true); return; }
  if ((el = q('[data-ccombo]'))){ const [b, s2] = el.dataset.ccombo.split('|'); calcPrefs.buy = b; calcPrefs.sell = s2; saveCalc(); refreshCalc(true); return; }
  if ((el = q('[data-creset]'))){ calcState[el.dataset.creset === 'buy' ? 'buyPx' : 'sellPx'] = null; refreshCalc(true); return; }
  if ((el = q('[data-ccopy]'))){
    const r = S.byId[S.itemId]; if (!r) return;
    const v = el.dataset.ccopy === 'buy' ? orderPx(r, 'buy') : orderPx(r, 'sell'), txt = String(r1(v));   // so wie das Schild im Spiel ihn erwartet
    const done = () => { el.textContent = 'Kopiert: ' + txt; setTimeout(() => el.textContent = 'Preis kopieren', 1600); };
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(done).catch(() => { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); done(); }catch{} ta.remove(); });
    return;
  }
  if ((el = q('[data-cq]'))){
    const [k, v] = el.dataset.cq.split(':'), r = S.byId[S.itemId]; if (!r) return;
    if (k === 'b'){ calcPrefs.budget = v === 'set' ? S.set.budget : +v; }
    else if (v === 'budget') calcPrefs.qty = Math.max(1, Math.floor(S.set.budget / orderPx(r, 'buy')));
    else if (v === 'order') calcPrefs.qty = MAX_ORDER;
    else calcPrefs.qty = +v;
    saveCalc(); refreshCalc(true); return;
  }
  if ((el = q('[data-craft]'))){ openCraft(+el.dataset.craft); return; }
  if ((el = q('[data-open]'))){ openDetail(el.dataset.open); return; }
  if (t.id === 'modal'){ closeDetail(); return; }
  if (t.id === 'scrim'){ closeDrawer(); return; }
  if (q('#refreshBtn')){ poll(); return; }
  if ((el = q('#pauseBtn'))){ S.paused = !S.paused; el.textContent = S.paused ? 'Fortsetzen' : 'Pausieren'; if (S.paused) schedule(); else poll(); tick(); return; }
  const act = (el = q('[data-act]')) && el.dataset.act;
  if (!act) return;
  e.preventDefault();
  if (act === 'close') closeDetail();
  else if (act === 'filters') openDrawer();
  else if (act === 'sharelink'){
    const url = shareLink(), orig = el.textContent, done = () => { el.textContent = 'Link kopiert'; setTimeout(() => el.textContent = orig, 1800); };
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(done).catch(() => { const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); done(); }catch{} ta.remove(); });
  }
  else if (act === 'back'){ nav(S.tool + '/' + (S.returnTo && S.returnTo !== 'item' ? S.returnTo : 'overview')); }
  else if (act === 'undo'){ if (S.achart) S.achart.undo(); }
  else if (act === 'cleardraw'){ if (S.achart){ if (el.dataset.sure){ S.achart.clearDrawings(); el.textContent = 'Alle Zeichnungen löschen'; delete el.dataset.sure; } else { el.dataset.sure = 1; el.textContent = 'Wirklich alle löschen?'; } } }
  else if (act === 'theme'){ S.set.theme = resolvedTheme() === 'dark' ? 'light' : 'dark'; save('settings', S.set); applyTheme(); if (S.tab === 'settings' && S.tool) renderMain(true); }
  else if (act === 'closedrawer') closeDrawer();
  else if (act === 'clearsearch'){ S.search = ''; S.pageNo[S.tab] = 0; renderMain(true); const s = $('#search'); if (s) s.focus(); }
  else if (act === 'copy'){
    const name = el.dataset.name || S.byId[S.detail]?.name || '';
    const done = () => { el.textContent = 'Kopiert'; setTimeout(() => el.textContent = 'Name kopieren', 1500); };
    (navigator.clipboard ? navigator.clipboard.writeText(name) : Promise.reject()).then(done).catch(() => {
      const ta = document.createElement('textarea'); ta.value = name; document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); done(); }catch{} ta.remove();
    });
  }
  else if (act === 'addalert'){
    const inp = $('#alVal'), v = parseCoins(inp.value);
    if (!isFinite(v) || v <= 0){ inp.parentElement.style.borderColor = 'var(--red)'; inp.focus(); return; }
    const aid = S.detail || S.itemId;
    S.alerts.push({id: aid, cond: $('#alCond').value, value: v, last: 0});
    save('alerts', S.alerts);
    if (!S.watch.includes(aid)){ S.watch.push(aid); save('watch', S.watch); }
    if (S.detail) renderDetail(false); renderMain(true);
  }
  else if (act === 'notif'){ try{ Notification.requestPermission().then(() => renderMain(true)); }catch{} }
  else if (act === 'test') notify('Test-Alarm', 'So sieht ein Preis-Alarm aus.');
  else if (act === 'clear'){ if (el.dataset.sure){ S.hist = {}; DB.clear(); renderMain(true); } else { el.dataset.sure = 1; el.textContent = 'Wirklich löschen?'; } }
  else if (act === 'export'){
    const blob = new Blob([JSON.stringify({exported: new Date().toISOString(), hist: S.hist})], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'bazaar-verlauf-' + new Date().toISOString().slice(0,10) + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  else if (act === 'items'){ save('items', null); loadItems().then(() => { if (S.rows.length) ingest(false); }); }
  else if (act === 'reset'){ S.set = Object.assign({}, DEFAULTS); save('settings', S.set); schedule(); if (S.rows.length) ingest(false); renderMain(true); }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'search'){ S.search = t.value; S.pageNo[S.tab] = 0; renderMain(); return; }
  if (t.dataset.cin){
    const k = t.dataset.cin, v = parseCoins(t.value.replace('%', ''));
    const ok = isFinite(v) && v >= 0;
    t.parentElement.classList.toggle('bad', !ok && t.value.trim() !== '');
    if (k === 'buyPx') calcState.buyPx = ok && v > 0 ? v : null;
    else if (k === 'sellPx') calcState.sellPx = ok && v > 0 ? v : null;
    else if (ok){ calcPrefs[k] = v; saveCalc(); }
    refreshCalc(false);
    if (k === 'buyPx' || k === 'sellPx'){ const n = $('#c' + (k === 'buyPx' ? 'buy' : 'sell') + 'Live'); const r = S.byId[S.itemId]; if (n && r) n.innerHTML = (calcState[k] != null ? `Eigener Preis. Live: ${NF1f.format(k === 'buyPx' ? autoBuy(r) : autoSell(r))} <button class="link" data-creset="${k === 'buyPx' ? 'buy' : 'sell'}">Live-Preis nehmen</button>` : 'Automatisch.') + ` <button class="link" data-ccopy="${k === 'buyPx' ? 'buy' : 'sell'}">Preis kopieren</button>`; }
    return;
  }
  if (t.dataset.slider){
    const key = t.dataset.slider, c = SLIDERS[key], v = c.steps[+t.value];
    t.style.setProperty('--p', (t.value / (c.steps.length - 1) * 100).toFixed(1) + '%');
    document.querySelectorAll(`[data-out="${key}"]`).forEach(o => o.textContent = c.f(v));
    setSetting(key, v, {quiet: true});
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.slider){ refreshControls(); return; }
  if (t.dataset.coin){
    const key = t.dataset.coin, v = parseCoins(t.value);
    if (!isFinite(v) || v < 0){ t.value = coinText(S.set[key]); t.parentElement.style.borderColor = 'var(--red)'; setTimeout(() => t.parentElement.style.borderColor = '', 900); return; }
    setSetting(key, v); refreshControls(); return;
  }
  if (t.dataset.set && t.type === 'checkbox'){ setSetting(t.dataset.set, t.checked); refreshControls(); }
  if (t.dataset.ind){
    chartPrefs[t.dataset.ind] = t.checked; savePrefs();
    if (S.achart){ S.achart.setIndicators({hi: chartPrefs.hi, lo: chartPrefs.lo, spread: chartPrefs.spread, volume: chartPrefs.volume, sma: chartPrefs.sma ? 20 : 0, ema: chartPrefs.ema ? 50 : 0, bb: chartPrefs.bb}); anaLegend(null); }
  }
});
document.addEventListener('keydown', e => {
  const tag = document.activeElement.tagName;
  if (e.key === 'Escape'){ if ($('#modal').classList.contains('on')) closeDetail(); else if (S.drawer) closeDrawer(); else if (S.achart){ S.achart.cancel(); setAnaTool('none'); } return; }
  if (S.achart && S.tab === 'item' && !['INPUT','SELECT','TEXTAREA'].includes(tag) && !e.altKey){
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'){ e.preventDefault(); S.achart.undo(); return; }
    if (!e.ctrlKey && !e.metaKey){ const tl = TOOLS_DRAW.find(x => x[2].toLowerCase() === e.key.toLowerCase()); if (tl){ setAnaTool(tl[0]); return; } }
  }
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.coin){ e.target.blur(); return; }
  if (e.key === 'Enter' && e.target.id === 'alVal'){ document.querySelector('[data-act=addalert]').click(); return; }
  if (e.key === '/' && !['INPUT','SELECT','TEXTAREA'].includes(tag)){ const s = $('#search'); if (s){ e.preventDefault(); s.focus(); } }
});
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', () => { DB.saveAll(S.hist); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !S.paused && Date.now() - S.lastFetch > S.set.interval*1000) poll();
});
