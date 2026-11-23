'use strict';
// Bazaar Flipper: Bausteine für Tabellen, Werkzeugleiste und das Filter-Panel.
/* =========================================================
   Bausteine
   ========================================================= */
function th(tab, k, label, l, tip){
  if (!k) return `<th class="nosort ${l ? 'l' : ''}">${label}</th>`;
  const on = S.sort[tab].k === k;
  return `<th data-sort="${k}" class="${l ? 'l ' : ''}${on ? 'on' : ''}"${tip ? ` title="${esc(tip)}"` : ''}>${label}${on ? `<span class="arr">${S.sort[tab].d > 0 ? '↑' : '↓'}</span>` : ''}</th>`;
}
function sortRows(rows, tab){
  const {k, d} = S.sort[tab];
  return rows.sort((a, b) => {
    const x = a[k], y = b[k];
    if (typeof x === 'string') return x.localeCompare(y) * d;
    return ((x ?? -Infinity) - (y ?? -Infinity)) * d;
  });
}
function starBtn(id){ const on = S.watch.includes(id); return `<button class="star ${on ? 'on' : ''}" data-star="${esc(id)}" title="${on ? 'Von der Watchlist nehmen' : 'Auf die Watchlist'}" aria-label="${on ? 'Von der Watchlist nehmen' : 'Auf die Watchlist'}">${on ? '★' : '☆'}</button>`; }
function flash(key, v){
  const p = S.prevPrice[key]; S.prevPrice[key] = v;
  if (p == null || p === v) return '';
  return v > p ? 'flash-up' : 'flash-dn';
}
function paginate(tab, rows){
  const ps = S.set.pageSize, pages = Math.max(1, Math.ceil(rows.length / ps));
  let p = S.pageNo[tab] || 0; if (p >= pages) p = pages - 1; S.pageNo[tab] = p;
  return {slice: rows.slice(p*ps, p*ps + ps), html: pages > 1 ? `<div class="pager"><button class="btn ghost" data-pg="-1" ${p === 0 ? 'disabled' : ''}>Zurück</button><span>Seite ${p+1} von ${pages}</span><button class="btn ghost" data-pg="1" ${p >= pages-1 ? 'disabled' : ''}>Weiter</button></div>` : ''};
}
function bar(v, max){ return `<span class="pbar">${fmt(v)}<i style="width:${max > 0 ? Math.max(3, v / max * 100).toFixed(0) : 0}%"></i></span>`; }
function spark(id, W=88, H=22){
  const t = trendCache[id], vals = t && t.spark ? t.spark.filter(v => v > 0) : [];
  if (vals.length < 2) return '<span class="mut">–</span>';
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const pts = vals.map((v, i) => (i/(vals.length-1)*W).toFixed(1) + ',' + (mx === mn ? H/2 : H - 2 - (v-mn)/(mx-mn)*(H-4)).toFixed(1)).join(' ');
  const col = vals[vals.length-1] >= vals[0] ? 'var(--emerald)' : 'var(--red)';
  return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}
// Zahl für Fließtext: 790.900 / 1,25 Mio. / 2,1 Mrd.
function words(v){
  if (v == null || !isFinite(v)) return '–';
  const a = Math.abs(v);
  if (a >= 1e9) return NF2.format(v/1e9) + '\u00a0Mrd.';
  if (a >= 1e6) return NF2.format(v/1e6) + '\u00a0Mio.';
  if (a >= 1e3) return NF0.format(Math.round(v/100)*100);
  return NF1.format(v);
}

// Eingabe-Komponenten
function sliderCtl(key){
  const c = SLIDERS[key], steps = c.steps, v = S.set[key];
  let idx = 0, bd = Infinity;
  steps.forEach((s, i) => { const d = Math.abs(s - v); if (d < bd){ bd = d; idx = i; } });
  const p = (idx / (steps.length - 1) * 100).toFixed(1);
  return `<label class="field slider"><span class="head"><span>${c.label}</span><output data-out="${key}">${c.f(steps[idx])}</output></span>
    <input type="range" min="0" max="${steps.length-1}" step="1" value="${idx}" data-slider="${key}" style="--p:${p}%">
    ${c.hint ? `<small>${c.hint}</small>` : ''}</label>`;
}
function coinCtl(key, label, quick, hint){
  return `<div class="field"><label class="lbl" for="c-${key}">${label}</label>
    <div class="input"><input id="c-${key}" data-coin="${key}" value="${coinText(S.set[key])}" inputmode="decimal" autocomplete="off" placeholder="z. B. 10m"><span class="unit">Coins</span></div>
    ${quick ? `<div class="quick">${quick.map(q => `<button data-coinset="${key}:${q}" class="${S.set[key] === q ? 'on' : ''}">${fmt(q)}</button>`).join('')}</div>` : ''}
    ${hint ? `<small>${hint}</small>` : ''}</div>`;
}
function segCtl(key, opts){
  return `<div class="seg">${opts.map(([v, l]) => `<button data-setv="${key}" data-val="${v}" class="${String(S.set[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function switchCtl(key, label, sub){
  return `<label class="switch"><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" data-set="${key}" ${S.set[key] ? 'checked' : ''}></label>`;
}
function presetSeg(){
  return `<div class="seg" role="group" aria-label="Strategie">${Object.entries(PRESETS).map(([k,p]) => `<button data-preset="${k}" class="${S.set.preset === k ? 'on' : ''}" title="${esc(p.desc)}">${p.label}</button>`).join('')}${S.set.preset === 'custom' ? '<button class="on" data-act="filters">Eigene</button>' : ''}</div>`;
}

