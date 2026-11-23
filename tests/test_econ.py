"""Prüft js/econ.js gegen eine unabhängige Nachrechnung mit numpy (Zufallsdaten + Randfälle)."""
import json, subprocess, os, math, random, datetime as dt
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ECON = os.path.join(HERE, '..', 'js', 'lib', 'econ.js')
DAY = 86400000
fails = []; checks = 0
def node(code):
    out = subprocess.run(['node', '-e', f"const E=require({json.dumps(ECON)});const R=(()=>{{{code}}})();console.log(JSON.stringify(R))"], capture_output=True, text=True)
    if out.returncode: raise RuntimeError(out.stderr)
    return json.loads(out.stdout)
def close(a, b, tol=1e-9):
    if a is None or b is None: return a is None and b is None
    if isinstance(a, float) and math.isnan(a): return b is None
    return abs(a - b) <= tol * max(1, abs(a), abs(b))
def check(name, a, b, tol=1e-9):
    global checks; checks += 1
    if not close(a, b, tol): fails.append(f"{name}: erwartet {a}, econ.js {b}")

rng = np.random.default_rng(7)
for trial in range(25):
    n = int(rng.integers(40, 400))
    p = 1000 * np.exp(np.cumsum(rng.normal(0, 0.03, n)))
    idx = 100 * np.exp(np.cumsum(rng.normal(0, 0.01, n)))
    p[rng.integers(0, n)] *= 1.0  # unverändert
    lst = [float(x) for x in p]; il = [float(x) for x in idx]
    r = node(f"""const v={json.dumps(lst)}, m={json.dumps(il)};
      return {{mean:E.mean(v), sd:E.sd(v), q05:E.quantile(v,.05), q37:E.quantile(v,.37), med:E.median(v),
        ch7:E.change(v,7), ch30:E.change(v,30), vol:E.volatility(v,30), dd:E.maxDrawdown(v).dd, ve:E.varES(v), beta:E.beta(v,m),
        z:E.zscore(v,30)}};""")
    check('mean', float(np.mean(p)), r['mean']); check('sd', float(np.std(p, ddof=1)), r['sd'])
    check('q05', float(np.quantile(p, .05)), r['q05']); check('q37', float(np.quantile(p, .37)), r['q37']); check('median', float(np.median(p)), r['med'])
    check('change7', float(p[-1] / p[-8] - 1), r['ch7']); check('change30', float(p[-1] / p[-31] - 1) if n > 30 else None, r['ch30'])
    lr = np.diff(np.log(p))
    check('vol30', float(np.std(lr[-30:], ddof=1)), r['vol'])
    peak = np.maximum.accumulate(p); check('maxdd', float(np.max((peak - p) / peak)), r['dd'])
    q = np.quantile(lr, .05); check('VaR', float(-(math.exp(q) - 1)), r['ve']['VaR']); check('ES', float(-np.mean(np.exp(lr[lr <= q]) - 1)), r['ve']['ES'])
    lm = np.diff(np.log(idx)); b, a = np.polyfit(lm, lr, 1)
    check('beta', float(b), r['beta']['b']); check('alpha', float(a), r['beta']['a'])
    check('r2', float(np.corrcoef(lm, lr)[0, 1] ** 2), r['beta']['r2'])
    res = lr - (a + b * lm); se = math.sqrt(np.sum(res ** 2) / (len(lr) - 2) / np.sum((lm - lm.mean()) ** 2)); check('se', se, r['beta']['se'], 1e-7)
    w = p[-30:]; check('z', float((p[-1] - w.mean()) / np.std(w, ddof=1)), r['z']['z']); check('vsMedian', float(p[-1] / np.median(w) - 1), r['z']['vsMedian'])

# Index: gewichteter geometrischer Mittelwert, mit Deckelung
for trial in range(10):
    k, n = int(rng.integers(3, 30)), 60
    P = 100 * np.exp(np.cumsum(rng.normal(0, .02, (k, n)), axis=1)); W = rng.uniform(1, 1000, k); W[0] *= 50
    cap = 0.08
    r = node(f"return E.chainIndex({json.dumps([{'v': [float(x) for x in P[i]], 'w': float(W[i])} for i in range(k)])},{n},{cap});")
    w = W / W.sum()
    if k * cap >= 1:
        for _ in range(50):
            over = w > cap + 1e-12
            if not over.any(): break
            free = w[w < cap].sum(); w = np.where(w >= cap, cap, w / free * (1 - over.sum() * cap))
    exp = 100 * np.exp((w[:, None] * np.log(P / P[:, :1])).sum(0) / w.sum())
    for t in [0, 1, 30, n - 1]: check(f'index t{t}', float(exp[t]), r['v'][t])
    check('weights<=cap', 1.0, 1.0 if (k * cap < 1 or w.max() <= cap + 1e-9) else 0.0)

