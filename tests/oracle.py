"""Unabhängige Nachrechnung aller Kennzahlen des Bazaar Flippers.
Bewusst NICHT aus dem Website-Code (js/bazaar/) abgeleitet, sondern aus den Regeln:
  - Buy-Order = höchste Buy-Order + 0,1 ; Sell-Offer = niedrigste Sell-Offer − 0,1
  - Steuer nur auf Verkäufe ; Buy-Orders füllen sich durch Instasells, Sell-Offers durch Instabuys
  - max. 71.680 Stück pro Order
"""
import math
MAX_ORDER = 71680

def jsround1(x):           # Math.round(x*10)/10 wie in JavaScript (halbe Werte nach oben)
    return math.floor(x * 10 + 0.5) / 10

def per_hour_cycle(Q, a, b, st):
    # Durchlauf: Q kaufen (Rate a), dann Q verkaufen (Rate b); None = sofort; mindestens minCycle Minuten
    if not Q or Q <= 0: return 0
    T = 0.0
    for rate in (a, b):
        if rate is None: continue
        T += Q / rate if rate > 0 else math.inf
    Tu = max(T, st['minCycle'] / 60)
    return Q / Tu if math.isfinite(Tu) and Tu > 0 else 0

def share_above(sq, x):
    # Anteil der Zeit mit Spread >= x; sq = 21 Quantile (0 %, 5 %, …, 100 %), linear dazwischen
    if not sq or len(sq) != 21 or x is None or not math.isfinite(x): return None
    if x <= sq[0]: return 1.0
    if x > sq[20]: return 0.0
    for k in range(20):
        a, b = sq[k], sq[k + 1]
        if x <= b:
            f = (x - a) / (b - a) if b > a else 1.0
            return 1 - (k + f) / 20
    return 0.0

def history(d, qs, stat, st):
    """Verlässlichkeit aus dem 7-Tage-Verlauf. d = bisherige Kennzahlen, qs = quick_status, stat = bazaar_stats-Eintrag."""
    out = dict(sNow=None, sMed=None, sRatio=None, okShare=None, askDev=None, bidDev=None, profitTyp=d['profit'], pphTyp=d['pph'], hasStat=bool(stat), extraRisk=False)
    bp, sp = qs.get('buyPrice') or 0, qs.get('sellPrice') or 0
    if not (bp > 0 and sp > 0): out['hasStat'] = bool(stat); return out
    out['sNow'] = s_now = bp / sp - 1
    if not stat or not stat.get('sq'): return out
    tax = st['tax'] / 100
    s_med = stat['sq'][10]; out['sMed'] = s_med
    ratio = s_now / s_med if s_med and s_med > 0 else None; out['sRatio'] = ratio
    buy_at, sell_at = d['buyAt'], d['sellAt']
    own = sell_at / buy_at - 1 if (buy_at > 0 and sell_at > 0) else None
    k = own / s_now if (own is not None and s_now > 0 and own > 0) else 1
    out['okShare'] = share_above(stat['sq'], tax / (1 - tax) / k)
    ask = bp / stat['am'] - 1 if stat.get('am') and stat['am'] > 0 else None
    bid = sp / stat['bm'] - 1 if stat.get('bm') and stat['bm'] > 0 else None
    out['askDev'], out['bidDev'] = ask, bid
    if buy_at > 0 and sell_at > 0 and ratio is not None:
        typ = min(d['profit'], buy_at * (1 + own / max(ratio, 1)) * (1 - tax) - buy_at)
        out['profitTyp'] = typ; out['pphTyp'] = typ * d['qty'] if typ > 0 else 0
    tr, vt = stat.get('tr'), stat.get('vt')
    T = d['maxQty'] / d['qty'] if d['qty'] > 0 else 0
    drift = -tr / 144 * T * sell_at if (tr is not None and tr < 0 and T > 0) else None
    out['extraRisk'] = ((ratio is not None and ratio > 3 and s_now > 0.01) or (ask is not None and ask > 0.25) or (bid is not None and bid < -0.25)
                        or (tr is not None and tr < -0.2) or (vt is not None and vt < -0.4) or (drift is not None and d['profit'] > 0 and drift > d['profit']))
    return out

