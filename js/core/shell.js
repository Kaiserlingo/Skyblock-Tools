'use strict';
// Rahmen: Kopfzeile, Seitenmenü, Routing (#bereich/seite), Teilen-Link, Seiten neu zeichnen.
/* =========================================================
   Rahmen: Kopfzeile, Status, Routing
   ========================================================= */
const $ = s => document.querySelector(s);
function banner(html){
  S.banner = html;
  const b = $('#banner'); if (b){ b.innerHTML = html; b.style.display = html ? 'block' : 'none'; }
}
/* Einstellungen per Link teilen: #bazaar/overview~<kodierte Werte> */
const SHARE_KEYS = ['budget','share','tax','minCycle','preset','minVolH','minTurnH','minBalance','minPct','maxPct','maxDev','maxSpreadRatio','minOkShare','minProfit','hideRisky','craftBuy','craftSell','craftMinPct','craftMinProfit'];
function shareLink(){
  const o = {}; for (const k of SHARE_KEYS) o[k] = S.set[k];
  const code = btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return location.origin + location.pathname + '#bazaar/overview~' + code;
}
function takeSharedSettings(){
  const i = location.hash.indexOf('~'); if (i < 0) return false;
  const code = location.hash.slice(i + 1);
  history.replaceState(null, '', location.hash.slice(0, i));
  try{
    const o = JSON.parse(decodeURIComponent(escape(atob(code.replace(/-/g, '+').replace(/_/g, '/')))));
    for (const k of SHARE_KEYS) if (k in o && typeof o[k] === typeof DEFAULTS[k]) S.set[k] = o[k];
    save('settings', S.set);
    setTimeout(() => toast('<b>Einstellungen übernommen</b><br>Du siehst jetzt dieselben Filter, dasselbe Budget und dieselbe Steuer wie die Person, die den Link geteilt hat.'), 300);
    return true;
  }catch(e){ return false; }
}
function route(){
  if (takeSharedSettings() && S.rows.length) ingest(false);
  const [tool, tab, ...rest] = location.hash.replace('#', '').split('/');
  const prevTab = S.tab;
  if (S.tool && TOOL[S.tool] && TOOL[S.tool].leave) TOOL[S.tool].leave();
  if (TOOL[tool]){
    S.tool = tool;
    if (tab === 'item' && rest.length){ S.tab = 'item'; S.itemId = decodeURIComponent(rest.join('/')); }
    else S.tab = TOOL[tool].tabs.some(t => t.id === tab) ? tab : TOOL[tool].defaultTab;
  } else { S.tool = null; }
  if (S.tab !== 'item'){ if (S.achart){ S.achart.destroy(); S.achart = null; } }
  else if (prevTab !== 'item') S.returnTo = prevTab;
  S.search = '';
  closeDrawer(); closeDetail();
  renderTop(); renderMain(true); window.scrollTo({top:0});
}
function nav(hash){ if (location.hash === '#' + hash) route(); else location.hash = hash; }

function statusEl(){ return `<span class="status" id="status"><i class="dot" id="dot"></i><span id="statusTxt">Lädt…</span></span>`; }
// Logo: eine Goldmünze aus Pixeln (eigene Zeichnung)
const LOGO = `<svg viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><path fill="#5c3c00" d="M3 0h6v1h2v2h1v6h-1v2H9v1H3v-1H1V9H0V3h1V1h2z"/><path fill="#ffaa00" d="M3 1h6v1h1v1h1v6h-1v1H9v1H3v-1H2V9H1V3h1V2h1z"/><path fill="#ffd866" d="M3 2h4v1H4v1H3v3H2V3h1z"/><path fill="#b07400" d="M5 3h2v1h1v4H7v1H5V8H4V4h1z"/><path fill="#ffcf40" d="M5 4h2v4H5z"/></svg>`;
function renderTop(){
  const t = S.tool && TOOL[S.tool];
  $('#top').innerHTML = `<div class="bar">
      <a class="wordmark" href="#" data-nav="">${LOGO}<span>SkyBlock <span class="wm-b">Tools</span></span></a>
      <nav class="mainnav" aria-label="Bereiche">
        <a href="#" data-nav="" class="${!t ? 'on' : ''}">Start</a>
        ${TOOLS.map(x => `<a href="#${x.id}" data-nav="${x.id}" class="${t && t.id === x.id ? 'on' : ''}">${x.title}</a>`).join('')}
      </nav>
      <div class="spacer"></div>
      ${statusEl()}
      <button class="btn ghost themebtn" data-act="theme">${themeBtnInner()}</button>
    </div>`;
  document.body.classList.toggle('in-area', !!t);
  document.body.dataset.area = t ? t.id : 'home';
  renderTabs(); tick();
}
// Seitenmenü des aktiven Bereichs (Gruppen, Zähler, beim Flipper Pausieren/Aktualisieren)
function renderTabs(){
  const el = $('#side'); if (!el) return;
  const t = S.tool && TOOL[S.tool];
  if (!t){ el.innerHTML = ''; return; }
  const counts = S.tool !== 'bazaar' ? {} : S.rows.length ? {flips: filteredFlips(true).length, crafts: filteredCrafts(true).length, npc: S.rows.filter(r => r.npc > 0 && r.npcOrder > 0 && liquid(r)).length, watch: S.watch.length} : {watch: S.watch.length};
  const label = id => (t.tabs.find(x => x.id === id) || {}).label || id;
  const cur = S.tab !== 'item' ? S.tab : t.id === 'markt' ? 'items' : (t.tabs.some(x => x.id === S.returnTo) ? S.returnTo : t.defaultTab);
  el.innerHTML = `<p class="side-title">${t.title}</p>
    ${t.menu.map(g => `<div class="side-group"><p class="side-h">${g.label}</p>
      ${g.items.map(id => `<a href="#${t.id}/${id}" data-tab="${id}" class="${cur === id ? 'on' : ''}">${label(id)}${counts[id] ? `<span class="n">${NF0.format(counts[id])}</span>` : ''}</a>`).join('')}</div>`).join('')}
    ${t.id === 'bazaar' ? `<div class="side-actions"><button class="btn ghost sm" id="pauseBtn">${S.paused ? 'Fortsetzen' : 'Pausieren'}</button><button class="btn sm" id="refreshBtn">Aktualisieren</button></div>` : ''}`;
}
function tick(){
  const dot = $('#dot'), st = $('#statusTxt');
  if (!dot) return;
  let txt, state = S.state;
  if (S.state === 'err') txt = 'Hypixel antwortet nicht';
  else if (!S.lastUpdated) txt = 'Lädt…';
  else if (S.paused){ txt = 'Pausiert'; state = 'pause'; }
  else txt = 'Datenstand ' + new Date(S.lastUpdated).toLocaleTimeString('de-AT') + ' (vor ' + ago(Date.now() - S.lastUpdated) + ')';
  dot.className = 'dot ' + state;
  st.textContent = txt;
}

