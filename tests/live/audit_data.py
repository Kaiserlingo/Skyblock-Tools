"""Live-Prüfung der Pipeline-Daten (market.json, bazaar_stats.json) gegen die Rohdaten von SkyCofl.

Rechnet für eine Stichprobe von Bazaar-Items alle Kennzahlen aus den Rohdaten neu – mit einer eigenen
Umsetzung der Regeln in Python, NICHT mit js/lib/econ.js – und vergleicht sie mit den veröffentlichten Werten.
Dieselben Zeitfenster wie beim Bau (built, days, recentCut aus market.json), damit die Zahlen gleich sein müssen.

    python3 tests/live/audit_data.py market.json bazaar_stats.json bericht.json [Anzahl]
Braucht Internet (läuft im Workflow „Live-Prüfung“).
"""
import calendar, json, math, random, statistics, sys, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor

DAY = 86400000
COFL = 'https://sky.coflnet.com/api/'

def get(url, tries=5):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'SkyBlockTools-Audit'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except Exception as e:
            if k == tries - 1: raise
            time.sleep(2 + 3 * k)

def iso(t): return time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime(t / 1000))
def parse_utc(ts):
    """SkyCofl-Zeit ("2026-11-19T08:03:28.982", ohne Zone = UTC) in Millisekunden."""
    if isinstance(ts, (int, float)): return ts
    s = ts[:-1] if ts.endswith('Z') else ts
    frac = 0.0
    if '.' in s: s, f = s.split('.', 1); frac = float('0.' + ''.join(ch for ch in f if ch.isdigit()) or '0')
    return (calendar.timegm(time.strptime(s[:19], '%Y-%m-%dT%H:%M:%S')) + frac) * 1000

def ok(x): return x is not None and isinstance(x, (int, float)) and math.isfinite(x)

# ---------- Regeln (eigene Umsetzung) ----------
def market_price(o):
    """Marktpreis eines SkyCofl-Punkts: Instabuy- und Instasell-Preis, gewichtet mit den Wochenmengen."""
    b, s = float(o.get('buy') or 0), float(o.get('sell') or 0)
    wb, ws = float(o.get('buyMovingWeek') or 0), float(o.get('sellMovingWeek') or 0)
    if b > 0 and s > 0: return (wb * b + ws * s) / (wb + ws) if wb + ws > 0 else (b + s) / 2
    return b if b > 0 else (s if s > 0 else None)

