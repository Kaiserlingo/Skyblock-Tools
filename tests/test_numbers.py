import json, asyncio, math, sys, itertools, random
sys.path.insert(0, __import__('os').path.dirname(__file__))
from oracle import *
from testdata import *
from playwright.async_api import async_playwright
RECIPES=json.load(open(__import__('os').path.join(__import__('os').path.dirname(__file__), '..', 'data', 'recipes.json')))
fails=[]
def close(a,b,tol=1e-7):
    if a is None or b is None: return a==b
    if isinstance(a,bool) or isinstance(b,bool): return a==b
    if math.isinf(a) or math.isinf(b): return a==b
    return abs(a-b) <= tol*max(1,abs(a),abs(b))
def check(tag, js, py, keys):
    for k in keys:
        if not close(js.get(k), py.get(k)): fails.append(f"{tag} {k}: JS={js.get(k)} PY={py.get(k)}")
def make_stats(snap, seed):
    # Verlauf für ~80 % der Items; Spread-Quantile rund um den aktuellen Spread (mal kleiner, mal größer)
    rnd=random.Random(seed); out={}
    for pid,p in snap['products'].items():
        if rnd.random()<0.2: continue
        q=p.get('quick_status') or {}
        bp,sp=q.get('buyPrice') or 0,q.get('sellPrice') or 0
        base=(bp/sp-1) if bp>0 and sp>0 else rnd.uniform(0.01,0.3)
        med=max(1e-4,base*rnd.choice([0.2,0.5,0.9,1,1.3,3]))
        sq=sorted(round(med*math.exp(rnd.gauss(0,0.6)),6) for _ in range(21)); sq[10]=med; sq=sorted(sq)
        e={'sq':sq,'am':(bp*rnd.uniform(0.7,1.4)) if bp and rnd.random()<0.95 else None,'bm':(sp*rnd.uniform(0.7,1.4)) if sp and rnd.random()<0.95 else None,
           'ra':rnd.uniform(0,0.2),'rb':rnd.uniform(0,0.2),'tr':rnd.choice([None,rnd.uniform(-0.4,0.3)]),'vt':rnd.choice([None,rnd.uniform(-0.7,0.6)]),'s30':med,'n':84}
        if rnd.random()<0.03: e['sq']=None
        out[pid]=e
    return {'v':1,'built':0,'items':out}
async def setup(pg, snap, items, stats=None):
    async def api(route):
        u=route.request.url
        await route.fulfill(status=200,body=json.dumps(items if "resources" in u else snap),headers={"content-type":"application/json","access-control-allow-origin":"*"})
    await pg.route("https://api.hypixel.net/**",api); await pg.route("https://sky.coflnet.com/**",lambda r:r.fulfill(status=404,body='[]'))
    await pg.route("https://fonts.**",lambda r:r.abort())
    async def raw(route):
        if stats is not None and 'bazaar_stats' in route.request.url:
            await route.fulfill(status=200,body=json.dumps(stats),headers={"content-type":"application/json","access-control-allow-origin":"*"})
        else: await route.fulfill(status=404,body='')
    await pg.route("https://raw.githubusercontent.com/**",raw)
DUMP="""(()=>{const o={};for(const r of S.rows){o[r.id]={topBuy:r.topBuy,topSell:r.topSell,buyAt:r.buyAt,sellAt:r.sellAt,profit:r.profit,marginPct:r.marginPct,perHour:r.perHour,turnH:r.turnH,balance:r.balance,maxQty:r.maxQty,qty:r.qty,pph:r.pph,dev:r.dev,sNow:r.sNow,sRatio:r.sRatio,okShare:r.okShare,askDev:r.askDev,bidDev:r.bidDev,profitTyp:r.profitTyp,pphTyp:r.pphTyp,npcOrder:r.npcOrder,npcInsta:r.npcInsta,npcTotal:r.npcTotal,risky:r.risk.length>0}}
 const c={};for(const x of S.crafts){c[x.ri]={cost:x.cost,revenue:x.revenue,profit:x.profit,marginPct:x.marginPct,fastProfit:x.fastProfit,craftsH:x.craftsH,qty:x.qty,pph:x.pph,liquid:x.allLiquid,risky:x.risk.length>0}}
 return {rows:o,crafts:c,flips:filteredFlips(true).map(r=>r.id).sort(),cf:filteredCrafts(true).map(c=>c.ri).sort((a,b)=>a-b)}})()"""
