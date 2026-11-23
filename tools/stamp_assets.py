"""Hängt an jede lokale CSS/JS-Datei in index.html einen Inhalts-Hash (?v=…),
damit Browser nach einer Änderung sofort die neue Version laden.
Findet die Dateien selbst – neue Dateien brauchen nur ihren <script>/<link>-Eintrag.

    python3 tools/stamp_assets.py          # stempeln
    python3 tools/stamp_assets.py --check  # nur prüfen (Exit 1, wenn etwas fehlt oder veraltet ist)
"""
import hashlib, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = os.path.join(ROOT, 'index.html')
html = open(path, encoding='utf-8').read()
bad = []
def stamp(m):
    attr, file = m.group(1), m.group(2)
    full = os.path.join(ROOT, file)
    if not os.path.exists(full):
        bad.append(f'fehlt: {file}'); return m.group(0)
    h = hashlib.sha1(open(full, 'rb').read()).hexdigest()[:8]
    return f'{attr}="{file}?v={h}"'
new = re.sub(r'(src|href)="((?:js|css)/[^"?]+)(?:\?v=[0-9a-f]*)?"', stamp, html)
if '--check' in sys.argv:
    if bad or new != html:
        print('index.html ist nicht aktuell gestempelt' + (': ' + ', '.join(bad) if bad else ' (python3 tools/stamp_assets.py ausführen)')); sys.exit(1)
    print('Stempel aktuell'); sys.exit(0)
if bad: print('\n'.join(bad)); sys.exit(1)
if new != html: open(path, 'w', encoding='utf-8').write(new)
print('ok')
