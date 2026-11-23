'use strict';
// Bazaar Flipper: Craft-Flips (Zutaten im Bazaar kaufen, Ergebnis im Bazaar verkaufen).
/* =========================================================
   Craft-Flips (nur Bazaar → Bazaar)
   ========================================================= */
let RECIPES = [];
// Rezepte liegen in data/recipes.json (wöchentlich automatisch aus dem NEU-Repo aktualisiert)
async function loadRecipes(){
  try{
    const r = await fetch('data/recipes.json', {cache:'no-cache'});
    RECIPES = await r.json();
  }catch(e){ console.warn('Rezepte konnten nicht geladen werden', e); }
}

function computeCrafts(){
  const s = S.set, tax = s.tax / 100, share = s.share / 100, out = [];
  for (let ri = 0; ri < RECIPES.length; ri++){
    const [oid, cnt, ins] = RECIPES[ri];
    const o = S.byId[oid];
    if (!o || !o.topBuy || !o.topSell) continue;
    let cost = 0, costInsta = 0, ok = true, allLiquid = liquid(o);
    const outRate = (s.craftSell === 'offer' ? o.wBuy : o.wSell) / 168 / cnt;   // Crafts/h, die der Markt beim Verkauf abnimmt
    let craftsH = outRate, inRate = Infinity, limiting = oid;
    const parts = [];
    for (const id in ins){
      const r = S.byId[id], q = ins[id];
      if (!r || !r.topBuy || !r.topSell){ ok = false; break; }
      const unit = s.craftBuy === 'insta' ? r.topSell : r.buyAt;
      cost += unit * q; costInsta += r.topSell * q;
      const rate = (s.craftBuy === 'insta' ? r.wBuy : r.wSell) / 168 / q;
      if (rate < craftsH){ craftsH = rate; limiting = id; }
      inRate = Math.min(inRate, rate);
      if (!liquid(r)) allLiquid = false;
      parts.push({id, q, unit, sub: unit * q});
    }
    if (!ok || cost <= 0) continue;
    const sellUnit = s.craftSell === 'offer' ? o.sellAt : o.topBuy;
    const revenue = sellUnit * cnt * (1 - tax);
    const profit = revenue - cost;
    const marginPct = profit / cost * 100;
    const fastProfit = o.topBuy * cnt * (1 - tax) - costInsta;
    const maxCrafts = Math.floor(s.budget / cost);
    const cyc = cycleModel(maxCrafts, s.craftBuy === 'insta' ? null : inRate * share, s.craftSell === 'insta' ? null : outRate * share);
    // Instabuy/Instasell sind sofort, aber auch dann nimmt der Markt nicht mehr ab als sein Handel hergibt
    const qty = Math.min(cyc.perH, craftsH * share);
    const pph = profit > 0 ? profit * qty : 0;
    const risk = [...o.risk];
    for (const p of parts){ const r = S.byId[p.id]; if (r.risk.length) risk.push(r.name + ': ' + r.risk[0]); }
    out.push({
      ri, id: oid, name: o.name, cnt, parts, cost, revenue, profit, marginPct, fastProfit,
      craftsH, qty, pph, limiting, limitingName: pretty(limiting), allLiquid, risk,
      ingredients: parts.map(p => fmt(p.q) + '× ' + pretty(p.id)).join(', '),
    });
  }
  return out;
}
function filteredCrafts(ignoreSearch){
  const s = S.set;
  return S.crafts.filter(c => c.allLiquid && stable(S.byId[c.id]) && c.profit >= s.craftMinProfit && c.marginPct >= s.craftMinPct &&
    c.marginPct <= s.maxPct && c.cost <= s.budget && (!s.hideRisky || !c.risk.length) &&
    (ignoreSearch || !S.search || (c.name + ' ' + c.ingredients + ' ' + c.id).toLowerCase().includes(S.search.toLowerCase())));
}
