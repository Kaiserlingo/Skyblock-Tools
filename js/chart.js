'use strict';
/* =========================================================
   PriceChart – Canvas-Chart für Bazaar-Preise
   - zwei Preislinien (Instabuy / Instasell) mit Spread-Fläche
   - Volumen-Bereich, SMA / EMA / Bollinger auf dem Mittelkurs
   - Zoom (Mausrad), Verschieben (Ziehen), Doppelklick = alles zeigen
   - Zeichenwerkzeuge: Trendlinie, Horizontale, Zone, Fibonacci, Text, Messen, Radierer
   Zeichnungen werden in Zeit/Preis gespeichert und passen sich jedem Zoom an.
   ========================================================= */
(function(){
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const NF1 = new Intl.NumberFormat('de-AT', {maximumFractionDigits: 1});
const NF2 = new Intl.NumberFormat('de-AT', {maximumFractionDigits: 2});
const NF0 = new Intl.NumberFormat('de-AT', {maximumFractionDigits: 0});
function fp(v){
  if (v == null || !isFinite(v)) return '–';
  const a = Math.abs(v);
  if (a >= 1e9) return NF2.format(v/1e9) + ' B';
  if (a >= 1e6) return NF2.format(v/1e6) + ' M';
  if (a >= 1e5) return NF1.format(v/1e3) + ' k';
  if (a >= 100) return NF0.format(v);
  return NF1.format(v);
}
function fdur(ms){
  const m = Math.round(Math.abs(ms) / 60e3);
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  if (h < 48) return h + ' h ' + (m % 60 ? (m % 60) + ' min' : '');
  return NF1.format(h / 24) + ' Tage';
}
const MIN = 60e3, HR = 3600e3, DAY = 86400e3;
const TIME_STEPS = [MIN, 5*MIN, 15*MIN, 30*MIN, HR, 2*HR, 3*HR, 6*HR, 12*HR, DAY, 2*DAY, 7*DAY];
const FIB = [0, .236, .382, .5, .618, .786, 1];
const TWO_POINT = ['trend', 'rect', 'fib', 'measure'];

function niceStep(range, n){
  const raw = range / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}
function sma(a, n){ const o = []; let s = 0; const q = []; for (const v of a){ if (v == null){ o.push(null); continue; } q.push(v); s += v; if (q.length > n) s -= q.shift(); o.push(q.length === n ? s / n : null); } return o; }
function ema(a, n){ const k = 2 / (n + 1); let e = null; return a.map(v => v == null ? null : (e = e == null ? v : v * k + e * (1 - k))); }
function boll(a, n, m){
  const mid = sma(a, n), up = [], lo = []; const q = [];
  a.forEach((v, i) => {
    if (v == null){ up.push(null); lo.push(null); return; }
    q.push(v); if (q.length > n) q.shift();
    if (mid[i] == null){ up.push(null); lo.push(null); return; }
    const sd = Math.sqrt(q.reduce((s, x) => s + (x - mid[i]) ** 2, 0) / n);
    up.push(mid[i] + m * sd); lo.push(mid[i] - m * sd);
  });
  return {mid, up, lo};
}
function segDist(px, py, x1, y1, x2, y2){
  const dx = x2 - x1, dy = y2 - y1, l = dx*dx + dy*dy;
  let t = l ? ((px - x1) * dx + (py - y1) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

class PriceChart {
  constructor(el, opts = {}){
    this.el = el;
    this.opts = Object.assign({tools: false}, opts);
    el.classList.add('pc');
    this.cv = document.createElement('canvas');
    this.tip = document.createElement('div'); this.tip.className = 'pc-tip';
    el.append(this.cv, this.tip);
    this.data = {t: [], hi: [], lo: [], vb: [], vs: []};
    this.ind = {hi: true, lo: true, spread: true, volume: true, sma: 0, ema: 0, bb: false};
    this.view = [Date.now() - HR, Date.now()]; this.follow = true; this.yr = [0, 1]; this.vis = [0, -1];
    this.drawings = []; this.history = []; this.tool = 'none'; this.pending = null; this.measure = null;
    this.mouse = null; this.pan = null; this.onChange = null; this.onHover = null; this.empty = 'Keine Daten';
    this.cv.addEventListener('pointerdown', e => this._down(e));
    this.cv.addEventListener('pointermove', e => this._move(e));
    this.cv.addEventListener('pointerup', e => this._up(e));
    this.cv.addEventListener('pointerleave', () => { this.mouse = null; this.tip.style.display = 'none'; if (this.onHover) this.onHover(null); this.draw(); });
    this.cv.addEventListener('wheel', e => this._wheel(e), {passive: false});
    this.cv.addEventListener('dblclick', () => { if (this.tool === 'none') this.resetView(); });
    this.ro = new ResizeObserver(() => this.draw()); this.ro.observe(el);
  }
  destroy(){ this.ro.disconnect(); this.el.innerHTML = ''; }

  /* ---------- Daten ---------- */
  setData(d, keepView){
    this.fresh = true;
    this.data = {t: d.t || [], hi: d.hi || [], lo: d.lo || [], vb: d.vb || [], vs: d.vs || []};
    const n = this.data.t.length;
    this.gap = 0;
    if (n > 2){ const dts = []; for (let i = 1; i < n; i++) dts.push(this.data.t[i] - this.data.t[i-1]); dts.sort((a, b) => a - b); this.gap = dts[dts.length >> 1] * 4; }
    if (!keepView) this.resetView(true); else if (this.follow) this._followEnd();
    this._calc(); this.draw();
  }
  append(p){
    const d = this.data, last = d.t[d.t.length - 1];
    if (last != null && p.t <= last) return;
    d.t.push(p.t); d.hi.push(p.hi); d.lo.push(p.lo); d.vb.push(p.vb ?? null); d.vs.push(p.vs ?? null);
    if (this.follow) this._followEnd();
    this._calc(); this.draw();
  }
  _followEnd(){ const t = this.data.t; if (!t.length || !this.view) return; const span = this.view[1] - this.view[0]; this.view = [t[t.length-1] - span, t[t.length-1]]; }
  resetView(silent){
    const t = this.data.t;
    this.view = t.length > 1 ? [t[0], t[t.length - 1]] : t.length ? [t[0] - HR/2, t[0] + HR/2] : [Date.now() - HR, Date.now()];
    this.follow = true;
    if (!silent) this.draw();
  }
  setIndicators(o){ Object.assign(this.ind, o); this._calc(); this.draw(); }
  _calc(){
    const {hi, lo} = this.data;
    const mid = hi.map((h, i) => h != null && lo[i] != null ? (h + lo[i]) / 2 : (h ?? lo[i] ?? null));
    this.mid = mid;
    this.smaL = this.ind.sma ? sma(mid, this.ind.sma) : null;
    this.emaL = this.ind.ema ? ema(mid, this.ind.ema) : null;
    this.bbL = this.ind.bb ? boll(mid, 20, 2) : null;
  }

  /* ---------- Zeichnungen ---------- */
  setTool(t){ this.tool = t; this.pending = null; if (t !== 'measure') this.measure = null; this.cv.style.cursor = t === 'none' ? 'grab' : t === 'erase' ? 'not-allowed' : 'crosshair'; this._cancelText(); this.draw(); }
  setDrawings(a){ this.drawings = Array.isArray(a) ? a : []; this.history = []; this.draw(); }
  _commit(next){ this.history.push(JSON.stringify(this.drawings)); if (this.history.length > 50) this.history.shift(); this.drawings = next; if (this.onChange) this.onChange(this.drawings); this.draw(); }
  undo(){ if (!this.history.length) return; this.drawings = JSON.parse(this.history.pop()); if (this.onChange) this.onChange(this.drawings); this.draw(); }
  clearDrawings(){ if (this.drawings.length) this._commit([]); this.measure = null; this.draw(); }

  /* ---------- Geometrie ---------- */
  _layout(){
    const W = this.el.clientWidth, H = this.el.clientHeight;
    const hasVol = this.ind.volume && this.data.vb.some(v => v != null && v > 0);
    const L = 8, R = 76, T = 12, B = 26, gap = hasVol ? 10 : 0;
    const volH = hasVol ? Math.round((H - T - B) * 0.2) : 0;
    const mainB = H - B - volH - gap;
    return {W, H, L, R, T, B, mainB, volT: mainB + gap, volB: H - B, hasVol, pw: W - L - R};
  }
  X(t){ const g = this.g; return g.L + (t - this.view[0]) / (this.view[1] - this.view[0]) * g.pw; }
  Tm(x){ const g = this.g; return this.view[0] + (x - g.L) / g.pw * (this.view[1] - this.view[0]); }
  Y(p){ const g = this.g; return g.T + (1 - (p - this.yr[0]) / (this.yr[1] - this.yr[0])) * (g.mainB - g.T); }
  P(y){ const g = this.g; return this.yr[0] + (1 - (y - g.T) / (g.mainB - g.T)) * (this.yr[1] - this.yr[0]); }
  _pt(e){ const r = this.cv.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; }
  _inPlot(p){ const g = this.g; return g && p.x >= g.L && p.x <= g.L + g.pw && p.y >= g.T && p.y <= g.mainB; }
  _near(x){ // Index des Datenpunkts, der x am nächsten ist
    const t = this.Tm(x), a = this.data.t; if (!a.length) return -1;
    let lo = 0, hi = a.length - 1;
    while (hi - lo > 1){ const m = (lo + hi) >> 1; if (a[m] < t) lo = m; else hi = m; }
    return Math.abs(a[lo] - t) <= Math.abs(a[hi] - t) ? lo : hi;
  }

  /* ---------- Zeichnen ---------- */
  draw(){
    const W = this.el.clientWidth, H = this.el.clientHeight; if (!W || !H) return;
    const dpr = window.devicePixelRatio || 1;
    if (this.cv.width !== Math.round(W * dpr) || this.cv.height !== Math.round(H * dpr)){ this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr); }
    const c = this.ctx = this.cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const col = this.col = {ink: css('--ink'), muted: css('--muted'), line: css('--line'), line2: css('--line2'), surface: css('--surface'), amber: css('--amber'), emerald: css('--emerald'), amberSoft: css('--amber-soft'), emeraldSoft: css('--emerald-soft'), draw: css('--draw'), ind1: css('--ind1'), ind2: css('--ind2'), ind3: css('--ind3'), red: css('--red')};
    const g = this.g = this._layout();
    c.font = '11.5px ' + (css('--font') || 'sans-serif'); c.textBaseline = 'middle';
    const d = this.data, v0 = this.view[0], v1 = this.view[1];
    // sichtbare Indizes (+1 Rand)
    let i0 = 0, i1 = d.t.length - 1;
    while (i0 < d.t.length - 1 && d.t[i0 + 1] < v0) i0++;
    while (i1 > 0 && d.t[i1 - 1] > v1) i1--;
    this.vis = [i0, i1];
    if (!d.t.length){ c.fillStyle = col.muted; c.textAlign = 'center'; c.fillText(this.empty, W/2, H/2); this.yr = [0, 1]; return; }
    // y-Bereich
    let mn = Infinity, mx = -Infinity;
    const take = arr => { if (!arr) return; for (let i = i0; i <= i1; i++){ const v = arr[i]; if (v != null && isFinite(v)){ if (v < mn) mn = v; if (v > mx) mx = v; } } };
    if (this.ind.hi) take(d.hi); if (this.ind.lo) take(d.lo); if (!this.ind.hi && !this.ind.lo) take(this.mid);
    take(this.smaL); take(this.emaL); if (this.bbL){ take(this.bbL.up); take(this.bbL.lo); }
    if (!isFinite(mn)){ mn = 0; mx = 1; }
    if (mn === mx){ mn *= .995; mx *= 1.005; if (mn === mx){ mn -= 1; mx += 1; } }
    const pad = (mx - mn) * .08; this.yr = [mn - pad, mx + pad];

    // Raster + Preisachse
    c.lineWidth = 1; c.strokeStyle = col.line; c.fillStyle = col.muted; c.textAlign = 'left';
    const step = niceStep(this.yr[1] - this.yr[0], 5);
    for (let p = Math.ceil(this.yr[0] / step) * step; p <= this.yr[1]; p += step){
      const y = Math.round(this.Y(p)) + .5;
      c.beginPath(); c.moveTo(g.L, y); c.lineTo(g.L + g.pw, y); c.stroke();
      c.fillText(fp(p), g.L + g.pw + 8, y);
    }
    // Zeitachse
    const span = v1 - v0, ts = TIME_STEPS.find(s => span / s <= 7) || 7 * DAY;
    const tzOff = new Date().getTimezoneOffset() * 60e3;
    c.textAlign = 'center';
    for (let t = Math.ceil((v0 - tzOff) / ts) * ts + tzOff; t <= v1; t += ts){
      const x = Math.round(this.X(t)) + .5, dt = new Date(t);
      c.strokeStyle = col.line; c.beginPath(); c.moveTo(x, g.T); c.lineTo(x, g.volB); c.stroke();
      const lab = ts >= DAY ? dt.toLocaleDateString('de-AT', {day: '2-digit', month: '2-digit'})
        : (dt.getHours() === 0 && dt.getMinutes() === 0 ? dt.toLocaleDateString('de-AT', {day: '2-digit', month: '2-digit'}) : dt.toLocaleTimeString('de-AT', {hour: '2-digit', minute: '2-digit'}));
      c.fillStyle = col.muted; c.fillText(lab, x, g.H - g.B / 2 + 2);
    }
    c.strokeStyle = col.line2; c.beginPath(); c.moveTo(g.L, g.mainB + .5); c.lineTo(g.L + g.pw, g.mainB + .5); c.stroke();

    c.save(); c.beginPath(); c.rect(g.L, 0, g.pw, g.H); c.clip();
    // Spread-Fläche
    if (this.ind.spread && this.ind.hi && this.ind.lo){
      c.fillStyle = col.emeraldSoft; c.globalAlpha = .6;
      this._segments(i0, i1, i => d.hi[i] != null && d.lo[i] != null, (a, b) => {
        c.beginPath();
        for (let i = a; i <= b; i++) c.lineTo(this.X(d.t[i]), this.Y(d.hi[i]));
        for (let i = b; i >= a; i--) c.lineTo(this.X(d.t[i]), this.Y(d.lo[i]));
        c.closePath(); c.fill();
      });
      c.globalAlpha = 1;
    }
    // Bollinger
    if (this.bbL){
      c.setLineDash([4, 3]); this._line(this.bbL.up, col.ind3, 1); this._line(this.bbL.lo, col.ind3, 1); c.setLineDash([]);
      this._line(this.bbL.mid, col.ind3, 1);
    }
    if (this.smaL) this._line(this.smaL, col.ind1, 1.5);
    if (this.emaL) this._line(this.emaL, col.ind2, 1.5);
    if (!this.ind.hi && !this.ind.lo) this._line(this.mid, col.ink, 1.8);
    if (this.ind.hi) this._line(d.hi, col.amber, 1.8);
    if (this.ind.lo) this._line(d.lo, col.emerald, 1.8);
    // Volumen
    if (g.hasVol){
      let vm = 0; for (let i = i0; i <= i1; i++) vm = Math.max(vm, d.vb[i] || 0, d.vs[i] || 0);
      const n = Math.max(1, i1 - i0 + 1), bw = Math.max(1, Math.min(10, g.pw / n * .4));
      for (let i = i0; i <= i1; i++){
        const x = this.X(d.t[i]), hb = (d.vb[i] || 0) / (vm || 1) * (g.volB - g.volT), hs = (d.vs[i] || 0) / (vm || 1) * (g.volB - g.volT);
        c.fillStyle = col.emerald; c.globalAlpha = .45; c.fillRect(x - bw, g.volB - hb, bw, hb);
        c.fillStyle = col.amber; c.fillRect(x, g.volB - hs, bw, hs); c.globalAlpha = 1;
      }
      c.fillStyle = col.muted; c.textAlign = 'left'; c.fillText('Volumen', g.L + 4, g.volT + 8);
    }
    // Zeichnungen
    for (const dr of this.drawings) this._drawItem(dr, false);
    if (this.pending && this.mouse) this._drawItem({...this.pending, p: [this.pending.p[0], {t: this.Tm(this.mouse.x), price: this.P(this.mouse.y)}]}, true);
    if (this.measure) this._drawItem(this.measure, true);
    c.restore();

    // letzte Preise als Marken an der Achse
    const lastIdx = d.t.length - 1;
    if (this.ind.lo && d.lo[lastIdx] != null) this._tag(this.Y(d.lo[lastIdx]), fp(d.lo[lastIdx]), col.emerald);
    if (this.ind.hi && d.hi[lastIdx] != null) this._tag(this.Y(d.hi[lastIdx]), fp(d.hi[lastIdx]), col.amber);
    for (const dr of this.drawings) if (dr.type === 'hline') this._tag(this.Y(dr.p[0].price), fp(dr.p[0].price), col.draw);

    // Fadenkreuz
    if (this.mouse && this._inPlot(this.mouse) && !this.pan){
      const m = this.mouse, idx = this._near(m.x), x = idx >= 0 ? this.X(d.t[idx]) : m.x;
      c.strokeStyle = col.muted; c.setLineDash([3, 3]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(Math.round(x) + .5, g.T); c.lineTo(Math.round(x) + .5, g.volB); c.stroke();
      c.beginPath(); c.moveTo(g.L, Math.round(m.y) + .5); c.lineTo(g.L + g.pw, Math.round(m.y) + .5); c.stroke(); c.setLineDash([]);
      this._tag(m.y, fp(this.P(m.y)), col.ink);
      if (idx >= 0){
        for (const [arr, cc, on] of [[d.hi, col.amber, this.ind.hi], [d.lo, col.emerald, this.ind.lo]]) if (on && arr[idx] != null){ c.fillStyle = cc; c.beginPath(); c.arc(x, this.Y(arr[idx]), 3.5, 0, 7); c.fill(); }
        const tl = new Date(d.t[idx]).toLocaleString('de-AT', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
        c.font = '11px ' + (css('--font') || 'sans-serif'); const tw = c.measureText(tl).width + 12;
        c.fillStyle = col.ink; c.fillRect(Math.min(Math.max(x - tw/2, g.L), g.L + g.pw - tw), g.H - g.B + 3, tw, 18);
        c.fillStyle = col.surface; c.textAlign = 'center'; c.fillText(tl, Math.min(Math.max(x, g.L + tw/2), g.L + g.pw - tw/2), g.H - g.B + 12);
        if (this.onHover) this.onHover(idx); else this._tooltip(idx, x);
      }
    } else this.tip.style.display = 'none';
  }
  _segments(i0, i1, ok, fn){
    let a = null; const d = this.data;
    for (let i = i0; i <= i1 + 1; i++){
      const good = i <= i1 && ok(i) && !(a != null && this.gap && d.t[i] - d.t[i-1] > this.gap);
      if (good && a == null) a = i;
      else if (!good && a != null){ fn(a, i - 1); a = (i <= i1 && ok(i)) ? i : null; }
    }
  }
  _line(arr, color, w){
    const c = this.ctx, d = this.data;
    c.strokeStyle = color; c.lineWidth = w; c.lineJoin = 'round';
    this._segments(this.vis[0], this.vis[1], i => arr[i] != null, (a, b) => {
      c.beginPath(); for (let i = a; i <= b; i++) c.lineTo(this.X(d.t[i]), this.Y(arr[i]));
      if (a === b){ c.arc(this.X(d.t[a]), this.Y(arr[a]), 1.5, 0, 7); }
      c.stroke();
    });
  }
  _tag(y, text, bg){
    const c = this.ctx, g = this.g; if (y < g.T - 2 || y > g.mainB + 2) return;
    c.font = '11px ' + (css('--font') || 'sans-serif');
    const w = Math.max(c.measureText(text).width + 12, g.R - 8);
    c.fillStyle = bg; c.fillRect(g.L + g.pw + 2, y - 9, w, 18);
    c.fillStyle = this.col.surface; c.textAlign = 'left'; c.fillText(text, g.L + g.pw + 8, y + .5);
  }
  _tooltip(idx, x){
    const d = this.data;
    this.tip.innerHTML = `${new Date(d.t[idx]).toLocaleString('de-AT', {weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})}<br>`
      + `<span class="a">Instabuy ${fp(d.hi[idx])}</span><br><span class="e">Instasell ${fp(d.lo[idx])}</span>`
      + (d.hi[idx] != null && d.lo[idx] != null ? `<br><span class="m">Spread ${fp(d.hi[idx] - d.lo[idx])}</span>` : '');
    this.tip.style.display = 'block';
    const w = this.tip.offsetWidth; this.tip.style.left = (x + 14 + w > this.g.L + this.g.pw ? x - w - 14 : x + 14) + 'px'; this.tip.style.top = (this.g.T + 6) + 'px';
  }
  _drawItem(dr, preview){
    const c = this.ctx, g = this.g, col = this.col.draw, p = dr.p;
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1.5; c.globalAlpha = preview ? .8 : 1;
    const x1 = this.X(p[0].t), y1 = this.Y(p[0].price);
    const x2 = p[1] ? this.X(p[1].t) : x1, y2 = p[1] ? this.Y(p[1].price) : y1;
    c.font = '11.5px ' + (css('--font') || 'sans-serif'); c.textBaseline = 'middle';
    if (dr.type === 'trend'){
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      for (const [x, y] of [[x1, y1], [x2, y2]]){ c.beginPath(); c.arc(x, y, 2.5, 0, 7); c.fill(); }
      if (p[1]){ const ch = (p[1].price - p[0].price) / p[0].price * 100; c.textAlign = 'left'; c.fillText((ch > 0 ? '+' : '') + NF1.format(ch) + ' %', x2 + 6, y2 - 10); }
    } else if (dr.type === 'hline'){
      c.setLineDash([6, 4]); c.beginPath(); c.moveTo(g.L, y1); c.lineTo(g.L + g.pw, y1); c.stroke(); c.setLineDash([]);
      if (dr.text){ c.textAlign = 'left'; c.fillText(dr.text, g.L + 6, y1 - 9); }
    } else if (dr.type === 'rect'){
      c.globalAlpha = .12; c.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      c.globalAlpha = preview ? .8 : 1; c.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    } else if (dr.type === 'fib'){
      const hiP = p[0].price, loP = p[1] ? p[1].price : p[0].price, xa = Math.min(x1, x2);
      c.textAlign = 'left';
      for (const f of FIB){
        const pr = loP + (hiP - loP) * f, y = this.Y(pr);
        c.globalAlpha = f === 0 || f === 1 ? 1 : .7;
        c.beginPath(); c.moveTo(xa, y); c.lineTo(g.L + g.pw, y); c.stroke();
        c.fillText(NF1.format(f * 100) + ' %  ' + fp(pr), xa + 4, y - 8);
      }
      c.globalAlpha = .4; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.setLineDash([]);
    } else if (dr.type === 'text'){
      c.textAlign = 'left'; c.font = '600 12.5px ' + (css('--font') || 'sans-serif');
      const w = c.measureText(dr.text).width + 12;
      c.globalAlpha = .12; c.fillRect(x1, y1 - 11, w, 22); c.globalAlpha = 1;
      c.fillText(dr.text, x1 + 6, y1);
    } else if (dr.type === 'measure' && p[1]){
      const dp = p[1].price - p[0].price, pc = dp / p[0].price * 100, up = dp >= 0;
      const cc = up ? this.col.emerald : this.col.red;
      c.fillStyle = cc; c.strokeStyle = cc; c.globalAlpha = .12;
      c.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); c.globalAlpha = 1;
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      const label = `${up ? '+' : ''}${NF2.format(pc)} %  (${up ? '+' : ''}${fp(dp)})  in ${fdur(p[1].t - p[0].t)}`;
      c.font = '600 12px ' + (css('--font') || 'sans-serif'); const w = c.measureText(label).width + 14;
      const lx = Math.min(Math.max((x1 + x2) / 2 - w / 2, g.L), g.L + g.pw - w), ly = Math.min(y1, y2) - 16 < g.T ? Math.max(y1, y2) + 16 : Math.min(y1, y2) - 16;
      c.fillRect(lx, ly - 11, w, 22); c.fillStyle = this.col.surface; c.textAlign = 'left'; c.fillText(label, lx + 7, ly);
    }
    c.globalAlpha = 1;
  }
  _hit(pt){
    for (let k = this.drawings.length - 1; k >= 0; k--){
      const dr = this.drawings[k], p = dr.p, x1 = this.X(p[0].t), y1 = this.Y(p[0].price);
      const x2 = p[1] ? this.X(p[1].t) : x1, y2 = p[1] ? this.Y(p[1].price) : y1;
      let dist = Infinity;
      if (dr.type === 'trend') dist = segDist(pt.x, pt.y, x1, y1, x2, y2);
      else if (dr.type === 'hline') dist = Math.abs(pt.y - y1);
      else if (dr.type === 'rect'){ const inX = pt.x >= Math.min(x1, x2) - 4 && pt.x <= Math.max(x1, x2) + 4, inY = pt.y >= Math.min(y1, y2) - 4 && pt.y <= Math.max(y1, y2) + 4; dist = inX && inY ? 0 : Infinity; }
      else if (dr.type === 'fib'){ if (pt.x >= Math.min(x1, x2) - 4) for (const f of FIB) dist = Math.min(dist, Math.abs(pt.y - this.Y(p[1].price + (p[0].price - p[1].price) * f))); }
      else if (dr.type === 'text') dist = (pt.x >= x1 - 4 && pt.x <= x1 + 8 * dr.text.length + 16 && Math.abs(pt.y - y1) < 13) ? 0 : Infinity;
      if (dist < 7) return k;
    }
    return -1;
  }

  /* ---------- Eingaben ---------- */
  _down(e){
    const pt = this._pt(e); if (!this._inPlot(pt)) return;
    const at = {t: this.Tm(pt.x), price: this.P(pt.y)};
    if (this.tool === 'none'){ this.pan = {x: pt.x, view: [...this.view]}; this.cv.setPointerCapture(e.pointerId); this.cv.style.cursor = 'grabbing'; return; }
    if (this.tool === 'erase'){ const k = this._hit(pt); if (k >= 0) this._commit(this.drawings.filter((_, i) => i !== k)); return; }
    if (this.tool === 'hline'){ this._commit([...this.drawings, {type: 'hline', p: [at]}]); return; }
    if (this.tool === 'text'){ e.preventDefault(); this._askText(pt, at); return; }
    if (TWO_POINT.includes(this.tool)){
      if (!this.pending){ this.pending = {type: this.tool, p: [at]}; if (this.tool === 'measure') this.measure = null; }
      else {
        const dr = {type: this.pending.type, p: [this.pending.p[0], at]}; this.pending = null;
        if (dr.type === 'measure') this.measure = dr; else this._commit([...this.drawings, dr]);
      }
      this.draw();
    }
  }
  _move(e){
    const pt = this._pt(e); this.mouse = pt;
    if (this.pan){
      const dt = (pt.x - this.pan.x) / this.g.pw * (this.pan.view[1] - this.pan.view[0]);
      this.view = [this.pan.view[0] - dt, this.pan.view[1] - dt];
      const t = this.data.t; this.follow = t.length && this.view[1] >= t[t.length - 1];
    }
    if (this.tool === 'erase') this.cv.style.cursor = this._hit(pt) >= 0 ? 'pointer' : 'not-allowed';
    this.draw();
  }
  _up(){ if (this.pan){ this.pan = null; this.cv.style.cursor = 'grab'; this.draw(); } }
  _wheel(e){
    if (!this.data.t.length) return;
    e.preventDefault();
    const pt = this._pt(e), tc = this.Tm(Math.max(this.g.L, Math.min(pt.x, this.g.L + this.g.pw)));
    const f = Math.exp(e.deltaY * 0.0015), t = this.data.t;
    const full = Math.max(t[t.length - 1] - t[0], 10 * MIN), minSpan = Math.max(5 * MIN, (this.gap || MIN) * 2);
    let span = Math.min(Math.max((this.view[1] - this.view[0]) * f, minSpan), full * 1.1);
    const r = (tc - this.view[0]) / (this.view[1] - this.view[0]);
    this.view = [tc - r * span, tc + (1 - r) * span];
    this.follow = this.view[1] >= t[t.length - 1];
    this.draw();
  }
  _askText(pt, at){
    this._cancelText();
    const inp = document.createElement('input'); inp.className = 'pc-text'; inp.placeholder = 'Notiz, Enter zum Setzen';
    inp.style.left = pt.x + 'px'; inp.style.top = (pt.y - 15) + 'px';
    this.el.appendChild(inp); this.textInput = inp; inp.focus(); setTimeout(() => inp.focus(), 0);
    inp.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && inp.value.trim()){ this._commit([...this.drawings, {type: 'text', p: [at], text: inp.value.trim().slice(0, 60)}]); this._cancelText(); }
      if (ev.key === 'Escape') this._cancelText();
      ev.stopPropagation();
    });
    inp.addEventListener('blur', () => setTimeout(() => { if (this.textInput === inp && document.activeElement !== inp) this._cancelText(); }, 150));
  }
  _cancelText(){ if (this.textInput){ this.textInput.remove(); this.textInput = null; } }
  cancel(){ this.pending = null; this.measure = null; this._cancelText(); this.draw(); }
}
window.PriceChart = PriceChart;
})();
