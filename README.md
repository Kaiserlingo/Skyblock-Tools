# SkyBlock Hub

Persönliche Tool-Sammlung für **Hypixel SkyBlock**

**Live:** https://kaiserlingo.github.io/Skyblock-Tools/

## Dateien

```
index.html                 Seitengerüst
css/style.css              Design
js/app.js                  Logik: Datenabruf, Auswertung, Oberfläche
data/recipes.json          Crafting-Rezepte (automatisch aktualisiert)
tools/update_recipes.py    erzeugt recipes.json aus dem NotEnoughUpdates-REPO
tools/stamp_assets.py      hängt Versions-Hashes an CSS/JS (vor jedem Commit ausführen)
.github/workflows/         wöchentliches Rezept-Update
```


## Datenquellen

- Bazaar: `https://api.hypixel.net/v2/skyblock/bazaar` (öffentlich, kein API-Key nötig), wird direkt im Browser abgefragt
- Item-Namen & NPC-Preise: `https://api.hypixel.net/v2/resources/skyblock/items`
- Rezepte: [NotEnoughUpdates-REPO](https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO)

Der Preisverlauf wird lokal im Browser (IndexedDB) gespeichert. Es gibt keinen Server und keine Konten: Jede Person, die die Seite öffnet, hat ihre eigenen Eingaben – sie bleiben nur in ihrem eigenen Browser.

---

Inoffizielles Fan-Projekt – nicht mit Hypixel oder Mojang verbunden.
