'use strict';
/* =========================================================
   TOOLS – der Startbildschirm zeigt jedes Tool als Karte.
   Neues Tool: Eintrag ergänzen (id, icon, title, desc, tabs, render)
   und die Seiten als Funktionen schreiben, die HTML zurückgeben.
   ========================================================= */
const BAZAAR_TABS = [
  {id:'overview', label:'Übersicht',   icon:'🏠'},
  {id:'flips',    label:'Flips',       icon:'💰'},
  {id:'crafts',   label:'Craft-Flips', icon:'🔨'},
  {id:'npc',      label:'NPC-Flips',   icon:'🏪'},
  {id:'market',   label:'Markt',       icon:'📊'},
  {id:'watch',    label:'Watchlist',   icon:'⭐'},
  {id:'settings', label:'Einstellungen', icon:'⚙'},
];
const TOOLS = [
  {id:'bazaar', icon:'💰', title:'Bazaar Flipper',
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
  retentionH: 48, pageSize: 50, sound: true,
};
// Strategien: setzen alle Nachfrage-, Margen- und Stabilitätsfilter auf einen Schlag.
//  Sicher     – Orders füllen sich in Minuten, Preise stabil, dafür kleine Margen
//  Ausgewogen – gefragte Items mit spürbarer Marge
//  Riskant    – auch langsame/schwankende Items, aber nur wenn die Marge das Risiko bezahlt
const PRESETS = {
  safe:     {label:'Sicher',     icon:'🛡', desc:'Sehr gefragte, stabile Items. Orders füllen sich schnell, Margen sind klein.',
             minVolH: 500, minTurnH: 10_000_000, minBalance: 50, minPct: 1, maxPct: 20,  craftMinPct: 2, maxMove: 5,    hideRisky: true},
  balanced: {label:'Ausgewogen', icon:'⚖', desc:'Gefragte Items mit spürbarer Marge – der beste Mix aus Tempo und Gewinn.',
             minVolH: 100, minTurnH: 2_000_000,  minBalance: 30, minPct: 2, maxPct: 50,  craftMinPct: 3, maxMove: 10,   hideRisky: true},
  risky:    {label:'Riskant',    icon:'🔥', desc:'Auch langsame oder schwankende Items – dafür muss die Marge hoch sein.',
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
    p.hideRisky ? 'Items mit ⚠ Warnung ausgeblendet' : 'Items mit ⚠ Warnung werden gezeigt',
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
  detail: null, craftDetail: null, detailRange: 6*HOUR,
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
function loadLocalState(){ applyState({settings: load('settings', {}), watch: load('watch', []), alerts: load('alerts', []), sort: load('sort', {})}); }
function pick(o, keys){ const r = {}; for (const k of keys) r[k] = o[k]; return r; }
loadLocalState();

/* =========================================================
   Formatierung
   ========================================================= */
const nf = (d=1, min=0) => new Intl.NumberFormat('de-AT', {maximumFractionDigits:d, minimumFractionDigits:min});
const NF0 = nf(0), NF1 = nf(1), NF1f = nf(1,1), NF2 = nf(2);
function fmt(n){
  if (n == null || !isFinite(n)) return '–';
  const a = Math.abs(n);
  if (a >= 1e9) return NF2.format(n/1e9) + ' B';
  if (a >= 1e6) return NF2.format(n/1e6) + ' M';
  if (a >= 1e4) return NF1.format(n/1e3) + ' k';
  if (a >= 100) return NF0.format(n);
  return NF1.format(n);
}
function price(n){ return (n == null || !isFinite(n) || n === 0) ? '–' : (Math.abs(n) >= 1e6 ? fmt(n) : NF1f.format(n)); }
function pct(n, sign=true){ if (n == null || !isFinite(n)) return '–'; return (sign && n > 0 ? '+' : '') + NF1.format(n) + ' %'; }
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
const RARITY = {COMMON:'#cfd6dd', UNCOMMON:'#55e07a', RARE:'#6f8cff', EPIC:'#c27dff', LEGENDARY:'#ffad33', MYTHIC:'#ff6bdc', DIVINE:'#55e6ff', SPECIAL:'#ff6b6b', VERY_SPECIAL:'#ff6b6b'};
function rarityColor(id){
  if (S.tiers[id]) return RARITY[S.tiers[id]] || RARITY.COMMON;
  if (id.startsWith('ENCHANTMENT_ULTIMATE')) return RARITY.MYTHIC;
  if (id.startsWith('ENCHANTMENT_')) return '#9db8ff';
  if (id.startsWith('ESSENCE_')) return RARITY.EPIC;
  return RARITY.COMMON;
}
function icon(id, name){
  const n = (name || pretty(id)).replace(/^(Enchanted|Ultimate)\s+/i, '');
  const letters = n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return `<div class="ic" style="--rc:${rarityColor(id)}">${esc(letters || '?')}</div>`;
}
function itemCell(id, name, sub, risk){
  return `<div class="itemcell">${icon(id, name)}<div><div class="nm">${esc(name)}${risk && risk.length ? ` <span class="warn" title="${esc(risk.join('\n'))}">⚠</span>` : ''}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`;
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
    banner('⚠ Die Hypixel-API ist gerade nicht erreichbar (' + esc(e.message) + '). Ich versuche es automatisch weiter. Prüfe deine Internetverbindung – falls dein Browser die Anfrage blockiert, öffne die Datei in Chrome, Edge oder Firefox.');
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
  toast('<b>🔔 ' + esc(head) + '</b><br>' + esc(body), id);
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
   Rahmen: Top-Leiste, Status, Routing
   ========================================================= */
const $ = s => document.querySelector(s);
function banner(html){
  S.banner = html;
  const b = $('#banner'); if (b){ b.innerHTML = html; b.style.display = html ? 'block' : 'none'; }
}
function route(){
  const [tool, tab] = location.hash.replace('#', '').split('/');
  if (TOOL[tool]){
    S.tool = tool;
    S.tab = TOOL[tool].tabs.some(t => t.id === tab) ? tab : TOOL[tool].defaultTab;
  } else { S.tool = null; }
  S.search = '';
  closeDrawer(); closeDetail();
  renderTop(); renderMain(true); window.scrollTo({top:0});
}
function nav(hash){ if (location.hash === '#' + hash) route(); else location.hash = hash; }

function livePill(){
  return `<div class="livepill" title="Status der Live-Daten">
    <svg class="ring" id="ring" viewBox="0 0 22 22"><circle class="bgc" cx="11" cy="11" r="8"/><circle class="fg" id="ringfg" cx="11" cy="11" r="8" stroke-dasharray="50.27" stroke-dashoffset="50.27"/></svg>
    <span id="statusTxt" class="hidem">Starte…</span></div>`;
}
function renderTop(){
  const t = S.tool && TOOL[S.tool];
  if (!t){
    $('#top').innerHTML = `<div class="topin"><button class="brand" data-nav=""><span class="coin">S</span>SkyBlock Hub</button><div class="spacer"></div>${livePill()}</div>`;
  } else {
    $('#top').innerHTML = `<div class="topin">
        <button class="brand" data-nav="" title="Zurück zum Startbildschirm"><span class="coin">S</span><span class="hidem">SkyBlock Hub</span></button>
        <span class="crumb">/</span><b style="font-size:15px">${t.icon} ${t.title}</b>
        <div class="spacer"></div>
        ${livePill()}
        <button class="btn icon" id="pauseBtn" title="Auto-Update pausieren">${S.paused ? '▶' : '⏸'}</button>
        <button class="btn primary" id="refreshBtn" title="Jetzt aktualisieren">↻<span class="hidem"> Aktualisieren</span></button>
      </div>
      <nav class="tabs" id="tabs"></nav>`;
    renderTabs();
  }
  tick();
}
function renderTabs(){
  const el = $('#tabs'); if (!el) return;
  const t = TOOL[S.tool];
  const counts = S.rows.length ? {flips: filteredFlips(true).length, crafts: filteredCrafts(true).length, watch: S.watch.length} : {watch: S.watch.length};
  el.innerHTML = t.tabs.map(x => `<button class="${S.tab === x.id ? 'on' : ''}" data-tab="${x.id}">${x.icon} ${x.label}${counts[x.id] ? `<span class="n">${counts[x.id]}</span>` : ''}</button>`).join('');
}
function tick(){
  const fg = $('#ringfg'), ring = $('#ring'), st = $('#statusTxt'), C = 50.27;
  if (!fg) return;
  let frac = 1, txt;
  if (S.state === 'err') txt = '<b>Offline</b> · neuer Versuch' + (S.nextAt ? ' in ' + Math.max(0, Math.ceil((S.nextAt - Date.now())/1000)) + ' s' : '');
  else if (!S.lastUpdated) txt = 'Lade Daten…';
  else {
    const age = ago(Date.now() - S.lastUpdated);
    if (S.paused) txt = '<b>Pausiert</b> · Stand vor ' + age;
    else { frac = 1 - Math.max(0, (S.nextAt - Date.now())/1000) / S.set.interval; txt = '<b>Live</b> · Stand vor ' + age; }
  }
  ring.setAttribute('class', 'ring ' + (S.paused ? 'pause' : S.state));
  fg.style.strokeDashoffset = (C * (1 - Math.min(1, Math.max(0, frac)))).toFixed(2);
  st.innerHTML = txt;
}

/* Hauptbereich neu zeichnen – ohne Fokusverlust im Suchfeld */
function renderMain(force){
  const a = document.activeElement;
  if (!force && a && a.closest && a.closest('#view') && a.matches('input:not(#search), select')) return;   // nicht beim Tippen stören
  const wasSearch = a && a.id === 'search', pos = wasSearch ? a.selectionStart : 0;
  let html;
  if (!S.tool) html = pageHub();
  else {
    const t = TOOL[S.tool], tab = t.tabs.find(x => x.id === S.tab);
    document.title = tab.label + ' · ' + t.title;
    const needsData = !['settings', 'overview', 'watch'].includes(S.tab);
    html = `<div class="banner" id="banner" style="display:${S.banner ? 'block' : 'none'}">${S.banner}</div>` +
      (needsData && !S.rows.length ? '<div class="card empty"><b>⏳ Lade Live-Daten…</b>Die Hypixel-API wird abgefragt.</div>' : PAGES[S.tab]());
  }
  if (!S.tool) document.title = 'SkyBlock Hub';
  $('#view').innerHTML = html;
  if (S.tool) renderTabs();
  if (wasSearch){ const el = $('#search'); if (el){ el.focus(); el.setSelectionRange(pos, pos); } }
}

/* =========================================================
   Bausteine
   ========================================================= */
function th(tab, k, label, l, tip){
  if (!k) return `<th class="nosort ${l ? 'l' : ''}">${label}</th>`;
  const on = S.sort[tab].k === k;
  return `<th data-sort="${k}" class="${l ? 'l ' : ''}${on ? 'on' : ''}"${tip ? ` title="${esc(tip)}"` : ''}>${label}${on ? (S.sort[tab].d > 0 ? ' ↑' : ' ↓') : ''}</th>`;
}
function sortRows(rows, tab){
  const {k, d} = S.sort[tab];
  return rows.sort((a, b) => {
    const x = a[k], y = b[k];
    if (typeof x === 'string') return x.localeCompare(y) * d;
    return ((x ?? -Infinity) - (y ?? -Infinity)) * d;
  });
}
function starBtn(id){ const on = S.watch.includes(id); return `<button class="star ${on ? 'on' : ''}" data-star="${esc(id)}" title="${on ? 'Von Watchlist entfernen' : 'Zur Watchlist'}">${on ? '★' : '☆'}</button>`; }
function flash(key, v){
  const p = S.prevPrice[key]; S.prevPrice[key] = v;
  if (p == null || p === v) return '';
  return v > p ? 'flash-up' : 'flash-dn';
}
function paginate(tab, rows){
  const ps = S.set.pageSize, pages = Math.max(1, Math.ceil(rows.length / ps));
  let p = S.pageNo[tab] || 0; if (p >= pages) p = pages - 1; S.pageNo[tab] = p;
  return {slice: rows.slice(p*ps, p*ps + ps), html: pages > 1 ? `<div class="pager"><span>${NF0.format(rows.length)} Einträge</span><span>Seite ${p+1} von ${pages}
    <button class="btn sm" data-pg="-1" ${p === 0 ? 'disabled' : ''}>‹</button>
    <button class="btn sm" data-pg="1" ${p >= pages-1 ? 'disabled' : ''}>›</button></span></div>` : ''};
}
function bar(v, max){ return `<span class="bar gold">${fmt(v)}<i style="width:${max > 0 ? Math.max(4, v / max * 100).toFixed(0) : 0}%"></i></span>`; }
function spark(id, W=90, H=24, n=120){
  const h = S.hist[id]; if (!h || h.t.length < 2) return '<span class="mut">–</span>';
  const vals = h.s.slice(-n).filter(v => v > 0);
  if (vals.length < 2) return '<span class="mut">–</span>';
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const pts = vals.map((v, i) => (i/(vals.length-1)*W).toFixed(1) + ',' + (mx === mn ? H/2 : H - 2 - (v-mn)/(mx-mn)*(H-4)).toFixed(1)).join(' ');
  const col = vals[vals.length-1] >= vals[0] ? '#3fcf8e' : '#ef6b6b';
  return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

// Eingabe-Komponenten (Filter-Panel & Einstellungen)
function sliderCtl(key){
  const c = SLIDERS[key], steps = c.steps, v = S.set[key];
  let idx = 0, bd = Infinity;
  steps.forEach((s, i) => { const d = Math.abs(s - v); if (d < bd){ bd = d; idx = i; } });
  const p = (idx / (steps.length - 1) * 100).toFixed(1);
  return `<label class="slider"><div class="head"><span>${c.label}</span><b data-out="${key}">${c.f(steps[idx])}</b></div>
    <input type="range" min="0" max="${steps.length-1}" step="1" value="${idx}" data-slider="${key}" style="--p:${p}%">
    ${c.hint ? `<small>${c.hint}</small>` : ''}</label>`;
}
function coinCtl(key, label, quick, hint){
  return `<div><span class="lbl">${label}</span>
    <div class="input"><input data-coin="${key}" value="${coinText(S.set[key])}" inputmode="decimal" autocomplete="off" placeholder="z. B. 10m"><span class="unit">Coins</span></div>
    ${quick ? `<div class="quick">${quick.map(q => `<button data-coinset="${key}:${q}" class="${S.set[key] === q ? 'on' : ''}">${fmt(q)}</button>`).join('')}</div>` : ''}
    ${hint ? `<small class="mut" style="display:block;font-size:11.5px;margin-top:6px">${hint}</small>` : ''}</div>`;
}
function segCtl(key, opts, full){
  return `<div class="seg ${full ? 'full' : ''}">${opts.map(([v, l]) => `<button data-setv="${key}" data-val="${v}" class="${String(S.set[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function switchCtl(key, label, sub){
  return `<label class="switch"><span class="t"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" data-set="${key}" ${S.set[key] ? 'checked' : ''}></label>`;
}
function presetSeg(){
  return `<div class="seg" title="Strategie">${Object.entries(PRESETS).map(([k,p]) => `<button data-preset="${k}" class="${S.set.preset === k ? 'on' : ''}" title="${esc(p.desc)}">${p.icon} ${p.label}</button>`).join('')}${S.set.preset === 'custom' ? '<button class="on" data-act="filters">Eigene</button>' : ''}</div>`;
}

/* Toolbar über jeder Liste: Suche · Strategie · Filter */
function toolbar(kind, count, noun){
  const s = S.set;
  const parts = [`<b>${NF0.format(count)}</b> ${noun}`];
  if (kind !== 'market') parts.push(`Budget <b>${fmt(s.budget)}</b>`);
  if (kind !== 'market' || s.marketLiquidOnly) parts.push(`ab <b>${fmt(s.minVolH)}</b> Stk/h`, `ab <b>${fmt(s.minTurnH)}</b> Umsatz/h`);
  if (kind === 'crafts') parts.push(`${s.craftBuy === 'insta' ? 'Instabuy' : 'Buy-Order'} → ${s.craftSell === 'insta' ? 'Instasell' : 'Sell-Offer'}`);
  return `<div class="toolbar">
      <div class="input ${S.search ? 'has' : ''}"><span class="mut">🔍</span><input id="search" placeholder="Item suchen…" value="${esc(S.search)}" autocomplete="off"><button class="clear" data-act="clearsearch" title="Suche leeren">✕</button></div>
      ${kind !== 'market' ? presetSeg() : ''}
      <div class="spacer"></div>
      <button class="btn" data-act="filters">⚙ Filter</button>
    </div>
    <div class="summary">${parts.join('<span class="dot">·</span>')}</div>`;
}

/* =========================================================
   Filter-Panel (rechts ausfahrend)
   ========================================================= */
function openDrawer(){ S.drawer = true; renderDrawer(); $('#drawer').classList.add('on'); $('#scrim').classList.add('on'); }
function closeDrawer(){ S.drawer = false; const d = $('#drawer'); if (d) d.classList.remove('on'); const sc = $('#scrim'); if (sc) sc.classList.remove('on'); }
function renderDrawer(){
  const kind = S.tab, secs = [];
  if (kind === 'market'){
    secs.push(`<div class="dsec"><h4>Anzeige</h4>${switchCtl('marketLiquidOnly', 'Nur gefragte Items', 'Blendet Items mit wenig Handel aus')}</div>`);
  } else {
    const cur = PRESETS[S.set.preset];
    secs.push(`<div class="dsec"><h4>Strategie</h4><div class="seg full">${Object.entries(PRESETS).map(([k,p]) => `<button data-preset="${k}" class="${S.set.preset === k ? 'on' : ''}">${p.icon} ${p.label}</button>`).join('')}</div>
      ${cur ? `<div class="rules"><p>${esc(cur.desc)}</p><ul>${presetRules(cur).map(x => `<li>${x}</li>`).join('')}</ul></div>`
            : '<div class="rules"><p>Eigene Einstellungen. Wähle eine Strategie, um alle Filter auf deren Werte zu setzen.</p></div>'}</div>`);
    secs.push(`<div class="dsec"><h4>Kapital</h4>${coinCtl('budget', 'Dein Budget', [1e6, 5e6, 10e6, 50e6, 100e6, 500e6], 'Kurzschreibweise geht: 10m, 2,5m, 500k, 1b')}${sliderCtl('share')}</div>`);
  }
  secs.push(`<div class="dsec"><h4>Nachfrage <span style="text-transform:none;letter-spacing:0;font-weight:400">· damit sich Orders schnell füllen</span></h4>${sliderCtl('minVolH')}${sliderCtl('minTurnH')}${sliderCtl('minBalance')}</div>`);
  if (kind === 'crafts'){
    secs.push(`<div class="dsec"><h4>Craft-Ablauf</h4>
      <div><span class="lbl">Zutaten kaufen per</span>${segCtl('craftBuy', [['order','Buy-Order'],['insta','Instabuy']], true)}</div>
      <div><span class="lbl">Ergebnis verkaufen per</span>${segCtl('craftSell', [['offer','Sell-Offer'],['insta','Instasell']], true)}</div></div>`);
    secs.push(`<div class="dsec"><h4>Gewinn</h4>${sliderCtl('craftMinPct')}${coinCtl('craftMinProfit', 'Min. Gewinn pro Craft')}${sliderCtl('maxPct')}</div>`);
  } else if (kind !== 'market'){
    secs.push(`<div class="dsec"><h4>Gewinn</h4>${sliderCtl('minPct')}${coinCtl('minProfit', 'Min. Gewinn pro Stück')}${sliderCtl('maxPct')}</div>`);
  }
  if (kind !== 'market') secs.push(`<div class="dsec"><h4>Sicherheit</h4>${sliderCtl('maxMove')}${switchCtl('hideRisky', 'Items mit ⚠ ausblenden', 'Preis-Ausreißer, Manipulation, kaum Handel')}</div>`);
  $('#drawer').innerHTML = `<div class="dh"><h2>Filter</h2><div class="spacer"></div><button class="btn icon ghost" data-act="closedrawer" title="Schließen">✕</button></div>
    <div class="db">${secs.join('')}</div>
    <div class="df"><button class="btn" data-preset="balanced">Zurücksetzen</button><button class="btn primary" data-act="closedrawer">Fertig</button></div>`;
}

/* =========================================================
   Seite: Startbildschirm (Tool-Auswahl)
   ========================================================= */
function pageHub(){
  const has = S.rows.length > 0;
  const flips = has ? filteredFlips(true) : [], crafts = has ? filteredCrafts(true) : [];
  const best = Math.max(0, ...flips.map(r => r.pph), ...crafts.map(c => c.pph));
  const stats = {
    bazaar: [['Bester Flip', has ? fmt(best) + '/h' : '…'], ['Passende Flips', has ? NF0.format(flips.length + crafts.length) : '…'], ['Watchlist', S.watch.length]],
  };
  return `<div class="hub">
    <div class="hubhead"><div class="coin">S</div><h1>SkyBlock Hub</h1><p>Wähle ein Tool</p></div>
    <div class="toolgrid">${TOOLS.map(t => `
      <div class="tool" data-nav="${t.id}">
        <div class="ti">${t.icon}</div><h2>${t.title}</h2><p>${t.desc}</p>
        ${stats[t.id] ? `<div class="tstats">${stats[t.id].map(([l,v]) => `<div><small>${l}</small><b>${v}</b></div>`).join('')}</div>` : ''}
        <div class="go"><span class="live"><i></i>${S.state === 'err' ? 'offline' : 'Live-Daten'}</span><span class="btn primary">Öffnen →</span></div>
      </div>`).join('')}
    </div>
    <p class="disclaimer">Inoffizielles Fan-Projekt – nicht mit Hypixel oder Mojang verbunden. Daten: offizielle Hypixel-API.</p>
  </div>`;
}

/* =========================================================
   Bazaar-Seiten (geben HTML zurück)
   ========================================================= */
const PAGES = {
  overview(){
    const flips = filteredFlips(true).sort((a,b) => b.pph - a.pph);
    const crafts = filteredCrafts(true).sort((a,b) => b.pph - a.pph);
    const liq = S.rows.filter(liquid);
    const movers = liq.filter(r => r.d1h != null).sort((a,b) => Math.abs(b.d1h) - Math.abs(a.d1h)).slice(0, 5);
    const has = S.rows.length > 0;
    const mini = (list, fn, emptyTxt) => list.length ? list.map(fn).join('') : `<div class="empty">${emptyTxt}</div>`;
    const flipItem = r => `<div class="it" data-open="${esc(r.id)}">${icon(r.id, r.name)}<div class="grow"><div class="nm">${esc(r.name)}</div><div class="sub">${price(r.buyAt)} → ${price(r.sellAt)} · ${fmt(r.perHour)} Stk/h</div></div><div class="val gold">${fmt(r.pph)}/h<small>${pct(r.marginPct, false)} Marge</small></div></div>`;
    const craftItem = c => `<div class="it" data-craft="${c.ri}">${icon(c.id, c.name)}<div class="grow"><div class="nm">${c.cnt > 1 ? c.cnt + '× ' : ''}${esc(c.name)}</div><div class="sub">${esc(c.ingredients)}</div></div><div class="val gold">${fmt(c.pph)}/h<small>${fmt(c.profit)} pro Craft</small></div></div>`;
    const moverItem = r => `<div class="it" data-open="${esc(r.id)}">${icon(r.id, r.name)}<div class="grow"><div class="nm">${esc(r.name)}</div><div class="sub">Instabuy ${price(r.topSell)}</div></div><div>${spark(r.id, 70, 22, 60)}</div><div class="val ${cls(r.d1h)}">${pct(r.d1h)}<small>1 h</small></div></div>`;
    const watchItem = id => { const r = S.byId[id]; return r ? `<div class="it" data-open="${esc(id)}">${icon(id, r.name)}<div class="grow"><div class="nm">${esc(r.name)}</div><div class="sub">${price(r.topSell)} / ${price(r.topBuy)}</div></div><div class="val ${cls(r.d1h)}">${pct(r.d1h)}<small>1 h</small></div></div>` : ''; };
    return `
      <div class="kpis">
        <div class="kpi accent"><div class="l">💰 Bester Flip</div><div class="v">${flips[0] ? fmt(flips[0].pph) + '/h' : '–'}</div><div class="s">${flips[0] ? esc(flips[0].name) : has ? 'nichts passend' : 'lade…'}</div></div>
        <div class="kpi accent"><div class="l">🔨 Bester Craft-Flip</div><div class="v">${crafts[0] ? fmt(crafts[0].pph) + '/h' : '–'}</div><div class="s">${crafts[0] ? esc(crafts[0].name) : has ? 'nichts passend' : 'lade…'}</div></div>
        <div class="kpi"><div class="l">✅ Gefragte Items</div><div class="v">${has ? NF0.format(liq.length) : '–'}</div><div class="s">von ${NF0.format(S.rows.length)} Bazaar-Produkten</div></div>
        <div class="kpi"><div class="l">🎯 Strategie</div><div class="v" style="font-family:Inter,sans-serif;font-size:20px">${PRESETS[S.set.preset]?.label || 'Eigene'}</div><div class="s">Budget ${fmt(S.set.budget)} · <a href="#" data-act="filters" style="color:var(--gold);text-decoration:none">ändern</a></div></div>
      </div>
      <div class="grid2">
        <div class="card mini"><h3>💰 Top Flips <button class="more" data-tab="flips">Alle ${flips.length} →</button></h3>${mini(flips.slice(0, 5), flipItem, has ? 'Keine Flips mit der aktuellen Strategie.' : 'Lade…')}</div>
        <div class="card mini"><h3>🔨 Top Craft-Flips <button class="more" data-tab="crafts">Alle ${crafts.length} →</button></h3>${mini(crafts.slice(0, 5), craftItem, has ? 'Keine Craft-Flips mit der aktuellen Strategie.' : 'Lade…')}</div>
        <div class="card mini"><h3>⚡ Größte Bewegungen (1 h) <button class="more" data-tab="market">Markt →</button></h3>${mini(movers, moverItem, has ? 'Noch zu wenig Verlauf – nach ein paar Minuten erscheinen hier die stärksten Preisbewegungen.' : 'Lade…')}</div>
        <div class="card mini"><h3>⭐ Watchlist <button class="more" data-tab="watch">Verwalten →</button></h3>${mini(S.watch.filter(id => S.byId[id]).slice(0, 5), watchItem, 'Noch leer – markiere Items mit ☆.')}</div>
      </div>`;
  },

  flips(){
    const rows = sortRows(filteredFlips(), 'flips');
    const {slice, html} = paginate('flips', rows);
    const max = Math.max(0, ...slice.map(r => r.pph));
    const head = `<tr>${th('', '', '', 1)}${th('flips','name','Item',1)}
      ${th('flips','buyAt','Kaufen → Verkaufen','', 'Grün: deine Buy-Order (höchste + 0,1) · Orange: deine Sell-Offer (niedrigste − 0,1)')}
      ${th('flips','profit','Gewinn/Stk','', 'Nach ' + NF2.format(S.set.tax) + ' % Bazaar-Steuer')}
      ${th('flips','perHour','Nachfrage','', 'Gehandelte Stück pro Stunde auf der schwächeren Seite')}
      ${th('flips','qty','Menge/h','', 'Realistisch: min(Budget, Stundenvolumen × dein Anteil)')}
      ${th('flips','pph','Profit/h')}${th('flips','d1h','Trend 1h')}</tr>`;
    const body = slice.map(r => `<tr data-open="${esc(r.id)}">
      <td style="width:36px">${starBtn(r.id)}</td>
      <td class="item">${itemCell(r.id, r.name, `${r.topBuyOrders + r.topSellOrders} Orders am Top-Preis`, r.risk)}</td>
      <td><div class="pricepair"><span class="b ${flash(r.id+'b', r.buyAt)}">${price(r.buyAt)}</span><span class="s ${flash(r.id+'s', r.sellAt)}">${price(r.sellAt)}</span></div></td>
      <td><span class="pos">${price(r.profit)}</span><div class="sub">${pct(r.marginPct, false)}</div></td>
      <td>${fmt(r.perHour)}<div class="sub">Stk/h</div></td>
      <td>${fmt(r.qty)}<div class="sub">${fmt(r.qty * r.buyAt)} Einsatz</div></td>
      <td>${bar(r.pph, max)}</td>
      <td class="${cls(r.d1h)}">${pct(r.d1h)}</td></tr>`).join('');
    return toolbar('flips', rows.length, 'Flips') + `<div class="tablewrap"><table><thead>${head}</thead><tbody>${body || emptyRow(8, 'Keine Flips gefunden', 'Probier eine andere Strategie oder lockere die Filter.')}</tbody></table>${html}</div>
      <p class="hint">💡 Buy-Order zum grünen Preis setzen, nach dem Füllen Sell-Offer zum orangen Preis. Klick auf eine Zeile für Verlauf & Orderbuch.</p>`;
  },

  crafts(){
    const rows = sortRows(filteredCrafts(), 'crafts');
    const {slice, html} = paginate('crafts', rows);
    const max = Math.max(0, ...slice.map(c => c.pph));
    const head = `<tr>${th('', '', '', 1)}${th('crafts','name','Rezept',1)}
      ${th('crafts','cost','Kosten → Erlös','', 'Kosten der Zutaten · Erlös nach Steuer')}
      ${th('crafts','profit','Gewinn/Craft')}
      ${th('crafts','craftsH','Crafts/h','', 'Was der Markt pro Stunde hergibt · Engpass-Item')}
      ${th('crafts','qty','Für dich/h','', 'Realistisch: min(Budget, Markt × dein Anteil)')}
      ${th('crafts','pph','Profit/h')}</tr>`;
    const body = slice.map(c => `<tr data-craft="${c.ri}">
      <td style="width:36px">${starBtn(c.id)}</td>
      <td class="item">${itemCell(c.id, (c.cnt > 1 ? c.cnt + '× ' : '') + c.name, esc(c.ingredients), c.risk)}</td>
      <td><div class="pricepair"><span class="b">${fmt(c.cost)}</span><span class="s">${fmt(c.revenue)}</span></div></td>
      <td><span class="${cls(c.profit)}">${fmt(c.profit)}</span><div class="sub">${pct(c.marginPct, false)} · sofort ${fmt(c.fastProfit)}</div></td>
      <td>${fmt(c.craftsH)}<div class="sub">Engpass: ${esc(c.limitingName)}</div></td>
      <td>${fmt(c.qty)}<div class="sub">${fmt(c.qty * c.cost)} Einsatz</div></td>
      <td>${bar(c.pph, max)}</td></tr>`).join('');
    return toolbar('crafts', rows.length, 'Craft-Flips') + `<div class="tablewrap"><table><thead>${head}</thead><tbody>${body || emptyRow(7, 'Keine Craft-Flips gefunden', 'Probier eine andere Strategie oder ändere den Craft-Ablauf im Filter.')}</tbody></table>${html}</div>
      <p class="hint">💡 Nur Rezepte, bei denen Ergebnis <b>und alle Zutaten</b> im Bazaar gehandelt und gefragt sind – kein Auction House. ${NF0.format(S.crafts.length)} von ${NF0.format(RECIPES.length)} Rezepten sind komplett über den Bazaar machbar. Du brauchst das Rezept freigeschaltet (Collection).</p>`;
  },

  npc(){
    const rows = sortRows(S.rows.filter(r => r.npc > 0 && r.npcOrder > 0 && liquid(r) && matchSearch(r)), 'npc');
    const {slice, html} = paginate('npc', rows);
    const max = Math.max(0, ...slice.map(r => r.npcTotal));
    const head = `<tr>${th('', '', '', 1)}${th('npc','name','Item',1)}${th('npc','npc','NPC zahlt')}
      ${th('npc','npcOrder','Per Buy-Order','', 'NPC-Preis − deine Buy-Order')}
      ${th('npc','npcInsta','Per Instabuy','', 'NPC-Preis − Instabuy')}
      ${th('npc','perHour','Nachfrage')}
      ${th('npc','npcTotal','Gewinn/Tag','', 'Gewinn/Stk × min(Budget, Tagesvolumen × Anteil)')}</tr>`;
    const body = slice.map(r => `<tr data-open="${esc(r.id)}">
      <td style="width:36px">${starBtn(r.id)}</td>
      <td class="item">${itemCell(r.id, r.name, '', r.risk)}</td>
      <td>${price(r.npc)}</td>
      <td><span class="${cls(r.npcOrder)}">${price(r.npcOrder)}</span><div class="sub">kaufen @ ${price(r.buyAt)}</div></td>
      <td><span class="${cls(r.npcInsta)}">${price(r.npcInsta)}</span><div class="sub">kaufen @ ${price(r.topSell)}</div></td>
      <td>${fmt(r.perHour)}<div class="sub">Stk/h</div></td>
      <td>${bar(r.npcTotal, max)}</td></tr>`).join('');
    return toolbar('npc', rows.length, 'NPC-Flips') + `<div class="tablewrap"><table><thead>${head}</thead><tbody>${body || emptyRow(7, 'Aktuell keine NPC-Flips', 'Gerade gibt es keine gefragten Items, die beim NPC mehr bringen.')}</tbody></table>${html}</div>
      <p class="hint">💡 Hypixel begrenzt, wie viele Coins du pro Tag durch NPC-Verkäufe verdienen kannst – prüfe dein Limit im Spiel.</p>`;
  },

  market(){
    const rows = sortRows(S.rows.filter(r => matchSearch(r) && (!S.set.marketLiquidOnly || liquid(r))), 'market');
    const {slice, html} = paginate('market', rows);
    const head = `<tr>${th('', '', '', 1)}${th('market','name','Item',1)}
      ${th('market','topSell','Instabuy','', 'Niedrigste Sell-Offer – das zahlst du beim Sofortkauf')}
      ${th('market','topBuy','Instasell','', 'Höchste Buy-Order – das bekommst du beim Sofortverkauf')}
      ${th('market','spreadPct','Spread')}${th('market','d1h','1 h')}${th('market','d24h','24 h')}
      ${th('market','wVol','Volumen/Woche')}${th('', '', 'Verlauf')}</tr>`;
    const body = slice.map(r => `<tr data-open="${esc(r.id)}">
      <td style="width:36px">${starBtn(r.id)}</td>
      <td class="item">${itemCell(r.id, r.name, liquid(r) ? '<span class="pos">● gefragt</span>' : '', r.risk)}</td>
      <td class="${flash(r.id+'S', r.topSell)}">${price(r.topSell)}</td>
      <td class="${flash(r.id+'B', r.topBuy)}">${price(r.topBuy)}</td>
      <td class="mut">${pct(r.spreadPct, false)}</td>
      <td class="${cls(r.d1h)}">${pct(r.d1h)}</td><td class="${cls(r.d24h)}">${pct(r.d24h)}</td>
      <td>${fmt(r.wVol)}<div class="sub">${fmt(r.wBuy)} / ${fmt(r.wSell)}</div></td>
      <td>${spark(r.id)}</td></tr>`).join('');
    return toolbar('market', rows.length, 'Produkte') + `<div class="tablewrap"><table><thead>${head}</thead><tbody>${body || emptyRow(9, 'Nichts gefunden', '')}</tbody></table>${html}</div>`;
  },

  watch(){
    const cards = S.watch.map(id => {
      const r = S.byId[id];
      if (!r) return `<div class="wcard"><div class="top">${icon(id)}<b>${esc(pretty(id))}</b><div class="spacer"></div>${starBtn(id)}</div><p class="mut">${S.rows.length ? 'Aktuell nicht im Bazaar.' : 'Lade…'}</p></div>`;
      const n = S.alerts.filter(a => a.id === id).length;
      return `<div class="wcard" data-open="${esc(id)}">
        <div class="top">${icon(id, r.name)}<div style="min-width:0;flex:1"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</b><span class="mut" style="font-size:12px">${n ? '🔔 ' + n + ' Alarm' + (n > 1 ? 'e' : '') : 'kein Alarm'}</span></div>${starBtn(id)}</div>
        <div class="prices"><div><div class="l">Instabuy</div><div class="v">${price(r.topSell)}</div></div><div><div class="l">Instasell</div><div class="v">${price(r.topBuy)}</div></div></div>
        ${spark(id, 240, 40, 180)}
        <div class="foot"><span>1 h <b class="${cls(r.d1h)}">${pct(r.d1h)}</b></span><span>24 h <b class="${cls(r.d24h)}">${pct(r.d24h)}</b></span><span>Flip <b class="${cls(r.profit)}">${price(r.profit)}</b></span></div>
      </div>`;
    }).join('');
    const al = S.alerts.map((a, i) => {
      const r = S.byId[a.id], c = CONDS[a.cond];
      return `<tr data-open="${esc(a.id)}"><td class="item">${itemCell(a.id, r ? r.name : pretty(a.id))}</td><td class="l" style="font-family:Inter,sans-serif">${c ? c.label : a.cond} <b>${price(a.value)}</b></td>
        <td>${r && c ? price(c.get(r)) : '–'}</td><td class="mut" style="font-family:Inter,sans-serif">${a.last ? 'ausgelöst vor ' + ago(Date.now() - a.last) : 'wartet'}</td>
        <td><button class="btn sm danger" data-delalert="${i}">Entfernen</button></td></tr>`;
    }).join('');
    return `${S.watch.length ? `<div class="wgrid">${cards}</div>` : '<div class="card empty"><b>⭐ Noch nichts auf der Watchlist</b>Klick bei einem Item auf ☆, um es hier zu verfolgen.</div>'}
      <div class="sectiontitle">🔔 Preis-Alarme</div>
      <div class="tablewrap"><table><thead><tr><th class="l nosort">Item</th><th class="l nosort">Bedingung</th><th class="nosort">Aktuell</th><th class="nosort">Status</th><th class="nosort"></th></tr></thead>
      <tbody>${al || emptyRow(5, 'Keine Alarme', 'Öffne ein Item und lege im Detailfenster einen Alarm an.')}</tbody></table></div>`;
  },

  settings(){
    const notif = ('Notification' in window) ? Notification.permission : 'nicht unterstützt';
    const notifTxt = {granted:'erlaubt ✓', denied:'im Browser blockiert', default:'noch nicht erlaubt'}[notif] || notif;
    return `<div class="settings">
      <div class="card"><h3>💼 Kapital & Steuer</h3>
        ${coinCtl('budget', 'Dein Budget', [1e6, 5e6, 10e6, 50e6, 100e6, 500e6], 'Kurzschreibweise geht: 10m, 2,5m, 500k, 1b')}
        <div><span class="lbl">Bazaar-Steuer</span>${segCtl('tax', [[1.25,'1,25 %'],[1.125,'1,125 %'],[1,'1 %']], true)}
          <small class="mut" style="display:block;font-size:11.5px;margin-top:6px">Standard 1,25 %. Mit dem Community-Shop-Upgrade „Bazaar Flipper" weniger.</small></div>
        ${sliderCtl('share')}
      </div>
      <div class="card"><h3>🔄 Live-Daten</h3>
        ${sliderCtl('interval')}
        <div><span class="lbl">Einträge pro Seite</span>${segCtl('pageSize', [[25,'25'],[50,'50'],[100,'100'],[250,'250']], true)}</div>
        <p>${S.polls} Abrufe in dieser Sitzung · läuft seit ${ago(Date.now() - S.sessionStart)}.</p>
      </div>
      <div class="card"><h3>🔔 Alarme</h3>
        ${switchCtl('sound', 'Ton bei Alarm')}
        <p>Desktop-Benachrichtigungen: <b>${notifTxt}</b></p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="notif">Benachrichtigungen erlauben</button><button class="btn" data-act="test">Test-Alarm</button></div>
      </div>
      <div class="card"><h3>🗄 Preisverlauf</h3>
        <div><span class="lbl">Aufbewahren für</span>${segCtl('retentionH', [[24,'1 Tag'],[48,'2 Tage'],[72,'3 Tage'],[168,'7 Tage']], true)}</div>
        <p>${fmt(histPoints())} Datenpunkte für ${NF0.format(Object.keys(S.hist).length)} Items, nur lokal in diesem Browser${DB.db ? '' : ' – <b class="neg">Speicher nicht verfügbar, Verlauf nur bis zum Neuladen</b>'}.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="export">Als JSON exportieren</button><button class="btn danger" data-act="clear">Verlauf löschen</button></div>
      </div>
      <div class="card"><h3>🌐 Daten & Reset</h3>
        <p>Bazaar & Item-Namen: offizielle Hypixel-API (kein Key nötig). Rezepte: NotEnoughUpdates-Repo, ${NF0.format(RECIPES.length)} Crafting-Rezepte, wöchentlich aktualisiert.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="items">Item-Namen neu laden</button><button class="btn danger" data-act="reset">Alle Einstellungen zurücksetzen</button></div>
      </div>
    </div>`;
  },
};
function emptyRow(cols, title, txt){ return `<tr style="cursor:default"><td colspan="${cols}" class="empty" style="font-family:Inter,sans-serif;white-space:normal"><b>${title}</b>${txt}</td></tr>`; }

/* =========================================================
   Detailansicht Item
   ========================================================= */
function openDetail(id){ closeDrawer(); S.craftDetail = null; S.detail = id; $('#modal').classList.add('on'); renderDetail(false); }
function closeDetail(){ S.detail = null; S.craftDetail = null; const m = $('#modal'); if (m) m.classList.remove('on'); }
function book(arr, color, label){
  const top = (arr || []).slice(0, 12);
  const mx = Math.max(1, ...top.map(o => o.amount));
  let cum = 0;
  return `<table class="book"><thead><tr><th class="l">${label}</th><th>Menge</th><th>Orders</th><th>Kumuliert</th></tr></thead><tbody>${
    top.map(o => { cum += o.amount; return `<tr><td class="l" style="color:${color}">${price(o.pricePerUnit)}</td><td>${fmt(o.amount)}<div class="barbg" style="width:${(o.amount/mx*100).toFixed(0)}%;background:${color}"></div></td><td class="mut">${o.orders}</td><td class="mut">${fmt(cum)}</td></tr>`; }).join('')
    || '<tr><td colspan="4" class="empty">leer</td></tr>'}</tbody></table>`;
}
function bigIcon(id, name){ return icon(id, name).replace('class="ic"', 'class="ic lg"'); }
function renderDetail(update){
  const id = S.detail, r = S.byId[id], p = S.products[id];
  if (!r || !p) return;
  const h = S.hist[id];
  const big = [
    ['Instabuy', `<span style="color:var(--orange)">${price(r.topSell)}</span>`],
    ['Instasell', `<span style="color:var(--green)">${price(r.topBuy)}</span>`],
    ['Flip-Gewinn/Stk', `<span class="${cls(r.profit)}">${price(r.profit)}</span>`],
    ['Profit/h (Schätzung)', `<span class="gold">${fmt(r.pph)}</span>`],
  ];
  const small = [
    ['Deine Buy-Order', price(r.buyAt)], ['Deine Sell-Offer', price(r.sellAt)], ['Marge', pct(r.marginPct, false)], ['Spread', pct(r.spreadPct, false)],
    ['Instabuys / Woche', fmt(r.wBuy)], ['Instasells / Woche', fmt(r.wSell)], ['Nachfrage', fmt(r.perHour) + ' Stk/h'], ['Gefragt', liquid(r) ? '<span class="pos">ja ✓</span>' : '<span class="neg">nein</span>'],
    ['Max. Stk mit Budget', fmt(r.maxQty)], ['Einsatz je Order', fmt(r.maxQty * r.buyAt)], ['Trend 1 h / 24 h', `<span class="${cls(r.d1h)}">${pct(r.d1h)}</span> / <span class="${cls(r.d24h)}">${pct(r.d24h)}</span>`], ['NPC-Preis', price(r.npc)],
  ];
  const statsHtml = `<div class="bigstats">${big.map(([l,v]) => `<div class="stat"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('')}</div>
    <div class="stats">${small.map(([l,v]) => `<div class="stat"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('')}</div>`;
  if (update){
    $('#dStats').innerHTML = statsHtml;
    $('#dBuy').innerHTML = book(p.sell_summary, '#3fcf8e', 'Preis');
    $('#dSell').innerHTML = book(p.buy_summary, '#ff9f43', 'Preis');
    drawChart(); return;
  }
  const alerts = S.alerts.map((a, i) => ({a, i})).filter(x => x.a.id === id);
  const watched = S.watch.includes(id);
  $('#sheet').innerHTML = `
    <div class="head">
      <div class="itemcell" style="max-width:none">${bigIcon(id, r.name)}<div><h2>${esc(r.name)}</h2><div class="subid">${esc(id)}${S.tiers[id] ? ' · ' + esc(S.tiers[id]) : ''} · ${NF0.format(h ? h.t.length : 0)} Datenpunkte</div></div></div>
      <div class="spacer"></div>
      <button class="btn" data-act="copy" title="Namen kopieren, um ihn in /bz einzufügen">📋 Name kopieren</button>
      <button class="btn" data-star="${esc(id)}">${watched ? '★ Auf Watchlist' : '☆ Zur Watchlist'}</button>
      <button class="btn icon" data-act="close" title="Schließen">✕</button>
    </div>
    ${r.risk.length ? `<div class="banner warnb" style="margin:14px 0 0">⚠ ${r.risk.map(esc).join('<br>⚠ ')}</div>` : ''}
    <div id="dStats">${statsHtml}</div>
    <div class="subcard">
      <h3>Preisverlauf <span class="legend"><span><i style="background:#ff9f43"></i>Instabuy</span><span><i style="background:#3fcf8e"></i>Instasell</span></span>
        <span class="spacer"></span>
        <span class="seg">${[[HOUR,'1h'],[6*HOUR,'6h'],[24*HOUR,'24h'],[Infinity,'Alles']].map(([v,l]) => `<button class="${S.detailRange === v ? 'on' : ''}" data-range="${v}">${l}</button>`).join('')}</span></h3>
      <div class="chartbox"><canvas id="chart"></canvas><div class="tip" id="tip"></div></div>
    </div>
    <div class="grid2" style="margin-top:14px">
      <div class="subcard"><h3>🟢 Buy-Orders <span class="mut" style="font-weight:400">· hier füllt sich deine Buy-Order</span></h3><div id="dBuy">${book(p.sell_summary, '#3fcf8e', 'Preis')}</div></div>
      <div class="subcard"><h3>🟠 Sell-Offers <span class="mut" style="font-weight:400">· hier steht deine Sell-Offer</span></h3><div id="dSell">${book(p.buy_summary, '#ff9f43', 'Preis')}</div></div>
    </div>
    <div class="subcard" style="margin-top:14px"><h3>🔔 Preis-Alarm</h3>
      <div class="alertrow">
        <select id="alCond">${Object.entries(CONDS).map(([k,c]) => `<option value="${k}">${c.label}</option>`).join('')}</select>
        <div class="input"><input id="alVal" inputmode="decimal" placeholder="z. B. 1,5k" value="${r.topSell ? coinText(r1(r.topSell)) : ''}"><span class="unit">Coins</span></div>
        <button class="btn primary" data-act="addalert">Alarm anlegen</button>
      </div>
      ${alerts.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${alerts.map(({a,i}) => `<span class="pill">${CONDS[a.cond].label} ${price(a.value)} <button class="star" style="font-size:12px" data-delalert="${i}" title="entfernen">✕</button></span>`).join('')}</div>` : ''}
    </div>`;
  drawChart();
}

/* =========================================================
   Detailansicht Craft
   ========================================================= */
function openCraft(ri){ closeDrawer(); S.detail = null; S.craftDetail = ri; $('#modal').classList.add('on'); renderCraftDetail(); }
function renderCraftDetail(){
  const c = S.crafts.find(x => x.ri === S.craftDetail);
  if (!c){ $('#sheet').innerHTML = '<div class="empty"><b>Rezept aktuell nicht verfügbar</b></div><button class="btn" data-act="close">Schließen</button>'; return; }
  const o = S.byId[c.id], s = S.set;
  const rowFor = (r, q, unit, label) => `<tr data-open="${esc(r.id)}"><td class="item">${itemCell(r.id, r.name, '', r.risk)}</td><td>${fmt(q)}</td><td>${price(unit)}</td><td>${fmt(unit * q)}</td>
    <td>${fmt(r.perHour)}<div class="sub">Stk/h</div></td><td class="${liquid(r) ? 'pos' : 'neg'}">${liquid(r) ? '✓' : '✗'}</td><td class="mut" style="font-family:Inter,sans-serif">${label}</td></tr>`;
  const big = [['Kosten/Craft', fmt(c.cost)], ['Erlös/Craft (n. Steuer)', fmt(c.revenue)], ['Gewinn/Craft', `<span class="${cls(c.profit)}">${fmt(c.profit)}</span>`], ['Profit/h', `<span class="gold">${fmt(c.pph)}</span>`]];
  const small = [['Marge', pct(c.marginPct, false)], ['Sofort-Gewinn (Insta/Insta)', `<span class="${cls(c.fastProfit)}">${fmt(c.fastProfit)}</span>`], ['Crafts/h Markt', fmt(c.craftsH)], ['Crafts/h für dich', fmt(c.qty)], ['Max. Crafts mit Budget', fmt(Math.floor(s.budget / c.cost))], ['Engpass', esc(c.limitingName)]];
  $('#sheet').innerHTML = `
    <div class="head">
      <div class="itemcell" style="max-width:none">${bigIcon(c.id, c.name)}<div><h2>🔨 ${c.cnt > 1 ? c.cnt + '× ' : ''}${esc(c.name)}</h2><div class="subid">Craft-Flip · ${esc(c.id)}</div></div></div>
      <div class="spacer"></div>
      <button class="btn" data-star="${esc(c.id)}">${S.watch.includes(c.id) ? '★ Auf Watchlist' : '☆ Zur Watchlist'}</button>
      <button class="btn icon" data-act="close" title="Schließen">✕</button>
    </div>
    ${c.risk.length ? `<div class="banner warnb" style="margin:14px 0 0">⚠ ${c.risk.map(esc).join('<br>⚠ ')}</div>` : ''}
    <div class="bigstats">${big.map(([l,v]) => `<div class="stat"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('')}</div>
    <div class="stats">${small.map(([l,v]) => `<div class="stat"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('')}</div>
    <div class="tablewrap"><table><thead><tr><th class="l nosort">Item</th><th class="nosort">Menge</th><th class="nosort">Stückpreis</th><th class="nosort">Summe</th><th class="nosort">Nachfrage</th><th class="nosort">Gefragt</th><th class="nosort">Wie</th></tr></thead><tbody>
      ${c.parts.map(p => rowFor(S.byId[p.id], p.q, p.unit, s.craftBuy === 'insta' ? 'Instabuy' : 'Buy-Order')).join('')}
      <tr style="cursor:default"><td colspan="7" style="background:var(--panel2);text-align:left;font-family:Inter,sans-serif;color:var(--mut);padding:7px 16px">⬇ craften ergibt</td></tr>
      ${rowFor(o, c.cnt, s.craftSell === 'offer' ? o.sellAt : o.topBuy, s.craftSell === 'offer' ? 'Sell-Offer' : 'Instasell')}
    </tbody></table></div>
    <p class="hint">💡 Klick auf ein Item öffnet dessen Preisverlauf & Orderbuch.</p>`;
}
function rerenderModal(){ if (S.detail) renderDetail(false); else if (S.craftDetail != null) renderCraftDetail(); }

/* Nach jedem Datenabruf */
function render(){ renderMain(); }

/* =========================================================
   Chart (ohne externe Bibliothek)
   ========================================================= */
let chartState = null;
function drawChart(){
  const cv = document.getElementById('chart'); if (!cv) return;
  const h = S.hist[S.detail];
  const box = cv.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = box.width * dpr; cv.height = box.height * dpr;
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = box.width, H = box.height, L = 74, R = 12, T = 10, B = 26;
  ctx.clearRect(0, 0, W, H);
  ctx.font = '11px JetBrains Mono, monospace';
  const msg = t => { ctx.fillStyle = '#8b98a7'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, W/2, H/2); chartState = null; };
  if (!h || h.t.length < 2) return msg('Noch zu wenig Verlauf – ab jetzt wird bei jedem Update aufgezeichnet.');
  const end = h.t[h.t.length-1], start = isFinite(S.detailRange) ? end - S.detailRange : h.t[0];
  let i0 = h.t.findIndex(t => t >= start); if (i0 < 0) i0 = 0;
  const t = h.t.slice(i0), b = h.b.slice(i0), s = h.s.slice(i0);
  const vals = b.concat(s).filter(v => v > 0);
  if (t.length < 2 || !vals.length) return msg('Keine Daten in diesem Zeitraum.');
  let mn = Math.min(...vals), mx = Math.max(...vals);
  if (mn === mx){ mn *= .99; mx *= 1.01; }
  const pad = (mx - mn) * .08; mn -= pad; mx += pad;
  const t0 = t[0], t1 = t[t.length-1] === t0 ? t0 + 1 : t[t.length-1];
  const X = v => L + (v - t0) / (t1 - t0) * (W - L - R);
  const Y = v => T + (1 - (v - mn) / (mx - mn)) * (H - T - B);
  ctx.strokeStyle = '#1e2630'; ctx.fillStyle = '#8b98a7'; ctx.lineWidth = 1; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++){
    const v = mn + (mx - mn) * i / 4, y = Y(v);
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke();
    ctx.fillText(price(v), L - 8, y);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const span = t1 - t0;
  for (let i = 0; i <= 5; i++){
    const tv = t0 + span * i / 5, d = new Date(tv);
    const lab = span > 20*HOUR ? d.toLocaleString('de-AT', {weekday:'short', hour:'2-digit', minute:'2-digit'})
      : d.toLocaleTimeString('de-AT', span < 10*60e3 ? {hour:'2-digit', minute:'2-digit', second:'2-digit'} : {hour:'2-digit', minute:'2-digit'});
    ctx.fillText(lab, X(tv), H - B + 8);
  }
  ctx.fillStyle = 'rgba(245,185,66,.06)'; ctx.beginPath();
  for (let i = 0; i < t.length; i++) ctx.lineTo(X(t[i]), Y(s[i] || b[i]));
  for (let i = t.length-1; i >= 0; i--) ctx.lineTo(X(t[i]), Y(b[i] || s[i]));
  ctx.closePath(); ctx.fill();
  const line = (arr, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath(); let started = false;
    for (let i = 0; i < t.length; i++){
      if (!(arr[i] > 0)){ started = false; continue; }
      const x = X(t[i]), y = Y(arr[i]);
      if (!started){ ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  line(s, '#ff9f43'); line(b, '#3fcf8e');
  chartState = {t, b, s, X, Y, L, R, W, H, T, B};
}
function chartHover(e){
  const cs = chartState, tip = $('#tip'); if (!cs || !tip) return;
  const rect = e.target.getBoundingClientRect(), x = e.clientX - rect.left;
  if (x < cs.L || x > cs.W - cs.R){ tip.style.display = 'none'; drawChart(); return; }
  let best = 0, bd = Infinity;
  for (let i = 0; i < cs.t.length; i++){ const d = Math.abs(cs.X(cs.t[i]) - x); if (d < bd){ bd = d; best = i; } }
  drawChart();
  const ctx = e.target.getContext('2d'), px = cs.X(cs.t[best]);
  ctx.strokeStyle = '#4a5562'; ctx.setLineDash([3,3]); ctx.beginPath(); ctx.moveTo(px, cs.T); ctx.lineTo(px, cs.H - cs.B); ctx.stroke(); ctx.setLineDash([]);
  for (const [arr, col] of [[cs.s,'#ff9f43'],[cs.b,'#3fcf8e']]) if (arr[best] > 0){ ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, cs.Y(arr[best]), 4, 0, 7); ctx.fill(); }
  const sp = cs.s[best] && cs.b[best] ? cs.s[best] - cs.b[best] : null;
  tip.innerHTML = `${new Date(cs.t[best]).toLocaleString('de-AT')}<br><span style="color:#ff9f43">Instabuy ${price(cs.s[best])}</span><br><span style="color:#3fcf8e">Instasell ${price(cs.b[best])}</span>${sp != null ? `<br><span style="color:#8b98a7">Spread ${price(sp)}</span>` : ''}`;
  tip.style.display = 'block';
  tip.style.left = Math.min(px + 12, rect.width - tip.offsetWidth - 4) + 'px';
  tip.style.top = '8px';
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
function refreshControls(){ if (S.drawer) renderDrawer(); if (S.tab === 'settings') renderMain(true); }
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
  if ((el = q('[data-range]'))){ S.detailRange = +el.dataset.range; renderDetail(false); return; }
  if ((el = q('[data-craft]'))){ openCraft(+el.dataset.craft); return; }
  if ((el = q('[data-open]'))){ openDetail(el.dataset.open); return; }
  if (t.id === 'modal'){ closeDetail(); return; }
  if (t.id === 'scrim'){ closeDrawer(); return; }
  if (q('#refreshBtn')){ poll(); return; }
  if ((el = q('#pauseBtn'))){ S.paused = !S.paused; el.textContent = S.paused ? '▶' : '⏸'; if (S.paused) schedule(); else poll(); tick(); return; }
  const act = (el = q('[data-act]')) && el.dataset.act;
  if (!act) return;
  e.preventDefault();
  if (act === 'close') closeDetail();
  else if (act === 'filters') openDrawer();
  else if (act === 'closedrawer') closeDrawer();
  else if (act === 'clearsearch'){ S.search = ''; S.pageNo[S.tab] = 0; renderMain(true); const s = $('#search'); if (s) s.focus(); }
  else if (act === 'copy'){
    const name = S.byId[S.detail]?.name || '';
    const done = () => { el.textContent = '✓ Kopiert'; setTimeout(() => el.textContent = '📋 Name kopieren', 1500); };
    (navigator.clipboard ? navigator.clipboard.writeText(name) : Promise.reject()).then(done).catch(() => {
      const ta = document.createElement('textarea'); ta.value = name; document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); done(); }catch{} ta.remove();
    });
  }
  else if (act === 'addalert'){
    const inp = $('#alVal'), v = parseCoins(inp.value);
    if (!isFinite(v) || v <= 0){ inp.parentElement.style.borderColor = 'var(--red)'; inp.focus(); return; }
    S.alerts.push({id: S.detail, cond: $('#alCond').value, value: v, last: 0});
    save('alerts', S.alerts);
    if (!S.watch.includes(S.detail)){ S.watch.push(S.detail); save('watch', S.watch); }
    renderDetail(false); renderMain(true);
  }
  else if (act === 'notif'){ try{ Notification.requestPermission().then(() => renderMain(true)); }catch{} }
  else if (act === 'test') notify('Test-Alarm', 'So sieht ein Preis-Alarm aus.');
  else if (act === 'clear'){ if (el.dataset.sure){ S.hist = {}; DB.clear(); renderMain(true); } else { el.dataset.sure = 1; el.textContent = 'Wirklich löschen? Nochmal klicken'; } }
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
});
document.addEventListener('keydown', e => {
  const tag = document.activeElement.tagName;
  if (e.key === 'Escape'){ if ($('#modal').classList.contains('on')) closeDetail(); else if (S.drawer) closeDrawer(); return; }
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.coin){ e.target.blur(); return; }
  if (e.key === 'Enter' && e.target.id === 'alVal'){ document.querySelector('[data-act=addalert]').click(); return; }
  if (e.key === '/' && !['INPUT','SELECT','TEXTAREA'].includes(tag)){ const s = $('#search'); if (s){ e.preventDefault(); s.focus(); } }
});
document.addEventListener('mousemove', e => { if (e.target.id === 'chart') chartHover(e); });
document.addEventListener('mouseleave', e => { if (e.target.id === 'chart'){ const tp = $('#tip'); if (tp) tp.style.display = 'none'; drawChart(); } }, true);
window.addEventListener('resize', () => { if (S.detail) drawChart(); });
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
