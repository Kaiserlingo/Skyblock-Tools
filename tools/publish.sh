#!/usr/bin/env bash
# Veröffentlicht Änderungen: stempeln → prüfen → committen → pushen. GitHub Pages ist ~1 Minute später aktuell.
#
#   tools/publish.sh "Kurze Beschreibung"            Standard-Prüfung (~3 min)
#   tools/publish.sh --fast "Kurze Beschreibung"     nur schnelle Prüfung (~20 s), z. B. für Texte und CSS
#
# Die Commit-Nachricht kann mehrere Zeilen haben (in Anführungszeichen).
set -eu
cd "$(dirname "$0")/.."
CHECK=""
if [ "${1:-}" = "--fast" ]; then CHECK="--fast"; shift; fi
MSG="${1:?Commit-Nachricht fehlt}"
python3 tools/stamp_assets.py >/dev/null
tools/check.sh $CHECK
git add -A
if git diff --cached --quiet; then echo "Nichts zu veröffentlichen."; exit 0; fi
git commit -q -m "$MSG"
git fetch -q origin
git rebase -q origin/main
git -c push.negotiate=true push -q origin HEAD:main
echo "Veröffentlicht: $(git log --oneline -1)"