async def run(name, snap, items, stats):
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-proxy-server"])
        pg=await b.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
        await setup(pg, snap, items, stats)
        await pg.goto("http://localhost:8765/#bazaar/flips"); await pg.wait_for_timeout(1500)
        await pg.evaluate("S.paused=true; clearTimeout(S.timer)")
        npc={i['id']:i['npc_sell_price'] for i in items['items'] if i.get('npc_sell_price')}
        combos=0
        for preset, budget, tax, share, cb, cs, hide, mc, sr, ok in itertools.product(['safe','balanced','risky'],[1e6,10e6,1e9],[1.25,1.0],[1,10,50],['order','insta'],['offer','insta'],[True,False],[1,5,60],[None,1.2,4,1000],[None,0,80]):
            if (sr,ok)!=(None,None) and (cb,cs,budget,share,mc)!=('order','offer',10e6,10,5): continue
            if (cb,cs)!=('order','offer') and (budget,share,hide)!=(10e6,10,True): continue
            if mc!=5 and (preset,tax,hide)!=('balanced',1.25,True): continue
            await pg.evaluate(f"applyPreset('{preset}'); Object.assign(S.set,{{budget:{budget},tax:{tax},share:{share},minCycle:{mc},craftBuy:'{cb}',craftSell:'{cs}',hideRisky:{'true' if hide else 'false'}{''.join(f",{k}:{v}" for k,v in [('maxSpreadRatio',sr),('minOkShare',ok)] if v is not None)}}}); ingest(false)")
            st=await pg.evaluate("S.set"); js=await pg.evaluate(DUMP)
            rows={pid:item(pid,pr,st,npc,SITEMS) for pid,pr in snap['products'].items()}
            tag=f"[{name} {preset} B={budget:g} T={tax} A={share} M={mc} {cb}/{cs} hide={hide}]"
            for pid,r in rows.items():
                if pid not in js['rows']: fails.append(f"{tag} fehlt {pid}"); continue
                check(f"{tag} {pid}", js['rows'][pid], r, ['topBuy','topSell','buyAt','sellAt','profit','marginPct','perHour','turnH','balance','maxQty','qty','pph','dev','npcOrder','npcInsta','npcTotal','risky','sNow','sRatio','okShare','askDev','bidDev','profitTyp','pphTyp'])
            FL=flips(rows,st,LOADED)
            if js['flips']!=FL: fails.append(f"{tag} Flip-Liste: JS-only={set(js['flips'])-set(FL)} PY-only={set(FL)-set(js['flips'])}")
            cr=crafts(rows,RECIPES,st)
            if set(map(int,js['crafts']))!=set(cr): fails.append(f"{tag} Craft-Menge JS={len(js['crafts'])} PY={len(cr)}")
            for ri,c in cr.items():
                if str(ri) in js['crafts']: check(f"{tag} craft{ri}", js['crafts'][str(ri)], c, ['cost','revenue','profit','marginPct','fastProfit','craftsH','qty','pph','liquid','risky'])
            if js['cf']!=crafts_filtered(rows,cr,st): fails.append(f"{tag} Craft-Filter JS={js['cf']} PY={crafts_filtered(rows,cr,st)}")
            combos+=1
        # Flip-Rechner
        await pg.evaluate("applyPreset('balanced'); Object.assign(S.set,{budget:10e6,tax:1.25,share:10,minCycle:5}); ingest(false)")
        st=await pg.evaluate("S.set"); rows={pid:item(pid,pr,st,npc) for pid,pr in snap['products'].items()}
        n=0
        for pid,pr in snap['products'].items():
            r=rows[pid]
            if not (r['topBuy'] and r['topSell']): continue
            for q in [1,64,1000,71680,250000]:
                for bm,sm in [('order','offer'),('order','insta'),('insta','offer'),('insta','insta')]:
                    js=await pg.evaluate(f"(()=>{{calcPrefs.mode='qty';calcPrefs.qty={q};calcState.buyPx=null;calcState.sellPx=null;const c=flipCalc(S.byId[{json.dumps(pid)}],'{bm}','{sm}');return {{cost:c.cost,gross:c.gross,profit:c.profit,tReal:c.tReal,qty:c.qty,pph:c.pph}}}})()")
                    py=flipcalc(r,pr,st,bm,sm,q)
                    check(f"[{name} Rechner {pid} q={q} {bm}/{sm}]", js, py, ['cost','gross','profit','tReal','pph']); n+=1
            # Konsistenz: Flip-Rechner mit Standardwerten = Profit pro Stunde der Tabelle
            if r['maxQty']>=1 and r['profit']>0:
                js=await pg.evaluate(f"(()=>{{calcPrefs.mode='qty';calcPrefs.qty=S.byId[{json.dumps(pid)}].maxQty;calcState.buyPx=null;calcState.sellPx=null;const c=flipCalc(S.byId[{json.dumps(pid)}],'order','offer');return [c.pph,S.byId[{json.dumps(pid)}].pph]}})()")
                if not close(js[0] or 0, js[1] or 0): fails.append(f"[{name} Konsistenz {pid}] Rechner {js[0]} != Tabelle {js[1]}")
            # Budget-Modus
            for bm in ['order','insta']:
                js=await pg.evaluate(f"(()=>{{calcPrefs.mode='budget';calcPrefs.budget=5e6;const c=flipCalc(S.byId[{json.dumps(pid)}],'{bm}','offer');return {{qty:c.qty,cost:c.cost}}}})()")
                exp = walk(pr['buy_summary'],coins=5e6)[0] if bm=='insta' else math.floor(5e6/jsround1(r['topBuy']+0.1))
                if js['qty']!=exp: fails.append(f"[{name} Budget {pid} {bm}] qty JS={js['qty']} PY={exp}")
                if js['cost']>5e6+1e-6: fails.append(f"[{name} Budget {pid} {bm}] Kosten {js['cost']} > Budget")
        xss=await pg.evaluate("window.__xss||0")
        await b.close()
        return combos, n, errs, xss
async def main():
    global SITEMS, LOADED
    for name, P, withstats in [("realistisch", realistic(), True), ("extrem", edge(), True), ("ohne Verlauf", realistic(), False)]:
        snap={"success":True,"lastUpdated":1763540000000,"products":P}
        items={"success":True,"items":ITEMS_EXTRA}
        stats=make_stats(snap, 7) if withstats else None
        SITEMS=stats['items'] if stats else {}; LOADED=bool(stats)
        combos,n,errs,xss=await run(name,snap,items,stats)
        print(f"{name}: {combos} Einstellungs-Kombinationen, {n} Rechner-Fälle, Seitenfehler={errs}, XSS ausgeführt={bool(xss)}")
    print("FEHLER:",len(fails)); [print(" ",f) for f in fails[:40]]
asyncio.run(main())
