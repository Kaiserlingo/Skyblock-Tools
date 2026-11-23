# Architektur

SkyBlock Tools ist eine statische Website (GitHub Pages) ohne Build-Schritt und ohne Server.
Was im Browser nicht geht oder für alle gleich sein soll, rechnet eine **Pipeline** in GitHub Actions
und legt das Ergebnis als JSON auf den Branch `data`.

```
 Hypixel API ─┐                                   ┌─> Branch data: market.json, prices.json, bazaar_stats.json
 SkyCofl API ─┼─> tools/ (GitHub Actions, Node) ──┘                │
              │                                                    v
              └────────────────────────────────> Browser: index.html + js/ + css/  (holt Live-Daten selbst)
```

## Ordner

```
index.html            Seitengerüst; lädt alle Skripte in fester Reihenfolge (siehe unten)
css/base.css          Grundgerüst: Layout, Abstände, Komponenten
css/theme.css         Aussehen: Farben (hell/dunkel), Schrift, Karten, Prognose-Ansicht – überschreibt base.css
js/core/              Rahmen, für alle Bereiche
  config.js             alle externen Adressen (CFG)
  tools.js              Bereiche und ihre Menüs (Bazaar Flipper, Markt-Analyse)
  format.js             Zahlen, Preise, Prozent, Item-Bild, Seltenheitsfarbe
  input.js              Coins-Eingaben lesen (10m, 2,5k)
  shell.js              Kopfzeile, Seitenmenü, Routing, Neu-Zeichnen
  fit-tables.js         Tabellen, die nicht passen, werden zu Karten
  boot.js               Start (als letztes geladen)
js/lib/               Rechenkerne ohne DOM – laufen im Browser UND in Node (Pipeline, Tests)
  econ.js               Markt-Kennzahlen: Tagesreihen, Index, Renditen, Risiko, Elastizität, Kalender
  forecast.js           Preisprognose: Modell, Simulation, Zielpreis, Rückwärtstest, Kalibrierung
  categories.js         Kategorien aller Items
js/ui/chart.js        Preis-Diagramm mit Zoom, Zeichenwerkzeugen und Prognose-Fächer (setForecast)
js/ui/chart-panel.js  ChartPanel: Diagramm + Zeitraum, Optionen, Zeichenleiste, Legende – für alle Verlaufsdiagramme
js/bazaar/            Bereich „Bazaar Flipper“
  state.js              Strategien, Einstellungen, gemeinsamer Zustand S
  compute.js            jede Bazaar-Zeile berechnen (Gewinn, Profit/h, Risiken, Spread-Verlauf)
  crafts.js, alerts.js, history.js, calculator.js, analysis.js, db.js, items.js
  ui.js                 Tabellen-Bausteine, Werkzeugleiste, Filter-Panel
  pages.js              Unterseiten (PAGES) und Detailfenster
  settings.js, events.js
js/markt/             Bereich „Markt-Analyse“
  state.js              Zustand K, Laden der Daten (market.json, prices.json, SkyCofl, Hypixel)
  pages.js              Unterseiten (mkRender) und deren Inhalte
  item.js               Item-Seite: Laden, analyze(), Reiter (ITABS)
  cards.js              Karten der Item-Reiter
  forecast-view.js      Ansicht der Preisprognose
  events.js             Klicks/Eingaben, Schnittstelle window.Markt
js/home/start.js      Startseite (verbindet beide Bereiche)
data/recipes.json     Rezepte (wöchentlich aus NotEnoughUpdates)
tools/                Pipeline und Werkzeuge (Node / Python)
  build_market.mjs      market.json + bazaar_stats.json (alle 6 h), inkl. Prognose-Kalibrierung
  build_prices.mjs      prices.json: Lowest BIN aller AH-Items (etwa alle 5 min)
  lib/http.mjs          Abruf mit Wiederholung, begrenzt parallel
  lib/ah.mjs            Auktionsdaten lesen (NBT), Item-ID, Lowest BIN
  data_branch.sh        veröffentlicht Dateien auf dem Branch data
  check.sh              ALLE Prüfungen mit einem Befehl
  check_code.mjs        Syntax, doppelte globale Namen, CSS-Klammern
  stamp_assets.py       Versions-Hashes in index.html (gegen alte Dateien im Browser-Cache)
  publish.sh            stempeln → prüfen → committen → pushen
  update_recipes.py, research_dump.mjs
tests/                siehe tests/README.md
.github/workflows/    tests.yml (jeder Push), market-data.yml, prices.yml, verify-prices.yml, update-recipes.yml, research.yml
```

## Regeln, die man kennen muss

