"""Lädt einen einheitlichen Stand aller Hypixel-Auktionen nach auctions.json (für den Live-Abgleich)."""
import json, urllib.request, time, sys
def get(u):
    with urllib.request.urlopen(u, timeout=30) as r: return json.load(r)
for attempt in range(4):
    p0 = get('https://api.hypixel.net/v2/skyblock/auctions?page=0')
    pages = [p0] + [get(f'https://api.hypixel.net/v2/skyblock/auctions?page={i}') for i in range(1, p0['totalPages'])]
    if len({p['lastUpdated'] for p in pages}) == 1: break
    time.sleep(8)
else: sys.exit('kein einheitlicher Stand')
json.dump({'lastUpdated': p0['lastUpdated'], 'auctions': [a for p in pages for a in p['auctions']]}, open(sys.argv[1], 'w'))
print('Auktionen:', sum(len(p['auctions']) for p in pages))
