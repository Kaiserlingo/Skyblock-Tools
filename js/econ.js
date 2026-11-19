'use strict';
/* =========================================================
   Econ – Rechenfunktionen für die Markt-Analyse
   Reine Funktionen ohne DOM. Läuft im Browser (window.Econ)
   und in Node (für die Datenpipeline und die Tests).
   Zeiten immer in ms seit 1970 (UTC).
   ========================================================= */
(function(root){
const E = {};
const DAY = E.DAY = 864e5, HOUR = E.HOUR = 36e5;

/* ---------- Zeit ---------- */
// SkyCofl liefert UTC-Zeiten ohne Zeitzone ("2026-11-19T08:03:28.982")
E.parseUtc = function(ts){
  if (typeof ts === 'number') return ts;
  if (typeof ts !== 'string' || !ts) return NaN;
  return Date.parse(/(Z|[+-]\d\d:?\d\d)$/i.test(ts) ? ts : ts + 'Z');
};
// Mayor-Zeiten von SkyCofl: "05/03/2026 03:15:00 +00:00" (Monat/Tag/Jahr, UTC)
E.parseMayorTime = function(s){
  if (typeof s !== 'string') return NaN;
  const m = s.match(/^(\d\d)\/(\d\d)\/(\d{4}) (\d\d):(\d\d):(\d\d)(?: ([+-])(\d\d):(\d\d))?$/);
  if (!m) return E.parseUtc(s);
  let t = Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +m[6]);
  if (m[7]) t -= (m[7] === '-' ? -1 : 1) * ((+m[8]) * 60 + (+m[9])) * 60e3;
  return t;
};
// Hypixel-News: "17th November 2026" -> UTC-Mitternacht
const MONTHS_EN = ['january','february','march','april','may','june','july','august','september','october','november','december'];
E.parseNewsDate = function(s){
  const m = String(s || '').trim().match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return NaN;
  const mo = MONTHS_EN.indexOf(m[2].toLowerCase());
  if (mo < 0) return NaN;
  return Date.UTC(+m[3], mo, +m[1]);
};
E.dayStart = t => Math.floor(t / DAY) * DAY;

/* ---------- SkyBlock-Kalender ----------
   1 SkyBlock-Jahr = 124 h, 12 Monate à 31 Tage, 1 Tag = 20 min.
   Jahr 1, Early Spring 1 begann am 11.06.2019 17:55 UTC. */
const SB = E.SB = {EPOCH: 1560275700000, DAYLEN: 20 * 60e3};
SB.MONTH = 31 * SB.DAYLEN; SB.YEAR = 12 * SB.MONTH;
SB.MONTHS = ['Early Spring','Spring','Late Spring','Early Summer','Summer','Late Summer','Early Autumn','Autumn','Late Autumn','Early Winter','Winter','Late Winter'];
E.sbDate = function(t){
  const d = t - SB.EPOCH, year = Math.floor(d / SB.YEAR) + 1, inY = d - (year - 1) * SB.YEAR;
  const month = Math.floor(inY / SB.MONTH), inM = inY - month * SB.MONTH, day = Math.floor(inM / SB.DAYLEN) + 1;
  const mins = (inM - (day - 1) * SB.DAYLEN) / SB.DAYLEN * 1440;
  return {year, month, day, hour: Math.floor(mins / 60), minute: Math.floor(mins % 60)};
};
E.sbTime = (year, month, day) => SB.EPOCH + (year - 1) * SB.YEAR + month * SB.MONTH + (day - 1) * SB.DAYLEN;
// feste Kalender-Ereignisse (Monat 0-basiert, Tage inklusive)
E.SB_EVENTS = [
  {key: 'mayor',   name: 'Neuer Mayor tritt an',   month: 2,  from: 27, to: 27, point: true},
  {key: 'zoo',     name: 'Traveling Zoo',          month: 3,  from: 1,  to: 3},
  {key: 'spooky',  name: 'Spooky Festival',        month: 7,  from: 29, to: 31},
  {key: 'zoo',     name: 'Traveling Zoo',          month: 9,  from: 1,  to: 3},
  {key: 'workshop',name: "Jerry's Workshop offen", month: 11, from: 1,  to: 31},
  {key: 'jerry',   name: 'Season of Jerry',        month: 11, from: 24, to: 26},
  {key: 'newyear', name: 'New Year Celebration',   month: 11, from: 29, to: 31},
];
E.sbUpcoming = function(now, n = 8){
  const y0 = E.sbDate(now).year, out = [];
  for (let y = y0 - 1; y <= y0 + 2; y++) for (const ev of E.SB_EVENTS){
    const start = E.sbTime(y, ev.month, ev.from), end = ev.point ? start : E.sbTime(y, ev.month, ev.to) + SB.DAYLEN;
    if ((ev.point ? start : end) > now) out.push({key: ev.key, name: ev.name, start, end, year: y, running: start <= now && now < end});
  }
  return out.sort((a, b) => a.start - b.start).slice(0, n);
};

/* ---------- Statistik ---------- */
const num = v => v != null && isFinite(v);
E.mean = a => { let s = 0, n = 0; for (const v of a) if (num(v)){ s += v; n++; } return n ? s / n : null; };
E.sd = a => { const x = a.filter(num), n = x.length; if (n < 2) return null; const m = x.reduce((s, v) => s + v, 0) / n; return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1)); };
E.quantile = function(a, p){   // wie numpy.quantile (linear)
  const x = a.filter(num).sort((u, v) => u - v), n = x.length; if (!n) return null;
  const h = (n - 1) * p, lo = Math.floor(h), hi = Math.min(lo + 1, n - 1);
  return x[lo] + (h - lo) * (x[hi] - x[lo]);
};
E.median = a => E.quantile(a, .5);
// 97,5-%-Quantil der t-Verteilung (für 95-%-Konfidenzintervalle)
const T975 = [12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.160,2.145,2.131,2.120,2.110,2.101,2.093,2.086,2.080,2.074,2.069,2.064,2.060,2.056,2.052,2.048,2.045,2.042];
E.t975 = df => df < 1 ? Infinity : df <= 30 ? T975[df - 1] : df <= 40 ? 2.021 + (40 - df) / 10 * 0.021 : df <= 60 ? 2.000 + (60 - df) / 20 * 0.021 : df <= 120 ? 1.980 + (120 - df) / 60 * 0.020 : 1.96;
// einfache lineare Regression y = a + b·x
E.ols = function(x, y){
  const X = [], Y = [];
  for (let i = 0; i < x.length; i++) if (num(x[i]) && num(y[i])){ X.push(x[i]); Y.push(y[i]); }
  const n = X.length; if (n < 3) return null;
  const mx = X.reduce((s, v) => s + v, 0) / n, my = Y.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++){ sxx += (X[i] - mx) ** 2; sxy += (X[i] - mx) * (Y[i] - my); syy += (Y[i] - my) ** 2; }
  if (sxx === 0) return null;
  const b = sxy / sxx, a = my - b * mx, sse = Math.max(0, syy - b * sxy);
  const se = Math.sqrt(sse / (n - 2) / sxx), tc = E.t975(n - 2);
  return {a, b, n, r2: syy > 0 ? 1 - sse / syy : 0, r: syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0, se, lo: b - tc * se, hi: b + tc * se};
};

