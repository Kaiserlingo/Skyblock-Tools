'use strict';
// Bazaar Flipper: Bazaar abrufen und jede Zeile berechnen (Preise, Gewinn, Profit pro Stunde, Risiken, Spread-Verlauf).
/* =========================================================
   Abruf & Auswertung
   ========================================================= */
async function poll(){
  clearTimeout(S.timer);
  S.state = 'load'; tick();
  try{
    const r = await fetch(API, {cache:'no-store'});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j.success) throw new Error(j.cause || 'API meldet Fehler');
    if (!j.products || typeof j.products !== 'object' || Object.keys(j.products).length < 10) throw new Error('unvollständige Antwort');
    S.lastFetch = Date.now(); S.polls++;
    const fresh = j.lastUpdated !== S.lastUpdated;
    S.lastUpdated = j.lastUpdated;
    S.products = j.products;
    S.state = 'ok';
    banner('');
    ingest(fresh);
  }catch(e){
    S.state = 'err'; S.err = e.message;
    banner('Die Hypixel-API antwortet gerade nicht (' + esc(e.message) + '). Die Seite versucht es alle ' + S.set.interval + ' Sekunden erneut. Prüf solange deine Internetverbindung.');
  }
  schedule(); tick();
}
function schedule(){
  clearTimeout(S.timer);
  if (S.paused){ S.nextAt = 0; return; }
  // Nächster Abruf kurz nach dem nächsten Hypixel-Update – so holen alle Browser dieselbe Momentaufnahme
  const now = Date.now(), iv = S.set.interval * 1000;
  let next = S.lastUpdated && S.state === 'ok' ? S.lastUpdated + iv + 1500 : now + iv;
  next = Math.min(Math.max(next, now + 4000), now + iv);
  S.nextAt = next;
  S.timer = setTimeout(poll, next - now);
}
function ingest(fresh){
  const t = S.lastUpdated || Date.now();
  const rows = [], byId = {};
  for (const id in S.products){
    const row = compute(id, S.products[id]);
    rows.push(row); byId[id] = row;
    if (fresh && (row.topBuy || row.topSell)) pushHist(id, t, row.topBuy, row.topSell);
  }
  for (const r of rows) assess(r);
  S.rows = rows; S.byId = byId;
  S.crafts = computeCrafts();
  const now = Date.now();
  if (now - S.lastSave > 5*60e3){
    for (const k in S.hist) compact(S.hist[k], now);
    S.lastSave = now;
    DB.saveAll(S.hist);
  }
  checkAlerts();
  render();
  if (S.detail) renderDetail(true);
  if (S.craftDetail != null) renderCraftDetail();
}

/* Ein Modell für „Profit pro Stunde“ – in Tabellen, Übersicht, Analyse und Flip-Rechner gleich:
   Ein Durchlauf = Q Stück kaufen, dann Q Stück verkaufen.
   Buy-Orders füllen sich mit deinem Anteil an den Instasells (a / h), Sell-Offers mit deinem Anteil an den Instabuys (b / h).
   Dauer T = Q/a + Q/b, aber mindestens „Mindestens pro Durchlauf“. Stück pro Stunde = Q / T. */
