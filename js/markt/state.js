'use strict';
/* =========================================================
   Markt-Analyse – jedes SkyBlock-Item volks- und betriebswirtschaftlich
   Nutzt aus core/ und bazaar/: S (Live-Bazaar), RECIPES, Formatierer (fmt, price, pct, esc, …), nav, renderMain.
   Rechnet mit js/lib/econ.js. Tagesdaten aller Bazaar-Items kommen aus market.json (GitHub Action).
   ========================================================= */

const E = window.Econ, DAY = E.DAY;
const MD_URL = CFG.data + 'market.json';
const COFL_API = CFG.cofl, HY = CFG.hypixel;
const BZ_TAX = () => (S.set.tax || 1.25) / 100;
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
const PX_URL = CFG.data + 'prices.json';

/* ---------- Zustand ---------- */
const K = {
  md: null, mdErr: null, mdP: null,
  hy: null, hyP: null, catalog: null, catMap: null, catP: null, coll: null, collP: null, catFn: null, px: null, pxP: null, pxErr: null,
  election: null, fires: null, liveP: null,
  chart: null, timer: null,
  list: {q: '', mkt: 'all', sec: 'all', sort: 'to', dir: -1, page: 0, preset: null},
  idx: {range: 365, bands: true, marks: true, cmp: ''},
  it: null, itTab: 'forecast', fcSide: null, fcView: 31, fcTarget: '', itRange: '1y', itBands: true, itMarks: true, mob: 'order', calc: {budget: 10e6, share: 10},
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
  return K.catP = getJSON(COFL_API + 'items', 6 * 3600e3).then(a => { K.catalog = Array.isArray(a) ? a : []; K.catMap = {}; for (const x of K.catalog) K.catMap[x.tag] = x; return K.catalog; });
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
// Kategorie: dieselbe Einteilung wie in der Tagesdaten-Pipeline (js/lib/categories.js)
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
