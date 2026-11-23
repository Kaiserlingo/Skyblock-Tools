'use strict';
// Bazaar Flipper: Flip-Rechner (rechnet mit dem echten Orderbuch).
/* =========================================================
   Flip-Rechner
   Rechnet exakt mit dem aktuellen Orderbuch:
   - Buy-Order / Sell-Offer zu frei wählbaren Preisen (Standard: Top-Preis ± 0,1)
   - Instabuy / Instasell laufen durch die Orderbuch-Stufen (Ø-Preis statt nur Top-Preis)
   - Steuer nur auf Verkäufe (Sell-Offer und Instasell)
   - Füllzeiten aus dem 7-Tage-Handel: bestenfalls (du bleibst ganz oben) und realistisch (dein Anteil)
   ========================================================= */
const DAILY_LIMIT = 15e9;    // Standard-Tageslimit des Bazaars in Coins
const calcPrefs = Object.assign({mode: 'qty', qty: 0, budget: 0, buy: 'order', sell: 'offer', target: 2}, load('calcPrefs', {}));
const calcState = {buyPx: null, sellPx: null, item: null};   // null = automatisch (Live-Preis)
function saveCalc(){ save('calcPrefs', {mode: calcPrefs.mode, qty: calcPrefs.qty, budget: calcPrefs.budget, buy: calcPrefs.buy, sell: calcPrefs.sell, target: calcPrefs.target}); }

// Stufen eines Orderbuchs abarbeiten: nach Menge oder nach Coin-Budget
function walkBook(levels, {qty = Infinity, coins = Infinity}){
  let left = qty, money = coins, filled = 0, cost = 0, last = null;
  for (const l of levels || []){
    if (left <= 0 || money <= 0) break;
    let take = Math.min(left, l.amount);
    if (isFinite(money)) take = Math.min(take, Math.floor(money / l.pricePerUnit));
    if (take <= 0){ last = l.pricePerUnit; break; }
    filled += take; cost += take * l.pricePerUnit; left -= take; money -= take * l.pricePerUnit; last = l.pricePerUnit;
  }
  return {filled, cost, avg: filled ? cost / filled : null, last, exhausted: isFinite(qty) ? filled < qty : false};
}
const autoBuy = r => r1(r.topBuy + 0.1);
const autoSell = r => r1(r.topSell - 0.1);
const orderPx = (r, side) => side === 'buy' ? (calcState.buyPx ?? autoBuy(r)) : (calcState.sellPx ?? autoSell(r));