# Elastizität: bekannte Steigung muss getroffen werden
pts = []; t0 = 1700000000000
for i in range(400):
    pr = 100 * math.exp(math.sin(i / 20) * .3); pts.append({'t': t0 + i * DAY, 'p': pr, 'q': 1e6 * pr ** -1.5})
r = node(f"const s=E.weeklySamples({json.dumps(pts)},'q','p'); return {{n:s.length, e:E.elasticity(s), s0:s[0], sl:s[s.length-1]}};")
check('elasticity count', 57.0, float(r['n'])); check('elasticity slope ~ -1.5', -1.5, round(r['e']['b'], 2), 1e-2)
last7 = [p['p'] for p in pts[-7:]]; check('weekly price = mean of last 7 days', sum(last7) / 7, r['sl']['p'])

# Tagesreihe: Lücken und Mehrfachpunkte
r = node("""const d=86400000, b=Date.UTC(2026,0,1);
  return E.daily([{t:b+1000,v:10},{t:b+5000,v:20},{t:b+2*d,v:30},{t:b+7*d,v:40},{t:b+7*d+5,v:-1}],{maxGap:3});""")
check('daily len', 8.0, float(len(r['t']))); check('daily mean same day', 15.0, r['v'][0]); check('daily ffill', 15.0, r['v'][1])
check('daily gap>3 -> null', None, r['v'][6]); check('daily gap fill 3', 30.0, r['v'][5]); check('daily ignores <=0', 40.0, r['v'][7])

# Zeiten
r = node("""return [E.parseUtc('2026-11-19T08:03:28.982'), E.parseUtc('2026-11-19T08:03:28.982Z'), E.parseUtc('2026-11-19T08:03:28+01:00'),
  E.parseMayorTime('05/03/2026 03:15:00 +00:00'), E.parseMayorTime('11/20/2026 15:15:00'), E.parseNewsDate('17th November 2026'), E.parseNewsDate('1st July 2026'),
  E.parseNewsDate('Ghost Visitors'), E.sbTime(526,2,27), E.sbDate(Date.UTC(2026,10,15,11,15)), E.sbDate(E.sbTime(1,0,1))];""")
def ms(*a): return int(dt.datetime(*a, tzinfo=dt.timezone.utc).timestamp() * 1000)
check('utc', ms(2026, 11, 19, 8, 3, 28) + 982, r[0]); check('utc Z', ms(2026, 11, 19, 8, 3, 28) + 982, r[1]); check('utc +01', ms(2026, 11, 19, 7, 3, 28), r[2])
check('mayor time', ms(2026, 5, 3, 3, 15), r[3]); check('mayor time no tz', ms(2026, 11, 20, 15, 15), r[4])
check('news date', ms(2026, 11, 17), r[5]); check('news date 1st', ms(2026, 7, 1), r[6]); check('news invalid', None, r[7])
check('Late Spring 27 / Jahr 526 = Amtsantritt laut SkyCofl', ms(2026, 11, 15, 11, 15), r[8])
check('sbDate year', 526.0, float(r[9]['year'])); check('sbDate month', 2.0, float(r[9]['month'])); check('sbDate day', 27.0, float(r[9]['day']))
check('sbDate epoch', 1.0, float(r[10]['day']))

# Ereignis- und Amtszeit-Renditen
r = node("""const d=86400000, b=Date.UTC(2026,0,1), t=[], v=[]; for(let i=0;i<40;i++){t.push(b+i*d); v.push(100+i);}
  const ev=E.eventReturns(t,v,b+10*d+5*3600e3,[1,3,7,60]); const ew=E.eventReturns(t,v,b+10*d,[1,3,7],3);
  const tr=E.termReturns(t,v,[{name:'A',start:b+20*d+11*3600e3,end:b+25*d+15*3600e3},{name:'B',start:b+38*d,end:b+43*d}]);
  return {ev, ew, tr, g:E.groupBy([{n:'x',r:.1},{n:'x',r:-.3},{n:'y',r:null}],'n','r')};""")