/* ---------- Zeitreihen ---------- */
/* Punkte [{t, v}] auf Kalendertage (UTC) bringen. Mehrere Punkte pro Tag -> Mittelwert.
   Lücken bis maxGap Tage werden mit dem letzten Wert gefüllt. */
E.daily = function(points, {days, end, maxGap = 3} = {}){
  const byDay = new Map();
  for (const p of points){
    if (!num(p.t) || !num(p.v) || p.v <= 0) continue;
    const d = E.dayStart(p.t), o = byDay.get(d) || {s: 0, n: 0};
    o.s += p.v; o.n++; byDay.set(d, o);
  }
  if (!byDay.size) return {t: [], v: []};
  const keys = [...byDay.keys()].sort((a, b) => a - b);
  const last = end != null ? E.dayStart(end) : keys[keys.length - 1];
  const first = days ? last - (days - 1) * DAY : keys[0];
  const t = [], v = []; let lastV = null, gap = 0;
  for (let d = first; d <= last; d += DAY){
    const o = byDay.get(d);
    if (o){ lastV = o.s / o.n; gap = 0; v.push(lastV); }
    else { gap++; v.push(lastV != null && gap <= maxGap ? lastV : null); }
    t.push(d);
  }
  return {t, v};
};
E.lastIdx = v => { for (let i = v.length - 1; i >= 0; i--) if (num(v[i])) return i; return -1; };
// Veränderung über k Tage (bezogen auf den letzten vorhandenen Tag)
E.change = function(v, k){
  const L = v.length - 1; if (L < k || !num(v[L]) || !num(v[L - k]) || v[L - k] <= 0) return null;
  return v[L] / v[L - k] - 1;
};
E.logReturns = function(v){ const r = []; for (let i = 1; i < v.length; i++) r.push(num(v[i]) && num(v[i-1]) && v[i] > 0 && v[i-1] > 0 ? Math.log(v[i] / v[i-1]) : null); return r; };
// Tages-Volatilität: Standardabweichung der täglichen Log-Renditen der letzten n Tage
E.volatility = function(v, n = 30){ const r = E.logReturns(v.slice(-(n + 1))).filter(num); return r.length >= Math.min(10, n - 1) ? E.sd(r) : null; };
E.maxDrawdown = function(v){
  let peak = null, dd = 0, from = -1, to = -1, pk = -1;
  v.forEach((x, i) => { if (!num(x)) return; if (peak == null || x > peak){ peak = x; pk = i; } const d = (peak - x) / peak; if (d > dd){ dd = d; from = pk; to = i; } });
  return {dd, from, to};
};
// historischer Value at Risk / Expected Shortfall für einen Tag (als positive Verlustquote)
E.varES = function(v, a = .05){
  const r = E.logReturns(v).filter(num); if (r.length < 20) return null;
  const q = E.quantile(r, a), tail = r.filter(x => x <= q).map(x => Math.exp(x) - 1);
  return {VaR: -(Math.exp(q) - 1), ES: -E.mean(tail), n: r.length};
};
// Beta/Korrelation der Tagesrenditen gegen einen Index
E.beta = function(v, idx){ const ri = E.logReturns(v), rm = E.logReturns(idx); return E.ols(rm, ri); };
// Abweichung vom 30-Tage-Schnitt
E.zscore = function(v, n = 30){
  const w = v.slice(-n).filter(num); const L = E.lastIdx(v); if (w.length < 10 || L < 0) return null;
  const m = E.mean(w), s = E.sd(w), med = E.median(w);
  return {z: s ? (v[L] - m) / s : 0, vsMedian: v[L] / med - 1, mean: m, median: med, sd: s};
};

