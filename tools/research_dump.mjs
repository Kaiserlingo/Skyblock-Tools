// Einmaliger Forschungs-Export für die Preisprognose: komplette Tagesverläufe aller Bazaar-Items
// (SkyCofl, seitenweise über 2000 Punkte hinaus), 2-Stunden-Punkte der letzten 7 Tage und die
// Tagesverläufe der meistgehandelten Auction-House-Items. Ergebnis: research.json.gz
import {writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {get as getJSON, pool as runPool} from './lib/http.mjs';
const C = 'https://sky.coflnet.com/api/', UA = {'User-Agent': 'SkyBlockTools-Forschung (github.com/Kaiserlingo/Skyblock-Tools)'};
const AH_N = +(process.argv[2] || 600);
const get = url => getJSON(url, {tries: 6, timeout: 40e3, ua: UA});
const pool = (items, n, fn) => runPool(items, n, fn, {gap: 100, every: 100});
const pu = s => Date.parse(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');
async function bzAll(id){
  const seen = new Set(), out = []; let end = new Date().toISOString();
  for (let page = 0; page < 6; page++){
    const arr = await get(C + `bazaar/${encodeURIComponent(id)}/history?start=2019-06-01T00:00:00Z&end=${end}`);
    if (!Array.isArray(arr) || !arr.length) break;
    let added = 0, first = Infinity;
    for (const o of arr){ const t = pu(o.timestamp); if (!isFinite(t)) continue; first = Math.min(first, t); if (!seen.has(t)){ seen.add(t); out.push([t, o.buy, o.sell, o.buyVolume, o.sellVolume, o.buyMovingWeek, o.sellMovingWeek, o.maxBuy, o.minBuy, o.maxSell, o.minSell]); added++; } }
    if (arr.length < 1900 || !added) break;
    end = new Date(first).toISOString();
  }
  return out.sort((a, b) => a[0] - b[0]);
}
async function bz7(id){
  const now = Date.now();
  const arr = await get(C + `bazaar/${encodeURIComponent(id)}/history?start=${new Date(now - 6.9 * 864e5).toISOString()}&end=${new Date(now).toISOString()}`);
  return (arr || []).map(o => [pu(o.timestamp), o.buy, o.sell, o.buyVolume, o.sellVolume, o.buyMovingWeek, o.sellMovingWeek]).sort((a, b) => a[0] - b[0]);
}
const bz = await get('https://api.hypixel.net/v2/skyblock/bazaar');
const ids = Object.keys(bz.products).filter(id => !id.startsWith('BAZAAR_COOKIE'));
console.log('Bazaar', ids.length);
const full = await pool(ids, 4, bzAll);
const week = await pool(ids, 4, bz7);
const px = await get('https://raw.githubusercontent.com/Kaiserlingo/Skyblock-Tools/data/prices.json');
const ah = Object.entries(px.items).sort((a, b) => (b[1].n || 0) - (a[1].n || 0)).slice(0, AH_N).map(x => x[0]);
console.log('AH', ah.length);
const ahFull = await pool(ah, 4, async tag => (await get(C + `item/price/${encodeURIComponent(tag)}/history/full`) || []).map(o => [pu(o.time), o.min, o.max, o.avg, o.volume]).sort((a, b) => a[0] - b[0]));
const mayors = await get(C + `mayor?from=2020-01-01T00:00:00.000Z&to=${new Date().toISOString()}`).catch(() => null);
const out = {built: Date.now(), bz: {}, bz7: {}, ah: {}, mayors};
ids.forEach((id, i) => { if (full[i]) out.bz[id] = full[i]; if (week[i]) out.bz7[id] = week[i]; });
ah.forEach((t, i) => { if (ahFull[i]) out.ah[t] = ahFull[i]; });
writeFileSync('research.json.gz', gzipSync(JSON.stringify(out)));
console.log('fertig', Object.keys(out.bz).length, Object.keys(out.ah).length);
