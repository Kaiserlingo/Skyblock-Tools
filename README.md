# SkyBlock Hub

Persönliche Tool-Sammlung für **Hypixel SkyBlock**, als statische Website über GitHub Pages.

**Live:** https://kaiserlingo.github.io/Skyblock-Tools/

## Aufbau der Seite

- **Startbildschirm** – Auswahl der Tools (aktuell: Bazaar Flipper)
- **Bazaar Flipper** – Übersicht, Flips, Craft-Flips (nur Bazaar), NPC-Flips, Markt, Watchlist & Alarme, Einstellungen

## Strategien

| | 🛡 Sicher | ⚖ Ausgewogen | 🔥 Riskant |
|---|---|---|---|
| Min. Stück/h (beide Seiten) | 500 | 100 | 10 |
| Min. Umsatz/h | 10 M | 2 M | 250 k |
| Ausgeglichenheit Kauf/Verkauf | ≥ 50 % | ≥ 30 % | ≥ 10 % |
| Marge | 1–20 % | 2–50 % | 5–300 % |
| Min. Marge Craft-Flips | 2 % | 3 % | 5 % |
| Max. Preisbewegung (1 h) | ± 5 % | ± 10 % | egal |
| Items mit ⚠ Warnung | ausgeblendet | ausgeblendet | sichtbar |

## Dateien

```
index.html                 Seitengerüst
css/style.css              Design
js/app.js                  Logik: Datenabruf, Auswertung, Oberfläche
data/recipes.json          Crafting-Rezepte (automatisch aktualisiert)
tools/update_recipes.py    erzeugt recipes.json aus dem NotEnoughUpdates-REPO
.github/workflows/         wöchentliches Rezept-Update
```

**Neues Tool hinzufügen:** in `js/app.js` einen Eintrag in der `TOOLS`-Liste ergänzen
(`id`, `icon`, `title`, `desc`, `tabs`). Es erscheint dann automatisch als Karte auf dem Startbildschirm.

## Datenquellen

- Bazaar: `https://api.hypixel.net/v2/skyblock/bazaar` (öffentlich, kein API-Key nötig), wird direkt im Browser abgefragt
- Item-Namen & NPC-Preise: `https://api.hypixel.net/v2/resources/skyblock/items`
- Rezepte: [NotEnoughUpdates-REPO](https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO)

Der Preisverlauf wird lokal im Browser (IndexedDB) gespeichert. Es gibt keinen Server und keine Konten: Jede Person, die die Seite öffnet, hat ihre eigenen Eingaben – sie bleiben nur in ihrem eigenen Browser.

---

Inoffizielles Fan-Projekt – nicht mit Hypixel oder Mojang verbunden.
