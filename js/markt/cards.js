'use strict';
// Markt-Analyse: die Karten der Item-Reiter (Angebot & Nachfrage, Entwicklung, Kosten & Gewinn, Risiko, Herstellung).
/* --- Angebot und Nachfrage --- */
function supplyDemandHTML(I){
  if (I.k.bz){
    const p = S.products[I.id]; if (!p) return card('Angebot und Nachfrage', '', '<p class="loading">Live-Daten laden …</p>');
    const b = E.book(p), q = p.quick_status || {};
    return card('Angebot und Nachfrage', 'Jede Buy-Order ist ein Spieler, der zu diesem Preis kaufen will (Nachfrage). Jede Sell-Offer ist ein Angebot. Wo sich die Kurven fast treffen, liegt der Marktpreis. Hypixel zeigt die besten 30 Preisstufen je Seite.',
      curveSVG(b) + mkFacts([
        ['Gleichgewichtsbereich', `${price(b.bid)} bis ${price(b.ask)}`], ['Spread', b.spreadPct != null ? P(b.spreadPct, false) : '–'],
        ['Nachfrage (Buy-Orders)', `${fmt(q.sellVolume)} Stück`], ['Angebot (Sell-Offers)', `${fmt(q.buyVolume)} Stück`],
        ['Tiefe ±2 % Nachfrage', fmt(b.depth2.demand) + ' Stück'], ['Tiefe ±2 % Angebot', fmt(b.depth2.supply) + ' Stück'],
        ['Instabuys pro Woche', fmt(q.buyMovingWeek)], ['Instasells pro Woche', fmt(q.sellMovingWeek)],
        ['Überhang (sichtbar)', b.imbalance == null ? '–' : (b.imbalance > 0 ? 'Nachfrage ' : 'Angebot ') + P(Math.abs(b.imbalance), false)],
      ]));
  }
  const ah = I.ah || {}, s = ah.sold, x = pxOf(I.id), l5 = x && x.l5 || [];
  return card('Angebot und Nachfrage', 'Das Angebot sind die BIN-Auktionen, die Nachfrage zeigt sich in den Verkäufen. Je weiter die günstigsten BINs auseinanderliegen, desto dünner ist der Markt.',
    (l5.length ? `<table class="mk-mini"><thead><tr><th class="l nosort">Günstigste BINs</th><th class="nosort">Preis</th><th class="nosort">Abstand</th></tr></thead><tbody>${l5.map((p, i) => `<tr class="static"><td class="l">${i + 1}.</td><td>${price(p)}</td><td class="mut">${i ? P(p / l5[0] - 1) : ''}</td></tr>`).join('')}</tbody></table><p class="note">${NF0.format(x.n)} BIN-Angebote insgesamt. ${pxNote()}</p>` : '<p class="note">Gerade keine BIN-Angebote.</p>')
    + mkFacts(s ? [['Verkäufe erfasst', `${NF0.format(s.n)} in ${NF1.format(s.span)} Tagen`], ['Verkäufe pro Tag', NF1.format(s.perDay)], ['Preis 10 % / 50 % / 90 %', `${fmt(s.q10)} / ${fmt(s.q50)} / ${fmt(s.q90)}`], ['Median ohne Enchants/Reforge', s.cleanN ? `${price(s.cleanMed)} (${NF0.format(s.cleanN)} Verkäufe)` : '–'], ['Preisstreuung (Variationskoeffizient)', NF2.format(s.cv)]] : [['Verkäufe', 'keine Daten']]));
}
function curveSVG(b){
  const W = 520, H = 220, L = 54, R = 10, T = 10, B = 28;
  const dem = b.demand, sup = b.supply; if (!dem.length && !sup.length) return '<p class="note">Orderbuch leer.</p>';
  const mid = b.mid, keep = l => l.p >= mid * .7 && l.p <= mid * 1.3;
  let d = dem.filter(keep), s = sup.filter(keep);
  // sehr weiter Spread: keine Stufe liegt nahe der Mitte – dann die besten Stufen beider Seiten zeigen
  if (!d.length && !s.length){ d = dem.slice(0, 10); s = sup.slice(0, 10); }
  const qmax = Math.max(1, ...d.map(l => l.q), ...s.map(l => l.q)), ps = [...d, ...s].map(l => l.p);
  let pmin = Math.min(...ps), pmax = Math.max(...ps); if (pmin === pmax){ pmin *= .99; pmax *= 1.01; }
  const X = q => L + q / qmax * (W - L - R), Y = p => T + (1 - (p - pmin) / (pmax - pmin)) * (H - T - B);
  const step = (arr) => { if (!arr.length) return ''; let dd = `M${X(0)},${Y(arr[0].p)}`, prev = 0; for (const l of arr){ dd += ` H${X(l.q)}`; const nx = arr[arr.indexOf(l) + 1]; if (nx) dd += ` V${Y(nx.p)}`; prev = l.q; } return dd; };
  const ticks = [pmin, (pmin + pmax) / 2, pmax];
  return `<svg class="mk-curve" viewBox="0 0 ${W} ${H}" role="img" aria-label="Nachfrage- und Angebotskurve">
    ${ticks.map(p => `<line x1="${L}" x2="${W - R}" y1="${Y(p)}" y2="${Y(p)}" class="g"/><text x="${L - 6}" y="${Y(p) + 4}" text-anchor="end">${esc(fmt(p))}</text>`).join('')}
    <text x="${L}" y="${H - 8}">0</text><text x="${W - R}" y="${H - 8}" text-anchor="end">${esc(fmt(qmax))} Stück</text>
    <path d="${step(d)}" class="dem"/><path d="${step(s)}" class="sup"/>
    <text x="${W - R}" y="${Y(d.length ? d[d.length - 1].p : pmin) - 6}" text-anchor="end" class="dl">Nachfrage</text>
    <text x="${W - R}" y="${Y(s.length ? s[s.length - 1].p : pmax) + 14}" text-anchor="end" class="sl">Angebot</text></svg>`;
}

