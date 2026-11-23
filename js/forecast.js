'use strict';
/* =========================================================
   Forecast – Preisprognose für die Markt-Analyse
   Reine Funktionen ohne DOM. Läuft im Browser (window.Forecast)
   und in Node (Pipeline-Kalibrierung, Backtests, Tests).

   Modell (auf dem Logarithmus des Tagespreises y):
     r(t+1) = κ·(a(t) − y(t))        Rückkehr zum gleitenden Mittel a (Übertreibungen bauen sich ab)
            + φ·r(t)                  Nachwirkung der letzten Tagesbewegung
            + ψ·m(t)                  Schwung der letzten Woche (Momentum)
            + μ·ρ^k                   gedämpfter Trend
            + Mayor-Effekt            Wirkung des jeweiligen Mayors auf dieses Item
            + σ(t)·z                  Zufall: echte vergangene Überraschungen des Items (Bootstrap)
   a ist ein exponentiell gleitender Mittelwert. κ, φ, ψ werden je Item geschätzt und zu den
   Werten aller Items hin geschrumpft (Ridge), damit kurze oder wilde Verläufe nicht entgleisen.
   Tausende simulierte Pfade ergeben Spannen, Wahrscheinlichkeiten und die Zeit bis zu einem Zielpreis.
   Die Breite der Spannen wird an Rückwärtstests aller Items kalibriert (Pipeline).
   ========================================================= */
