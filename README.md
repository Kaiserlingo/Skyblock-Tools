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

## Konten (Firebase)

Ohne Anmeldung läuft alles im **Gastmodus** – gespeichert wird nur im Browser.
Mit Konto werden **Einstellungen, Watchlist, Alarme und Sortierung** pro Person in Cloud Firestore
gespeichert (`users/{uid}`) und live zwischen Geräten synchronisiert. Beim ersten Anmelden werden die
bisherigen Gast-Daten übernommen. Der Preisverlauf bleibt pro Gerät im Browser.

**Einrichtung (einmalig):**
1. [console.firebase.google.com](https://console.firebase.google.com) → Projekt erstellen (Google Analytics nicht nötig)
2. *Authentication* → Jetzt starten → Anbieter **E-Mail/Passwort** und **Google** aktivieren
3. *Authentication → Einstellungen → Autorisierte Domains* → `kaiserlingo.github.io` hinzufügen
4. *Firestore Database* → Datenbank erstellen → Standort `eur3` oder `europe-west3`, Produktionsmodus →
   Tab *Regeln*: Inhalt von [`firestore.rules`](firestore.rules) einfügen → Veröffentlichen
5. *Projekteinstellungen → Allgemein → Meine Apps* → Web-App `</>` hinzufügen → die angezeigte
   `firebaseConfig` in [`js/firebase-config.js`](js/firebase-config.js) eintragen

Die Werte in `firebase-config.js` sind öffentlich; geschützt werden die Daten durch die Security Rules
(jede Person kann nur ihr eigenes Dokument lesen und schreiben).

## Dateien

```
index.html                 Seitengerüst
css/style.css              Design
js/app.js                  Logik: Datenabruf, Auswertung, Oberfläche, Konto-Sync
js/cloud.js                Firebase-Anbindung (Login + Firestore), stellt window.Cloud bereit
js/firebase-config.js      Firebase-Konfiguration (leer = Gastmodus)
firestore.rules            Security Rules für Firestore
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

Der Preisverlauf wird lokal im Browser (IndexedDB) gespeichert. Persönliche Daten werden nur gespeichert, wenn sich jemand anmeldet – und dann nur Einstellungen, Watchlist, Alarme und Sortierung.

---

Inoffizielles Fan-Projekt – nicht mit Hypixel oder Mojang verbunden.
