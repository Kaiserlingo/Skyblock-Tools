// Baut market.json: Tagesdaten aller Bazaar-Items, Preisindizes, Wirkung von Updates und Mayors.
// Läuft als GitHub Action (siehe .github/workflows/market-data.yml).
// Aufruf: node tools/build_market.mjs <ausgabe.json> [--limit N]
import {createRequire} from 'node:module';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const E = require(join(ROOT, 'js', 'econ.js'));
const DAY = E.DAY;
const OUT = process.argv[2] || 'market.json';
const LIMIT = process.argv.includes('--limit') ? +process.argv[process.argv.indexOf('--limit') + 1] : Infinity;
const H = 'https://api.hypixel.net/v2/', C = 'https://sky.coflnet.com/api/';
const UA = {'User-Agent': 'SkyBlockTools-Marktanalyse (github.com/Kaiserlingo/Skyblock-Tools)'};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAYS = 366;              // ein Jahr + heute
const LIQUID = 5e6;            // Coins Umsatz pro Tag, ab dem ein Item in Ranglisten zählt
const INDEX_MIN = 2e7;         // … und ab dem es in die Preisindizes kommt
const MIN_WEEK = 700;          // mindestens so viele Instabuys UND Instasells pro Woche (100 pro Tag)
const r4 = x => x == null || !isFinite(x) ? null : Math.round(x * 1e4) / 1e4;
const r6 = x => x == null || !isFinite(x) ? null : Math.round(x * 1e6) / 1e6;
const sig = x => x == null || !isFinite(x) ? null : +x.toPrecision(5);

