'use strict';
/* =========================================================
   TOOLS – der Startbildschirm listet jedes Tool auf.
   Neues Tool: Eintrag ergänzen (id, title, desc, tabs, defaultTab)
   und die Seiten als Funktionen schreiben, die HTML zurückgeben.
   ========================================================= */
const BAZAAR_TABS = [
  {id:'overview', label:'Übersicht'},
  {id:'flips',    label:'Flips'},
  {id:'crafts',   label:'Craft-Flips'},
  {id:'npc',      label:'NPC-Flips'},
  {id:'market',   label:'Markt'},
  {id:'watch',    label:'Watchlist'},
  {id:'settings', label:'Einstellungen'},
];
const TOOLS = [
  {id:'bazaar', title:'Bazaar Flipper',
   desc:'Live-Flips mit Buy-Orders, Craft-Flips nur über den Bazaar, NPC-Flips, Marktübersicht und Preis-Alarme.',
   tabs: BAZAAR_TABS, defaultTab:'overview'},
];
const TOOL = Object.fromEntries(TOOLS.map(t => [t.id, t]));

/* =========================================================
   Konstanten & Zustand
   ========================================================= */
const API = 'https://api.hypixel.net/v2/skyblock/bazaar';
const ITEMS_API = 'https://api.hypixel.net/v2/resources/skyblock/items';
const MAX_ORDER = 71680;
const HOUR = 3600e3;
const LS = 'bzt:';

const DEFAULTS = {
  interval: 20, tax: 1.25, budget: 10_000_000, share: 10,
  preset: 'balanced',
  minVolH: 100, minTurnH: 2_000_000, minBalance: 30,
  minProfit: 1, minPct: 2, maxPct: 50, maxMove: 10, hideRisky: true,
  craftBuy: 'order', craftSell: 'offer', craftMinProfit: 0, craftMinPct: 3,
  marketLiquidOnly: false,
  retentionH: 48, pageSize: 50, sound: true, theme: 'system',
};
// Strategien: setzen alle Nachfrage-, Margen- und Stabilitätsfilter auf einen Schlag.
//  Sicher     – Orders füllen sich in Minuten, Preise stabil, dafür kleine Margen
//  Ausgewogen – gefragte Items mit spürbarer Marge
//  Riskant    – auch langsame/schwankende Items, aber nur wenn die Marge das Risiko bezahlt
const PRESETS = {
  safe:     {label:'Sicher', desc:'Sehr gefragte, stabile Items. Orders füllen sich schnell, Margen sind klein.',
             minVolH: 500, minTurnH: 10_000_000, minBalance: 50, minPct: 1, maxPct: 20,  craftMinPct: 2, maxMove: 5,    hideRisky: true},
  balanced: {label:'Ausgewogen', desc:'Gefragte Items mit spürbarer Marge – der beste Mix aus Tempo und Gewinn.',
             minVolH: 100, minTurnH: 2_000_000,  minBalance: 30, minPct: 2, maxPct: 50,  craftMinPct: 3, maxMove: 10,   hideRisky: true},
  risky:    {label:'Riskant', desc:'Auch langsame oder schwankende Items – dafür muss die Marge hoch sein.',
             minVolH: 10,  minTurnH: 250_000,    minBalance: 10, minPct: 5, maxPct: 300, craftMinPct: 5, maxMove: 1000, hideRisky: false},
};
const PRESET_KEYS = ['minVolH','minTurnH','minBalance','minPct','maxPct','craftMinPct','maxMove','hideRisky'];
// Klartext der Kriterien einer Strategie (für das Filter-Panel)
function presetRules(p){
  return [
    `mind. <b>${fmt(p.minVolH)}</b> Stück/h auf beiden Seiten`,
    `mind. <b>${fmt(p.minTurnH)}</b> Coins Umsatz/h`,
    `schwächere Seite ≥ <b>${p.minBalance} %</b> der stärkeren`,
    `Marge <b>${NF1.format(p.minPct)}–${NF0.format(p.maxPct)} %</b> (Craft ≥ ${NF1.format(p.craftMinPct)} %)`,
    p.maxMove >= 1000 ? 'Preisschwankung egal' : `Preis in der letzten Stunde max. <b>±${NF1.format(p.maxMove)} %</b> bewegt`,
    p.hideRisky ? 'Items mit Warnhinweis ausgeblendet' : 'Items mit Warnhinweis werden gezeigt',
  ];
}

// Schieberegler mit festen, sinnvollen Stufen
const SLIDERS = {
  share:       {label:'Dein Anteil am Volumen', steps:[1,2,3,5,7.5,10,15,20,25,35,50], f: v => NF1.format(v) + ' %', hint:'Wie viel vom stündlichen Handel du realistisch abbekommst.'},
  minVolH:     {label:'Min. Stück pro Stunde', steps:[0,10,25,50,100,250,500,1000,2500,5000,10000], f: v => v ? fmt(v) + ' / h' : 'aus', hint:'Auf beiden Seiten – Instabuys und Instasells.'},
  minTurnH:    {label:'Min. Umsatz pro Stunde', steps:[0,250e3,500e3,1e6,2e6,5e6,10e6,25e6,50e6,100e6], f: v => v ? fmt(v) + ' Coins' : 'aus', hint:'Coins, die pro Stunde auf beiden Seiten umgesetzt werden.'},
  minBalance:  {label:'Ausgeglichenheit', steps:[0,5,10,15,20,25,30,40,50,60,75], f: v => v ? 'ab ' + v + ' %' : 'aus', hint:'Die schwächere Seite braucht mind. so viel % der stärkeren.'},
  minPct:      {label:'Min. Marge', steps:[0,0.5,1,1.5,2,3,4,5,7.5,10,15,20], f: v => NF1.format(v) + ' %'},
  craftMinPct: {label:'Min. Marge pro Craft', steps:[0,0.5,1,1.5,2,3,4,5,7.5,10,15,20], f: v => NF1.format(v) + ' %'},
  maxPct:      {label:'Max. Marge', steps:[10,20,30,50,75,100,150,200,300,500], f: v => NF0.format(v) + ' %', hint:'Höhere Margen sind oft Manipulation oder kaum gehandelt.'},
  maxMove:     {label:'Max. Preisbewegung (1 h)', steps:[1,2,3,5,7.5,10,15,25,50,1000], f: v => v >= 1000 ? 'aus' : '±' + NF1.format(v) + ' %', hint:'Blendet Items aus, deren Preis gerade stark springt.'},
  interval:    {label:'Aktualisierung alle', steps:[10,15,20,30,45,60,120], f: v => v + ' s', hint:'Hypixel aktualisiert den Bazaar etwa alle 20 Sekunden.'},
};

function load(k, d){ try{ const v = localStorage.getItem(LS+k); return v ? JSON.parse(v) : d; }catch{ return d; } }
function save(k, v){ try{ localStorage.setItem(LS+k, JSON.stringify(v)); }catch{} }

const S = {
  set: {},
  products: {}, rows: [], byId: {}, crafts: [],
  names: {}, npc: {}, tiers: {},
  hist: {},
  lastUpdated: 0, lastFetch: 0, nextAt: 0, paused: false, timer: null, state: 'load', banner: '',
  tool: null, tab: 'overview',
  sort: {},
  pageNo: {}, search: '', drawer: false,
  watch: [], alerts: [],
  detail: null, craftDetail: null, itemId: null, mchart: null, achart: null,
  prevPrice: {}, lastSave: Date.now(), sessionStart: Date.now(), polls: 0,
};
const DEFAULT_SORT = {flips:{k:'pph',d:-1}, crafts:{k:'pph',d:-1}, market:{k:'wVol',d:-1}, npc:{k:'npcTotal',d:-1}};
// Eingaben dieses Browsers laden
function applyState(d){
  S.set = Object.assign({}, DEFAULTS, d.settings || {});
  if (S.set.preset === 'aggressive') S.set.preset = 'risky';           // alte Bezeichnung
  if (S.set.preset in PRESETS && S.set.maxMove == null) Object.assign(S.set, pick(PRESETS[S.set.preset], PRESET_KEYS));
  S.watch = Array.isArray(d.watch) ? d.watch : [];
  S.alerts = Array.isArray(d.alerts) ? d.alerts : [];
  S.sort = Object.assign({}, DEFAULT_SORT, d.sort || {});
}
/* Hell / Dunkel: 'system' folgt der Einstellung des Geräts */
const darkMQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
function resolvedTheme(){ return S.set.theme === 'system' ? (darkMQ && darkMQ.matches ? 'dark' : 'light') : S.set.theme; }
const THEME_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor"/></svg>';
function themeBtnInner(){ return THEME_ICON + `<span class="hidem">${resolvedTheme() === 'dark' ? 'Hell' : 'Dunkel'}</span>`; }
function applyTheme(){
  const t = resolvedTheme();
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'dark' ? '#191e1c' : '#f7f7f4';
  if (S.mchart) S.mchart.draw(); if (S.achart) S.achart.draw();
  const b = document.querySelector('[data-act=theme]');
  if (b){ b.innerHTML = themeBtnInner(); b.title = t === 'dark' ? 'Hellen Modus einschalten' : 'Dunkelmodus einschalten'; b.setAttribute('aria-label', b.title); }
}
if (darkMQ) darkMQ.addEventListener('change', () => { if (S.set.theme === 'system') applyTheme(); });
function loadLocalState(){ applyState({settings: load('settings', {}), watch: load('watch', []), alerts: load('alerts', []), sort: load('sort', {})}); }
function pick(o, keys){ const r = {}; for (const k of keys) r[k] = o[k]; return r; }
loadLocalState();
applyTheme();

