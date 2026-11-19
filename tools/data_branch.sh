#!/usr/bin/env bash
# Hilfsskript für den Branch "data" (dort liegen market.json und prices.json).
#   tools/data_branch.sh fetch <ordner>          holt den aktuellen Stand (oder legt einen leeren Ordner an)
#   tools/data_branch.sh publish <ordner> <datei> ersetzt <datei> im Ordner und veröffentlicht alles als einen Commit
set -euo pipefail
REPO="https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
case "$1" in
  fetch)
    rm -rf "$2"
    git clone -q --depth 1 --branch data "$REPO" "$2" 2>/dev/null || mkdir -p "$2"
    ;;
  publish)
    cp "$3" "$2/"
    cd "$2"
    rm -rf .git && git init -q && git checkout -q -b data
    git add -A
    git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" commit -q -m "Daten $(date -u +%Y-%m-%dT%H:%MZ)"
    git push -q -f "$REPO" data
    ;;
esac
