'use strict';
// Bazaar Flipper: Preisverläufe von SkyCofl (mit Rückfall auf den eigenen Verlauf).
/* =========================================================
   Preisverlauf: SkyCofl (sky.coflnet.com) mit Rückfall auf den Browser-Verlauf
   ========================================================= */
const COFL = CFG.cofl + 'bazaar/';
const RANGES = {
  '1h':    {label: '1 h',     path: '/history/hour', span: HOUR},
  '24h':   {label: '24 h',    path: '/history/day',  span: 24*HOUR},
  '7d':    {label: '7 Tage',  path: '/history/week', span: 7*24*HOUR},
  '30d':   {label: '31 Tage', days: 31,              span: 31*24*HOUR},
  '90d':   {label: '90 Tage', days: 90,              span: 90*24*HOUR},
  '1y':    {label: '1 Jahr',  days: 365,             span: 365*24*HOUR},
  'all':   {label: 'Alles',   start: '2019-06-01T00:00:00Z', span: Infinity},
  'local': {label: 'Browser', local: true},
};
const chartPrefs = Object.assign({mrange: '24h', arange: '24h', hi: true, lo: true, spread: true, volume: true, sma: false, ema: false, bb: false}, load('chartPrefs', {}));
function savePrefs(){ save('chartPrefs', chartPrefs); }
const histCache = {};
function rangeSeg(attr, cur, keys){ return `<div class="seg">${keys.map(k => `<button data-${attr}="${k}" class="${cur === k ? 'on' : ''}">${RANGES[k].label}</button>`).join('')}</div>`; }

/* Trend (1 h / 24 h) aus dem SkyCofl-Tagesverlauf – für alle Nutzer gleich.
   Wird nur für Watchlist, Detailfenster und Analyse-Seite geladen (wenige Items, Cache 10 min). */
const trendCache = {}, trendQueue = [];
let trendBusy = false;
function wantTrend(ids){
  const now = Date.now();
  for (const id of ids){
    const t = trendCache[id];
    if ((!t || now - t.at > 600e3) && !trendQueue.includes(id)) trendQueue.push(id);
  }
  pumpTrends();
}
async function pumpTrends(){
  if (trendBusy || !trendQueue.length) return;
  trendBusy = true;
  const id = trendQueue.shift();
  const res = await loadHistory(id, '24h');
  if (res.source === 'cofl' && res.data.t.length > 1){
    const d = res.data, n = d.t.length, last = d.hi[n - 1];
    let i1 = n - 1; while (i1 > 0 && d.t[i1] > d.t[n - 1] - HOUR) i1--;
    const first = d.hi.find(v => v != null), h1 = d.hi[i1];
    trendCache[id] = {at: Date.now(), d1h: h1 && last ? (last - h1) / h1 * 100 : null, d24h: first && last ? (last - first) / first * 100 : null, spark: d.hi.slice(-96)};
  } else trendCache[id] = {at: Date.now(), d1h: null, d24h: null, spark: null, failed: true};
  const r = S.byId[id]; if (r){ r.d1h = trendCache[id].d1h; r.d24h = trendCache[id].d24h; }
  trendBusy = false;
  if (!trendQueue.length) renderMain(); else setTimeout(pumpTrends, 700);
}
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
/* Gesamter Bazaar-Verlauf: SkyCofl liefert höchstens 2000 Tagespunkte pro Anfrage (≈ 5,5 Jahre).
   Ist die Antwort voll, wird der Zeitraum davor nachgeladen, bis nichts mehr kommt. Cache 1 h. */
const allHistCache = {};
async function coflAll(id){
  const c = allHistCache[id];
  if (c && Date.now() - c.at < HOUR) return c.arr;
  const seen = new Set(), out = [];
  let end = new Date().toISOString();
  for (let page = 0; page < 6; page++){
    const r = await fetch(COFL + encodeURIComponent(id) + `/history?start=2019-06-01T00:00:00Z&end=${end}`);
    if (!r.ok) throw new Error(r.status === 429 ? 'zu viele Anfragen' : 'HTTP ' + r.status);
    const arr = await r.json();
    if (!Array.isArray(arr) || !arr.length) break;
    let added = 0, first = Infinity;
    for (const o of arr){ const t = parseUtc(o.timestamp); if (!isFinite(t)) continue; first = Math.min(first, t); if (!seen.has(t)){ seen.add(t); out.push(o); added++; } }
    if (arr.length < 1900 || !added || !isFinite(first)) break;
    end = new Date(first).toISOString();
  }
  allHistCache[id] = {at: Date.now(), arr: out};
  return out;
}
async function loadHistory(id, range){
  const R = RANGES[range] || RANGES['24h'];
  if (R.local) return {data: localSeries(id), source: 'local'};
  const key = id + '|' + range, c = histCache[key];
  if (c && Date.now() - c.at < 120e3) return {data: cloneSeries(c.data), source: 'cofl'};
  const url = COFL + encodeURIComponent(id) + (R.days || R.start
    ? `/history?start=${R.start || new Date(Date.now() - R.days * 864e5).toISOString()}&end=${new Date().toISOString()}`
    : R.path);
  try{
    let arr;
    if (R.start) arr = await coflAll(id);
    else {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status === 429 ? 'zu viele Anfragen' : 'HTTP ' + r.status);
      arr = await r.json();
    }
    if (!Array.isArray(arr) || !arr.length) throw new Error('keine Daten');
    const pts = arr.map(o => ({t: parseUtc(o.timestamp), a: +o.buy || 0, b: +o.sell || 0, ov: o.buyVolume, bv: o.sellVolume}))
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
// SkyCofl liefert UTC-Zeiten ohne Zeitzone ("2026-11-19T08:03:28.982") – Date.parse würde sie als Ortszeit lesen
// und den Verlauf in Österreich um 1 h (Sommer 2 h) verschieben.
function parseUtc(ts){
  if (typeof ts === 'number') return ts;
  if (typeof ts !== 'string') return NaN;
  return Date.parse(/(Z|[+-]\d\d:?\d\d)$/i.test(ts) ? ts : ts + 'Z');
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
