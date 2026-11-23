"""Live-Prüfung der Oberfläche mit echten Daten: öffnet die Website (aktueller Stand des Repositorys)
mit echtem Internet, führt tests/live/audit_page.js aus und schreibt das Ergebnis.

    python3 tests/live/audit_ui.py bericht.json [Anzahl Bazaar-Items]
"""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from web import serve, launch
from playwright.async_api import async_playwright

async def main(out, n):
    async with async_playwright() as p:
        b = await launch(p)
        pg = await b.new_page(viewport={'width': 1300, 'height': 900})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(f'console ({pg.url.split("#")[-1]}): ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        await pg.goto(BASE + '#bazaar/market')
        await pg.wait_for_timeout(3000)
        await pg.add_script_tag(path=os.path.join(os.path.dirname(__file__), 'audit_page.js'))
        rep = await pg.evaluate(f"siteAudit({{n: {n}, ah: ['HYPERION', 'JUJU_SHORTBOW', 'TERMINATOR', 'ASPECT_OF_THE_END', 'PET_ENDER_DRAGON']}})", )
        # nie seitlich scrollen – mit echten Daten (lange Namen, große Zahlen) in drei Breiten
        over = []
        for w in [390, 768, 1100]:
            await pg.set_viewport_size({'width': w, 'height': 900})
            for h in ['#', '#bazaar/overview', '#bazaar/flips', '#bazaar/crafts', '#bazaar/npc', '#bazaar/market', '#markt/start', '#markt/items', '#markt/rank', '#markt/updates', '#markt/mayors', '#markt/item/ENCHANTED_DIAMOND', '#markt/item/HYPERION', '#bazaar/item/ENCHANTED_DIAMOND']:
                await pg.evaluate(f"location.hash={json.dumps(h)}"); await pg.wait_for_timeout(2500 if 'item/' in h else 900)
                sw = await pg.evaluate("document.documentElement.scrollWidth")
                if sw > w: over.append(f'{w}px {h}: {sw}px')
        rep['ueberstand'] = over
        print('Seitlicher Überstand:', over or 'keiner')
        rep['seitenfehler'] = errs[:20]
        json.dump(rep, open(out, 'w'), indent=1, ensure_ascii=False)
        print('\n'.join(rep['summary']))
        print('Seitenfehler:', errs[:10])
        bad = [i for i in rep['issues']]
        print('Abweichungen:', len(bad))
        for i in bad[:60]: print(' ', json.dumps(i, ensure_ascii=False)[:300])
        await b.close()

with serve() as BASE:
    asyncio.run(main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 12))