/* --- Elastizität --- */
function elastText(e, what, expectSign){
  if (!e) return `<p class="note">Zu wenige Wochen mit Daten für eine Schätzung der ${what}.</p>`;
  const a = Math.abs(e.b), wrong = e.sig && Math.sign(e.b) !== expectSign;
  const word = !e.sig ? 'kein sicher messbarer Zusammenhang' : wrong ? (expectSign < 0 ? 'Menge steigt mit dem Preis: Nachfrageschübe treiben den Preis, eine Elastizität lässt sich so nicht ablesen' : 'Menge fällt mit dem Preis: Angebotsschübe drücken den Preis, eine Elastizität lässt sich so nicht ablesen') : a > 1 ? 'elastisch' : 'unelastisch';
  return mkFacts([[what, `${NF2.format(e.b)} <small>(${NF2.format(e.lo)} bis ${NF2.format(e.hi)})</small>`], ['Einordnung', word], ['Erklärte Streuung (R²)', NF2.format(e.r2)], ['Wochen', NF0.format(e.n)]]);
}
function elasticityHTML(I){
  const A = I.A;
  return card('Preiselastizität', I.k.bz
    ? 'Nachfrage: Wie viele Instabuys gibt es weniger, wenn der Instabuy-Preis um 1 % steigt? Angebot: Wie viel mehr wird per Instasell verkauft, wenn der Preis um 1 % steigt? Die Schätzung zeigt einen Zusammenhang, keine Ursache: Auch Updates und Mayors verschieben beide Größen.'
    : 'Wie stark ändert sich die Zahl der Verkäufe pro Woche, wenn der günstigste Preis um 1 % steigt?',
    elastText(A.eD, 'Nachfrageelastizität', -1) + (I.k.bz ? elastText(A.eS, 'Angebotselastizität', 1) : '')
    + `<p class="note">Werte in Klammern: 95-%-Konfidenzintervall. Liegt die 0 darin, lässt sich kein Zusammenhang belegen. Klassisch ist die Nachfrageelastizität negativ (teurer heißt weniger gekauft) und die Angebotselastizität positiv.</p>`);
}

