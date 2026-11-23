'use strict';
// Bazaar Flipper: die Unterseiten (Übersicht, Flips, Crafts, NPC, Alle Items, Watchlist, Einstellungen) und das Detailfenster.
/* =========================================================
   Bazaar-Seiten (geben HTML zurück)
   ========================================================= */
function emptyRow(cols, title, txt){ return `<tr class="emptyrow"><td colspan="${cols}"><b>${title}</b>${txt ? ' ' + txt : ''}</td></tr>`; }
const PAGES = {
  overview(){
    const flips = filteredFlips(true).sort((a,b) => b.pphTyp - a.pphTyp);
    const crafts = filteredCrafts(true).sort((a,b) => b.pph - a.pph);
    const liq = S.rows.filter(liquid);
    const busiest = S.rows.filter(r => r.topBuy && r.topSell).sort((a,b) => b.turnH - a.turnH).slice(0, 5);
    wantTrend(S.watch.slice(0, 5));
    const has = S.rows.length > 0;
    const list = (rows, emptyTxt) => rows.length ? `<ul class="rank">${rows.join('')}</ul>` : `<p class="muted-note">${emptyTxt}</p>`;
    const row = (attr, id, name, sub, val, valSub, valCls) => `<li ${attr}>${itemCell(id, name, sub)}<span class="v ${valCls || ''}">${val}<small>${valSub}</small></span></li>`;
    return `
      <h1 class="lead small">${leadSentence(bestNow())}</h1>
      <div class="stratbar"><span class="lbl">Strategie</span>${presetSeg()}<span class="note">${PRESETS[S.set.preset] ? esc(PRESETS[S.set.preset].desc) : 'Eigene Filtereinstellungen.'}</span></div>
      <p class="summary">${has ? `${NF0.format(liq.length)} von ${NF0.format(S.rows.length)} Bazaar-Produkten werden gerade genug gehandelt. Dein Budget: ${words(S.set.budget)} Coins.` : ''} <button class="link" data-act="filters">Alle Filter</button> oder <button class="link" data-act="sharelink">Link mit meinen Einstellungen kopieren</button></p>
      <div class="cols">
        <section><header><h2>Beste Flips</h2>${flips.length ? `<button class="link" data-tab="flips">Alle ${flips.length} ansehen</button>` : ''}</header>
          ${list(flips.slice(0, 5).map(r => row(`data-open="${esc(r.id)}"`, r.id, r.name, `${price(r.buyAt)} kaufen, ${price(r.sellAt)} verkaufen`, fmt(r.pphTyp), 'pro Stunde')), has ? 'Kein Flip passt zu deinen Filtern.' : 'Wird geladen …')}</section>
        <section><header><h2>Beste Craft-Flips</h2>${crafts.length ? `<button class="link" data-tab="crafts">Alle ${crafts.length} ansehen</button>` : ''}</header>
          ${list(crafts.slice(0, 5).map(c => row(`data-craft="${c.ri}"`, c.id, (c.cnt > 1 ? c.cnt + '× ' : '') + c.name, esc(c.ingredients), fmt(c.pph), 'pro Stunde')), has ? 'Kein Craft-Flip passt zu deinen Filtern.' : 'Wird geladen …')}</section>
        <section><header><h2>Am meisten gehandelt</h2><button class="link" data-tab="market">Zum Markt</button></header>
          ${list(busiest.map(r => row(`data-open="${esc(r.id)}"`, r.id, r.name, `${price(r.topSell)} / ${price(r.topBuy)}`, fmt(r.turnH), 'Coins pro Stunde')), 'Wird geladen …')}</section>
        <section><header><h2>Deine Watchlist</h2>${S.watch.length ? '<button class="link" data-tab="watch">Bearbeiten</button>' : ''}</header>
          ${list(S.watch.filter(id => S.byId[id]).slice(0, 5).map(id => { const r = S.byId[id]; return row(`data-open="${esc(id)}"`, id, r.name, `${price(r.topSell)} / ${price(r.topBuy)}`, pct(r.d1h), r.d1h != null ? 'letzte Stunde' : (trendCache[id] ? 'kein Trend verfügbar' : 'Trend lädt'), cls(r.d1h)); }), 'Noch leer. Markier ein Item mit ☆, dann taucht es hier auf.')}</section>
      </div>`;
  },

  flips(){
    const rows = sortRows(filteredFlips(), 'flips');
    const {slice, html} = paginate('flips', rows);
    const max = Math.max(0, ...slice.map(r => r.pphTyp));
    const head = `<tr>${th('', '', '', 1)}${th('flips','name','Item',1)}
      ${th('flips','buyAt','Buy-Order','', 'Höchste Buy-Order + 0,1')}
      ${th('flips','sellAt','Sell-Offer','', 'Niedrigste Sell-Offer − 0,1')}
      ${th('flips','profit','Gewinn pro Stück','', 'Nach ' + NF2.format(S.set.tax) + ' % Bazaar-Steuer')}
      ${th('flips','sRatio','Spread jetzt / üblich','', 'Spread jetzt im Vergleich zum Median der letzten 7 Tage. Darunter: wie oft der Flip in dieser Zeit lohnend war.')}
      ${th('flips','perHour','Handel pro Stunde','', 'Stück pro Stunde auf der schwächeren Seite')}
      ${th('flips','pphTyp','Profit pro Stunde','', 'Gerechnet mit dem üblichen Spread der letzten 7 Tage, falls er gerade größer ist. Darunter: mit dem aktuellen Spread.')}</tr>`;
    const body = slice.map(r => `<tr data-open="${esc(r.id)}">
      <td class="c-star">${starBtn(r.id)}</td>
      <td class="l">${itemCell(r.id, r.name, '', r.risk)}</td>
      <td class="buy ${flash(r.id+'b', r.buyAt)}">${price(r.buyAt)}</td>
      <td class="sell ${flash(r.id+'s', r.sellAt)}">${price(r.sellAt)}</td>
      <td>${price(r.profit)}<small>${pct(r.marginPct, false)}</small></td>
      <td>${spreadCell(r)}</td>
      <td>${fmt(r.perHour)}</td>
      <td>${bar(r.pphTyp, max)}<small>${r.pphTyp < r.pph ? 'jetzt ' + fmt(r.pph) : fmt(r.qty) + ' Stück pro Stunde'}</small></td></tr>`).join('');
    return toolbar('flips', rows.length, rows.length === 1 ? 'Flip' : 'Flips') + statsNote() + `<div class="tablewrap"><table><thead>${head}</thead><tbody>${body || emptyRow(8, 'Kein Flip passt.', 'Probier eine andere Strategie oder lockere die Filter.')}</tbody></table></div>${html}
      <p class="hint">Setz eine Buy-Order zum grünen Preis. Sobald sie gefüllt ist, stellst du eine Sell-Offer zum Preis daneben ein. Klick auf eine Zeile für Verlauf und Orderbuch.</p>`;
  },

  crafts(){
    const rows = sortRows(filteredCrafts(), 'crafts');
    const {slice, html} = paginate('crafts', rows);
    const max = Math.max(0, ...slice.map(c => c.pph));
    const head = `<tr>${th('', '', '', 1)}${th('crafts','name','Rezept',1)}
      ${th('crafts','cost','Kosten','', 'Zutaten zum gewählten Preis')}
      ${th('crafts','revenue','Erlös','', 'Verkaufspreis nach Steuer')}
      ${th('crafts','profit','Gewinn pro Craft')}
      ${th('crafts','craftsH','Crafts pro Stunde','', 'Was der Markt hergibt – begrenzt durch das knappste Item')}
      ${th('crafts','pph','Profit pro Stunde')}</tr>`;
    const body = slice.map(c => `<tr data-craft="${c.ri}">
      <td class="c-star">${starBtn(c.id)}</td>
      <td class="l">${itemCell(c.id, (c.cnt > 1 ? c.cnt + '× ' : '') + c.name, esc(c.ingredients), c.risk)}</td>
      <td class="buy">${fmt(c.cost)}</td>
      <td class="sell">${fmt(c.revenue)}</td>
      <td class="${cls(c.profit)}">${fmt(c.profit)}<small>${pct(c.marginPct, false)}, sofort ${fmt(c.fastProfit)}</small></td>
      <td>${fmt(c.craftsH)}<small>Engpass ${esc(c.limitingName)}</small></td>
      <td>${bar(c.pph, max)}<small>${fmt(c.qty)} Crafts pro Stunde</small></td></tr>`).join('');
    return toolbar('crafts', rows.length, rows.length === 1 ? 'Craft-Flip' : 'Craft-Flips') + `<div class="tablewrap"><table><thead>${head}</thead><tbody>${body || emptyRow(7, 'Kein Craft-Flip passt.', 'Probier eine andere Strategie oder ändere den Ablauf im Filter.')}</tbody></table></div>${html}
      <p class="hint">Nur Rezepte, bei denen das Ergebnis und alle Zutaten im Bazaar gehandelt werden, kein Auktionshaus. ${NF0.format(S.crafts.length)} von ${NF0.format(RECIPES.length)} Rezepten gehen komplett über den Bazaar. Das Rezept musst du über die Collection freigeschaltet haben.</p>`;
  },

  npc(){
    const rows = sortRows(S.rows.filter(r => r.npc > 0 && r.npcOrder > 0 && liquid(r) && matchSearch(r)), 'npc');
    const {slice, html} = paginate('npc', rows);
    const max = Math.max(0, ...slice.map(r => r.npcTotal));
    const head = `<tr>${th('', '', '', 1)}${th('npc','name','Item',1)}${th('npc','npc','NPC zahlt')}
      ${th('npc','npcOrder','Gewinn per Buy-Order','', 'NPC-Preis minus deine Buy-Order')}
      ${th('npc','npcInsta','Gewinn per Instabuy','', 'NPC-Preis minus Instabuy')}
      ${th('npc','perHour','Handel pro Stunde')}
      ${th('npc','npcTotal','Gewinn pro Tag','', 'Gewinn pro Stück × min(Budget, Tagesvolumen × Anteil)')}</tr>`;
    const body = slice.map(r => `<tr data-open="${esc(r.id)}">
      <td class="c-star">${starBtn(r.id)}</td>
      <td class="l">${itemCell(r.id, r.name, '', r.risk)}</td>
      <td>${price(r.npc)}</td>
      <td class="${cls(r.npcOrder)}">${price(r.npcOrder)}<small>kaufen für ${price(r.buyAt)}</small></td>
      <td class="${cls(r.npcInsta)}">${price(r.npcInsta)}<small>kaufen für ${price(r.topSell)}</small></td>
      <td>${fmt(r.perHour)}</td>
      <td>${bar(r.npcTotal, max)}</td></tr>`).join('');
    return toolbar('npc', rows.length, 'NPC-Flips') + `<div class="tablewrap"><table><thead>${head}</thead><tbody>${body || emptyRow(7, 'Gerade kein NPC-Flip.', 'Kein gefragtes Item bringt beim NPC mehr, als es im Bazaar kostet.')}</tbody></table></div>${html}
      <p class="hint">Hypixel begrenzt, wie viele Coins du pro Tag mit NPC-Verkäufen verdienen kannst. Dein Limit siehst du im Spiel.</p>`;
  },

  market(){
    const rows = sortRows(S.rows.filter(r => matchSearch(r) && (!S.set.marketLiquidOnly || liquid(r))), 'market');
    const {slice, html} = paginate('market', rows);
    const head = `<tr>${th('', '', '', 1)}${th('market','name','Item',1)}
      ${th('market','topSell','Instabuy','', 'Niedrigste Sell-Offer – das zahlst du beim Sofortkauf')}
      ${th('market','topBuy','Instasell','', 'Höchste Buy-Order – das bekommst du beim Sofortverkauf')}
      ${th('market','spreadPct','Spread')}
      ${th('market','turnH','Umsatz pro Stunde','', 'Coins, die pro Stunde auf der schwächeren Seite umgesetzt werden')}
      ${th('market','wVol','Volumen pro Woche')}</tr>`;
    const body = slice.map(r => `<tr data-open="${esc(r.id)}">
      <td class="c-star">${starBtn(r.id)}</td>
      <td class="l">${itemCell(r.id, r.name, '', r.risk)}</td>
      <td class="${flash(r.id+'S', r.topSell)}">${price(r.topSell)}</td>
      <td class="${flash(r.id+'B', r.topBuy)}">${price(r.topBuy)}</td>
      <td class="mut">${pct(r.spreadPct, false)}</td>
      <td>${fmt(r.turnH)}</td>
      <td>${fmt(r.wVol)}</td></tr>`).join('');
    return toolbar('market', rows.length, 'Produkte') + `<div class="tablewrap"><table><thead>${head}</thead><tbody>${body || emptyRow(7, 'Nichts gefunden.', '')}</tbody></table></div>${html}`;
  },

  watch(){
    wantTrend(S.watch);
    const rows = S.watch.map(id => {
      const r = S.byId[id], n = S.alerts.filter(a => a.id === id).length;
      if (!r) return `<tr><td class="c-star">${starBtn(id)}</td><td class="l">${itemCell(id, pretty(id), S.rows.length ? 'Gerade nicht im Bazaar' : 'Wird geladen …')}</td><td colspan="6"></td></tr>`;
      return `<tr data-open="${esc(id)}">
        <td class="c-star">${starBtn(id)}</td>
        <td class="l">${itemCell(id, r.name, n ? (n === 1 ? '1 Alarm' : n + ' Alarme') : '')}</td>
        <td class="${flash(id+'S', r.topSell)}">${price(r.topSell)}</td><td class="${flash(id+'B', r.topBuy)}">${price(r.topBuy)}</td>
        <td class="${cls(r.profit)}">${price(r.profit)}</td>
        <td class="${cls(r.d1h)}">${pct(r.d1h)}</td><td class="${cls(r.d24h)}">${pct(r.d24h)}</td>
        <td>${spark(id, 120, 24)}</td></tr>`;
    }).join('');
    const al = S.alerts.map((a, i) => {
      const r = S.byId[a.id], c = CONDS[a.cond];
      return `<tr data-open="${esc(a.id)}"><td class="l">${itemCell(a.id, r ? r.name : pretty(a.id))}</td><td class="l">${c ? c.label : a.cond} ${price(a.value)}</td>
        <td>${r && c ? price(c.get(r)) : '–'}</td><td class="l mut">${a.last ? 'ausgelöst vor ' + ago(Date.now() - a.last) : 'wartet'}</td>
        <td><button class="btn ghost danger" data-delalert="${i}">Löschen</button></td></tr>`;
    }).join('');
    return `<h2 class="sec">Watchlist</h2>
      <div class="tablewrap"><table><thead><tr><th class="nosort"></th><th class="l nosort">Item</th><th class="nosort">Instabuy</th><th class="nosort">Instasell</th><th class="nosort">Flip-Gewinn</th><th class="nosort" title="Laut SkyCofl">1 h</th><th class="nosort" title="Laut SkyCofl">24 h</th><th class="nosort">24 h Verlauf</th></tr></thead>
      <tbody>${rows || emptyRow(8, 'Noch leer.', 'Klick bei einem Item auf ☆, um es hier zu verfolgen.')}</tbody></table></div>
      <h2 class="sec">Preisalarme</h2>
      <div class="tablewrap"><table><thead><tr><th class="l nosort">Item</th><th class="l nosort">Bedingung</th><th class="nosort">Aktuell</th><th class="l nosort">Status</th><th class="nosort"></th></tr></thead>
      <tbody>${al || emptyRow(5, 'Keine Alarme.', 'Öffne ein Item und leg unten im Fenster einen Alarm an.')}</tbody></table></div>`;
  },

  settings(){
    const notif = ('Notification' in window) ? Notification.permission : 'unsupported';
    const notifTxt = {granted:'Desktop-Benachrichtigungen sind erlaubt.', denied:'Desktop-Benachrichtigungen sind im Browser blockiert.', default:'Desktop-Benachrichtigungen sind noch nicht erlaubt.', unsupported:'Dein Browser unterstützt keine Desktop-Benachrichtigungen.'}[notif];
    const row = (title, desc, ctl) => `<div class="setrow"><div><h3>${title}</h3>${desc ? `<p>${desc}</p>` : ''}</div><div>${ctl}</div></div>`;
    return `<div class="settings">
      ${row('Einstellungen teilen', 'Wenn ihr zu zweit flippt: Mit diesem Link sieht die andere Person exakt deine Filter, dein Budget und deine Steuer – und damit dieselben Zahlen.', '<div class="btnrow"><button class="btn" data-act="sharelink">Link kopieren</button></div>')}
      ${row('Darstellung', 'Mit „Wie System“ folgt die Seite der Hell/Dunkel-Einstellung deines Geräts.', segCtl('theme', [['light','Hell'],['dark','Dunkel'],['system','Wie System']]))}
      ${row('Budget', 'Wie viele Coins du für Flips einsetzen willst.', coinCtl('budget', 'Budget', [1e6, 5e6, 10e6, 50e6, 100e6, 500e6], 'Kurzschreibweise geht: 10m, 2,5m, 500k, 1b'))}
      ${row('Bazaar-Steuer', 'Standard sind 1,25 %. Mit dem Community-Shop-Upgrade „Bazaar Flipper“ zahlst du weniger.', segCtl('tax', [[1.25,'1,25 %'],[1.125,'1,125 %'],[1,'1 %']]))}
      ${row('Anteil am Handel', 'Wie viel vom stündlichen Handel du realistisch abbekommst. Davon hängen „Profit pro Stunde“ und „Crafts pro Stunde“ ab.', sliderCtl('share'))}
      ${row('Zeit pro Durchlauf', 'Wie lange du für eine Runde Kaufen und Verkaufen mindestens brauchst. Damit wird „Profit pro Stunde“ überall gleich und realistisch gerechnet.', sliderCtl('minCycle'))}
      ${row('Aktualisierung', 'Hypixel aktualisiert den Bazaar etwa alle 20 Sekunden.', sliderCtl('interval'))}
      ${row('Zeilen pro Seite', '', segCtl('pageSize', [[25,'25'],[50,'50'],[100,'100'],[250,'250']]))}
      ${row('Alarme', notifTxt, `${switchCtl('sound', 'Ton abspielen')}<div class="btnrow"><button class="btn" data-act="notif">Benachrichtigungen erlauben</button><button class="btn ghost" data-act="test">Testalarm</button></div>`)}
      ${row('Preisverlauf', `Die Seite merkt sich die Preise in diesem Browser, gerade ${fmt(histPoints())} Datenpunkte für ${NF0.format(Object.keys(S.hist).length)} Items.${DB.db ? '' : ' Der Speicher ist hier nicht verfügbar, der Verlauf hält nur bis zum Neuladen.'}`,
        `${segCtl('retentionH', [[24,'1 Tag'],[48,'2 Tage'],[72,'3 Tage'],[168,'7 Tage']])}<div class="btnrow"><button class="btn" data-act="export">Als JSON herunterladen</button><button class="btn ghost danger" data-act="clear">Verlauf löschen</button></div>`)}
      ${row('Daten', `Preise und Item-Namen kommen von der offiziellen Hypixel-API, die ${NF0.format(RECIPES.length)} Rezepte aus dem NotEnoughUpdates-Repo.`, `<div class="btnrow"><button class="btn" data-act="items">Item-Namen neu laden</button><button class="btn ghost danger" data-act="reset">Einstellungen zurücksetzen</button></div>`)}
    </div>`;
  },
};