check('event d1', 111 / 109 - 1, r['ev']['d1']); check('event d7', 117 / 109 - 1, r['ev']['d7']); check('event future', None, r['ev']['d60'])
check('event window pre=107..109, d7 post=115..117', 116/108 - 1, r['ew']['d7']); check('event window d1 single', 111/108 - 1, r['ew']['d1']); check('event window d3', 112/108 - 1, r['ew']['d3'])
# Amtszeit A: volle Tage 21..24 (Werte 121..124), davor Tage 15..19 (115..119)
check('term ret', (122.5) / (117) - 1, r['tr'][0]['ret']); check('term incomplete skipped', 1.0, float(len(r['tr'])))
check('group mean', -0.1, r['g']['x']['mean']); check('group up share', .5, r['g']['x']['up'])

# Orderbuch
prod = {'sell_summary': [{'amount': 100, 'pricePerUnit': 9.9, 'orders': 2}, {'amount': 50, 'pricePerUnit': 9.5, 'orders': 1}],
        'buy_summary': [{'amount': 10, 'pricePerUnit': 10.1, 'orders': 1}, {'amount': 300, 'pricePerUnit': 10.5, 'orders': 3}]}
r = node(f"const b=E.book({json.dumps(prod)}); return {{b, w:E.walk(b.supply.map(x=>({{amount:x.amount,pricePerUnit:x.p}})),100)}};")
b = r['b']; check('mid', 10.0, b['mid']); check('spreadPct', .02, b['spreadPct']); check('cum demand', 150.0, float(b['demand'][1]['q']))
check('hhi', (100/150)**2 + (50/150)**2, b['d']['hhi']); check('depth2 supply', 10.0, float(b['depth2']['supply'])); check('imbalance', (150 - 310) / 460, b['imbalance'])
check('walk avg', (10 * 10.1 + 90 * 10.5) / 100, r['w']['avg'])

# Kaufen oder herstellen
r = node("""const P={A:10,B:3,C:null,D:1}; const R=new Map([['A',[[1,{B:2,D:3}]]],['B',[[2,{D:5}]]],['C',[[1,{A:1,B:1}]]],['X',[[1,{Y:1}]]]]);
  const f=id=>P[id]??null; return [E.makeOrBuy('A',f,R), E.makeOrBuy('C',f,R), E.makeOrBuy('X',f,R)];""")
check('craft A = 2*min(3, 5/2)+3', 8.0, r[0]['craft']); check('A how', 1.0, 1.0 if r[0]['how'] == 'craft' else 0.0)
check('C nur herstellbar', 10.5, r[1]['cost']); check('X nicht möglich', None, r[2]['cost'])

# Index-Kalender: nächste Events liegen in der Zukunft und sind sortiert
r = node("const n=Date.UTC(2026,10,19,12); return E.sbUpcoming(n,10);")
check('upcoming sorted', 1.0, 1.0 if all(r[i]['start'] <= r[i+1]['start'] for i in range(len(r)-1)) else 0.0)
check('upcoming future', 1.0, 1.0 if all((x['end'] if x['end'] != x['start'] else x['start']) > ms(2026, 11, 19, 12) for x in r) else 0.0)

# Marktpreis und Ausreißer-Filter
r = node("""return [E.bazaarPrice({buy:1795.1,sell:1272.2,buyMovingWeek:4909613,sellMovingWeek:23487610}), E.bazaarPrice({buy:null,sell:99}), E.bazaarPrice({buy:10,sell:8}),
  E.hampel([100,101,99,100,150,100,101,99,100]), E.hampel([100,101,102,103,104,105,106,107]), E.hampel([100,100,100,100,100.3,100,100])];""")
