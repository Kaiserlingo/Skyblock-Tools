'use strict';
// Rahmen: Zahlen, Preise, Prozent, Datum formatieren; Item-Bild und Seltenheitsfarbe.
/* =========================================================
   Formatierung
   ========================================================= */
const nf = (d=1, min=0) => new Intl.NumberFormat('de-AT', {maximumFractionDigits:d, minimumFractionDigits:min});
const NF0 = nf(0), NF1 = nf(1), NF1f = nf(1,1), NF2 = nf(2);
function fmt(n){
  if (n == null || !isFinite(n)) return '–';
  n = noNegZero(n, 1);
  const a = Math.abs(n);
  if (a >= 1e9) return NF2.format(n/1e9) + '\u00a0B';
  if (a >= 1e6) return NF2.format(n/1e6) + '\u00a0M';
  if (a >= 1e4) return NF1.format(n/1e3) + '\u00a0k';
  if (a >= 100) return NF0.format(n);
  return NF1.format(n);
}
function price(n){ if (n == null || !isFinite(n) || n === 0) return '–'; n = noNegZero(n, 1); return n === 0 ? '0,0' : NF1f.format(n); }
// Werte, die gerundet 0 ergeben, ohne Minuszeichen anzeigen
function noNegZero(n, d){ return Math.abs(n) < 0.5 * Math.pow(10, -d) ? 0 : n; }
function pct(n, sign=true){ if (n == null || !isFinite(n)) return '–'; n = noNegZero(n, 1); return (sign && n > 0 ? '+' : '') + NF1.format(n) + '\u00a0%'; }
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
// Seltenheitsfarben (Minecraft-Farbcodes, je Theme abgestimmt in css/craft.css)
const RARITY = {COMMON:'var(--r-common)', UNCOMMON:'var(--r-uncommon)', RARE:'var(--r-rare)', EPIC:'var(--r-epic)', LEGENDARY:'var(--r-legendary)', MYTHIC:'var(--r-mythic)', DIVINE:'var(--r-divine)', SPECIAL:'var(--r-special)', VERY_SPECIAL:'var(--r-special)'};
function rarityColor(id){
  if (S.tiers[id]) return RARITY[S.tiers[id]] || RARITY.COMMON;
  if (id.startsWith('ENCHANTMENT_ULTIMATE')) return RARITY.MYTHIC;
  if (id.startsWith('ENCHANTMENT_')) return 'var(--r-ench)';
  if (id.startsWith('ESSENCE_')) return RARITY.EPIC;
  return RARITY.COMMON;
}
// Item-Bild im Inventar-Slot. Bilder von SkyCofl (Standard-Texturen); fehlt eins, bleibt ein Farbquadrat der Seltenheit.
const ICON_URL = CFG.icons;
function itemIcon(id, big){
  return `<span class="slot${big ? ' big' : ''}" style="--rc:${rarityColor(id)}"><img src="${ICON_URL}${encodeURIComponent(id)}" alt="" loading="lazy" decoding="async" onerror="this.parentNode.classList.add('ph');this.remove()"></span>`;
}
function itemCell(id, name, sub, risk){
  return `<div class="item">${itemIcon(id)}<div class="txt"><div class="nm" title="${esc(name)}">${esc(name)}${risk && risk.length ? `<span class="warn" title="${esc(risk.join('\n'))}">!</span>` : ''}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`;
}