/* =========================================================
   Detailansicht Item
   ========================================================= */
function openDetail(id){ closeDrawer(); wantTrend([id]); S.craftDetail = null; S.detail = id; $('#modal').classList.add('on'); renderDetail(false); }
function closeDetail(){ S.detail = null; S.craftDetail = null; if (S.mchart){ S.mchart.destroy(); S.mchart = null; } const m = $('#modal'); if (m) m.classList.remove('on'); }
function book(arr, side){
  const top = (arr || []).slice(0, 12);
  const mx = Math.max(1, ...top.map(o => o.amount));
  let cum = 0;
  return `<table class="book ${side}"><thead><tr><th class="l">Preis</th><th>Menge</th><th>Orders</th><th>Summe</th></tr></thead><tbody>${
    top.map(o => { cum += o.amount; return `<tr><td class="l p">${price(o.pricePerUnit)}</td><td class="amt">${fmt(o.amount)}<i style="width:${(o.amount/mx*100).toFixed(0)}%"></i></td><td class="mut">${o.orders}</td><td class="mut">${fmt(cum)}</td></tr>`; }).join('')
    || '<tr><td colspan="4" class="mut">leer</td></tr>'}</tbody></table>`;
}
// Spread jetzt gegenüber dem Üblichen: ruhig (≤ 1,5×), erhöht (≤ 3×), auffällig (> 3×)
function spreadCell(r){
  if (r.sRatio == null) return `<span class="mut" title="Für dieses Item gibt es noch keinen Verlauf">–</span>`;
  const c = r.sRatio < 0.67 ? 'mut' : r.sRatio <= 1.5 ? 'pos' : r.sRatio <= 3 ? 'amber' : 'neg';
  const word = r.sRatio < 0.67 ? 'kleiner' : r.sRatio <= 1.5 ? 'normal' : r.sRatio <= 3 ? 'erhöht' : 'auffällig';
  return `<span class="${c}" title="Spread jetzt ${pct(r.sNow * 100, false)}, üblich ${pct(r.sMed * 100, false)}">${NF1.format(r.sRatio)}× ${word}</span><small>${r.okShare != null ? NF0.format(r.okShare * 100) + ' % der Zeit lohnend' : ''}</small>`;
}
function statsNote(){
  if (S.stats) return '';
  return `<p class="note">${S.statsErr ? 'Der Spread-Verlauf der letzten 7 Tage konnte nicht geladen werden. Die Verlässlichkeits-Filter sind solange aus.' : 'Spread-Verlauf der letzten 7 Tage wird geladen …'}</p>`;
}
function relDetail(r){
  if (!r.st) return `<section class="block"><header><h3>Verlässlichkeit (letzte 7 Tage)</h3></header><p class="note">${S.stats ? 'Für dieses Item gibt es noch keinen ausreichenden Verlauf.' : S.statsErr ? 'Der Verlauf konnte nicht geladen werden.' : 'Wird geladen …'}</p></section>`;
  const st = r.st, P = x => x == null ? '–' : pct(x * 100, false), S2 = x => x == null ? '–' : `<span class="${cls(x)}">${pct(x * 100)}</span>`;
  const verdict = [];
  if (r.sRatio != null) verdict.push(r.sRatio < 0.67 ? 'Der Spread ist gerade kleiner als üblich. Der Gewinn ist eher knapp – oft lohnt es sich, kurz abzuwarten.' : r.sRatio <= 1.5 ? 'Der Spread ist gerade so groß wie meistens – der Gewinn ist realistisch.' : r.sRatio <= 3 ? 'Der Spread ist größer als üblich. Rechne eher mit dem üblichen Gewinn.' : 'Der Spread ist ungewöhnlich groß. Solche Spreads schließen sich meist schnell wieder.');
  if (r.okShare != null) verdict.push(r.okShare >= .7 ? 'Der Flip hat sich in den letzten 7 Tagen fast immer gelohnt.' : r.okShare >= .4 ? 'Der Flip hat sich in den letzten 7 Tagen nur zeitweise gelohnt.' : 'Der Flip hat sich in den letzten 7 Tagen selten gelohnt.');
  if (r.swing != null && r.marginPct > 0 && r.swing * 100 > r.marginPct * 2) verdict.push('Der Preis schwankt innerhalb von 2 Stunden mehr als doppelt so stark wie deine Marge – du wirst oft überboten oder musst nachziehen.');
  return `<section class="block"><header><h3>Verlässlichkeit (letzte 7 Tage)</h3></header>
    ${verdict.length ? `<p class="note">${verdict.join(' ')}</p>` : ''}
    ${facts([
      ['Spread jetzt', P(r.sNow)], ['Spread üblich (Median)', P(r.sMed)], ['Üblicher Bereich', `${P(st.sq[5])} bis ${P(st.sq[15])}`], ['Spread 30 Tage (Median)', P(st.s30)],
      ['Jetzt gegenüber üblich', r.sRatio != null ? NF1.format(r.sRatio) + '×' : '–'], ['Lohnend in den letzten 7 Tagen', r.okShare != null ? NF0.format(r.okShare * 100) + ' % der Zeit' : '–'],
      ['Gewinn bei üblichem Spread', `<span class="${cls(r.profitTyp)}">${price(r.profitTyp)}</span>`], ['Profit pro Stunde (üblich)', fmt(r.pphTyp)],
      ['Instabuy gegenüber Wochenmedian', S2(r.askDev)], ['Instasell gegenüber Wochenmedian', S2(r.bidDev)],
      ['Preistrend 7 Tage', S2(r.tr7)], ['Volumentrend 7 Tage', S2(r.vt7)],
      ['Typische Schwankung in 2 h', P(r.swing)], ['Deine Marge', pct(r.marginPct, false)],
      ['Konkurrenz an der Spitze', `${NF0.format(r.topBuyOrders)} Buy-Orders, ${NF0.format(r.topSellOrders)} Sell-Offers`], ['Orders gesamt', `${NF0.format(r.sellOrders)} Buy, ${NF0.format(r.buyOrders)} Sell`],
    ])}</section>`;
}
function figures(list){ return `<dl class="figures">${list.map(([l,v]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('')}</dl>`; }
function facts(list){ return `<dl class="facts">${list.map(([l,v]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('')}</dl>`; }
function renderDetail(update){
  const id = S.detail, r = S.byId[id], p = S.products[id];
  if (!r || !p) return;
  const h = S.hist[id];
  const top = figures([
    ['Instabuy', `<span class="amber">${price(r.topSell)}</span>`], ['Instasell', `<span class="pos">${price(r.topBuy)}</span>`],
    ['Flip-Gewinn pro Stück', `<span class="${cls(r.profit)}">${price(r.profit)}</span>`], ['Profit pro Stunde', fmt(r.pph)],
  ]);
  const more = facts([
    ['Deine Buy-Order', price(r.buyAt)], ['Deine Sell-Offer', price(r.sellAt)], ['Marge', pct(r.marginPct, false)], ['Spread', pct(r.spreadPct, false)],
    ['Instabuys pro Woche', fmt(r.wBuy)], ['Instasells pro Woche', fmt(r.wSell)], ['Handel pro Stunde', fmt(r.perHour)], ['Gefragt', liquid(r) ? 'ja' : 'nein'],
    ['Max. Stück mit Budget', fmt(r.maxQty)], ['Einsatz pro Order', fmt(r.maxQty * r.buyAt)], ['1 h / 24 h', `<span class="${cls(r.d1h)}">${pct(r.d1h)}</span> / <span class="${cls(r.d24h)}">${pct(r.d24h)}</span>`], ['NPC-Preis', price(r.npc)],
  ]);
  if (update){
    $('#dStats').innerHTML = top + more;
    $('#dRel').innerHTML = relDetail(r);
    $('#dBuy').innerHTML = book(p.sell_summary, 'buy');
    $('#dSell').innerHTML = book(p.buy_summary, 'sell');
    livePoint(S.mchart, id); return;
  }
  const alerts = S.alerts.map((a, i) => ({a, i})).filter(x => x.a.id === id);
  const watched = S.watch.includes(id);
  $('#sheet').innerHTML = `
    <header class="dhead">
      <div class="dtitle">${itemIcon(id, true)}<div><h2>${esc(r.name)}</h2><p class="sub">${esc(id)}${S.tiers[id] ? ', ' + esc(title(S.tiers[id])) : ''}</p></div></div>
      <div class="btnrow">
        <a class="btn primary" href="#bazaar/item/${encodeURIComponent(id)}">Genauer analysieren</a>
        <button class="btn" data-star="${esc(id)}">${watched ? 'Auf der Watchlist ★' : 'Auf die Watchlist ☆'}</button>
        <button class="btn ghost" data-act="close" aria-label="Schließen">Schließen</button>
      </div>
    </header>
    ${r.risk.length ? `<div class="banner warnb">${r.risk.map(esc).join('<br>')}</div>` : ''}
    <div id="dStats">${top}${more}</div>
    <div id="dRel">${relDetail(r)}</div>
    <section class="block">
      <header><h3>Preisverlauf</h3><span class="legend"><span class="l-sell">Instabuy</span><span class="l-buy">Instasell</span></span><div class="spacer"></div>
        ${rangeSeg('mrange', chartPrefs.mrange, ['1h','24h','7d','30d','1y','all','local'])}</header>
      <div class="mchart" id="mchart"></div>
      <p class="hint" id="msrc"></p>
    </section>
    <div class="two">
      <section class="block"><header><h3>Buy-Orders</h3><span class="mut">Hier landet deine Buy-Order</span></header><div id="dBuy">${book(p.sell_summary, 'buy')}</div></section>
      <section class="block"><header><h3>Sell-Offers</h3><span class="mut">Hier landet deine Sell-Offer</span></header><div id="dSell">${book(p.buy_summary, 'sell')}</div></section>
    </div>
    <section class="block"><header><h3>Preisalarm</h3></header>
      <div class="alertrow">
        <select id="alCond" aria-label="Bedingung">${Object.entries(CONDS).map(([k,c]) => `<option value="${k}">${c.label}</option>`).join('')}</select>
        <div class="input"><input id="alVal" inputmode="decimal" placeholder="z. B. 1,5k" value="${r.topSell ? coinText(r1(r.topSell)) : ''}" aria-label="Wert in Coins"><span class="unit">Coins</span></div>
        <button class="btn primary" data-act="addalert">Alarm anlegen</button>
      </div>
      ${alerts.length ? `<ul class="alertlist">${alerts.map(({a,i}) => `<li>${CONDS[a.cond].label} ${price(a.value)} <button class="link danger" data-delalert="${i}">löschen</button></li>`).join('')}</ul>` : ''}
    </section>`;
  if (S.mchart) S.mchart.destroy();
  S.mchart = new PriceChart($('#mchart'));
  loadModalChart();
}

