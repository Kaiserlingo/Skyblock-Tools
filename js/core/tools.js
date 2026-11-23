'use strict';
// Rahmen: Liste der Bereiche (Bazaar Flipper, Markt-Analyse) mit Menüs. Neuer Bereich oder neue Unterseite: hier eintragen.
/* =========================================================
   TOOLS – der Startbildschirm listet jedes Tool auf.
   Neues Tool: Eintrag ergänzen (id, title, desc, tabs, defaultTab)
   und die Seiten als Funktionen schreiben, die HTML zurückgeben.
   ========================================================= */
const BAZAAR_TABS = [
  {id:'overview', label:'Übersicht'},
  {id:'flips',    label:'Bazaar-Flips'},
  {id:'crafts',   label:'Craft-Flips'},
  {id:'npc',      label:'NPC-Flips'},
  {id:'market',   label:'Alle Bazaar-Items'},
  {id:'watch',    label:'Watchlist'},
  {id:'settings', label:'Strategie & Filter'},
];
// Seitenmenü der Bereiche: Gruppen mit ihren Seiten
const BAZAAR_MENU = [
  {label:'Überblick', items:['overview']},
  {label:'Flips finden', items:['flips', 'crafts', 'npc']},
  {label:'Markt beobachten', items:['market', 'watch']},
  {label:'Einrichten', items:['settings']},
];
const MARKT_TABS = [
  {id:'start',    label:'Marktlage'},
  {id:'items',    label:'Alle Items'},
  {id:'rank',     label:'Ranglisten'},
  {id:'updates',  label:'Updates'},
  {id:'mayors',   label:'Mayors & Wahl'},
  {id:'calendar', label:'Kalender & Events'},
  {id:'method',   label:'So wird gerechnet'},
];
const MARKT_MENU = [
  {label:'Überblick', items:['start']},
  {label:'Items', items:['items', 'rank']},
  {label:'Was den Markt bewegt', items:['updates', 'mayors', 'calendar']},
  {label:'Hilfe', items:['method']},
];
// Werkzeuge mit eigener Oberfläche (render/mount/update/leave) liegen in eigenen Ordnern, z. B. js/markt/
const lazy = name => (fn, fallback) => (...a) => window[name] && window[name][fn] ? window[name][fn](...a) : fallback;
const M = lazy('Markt'), ST = lazy('Start');
const TOOLS = [
  {id:'bazaar', title:'Bazaar Flipper',
   desc:'Live-Flips mit Buy-Orders, Craft-Flips nur über den Bazaar, NPC-Flips, Marktübersicht und Preis-Alarme.',
   tabs: BAZAAR_TABS, menu: BAZAAR_MENU, defaultTab:'overview'},
  {id:'markt', title:'Markt-Analyse',
   desc:'Jedes SkyBlock-Item volks- und betriebswirtschaftlich durchleuchtet: Preis, Angebot und Nachfrage, Elastizität, Kosten, Risiko. Dazu, wie Updates und Mayors den Markt bewegen.',
   tabs: MARKT_TABS, menu: MARKT_MENU, defaultTab:'start',
   render: M('render', '<p class="loading">Wird geladen …</p>'), mount: M('mount'), update: M('update'), leave: M('leave'), pageTitle: M('pageTitle', 'Markt-Analyse'), meta: M('hubMeta', '')},
];
const TOOL = Object.fromEntries(TOOLS.map(t => [t.id, t]));