function cycleModel(Q, buyRate, sellRate){
  if (!(Q > 0)) return {T: 0, Tused: 0, perH: 0};
  const T = (buyRate == null ? 0 : (buyRate > 0 ? Q / buyRate : Infinity)) + (sellRate == null ? 0 : (sellRate > 0 ? Q / sellRate : Infinity));
  const Tused = Math.max(T, (S.set.minCycle || 0) / 60);
  return {T, Tused, perH: isFinite(Tused) && Tused > 0 ? Q / Tused : 0};
}
function compute(id, p){
  const qs = p.quick_status || {};
  const bo = p.sell_summary && p.sell_summary[0];   // höchste Buy-Order (= Instasell-Preis)
  const so = p.buy_summary && p.buy_summary[0];     // niedrigste Sell-Offer (= Instabuy-Preis)
  const topBuy = bo ? bo.pricePerUnit : 0;
  const topSell = so ? so.pricePerUnit : 0;
  const buyAt = topBuy ? r1(topBuy + 0.1) : 0;
  const sellAt = topSell ? r1(topSell - 0.1) : 0;
  const tax = S.set.tax / 100;
  const profit = (buyAt && sellAt) ? sellAt*(1-tax) - buyAt : 0;
  const marginPct = buyAt ? profit / buyAt * 100 : 0;
  const wBuy = qs.buyMovingWeek || 0;    // Instabuys / Woche  -> füllt Sell-Offers
  const wSell = qs.sellMovingWeek || 0;  // Instasells / Woche -> füllt Buy-Orders
  const perHour = Math.min(wBuy, wSell) / 168;
  const mid = (topBuy && topSell) ? (topBuy + topSell) / 2 : (topBuy || topSell);
  const turnH = perHour * mid;
  const balance = Math.max(wBuy, wSell) ? Math.min(wBuy, wSell) / Math.max(wBuy, wSell) * 100 : 0;
  const maxQty = buyAt ? Math.min(MAX_ORDER, Math.floor(S.set.budget / buyAt)) : 0;
  const share = S.set.share / 100;
  const cyc = cycleModel(maxQty, wSell / 168 * share, wBuy / 168 * share);
  const qty = cyc.perH;                          // Stück pro Stunde
  const pph = profit > 0 ? profit * qty : 0;
  const spreadPct = topBuy ? (topSell - topBuy) / topBuy * 100 : 0;
  const npc = S.npc[id] || 0;
  const npcInsta = npc && topSell ? npc - topSell : 0;
  const npcOrder = npc && buyAt ? npc - buyAt : 0;
  const npcQty = npcOrder > 0 ? cycleModel(maxQty, wSell / 168 * share, null).perH * 24 : 0;   // Stück pro Tag (NPC kauft sofort)
  return {
    id, name: pretty(id), topBuy, topSell, buyAt, sellAt, profit, marginPct, wBuy, wSell, wVol: wBuy + wSell,
    perHour, turnH, balance, maxQty, qty, pph, spreadPct, cycleT: cyc.T,
    buyOrders: qs.buyOrders || 0, sellOrders: qs.sellOrders || 0,
    topBuyOrders: bo ? bo.orders : 0, topSellOrders: so ? so.orders : 0,
    npc, npcInsta, npcOrder, npcQty, npcTotal: npcOrder > 0 ? npcOrder * npcQty : 0,
    risk: [], d1h: null, d24h: null,
  };
}
// Bewertung eines Items – ausschließlich aus Daten, die für alle gleich sind:
// dem Hypixel-Snapshot und (für Trends) dem Verlauf von SkyCofl. Nichts hängt davon ab,
// wie lange dieser Browser schon offen ist.
function assess(r){
  const q = S.products[r.id] && S.products[r.id].quick_status;
  // Abweichung des obersten Preises vom gewichteten Durchschnitt der besten Orders (Hypixel quick_status)
  const devS = q && q.buyPrice && r.topSell ? Math.abs(r.topSell - q.buyPrice) / q.buyPrice * 100 : 0;
  const devB = q && q.sellPrice && r.topBuy ? Math.abs(r.topBuy - q.sellPrice) / q.sellPrice * 100 : 0;
  r.dev = Math.max(devS, devB);
  if (r.dev > 25) r.risk.push('Der oberste Preis weicht stark vom Durchschnitt der besten Orders ab (' + NF0.format(r.dev) + ' %) – mögliche Lock- oder Dump-Order');
  if (r.perHour < 5) r.risk.push('Sehr wenig Volumen – Orders füllen sich nur langsam');
  if (r.marginPct > 100) r.risk.push('Extreme Marge – oft Manipulation oder kaum Handel');
  reliability(r, q);
  const t = trendCache[r.id];
  r.d1h = t ? t.d1h : null; r.d24h = t ? t.d24h : null;
}
/* Verlässlichkeit aus dem Verlauf der letzten 7 Tage (Spread, Preisniveau, Trend, Volumen).
   Spreads werden wie im Verlauf aus den gewichteten Preisen der besten Orders (quick_status) gerechnet,
   damit „jetzt" und „üblich" dieselbe Größe sind. */
