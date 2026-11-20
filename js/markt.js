'use strict';
/* =========================================================
   Markt-Analyse – jedes SkyBlock-Item volks- und betriebswirtschaftlich
   Nutzt aus app.js: S (Live-Bazaar), RECIPES, Formatierer (fmt, price, pct, esc, …), nav, renderMain.
   Rechnet mit js/econ.js. Tagesdaten aller Bazaar-Items kommen aus market.json (GitHub Action).
   ========================================================= */
(function(){
const E = window.Econ, DAY = E.DAY;
const MD_URL = 'https://raw.githubusercontent.com/Kaiserlingo/Skyblock-Tools/data/market.json';
const COFL = 'https://sky.coflnet.com/api/', HY = 'https://api.hypixel.net/v2/';
const BZ_TAX = () => (S.set.tax || 1.25) / 100;
const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const P = (x, sign = true) => x == null || !isFinite(x) ? '–' : pct(x * 100, sign);   // Anteile (0,05) als Prozent
const PC = x => `<span class="${x == null ? 'mut' : cls(x)}">${P(x)}</span>`;
const num = v => v != null && isFinite(v);
const fdate = t => new Date(t).toLocaleDateString('de-AT', {day: 'numeric', month: 'short', year: 'numeric'});
const fdt = t => new Date(t).toLocaleString('de-AT', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
function until(ms){
  if (ms <= 0) return 'jetzt';
  const m = Math.round(ms / 60e3); if (m < 60) return 'in ' + m + ' min';
  const h = Math.floor(m / 60); if (h < 48) return 'in ' + h + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
  return 'in ' + Math.round(h / 24) + ' Tagen';
}
const CAT = window.Categories, SEC_ORDER = CAT.ORDER;
const PX_URL = 'https://raw.githubusercontent.com/Kaiserlingo/Skyblock-Tools/data/prices.json';

/* ---------- Zustand ---------- */
const K = {
  md: null, mdErr: null, mdP: null,
  hy: null, hyP: null, catalog: null, catMap: null, catP: null, coll: null, collP: null, catFn: null, px: null, pxP: null, pxErr: null,
  election: null, fires: null, liveP: null,
  chart: null, timer: null,
  list: {q: '', mkt: 'all', sec: 'all', sort: 'to', dir: -1, page: 0, preset: null},
  idx: {range: 365, bands: true, marks: true, cmp: ''},
  it: null, itTab: 'market', itRange: '1y', itBands: true, itMarks: true, mob: 'order', calc: {budget: 10e6, share: 10},
};
try{ Object.assign(K.calc, JSON.parse(localStorage.getItem('mk:calc') || '{}')); }catch{}

/* ---------- Laden (mit Warteschlange, damit SkyCofl nicht überlastet wird) ---------- */
const memo = new Map(), queue = []; let active = 0;
function getJSON(url, ttl = 10 * 60e3){
  const c = memo.get(url); if (c && Date.now() - c.at < ttl) return c.p;
  const p = new Promise((res, rej) => { queue.push({url, res, rej}); pump(); });
  memo.set(url, {at: Date.now(), p}); p.catch(() => memo.delete(url));
  return p;
}
function pump(){
  while (active < 3 && queue.length){
    const j = queue.shift(); active++;
    (async () => {
      for (let k = 0; k < 3; k++){
        try{
          const r = await fetch(j.url);
          if (r.status === 204) return [];
          if (r.status === 429){ await sleep(2500 * (k + 1)); continue; }
          if (r.status === 404) return null;
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return await r.json();
        }catch(e){ if (k === 2) throw e; await sleep(700 * (k + 1)); }
      }
      throw new Error('zu viele Anfragen');
    })().then(j.res, j.rej).finally(() => { active--; pump(); });
  }
}
function loadMD(){
  if (K.mdP) return K.mdP;
  return K.mdP = fetch(MD_URL, {cache: 'no-cache'}).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => { if (!j || !j.index || !j.items) throw new Error('unvollständig'); K.md = j; K.mdT = Array.from({length: j.index.spi.length}, (_, i) => j.days.from + i * DAY); return j; })
    .catch(e => { K.mdErr = e.message; K.mdP = null; throw e; });
}
function loadHy(){
  if (K.hyP) return K.hyP;
  return K.hyP = getJSON(HY + 'resources/skyblock/items', 6 * 3600e3).then(j => { const m = {}; for (const it of (j && j.items) || []) m[it.id] = Object.assign({}, it, {name: String(it.name || '').replace(/§./g, '')}); K.hy = m; return m; });
}
function loadCat(){
  if (K.catP) return K.catP;
  return K.catP = getJSON(COFL + 'items', 6 * 3600e3).then(a => { K.catalog = Array.isArray(a) ? a : []; K.catMap = {}; for (const x of K.catalog) K.catMap[x.tag] = x; return K.catalog; });
}
function loadColl(){
  if (K.collP) return K.collP;
  return K.collP = getJSON(HY + 'resources/skyblock/collections', 6 * 3600e3).then(j => { K.coll = (j && j.collections) || {}; K.catFn = null; return K.coll; });
}
// Lowest BIN aller Auction-House-Items (alle 10 Minuten aus allen Hypixel-Auktionen berechnet, siehe tools/build_prices.mjs)
function loadPx(force){
  if (K.pxP && !force) return K.pxP;
  return K.pxP = fetch(PX_URL + '?t=' + Math.floor(Date.now() / 60e3), {cache: 'no-cache'})
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => { if (!j || !j.items) throw new Error('unvollständig'); const changed = !K.px || j.built !== K.px.built; K.px = j; K.pxErr = null; if (changed && K.mounted) pxChanged(); return j; })
    .catch(e => { K.pxErr = e.message; K.pxP = null; });
}
setInterval(() => { if ((S.tool === 'markt' || !S.tool) && !document.hidden) loadPx(true); }, 60e3);
function pxChanged(){
  if (!S.tool && window.Start){ Start.update(); return; }
  if (S.tool !== 'markt') return;
  if (K.tab === 'item'){ if (K.it && K.it.ready) drawItem(true); }
  else if (K.tab === 'items') drawList();
  else if (K.tab === 'start') redraw();
}
function pxOf(id){ return K.px && K.px.items[id] || null; }
function pxAge(){ return K.px ? Date.now() - K.px.lastUpdated : null; }
function pxNote(){
  if (K.px && pxAge() > 30 * 60e3) return `Auction-House-Preise: Stand ${fdt(K.px.lastUpdated)} (vor ${ago(pxAge())}). Die automatische Aktualisierung hängt gerade, die Preise können veraltet sein.`;
  if (K.px) return `Auction-House-Preise: Stand ${new Date(K.px.lastUpdated).toLocaleTimeString('de-AT', {hour: '2-digit', minute: '2-digit'})} (vor ${ago(pxAge())}), aus allen ${NF0.format(K.px.auctions)} aktiven Auktionen, alle 10 Minuten neu.`;
  return K.pxErr ? 'Die Auction-House-Preise konnten gerade nicht geladen werden.' : 'Auction-House-Preise werden geladen …';
}
// Kategorie: dieselbe Einteilung wie in der Tagesdaten-Pipeline (js/categories.js)
function catOf(id){
  if (!K.catFn && K.hy && K.coll && RECIPES.length) K.catFn = CAT.make(Object.values(K.hy), K.coll, RECIPES);
  if (K.catFn) return K.catFn(id);
  const o = K.md && K.md.items[id]; return o ? o.s : null;
}
function loadLive(){
  if (K.liveP && Date.now() - K.liveAt < 120e3) return K.liveP;
  K.liveAt = Date.now();
  return K.liveP = Promise.allSettled([getJSON(HY + 'resources/skyblock/election', 60e3), getJSON(HY + 'skyblock/firesales', 60e3)])
    .then(([e, f]) => { if (e.status === 'fulfilled' && e.value && e.value.success) K.election = e.value; if (f.status === 'fulfilled' && f.value && f.value.success) K.fires = f.value.sales || []; });
}

/* ---------- Item-Grunddaten ---------- */
function nm(id){
  const h = K.hy && K.hy[id]; if (h && h.name) return h.name;
  const m = K.md && K.md.items[id]; if (m && m.n) return m.n;
  const c = K.catMap && K.catMap[id]; if (c && c.name) return c.name;
  const x = pxOf(id); if (x && x.name && /[a-z]/.test(x.name)) return x.name;   // Werbetexte wie „UPCOMING SALE“ überspringen
  return pretty(id);
}
function kind(id){
  const bz = !!(S.products[id] || (K.md && K.md.items[id]));
  const c = K.catMap && K.catMap[id], px = pxOf(id);
  const ah = !bz && (!!px || !!(c && /AUCTION/.test(c.flags)));
  return {bz, ah, known: bz || !!c || !!px || !!(K.hy && K.hy[id]), flags: c ? c.flags : null};
}
function liveRow(id){ return S.byId && S.byId[id]; }
function itemLink(id, sub){ return `<a class="mk-it" href="#markt/item/${encodeURIComponent(id)}">${itemCell(id, nm(id), sub)}</a>`; }
function bandColor(name){ let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `var(--band${h % 4 + 1})`; }
function curMayor(){
  const e = K.election && K.election.mayor, md = K.md;
  const now = Date.now(), term = md && md.terms.find(t => t.start <= now && now < t.end);
  if (e) return {name: e.name, key: e.key, perks: (e.perks || []).map(p => ({name: p.name, d: String(p.description || '').replace(/§./g, '')})), minister: e.minister ? {name: e.minister.name, perk: e.minister.perk && e.minister.perk.name, d: String(e.minister.perk && e.minister.perk.description || '').replace(/§./g, '')} : null, term};
  if (md && md.election && md.election.mayor){ const m = md.election.mayor; return {name: m.name, perks: (m.perks || []).map(n => ({name: n})), minister: m.minister ? {name: m.minister} : null, term}; }
  return null;
}
function nextMayorChange(now){ const ev = E.sbUpcoming(now, 12).find(x => x.key === 'mayor'); return ev ? ev.start : null; }
function spiAt(){ return K.md ? K.md.index.spi : null; }

/* =========================================================
   Seiten
   ========================================================= */
function pageTitle(tab){
  if (tab === 'item' && S.itemId) return nm(S.itemId) + ' – Analyse';
  const t = MARKT_TABS.find(x => x.id === tab); return t ? t.label : 'Markt-Analyse';
}
function render(tab){
  if (tab === 'item') return pageItem();
  if (tab === 'items') return pageItems();
  if (tab === 'updates') return pageUpdates();
  if (tab === 'mayors') return pageShell('Mayors & Wahl', 'Mayor und Minister ändern alle 124 Stunden die Regeln. Hier steht, wer gerade regiert, wer die Wahl anführt und was unter jedem Mayor mit den Preisen passiert ist.', mayorsBody);
  if (tab === 'calendar') return pageShell('Kalender & Events', 'Feste Ereignisse im SkyBlock-Jahr und laufende Firesales. Ereignisse ändern Angebot und Nachfrage auf Zeit.', () => `<div id="mk-cal">${calendarHTML()}</div>`);
  if (tab === 'rank') return pageShell('Ranglisten', 'Die auffälligsten Bazaar-Items auf einen Blick, aus den Tagesdaten. Nur gut gehandelte Items. Klick ein Item an, um es zu analysieren.', rankBody);
  if (tab === 'method') return pageMethod();
  return pageStart();
}
function mount(tab){
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
function leave(){ K.mounted = false; clearInterval(K.timer); if (K.chart){ K.chart.destroy(); K.chart = null; } K.tab = null; K.it = null; }
function update(){   // neue Bazaar-Daten (alle 20 s)
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
const PRESETS = {
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
    <div class="quick mk-presets">${Object.entries(PRESETS).map(([k, p]) => `<button data-mkpreset="${k}" class="${L.preset === k ? 'on' : ''}">${p.label}</button>`).join('')}</div>
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
  const L = K.list, pre = L.preset && PRESETS[L.preset], cm = curMayor(), mname = cm && cm.name;
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
    <div class="tablewrap"><table class="mk-table"><thead><tr>${th('name', 'Item', true)}${th('cat', 'Kategorie', true)}<th class="l nosort">Markt</th>${th('buy', 'Kaufen<small>Instabuy / Lowest BIN</small>')}${th('sell', 'Sofort verkaufen<small>Instasell</small>')}${th('c7', '7 Tage')}${th('c30', '30 Tage')}${th('c365', '1 Jahr')}${th('to', 'Umsatz pro Tag')}${my ? th('my', 'unter ' + esc(cm ? cm.name : 'Mayor')) : ''}</tr></thead>
    <tbody>${slice.length ? slice.map(r => `<tr data-mkitem="${esc(r.id)}"><td class="l">${itemCell(r.id, r.name, esc(r.id))}</td><td class="l mut">${r.cat ? esc(secLabel(r.cat)) : '–'}</td><td class="l mut">${r.bz ? 'Bazaar' : r.ah ? 'Auction House' : 'nicht handelbar'}</td>
      <td class="${r.bz ? 'sell' : ''}">${r.buy ? price(r.buy) : '<span class="mut">–</span>'}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</td><td class="buy">${r.sell ? price(r.sell) : '<span class="mut">–</span>'}</td>
      <td>${PC(r.c7)}</td><td>${PC(r.c30)}</td><td>${PC(r.c365)}</td><td>${r.to ? fmt(r.to) : '<span class="mut">–</span>'}</td>${my ? `<td>${PC(r.myRaw)}</td>` : ''}</tr>`).join('')
      : `<tr class="emptyrow"><td colspan="10"><b>Nichts gefunden.</b> Prüf die Schreibweise oder wähl „Alle“.</td></tr>`}</tbody></table></div>
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

/* =========================================================
   Item-Analyse
   ========================================================= */
function pageItem(){
  const id = S.itemId;
  return `<div class="mk mk-item">
    <p class="crumbline"><a class="link" href="#markt/items">Alle Items</a></p>
    <div id="mi-head">${itemHead(id)}</div>
    <section class="mk-block">
      <header><h2>Preisverlauf</h2>
        <div class="seg sm" role="group" aria-label="Zeitraum">${[['7d', '7 Tage'], ['1y', '1 Jahr'], ['all', 'Alles']].map(([k, l]) => `<button data-mirange="${k}" class="${K.itRange === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <label class="chk"><input type="checkbox" data-miopt="bands" ${K.itBands ? 'checked' : ''}> Mayor-Amtszeiten</label>
        <label class="chk"><input type="checkbox" data-miopt="marks" ${K.itMarks ? 'checked' : ''}> Updates</label>
      </header>
      <div class="mk-chart tall" id="mi-chart"></div>
      <p class="hint" id="mi-cnote"></p>
    </section>
    <div id="mi-body"><p class="loading">Daten werden geladen …</p></div>
  </div>`;
}
function itemHead(id){
  const h = K.hy && K.hy[id], k = kind(id), r = liveRow(id), x = pxOf(id), I = K.it && K.it.id === id ? K.it : null;
  const tier = h && h.tier ? title(h.tier) : (S.tiers[id] ? title(S.tiers[id]) : '');
  const cat = catOf(id);
  let px = '';
  if (k.bz && r && (r.topBuy || r.topSell)) px = `<dl class="figures mk-fig"><div><dt>Instabuy</dt><dd class="amber">${price(r.topSell)}</dd></div><div><dt>Instasell</dt><dd class="pos">${price(r.topBuy)}</dd></div><div><dt>Spread</dt><dd>${r.topBuy && r.topSell ? P((r.topSell - r.topBuy) / r.topSell, false) : '–'}</dd></div><div><dt>Umsatz pro Tag</dt><dd>${fmt(((r.wBuy || 0) + (r.wSell || 0)) * (r.topBuy || r.topSell) / 7)}</dd></div></dl>
    <p class="hint mk-src">Live aus dem Bazaar, Stand ${new Date(S.lastUpdated).toLocaleTimeString('de-AT')}.</p>`;
  else if (k.ah){
    const s = I && I.ah && I.ah.sold;
    px = `<dl class="figures mk-fig"><div><dt>Lowest BIN</dt><dd class="amber">${x && x.b != null ? price(x.b) : '–'}</dd></div><div><dt>Zweitgünstigster BIN</dt><dd>${x && x.l5 && x.l5[1] != null ? price(x.l5[1]) : '–'}</dd></div><div><dt>BIN-Angebote</dt><dd>${x ? NF0.format(x.n || 0) : '–'}</dd></div><div><dt>Verkäufe pro Tag</dt><dd>${s && s.perDay != null ? NF1.format(s.perDay) : '–'}</dd></div></dl>
      <p class="hint mk-src">${x && x.b == null ? (x.last != null ? `Gerade kein BIN-Angebot. Zuletzt gesehen: ${price(x.last)} am ${fdt(x.seen)}. ` : 'Gerade kein BIN-Angebot. ') : ''}${x && x.a ? `${x.a === 1 ? '1 Gebots-Auktion' : NF0.format(x.a) + ' Gebots-Auktionen'}, ${x.hb ? 'höchstes Gebot ' + price(x.hb) : 'noch ohne Gebot'}. ` : ''}${I && I.live && I.live.b != null && Math.abs(I.live.b - (x && x.b || 0)) > .5 ? `Live laut SkyCofl gerade: Lowest BIN ${price(I.live.b)}. ` : ''}${pxNote()}</p>
      ${x && x.v ? `<table class="mk-mini mk-var"><thead><tr><th class="l nosort">${id.startsWith('PET_') ? 'Rarity' : 'Stufe'}</th><th class="nosort">Lowest BIN</th></tr></thead><tbody>${Object.entries(x.v).sort((a, b) => a[1] - b[1]).map(([v, p]) => `<tr class="static"><td class="l">${esc(title(v))}</td><td>${price(p)}</td></tr>`).join('')}</tbody></table>` : ''}`;
  }
  return `<div class="ahead"><div><h1>${esc(nm(id))}</h1>
    <p class="sub">${[esc(id), tier, cat ? esc(secLabel(cat)) : '', k.bz ? 'Bazaar' : k.ah ? 'Auction House' : k.known ? 'nicht handelbar' : ''].filter(Boolean).join(', ')}</p></div>
    <div class="btnrow">${k.bz ? `<a class="btn primary" href="#bazaar/item/${encodeURIComponent(id)}">Im Bazaar Flipper öffnen</a>` : ''}<button class="btn ghost" data-mkcopy="${esc(nm(id))}">Name kopieren</button></div></div>${px}`;
}
async function mountItem(){
  const id = S.itemId, I = K.it = {id, ready: false, err: [], series: {}};
  if (K.chart){ K.chart.destroy(); K.chart = null; }
  const el = $('#mi-chart');
  if (el){ const ch = K.chart = new PriceChart(el, {}); ch.empty = 'Lädt …'; ch.setIndicators({hi: true, lo: true, spread: true, volume: true}); }
  await Promise.allSettled([loadMD(), loadHy(), loadCat(), K.liveP]);
  if (K.it !== I) return;
  const k = I.k = kind(id);
  const now = Date.now(), y = new Date((K.md ? K.md.days.from : now - 366 * DAY) - 2 * DAY).toISOString(), n = new Date(now).toISOString();   // ab dem ersten Tag des Rasters, wie die Pipeline
  const enc = encodeURIComponent(id);
  try{
    if (k.bz){
      // 7-Tage-Abfrage: nur bis 7 Tage liefert SkyCofl 2-Stunden-Punkte
      const [h1, h14] = await Promise.all([getJSON(COFL + `bazaar/${enc}/history?start=${y}&end=${n}`, 30 * 60e3), getJSON(COFL + `bazaar/${enc}/history?start=${new Date(now - 6.9 * DAY).toISOString()}&end=${n}`, 5 * 60e3).catch(() => null)]);
      I.h1 = bzPoints(h1); I.h7 = bzPoints(h14);
    } else if (k.ah){
      const [full, week, sold] = await Promise.allSettled([
        getJSON(COFL + `item/price/${enc}/history/full`, 60 * 60e3), getJSON(COFL + `item/price/${enc}/history/week`, 10 * 60e3),
        getJSON(COFL + `auctions/tag/${enc}/sold`, 5 * 60e3)]);
      const v = x => x.status === 'fulfilled' ? x.value : null;
      I.hAll = ahPoints(v(full)); I.h1 = I.hAll.filter(p => p.t >= Date.parse(y)); I.h7 = ahPoints(v(week));
      I.ah = {sold: soldStats(v(sold))};
      if (!K.px || pxAge() > 20 * 60e3){ const lb = await getJSON(COFL + `auctions/tag/${enc}/active/bin`, 60e3).catch(() => null); if (Array.isArray(lb) && lb.length) I.live = {b: Math.min(...lb.map(a => a.startingBid / (a.count || 1)))}; }
    }
  }catch(e){ I.err.push(e.message); }
  if (K.it !== I) return;
  I.ready = true;
  drawItem(false); feedItemChart();
}
function bzPoints(h){
  return (Array.isArray(h) ? h : []).map(o => ({t: E.parseUtc(o.timestamp), buy: +o.buy || null, sell: +o.sell || null, v: E.bazaarPrice(o), bmw: +o.buyMovingWeek || 0, smw: +o.sellMovingWeek || 0, bv: o.buyVolume, sv: o.sellVolume}))
    .filter(p => isFinite(p.t)).sort((a, b) => a.t - b.t);
}
function ahPoints(h){
  return (Array.isArray(h) ? h : []).map(o => ({t: E.parseUtc(o.time), min: +o.min || null, max: +o.max || null, avg: +o.avg || null, vol: +o.volume || 0, v: +o.avg || null}))
    .filter(p => isFinite(p.t)).sort((a, b) => a.t - b.t);
}
function soldStats(a){
  if (!Array.isArray(a) || !a.length) return null;
  const s = a.map(x => ({p: +x.highestBidAmount || +x.startingBid, t: E.parseUtc(x.end), seller: x.auctioneerId, clean: (x.enchantments === '[]' || !x.enchantments || (Array.isArray(x.enchantments) && !x.enchantments.length)) && !x.reforge, count: x.count || 1}))
    .filter(x => x.p > 0 && isFinite(x.t)).map(x => Object.assign(x, {p: x.p / x.count}));
  if (!s.length) return null;
  const t0 = Math.min(...s.map(x => x.t)), t1 = Math.max(...s.map(x => x.t)), span = Math.max((t1 - t0) / DAY, 1 / 24);
  const ps = s.map(x => x.p), clean = s.filter(x => x.clean).map(x => x.p);
  const by = {}; for (const x of s) by[x.seller] = (by[x.seller] || 0) + 1;
  const shares = Object.values(by).map(c => c / s.length);
  return {n: s.length, span, perDay: s.length / span, q10: E.quantile(ps, .1), q50: E.median(ps), q90: E.quantile(ps, .9), cleanN: clean.length, cleanMed: E.median(clean),
          cv: E.sd(ps) / E.mean(ps), sellers: shares.length, hhi: shares.reduce((x, y) => x + y * y, 0), top: Math.max(...shares), list: s};
}
function feedItemChart(){
  const ch = K.chart, I = K.it; if (!ch || !I || !I.ready) return;
  const r = K.itRange, md = K.md;
  let pts = r === '7d' ? I.h7 : r === 'all' ? I.hAll : I.h1;
  if (r === 'all' && !I.hAll && I.k.bz){
    ch.empty = 'Lädt …'; ch.setData({t: []});
    coflAll(I.id)
      .then(h => { if (K.it !== I) return; I.hAll = bzPoints(h); feedItemChart(); }).catch(() => { ch.empty = 'Konnte nicht geladen werden'; ch.setData({t: []}); });
    return;
  }
  pts = pts || [];
  ch.empty = I.k.bz || I.k.ah ? 'Keine Daten für diesen Zeitraum' : 'Für dieses Item gibt es keinen Markt';
  if (I.k.bz){
    ch.labels = {hi: 'Instabuy', lo: 'Instasell'};
    ch.setIndicators({hi: true, lo: true, spread: true, volume: true});
    ch.setData({t: pts.map(p => p.t), hi: pts.map(p => p.buy), lo: pts.map(p => p.sell), vb: pts.map(p => p.sv ?? null), vs: pts.map(p => p.bv ?? null)});
    const lr = liveRow(I.id), q = S.products[I.id] && S.products[I.id].quick_status;
    if (lr && S.lastUpdated && r !== 'all' && q) ch.append({t: S.lastUpdated, hi: q.buyPrice || lr.topSell || null, lo: q.sellPrice || lr.topBuy || null, vb: q.sellVolume, vs: q.buyVolume});
  } else {
    ch.labels = {hi: 'Ø Verkaufspreis', lo: 'günstigster Verkauf'};
    ch.setIndicators({hi: true, lo: true, spread: true, volume: true});
    ch.setData({t: pts.map(p => p.t), hi: pts.map(p => p.avg), lo: pts.map(p => p.min), vb: pts.map(p => p.vol), vs: pts.map(() => null)});
  }
  ch.setOverlays({bands: K.itBands && md ? md.terms.map(x => ({from: x.start, to: x.end, label: x.name, color: bandColor(x.name), alpha: .5})) : [],
                  marks: K.itMarks && md ? md.news.map(x => ({t: x.date, label: x.title.replace(/^SkyBlock\s*/, '')})) : []});
  const note = $('#mi-cnote');
  if (note) note.innerHTML = (I.k.bz ? 'Bernstein: Instabuy (niedrigste Sell-Offer), Grün: Instasell (höchste Buy-Order). Unten: Menge in Sell-Offers und Buy-Orders.'
    : 'Bernstein: Ø Verkaufspreis, Grün: günstigster Verkauf. Unten: Zahl der Verkäufe. Die Kennzahlen rechnen mit dem Ø Verkaufspreis pro Tag (Ausreißer gefiltert), weil der günstigste Verkauf oft ein beschädigtes oder falsch eingestelltes Exemplar ist.') + ' Mausrad zoomt, Ziehen verschiebt, Doppelklick zeigt alles. Prices provided by SkyCofl.';
}

/* ---------- Kennzahlen eines Items ---------- */
function analyze(I){
  const md = K.md, id = I.id, A = {};
  const T = md ? K.mdT : null, end = md ? md.days.to : E.dayStart(Date.now());
  const days = T ? T.length : 366;
  // wie die Pipeline: ab recentCut die aktuellen 2-Stunden-Punkte statt der verzögerten Tagespunkte
  const pts = I.k.bz && md && md.recentCut ? E.mergeRecent(I.h1 || [], I.h7 || [], md.recentCut) : (I.h1 || []);
  const d = E.daily(pts.map(p => ({t: p.t, v: p.v})), {days, end});
  A.T = d.t; A.v = E.hampel(d.v);
  A.spi = md ? md.index.spi : null;
  A.L = E.lastIdx(A.v); A.p = A.L >= 0 ? A.v[A.L] : null;
  for (const k of [1, 7, 30, 90]) A['c' + k] = E.change(A.v, k);
  A.c365 = E.change(A.v, days - 1);
  if (A.spi){ A.m30 = E.change(A.spi, 30); A.m365 = E.change(A.spi, days - 1); A.m7 = E.change(A.spi, 7); A.m90 = E.change(A.spi, 90); }
  A.vol = E.volatility(A.v, 30); A.dd = E.maxDrawdown(A.v); A.risk = E.varES(A.v); A.z = E.zscore(A.v, 30);
  A.beta = A.spi ? E.beta(A.v, A.spi) : null;
  const vals = A.v.filter(num); A.pctl = A.p != null && vals.length > 20 ? vals.filter(x => x <= A.p).length / vals.length : null;
  A.min1y = vals.length ? Math.min(...vals) : null; A.max1y = vals.length ? Math.max(...vals) : null;
  // Elastizität
  if (I.k.bz){
    A.eD = E.elasticity(E.weeklySamples(I.h1 || [], 'bmw', 'buy'));
    A.eS = E.elasticity(E.weeklySamples(I.h1 || [], 'smw', 'sell'));
  } else if (I.h1){ A.eD = E.elasticity(E.weeklySamples(I.h1.filter(p => p.v), 'vol', 'v', 'sum')); }
  // Saisonalität (Ortszeit)
  const tz = new Date().getTimezoneOffset();
  A.wd = E.profile(A.T, A.v, 'weekday', 7, tz);
  const h = (I.h7 || []).filter(p => num(p.v));
  if (h.length > 36){ const st = E.median(h.slice(1).map((p, i) => p.t - h[i].t)) / 36e5, win = 2 * Math.round(12 / Math.max(st, .25)) + 1; A.hr = E.profile(h.map(p => p.t), h.map(p => p.v), 'hour', win, tz); A.hrStep = st; } else A.hr = null;
  // Politik und Updates
  if (md){
    const done = md.terms.filter(t => t.end <= md.built && t.start >= A.T[0] + 6 * DAY);   // wie in der Pipeline
    const mine = E.termReturns(A.T, A.v, done), mkt = new Map(E.termReturns(A.T, A.spi, done).map(x => [x.start, x.ret]));
    A.my = E.groupBy(mine.map(x => ({name: x.name, abn: mkt.has(x.start) ? x.ret - mkt.get(x.start) : null})), 'name', 'abn');
    A.ev = md.news.map(nw => { const w = md.eventWindow || 1, a = E.eventReturns(A.T, A.v, nw.date, [1, 7], w), b = E.eventReturns(A.T, A.spi, nw.date, [7], w); return {nw, d1: a.d1, d7: a.d7, abn: a.d7 != null && b.d7 != null ? a.d7 - b.d7 : null}; });
  }
  // Lebenszyklus
  const first = I.hAll && I.hAll.length ? I.hAll[0].t : (I.h1 && I.h1.length && I.h1[0].t > Date.now() - 300 * DAY ? I.h1[0].t : null);
  const volOf = p => I.k.bz ? p.bmw + p.smw : p.vol;
  const recent = (I.h1 || []).filter(p => p.t > Date.now() - 90 * DAY), prev = (I.h1 || []).filter(p => p.t <= Date.now() - 90 * DAY && p.t > Date.now() - 180 * DAY);
  A.life = E.lifecycle(first ? (Date.now() - first) / DAY : null, recent.length > 20 ? E.mean(recent.map(volOf)) : null, prev.length > 20 ? E.mean(prev.map(volOf)) : null);
  return A;
}

function drawItem(liveOnly){
  const I = K.it; if (!I || !I.ready) return;
  const head = $('#mi-head'); if (head) head.innerHTML = itemHead(I.id);
  const body = $('#mi-body'); if (!body) return;
  if (liveOnly && body.contains(document.activeElement) && document.activeElement.matches('input,select')) return;
  if (!liveOnly || !I.A) I.A = analyze(I);
  document.title = nm(I.id) + ' – Analyse – SkyBlock Tools';
  if (!I.k.bz && !I.k.ah){
    body.innerHTML = `<p class="muted-note">${I.k.known ? 'Dieses Item kann man weder im Bazaar noch im Auction House handeln (z. B. Soulbound). Es gibt dafür keinen Marktpreis.' : 'Dieses Item kennt weder Hypixel noch SkyCofl. Prüf die ID.'}</p>${chainHTML(I)}`;
    return;
  }
  body.innerHTML = `${I.err.length ? `<div class="banner warnb">Ein Teil der Daten konnte nicht geladen werden (${esc(I.err[0])}). Die übrigen Zahlen stimmen.</div>` : ''}
    ${glanceHTML(I)}
    <nav class="mk-itabs" role="tablist" aria-label="Analyse">${ITABS.map(t => `<button role="tab" data-mitab="${t.id}" class="${K.itTab === t.id ? 'on' : ''}" aria-selected="${K.itTab === t.id}">${t.label}<small>${t.sub}</small></button>`).join('')}</nav>
    <div class="mk-itab">${(ITABS.find(t => t.id === K.itTab) || ITABS[0]).html(I)}</div>
    <p class="hint">${mdNote()} ${I.k.bz ? 'Live-Werte aus dem Bazaar, Verläufe von SkyCofl.' : 'Lowest BIN aus allen Hypixel-Auktionen, Verläufe und Verkäufe von SkyCofl.'} Prices provided by SkyCofl.</p>`;
}
// Unterteilung der Item-Analyse
const ITABS = [
  {id: 'market', label: 'Angebot & Nachfrage', sub: 'Volkswirtschaft', html: I => `<div class="ana-grid">${[supplyDemandHTML(I), structureHTML(I), elasticityHTML(I), corridorHTML(I)].join('')}</div>`},
  {id: 'trend', label: 'Entwicklung', sub: 'Inflation, Mayors, Updates', html: I => `<div class="ana-grid">${[inflationHTML(I), politicsHTML(I), updatesItemHTML(I), seasonHTML(I), lifecycleHTML(I)].join('')}</div>`},
  {id: 'money', label: 'Kosten & Gewinn', sub: 'Betriebswirtschaft', html: I => `<div class="ana-grid">${[makeOrBuyHTML(I), contributionHTML(I), flipHTML(I)].join('')}</div>`},
  {id: 'risk', label: 'Risiko & Bewertung', sub: 'Halten oder nicht?', html: I => `<div class="ana-grid">${[valuationHTML(I), riskHTML(I), investHTML(I)].join('')}</div>`},
  {id: 'chain', label: 'Herstellung', sub: 'Rezept und Verwendung', html: I => chainHTML(I)},
];
const card = (title, sbText, inner, wide) => `<section class="${wide ? 'wide' : ''}"><h2>${title}</h2>${inner}${sbText ? `<p class="mk-sb"><b>In SkyBlock:</b> ${sbText}</p>` : ''}</section>`;
const facts = rows => `<dl class="facts">${rows.filter(Boolean).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

function glanceHTML(I){
  const A = I.A, h = K.hy && K.hy[I.id], o = K.md && K.md.items[I.id];
  return `<dl class="facts mk-glance">
    ${[[I.k.bz ? 'Tagesmittel (Basis der Kennzahlen)' : I.id.startsWith('PET_') ? 'Ø Verkaufspreis am Tag (alle Rarities)' : 'Ø Verkaufspreis am Tag', A.p ? price(A.p) : '–'], ['7 Tage', PC(A.c7)], ['30 Tage', PC(A.c30)], ['1 Jahr', PC(A.c365)],
       ['Schwankung pro Tag', A.vol != null ? P(A.vol, false) : '–'], ['Kategorie', catOf(I.id) ? esc(secLabel(catOf(I.id))) : '–'], ['NPC-Verkaufspreis', h && h.npc_sell_price ? price(h.npc_sell_price) : 'keiner'], ['Lebenszyklus', esc(A.life.stage)]]
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

/* --- Angebot und Nachfrage --- */
function supplyDemandHTML(I){
  if (I.k.bz){
    const p = S.products[I.id]; if (!p) return card('Angebot und Nachfrage', '', '<p class="loading">Live-Daten laden …</p>');
    const b = E.book(p), q = p.quick_status || {};
    return card('Angebot und Nachfrage', 'Jede Buy-Order ist ein Spieler, der zu diesem Preis kaufen will (Nachfrage). Jede Sell-Offer ist ein Angebot. Wo sich die Kurven fast treffen, liegt der Marktpreis. Hypixel zeigt die besten 30 Preisstufen je Seite.',
      curveSVG(b) + facts([
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
    + facts(s ? [['Verkäufe erfasst', `${NF0.format(s.n)} in ${NF1.format(s.span)} Tagen`], ['Verkäufe pro Tag', NF1.format(s.perDay)], ['Preis 10 % / 50 % / 90 %', `${fmt(s.q10)} / ${fmt(s.q50)} / ${fmt(s.q90)}`], ['Median ohne Enchants/Reforge', s.cleanN ? `${price(s.cleanMed)} (${NF0.format(s.cleanN)} Verkäufe)` : '–'], ['Preisstreuung (Variationskoeffizient)', NF2.format(s.cv)]] : [['Verkäufe', 'keine Daten']]));
}
function curveSVG(b){
  const W = 520, H = 220, L = 54, R = 10, T = 10, B = 28;
  const dem = b.demand, sup = b.supply; if (!dem.length && !sup.length) return '<p class="note">Orderbuch leer.</p>';
  const mid = b.mid, keep = l => l.p >= mid * .7 && l.p <= mid * 1.3;
  const d = dem.filter(keep), s = sup.filter(keep);
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
  return facts([[what, `${NF2.format(e.b)} <small>(${NF2.format(e.lo)} bis ${NF2.format(e.hi)})</small>`], ['Einordnung', word], ['Erklärte Streuung (R²)', NF2.format(e.r2)], ['Wochen', NF0.format(e.n)]]);
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
  return card('Preisuntergrenze und Obergrenze', 'Unter den NPC-Preis fällt ein Item nicht lange, weil dann jeder an den NPC verkauft. Nach oben begrenzt das Craften: Liegen die Craft-Kosten mit Instabuy unter dem Sofort-Verkaufspreis, ist das risikofreier Gewinn und wird sofort ausgenutzt (harte Grenze). Mit Buy-Orders ist Craften billiger, braucht aber Zeit, bis die Orders gefüllt sind (weiche Grenze).', facts(rows) + verdict);
}

/* --- Inflation --- */
function inflationHTML(I){
  const A = I.A; if (!A.spi) return card('Inflation und realer Preis', '', '<p class="loading">Index lädt …</p>');
  const real = (c, m) => c == null || m == null ? null : (1 + c) / (1 + m) - 1;
  return card('Inflation und realer Preis', 'Steigt ein Item um 5 %, während alles um 7 % teurer wird, ist es real billiger geworden. Beta zeigt, wie stark das Item mit dem Gesamtmarkt mitgeht: 1 heißt im Gleichschritt, 0 heißt unabhängig.',
    `<table class="mk-mini"><thead><tr><th class="l nosort"></th><th class="nosort">Item</th><th class="nosort">Preisindex</th><th class="nosort">real</th></tr></thead><tbody>
      ${[['30 Tage', A.c30, A.m30], ['90 Tage', A.c90, A.m90], ['1 Jahr', A.c365, A.m365]].map(([l, c, m]) => `<tr class="static"><td class="l">${l}</td><td>${PC(c)}</td><td>${PC(m)}</td><td>${PC(real(c, m))}</td></tr>`).join('')}</tbody></table>`
    + facts([['Beta zum Markt', A.beta ? NF2.format(A.beta.b) + ` <small>(${NF2.format(A.beta.lo)} bis ${NF2.format(A.beta.hi)})</small>` : '–'], ['Korrelation', A.beta ? NF2.format(A.beta.r) : '–']]));
}

/* --- Marktstruktur --- */
function hhiWord(h){ return h == null ? '–' : h < .15 ? 'viel Wettbewerb' : h < .25 ? 'mäßig konzentriert' : 'stark konzentriert'; }
function structureHTML(I){
  if (I.k.bz){
    const p = S.products[I.id]; if (!p) return card('Marktstruktur und Wettbewerb', '', '<p class="loading">Live-Daten laden …</p>');
    const b = E.book(p), q = p.quick_status || {};
    return card('Marktstruktur und Wettbewerb', 'Viele kleine Orders auf vielen Preisstufen heißen: niemand bestimmt den Preis. Steht ein Großteil der Menge in einer einzigen Stufe, kann ein einzelner Spieler den Preis halten oder drücken.',
      facts([['Buy-Orders gesamt', NF0.format(q.sellOrders || 0)], ['Sell-Offers gesamt', NF0.format(q.buyOrders || 0)], ['Ø Größe Buy-Order (sichtbar)', b.d.avgOrder ? fmt(b.d.avgOrder) + ' Stück' : '–'], ['Ø Größe Sell-Offer (sichtbar)', b.s.avgOrder ? fmt(b.s.avgOrder) + ' Stück' : '–'],
        ['HHI Nachfrage', b.d.hhi != null ? `${NF2.format(b.d.hhi)} <small>${hhiWord(b.d.hhi)}</small>` : '–'], ['HHI Angebot', b.s.hhi != null ? `${NF2.format(b.s.hhi)} <small>${hhiWord(b.s.hhi)}</small>` : '–'],
        ['Größte Preisstufe Nachfrage', b.d.topShare != null ? P(b.d.topShare, false) + ' der Menge' : '–'], ['Größte Preisstufe Angebot', b.s.topShare != null ? P(b.s.topShare, false) + ' der Menge' : '–']]));
  }
  const s = I.ah && I.ah.sold;
  return card('Marktstruktur und Wettbewerb', 'Kommen die Verkäufe von vielen verschiedenen Spielern, herrscht Wettbewerb. Verkauft fast nur einer, bestimmt er den Preis.',
    s ? facts([['Verschiedene Verkäufer', NF0.format(s.sellers)], ['Anteil des größten Verkäufers', P(s.top, false)], ['HHI der Verkäufer', `${NF2.format(s.hhi)} <small>${hhiWord(s.hhi)}</small>`]]) : '<p class="note">Keine Verkäufe erfasst.</p>');
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
    seg + facts([['Herstellkosten pro Stück', price(per)], ['Rezept ergibt', c.cnt + ' Stück'], ['Kaufpreis jetzt', buy ? price(buy) : '–']]) + v + treeHTML(c));
}
function ahFee(p){ return (p < 10e6 ? .01 : p < 100e6 ? .02 : .025) + (p > 1e6 ? .01 : 0); }
function contributionHTML(I){
  const c = craftResult(I, 'order'), mp = marketPrice(I);
  if (!c || !mp) return card('Deckungsbeitrag beim Herstellen', '', '<p class="note">Braucht ein Rezept und einen Marktpreis.</p>');
  const sellPx = I.k.bz ? Math.round((mp.buy - .1) * 10) / 10 : mp.buy, fee = I.k.bz ? BZ_TAX() : ahFee(mp.buy);
  const rev = sellPx * (1 - fee), db = rev - c.craft, be = c.craft / (1 - fee);
  return card('Deckungsbeitrag beim Herstellen', I.k.bz ? `Verkauf per Sell-Offer knapp unter dem Instabuy-Preis, minus ${NF2.format(fee * 100)} % Bazaar-Steuer. Variable Kosten: Zutaten per Buy-Order.` : 'Verkauf zum Lowest BIN, minus Auction-House-Gebühren (1 % bis 10 Mio., 2 % bis 100 Mio., 2,5 % darüber, plus 1 % Abholgebühr über 1 Mio.).',
    facts([['Erlös pro Stück nach Gebühren', price(rev)], ['Variable Kosten pro Stück', price(c.craft)], ['Deckungsbeitrag pro Stück', `<span class="${cls(db)}">${price(db)}</span>`], ['Deckungsbeitrag in % vom Erlös', P(db / rev)], ['Break-even-Verkaufspreis', price(be)], ['Abstand zum Break-even', P(sellPx / be - 1)]]));
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
    + facts([['Einkauf per Buy-Order', price(r.buyAt)], ['Verkauf per Sell-Offer', price(r.sellAt)], ['Deckungsbeitrag pro Stück', `<span class="${cls(profit)}">${price(profit)}</span>`], ['Menge pro Durchlauf', NF0.format(Q)],
      ['Gebundenes Kapital', fmt(cap)], ['Dauer pro Durchlauf', cyc.Tused ? dur(cyc.Tused) : '–'], ['Kapitalumschlag pro Tag', perDay ? NF1.format(perDay) + '×' : '–'], ['Rendite pro Durchlauf', P(roiC)], ['Rendite pro Tag', `<span class="${cls(roiD)}">${P(roiD)}</span>`]]));
}
function riskHTML(I){
  const A = I.A;
  return card('Risiko', 'Wer Ware auf Lager hat, trägt das Preisrisiko. Value at Risk: so viel ging an einem schlechten Tag (1 von 20) mindestens verloren. Drawdown: der größte Absturz vom Hoch im letzten Jahr.',
    facts([['Schwankung pro Tag', A.vol != null ? P(A.vol, false) : '–'], ['Schwankung pro Monat', A.vol != null ? P(A.vol * Math.sqrt(30), false) : '–'], ['Value at Risk (95 %, 1 Tag)', A.risk ? P(A.risk.VaR, false) : '–'], ['Expected Shortfall', A.risk ? P(A.risk.ES, false) : '–'],
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
    facts([['Gegenüber Median 30 Tage', z ? PC(z.vsMedian) : '–'], ['z-Wert (30 Tage)', z ? NF2.format(z.z) : '–'], ['Einordnung', word], ['Spanne im letzten Jahr', A.min1y ? `${fmt(A.min1y)} bis ${fmt(A.max1y)}` : '–'], ['Billiger als heute war es an', A.pctl != null ? P(A.pctl, false) + ' der Tage' : '–']]));
}
function lifecycleHTML(I){
  const A = I.A, l = A.life;
  return card('Produktlebenszyklus', 'Faustregel aus dem Alter des Items und der Entwicklung der gehandelten Menge (letzte 90 Tage gegenüber den 90 davor).', facts([['Phase', esc(l.stage)], ['Begründung', esc(l.why)]]));
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

/* =========================================================
   Eingaben
   ========================================================= */
document.addEventListener('click', e => {
  if (S.tool !== 'markt') return;
  const t = e.target, q = s => t.closest(s); let el;
  if ((el = q('[data-mkitem]'))){ e.preventDefault(); nav('markt/item/' + encodeURIComponent(el.dataset.mkitem)); return; }
  if ((el = q('[data-mksec]'))){ K.list.sec = el.dataset.mksec; K.list.preset = null; K.list.page = 0; nav('markt/items'); return; }
  if ((el = q('[data-mkpreset]'))){ const k = el.dataset.mkpreset, p = PRESETS[k]; if (K.list.preset === k){ K.list.preset = null; K.list.sort = 'to'; K.list.dir = -1; } else { K.list.preset = k; K.list.sort = p.sort; K.list.dir = p.dir; } K.list.page = 0; if (K.tab !== 'items') nav('markt/items'); else { document.querySelectorAll('[data-mkpreset]').forEach(b => b.classList.toggle('on', b.dataset.mkpreset === K.list.preset)); drawList(); } return; }
  if ((el = q('[data-mkmkt]'))){ K.list.mkt = el.dataset.mkmkt; K.list.page = 0; document.querySelectorAll('[data-mkmkt]').forEach(b => b.classList.toggle('on', b === el)); drawList(); return; }
  if ((el = q('[data-mksort]'))){ const k = el.dataset.mksort; if (K.list.sort === k) K.list.dir *= -1; else { K.list.sort = k; K.list.dir = k === 'name' ? 1 : -1; } K.list.page = 0; drawList(); return; }
  if ((el = q('[data-mkpg]'))){ K.list.page = Math.max(0, K.list.page + +el.dataset.mkpg); drawList(); window.scrollTo({top: 0}); return; }
  if ((el = q('[data-mkclear]'))){ K.list.q = ''; const s = $('#msearch'); if (s){ s.value = ''; s.parentElement.classList.remove('has'); s.focus(); } drawList(); return; }
  if ((el = q('[data-mkrange]'))){ K.idx.range = +el.dataset.mkrange; document.querySelectorAll('[data-mkrange]').forEach(b => b.classList.toggle('on', b === el)); feedIndexChart(); return; }
  if ((el = q('[data-mirange]'))){ K.itRange = el.dataset.mirange; document.querySelectorAll('[data-mirange]').forEach(b => b.classList.toggle('on', b === el)); feedItemChart(); return; }
  if ((el = q('[data-mkmayor]'))){ K.mayorSel = el.dataset.mkmayor; redraw(); const m = $('.mk-mf'); if (m) m.scrollIntoView({block: 'nearest', behavior: 'smooth'}); return; }
  if ((el = q('[data-mitab]'))){ K.itTab = el.dataset.mitab; drawItem(true); return; }
  if ((el = q('[data-mkmob]'))){ K.mob = el.dataset.mkmob; drawItem(false); return; }
  if ((el = q('[data-mkcopy]'))){ const txt = el.dataset.mkcopy; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => { el.textContent = 'Kopiert'; setTimeout(() => el.textContent = 'Name kopieren', 1500); }).catch(() => {}); return; }
});
document.addEventListener('change', e => {
  if (S.tool !== 'markt') return;
  const t = e.target;
  if (t.dataset.mkopt){ K.idx[t.dataset.mkopt] = t.checked; feedIndexChart(); }
  else if (t.dataset.miopt){ K[t.dataset.miopt === 'bands' ? 'itBands' : 'itMarks'] = t.checked; feedItemChart(); }
  else if (t.hasAttribute('data-mkcmp')){ K.idx.cmp = t.value; feedIndexChart(); }
  else if (t.hasAttribute('data-mksecsel')){ K.list.sec = t.value; K.list.page = 0; drawList(); }
  else if (t.dataset.mkcalc){
    const v = parseCoins(t.value.replace('%', ''));
    const ok = isFinite(v) && v > 0 && (t.dataset.mkcalc !== 'share' || v <= 100);
    if (ok){ K.calc[t.dataset.mkcalc] = v; try{ localStorage.setItem('mk:calc', JSON.stringify(K.calc)); }catch{} drawItem(false); }
    else { t.parentElement.classList.add('bad'); setTimeout(() => t.parentElement.classList.remove('bad'), 1200); }
  }
});
document.addEventListener('input', e => {
  if (S.tool !== 'markt' || e.target.id !== 'msearch') return;
  K.list.q = e.target.value; K.list.page = 0; e.target.parentElement.classList.toggle('has', !!e.target.value); drawList();
});
document.addEventListener('keydown', e => {
  if (S.tool !== 'markt') return;
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.mkcalc){ e.target.blur(); return; }
  if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)){ const s = $('#msearch'); if (s){ e.preventDefault(); s.focus(); } }
});

function hubMeta(){ return ''; }
function openCategory(k){ K.list.sec = k; K.list.preset = null; K.list.q = ''; K.list.page = 0; nav('markt/items'); }
// Für die Startseite (oberste Ebene): Daten laden und lesen, ohne die Seiten der Markt-Analyse
function ensure(){ return Promise.allSettled([loadMD(), loadPx(), loadLive(), loadHy().then(() => loadColl()), loadCat()]); }
function data(){ const m = curMayor(); return {md: K.md, px: K.px, pxErr: K.pxErr, mdErr: K.mdErr, mayor: m, mayorEnd: m && m.term ? m.term.end : nextMayorChange(Date.now()), election: K.election, fires: K.fires, pxAge: pxAge()}; }
window.Markt = {render, mount, update, leave, pageTitle, hubMeta, ensure, data, nm, catOf, secLabel, universe, ahFee, openCategory, _K: K, _analyze: analyze, _bzPoints: bzPoints, _ahPoints: ahPoints};
if (S.tool === 'markt') renderMain(true);
})();
