'use strict';
// Bazaar Flipper: Konstanten, Strategien (Sicher/Ausgewogen/Riskant), Einstellungen, gemeinsamer Zustand S.
/* =========================================================
   Konstanten & Zustand
   ========================================================= */
const API = CFG.hypixel + 'skyblock/bazaar';
const ITEMS_API = CFG.hypixel + 'resources/skyblock/items';
// Spread-Verlauf der letzten 7 Tage je Item (alle 6 h aus SkyCofl-Daten erzeugt, siehe tools/build_market.mjs)
const STATS_URL = CFG.data + 'bazaar_stats.json';
const MAX_ORDER = 71680;
const HOUR = 3600e3;
const LS = 'bzt:';

const DEFAULTS = {
  interval: 20, tax: 1.25, budget: 10_000_000, share: 10,
  preset: 'balanced',
  minVolH: 100, minTurnH: 2_000_000, minBalance: 30,
  minProfit: 1, minPct: 2, maxPct: 50, maxDev: 8, hideRisky: true, maxSpreadRatio: 2.5, minOkShare: 50,
  craftBuy: 'order', craftSell: 'offer', craftMinProfit: 0, craftMinPct: 3,
  marketLiquidOnly: false,
  retentionH: 48, pageSize: 50, sound: true, theme: 'system', minCycle: 5,
};
// Strategien: setzen alle Nachfrage-, Margen- und Stabilitätsfilter auf einen Schlag.
//  Sicher     – Orders füllen sich in Minuten, Preise stabil, dafür kleine Margen
//  Ausgewogen – gefragte Items mit spürbarer Marge
//  Riskant    – auch langsame/schwankende Items, aber nur wenn die Marge das Risiko bezahlt
const PRESETS = {
  safe:     {label:'Sicher', desc:'Sehr gefragte, stabile Items. Orders füllen sich schnell, Margen sind klein.',
             minVolH: 500, minTurnH: 10_000_000, minBalance: 50, minPct: 1, maxPct: 20,  craftMinPct: 2, maxDev: 3,    hideRisky: true,  maxSpreadRatio: 1.5,  minOkShare: 70},
  balanced: {label:'Ausgewogen', desc:'Gefragte Items mit spürbarer Marge – der beste Mix aus Tempo und Gewinn.',
             minVolH: 100, minTurnH: 2_000_000,  minBalance: 30, minPct: 2, maxPct: 50,  craftMinPct: 3, maxDev: 8,    hideRisky: true,  maxSpreadRatio: 2.5,  minOkShare: 50},
  risky:    {label:'Riskant', desc:'Auch langsame oder schwankende Items – dafür muss die Marge hoch sein.',
             minVolH: 10,  minTurnH: 250_000,    minBalance: 10, minPct: 5, maxPct: 300, craftMinPct: 5, maxDev: 1000, hideRisky: false, maxSpreadRatio: 1000, minOkShare: 0},
};
const PRESET_KEYS = ['minVolH','minTurnH','minBalance','minPct','maxPct','craftMinPct','maxDev','hideRisky','maxSpreadRatio','minOkShare'];
// Klartext der Kriterien einer Strategie (für das Filter-Panel)
function presetRules(p){
  return [
    `mind. <b>${fmt(p.minVolH)}</b> Stück/h auf beiden Seiten`,
    `mind. <b>${fmt(p.minTurnH)}</b> Coins Umsatz/h`,
    `schwächere Seite ≥ <b>${p.minBalance} %</b> der stärkeren`,
    `Marge <b>${NF1.format(p.minPct)}–${NF0.format(p.maxPct)} %</b> (Craft ≥ ${NF1.format(p.craftMinPct)} %)`,
    p.maxDev >= 1000 ? 'Ausreißer im Orderbuch erlaubt' : `Top-Preis höchstens <b>${NF1.format(p.maxDev)} %</b> vom Durchschnitt im Orderbuch entfernt`,
    p.maxSpreadRatio >= 1000 ? 'Spread darf beliebig vom Üblichen abweichen' : `Spread höchstens <b>${NF1.format(p.maxSpreadRatio)}-mal</b> so groß wie in den letzten 7 Tagen üblich`,
    p.minOkShare > 0 ? `Flip war in den letzten 7 Tagen mind. <b>${p.minOkShare} %</b> der Zeit lohnend` : 'Spread-Verlauf der letzten 7 Tage egal',
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
  minCycle:    {label:'Mindestens pro Durchlauf', steps:[1,2,3,5,10,15,30,60], f: v => v + ' min', hint:'Zeit, die du pro Kaufen-und-Verkaufen-Runde mindestens brauchst (Orders setzen, abholen, neu einstellen).'},
  maxDev:      {label:'Max. Ausreißer im Orderbuch', steps:[1,2,3,5,8,10,15,25,50,1000], f: v => v >= 1000 ? 'aus' : NF1.format(v) + ' %', hint:'Wie weit der oberste Preis vom gewichteten Durchschnitt der besten Orders abweichen darf. Fängt einzelne Lock- oder Dump-Orders ab.'},
  maxSpreadRatio: {label:'Max. Spread gegenüber üblich', steps:[1.2,1.5,2,2.5,3,4,6,1000], f: v => v >= 1000 ? 'aus' : NF1.format(v) + '-fach', hint:'Ist der Spread gerade viel größer als in den letzten 7 Tagen üblich, ist der hohe Gewinn meist nur kurz da: Der Preis kehrt zurück, bevor deine Sell-Offer gefüllt ist.'},
  minOkShare:  {label:'Lohnend in den letzten 7 Tagen', steps:[0,25,40,50,60,70,80,90], f: v => v ? 'mind. ' + v + ' % der Zeit' : 'aus', hint:'Wie oft der Spread in den letzten 7 Tagen groß genug war, um nach Steuer Gewinn zu machen. Ein Flip, der fast immer lohnt, ist verlässlicher.'},
  interval:    {label:'Aktualisierung alle', steps:[10,15,20,30,45,60,120], f: v => v + ' s', hint:'Hypixel aktualisiert den Bazaar etwa alle 20 Sekunden.'},
};

function load(k, d){ try{ const v = localStorage.getItem(LS+k); return v ? JSON.parse(v) : d; }catch{ return d; } }
function save(k, v){ try{ localStorage.setItem(LS+k, JSON.stringify(v)); }catch{} }

const S = {
  set: {},
  products: {}, rows: [], byId: {}, crafts: [], stats: null, statsErr: false,
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
const DEFAULT_SORT = {flips:{k:'pphTyp',d:-1}, crafts:{k:'pph',d:-1}, market:{k:'wVol',d:-1}, npc:{k:'npcTotal',d:-1}};
// Eingaben dieses Browsers laden
function applyState(d){
  S.set = Object.assign({}, DEFAULTS, d.settings || {});
  if (S.set.preset === 'aggressive') S.set.preset = 'risky';           // alte Bezeichnung
  if (S.set.maxDev == null) S.set.maxDev = (PRESETS[S.set.preset] || PRESETS.balanced).maxDev;
  delete S.set.maxMove;
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