/* =========================================================
   Detailansicht Craft
   ========================================================= */
function openCraft(ri){ closeDrawer(); if (S.mchart){ S.mchart.destroy(); S.mchart = null; } S.detail = null; S.craftDetail = ri; $('#modal').classList.add('on'); renderCraftDetail(); }
function renderCraftDetail(){
  const c = S.crafts.find(x => x.ri === S.craftDetail);
  if (!c){ $('#sheet').innerHTML = '<p>Dieses Rezept ist gerade nicht verfügbar.</p><button class="btn" data-act="close">Schließen</button>'; return; }
  const o = S.byId[c.id], s = S.set;
  const rowFor = (r, q, unit, how) => `<tr data-open="${esc(r.id)}"><td class="l">${itemCell(r.id, r.name, '', r.risk)}</td><td>${fmt(q)}</td><td>${price(unit)}</td><td>${fmt(unit * q)}</td>
    <td>${fmt(r.perHour)}</td><td class="${liquid(r) ? 'pos' : 'neg'}">${liquid(r) ? 'ja' : 'nein'}</td><td class="l mut">${how}</td></tr>`;
  $('#sheet').innerHTML = `
    <header class="dhead">
      <div><h2>${c.cnt > 1 ? c.cnt + '× ' : ''}${esc(c.name)}</h2><p class="sub">Craft-Flip</p></div>
      <div class="btnrow">
        <button class="btn" data-star="${esc(c.id)}">${S.watch.includes(c.id) ? 'Auf der Watchlist ★' : 'Auf die Watchlist ☆'}</button>
        <button class="btn ghost" data-act="close" aria-label="Schließen">Schließen</button>
      </div>
    </header>
    ${c.risk.length ? `<div class="banner warnb">${c.risk.map(esc).join('<br>')}</div>` : ''}
    ${figures([['Kosten pro Craft', fmt(c.cost)], ['Erlös nach Steuer', fmt(c.revenue)], ['Gewinn pro Craft', `<span class="${cls(c.profit)}">${fmt(c.profit)}</span>`], ['Profit pro Stunde', fmt(c.pph)]])}
    ${facts([['Marge', pct(c.marginPct, false)], ['Sofort-Gewinn', `<span class="${cls(c.fastProfit)}">${fmt(c.fastProfit)}</span>`], ['Crafts pro Stunde (Markt)', fmt(c.craftsH)], ['Crafts pro Stunde (für dich)', fmt(c.qty)], ['Max. Crafts mit Budget', fmt(Math.floor(s.budget / c.cost))], ['Engpass', esc(c.limitingName)]])}
    <section class="block"><header><h3>Zutaten</h3></header>
    <div class="tablewrap"><table><thead><tr><th class="l nosort">Item</th><th class="nosort">Menge</th><th class="nosort">Stückpreis</th><th class="nosort">Summe</th><th class="nosort">Handel pro Stunde</th><th class="nosort">Gefragt</th><th class="l nosort">Wie</th></tr></thead><tbody>
      ${c.parts.map(p => rowFor(S.byId[p.id], p.q, p.unit, s.craftBuy === 'insta' ? 'Instabuy' : 'Buy-Order')).join('')}
      <tr class="divider"><td colspan="7">ergibt</td></tr>
      ${rowFor(o, c.cnt, s.craftSell === 'offer' ? o.sellAt : o.topBuy, s.craftSell === 'offer' ? 'Sell-Offer' : 'Instasell')}
    </tbody></table></div></section>
    <p class="hint">Klick auf ein Item für Verlauf und Orderbuch.</p>`;
}
function rerenderModal(){ if (S.detail) renderDetail(false); else if (S.craftDetail != null) renderCraftDetail(); }

/* Nach jedem Datenabruf */
function render(){ renderMain(); }