/* ---------- Index (gewichteter geometrischer Mittelwert der Preisverhältnisse) ----------
   series: [{v, w}] alle auf denselben Tagen. Basis = 100 am ersten Tag.
   Ein Item zählt nur, wenn es am Basistag einen Preis hat. Gewichte werden auf cap gedeckelt. */
E.capWeights = function(ws, cap){
  const tot = ws.reduce((s, w) => s + w, 0); if (!tot) return ws.map(() => 0);
  let w = ws.map(x => x / tot);
  for (let k = 0; k < 20; k++){
    const over = w.filter(x => x > cap + 1e-12).length; if (!over) break;
    const free = w.reduce((s, x) => s + (x < cap ? x : 0), 0), rest = 1 - over * cap;
    w = w.map(x => x >= cap ? cap : x / free * rest);
  }
  return w;
};
E.chainIndex = function(series, len, cap = .08){
  const use = series.filter(s => num(s.v[0]) && s.v[0] > 0 && s.w > 0);
  const w = E.capWeights(use.map(s => s.w), use.length * cap < 1 ? 1 : cap);
  const out = [];
  for (let t = 0; t < len; t++){
    let s = 0, ws = 0;
    use.forEach((it, k) => { const x = it.v[t]; if (num(x) && x > 0){ s += w[k] * Math.log(x / it.v[0]); ws += w[k]; } });
    out.push(ws > 0 ? 100 * Math.exp(s / ws) : null);
  }
  return {v: out, n: use.length};
};

/* ---------- Ereignisse ---------- */
// Preisänderung vom Tag vor dem Ereignis bis k Tage danach
E.eventReturns = function(t, v, evT, ks = [1, 3, 7]){
  const i0 = t.indexOf(E.dayStart(evT) - DAY), out = {};
  for (const k of ks){
    const i1 = t.indexOf(E.dayStart(evT) + k * DAY);
    out['d' + k] = i0 >= 0 && i1 >= 0 && num(v[i0]) && num(v[i1]) && v[i0] > 0 ? v[i1] / v[i0] - 1 : null;
  }
  return out;
};
/* Wirkung einer Mayor-Amtszeit: Ø-Preis in der Amtszeit (nur volle Tage) gegenüber
   den 5 Tagen davor. terms: [{name, start, end}] */
