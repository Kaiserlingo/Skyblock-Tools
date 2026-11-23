'use strict';
// Bazaar Flipper: Einstellungen ändern und speichern.
/* =========================================================
   Einstellungen ändern
   ========================================================= */
let recalcTimer = null;
function setSetting(key, value, {quiet} = {}){
  S.set[key] = value;
  if (PRESET_KEYS.includes(key)) S.set.preset = 'custom';
  save('settings', S.set);
  if (key === 'interval') schedule();
  if (key === 'theme'){ applyTheme(); renderMain(true); return; }
  clearTimeout(recalcTimer);
  const run = () => { if (S.rows.length) ingest(false); else renderMain(); };
  if (quiet) recalcTimer = setTimeout(run, 140); else run();
}
function applyPreset(k){
  const p = PRESETS[k]; if (!p) return;
  for (const key of PRESET_KEYS) S.set[key] = p[key];
  S.set.preset = k; save('settings', S.set);
  if (S.rows.length) ingest(false); else renderMain(true);
  if (S.drawer) renderDrawer();
}
function refreshControls(){
  if (S.drawer) renderDrawer(); if (S.tab === 'settings') renderMain(true);
  document.querySelectorAll('#view [data-setv]').forEach(b => b.classList.toggle('on', String(S.set[b.dataset.setv]) === b.dataset.val));
}
function toggleWatch(id){
  const i = S.watch.indexOf(id);
  if (i >= 0) S.watch.splice(i, 1); else S.watch.push(id);
  save('watch', S.watch);
}
