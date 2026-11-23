'use strict';
// Markt-Analyse: Seiten Marktlage, Alle Items, Updates & Mayors, Ranglisten, Kalender, So wird gerechnet.
/* =========================================================
   Seiten
   ========================================================= */
function mkPageTitle(tab){
  if (tab === 'item' && S.itemId) return nm(S.itemId) + ' – Analyse';
  const t = MARKT_TABS.find(x => x.id === tab); return t ? t.label : 'Markt-Analyse';
}
function mkRender(tab){
  if (tab === 'item') return pageItem();
  if (tab === 'items') return pageItems();
  if (tab === 'updates') return pageUpdates();
  if (tab === 'mayors') return pageShell('Mayors & Wahl', 'Mayor und Minister ändern alle 124 Stunden die Regeln. Hier steht, wer gerade regiert, wer die Wahl anführt und was unter jedem Mayor mit den Preisen passiert ist.', mayorsBody);
  if (tab === 'calendar') return pageShell('Kalender & Events', 'Feste Ereignisse im SkyBlock-Jahr und laufende Firesales. Ereignisse ändern Angebot und Nachfrage auf Zeit.', () => `<div id="mk-cal">${calendarHTML()}</div>`);
  if (tab === 'rank') return pageShell('Ranglisten', 'Die auffälligsten Bazaar-Items auf einen Blick, aus den Tagesdaten. Nur gut gehandelte Items. Klick ein Item an, um es zu analysieren.', rankBody);
  if (tab === 'method') return pageMethod();
  return pageStart();
}
function mkMount(tab){
  K.tab = tab;
  const needMD = loadMD().catch(() => {});
  K.mounted = true;
  loadHy().then(() => loadColl()).then(() => { K.catFn = null; redraw(); }).catch(() => {}); loadLive().catch(() => {}); loadPx();
  if (tab === 'items' || tab === 'item' || tab === 'start') loadCat().then(() => redraw()).catch(() => {});
  if (tab === 'item'){ mountItem(); return; }
  Promise.all([needMD, K.hyP, K.liveP]).then(() => { if (K.tab === tab && S.tool === 'markt') redraw(); });
  if (tab === 'start') mountIndexChart();
  clearInterval(K.timer); K.timer = setInterval(() => { if (S.tool === 'markt' && K.tab === 'calendar'){ const el = $('#mk-cal'); if (el) el.innerHTML = calendarHTML(); } }, 30e3);
}
function mkLeave(){ K.mounted = false; clearInterval(K.timer); if (K.chart){ K.chart.destroy(); K.chart = null; } K.tab = null; K.it = null; }
function mkUpdate(){   // neue Bazaar-Daten (alle 20 s)
  if (K.tab === 'item'){ if (K.it && K.it.ready) drawItem(true); return; }
  if (K.tab === 'items') drawList();
}
// Einfache Seiten: Überschrift, Einleitung, Inhalt (der Inhalt wird bei neuen Daten neu gezeichnet)
const BODIES = {};
function pageShell(title, intro, body){
  BODIES[K.tab || S.tab] = body;
  return `<div class="mk"><h1 class="lead small">${title}</h1><p class="summary">${intro}</p><div id="mk-page">${body()}</div></div>`;
}
function redraw(){
  if (S.tool !== 'markt') return;
  if (BODIES[K.tab] && ['mayors', 'calendar', 'rank'].includes(K.tab)){ const v = $('#mk-page'); if (v) v.innerHTML = BODIES[K.tab](); return; }
  if (K.tab === 'start'){ const b = $('#mk-body'); if (b){ b.innerHTML = startBody(); } const l = $('#mk-lead'); if (l) l.innerHTML = startLead(); const n = $('#mk-now'); if (n) n.innerHTML = nowStrip(); if (!K.chart) mountIndexChart(); else feedIndexChart(); }
  else if (K.tab === 'items') drawList();
  else if (K.tab === 'updates'){ const v = $('#mk-upd'); if (v) v.innerHTML = updatesBody(); }
  else if (K.tab === 'item' && K.it && K.it.ready) drawItem(false);
}
function mdNote(){
  if (K.md) return `Tagesdaten vom ${fdate(K.md.days.to)}, berechnet ${fdt(K.md.built)}.`;
  if (K.mdErr) return 'Die Tagesdaten aller Items konnten gerade nicht geladen werden. Live-Preise funktionieren trotzdem.';
  return 'Tagesdaten werden geladen …';
}