/* =========================================================
   Formatierung
   ========================================================= */
const nf = (d=1, min=0) => new Intl.NumberFormat('de-AT', {maximumFractionDigits:d, minimumFractionDigits:min});
const NF0 = nf(0), NF1 = nf(1), NF1f = nf(1,1), NF2 = nf(2);
function fmt(n){
  if (n == null || !isFinite(n)) return '–';
  const a = Math.abs(n);
  if (a >= 1e9) return NF2.format(n/1e9) + '\u00a0B';
  if (a >= 1e6) return NF2.format(n/1e6) + '\u00a0M';
  if (a >= 1e4) return NF1.format(n/1e3) + '\u00a0k';
  if (a >= 100) return NF0.format(n);
  return NF1.format(n);
}
function price(n){ return (n == null || !isFinite(n) || n === 0) ? '–' : (Math.abs(n) >= 1e9 ? fmt(n) : NF1f.format(n)); }
function pct(n, sign=true){ if (n == null || !isFinite(n)) return '–'; return (sign && n > 0 ? '+' : '') + NF1.format(n) + '\u00a0%'; }
function cls(n){ return n > 0 ? 'pos' : n < 0 ? 'neg' : 'mut'; }
function ago(ms){ const s = Math.round(ms/1000); if (s < 60) return s + ' s'; const m = Math.round(s/60); if (m < 60) return m + ' min'; return NF1.format(m/60) + ' h'; }
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const r1 = n => Math.round(n*10)/10;

const ROMAN = ['','I','II','III','IV','V','VI','VII','VIII','IX','X'];
const title = s => s.toLowerCase().split(/[_ ]+/).filter(Boolean).map(w => w[0].toUpperCase()+w.slice(1)).join(' ');
function pretty(id){
  if (S.names[id]) return S.names[id];
  let m;
  if ((m = id.match(/^ENCHANTMENT_(.+)_(\d+)$/))) return title(m[1]) + ' ' + (ROMAN[+m[2]] || m[2]);
  if (id.startsWith('ESSENCE_')) return title(id.slice(8)) + ' Essence';
  if (id.startsWith('SHARD_')) return title(id.slice(6)) + ' Shard';
  return title(id.replace(/:/g, ' '));
}
// Seltenheitsfarben, abgestimmt auf hellen Hintergrund
const RARITY = {COMMON:'#9aa19c', UNCOMMON:'#3c9a5b', RARE:'#3a5fc8', EPIC:'#8a46b8', LEGENDARY:'#c4870f', MYTHIC:'#c23f9e', DIVINE:'#1f9bb3', SPECIAL:'#c24545', VERY_SPECIAL:'#c24545'};
function rarityColor(id){
  if (S.tiers[id]) return RARITY[S.tiers[id]] || RARITY.COMMON;
  if (id.startsWith('ENCHANTMENT_ULTIMATE')) return RARITY.MYTHIC;
  if (id.startsWith('ENCHANTMENT_')) return '#6f86c9';
  if (id.startsWith('ESSENCE_')) return RARITY.EPIC;
  return RARITY.COMMON;
}
function itemCell(id, name, sub, risk){
  return `<div class="item"><i class="rar" style="--rc:${rarityColor(id)}"></i><div class="txt"><div class="nm" title="${esc(name)}">${esc(name)}${risk && risk.length ? `<span class="warn" title="${esc(risk.join('\n'))}">!</span>` : ''}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`;
}

/* =========================================================
   Persistenter Verlauf (IndexedDB)
   ========================================================= */
