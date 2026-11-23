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
  const parts = {none: det({k: 0, f: 0, m: 0, mu: 0, my: false}), trend: det({k: 0, f: 0, m: 0, my: false}), dyn: det({my: false}), all: det({})};
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
  const side = fcSide(I, F), s = F.sim, cfg = F.cfg;
  const now = fcNow(F, side);
  // Chance auf Anstieg gegenüber dem angezeigten Preis
  const upAt = k => { const lim = Math.log(now / side[2]); let c = 0; for (let p = 0; p < s.N; p++) if (s.paths[p * s.H + k] > lim) c++; return c / s.N; };
  const tile = ([h, label]) => {
    const q = s.q[h - 1], med = fcPx(F, side, q[3]);
    return `<div class="pg-tile"><dt>${label}</dt><dd><b>${price(med)}</b> ${PC(med / now - 1)}</dd>
      <dd class="pg-r"><span>wahrscheinlich</span> ${fmt(fcPx(F, side, q[2]))} bis ${fmt(fcPx(F, side, q[4]))}</dd>
      <dd class="pg-r"><span>fast sicher</span> ${fmt(fcPx(F, side, q[1]))} bis ${fmt(fcPx(F, side, q[5]))}</dd>
      <dd class="pg-r"><span>Chance auf Anstieg</span> ${NF0.format(upAt(h - 1) * 100)} %</dd></div>`;
  };
  const sideSeg = F.sides.list.length > 1 ? `<div class="seg sm" role="group" aria-label="Preisart">${F.sides.list.map(([k, l]) => `<button data-fcside="${k}" class="${side[0] === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : '';
  const viewSeg = `<div class="seg sm" role="group" aria-label="Zeitraum">${[31, 90, 180].map(d => `<button data-fcview="${d}" class="${(K.fcView || 31) === d ? 'on' : ''}">${d} Tage</button>`).join('')}</div>`;
  return `<section class="wide pg">
    <h2>Preisprognose</h2>
    <div class="pg-bar">${sideSeg}${viewSeg}</div>
    <p class="pg-now">Jetzt <b>${price(now)}</b> <span class="mut">${side[1]}, Grundlage: ${F.start}</span></p>
    <dl class="pg-tiles">${FCH.map(tile).join('')}</dl>
    ${fcChart(I, F, side)}
    <p class="note">Die Linie ist der mittlere Pfad (Median): Der echte Preis liegt mit gleicher Wahrscheinlichkeit darüber wie darunter. Das dunkle Band zeigt den wahrscheinlichen Bereich (50 % der Fälle), das helle den Bereich, in dem der Preis in 80 % der Fälle landet. „Fast sicher“ in den Kacheln ist dieser 80-%-Bereich.</p>
  </section>
  ${fcTargetHTML(I, F, side)}
  ${fcDriversHTML(I, F, side)}
  ${fcReliabilityHTML(I, F)}`;
}
// Fächerdiagramm: Verlauf der letzten Wochen und Prognose mit 50-%- und 80-%-Band
function fcChart(I, F, side){
  const view = K.fcView || 31, s = F.sim, back = Math.min(view >= 90 ? 90 : 45, F.end + 1);
  const W = 760, Hh = 250, padL = 8, padR = 74, padT = 12, padB = 26;
  const hist = []; for (let i = F.end - back + 1; i <= F.end; i++) if (F.y[i] != null) hist.push([i - F.end - 1, fcPx(F, side, F.y[i])]);
  // Bazaar: echte Verläufe der gewählten Seite statt umgerechneter Basis
  if (I.k.bz && side[0] !== 'mid'){
    const pts = E.mergeRecent(I.h1 || [], I.h7 || [], K.md && K.md.recentCut || 0).map(p => ({t: p.t, v: p[side[0]]}));
    const d = E.daily(pts, {days: F.y.length, end: K.md ? K.md.days.to : E.dayStart(Date.now())}), v = E.hampel(d.v);
    hist.length = 0; for (let i = F.end - back + 1; i <= F.end; i++) if (num(v[i])) hist.push([i - F.end - 1, v[i]]);
  }
  hist.push([0, fcNow(F, side)]);
  const q = s.q.slice(0, view).map(r => r.map(x => fcPx(F, side, x)));
  const all = hist.map(h => h[1]).concat(q.flatMap(r => [r[1], r[5]]));
  let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * .06 || hi * .05; lo = Math.max(0, lo - pad); hi += pad;
  const x0 = -back, x1 = view, X = d => padL + (d - x0) / (x1 - x0) * (W - padL - padR), Y = v => padT + (1 - (v - lo) / (hi - lo)) * (Hh - padT - padB);
  const band = (a, b) => `M${q.map((r, k) => `${X(k + 1).toFixed(1)},${Y(r[a]).toFixed(1)}`).join('L')}L${q.map((r, k) => `${X(k + 1).toFixed(1)},${Y(r[b]).toFixed(1)}`).reverse().join('L')}Z`;
  const p0 = fcNow(F, side);
  const join = (a) => `M${X(0).toFixed(1)},${Y(p0).toFixed(1)}L` + band(a, a).slice(1).split('L').slice(0, q.length).join('L');
  const ticks = [lo + (hi - lo) * .1, lo + (hi - lo) * .5, lo + (hi - lo) * .9];
  const marks = FCH.filter(([h]) => h <= view).map(([h, l]) => `<line x1="${X(h)}" x2="${X(h)}" y1="${padT}" y2="${Hh - padB}" class="pg-mark"/>${X(h) - X(0) > 34 ? `<text x="${X(h)}" y="${Hh - 8}" class="pg-ax" text-anchor="middle">${h === 1 ? '24 h' : h + ' T'}</text>` : ''}`).join('');
  const tips = q.map((r, k) => `<rect x="${X(k + .5)}" y="${padT}" width="${Math.max(X(k + 1.5) - X(k + .5), 1)}" height="${Hh - padT - padB}" class="pg-hit"><title>${new Date(Date.now() + (k + 1) * DAY).toLocaleDateString('de-AT', {weekday: 'short', day: 'numeric', month: 'short'})}: ${price(r[3])}\nwahrscheinlich ${fmt(r[2])} bis ${fmt(r[4])}\n80 %: ${fmt(r[1])} bis ${fmt(r[5])}</title></rect>`).join('');
  return `<figure class="pg-chart"><svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Preisprognose für ${view} Tage">
    ${ticks.map(v => `<line x1="${padL}" x2="${W - padR}" y1="${Y(v)}" y2="${Y(v)}" class="pg-grid"/><text x="${W - padR + 6}" y="${Y(v) + 4}" class="pg-ax">${fmt(v)}</text>`).join('')}
    <line x1="${X(0)}" x2="${X(0)}" y1="${padT}" y2="${Hh - padB}" class="pg-today"/><text x="${X(0) - 4}" y="${Hh - 8}" class="pg-ax" text-anchor="end">heute</text>
    ${marks}
    <path d="${band(1, 5)}" class="pg-b80"/><path d="${band(2, 4)}" class="pg-b50"/>
    <path d="M${hist.map(([d, v]) => `${X(d).toFixed(1)},${Y(v).toFixed(1)}`).join('L')}" class="pg-hist"/>
    <path d="${join(3)}" class="pg-med"/>
    <circle cx="${X(0)}" cy="${Y(p0)}" r="3.5" class="pg-dot"/>
    ${tips}</svg></figure>`;
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
function fcDriversHTML(I, F, side){
  const p = F.parts, ch = (a, b, h) => Math.exp(a[h - 1] - b[h - 1]) - 1;
  const row = (l, a, b, why) => `<tr class="static"><td class="l">${l}${why ? `<small>${why}</small>` : ''}</td><td>${PC(ch(a, b, 7))}</td><td>${PC(ch(a, b, 31))}</td></tr>`;
  const fit = F.fit, dev = Math.exp(F.y0 - fit.a) - 1, tr = fit.trend, tw = tr.slope * 7;
  const mi = F.my.info, myNote = mi && mi.lead ? `Nächster Mayor ${until(mi.end - Date.now())}: ${esc(mi.lead.name)} führt mit ${NF0.format(mi.lead.share * 100)} % der Stimmen${mi.eff != null ? `, typische Wirkung auf dieses Item ${P(mi.eff)} (${mi.n} Amtszeiten${mi.ok ? '' : ', zu unsicher, zählt nicht'})` : ', Wirkung auf dieses Item unbekannt'}. Danach zählen die Mayors mit ihrer Häufigkeit.` : 'Wahl noch offen oder keine Daten zu den Mayors.';
  const tot = (h) => Math.exp(F.sim.q[h - 1][3] - F.y0) - 1;
  return card('Was die Prognose bestimmt', 'Viele Items pendeln um ihren Durchschnitt: Nach einem Sprung kommt der Preis meist zum Teil zurück, weil Spieler billig nachkaufen oder teuer abverkaufen. Trends setzen sich dagegen selten fort. Mayors verschieben Angebot und Nachfrage für bestimmte Items über eine Amtszeit.',
    `<table class="mk-mini"><thead><tr><th class="l nosort">Einfluss</th><th class="nosort">7 Tage</th><th class="nosort">31 Tage</th></tr></thead><tbody>
      ${row('Trend', p.trend, p.none, `${P(tw)} pro Woche in den letzten ${fit.hp.trendWin} Tagen${tr.se < Infinity ? ` (${Math.abs(tr.slope) > 2 * tr.se ? 'deutlich' : Math.abs(tr.slope) > tr.se ? 'schwach' : 'kaum vom Zufall zu unterscheiden'})` : ''}. ${fit.hp.trendW ? 'Klingt in der Prognose ab.' : 'Wird nicht fortgeschrieben: In Rückwärtstests über alle Items sagten vergangene Trends die Zukunft nicht voraus.'}`)}
      ${row('Rückkehr zum Mittel und Schwung', p.dyn, p.trend, `jetzt ${P(dev)} ${dev >= 0 ? 'über' : 'unter'} dem gleitenden Mittel`)}
      ${row('Mayors', p.all, p.dyn, myNote + ' Es zählt nur eine Wirkung, die in mindestens 6 Amtszeiten fast immer in dieselbe Richtung ging.')}
      ${row('Zusammen (ohne Zufall)', p.all, p.none)}
      <tr class="static"><td class="l"><b>Mittlerer simulierter Pfad</b><small>mit Zufall; weicht leicht ab, weil Ausschläge nicht symmetrisch sind</small></td><td>${PC(tot(7))}</td><td>${PC(tot(31))}</td></tr>
    </tbody></table>
    ${mkFacts([['Schwankung pro Tag jetzt', P(fit.sigN, false)], ['Schwankung pro Tag üblich', P(fit.sigL, false)], ['Rückkehr pro Tag', P(fit.k, false) + ' des Abstands'], ['Datenbasis', `${NF0.format(fit.n)} Tage`]])}`);
}
function fcReliabilityHTML(I, F){
  const g = F.cfg.acc, it = I.fcBT;
  if (it === undefined){ I.fcBT = null; setTimeout(() => { const r = fcBacktest(I, F); I.fcBT = r; const el = $('#pg-rel'); if (el && K.it === I) el.innerHTML = fcRelBody(I, F); }, 30); }
  return card('Wie verlässlich ist die Prognose?', 'Niemand kann Preise sicher vorhersagen. Updates, neue Items oder ein einzelner großer Händler können alles ändern. Die Prognose zeigt, was nach dem bisherigen Verhalten des Items wahrscheinlich ist. Die Spannen sind so eingestellt, dass der echte Preis in Rückwärtstests über alle Items so oft drin lag, wie angegeben.',
    `<div id="pg-rel">${fcRelBody(I, F)}</div>`, true);
}
function fcRelBody(I, F){
  const g = F.cfg.acc, it = I.fcBT;
  const rowOf = (h, a) => a && a[h] ? `<td>${NF0.format(a[h].in80 * 100)} %</td><td>${NF0.format(a[h].in50 * 100)} %</td><td>${PC(a[h].skill)}</td><td>${a[h].dir != null ? NF0.format(a[h].dir * 100) + ' %' : '–'}</td>` : '<td>–</td><td>–</td><td>–</td><td>–</td>';
  const tbl = (a, n) => `<table class="mk-mini"><thead><tr><th class="l nosort">Horizont</th><th class="nosort">im 80-%-Bereich</th><th class="nosort">im 50-%-Bereich</th><th class="nosort">genauer als „bleibt gleich“</th><th class="nosort">Richtung richtig</th></tr></thead><tbody>
    ${FCH.map(([h, l]) => `<tr class="static"><td class="l">${l.replace('In ', '')}</td>${rowOf(h, a)}</tr>`).join('')}</tbody></table>${n ? `<p class="note">${n}</p>` : ''}`;
  return `<h4 class="mk-h4">Bei diesem Item (rückwirkend, letzte 120 Tage)</h4>
    ${it === null || it === undefined ? '<p class="loading">Rechnet …</p>' : it.err ? `<p class="note">${it.err}</p>` : tbl(it.score, `${NF0.format(it.n)} Prognosen, jeweils nur mit den Daten bis zu diesem Tag gerechnet.`)}
    <h4 class="mk-h4">Über alle ${I.k.bz ? 'Bazaar' : 'Auction-House'}-Items</h4>
    ${g ? tbl(g, `${NF0.format(F.cfg.n || 0)} Prognosen aus ${I.k.bz ? 'allen Bazaar-Items' : 'den meistgehandelten Auction-House-Items'}${F.cfg.built ? `, Stand ${fdate(F.cfg.built)}` : F.cfg.dev ? ', Auswertung bei der Entwicklung (Nov. 2026)' : ''}. „Genauer als bleibt gleich“: um so viel kleiner war der mittlere Fehler als bei der Annahme, dass sich nichts ändert.`) : '<p class="note">Noch keine Auswertung vorhanden.</p>'}
    <p class="note">Bei 50 % und 80 % sollte der echte Preis etwa so oft im Bereich liegen. Liegt er viel seltener drin, ist das Item gerade schwerer vorherzusagen als sonst.</p>`;
}
function fcBacktest(I, F){
  const y = F.y, end = F.end, cfg = F.cfg, origins = [];
  for (let o = end - 120; o <= end - 1; o += 3) if (o > 60 && y[o] != null) origins.push(o);
  if (origins.length < 8) return {err: 'Zu wenig Verlauf für einen Rückwärtstest.'};
  const rows = Forecast.backtest(y, {origins, horizons: [1, 7, 31], hp: cfg.hp, prior: cfg.prior, n: 300, cal: cfg.cal});
  return {score: Forecast.score(rows), n: rows.filter(r => r.h === 7).length};
}