/* --- Preiskorridor --- */
function craftResult(I, mode){
  const rec = recipesMap(); if (!rec.has(I.id)) return null;
  const pf = id => { const r = liveRow(id); if (!r || !r.topBuy || !r.topSell) return null; return mode === 'insta' ? r.topSell : r.buyAt; };
  const res = E.makeOrBuy(I.id, id => id === I.id ? null : pf(id), rec, 4);
  return res.craft != null ? res : null;
}
let RMAP = null, RMAPn = -1;
function recipesMap(){
  if (RMAP && RMAPn === RECIPES.length) return RMAP;
  RMAP = new Map(); for (const [o, c, ins] of RECIPES){ if (!RMAP.has(o)) RMAP.set(o, []); RMAP.get(o).push([c, ins]); }
  RMAPn = RECIPES.length; return RMAP;
}
function marketPrice(I){
  const r = liveRow(I.id); if (I.k.bz && r && r.topBuy && r.topSell) return {buy: r.topSell, sell: r.topBuy};
  const x = pxOf(I.id); if (!I.k.bz && x && x.b != null) return {buy: x.b, sell: I.ah && I.ah.sold ? I.ah.sold.q50 : null};
  return null;
}
function corridorHTML(I){
  const h = K.hy && K.hy[I.id], npc = h && h.npc_sell_price, mp = marketPrice(I);
  const co = craftResult(I, 'order'), ci = craftResult(I, 'insta');
  // Verkaufserlös nach Gebühr: Bazaar-Steuer bzw. Auction-House-Gebühr
  const net = p => p == null ? null : I.k.bz ? p * (1 - BZ_TAX()) : p * (1 - ahFee(p));
  const rows = [['NPC-Verkaufspreis (Untergrenze)', npc ? price(npc) : 'keiner'],
    ['Craft-Kosten, Zutaten per Instabuy (harte Obergrenze)', ci ? price(ci.craft) : 'kein Bazaar-Rezept'],
    ['Craft-Kosten, Zutaten per Buy-Order (weiche Obergrenze)', co ? price(co.craft) : 'kein Bazaar-Rezept'],
    I.k.bz ? ['Marktpreis jetzt (Instasell bis Instabuy)', mp ? `${price(mp.sell)} bis ${price(mp.buy)}` : '–'] : ['Lowest BIN jetzt', mp ? price(mp.buy) : '–']];
  let verdict = '';
  const sellNow = I.k.bz ? mp && mp.sell : mp && mp.buy;      // sofort verkaufen: Instasell bzw. knapp unter Lowest BIN
  const sellWait = mp && mp.buy;                              // mit Geduld: Sell-Offer am Instabuy-Preis bzw. Lowest BIN
  if (mp && npc && mp.buy && mp.buy < npc) verdict = `<p class="mk-alert">Der Kaufpreis liegt unter dem NPC-Preis: kaufen und an den NPC verkaufen bringt ${price(npc - mp.buy)} pro Stück. Solche Lücken schließen sich meist schnell.</p>`;
  else if (ci && sellNow && net(sellNow) > ci.craft) verdict = `<p class="mk-alert">Sofort-Arbitrage: Zutaten per Instabuy kaufen, craften und sofort verkaufen bringt ${price(net(sellNow) - ci.craft)} pro Stück nach Gebühr. Das gilt für die besten Angebote im Orderbuch. Bleibt so eine Lücke länger offen, reicht meist die Zutatenmenge zum günstigen Preis nicht für viele Crafts.</p>`;
  else if (co && sellWait && net(sellWait) > co.craft) verdict = `<p class="note">Craften mit Geduld lohnt: Zutaten per Buy-Order kaufen und ${I.k.bz ? 'per Sell-Offer' : 'zum Lowest BIN'} verkaufen bringt ${price(net(sellWait) - co.craft)} pro Stück nach Gebühr (${P(net(sellWait) / co.craft - 1, false)}). Das zieht langsam neues Angebot an und drückt den Preis Richtung Craft-Kosten.</p>`;
  else if (mp && (npc || co)) verdict = `<p class="note">Der Preis liegt im Korridor${npc && mp.sell ? `, ${P(mp.sell / npc - 1, false)} über der Untergrenze` : ''}${co && sellWait ? `, nach Gebühr ${P(1 - net(sellWait) / co.craft, false)} unter den Craft-Kosten mit Buy-Orders` : ''}. Craften lohnt sich gerade nicht.</p>`;
  return card('Preisuntergrenze und Obergrenze', 'Unter den NPC-Preis fällt ein Item nicht lange, weil dann jeder an den NPC verkauft. Nach oben begrenzt das Craften: Liegen die Craft-Kosten mit Instabuy unter dem Sofort-Verkaufspreis, ist das risikofreier Gewinn und wird sofort ausgenutzt (harte Grenze). Mit Buy-Orders ist Craften billiger, braucht aber Zeit, bis die Orders gefüllt sind (weiche Grenze).', mkFacts(rows) + verdict);
}

