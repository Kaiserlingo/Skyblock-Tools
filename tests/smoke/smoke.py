"""Rauchtest: öffnet jede Seite mit Testdaten (keine echten APIs) und prüft auf Fehler.

    python3 tests/smoke/smoke.py            # hell
    CS=dark python3 tests/smoke/smoke.py    # dunkel
    AUDIT=1 python3 tests/smoke/smoke.py    # zusätzlich: nichts darf in 7 Breiten seitlich überstehen

Screenshots landen in tests/smoke/out/. Exit-Code 1 bei Seitenfehlern, kaputten Zahlen oder Überstand.
"""
import asyncio, json, math, random, time, sys, os
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
from web import serve, launch
OUT = os.path.join(HERE, 'out'); os.makedirs(OUT, exist_ok=True)
PROBLEMS = []
def icon_png(seed):
    """Kleines, je Item verschiedenes 16×16-Bild als PNG (ohne Zusatzpakete)."""
    import hashlib, struct, zlib
    h = hashlib.md5(seed.encode()).digest(); rows = b''
    for y in range(16):
        rows += b'\x00'
        for x in range(16):
            on = 3 <= x < 13 and 3 <= y < 13 and (x * y + h[0]) % 5
            rows += bytes((h[1], h[2], h[3], 255) if on else (0, 0, 0, 0))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 16, 16, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')
md = json.load(open(os.path.join(os.path.dirname(HERE), 'fixtures', 'market.json')))
now = int(time.time()*1000); DAY=86400000
ids = list(md['items'].keys())
random.seed(1)
products = {}
for i in ids:
    p = md['items'][i]['p'] or 100
    products[i] = {'product_id': i, 'quick_status': {'productId': i, 'buyPrice': p*1.02, 'sellPrice': p, 'buyMovingWeek': 500000, 'sellMovingWeek': 600000, 'buyVolume': 10000, 'sellVolume': 20000, 'buyOrders': 50, 'sellOrders': 40},
        'sell_summary': [{'amount': 100*(k+1), 'pricePerUnit': round(p*(1-0.01*k),1), 'orders': 1+k} for k in range(10)],
        'buy_summary': [{'amount': 120*(k+1), 'pricePerUnit': round(p*1.02*(1+0.01*k),1), 'orders': 1+k} for k in range(10)]}
bz = {'success': True, 'lastUpdated': now, 'products': products}
items = {'success': True, 'items': [{'id': i, 'name': md['items'][i]['n'] or i, 'tier': 'RARE', 'npc_sell_price': 5} for i in ids] + [{'id': 'HYPERION', 'name': 'Hyperion', 'tier': 'LEGENDARY', 'category': 'SWORD'}]}
cat = [{'tag': i, 'name': md['items'][i]['n'], 'flags': 'BAZAAR'} for i in ids] + [{'tag': 'HYPERION', 'name': 'Hyperion', 'flags': 'AUCTION'}, {'tag': 'SOULBOUND_X', 'name': 'Soul X', 'flags': 'NONE'}]
def bzhist(start, end):
    out=[]; t=start; p=100
    while t < end:
        p*=math.exp(random.gauss(0,.03)); out.append({'buy':p*1.02,'sell':p,'buyMovingWeek':5e5*(1+random.random()),'sellMovingWeek':6e5,'buyVolume':1e4,'sellVolume':2e4,'timestamp':time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(t/1000))}); t+= max((end-start)//300, 3600000)
    return out
def ahhist(n, step):
    out=[]; p=1e9
    for k in range(n):
        p*=math.exp(random.gauss(0,.03)); out.append({'min':p*.8,'max':p*1.5,'avg':p,'volume':random.randint(0,20),'time':time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime((now-(n-k)*step)/1000))})
    return out