/* ---------- Übersicht ---------- */
function pageStart(){
  return `<div class="mk">
    <h1 class="lead small" id="mk-lead">${startLead()}</h1>
    <div id="mk-now">${nowStrip()}</div>
    <section class="mk-block">
      <header><h2>SkyBlock-Preisindex</h2>
        <div class="seg sm" role="group" aria-label="Zeitraum">${[[30, '30 Tage'], [90, '90 Tage'], [365, '1 Jahr']].map(([d, l]) => `<button data-mkrange="${d}" class="${K.idx.range === d ? 'on' : ''}">${l}</button>`).join('')}</div>
        <details class="mk-opts"><summary>Anzeige</summary><div>
          <label class="chk"><input type="checkbox" data-mkopt="bands" ${K.idx.bands ? 'checked' : ''}> Mayor-Amtszeiten</label>
          <label class="chk"><input type="checkbox" data-mkopt="marks" ${K.idx.marks ? 'checked' : ''}> Updates</label>
          <label class="chk">Vergleich <select data-mkcmp>${['', ...SEC_ORDER].map(s => `<option value="${s}" ${K.idx.cmp === s ? 'selected' : ''}>${s ? secLabel(s) : 'keine Kategorie'}</option>`).join('')}</select></label>
        </div></details>
      </header>
      <p class="hint mk-idxlead">Fasst die Preise der umsatzstärksten Bazaar-Items zusammen, wie ein Verbraucherpreisindex den Warenkorb. Steigt er, verlieren Coins an Wert.</p>
      <div class="mk-chart" id="mk-idx"></div>
      <p class="hint" id="mk-idxnote">${mdNote()}</p>
    </section>
    <div id="mk-body">${startBody()}</div>
  </div>`;
}
// Kurzfassung „Was gerade wichtig ist“ mit Links auf die Detailseiten
function nowStrip(){
  const md = K.md, m = curMayor(), now = Date.now(), ev = E.sbUpcoming(now, 6).filter(x => x.key !== 'mayor')[0], u = md && md.updates[0];
  const end = m && m.term ? m.term.end : nextMayorChange(now);
  const box = (href, k, v, s) => `<a class="mk-now" href="${href}"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></a>`;
  return `<div class="mk-nowrow">
    ${box('#markt/mayors', 'Mayor', m ? esc(m.name) + (m.minister ? ` <small>+ ${esc(m.minister.name)}</small>` : '') : '…', end ? 'Wechsel ' + until(end - now) : '')}
    ${box('#markt/updates', 'Neuestes Update', u ? esc(u.title.replace(/^SkyBlock\s*/, '')) : '…', u ? fdate(u.date) + (u.spi.d1 != null ? ', Markt ' + P(u.spi.d1) + ' am Tag danach' : ', Wirkung noch nicht messbar') : '')}
    ${box('#markt/calendar', ev && ev.running ? 'Läuft gerade' : 'Nächstes Event', ev ? esc(ev.name) : '…', ev ? (ev.running ? 'endet ' + until(ev.end - now) : until(ev.start - now)) : '')}
    ${box('#markt/items', 'Items', K.px || S.rows.length ? NF0.format(universe().size) : '…', 'alle mit aktuellem Preis')}
  </div>`;
}
function secLabel(s){ return CAT.label(s); }
function startLead(){
  const md = K.md, m = curMayor();
  if (!md) return 'Wie entwickelt sich der SkyBlock-Markt?';
  const c = E.change(md.index.spi, 30);
  const a = c == null ? '' : Math.abs(c) < .005 ? 'In den letzten 30 Tagen sind die Preise im Schnitt gleich geblieben.' : `In den letzten 30 Tagen ist SkyBlock im Schnitt um ${P(Math.abs(c), false)} ${c > 0 ? 'teurer' : 'billiger'} geworden.`;
  return a + (m ? ` Mayor ist gerade ${esc(m.name)}${m.minister ? `, Minister ${esc(m.minister.name)}` : ''}.` : '');
}
function mountIndexChart(){
  const el = $('#mk-idx'); if (!el) return;
  if (K.chart) K.chart.destroy();
  const ch = K.chart = new PriceChart(el, {});
  ch.labels = {hi: 'Preisindex', lo: 'Kategorie'}; ch.fmt = v => v == null ? '–' : NF1.format(v);
  ch.setIndicators({hi: true, lo: false, spread: false, volume: false});
  ch.empty = K.mdErr ? 'Keine Tagesdaten verfügbar' : 'Lädt …';
  feedIndexChart();
}
function feedIndexChart(){
  const ch = K.chart, md = K.md; if (!ch || !md) return;
  const n = md.index.spi.length, from = Math.max(0, n - 1 - K.idx.range), base = md.index.spi[from];
  const sec = K.idx.cmp && md.index.sec[K.idx.cmp], sb = sec ? sec[from] : null;
  const t = K.mdT.slice(from), hi = md.index.spi.slice(from).map(v => v == null || !base ? null : v / base * 100);
  const lo = sec ? sec.slice(from).map(v => v == null || !sb ? null : v / sb * 100) : t.map(() => null);
  ch.labels = {hi: 'Preisindex', lo: sec ? secLabel(K.idx.cmp) : 'Kategorie'};
  ch.setIndicators({hi: true, lo: !!sec, spread: false, volume: false});
  ch.setData({t, hi, lo});
  ch.setOverlays({bands: K.idx.bands ? md.terms.map(x => ({from: x.start, to: x.end, label: x.name, color: bandColor(x.name), alpha: .5})) : [],
                  marks: K.idx.marks ? md.news.map(x => ({t: x.date, label: x.title.replace(/^SkyBlock\s*/, '')})) : []});
  const note = $('#mk-idxnote');
  if (note) note.innerHTML = `${mdNote()} Start des Zeitraums = 100. Index aus ${NF0.format(md.index.n)} Bazaar-Items mit mindestens ${words(md.indexMin || 2e7)} Coins Umsatz am Tag.${sec ? ` Kategorie ${esc(secLabel(K.idx.cmp))}: ${NF0.format(md.sectors[K.idx.cmp].index)} Items.` : ''}`;
}
function startBody(){
  const md = K.md;
  if (!md) return `<p class="loading">${K.mdErr ? esc(mdNote()) : 'Marktdaten werden geladen …'}</p>`;
  const spi = md.index.spi;
  const secRows = SEC_ORDER.filter(s => md.index.sec[s]).map(s => { const v = md.index.sec[s]; return {s, c7: E.change(v, 7), c30: E.change(v, 30), c365: E.change(v, v.length - 1), n: md.sectors[s].index}; });
  const movers = Object.entries(md.items).filter(([, o]) => o.liq && num(o.c7));
  const up = movers.slice().sort((a, b) => b[1].c7 - a[1].c7).slice(0, 5), dn = movers.slice().sort((a, b) => a[1].c7 - b[1].c7).slice(0, 5);
  const livePx = id => { const r = liveRow(id); return r && r.topSell ? `Instabuy ${price(r.topSell)}, Instasell ${price(r.topBuy)}` : ''; };
  const li = (id, sub, v, vs) => `<li data-mkitem="${esc(id)}">${itemCell(id, nm(id), sub)}<span class="v">${v}<small>${vs}</small></span></li>`;
  return `
  <h2 class="sec">Kategorien</h2>
  <div class="tablewrap"><table class="mk-table">
    <thead><tr><th class="l nosort">Kategorie</th><th class="nosort">Items im Index</th><th class="nosort">7 Tage</th><th class="nosort">30 Tage</th><th class="nosort">1 Jahr</th></tr></thead>
    <tbody>
      <tr class="mk-total"><td class="l"><b>Gesamter Markt</b></td><td>${NF0.format(md.index.n)}</td><td>${PC(E.change(spi, 7))}</td><td>${PC(E.change(spi, 30))}</td><td>${PC(E.change(spi, spi.length - 1))}</td></tr>
      ${secRows.map(r => `<tr data-mksec="${r.s}" title="Alle Items dieser Kategorie"><td class="l">${esc(secLabel(r.s))}</td><td>${NF0.format(r.n)}</td><td>${PC(r.c7)}</td><td>${PC(r.c30)}</td><td>${PC(r.c365)}</td></tr>`).join('')}
    </tbody></table></div>
  <h2 class="sec">Größte Bewegungen der letzten 7 Tage</h2>
  <div class="cols">
    <section><header><h2>Gestiegen</h2><button class="link" data-mkpreset="up7">Alle ansehen</button></header>
      <ul class="rank">${up.map(([id, o]) => li(id, livePx(id), P(o.c7), '7 Tage')).join('')}</ul></section>
    <section><header><h2>Gefallen</h2><button class="link" data-mkpreset="dn7">Alle ansehen</button></header>
      <ul class="rank">${dn.map(([id, o]) => li(id, livePx(id), P(o.c7), '7 Tage')).join('')}</ul></section>
  </div>`;
}
function calendarHTML(){
  const now = Date.now(), d = E.sbDate(now), evs = E.sbUpcoming(now, 7);
  const fires = (K.fires || []).filter(f => f.end > now);
  return `<p class="note">Heute im Spiel: ${d.day}. ${E.SB.MONTHS[d.month]}, Jahr ${d.year}, ${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')}. Ein SkyBlock-Jahr dauert 124 Stunden.</p>
    <ul class="mk-cal">${evs.map(e => `<li class="${e.running ? 'now' : ''}"><b>${esc(e.name)}</b><span>${e.running ? 'läuft gerade, endet ' + until(e.end - now) : fdt(e.start) + ', ' + until(e.start - now)}</span></li>`).join('')}</ul>
    ${fires.length ? `<p class="note"><b>Firesale:</b> ${fires.map(f => `${esc(nm(f.item_id))} (${NF0.format(f.amount)} Stück, ${fdt(f.start)} bis ${fdt(f.end)})`).join('; ')}</p>` : ''}
    <p class="note">Ereignisse ändern Angebot und Nachfrage auf Zeit. Beim Spooky Festival kommen viele Candy-Drops auf den Markt, im Traveling Zoo die Pets, im Late Winter die Geschenke von Jerry.</p>`;
}

