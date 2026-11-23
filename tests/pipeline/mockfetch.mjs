// Ersetzt fetch durch erfundene, aber realistisch geformte Antworten (nur für den Trockenlauf)
// Wird von tests/test_pipeline.mjs mit node --import geladen.
const DAY = 864e5, now = Date.now();
const ids = ['ENCHANTED_DIAMOND','DIAMOND','ENCHANTED_WHEAT','WHEAT','ENCHANTED_BREAD','ESSENCE_WITHER','ENCHANTMENT_SHARPNESS_5','ENCHANTED_COAL','COAL','ENCHANTED_RAW_FISH','RAW_FISH','ENCHANTED_OAK_LOG','LOG','SUMMONING_EYE'];
let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const products = {};
for (const id of ids){ const p = 10 + rnd() * 1000;
  products[id] = {product_id: id, quick_status: {buyPrice: p * 1.02, sellPrice: p, buyMovingWeek: 1e6 * rnd() + 1e5, sellMovingWeek: 1e6 * rnd() + 1e5},
    sell_summary: [{amount: 100, pricePerUnit: p, orders: 1}], buy_summary: [{amount: 100, pricePerUnit: p * 1.02, orders: 1}]}; }
const hist = id => { let p = products[id].quick_status.sellPrice; const out = [];
  for (let d = 366; d >= 0; d--){ p *= Math.exp((rnd() - .5) * .06); if (id === 'COAL' && d < 100) continue;
    out.push({buy: p * 1.02, sell: p, buyMovingWeek: 5e5, sellMovingWeek: 5e5 * (1 + (366 - d) / 366), timestamp: new Date(now - d * DAY + 3600e3 * 2).toISOString().slice(0, 19)}); }
  return out.reverse(); };
const fmt = t => { const d = new Date(t), z = n => String(n).padStart(2, '0'); return `${z(d.getUTCMonth()+1)}/${z(d.getUTCDate())}/${d.getUTCFullYear()} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}:00`; };
const mayors = []; const names = ['Cole','Diana','Marina','Aatrox','Finnegan','Paul','Diaz'];
for (let s = 1794635700000 + 29.33 * 3600e3 - 140 * 124 * 3600e3, k = 0; s < now + 124 * 3600e3; s += 124 * 3600e3, k++)
  mayors.push({start: fmt(s) + ' +00:00', end: fmt(s + 124 * 3600e3), winner: {name: names[k % 7], key: 'k', perks: [{name: 'P'}], minister: {name: 'Paul', key: 'dungeons', perk: {name: 'EZPZ'}}}});
const R = {
  'skyblock/bazaar': {success: true, lastUpdated: now, products},
  'resources/skyblock/items': {success: true, items: ids.map(i => ({id: i, name: i.toLowerCase()}))},
  'resources/skyblock/collections': {success: true, collections: {MINING: {items: {DIAMOND: {}, COAL: {}}}, FARMING: {items: {WHEAT: {}}}, FISHING: {items: {RAW_FISH: {}}}, FORAGING: {items: {LOG: {}}}}},
  'skyblock/news': {success: true, items: [{title: 'SkyBlock v0.27.3', text: '17th November 2026', link: 'x'}, {title: 'v0.27.2', text: '6th October 2026', link: 'y'}, {title: 'v0.25', text: '26th May 2026', link: 'z'}]},
  'resources/skyblock/election': {success: true, mayor: {name: 'Marina', key: 'fishing', perks: [{name: 'A'}], minister: {name: 'Cole'}}},
};
globalThis.fetch = async (url) => {
  const u = String(url); let body;
  for (const k in R) if (u.includes('hypixel.net/v2/' + k)) body = R[k];
  if (u.endsWith('/api/items')) body = ids.map(i => ({tag: i, name: 'N ' + i}));
  if (u.includes('/api/mayor?')) body = mayors;
  if (u.endsWith('/data/prices.json')) body = {lastUpdated: now, items: {}};
  const m = u.match(/bazaar\/([^/]+)\/history/); if (m) body = hist(decodeURIComponent(m[1]));
  if (body === undefined) return {ok: false, status: 404, json: async () => null};
  return {ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body))};
};
