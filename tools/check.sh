#!/usr/bin/env bash
# Prüft das ganze Projekt mit einem Befehl. Vor jedem Commit ausführen.
#
#   tools/check.sh          Standard (~3 min): Code, Rechenkerne, Rauchtest, Bedienung
#   tools/check.sh --fast   nur ohne Browser (~20 s): Code, Stempel, Rechenkerne
#   tools/check.sh --full   zusätzlich (~25 min): alle Zahlen gegen die Nachrechnung, dunkles Design,
#                           Überstand in 7 Bildschirmbreiten
#
# Browser-Tests brauchen Python mit „playwright“ und Chrome/Chromium. Ein Webserver wird automatisch gestartet.
set -u
cd "$(dirname "$0")/.."
MODE="${1:-}"
FAILED=()
step(){   # step "Name" Befehl …
  local name="$1"; shift
  printf '▶ %s … ' "$name"
  local t0=$SECONDS out
  if out=$("$@" 2>&1); then printf 'ok (%ss)\n' $((SECONDS - t0))
  else printf 'FEHLER (%ss)\n' $((SECONDS - t0)); echo "$out" | tail -25 | sed 's/^/    /'; FAILED+=("$name"); fi
}
step "Stempel in index.html aktuell"   python3 tools/stamp_assets.py --check
step "Code (JS, CSS, Pipeline)"        node tools/check_code.mjs
step "Prognose-Modell"                 node tests/test_forecast.mjs
step "Rechenfunktionen Markt-Analyse"  python3 -W ignore tests/test_econ.py
step "Kategorien"                      python3 tests/test_categories.py
step "Auction House"                   python3 tests/test_ah.py
step "Pipeline (Trockenlauf)"          node tests/test_pipeline.mjs
if [ "$MODE" != "--fast" ]; then
  step "Rauchtest (alle Seiten)"       python3 tests/smoke/smoke.py
  step "Bedienung (Eingaben, Links …)" python3 tests/test_units.py
fi
if [ "$MODE" = "--full" ]; then
  step "Rauchtest dunkel + Überstand"  env CS=dark AUDIT=1 python3 tests/smoke/smoke.py
  step "Alle Zahlen (Nachrechnung)"    python3 tests/test_numbers.py
fi
echo
if [ ${#FAILED[@]} -eq 0 ]; then echo "✔ Alles in Ordnung."; else echo "✘ Fehlgeschlagen: ${FAILED[*]}"; exit 1; fi
