'use strict';
// Rahmen: Start der Seite (lädt Daten, zeichnet die erste Seite). Wird als letztes Skript geladen.
/* =========================================================
   Start
   ========================================================= */
(async function init(){
  route();
  setInterval(tick, 1000);
  await DB.open();
  S.hist = await DB.loadAll();
  const now = Date.now();
  for (const k in S.hist) compact(S.hist[k], now);
  await Promise.all([loadItems(), loadRecipes(), loadStats()]);
  poll();
  setInterval(loadStats, HOUR);
})();