async function get(url, tries = 5){
  for (let k = 0; k < tries; k++){
    try{
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 30e3);
      const r = await fetch(url, {headers: UA, signal: ctl.signal}); clearTimeout(to);
      if (r.status === 204) return [];
      if (r.status === 429){ await sleep(15e3 * (k + 1)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    }catch(e){ if (k === tries - 1) throw new Error(url + ': ' + e.message); await sleep(2000 * 2 ** k); }
  }
  throw new Error(url + ': zu viele Anfragen');
}
async function pool(items, n, fn){
  const out = new Array(items.length); let i = 0, done = 0;
  await Promise.all(Array.from({length: n}, async () => {
    while (i < items.length){ const k = i++; try{ out[k] = await fn(items[k]); }catch(e){ out[k] = null; console.warn(e.message); }
      if (++done % 200 === 0) console.log(`  ${done}/${items.length}`); await sleep(120); }
  }));
  return out;
}

const now = Date.now(), today = E.dayStart(now);
console.log('Lade Grunddaten …');
const [bz, itemsRes, coll, news, election, coflItems, mayorsRaw] = await Promise.all([
  get(H + 'skyblock/bazaar'), get(H + 'resources/skyblock/items'), get(H + 'resources/skyblock/collections'),
  get(H + 'skyblock/news'), get(H + 'resources/skyblock/election'), get(C + 'items'),
  get(C + `mayor?from=${new Date(now - 730 * DAY).toISOString()}&to=${new Date(now).toISOString()}`),
]);
if (!bz.success || Object.keys(bz.products || {}).length < (process.env.MOCK ? 1 : 100)) throw new Error('Bazaar-Antwort unvollständig');
const recipes = JSON.parse(readFileSync(join(ROOT, 'data', 'recipes.json'), 'utf8'));
const names = {};
for (const it of coflItems || []) if (it.tag && it.name) names[it.tag] = it.name;
for (const it of itemsRes.items || []) names[it.id] = it.name.replace(/§./g, '');

/* ---------- Kategorien (js/categories.js, dieselbe Einteilung wie auf der Website) ---------- */
const Cat = require(join(ROOT, 'js', 'categories.js'));
const SECTORS = Object.fromEntries(Cat.ORDER.map(k => [k, Cat.CATS[k]]));
const sector = Cat.make(itemsRes.items || [], coll.collections || {}, recipes);
const P = bz.products;

/* ---------- Mayor-Amtszeiten ---------- */
const terms = (Array.isArray(mayorsRaw) ? mayorsRaw : []).map(m => ({
  name: m.winner && m.winner.name, key: m.winner && m.winner.key,
  perks: (m.winner && m.winner.perks || []).map(p => p.name).filter(Boolean),
  minister: m.winner && m.winner.minister ? {name: m.winner.minister.name, key: m.winner.minister.key, perk: m.winner.minister.perk && m.winner.minister.perk.name} : null,
  start: E.parseMayorTime(m.start), end: E.parseMayorTime(m.end),
})).filter(m => m.name && isFinite(m.start) && isFinite(m.end)).sort((a, b) => a.start - b.start);
const newsList = (news.items || []).map(n => ({title: n.title, link: n.link, date: E.parseNewsDate(n.text)})).filter(n => isFinite(n.date)).sort((a, b) => b.date - a.date);

/* ---------- Verläufe aller Bazaar-Items (1 Jahr, Tagesdaten von SkyCofl) ---------- */
let ids = Object.keys(P).filter(id => { const q = P[id].quick_status || {}; return (q.buyMovingWeek || 0) + (q.sellMovingWeek || 0) > 0; });
ids.sort((a, b) => turnover(b) - turnover(a));
if (isFinite(LIMIT)) ids = ids.slice(0, LIMIT);
// Umsatz pro Tag, vorsichtig gerechnet: beide Seiten mit dem Instasell-Preis (der Instabuy-Preis kann bei leerem Angebot absurd hoch stehen)
function turnover(id){ const q = P[id].quick_status || {}; return ((q.buyMovingWeek || 0) + (q.sellMovingWeek || 0)) * (q.sellPrice || q.buyPrice || 0) / 7; }
function tradedBoth(id){ const q = P[id].quick_status || {}; return (q.buyMovingWeek || 0) >= MIN_WEEK && (q.sellMovingWeek || 0) >= MIN_WEEK && q.sellPrice > 0 && q.buyPrice > 0 && q.buyPrice / q.sellPrice <= 1.5; }
console.log(`Lade Verläufe für ${ids.length} Items …`);
// Raster: die letzten DAYS vollen Tage bis gestern (UTC). Der lange Verlauf kommt als Tagespunkte,
// die letzten 7 Tage in 2-Stunden-Punkten (SkyCofl schreibt die Tagespunkte erst mit Verzögerung).
const END = today - DAY;
const from = new Date(END - (DAYS + 2) * DAY).toISOString(), to = new Date(now).toISOString(), from7 = new Date(now - 6.9 * DAY).toISOString(), CUT = END - 5 * DAY;   // SkyCofl liefert 2-Stunden-Punkte nur für Zeiträume bis 7 Tage
const hist = await pool(ids, 4, async id => {
  const [a, b] = [await get(C + `bazaar/${encodeURIComponent(id)}/history?start=${from}&end=${to}`), await get(C + `bazaar/${encodeURIComponent(id)}/history?start=${from7}&end=${to}`).catch(() => [])];
  return {a, b};
});

const series = {};
ids.forEach((id, k) => {
  const h = hist[k]; if (!h || !Array.isArray(h.a) || !h.a.length) return;
  const conv = arr => (Array.isArray(arr) ? arr : []).map(o => ({t: E.parseUtc(o.timestamp), v: E.bazaarPrice(o), mw: (+o.buyMovingWeek || 0) + (+o.sellMovingWeek || 0)})).filter(p => isFinite(p.t));
  const recent = conv(h.b), pts = E.mergeRecent(conv(h.a), recent, CUT);
  // Ø-Marktpreis der letzten 24 Stunden (Bezug für „Preissprung“ auf der Startseite)
  const last24 = recent.filter(p => p.t > now - DAY && p.v > 0).map(p => p.v);
  if (pts.length) series[id] = {pts, first: Math.min(...pts.map(p => p.t)), p24: last24.length >= 6 ? E.mean(last24) : null};
});
const T = Array.from({length: DAYS}, (_, i) => END - (DAYS - 1 - i) * DAY);
for (const id in series){
  const s = series[id];
  s.v = E.hampel(E.daily(s.pts, {days: DAYS, end: END}).v);
  s.vol = E.daily(s.pts.map(p => ({t: p.t, v: p.mw})), {days: DAYS, end: END}).v;
  delete s.pts;
}
console.log(`Verläufe: ${Object.keys(series).length} von ${ids.length}`);

/* ---------- Preisindizes ---------- */
const cover = v => v.filter(x => x != null).length / v.length;
const inIndex = ids.filter(id => series[id] && turnover(id) >= INDEX_MIN && tradedBoth(id) && cover(series[id].v) >= .95 && series[id].v[0] != null);
const spi = E.chainIndex(inIndex.map(id => ({v: series[id].v, w: turnover(id)})), DAYS);
const secIdx = {};
for (const s in SECTORS){
  const m = inIndex.filter(id => sector(id) === s);
  if (m.length >= 3) secIdx[s] = {v: E.chainIndex(m.map(id => ({v: series[id].v, w: turnover(id)})), DAYS).v.map(r6), n: m.length};
}

/* ---------- Wirkung von Updates (Patchnotes) ---------- */
const liquidIds = ids.filter(id => series[id] && turnover(id) >= LIQUID && tradedBoth(id) && cover(series[id].v) >= .8);
const W = 3;   // Ereignis-Fenster in Tagen (siehe E.eventReturns)
const calm = id => { const x = E.volatility(series[id].v, 30); return x != null && x <= .25; };
const updates = newsList.map(n => {
  const m = E.eventReturns(T, spi.v, n.date, [1, 3, 7, 14], W);
  const sec = {}; for (const s in secIdx) sec[s] = r4(E.eventReturns(T, secIdx[s].v, n.date, [7], W).d7);
  const rows = [];
  for (const id of liquidIds){ if (!calm(id)) continue; const r = E.eventReturns(T, series[id].v, n.date, [7], W).d7; if (r != null && m.d7 != null) rows.push([id, r4(r - m.d7), r4(r)]); }
  rows.sort((a, b) => b[1] - a[1]);
  const big = rows.filter(r => Math.abs(r[1]) >= .1).length;
  return {title: n.title, link: n.link, date: n.date, spi: {d1: r4(m.d1), d3: r4(m.d3), d7: r4(m.d7), d14: r4(m.d14)}, sec, n: rows.length, big,
          top: rows.slice(0, 10), flop: rows.slice(-10).reverse()};
});

/* ---------- Wirkung der Mayors (je Amtszeit, gegenüber dem Markt) ---------- */
const doneTerms = terms.filter(m => m.end <= now && m.start >= T[0] + 6 * DAY);
const spiTerms = E.termReturns(T, spi.v, doneTerms);
const spiByStart = new Map(spiTerms.map(x => [x.start, x.ret]));
const mayorFx = {};
for (const g of Object.entries(E.groupBy(spiTerms, 'name', 'ret'))) mayorFx[g[0]] = {terms: g[1].n, spi: r4(g[1].median), spiMean: r4(g[1].mean), sec: {}, top: [], flop: []};
for (const s in secIdx){
  const g = E.groupBy(E.termReturns(T, secIdx[s].v, doneTerms), 'name', 'ret');
  for (const k in g) if (mayorFx[k]) mayorFx[k].sec[s] = r4(g[k].median);
}
const itemMy = {};
for (const id of ids){
  if (!series[id]) continue;
  const rows = E.termReturns(T, series[id].v, doneTerms).map(x => ({name: x.name, abn: spiByStart.has(x.start) ? x.ret - spiByStart.get(x.start) : null}));
  const g = E.groupBy(rows, 'name', 'abn'); const o = {};
  for (const k in g) o[k] = [r4(g[k].median), g[k].n, r4(g[k].up), r4(g[k].mean)];
  itemMy[id] = o;
}
for (const k in mayorFx){
  const rows = liquidIds.filter(id => calm(id) && itemMy[id] && itemMy[id][k] && itemMy[id][k][1] >= 3).map(id => [id, itemMy[id][k][0], itemMy[id][k][1], itemMy[id][k][2]]);
  rows.sort((a, b) => b[1] - a[1]); mayorFx[k].top = rows.slice(0, 10); mayorFx[k].flop = rows.slice(-10).reverse(); mayorFx[k].n = rows.length;
}

/* ---------- Kennzahlen je Item ---------- */
const items = {};
for (const id of ids){
  const s = series[id], q = P[id].quick_status || {};
  const o = {n: names[id] || null, s: sector(id), to: Math.round(turnover(id)), liq: liquidIds.includes(id) ? 1 : 0, idx: inIndex.includes(id) ? 1 : 0, bp: sig(q.buyPrice), sp: sig(q.sellPrice), bw: q.buyMovingWeek || 0, sw: q.sellMovingWeek || 0};
  if (s){
    const L = E.lastIdx(s.v);
    Object.assign(o, {p: sig(L >= 0 ? s.v[L] : null), p24: sig(s.p24), c1: r4(E.change(s.v, 1)), c7: r4(E.change(s.v, 7)), c30: r4(E.change(s.v, 30)), c90: r4(E.change(s.v, 90)), c365: r4(E.change(s.v, DAYS - 1)),
      v30: r4(E.volatility(s.v, 30)), dd: r4(E.maxDrawdown(s.v).dd), first: s.first,
      vt: r4((() => { const a = E.mean(s.vol.slice(-90)), b = E.mean(s.vol.slice(-180, -90)); return a != null && b ? a / b - 1 : null; })()),
      w: T.filter((_, i) => i % 7 === (DAYS - 1) % 7).map((_, k) => sig(s.v[(DAYS - 1) % 7 + k * 7])), my: itemMy[id]});
    const b = E.beta(s.v, spi.v); if (b) Object.assign(o, {beta: r4(b.b), r2: r4(b.r2)});
  }
  items[id] = o;
}

const cur = election.mayor || {};
const out = {
  v: 5, eventWindow: W, recentCut: CUT, built: now, days: {from: T[0], to: T[T.length - 1]}, liquid: LIQUID, indexMin: INDEX_MIN, minWeek: MIN_WEEK,
  sources: {bazaar: bz.lastUpdated, history: 'SkyCofl (sky.coflnet.com)', news: 'Hypixel /skyblock/news', mayors: 'SkyCofl /api/mayor'},
  sectors: Object.fromEntries(Object.entries(SECTORS).filter(([k]) => ids.some(id => sector(id) === k)).map(([k, l]) => [k, {label: l, items: ids.filter(id => sector(id) === k).length, index: secIdx[k] ? secIdx[k].n : 0}])),
  index: {spi: spi.v.map(r6), n: spi.n, sec: Object.fromEntries(Object.entries(secIdx).map(([k, x]) => [k, x.v]))},
  news: newsList, updates, terms: terms.slice(-80), mayorFx,
  election: {mayor: cur.name ? {name: cur.name, key: cur.key, perks: (cur.perks || []).map(p => p.name), minister: cur.minister ? cur.minister.name : null} : null},
  items,
};
writeFileSync(OUT, JSON.stringify(out));
console.log(`Fertig: ${Object.keys(items).length} Items, Index aus ${spi.n} Items, ${updates.length} Updates, ${Object.keys(mayorFx).length} Mayors, ${(JSON.stringify(out).length / 1e6).toFixed(2)} MB`);