/* --- Inflation --- */
function inflationHTML(I){
  const A = I.A; if (!A.spi) return card('Inflation und realer Preis', '', '<p class="loading">Index lädt …</p>');
  const real = (c, m) => c == null || m == null ? null : (1 + c) / (1 + m) - 1;
  return card('Inflation und realer Preis', 'Steigt ein Item um 5 %, während alles um 7 % teurer wird, ist es real billiger geworden. Beta zeigt, wie stark das Item mit dem Gesamtmarkt mitgeht: 1 heißt im Gleichschritt, 0 heißt unabhängig.',
    `<table class="mk-mini"><thead><tr><th class="l nosort"></th><th class="nosort">Item</th><th class="nosort">Preisindex</th><th class="nosort">real</th></tr></thead><tbody>
      ${[['30 Tage', A.c30, A.m30], ['90 Tage', A.c90, A.m90], ['1 Jahr', A.c365, A.m365]].map(([l, c, m]) => `<tr class="static"><td class="l">${l}</td><td>${PC(c)}</td><td>${PC(m)}</td><td>${PC(real(c, m))}</td></tr>`).join('')}</tbody></table>`
    + mkFacts([['Beta zum Markt', A.beta ? NF2.format(A.beta.b) + ` <small>(${NF2.format(A.beta.lo)} bis ${NF2.format(A.beta.hi)})</small>` : '–'], ['Korrelation', A.beta ? NF2.format(A.beta.r) : '–']]));
}

/* --- Marktstruktur --- */
function hhiWord(h){ return h == null ? '–' : h < .15 ? 'viel Wettbewerb' : h < .25 ? 'mäßig konzentriert' : 'stark konzentriert'; }
function structureHTML(I){
  if (I.k.bz){
    const p = S.products[I.id]; if (!p) return card('Marktstruktur und Wettbewerb', '', '<p class="loading">Live-Daten laden …</p>');
    const b = E.book(p), q = p.quick_status || {};
    return card('Marktstruktur und Wettbewerb', 'Viele kleine Orders auf vielen Preisstufen heißen: niemand bestimmt den Preis. Steht ein Großteil der Menge in einer einzigen Stufe, kann ein einzelner Spieler den Preis halten oder drücken.',
      mkFacts([['Buy-Orders gesamt', NF0.format(q.sellOrders || 0)], ['Sell-Offers gesamt', NF0.format(q.buyOrders || 0)], ['Ø Größe Buy-Order (sichtbar)', b.d.avgOrder ? fmt(b.d.avgOrder) + ' Stück' : '–'], ['Ø Größe Sell-Offer (sichtbar)', b.s.avgOrder ? fmt(b.s.avgOrder) + ' Stück' : '–'],
        ['HHI Nachfrage', b.d.hhi != null ? `${NF2.format(b.d.hhi)} <small>${hhiWord(b.d.hhi)}</small>` : '–'], ['HHI Angebot', b.s.hhi != null ? `${NF2.format(b.s.hhi)} <small>${hhiWord(b.s.hhi)}</small>` : '–'],
        ['Größte Preisstufe Nachfrage', b.d.topShare != null ? P(b.d.topShare, false) + ' der Menge' : '–'], ['Größte Preisstufe Angebot', b.s.topShare != null ? P(b.s.topShare, false) + ' der Menge' : '–']]));
  }
  const s = I.ah && I.ah.sold;
  return card('Marktstruktur und Wettbewerb', 'Kommen die Verkäufe von vielen verschiedenen Spielern, herrscht Wettbewerb. Verkauft fast nur einer, bestimmt er den Preis.',
    s ? mkFacts([['Verschiedene Verkäufer', NF0.format(s.sellers)], ['Anteil des größten Verkäufers', P(s.top, false)], ['HHI der Verkäufer', `${NF2.format(s.hhi)} <small>${hhiWord(s.hhi)}</small>`]]) : '<p class="note">Keine Verkäufe erfasst.</p>');
}