const DB = {
  db: null,
  open(){ return new Promise(res => {
    try{
      const r = indexedDB.open('bazaar-tracker', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('hist');
      r.onsuccess = () => { this.db = r.result; res(true); };
      r.onerror = () => res(false);
    }catch{ res(false); }
  });},
  loadAll(){ return new Promise(res => {
    if (!this.db) return res({});
    const out = {};
    try{
      const rq = this.db.transaction('hist').objectStore('hist').openCursor();
      rq.onsuccess = () => { const c = rq.result; if (c){ out[c.key] = c.value; c.continue(); } else res(out); };
      rq.onerror = () => res(out);
    }catch{ res(out); }
  });},
  saveAll(h){ return new Promise(res => {
    if (!this.db) return res();
    try{
      const tx = this.db.transaction('hist', 'readwrite'), st = tx.objectStore('hist');
      for (const k in h) st.put(h[k], k);
      tx.oncomplete = tx.onerror = tx.onabort = () => res();
    }catch{ res(); }
  });},
  clear(){ return new Promise(res => {
    if (!this.db) return res();
    const tx = this.db.transaction('hist', 'readwrite'); tx.objectStore('hist').clear();
    tx.oncomplete = tx.onerror = () => res();
  });},
};
function pushHist(id, t, b, s){
  let h = S.hist[id];
  if (!h) h = S.hist[id] = {t:[], b:[], s:[]};
  if (h.t.length && h.t[h.t.length-1] >= t) return;
  h.t.push(t); h.b.push(b); h.s.push(s);
}
function compact(h, now){
  const fine = now - HOUR, ret = now - S.set.retentionH*HOUR;
  const t=[], b=[], s=[]; let lastBk = -1;
  for (let i = 0; i < h.t.length; i++){
    const ti = h.t[i];
    if (ti < ret) continue;
    if (ti < fine){
      const bk = Math.floor(ti / 300e3);
      if (bk === lastBk){ t[t.length-1] = ti; b[b.length-1] = h.b[i]; s[s.length-1] = h.s[i]; continue; }
      lastBk = bk;
    }
    t.push(ti); b.push(h.b[i]); s.push(h.s[i]);
  }
  h.t = t; h.b = b; h.s = s;
}
function valueAt(h, time, key){
  if (!h || !h.t.length) return null;
  if (h.t[0] > time) return (h.t[h.t.length-1] - h.t[0] >= 300e3) ? h[key][0] : null;
  let lo = 0, hi = h.t.length-1;
  while (lo < hi){ const mid = (lo+hi+1) >> 1; if (h.t[mid] <= time) lo = mid; else hi = mid-1; }
  return h[key][lo];
}
function median(arr){
  const a = arr.filter(x => x > 0).sort((x,y) => x-y);
  return a.length ? a[a.length >> 1] : null;
}
function histPoints(){ let n = 0; for (const k in S.hist) n += S.hist[k].t.length; return n; }

/* =========================================================
   Item-Namen & NPC-Preise
   ========================================================= */
async function loadItems(){
  const cached = load('items', null);
  if (cached && Date.now() - cached.t < 24*HOUR){ applyItems(cached); return; }
  try{
    const r = await fetch(ITEMS_API, {cache:'no-store'});
    const j = await r.json();
    if (!j.success) return;
    const names = {}, npc = {}, tiers = {};
    for (const it of j.items){
      names[it.id] = String(it.name || '').replace(/§./g, '');
      if (it.npc_sell_price) npc[it.id] = it.npc_sell_price;
      if (it.tier) tiers[it.id] = it.tier;
    }
    const obj = {t: Date.now(), names, npc, tiers};
    applyItems(obj); save('items', obj);
  }catch(e){ console.warn('Items konnten nicht geladen werden', e); }
}
function applyItems(o){ S.names = o.names || {}; S.npc = o.npc || {}; S.tiers = o.tiers || {}; }

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
  S.nextAt = Date.now() + S.set.interval*1000;
  S.timer = setTimeout(poll, S.set.interval*1000);
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
  const qty = Math.floor(Math.min(maxQty, perHour * S.set.share/100));
  const pph = profit > 0 ? profit * qty : 0;
  const spreadPct = topBuy ? (topSell - topBuy) / topBuy * 100 : 0;
  const npc = S.npc[id] || 0;
  const npcInsta = npc && topSell ? npc - topSell : 0;
  const npcOrder = npc && buyAt ? npc - buyAt : 0;
  const npcQty = npcOrder > 0 ? Math.floor(Math.min(S.set.budget / buyAt, wSell / 168 * S.set.share/100 * 24)) : 0;
  return {
    id, name: pretty(id), topBuy, topSell, buyAt, sellAt, profit, marginPct, wBuy, wSell, wVol: wBuy + wSell,
    perHour, turnH, balance, maxQty, qty, pph, spreadPct,
    buyOrders: qs.buyOrders || 0, sellOrders: qs.sellOrders || 0,
    topBuyOrders: bo ? bo.orders : 0, topSellOrders: so ? so.orders : 0,
    npc, npcInsta, npcOrder, npcQty, npcTotal: npcOrder > 0 ? npcOrder * npcQty : 0,
    risk: [], d1h: null, d24h: null,
  };
}
function assess(r){
  const h = S.hist[r.id];
  const now = S.lastUpdated || Date.now();
  if (h && h.t.length){
    const s1 = valueAt(h, now - HOUR, 's'), s24 = valueAt(h, now - 24*HOUR, 's');
    r.d1h = s1 ? (r.topSell - s1) / s1 * 100 : null;
    r.d24h = s24 ? (r.topSell - s24) / s24 * 100 : null;
    if (h.t.length >= 20){
      const ms = median(h.s.slice(-400)), mb = median(h.b.slice(-400));
      if (ms && r.topSell > ms * 2.5) r.risk.push('Sell-Preis liegt weit über dem bisherigen Median (' + price(ms) + ') – mögliche Manipulation');
      if (mb && r.topBuy && r.topBuy < mb * 0.4) r.risk.push('Buy-Order-Preis ist eingebrochen (Median ' + price(mb) + ')');
    }
  }
  if (r.perHour < 5) r.risk.push('Sehr wenig Volumen – Orders füllen sich nur langsam');
  if (r.marginPct > 100) r.risk.push('Extreme Marge – oft Manipulation oder kaum Handel');
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
// Preis hat sich in der letzten Stunde nicht stärker bewegt als erlaubt (ohne Verlauf: ok)
function stable(r){ return S.set.maxMove >= 1000 || r.d1h == null || Math.abs(r.d1h) <= S.set.maxMove; }
function filteredFlips(ignoreSearch){
  const s = S.set;
  return S.rows.filter(r =>
    r.profit >= s.minProfit && r.marginPct >= s.minPct && r.marginPct <= s.maxPct &&
    liquid(r) && stable(r) && r.buyAt > 0 && r.buyAt <= s.budget &&
    (!s.hideRisky || !r.risk.length) && (ignoreSearch || matchSearch(r)));
}

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
    let craftsH = (s.craftSell === 'offer' ? o.wBuy : o.wSell) / 168 / cnt, limiting = oid;
    const parts = [];
    for (const id in ins){
      const r = S.byId[id], q = ins[id];
      if (!r || !r.topBuy || !r.topSell){ ok = false; break; }
      const unit = s.craftBuy === 'insta' ? r.topSell : r.buyAt;
      cost += unit * q; costInsta += r.topSell * q;
      const rate = (s.craftBuy === 'insta' ? r.wBuy : r.wSell) / 168 / q;
      if (rate < craftsH){ craftsH = rate; limiting = id; }
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
    const qty = Math.floor(Math.min(maxCrafts, craftsH * share));
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

/* =========================================================
   Alarme
   ========================================================= */
const CONDS = {
  sell_below:   {label:'Instabuy ≤',   get: r => r.topSell, test: (v,x) => v > 0 && v <= x},
  sell_above:   {label:'Instabuy ≥',   get: r => r.topSell, test: (v,x) => v >= x},
  buy_above:    {label:'Instasell ≥',  get: r => r.topBuy,  test: (v,x) => v >= x},
  buy_below:    {label:'Instasell ≤',  get: r => r.topBuy,  test: (v,x) => v > 0 && v <= x},
  margin_above: {label:'Flip-Gewinn/Stk ≥', get: r => r.profit, test: (v,x) => v >= x},
};
function checkAlerts(){
  const now = Date.now(); let changed = false;
  for (const a of S.alerts){
    const r = S.byId[a.id], c = CONDS[a.cond];
    if (!r || !c) continue;
    const v = c.get(r);
    if (c.test(v, a.value) && (!a.last || now - a.last > 10*60e3)){
      a.last = now; changed = true;
      notify(r.name, c.label + ' ' + price(a.value) + ' — aktuell ' + price(v), a.id);
    }
  }
  if (changed) save('alerts', S.alerts);
}
function notify(head, body, id){
  toast('<b>' + esc(head) + '</b><br>' + esc(body), id);
  if (S.set.sound) beep();
  try{ if ('Notification' in window && Notification.permission === 'granted') new Notification('Bazaar: ' + head, {body}); }catch{}
}
let actx = null;
function beep(){
  try{
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'triangle'; o.frequency.value = 880;
    g.gain.setValueAtTime(.0001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.25, actx.currentTime + .02);
    g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + .4);
    o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + .42);
  }catch{}
}
function toast(html, id){
  const el = document.createElement('div');
  el.className = 'toast'; el.innerHTML = html;
  el.onclick = () => { el.remove(); if (id) openDetail(id); };
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 12000);
}

/* =========================================================
   Eingaben: Coins mit Kurzschreibweise (10m, 2,5k, 1.2b)
   ========================================================= */
function parseCoins(str){
  if (str == null) return NaN;
  let s = String(str).trim().toLowerCase().replace(/\s|coins?/g, '');
  if (!s) return NaN;
  const m = s.match(/^([0-9.,]+)([kmb]?)$/);
  if (!m) return NaN;
  let num = m[1];
  // "1.000.000" (Tausenderpunkte) vs "2,5" / "2.5" (Dezimal)
  if (/^\d{1,3}(\.\d{3})+$/.test(num)) num = num.replace(/\./g, '');
  else if (/^\d{1,3}(,\d{3})+$/.test(num) && !m[2]) num = num.replace(/,/g, '');
  else num = num.replace(',', '.');
  const v = parseFloat(num);
  if (!isFinite(v)) return NaN;
  return v * ({k:1e3, m:1e6, b:1e9}[m[2]] || 1);
}
function coinText(v){
  if (!isFinite(v)) return '';
  if (v >= 1e9 && v % 1e7 === 0) return NF2.format(v/1e9).replace(/,00$/, '') + 'b';
  if (v >= 1e6 && v % 1e4 === 0) return NF2.format(v/1e6).replace(/,00$/, '') + 'm';
  if (v >= 1e4 && v % 100 === 0) return NF1.format(v/1e3).replace(/,0$/, '') + 'k';
  return NF1.format(v);
}

/* =========================================================
   Rahmen: Kopfzeile, Status, Routing
   ========================================================= */
const $ = s => document.querySelector(s);
function banner(html){
  S.banner = html;
  const b = $('#banner'); if (b){ b.innerHTML = html; b.style.display = html ? 'block' : 'none'; }
}
function route(){
  const [tool, tab, ...rest] = location.hash.replace('#', '').split('/');
  const prevTab = S.tab;
  if (TOOL[tool]){
    S.tool = tool;
    if (tab === 'item' && rest.length){ S.tab = 'item'; S.itemId = decodeURIComponent(rest.join('/')); }
    else S.tab = TOOL[tool].tabs.some(t => t.id === tab) ? tab : TOOL[tool].defaultTab;
  } else { S.tool = null; }
  if (S.tab !== 'item'){ if (S.achart){ S.achart.destroy(); S.achart = null; } }
  else if (prevTab !== 'item') S.returnTo = prevTab;
  S.search = '';
  closeDrawer(); closeDetail();
  renderTop(); renderMain(true); window.scrollTo({top:0});
}
function nav(hash){ if (location.hash === '#' + hash) route(); else location.hash = hash; }