function reliability(r, q){
  const st = S.stats && S.stats.items && S.stats.items[r.id];
  r.st = st || null;
  r.sNow = r.sMed = r.sRatio = r.okShare = r.askDev = r.bidDev = r.tr7 = r.vt7 = r.swing = r.drift = null;
  r.profitTyp = r.profit; r.pphTyp = r.pph;
  if (!q || !(q.buyPrice > 0) || !(q.sellPrice > 0)) return;
  r.sNow = q.buyPrice / q.sellPrice - 1;
  if (!st || !st.sq) return;
  const tax = S.set.tax / 100;
  r.sMed = st.sq[10];
  r.sRatio = r.sMed > 0 ? r.sNow / r.sMed : null;
  // Anteil der Zeit, in der der Flip lohnend war: dein Spread (Sell-Offer/Buy-Order) im Verhältnis zum gewichteten Spread
  const own = r.buyAt > 0 && r.sellAt > 0 ? r.sellAt / r.buyAt - 1 : null;
  const k = own != null && r.sNow > 0 && own > 0 ? own / r.sNow : 1;
  r.okShare = shareAbove(st.sq, tax / (1 - tax) / k);
  r.askDev = st.am > 0 ? q.buyPrice / st.am - 1 : null;
  r.bidDev = st.bm > 0 ? q.sellPrice / st.bm - 1 : null;
  r.tr7 = st.tr; r.vt7 = st.vt; r.swing = st.ra;
  // Gewinn bei üblichem Spread: ist der Spread gerade größer als üblich, rechnen wir mit dem üblichen
  if (r.buyAt > 0 && r.sellAt > 0 && r.sRatio != null){
    const ownTyp = own / Math.max(r.sRatio, 1);
    r.profitTyp = Math.min(r.profit, r.buyAt * (1 + ownTyp) * (1 - tax) - r.buyAt);
    r.pphTyp = r.profitTyp > 0 ? r.profitTyp * r.qty : 0;
  }
  // erwarteter Preisrückgang während eines Durchlaufs (bei fallendem 7-Tage-Trend)
  const T = r.qty > 0 ? r.maxQty / r.qty : 0;   // Stunden pro Durchlauf
  if (r.tr7 != null && r.tr7 < 0 && T > 0) r.drift = -r.tr7 / (6 * 24) * T * r.sellAt;
  if (r.sRatio != null && r.sRatio > 3 && r.sNow > 0.01) r.risk.push(`Spread gerade ${NF1.format(r.sRatio)}-mal so groß wie in den letzten 7 Tagen üblich – der Gewinn ist wahrscheinlich nur kurz da`);
  if (r.askDev != null && r.askDev > 0.25) r.risk.push(`Instabuy-Preis ${NF0.format(r.askDev * 100)} % über dem Wochenmedian – Verkaufspreis könnte zurückfallen`);
  if (r.bidDev != null && r.bidDev < -0.25) r.risk.push(`Instasell-Preis ${NF0.format(-r.bidDev * 100)} % unter dem Wochenmedian – ungewöhnlicher Preiseinbruch`);
  if (r.tr7 != null && r.tr7 < -0.2) r.risk.push(`Preis in 7 Tagen um ${NF0.format(-r.tr7 * 100)} % gefallen – fallender Markt`);
  if (r.vt7 != null && r.vt7 < -0.4) r.risk.push(`Handelsvolumen in 7 Tagen um ${NF0.format(-r.vt7 * 100)} % gesunken`);
  if (r.drift != null && r.profit > 0 && r.drift > r.profit) r.risk.push('Der Preis fällt während eines Durchlaufs voraussichtlich stärker, als der Flip pro Stück einbringt');
}
// Spread-Filter: nur wenn der Verlauf geladen ist; Items ohne Verlauf fallen bei aktivem Filter heraus
function spreadOk(r){
  const s = S.set;
  if (!S.stats) return true;
  if (s.maxSpreadRatio >= 1000 && !(s.minOkShare > 0)) return true;
  if (!r.st) return false;
  if (s.maxSpreadRatio < 1000 && (r.sRatio == null || r.sRatio > s.maxSpreadRatio)) return false;
  if (s.minOkShare > 0 && (r.okShare == null || r.okShare * 100 < s.minOkShare)) return false;
  return true;
}
/* „Gefragt" = auf beiden Seiten viel Handel, damit sich Buy-Orders UND Sell-Offers schnell füllen */
function liquid(r){
  const s = S.set;
  return !!r && r.topBuy > 0 && r.topSell > 0 && r.perHour >= s.minVolH && r.turnH >= s.minTurnH && r.balance >= s.minBalance;
}
function matchSearch(r){
  if (!S.search) return true;
  const q = S.search.toLowerCase();
  return r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q);
}
// Oberster Preis liegt nah genug am Durchschnitt der besten Orders
function stable(r){ return !!r && (S.set.maxDev >= 1000 || r.dev <= S.set.maxDev); }
function filteredFlips(ignoreSearch){
  const s = S.set;
  return S.rows.filter(r =>
    r.profit >= s.minProfit && r.marginPct >= s.minPct && r.marginPct <= s.maxPct &&
    liquid(r) && stable(r) && spreadOk(r) && r.buyAt > 0 && r.buyAt <= s.budget &&
    (!s.hideRisky || !r.risk.length) && (ignoreSearch || matchSearch(r)));
}
