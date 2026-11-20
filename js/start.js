'use strict';
/* =========================================================
   Startseite – verbindet Bazaar Flipper und Markt-Analyse auf oberster Ebene.
   Liest nur fertige Daten beider Bereiche (S aus app.js, Markt.data() aus markt.js)
   und zeigt, wo sich gerade etwas tut: beste Flips, frühe Signale, Marktlage.
   ========================================================= */
(function(){
const E = window.Econ, DAY = E.DAY;
const $ = s => document.querySelector(s);
const P = (x, sign = true) => x == null || !isFinite(x) ? '–' : pct(x * 100, sign);
const PC = x => `<span class="${x == null ? 'mut' : cls(x)}">${P(x)}</span>`;
const num = v => v != null && isFinite(v);
const M = () => window.Markt;
const st = {filter: 'all', loaded: false};
function until(ms){
  if (ms <= 0) return 'jetzt';
  const m = Math.round(ms / 60e3); if (m < 60) return 'in ' + m + ' min';
  const h = Math.floor(m / 60); if (h < 48) return 'in ' + h + ' h';
  return 'in ' + Math.round(h / 24) + ' Tagen';
}
function name(id){ return M() ? M().nm(id) : pretty(id); }

/* ---------- Frühe Signale ----------
   Jedes Signal: {type, id, strength, title, text, bz (Bazaar-Item?)}
   strength sortiert die Liste: je ungewöhnlicher, desto weiter oben. */
const TYPES = {
  jump:  {label: 'Preissprung', desc: 'Der Live-Preis weicht ungewöhnlich stark vom Durchschnitt der letzten 24 Stunden ab, gemessen an der üblichen Schwankung des Items.'},
  mayor: {label: 'Mayor-Wechsel', desc: 'Der Mayor wechselt bald, und diese Items haben unter dem Wahlführenden bisher regelmäßig zugelegt.'},
  ah:    {label: 'AH-Schnäppchen', desc: 'Der Lowest BIN liegt deutlich unter dem nächsten Angebot. Nach Gebühren bliebe beim Weiterverkauf Gewinn. Prüf vor dem Kauf, ob sich die Exemplare unterscheiden (Stars, Enchants, Attribute, Reforge).'},
  npc:   {label: 'Unter NPC-Preis', desc: 'Kaufen per Instabuy und an den NPC verkaufen bringt sofort Gewinn.'},
};
function signals(){
  const d = M() ? M().data() : {}, md = d.md, px = d.px, out = [], now = Date.now();
  // 1) Preissprung: Live-Marktpreis (gleiche Formel wie die Tagesdaten) gegen den letzten Tagespreis
  if (md && S.rows.length){
    for (const id in md.items){
      const o = md.items[id], p = S.products[id], ref = o.p24; if (!o.liq || !ref || !o.v30 || !p) continue;
      const q = p.quick_status || {}, live = E.bazaarPrice({buy: q.buyPrice, sell: q.sellPrice, buyMovingWeek: q.buyMovingWeek, sellMovingWeek: q.sellMovingWeek});
      if (!live) continue;
      const dev = live / ref - 1, z = Math.log(live / ref) / o.v30;
      if (Math.abs(dev) >= .05 && Math.abs(z) >= 3) out.push({type: 'jump', id, bz: true, strength: Math.min(8, Math.abs(z) / 2),
        title: `${P(dev)} gegenüber den 24 h davor`,
        text: `Live ${price(live)}, Ø der 24 Stunden vor ${new Date(md.built).toLocaleString('de-AT', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}: ${price(ref)}. Sonst bewegt sich der Preis um etwa ${P(o.v30, false)} am Tag.`});
    }
  }
  // 2) Mayor-Wechsel: Wahlführender und seine typischen Gewinner (mind. 3 Amtszeiten, meist gestiegen)
  const cand = d.election && d.election.current && d.election.current.candidates;
  if (md && cand && cand.length && d.mayorEnd && d.mayorEnd - now < 48 * 3600e3){
    const lead = cand.slice().sort((a, b) => b.votes - a.votes)[0], fx = md.mayorFx[lead.name];
    const tot = cand.reduce((s, c) => s + (c.votes || 0), 0);
    if (fx && (!d.mayor || d.mayor.name !== lead.name)) for (const r of fx.top){
      const [id, med, n, up] = r; if (n < 3 || up < .67 || med < .05) continue;
      out.push({type: 'mayor', id, bz: true, strength: 2 + med * 10 * up,
        title: `unter ${esc(lead.name)} typischerweise ${P(med)}`,
        text: `${esc(lead.name)} führt die Wahl mit ${tot ? NF0.format(lead.votes / tot * 100) : '–'} %, Wechsel ${until(d.mayorEnd - now)}. In ${Math.round(up * n)} von ${n} Amtszeiten gestiegen, gegenüber dem Markt.`});
    }
  }
  // 3) AH-Schnäppchen: Lowest BIN weit unter dem zweitgünstigsten Angebot
  if (px && (!d.pxAge || d.pxAge < 30 * 60e3)){
    for (const id in px.items){
      const x = px.items[id]; if (x.b == null || !x.l5 || x.l5.length < 3 || x.n < 8 || x.b < 5e5 || x.v) continue;
      const next = x.l5[1], gain = next * (1 - M().ahFee(next)) - x.b;
      if (next / x.b - 1 >= .15 && gain > 0) out.push({type: 'ah', id, bz: false, strength: Math.min(6, 1 + Math.log10(gain / 1e5 + 1) * 2),
        title: `nächstes Angebot ${P(next / x.b - 1, false)} teurer`,
        text: `Kaufen für ${price(x.b)}, nächstes Angebot ${price(next)}. Nach Gebühren etwa ${fmt(gain)} Gewinn beim Weiterverkauf zum nächsten Preis. ${NF0.format(x.n)} BIN-Angebote. Prüf, ob sich die Exemplare unterscheiden.`});
    }
  }
  // 4) Unter NPC-Preis (aus den Live-Daten des Flippers)
  for (const r of S.rows){
    if (r.npc > 0 && r.topSell > 0 && r.npcInsta > 0 && liquid(r)) out.push({type: 'npc', id: r.id, bz: true, strength: 5 + Math.min(3, r.npcInsta / r.topSell * 20),
      title: `${price(r.npcInsta)} pro Stück sofort`, text: `Instabuy ${price(r.topSell)}, der NPC zahlt ${price(r.npc)}.`});
  }
  return out.sort((a, b) => b.strength - a.strength);
}

/* ---------- Seite ---------- */
function render(){
  return `<div class="home">
    <section class="home-hero">
      <h1 class="lead small" id="home-lead">${lead()}</h1>
      <div id="home-kpis">${kpis()}</div>
    </section>
    <div class="home-grid">
      <section class="home-sig"><header><h2>Frühe Signale</h2><span class="mut">aus Bazaar, Auction House und Marktdaten</span></header>
        <div class="seg sm home-filter" role="group" aria-label="Signale filtern">${[['all', 'Alle'], ...Object.entries(TYPES).map(([k, t]) => [k, t.label])].map(([k, l]) => `<button data-hfilter="${k}" class="${st.filter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div id="home-signals">${signalsHTML()}</div>
      </section>
      <aside class="home-side">
        <section><header><h2>Beste Flips jetzt</h2><a class="link" href="#bazaar/flips">Alle Flips</a></header><div id="home-flips">${flipsHTML()}</div></section>
        <section><header><h2>Marktlage</h2><a class="link" href="#markt">Markt-Analyse</a></header><div id="home-market">${marketHTML()}</div></section>
      </aside>
    </div>
    <h2 class="sec">Bereiche</h2>
    <div class="home-areas">
      ${areaCard('bazaar', 'Bazaar Flipper', 'Flips finden und rechnen: Buy-Order kaufen, Sell-Offer verkaufen, Craft-Flips und NPC-Flips, live alle 20 Sekunden.', BAZAAR_MENU, BAZAAR_TABS)}
      ${areaCard('markt', 'Markt-Analyse', 'Jedes Item verstehen: Preise aller Items, Preisindex, Wirkung von Updates und Mayors, Kosten und Risiko.', MARKT_MENU, MARKT_TABS)}
    </div>
    <p class="fine">Inoffizielles Fan-Projekt, nicht mit Hypixel oder Mojang verbunden. Deine Eingaben bleiben in deinem Browser. Prices provided by SkyCofl.</p>
  </div>`;
}
function areaCard(id, title, desc, menu, tabs){
  const label = x => (tabs.find(t => t.id === x) || {}).label || x;
  return `<section class="home-area"><a class="home-area-h" href="#${id}" data-nav="${id}"><h3>${title}</h3><p>${desc}</p></a>
    <div class="home-area-links">${menu.map(g => `<div><p class="side-h">${g.label}</p>${g.items.map(x => `<a href="#${id}/${x}" data-nav="${id}/${x}">${label(x)}</a>`).join('')}</div>`).join('')}</div></section>`;
}
function lead(){
  const b = bestNow(), d = M() ? M().data() : {}, md = d.md;
  let s = leadSentence(b);
  if (md){ const c = E.change(md.index.spi, 7); if (c != null) s += ` Der Markt ist in 7 Tagen ${Math.abs(c) < .005 ? 'gleich geblieben' : (c > 0 ? 'um ' + P(c, false) + ' gestiegen' : 'um ' + P(-c, false) + ' gefallen')}.`; }
  return s;
}
function kpis(){
  const d = M() ? M().data() : {}, md = d.md, now = Date.now(), b = bestNow();
  const nFlips = S.rows.length ? filteredFlips(true).length + filteredCrafts(true).length : null;
  const ev = E.sbUpcoming(now, 6).filter(x => x.key !== 'mayor')[0];
  const box = (href, k, v, s) => `<a class="mk-now" href="${href}"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></a>`;
  return `<div class="mk-nowrow home-kpi">
    ${box('#bazaar/overview', 'Passende Flips', nFlips == null ? '…' : NF0.format(nFlips), b && !b.none ? `bester ${words(b.pph)} pro Stunde` : `Strategie ${esc((PRESETS[S.set.preset] || {}).label || 'eigene')}`)}
    ${box('#markt', 'Preisindex 7 Tage', md ? PC(E.change(md.index.spi, 7)) : '…', md ? `30 Tage ${P(E.change(md.index.spi, 30))}` : '')}
    ${box('#markt/mayors', 'Mayor', d.mayor ? esc(d.mayor.name) : '…', d.mayorEnd ? 'Wechsel ' + until(d.mayorEnd - now) : '')}
    ${box('#markt/calendar', ev && ev.running ? 'Läuft gerade' : 'Nächstes Event', ev ? esc(ev.name) : '…', ev ? (ev.running ? 'endet ' + until(ev.end - now) : until(ev.start - now)) : '')}
  </div>
  <p class="hint home-src">Bazaar live, Stand ${S.lastUpdated ? new Date(S.lastUpdated).toLocaleTimeString('de-AT') : '–'}. ${d.px ? `Auction House vor ${ago(now - d.px.lastUpdated)}.` : ''} ${md ? `Tagesdaten vom ${new Date(md.days.to).toLocaleDateString('de-AT')}.` : ''}</p>`;
}
function signalsHTML(){
  const d = M() ? M().data() : {};
  if (!S.rows.length && !d.md && !d.px) return '<p class="loading">Daten werden geladen …</p>';
  const all = signals(), list = all.filter(x => st.filter === 'all' || x.type === st.filter).slice(0, 14);
  const counts = {}; for (const x of all) counts[x.type] = (counts[x.type] || 0) + 1;
  if (!list.length) return `<p class="note">${st.filter === 'all' ? 'Gerade gibt es keine auffälligen Signale. Das ist ein ruhiger Markt.' : 'Gerade keine Signale dieser Art.'} ${TYPES[st.filter] ? esc(TYPES[st.filter].desc) : ''}</p>`;
  return `<ul class="home-list">${list.map(x => `<li>
      <div class="home-li-main">${itemCell(x.id, name(x.id), `<span class="home-tag t-${x.type}">${TYPES[x.type].label}</span> ${x.title}`)}<p class="home-li-text">${x.text}</p></div>
      <div class="home-li-act"><a class="btn ghost sm" href="#markt/item/${encodeURIComponent(x.id)}">Analyse</a>${x.bz && S.byId[x.id] ? `<button class="btn ghost sm" data-open="${esc(x.id)}">Flip</button>` : ''}</div>
    </li>`).join('')}</ul>
    <p class="hint">${Object.entries(TYPES).map(([k, t]) => `${t.label}: ${NF0.format(counts[k] || 0)}`).join(', ')}. ${st.filter !== 'all' && TYPES[st.filter] ? esc(TYPES[st.filter].desc) : 'Sortiert nach Stärke des Signals. Signale zeigen Auffälliges, keine Garantie für Gewinn.'}</p>`;
}
function flipsHTML(){
  if (!S.rows.length) return '<p class="loading">Bazaar wird geladen …</p>';
  const f = filteredFlips(true).map(r => ({k: 'flip', id: r.id, name: r.name, pph: r.pph, sub: `${price(r.buyAt)} kaufen, ${price(r.sellAt)} verkaufen`}));
  const c = filteredCrafts(true).map(r => ({k: 'craft', ri: r.ri, id: r.id, name: (r.cnt > 1 ? r.cnt + '× ' : '') + r.name, pph: r.pph, sub: 'Craft-Flip: ' + r.ingredients}));
  const list = f.concat(c).sort((a, b) => b.pph - a.pph).slice(0, 6);
  if (!list.length) return `<p class="note">Gerade passt kein Flip zur Strategie ${esc((PRESETS[S.set.preset] || {}).label || 'eigene')}. <a class="link" href="#bazaar/settings">Strategie ändern</a></p>`;
  return `<ul class="rank">${list.map(x => `<li ${x.k === 'flip' ? `data-open="${esc(x.id)}"` : `data-craft="${x.ri}"`}>${itemCell(x.id, x.name, esc(x.sub))}<span class="v">${fmt(x.pph)}<small>pro Stunde</small></span></li>`).join('')}</ul>
    <p class="hint">Strategie ${esc((PRESETS[S.set.preset] || {}).label || 'eigene')}, Budget ${words(S.set.budget)} Coins.</p>`;
}
function marketHTML(){
  const d = M() ? M().data() : {}, md = d.md;
  if (!md) return `<p class="loading">${d.mdErr ? 'Tagesdaten gerade nicht erreichbar.' : 'Marktdaten werden geladen …'}</p>`;
  const rows = Object.keys(md.index.sec).map(k => ({k, c: E.change(md.index.sec[k], 7)})).filter(r => r.c != null).sort((a, b) => b.c - a.c);
  const show = rows.length > 6 ? [...rows.slice(0, 3), ...rows.slice(-3)] : rows;
  return `<table class="mk-mini home-cat"><tbody>${show.map(r => `<tr data-hcat="${r.k}"><td class="l">${esc(M().secLabel(r.k))}</td><td>${PC(r.c)}</td></tr>`).join('')}</tbody></table>
    <p class="hint">Preisindex je Kategorie, Veränderung in 7 Tagen. Die stärksten und schwächsten Kategorien.</p>`;
}
function mount(){
  if (!M()) return;
  M().ensure().then(() => { st.loaded = true; update(); });
}
function update(){
  if (S.tool) return;
  const set = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };
  set('#home-lead', lead()); set('#home-kpis', kpis()); set('#home-signals', signalsHTML()); set('#home-flips', flipsHTML()); set('#home-market', marketHTML());
}
document.addEventListener('click', e => {
  if (S.tool) return;
  const el = e.target.closest('[data-hfilter],[data-hcat]'); if (!el) return;
  if (el.dataset.hfilter){ st.filter = el.dataset.hfilter; document.querySelectorAll('[data-hfilter]').forEach(b => b.classList.toggle('on', b === el)); set(); }
  else if (el.dataset.hcat && M()){ M().openCategory(el.dataset.hcat); }
  function set(){ const s = $('#home-signals'); if (s) s.innerHTML = signalsHTML(); }
});

window.Start = {render, mount, update, _signals: signals};
if (!S.tool && document.readyState !== 'loading') renderMain(true);
})();