function statusEl(){ return `<span class="status" id="status"><i class="dot" id="dot"></i><span id="statusTxt">Lädt…</span></span>`; }
function renderTop(){
  const t = S.tool && TOOL[S.tool];
  $('#top').innerHTML = `<div class="bar">
      <a class="wordmark" href="#" data-nav="">SkyBlock Hub</a>
      ${t ? `<span class="sep">/</span><span class="toolname">${t.title}</span>` : ''}
      <div class="spacer"></div>
      ${statusEl()}
      <button class="btn ghost themebtn" data-act="theme">${themeBtnInner()}</button>
      ${t ? `<button class="btn ghost" id="pauseBtn">${S.paused ? 'Fortsetzen' : 'Pausieren'}</button><button class="btn" id="refreshBtn">Aktualisieren</button>` : ''}
    </div>
    ${t ? '<nav class="tabs" id="tabs"></nav>' : ''}`;
  renderTabs(); tick();
}
function renderTabs(){
  const el = $('#tabs'); if (!el) return;
  const t = TOOL[S.tool];
  const counts = S.rows.length ? {flips: filteredFlips(true).length, crafts: filteredCrafts(true).length, watch: S.watch.length} : {watch: S.watch.length};
  el.innerHTML = t.tabs.map(x => `<button class="${S.tab === x.id ? 'on' : ''}" data-tab="${x.id}">${x.label}${counts[x.id] ? `<span class="n">${counts[x.id]}</span>` : ''}</button>`).join('');
}
function tick(){
  const dot = $('#dot'), st = $('#statusTxt');
  if (!dot) return;
  let txt, state = S.state;
  if (S.state === 'err') txt = 'Hypixel antwortet nicht';
  else if (!S.lastUpdated) txt = 'Lädt…';
  else if (S.paused){ txt = 'Pausiert'; state = 'pause'; }
  else txt = 'Stand vor ' + ago(Date.now() - S.lastUpdated);
  dot.className = 'dot ' + state;
  st.textContent = txt;
}

/* Hauptbereich neu zeichnen – ohne Fokusverlust im Suchfeld */
function renderMain(force){
  const a = document.activeElement;
  if (!force && a && a.closest && a.closest('#view') && a.matches('input:not(#search), select')) return;
  // Analyse-Seite nur aktualisieren, nicht neu aufbauen (Chart und Zeichnungen bleiben)
  if (!force && S.tool && S.tab === 'item' && S.achart && S.byId[S.itemId]){ updateAnalysis(); renderTabs(); return; }
  const wasSearch = a && a.id === 'search', pos = wasSearch ? a.selectionStart : 0;
  let html;
  if (!S.tool){ html = pageHub(); document.title = 'SkyBlock Hub'; }
  else {
    const t = TOOL[S.tool], tab = t.tabs.find(x => x.id === S.tab);
    document.title = (S.tab === 'item' ? (S.byId[S.itemId] ? S.byId[S.itemId].name : pretty(S.itemId)) + ' – Analyse' : tab.label) + ' – ' + t.title;
    const needsData = !['settings', 'overview', 'watch'].includes(S.tab);
    html = `<div class="banner" id="banner" style="display:${S.banner ? 'block' : 'none'}">${S.banner}</div>` +
      (needsData && !S.rows.length ? '<p class="loading">Die Bazaar-Preise werden geladen …</p>' : PAGES[S.tab]());
  }
  if (S.achart && S.tab === 'item'){ S.achart.destroy(); S.achart = null; }
  $('#view').innerHTML = html;
  if (S.tab === 'item' && S.tool) initAnalysis();
  renderTabs();
  if (wasSearch){ const el = $('#search'); if (el){ el.focus(); el.setSelectionRange(pos, pos); } }
}

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
function spark(id, W=88, H=22, n=120){
  const h = S.hist[id]; if (!h || h.t.length < 2) return '<span class="mut">–</span>';
  const vals = h.s.slice(-n).filter(v => v > 0);
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
    secs.push(`<section><h3>Kapital</h3>${coinCtl('budget', 'Budget', [1e6, 5e6, 10e6, 50e6, 100e6, 500e6], 'Kurzschreibweise geht: 10m, 2,5m, 500k, 1b')}${sliderCtl('share')}</section>`);
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
  if (kind !== 'market') secs.push(`<section><h3>Sicherheit</h3>${sliderCtl('maxMove')}${switchCtl('hideRisky', 'Items mit Warnhinweis ausblenden', 'Preisausreißer, mögliche Manipulation, kaum Handel')}</section>`);
  $('#drawer').innerHTML = `<header><h2>Filter</h2><button class="btn ghost" data-act="closedrawer" aria-label="Filter schließen">Schließen</button></header>
    <div class="dbody">${secs.join('')}</div>
    <footer><button class="btn ghost" data-preset="balanced">Auf Ausgewogen zurücksetzen</button><button class="btn primary" data-act="closedrawer">Fertig</button></footer>`;
}

/* =========================================================
   Startbildschirm
   ========================================================= */
function bestNow(){
  if (!S.rows.length) return null;
  const f = filteredFlips(true).sort((a,b) => b.pph - a.pph)[0];
  const c = filteredCrafts(true).sort((a,b) => b.pph - a.pph)[0];
  if (!f && !c) return {none: true};
  return (!c || (f && f.pph >= c.pph)) ? {name: f.name, pph: f.pph, id: f.id, kind: 'flip'} : {name: c.name, pph: c.pph, ri: c.ri, kind: 'craft'};
}
function leadSentence(b){
  if (S.state === 'err' && !S.rows.length) return 'Hypixel antwortet gerade nicht. Die Seite versucht es automatisch weiter.';
  if (!b) return 'Die Bazaar-Preise werden geladen …';
  if (b.none) return 'Gerade passt kein Flip zu deinen Filtern. Probier eine lockerere Strategie.';
  return `Gerade bringt ${esc(b.name)} am meisten: rund ${words(b.pph)} Coins pro Stunde${b.kind === 'craft' ? ' als Craft-Flip' : ''}.`;
}
function pageHub(){
  const b = bestNow();
  const n = S.rows.length ? filteredFlips(true).length + filteredCrafts(true).length : null;
  return `<section class="hub">
    <p class="intro">Werkzeuge für Hypixel SkyBlock. Die Preise kommen live aus dem Bazaar und werden alle ${S.set.interval} Sekunden neu geladen.</p>
    <h1 class="lead">${leadSentence(b)}</h1>
    <h2 class="hub-h">Werkzeuge</h2>
    <ul class="toollist">${TOOLS.map(t => `
      <li><a href="#${t.id}" data-nav="${t.id}">
        <span class="t">${t.title}</span>
        <span class="d">${t.desc}</span>
        <span class="m">${t.id === 'bazaar' && n != null ? `${NF0.format(n)} passende Flips` : ''}</span>
      </a></li>`).join('')}
    </ul>
    <p class="fine">Inoffizielles Fan-Projekt, nicht mit Hypixel oder Mojang verbunden. Deine Eingaben bleiben in deinem Browser.</p>
  </section>`;
}

/* =========================================================
   Bazaar-Seiten (geben HTML zurück)
   ========================================================= */
