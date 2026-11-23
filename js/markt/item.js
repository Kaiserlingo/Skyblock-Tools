'use strict';
// Markt-Analyse: Item-Seite – Daten laden, Kennzahlen berechnen (analyze), Reiter.
/* =========================================================
   Item-Analyse
   ========================================================= */
function pageItem(){
  const id = S.itemId;
  return `<div class="mk mk-item">
    <p class="crumbline"><a class="link" href="#markt/items">Alle Items</a></p>
    <div id="mi-head">${itemHead(id)}</div>
    <section class="mk-block">
      <header><h2>Preisverlauf</h2>
        <div class="seg sm" role="group" aria-label="Zeitraum">${[['7d', '7 Tage'], ['1y', '1 Jahr'], ['all', 'Alles']].map(([k, l]) => `<button data-mirange="${k}" class="${K.itRange === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <label class="chk"><input type="checkbox" data-miopt="bands" ${K.itBands ? 'checked' : ''}> Mayor-Amtszeiten</label>
        <label class="chk"><input type="checkbox" data-miopt="marks" ${K.itMarks ? 'checked' : ''}> Updates</label>
      </header>
      <div class="mk-chart tall" id="mi-chart"></div>
      <p class="hint" id="mi-cnote"></p>
    </section>
    <div id="mi-body"><p class="loading">Daten werden geladen …</p></div>
  </div>`;
}
function itemHead(id){
  const h = K.hy && K.hy[id], k = kind(id), r = liveRow(id), x = pxOf(id), I = K.it && K.it.id === id ? K.it : null;
  const tier = h && h.tier ? title(h.tier) : (S.tiers[id] ? title(S.tiers[id]) : '');
  const cat = catOf(id);
  let px = '';
  if (k.bz && r && (r.topBuy || r.topSell)) px = `<dl class="figures mk-fig"><div><dt>Instabuy</dt><dd class="amber">${price(r.topSell)}</dd></div><div><dt>Instasell</dt><dd class="pos">${price(r.topBuy)}</dd></div><div><dt>Spread</dt><dd>${r.topBuy && r.topSell ? P((r.topSell - r.topBuy) / r.topSell, false) : '–'}</dd></div><div><dt>Umsatz pro Tag</dt><dd>${fmt(((r.wBuy || 0) + (r.wSell || 0)) * (r.topBuy || r.topSell) / 7)}</dd></div></dl>
    <p class="hint mk-src">Live aus dem Bazaar, Stand ${new Date(S.lastUpdated).toLocaleTimeString('de-AT')}.</p>`;
  else if (k.ah){
    const s = I && I.ah && I.ah.sold;
    px = `<dl class="figures mk-fig"><div><dt>Lowest BIN</dt><dd class="amber">${x && x.b != null ? price(x.b) : '–'}</dd></div><div><dt>Zweitgünstigster BIN</dt><dd>${x && x.l5 && x.l5[1] != null ? price(x.l5[1]) : '–'}</dd></div><div><dt>BIN-Angebote</dt><dd>${x ? NF0.format(x.n || 0) : '–'}</dd></div><div><dt>Verkäufe pro Tag</dt><dd>${s && s.perDay != null ? NF1.format(s.perDay) : '–'}</dd></div></dl>
      <p class="hint mk-src">${x && x.b == null ? (x.last != null ? `Gerade kein BIN-Angebot. Zuletzt gesehen: ${price(x.last)} am ${fdt(x.seen)}. ` : 'Gerade kein BIN-Angebot. ') : ''}${x && x.a ? `${x.a === 1 ? '1 Gebots-Auktion' : NF0.format(x.a) + ' Gebots-Auktionen'}, ${x.hb ? 'höchstes Gebot ' + price(x.hb) : 'noch ohne Gebot'}. ` : ''}${I && I.live && I.live.b != null && Math.abs(I.live.b - (x && x.b || 0)) > .5 ? `Live laut SkyCofl gerade: Lowest BIN ${price(I.live.b)}. ` : ''}${pxNote()}</p>
      ${x && x.v ? `<table class="mk-mini mk-var"><thead><tr><th class="l nosort">${id.startsWith('PET_') ? 'Rarity' : 'Stufe'}</th><th class="nosort">Lowest BIN</th></tr></thead><tbody>${Object.entries(x.v).sort((a, b) => a[1] - b[1]).map(([v, p]) => `<tr class="static"><td class="l">${esc(title(v))}</td><td>${price(p)}</td></tr>`).join('')}</tbody></table>` : ''}`;
  }
  return `<div class="ahead"><div>${itemIcon(id, true)}<div><h1>${esc(nm(id))}</h1>
    <p class="sub">${[esc(id), tier, cat ? esc(secLabel(cat)) : '', k.bz ? 'Bazaar' : k.ah ? 'Auction House' : k.known ? 'nicht handelbar' : ''].filter(Boolean).join(', ')}</p></div></div>
    <div class="btnrow">${k.bz ? `<a class="btn primary" href="#bazaar/item/${encodeURIComponent(id)}">Im Bazaar Flipper öffnen</a>` : ''}<button class="btn ghost" data-mkcopy="${esc(nm(id))}">Name kopieren</button></div></div>${px}`;
}
async function mountItem(){
  const id = S.itemId, I = K.it = {id, ready: false, err: [], series: {}};
  if (K.chart){ K.chart.destroy(); K.chart = null; }
  const el = $('#mi-chart');
  if (el){ const ch = K.chart = new PriceChart(el, {}); ch.empty = 'Lädt …'; ch.setIndicators({hi: true, lo: true, spread: true, volume: true}); }
  await Promise.allSettled([loadMD(), loadHy(), loadCat(), K.liveP]);
  if (K.it !== I) return;
  const k = I.k = kind(id);
  const now = Date.now(), y = new Date((K.md ? K.md.days.from : now - 366 * DAY) - 2 * DAY).toISOString(), n = new Date(now).toISOString();   // ab dem ersten Tag des Rasters, wie die Pipeline
  const enc = encodeURIComponent(id);
  try{
    if (k.bz){
      // 7-Tage-Abfrage: nur bis 7 Tage liefert SkyCofl 2-Stunden-Punkte
      const [h1, h14] = await Promise.all([getJSON(COFL_API + `bazaar/${enc}/history?start=${y}&end=${n}`, 30 * 60e3), getJSON(COFL_API + `bazaar/${enc}/history?start=${new Date(now - 6.9 * DAY).toISOString()}&end=${n}`, 5 * 60e3).catch(() => null)]);
      I.h1 = bzPoints(h1); I.h7 = bzPoints(h14);
    } else if (k.ah){
      const [full, week, sold] = await Promise.allSettled([
        getJSON(COFL_API + `item/price/${enc}/history/full`, 60 * 60e3), getJSON(COFL_API + `item/price/${enc}/history/week`, 10 * 60e3),
        getJSON(COFL_API + `auctions/tag/${enc}/sold`, 5 * 60e3)]);
      const v = x => x.status === 'fulfilled' ? x.value : null;
      I.hAll = ahPoints(v(full)); I.h1 = I.hAll.filter(p => p.t >= Date.parse(y)); I.h7 = ahPoints(v(week));
      I.ah = {sold: soldStats(v(sold))};
      if (!K.px || pxAge() > 20 * 60e3){ const lb = await getJSON(COFL_API + `auctions/tag/${enc}/active/bin`, 60e3).catch(() => null); if (Array.isArray(lb) && lb.length) I.live = {b: Math.min(...lb.map(a => a.startingBid / (a.count || 1)))}; }
    }
  }catch(e){ I.err.push(e.message); }
  if (K.it !== I) return;
  I.ready = true;
  drawItem(false); feedItemChart();
}
function bzPoints(h){
  return (Array.isArray(h) ? h : []).map(o => ({t: E.parseUtc(o.timestamp), buy: +o.buy || null, sell: +o.sell || null, v: E.bazaarPrice(o), bmw: +o.buyMovingWeek || 0, smw: +o.sellMovingWeek || 0, bv: o.buyVolume, sv: o.sellVolume}))
    .filter(p => isFinite(p.t)).sort((a, b) => a.t - b.t);
}
function ahPoints(h){
  return (Array.isArray(h) ? h : []).map(o => ({t: E.parseUtc(o.time), min: +o.min || null, max: +o.max || null, avg: +o.avg || null, vol: +o.volume || 0, v: +o.avg || null}))
    .filter(p => isFinite(p.t)).sort((a, b) => a.t - b.t);
}
function soldStats(a){
  if (!Array.isArray(a) || !a.length) return null;
  const s = a.map(x => ({p: +x.highestBidAmount || +x.startingBid, t: E.parseUtc(x.end), seller: x.auctioneerId, clean: (x.enchantments === '[]' || !x.enchantments || (Array.isArray(x.enchantments) && !x.enchantments.length)) && !x.reforge, count: x.count || 1}))
    .filter(x => x.p > 0 && isFinite(x.t)).map(x => Object.assign(x, {p: x.p / x.count}));
  if (!s.length) return null;
  const t0 = Math.min(...s.map(x => x.t)), t1 = Math.max(...s.map(x => x.t)), span = Math.max((t1 - t0) / DAY, 1 / 24);
  const ps = s.map(x => x.p), clean = s.filter(x => x.clean).map(x => x.p);
  const by = {}; for (const x of s) by[x.seller] = (by[x.seller] || 0) + 1;
  const shares = Object.values(by).map(c => c / s.length);
  return {n: s.length, span, perDay: s.length / span, q10: E.quantile(ps, .1), q50: E.median(ps), q90: E.quantile(ps, .9), cleanN: clean.length, cleanMed: E.median(clean),
          cv: E.sd(ps) / E.mean(ps), sellers: shares.length, hhi: shares.reduce((x, y) => x + y * y, 0), top: Math.max(...shares), list: s};
}
function feedItemChart(){
  const ch = K.chart, I = K.it; if (!ch || !I || !I.ready) return;
  const r = K.itRange, md = K.md;
  let pts = r === '7d' ? I.h7 : r === 'all' ? I.hAll : I.h1;
  if (r === 'all' && !I.hAll && I.k.bz){
    ch.empty = 'Lädt …'; ch.setData({t: []});
    coflAll(I.id)
      .then(h => { if (K.it !== I) return; I.hAll = bzPoints(h); feedItemChart(); }).catch(() => { ch.empty = 'Konnte nicht geladen werden'; ch.setData({t: []}); });
    return;
  }
  pts = pts || [];
  ch.empty = I.k.bz || I.k.ah ? 'Keine Daten für diesen Zeitraum' : 'Für dieses Item gibt es keinen Markt';
  if (I.k.bz){
    ch.labels = {hi: 'Instabuy', lo: 'Instasell'};
    ch.setIndicators({hi: true, lo: true, spread: true, volume: true});
    ch.setData({t: pts.map(p => p.t), hi: pts.map(p => p.buy), lo: pts.map(p => p.sell), vb: pts.map(p => p.sv ?? null), vs: pts.map(p => p.bv ?? null)});
    const lr = liveRow(I.id), q = S.products[I.id] && S.products[I.id].quick_status;
    if (lr && S.lastUpdated && r !== 'all' && q) ch.append({t: S.lastUpdated, hi: q.buyPrice || lr.topSell || null, lo: q.sellPrice || lr.topBuy || null, vb: q.sellVolume, vs: q.buyVolume});
  } else {
    ch.labels = {hi: 'Ø Verkaufspreis', lo: 'günstigster Verkauf'};
    ch.setIndicators({hi: true, lo: true, spread: true, volume: true});
    ch.setData({t: pts.map(p => p.t), hi: pts.map(p => p.avg), lo: pts.map(p => p.min), vb: pts.map(p => p.vol), vs: pts.map(() => null)});
  }
  ch.setOverlays({bands: K.itBands && md ? md.terms.map(x => ({from: x.start, to: x.end, label: x.name, color: bandColor(x.name), alpha: .5})) : [],
                  marks: K.itMarks && md ? md.news.map(x => ({t: x.date, label: x.title.replace(/^SkyBlock\s*/, '')})) : []});
  const note = $('#mi-cnote');
  if (note) note.innerHTML = (I.k.bz ? 'Bernstein: Instabuy (niedrigste Sell-Offer), Grün: Instasell (höchste Buy-Order). Unten: Menge in Sell-Offers und Buy-Orders.'
    : 'Bernstein: Ø Verkaufspreis, Grün: günstigster Verkauf. Unten: Zahl der Verkäufe. Die Kennzahlen rechnen mit dem Ø Verkaufspreis pro Tag (Ausreißer gefiltert), weil der günstigste Verkauf oft ein beschädigtes oder falsch eingestelltes Exemplar ist.') + ' Mausrad zoomt, Ziehen verschiebt, Doppelklick zeigt alles. Prices provided by SkyCofl.';
}

/* ---------- Kennzahlen eines Items ---------- */
function analyze(I){
  const md = K.md, id = I.id, A = {};
  const T = md ? K.mdT : null, end = md ? md.days.to : E.dayStart(Date.now());
  const days = T ? T.length : 366;
  // wie die Pipeline: ab recentCut die aktuellen 2-Stunden-Punkte statt der verzögerten Tagespunkte
  const pts = I.k.bz && md && md.recentCut ? E.mergeRecent(I.h1 || [], I.h7 || [], md.recentCut) : (I.h1 || []);
  const d = E.daily(pts.map(p => ({t: p.t, v: p.v})), {days, end});
  A.T = d.t; A.v = E.hampel(d.v);
  A.spi = md ? md.index.spi : null;
  A.L = E.lastIdx(A.v); A.p = A.L >= 0 ? A.v[A.L] : null;
  for (const k of [1, 7, 30, 90]) A['c' + k] = E.change(A.v, k);
  A.c365 = E.change(A.v, days - 1);
  if (A.spi){ A.m30 = E.change(A.spi, 30); A.m365 = E.change(A.spi, days - 1); A.m7 = E.change(A.spi, 7); A.m90 = E.change(A.spi, 90); }
  A.vol = E.volatility(A.v, 30); A.dd = E.maxDrawdown(A.v); A.risk = E.varES(A.v); A.z = E.zscore(A.v, 30);
  A.beta = A.spi ? E.beta(A.v, A.spi) : null;
  const vals = A.v.filter(num); A.pctl = A.p != null && vals.length > 20 ? vals.filter(x => x <= A.p).length / vals.length : null;
  A.min1y = vals.length ? Math.min(...vals) : null; A.max1y = vals.length ? Math.max(...vals) : null;
  // Elastizität
  if (I.k.bz){
    A.eD = E.elasticity(E.weeklySamples(I.h1 || [], 'bmw', 'buy'));
    A.eS = E.elasticity(E.weeklySamples(I.h1 || [], 'smw', 'sell'));
  } else if (I.h1){ A.eD = E.elasticity(E.weeklySamples(I.h1.filter(p => p.v), 'vol', 'v', 'sum')); }
  // Saisonalität (Ortszeit)
  const tz = new Date().getTimezoneOffset();
  A.wd = E.profile(A.T, A.v, 'weekday', 7, tz);
  const h = (I.h7 || []).filter(p => num(p.v));
  if (h.length > 36){ const st = E.median(h.slice(1).map((p, i) => p.t - h[i].t)) / 36e5, win = 2 * Math.round(12 / Math.max(st, .25)) + 1; A.hr = E.profile(h.map(p => p.t), h.map(p => p.v), 'hour', win, tz); A.hrStep = st; } else A.hr = null;
  // Politik und Updates
  if (md){
    const done = md.terms.filter(t => t.end <= md.built && t.start >= A.T[0] + 6 * DAY);   // wie in der Pipeline
    const mine = E.termReturns(A.T, A.v, done), mkt = new Map(E.termReturns(A.T, A.spi, done).map(x => [x.start, x.ret]));
    A.my = E.groupBy(mine.map(x => ({name: x.name, abn: mkt.has(x.start) ? x.ret - mkt.get(x.start) : null})), 'name', 'abn');
    A.ev = md.news.map(nw => { const w = md.eventWindow || 1, a = E.eventReturns(A.T, A.v, nw.date, [1, 7], w), b = E.eventReturns(A.T, A.spi, nw.date, [7], w); return {nw, d1: a.d1, d7: a.d7, abn: a.d7 != null && b.d7 != null ? a.d7 - b.d7 : null}; });
  }
  // Lebenszyklus
  const first = I.hAll && I.hAll.length ? I.hAll[0].t : (I.h1 && I.h1.length && I.h1[0].t > Date.now() - 300 * DAY ? I.h1[0].t : null);
  const volOf = p => I.k.bz ? p.bmw + p.smw : p.vol;
  const recent = (I.h1 || []).filter(p => p.t > Date.now() - 90 * DAY), prev = (I.h1 || []).filter(p => p.t <= Date.now() - 90 * DAY && p.t > Date.now() - 180 * DAY);
  A.life = E.lifecycle(first ? (Date.now() - first) / DAY : null, recent.length > 20 ? E.mean(recent.map(volOf)) : null, prev.length > 20 ? E.mean(prev.map(volOf)) : null);
  return A;
}

function drawItem(liveOnly){
  const I = K.it; if (!I || !I.ready) return;
  const head = $('#mi-head'); if (head) head.innerHTML = itemHead(I.id);
  const body = $('#mi-body'); if (!body) return;
  if (liveOnly && body.contains(document.activeElement) && document.activeElement.matches('input,select')) return;
  if (!liveOnly || !I.A) I.A = analyze(I);
  document.title = nm(I.id) + ' – Analyse – SkyBlock Tools';
  if (!I.k.bz && !I.k.ah){
    body.innerHTML = `<p class="muted-note">${I.k.known ? 'Dieses Item kann man weder im Bazaar noch im Auction House handeln (z. B. Soulbound). Es gibt dafür keinen Marktpreis.' : 'Dieses Item kennt weder Hypixel noch SkyCofl. Prüf die ID.'}</p>${chainHTML(I)}`;
    return;
  }
  body.innerHTML = `${I.err.length ? `<div class="banner warnb">Ein Teil der Daten konnte nicht geladen werden (${esc(I.err[0])}). Die übrigen Zahlen stimmen.</div>` : ''}
    ${glanceHTML(I)}
    <nav class="mk-itabs" role="tablist" aria-label="Analyse">${ITABS.map(t => `<button role="tab" data-mitab="${t.id}" class="${K.itTab === t.id ? 'on' : ''}" aria-selected="${K.itTab === t.id}">${t.label}<small>${t.sub}</small></button>`).join('')}</nav>
    <div class="mk-itab">${(ITABS.find(t => t.id === K.itTab) || ITABS[0]).html(I)}</div>
    <p class="hint">${mdNote()} ${I.k.bz ? 'Live-Werte aus dem Bazaar, Verläufe von SkyCofl.' : 'Lowest BIN aus allen Hypixel-Auktionen, Verläufe und Verkäufe von SkyCofl.'} Prices provided by SkyCofl.</p>`;
}
// Unterteilung der Item-Analyse
const ITABS = [
  {id: 'forecast', label: 'Prognose', sub: '24 h, 7 und 31 Tage', html: I => `<div class="ana-grid">${forecastHTML(I)}</div>`},
  {id: 'market', label: 'Angebot & Nachfrage', sub: 'Volkswirtschaft', html: I => `<div class="ana-grid">${[supplyDemandHTML(I), structureHTML(I), elasticityHTML(I), corridorHTML(I)].join('')}</div>`},
  {id: 'trend', label: 'Entwicklung', sub: 'Inflation, Mayors, Updates', html: I => `<div class="ana-grid">${[inflationHTML(I), politicsHTML(I), updatesItemHTML(I), seasonHTML(I), lifecycleHTML(I)].join('')}</div>`},
  {id: 'money', label: 'Kosten & Gewinn', sub: 'Betriebswirtschaft', html: I => `<div class="ana-grid">${[makeOrBuyHTML(I), contributionHTML(I), flipHTML(I)].join('')}</div>`},
  {id: 'risk', label: 'Risiko & Bewertung', sub: 'Halten oder nicht?', html: I => `<div class="ana-grid">${[valuationHTML(I), riskHTML(I), investHTML(I)].join('')}</div>`},
  {id: 'chain', label: 'Herstellung', sub: 'Rezept und Verwendung', html: I => chainHTML(I)},
];
const card = (title, sbText, inner, wide) => `<section class="${wide ? 'wide' : ''}"><h2>${title}</h2>${inner}${sbText ? `<p class="mk-sb"><b>In SkyBlock:</b> ${sbText}</p>` : ''}</section>`;
const mkFacts = rows => `<dl class="facts">${rows.filter(Boolean).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

function glanceHTML(I){
  const A = I.A, h = K.hy && K.hy[I.id], o = K.md && K.md.items[I.id];
  return `<dl class="facts mk-glance">
    ${[[I.k.bz ? 'Tagesmittel (Basis der Kennzahlen)' : I.id.startsWith('PET_') ? 'Ø Verkaufspreis am Tag (alle Rarities)' : 'Ø Verkaufspreis am Tag', A.p ? price(A.p) : '–'], ['7 Tage', PC(A.c7)], ['30 Tage', PC(A.c30)], ['1 Jahr', PC(A.c365)],
       ['Schwankung pro Tag', A.vol != null ? P(A.vol, false) : '–'], ['Kategorie', catOf(I.id) ? esc(secLabel(catOf(I.id))) : '–'], ['NPC-Verkaufspreis', h && h.npc_sell_price ? price(h.npc_sell_price) : 'keiner'], ['Lebenszyklus', esc(A.life.stage)]]
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}
