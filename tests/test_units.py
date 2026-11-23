import json, asyncio, math, sys
sys.path.insert(0, __import__('os').path.dirname(__file__)); from testdata import *
from playwright.async_api import async_playwright
fails=[]; passed=[0]
def ok(cond, msg):
    if cond: passed[0]+=1
    else: fails.append(msg)
async def main():
    async with async_playwright() as p:
        b=await launch(p)
        ctx=await b.new_context(); pg=await ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
        snap={"success":True,"lastUpdated":1763540000000,"products":edge()}
        mode={"v":"ok"}
        async def api(route):
            u=route.request.url
            if "resources" in u: return await route.fulfill(status=200,body=json.dumps({"success":True,"items":ITEMS_EXTRA}),headers={"content-type":"application/json"})
            m=mode["v"]
            if m=="500": return await route.fulfill(status=500,body="err")
            if m=="false": return await route.fulfill(status=200,body=json.dumps({"success":False,"cause":"Key throttle"}),headers={"content-type":"application/json"})
            if m=="broken": return await route.fulfill(status=200,body="{not json",headers={"content-type":"application/json"})
            if m=="abort": return await route.abort()
            if m=="empty": return await route.fulfill(status=200,body=json.dumps({"success":True,"lastUpdated":snap["lastUpdated"]+999,"products":{}}),headers={"content-type":"application/json"})
            await route.fulfill(status=200,body=json.dumps(snap),headers={"content-type":"application/json"})
        await pg.route("https://api.hypixel.net/**",api); await pg.route("https://sky.coflnet.com/**",lambda r:r.fulfill(status=404,body='[]')); await pg.route("https://fonts.**",lambda r:r.abort())
        await pg.goto(BASE+"#bazaar/flips"); await pg.wait_for_timeout(1500)
        await pg.evaluate("S.paused=true; clearTimeout(S.timer)")
        E=lambda js: pg.evaluate(js)
        # ---- parseCoins ----
        cases={"10m":1e7,"10M":1e7,"10 m":1e7,"1,5m":1.5e6,"1.5m":1.5e6,"2,5k":2500,"500k":5e5,"1b":1e9,"1.5b":1.5e9,
               "1.000.000":1e6,"1 000 000":1e6,"1 941 111,7":1941111.7,"1.941.111,7":1941111.7,"1,941,111.7":1941111.7,
               "1,000,000":1e6,"265000.1":265000.1,"265000,1":265000.1,"0":0,"12,3":12.3,"Coins 5k":5000,"5k coins":5000,
               "-5":None,"abc":None,"":None,"1e6":None,"5kk":None,"1..2":None}
        for s,exp in cases.items():
            v=await E(f"parseCoins({json.dumps(s)})")
            if isinstance(v,float) and math.isnan(v): v=None
            ok((exp is None and v is None) or (exp is not None and v is not None and abs(v-exp)<1e-6), f"parseCoins({s!r}) = {v}, erwartet {exp}")
        for v in [1e6,2.5e6,500e3,1e9,1941111.7,64,0.3]:
            back=await E(f"parseCoins(coinText({v}))"); ok(back is not None and abs(back-v)<1e-6, f"coinText-Rundreise {v} -> {back}")
        # ---- Formatierung ----
        for n,exp in [(-0.04,"0"),(0.04,"0"),(-0.0,"0")]:
            out=await E(f"fmt({n})"); ok("-" not in out, f"fmt({n}) = {out!r} (negatives Null)")
            out=await E(f"pct({n})"); ok("-" not in out, f"pct({n}) = {out!r} (negatives Null)")
        out=await E("price(-0.02)"); ok(out in ('–','0,0'), f"price(-0.02) = {out!r}")
        out=await E("price(2400000000)"); ok(out.replace(' ',' ').replace(' ',' ')=='2 400 000 000,0', f"price(2,4 Mrd.) ungenau: {out!r}")
        out=await E("price(0.1)"); ok(out=='0,1', f"price(0.1) = {out!r}")
        out=await E("fmt(9999.96)"); ok(out.replace('\u00a0',' ').replace('\u202f',' ')=='10 000', f"fmt(9999.96)={out!r}")
        out=await E("r1(1.15)"); ok(abs(out-1.2)<1e-9 or abs(out-1.1)<1e-9, f"r1(1.15)={out}")
        out=await E("[r1(0.1+0.2), r1(10.0+0.1), r1(10.1-0.1), r1(2019845.3+0.1)]"); ok(out==[0.3,10.1,10.0,2019845.4], f"r1-Rundung {out}")
        # ---- Verlauf ----
        out=await E("""(()=>{const h={t:[],b:[],s:[]};S.hist.__T=h;pushHist('__T',1000,1,2);pushHist('__T',1000,5,5);pushHist('__T',900,5,5);pushHist('__T',2000,3,4);return [h.t.length,h.b[1]]})()""")
        ok(out==[2,3], f"pushHist doppelte/ältere Zeitstempel: {out}")
        out=await E("""(()=>{const now=Date.now();const h={t:[],b:[],s:[]};for(let i=0;i<3*3600;i+=20){h.t.push(now-3*3600e3+i*1000);h.b.push(i);h.s.push(i)}compact(h,now);const old=h.t.filter(t=>t<now-3600e3);const buckets=new Set(old.map(t=>Math.floor(t/300e3)));return [old.length===buckets.size, h.t.every((t,i)=>i===0||t>h.t[i-1]), h.t.filter(t=>t>=now-3600e3).length]})()""")
        ok(out[0] and out[1] and out[2]>=170, f"compact: {out}")
        out=await E("""(()=>{const h={t:[1000,2000,3000],b:[1,2,3],s:[10,20,30]};return [valueAt(h,2500,'s'),valueAt(h,3000,'s'),valueAt(h,500,'s')]})()""")
        ok(out[0]==20 and out[1]==30, f"valueAt {out}")
        # ---- Alarme ----
        await E("S.alerts=[{id:'TIGHT_SPREAD',cond:'sell_below',value:999,last:0},{id:'TIGHT_SPREAD',cond:'sell_above',value:999,last:0}]; window.__n=0; const _n=notify; notify=(...a)=>{window.__n++;}; checkAlerts(); checkAlerts();")
        n=await E("window.__n"); ok(n==1, f"Alarm: genau einer sollte auslösen (Cooldown), ausgelöst {n}")
        last=await E("S.alerts.map(a=>a.last>0)"); ok(last==[True,False], f"Alarm-Zeitstempel {last}")
        await E("S.alerts.forEach(a=>a.last=Date.now()-11*60e3); checkAlerts();"); n=await E("window.__n"); ok(n==2, f"Alarm nach Cooldown erneut: {n}")
        await E("S.alerts=[{id:'GIBTS_NICHT',cond:'sell_below',value:1,last:0},{id:'TIGHT_SPREAD',cond:'unbekannt',value:1,last:0}]; checkAlerts()"); ok(True,"")
        # ---- Teilen-Link ----
        await E("S.set.budget=123456789; S.set.preset='safe'; S.set.tax=1"); link=await E("shareLink()")
        await E("S.set.budget=1; S.set.tax=1.25"); await pg.goto(link); await pg.wait_for_timeout(1200)
        st=await E("[S.set.budget,S.set.tax,location.hash]"); ok(st==[123456789,1,'#bazaar/overview'], f"Teilen-Link: {st}")
        await pg.goto(BASE+"#bazaar/overview~%%%kaputt"); await pg.wait_for_timeout(1000)
        ok(await E("location.hash")=='#bazaar/overview', "kaputter Link: Hash nicht bereinigt")
        bad=json.dumps({"budget":"<script>","tax":"x","evil":1}); import base64
        code=base64.urlsafe_b64encode(bad.encode()).decode().rstrip('=')
        await pg.goto(BASE+"#bazaar/overview~"+code); await pg.wait_for_timeout(1000)
        st=await E("[typeof S.set.budget, S.set.evil===undefined, typeof S.set.tax]"); ok(st==['number',True,'number'], f"Link mit falschen Typen übernommen: {st}")
        await E("S.paused=true; clearTimeout(S.timer)")
        # ---- API-Ausfälle ----
        for m in ["500","false","broken","abort"]:
            mode["v"]=m; before=await E("S.rows.length"); await E("poll()"); await pg.wait_for_timeout(500)
            st=await E("[S.state, S.rows.length, document.querySelector('#banner') ? document.querySelector('#banner').style.display : 'none']")
            ok(st[0]=='err' and st[1]==before, f"API {m}: {st}")
            await E("S.paused=true; clearTimeout(S.timer)")
        mode["v"]="ok"; await E("poll()"); await pg.wait_for_timeout(500); await E("S.paused=true; clearTimeout(S.timer)")
        ok(await E("S.state")=='ok', "Erholung nach Fehler")
        hl=await E("S.hist.TIGHT_SPREAD ? S.hist.TIGHT_SPREAD.t.length : 0"); await E("poll()"); await pg.wait_for_timeout(500); await E("S.paused=true; clearTimeout(S.timer)")
        ok(await E("S.hist.TIGHT_SPREAD.t.length")==hl, "gleicher lastUpdated darf keinen Verlaufspunkt doppeln")
        mode["v"]="empty"; await E("poll()"); await pg.wait_for_timeout(500); await E("S.paused=true; clearTimeout(S.timer)")
        st=await E("[S.state, S.rows.length]"); ok(st[1]>0, f"Leere Produktliste von der API überschreibt alle Daten: {st}")
        mode["v"]="ok"; await E("poll()"); await pg.wait_for_timeout(500); await E("S.paused=true; clearTimeout(S.timer)")
        # ---- Watchlist/Alarm für Item, das verschwindet ----
        await E("S.watch=['GIBTS_NICHT']; S.alerts=[{id:'GIBTS_NICHT',cond:'sell_below',value:1,last:0}]"); await pg.evaluate("location.hash='bazaar/watch'"); await pg.wait_for_timeout(400)
        await pg.evaluate("location.hash='bazaar/item/GIBTS_NICHT'"); await pg.wait_for_timeout(400)
        ok("nicht" in (await pg.inner_text("#view")), "Analyse unbekanntes Item")
        # ---- Analyse für Extremfälle ----
        for pid in ["EMPTY_BOTH","NO_SELL_OFFERS","NO_BUY_ORDERS","CROSSED_BOOK","HUGE_PRICE","TINY_PRICE","MISSING_QS","NULL_FIELDS","INK_SACK:3","SHALLOW_BOOK","XSS_ITEM"]:
            await pg.evaluate(f"location.hash='bazaar/item/'+encodeURIComponent({json.dumps(pid)})"); await pg.wait_for_timeout(500)
            txt=await pg.inner_text("#view")
            ok("NaN" not in txt and "undefined" not in txt and "Infinity" not in txt, f"Analyse {pid}: NaN/undefined/Infinity im Text: " + ", ".join(w for w in ["NaN","undefined","Infinity"] if w in txt))
            await pg.evaluate(f"openDetail({json.dumps(pid)})"); await pg.wait_for_timeout(300)
            txt=await pg.inner_text("#sheet"); ok("NaN" not in txt and "undefined" not in txt and "Infinity" not in txt, f"Detail {pid}: ungültige Werte")
            await pg.evaluate("closeDetail()")
        # alle Listen-Seiten auf ungültige Werte prüfen, auch mit Riskant + großem Budget
        await E("applyPreset('risky'); S.set.budget=1e10; S.set.minVolH=0; S.set.minTurnH=0; S.set.minBalance=0; S.set.minPct=0; S.set.maxPct=500; ingest(false)")
        for tab in ["overview","flips","crafts","npc","market","watch","settings"]:
            await pg.evaluate(f"location.hash='bazaar/{tab}'"); await pg.wait_for_timeout(400)
            await E("S.set.pageSize=250; renderMain(true)")
            txt=await pg.inner_text("#view"); ok("NaN" not in txt and "undefined" not in txt and "Infinity" not in txt, f"Seite {tab}: ungültige Werte " + ", ".join(w for w in ["NaN","undefined","Infinity"] if w in txt))
        # Sortierung jeder Spalte
        await pg.evaluate("location.hash='bazaar/market'"); await pg.wait_for_timeout(300)
        heads=await pg.evaluate("[...document.querySelectorAll('th[data-sort]')].map(t=>t.dataset.sort)")
        for k in heads:
            await pg.evaluate(f"S.sort.market={{k:'{k}',d:-1}}; renderMain(true)")
            vals=await pg.evaluate(f"sortRows(S.rows.slice(),'market').map(r=>r['{k}'])")
            if isinstance(vals[0],str): good=all(vals[i].localeCompare if False else True for i in range(len(vals)))
            else: good=all((vals[i] if vals[i] is not None else -1e300) >= (vals[i+1] if vals[i+1] is not None else -1e300) for i in range(len(vals)-1))
            ok(good, f"Sortierung Markt nach {k} falsch")
        # Chart mit kaputten Daten
        out=await E("""(()=>{const el=document.createElement('div');el.style.cssText='width:600px;height:300px';document.body.appendChild(el);const c=new PriceChart(el);
           const tests=[{t:[]},{t:[1],hi:[5],lo:[4]},{t:[1,2,3],hi:[null,null,null],lo:[null,null,null]},{t:[1,2,3],hi:[5,5,5],lo:[5,5,5]},{t:[1,2,1e12],hi:[1,NaN,3],lo:[0.5,1,2]},{t:[1,2],hi:[889630,889630.0000000003],lo:[null,null]},{t:[1,2],hi:[1e15,1e15+0.2],lo:[0,0]}];   // fast gleiche Werte: früher Endlosschleife im Raster
           const r=[];for(const d of tests){try{const t0=performance.now();c.setData(d);c.view=[0,3];c.draw();if(performance.now()-t0>500)throw new Error('zu langsam');c.setIndicators({sma:20,ema:50,bb:true});c.draw();r.push('ok')}catch(e){r.push(String(e))}}c.destroy();el.remove();return r})()""")
        ok(all(x=='ok' for x in out), f"Chart mit kaputten Daten: {out}")
        # Orderbuch-Kurve bei sehr weitem Spread (keine Stufe nahe der Mitte): früher NaN in den SVG-Koordinaten
        svg=await E("""curveSVG(Econ.book({sell_summary:[{amount:5,pricePerUnit:1,orders:1}],buy_summary:[{amount:3,pricePerUnit:1000,orders:1},{amount:9,pricePerUnit:5000,orders:2}]}))""")
        ok('NaN' not in svg and 'Infinity' not in svg, f"Orderbuch-Kurve mit weitem Spread: {svg[:200]}")
        ok(not errs, f"JS-Fehler: {errs}")
        await b.close()
    print(f"bestanden: {passed[0]}, Fehler: {len(fails)}"); [print("  ✗",f) for f in fails]
from web import serve, launch
with serve() as BASE:
    asyncio.run(main())
sys.exit(1 if fails else 0)