/* ---------- Alle Items ---------- */
const MK_PRESETS = {
  up30: {label: 'Gewinner 30 Tage', sort: 'c30', dir: -1, liq: true},
  exp: {label: 'Teuerste', sort: 'buy', dir: -1},
  dn30: {label: 'Verlierer 30 Tage', sort: 'c30', dir: 1, liq: true},
  up7: {label: 'Gewinner 7 Tage', sort: 'c7', dir: -1, liq: true},
  dn7: {label: 'Verlierer 7 Tage', sort: 'c7', dir: 1, liq: true},
  vol: {label: 'Stärkste Schwankung', sort: 'v30', dir: -1, liq: true},
  calm: {label: 'Ruhigste Preise', sort: 'v30', dir: 1, liq: true},
  mayor: {label: 'Hängt am Mayor', sort: 'my', dir: -1, liq: true},
};
function pageItems(){
  const L = K.list;
  return `<div class="mk">
    <h1 class="lead small">Alle Items</h1>
    <p class="summary">Jedes Item aus SkyBlock mit seinem aktuellen Preis. Bazaar-Preise kommen live (dieselben Zahlen wie im Bazaar Flipper), Auction-House-Preise sind der Lowest BIN aus allen aktiven Auktionen. Klick ein Item an, um es genau zu analysieren.</p>
    <div class="toolbar">
      <label class="input search ${L.q ? 'has' : ''}"><input id="msearch" type="search" placeholder="Item suchen, z. B. Hyperion" value="${esc(L.q)}" autocomplete="off"><button class="clear" data-mkclear aria-label="Suche leeren">×</button></label>
      <div class="seg" role="group" aria-label="Markt">${[['all', 'Alle'], ['bz', 'Bazaar'], ['ah', 'Auction House'], ['none', 'Nicht handelbar']].map(([k, l]) => `<button data-mkmkt="${k}" class="${L.mkt === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <select class="mk-select" data-mksecsel aria-label="Kategorie"><option value="all">Alle Kategorien</option>${SEC_ORDER.map(s => `<option value="${s}" ${L.sec === s ? 'selected' : ''}>${esc(secLabel(s))}</option>`).join('')}</select>
    </div>
    <div class="quick mk-presets">${Object.entries(MK_PRESETS).map(([k, p]) => `<button data-mkpreset="${k}" class="${L.preset === k ? 'on' : ''}">${p.label}</button>`).join('')}</div>
    <div id="mk-list"></div>
  </div>`;
}
// Alle bekannten Items: Hypixel-Itemliste, SkyCofl-Katalog, Bazaar, Auction House, Tagesdaten
function universe(){
  const ids = new Set();
  if (K.hy) for (const id in K.hy) ids.add(id);
  if (K.catalog) for (const c of K.catalog) ids.add(c.tag);
  for (const id in S.products) ids.add(id);
  if (K.px) for (const id in K.px.items) ids.add(id);
  if (K.md) for (const id in K.md.items) ids.add(id);
  return ids;
}
// Ein Item mit seinem aktuellen Preis. Bazaar: Instabuy/Instasell genau wie im Flipper (S.byId). Auction House: Lowest BIN.
function itemRow(id, mname){
  const o = K.md && K.md.items[id], r = liveRow(id), x = pxOf(id), c = K.catMap && K.catMap[id];
  const bz = !!(S.products[id] || o), ah = !bz && (!!x || !!(c && /AUCTION/.test(c.flags)));
  const row = {id, name: nm(id), cat: catOf(id), bz, ah, buy: null, sell: null, sub: '', c7: null, c30: null, c365: null, v30: null, to: null, liq: o ? o.liq : 0, my: null, myRaw: null};
  if (bz){
    if (r && (r.topSell || r.topBuy)){ row.buy = r.topSell || null; row.sell = r.topBuy || null; row.to = ((r.wBuy || 0) + (r.wSell || 0)) * (r.topBuy || r.topSell) / 7; }
    if (o){ row.c7 = o.c7; row.c30 = o.c30; row.c365 = o.c365; row.v30 = o.v30;
      if (mname && o.my && o.my[mname]){ row.myRaw = o.my[mname][0]; if (o.my[mname][1] >= 2) row.my = Math.abs(o.my[mname][0]); } }
    if (!row.buy && !row.sell) row.sub = 'gerade keine Orders';
  } else if (x){
    if (x.b != null){ row.buy = x.b; row.sub = x.n === 1 ? '1 BIN-Angebot' : NF0.format(x.n) + ' BIN-Angebote'; }
    else if (x.last != null){ row.last = x.last; row.sub = `kein Angebot, zuletzt ${fmt(x.last)} (${new Date(x.seen).toLocaleDateString('de-AT', {day: 'numeric', month: 'short'})})`; }
    else if (x.s){ row.last = x.s[0]; row.sub = `kein Angebot, zuletzt verkauft für ${fmt(x.s[0])}`; }
    else if (x.a){ row.sub = `nur Gebots-Auktionen (${NF0.format(x.a)})`; }
  } else if (ah) row.sub = 'gerade kein Angebot';
  return row;
}
function listRows(){
  const L = K.list, pre = L.preset && MK_PRESETS[L.preset], cm = curMayor(), mname = cm && cm.name;
  let rows = [];
  for (const id of universe()){
    const r = itemRow(id, mname);
    if (L.mkt === 'bz' && !r.bz) continue; if (L.mkt === 'ah' && !r.ah) continue; if (L.mkt === 'none' && (r.bz || r.ah)) continue;
    rows.push(r);
  }
  if (L.sec !== 'all') rows = rows.filter(r => r.cat === L.sec);
  if (pre && pre.liq) rows = rows.filter(r => r.liq);
  if (L.q){ const q = L.q.toLowerCase().trim(), qi = q.replace(/\s+/g, '_'); rows = rows.filter(r => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(qi)); }
  const k = L.sort, d = L.dir;
  const val = r => k === 'cat' ? secLabel(r.cat || '') : k === 'buy' ? (r.buy ?? r.last ?? null) : r[k];
  rows.sort((a, b) => { const x = val(a), y = val(b); if (k === 'name' || k === 'cat') return (String(x).localeCompare(String(y)) || a.name.localeCompare(b.name)) * d; if (x == null && y == null) return a.name.localeCompare(b.name); if (x == null) return 1; if (y == null) return -1; return (x - y) * d || a.name.localeCompare(b.name); });
  return rows;
}
function drawList(){
  const el = $('#mk-list'); if (!el) return;
  const rows = listRows(), L = K.list, ps = 50, pages = Math.max(1, Math.ceil(rows.length / ps));
  if (L.page >= pages) L.page = pages - 1;
  const slice = rows.slice(L.page * ps, L.page * ps + ps);
  const th = (k, l, left) => `<th data-mksort="${k}" class="${left ? 'l ' : ''}${L.sort === k ? 'on' : ''}">${l}${L.sort === k ? `<span class="arr">${L.dir > 0 ? '↑' : '↓'}</span>` : ''}</th>`;
  const cm = curMayor(), my = L.preset === 'mayor';
  const loading = [!K.hy && 'Item-Liste', !K.catalog && 'SkyCofl-Katalog', !K.px && !K.pxErr && 'Auction-House-Preise', !S.rows.length && 'Bazaar'].filter(Boolean);
  el.innerHTML = `<p class="hint mk-count">${NF0.format(rows.length)} Items${loading.length ? ` (lädt noch: ${loading.join(', ')})` : ''}. Bazaar live, Stand ${S.lastUpdated ? new Date(S.lastUpdated).toLocaleTimeString('de-AT') : '–'}. ${pxNote()}</p>
    <div class="tablewrap"><table class="mk-table"><thead><tr>${th('name', 'Item', true)}${th('buy', 'Kaufen<small>Instabuy / Lowest BIN</small>')}${th('sell', 'Sofort verkaufen<small>Instasell</small>')}${th('c7', '7 Tage')}${th('c30', '30 Tage')}${th('c365', '1 Jahr')}${th('to', 'Umsatz pro Tag')}${my ? th('my', 'unter ' + esc(cm ? cm.name : 'Mayor')) : ''}</tr></thead>
    <tbody>${slice.length ? slice.map(r => `<tr data-mkitem="${esc(r.id)}"><td class="l">${itemCell(r.id, r.name, [r.cat ? esc(secLabel(r.cat)) : '', r.bz ? 'Bazaar' : r.ah ? 'Auction House' : 'nicht handelbar'].filter(Boolean).join(', '))}</td>
      <td class="${r.bz ? 'sell' : ''}">${r.buy ? price(r.buy) : '<span class="mut">–</span>'}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</td><td class="buy">${r.sell ? price(r.sell) : '<span class="mut">–</span>'}</td>
      <td>${PC(r.c7)}</td><td>${PC(r.c30)}</td><td>${PC(r.c365)}</td><td>${r.to ? fmt(r.to) : '<span class="mut">–</span>'}</td>${my ? `<td>${PC(r.myRaw)}</td>` : ''}</tr>`).join('')
      : `<tr class="emptyrow"><td colspan="8"><b>Nichts gefunden.</b> Prüf die Schreibweise oder wähl „Alle“.</td></tr>`}</tbody></table></div>
    ${pages > 1 ? `<div class="pager"><button class="btn ghost" data-mkpg="-1" ${L.page === 0 ? 'disabled' : ''}>Zurück</button><span>Seite ${L.page + 1} von ${NF0.format(pages)}</span><button class="btn ghost" data-mkpg="1" ${L.page >= pages - 1 ? 'disabled' : ''}>Weiter</button></div>` : ''}
    <p class="hint">Veränderungen über 7 Tage, 30 Tage und 1 Jahr gibt es für Bazaar-Items aus den Tagesdaten (${K.md ? 'Stand ' + fdate(K.md.days.to) : 'laden …'}). Für Auction-House-Items stehen Verlauf und Kennzahlen auf der Analyseseite.${my ? ' „Unter Mayor“: typische Veränderung (Median) in seinen Amtszeiten gegenüber dem Markt.' : ''}</p>`;
}
/* ---------- Updates & Mayors ---------- */
function pageUpdates(){ return `<div class="mk"><h1 class="lead small">Wie Updates den Markt bewegen</h1>
  <p class="summary">Für jedes Update wird gemessen, wie sich die Preise danach verändert haben. „Gegenüber dem Markt“ heißt: die Veränderung eines Items minus die Veränderung des Preisindex. So bleibt übrig, was am Item selbst lag. Ein Zusammenhang ist noch kein Beweis, dass das Update die Ursache war.</p>
  <div id="mk-upd">${updatesBody()}</div></div>`; }
function updatesBody(){
  const md = K.md; if (!md) return `<p class="loading">${K.mdErr ? esc(mdNote()) : 'Marktdaten werden geladen …'}</p>`;
  const li = (id, a, b) => `<li data-mkitem="${esc(id)}">${itemCell(id, nm(id), esc(secLabel(catOf(id) || 'ODDITIES')))}<span class="v">${a}<small>${b}</small></span></li>`;
  const sel = K.mayorSel && md.mayorFx[K.mayorSel] ? K.mayorSel : (curMayor() || {}).name;
  const mf = md.mayorFx[sel];
  const cand = K.election && K.election.current && K.election.current.candidates;
  const tot = cand ? cand.reduce((s, c) => s + (c.votes || 0), 0) : 0;
  return `
  <div class="mk-upds">${md.updates.map(u => `<article class="mk-upd">
    <header><h3><a class="link" href="${esc(u.link)}" target="_blank" rel="noopener">${esc(u.title)}</a></h3><span class="mut">${fdate(u.date)}</span></header>
    ${u.spi.d1 == null ? `<p class="note">Noch zu frisch: Messbar ab ${fdate(u.date + 2 * DAY)}.</p>` : `
    <dl class="facts mk-4"><div><dt>Markt nach 1 Tag</dt><dd>${PC(u.spi.d1)}</dd></div><div><dt>3 Tage</dt><dd>${PC(u.spi.d3)}</dd></div><div><dt>7 Tage</dt><dd>${PC(u.spi.d7)}</dd></div><div><dt>14 Tage</dt><dd>${PC(u.spi.d14)}</dd></div></dl>
    <p class="mk-chips">${Object.entries(u.sec).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]).map(([s, v]) => `<span class="${cls(v)}">${esc(secLabel(s))} ${P(v)}</span>`).join('')}</p>
    ${u.top.length ? `<p class="note">${NF0.format(u.big)} von ${NF0.format(u.n)} gut gehandelten Items haben sich in 7 Tagen um mehr als 10 % anders bewegt als der Markt.</p>
    <div class="two"><div><h4 class="mk-h4">Gestiegen</h4><ul class="rank">${u.top.slice(0, 5).map(r => li(r[0], P(r[1]), P(r[2]) + ' absolut')).join('')}</ul></div>
      <div><h4 class="mk-h4">Gefallen</h4><ul class="rank">${u.flop.slice(0, 5).map(r => li(r[0], P(r[1]), P(r[2]) + ' absolut')).join('')}</ul></div></div>` : ''}`}
  </article>`).join('')}</div>`;
}

function mayorsBody(){
  const md = K.md; if (!md) return `<p class="loading">${K.mdErr ? esc(mdNote()) : 'Marktdaten werden geladen …'}</p>`;
  const li = (id, a, b) => `<li data-mkitem="${esc(id)}">${itemCell(id, nm(id), esc(secLabel(catOf(id) || 'ODDITIES')))}<span class="v">${a}<small>${b}</small></span></li>`;
  const sel = K.mayorSel && md.mayorFx[K.mayorSel] ? K.mayorSel : (curMayor() || {}).name;
  const mf = md.mayorFx[sel], m = curMayor();
  const cand = K.election && K.election.current && K.election.current.candidates;
  const tot = cand ? cand.reduce((s, c) => s + (c.votes || 0), 0) : 0;
  const end = m && m.term ? m.term.end : nextMayorChange(Date.now());
  return `
  ${m ? `<section class="mk-cur"><p class="mk-big">${esc(m.name)}${m.minister ? ` <span class="mut">mit Minister ${esc(m.minister.name)}</span>` : ''}</p>
    <ul class="mk-perks">${m.perks.map(p => `<li><b>${esc(p.name)}</b>${p.d ? ` ${esc(p.d)}` : ''}</li>`).join('')}${m.minister && m.minister.perk ? `<li><b>${esc(m.minister.perk)}</b> (Minister)${m.minister.d ? ` ${esc(m.minister.d)}` : ''}</li>` : ''}</ul>
    ${end ? `<p class="note">Amtszeit bis ${fdt(end)} (${until(end - Date.now())}).</p>` : ''}</section>` : ''}
  <h2 class="sec">Was unter jedem Mayor passiert</h2>
  <p class="note mk-w">Jede Amtszeit dauert 124 Stunden. Gemessen wird der Ø-Preis in der Amtszeit gegenüber den 5 Tagen davor, im Vergleich zum Markt, als Median über alle Amtszeiten. Mayors wirken über ihre Perks: Mehr Drops oder mehr Fortune bedeuten mehr Angebot und meist fallende Preise, neue Aufgaben schaffen Nachfrage.</p>
  ${cand && cand.length ? `<div class="mk-vote"><h3 class="mk-h4">Laufende Wahl (Jahr ${K.election.current.year})</h3>${cand.slice().sort((a, b) => b.votes - a.votes).map(c => `<div class="mk-vrow"><span>${esc(c.name)}</span><i style="--w:${tot ? (c.votes / tot * 100).toFixed(1) : 0}%"></i><b>${tot ? NF1.format(c.votes / tot * 100) + ' %' : '–'}</b>${md.mayorFx[c.name] ? `<button class="link" data-mkmayor="${esc(c.name)}">Was passiert unter ${esc(c.name)}?</button>` : ''}</div>`).join('')}</div>` : ''}
  <div class="tablewrap"><table class="mk-table"><thead><tr><th class="l nosort">Mayor</th><th class="nosort">Amtszeiten im letzten Jahr</th><th class="nosort">Markt typisch</th><th class="l nosort">stärkste Kategorie</th><th class="l nosort">schwächste Kategorie</th></tr></thead><tbody>
    ${Object.entries(md.mayorFx).sort((a, b) => b[1].terms - a[1].terms).map(([n, f]) => { const s = Object.entries(f.sec).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]); return `<tr data-mkmayor="${esc(n)}" class="${n === sel ? 'cur' : ''}"><td class="l"><b>${esc(n)}</b>${(curMayor() || {}).name === n ? ' <span class="mut">im Amt</span>' : ''}</td><td>${f.terms}</td><td>${PC(f.spi)}</td><td class="l">${s[0] ? esc(secLabel(s[0][0])) + ' ' + PC(s[0][1]) : '–'}</td><td class="l">${s.length ? esc(secLabel(s[s.length - 1][0])) + ' ' + PC(s[s.length - 1][1]) : '–'}</td></tr>`; }).join('')}
  </tbody></table></div>
  ${mf ? `<div class="two mk-mf"><div><h4 class="mk-h4">Unter ${esc(sel)} typischerweise gestiegen</h4><ul class="rank">${mf.top.map(r => li(r[0], P(r[1]), `${r[2]} Amtszeiten, ${Math.round(r[3] * 100)} % gestiegen`)).join('')}</ul></div>
    <div><h4 class="mk-h4">Unter ${esc(sel)} typischerweise gefallen</h4><ul class="rank">${mf.flop.map(r => li(r[0], P(r[1]), `${r[2]} Amtszeiten, ${Math.round(r[3] * 100)} % gestiegen`)).join('')}</ul></div></div>
    <p class="hint">Median über mindestens 3 Amtszeiten, nur Items mit ruhigem Preis. Je mehr Amtszeiten und je öfter gestiegen, desto belastbarer.</p>` : ''}

  <h2 class="sec">Letzte Amtszeiten</h2>
  <div class="tablewrap"><table class="mk-table"><thead><tr><th class="l nosort">Mayor</th><th class="l nosort">Minister</th><th class="l nosort">von</th><th class="l nosort">bis</th></tr></thead><tbody>
    ${md.terms.slice(-12).reverse().map(t => `<tr class="static"><td class="l">${esc(t.name)}</td><td class="l">${t.minister ? esc(t.minister.name) + (t.minister.perk ? ` <span class="mut">${esc(t.minister.perk)}</span>` : '') : '–'}</td><td class="l">${fdt(t.start)}</td><td class="l">${fdt(t.end)}</td></tr>`).join('')}
  </tbody></table></div>`;
}
/* ---------- Ranglisten ---------- */
function rankBody(){
  const md = K.md; if (!md) return `<p class="loading">${K.mdErr ? esc(mdNote()) : 'Marktdaten werden geladen …'}</p>`;
  const rows = Object.entries(md.items).filter(([, o]) => o.liq).map(([id, o]) => ({id, o}));
  const top = (key, dir, n = 8) => rows.filter(r => num(r.o[key])).sort((a, b) => (a.o[key] - b.o[key]) * dir).slice(0, n);
  const m = curMayor(), mn = m && m.name;
  const myRows = mn ? rows.filter(r => r.o.my && r.o.my[mn] && r.o.my[mn][1] >= 3) : [];
  const li = (r, v, sub) => `<li data-mkitem="${esc(r.id)}">${itemCell(r.id, nm(r.id), sub)}<span class="v">${v}</span></li>`;
  const box = (title, preset, list) => `<section><header><h2>${title}</h2>${preset ? `<button class="link" data-mkpreset="${preset}">Alle ansehen</button>` : ''}</header><ul class="rank">${list || '<li class="mut">Keine Daten.</li>'}</ul></section>`;
  const cat = r => esc(secLabel(catOf(r.id) || r.o.s));
  return `<div class="cols mk-ranks">
    ${box('Gewinner 7 Tage', 'up7', top('c7', -1).map(r => li(r, PC(r.o.c7), cat(r))).join(''))}
    ${box('Verlierer 7 Tage', 'dn7', top('c7', 1).map(r => li(r, PC(r.o.c7), cat(r))).join(''))}
    ${box('Gewinner 30 Tage', 'up30', top('c30', -1).map(r => li(r, PC(r.o.c30), cat(r))).join(''))}
    ${box('Verlierer 30 Tage', 'dn30', top('c30', 1).map(r => li(r, PC(r.o.c30), cat(r))).join(''))}
    ${box('Stärkste Schwankung', 'vol', top('v30', -1).map(r => li(r, P(r.o.v30, false), 'pro Tag, ' + cat(r))).join(''))}
    ${box('Ruhigste Preise', 'calm', top('v30', 1).map(r => li(r, P(r.o.v30, false), 'pro Tag, ' + cat(r))).join(''))}
    ${mn ? box(`Steigen typischerweise unter ${esc(mn)}`, 'mayor', myRows.sort((a, b) => b.o.my[mn][0] - a.o.my[mn][0]).slice(0, 8).map(r => li(r, PC(r.o.my[mn][0]), `${r.o.my[mn][1]} Amtszeiten, gegenüber dem Markt`)).join('')) : ''}
    ${mn ? box(`Fallen typischerweise unter ${esc(mn)}`, null, myRows.sort((a, b) => a.o.my[mn][0] - b.o.my[mn][0]).slice(0, 8).map(r => li(r, PC(r.o.my[mn][0]), `${r.o.my[mn][1]} Amtszeiten, gegenüber dem Markt`)).join('')) : ''}
  </div><p class="hint">${mdNote()} Schwankung: Standardabweichung der täglichen Preisänderung in den letzten 30 Tagen.</p>`;
}

/* ---------- So wird gerechnet ---------- */
function pageMethod(){
  const g = (t, vwl, sb) => `<div class="mk-g"><h3>${t}</h3><p>${vwl}</p><p class="mk-sb"><b>In SkyBlock:</b> ${sb}</p></div>`;
  return `<div class="mk mk-method"><h1 class="lead small">So wird gerechnet</h1>
  <p class="summary">Alle Zahlen kommen aus echten Spieldaten. Was gemessen ist, steht als Zahl da. Was eine Schätzung ist, steht als Schätzung da.</p>
  <h2 class="sec">Datenquellen</h2>
  <ul class="rules mk-w">
    <li><b>Hypixel API</b>: Bazaar live (alle 20 Sekunden), Item-Liste mit NPC-Preisen, Mayor und Wahl, Patchnotes mit Datum, Firesales.</li>
    <li><b>SkyCofl</b>: Preisverläufe für Bazaar und Auction House, die letzten Verkäufe, die Mayor-Historie. <i>Prices provided by SkyCofl.</i></li>
    <li><b>Tagesdaten aller Bazaar-Items</b>: einmal am Tag automatisch berechnet (GitHub Action), damit alle Besucher dieselben Zahlen sehen. ${K.md ? 'Stand ' + fdt(K.md.built) + '.' : ''}</li>
    <li><b>Rezepte</b>: aus dem NotEnoughUpdates-Repository, wöchentlich aktualisiert.</li>
  </ul>
  <h2 class="sec">Preisprognose</h2>
  <ul class="rules mk-w">
    <li><b>Grundlage</b>: der Tagesverlauf des Items im letzten Jahr (Bazaar: mengengewichteter Marktpreis, Auction House: Ø Verkaufspreis, Ausreißer gefiltert). Start ist der aktuelle Preis.</li>
    <li><b>Modell</b>: Jeden Tag bewegt sich der Preis um drei Dinge. Er kehrt ein Stück zu seinem gleitenden Mittel zurück (Halbwertszeit 20 Tage). Die letzte Tagesbewegung und der Schwung der letzten Woche wirken nach. Dazu kommt Zufall. Die Stärke jedes Teils wird für jedes Item aus seinem Verlauf geschätzt und zu den typischen Werten aller Items hin geschrumpft, damit wenige oder wilde Daten nicht entgleisen.</li>
    <li><b>Zufall</b>: echte vergangene Überraschungen des Items (Bootstrap), skaliert mit seiner aktuellen Schwankung. Daraus entstehen 2 000 mögliche Pfade über 180 Tage. Der mittlere Pfad (Median) ist die Prognose, die Pfade ergeben die Spannen und die Wahrscheinlichkeiten für einen Zielpreis.</li>
    <li><b>Mayors</b>: Wirkt ein Mayor in mindestens 6 Amtszeiten fast immer in dieselbe Richtung auf das Item, zählt diese Wirkung. Für die nächste Amtszeit zählt der Stand der Wahl, danach die Häufigkeit der Mayors.</li>
    <li><b>Kalibrierung</b>: Alle 6 Stunden rechnet die Pipeline rückwirkend Tausende Prognosen über alle Bazaar-Items und die meistgehandelten Auction-House-Items, jeweils nur mit den Daten bis zum damaligen Tag. Daraus werden die Breite der Spannen, die Stärke der erwarteten Bewegung je Horizont und die Wahrscheinlichkeiten für Zielpreise so eingestellt, dass sie in der Vergangenheit gestimmt hätten. Geprüft wird auf einem späteren Zeitraum, der zum Einstellen nicht benutzt wurde.</li>
    <li><b>Was nicht hilft</b>: Trends fortzuschreiben, Wochentage und die meisten Mayor-Wirkungen machten die Prognose in diesen Tests nicht besser, sondern schlechter. Sie sind darum aus oder stark gedämpft.</li>
    <li><b>Grenzen</b>: Updates, neue Items, Events und einzelne große Händler kann kein Modell vorhersehen. Die Prognose sagt, was nach dem bisherigen Verhalten wahrscheinlich ist, nicht was sicher passiert.</li>
  </ul>
  <h2 class="sec">Rechenregeln</h2>
  <ul class="rules mk-w">
    <li><b>Marktpreis eines Bazaar-Items pro Tag</b>: Instabuy- und Instasell-Preis, gewichtet mit den Stück, die zu diesem Preis gehandelt werden. Einzelne Preisspitzen (mehr als 3 robuste Standardabweichungen vom Median der umliegenden 7 Tage) werden durch diesen Median ersetzt.</li>
    <li><b>Auction House</b>: Kennzahlen rechnen mit dem Ø Verkaufspreis pro Tag, Ausreißer gefiltert wie beim Bazaar. Er enthält aufgewertete Exemplare (Sterne, Enchants, Reforges), das Niveau liegt darum über dem günstigsten Angebot. Für Veränderungen und Risiko zählt das kaum, weil die Mischung von Tag zu Tag ähnlich bleibt. Der günstigste Verkauf pro Tag ist zu unruhig, oft ist es ein beschädigtes oder falsch eingestelltes Exemplar.</li>
    <li><b>Preisindex</b>: gewichteter geometrischer Mittelwert der Preisveränderungen (wie bei Verbraucherpreisindizes). Gewicht = Umsatz in Coins, ein Item höchstens 8 %. Nur Items mit mindestens ${words((K.md && K.md.indexMin) || 2e7)} Coins Umsatz am Tag, mindestens 100 Instabuys und 100 Instasells am Tag und Daten an 95 % der Tage.</li>
    <li><b>Wirkung eines Updates</b>: Ø der 3 Tage vor dem Update gegenüber dem Preis 1 Tag danach und dem Ø der jeweils letzten 3 Tage bis 3, 7 und 14 Tage danach. Die Fenster glätten das Tagesrauschen. Bei Items zusätzlich minus Index („gegenüber dem Markt“). In den Ranglisten nur Items, deren Preis am Tag im Schnitt um höchstens 25 % schwankt.</li>
    <li><b>Wirkung eines Mayors</b>: Ø-Preis in den vollen Tagen der Amtszeit gegenüber den 5 Tagen davor, minus dieselbe Rechnung für den Index. Zusammengefasst als Median über alle Amtszeiten im letzten Jahr, in Ranglisten nur mit mindestens 3 Amtszeiten.</li>
    <li><b>Schwankung (Volatilität)</b>: Standardabweichung der täglichen Log-Renditen der letzten 30 Tage.</li>
    <li><b>Value at Risk 95 %</b>: an 95 von 100 Tagen fiel der Preis nicht stärker als dieser Wert (aus dem letzten Jahr gemessen). Expected Shortfall: Ø-Verlust an den übrigen 5 %.</li>
    <li><b>Preiselastizität</b>: Regression von ln(Wochenmenge) auf ln(Ø-Wochenpreis), nicht überlappende Wochen. Mit 95-%-Konfidenzintervall.</li>
  </ul>
  <h2 class="sec">Volks- und Betriebswirtschaft, auf SkyBlock übertragen</h2>
  <div class="mk-gloss">
    ${g('Angebot und Nachfrage', 'Der Preis entsteht dort, wo Anbieter und Käufer zusammenkommen.', 'Die Buy-Orders im Bazaar sind die Nachfragekurve, die Sell-Offers die Angebotskurve. Dazwischen liegt der Spread. Instabuys und Instasells sind die Geschäfte, die wirklich zustande kommen.')}
    ${g('Preiselastizität', 'Wie stark ändert sich die Menge, wenn sich der Preis ändert? Über 1 heißt elastisch, unter 1 unelastisch.', 'Unelastisch sind Items, die man unbedingt braucht (z. B. für Upgrades oder Essenz für Sterne). Elastisch sind Items mit Ersatz, etwa wenn es ein günstigeres Rezept gibt.')}
    ${g('Preisuntergrenze', 'Ein Mindestpreis, unter den der Preis nicht dauerhaft fallen kann.', 'Der NPC-Verkaufspreis. Fällt der Bazaar-Preis darunter, kauft jeder und verkauft an den NPC (Arbitrage), bis der Preis wieder steigt.')}
    ${g('Preisobergrenze durch Herstellung', 'Ist Selbermachen billiger als Kaufen, steigt das Angebot.', 'Die Herstellkosten aus dem Rezept. Liegt der Preis darüber, lohnt Craften, mehr Ware kommt auf den Markt und der Preis sinkt Richtung Kosten.')}
    ${g('Inflation', 'Steigt das allgemeine Preisniveau, verliert Geld an Kaufkraft.', 'Coins entstehen ständig neu (Mob-Drops, NPC-Verkäufe, Minions) und verschwinden über Coin-Sinks (Bazaar-Steuer, Auction-House-Gebühren, NPC-Käufe, Upgrades). Der Preisindex misst, was am Ende übrig bleibt.')}
    ${g('Angebotsschock', 'Ein plötzlicher Anstieg oder Einbruch des Angebots verschiebt den Preis.', 'Ein Update, das Drop-Raten erhöht, oder ein Mayor mit Fortune-Perk bringt mehr Ware. Ein Nerf oder ein neues Rezept, das ein Item verbraucht, verknappt es.')}
    ${g('Marktstruktur und Wettbewerb', 'Viele kleine Anbieter bedeuten Wettbewerb, wenige große bedeuten Marktmacht. Gemessen mit dem Herfindahl-Index (HHI): unter 0,15 viel Wettbewerb, über 0,25 konzentriert.', 'Wie verteilt sich die Menge im Orderbuch auf die Preisstufen? Steht fast alles in einer Order, kann ein Spieler den Preis bestimmen.')}
    ${g('Saisonalität', 'Wiederkehrende Muster nach Wochentag oder Uhrzeit.', 'Am Wochenende und am Abend spielen mehr Leute: mehr Angebot aus dem Grinden, mehr Nachfrage nach Upgrades.')}
    ${g('Politik', 'Regierungen setzen Rahmenbedingungen, die Märkte verändern.', 'Mayor und Minister ändern alle 124 Stunden die Regeln: mehr Mining Fortune unter Cole, Mythological Ritual unter Diana, Fishing Festival unter Marina.')}
    ${g('Make-or-Buy', 'Selbst herstellen oder einkaufen? Entscheidend sind die Kosten.', 'Für jede Zutat wird der günstigere Weg gewählt: kaufen oder selbst craften (bis 4 Stufen tief).')}
    ${g('Deckungsbeitrag und Break-even', 'Erlös minus variable Kosten. Break-even ist der Preis, ab dem man nichts verliert.', 'Erlös nach Bazaar-Steuer bzw. Auction-House-Gebühren minus Kosten der Zutaten. Fixkosten gibt es im Spiel kaum.')}
    ${g('Kapitalbindung und Kapitalumschlag', 'Wie viel Geld steckt wie lange im Geschäft?', 'Coins, die in offenen Buy-Orders und unverkaufter Ware stecken. Je schneller ein Durchlauf, desto öfter arbeitet dasselbe Geld pro Tag.')}
    ${g('Risiko und Beta', 'Wie stark schwankt ein Wert, und wie sehr hängt er am Gesamtmarkt?', 'Beta über 1: das Item schwankt stärker als der Markt. Beta nahe 0: eigene Gesetze, etwa durch ein Update nur für dieses Item.')}
    ${g('Produktlebenszyklus', 'Einführung, Wachstum, Reife, Rückgang.', 'Neue Items starten teuer und knapp. Dann wird mehr gefarmt, der Preis fällt. Wird ein Item durch ein besseres ersetzt, schrumpft die Menge.')}
    ${g('Opportunitätskosten', 'Was entgeht dir, weil du dein Geld anders einsetzt?', 'Wer Coins in einem Item hält, verzichtet auf andere Flips. Darum wird die Rendite immer mit dem Preisindex verglichen.')}
  </div></div>`;
}
