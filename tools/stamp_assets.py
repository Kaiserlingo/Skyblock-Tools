"""Hängt an CSS/JS in index.html einen Inhalts-Hash an (?v=...),
damit Browser nach jedem Update sofort die neuen Dateien laden statt alte aus dem Cache.
Aufruf vor jedem Commit:  python3 tools/stamp_assets.py"""
import hashlib, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')
for path in ['css/style.css', 'js/chart.js', 'js/app.js', 'js/econ.js', 'js/markt.js']:
    h = hashlib.sha1((root / path).read_bytes()).hexdigest()[:8]
    html = re.sub(re.escape(path) + r'(\?v=[0-9a-f]+)?"', f'{path}?v={h}"', html)
(root / 'index.html').write_text(html, encoding='utf-8')
print('ok')
