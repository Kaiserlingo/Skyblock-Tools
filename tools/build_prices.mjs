// Baut prices.json: Lowest BIN für jedes Item im Auktionshaus, direkt aus allen aktiven Hypixel-Auktionen.
// Läuft alle 10 Minuten als GitHub Action (.github/workflows/prices.yml).
// Aufruf: node tools/build_prices.mjs <ausgabe.json> [vorherige.json]
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {aggregate, decodeItemBytes, itemKey} from './lib/ah.mjs';
import {get as getJSON, sleep} from './lib/http.mjs';

const OUT = process.argv[2] || 'prices.json', PREV = process.argv[3];
const H = 'https://api.hypixel.net/v2/skyblock/';
// Hypixel verlangt success=true; bei 429 kurz warten (die Auktionsseiten sind nicht gedrosselt)
const get = url => getJSON(url, {success: true, wait429: 5000, pause: 1500, tries: 5});
// Alle Seiten müssen zum selben Stand gehören, sonst fehlen oder doppeln sich Auktionen.
// Hypixel liefert einzelne Seiten manchmal noch aus einem älteren Cache: diese Seiten werden
// gezielt neu geholt, bis alle denselben (neuesten) Stand haben.
async function scan(depth = 0){
  const p0 = await get(H + 'auctions?page=0');
  const pages = [p0];
  for (let i = 1; i < p0.totalPages; i += 8) pages.push(...await Promise.all(Array.from({length: Math.min(8, p0.totalPages - i)}, (_, k) => get(H + 'auctions?page=' + (i + k)))));
  for (let round = 0; round < 12; round++){
    const target = Math.max(...pages.map(p => p.lastUpdated));
    const stale = pages.map((p, i) => p.lastUpdated < target ? i : -1).filter(i => i >= 0);
    if (!stale.length && pages.every(p => p.totalPages === pages.length)) return {pages, lastUpdated: target, total: pages[0].totalAuctions};
    if (pages.some(p => p.totalPages !== pages.length)){   // Seitenzahl hat sich geändert: alles neu
      if (depth >= 3) break; console.log('Seitenzahl geändert, alles neu …'); await sleep(3000); return scan(depth + 1);
    }
    console.log(`${stale.length} Seiten mit älterem Stand, neu holen (Runde ${round + 1}) …`);
    await sleep(2500);
    const fresh = await Promise.all(stale.map(i => get(H + 'auctions?page=' + i)));
    stale.forEach((i, k) => { pages[i] = fresh[k]; });
  }
  throw new Error('kein einheitlicher Stand der Auktionen');
}

const t0 = Date.now();
const {pages, lastUpdated, total} = await scan();
const auctions = pages.flatMap(p => p.auctions);
if (auctions.length < total * .98 || auctions.length < (process.env.MOCK ? 1 : 1000)) throw new Error(`unvollständig: ${auctions.length} von ${total}`);
const {items, bad} = aggregate(auctions);
// Verkäufe der letzten 60 Sekunden
const ended = await get(H + 'auctions_ended').catch(() => ({auctions: []}));
const sales = {};
for (const a of ended.auctions || []){
  let k; try{ k = itemKey(decodeItemBytes(a.item_bytes)); }catch{ continue; }
  if (!k) continue; const p = a.price / k.count;
  if (!sales[k.tag] || a.timestamp > sales[k.tag][1]) sales[k.tag] = [p, a.timestamp, a.bin ? 1 : 0];
}
// Letzten bekannten Stand übernehmen, damit Items ohne Angebot ihren letzten Preis behalten
let prev = {items: {}};
if (PREV && existsSync(PREV)){ try{ prev = JSON.parse(readFileSync(PREV, 'utf8')); }catch{} }
const out = {};
const tags = new Set([...Object.keys(items), ...Object.keys(prev.items || {}), ...Object.keys(sales)]);
for (const tag of tags){
  const cur = items[tag], old = (prev.items || {})[tag] || {};
  const o = {};
  if (cur && cur.b != null){ o.b = cur.b; o.l5 = cur.l5; o.n = cur.n; o.seen = lastUpdated; }
  else { o.b = null; o.n = 0; if (old.last != null || old.b != null){ o.last = old.b != null ? old.b : old.last; o.seen = old.seen; } }
  if (cur){ if (cur.a) o.a = cur.a; if (cur.hb) o.hb = cur.hb; if (cur.v) o.v = cur.v; o.name = cur.name; } else if (old.name) o.name = old.name;
  const s = sales[tag] || old.s; if (s) o.s = s;
  if (o.b == null && o.last == null && !o.s && !o.a) continue;
  out[tag] = o;
}
const res = {v: 1, built: Date.now(), lastUpdated, auctions: auctions.length, bins: auctions.filter(a => a.bin).length, undecodable: bad, items: out};
writeFileSync(OUT, JSON.stringify(res));
console.log(`Fertig in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${auctions.length} Auktionen, ${Object.keys(items).length} Items mit Angebot, ${Object.keys(out).length} Items gesamt, ${bad} nicht lesbar, ${(JSON.stringify(res).length / 1e6).toFixed(2)} MB`);
