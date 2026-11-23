// Tests für js/forecast.js:  node tests/test_forecast.mjs
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const F = require('../js/forecast.js');
let ok = 0, bad = 0;
const check = (name, cond, info = '') => { if (cond) ok++; else { bad++; console.log('FEHLER', name, info); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const R = F.rng(42), g = () => { let u = 0; while (!u) u = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); };
function series(n, kind, vol = .03){
  const y = [Math.log(1000)]; let a = y[0];
  for (let i = 1; i < n; i++){ let r = vol * g(); if (kind === 'mr') r += .3 * (a - y[i - 1]); if (kind === 'trend') r += .01; y.push(y[i - 1] + r); a += (1 - Math.pow(2, -1 / 20)) * (y[i] - a); }
  return y;
}

// Interpolation der Kalibrierung
const cal = {h: [1, 7, 31], s: [1, 2, 3], w: [0, 1, 1]};
check('calAt Stützstelle', F.calAt(cal, 7) === 2);
check('calAt unter/über Bereich', F.calAt(cal, .5) === 1 && F.calAt(cal, 90) === 3);
check('calAt logarithmisch', near(F.calAt(cal, Math.sqrt(7 * 31)), 2.5, 1e-9));
check('calAt w', near(F.calAt(cal, Math.sqrt(7), 'w'), .5, 1e-9));
check('solve', (() => { const x = F.solve([[2, 1], [1, 3]], [3, 5]); return near(x[0], .8, 1e-12) && near(x[1], 1.4, 1e-12); })());

// Schätzung findet Rückkehr zum Mittel
{
  const y = series(600, 'mr'), f = F.fit(y, null, {ridge: 1e-6});
  check('fit erkennt Rückkehr', f.k > .15, f.k);
  check('fit Schwankung', near(f.sigL, .03, .008), f.sigL);
  const y2 = series(600, 'rw'), f2 = F.fit(y2, null, {ridge: 1e-6});
  check('fit Random Walk: kaum Rückkehr', f2.k < .08, f2.k);
}
// Lücken und konstante Preise erzeugen keine ungültigen Werte
{
  const y = series(300, 'rw'); for (let i = 100; i < 300; i += 9) y[i] = null; for (let i = 250; i < 258; i++) y[i] = null;
  const f = F.fit(y, 290), e = F.expected(f, {H: 60});
  check('Lücken: Pfad gültig', Array.from(e).every(Number.isFinite));
  const c = new Array(200).fill(Math.log(.1)), fc = F.fit(c), sc = F.simulate(fc, {H: 31, n: 200});
  check('konstanter Preis: Simulation gültig', sc.q.every(r => r.every(Number.isFinite)));
}
// Ohne Dynamik bleibt der erwartete Pfad flach; Trend schiebt ihn
{
  const y = series(300, 'rw'), f = F.fit(y);
  const flat = F.expected(f, {H: 20, k: 0, f: 0, m: 0, mu: 0, my: false});
  check('flacher Pfad', Array.from(flat).every(v => near(v, f.y, 1e-12)));
  const tr = F.expected(f, {H: 20, k: 0, f: 0, m: 0, mu: .01, my: false});
  check('Trend erhöht', tr[19] > tr[0] && tr[0] > f.y);
}
// Simulation: deterministisch, Quantile geordnet, Spanne wächst
{
  const y = series(400, 'mr'), f = F.fit(y);
  const a = F.simulate(f, {H: 31, n: 500, seed: 9}), b = F.simulate(f, {H: 31, n: 500, seed: 9});
  check('gleicher Seed, gleiches Ergebnis', a.q[30][3] === b.q[30][3]);
  check('Quantile geordnet', a.q.every(r => r.every((v, i) => !i || v >= r[i - 1])));
  check('Spanne wächst', a.q[30][5] - a.q[30][1] > a.q[0][5] - a.q[0][1]);
  check('Chance auf Anstieg 0..1', a.up.every(v => v >= 0 && v <= 1));
}
// Zielpreis: kumulierte Wahrscheinlichkeit steigt, schon erreicht wird erkannt
{
  const y = series(400, 'rw'), f = F.fit(y), s = F.simulate(f, {H: 180, n: 1000, seed: 3, cal: false});
  const T = F.touch(s, s.y0 + .1, 0);
  check('touch monoton', Array.from(T.cum).every((v, i) => !i || v >= T.cum[i - 1]));
  check('touch Zeiten geordnet', T.t25 == null || T.t50 == null || T.t25 <= T.t50);
  check('touch weiter weg = unwahrscheinlicher', F.touch(s, s.y0 + .5, 0).pEnd < T.pEnd);
  check('touch schon erreicht', F.touch(s, s.y0 - .01, 0).already === false && F.touch({...s, y0: s.y0}, s.y0, 0).already === true);
  check('touch nach unten', F.touch(s, s.y0 - .1, 0).up === false);
  check('Ausschlag im Tag macht wahrscheinlicher', F.touch(s, s.y0 + .1, .05).cum[6] >= T.cum[6]);
  // Brownsche Bewegung ohne Drift: P(Maximum über 7 Tage ≥ b) ≈ 2·(1 − Φ(b/(σ√7)))
  const z = .1 / (f.sigL * Math.sqrt(7)), phi = x => .5 * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + .044715 * x ** 3)));
  check('touch nahe Spiegelungsprinzip', Math.abs(T.cum[6] - 2 * (1 - phi(z))) < .12, `${T.cum[6]} vs ${2 * (1 - phi(z))}`);
  const tp = {x: [.1, .5, .9], y: [.2, .4, .8]};
  check('tpMap Stützstellen', near(F.tpMap(tp, .5), .4, 1e-12) && near(F.tpMap(tp, .3), .3, 1e-12) && F.tpMap(tp, 1) === 1 && F.tpMap(tp, 0) === 0);
}
// Mayors: nur verlässliche Wirkungen, Durchschnitt bereinigt, Wahlsieger zuerst
{
  const eff = {A: [.1, 8, .9, .1], B: [-.1, 8, .1, -.1], C: [.5, 2, 1, .5], D: [.05, 8, .5, .05]};
  const t = F.mayorTerms({now: 0, curEnd: 2 * F.DAY, termLen: 5 * F.DAY, H: 31, eff, freq: {A: 1, B: 1, C: 1, D: 1}, next: {A: 1}, w: 1, k: 0, minN: 6, minC: .3});
  check('Amtszeiten bis Horizont', t.length === 6 && t[0].from === 2 && t[5].from === 27);
  check('Wahlsieger sicher', t[0].eff.length === 1 && near(t[0].eff[0][0], .1, 1e-12));
  const m = t[1].eff.reduce((s, [e, p]) => s + e * p, 0);
  check('Durchschnitt bereinigt', near(m, 0, 1e-12));
  check('unsichere Wirkung zählt nicht', t[1].eff.filter(([e]) => e === 0).length === 2);
}
// Rückwärtstest und Kalibrierung auf künstlichen Daten
{
  const list = Array.from({length: 40}, (_, i) => series(520, i % 2 ? 'mr' : 'rw'));
  const c = F.calibrate(list, {paths: 200, step: 14});
  check('Kalibrierung liefert Werte', c && c.cal.s.every(v => v > 0) && c.cal.w.length === 8);
  check('80-%-Bereich trifft', c && c.acc['7'].in80 > .7 && c.acc['7'].in80 < .9, c && c.acc['7'].in80);
  const mr = F.calibrate(Array.from({length: 30}, () => series(520, 'mr')), {paths: 200, step: 14});
  check('besser als „bleibt gleich“ bei Rückkehr zum Mittel (7 Tage)', mr.acc['7'].skill > .1, mr.acc['7'].skill);
  const rw = F.calibrate(Array.from({length: 30}, () => series(520, 'rw')), {paths: 200, step: 14});
  check('Random Walk: kaum schlechter als „bleibt gleich“', rw.acc['7'].skill > -.02 && rw.acc['31'].skill > -.02, rw.acc['7'].skill);
  check('Random Walk: Bewegung wird fast abgeschaltet', rw.cal.w[4] <= .3, rw.cal.w);
  check('Wahrscheinlichkeiten monoton', c && c.cal.tp.y.every((v, i) => !i || v >= c.cal.tp.y[i - 1]));
}
console.log(`bestanden: ${ok}, Fehler: ${bad}`);
process.exit(bad ? 1 : 0);