(function(root){
const F = {};
const DAY = F.DAY = 864e5;
const num = x => typeof x === 'number' && isFinite(x);

// Standardwerte. Die Pipeline schätzt sie aus allen Items neu (market.json → fc).
F.HP = {
  ha: 20,          // Halbwertszeit des gleitenden Mittels a in Tagen
  mom: 7,          // Länge des Momentum-Fensters in Tagen
  ridge: 120,      // Stärke der Schrumpfung zu den Werten aller Items (in „Beobachtungen“)
  recent: 180,     // Halbwertszeit der Gewichtung bei der Schätzung (neuere Tage zählen mehr)
  trendWin: 60,    // Fenster für den Trend in Tagen
  trendHalf: 15,   // Halbwertszeit, mit der der Trend in der Prognose abklingt
  trendW: 0,       // Gewicht des Trends (in Rückwärtstests ohne Vorhersagekraft, darum aus)
  volLam: .94,     // EWMA-Faktor für die aktuelle Schwankung
  volHalf: 10,     // Halbwertszeit, mit der die aktuelle Schwankung zur langfristigen zurückkehrt
  myW: .5,         // Gewicht der Mayor-Effekte
  myK: 3,          // Schrumpfung der Mayor-Effekte: n / (n + myK)
  myN: 6,          // … mindestens so viele gemessene Amtszeiten
  myC: .3,         // … und in mindestens 80 % (bzw. höchstens 20 %) der Amtszeiten gestiegen
};
F.PRIOR = {k: .093, f: -.087, m: -.131};   // Median aller Bazaar-Items; die Pipeline schätzt neu
// Kalibrierung aus Rückwärtstests (Pipeline): je Prognosehorizont in Tagen
//   s: Faktor für die Breite der Spannen (1 = unverändert)
//   w: Faktor für die erwartete Bewegung (1 = wie das Modell, 0 = Preis bleibt gleich)
F.CAL = {h: [1, 2, 3, 5, 7, 14, 31, 90], s: [1, 1, 1, 1, 1, 1, 1, 1], w: [.3, .4, .45, .9, .95, 1.1, 1.15, 1.25]};

// Kalibrierung aus der Entwicklung (Rückwärtstests über 1 890 Bazaar- und 576 AH-Items, Nov. 2026).
// Gilt, bis die Pipeline frische Werte liefert (market.json → fc).
F.DEFAULTS = {"bz": {"prior": {"k": 0.1055, "f": -0.0854, "m": -0.0791}, "cal": {"h": [1, 2, 3, 5, 7, 14, 31, 90], "w": [0.15, 0.35, 0.5, 0.85, 0.9, 0.95, 1.05, 1.1], "s": [1.168, 1.118, 1.096, 1.089, 1.159, 1.173, 1.401, 1.707], "tp": {"x": [0.028, 0.1499, 0.2503, 0.35, 0.4507, 0.5506, 0.6512, 0.7504, 0.8502, 0.9521], "y": [0.0651, 0.1789, 0.2649, 0.353, 0.4245, 0.4926, 0.5992, 0.7216, 0.851, 0.9535]}}, "acc": {"1": {"skill": 0.003, "in50": 0.5845, "in80": 0.8101, "dir": 0.6674}, "7": {"skill": 0.1262, "in50": 0.5075, "in80": 0.7941, "dir": 0.6607}, "31": {"skill": 0.1383, "in50": 0.5176, "in80": 0.7756, "dir": 0.6598}}, "n": 3399}, "ah": {"prior": {"k": 0.3071, "f": -0.1659, "m": -0.1822}, "cal": {"h": [1, 2, 3, 5, 7, 14, 31, 90], "w": [0.95, 0.95, 0.8, 0.85, 0.9, 0.85, 0.85, 1], "s": [1.138, 1.055, 1.031, 1.095, 1.129, 1.183, 1.264, 1.501], "tp": {"x": [0.0302, 0.1493, 0.2496, 0.3507, 0.4515, 0.5498, 0.651, 0.7509, 0.8522, 0.9707], "y": [0.0425, 0.1507, 0.2354, 0.3008, 0.3977, 0.4819, 0.5836, 0.6965, 0.8155, 0.9545]}}, "acc": {"1": {"skill": 0.1058, "in50": 0.5028, "in80": 0.8069, "dir": 0.6646}, "7": {"skill": 0.1922, "in50": 0.5011, "in80": 0.7986, "dir": 0.6836}, "31": {"skill": 0.1862, "in50": 0.4956, "in80": 0.7834, "dir": 0.6991}}, "n": 4881}};

/* ---------- Hilfen ---------- */
F.rng = function(seed){
  let s = seed >>> 0 || 1;
  return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
};
function quant(sorted, p){
  const n = sorted.length; if (!n) return null;
  const x = (n - 1) * p, i = Math.floor(x), f = x - i;
  return i + 1 < n ? sorted[i] + f * (sorted[i + 1] - sorted[i]) : sorted[i];
}
F.quant = quant;
function median(a){ const s = a.filter(num).sort((x, y) => x - y); return quant(s, .5); }
function mad(a){ const m = median(a); return m == null ? null : median(a.map(x => Math.abs(x - m))) * 1.4826; }
// lineares Gleichungssystem (klein) per Gauß mit Pivotisierung
function solve(A, b){
  const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
  for (let c = 0; c < n; c++){
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c){ const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
F.solve = solve;
// interpoliert einen Kalibrierfaktor für Horizont h (Tage), logarithmisch zwischen den Stützstellen
F.calAt = function(cal, h, key = 's'){
  cal = cal || F.CAL; const H = cal.h, S = cal[key] || H.map(() => 1);
  if (h <= H[0]) return S[0]; if (h >= H[H.length - 1]) return S[S.length - 1];
  for (let i = 1; i < H.length; i++) if (h <= H[i]){ const f = (Math.log(h) - Math.log(H[i - 1])) / (Math.log(H[i]) - Math.log(H[i - 1])); return S[i - 1] + f * (S[i] - S[i - 1]); }
  return 1;
};

/* ---------- Schätzung ---------- */
// v: Tagespreise (null = kein Wert). Gibt Logarithmen zurück; Lücken bleiben null.
F.logs = v => v.map(x => num(x) && x > 0 ? Math.log(x) : null);
// gleitendes Mittel über die vorhandenen Werte
F.anchor = function(y, ha){
  const al = 1 - Math.pow(2, -1 / ha), a = new Array(y.length).fill(null); let cur = null;
  for (let i = 0; i < y.length; i++){ if (y[i] != null) cur = cur == null ? y[i] : cur + al * (y[i] - cur); a[i] = cur; }
  return a;
};
// robuster Trend: Steigung (pro Tag) der Wochenmediane im Fenster, mit Standardfehler
F.trend = function(y, end, win){
  const pts = [];
  for (let s = end - win + 1; s <= end; s += 7){
    const w = []; for (let i = Math.max(0, s); i < Math.min(s + 7, end + 1); i++) if (y[i] != null) w.push(y[i]);
    if (w.length >= 3) pts.push([s + 3, median(w)]);
  }
  if (pts.length < 4) return {slope: 0, se: Infinity, n: pts.length};
  const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, sxy = 0; for (const [x, v] of pts){ sxx += (x - mx) ** 2; sxy += (x - mx) * (v - my); }
  const b = sxy / sxx; let ss = 0; for (const [x, v] of pts) ss += (v - my - b * (x - mx)) ** 2;
  return {slope: b, se: Math.sqrt(ss / Math.max(n - 2, 1) / sxx), n};
};
// Regressor-Zeilen für Tag i (Prognose von r(i+1)) – gemeinsam für Schätzung und Simulation
function feats(y, a, i, mom){
  if (y[i] == null || y[i - 1] == null || y[i - mom] == null || a[i] == null) return null;
  return [a[i] - y[i], y[i] - y[i - 1], (y[i] - y[i - mom]) / mom];
}
/* Schätzt das Modell aus den Tagen 0..end (inklusive). prior: {k, f, m}. */
F.fit = function(y, end, hp, prior, start){
  hp = Object.assign({}, F.HP, hp || {}); prior = prior || F.PRIOR;
  if (end == null) end = y.length - 1;
  start = Math.max(0, start || 0);
  const a = new Array(start).fill(null).concat(F.anchor(y.slice(start, end + 1), hp.ha)), mom = hp.mom;
  const X = [], Y = [], W = [], idx = [];
  for (let i = start + mom; i < end; i++){
    const x = feats(y, a, i, mom); if (!x || y[i + 1] == null) continue;
    X.push(x); Y.push(y[i + 1] - y[i]); W.push(Math.pow(2, -(end - i) / hp.recent)); idx.push(i);
  }
  const n = X.length;
  const out = {n, hp, end, a: a[end], y: y[end], prior};
  if (n < 20){ out.k = prior.k; out.f = prior.f; out.m = prior.m; out.c = 0; }
  // robuste Ridge-Regression mit Achsenabschnitt (nicht geschrumpft); zwei Huber-Durchläufe
  let beta = [0, prior.k, prior.f, prior.m], hub = new Array(n).fill(1), scale = null;
  if (n >= 20) for (let pass = 0; pass < (hp.passes || 3); pass++){
    const A = Array.from({length: 4}, () => [0, 0, 0, 0]), b = [0, 0, 0, 0];
    let sw = 0; for (let j = 0; j < n; j++) sw += W[j] * hub[j];
    const lam = hp.ridge / Math.max(n, 1) * sw;   // Ridge-Stärke in „Beobachtungen“, unabhängig von der Gewichtung
    // Varianz der Regressoren, damit die Ridge-Strafe für alle drei vergleichbar wirkt
    const vx = [0, 0, 0]; for (let j = 0; j < n; j++) for (let k = 0; k < 3; k++) vx[k] += W[j] * hub[j] * X[j][k] ** 2;
    for (let k = 0; k < 3; k++) vx[k] = vx[k] / sw || 1e-6;
    for (let j = 0; j < n; j++){
      const w = W[j] * hub[j], row = [1, X[j][0], X[j][1], X[j][2]];
      for (let r = 0; r < 4; r++){ b[r] += w * row[r] * Y[j]; for (let c = 0; c < 4; c++) A[r][c] += w * row[r] * row[c]; }
    }
    const pr = [null, prior.k, prior.f, prior.m];
    for (let k = 1; k < 4; k++){ A[k][k] += lam * vx[k - 1]; b[k] += lam * vx[k - 1] * pr[k]; }
    const s = solve(A, b); if (!s) break; beta = s;
    const res = Y.map((v, j) => v - (beta[0] + beta[1] * X[j][0] + beta[2] * X[j][1] + beta[3] * X[j][2]));
    scale = mad(res) || 1e-4;
    hub = res.map(e => { const u = Math.abs(e) / ((hp.hub || 1.5) * scale); return u <= 1 ? 1 : 1 / u; });
  }
  if (n >= 20){ out.c = beta[0]; out.k = beta[1]; out.f = beta[2]; out.m = beta[3]; }
  // Stabilität: die Dynamik darf nicht explodieren
  // Schwung (f, m) darf sich nicht aufschaukeln: zusammen höchstens +0,15 (bei 0,5 und mehr liefe der Pfad davon)
  out.k = Math.min(Math.max(out.k, 0), .8); out.f = Math.min(Math.max(out.f, -.6), .3); out.m = Math.min(Math.max(out.m, -.6), .15);
  if (out.f + out.m > .15){ const x = (out.f + out.m - .15) / 2; out.f -= x; out.m -= x; }
  // Residuen und Schwankung
  const res = [], sig = []; let ew = null;
  for (let j = 0; j < n; j++){
    const e = Y[j] - (out.c + out.k * X[j][0] + out.f * X[j][1] + out.m * X[j][2]);
    if (ew != null && ew > 0) res.push(e / Math.sqrt(ew));
    ew = ew == null ? e * e : hp.volLam * ew + (1 - hp.volLam) * e * e;
    sig.push(e);
  }
  const recentRes = sig.slice(-180);
  out.sigL = mad(recentRes) || (n ? Math.sqrt(recentRes.reduce((s, e) => s + e * e, 0) / recentRes.length) : .03) || .03;
  // aktuelle Schwankung: EWMA der quadrierten Residuen, robust begrenzt
  out.sigN = ew != null ? Math.min(Math.max(Math.sqrt(ew), out.sigL * .5), out.sigL * 4) : out.sigL;
  // standardisierte Überraschungen für den Bootstrap (Ausreißer bei ±6 gekappt, auf Varianz 1 normiert)
  let z = res.filter(num).map(v => Math.max(-6, Math.min(6, v)));
  if (z.length < 30) z = null; else { const m = z.reduce((s, v) => s + v, 0) / z.length, sd = Math.sqrt(z.reduce((s, v) => s + (v - m) ** 2, 0) / z.length) || 1; z = z.map(v => (v - m) / sd); }
  out.z = z;
  // Trend
  const tr = F.trend(y, end, hp.trendWin);
  const den = tr.slope ** 2 + tr.se ** 2, shrink = !isFinite(den) || den === 0 ? 0 : tr.slope ** 2 / den;
  out.trend = tr; out.mu = hp.trendW * shrink * tr.slope;
  // letzte Werte für den Start der Simulation
  // Lücken mit dem letzten bekannten Wert füllen
  out.hist = []; let last = null;
  for (let i = Math.max(0, end - mom - 30); i <= end; i++) if (y[i] != null) last = y[i]; else if (i >= end - mom) {}
  last = null;
  for (let i = Math.max(0, end - mom - 30); i <= end; i++){ if (y[i] != null) last = y[i]; if (i >= end - mom) out.hist.push(last); }
  if (out.hist[0] == null){ const f = out.hist.find(v => v != null); out.hist = out.hist.map(v => v == null ? f : v); }
  if (out.y == null) out.y = out.hist[out.hist.length - 1];
  if (out.a == null) out.a = out.y;
  return out;
};

/* ---------- Simulation ----------
   opts: H Tage, n Pfade, seed, y0 (Start-Logpreis, z. B. live), drift(k, pfad) optional,
         terms: [{from, to, eff: [[effekt, wahrscheinlichkeit], …]}] (Tage ab jetzt, Effekt in log),
         cal: Kalibrierung der Spannen, noise: Streuung eines Momentpreises um das Tagesmittel (log) */
F.simulate = function(fit, opts){
  const hp = fit.hp, H = opts.H || 31, N = opts.n || 2000, R = F.rng(opts.seed || 12345);
  const mom = hp.mom, al = 1 - Math.pow(2, -1 / hp.ha), rho = Math.pow(2, -1 / hp.trendHalf), rv = Math.pow(2, -1 / hp.volHalf);
  const z = fit.z, zn = z ? z.length : 0;
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = R(); v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const draw = () => zn ? z[Math.floor(R() * zn)] : gauss();
  // Mayor-Drift je Tag (Erwartung über die möglichen Gewinner wird pro Pfad gezogen)
  const terms = (opts.terms || []).filter(t => t.to > 0 && t.from < H);
  const paths = new Float32Array(N * H);
  const hist0 = fit.hist.slice(), y0 = opts.y0 != null ? opts.y0 : fit.y;
  // Varianz je Tag (aktuell → langfristig)
  const sd = new Float64Array(H + 1);
  for (let k = 1; k <= H; k++) sd[k] = Math.sqrt(fit.sigL ** 2 + (fit.sigN ** 2 - fit.sigL ** 2) * Math.pow(rv, k - 1));
  const drift = new Float64Array(H);
  for (let p = 0; p < N; p++){
    drift.fill(0);
    for (const t of terms){
      let u = R(), e = 0; for (const [eff, pr] of t.eff){ if ((u -= pr) <= 0){ e = eff; break; } }
      if (!e) continue;
      const len = t.to - t.from;
      for (let k = Math.max(0, Math.floor(t.from)); k < Math.min(H, Math.ceil(t.to)); k++){
        const ov = Math.min(k + 1, t.to) - Math.max(k, t.from);   // Anteil des Tages k..k+1 in der Amtszeit
        if (ov > 0) drift[k] += e * ov / len;
      }
    }
    const h = hist0.slice(); let y = y0, a = fit.a, r = y0 - h[h.length - 1];
    h.push(y0);
    // das gleitende Mittel sieht den Startpreis als heutigen Wert
    a = a + al * (y0 - a);
    for (let k = 0; k < H; k++){
      const m = (y - h[h.length - 1 - mom]) / mom;
      const step = fit.k * (a - y) + fit.f * r + fit.m * m + fit.mu * Math.pow(rho, k) + drift[k] + sd[k + 1] * draw();
      y += step; r = step; a += al * (y - a); h.push(y);
      if (h.length > mom + 2) h.shift();
      paths[p * H + k] = y;
    }
  }
  return F.summarize(paths, N, H, y0, opts);
};
/* Erwarteter Pfad ohne Zufall (für die Zerlegung der Prognose). Einzelne Teile lassen sich abschalten:
   k, f, m, mu überschreiben die geschätzten Werte, my: false lässt die Mayors weg. */
F.expected = function(fit, opts){
  const hp = fit.hp, H = opts.H || 31, mom = hp.mom, al = 1 - Math.pow(2, -1 / hp.ha), rho = Math.pow(2, -1 / hp.trendHalf);
  const k = opts.k ?? fit.k, f = opts.f ?? fit.f, mm = opts.m ?? fit.m, mu = opts.mu ?? fit.mu;
  const drift = new Float64Array(H);
  if (opts.my !== false) for (const t of opts.terms || []){
    const e = t.eff.reduce((s, [eff, pr]) => s + eff * pr, 0), len = t.to - t.from;
    for (let d = Math.max(0, Math.floor(t.from)); d < Math.min(H, Math.ceil(t.to)); d++){ const ov = Math.min(d + 1, t.to) - Math.max(d, t.from); if (ov > 0) drift[d] += e * ov / len; }
  }
  const y0 = opts.y0 != null ? opts.y0 : fit.y, h = fit.hist.slice(); let y = y0, r = y0 - h[h.length - 1], a = fit.a + al * (y0 - fit.a);
  h.push(y0); const out = new Float64Array(H);
  for (let d = 0; d < H; d++){
    const m = (y - h[h.length - 1 - mom]) / mom, step = k * (a - y) + f * r + mm * m + mu * Math.pow(rho, d) + drift[d];
    y += step; r = step; a += al * (y - a); h.push(y); if (h.length > mom + 2) h.shift(); out[d] = y;
  }
  if (opts.cal) for (let d = 0; d < H; d++) out[d] = y0 + F.calAt(opts.cal, d + 1, 'w') * (out[d] - y0);
  return out;
};
// Quantile je Tag; Kalibrierung streckt die Abweichung vom Median; Momentpreis-Streuung kommt dazu
F.QS = [.05, .1, .25, .5, .75, .9, .95];
F.summarize = function(paths, N, H, y0, opts){
  const cal = opts.cal || F.CAL, noise = opts.noise || 0, R = F.rng((opts.seed || 12345) ^ 0x5bd1e995);
  // ohne Kalibrierung (Rückwärtstest zum Kalibrieren): keine Veränderung
  const raw = opts.cal === false;
  const med = new Float64Array(H), q = [], col = new Float64Array(N);
  for (let k = 0; k < H; k++){
    for (let p = 0; p < N; p++) col[p] = paths[p * H + k];
    const s = Array.from(col).sort((x, y) => x - y); med[k] = quant(s, .5);
  }
  // Kalibrieren und Momentpreis-Streuung
  for (let k = 0; k < H; k++){
    const c = raw ? 1 : F.calAt(cal, k + 1, 's'), w = raw ? 1 : F.calAt(cal, k + 1, 'w'), m2 = y0 + w * (med[k] - y0);
    for (let p = 0; p < N; p++){
      let v = m2 + c * (paths[p * H + k] - med[k]);
      if (noise){ let u = 0; while (u === 0) u = R(); v += noise * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); }
      paths[p * H + k] = v;
    }
    for (let p = 0; p < N; p++) col[p] = paths[p * H + k];
    const s = Array.from(col).sort((x, y) => x - y);
    q.push(F.QS.map(pq => quant(s, pq)));
  }
  return {paths, N, H, y0, q, up: q.map((_, k) => { let c = 0; for (let p = 0; p < N; p++) if (paths[p * H + k] > y0) c++; return c / N; })};
};
// Wahrscheinlichkeit, dass der Preis den Zielwert (log) bis Tag k erreicht. hi: Ausschlag innerhalb eines Tages (log)
// tp: Kalibrierung der Wahrscheinlichkeiten {x: vorhergesagt, y: tatsächlich beobachtet} (aus der Pipeline)
F.tpMap = function(tp, p){
  if (!tp || !tp.x || tp.x.length < 2) return p;
  const X = tp.x, Y = tp.y;
  if (p <= X[0]) return Y[0] * (X[0] > 0 ? p / X[0] : 1);
  if (p >= X[X.length - 1]) return Y[Y.length - 1] + (1 - Y[Y.length - 1]) * (p - X[X.length - 1]) / Math.max(1 - X[X.length - 1], 1e-9);
  for (let i = 1; i < X.length; i++) if (p <= X[i]){ const f = (p - X[i - 1]) / Math.max(X[i] - X[i - 1], 1e-9); return Y[i - 1] + f * (Y[i] - Y[i - 1]); }
  return p;
};
F.touch = function(sim, target, hi, tp){
  const {paths, N, H, y0} = sim, up = target >= y0, out = new Float64Array(H);
  const first = new Int32Array(N).fill(-1);
  for (let p = 0; p < N; p++){
    for (let k = 0; k < H; k++){
      const v = paths[p * H + k];
      if (up ? v + (hi || 0) >= target : v - (hi || 0) <= target){ first[p] = k; break; }
    }
  }
  for (let p = 0; p < N; p++) if (first[p] >= 0) out[first[p]]++;
  for (let k = 0; k < H; k++) out[k] = (k ? out[k - 1] : 0) + out[k] / N;
  if (tp) for (let k = 0; k < H; k++) out[k] = Math.max(F.tpMap(tp, out[k]), k ? out[k - 1] : 0);
  // Zeitpunkte, zu denen 25 / 50 / 75 % der Pfade den Zielwert erreicht haben (Tage, gebrochen)
  const at = pr => { for (let k = 0; k < H; k++) if (out[k] >= pr){ const prev = k ? out[k - 1] : 0; return k + (pr - prev) / Math.max(out[k] - prev, 1e-9); } return null; };
  const already = up ? y0 >= target : y0 <= target;
  return {cum: out, up, already, t25: at(.25), t50: at(.5), t75: at(.75), pEnd: out[H - 1]};
};

/* ---------- Mayor-Amtszeiten als Drift ----------
   eff: {Name: [median, n, anteilGestiegen, mittel]} (Wirkung auf das Item, gegenüber dem Markt)
   freq: {Name: Häufigkeit als Gewinner}, next: {Name: Wahrscheinlichkeit} für die nächste Wahl
   Effekte werden geschrumpft und um den Durchschnitt bereinigt, damit zufällige Mayors im Mittel nichts verschieben. */
F.mayorTerms = function({now, curEnd, termLen, H, eff, freq, next, w, k, minN, minC}){
  if (!eff || !termLen || !curEnd) return [];
  w = w == null ? F.HP.myW : w; k = k == null ? F.HP.myK : k; minN = minN == null ? F.HP.myN : minN; minC = minC == null ? F.HP.myC : minC;
  // nur Wirkungen, die oft genug und in dieselbe Richtung gemessen wurden; sonst 0
  const sh = {}; for (const [n, g] of Object.entries(eff)){ if (g && num(g[0]) && g[1] > 0) sh[n] = g[1] >= minN && Math.abs((g[2] ?? .5) - .5) >= minC ? g[0] * g[1] / (g[1] + k) : 0; }
  const fq = Object.entries(freq || {}).filter(([n]) => n in sh), tot = fq.reduce((s, [, c]) => s + c, 0);
  if (!tot) return [];
  const mean = fq.reduce((s, [n, c]) => s + c / tot * sh[n], 0);
  const dist = fq.map(([n, c]) => [w * (sh[n] - mean), c / tot]);
  const terms = []; let start = (curEnd - now) / DAY, first = true;
  while (start < H){
    let e = dist;
    if (first && next){
      const nx = Object.entries(next).filter(([, p]) => p > 0), s = nx.reduce((a, [, p]) => a + p, 0);
      // Kandidaten ohne bekannte Wirkung zählen mit dem Mittel (0)
      if (s > 0) e = nx.map(([n, p]) => [n in sh ? w * (sh[n] - mean) : 0, p / s]);
    }
    terms.push({from: start, to: start + termLen / DAY, eff: e});
    start += termLen / DAY; first = false;
  }
  return terms;
};

/* ---------- Rückwärtstest ----------
   Für jeden Startpunkt o: Modell nur mit Daten bis o schätzen, simulieren, mit dem echten Preis vergleichen.
   Gibt je Horizont die Fehler (log) der Medianprognose und der naiven Prognose (Preis bleibt gleich),
   die Lage des echten Preises im simulierten Fächer (PIT, für die Kalibrierung) und Trefferquoten zurück. */
F.backtest = function(y, {origins, horizons = [1, 7, 31], hp, prior, n = 400, cal, termsAt, win = 366} = {}){
  const rows = [];
  const Hm = Math.max(...horizons);
  for (const o of origins){
    if (y[o] == null) continue;
    const fit = F.fit(y, o, hp, prior, o - win + 1);
    if (fit.n < 20) continue;
    const sim = F.simulate(fit, {H: Hm, n, seed: 7 + o, cal: cal === undefined ? F.CAL : cal, terms: termsAt ? termsAt(o, Hm) : null});
    for (const h of horizons){
      const t = o + h; if (t >= y.length || y[t] == null) continue;
      const k = h - 1, col = []; for (let p = 0; p < sim.N; p++) col.push(sim.paths[p * Hm + k]);
      col.sort((a, b) => a - b);
      const med = quant(col, .5), act = y[t];
      let below = 0; for (const v of col) if (v < act) below++;
      rows.push({o, h, err: act - med, naive: act - y[o], pit: below / col.length, dev: med - y[o],
        q10: quant(col, .1), q90: quant(col, .9), q25: quant(col, .25), q75: quant(col, .75), act, y0: y[o], spread: (quant(col, .9) - quant(col, .1)) / 2});
    }
  }
  return rows;
};
// Kennzahlen aus Backtest-Zeilen
F.score = function(rows){
  const by = {};
  for (const r of rows) (by[r.h] = by[r.h] || []).push(r);
  const out = {};
  for (const [h, rs] of Object.entries(by)){
    const n = rs.length, mae = rs.reduce((s, r) => s + Math.abs(r.err), 0) / n, maeN = rs.reduce((s, r) => s + Math.abs(r.naive), 0) / n;
    const in80 = rs.filter(r => r.act >= r.q10 && r.act <= r.q90).length / n, in50 = rs.filter(r => r.act >= r.q25 && r.act <= r.q75).length / n;
    const dirRows = rs.filter(r => Math.abs(r.dev) > .01 && r.naive !== 0), dir = dirRows.length ? dirRows.filter(r => Math.sign(r.dev) === Math.sign(r.naive)).length / dirRows.length : null;
    out[h] = {n, mae, maeN, skill: maeN ? 1 - mae / maeN : null, in50, in80, dir, dirN: dirRows.length};
  }
  return out;
};

/* ---------- Kalibrierung über viele Items (Pipeline) ----------
   list: Arrays von Log-Tagespreisen (null = Lücke). Liefert Prior, Faktoren w und s je Horizont und Kennzahlen.
   1. Prior: Median der ungeschrumpften Schätzungen aller Items mit genug Daten
   2. w: Faktor für die erwartete Bewegung, der den (bei 50 % gekappten) absoluten Fehler minimiert
   3. s: Faktor für die Breite, damit der echte Preis in 80 % der Fälle im 80-%-Bereich liegt
   4. Kennzahlen mit der fertigen Kalibrierung auf einem eigenen, späteren Zeitraum */
F.calibrate = function(list, {hp, horizons = [1, 2, 3, 5, 7, 14, 31, 90], step = 7, span = 150, paths = 300, log} = {}){
  hp = Object.assign({}, F.HP, hp || {});
  const say = log || (() => {});
  // 1. Prior
  const K = [], Fv = [], M = [];
  for (const y of list){ const o = y.length - 1 - 100; if (o < 150 || y[o] == null) continue; const f = F.fit(y, o, Object.assign({}, hp, {ridge: 1e-6}), null, o - 365); if (f.n >= 150){ K.push(f.k); Fv.push(f.f); M.push(f.m); } }
  if (K.length < 20) return null;
  const prior = {k: median(K), f: median(Fv), m: median(M)};
  say(`Prior aus ${K.length} Items: k ${prior.k.toFixed(3)}, f ${prior.f.toFixed(3)}, m ${prior.m.toFixed(3)}`);
  const Hm = Math.max(...horizons);
  // Startpunkte: Kalibrierung auf [end−Hm−span−120, end−Hm−120], Prüfung auf den 120 Tagen danach (soweit Zukunft bekannt)
  const orig = (y, a, b) => { const o = []; for (let i = Math.max(a, 120); i <= b; i += step) if (y[i] != null) o.push(i); return o; };
  // 2. w je Horizont (ohne Zufall, schnell)
  const pairs = Object.fromEntries(horizons.map(h => [h, []]));
  for (const y of list){
    const end = y.length - 1;
    for (const o of orig(y, end - Hm - span - 120, end - Hm - 120)){
      const f = F.fit(y, o, hp, prior, o - 365); if (f.n < 20) continue;
      const p = F.expected(f, {H: Hm, y0: y[o], my: false});
      for (const h of horizons) if (y[o + h] != null) pairs[h].push([p[h - 1] - y[o], y[o + h] - y[o]]);
    }
  }
  const w = horizons.map(h => {
    let best = null;
    for (let x = 0; x <= 1.6001; x += .05){ let c = 0; for (const [d, a] of pairs[h]) c += Math.min(Math.abs(a - x * d), .5); if (!best || c < best.c) best = {x: +x.toFixed(2), c}; }
    return best ? best.x : 1;
  });
  // Monoton glätten wäre zu streng (kurze Horizonte brauchen weniger); nur gegen Ausreißer begrenzen
  const cal0 = {h: horizons, w, s: horizons.map(() => 1)};
  say('w: ' + horizons.map((h, i) => `${h}d ${w[i]}`).join(', '));
  // 3. s je Horizont (mit Simulation)
  const ratio = Object.fromEntries(horizons.map(h => [h, []]));
  for (const y of list){
    const end = y.length - 1;
    for (const o of orig(y, end - Hm - span - 120, end - Hm - 120).filter((_, i) => i % 2 === 0)){
      const rows = F.backtest(y, {origins: [o], horizons, hp, prior, n: paths, cal: cal0});
      for (const r of rows) if (r.spread > 0) ratio[r.h].push(Math.abs(r.err) / r.spread);
    }
  }
  const s = horizons.map(h => { const a = ratio[h].sort((x, y) => x - y); return a.length ? +Math.min(Math.max(quant(a, .8), .5), 4).toFixed(3) : 1; });
  const cal = {h: horizons, w, s};
  say('s: ' + horizons.map((h, i) => `${h}d ${s[i]}`).join(', '));
  // 4. Kennzahlen auf späterem Zeitraum (1, 7, 31 Tage)
  const test = [];
  for (const y of list){
    const end = y.length - 1;
    test.push(...F.backtest(y, {origins: orig(y, end - 31 - 120, end - 31).filter((_, i) => i % 2 === 0), horizons: [1, 7, 31], hp, prior, n: paths, cal}));
  }
  // 5. Wahrscheinlichkeit, einen Zielpreis zu erreichen: vorhergesagt gegenüber tatsächlich (Zielpreise ±3 bis ±45 %)
  const bins = Array.from({length: 10}, () => [0, 0, 0]), R = F.rng(99);
  for (const y of list){
    const end = y.length - 1;
    for (const o of orig(y, end - 31 - span - 120, end - 31 - 120).filter((_, i) => i % 2 === 0)){
      const f = F.fit(y, o, hp, prior, o - 365); if (f.n < 20) continue;
      const sim = F.simulate(f, {H: 31, n: paths, seed: o, cal});
      for (const mult of [-.3, -.15, -.07, -.03, .03, .07, .15, .3]){
        const tg = y[o] + mult * (.5 + R()), T = F.touch(sim, tg, 0);
        for (const d of [7, 31]){
          const pr = T.cum[d - 1]; let hit = 0;
          for (let k = 1; k <= d; k++) if (y[o + k] != null && (tg >= y[o] ? y[o + k] >= tg : y[o + k] <= tg)){ hit = 1; break; }
          const b = bins[Math.min(9, Math.floor(pr * 10))]; b[0] += pr; b[1] += hit; b[2]++;
        }
      }
    }
  }
  const tx = [], ty = [];
  for (const b of bins) if (b[2] >= 30){ tx.push(b[0] / b[2]); ty.push(b[1] / b[2]); }
  for (let i = 1; i < ty.length; i++) ty[i] = Math.max(ty[i], ty[i - 1]);   // monoton
  cal.tp = {x: tx.map(v => +v.toFixed(4)), y: ty.map(v => +v.toFixed(4))};
  say('Ziel: ' + tx.map((x, i) => `${(x * 100).toFixed(0)}→${(ty[i] * 100).toFixed(0)}`).join(' '));
  const acc = F.score(test);
  for (const h of Object.keys(acc)) for (const k of Object.keys(acc[h])) if (typeof acc[h][k] === 'number') acc[h][k] = +acc[h][k].toFixed(4);
  say('Prüfung: ' + Object.entries(acc).map(([h, a]) => `${h}d in80 ${a.in80} in50 ${a.in50} skill ${a.skill} dir ${a.dir}`).join(' | '));
  return {hp: {ha: hp.ha, mom: hp.mom, ridge: hp.ridge, recent: hp.recent, trendW: hp.trendW, myW: hp.myW, myK: hp.myK, myN: hp.myN, myC: hp.myC}, prior: {k: +prior.k.toFixed(4), f: +prior.f.toFixed(4), m: +prior.m.toFixed(4)}, cal, acc, n: test.filter(r => r.h === 7).length, items: list.length};
};

if (typeof module !== 'undefined' && module.exports) module.exports = F; else root.Forecast = F;
})(typeof window !== 'undefined' ? window : globalThis);
