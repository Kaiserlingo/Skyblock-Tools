# SkyBlock Hub

Persönliche Tool-Sammlung für **Hypixel SkyBlock**, als statische Website über GitHub Pages.

**Live:** https://kaiserlingo.github.io/Skyblock-Tools/

## Module

| Modul | Status |
|---|---|
| 💰 Bazaar-Flips | live |
| 🔨 Craft-Flips (nur Bazaar) | live |
| 🏪 NPC-Flips | live |
| 📊 Marktübersicht | live |
| ⭐ Watchlist & Preis-Alarme | live |
| 🏛 Auktionshaus, 🔥 Forge-Flips, ⛏ Minion-Rechner, 🗳 Mayor & Events, 👤 Spieler-Profil | geplant |

## Aufbau

```
index.html                 Seitengerüst
css/style.css              Design
js/app.js                  Logik: Datenabruf, Auswertung, alle Module
data/recipes.json          Crafting-Rezepte (automatisch aktualisiert)
tools/update_recipes.py    erzeugt recipes.json aus dem NotEnoughUpdates-REPO
.github/workflows/         wöchentliches Rezept-Update
```

**Neues Modul hinzufügen:** in `js/app.js` einen Eintrag in der `MODULES`-Liste ergänzen
(`id`, `group`, `icon`, `title`, `desc`, `render`) und die zugehörige `render…()`-Funktion schreiben.
Navigation und Startseite übernehmen das Modul automatisch.

## Datenquellen

- Bazaar: `https://api.hypixel.net/v2/skyblock/bazaar` (öffentlich, kein API-Key nötig), wird direkt im Browser abgefragt
- Item-Namen & NPC-Preise: `https://api.hypixel.net/v2/resources/skyblock/items`
- Rezepte: [NotEnoughUpdates-REPO](https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO)

Der Preisverlauf wird lokal im Browser (IndexedDB) gespeichert. Es gibt keinen Server und es werden keine Nutzerdaten gesammelt.

---

Inoffizielles Fan-Projekt – nicht mit Hypixel oder Mojang verbunden.
