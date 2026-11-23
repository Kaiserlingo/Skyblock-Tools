'use strict';
/* =========================================================
   Preisprognose
   Modell und Rechnung: js/lib/forecast.js. Hier: Daten des Items vorbereiten, Ergebnis anzeigen.
   ========================================================= */
const FCH = [[1, 'In 24 Stunden'], [7, 'In 7 Tagen'], [31, 'In 31 Tagen']];
const FC_DAYS = 180, FC_PATHS = 2000;
function fcCfg(I){
  const fc = K.md && K.md.fc, g = fc && (I.k.bz ? fc.bz : fc.ah), d = Forecast.DEFAULTS[I.k.bz ? 'bz' : 'ah'];
  if (!g) return {hp: null, prior: d.prior, cal: d.cal, acc: d.acc, n: d.n, built: null, dev: true};
  return {hp: g.hp, prior: g.prior, cal: g.cal, acc: g.acc, n: g.n, built: fc.built};
}
function fcSeed(id){ let h = 2166136261; for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
// Preisarten: Faktor gegenüber der Basisreihe (Bazaar: mengengewichteter Marktpreis, AH: Ø Verkaufspreis)
function fcSides(I){
  const A = I.A;
  if (I.k.bz){
    const pts = (I.h7 || []).filter(p => num(p.v) && p.v > 0);
    const r = k => { const x = pts.filter(p => num(p[k]) && p[k] > 0).map(p => p[k] / p.v); return x.length >= 12 ? E.median(x) : null; };
    const q = S.products[I.id] && S.products[I.id].quick_status;
    const base = q ? E.bazaarPrice({buy: q.buyPrice, sell: q.sellPrice, buyMovingWeek: q.buyMovingWeek, sellMovingWeek: q.sellMovingWeek}) : null;
    const rb = r('buy') || (q && base ? q.buyPrice / base : 1), rs = r('sell') || (q && base ? q.sellPrice / base : 1);
    return {list: [['buy', 'Instabuy', rb], ['sell', 'Instasell', rs], ['mid', 'Marktpreis', 1]], live: base, liveSide: {buy: q && q.buyPrice, sell: q && q.sellPrice, mid: base}};
  }
  const px = pxOf(I.id), lb = px && px.b > 0 ? px.b : I.live && I.live.b;
  // Lowest BIN liegt meist etwas unter dem Ø Verkaufspreis; das heutige Verhältnis gilt als typisch (begrenzt)
  // Liegt der Lowest BIN sehr weit weg (z. B. Pets: Ø über alle Rarities), passt die Umrechnung nicht – dann ohne diese Seite
  const r0 = lb && A.p ? lb / A.p : null, ratio = r0 && r0 >= .4 && r0 <= 2.5 ? r0 : null;
  return {list: [['avg', 'Ø Verkaufspreis', 1]].concat(ratio ? [['lbin', 'Lowest BIN', ratio]] : []), live: null, liveSide: {avg: null, lbin: lb}};
}
// Streuung eines Momentpreises um das Tagesmittel und typischer Ausschlag innerhalb eines Tages (aus den 2-h-Punkten)
function fcIntraday(I){
  const pts = (I.h7 || []).filter(p => num(p.v) && p.v > 0); if (pts.length < 24) return {noise: 0, hi: 0};
  const by = {}; for (const p of pts){ const d = Math.floor(p.t / DAY); (by[d] = by[d] || []).push(Math.log(p.v)); }
  const dev = [], ex = [];
  for (const a of Object.values(by)) if (a.length >= 6){ const m = a.reduce((s, v) => s + v, 0) / a.length; for (const v of a) dev.push(v - m); ex.push((Math.max(...a) - Math.min(...a)) / 2); }
  if (dev.length < 12) return {noise: 0, hi: 0};
  return {noise: Math.min(E.sd(dev) || 0, .2), hi: Math.min(E.median(ex) || 0, .2)};
}
function fcMayor(I, now){
  const md = K.md, A = I.A; if (!md || !A.my) return {terms: [], info: null};
  const cur = curMayor(), end = cur && cur.term ? cur.term.end : nextMayorChange(now);
  const len = E.SB.YEAR;   // eine Amtszeit = ein SkyBlock-Jahr (124 h)
  const freq = {}; for (const t of md.terms) freq[t.name] = (freq[t.name] || 0) + 1;
  const eff = {}; for (const [n, g] of Object.entries(A.my)) if (g && num(g.median)) eff[n] = [g.median, g.n, g.up, g.mean];
  const cand = K.election && K.election.current && K.election.current.candidates || [];
  const tot = cand.reduce((s, c) => s + (c.votes || 0), 0);
  let next = null, lead = null;
  if (tot > 0){
    // Der Führende gewinnt fast immer: Stimmenanteile hoch 4, normiert
    const w = cand.map(c => [c.name, Math.pow(c.votes / tot, 4)]), s = w.reduce((a, [, x]) => a + x, 0);
    next = Object.fromEntries(w.map(([n, x]) => [n, x / s]));
    const l = cand.slice().sort((a, b) => b.votes - a.votes)[0]; lead = {name: l.name, share: l.votes / tot};
  }
  const cfg = fcCfg(I).hp || {};
  const terms = Forecast.mayorTerms({now, curEnd: end, termLen: len, H: FC_DAYS, eff, freq, next, w: cfg.myW, k: cfg.myK});
  const g = lead && A.my[lead.name];
  const hp = Object.assign({}, Forecast.HP, cfg);
  return {terms, info: {end, lead, eff: g ? g.median : null, n: g ? g.n : 0, ok: !!g && g.n >= hp.myN && Math.abs(g.up - .5) >= hp.myC, cur: cur && cur.name}};
}
function fcRun(I){
  const A = I.A; if (!A || !A.v) return null;
  const now = Date.now(), y = Forecast.logs(A.v); let end = y.length - 1; while (end >= 0 && y[end] == null) end--;
  const valid = y.filter(v => v != null).length;
  if (end < 0 || valid < 45) return {err: `Für eine Prognose braucht es mindestens 45 Tage Preisverlauf, hier gibt es ${valid}.`};
  if (end < y.length - 8) return {err: 'Der Preisverlauf endet vor mehr als einer Woche. Ohne aktuelle Preise ist keine sinnvolle Prognose möglich.'};
  const cfg = fcCfg(I), sides = fcSides(I), intra = I.k.bz ? fcIntraday(I) : {noise: 0, hi: 0};
  // Start: Bazaar = Live-Marktpreis, AH = Median der Verkäufe der letzten 24 h (mind. 3), sonst letzter Tag
  let y0 = y[end], start = 'letzter Tagespreis';
  if (I.k.bz && sides.live > 0){ y0 = Math.log(sides.live); start = 'Live-Preis'; }
  else if (I.k.ah && I.ah && I.ah.sold && !I.id.startsWith('PET_')){
    // nur wenn die Verkäufe zum Tagesverlauf passen (Pets mischen alle Rarities, darum dort nie)
    const r = I.ah.sold.list.filter(x => x.t > now - DAY).map(x => x.p), m = r.length >= 3 ? E.median(r) : null;
    if (m && Math.abs(Math.log(m) - y[end]) < Math.log(1.35)){ y0 = Math.log(m); start = 'Verkäufe der letzten 24 h'; }
  }
  // Lowest BIN: Verhältnis zum Startpreis, damit „jetzt“ genau der Live-Wert ist
  if (I.k.ah){ const lb = sides.liveSide.lbin, r0 = lb ? lb / Math.exp(y0) : null; sides.list = sides.list.filter(x => x[0] !== 'lbin'); if (r0 && r0 >= .4 && r0 <= 2.5) sides.list.push(['lbin', 'Lowest BIN', r0]); }
  const fit = Forecast.fit(y, end, cfg.hp, cfg.prior);
  const my = fcMayor(I, now);
  const seed = fcSeed(I.id);
  const sim = Forecast.simulate(fit, {H: FC_DAYS, n: FC_PATHS, seed, y0, terms: my.terms, cal: cfg.cal, noise: intra.noise});
  // Zerlegung der erwarteten Entwicklung (ohne Zufall, Mayors als Erwartungswert)
  const det = (opt) => Forecast.expected(fit, Object.assign({H: 31, y0, terms: my.terms, cal: cfg.cal}, opt));
  const parts = {none: det({k: 0, f: 0, m: 0, mu: 0, my: false}), trend: det({k: 0, f: 0, m: 0, my: false}), rev: det({f: 0, m: 0, my: false}), dyn: det({my: false}), all: det({})};
  return {fit, sim, y0, start, sides, intra, my, cfg, parts, end, y, at: now, seed, liveAt: sides.live};
}
function fcGet(I){
  const f = I.fc, live = fcSides(I).live;
  if (!f || f.A !== I.A || Date.now() - f.at > 10 * 60e3 || (live && (!f.liveAt || Math.abs(live / f.liveAt - 1) > .005))){ I.fc = fcRun(I); if (I.fc) I.fc.A = I.A; }
  return I.fc;
}
// Standard: Bazaar Instabuy (Kaufpreis), Auction House Lowest BIN (was man wirklich zahlt)
function fcSide(I, F){ const L = F.sides.list; return L.find(s => s[0] === K.fcSide) || L.find(s => s[0] === 'lbin') || L[0]; }
const fcPx = (F, side, ly) => Math.exp(ly) * side[2];
// heutiger Preis der gewählten Seite: live, wenn vorhanden (die Prognose rechnet mit dem üblichen Abstand der Seiten)
const fcNow = (F, side) => F.sides.liveSide[side[0]] > 0 ? F.sides.liveSide[side[0]] : fcPx(F, side, F.y0);
function fcWhen(days){
  if (days == null) return null;
  const t = Date.now() + days * DAY;
  const d = new Date(t).toLocaleString('de-AT', {weekday: 'short', day: 'numeric', month: 'short'});
  if (days < 1) return 'innerhalb von 24 Stunden';
  if (days < 14) return `in etwa ${NF1.format(days)} Tagen <span class="mut">(um ${d})</span>`;
  if (days < 60) return `in etwa ${NF1.format(days / 7)} Wochen <span class="mut">(um ${d})</span>`;
  return `in etwa ${NF0.format(days / 30.4)} Monaten <span class="mut">(um ${d})</span>`;
}

function forecastHTML(I){
  const F = fcGet(I);
  if (!F) return card('Preisprognose', '', '<p class="loading">Lädt …</p>', true);
  if (F.err) return card('Preisprognose', '', `<p class="note">${F.err}</p>`, true);
  const side = fcSide(I, F), s = F.sim;
  const now = fcNow(F, side);
  const tile = ([h, label]) => {
    const q = s.q[h - 1], med = fcPx(F, side, q[3]);
    return `<div class="pg-tile"><dt>${label} <span class="mut">${fcDate(F, h)}</span></dt><dd><b>${price(med)}</b> ${PC(med / now - 1)}</dd>
      <dd class="pg-r"><span>wahrscheinlich</span> ${fmt(fcPx(F, side, q[2]))} bis ${fmt(fcPx(F, side, q[4]))}</dd>
      <dd class="pg-r"><span>fast sicher</span> ${fmt(fcPx(F, side, q[1]))} bis ${fmt(fcPx(F, side, q[5]))}</dd>
      <dd class="pg-r"><span>Chance, dass es mehr kostet</span> ${NF0.format(fcUp(F, side, h) * 100)} %</dd></div>`;
  };
  const sideSeg = F.sides.list.length > 1 ? `<div class="cp-group"><span class="cp-l">Preis</span><div class="seg sm" role="group" aria-label="Preisart">${F.sides.list.map(([k, l]) => `<button data-fcside="${k}" class="${side[0] === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>` : '';
  const max = new Date(F.at + FC_DAYS * DAY).toISOString().slice(0, 10), min = new Date(F.at + DAY).toISOString().slice(0, 10);
  return `<section class="wide pg">
    <h2>Preisprognose</h2>
    <div class="pg-bar">${sideSeg}<p class="pg-now">Jetzt <b>${price(now)}</b> <span class="mut">${side[1]}, Grundlage: ${F.start}</span></p></div>
    <dl class="pg-tiles">${FCH.map(tile).join('')}</dl>
    ${pgPanel().html()}
    <div class="pg-date"><label class="input pg-in"><span>Preis an einem Tag</span><input type="date" id="pg-date" min="${min}" max="${max}" value="${esc(K.fcDate || '')}" aria-label="Datum wählen"></label><div id="pg-dres">${pgDateResult(I, F, side)}</div></div>
    <details class="pg-days"${K.fcDays ? ' open' : ''}><summary>Tag für Tag: erwarteter Preis für jedes Datum</summary>${pgTable(I, F, side)}</details>
  </section>
  ${fcTargetHTML(I, F, side)}
  ${fcDriversHTML(I, F, side)}
  ${fcReliabilityHTML(I, F)}`;
}
// Datum in h Tagen, kurz
const fcDate = (F, h) => new Date(F.at + h * DAY).toLocaleDateString('de-AT', {weekday: 'short', day: 'numeric', month: 'short'});
// Anteil der simulierten Pfade, die in h Tagen über dem heutigen Preis der Seite liegen
function fcUp(F, side, h){ const s = F.sim, lim = Math.log(fcNow(F, side) / side[2]), k = h - 1; let c = 0; for (let p = 0; p < s.N; p++) if (s.paths[p * s.H + k] > lim) c++; return c / s.N; }
// Kennzahlen für Tag h (0 = jetzt)
function fcDay(F, side, h){
  const now = fcNow(F, side);
  if (h <= 0) return {h: 0, t: F.at, med: now, q10: now, q25: now, q75: now, q90: now, ch: 0, up: null};
  const q = F.sim.q[Math.min(h, F.sim.H) - 1], med = fcPx(F, side, q[3]);
  return {h, t: F.at + h * DAY, med, q10: fcPx(F, side, q[1]), q25: fcPx(F, side, q[2]), q75: fcPx(F, side, q[4]), q90: fcPx(F, side, q[5]), ch: med / now - 1, up: fcUp(F, side, h)};
}
const fcRel = h => h === 0 ? 'jetzt' : h === 1 ? 'morgen' : `in ${h} Tagen`;

/* ---------- Prognose-Diagramm (gleiches Diagramm wie überall, mit Prognose-Fächer) ---------- */
const FC_HIST = [['7d', '7 Tage', 7], ['30d', '31 Tage', 31], ['90d', '90 Tage', 90], ['1y', '1 Jahr', 365]];
const FC_HOR = [['7', '7 Tage'], ['31', '31 Tage'], ['90', '90 Tage'], ['180', '180 Tage']];
function pgPanel(){
  const p = ChartPanels.pg;
  if (p && p.o.id === S.itemId) return p;
  return new ChartPanel('pg', {
    id: S.itemId, rangeLabel: 'Verlauf', ranges: FC_HIST.map(r => [r[0], r[1]]), range: K.fcHist,
    onRange: r => { K.fcHist = r; pgFeed(); },
    ranges2: {label: 'Prognose', items: FC_HOR, value: String(K.fcView), onChange: v => { K.fcView = +v; pgFeed(); }},
    checks: [['b50', 'Bereich „wahrscheinlich“', K.fcB50, 'k-draw'], ['b80', 'Bereich „fast sicher“', K.fcB80, 'k-draw']],
    onCheck: (k, on) => { K[k === 'b50' ? 'fcB50' : 'fcB80'] = on; pgFeed(true); },
    drawKey: () => 'draw:fc:' + S.itemId,
    note: 'Fahre mit der Maus über den Prognose-Teil: Für jeden Tag stehen erwarteter Preis und Bereiche unter dem Diagramm. Mausrad zoomt, Ziehen verschiebt, Doppelklick zeigt alles. Zeichnungen (z. B. eine Horizontale bei deinem Zielpreis) werden pro Item gespeichert.',
  });
}
// echter Verlauf der gewählten Preisart
function pgHist(I, F, side, days){
  const from = F.at - days * DAY, A = I.A, sk = side[0];
  const val = p => sk === 'buy' || sk === 'sell' ? p[sk] : num(p.v) ? p.v * side[2] : null;
  if (days <= 7 && I.h7 && I.h7.length > 8){
    const pts = I.h7.filter(p => p.t >= from && num(val(p)));
    return {t: pts.map(p => p.t), v: pts.map(val)};
  }
  let v = A.v.map(x => num(x) ? x * side[2] : null);
  if (I.k.bz && (sk === 'buy' || sk === 'sell')){
    const pts = E.mergeRecent(I.h1 || [], I.h7 || [], K.md && K.md.recentCut || 0).map(p => ({t: p.t, v: p[sk]}));
    v = E.hampel(E.daily(pts, {days: A.v.length, end: K.md ? K.md.days.to : E.dayStart(Date.now())}).v);
  }
  const t = [], o = [];
  for (let i = 0; i < A.T.length; i++) if (A.T[i] >= from - DAY / 2 && num(v[i])){ t.push(A.T[i] + DAY / 2); o.push(v[i]); }
  return {t, v: o};
}
function pgFeed(keepView){
  const I = K.it, F = I && I.fc, p = ChartPanels.pg, ch = p && p.chart; if (!ch || !F || F.err) return;
  const side = fcSide(I, F), H = K.fcView, days = (FC_HIST.find(r => r[0] === K.fcHist) || FC_HIST[1])[2];
  const h = pgHist(I, F, side, days);
  ch.labels = {hi: side[1], lo: ''};
  ch.empty = 'Kein Verlauf';
  ch.setIndicators({hi: true, lo: false, spread: false, volume: false, sma: 0, ema: 0, bb: false});
  ch.setData({t: h.t, hi: h.v, lo: h.v.map(() => null), vb: [], vs: []}, true);
  const f = {t: [], med: [], q10: [], q25: [], q75: [], q90: [], show50: K.fcB50, show80: K.fcB80};
  for (let k = 0; k <= H; k++){ const d = fcDay(F, side, k); f.t.push(d.t); for (const x of ['med', 'q10', 'q25', 'q75', 'q90']) f[x].push(d[x]); }
  ch.onHoverFc = k => p.legend(pgLegend(F, side, k == null ? H : k, k == null));
  ch.setForecast(f, keepView);
  p.legend(pgLegend(F, side, H, true));
}
function pgLegend(F, side, h, idle){
  const d = fcDay(F, side, h);
  return `<div class="pg-leg${idle ? ' idle' : ''}">
    <div class="pg-leg-d"><b>${fcRel(h)}</b><span>${new Date(d.t).toLocaleDateString('de-AT', {weekday: 'long', day: 'numeric', month: 'long'})}</span></div>
    <div><span>Erwartet</span><b>${price(d.med)}</b> ${h ? PC(d.ch) : ''}</div>
    <div><span>Wahrscheinlich (50 %)</span>${fmt(d.q25)} bis ${fmt(d.q75)}</div>
    <div><span>Fast sicher (80 %)</span>${fmt(d.q10)} bis ${fmt(d.q90)}</div>
    <div><span>Chance, dass es mehr kostet als jetzt</span>${d.up == null ? '–' : NF0.format(d.up * 100) + ' %'}</div>
  </div>${idle ? '<p class="hint pg-leg-h">Zeigt das Ende des gewählten Zeitraums. Maus über den Prognose-Teil bewegen für einen anderen Tag.</p>' : ''}`;
}
function pgDateResult(I, F, side){
  if (!K.fcDate) return '<p class="hint">Wähle ein Datum in den nächsten 180 Tagen.</p>';
  const t = Date.parse(K.fcDate + 'T12:00:00'), h = Math.round((t - F.at) / DAY);
  if (!isFinite(h) || h < 1 || h > FC_DAYS) return '<p class="note neg">Das Datum muss zwischen morgen und in 180 Tagen liegen.</p>';
  const d = fcDay(F, side, h);
  return `<p class="pg-ans">${esc(side[1])} ${fcRel(h)} (${fcDate(F, h)}): <b>${price(d.med)}</b> ${PC(d.ch)}. Wahrscheinlich ${fmt(d.q25)} bis ${fmt(d.q75)}, fast sicher ${fmt(d.q10)} bis ${fmt(d.q90)}. Chance, dass es dann mehr kostet als jetzt: ${NF0.format(d.up * 100)} %.</p>`;
}
function pgTable(I, F, side){
  const hs = []; for (let h = 1; h <= 31; h++) hs.push(h); for (let h = 35; h <= FC_DAYS; h += 7) hs.push(h); if (hs[hs.length - 1] !== FC_DAYS) hs.push(FC_DAYS);
  return `<table class="mk-mini pg-tbl"><thead><tr><th class="l nosort">Datum</th><th class="nosort">Erwartet</th><th class="nosort">Veränderung</th><th class="nosort">Wahrscheinlich (50 %)</th><th class="nosort">Fast sicher (80 %)</th><th class="nosort">Chance auf mehr</th></tr></thead><tbody>
    ${hs.map(h => { const d = fcDay(F, side, h); return `<tr class="static${h === 7 || h === 31 ? ' hl' : ''}"><td class="l">${fcDate(F, h)}<small>${fcRel(h)}</small></td><td>${price(d.med)}</td><td>${PC(d.ch)}</td><td>${fmt(d.q25)} – ${fmt(d.q75)}</td><td>${fmt(d.q10)} – ${fmt(d.q90)}</td><td>${NF0.format(d.up * 100)} %</td></tr>`; }).join('')}
  </tbody></table><p class="hint">Bis 31 Tage jeder Tag, danach wöchentlich. Preise: ${esc(side[1])}.</p>`;
}
// nach dem Einfügen ins DOM: Diagramm anlegen (Ansicht bleibt erhalten, wenn dasselbe Item neu gezeichnet wird)
function pgMount(view){
  const p = ChartPanels.pg; if (!p || !document.getElementById('pg-chart')) return;
  p.mount(); pgFeed();
  if (view && p.chart){ p.chart.view = view; p.chart.follow = false; p.chart.draw(); }
}
function fcTargetHTML(I, F, side){
  return `<section class="pg-target"><h2>Zielpreis</h2>
    <p class="note">Gib einen Preis ein (${esc(side[1])}). Du bekommst, wann das Item ihn voraussichtlich erreicht und wie wahrscheinlich das ist.</p>
    <label class="input pg-in"><input id="pg-target" inputmode="decimal" autocomplete="off" placeholder="z. B. ${coinText(Math.round(fcPx(F, side, F.y0) * 1.1)) || '1,5m'}" value="${esc(K.fcTarget || '')}" aria-label="Zielpreis"></label>
    <div id="pg-tres">${fcTargetResult(I, F, side)}</div></section>`;
}
function fcTargetResult(I, F, side){
  const raw = K.fcTarget; if (!raw) return '<p class="note">Zum Beispiel 250k, 1,5m oder 2b.</p>';
  const X = parseCoins(raw); if (!(X > 0)) return '<p class="note neg">Das ist keine gültige Zahl.</p>';
  const now = fcNow(F, side), tl = Math.log(X / side[2]);
  const T = Forecast.touch(F.sim, tl, F.intra.hi, F.cfg.cal && F.cfg.cal.tp);
  const ch = X / now - 1;
  if (T.already) return `<p class="pg-ans">Der ${esc(side[1])} liegt mit ${price(now)} schon ${T.up ? 'über' : 'unter'} ${price(X)}.</p>`;
  if ((X >= now) !== T.up) return `<p class="pg-ans">${price(X)} liegt zwischen dem aktuellen ${esc(side[1])} (${price(now)}) und seinem üblichen Abstand zum Marktpreis. Das ist praktisch der heutige Preis.</p>`;
  const P0 = d => T.cum[Math.min(d, F.sim.H) - 1];
  const when = T.t50 != null ? fcWhen(T.t50 + 1) : null;
  const range = T.t25 != null ? `Frühestens ${fcWhen(T.t25 + 1).replace(/^in etwa /, 'in ').replace(/^innerhalb von/, 'innerhalb von')}${T.t75 != null ? `, spätestens ${fcWhen(T.t75 + 1).replace(/^in etwa /, 'in ')}` : ''} (jeweils jede vierte Simulation).` : '';
  const curve = fcCurve(T.cum);
  return `<p class="pg-ans">${price(X)} ist ${pct(ch * 100)} ${ch >= 0 ? 'über' : 'unter'} dem aktuellen Preis. ${when ? `Voraussichtlich erreicht <b>${when}</b>.` : `Innerhalb von ${FC_DAYS} Tagen wird dieser Preis <b>eher nicht</b> erreicht (Wahrscheinlichkeit ${NF0.format(T.pEnd * 100)} %).`}</p>
    ${range ? `<p class="note">${range}</p>` : ''}
    ${mkFacts([['Erreicht innerhalb von 24 Stunden', NF0.format(P0(1) * 100) + ' %'], ['innerhalb von 7 Tagen', NF0.format(P0(7) * 100) + ' %'], ['innerhalb von 31 Tagen', NF0.format(P0(31) * 100) + ' %'], ['innerhalb von 90 Tagen', NF0.format(P0(90) * 100) + ' %'], ['innerhalb von 180 Tagen', NF0.format(P0(180) * 100) + ' %'],
      [`in 31 Tagen ${ch >= 0 ? 'darüber' : 'darunter'}`, NF0.format(fcBeyond(F, tl, 31, ch >= 0) * 100) + ' %']])}
    ${curve}
    <p class="note">„Erreicht“ heißt: Der Preis kommt mindestens einmal dort an, auch kurz innerhalb eines Tages. Ob er dort bleibt, zeigt die letzte Zeile.</p>`;
}
function fcBeyond(F, tl, d, up){ const s = F.sim, k = Math.min(d, s.H) - 1; let c = 0; for (let p = 0; p < s.N; p++){ const v = s.paths[p * s.H + k]; if (up ? v >= tl : v <= tl) c++; } return c / s.N; }
function fcCurve(cum){
  const W = 520, H = 120, pl = 46, pr = 14, pt = 8, pb = 22, n = cum.length;
  const X = k => pl + k / (n - 1) * (W - pl - pr), Y = v => pt + (1 - v) * (H - pt - pb);
  const d = 'M' + Array.from(cum, (v, k) => `${X(k).toFixed(1)},${Y(v).toFixed(1)}`).join('L');
  const xt = [1, 7, 31, 90, 180].filter(x => x <= n);
  return `<figure class="pg-curve"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Wahrscheinlichkeit, den Zielpreis bis zu einem Tag zu erreichen">
    ${[0, .5, 1].map(v => `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" class="pg-grid"/><text x="${pl - 5}" y="${Y(v) + 4}" text-anchor="end" class="pg-ax">${v * 100} %</text>`).join('')}
    ${xt.map(x => `<text x="${X(x - 1)}" y="${H - 6}" text-anchor="middle" class="pg-ax">${x === 1 ? '1 T' : x + ' T'}</text>`).join('')}
    <path d="${d}" class="pg-med"/></svg><figcaption class="note">Wahrscheinlichkeit, den Zielpreis bis zu diesem Tag erreicht zu haben</figcaption></figure>`;
}
/* ---------- Was die Prognose bestimmt ----------
   Zerlegung des erwarteten Pfads (ohne Zufall) in einzelne Einflüsse, dazu Vergleichsfälle aus der eigenen Geschichte des Items. */
function fcDriversHTML(I, F, side){
  const p = F.parts, fit = F.fit, A = I.A, H = 31;
  const ch = (a, b, h) => Math.exp(a[h - 1] - b[h - 1]) - 1;
  const dev = Math.exp(F.y0 - fit.a) - 1, anchor = fcPx(F, side, fit.a);
  const half = fit.k > 0 ? Math.LN2 / fit.k : Infinity;
  const tot31 = Math.exp(F.sim.q[H - 1][3] - F.y0) - 1, tot7 = Math.exp(F.sim.q[6][3] - F.y0) - 1;
  const mi = F.my.info;
  const D = [
    {id: 'rev', name: dev >= 0 ? 'Preis ist gerade hoch' : 'Preis ist gerade niedrig', a: p.rev, b: p.trend,
     why: `Jetzt ${P(Math.abs(dev), false)} ${dev >= 0 ? 'über' : 'unter'} dem Durchschnitt der letzten Wochen (${fmt(anchor)}). ${fit.k > .002 ? `Bei diesem Item baut sich so ein Abstand meist ab, etwa zur Hälfte in ${half < 60 ? NF0.format(half) + ' Tagen' : 'mehreren Monaten'}, weil Spieler bei hohen Preisen verkaufen und bei niedrigen nachkaufen.` : 'Bei diesem Item kommt der Preis nach Ausschlägen kaum zurück; der Abstand zählt deshalb wenig.'}`},
    {id: 'mom', name: 'Schwung der letzten Tage', a: p.dyn, b: p.rev,
     why: d => `Letzte 7 Tage ${P(A.c7)}, gestern ${P(A.c1)}. ${Math.abs(d.c7) < .005 ? 'Für die Prognose spielt das kaum eine Rolle: Bei diesem Item sagt die letzte Bewegung wenig über die nächste.' : d.c7 > 0 ? 'Bei diesem Item setzt sich so eine Bewegung meist kurz fort; das hebt den Preis in den nächsten Tagen etwas.' : 'Daraus folgt bei diesem Item ein kleiner Rückgang in den nächsten Tagen.'} Wirkt nur wenige Tage.`},
    {id: 'my', name: 'Mayor', a: p.all, b: p.dyn,
     why: mi && mi.lead ? `Nächste Wahl ${until(mi.end - Date.now())}: ${esc(mi.lead.name)} führt mit ${NF0.format(mi.lead.share * 100)} %. ${mi.eff != null ? (mi.ok ? `Unter ${esc(mi.lead.name)} lag dieses Item in ${mi.n} Amtszeiten typischerweise bei ${P(mi.eff)}.` : `Unter ${esc(mi.lead.name)} war die Wirkung in ${mi.n} Amtszeiten nicht eindeutig, darum zählt sie nicht.`) : `Zur Wirkung von ${esc(mi.lead.name)} auf dieses Item gibt es keine Daten.`}` : 'Wahl noch offen oder keine Daten zu den Mayors; es zählt nur die durchschnittliche Wirkung aller Mayors.'},
    {id: 'drift', name: 'Grundtendenz', a: p.trend, b: p.none,
     why: `Kleine Dauer-Bewegung aus dem ganzen Verlauf. Trends der letzten Wochen (${P(fit.trend.slope * 7)} pro Woche) werden nicht fortgeschrieben: In Rückwärtstests über alle Items sagten sie die Zukunft nicht voraus.`},
  ].map(d => { Object.assign(d, {c7: ch(d.a, d.b, 7), c31: ch(d.a, d.b, H)}); if (typeof d.why === 'function') d.why = d.why(d); return d; });
  const mx = Math.max(.005, ...D.map(d => Math.abs(d.c31)), ...D.map(d => Math.abs(d.c7)));
  const bar = v => `<span class="pg-bar2"><i class="${v >= 0 ? 'up' : 'dn'}" style="${v >= 0 ? 'left:50%' : `right:50%`};width:${(Math.min(Math.abs(v) / mx, 1) * 50).toFixed(1)}%"></i></span>`;
  const top = D.slice().sort((x, y) => Math.abs(y.c31) - Math.abs(x.c31))[0];
  const flat = Math.abs(tot31) < .01;
  const verdict = flat ? `Die Prognose erwartet in 31 Tagen <b>kaum Veränderung</b> (${PC(tot31)}). Die Einflüsse sind klein oder heben sich auf.`
    : `Die Prognose erwartet in 31 Tagen <b>${tot31 > 0 ? 'einen Anstieg' : 'einen Rückgang'}</b> um ${P(Math.abs(tot31), false)}, vor allem wegen „${top.name}“.`;
  const an = fcAnalogs(F);
  const w80 = fcDay(F, side, H), wid = (w80.q90 - w80.q10) / 2 / w80.med;
  return `<section class="wide pg-why"><h2>Was die Prognose bestimmt</h2>
    <p class="pg-verdict">${verdict}</p>
    <div class="pg-drv">
      <div class="pg-drv-h"><span></span><span>7 Tage</span><span>31 Tage</span></div>
      ${D.map(d => `<div class="pg-drv-r"><div class="pg-drv-n"><b>${d.name}</b><small>${d.why}</small></div>
        <div class="pg-drv-v"><span>7 Tage</span>${bar(d.c7)}${PC(d.c7)}</div><div class="pg-drv-v"><span>31 Tage</span>${bar(d.c31)}${PC(d.c31)}</div></div>`).join('')}
      <div class="pg-drv-r sum"><div class="pg-drv-n"><b>Erwartete Veränderung</b><small>Mitte aller 2000 simulierten Verläufe. Weicht leicht von der Summe ab, weil große Sprünge nach oben häufiger sind als nach unten.</small></div>
        <div class="pg-drv-v"><span>7 Tage</span>${bar(tot7)}${PC(tot7)}</div><div class="pg-drv-v"><span>31 Tage</span>${bar(tot31)}${PC(tot31)}</div></div>
    </div>
    <h3 class="mk-h4">So lief es früher in ähnlicher Lage</h3>
    ${an ? `<p class="pg-ans">An <b>${an.n} Tagen</b> im letzten Jahr lag der Preis ähnlich weit ${dev >= 0 ? 'über' : 'unter'} seinem Durchschnitt wie jetzt. ${an.c7 != null ? `7 Tage später: im Mittel ${PC(an.c7)}` : ''}${an.c31 != null ? `, 31 Tage später: ${PC(an.c31)}` : ''}. ${an.hit != null ? `In ${NF0.format(an.hit * 100)} % dieser Fälle ${dev >= 0 ? 'war er nach 31 Tagen niedriger' : 'war er nach 31 Tagen höher'}.` : ''}</p>
      <p class="hint">Tage, die weniger als 31 Tage auseinanderliegen, gehören oft zur selben Phase; die Fälle sind deshalb nicht ganz unabhängig.</p>`
      : '<p class="note">Im letzten Jahr gab es zu wenige vergleichbare Tage (mindestens 8), um daraus etwas abzulesen.</p>'}
    <h3 class="mk-h4">Warum die Bereiche so breit sind</h3>
    <p class="note">Der Preis bewegt sich bei diesem Item an einem normalen Tag um etwa ${P(fit.sigL, false)}${fit.sigN > fit.sigL * 1.25 ? `, im Moment deutlich mehr (${P(fit.sigN, false)})` : fit.sigN < fit.sigL * .8 ? `, im Moment weniger (${P(fit.sigN, false)})` : ''}. Darum liegt der Bereich „fast sicher“ in 31 Tagen bei etwa ±${P(wid, false)} um den erwarteten Preis. Je ruhiger ein Item, desto enger die Bereiche.</p>
    ${mkFacts([['Datenbasis', `${NF0.format(fit.n)} Tage Preisverlauf`], ['Startpreis', F.start], ['Mittelwert der letzten Wochen', fmt(anchor)], ['Rückkehr zum Mittel', fit.k > .002 ? `${P(fit.k, false)} des Abstands pro Tag` : 'kaum']])}
  </section>`;
}
// Vergleichsfälle: Tage mit ähnlichem Abstand zum gleitenden Mittel, mindestens 31 Tage vor heute
function fcAnalogs(F){
  const y = F.y, end = F.end, a = Forecast.anchor(y.slice(0, end + 1), F.fit.hp.ha), d0 = F.y0 - F.fit.a;
  const tol = Math.max(.02, Math.abs(d0) * .35), c7 = [], c31 = []; let hit = 0, n31 = 0;
  for (let i = 30; i <= end - 7; i++){
    if (y[i] == null || a[i] == null) continue;
    const d = y[i] - a[i]; if (Math.abs(d - d0) > tol || Math.sign(d) !== Math.sign(d0) && Math.abs(d0) > tol) continue;
    if (y[i + 7] != null) c7.push(Math.exp(y[i + 7] - y[i]) - 1);
    if (i + 31 <= end && y[i + 31] != null){ const c = y[i + 31] - y[i]; c31.push(Math.exp(c) - 1); n31++; if (d0 >= 0 ? c < 0 : c > 0) hit++; }
  }
  if (c7.length < 8) return null;
  return {n: c7.length, c7: E.median(c7), c31: c31.length >= 8 ? E.median(c31) : null, hit: n31 >= 8 ? hit / n31 : null};
}
function fcReliabilityHTML(I, F){
  const g = F.cfg.acc, it = I.fcBT;
  if (it === undefined){ I.fcBT = null; setTimeout(() => { const r = fcBacktest(I, F); I.fcBT = r; const el = $('#pg-rel'); if (el && K.it === I) el.innerHTML = fcRelBody(I, F); }, 30); }
  return card('Wie verlässlich ist die Prognose?', 'Niemand kann Preise sicher vorhersagen. Updates, neue Items oder ein einzelner großer Händler können alles ändern. Die Prognose zeigt, was nach dem bisherigen Verhalten des Items wahrscheinlich ist. Die Spannen sind so eingestellt, dass der echte Preis in Rückwärtstests über alle Items so oft drin lag, wie angegeben.',
    `<div id="pg-rel">${fcRelBody(I, F)}</div>`, true);
}
function fcRelBody(I, F){
  const g = F.cfg.acc, it = I.fcBT;
  const st = (v, goal, tol) => v == null ? '' : Math.abs(v - goal) <= tol ? 'pos' : Math.abs(v - goal) <= tol * 2 ? 'amber' : 'neg';
  const pc = (v, c) => `<td class="${c}">${NF0.format(v * 100)} %</td>`;
  const rowOf = (h, a) => { const x = a && a[h]; if (!x) return '<td>–</td><td>–</td><td>–</td><td>–</td>';
    return `${pc(x.in80, st(x.in80, .8, .07))}${pc(x.in50, st(x.in50, .5, .07))}<td class="${x.skill > .02 ? 'pos' : x.skill < -.02 ? 'neg' : ''}">${x.skill == null ? '–' : x.skill >= 0 ? NF0.format(x.skill * 100) + ' % genauer' : NF0.format(-x.skill * 100) + ' % ungenauer'}</td><td>${x.dir != null ? NF0.format(x.dir * 100) + ' %' : '–'}</td>`; };
  const tbl = (a, n) => `<table class="mk-mini pg-rel"><thead><tr><th class="l nosort">Vorhersage für</th><th class="nosort">Preis lag im Bereich „fast sicher“ (Ziel 80 %)</th><th class="nosort">Preis lag im Bereich „wahrscheinlich“ (Ziel 50 %)</th><th class="nosort">Treffer im Vergleich zu „Preis bleibt gleich“</th><th class="nosort">Richtung (steigt oder fällt) stimmte</th></tr></thead><tbody>
    ${FCH.map(([h, l]) => `<tr class="static"><td class="l">${l.replace('In ', '')}</td>${rowOf(h, a)}</tr>`).join('')}</tbody></table>${n ? `<p class="note">${n}</p>` : ''}`;
  return `<h4 class="mk-h4">Bei diesem Item: frühere Prognosen nachgeprüft (letzte 120 Tage)</h4>
    ${it === null || it === undefined ? '<p class="loading">Rechnet …</p>' : it.err ? `<p class="note">${it.err}</p>` : tbl(it.score, `${NF0.format(it.n)} Prognosen, jede nur mit den Daten bis zu ihrem Tag gerechnet und dann mit dem echten Preis verglichen.`)}
    <h4 class="mk-h4">Bei allen ${I.k.bz ? 'Bazaar' : 'Auction-House'}-Items</h4>
    ${g ? tbl(g, `${NF0.format(F.cfg.n || 0)} Prognosen aus ${I.k.bz ? 'allen Bazaar-Items' : 'den meistgehandelten Auction-House-Items'}${F.cfg.built ? `, Stand ${fdate(F.cfg.built)}` : F.cfg.dev ? ', Auswertung bei der Entwicklung (Nov. 2026)' : ''}.`) : '<p class="note">Noch keine Auswertung vorhanden.</p>'}
    <dl class="pg-gloss">
      <div><dt>Bereich „fast sicher“ / „wahrscheinlich“</dt><dd>Wie oft der echte Preis später wirklich in diesem Bereich lag. Gut ist, wenn das nah am Ziel (80 % bzw. 50 %) ist. <span class="pos">Grün</span> = passt, <span class="amber">Gelb</span> = etwas daneben, <span class="neg">Rot</span> = deutlich daneben (das Item ist gerade schwerer vorherzusagen als sonst).</dd></div>
      <div><dt>Im Vergleich zu „Preis bleibt gleich“</dt><dd>Die einfachste Vorhersage ist: Der Preis bleibt, wie er ist. „20 % genauer“ heißt, die Prognose lag im Mittel um ein Fünftel näher am echten Preis.</dd></div>
      <div><dt>Richtung stimmte</dt><dd>Wie oft die Prognose richtig sagte, ob der Preis steigt oder fällt. 50 % wäre Raten.</dd></div>
    </dl>`;
}
function fcBacktest(I, F){
  const y = F.y, end = F.end, cfg = F.cfg, origins = [];
  for (let o = end - 120; o <= end - 1; o += 3) if (o > 60 && y[o] != null) origins.push(o);
  if (origins.length < 8) return {err: 'Zu wenig Verlauf für einen Rückwärtstest.'};
  const rows = Forecast.backtest(y, {origins, horizons: [1, 7, 31], hp: cfg.hp, prior: cfg.prior, n: 300, cal: cfg.cal});
  return {score: Forecast.score(rows), n: rows.filter(r => r.h === 7).length};
}