/* --- Saisonalität --- */
function barsSVG(prof, keys, labels){
  const vals = keys.map(k => prof && prof[k] ? prof[k].dev : null), mx = Math.max(.001, ...vals.filter(num).map(Math.abs));
  const W = 520, H = 120, L = 6, bw = (W - L * 2) / keys.length, mid = 58;
  return `<svg class="mk-bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Abweichung vom Durchschnitt">
    <line x1="0" x2="${W}" y1="${mid}" y2="${mid}" class="g"/>
    ${vals.map((v, i) => { if (v == null) return ''; const h = Math.abs(v) / mx * 44, x = L + i * bw + bw * .15; return `<rect x="${x}" y="${v >= 0 ? mid - h : mid}" width="${bw * .7}" height="${Math.max(h, .5)}" class="${v >= 0 ? 'up' : 'dn'}"><title>${labels[i]}: ${P(v)}</title></rect>`; }).join('')}
    ${labels.map((l, i) => i % Math.ceil(keys.length / 12) ? '' : `<text x="${L + i * bw + bw / 2}" y="${H - 4}" text-anchor="middle">${l}</text>`).join('')}</svg>`;
}
function seasonHTML(I){
  const A = I.A, WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'], order = [1, 2, 3, 4, 5, 6, 0];
  const best = (prof, keys, lab) => { const e = keys.filter(k => prof && prof[k]).map(k => [k, prof[k].dev]); if (e.length < 3) return null; e.sort((a, b) => a[1] - b[1]); return {lo: lab(e[0][0]), loV: e[0][1], hi: lab(e[e.length - 1][0]), hiV: e[e.length - 1][1]}; };
  const w = best(A.wd, order, k => WD[k]), hrs = Array.from({length: 24}, (_, i) => i), h = A.hr ? best(A.hr, hrs, k => k + ' Uhr') : null;
  return card('Saisonalität', 'Abweichung vom gleitenden Durchschnitt, nach Wochentag (aus einem Jahr) und Uhrzeit (aus 7 Tagen, deine Ortszeit). Unterschiede unter 1 % sind meist Zufall.',
    `<h4 class="mk-h4">Wochentag</h4>${barsSVG(A.wd, order, order.map(k => WD[k]))}${w ? `<p class="note">Am günstigsten im Schnitt ${w.lo} (${P(w.loV)}), am teuersten ${w.hi} (${P(w.hiV)}).</p>` : ''}
     ${A.hr ? `<h4 class="mk-h4">Uhrzeit</h4>${barsSVG(A.hr, hrs, hrs.map(String))}${h ? `<p class="note">Am günstigsten um ${h.lo} (${P(h.loV)}), am teuersten um ${h.hi} (${P(h.hiV)}).</p>` : ''}` : ''}`);
}

/* --- Politik --- */
function politicsHTML(I){
  const A = I.A; if (!A.my) return card('Politik: Wirkung der Mayors', '', '<p class="loading">Mayor-Daten laden …</p>');
  const cur = curMayor(), cand = K.election && K.election.current && K.election.current.candidates;
  const lead = cand && cand.length ? cand.slice().sort((a, b) => b.votes - a.votes)[0].name : null;
  const rows = Object.entries(A.my).sort((a, b) => b[1].median - a[1].median);
  return card('Politik: Wirkung der Mayors', 'Ø-Preis in der Amtszeit gegenüber den 5 Tagen davor, minus dieselbe Veränderung des Gesamtmarkts. Positiv heißt: Unter diesem Mayor wird das Item gefragter oder knapper. Der Median ist robuster als der Durchschnitt, weil eine einzelne verrückte Amtszeit ihn nicht verzerrt.',
    rows.length ? `<table class="mk-mini"><thead><tr><th class="l nosort">Mayor</th><th class="nosort">Amtszeiten</th><th class="nosort">typisch (Median)</th><th class="nosort">Ø</th><th class="nosort">gestiegen</th></tr></thead><tbody>
      ${rows.map(([n, g]) => `<tr class="static ${cur && cur.name === n ? 'cur' : ''}"><td class="l">${esc(n)}${cur && cur.name === n ? ' <span class="mut">im Amt</span>' : lead === n ? ' <span class="mut">führt in der Wahl</span>' : ''}</td><td>${g.n}</td><td>${PC(g.median)}</td><td>${PC(g.mean)}</td><td>${Math.round(g.up * 100)} %</td></tr>`).join('')}</tbody></table>
      <p class="note">Bei 1 bis 2 Amtszeiten ist das Ergebnis stark vom Zufall abhängig.</p>` : '<p class="note">Zu wenig Daten in den Amtszeiten des letzten Jahres.</p>');
}
function updatesItemHTML(I){
  const A = I.A; if (!A.ev) return card('Wirkung der Updates', '', '<p class="loading">Lädt …</p>');
  return card('Wirkung der Updates', 'Vorher: Ø der 3 Tage vor dem Update. 1 Tag: Preis am Tag danach. 7 Tage: Ø der Tage 5 bis 7 danach. „Gegenüber Markt“ zieht die Bewegung des Preisindex ab. Große Ausschläge zeigen, welche Updates dieses Item wirklich betroffen haben.',
    `<table class="mk-mini"><thead><tr><th class="l nosort">Update</th><th class="nosort">1 Tag</th><th class="nosort">7 Tage</th><th class="nosort">gegenüber Markt</th></tr></thead><tbody>
      ${A.ev.map(e => `<tr class="static"><td class="l"><a class="link" href="${esc(e.nw.link)}" target="_blank" rel="noopener">${esc(e.nw.title.replace(/^SkyBlock\s*/, ''))}</a> <span class="mut">${fdate(e.nw.date)}</span></td><td>${PC(e.d1)}</td><td>${PC(e.d7)}</td><td>${PC(e.abn)}</td></tr>`).join('')}</tbody></table>`);
}