sold = [{'highestBidAmount': 9e8+random.random()*2e8, 'startingBid': 1, 'end': time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime((now-k*3600000)/1000)), 'auctioneerId': 'a%d'%(k%7), 'enchantments': '[]' if k%2 else '[{"type":"x"}]', 'reforge': None, 'count': 1} for k in range(200)]
election = {'success': True, 'mayor': {'name': 'Marina', 'key':'fishing', 'perks':[{'name':'Fishing XP Buff','description':'§7Gain §3+50'}], 'minister': {'name':'Cole','perk':{'name':'Mining Fiesta','description':'x'}}, 'election': {}}, 'current': {'year': 526, 'candidates': [{'name':'Paul','votes':60000},{'name':'Marina','votes':30000}]}}
async def main():
    async with async_playwright() as p:
        b = await launch(p)
        import os; pg = await b.new_page(viewport={'width':1300,'height':900}, color_scheme=os.environ.get('CS','light'))
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append('console: '+m.text) if m.type=='error' else None)
        async def handle(route):
            u = route.request.url; body=None
            if 'skyblock/bazaar' in u: body=bz
            elif 'resources/skyblock/items' in u: body=items
            elif 'election' in u: body=election
            elif 'firesales' in u: body={'success':True,'sales':[{'item_id':ids[0],'start':now-1000,'end':now+DAY,'amount':1000,'price':10}]}
            elif 'static/icon/' in u:
                return await route.fulfill(status=200, content_type='image/png', body=icon_png(u))
            elif 'market.json' in u: body=md
            elif 'bazaar_stats.json' in u: body={'v':1,'built':now,'items':{i:{'sq':[round(0.005+0.002*k*(1+(n%5)),5) for k in range(21)],'am':(md['items'][i]['p'] or 100)*1.02,'bm':(md['items'][i]['p'] or 100)*(0.7 if n%9==0 else 1),'ra':0.03,'rb':0.03,'tr':-0.25 if n%7==0 else 0.02,'vt':0.1,'s30':0.02,'n':84} for n,i in enumerate(ids) if n%6}}
            elif 'prices.json' in u: body={'v':1,'built':now,'lastUpdated':now-60000,'auctions':39000,'bins':36000,'items':{'HYPERION':{'b':5.6e8,'l5':[5.6e8,5.7e8,6e8],'n':70,'seen':now,'name':'Hyperion'},'PET_BEE':{'b':80000,'l5':[80000],'n':20,'v':{'LEGENDARY':900000,'COMMON':80000},'seen':now,'name':'Bee'},'OLD_THING':{'b':None,'n':0,'last':123,'seen':now-86400000,'name':'Old Thing'}}}
            elif 'collections' in u: body={'success':True,'collections':{'MINING':{'items':{'DIAMOND':{}}},'FARMING':{'items':{'WHEAT':{}}}}}
            elif u.endswith('/api/items'): body=cat
            elif '/history?start=' in u:
                from urllib.parse import urlparse, parse_qs
                q=parse_qs(urlparse(u).query); import datetime
                s=int(datetime.datetime.fromisoformat(q['start'][0].replace('Z','+00:00')).timestamp()*1000); e=int(datetime.datetime.fromisoformat(q['end'][0].replace('Z','+00:00')).timestamp()*1000)
                body=bzhist(s,e)
            elif '/history/full' in u: body=ahhist(800, DAY)
            elif '/history/week' in u: body=ahhist(160, 3600000)
            elif '/history/' in u: body=bzhist(now-DAY, now)
            elif '/current' in u: body={'buy':9.5e8,'sell':9e8,'available':12}
            elif '/active/bin' in u: body=[{'startingBid':9.5e8+k*1e7,'itemName':'Hyperion','count':1} for k in range(10)]
            elif '/sold' in u: body=sold
            elif 'item/price/' in u: body={'min':5e8,'median':1e9,'mean':1e9,'mode':1e9,'volume':80,'max':2e9}
            elif u.startswith(BASE): return await route.continue_()
            elif 'fonts.g' in u: return await route.abort()
            if body is None: print('UNMOCKED', u); return await route.fulfill(status=404, body='')
            await route.fulfill(status=200, content_type='application/json', body=json.dumps(body), headers={'access-control-allow-origin':'*'})
        await pg.route('**/*', handle)
        base=BASE
        for h in ['', '#markt', '#markt/items', '#markt/updates', '#markt/mayors', '#markt/calendar', '#markt/rank', '#markt/method', '#markt/item/'+ids[0], '#markt/item/ENCHANTED_BREAD', '#markt/item/HYPERION', '#markt/item/PET_BEE', '#markt/item/OLD_THING', '#markt/item/SOULBOUND_X', '#markt/item/NOPE_123', '#bazaar/overview']:
            await pg.goto(base+h) if h=='' else await pg.evaluate(f"location.hash={json.dumps(h)}")
            await pg.wait_for_timeout(2500)
            txt = await pg.inner_text('#view')
            bad = [w for w in ['NaN','undefined','Infinity','[object'] if w in txt]
            print(h or 'hub', len(txt), 'BAD:'+','.join(bad) if bad else 'ok', '|', txt[:110].replace('\n',' / '))
            if bad: PROBLEMS.append(f'{h or "Start"}: {bad}')
            await pg.screenshot(path=f"{OUT}/{os.environ.get('CS','light')}_{(h or 'hub').replace('#','').replace('/','_')}.png", full_page=True)
        # Startseite
        await pg.evaluate("location.hash=''"); await pg.wait_for_timeout(2500)
        await pg.screenshot(path=f"{OUT}/{os.environ.get('CS','light')}_home.png", full_page=True)
        for f in ['jump','mayor','ah','npc','all']:
            await pg.click(f'[data-hfilter="{f}"]'); await pg.wait_for_timeout(200)
        print('home signals', await pg.locator('#home-signals li').count(), (await pg.inner_text('#home-signals'))[:300].replace('\n',' / '))
        if await pg.locator('#home-flips [data-open]').count():
            await pg.locator('#home-flips [data-open]').first.click(); await pg.wait_for_timeout(500); print('modal open', await pg.locator('#modal.on').count()); await pg.keyboard.press('Escape')
        # Preisprognose
        for fid in [ids[0], 'HYPERION', 'PET_BEE']:
            await pg.evaluate(f"location.hash='#markt/item/{fid}'"); await pg.wait_for_timeout(2500)
            body = await pg.inner_text('#mi-body')
            bad = [w for w in ['NaN','undefined','Infinity','null'] if w in body]
            tgt = await pg.evaluate("(()=>{const I=Markt._K.it,F=I&&I.fc; return F&&!F.err? Math.round(Math.exp(F.y0)*1.2):null})()")
            res = ''
            if tgt:
                await pg.fill('#pg-target', str(tgt)); await pg.wait_for_timeout(600)
                res = await pg.inner_text('#pg-tres')
            if tgt:
                # Prognose-Diagramm: Maus über den Prognose-Teil -> Legende zeigt diesen Tag
                await pg.locator('#pg-chart').scroll_into_view_if_needed(); box = await pg.locator('#pg-chart canvas').first.bounding_box()
                if not box: PROBLEMS.append(f'Prognose {fid}: kein Diagramm')
                else:
                    await pg.mouse.move(box['x'] + box['width'] * .85, box['y'] + box['height'] * .4); await pg.wait_for_timeout(200)
                    leg = await pg.inner_text('#pg-legend'); print('   legend', leg[:160].replace('\n', ' / '))
                    if 'Erwartet' not in leg or 'idle' in (await pg.get_attribute('#pg-legend .pg-leg', 'class') or ''): PROBLEMS.append(f'Prognose {fid}: Legende folgt der Maus nicht')
                    await pg.mouse.move(10, 10)
                for v in ['180', '7', '31']: await pg.click(f'[data-cp="pg"][data-cprange2="{v}"]'); await pg.wait_for_timeout(150)
                for r in ['7d', '1y', '30d']: await pg.click(f'[data-cp="pg"][data-cprange="{r}"]'); await pg.wait_for_timeout(150)
                n = await pg.evaluate("(()=>{const c=ChartPanels.pg.chart; return [c.data.t.length, c.fc?c.fc.t.length:0]})()"); print('   pg chart pts', n)
                if n[0] < 3 or n[1] != 32: PROBLEMS.append(f'Prognose {fid}: Diagramm {n}')
                d = await pg.evaluate("new Date(Date.now()+10*864e5).toISOString().slice(0,10)")
                await pg.fill('#pg-date', d); await pg.wait_for_timeout(200)
                dr = await pg.inner_text('#pg-dres'); print('   date', dr[:200].replace('\n', ' / '))
                if 'in 10 Tagen' not in dr: PROBLEMS.append(f'Prognose {fid}: Datum {dr[:80]}')
                await pg.evaluate("document.querySelector('.pg-days').open=true"); await pg.wait_for_timeout(200)
                print('   days rows', await pg.locator('.pg-tbl tbody tr').count())
                # Live-Update darf das Diagramm nicht neu anlegen
                c0 = await pg.evaluate("ChartPanels.pg.chart.__id = 1"); await pg.evaluate("drawItem(true)")
                if not await pg.evaluate("ChartPanels.pg.chart.__id === 1"): PROBLEMS.append(f'Prognose {fid}: Live-Update zeichnet Diagramm neu')
            await pg.wait_for_timeout(1500)
            rel = await pg.inner_text('#pg-rel') if await pg.locator('#pg-rel').count() else ''
            dbg = await pg.evaluate("(()=>{const F=Markt._K.it.fc; if(!F||F.err) return null; const f=F.fit; return {k:f.k,f:f.f,m:f.m,sigL:f.sigL,sigN:f.sigN,n:f.n,y0:F.y0,q:[0,6,30,89,179].map(d=>F.sim.q[d].map(x=>+(x-F.y0).toFixed(3))), up:[0,6,30,179].map(d=>F.sim.up[d])}})()")
            print('DBG', dbg)
            if bad: PROBLEMS.append(f'Prognose {fid}: {bad}')
            print('PROGNOSE', fid, 'bad', bad, '| target', tgt, '|', res[:260].replace('\n',' / '), '| rel', rel[:200].replace('\n',' / '))
            print('   ', body[:500].replace('\n',' / '))
            await pg.screenshot(path=f"{OUT}/{os.environ.get('CS','light')}_prog_{fid}.png", full_page=True)
        # Flips mit Spread-Verlauf
        await pg.evaluate("location.hash='#bazaar/flips'"); await pg.wait_for_timeout(1500)
        txt = await pg.inner_text('#view'); print('flips', [w for w in ['NaN','undefined','Infinity'] if w in txt], 'stats', await pg.evaluate("!!S.stats"), 'rows', await pg.locator('#view tbody tr[data-open]').count(), '|', txt[:300].replace('\n',' / '))
        await pg.screenshot(path=f"{OUT}/{os.environ.get('CS','light')}_flips.png", full_page=True)
        await pg.evaluate("applyPreset('risky'); S.set.minPct=0; ingest(false)"); await pg.wait_for_timeout(300)
        print('risky rows', await pg.locator('#view tbody tr[data-open]').count())
        if await pg.locator('#view tbody tr[data-open]').count():
            await pg.locator('#view tbody tr[data-open]').first.click(); await pg.wait_for_timeout(600)
            t = await pg.inner_text('#dRel'); print('dRel', [w for w in ['NaN','undefined','Infinity'] if w in t], t[:400].replace('\n',' / '))
            await pg.screenshot(path=f"{OUT}/{os.environ.get('CS','light')}_flip_detail.png", full_page=True); await pg.keyboard.press('Escape')
        await pg.evaluate("location.hash='#bazaar/item/'+S.rows.find(r=>r.st).id"); await pg.wait_for_timeout(1500)
        t = await pg.inner_text('#aRel'); print('aRel', [w for w in ['NaN','undefined','Infinity'] if w in t], len(t))
        await pg.evaluate("applyPreset('balanced'); ingest(false)")
        # interactions
        await pg.evaluate("location.hash='#markt/items'"); await pg.wait_for_timeout(800)
        await pg.fill('#msearch','ench'); await pg.wait_for_timeout(300); print('search rows', await pg.locator('.mk-table tbody tr').count())
        await pg.click('[data-mkpreset=mayor]'); await pg.wait_for_timeout(300); print('mayor preset rows', await pg.locator('.mk-table tbody tr').count())
        await pg.click('[data-mksort=c30]'); await pg.wait_for_timeout(200)
        await pg.evaluate("location.hash='#markt/item/%s'" % ids[0]); await pg.wait_for_timeout(2000)
        for t in ['trend','money','risk','chain','market']:
            await pg.click(f'[data-mitab="{t}"]'); await pg.wait_for_timeout(300)
            txt = await pg.inner_text('#mi-body'); print('itab', t, len(txt), [w for w in ['NaN','undefined','Infinity'] if w in txt])
            await pg.screenshot(path=f'{OUT}/itab_{t}.png', full_page=True)
        for r in ['24h','7d','30d','90d','all','1y']:
            await pg.click(f'[data-cp="mi"][data-cprange="{r}"]'); await pg.wait_for_timeout(700)
            print('mi range', r, await pg.evaluate("Markt._K.chart ? Markt._K.chart.data.t.length : -1"))
        await pg.click('[data-cp="mi"][data-cptool="hline"]'); box = await pg.locator('#mi-chart canvas').first.bounding_box()
        await pg.mouse.click(box['x'] + box['width'] * .5, box['y'] + box['height'] * .4); await pg.wait_for_timeout(200)
        print('mi drawings', await pg.evaluate("Markt._K.chart.drawings.length"))
        await pg.click('[data-cp="mi"][data-cpact="clear"]')
        if await pg.locator('[data-mkmob=insta]').count(): await pg.click('[data-mkmob=insta]'); await pg.wait_for_timeout(300)
        inp = pg.locator('[data-mkcalc=budget]')
        if await inp.count(): await inp.fill('50m'); await inp.press('Enter'); await pg.wait_for_timeout(300)
        await pg.evaluate("document.documentElement.dataset.theme='dark'"); await pg.screenshot(path=f'{OUT}/item_dark.png', full_page=True)
        await pg.set_viewport_size({'width':390,'height':800}); await pg.wait_for_timeout(400); await pg.screenshot(path=f'{OUT}/item_mobile.png', full_page=True)
        sw = await pg.evaluate("document.documentElement.scrollWidth"); print('mobile scrollWidth', sw)
        for h,fn in [('','m_home'),('#bazaar/flips','m_flips'),('#markt/items','m_items')]:
            await pg.evaluate(f"location.hash='{h}'"); await pg.wait_for_timeout(1500)
            print('mobile', h, await pg.evaluate("document.documentElement.scrollWidth"))
            await pg.screenshot(path=f"{OUT}/{os.environ.get('CS','light')}_{fn}.png", full_page=True)
        print(await pg.evaluate("[...document.querySelectorAll('#view *')].filter(e=>e.getBoundingClientRect().right>391).slice(0,6).map(e=>e.tagName+'.'+e.className+' '+Math.round(e.getBoundingClientRect().right)+' '+(e.innerText||'').slice(0,40))"))
        if os.environ.get('AUDIT'):
            hs = ['', '#bazaar/overview', '#bazaar/flips', '#bazaar/crafts', '#bazaar/npc', '#bazaar/market', '#bazaar/watch', '#bazaar/settings', '#bazaar/item/'+ids[0],
                  '#markt', '#markt/items', '#markt/rank', '#markt/updates', '#markt/mayors', '#markt/calendar', '#markt/method'] + [f'#markt/item/{ids[0]}?{t}' for t in ['forecast','market','trend','money','risk','chain']] + ['#markt/item/HYPERION?forecast', '#markt/item/HYPERION?market']
            js = """(()=>{const W=innerWidth, out=[]; if(document.documentElement.scrollWidth>W+1) out.push('PAGE '+document.documentElement.scrollWidth);
              for(const e of document.querySelectorAll('body *')){ const cs=getComputedStyle(e); if((cs.overflowX==='auto'||cs.overflowX==='scroll') && e.scrollWidth>e.clientWidth+2 && e.offsetParent) out.push((e.id?'#'+e.id:e.tagName+'.'+String(e.className).split(' ')[0])+' '+e.clientWidth+'<'+e.scrollWidth+' '+(e.innerText||'').slice(0,30).replace(/\\n/g,' ')+' >> '+[...e.querySelectorAll('*')].filter(c=>c.getBoundingClientRect().right>e.getBoundingClientRect().right+1).slice(-2).map(c=>c.tagName+'.'+String(c.className).split(' ')[0]+':'+Math.round(c.getBoundingClientRect().width)+':'+(c.innerText||'').slice(0,25)).join(' | ')); }
              for(const t of document.querySelectorAll('table.stack')) if(t.offsetParent) out.push('STACK '+(t.className)+' '+(t.querySelector('th')||{}).innerText);
              return out.slice(0,8);})()"""
            for w in [1440, 1280, 1100, 900, 768, 600, 390]:
                await pg.set_viewport_size({'width':w,'height':900})
                for h in hs:
                    hh, _, tab = h.partition('?')
                    await pg.evaluate(f"location.hash={json.dumps(hh)}"); await pg.wait_for_timeout(900 if 'item' in hh else 500)
                    if tab:
                        if await pg.locator(f'[data-mitab="{tab}"]').count(): await pg.click(f'[data-mitab="{tab}"]'); await pg.wait_for_timeout(400)
                    r = await pg.evaluate(js)
                    if r: print('OVERFLOW', w, h, r)
                    real = [x for x in r if not x.startswith('STACK')]
                    if real: PROBLEMS.append(f'Überstand bei {w}px auf {h or "Start"}: {real[:2]}')
        print('ERRORS:', errs[:10])
        PROBLEMS.extend('Konsole/Seite: ' + e for e in errs if 'Failed to load resource' not in e)
        await b.close()
with serve() as BASE:
    asyncio.run(main())
if PROBLEMS:
    print('PROBLEME:'); [print(' -', p) for p in PROBLEMS]; sys.exit(1)
print('Rauchtest ohne Probleme.')