E.termReturns = function(t, v, terms, pre = 5){
  const out = [];
  for (const m of terms){
    const s = E.dayStart(m.start) + DAY, e = E.dayStart(m.end), p0 = E.dayStart(m.start) - pre * DAY, p1 = E.dayStart(m.start);
    const during = [], before = [];
    t.forEach((d, i) => { if (!num(v[i])) return; if (d >= s && d < e) during.push(v[i]); else if (d >= p0 && d < p1) before.push(v[i]); });
    if (during.length >= 3 && before.length >= 3) out.push({name: m.name, start: m.start, ret: E.mean(during) / E.mean(before) - 1});
  }
  return out;
};
E.groupBy = function(rows, key, val){
  const g = {};
  for (const r of rows){ const k = r[key], x = r[val]; if (!num(x)) continue; (g[k] = g[k] || []).push(x); }
  const out = {};
  for (const k in g){ const a = g[k]; out[k] = {n: a.length, mean: E.mean(a), median: E.median(a), up: a.filter(x => x > 0).length / a.length}; }
  return out;
};

/* ---------- Elastizität ----------
   Wochen-Stichproben (nicht überlappend): Menge = gehandelte Stück in der Woche,
   Preis = Ø-Preis der Woche. Ergebnis: Steigung von ln(Menge) über ln(Preis). */
E.weeklySamples = function(points, qKey, pKey){
  const pts = points.filter(p => num(p.t) && num(p[qKey]) && p[qKey] > 0 && num(p[pKey]) && p[pKey] > 0).sort((a, b) => a.t - b.t);
  if (pts.length < 2) return [];
  const out = []; let end = pts[pts.length - 1].t;
  while (end - 7 * DAY >= pts[0].t - DAY){
    const w = pts.filter(p => p.t > end - 7 * DAY && p.t <= end);
    if (w.length){ const last = w[w.length - 1]; out.push({t: end, p: E.mean(w.map(p => p[pKey])), q: last[qKey]}); }
    end -= 7 * DAY;
  }
  return out.reverse();
};
E.elasticity = function(samples){
  const r = E.ols(samples.map(s => Math.log(s.p)), samples.map(s => Math.log(s.q)));
  if (!r) return null;
  r.sig = r.lo > 0 || r.hi < 0;
  return r;
};

/* ---------- Saisonalität ---------- */
// Abweichung (in %) vom gleitenden Mittel, gruppiert nach Wochentag bzw. Stunde (Ortszeit über tzMin)
E.profile = function(t, v, by, win, tzMin = 0){
  const lv = v.map(x => num(x) && x > 0 ? Math.log(x) : null), half = Math.floor(win / 2), groups = {};
  for (let i = half; i < lv.length - half; i++){
    if (lv[i] == null) continue;
    const w = lv.slice(i - half, i + half + 1).filter(x => x != null); if (w.length < win * .7) continue;
    const dev = lv[i] - w.reduce((s, x) => s + x, 0) / w.length;
    const local = new Date(t[i] - tzMin * 60e3), k = by === 'weekday' ? local.getUTCDay() : local.getUTCHours();
    (groups[k] = groups[k] || []).push(dev);
  }
  const out = {};
  for (const k in groups) out[k] = {n: groups[k].length, dev: Math.exp(E.mean(groups[k])) - 1};
  return out;
};

/* ---------- Orderbuch: Nachfrage- und Angebotskurve ----------
   Hypixel: sell_summary = Buy-Orders (Nachfrage, absteigend), buy_summary = Sell-Offers (Angebot, aufsteigend) */