/* --- BWL --- */
function treeHTML(n, depth = 0){
  if (!n.parts || n.how !== 'craft' && depth > 0) return '';
  return `<ul class="mk-tree">${n.parts.map(p => `<li><span class="q">${fmt(p.q)}×</span> <a class="link" href="#markt/item/${encodeURIComponent(p.node.id)}">${esc(nm(p.node.id))}</a>
    <span class="mut">${p.node.how === 'craft' ? 'selbst herstellen' : 'kaufen'} à ${price(p.node.cost)} = ${price(p.node.cost * p.q)}</span>${p.node.how === 'craft' && depth < 2 ? treeHTML(p.node, depth + 1) : ''}</li>`).join('')}</ul>`;
}
function makeOrBuyHTML(I){
  const mode = K.mob, c = craftResult(I, mode), mp = marketPrice(I);
  const seg = `<div class="seg sm mk-segline">${[['order', 'Zutaten per Buy-Order'], ['insta', 'Zutaten per Instabuy']].map(([k, l]) => `<button data-mkmob="${k}" class="${mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  if (!c) return card('Kalkulation: kaufen oder selbst herstellen?', 'Nur Rezepte, deren Zutaten (oder deren Zutaten) im Bazaar zu haben sind.', `<p class="note">${recipesMap().has(I.id) ? 'Für mindestens eine Zutat gibt es gerade keinen Bazaar-Preis.' : 'Für dieses Item gibt es kein Crafting-Rezept.'}</p>`);
  const per = c.craft, buy = mp ? mp.buy : null;
  const v = buy ? (per < buy ? `<p class="mk-alert">Selbst herstellen spart ${price(buy - per)} pro Stück (${P(1 - per / buy, false)}) gegenüber dem Kauf${I.k.bz ? ' per Instabuy' : ' zum Lowest BIN'}.</p>` : `<p class="note">Kaufen ist ${price(per - buy)} pro Stück günstiger als selbst herstellen.</p>`) : '';
  return card('Kalkulation: kaufen oder selbst herstellen?', 'Für jede Zutat wird geprüft, ob Kaufen oder Selbermachen billiger ist, bis zu 4 Stufen tief. So entstehen die Herstellkosten wie in einer Kostenrechnung.',
    seg + mkFacts([['Herstellkosten pro Stück', price(per)], ['Rezept ergibt', c.cnt + ' Stück'], ['Kaufpreis jetzt', buy ? price(buy) : '–']]) + v + treeHTML(c));
}
function ahFee(p){ return (p < 10e6 ? .01 : p < 100e6 ? .02 : .025) + (p > 1e6 ? .01 : 0); }
function contributionHTML(I){
  const c = craftResult(I, 'order'), mp = marketPrice(I);
  if (!c || !mp) return card('Deckungsbeitrag beim Herstellen', '', '<p class="note">Braucht ein Rezept und einen Marktpreis.</p>');
  const sellPx = I.k.bz ? Math.round((mp.buy - .1) * 10) / 10 : mp.buy, fee = I.k.bz ? BZ_TAX() : ahFee(mp.buy);
  const rev = sellPx * (1 - fee), db = rev - c.craft, be = c.craft / (1 - fee);
  return card('Deckungsbeitrag beim Herstellen', I.k.bz ? `Verkauf per Sell-Offer knapp unter dem Instabuy-Preis, minus ${NF2.format(fee * 100)} % Bazaar-Steuer. Variable Kosten: Zutaten per Buy-Order.` : 'Verkauf zum Lowest BIN, minus Auction-House-Gebühren (1 % bis 10 Mio., 2 % bis 100 Mio., 2,5 % darüber, plus 1 % Abholgebühr über 1 Mio.).',
    mkFacts([['Erlös pro Stück nach Gebühren', price(rev)], ['Variable Kosten pro Stück', price(c.craft)], ['Deckungsbeitrag pro Stück', `<span class="${cls(db)}">${price(db)}</span>`], ['Deckungsbeitrag in % vom Erlös', P(db / rev)], ['Break-even-Verkaufspreis', price(be)], ['Abstand zum Break-even', P(sellPx / be - 1)]]));
}
function flipHTML(I){
  if (!I.k.bz) return card('Handel als Geschäft', '', '<p class="note">Nur für Bazaar-Items: Im Auction House hängt der Preis am einzelnen Exemplar.</p>');
  const r = liveRow(I.id); if (!r || !r.buyAt || !r.sellAt) return card('Handel als Geschäft', '', '<p class="loading">Live-Daten laden …</p>');
  const B = K.calc.budget, share = K.calc.share / 100, tax = BZ_TAX();
  const Q = Math.min(MAX_ORDER, Math.floor(B / r.buyAt)), profit = r.sellAt * (1 - tax) - r.buyAt;
  const cyc = cycleModel(Q, r.wSell / 168 * share, r.wBuy / 168 * share);
  const perDay = cyc.Tused > 0 && isFinite(cyc.Tused) ? 24 / cyc.Tused : 0, cap = Q * r.buyAt;
  const roiC = cap ? profit * Q / cap : null, roiD = roiC != null ? roiC * perDay : null;
  return card('Handel als Geschäft', 'Kaufen per Buy-Order, verkaufen per Sell-Offer. Die Durchlaufzeit hängt davon ab, welchen Anteil der gehandelten Menge du bekommst. Dasselbe Modell wie im Bazaar Flipper.',
    `<div class="calc mk-calc"><label class="field"><span class="lbl">Budget</span><span class="input"><input data-mkcalc="budget" value="${esc(coinText(B))}" inputmode="decimal"><span class="unit">Coins</span></span></label>
      <label class="field"><span class="lbl">Dein Anteil am Handel</span><span class="input"><input data-mkcalc="share" value="${NF0.format(K.calc.share)}" inputmode="decimal"><span class="unit">%</span></span></label></div>`
    + mkFacts([['Einkauf per Buy-Order', price(r.buyAt)], ['Verkauf per Sell-Offer', price(r.sellAt)], ['Deckungsbeitrag pro Stück', `<span class="${cls(profit)}">${price(profit)}</span>`], ['Menge pro Durchlauf', NF0.format(Q)],
      ['Gebundenes Kapital', fmt(cap)], ['Dauer pro Durchlauf', cyc.Tused ? dur(cyc.Tused) : '–'], ['Kapitalumschlag pro Tag', perDay ? NF1.format(perDay) + '×' : '–'], ['Rendite pro Durchlauf', P(roiC)], ['Rendite pro Tag', `<span class="${cls(roiD)}">${P(roiD)}</span>`]]));
}
function riskHTML(I){
  const A = I.A;
  return card('Risiko', 'Wer Ware auf Lager hat, trägt das Preisrisiko. Value at Risk: so viel ging an einem schlechten Tag (1 von 20) mindestens verloren. Drawdown: der größte Absturz vom Hoch im letzten Jahr.',
    mkFacts([['Schwankung pro Tag', A.vol != null ? P(A.vol, false) : '–'], ['Schwankung pro Monat', A.vol != null ? P(A.vol * Math.sqrt(30), false) : '–'], ['Value at Risk (95 %, 1 Tag)', A.risk ? P(A.risk.VaR, false) : '–'], ['Expected Shortfall', A.risk ? P(A.risk.ES, false) : '–'],
      ['Größter Absturz (1 Jahr)', A.dd && A.dd.dd ? P(A.dd.dd, false) + (A.dd.from >= 0 ? ` <small>${fdate(A.T[A.dd.from])} bis ${fdate(A.T[A.dd.to])}</small>` : '') : '–'], ['Beta zum Markt', A.beta ? NF2.format(A.beta.b) : '–']]));
}
function investHTML(I){
  const A = I.A, fee = I.k.bz ? BZ_TAX() : (A.p ? ahFee(A.p) : 0), base = 10e6;
  const row = (l, c, m) => { const out = c == null ? null : base * (1 + c) * (1 - fee); return `<tr class="static"><td class="l">${l}</td><td>${PC(c)}</td><td>${m == null ? '–' : PC(m)}</td><td>${out == null ? '–' : fmt(out)}</td></tr>`; };
  return card('Investition: halten statt handeln', `Was wäre aus 10 Mio. Coins geworden, die man damals in dieses Item gesteckt hätte, nach ${I.k.bz ? 'Bazaar-Steuer' : 'Auction-House-Gebühren'} beim Verkauf? Der Preisindex zeigt die Opportunitätskosten: so viel hätte der Markt im Schnitt gebracht.`,
    `<table class="mk-mini"><thead><tr><th class="l nosort">vor</th><th class="nosort">Item</th><th class="nosort">Markt</th><th class="nosort">10 Mio. wären heute</th></tr></thead><tbody>
      ${row('7 Tagen', A.c7, A.m7)}${row('30 Tagen', A.c30, A.m30)}${row('90 Tagen', A.c90, A.m90)}${row('1 Jahr', A.c365, A.m365)}</tbody></table>`);
}
function valuationHTML(I){
  const A = I.A, z = A.z;
  const word = !z ? '–' : z.z > 2 ? 'auffällig teuer' : z.z > 1 ? 'eher teuer' : z.z < -2 ? 'auffällig günstig' : z.z < -1 ? 'eher günstig' : 'normal';
  return card('Bewertung: teuer oder günstig?', 'Vergleich mit dem eigenen Verlauf. Ein z-Wert über 2 heißt: so hoch stand der Preis an kaum einem Tag der letzten 30. Das ist eine statistische Einordnung, keine Vorhersage.',
    mkFacts([['Gegenüber Median 30 Tage', z ? PC(z.vsMedian) : '–'], ['z-Wert (30 Tage)', z ? NF2.format(z.z) : '–'], ['Einordnung', word], ['Spanne im letzten Jahr', A.min1y ? `${fmt(A.min1y)} bis ${fmt(A.max1y)}` : '–'], ['Billiger als heute war es an', A.pctl != null ? P(A.pctl, false) + ' der Tage' : '–']]));
}
function lifecycleHTML(I){
  const A = I.A, l = A.life;
  return card('Produktlebenszyklus', 'Faustregel aus dem Alter des Items und der Entwicklung der gehandelten Menge (letzte 90 Tage gegenüber den 90 davor).', mkFacts([['Phase', esc(l.stage)], ['Begründung', esc(l.why)]]));
}
function chainHTML(I){
  const rec = recipesMap(), id = I.id, ins = rec.get(id), uses = [];
  for (const [o, c, ing] of RECIPES) if (ing[id]) uses.push({o, c, q: ing[id], n: Object.keys(ing).length});
  const seen = new Set(), U = uses.filter(u => !seen.has(u.o) && seen.add(u.o));
  const mpOf = x => { const r = liveRow(x); return r && r.topBuy ? r.topBuy : null; };
  U.sort((a, b) => (mpOf(b.o) || 0) - (mpOf(a.o) || 0));
  return `<div class="two mk-chain">
    <section><h3 class="mk-h4">Wird hergestellt aus</h3>${ins ? ins.map(([c, ing]) => `<ul class="mk-tree">${Object.entries(ing).map(([k, q]) => `<li><span class="q">${fmt(q)}×</span> <a class="link" href="#markt/item/${encodeURIComponent(k)}">${esc(nm(k))}</a>${mpOf(k) ? ` <span class="mut">${price(mpOf(k))}</span>` : ''}</li>`).join('')}</ul><p class="note">ergibt ${c} Stück</p>`).join('') : '<p class="note">Kein Crafting-Rezept, das Item wird gefarmt, gedroppt oder gekauft.</p>'}</section>
    <section><h3 class="mk-h4">Wird verwendet für (${NF0.format(U.length)})</h3>${U.length ? `<ul class="mk-tree">${U.slice(0, 25).map(u => `<li><a class="link" href="#markt/item/${encodeURIComponent(u.o)}">${esc(nm(u.o))}</a> <span class="mut">braucht ${fmt(u.q)}×${mpOf(u.o) ? `, Preis ${price(mpOf(u.o))}` : ''}</span></li>`).join('')}</ul>${U.length > 25 ? `<p class="note">und ${U.length - 25} weitere.</p>` : ''}` : '<p class="note">Wird in keinem Crafting-Rezept verwendet.</p>'}</section>
  </div><p class="mk-sb"><b>In SkyBlock:</b> Je mehr Rezepte ein Item brauchen, desto breiter ist seine Nachfrage (abgeleitete Nachfrage). Steigt ein Endprodukt im Preis, ziehen meist die Zutaten nach.</p>`;
}
