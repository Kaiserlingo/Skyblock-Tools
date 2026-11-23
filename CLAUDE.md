# Arbeitsanleitung für dieses Projekt

Hypixel-SkyBlock-Website „SkyBlock Tools“ (statisch, GitHub Pages, ohne Build). Nutzer schreibt Deutsch;
Oberfläche Deutsch, SkyBlock-Begriffe Englisch (Bazaar, Instabuy, Lowest BIN, Mining …).

**Zuerst lesen:** `docs/ARCHITEKTUR.md` (Ordner, Regeln, Rezepte für typische Änderungen).

## Schnell arbeiten
- Wo etwas liegt: Bereich → Ordner (`js/bazaar/`, `js/markt/`, `js/home/`), Rahmen → `js/core/`, Rechnung → `js/lib/`,
  Aussehen → `css/theme.css`, Daten für alle → `tools/build_market.mjs` / `tools/build_prices.mjs`.
- Jede JS-Datei beginnt mit einer Zeile, was sie enthält.
- Nach Änderungen: `tools/check.sh --fast` (Sekunden), vor dem Veröffentlichen `tools/check.sh`.
- Veröffentlichen: `tools/publish.sh "Nachricht"` (stempelt, prüft, committet, pusht). Commit-Nachrichten mit den Attributionszeilen aus der Sitzung.
- Live prüfen: https://kaiserlingo.github.io/Skyblock-Tools/ (etwa 1 min nach dem Push).

## Nicht vergessen
- Alle Skripte teilen einen globalen Namensraum: keine doppelten Namen (`tools/check_code.mjs` prüft das).
- Neue Datei → in `index.html` eintragen und `python3 tools/stamp_assets.py`.
- Zahlen müssen exakt stimmen: Flipper-Rechnung hat eine unabhängige Nachrechnung (`tests/oracle.py`, `tests/test_numbers.py`).
- Nie seitlich scrollen (Rauchtest mit `AUDIT=1` prüft 7 Breiten).
- Daten-Branch `data` nur über `tools/data_branch.sh` beschreiben.
