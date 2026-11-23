# Tests

Alle Prüfungen mit einem Befehl: `tools/check.sh` (siehe dort für `--fast` und `--full`).
Browser-Tests starten ihren Webserver selbst (`tests/web.py`) und nutzen Chrome, falls installiert, sonst Playwrights Chromium.

| Datei | prüft | Dauer |
|---|---|---|
| `test_forecast.mjs` | Preisprognose: Schätzung, Simulation, Zielpreis, Kalibrierung (Node) | ~10 s |
| `test_econ.py` | Rechenfunktionen der Markt-Analyse gegen numpy | ~2 s |
| `test_categories.py` | Kategorien (Mining, Farming, Weapons …) | <1 s |
| `test_ah.py` | Auction House: Item-Daten lesen, Item-ID, Lowest BIN | <1 s |
| `test_pipeline.mjs` | Trockenlauf von `tools/build_market.mjs` mit Testantworten (`pipeline/mockfetch.mjs`) | <1 s |
| `smoke/smoke.py` | jede Seite mit Testdaten öffnen: Fehler, kaputte Zahlen; `AUDIT=1`: Überstand in 7 Breiten; `CS=dark` | ~80 s |
| `test_units.py` | Bedienung: Eingaben, Formatierung, Teilen-Link, API-Ausfälle, Sortierung, Charts | ~25 s |
| `test_numbers.py` | jede Zahl des Flippers gegen eine unabhängige Nachrechnung (`oracle.py`) über viele Einstellungen | ~20 min |
| `live/` | Lowest BIN live gegen eine zweite Rechnung (Workflow „Prüfung Live-Preise“) | – |

Testdaten: `testdata.py` (Bazaar, realistisch und extrem), `fixtures/market.json` (Markt-Analyse).
Screenshots des Rauchtests: `tests/smoke/out/` (nicht im Repository).
