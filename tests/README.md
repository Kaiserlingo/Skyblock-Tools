# Tests

Prüfen, dass jede Zahl der Website stimmt.

- `oracle.py` – unabhängige Nachrechnung aller Kennzahlen (Flips, Crafts, NPC, Flip-Rechner)
- `test_numbers.py` – vergleicht die Website mit der Nachrechnung über viele Einstellungen und Extremfälle
- `test_units.py` – Eingaben, Formatierung, Verlauf, Alarme, Teilen-Link, API-Ausfälle, Sortierung, Charts
- `testdata.py` – realistische und extreme Testdaten (leere Orderbücher, Riesenpreise, gefährliche Namen …)

Voraussetzung: Python mit `playwright` und ein Chrome. Seite lokal starten (`python3 -m http.server 8765`
im Hauptordner), dann `python3 tests/test_numbers.py` und `python3 tests/test_units.py`.