def spread_ok(r, st, loaded):
    if not loaded: return True
    if st['maxSpreadRatio'] >= 1000 and not st['minOkShare'] > 0: return True
    if not r['hasStat']: return False
    if st['maxSpreadRatio'] < 1000 and (r['sRatio'] is None or r['sRatio'] > st['maxSpreadRatio']): return False
    if st['minOkShare'] > 0 and (r['okShare'] is None or r['okShare'] * 100 < st['minOkShare']): return False
    return True

def item(pid, p, st, npc_map, stats=None):
    qs = p.get('quick_status') or {}
    ss, bs = p.get('sell_summary') or [], p.get('buy_summary') or []
    top_buy = ss[0]['pricePerUnit'] if ss else 0
    top_sell = bs[0]['pricePerUnit'] if bs else 0
    buy_at = jsround1(top_buy + 0.1) if top_buy else 0
    sell_at = jsround1(top_sell - 0.1) if top_sell else 0
    tax = st['tax'] / 100
    profit = sell_at * (1 - tax) - buy_at if (buy_at and sell_at) else 0
    margin = profit / buy_at * 100 if buy_at else 0
    w_buy, w_sell = qs.get('buyMovingWeek') or 0, qs.get('sellMovingWeek') or 0
    per_h = min(w_buy, w_sell) / 168
    mid = (top_buy + top_sell) / 2 if (top_buy and top_sell) else (top_buy or top_sell)
    turn_h = per_h * mid
    bal = min(w_buy, w_sell) / max(w_buy, w_sell) * 100 if max(w_buy, w_sell) else 0
    max_qty = min(MAX_ORDER, math.floor(st['budget'] / buy_at)) if buy_at else 0
    a, b = w_sell / 168 * st['share'] / 100, w_buy / 168 * st['share'] / 100
    qty = per_hour_cycle(max_qty, a, b, st)
    pph = profit * qty if profit > 0 else 0
    dev_s = abs(top_sell - qs['buyPrice']) / qs['buyPrice'] * 100 if qs.get('buyPrice') and top_sell else 0
    dev_b = abs(top_buy - qs['sellPrice']) / qs['sellPrice'] * 100 if qs.get('sellPrice') and top_buy else 0
    dev = max(dev_s, dev_b)
    npc = npc_map.get(pid, 0)
    npc_order = npc - buy_at if (npc and buy_at) else 0
    npc_insta = npc - top_sell if (npc and top_sell) else 0
    npc_qty = per_hour_cycle(max_qty, a, None, st) * 24 if npc_order > 0 else 0
    risk = (dev > 25) or (per_h < 5) or (margin > 100)
    d = dict(topBuy=top_buy, topSell=top_sell, buyAt=buy_at, sellAt=sell_at, profit=profit, marginPct=margin,
                perHour=per_h, turnH=turn_h, balance=bal, maxQty=max_qty, qty=qty, pph=pph, dev=dev,
                npcOrder=npc_order, npcInsta=npc_insta, npcTotal=npc_order * npc_qty if npc_order > 0 else 0,
                wBuy=w_buy, wSell=w_sell, risky=risk)
    h = history(d, qs, (stats or {}).get(pid), st)
    d.update(h); d['risky'] = risk or h['extraRisk']
    return d

def liquid(r, st):
    return r['topBuy'] > 0 and r['topSell'] > 0 and r['perHour'] >= st['minVolH'] and r['turnH'] >= st['minTurnH'] and r['balance'] >= st['minBalance']

def stable(r, st):
    return st['maxDev'] >= 1000 or r['dev'] <= st['maxDev']

def flips(rows, st, loaded=False):
    return sorted(pid for pid, r in rows.items()
                  if r['profit'] >= st['minProfit'] and r['marginPct'] >= st['minPct'] and r['marginPct'] <= st['maxPct']
                  and liquid(r, st) and stable(r, st) and spread_ok(r, st, loaded) and r['buyAt'] > 0 and r['buyAt'] <= st['budget']
                  and (not st['hideRisky'] or not r['risky']))

