// Baut prices.json: Lowest BIN für jedes Item im Auktionshaus, direkt aus allen aktiven Hypixel-Auktionen.
// Läuft alle 10 Minuten als GitHub Action (.github/workflows/prices.yml).
// Aufruf: node tools/build_prices.mjs <ausgabe.json> [vorherige.json]
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {aggregate, decodeItemBytes, itemKey} from './ah_lib.mjs';

const OUT = process.argv[2] || 'prices.json', PREV = process.argv[3];
const H = 'https://api.hypixel.net/v2/skyblock/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 5){
  for (let k = 0; k < tries; k++){
    try{
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 30e3);
      const r = await fetch(url, {signal: ctl.signal}); clearTimeout(to);
      if (r.status === 429){ await sleep(5000 * (k + 1)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(); if (!j.success) throw new Error('success=false'); return j;
    }catch(e){ if (k === tries - 1) throw new Error(url + ': ' + e.message); await sleep(1500 * (k + 1)); }
  }
}
// Alle Seiten müssen zum selben Stand gehören, sonst fehlen oder doppeln sich Auktionen
async function scan(){
  for (let attempt = 0; attempt < 7; attempt++){
    const p0 = await get(H + 'auctions?page=0');
    const rest = [];
    for (let i = 1; i < p0.totalPages; i += 8) rest.push(...await Promise.all(Array.from({length: Math.min(8, p0.totalPages - i)}, (_, k) => get(H + 'auctions?page=' + (i + k)))));
    const pages = [p0, ...rest], stamps = new Set(pages.map(p => p.lastUpdated));
    if (stamps.size === 1) return {pages, lastUpdated: p0.lastUpdated, total: p0.totalAuctions};
    console.log('Stand hat sich während des Abrufs geändert, neuer Versuch …'); await sleep(4000);
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