/* Hauptbereich neu zeichnen – ohne Fokusverlust im Suchfeld */
function renderMain(force){
  const a = document.activeElement;
  if (!force && a && a.closest && a.closest('#view') && a.matches('input:not(#search), select')) return;
  // Analyse-Seite nur aktualisieren, nicht neu aufbauen (Chart und Zeichnungen bleiben)
  const tl = S.tool && TOOL[S.tool];
  if (tl && tl.render){
    if (!force && tl.update){ tl.update(); return; }
    document.title = tl.pageTitle(S.tab) + ' – SkyBlock Tools';
    $('#view').innerHTML = tl.render(S.tab);
    renderTabs(); if (tl.mount) tl.mount(S.tab);
    return;
  }
  if (!force && S.tool && S.tab === 'item' && S.achart && S.byId[S.itemId]){ updateAnalysis(); renderTabs(); return; }
  const wasSearch = a && a.id === 'search', pos = wasSearch ? a.selectionStart : 0;
  let html;
  if (!S.tool){
    if (window.Start){ if (!force && Start.update){ Start.update(); return; } document.title = 'SkyBlock Tools'; $('#view').innerHTML = Start.render(); renderTabs(); Start.mount(); return; }
    html = pageHub(); document.title = 'SkyBlock Tools';
  }
  else {
    const t = TOOL[S.tool], tab = t.tabs.find(x => x.id === S.tab);
    document.title = (S.tab === 'item' ? (S.byId[S.itemId] ? S.byId[S.itemId].name : pretty(S.itemId)) + ' – Analyse' : tab.label) + ' – ' + t.title;
    const needsData = !['settings', 'overview', 'watch'].includes(S.tab);
    html = `<div class="banner" id="banner" style="display:${S.banner ? 'block' : 'none'}">${S.banner}</div>` +
      (needsData && !S.rows.length ? '<p class="loading">Die Bazaar-Preise werden geladen …</p>' : PAGES[S.tab]());
  }
  if (S.achart && S.tab === 'item'){ S.achart.destroy(); S.achart = null; }
  $('#view').innerHTML = html;
  if (S.tab === 'item' && S.tool) initAnalysis();
  renderTabs();
  if (wasSearch){ const el = $('#search'); if (el){ el.focus(); el.setSelectionRange(pos, pos); } }
}

/* =========================================================
   Startbildschirm
   ========================================================= */
function bestNow(){
  if (!S.rows.length) return null;
  const f = filteredFlips(true).sort((a,b) => b.pphTyp - a.pphTyp)[0];
  const c = filteredCrafts(true).sort((a,b) => b.pph - a.pph)[0];
  if (!f && !c) return {none: true};
  return (!c || (f && f.pphTyp >= c.pph)) ? {name: f.name, pph: f.pphTyp, id: f.id, kind: 'flip'} : {name: c.name, pph: c.pph, ri: c.ri, kind: 'craft'};
}
function leadSentence(b){
  if (S.state === 'err' && !S.rows.length) return 'Hypixel antwortet gerade nicht. Die Seite versucht es automatisch weiter.';
  if (!b) return 'Die Bazaar-Preise werden geladen …';
  if (b.none) return 'Gerade passt kein Flip zu deinen Filtern. Probier eine lockerere Strategie.';
  return `Gerade bringt ${esc(b.name)} am meisten: rund ${words(b.pph)} Coins pro Stunde${b.kind === 'craft' ? ' als Craft-Flip' : ''}.`;
}
function pageHub(){
  const b = bestNow();
  const n = S.rows.length ? filteredFlips(true).length + filteredCrafts(true).length : null;
  return `<section class="hub">
    <p class="intro">Werkzeuge für Hypixel SkyBlock. Die Preise kommen live aus dem Bazaar und werden alle ${S.set.interval} Sekunden neu geladen.</p>
    <h1 class="lead">${leadSentence(b)}</h1>
    <h2 class="hub-h">Werkzeuge</h2>
    <ul class="toollist">${TOOLS.map(t => `
      <li><a href="#${t.id}" data-nav="${t.id}">
        <span class="t">${t.title}</span>
        <span class="d">${t.desc}</span>
        <span class="m">${t.id === 'bazaar' && n != null ? `${NF0.format(n)} passende Flips` : t.meta ? t.meta() : ''}</span>
      </a></li>`).join('')}
    </ul>
    <p class="fine">Inoffizielles Fan-Projekt, nicht mit Hypixel oder Mojang verbunden. Deine Eingaben bleiben in deinem Browser.</p>
  </section>`;
}
