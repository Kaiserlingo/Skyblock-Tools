'use strict';
// Diagramm mit Werkzeugleiste – überall gleich: Zeitraum, Anzeige-Optionen, Zeichenwerkzeuge, Legende.
/* =========================================================
   ChartPanel
   const p = new ChartPanel('mi', {
     ranges: [['7d', '7 Tage'], …], range: '7d', onRange: k => …,   // Zeitraum (Pflicht)
     ranges2: {label: 'Prognose', items: [...], value, onChange},     // zweite Auswahl (optional)
     checks: [['bands', 'Mayor-Amtszeiten', true, 'k-x'], …], onCheck: (k, an) => …,
     drawKey: () => 'draw:markt:ID',                                 // Zeichnungen speichern (pro Item)
   });
   p.html()  → HTML für die Seite    p.mount() → PriceChart (nach dem Einfügen ins DOM)
   Tastenkürzel (V, T, H, Z, F, N, M, E, Strg+Z, Esc) gelten für das zuletzt benutzte Diagramm.
   ========================================================= */
const DRAW_TOOLS = [
  ['none', 'Bewegen', 'V', 'Ziehen verschiebt, Mausrad zoomt, Doppelklick zeigt alles'],
  ['trend', 'Trendlinie', 'T', 'Zwei Klicks: Start und Ende'],
  ['hline', 'Horizontale', 'H', 'Ein Klick: Preislinie, z. B. Unterstützung, Widerstand oder dein Zielpreis'],
  ['rect', 'Zone', 'Z', 'Zwei Klicks: gegenüberliegende Ecken'],
  ['fib', 'Fibonacci', 'F', 'Zwei Klicks: Hoch und Tief'],
  ['text', 'Notiz', 'N', 'Ein Klick, dann Text eingeben'],
  ['measure', 'Messen', 'M', 'Zwei Klicks: Veränderung in Prozent und Zeit'],
  ['erase', 'Radierer', 'E', 'Klick auf eine Zeichnung löscht sie'],
];
const ChartPanels = {};
let chartPanelActive = null;
class ChartPanel {
  constructor(key, o){ this.key = key; this.o = o; this.tool = 'none'; this.chart = null; ChartPanels[key] = this; }
  html(){
    const o = this.o, k = this.key;
    const seg = (attr, items, cur, label) => `<div class="seg" role="group" aria-label="${label}">${items.map(([v, l]) => `<button data-cp="${k}" data-${attr}="${v}" class="${cur === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const tip = DRAW_TOOLS.find(t => t[0] === this.tool)[3];
    return `<div class="cpanel" data-cpanel="${k}">
      <div class="ctrl">
        ${o.ranges ? `<div class="cp-group"><span class="cp-l">${o.rangeLabel || 'Zeitraum'}</span>${seg('cprange', o.ranges, o.range, o.rangeLabel || 'Zeitraum')}</div>` : ''}
        ${o.ranges2 ? `<div class="cp-group"><span class="cp-l">${o.ranges2.label}</span>${seg('cprange2', o.ranges2.items, o.ranges2.value, o.ranges2.label)}</div>` : ''}
        ${o.checks && o.checks.length ? `<div class="checks">${o.checks.map(([v, l, on, c]) => `<label class="chk ${c || ''}"><input type="checkbox" data-cp="${k}" data-cpcheck="${v}" ${on ? 'checked' : ''}>${l}</label>`).join('')}</div>` : ''}
      </div>
      <div class="drawtools" role="toolbar" aria-label="Zeichenwerkzeuge">
        ${DRAW_TOOLS.map(([t, l, key, tp]) => `<button data-cp="${k}" data-cptool="${t}" class="${this.tool === t ? 'on' : ''}" title="${tp} (Taste ${key})">${l}</button>`).join('')}
        <span class="spacer"></span>
        <button data-cp="${k}" data-cpact="undo" title="Letzte Zeichnung rückgängig (Strg+Z)">Rückgängig</button>
        <button data-cp="${k}" data-cpact="clear" class="danger">Alle Zeichnungen löschen</button>
      </div>
      <p class="toolhint" id="${k}-hint">${tip}</p>
      <div class="achart" id="${k}-chart"></div>
      <div class="legendrow" id="${k}-legend"></div>
      <p class="hint" id="${k}-note">${o.note || ''}</p>
    </div>`;
  }
  mount(){
    const el = document.getElementById(this.key + '-chart'); if (!el) return null;
    if (this.chart) this.chart.destroy();
    const ch = this.chart = new PriceChart(el, {tools: true});
    const dk = this.o.drawKey && this.o.drawKey();
    ch.setDrawings(dk ? load(dk, []) : []);
    ch.onChange = dr => { if (dk) save(dk, dr); };
    ch.setTool(this.tool);
    el.addEventListener('pointerdown', () => { chartPanelActive = this.key; });
    chartPanelActive = this.key;
    return ch;
  }
  legend(html){ const el = document.getElementById(this.key + '-legend'); if (el) el.innerHTML = html; }
  note(html){ const el = document.getElementById(this.key + '-note'); if (el) el.innerHTML = html; }
  setTool(t){
    this.tool = t;
    document.querySelectorAll(`[data-cp="${this.key}"][data-cptool]`).forEach(b => b.classList.toggle('on', b.dataset.cptool === t));
    const h = document.getElementById(this.key + '-hint'); if (h) h.textContent = DRAW_TOOLS.find(x => x[0] === t)[3];
    if (this.chart) this.chart.setTool(t);
  }
  alive(){ return !!(this.chart && document.body.contains(this.chart.el)); }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-cp]'); if (!b || b.tagName === 'INPUT') return;
  const p = ChartPanels[b.dataset.cp]; if (!p) return;
  chartPanelActive = p.key;
  const mark = attr => document.querySelectorAll(`[data-cp="${p.key}"][data-${attr}]`).forEach(x => x.classList.toggle('on', x === b));
  if (b.dataset.cprange){ p.o.range = b.dataset.cprange; mark('cprange'); if (p.o.onRange) p.o.onRange(p.o.range); }
  else if (b.dataset.cprange2){ p.o.ranges2.value = b.dataset.cprange2; mark('cprange2'); if (p.o.ranges2.onChange) p.o.ranges2.onChange(p.o.ranges2.value); }
  else if (b.dataset.cptool) p.setTool(b.dataset.cptool);
  else if (b.dataset.cpact === 'undo' && p.chart) p.chart.undo();
  else if (b.dataset.cpact === 'clear' && p.chart) p.chart.clearDrawings();
});
document.addEventListener('change', e => {
  const i = e.target; if (!i.dataset || !i.dataset.cpcheck) return;
  const p = ChartPanels[i.dataset.cp]; if (!p) return;
  const c = (p.o.checks || []).find(x => x[0] === i.dataset.cpcheck); if (c) c[2] = i.checked;
  if (p.o.onCheck) p.o.onCheck(i.dataset.cpcheck, i.checked);
});
document.addEventListener('keydown', e => {
  const p = ChartPanels[chartPanelActive]; if (!p || !p.alive()) return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName) || e.altKey) return;
  if (e.key === 'Escape'){ p.chart.cancel(); p.setTool('none'); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'){ e.preventDefault(); p.chart.undo(); return; }
  if (!e.ctrlKey && !e.metaKey){ const t = DRAW_TOOLS.find(x => x[2].toLowerCase() === e.key.toLowerCase()); if (t) p.setTool(t[0]); }
});
