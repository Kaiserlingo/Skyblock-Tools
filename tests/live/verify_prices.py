"""Unabhängige Nachrechnung (eigener NBT-Leser in Python) des Lowest BIN je Item und Vergleich mit tools/ah_lib.mjs."""
import json, gzip, base64, struct, sys
def nbt(b):
    o = [0]
    def rd(fmt, n): v = struct.unpack_from(fmt, b, o[0])[0]; o[0] += n; return v
    def s(): l = rd('>H', 2); v = b[o[0]:o[0]+l].decode('utf-8', 'replace'); o[0] += l; return v
    def p(t):
        if t == 1: return rd('>b', 1)
        if t == 2: return rd('>h', 2)
        if t == 3: return rd('>i', 4)
        if t == 4: return rd('>q', 8)
        if t == 5: return rd('>f', 4)
        if t == 6: return rd('>d', 8)
        if t == 7: l = rd('>i', 4); o[0] += l; return None
        if t == 8: return s()
        if t == 9:
            et = rd('>b', 1); l = rd('>i', 4); return [p(et) for _ in range(l)]
        if t == 10:
            c = {}
            while True:
                tt = rd('>B', 1)
                if tt == 0: return c
                k = s(); c[k] = p(tt)
        if t == 11: l = rd('>i', 4); o[0] += 4 * l; return None
        if t == 12: l = rd('>i', 4); o[0] += 8 * l; return None
        raise ValueError(t)
    t = rd('>B', 1); s(); return p(t)
def key(a):
    it = nbt(gzip.decompress(base64.b64decode(a['item_bytes'])))['i'][0]
    ea = (it.get('tag') or {}).get('ExtraAttributes') or {}; i = ea.get('id'); cnt = max(1, it.get('Count') or 1)
    if i == 'PET' and 'petInfo' in ea:
        try: return 'PET_' + json.loads(ea['petInfo'])['type'], cnt
        except Exception: return 'PET', cnt
    if i == 'ENCHANTED_BOOK' and isinstance(ea.get('enchantments'), dict):
        e = ea['enchantments']
        return ('ENCHANTMENT_%s_%s' % (list(e)[0].upper(), list(e.values())[0]) if len(e) == 1 else 'ENCHANTED_BOOK'), cnt
    if i in ('RUNE', 'UNIQUE_RUNE') and ea.get('runes'): return 'RUNE_' + list(ea['runes'])[0].upper(), cnt
    return i, cnt
A = json.load(open(sys.argv[1])); N = json.load(open(sys.argv[2]))['items']
low, cnt = {}, {}
for a in A['auctions']:
    if not a['bin']: continue
    try: k, c = key(a)
    except Exception: continue
    if not k: continue
    p = a['starting_bid'] / c
    low[k] = min(low.get(k, float('inf')), p); cnt[k] = cnt.get(k, 0) + 1
bad = []
for k in set(low) | {k for k, v in N.items() if v['b'] is not None}:
    a, b = low.get(k), N.get(k, {}).get('b')
    if a is None or b is None or abs(a - b) > 1e-6 or cnt.get(k) != N[k]['n']: bad.append((k, a, b, cnt.get(k), N.get(k, {}).get('n')))
print(f"Items mit BIN: {len(low)}, abweichend: {len(bad)}")
for x in bad[:20]: print('  ', x)
sys.exit(1 if bad else 0)
