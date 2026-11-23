# SkyBlock Tools

Persönliche Tool-Sammlung für **Hypixel SkyBlock**

**Live:** https://kaiserlingo.github.io/Skyblock-Tools/

## Für Änderungen

- **Aufbau und Anleitungen:** [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md) – welche Datei was macht und Schritt-für-Schritt-Rezepte
  (neue Seite, neue Kennzahl, neue Daten aus der Pipeline, Farben).
- **Prüfen:** `tools/check.sh --fast` (Sekunden) oder `tools/check.sh` (alles inkl. Browser-Tests, ~3 min).
- **Veröffentlichen:** `tools/publish.sh "Was sich geändert hat"`.

```
index.html      Seitengerüst          css/       base.css (Layout), theme.css (Aussehen)
js/core/        Rahmen, Routing       js/lib/    Rechenkerne (Browser + Node)
js/bazaar/      Bazaar Flipper        js/markt/  Markt-Analyse + Preisprognose
js/home/        Startseite            tools/     Pipeline (GitHub Actions) und Werkzeuge
tests/          Prüfungen             docs/      Dokumentation
```

## Datenquellen

- Bazaar: `https://api.hypixel.net/v2/skyblock/bazaar` (öffentlich, kein API-Key nötig), wird direkt im Browser abgefragt
- Item-Namen & NPC-Preise: `https://api.hypixel.net/v2/resources/skyblock/items`
- Rezepte: [NotEnoughUpdates-REPO](https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO)
- Mayor, Wahl, Patchnotes, Firesales: Hypixel `/v2/resources/skyblock/election`, `/v2/skyblock/news`, `/v2/skyblock/firesales`
- Tagesdaten aller Bazaar-Items, Prognose-Kalibrierung: `market.json` auf dem Branch `data`, alle 6 Stunden per GitHub Action
- Lowest BIN aller Auction-House-Items: `prices.json` auf dem Branch `data`, etwa alle 5 Minuten
- Preisverlauf: [SkyCofl](https://sky.coflnet.com/data) (`/api/bazaar/{item}/history/…`), Prices provided by SkyCofl

Der Preisverlauf wird lokal im Browser (IndexedDB) gespeichert. Es gibt keinen Server und keine Konten: Jede Person, die die Seite öffnet, hat ihre eigenen Eingaben – sie bleiben nur in ihrem eigenen Browser.

---

Inoffizielles Fan-Projekt – nicht mit Hypixel oder Mojang verbunden.