1. **Ein gemeinsamer Namensraum.** Alle Skripte sind klassische `<script defer>`; was eine Datei auf
   oberster Ebene deklariert, sehen alle anderen. Darum:
   - Namen der Markt-Analyse, die mit dem Rest kollidieren könnten, beginnen mit `mk` (`mkRender`, `mkFacts`, `MK_PRESETS`).
   - `node tools/check_code.mjs` meldet doppelte Namen sofort (läuft in `tools/check.sh`).
   - Neue Datei: in `index.html` eintragen (Reihenfolge beachten), dann `python3 tools/stamp_assets.py`.
2. **Reihenfolge in index.html:** config → lib → ui → core → bazaar → markt → home → `core/boot.js` (zuletzt).
   Code auf oberster Ebene darf nur auf Dinge aus *früher* geladenen Dateien zugreifen;
   in Funktionen ist alles erreichbar.
3. **Rechenkerne bleiben rein** (`js/lib/`): kein DOM, kein `S`/`K`. So nutzen Website, Pipeline und Tests dieselbe Rechnung.
4. **Zahlen, die für alle gleich sein müssen**, kommen aus der Pipeline (Branch `data`), nicht aus dem Browser.
5. **Nie seitlich scrollen:** Tabellen werden automatisch zu Karten (`core/fit-tables.js`). `AUDIT=1` im Rauchtest prüft 7 Breiten.

## Rezepte

**Neue Unterseite in der Markt-Analyse**
1. `js/core/tools.js`: Eintrag in `MARKT_TABS` und in eine Gruppe von `MARKT_MENU`.
2. `js/markt/pages.js`: in `mkRender` eine Zeile `if (tab === 'neu') return pageShell('Titel', 'Einleitung', neuBody);`
   und die Funktion `neuBody()` (gibt HTML zurück).

**Neue Karte in der Item-Analyse**
1. `js/markt/cards.js`: `function neuHTML(I){ return card('Titel', 'Erklärung „In SkyBlock“', mkFacts([...])); }`
   (Kennzahlen stehen in `I.A`, berechnet in `analyze()` in `js/markt/item.js`).
2. `js/markt/item.js`: in `ITABS` beim passenden Reiter `neuHTML(I)` ergänzen.

**Neue Unterseite im Bazaar Flipper**
1. `js/core/tools.js`: `BAZAAR_TABS` und `BAZAAR_MENU`.
2. `js/bazaar/pages.js`: Funktion in `PAGES` (`neu: () => '…HTML…'`).

**Neue Kennzahl je Bazaar-Zeile** (Flipper): in `js/bazaar/compute.js` (`compute`/`assess`), Anzeige in `js/bazaar/pages.js`.
Für die Nachrechnung in `tests/oracle.py` ergänzen, sonst meldet `tests/test_numbers.py` nichts dazu.

**Neue Daten aus der Pipeline**
1. `tools/build_market.mjs`: berechnen und ins Objekt `out` schreiben (Rechnung möglichst in `js/lib/`).
2. Im Browser über `K.md` (Markt-Analyse) lesen.
3. `tests/test_pipeline.mjs`: eine Prüfung ergänzen; Testantworten in `tests/pipeline/mockfetch.mjs`.

**Farben/Aussehen:** nur `css/theme.css` (Variablen oben: `--paper`, `--surface`, `--emerald` …).
Layout/Abstände: `css/base.css`.

**Neue externe Adresse:** `js/core/config.js` (Browser) bzw. `tools/lib/http.mjs` (Pipeline).

## Prüfen und veröffentlichen

```
tools/check.sh --fast     ~20 s   Code, Stempel, Rechenkerne, Pipeline-Trockenlauf
tools/check.sh            ~3 min  dazu Rauchtest aller Seiten und Bedienung (Playwright)
tools/check.sh --full     ~25 min dazu alle Zahlen gegen die Nachrechnung, dunkles Design, Überstand
tools/publish.sh "Text"   stempeln, prüfen, committen, pushen
```
Nach jedem Push läuft `tests.yml` auf GitHub dieselben Prüfungen.
Die Pipeline-Workflows lassen sich unter „Actions“ von Hand starten (`market-data.yml` dauert ~10 min).


## Rezept: neues Verlaufsdiagramm
`const p = new ChartPanel('xy', {ranges, range, onRange, checks, onCheck, drawKey})`, `p.html()` in die Seite, danach `p.mount()` → PriceChart. Zeiträume aus `RANGES` (js/bazaar/history.js), damit überall dieselben Stufen (24 h … Alles) stehen. Beispiele: `miPanel` (js/markt/item.js), `pgPanel` (js/markt/forecast-view.js).
