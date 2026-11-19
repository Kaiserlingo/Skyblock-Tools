"""Prüft tools/ah_lib.mjs: NBT lesen, Item-ID zuordnen, Lowest BIN berechnen (mit selbst erzeugten Item-Daten)."""
import struct, gzip, base64, json, subprocess, os, random
HERE = os.path.dirname(os.path.abspath(__file__)); LIB = os.path.join(HERE, '..', 'tools', 'ah_lib.mjs')
def s(x): b = x.encode(); return struct.pack('>H', len(b)) + b
def tagv(v):
    if isinstance(v, bool): return 1, struct.pack('>b', int(v))
    if isinstance(v, tuple) and v[0] == 'b': return 1, struct.pack('>b', v[1])
    if isinstance(v, tuple) and v[0] == 'h': return 2, struct.pack('>h', v[1])
    if isinstance(v, tuple) and v[0] == 'l': return 4, struct.pack('>q', v[1])
    if isinstance(v, tuple) and v[0] == 'ba': return 7, struct.pack('>i', len(v[1])) + bytes(v[1])
    if isinstance(v, int): return 3, struct.pack('>i', v)
    if isinstance(v, float): return 6, struct.pack('>d', v)
    if isinstance(v, str): return 8, s(v)
    if isinstance(v, list):
        if not v: return 9, struct.pack('>bi', 0, 0)
        t0, _ = tagv(v[0]); return 9, struct.pack('>bi', t0, len(v)) + b''.join(tagv(x)[1] for x in v)
    if isinstance(v, dict): return 10, b''.join(struct.pack('>b', tagv(x)[0]) + s(k) + tagv(x)[1] for k, x in v.items()) + b'\x00'
    raise TypeError(v)
def item_bytes(ea, count=1, name='X'):
    root = {'i': [{'id': ('h', 1), 'Count': ('b', count), 'tag': {'ExtraAttributes': ea, 'display': {'Name': name, 'Lore': ['§7a', 'b']}, 'ench': [], 'big': ('l', 2**40), 'raw': ('ba', [1, 2, 3])}, 'Damage': ('h', 0)}]}
    raw = struct.pack('>b', 10) + s('') + tagv(root)[1]
    return base64.b64encode(gzip.compress(raw)).decode()
cases = [
    ({'id': 'HYPERION', 'uuid': 'x', 'stars': 5}, 1, 'HYPERION', None),
    ({'id': 'PET', 'petInfo': json.dumps({'type': 'BEE', 'tier': 'LEGENDARY', 'exp': 1.5})}, 1, 'PET_BEE', 'LEGENDARY'),
    ({'id': 'ENCHANTED_BOOK', 'enchantments': {'ultimate_wise': 5}}, 1, 'ENCHANTMENT_ULTIMATE_WISE_5', None),
    ({'id': 'ENCHANTED_BOOK', 'enchantments': {'sharpness': 6, 'smite': 6}}, 1, 'ENCHANTED_BOOK', None),
    ({'id': 'RUNE', 'runes': {'MUSIC': 3}}, 1, 'RUNE_MUSIC', '3'),
    ({'id': 'UNIQUE_RUNE', 'runes': {'GOLDEN_CARPET': 1}}, 1, 'RUNE_GOLDEN_CARPET', '1'),
    ({'id': 'ENCHANTED_DIAMOND'}, 64, 'ENCHANTED_DIAMOND', None),
    ({'id': 'PET', 'petInfo': 'kaputt'}, 1, 'PET', None),
]
random.seed(3); aucs = []; expect = {}
for k, (ea, cnt, tag, var) in enumerate(cases):
    for j in range(6):
        bin_ = j < 4; price = random.randint(1, 10**9) * cnt
        aucs.append({'item_bytes': item_bytes(ea, cnt, '§6Name'), 'bin': bin_, 'starting_bid': price, 'highest_bid_amount': 0 if bin_ else price + 5, 'item_name': '§6Name ' + tag})
        e = expect.setdefault(tag, {'bins': [], 'a': 0, 'hb': 0, 'v': {}})
        if bin_:
            e['bins'].append(price / cnt)
            if var is not None: e['v'][var] = min(e['v'].get(var, 1e30), price / cnt)
        else: e['a'] += 1; e['hb'] = max(e['hb'], (price + 5) / cnt)
aucs.append({'item_bytes': 'bm90LWd6aXA=', 'bin': True, 'starting_bid': 5, 'item_name': 'kaputt'})
js = f"""import {{aggregate, decodeItemBytes, itemKey}} from {json.dumps(LIB)};
const a = {json.dumps(aucs)};
const r = aggregate(a); const keys = a.slice(0, -1).map(x => itemKey(decodeItemBytes(x.item_bytes)));
console.log(JSON.stringify({{r, keys}}));"""
out = subprocess.run(['node', '--input-type=module', '-e', js], capture_output=True, text=True)
if out.returncode: print(out.stderr); raise SystemExit(1)
R = json.loads(out.stdout); fails = []; n = 0
def chk(name, a, b):
    global n; n += 1
    if a != b and not (isinstance(a, float) and isinstance(b, (int, float)) and abs(a - b) < 1e-9 * max(1, abs(a))): fails.append(f'{name}: erwartet {a}, bekommen {b}')
for k, (ea, cnt, tag, var) in enumerate(cases):
    key = R['keys'][k * 6]; chk(f'tag {tag}', tag, key['tag']); chk(f'variant {tag}', var, key['variant']); chk(f'count {tag}', cnt, key['count'])
for tag, e in expect.items():
    o = R['r']['items'][tag]; b = sorted(e['bins'])
    chk(f'{tag} lowest', b[0], o['b']); chk(f'{tag} l5', b[:5], o['l5']); chk(f'{tag} n', len(b), o['n']); chk(f'{tag} a', e['a'], o['a']); chk(f'{tag} hb', e['hb'], o['hb'])
    chk(f'{tag} variants', e['v'] or None, o['v']); chk(f'{tag} name', 'Name ' + tag, o['name'])
chk('kaputte Daten gezählt', 1, R['r']['bad'])
print(f'geprüft: {n}, Fehler: {len(fails)}')
for f in fails: print('  ', f)