E.book = function(product){
  const dem = (product.sell_summary || []).slice().sort((a, b) => b.pricePerUnit - a.pricePerUnit);
  const sup = (product.buy_summary || []).slice().sort((a, b) => a.pricePerUnit - b.pricePerUnit);
  const cum = arr => { let s = 0; return arr.map(l => ({p: l.pricePerUnit, q: (s += l.amount), amount: l.amount, orders: l.orders})); };
  const side = arr => {
    const tot = arr.reduce((s, l) => s + l.amount, 0), ords = arr.reduce((s, l) => s + (l.orders || 0), 0);
    const hhi = tot ? arr.reduce((s, l) => s + (l.amount / tot) ** 2, 0) : null;
    return {levels: arr.length, amount: tot, orders: ords, avgOrder: ords ? tot / ords : null, hhi, topShare: tot && arr.length ? arr[0].amount / tot : null,
            value: arr.reduce((s, l) => s + l.amount * l.pricePerUnit, 0)};
  };
  const bid = dem[0] ? dem[0].pricePerUnit : null, ask = sup[0] ? sup[0].pricePerUnit : null;
  const mid = bid && ask ? (bid + ask) / 2 : bid || ask;
  const within = (arr, f, dir) => arr.filter(l => dir < 0 ? l.pricePerUnit >= mid * (1 - f) : l.pricePerUnit <= mid * (1 + f)).reduce((s, l) => s + l.amount, 0);
  return {demand: cum(dem), supply: cum(sup), bid, ask, mid, spread: bid && ask ? ask - bid : null, spreadPct: bid && ask ? (ask - bid) / mid : null,
          d: side(dem), s: side(sup), depth2: {demand: mid ? within(dem, .02, -1) : 0, supply: mid ? within(sup, .02, 1) : 0},
          imbalance: (() => { const a = dem.reduce((s, l) => s + l.amount, 0), b = sup.reduce((s, l) => s + l.amount, 0); return a + b ? (a - b) / (a + b) : null; })()};
};
// Kosten, um q Stück sofort zu kaufen (gegen das Angebot) – Preis-Mengen-Kurve
E.walk = function(levels, q){
  let left = q, cost = 0, filled = 0;
  for (const l of levels){ if (left <= 0) break; const take = Math.min(left, l.amount); cost += take * l.pricePerUnit; filled += take; left -= take; }
  return {filled, cost, avg: filled ? cost / filled : null, complete: left <= 0};
};

/* ---------- Herstellkosten: kaufen oder selbst herstellen? ----------
   price(id) -> Stückpreis auf dem Bazaar (oder null); recipes: Map id -> [[menge, {zutat: anzahl}], ...] */
E.makeOrBuy = function(id, price, recipes, depth = 4){
  const memo = new Map();
  function go(x, d, stack){
    const key = x + '|' + d; if (memo.has(key)) return memo.get(key);
    const buy = price(x);
    let best = buy != null ? {id: x, buy, craft: null, cost: buy, how: 'buy', parts: null} : {id: x, buy: null, craft: null, cost: null, how: 'none', parts: null};
    if (d > 0 && recipes.has(x) && !stack.has(x)){
      stack.add(x);
      for (const [cnt, ins] of recipes.get(x)){
        let sum = 0, ok = true; const parts = [];
        for (const ing in ins){ const sub = go(ing, d - 1, stack); if (sub.cost == null){ ok = false; break; } sum += sub.cost * ins[ing]; parts.push({q: ins[ing], node: sub}); }
        if (!ok) continue;
        const unit = sum / cnt;
        if (best.craft == null || unit < best.craft){ best = Object.assign({}, best, {craft: unit, cnt, parts}); }
      }
      stack.delete(x);
      if (best.craft != null && (best.buy == null || best.craft < best.buy)){ best.cost = best.craft; best.how = 'craft'; }
    }
    memo.set(key, best); return best;
  }
  return go(id, depth, new Set());
};

/* ---------- Produktlebenszyklus (Faustregel aus Alter und Mengenentwicklung) ---------- */
E.lifecycle = function(ageDays, volNow, volPrev){
  if (ageDays != null && ageDays < 90) return {stage: 'Einführung', why: 'Erst seit ' + Math.round(ageDays) + ' Tagen im Handel.'};
  if (!num(volNow) || !num(volPrev) || volPrev <= 0) return {stage: 'unbekannt', why: 'Zu wenig Mengendaten.'};
  const g = volNow / volPrev - 1;
  if (g > .25) return {stage: 'Wachstum', why: 'Gehandelte Menge +' + Math.round(g * 100) + ' % gegenüber den 90 Tagen davor.', g};
  if (g < -.25) return {stage: 'Rückgang', why: 'Gehandelte Menge ' + Math.round(g * 100) + ' % gegenüber den 90 Tagen davor.', g};
  return {stage: 'Reife', why: 'Gehandelte Menge stabil (' + (g >= 0 ? '+' : '') + Math.round(g * 100) + ' % gegenüber den 90 Tagen davor).', g};
};

if (typeof module !== 'undefined' && module.exports) module.exports = E; else root.Econ = E;
})(typeof window !== 'undefined' ? window : globalThis);
