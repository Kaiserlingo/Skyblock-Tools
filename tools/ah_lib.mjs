// Auktionshaus: Item-Daten (NBT) lesen und jeder Auktion die richtige Item-ID zuordnen.
import {gunzipSync} from 'node:zlib';

// Minecraft-NBT (unkomprimiert) lesen. Gibt das Wurzel-Compound als Objekt zurück.
export function readNBT(buf){
  let o = 0;
  const u8 = () => buf.readUInt8(o++), i8 = () => buf.readInt8(o++);
  const i16 = () => { const v = buf.readInt16BE(o); o += 2; return v; };
  const i32 = () => { const v = buf.readInt32BE(o); o += 4; return v; };
  const str = () => { const l = buf.readUInt16BE(o); o += 2; const s = buf.toString('utf8', o, o + l); o += l; return s; };
  function pay(t){
    switch (t){
      case 1: return i8();
      case 2: return i16();
      case 3: return i32();
      case 4: { const v = buf.readBigInt64BE(o); o += 8; return Number(v); }
      case 5: { const v = buf.readFloatBE(o); o += 4; return v; }
      case 6: { const v = buf.readDoubleBE(o); o += 8; return v; }
      case 7: { const l = i32(); o += l; return null; }
      case 8: return str();
      case 9: { const et = i8(), l = i32(), a = []; for (let k = 0; k < l; k++) a.push(pay(et)); return a; }
      case 10: { const c = {}; for (;;){ const tt = u8(); if (tt === 0) break; const n = str(); c[n] = pay(tt); } return c; }
      case 11: { const l = i32(); o += l * 4; return null; }
      case 12: { const l = i32(); o += l * 8; return null; }
      default: throw new Error('unbekannter NBT-Typ ' + t);
    }
  }
  const t = u8(); str();
  return pay(t);
}
export function decodeItemBytes(b64){ return readNBT(gunzipSync(Buffer.from(b64, 'base64'))); }

/* Item-ID wie im Bazaar bzw. bei SkyCofl:
   Haustiere PET_<TYP> (Variante = Seltenheit), Bücher mit genau einer Verzauberung ENCHANTMENT_<NAME>_<STUFE>,
   Runen RUNE_<NAME> (Variante = Stufe), sonst die ExtraAttributes-ID. */
export function itemKey(root){
  const it = root && root.i && root.i[0]; if (!it) return null;
  const tag = it.tag || {}, ea = tag.ExtraAttributes || {}, id = ea.id;
  if (!id) return null;
  const count = Math.max(1, it.Count || 1);
  if (id === 'PET' && ea.petInfo){
    try{ const p = typeof ea.petInfo === 'string' ? JSON.parse(ea.petInfo) : ea.petInfo; if (p.type) return {tag: 'PET_' + p.type, variant: p.tier || null, count}; }catch{}
    return {tag: 'PET', variant: null, count};
  }
  if (id === 'ENCHANTED_BOOK' && ea.enchantments){
    const k = Object.keys(ea.enchantments);
    if (k.length === 1) return {tag: 'ENCHANTMENT_' + k[0].toUpperCase() + '_' + ea.enchantments[k[0]], variant: null, count};
    return {tag: 'ENCHANTED_BOOK', variant: null, count};
  }
  if ((id === 'RUNE' || id === 'UNIQUE_RUNE') && ea.runes){
    const k = Object.keys(ea.runes)[0];
    if (k) return {tag: 'RUNE_' + k.toUpperCase(), variant: String(ea.runes[k]), count};
  }
  return {tag: id, variant: null, count};
}
export const stripColor = s => String(s || '').replace(/§./g, '');

/* Lowest BIN je Item aus allen aktiven Auktionen.
   Pro Item: niedrigster Stückpreis, die 5 niedrigsten Angebote, Zahl der BIN- und Gebotsauktionen,
   niedrigster Preis je Variante. */
export function aggregate(auctions, decode = decodeItemBytes){
  const items = {}; let bad = 0;
  for (const a of auctions){
    let k; try{ k = itemKey(decode(a.item_bytes)); }catch{ k = null; }
    if (!k){ bad++; continue; }
    const o = items[k.tag] || (items[k.tag] = {bins: [], a: 0, hb: 0, name: stripColor(a.item_name), v: {}});
    if (a.bin){
      const p = a.starting_bid / k.count;
      o.bins.push(p);
      if (k.variant != null && (o.v[k.variant] == null || p < o.v[k.variant])) o.v[k.variant] = p;
    } else { o.a++; o.hb = Math.max(o.hb, (a.highest_bid_amount || 0) / k.count); }
  }
  const out = {};
  for (const tag in items){
    const o = items[tag]; o.bins.sort((x, y) => x - y);
    out[tag] = {b: o.bins.length ? o.bins[0] : null, l5: o.bins.slice(0, 5), n: o.bins.length, a: o.a, hb: o.hb || null, name: o.name, v: Object.keys(o.v).length ? o.v : null};
  }
  return {items: out, bad};
}