check('vwap', (4909613*1795.1+23487610*1272.2)/(4909613+23487610), r[0]); check('one side', 99.0, r[1]); check('no volume -> mid', 9.0, r[2])
check('hampel spike', 100.0, r[3][4]); check('hampel keeps rest', 101.0, r[3][1])
check('hampel keeps trend', 1.0, 1.0 if r[4] == [100,101,102,103,104,105,106,107] else 0.0); check('hampel floor keeps tiny noise', 100.3, r[5][4])
def hampel_ref(v, k=3, t=3, floor=.005):
    out = list(v)
    for i in range(len(v)):
        w = [v[j] for j in range(max(0, i-k), min(len(v), i+k+1))]
        if len(w) < k+1: continue
        m = float(np.median(w)); mad = 1.4826*float(np.median([abs(x-m) for x in w]))
        if abs(v[i]-m) > t*max(mad, floor*abs(m)): out[i] = m
    return out
for trial in range(10):
    v = [float(x) for x in 100*np.exp(np.cumsum(rng.normal(0, .02, 120)))]
    for _ in range(5): v[int(rng.integers(0, 120))] *= float(rng.choice([1.5, .6, 3]))
    r = node(f"return E.hampel({json.dumps(v)});"); ref = hampel_ref(v)
    for i in range(120): check(f'hampel {trial}/{i}', ref[i], r[i])

r = node("""const L=[{t:Date.UTC(2026,0,1),v:1},{t:Date.UTC(2026,0,5,2),v:5},{t:Date.UTC(2026,0,6,2),v:6}], R=[{t:Date.UTC(2026,0,4,12),v:40},{t:Date.UTC(2026,0,5,0),v:50},{t:Date.UTC(2026,0,5,10),v:51}];
  return E.mergeRecent(L,R,Date.UTC(2026,0,5)).map(p=>p.v);""")
check('mergeRecent', 1.0, 1.0 if r == [1, 50, 51] else 0.0)
# Spread-Statistik und Anteil-über-Schwelle
import datetime as _dt
pts = []; t0 = 1795000000000; rs = np.random.default_rng(11)
for i in range(84):
    b = 100 * (1 + .05 * math.sin(i / 7)) * (1 + rs.uniform(0, .01)); sp = rs.uniform(.01, .08); s_ = b / (1 + sp)
    pts.append({'timestamp': _dt.datetime.fromtimestamp((t0 + i * 2 * 3600e3) / 1000, _dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S'),
                'buy': b, 'sell': s_, 'maxBuy': b * 1.02, 'minBuy': b * .99, 'maxSell': s_ * 1.01, 'minSell': s_ * .98, 'buyMovingWeek': 1000 + i, 'sellMovingWeek': 2000})
r = node(f"const st = E.spreadStats({json.dumps(pts)}, [], {t0 + 84 * 2 * 3600e3}); return {{st, a: [E.shareAbove(st.sq, 0.0), E.shareAbove(st.sq, 1), E.shareAbove(st.sq, st.sq[10]), E.shareAbove(st.sq, (st.sq[4] + st.sq[5]) / 2)]}};")
st = r['st']; sp = np.array([p['buy'] / p['sell'] - 1 for p in pts])
sig5 = lambda x: float(f'{x:.5g}')
for k in range(21): check(f'sq{k}', sig5(np.quantile(sp, k / 20)), st['sq'][k])
check('am', sig5(np.median([p['buy'] for p in pts])), st['am']); check('bm', sig5(np.median([p['sell'] for p in pts])), st['bm'])
check('ra', sig5(np.median([(p['maxBuy'] - p['minBuy']) / p['buy'] for p in pts])), st['ra'])
mid = [(p['buy'] + p['sell']) / 2 for p in pts]; t = [t0 + i * 2 * 3600e3 for i in range(84)]
first = [m for m, x in zip(mid, t) if x < t[0] + DAY]; last = [m for m, x in zip(mid, t) if x > t[-1] - DAY]
check('tr', sig5(np.mean(last) / np.mean(first) - 1), st['tr']); check('vt', sig5((1000 + 83 + 2000) / 3000 - 1), st['vt']); check('n', 84.0, float(st['n']))
check('shareAbove 0', 1.0, r['a'][0]); check('shareAbove 1', 0.0, r['a'][1]); check('shareAbove median', .5, r['a'][2]); check('shareAbove zwischen', 1 - 4.5 / 20, r['a'][3])
r = node("return E.spreadStats([{timestamp:'2026-01-01T00:00:00',buy:1,sell:1}], [], 0);"); check('zu wenige Punkte', None, r)

print(f"geprüft: {checks}, Fehler: {len(fails)}")
for f in fails: print('  ', f)