def crafts(rows, recipes, st):
    tax, share, out = st['tax'] / 100, st['share'] / 100, {}
    for ri, (oid, cnt, ins) in enumerate(recipes):
        o = rows.get(oid)
        if not o or not o['topBuy'] or not o['topSell']: continue
        ok, cost, cost_i = True, 0.0, 0.0
        all_liq = liquid(o, st)
        out_rate = (o['wBuy'] if st['craftSell'] == 'offer' else o['wSell']) / 168 / cnt
        crafts_h, in_rate = out_rate, math.inf
        risky = o['risky']
        for iid, q in ins.items():
            r = rows.get(iid)
            if not r or not r['topBuy'] or not r['topSell']: ok = False; break
            unit = r['topSell'] if st['craftBuy'] == 'insta' else r['buyAt']
            cost += unit * q; cost_i += r['topSell'] * q
            rate = (r['wBuy'] if st['craftBuy'] == 'insta' else r['wSell']) / 168 / q
            crafts_h = min(crafts_h, rate); in_rate = min(in_rate, rate)
            if not liquid(r, st): all_liq = False
            risky = risky or r['risky']
        if not ok or cost <= 0: continue
        sell_unit = o['sellAt'] if st['craftSell'] == 'offer' else o['topBuy']
        revenue = sell_unit * cnt * (1 - tax)
        profit = revenue - cost
        q_max = math.floor(st['budget'] / cost)
        qty = min(per_hour_cycle(q_max, None if st['craftBuy'] == 'insta' else in_rate * share,
                                 None if st['craftSell'] == 'insta' else out_rate * share, st), crafts_h * share)
        out[ri] = dict(cost=cost, revenue=revenue, profit=profit, marginPct=profit / cost * 100,
                       fastProfit=o['topBuy'] * cnt * (1 - tax) - cost_i, craftsH=crafts_h, qty=qty,
                       pph=profit * qty if profit > 0 else 0, liquid=all_liq, risky=risky, id=oid)
    return out

def crafts_filtered(rows, cr, st):
    return sorted(ri for ri, c in cr.items() if c['liquid'] and stable(rows[c['id']], st) and c['profit'] >= st['craftMinProfit']
                  and c['marginPct'] >= st['craftMinPct'] and c['marginPct'] <= st['maxPct'] and c['cost'] <= st['budget']
                  and (not st['hideRisky'] or not c['risky']))

def walk(levels, qty=math.inf, coins=math.inf):
    left, money, filled, cost, last = qty, coins, 0, 0.0, None
    for l in levels or []:
        if left <= 0 or money <= 0: break
        take = min(left, l['amount'])
        if coins != math.inf: take = min(take, math.floor(money / l['pricePerUnit']))
        if take <= 0: last = l['pricePerUnit']; break
        filled += take; cost += take * l['pricePerUnit']; left -= take; money -= take * l['pricePerUnit']; last = l['pricePerUnit']
    return filled, cost, last

def flipcalc(r, p, st, buy, sell, qty):
    tax, share = st['tax'] / 100, st['share'] / 100
    if buy == 'insta':
        f, c, last = walk(p['buy_summary'], qty=qty); cost = c + (qty - f) * (last or r['topSell'])
    else: cost = qty * jsround1(r['topBuy'] + 0.1)
    if sell == 'insta':
        f, g, last = walk(p['sell_summary'], qty=qty); gross = g + (qty - f) * (last or r['topBuy'])
    else: gross = qty * jsround1(r['topSell'] - 0.1)
    profit = gross * (1 - tax) - cost
    ih, bh = r['wSell'] / 168, r['wBuy'] / 168
    tb = 0 if buy == 'insta' else (qty / (ih * share) if ih else math.inf)
    ts = 0 if sell == 'insta' else (qty / (bh * share) if bh else math.inf)
    t = tb + ts; tu = max(t, st['minCycle'] / 60) if qty > 0 else 0
    return dict(cost=cost, gross=gross, profit=profit, tReal=t, pph=profit / tu if (tu > 0 and math.isfinite(tu)) else None)