def day_series(points, days, end, max_gap=3):
    """Mittelwert je UTC-Kalendertag auf einem Raster von `days` Tagen bis `end`; Lücken bis 3 Tage mit letztem Wert."""
    by = {}
    for t, v in points:
        if not ok(t) or not ok(v) or v <= 0: continue
        d = (t // DAY) * DAY; by.setdefault(d, []).append(v)
    last = (end // DAY) * DAY; first = last - (days - 1) * DAY
    out, lastv, gap = [], None, 0
    d = first
    while d <= last:
        if d in by: lastv = sum(by[d]) / len(by[d]); gap = 0; out.append(lastv)
        else: gap += 1; out.append(lastv if lastv is not None and gap <= max_gap else None)
        d += DAY
    return out

def np_quantile(a, p):
    x = sorted(v for v in a if ok(v)); n = len(x)
    if not n: return None
    h = (n - 1) * p; lo = math.floor(h); hi = min(lo + 1, n - 1)
    return x[lo] + (h - lo) * (x[hi] - x[lo])

def outlier_filter(v, k=3, t=3, floor=.005):
    out = list(v)
    for i in range(len(v)):
        if not ok(v[i]): continue
        w = [v[j] for j in range(max(0, i - k), min(len(v), i + k + 1)) if ok(v[j])]
        if len(w) < k + 1: continue
        m = np_quantile(w, .5); mad = 1.4826 * np_quantile([abs(x - m) for x in w], .5)
        if abs(v[i] - m) > t * max(mad, floor * abs(m)): out[i] = m
    return out

def change(v, k):
    L = len(v) - 1
    if L < k or not ok(v[L]) or not ok(v[L - k]) or v[L - k] <= 0: return None
    return v[L] / v[L - k] - 1

def vola(v, n=30):
    w = v[-(n + 1):]
    r = [math.log(w[i] / w[i - 1]) for i in range(1, len(w)) if ok(w[i]) and ok(w[i - 1]) and w[i] > 0 and w[i - 1] > 0]
    return statistics.stdev(r) if len(r) >= min(10, n - 1) and len(r) >= 2 else None

def drawdown(v):
    peak, dd = None, 0
    for x in v:
        if not ok(x): continue
        if peak is None or x > peak: peak = x
        dd = max(dd, (peak - x) / peak)
    return dd

def term_returns(T, v, terms, pre=5):
    out = []
    for m in terms:
        s = (m['start'] // DAY) * DAY + DAY; e = (m['end'] // DAY) * DAY; p0 = (m['start'] // DAY) * DAY - pre * DAY; p1 = (m['start'] // DAY) * DAY
        during = [v[i] for i, d in enumerate(T) if ok(v[i]) and s <= d < e]
        before = [v[i] for i, d in enumerate(T) if ok(v[i]) and p0 <= d < p1]
        if len(during) >= 3 and len(before) >= 3: out.append((m['name'], m['start'], statistics.fmean(during) / statistics.fmean(before) - 1))
    return out

def spread_stats(recent, daily, now):
    pts = []
    for o in recent or []:
        t = parse_utc(o['timestamp']); b, s = float(o.get('buy') or 0), float(o.get('sell') or 0)
        if b > 0 and s > 0: pts.append(dict(t=t, b=b, s=s, mb=float(o.get('maxBuy') or 0), nb=float(o.get('minBuy') or 0), ms=float(o.get('maxSell') or 0), ns=float(o.get('minSell') or 0), w=float(o.get('buyMovingWeek') or 0) + float(o.get('sellMovingWeek') or 0)))
    pts.sort(key=lambda p: p['t'])
    if len(pts) < 24: return None
    sp = [p['b'] / p['s'] - 1 for p in pts]
    mid = lambda p: (p['b'] + p['s']) / 2
    t0, t1 = pts[0]['t'], pts[-1]['t']
    first = [mid(p) for p in pts if p['t'] < t0 + DAY]; last = [mid(p) for p in pts if p['t'] > t1 - DAY]
    d30 = [(float(o.get('buy') or 0), float(o.get('sell') or 0)) for o in daily or [] if parse_utc(o['timestamp']) > now - 30 * DAY]
    d30 = [b / s - 1 for b, s in d30 if b > 0 and s > 0]
    ra = [(p['mb'] - p['nb']) / p['b'] for p in pts if p['mb'] > 0 and p['nb'] > 0]
    rb = [(p['ms'] - p['ns']) / p['s'] for p in pts if p['ms'] > 0 and p['ns'] > 0]
    return dict(sq=[np_quantile(sp, k / 20) for k in range(21)], am=np_quantile([p['b'] for p in pts], .5), bm=np_quantile([p['s'] for p in pts], .5),
                ra=np_quantile(ra, .5), rb=np_quantile(rb, .5), tr=(statistics.fmean(last) / statistics.fmean(first) - 1) if first and last else None,
                vt=(pts[-1]['w'] / pts[0]['w'] - 1) if pts[0]['w'] > 0 else None, s30=np_quantile(d30, .5) if len(d30) >= 10 else None, n=len(pts))

# ---------- Vergleich ----------
def same(a, b, rel=1e-3, abs_=1.5e-4):
    if a is None or b is None: return a is None and b is None
    return abs(a - b) <= max(abs_, rel * max(abs(a), abs(b)))

def main():
    md = json.load(open(sys.argv[1])); bs = json.load(open(sys.argv[2])); out_path = sys.argv[3]
    n = int(sys.argv[4]) if len(sys.argv) > 4 else 160
    built, end, cut = md['built'], md['days']['to'], md['recentCut']
    days = (md['days']['to'] - md['days']['from']) // DAY + 1
    T = [end - (days - 1 - i) * DAY for i in range(days)]
    ids = [i for i, o in md['items'].items() if 'p' in o]
    liq = [i for i in ids if md['items'][i].get('liq')]
    rnd = random.Random(int(built) % 100000)
    sample = sorted(set(rnd.sample(liq, min(len(liq), n * 2 // 3)) + rnd.sample(ids, min(len(ids), n // 3))))
    start_long = iso(end - (days + 3) * DAY); start7 = iso(built - 6.9 * DAY); end_s = iso(built)
    def fetch(i):
        e = urllib.parse.quote(i, safe='')
        try:
            a = get(COFL + f'bazaar/{e}/history?start={start_long}&end={end_s}')
            b = get(COFL + f'bazaar/{e}/history?start={start7}&end={end_s}')
            return i, a, b, None
        except Exception as ex: return i, None, None, str(ex)
    with ThreadPoolExecutor(4) as ex: raw = list(ex.map(fetch, sample))
    spi = md['index']['spi']
    done_terms = [m for m in md['terms'] if m['end'] <= built and m['start'] >= T[0] + 6 * DAY]
    spi_by = {s: r for _, s, r in term_returns(T, spi, done_terms)}
    fields = ['p', 'p24', 'c1', 'c7', 'c30', 'c90', 'c365', 'v30', 'dd']
    stat = {f: [0, 0] for f in fields + ['w', 'my', 'stats']}
    diffs = []
    for i, a, b, err in raw:
        if err: diffs.append({'id': i, 'f': 'abruf', 'msg': err}); continue
        conv = lambda arr: [(parse_utc(o['timestamp']), market_price(o)) for o in arr or []]
        recent = [p for p in conv(b) if p[0] >= cut]
        pts = ([p for p in conv(a) if p[0] < cut] + recent) if recent else conv(a)
        v = outlier_filter(day_series(pts, days, end))
        L = max([k for k in range(len(v)) if ok(v[k])], default=-1)
        last24 = [p[1] for p in conv(b) if p[0] > built - DAY and ok(p[1]) and p[1] > 0]
        mine = dict(p=v[L] if L >= 0 else None, p24=statistics.fmean(last24) if len(last24) >= 6 else None, c1=change(v, 1), c7=change(v, 7), c30=change(v, 30),
                    c90=change(v, 90), c365=change(v, days - 1), v30=vola(v, 30), dd=drawdown(v))
        o = md['items'][i]
        for f in fields:
            stat[f][1] += 1
            if same(o.get(f), mine[f], rel=2e-4 if f in ('p', 'p24') else 1e-3): stat[f][0] += 1
            else: diffs.append({'id': i, 'f': f, 'pub': o.get(f), 'neu': mine[f]})
        # Wochenpunkte
        w = [v[(days - 1) % 7 + k * 7] for k in range(len([x for j, x in enumerate(T) if j % 7 == (days - 1) % 7]))]
        bad = [k for k in range(len(w)) if not same(o['w'][k] if k < len(o.get('w') or []) else None, w[k], rel=2e-4)]
        stat['w'][1] += 1
        if bad: diffs.append({'id': i, 'f': 'w', 'idx': bad[:5], 'pub': [o['w'][k] for k in bad[:5]], 'neu': [w[k] for k in bad[:5]]})
        else: stat['w'][0] += 1
        # Mayor-Wirkung gegenüber dem Markt
        g = {}
        for name, s, r in term_returns(T, v, done_terms):
            if s in spi_by: g.setdefault(name, []).append(r - spi_by[s])
        my = {k: [np_quantile(x, .5), len(x), sum(1 for y in x if y > 0) / len(x)] for k, x in g.items()}
        pm = o.get('my') or {}
        stat['my'][1] += 1
        badm = [k for k in set(my) | set(pm) if k not in my or k not in pm or pm[k][1] != my[k][1] or not same(pm[k][0], my[k][0], abs_=3e-4) or not same(pm[k][2], my[k][2], abs_=1e-3)]
        if badm: diffs.append({'id': i, 'f': 'my', 'mayors': badm[:4], 'pub': {k: pm.get(k) for k in badm[:4]}, 'neu': {k: my.get(k) for k in badm[:4]}})
        else: stat['my'][0] += 1
        # Spread-Statistik des Flippers
        ss, ps = spread_stats(b, a, built), bs['items'].get(i)
        stat['stats'][1] += 1
        if (ss is None) != (ps is None): diffs.append({'id': i, 'f': 'stats', 'pub': ps is not None, 'neu': ss is not None})
        elif ss:
            badk = [k for k in ['am', 'bm', 'ra', 'rb', 'tr', 'vt', 's30', 'n'] if not same(ps.get(k), ss[k], rel=2e-4, abs_=2e-6)]
            badq = [k for k in range(21) if not same(ps['sq'][k], ss['sq'][k], rel=2e-4, abs_=2e-6)]
            if badk or badq: diffs.append({'id': i, 'f': 'stats', 'keys': badk, 'sq': badq[:5], 'pub': {k: ps.get(k) for k in badk}, 'neu': {k: ss[k] for k in badk}})
            else: stat['stats'][0] += 1
        else: stat['stats'][0] += 1
    rep = {'built': built, 'sample': len(sample), 'ok': {k: f'{a}/{b}' for k, (a, b) in stat.items()}, 'diffs': diffs[:400], 'ndiff': len(diffs)}
    json.dump(rep, open(out_path, 'w'), indent=1)
    print(json.dumps(rep['ok'], indent=1)); print('Abweichungen:', len(diffs))
    for d in diffs[:30]: print(' ', d)

if __name__ == '__main__': main()
