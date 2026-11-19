# SkyBlock Hub

Persönliche Tool-Sammlung für **Hypixel SkyBlock**

**Live:** https://kaiserlingo.github.io/Skyblock-Tools/

## Dateien

```
index.html                 Seitengerüst
css/style.css              Design
js/chart.js                Chart mit Zoom, Indikatoren und Zeichenwerkzeugen
js/app.js                  Startbildschirm, Bazaar Flipper (pausiert), gemeinsame Helfer
js/econ.js                 Rechenfunktionen der Markt-Analyse (Index, Renditen, Risiko, Elastizität …)
js/markt.js                Markt-Analyse: Übersicht, Alle Items, Updates & Mayors, Item-Analyse
data/recipes.json          Crafting-Rezepte (automatisch aktualisiert)
tools/update_recipes.py    erzeugt recipes.json aus dem NotEnoughUpdates-REPO
tools/build_market.mjs     baut täglich market.json (Tagesdaten aller Bazaar-Items, Indizes, Update-/Mayor-Wirkung)
tools/stamp_assets.py      hängt Versions-Hashes an CSS/JS (vor jedem Commit ausführen)
tests/                     Prüfungen aller Zahlen (Python + Playwright, numpy)
.github/workflows/         wöchentliches Rezept-Update, tägliche Marktdaten (Branch data)
```


## Datenquellen

- Bazaar: `https://api.hypixel.net/v2/skyblock/bazaar` (öffentlich, kein API-Key nötig), wird direkt im Browser abgefragt
- Item-Namen & NPC-Preise: `https://api.hypixel.net/v2/resources/skyblock/items`
- Rezepte: [NotEnoughUpdates-REPO](https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO)
- Mayor, Wahl, Patchnotes, Firesales: Hypixel `/v2/resources/skyblock/election`, `/v2/skyblock/news`, `/v2/skyblock/firesales`
- Tagesdaten aller Bazaar-Items: `market.json` auf dem Branch `data`, täglich per GitHub Action
- Preisverlauf: [SkyCofl](https://sky.coflnet.com/data) (`/api/bazaar/{item}/history/…`), Prices provided by SkyCofl

Der Preisverlauf wird lokal im Browser (IndexedDB) gespeichert. Es gibt keinen Server und keine Konten: Jede Person, die die Seite öffnet, hat ihre eigenen Eingaben – sie bleiben nur in ihrem eigenen Browser.

---

Inoffizielles Fan-Projekt – nicht mit Hypixel oder Mojang verbunden.