function emptyRow(cols, title, txt){ return `<tr class="emptyrow"><td colspan="${cols}"><b>${title}</b>${txt ? ' ' + txt : ''}</td></tr>`; }
const PAGES = {
  overview(){
    const flips = filteredFlips(true).sort((a,b) => b.pph - a.pph);
    const crafts = filteredCrafts(true).sort((a,b) => b.pph - a.pph);
    const liq = S.rows.filter(liquid);
    const movers = liq.filter(r => r.d1h != null).sort((a,b) => Math.abs(b.d1h) - Math.abs(a.d1h)).slice(0, 5);
    const has = S.rows.length > 0;
    const list = (rows, emptyTxt) => rows.length ? `<ul class="rank">${rows.join('')}</ul>` : `<p class="muted-note">${emptyTxt}</p>`;
    const row = (attr, id, name, sub, val, valSub, valCls) => `<li ${attr}>${itemCell(id, name, sub)}<span class="v ${valCls || ''}">${val}<small>${valSub}</small></span></li>`;
    return `
      <h1 class="lead small">${leadSentence(bestNow())}</h1>
      <div class="stratbar"><span class="lbl">Strategie</span>${presetSeg()}<span class="note">${PRESETS[S.set.preset] ? esc(PRESETS[S.set.preset].desc) : 'Eigene Filtereinstellungen.'}</span></div>
      <p class="summary">${has ? `${NF0.format(liq.length)} von ${NF0.format(S.rows.length)} Bazaar-Produkten werden gerade genug gehandelt. Dein Budget: ${words(S.set.budget)} Coins.` : ''} <button class="link" data-act="filters">Alle Filter</button></p>
      <div class="cols">
        <section><header><h2>Beste Flips</h2>${flips.length ? `<button class="link" data-tab="flips">Alle ${flips.length} ansehen</button>` : ''}</header>
          ${list(flips.slice(0, 5).map(r => row(`data-open="${esc(r.id)}"`, r.id, r.name, `${price(r.buyAt)} kaufen, ${price(r.sellAt)} verkaufen`, fmt(r.pph), 'pro Stunde')), has ? 'Kein Flip passt zu deinen Filtern.' : 'Wird geladen …')}</section>
        <section><header><h2>Beste Craft-Flips</h2>${crafts.length ? `<button class="link" data-tab="crafts">Alle ${crafts.length} ansehen</button>` : ''}</header>
          ${list(crafts.slice(0, 5).map(c => row(`data-craft="${c.ri}"`, c.id, (c.cnt > 1 ? c.cnt + '× ' : '') + c.name, esc(c.ingredients), fmt(c.pph), 'pro Stunde')), has ? 'Kein Craft-Flip passt zu deinen Filtern.' : 'Wird geladen …')}</section>
        <section><header><h2>Größte Preisbewegungen</h2><button class="link" data-tab="market">Zum Markt</button></header>
          ${list(movers.map(r => row(`data-open="${esc(r.id)}"`, r.id, r.name, 'Instabuy ' + price(r.topSell), pct(r.d1h), 'letzte Stunde', cls(r.d1h))), has ? 'Die Seite sammelt noch Verlauf. Nach ein paar Minuten stehen hier die stärksten Bewegungen der letzten Stunde.' : 'Wird geladen …')}</section>
        <section><header><h2>Deine Watchlist</h2>${S.watch.length ? '<button class="link" data-tab="watch">Bearbeiten</button>' : ''}</header>
          ${list(S.watch.filter(id => S.byId[id]).slice(0, 5).map(id => { const r = S.byId[id]; return row(`data-open="${esc(id)}"`, id, r.name, `${price(r.topSell)} / ${price(r.topBuy)}`, pct(r.d1h), 'letzte Stunde', cls(r.d1h)); }), 'Noch leer. Markier ein Item mit ☆, dann taucht es hier auf.')}</section>
      </div>`;
  },

  flips(){
    const rows = sortRows(filteredFlips(), 'flips');
    const {slice, html} = paginate('flips', rows);
    const max = Math.max(0, ...slice.map(r => r.pph));
    const head = `<tr>${th('', '', '', 1)}${th('flips','name','Item',1)}
      ${th('flips','buyAt','Buy-Order','', 'Höchste Buy-Order + 0,1')}
      ${th('flips','sellAt','Sell-Offer','', 'Niedrigste Sell-Offer − 0,1')}
      ${th('flips','profit','Gewinn pro Stück','', 'Nach ' + NF2.format(S.set.tax) + ' % Bazaar-Steuer')}
      ${th('flips','perHour','Handel pro Stunde','', 'Stück pro Stunde auf der schwächeren Seite')}
      ${th('flips','pph','Profit pro Stunde','', 'Geschätzt aus dem Wochenvolumen und deinem Anteil')}
      ${th('flips','d1h','1 h')}</tr>`;
    const body = slice.map(r => `<tr data-open="${esc(r.id)}">
      <td class="c-star">${starBtn(r.id)}</td>
      <td class="l">${itemCell(r.id, r.name, '', r.risk)}</td>
      <td class="buy ${flash(r.id+'b', r.buyAt)}">${price(r.buyAt)}</td>
      <td class="sell ${flash(r.id+'s', r.sellAt)}">${price(r.sellAt)}</td>
      <td>${price(r.profit)}<small>${pct(r.marginPct, false)}</small></td>
      <td>${fmt(r.perHour)}</td>
      <td>${bar(r.pph, max)}<small>bei ${fmt(r.qty)} Stück</small></td>
      <td class="${cls(r.d1h)}">${pct(r.d1h)}</td></tr>`).join('');
    return toolbar('flips', rows.length, rows.length === 1 ? 'Flip' : 'Flips') + `<div class="tablewrap"><table><thead>${head}</thead><tbody>${body || emptyRow(8, 'Kein Flip passt.', 'Probier eine andere Strategie oder lockere die Filter.')}</tbody></table></div>${html}
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
      <td>${bar(c.pph, max)}<small>bei ${fmt(c.qty)} Crafts</small></td></tr>`).join('');
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
      ${th('market','spreadPct','Spread')}${th('market','d1h','1 h')}${th('market','d24h','24 h')}
      ${th('market','wVol','Volumen pro Woche')}${th('', '', 'Verlauf')}</tr>`;
    const body = slice.map(r => `<tr data-open="${esc(r.id)}">
      <td class="c-star">${starBtn(r.id)}</td>
      <td class="l">${itemCell(r.id, r.name, '', r.risk)}</td>
      <td class="${flash(r.id+'S', r.topSell)}">${price(r.topSell)}</td>
      <td class="${flash(r.id+'B', r.topBuy)}">${price(r.topBuy)}</td>
      <td class="mut">${pct(r.spreadPct, false)}</td>
      <td class="${cls(r.d1h)}">${pct(r.d1h)}</td><td class="${cls(r.d24h)}">${pct(r.d24h)}</td>
      <td>${fmt(r.wVol)}</td>
      <td>${spark(r.id)}</td></tr>`).join('');
    return toolbar('market', rows.length, 'Produkte') + `<div class="tablewrap"><table><thead>${head}</thead><tbody>${body || emptyRow(9, 'Nichts gefunden.', '')}</tbody></table></div>${html}`;
  },

  watch(){
    const rows = S.watch.map(id => {
      const r = S.byId[id], n = S.alerts.filter(a => a.id === id).length;
      if (!r) return `<tr><td class="c-star">${starBtn(id)}</td><td class="l">${itemCell(id, pretty(id), S.rows.length ? 'Gerade nicht im Bazaar' : 'Wird geladen …')}</td><td colspan="6"></td></tr>`;
      return `<tr data-open="${esc(id)}">
        <td class="c-star">${starBtn(id)}</td>
        <td class="l">${itemCell(id, r.name, n ? (n === 1 ? '1 Alarm' : n + ' Alarme') : '')}</td>
        <td class="${flash(id+'S', r.topSell)}">${price(r.topSell)}</td><td class="${flash(id+'B', r.topBuy)}">${price(r.topBuy)}</td>
        <td class="${cls(r.profit)}">${price(r.profit)}</td>
        <td class="${cls(r.d1h)}">${pct(r.d1h)}</td><td class="${cls(r.d24h)}">${pct(r.d24h)}</td>
        <td>${spark(id, 120, 24, 180)}</td></tr>`;
    }).join('');
    const al = S.alerts.map((a, i) => {
      const r = S.byId[a.id], c = CONDS[a.cond];
      return `<tr data-open="${esc(a.id)}"><td class="l">${itemCell(a.id, r ? r.name : pretty(a.id))}</td><td class="l">${c ? c.label : a.cond} ${price(a.value)}</td>
        <td>${r && c ? price(c.get(r)) : '–'}</td><td class="l mut">${a.last ? 'ausgelöst vor ' + ago(Date.now() - a.last) : 'wartet'}</td>
        <td><button class="btn ghost danger" data-delalert="${i}">Löschen</button></td></tr>`;
    }).join('');
    return `<h2 class="sec">Watchlist</h2>
      <div class="tablewrap"><table><thead><tr><th class="nosort"></th><th class="l nosort">Item</th><th class="nosort">Instabuy</th><th class="nosort">Instasell</th><th class="nosort">Flip-Gewinn</th><th class="nosort">1 h</th><th class="nosort">24 h</th><th class="nosort">Verlauf</th></tr></thead>
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
      ${row('Darstellung', 'Mit „Wie System“ folgt die Seite der Hell/Dunkel-Einstellung deines Geräts.', segCtl('theme', [['light','Hell'],['dark','Dunkel'],['system','Wie System']]))}
      ${row('Budget', 'Wie viele Coins du für Flips einsetzen willst.', coinCtl('budget', 'Budget', [1e6, 5e6, 10e6, 50e6, 100e6, 500e6], 'Kurzschreibweise geht: 10m, 2,5m, 500k, 1b'))}
      ${row('Bazaar-Steuer', 'Standard sind 1,25 %. Mit dem Community-Shop-Upgrade „Bazaar Flipper“ zahlst du weniger.', segCtl('tax', [[1.25,'1,25 %'],[1.125,'1,125 %'],[1,'1 %']]))}
      ${row('Anteil am Handel', 'Wie viel vom stündlichen Handel du realistisch abbekommst. Davon hängen „Profit pro Stunde“ und „Crafts pro Stunde“ ab.', sliderCtl('share'))}
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
function openDetail(id){ closeDrawer(); S.craftDetail = null; S.detail = id; $('#modal').classList.add('on'); renderDetail(false); }
function closeDetail(){ S.detail = null; S.craftDetail = null; if (S.mchart){ S.mchart.destroy(); S.mchart = null; } const m = $('#modal'); if (m) m.classList.remove('on'); }
function book(arr, side){
  const top = (arr || []).slice(0, 12);
  const mx = Math.max(1, ...top.map(o => o.amount));
  let cum = 0;
  return `<table class="book ${side}"><thead><tr><th class="l">Preis</th><th>Menge</th><th>Orders</th><th>Summe</th></tr></thead><tbody>${
    top.map(o => { cum += o.amount; return `<tr><td class="l p">${price(o.pricePerUnit)}</td><td class="amt">${fmt(o.amount)}<i style="width:${(o.amount/mx*100).toFixed(0)}%"></i></td><td class="mut">${o.orders}</td><td class="mut">${fmt(cum)}</td></tr>`; }).join('')
    || '<tr><td colspan="4" class="mut">leer</td></tr>'}</tbody></table>`;
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
    $('#dBuy').innerHTML = book(p.sell_summary, 'buy');
    $('#dSell').innerHTML = book(p.buy_summary, 'sell');
    livePoint(S.mchart, id); return;
  }
  const alerts = S.alerts.map((a, i) => ({a, i})).filter(x => x.a.id === id);
  const watched = S.watch.includes(id);
  $('#sheet').innerHTML = `
    <header class="dhead">
      <div><h2>${esc(r.name)}</h2><p class="sub">${esc(id)}${S.tiers[id] ? ', ' + esc(title(S.tiers[id])) : ''}</p></div>
      <div class="btnrow">
        <a class="btn primary" href="#bazaar/item/${encodeURIComponent(id)}">Genauer analysieren</a>
        <button class="btn" data-star="${esc(id)}">${watched ? 'Auf der Watchlist ★' : 'Auf die Watchlist ☆'}</button>
        <button class="btn ghost" data-act="close" aria-label="Schließen">Schließen</button>
      </div>
    </header>
    ${r.risk.length ? `<div class="banner warnb">${r.risk.map(esc).join('<br>')}</div>` : ''}
    <div id="dStats">${top}${more}</div>
    <section class="block">
      <header><h3>Preisverlauf</h3><span class="legend"><span class="l-sell">Instabuy</span><span class="l-buy">Instasell</span></span><div class="spacer"></div>
        ${rangeSeg('mrange', chartPrefs.mrange, ['1h','24h','7d','local'])}</header>
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

/* =========================================================
   Preisverlauf: SkyCofl (sky.coflnet.com) mit Rückfall auf den Browser-Verlauf
   ========================================================= */
const COFL = 'https://sky.coflnet.com/api/bazaar/';
const RANGES = {
  '1h':    {label: '1 h',     path: '/history/hour', span: HOUR},
  '24h':   {label: '24 h',    path: '/history/day',  span: 24*HOUR},
  '7d':    {label: '7 Tage',  path: '/history/week', span: 7*24*HOUR},
  '30d':   {label: '30 Tage', days: 30,              span: 30*24*HOUR},
  'local': {label: 'Browser', local: true},
};
const chartPrefs = Object.assign({mrange: '24h', arange: '24h', hi: true, lo: true, spread: true, volume: true, sma: false, ema: false, bb: false}, load('chartPrefs', {}));
function savePrefs(){ save('chartPrefs', chartPrefs); }
const histCache = {};
function rangeSeg(attr, cur, keys){ return `<div class="seg">${keys.map(k => `<button data-${attr}="${k}" class="${cur === k ? 'on' : ''}">${RANGES[k].label}</button>`).join('')}</div>`; }

function localSeries(id, span){
  const h = S.hist[id], d = {t: [], hi: [], lo: [], vb: [], vs: []};
  if (!h) return d;
  const from = span ? Date.now() - span : 0;
  for (let i = 0; i < h.t.length; i++){
    if (h.t[i] < from) continue;
    d.t.push(h.t[i]); d.hi.push(h.s[i] || null); d.lo.push(h.b[i] || null); d.vb.push(null); d.vs.push(null);
  }
  return d;
}
async function loadHistory(id, range){
  const R = RANGES[range] || RANGES['24h'];
  if (R.local) return {data: localSeries(id), source: 'local'};
  const key = id + '|' + range, c = histCache[key];
  if (c && Date.now() - c.at < 120e3) return {data: cloneSeries(c.data), source: 'cofl'};
  const url = COFL + encodeURIComponent(id) + (R.days
    ? `/history?start=${new Date(Date.now() - R.days * 864e5).toISOString()}&end=${new Date().toISOString()}`
    : R.path);
  try{
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status === 429 ? 'zu viele Anfragen' : 'HTTP ' + r.status);
    const arr = await r.json();
    if (!Array.isArray(arr) || !arr.length) throw new Error('keine Daten');
    const pts = arr.map(o => ({t: Date.parse(o.timestamp), a: +o.buy || 0, b: +o.sell || 0, ov: o.buyVolume, bv: o.sellVolume}))
      .filter(x => isFinite(x.t)).sort((x, y) => x.t - y.t);
    const d = {t: [], hi: [], lo: [], vb: [], vs: []};
    for (const x of pts){
      const v = [x.a, x.b].filter(n => n > 0);
      d.t.push(x.t); d.hi.push(v.length ? Math.max(...v) : null); d.lo.push(v.length ? Math.min(...v) : null);
      d.vb.push(x.bv ?? null); d.vs.push(x.ov ?? null);   // Hypixel-Benennung: sellVolume = Buy-Orders, buyVolume = Sell-Offers
    }
    histCache[key] = {at: Date.now(), data: d};
    return {data: cloneSeries(d), source: 'cofl'};
  }catch(e){
    return {data: localSeries(id, R.span), source: 'local', error: e.message};
  }
}
function cloneSeries(d){ return {t: [...d.t], hi: [...d.hi], lo: [...d.lo], vb: [...d.vb], vs: [...d.vs]}; }
// aktuellen Live-Preis an einen Chart anhängen
function livePoint(chart, id){
  if (!chart) return;
  const r = S.byId[id], q = S.products[id] && S.products[id].quick_status;
  if (!r || !S.lastUpdated) return;
  // SkyCofl speichert die gewichteten Preise aus quick_status – Live-Punkte passend dazu, sonst Top-of-Book wie im Browser-Verlauf
  const hi = chart.cofl && q && q.buyPrice ? q.buyPrice : r.topSell, lo = chart.cofl && q && q.sellPrice ? q.sellPrice : r.topBuy;
  chart.append({t: S.lastUpdated, hi: hi || null, lo: lo || null, vb: q ? q.sellVolume : null, vs: q ? q.buyVolume : null});
}
function sourceNote(res, range){
  if (res.source === 'cofl') return `Preisverlauf: <a href="https://sky.coflnet.com/data" target="_blank" rel="noopener">Prices provided by SkyCofl</a>, ergänzt um Live-Preise.`;
  if (res.error) return `Der Verlauf von SkyCofl ist gerade nicht erreichbar (${esc(res.error)}). Angezeigt werden die Preise, die dieser Browser selbst gesammelt hat.`;
  return 'Angezeigt werden die Preise, die dieser Browser selbst gesammelt hat, solange die Seite offen war.';
}
async function loadModalChart(){
  const id = S.detail, ch = S.mchart; if (!id || !ch) return;
  document.querySelectorAll('[data-mrange]').forEach(b => b.classList.toggle('on', b.dataset.mrange === chartPrefs.mrange));
  ch.empty = 'Lädt …'; ch.setData({t: []});
  const res = await loadHistory(id, chartPrefs.mrange);
  if (S.mchart !== ch || S.detail !== id) return;
  ch.empty = 'Noch keine Daten für diesen Zeitraum.';
  ch.setIndicators({volume: false});
  ch.cofl = res.source === 'cofl'; ch.setData(res.data); livePoint(ch, id);
  const n = $('#msrc'); if (n) n.innerHTML = sourceNote(res) + ' Mausrad zoomt, Ziehen verschiebt, Doppelklick zeigt alles.';
}

/* =========================================================
   Analyse-Seite eines Items  (#bazaar/item/ID)
   ========================================================= */
const TOOLS_DRAW = [
  ['none', 'Bewegen', 'V', 'Ziehen verschiebt, Mausrad zoomt'],
  ['trend', 'Trendlinie', 'T', 'Zwei Klicks: Start und Ende'],
  ['hline', 'Horizontale', 'H', 'Ein Klick: Preislinie, z. B. Unterstützung oder Widerstand'],
  ['rect', 'Zone', 'Z', 'Zwei Klicks: gegenüberliegende Ecken'],
  ['fib', 'Fibonacci', 'F', 'Zwei Klicks: Hoch und Tief'],
  ['text', 'Notiz', 'N', 'Ein Klick, dann Text eingeben'],
  ['measure', 'Messen', 'M', 'Zwei Klicks: Veränderung in Prozent und Zeit'],
  ['erase', 'Radierer', 'E', 'Klick auf eine Zeichnung löscht sie'],
];
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
      <div><h1>${esc(r.name)}</h1><p class="sub"><i class="rar" style="--rc:${rarityColor(id)}"></i>${esc(id)}${S.tiers[id] ? ', ' + esc(title(S.tiers[id])) : ''}</p></div>
      <div class="btnrow">
        <button class="btn ghost" data-act="copy" data-name="${esc(r.name)}">Name kopieren</button>
        <button class="btn" data-star="${esc(id)}">${watched ? 'Auf der Watchlist ★' : 'Auf die Watchlist ☆'}</button>
      </div>
    </header>
    <div id="aFig">${anaFigures(r)}</div>

    <section class="ana-chart">
      <div class="ctrl">
        ${rangeSeg('arange', chartPrefs.arange, ['1h','24h','7d','30d','local'])}
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
    ['Flip-Gewinn pro Stück', `<span class="${cls(r.profit)}">${price(r.profit)}</span>`], ['Profit pro Stunde', fmt(r.pph)],
  ]) + facts([
    ['Marge', pct(r.marginPct, false)], ['Spread', pct(r.spreadPct, false)], ['1 h', `<span class="${cls(r.d1h)}">${pct(r.d1h)}</span>`], ['24 h', `<span class="${cls(r.d24h)}">${pct(r.d24h)}</span>`],
    ['Instabuys pro Woche', fmt(r.wBuy)], ['Instasells pro Woche', fmt(r.wSell)], ['Handel pro Stunde', fmt(r.perHour)], ['Gefragt', liquid(r) ? 'ja' : 'nein'],
    ['Buy-Orders gesamt', NF0.format(r.sellOrders)], ['Sell-Offers gesamt', NF0.format(r.buyOrders)], ['NPC-Preis', price(r.npc)], ['Strategie-Filter', filteredFlips(true).some(x => x.id === r.id) ? 'passt' : 'passt nicht'],
  ]);
}
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
          pph: tReal > 0 && isFinite(tReal) ? profit / tReal : null, perDay: tReal > 0 && isFinite(tReal) ? Math.floor(24 / tReal) : null, orders, warn};
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
      ['Dauer pro Durchlauf', dur(c.tReal)],
      ['Profit pro Stunde', c.pph != null ? fmt(c.pph) : (c.tReal === 0 ? 'sofort' : '–')],
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
      <td>${dur(x.c.tReal)}</td><td>${x.c.pph != null ? fmt(x.c.pph) : (x.c.tReal === 0 ? 'sofort' : '–')}</td>
      <td>${calcPrefs.buy === x.b && calcPrefs.sell === x.s ? '<span class="mut">gewählt</span>' : '<button class="link">wählen</button>'}</td></tr>`).join('')}
  </tbody></table></div>
  <p class="hint">Dauer „realistisch“: Handel der letzten 7 Tage × dein Anteil von ${NF1.format(S.set.share)} %. „Bestenfalls“ heißt, deine Order bleibt die ganze Zeit ganz oben. Instabuy und Instasell sind sofort, kosten aber den Spread.</p>`;
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

/* =========================================================
   Einstellungen ändern
   ========================================================= */
let recalcTimer = null;
function setSetting(key, value, {quiet} = {}){
  S.set[key] = value;
  if (PRESET_KEYS.includes(key)) S.set.preset = 'custom';
  save('settings', S.set);
  if (key === 'interval') schedule();
  if (key === 'theme'){ applyTheme(); renderMain(true); return; }
  clearTimeout(recalcTimer);
  const run = () => { if (S.rows.length) ingest(false); else renderMain(); };
  if (quiet) recalcTimer = setTimeout(run, 140); else run();
}
function applyPreset(k){
  const p = PRESETS[k]; if (!p) return;
  for (const key of PRESET_KEYS) S.set[key] = p[key];
  S.set.preset = k; save('settings', S.set);
  if (S.rows.length) ingest(false); else renderMain(true);
  if (S.drawer) renderDrawer();
}
function refreshControls(){
  if (S.drawer) renderDrawer(); if (S.tab === 'settings') renderMain(true);
  document.querySelectorAll('#view [data-setv]').forEach(b => b.classList.toggle('on', String(S.set[b.dataset.setv]) === b.dataset.val));
}
function toggleWatch(id){
  const i = S.watch.indexOf(id);
  if (i >= 0) S.watch.splice(i, 1); else S.watch.push(id);
  save('watch', S.watch);
}

/* =========================================================
   Events
   ========================================================= */
document.addEventListener('click', e => {
  const t = e.target, q = sel => t.closest(sel);
  let el;
  if ((el = q('[data-star]'))){ e.stopPropagation(); toggleWatch(el.dataset.star); renderMain(true); rerenderModal(); return; }
  if ((el = q('[data-delalert]'))){ e.stopPropagation(); S.alerts.splice(+el.dataset.delalert, 1); save('alerts', S.alerts); renderMain(true); rerenderModal(); return; }
  if ((el = q('[data-nav]'))){ nav(el.dataset.nav); return; }
  if ((el = q('[data-tab]'))){ closeDetail(); nav(S.tool + '/' + el.dataset.tab); return; }
  if ((el = q('[data-preset]'))){ applyPreset(el.dataset.preset); return; }
  if ((el = q('[data-coinset]'))){ const [k, v] = el.dataset.coinset.split(':'); setSetting(k, +v); refreshControls(); return; }
  if ((el = q('[data-setv]'))){ const v = el.dataset.val, k = el.dataset.setv; setSetting(k, isNaN(+v) ? v : +v); refreshControls(); return; }
  if ((el = q('th[data-sort]'))){
    const tab = S.tab, k = el.dataset.sort, cur = S.sort[tab];
    if (cur.k === k) cur.d *= -1; else { cur.k = k; cur.d = k === 'name' ? 1 : -1; }
    save('sort', S.sort); S.pageNo[tab] = 0; renderMain(true); return;
  }
  if ((el = q('[data-pg]'))){ S.pageNo[S.tab] = Math.max(0, (S.pageNo[S.tab] || 0) + +el.dataset.pg); renderMain(true); window.scrollTo({top:0}); return; }
  if ((el = q('[data-mrange]'))){ chartPrefs.mrange = el.dataset.mrange; savePrefs(); loadModalChart(); return; }
  if ((el = q('[data-arange]'))){ chartPrefs.arange = el.dataset.arange; savePrefs(); loadAnalysisChart(); return; }
  if ((el = q('[data-tool]'))){ setAnaTool(el.dataset.tool); return; }
  if ((el = q('[data-cset]'))){ calcPrefs[el.dataset.cset] = el.dataset.val; saveCalc(); refreshCalc(true); return; }
  if ((el = q('[data-ccombo]'))){ const [b, s2] = el.dataset.ccombo.split('|'); calcPrefs.buy = b; calcPrefs.sell = s2; saveCalc(); refreshCalc(true); return; }
  if ((el = q('[data-creset]'))){ calcState[el.dataset.creset === 'buy' ? 'buyPx' : 'sellPx'] = null; refreshCalc(true); return; }
  if ((el = q('[data-ccopy]'))){
    const r = S.byId[S.itemId]; if (!r) return;
    const v = el.dataset.ccopy === 'buy' ? orderPx(r, 'buy') : orderPx(r, 'sell'), txt = String(r1(v));   // so wie das Schild im Spiel ihn erwartet
    const done = () => { el.textContent = 'Kopiert: ' + txt; setTimeout(() => el.textContent = 'Preis kopieren', 1600); };
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(done).catch(() => { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); done(); }catch{} ta.remove(); });
    return;
  }
  if ((el = q('[data-cq]'))){
    const [k, v] = el.dataset.cq.split(':'), r = S.byId[S.itemId]; if (!r) return;
    if (k === 'b'){ calcPrefs.budget = v === 'set' ? S.set.budget : +v; }
    else if (v === 'budget') calcPrefs.qty = Math.max(1, Math.floor(S.set.budget / orderPx(r, 'buy')));
    else if (v === 'order') calcPrefs.qty = MAX_ORDER;
    else calcPrefs.qty = +v;
    saveCalc(); refreshCalc(true); return;
  }
  if ((el = q('[data-craft]'))){ openCraft(+el.dataset.craft); return; }
  if ((el = q('[data-open]'))){ openDetail(el.dataset.open); return; }
  if (t.id === 'modal'){ closeDetail(); return; }
  if (t.id === 'scrim'){ closeDrawer(); return; }
  if (q('#refreshBtn')){ poll(); return; }
  if ((el = q('#pauseBtn'))){ S.paused = !S.paused; el.textContent = S.paused ? 'Fortsetzen' : 'Pausieren'; if (S.paused) schedule(); else poll(); tick(); return; }
  const act = (el = q('[data-act]')) && el.dataset.act;
  if (!act) return;
  e.preventDefault();
  if (act === 'close') closeDetail();
  else if (act === 'filters') openDrawer();
  else if (act === 'back'){ nav(S.tool + '/' + (S.returnTo && S.returnTo !== 'item' ? S.returnTo : 'overview')); }
  else if (act === 'undo'){ if (S.achart) S.achart.undo(); }
  else if (act === 'cleardraw'){ if (S.achart){ if (el.dataset.sure){ S.achart.clearDrawings(); el.textContent = 'Alle Zeichnungen löschen'; delete el.dataset.sure; } else { el.dataset.sure = 1; el.textContent = 'Wirklich alle löschen?'; } } }
  else if (act === 'theme'){ S.set.theme = resolvedTheme() === 'dark' ? 'light' : 'dark'; save('settings', S.set); applyTheme(); if (S.tab === 'settings' && S.tool) renderMain(true); }
  else if (act === 'closedrawer') closeDrawer();
  else if (act === 'clearsearch'){ S.search = ''; S.pageNo[S.tab] = 0; renderMain(true); const s = $('#search'); if (s) s.focus(); }
  else if (act === 'copy'){
    const name = el.dataset.name || S.byId[S.detail]?.name || '';
    const done = () => { el.textContent = 'Kopiert'; setTimeout(() => el.textContent = 'Name kopieren', 1500); };
    (navigator.clipboard ? navigator.clipboard.writeText(name) : Promise.reject()).then(done).catch(() => {
      const ta = document.createElement('textarea'); ta.value = name; document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); done(); }catch{} ta.remove();
    });
  }
  else if (act === 'addalert'){
    const inp = $('#alVal'), v = parseCoins(inp.value);
    if (!isFinite(v) || v <= 0){ inp.parentElement.style.borderColor = 'var(--red)'; inp.focus(); return; }
    const aid = S.detail || S.itemId;
    S.alerts.push({id: aid, cond: $('#alCond').value, value: v, last: 0});
    save('alerts', S.alerts);
    if (!S.watch.includes(aid)){ S.watch.push(aid); save('watch', S.watch); }
    if (S.detail) renderDetail(false); renderMain(true);
  }
  else if (act === 'notif'){ try{ Notification.requestPermission().then(() => renderMain(true)); }catch{} }
  else if (act === 'test') notify('Test-Alarm', 'So sieht ein Preis-Alarm aus.');
  else if (act === 'clear'){ if (el.dataset.sure){ S.hist = {}; DB.clear(); renderMain(true); } else { el.dataset.sure = 1; el.textContent = 'Wirklich löschen?'; } }
  else if (act === 'export'){
    const blob = new Blob([JSON.stringify({exported: new Date().toISOString(), hist: S.hist})], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'bazaar-verlauf-' + new Date().toISOString().slice(0,10) + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  else if (act === 'items'){ save('items', null); loadItems().then(() => { if (S.rows.length) ingest(false); }); }
  else if (act === 'reset'){ S.set = Object.assign({}, DEFAULTS); save('settings', S.set); schedule(); if (S.rows.length) ingest(false); renderMain(true); }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'search'){ S.search = t.value; S.pageNo[S.tab] = 0; renderMain(); return; }
  if (t.dataset.cin){
    const k = t.dataset.cin, v = parseCoins(t.value.replace('%', ''));
    const ok = isFinite(v) && v >= 0;
    t.parentElement.classList.toggle('bad', !ok && t.value.trim() !== '');
    if (k === 'buyPx') calcState.buyPx = ok && v > 0 ? v : null;
    else if (k === 'sellPx') calcState.sellPx = ok && v > 0 ? v : null;
    else if (ok){ calcPrefs[k] = v; saveCalc(); }
    refreshCalc(false);
    if (k === 'buyPx' || k === 'sellPx'){ const n = $('#c' + (k === 'buyPx' ? 'buy' : 'sell') + 'Live'); const r = S.byId[S.itemId]; if (n && r) n.innerHTML = (calcState[k] != null ? `Eigener Preis. Live: ${NF1f.format(k === 'buyPx' ? autoBuy(r) : autoSell(r))} <button class="link" data-creset="${k === 'buyPx' ? 'buy' : 'sell'}">Live-Preis nehmen</button>` : 'Automatisch.') + ` <button class="link" data-ccopy="${k === 'buyPx' ? 'buy' : 'sell'}">Preis kopieren</button>`; }
    return;
  }
  if (t.dataset.slider){
    const key = t.dataset.slider, c = SLIDERS[key], v = c.steps[+t.value];
    t.style.setProperty('--p', (t.value / (c.steps.length - 1) * 100).toFixed(1) + '%');
    document.querySelectorAll(`[data-out="${key}"]`).forEach(o => o.textContent = c.f(v));
    setSetting(key, v, {quiet: true});
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.slider){ refreshControls(); return; }
  if (t.dataset.coin){
    const key = t.dataset.coin, v = parseCoins(t.value);
    if (!isFinite(v) || v < 0){ t.value = coinText(S.set[key]); t.parentElement.style.borderColor = 'var(--red)'; setTimeout(() => t.parentElement.style.borderColor = '', 900); return; }
    setSetting(key, v); refreshControls(); return;
  }
  if (t.dataset.set && t.type === 'checkbox'){ setSetting(t.dataset.set, t.checked); refreshControls(); }
  if (t.dataset.ind){
    chartPrefs[t.dataset.ind] = t.checked; savePrefs();
    if (S.achart){ S.achart.setIndicators({hi: chartPrefs.hi, lo: chartPrefs.lo, spread: chartPrefs.spread, volume: chartPrefs.volume, sma: chartPrefs.sma ? 20 : 0, ema: chartPrefs.ema ? 50 : 0, bb: chartPrefs.bb}); anaLegend(null); }
  }
});
document.addEventListener('keydown', e => {
  const tag = document.activeElement.tagName;
  if (e.key === 'Escape'){ if ($('#modal').classList.contains('on')) closeDetail(); else if (S.drawer) closeDrawer(); else if (S.achart){ S.achart.cancel(); setAnaTool('none'); } return; }
  if (S.achart && S.tab === 'item' && !['INPUT','SELECT','TEXTAREA'].includes(tag) && !e.altKey){
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'){ e.preventDefault(); S.achart.undo(); return; }
    if (!e.ctrlKey && !e.metaKey){ const tl = TOOLS_DRAW.find(x => x[2].toLowerCase() === e.key.toLowerCase()); if (tl){ setAnaTool(tl[0]); return; } }
  }
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.coin){ e.target.blur(); return; }
  if (e.key === 'Enter' && e.target.id === 'alVal'){ document.querySelector('[data-act=addalert]').click(); return; }
  if (e.key === '/' && !['INPUT','SELECT','TEXTAREA'].includes(tag)){ const s = $('#search'); if (s){ e.preventDefault(); s.focus(); } }
});
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', () => { DB.saveAll(S.hist); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !S.paused && Date.now() - S.lastFetch > S.set.interval*1000) poll();
});

/* =========================================================
   Start
   ========================================================= */
(async function init(){
  route();
  setInterval(tick, 1000);
  await DB.open();
  S.hist = await DB.loadAll();
  const now = Date.now();
  for (const k in S.hist) compact(S.hist[k], now);
  await Promise.all([loadItems(), loadRecipes()]);
  poll();
})();
