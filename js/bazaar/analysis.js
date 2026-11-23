'use strict';
// Bazaar Flipper: Analyse-Seite eines Items (#bazaar/item/ID).
/* =========================================================
   Analyse-Seite eines Items  (#bazaar/item/ID)
   ========================================================= */
const TOOLS_DRAW = DRAW_TOOLS;   // dieselben Werkzeuge wie überall (js/ui/chart-panel.js)
let anaTool = 'none', anaRes = null;
function drawKey(id){ return 'draw:' + id; }

PAGES.item = function(){
  const id = S.itemId, r = S.byId[id];
  if (!r) return `<p class="loading">${S.rows.length ? 'Dieses Item gibt es im Bazaar gerade nicht.' : 'Die Bazaar-Preise werden geladen …'}</p><p><button class="link" data-tab="overview">Zur Übersicht</button></p>`;
  const watched = S.watch.includes(id);
  const alerts = S.alerts.map((a, i) => ({a, i})).filter(x => x.a.id === id);
  return `<div class="ana">
    <p class="crumbline"><button class="link" data-act="back">Zurück</button></p>
    <header class="ahead">
      <div>${itemIcon(id, true)}<div><h1>${esc(r.name)}</h1><p class="sub">${esc(id)}${S.tiers[id] ? ', ' + esc(title(S.tiers[id])) : ''}</p></div></div>
      <div class="btnrow">
        <a class="btn" href="#markt/item/${encodeURIComponent(id)}">In der Markt-Analyse öffnen</a>
        <button class="btn ghost" data-act="copy" data-name="${esc(r.name)}">Name kopieren</button>
        <button class="btn" data-star="${esc(id)}">${watched ? 'Auf der Watchlist ★' : 'Auf die Watchlist ☆'}</button>
      </div>
    </header>
    <div id="aFig">${anaFigures(r)}</div>
    <div id="aRel">${relDetail(r)}</div>

    <section class="ana-chart">
      <div class="ctrl">
        ${rangeSeg('arange', chartPrefs.arange, ['1h','24h','7d','30d','90d','1y','all','local'])}
        <div class="checks">
          ${[['hi','Instabuy'],['lo','Instasell'],['spread','Spread'],['volume','Volumen']].map(([k,l]) => `<label class="chk k-${k}"><input type="checkbox" data-ind="${k}" ${chartPrefs[k] ? 'checked' : ''}>${l}</label>`).join('')}
          <span class="vsep"></span>
          ${[['sma','SMA 20'],['ema','EMA 50'],['bb','Bollinger']].map(([k,l]) => `<label class="chk k-${k}"><input type="checkbox" data-ind="${k}" ${chartPrefs[k] ? 'checked' : ''}>${l}</label>`).join('')}
        </div>
      </div>
      <div class="drawtools" role="toolbar" aria-label="Zeichenwerkzeuge">
        ${TOOLS_DRAW.map(([k, l, key, tip]) => `<button class="${anaTool === k ? 'on' : ''}" data-tool="${k}" title="${tip} (Taste ${key})">${l}</button>`).join('')}
        <span class="spacer"></span>
        <button data-act="undo" title="Letzte Zeichnung rückgängig (Strg+Z)">Rückgängig</button>
        <button data-act="cleardraw" class="danger">Alle Zeichnungen löschen</button>
      </div>
      <p class="toolhint" id="toolHint">${TOOLS_DRAW.find(t => t[0] === anaTool)[3]}</p>
      <div class="achart" id="achart"></div>
      <div class="legendrow" id="aLegend"></div>
      <p class="hint" id="aSrc"></p>
    </section>

    <section class="fcalc" id="fcalc">${calcSection(r)}</section>

    <div class="ana-grid">
      <section><h2>Buy-Orders</h2><p class="note">Hier landet deine Buy-Order. Höchster Preis oben.</p><div id="aBuy">${book(S.products[id].sell_summary, 'buy')}</div></section>
      <section><h2>Sell-Offers</h2><p class="note">Hier landet deine Sell-Offer. Niedrigster Preis oben.</p><div id="aSell">${book(S.products[id].buy_summary, 'sell')}</div></section>
      <section><h2>Im gewählten Zeitraum</h2><div id="aStats"><p class="mut">Lädt …</p></div></section>
      <section><h2>Preisalarm</h2>
        <div class="alertrow">
          <select id="alCond" aria-label="Bedingung">${Object.entries(CONDS).map(([k,c]) => `<option value="${k}">${c.label}</option>`).join('')}</select>
          <div class="input"><input id="alVal" inputmode="decimal" placeholder="z. B. 1,5k" value="${r.topSell ? coinText(r1(r.topSell)) : ''}" aria-label="Wert in Coins"><span class="unit">Coins</span></div>
          <button class="btn primary" data-act="addalert">Alarm anlegen</button>
        </div>
        ${alerts.length ? `<ul class="alertlist">${alerts.map(({a,i}) => `<li>${CONDS[a.cond].label} ${price(a.value)} <button class="link danger" data-delalert="${i}">löschen</button></li>`).join('')}</ul>` : '<p class="note" style="margin-top:10px">Du bekommst eine Meldung mit Ton, sobald die Bedingung erfüllt ist – solange die Seite offen ist.</p>'}
      </section>
    </div>
  </div>`;
};
function anaFigures(r){
  return figures([
    ['Instabuy', `<span class="amber">${price(r.topSell)}</span>`], ['Instasell', `<span class="pos">${price(r.topBuy)}</span>`],
    ['Flip-Gewinn pro Stück', `<span class="${cls(r.profit)}">${price(r.profit)}</span>`], ['Profit pro Stunde', fmt(r.pphTyp) + (r.pphTyp < r.pph ? `<small>jetzt ${fmt(r.pph)}</small>` : '')],   // wie in der Flip-Tabelle: mit üblichem Spread
  ]) + facts([
    ['Marge', pct(r.marginPct, false)], ['Spread', pct(r.spreadPct, false)], ['1 h', `<span class="${cls(r.d1h)}">${pct(r.d1h)}</span>`], ['24 h', `<span class="${cls(r.d24h)}">${pct(r.d24h)}</span>`],
    ['Instabuys pro Woche', fmt(r.wBuy)], ['Instasells pro Woche', fmt(r.wSell)], ['Handel pro Stunde', fmt(r.perHour)], ['Gefragt', liquid(r) ? 'ja' : 'nein'],
    ['Buy-Orders gesamt', NF0.format(r.sellOrders)], ['Sell-Offers gesamt', NF0.format(r.buyOrders)], ['NPC-Preis', price(r.npc)], ['Strategie-Filter', filteredFlips(true).some(x => x.id === r.id) ? 'passt' : 'passt nicht'],
  ]);
}