function flipCalc(r, buyMode, sellMode){
  const p = S.products[r.id], tax = S.set.tax / 100, share = S.set.share / 100, warn = [];
  // --- Menge bestimmen ---
  let qty;
  if (calcPrefs.mode === 'budget'){
    const budget = calcPrefs.budget || S.set.budget;
    qty = buyMode === 'insta' ? walkBook(p.buy_summary, {coins: budget}).filled : Math.floor(budget / orderPx(r, 'buy'));
  } else qty = Math.floor(calcPrefs.qty || Math.min(r.maxQty || 64, MAX_ORDER));
  qty = Math.max(0, qty);
  // --- Einkauf ---
  let buyPx, cost;
  if (buyMode === 'insta'){
    const w = walkBook(p.buy_summary, {qty});
    buyPx = w.avg; cost = w.cost;
    if (w.exhausted){ const rest = qty - w.filled; cost += rest * (w.last || r.topSell); buyPx = qty ? cost / qty : null; warn.push(`Das sichtbare Orderbuch hat nur ${NF0.format(w.filled)} Stück im Verkauf. Den Rest habe ich mit dem höchsten sichtbaren Preis geschätzt.`); }
  } else { buyPx = orderPx(r, 'buy'); cost = qty * buyPx; }
  // --- Verkauf ---
  let sellPx, gross;
  if (sellMode === 'insta'){
    const w = walkBook(p.sell_summary, {qty});
    sellPx = w.avg; gross = w.cost;
    if (w.exhausted){ const rest = qty - w.filled; gross += rest * (w.last || r.topBuy); sellPx = qty ? gross / qty : null; warn.push(`Im sichtbaren Orderbuch wollen nur ${NF0.format(w.filled)} Stück gekauft werden. Den Rest habe ich mit dem niedrigsten sichtbaren Preis geschätzt.`); }
  } else { sellPx = orderPx(r, 'sell'); gross = qty * sellPx; }
  const taxC = gross * tax, net = gross - taxC, profit = net - cost;
  // --- Zeit (Stunden) ---
  const instasellH = r.wSell / 168, instabuyH = r.wBuy / 168;   // Instasells füllen Buy-Orders, Instabuys füllen Sell-Offers
  const tBuy = buyMode === 'insta' ? {best: 0, real: 0} : {best: instasellH ? qty / instasellH : Infinity, real: instasellH ? qty / (instasellH * share) : Infinity};
  const tSell = sellMode === 'insta' ? {best: 0, real: 0} : {best: instabuyH ? qty / instabuyH : Infinity, real: instabuyH ? qty / (instabuyH * share) : Infinity};
  const tReal = tBuy.real + tSell.real, tBest = tBuy.best + tSell.best;
  const tUsed = qty > 0 ? Math.max(tReal, (S.set.minCycle || 0) / 60) : 0;
  // --- Hinweise ---
  if (buyMode === 'order' && sellMode === 'offer' && buyPx >= sellPx) warn.push('Dein Kaufpreis liegt nicht unter deinem Verkaufspreis – so gibt es keinen Gewinn.');
  if (buyMode === 'order' && buyPx > r.topSell && r.topSell) warn.push('Deine Buy-Order liegt über dem Instabuy-Preis. Dann ist Instabuy günstiger.');
  if (sellMode === 'offer' && sellPx < r.topBuy && r.topBuy) warn.push('Deine Sell-Offer liegt unter dem Instasell-Preis. Dann bekommst du per Instasell mehr.');
  const orders = Math.ceil(qty / MAX_ORDER);
  if (orders > 1) warn.push(`Pro Order gehen höchstens ${NF0.format(MAX_ORDER)} Stück – du brauchst ${orders} Orders.`);
  if (Math.max(cost, gross) > DAILY_LIMIT) warn.push(`Das Volumen liegt über dem Standard-Tageslimit des Bazaars von ${words(DAILY_LIMIT)} Coins – verteil den Flip auf mehrere Tage.`);
  if (cost > S.set.budget && calcPrefs.mode === 'qty') warn.push(`Der Einkauf (${fmt(cost)}) ist größer als dein Budget (${fmt(S.set.budget)}).`);
  if (r.risk.length) warn.push('Warnhinweis zum Item: ' + r.risk.join(' '));
  return {qty, buyPx, sellPx, cost, gross, taxC, net, profit, margin: cost ? profit / cost * 100 : 0, tBuy, tSell, tReal, tBest,
          tUsed, pph: tUsed > 0 && isFinite(tUsed) ? profit / tUsed : null, perDay: tUsed > 0 && isFinite(tUsed) ? Math.floor(24 / tUsed) : null, orders, warn};
}
function dur(h){
  if (h === 0) return 'sofort';
  if (!isFinite(h)) return 'unbekannt';
  if (h < 1/60) return 'unter 1 min';
  if (h < 1) return Math.round(h * 60) + ' min';
  if (h < 48) return NF1.format(h) + ' h';
  return NF1.format(h / 24) + ' Tage';
}
const MODE_NAMES = {order: 'Buy-Order', insta: 'Instabuy', offer: 'Sell-Offer', instas: 'Instasell'};
function calcSection(r){
  const qtyVal = calcPrefs.qty || Math.min(r.maxQty || 64, MAX_ORDER);
  const bv = calcState.buyPx ?? autoBuy(r), sv = calcState.sellPx ?? autoSell(r);
  return `<header><h2>Flip-Rechner</h2><p class="note">Rechnet mit dem aktuellen Orderbuch und deiner Bazaar-Steuer von ${NF2.format(S.set.tax)} %. Live-Preise werden automatisch übernommen, bis du selbst einen Preis einträgst.</p></header>
  <div class="fc-grid">
    <div class="fc-in">
      <div class="field">
        <div class="lblrow"><span class="lbl">${calcPrefs.mode === 'budget' ? 'Budget' : 'Menge'}</span>${segC('mode', [['qty','Menge'],['budget','Budget']])}</div>
        ${calcPrefs.mode === 'budget'
          ? `<div class="input"><input id="cBudget" data-cin="budget" inputmode="decimal" value="${coinText(calcPrefs.budget || S.set.budget)}"><span class="unit">Coins</span></div>
             <div class="quick">${[1e6, 10e6, 50e6, 100e6, 500e6].map(v => `<button data-cq="b:${v}">${fmt(v)}</button>`).join('')}<button data-cq="b:set">Mein Budget</button></div>`
          : `<div class="input"><input id="cQty" data-cin="qty" inputmode="numeric" value="${NF0.format(qtyVal)}"><span class="unit">Stück</span></div>
             <div class="quick">${[64, 640, 2240, 10000].map(v => `<button data-cq="q:${v}">${NF0.format(v)}</button>`).join('')}<button data-cq="q:budget" title="So viel, wie dein Budget beim aktuellen Kaufpreis hergibt">Max. Budget</button><button data-cq="q:order" title="Größte erlaubte Order">Max. Order</button></div>`}
      </div>
      <div class="field">
        <div class="lblrow"><span class="lbl">Kaufen per</span>${segC('buy', [['order','Buy-Order'],['insta','Instabuy']])}</div>
        ${calcPrefs.buy === 'order' ? priceInput('buy', bv, autoBuy(r), 'Höchste Buy-Order + 0,1') : `<p class="note" id="cBuyNote"></p>`}
      </div>
      <div class="field">
        <div class="lblrow"><span class="lbl">Verkaufen per</span>${segC('sell', [['offer','Sell-Offer'],['insta','Instasell']])}</div>
        ${calcPrefs.sell === 'offer' ? priceInput('sell', sv, autoSell(r), 'Niedrigste Sell-Offer − 0,1') : `<p class="note" id="cSellNote"></p>`}
      </div>
      <div class="field">
        <span class="lbl">Bazaar-Steuer</span>${segCtl('tax', [[1.25,'1,25 %'],[1.125,'1,125 %'],[1,'1 %']]).replace('class="seg"', 'class="seg full"')}
        <p class="note">1,125 % mit dem kostenlosen Community-Upgrade „Bazaar Flipper“, weniger mit dem kostenpflichtigen.</p>
      </div>
      ${sliderCtl('share')}
      <div class="field">
        <div class="lblrow"><span class="lbl">Ziel-Marge</span><div class="input small"><input id="cTarget" data-cin="target" inputmode="decimal" value="${NF1.format(calcPrefs.target)}"><span class="unit">%</span></div></div>
      </div>
    </div>
    <div class="fc-out" id="cOut">${calcResult(r)}</div>
  </div>
  <h3 class="fc-h">Alle Wege im Vergleich</h3>
  <div id="cCompare">${calcCompare(r)}</div>`;
}
function segC(key, opts){ return `<div class="seg sm">${opts.map(([v, l]) => `<button data-cset="${key}" data-val="${v}" class="${calcPrefs[key] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`; }
function priceInput(side, val, live, how){
  const manual = side === 'buy' ? calcState.buyPx != null : calcState.sellPx != null;
  return `<div class="input"><input id="c${side === 'buy' ? 'Buy' : 'Sell'}" data-cin="${side}Px" inputmode="decimal" value="${NF1f.format(val)}"><span class="unit">pro Stück</span></div>
    <p class="note" id="c${side}Live">${manual ? `Eigener Preis. Live: ${NF1f.format(live)} <button class="link" data-creset="${side}">Live-Preis nehmen</button>` : `Automatisch: ${how}.`} <button class="link" data-ccopy="${side}">Preis kopieren</button></p>`;
}
function calcResult(r){
  const c = flipCalc(r, calcPrefs.buy, calcPrefs.sell), tax = S.set.tax / 100, t = calcPrefs.target / 100;
  const be = c.buyPx / (1 - tax), tgtSell = c.buyPx * (1 + t) / (1 - tax), maxBuy = c.sellPx * (1 - tax) / (1 + t);
  // Risiko: sofort per Instasell raus / zum Tief des Zeitraums verkaufen
  const dump = walkBook(S.products[r.id].sell_summary, {qty: c.qty}), dumpNet = (dump.cost + (c.qty - dump.filled) * (dump.last || r.topBuy)) * (1 - tax) - c.cost;
  const ch = S.achart, lows = ch && ch.data.hi.filter(v => v != null);
  const low = lows && lows.length > 1 ? Math.min(...lows) : null, lowNet = low ? c.qty * (low - 0.1) * (1 - tax) - c.cost : null;
  const how = `${MODE_NAMES[calcPrefs.buy]} → ${calcPrefs.sell === 'offer' ? 'Sell-Offer' : 'Instasell'}`;
  return `${figures([
      ['Gewinn', `<span class="${cls(c.profit)}">${fmt(c.profit)}</span>`],
      ['Marge', `<span class="${cls(c.margin)}">${pct(c.margin, false)}</span>`],
      ['Dauer pro Durchlauf', dur(c.tReal) + (c.tUsed > c.tReal ? ` <small>(gerechnet: ${dur(c.tUsed)})</small>` : '')],
      ['Profit pro Stunde', c.pph != null ? fmt(c.pph) : '–'],
    ])}
    <div class="receipt">
      <div><span>Einkauf: ${NF0.format(c.qty)} × ${price(c.buyPx)}${calcPrefs.buy === 'insta' ? ' (Ø über das Orderbuch)' : ''}</span><b>− ${fmt(c.cost)}</b></div>
      <div><span>Verkauf: ${NF0.format(c.qty)} × ${price(c.sellPx)}${calcPrefs.sell === 'insta' ? ' (Ø über das Orderbuch)' : ''}</span><b>+ ${fmt(c.gross)}</b></div>
      <div><span>Bazaar-Steuer ${NF2.format(S.set.tax)} % auf den Verkauf</span><b>− ${fmt(c.taxC)}</b></div>
      <div class="sum"><span>Gewinn (${how})</span><b class="${cls(c.profit)}">${fmt(c.profit)}</b></div>
      <div class="per"><span>pro Stück</span><b>${price(c.qty ? c.profit / c.qty : 0)}</b></div>
    </div>
    ${facts([
      ['Buy-Order gefüllt', calcPrefs.buy === 'insta' ? 'sofort' : `${dur(c.tBuy.real)} <small>(bestenfalls ${dur(c.tBuy.best)})</small>`],
      ['Sell-Offer verkauft', calcPrefs.sell === 'insta' ? 'sofort' : `${dur(c.tSell.real)} <small>(bestenfalls ${dur(c.tSell.best)})</small>`],
      ['Durchläufe pro Tag', c.perDay != null ? NF0.format(c.perDay) : (c.tReal === 0 ? 'beliebig' : '–')],
      ['Gewinn pro Tag', c.perDay ? fmt(c.perDay * c.profit) : '–'],
      ['Kapital gebunden', fmt(c.cost) + (S.set.budget ? ` <small>(${NF0.format(c.cost / S.set.budget * 100)} % deines Budgets)</small>` : '')],
      ['Orders nötig', NF0.format(c.orders)],
    ])}
    <h3 class="fc-h">Preise zum Merken</h3>
    ${facts([
      ['Break-even Verkaufspreis', `${price(be)} <small>(ab hier kein Verlust)</small>`],
      [`Verkaufspreis für ${NF1.format(calcPrefs.target)} % Marge`, price(tgtSell)],
      [`Höchster Kaufpreis für ${NF1.format(calcPrefs.target)} % Marge`, price(maxBuy)],
      ['Abstand zum Break-even', c.sellPx ? `<span class="${cls(c.sellPx - be)}">${pct((c.sellPx - be) / be * 100)}</span>` : '–'],
    ])}
    <h3 class="fc-h">Wenn es schiefgeht</h3>
    ${facts([
      ['Sofort per Instasell wieder raus', `<span class="${cls(dumpNet)}">${fmt(dumpNet)}</span>`],
      ['Verkauf zum Tief im Chart-Zeitraum', lowNet != null ? `<span class="${cls(lowNet)}">${fmt(lowNet)}</span> <small>(bei ${price(low - 0.1)})</small>` : '<span class="mut">Chart lädt noch</span>'],
    ])}
    ${c.warn.length ? `<ul class="warnlist">${c.warn.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
}
function calcCompare(r){
  const combos = [['order','offer'],['order','insta'],['insta','offer'],['insta','insta']];
  const rows = combos.map(([b, s]) => ({b, s, c: flipCalc(r, b, s)}));
  const best = rows.filter(x => x.c.profit > 0).sort((x, y) => (y.c.pph ?? Infinity) - (x.c.pph ?? Infinity))[0];
  return `<div class="tablewrap"><table class="cmp"><thead><tr><th class="l nosort">Weg</th><th class="nosort">Menge</th><th class="nosort">Gewinn</th><th class="nosort">Marge</th><th class="nosort">Dauer</th><th class="nosort">Profit pro Stunde</th><th class="nosort"></th></tr></thead><tbody>
    ${rows.map(x => `<tr class="${calcPrefs.buy === x.b && calcPrefs.sell === x.s ? 'cur' : ''}" data-ccombo="${x.b}|${x.s}">
      <td class="l">${MODE_NAMES[x.b]} → ${x.s === 'offer' ? 'Sell-Offer' : 'Instasell'}${best === x ? ' <span class="tag">am schnellsten im Plus</span>' : ''}</td>
      <td>${NF0.format(x.c.qty)}</td><td class="${cls(x.c.profit)}">${fmt(x.c.profit)}</td><td class="${cls(x.c.margin)}">${pct(x.c.margin, false)}</td>
      <td>${dur(x.c.tReal)}</td><td>${x.c.pph != null ? fmt(x.c.pph) : '–'}</td>
      <td>${calcPrefs.buy === x.b && calcPrefs.sell === x.s ? '<span class="mut">gewählt</span>' : '<button class="link">wählen</button>'}</td></tr>`).join('')}
  </tbody></table></div>
  <p class="hint">Dauer „realistisch“: Handel der letzten 7 Tage × dein Anteil von ${NF1.format(S.set.share)} %. Profit pro Stunde rechnet mit mindestens ${S.set.minCycle} min pro Durchlauf (änderbar in den Einstellungen). „Bestenfalls“ heißt, deine Order bleibt die ganze Zeit ganz oben. Instabuy und Instasell sind sofort, kosten aber den Spread.</p>`;
}
function refreshCalc(full){
  const r = S.byId[S.itemId], box = $('#fcalc'); if (!r || !box) return;
  if (full){ box.innerHTML = calcSection(r); }
  else {
    const o = $('#cOut'); if (o) o.innerHTML = calcResult(r);
    const cp = $('#cCompare'); if (cp) cp.innerHTML = calcCompare(r);
    // Live-Preise nachziehen, solange nicht selbst eingetragen und nicht gerade getippt wird
    const act = document.activeElement ? document.activeElement.id : '';
    if (calcState.buyPx == null && act !== 'cBuy'){ const i = $('#cBuy'); if (i) i.value = NF1f.format(autoBuy(r)); }
    if (calcState.sellPx == null && act !== 'cSell'){ const i = $('#cSell'); if (i) i.value = NF1f.format(autoSell(r)); }
  }
  const c = flipCalc(r, calcPrefs.buy, calcPrefs.sell);
  const bn = $('#cBuyNote'); if (bn) bn.textContent = `Ø ${price(c.buyPx)} pro Stück über die günstigsten Sell-Offers.`;
  const sn = $('#cSellNote'); if (sn) sn.textContent = `Ø ${price(c.sellPx)} pro Stück über die höchsten Buy-Orders.`;
}
function initAnalysis(){
  wantTrend([S.itemId]);
  const el = $('#achart'); if (!el) return;
  if (S.achart) S.achart.destroy();
  const ch = S.achart = new PriceChart(el, {tools: true});
  ch.setIndicators({hi: chartPrefs.hi, lo: chartPrefs.lo, spread: chartPrefs.spread, volume: chartPrefs.volume, sma: chartPrefs.sma ? 20 : 0, ema: chartPrefs.ema ? 50 : 0, bb: chartPrefs.bb});
  ch.setDrawings(load(drawKey(S.itemId), []));
  ch.onChange = dr => save(drawKey(S.itemId), dr);
  ch.onHover = idx => anaLegend(idx);
  ch.setTool(anaTool);
  loadAnalysisChart();
}
async function loadAnalysisChart(){
  const id = S.itemId, ch = S.achart; if (!ch) return;
  document.querySelectorAll('[data-arange]').forEach(b => b.classList.toggle('on', b.dataset.arange === chartPrefs.arange));
  ch.empty = 'Lädt …'; ch.setData({t: []});
  const res = await loadHistory(id, chartPrefs.arange);
  if (S.achart !== ch || S.itemId !== id) return;
  anaRes = res;
  ch.empty = chartPrefs.arange === 'local' ? 'Dieser Browser hat für dieses Item noch keine Preise gesammelt.' : 'Für diesen Zeitraum gibt es keine Daten.';
  ch.cofl = res.source === 'cofl'; ch.setData(res.data); livePoint(ch, id);
  $('#aSrc').innerHTML = sourceNote(res) + ' Mausrad zoomt, Ziehen verschiebt, Doppelklick zeigt alles.';
  anaStats(); anaLegend(null); refreshCalc(false);
}
function anaLegend(idx){
  const el = $('#aLegend'), ch = S.achart; if (!el || !ch) return;
  const d = ch.data; if (!d.t.length){ el.innerHTML = ''; return; }
  const i = idx == null ? d.t.length - 1 : idx;
  const parts = [`<span class="mut">${new Date(d.t[i]).toLocaleString('de-AT', {weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})}</span>`];
  if (d.hi[i] != null) parts.push(`<span class="amber">Instabuy ${price(d.hi[i])}</span>`);
  if (d.lo[i] != null) parts.push(`<span class="pos">Instasell ${price(d.lo[i])}</span>`);
  if (d.hi[i] != null && d.lo[i] != null) parts.push(`<span>Spread ${price(d.hi[i] - d.lo[i])}</span>`);
  if (ch.smaL && ch.smaL[i] != null) parts.push(`<span class="i1">SMA 20 ${price(ch.smaL[i])}</span>`);
  if (ch.emaL && ch.emaL[i] != null) parts.push(`<span class="i2">EMA 50 ${price(ch.emaL[i])}</span>`);
  if (ch.bbL && ch.bbL.up[i] != null) parts.push(`<span class="i3">Bollinger ${price(ch.bbL.lo[i])} – ${price(ch.bbL.up[i])}</span>`);
  if (d.vb[i] != null || d.vs[i] != null) parts.push(`<span class="mut">Volumen ${fmt(d.vb[i])} / ${fmt(d.vs[i])}</span>`);
  el.innerHTML = parts.join('');
}
function anaStats(){
  const el = $('#aStats'), ch = S.achart; if (!el || !ch) return;
  const d = ch.data, n = d.t.length;
  if (n < 2){ el.innerHTML = '<p class="mut">Zu wenige Datenpunkte für eine Auswertung.</p>'; return; }
  const hi = d.hi.filter(v => v != null), lo = d.lo.filter(v => v != null), mid = ch.mid.filter(v => v != null);
  const avg = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const rets = []; for (let i = 1; i < mid.length; i++) if (mid[i-1]) rets.push((mid[i] - mid[i-1]) / mid[i-1]);
  const sd = Math.sqrt(avg(rets.map(x => (x - avg(rets)) ** 2))) * 100;
  const spreads = d.hi.map((h, i) => h != null && d.lo[i] ? (h - d.lo[i]) / d.lo[i] * 100 : null).filter(v => v != null);
  const r = S.byId[S.itemId], chg = mid.length ? (mid[mid.length-1] - mid[0]) / mid[0] * 100 : null;
  el.innerHTML = facts([
    ['Zeitraum', `${new Date(d.t[0]).toLocaleDateString('de-AT')} bis ${new Date(d.t[n-1]).toLocaleDateString('de-AT')}`], ['Datenpunkte', NF0.format(n)],
    ['Höchster Instabuy', price(Math.max(...hi))], ['Tiefster Instabuy', price(Math.min(...hi))],
    ['Höchster Instasell', price(Math.max(...lo))], ['Tiefster Instasell', price(Math.min(...lo))],
    ['Ø Instabuy', price(avg(hi))], ['Ø Instasell', price(avg(lo))],
    ['Veränderung (Mittelkurs)', `<span class="${cls(chg)}">${pct(chg)}</span>`], ['Ø Spread', pct(avg(spreads), false)],
    ['Schwankung pro Messpunkt', NF2.format(sd) + ' %'], ['Instabuy jetzt vs. Ø', r ? `<span class="${cls(r.topSell - avg(hi))}">${pct((r.topSell - avg(hi)) / avg(hi) * 100)}</span>` : '–'],
  ]);
}
function updateAnalysis(){
  const r = S.byId[S.itemId]; if (!r) return;
  const f = $('#aFig'); if (f) f.innerHTML = anaFigures(r);
  const rl = $('#aRel'); if (rl) rl.innerHTML = relDetail(r);
  const b = $('#aBuy'); if (b) b.innerHTML = book(S.products[S.itemId].sell_summary, 'buy');
  const sl = $('#aSell'); if (sl) sl.innerHTML = book(S.products[S.itemId].buy_summary, 'sell');
  refreshCalc(false);
  livePoint(S.achart, S.itemId);
}
function setAnaTool(t){
  anaTool = t;
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  const h = $('#toolHint'); if (h) h.textContent = TOOLS_DRAW.find(x => x[0] === t)[3];
  if (S.achart) S.achart.setTool(t);
}
