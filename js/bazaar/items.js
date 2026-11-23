'use strict';
// Bazaar Flipper: Item-Namen, NPC-Preise, Rezepte laden.
/* =========================================================
   Item-Namen & NPC-Preise
   ========================================================= */
async function loadItems(){
  const cached = load('items', null);
  if (cached && Date.now() - cached.t < 24*HOUR){ applyItems(cached); return; }
  try{
    const r = await fetch(ITEMS_API, {cache:'no-store'});
    const j = await r.json();
    if (!j.success) return;
    const names = {}, npc = {}, tiers = {};
    for (const it of j.items){
      names[it.id] = String(it.name || '').replace(/§./g, '');
      if (it.npc_sell_price) npc[it.id] = it.npc_sell_price;
      if (it.tier) tiers[it.id] = it.tier;
    }
    const obj = {t: Date.now(), names, npc, tiers};
    applyItems(obj); save('items', obj);
  }catch(e){ console.warn('Items konnten nicht geladen werden', e); }
}
async function loadStats(){
  try{
    const r = await fetch(STATS_URL + '?t=' + Math.floor(Date.now() / 60e3), {cache:'no-store'});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j || !j.items || typeof j.items !== 'object') throw new Error('leer');
    S.stats = j; S.statsErr = false;
  }catch(e){ console.warn('Spread-Verlauf konnte nicht geladen werden', e); S.statsErr = !S.stats; }
  if (S.rows.length) ingest(false);
}
// Anteil der Zeit, in der der Spread mindestens x war (21 Quantile, linear interpoliert) – gleiche Rechnung wie E.shareAbove
function shareAbove(sq, x){
  if (!sq || sq.length !== 21 || x == null || !isFinite(x)) return null;
  if (x <= sq[0]) return 1; if (x > sq[20]) return 0;
  for (let k = 0; k < 20; k++){
    const a = sq[k], b = sq[k + 1];
    if (x <= b){ const f = b > a ? (x - a) / (b - a) : 1; return 1 - (k + f) / 20; }
  }
  return 0;
}
function applyItems(o){ S.names = o.names || {}; S.npc = o.npc || {}; S.tiers = o.tiers || {}; }
