#!/usr/bin/env bash
# Hilfsskript für den Branch "data" (dort liegen market.json und prices.json).
#   tools/data_branch.sh fetch <ordner>    holt den aktuellen Stand (oder legt einen leeren Ordner an)
#   tools/data_branch.sh publish <datei>   ersetzt <datei> auf dem Branch, alle anderen Dateien bleiben
# Beide Workflows schreiben unabhängig voneinander. Damit keiner die Datei des anderen
# mit einem alten Stand überschreibt, wird direkt vor dem Push frisch geholt und nur gepusht,
# wenn sich der Branch seitdem nicht geändert hat (--force-with-lease); sonst neuer Versuch.
set -euo pipefail
REPO="${DATA_REPO:-https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git}"
case "$1" in
  fetch)
    rm -rf "$2"
    git clone -q --depth 1 --branch data "$REPO" "$2" 2>/dev/null || mkdir -p "$2"
    ;;
  publish)
    SRC="$(realpath "$2")"
    for try in 1 2 3 4 5 6; do
      rm -rf _pub
      if git clone -q --depth 1 --branch data "$REPO" _pub 2>/dev/null; then OLD=$(git -C _pub rev-parse HEAD); else mkdir -p _pub; OLD=""; fi
      cp "$SRC" _pub/
      cd _pub
      rm -rf .git && git init -q && git checkout -q -b data
      git add -A
      git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" commit -q -m "Daten $(date -u +%Y-%m-%dT%H:%MZ)"
      if git push -q --force-with-lease="data:${OLD}" "$REPO" data; then cd ..; rm -rf _pub; exit 0; fi
      cd ..; echo "Branch hat sich gerade geändert, neuer Versuch ($try)"; sleep $((RANDOM % 5 + 2))
    done
    echo "Veröffentlichen fehlgeschlagen"; exit 1
    ;;
esac