/* Über jeder Liste: Suche, Strategie, Filter – darunter ein Satz, was gerade gilt */
function toolbar(kind, count, noun){
  const s = S.set;
  let line = `<b>${NF0.format(count)} ${noun}</b>`;
  if (kind === 'market') line += s.marketLiquidOnly ? ', nur gefragte Items.' : '.';
  else {
    line += ` passen zu deinem Budget von ${words(s.budget)} Coins`;
    line += ` und werden mindestens ${NF0.format(s.minVolH)}-mal pro Stunde gehandelt.`;
    if (kind === 'crafts') line += ` Zutaten per ${s.craftBuy === 'insta' ? 'Instabuy' : 'Buy-Order'}, Verkauf per ${s.craftSell === 'insta' ? 'Instasell' : 'Sell-Offer'}.`;
  }
  return `<div class="toolbar">
      <div class="input search ${S.search ? 'has' : ''}"><input id="search" type="search" placeholder="Item suchen" value="${esc(S.search)}" autocomplete="off" aria-label="Item suchen"><button class="clear" data-act="clearsearch" aria-label="Suche leeren">×</button></div>
      ${kind !== 'market' ? presetSeg() : ''}
      <div class="spacer"></div>
      <button class="btn" data-act="filters">Filter</button>
    </div>
    <p class="summary">${line}</p>`;
}

/* =========================================================
   Filter-Panel
   ========================================================= */
function openDrawer(){ S.drawer = true; renderDrawer(); $('#drawer').classList.add('on'); $('#scrim').classList.add('on'); }
function closeDrawer(){ S.drawer = false; const d = $('#drawer'); if (d) d.classList.remove('on'); const sc = $('#scrim'); if (sc) sc.classList.remove('on'); }
function renderDrawer(){
  const kind = S.tab, secs = [];
  if (kind === 'market'){
    secs.push(`<section><h3>Anzeige</h3>${switchCtl('marketLiquidOnly', 'Nur gefragte Items', 'Items mit wenig Handel ausblenden')}</section>`);
  } else {
    const cur = PRESETS[S.set.preset];
    secs.push(`<section><h3>Strategie</h3>${presetSeg()}
      ${cur ? `<p class="note">${esc(cur.desc)}</p><ul class="rules">${presetRules(cur).map(x => `<li>${x}</li>`).join('')}</ul>`
            : '<p class="note">Du hast die Filter selbst angepasst. Wähl eine Strategie, um alle Werte zurückzusetzen.</p>'}</section>`);
    secs.push(`<section><h3>Kapital und Zeit</h3>${coinCtl('budget', 'Budget', [1e6, 5e6, 10e6, 50e6, 100e6, 500e6], 'Kurzschreibweise geht: 10m, 2,5m, 500k, 1b')}${sliderCtl('share')}${sliderCtl('minCycle')}</section>`);
  }
  secs.push(`<section><h3>Nachfrage</h3><p class="note">Damit sich deine Orders schnell füllen, muss auf beiden Seiten genug gehandelt werden.</p>${sliderCtl('minVolH')}${sliderCtl('minTurnH')}${sliderCtl('minBalance')}</section>`);
  if (kind === 'crafts'){
    secs.push(`<section><h3>Ablauf</h3>
      <div class="field"><span class="lbl">Zutaten kaufen per</span>${segCtl('craftBuy', [['order','Buy-Order'],['insta','Instabuy']])}</div>
      <div class="field"><span class="lbl">Ergebnis verkaufen per</span>${segCtl('craftSell', [['offer','Sell-Offer'],['insta','Instasell']])}</div></section>`);
    secs.push(`<section><h3>Gewinn</h3>${sliderCtl('craftMinPct')}${coinCtl('craftMinProfit', 'Mindestgewinn pro Craft')}${sliderCtl('maxPct')}</section>`);
  } else if (kind !== 'market'){
    secs.push(`<section><h3>Gewinn</h3>${sliderCtl('minPct')}${coinCtl('minProfit', 'Mindestgewinn pro Stück')}${sliderCtl('maxPct')}</section>`);
  }
  if (kind === 'flips' || kind === 'overview') secs.push(`<section><h3>Verlässlichkeit (letzte 7 Tage)</h3><p class="note">Ein Flip ist verlässlich, wenn der Spread über längere Zeit ähnlich war. Ungewöhnlich große Spreads verschwinden meist schnell wieder.</p>${sliderCtl('maxSpreadRatio')}${sliderCtl('minOkShare')}</section>`);
  if (kind !== 'market') secs.push(`<section><h3>Sicherheit</h3>${sliderCtl('maxDev')}${switchCtl('hideRisky', 'Items mit Warnhinweis ausblenden', 'Preisausreißer, mögliche Manipulation, kaum Handel, auffälliger Preisverlauf')}</section>`);
  $('#drawer').innerHTML = `<header><h2>Filter</h2><button class="btn ghost" data-act="closedrawer" aria-label="Filter schließen">Schließen</button></header>
    <div class="dbody">${secs.join('')}</div>
    <footer><button class="btn ghost" data-preset="balanced">Auf Ausgewogen zurücksetzen</button><button class="btn primary" data-act="closedrawer">Fertig</button></footer>`;
}
