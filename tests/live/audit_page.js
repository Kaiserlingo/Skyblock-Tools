/* Live-Prüfung der Website im Browser (echte Daten).
   Läuft in der geöffneten Seite: window.siteAudit({ids, ah}).then(r => …)
   Prüft
     1. Rohdaten: Bazaar-Zeilen gegen das Orderbuch von Hypixel (eigene Rechnung)
     2. Bereichsübergreifend: Markt-Analyse (Liste, Kopf, Prognose) gegen Bazaar Flipper (Tabelle, Analyse, Detail)
        und gegen die Pipeline-Daten (market.json)
     3. Prognose: Verlauf, Kacheln, Tabelle, Legende, Fazit zeigen dieselben Zahlen
     4. Auction House: Lowest BIN der Website gegen SkyCofl live
     5. jede Seite: keine kaputten Zahlen (NaN, undefined, Infinity), keine Fehler in der Konsole
   Ergebnis: {checks: {Name: [ok, gesamt]}, issues: [{area, msg, data}]} */
(function(){
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(f, ms = 25000){ const t0 = Date.now(); while (Date.now() - t0 < ms){ try{ if (f()) return true; }catch(e){} await wait(250); } return false; }
const go = async (hash, ready, ms) => { window.__auditStep = hash; location.hash = hash; await wait(400); return until(ready, ms); };
const num = v => v != null && isFinite(v);

window.siteAudit = async function(opt = {}){
  const R = {checks: {}, issues: [], at: new Date().toISOString()};
  const bad = (area, msg, data) => { if (R.issues.length < 600) R.issues.push({area, msg, data}); };
  const chk = (name, ok, msg, data) => { const c = R.checks[name] = R.checks[name] || [0, 0]; c[1]++; if (ok) c[0]++; else bad(name, msg, data); return ok; };
  const near = (a, b, rel = 1e-9) => (a == null || b == null) ? a == b : Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-12);
  const errs = []; const oe = window.onerror; window.onerror = (m) => { errs.push(String(m)); };
  const scan = where => {
    const t = (document.querySelector('#view') || document.body).innerText;
    for (const w of ['NaN', 'undefined', 'Infinity', '[object', 'null %', ' null ']){
      const i = t.indexOf(w);
      chk('Text ohne kaputte Werte', i < 0, `${where}: „${w}“`, i >= 0 ? t.slice(Math.max(0, i - 70), i + 40) : null);
    }
  };
  const dl = root => { const m = {}; (root ? root.querySelectorAll('dt') : []).forEach(dt => { const dd = dt.nextElementSibling; if (dd) m[dt.textContent.trim()] = dd.textContent.replace(/\s+/g, ' ').trim(); }); return m; };

  /* ---------- 1. Bazaar: Rohdaten und Rechnung je Zeile ---------- */
  await go('#bazaar/market', () => S.rows.length > 100, 30000);
  await until(() => window.Markt && Markt._K.md && Markt._K.px && Markt._K.hy, 30000);
  const K = Markt._K, md = K.md;
  const tax = S.set.tax / 100, r1 = x => Math.round(x * 10) / 10;
  for (const id in S.products){
    const p = S.products[id], r = S.byId[id], q = p.quick_status || {};
    const bo = (p.sell_summary || [])[0], so = (p.buy_summary || [])[0];
    const tb = bo ? bo.pricePerUnit : 0, ts = so ? so.pricePerUnit : 0;
    chk('Bazaar: Instasell = höchste Buy-Order', r.topBuy === tb, id, [r.topBuy, tb]);
    chk('Bazaar: Instabuy = niedrigste Sell-Offer', r.topSell === ts, id, [r.topSell, ts]);
    if (tb && ts){
      const ba = r1(tb + .1), sa = r1(ts - .1), pr = sa * (1 - tax) - ba;
      chk('Bazaar: Gewinn pro Stück', near(r.profit, pr, 1e-12), id, [r.profit, pr]);
      chk('Bazaar: Spread (auf Buy-Order bezogen)', near(r.spreadPct, (ts - tb) / tb * 100, 1e-12), id, [r.spreadPct]);
    }
    chk('Bazaar: Wochenmengen', r.wBuy === (q.buyMovingWeek || 0) && r.wSell === (q.sellMovingWeek || 0), id);
    chk('Bazaar: Sortierung Orderbuch', (p.sell_summary || []).every((x, i, a) => !i || a[i - 1].pricePerUnit >= x.pricePerUnit) && (p.buy_summary || []).every((x, i, a) => !i || a[i - 1].pricePerUnit <= x.pricePerUnit), id);
  }

  /* ---------- 2. Markt-Analyse-Liste gegen Flipper und Pipeline ---------- */
  const cm = curMayor();
  for (const id of universe()){
    const row = itemRow(id, cm && cm.name), r = S.byId[id], o = md.items[id], x = K.px.items[id];
    if (r && (r.topBuy || r.topSell)){
      chk('Liste: Kaufen = Instabuy im Flipper', row.buy === (r.topSell || null), id, [row.buy, r.topSell]);
      chk('Liste: Sofort verkaufen = Instasell im Flipper', row.sell === (r.topBuy || null), id, [row.sell, r.topBuy]);
    }
    if (o && row.bz){ for (const k of ['c7', 'c30', 'c365']) chk('Liste: Veränderungen = Tagesdaten', row[k] === (o[k] ?? null), id + ' ' + k, [row[k], o[k]]); }
    if (!row.bz && x && x.b != null) chk('Liste: AH-Preis = Lowest BIN (prices.json)', row.buy === x.b, id, [row.buy, x.b]);
    chk('Liste: Bazaar/AH eindeutig', !(row.bz && row.ah), id);
  }
  // Ranglisten nutzen dieselben Tagesdaten
  await go('#markt/rank', () => document.querySelector('.mk-ranks'));
  for (const li of document.querySelectorAll('.mk-ranks section')){
    const h = li.querySelector('h2').textContent, key = /7 Tage/.test(h) ? 'c7' : /30 Tage/.test(h) ? 'c30' : null; if (!key) continue;
    for (const it of li.querySelectorAll('li[data-mkitem]')){ const id = it.dataset.mkitem, v = it.querySelector('.v').textContent.trim(); chk('Ranglisten = Tagesdaten', v === P(md.items[id][key]), id + ' ' + key, [v, P(md.items[id][key])]); }
  }
  scan('#markt/rank');

  /* ---------- 3. Item-Seiten: Kopf, Kennzahlen, Prognose, Flipper-Analyse ---------- */
  const liq = Object.keys(md.items).filter(id => md.items[id].liq && S.byId[id]);
  const pick = opt.ids || liq.sort(() => Math.random() - .5).slice(0, opt.n || 8);
  const ahIds = opt.ah || ['HYPERION', 'JUJU_SHORTBOW', 'TERMINATOR', 'ASPECT_OF_THE_END'];
  for (const id of pick.concat(ahIds)){
    const ok = await go('#markt/item/' + encodeURIComponent(id), () => K.it && K.it.id === id && K.it.ready && K.it.A && K.it.fc !== undefined && document.querySelector('.pg-tile, .pg .note, #mi-body .note'), 40000);
    if (!chk('Item-Seite lädt', ok, id)) continue;
    await until(() => !(K.it.fcBT === null), 20000);
    const I = K.it, A = I.A, o = md.items[id], r = S.byId[id], head = dl(document.querySelector('#mi-head .mk-fig')), gl = dl(document.querySelector('.mk-glance'));
    if (I.k.bz && r){
      chk('Kopf Instabuy = Flipper', head['Instabuy'] === price(r.topSell), id, [head['Instabuy'], price(r.topSell)]);
      chk('Kopf Instasell = Flipper', head['Instasell'] === price(r.topBuy), id, [head['Instasell'], price(r.topBuy)]);
      chk('Kopf Spread = Flipper', head['Spread'] === pct(r.spreadPct, false), id, [head['Spread'], pct(r.spreadPct, false)]);
      // Kennzahlen der Item-Seite (eigene Abfrage bei SkyCofl) gegen die Tagesdaten der Pipeline
      if (o) for (const [k, lab] of [['c7', '7 Tage'], ['c30', '30 Tage'], ['c365', '1 Jahr']])
        chk('Item-Seite = Liste (Veränderung)', o[k] == null || A[k] == null || Math.abs(A[k] - o[k]) < .0006, `${id} ${lab}`, [gl[lab], P(o[k])]);
      if (o && o.v30 != null && A.vol != null) chk('Item-Seite = Ranglisten (Schwankung)', Math.abs(A.vol - o.v30) < .0006, id, [A.vol, o.v30]);
      if (o && o.p != null && A.p != null) chk('Item-Seite = Pipeline (Tagesmittel)', near(A.p, o.p, 2e-3), id, [A.p, o.p]);
    }
    if (I.k.ah){
      const x = K.px.items[id];
      if (x) chk('Kopf Lowest BIN = prices.json', head['Lowest BIN'] === (x.b != null ? price(x.b) : '–'), id, [head['Lowest BIN'], x.b]);
      try{
        const lb = await (await fetch(CFG.cofl + `auctions/tag/${encodeURIComponent(id)}/active/bin`)).json();
        if (Array.isArray(lb) && lb.length && x && x.b != null){
          const m = Math.min(...lb.map(a => a.startingBid / (a.count || 1)));
          chk('Lowest BIN ≈ SkyCofl live (±10 %, bis 5 min Versatz)', Math.abs(x.b / m - 1) < .1, id, [x.b, m, new Date(K.px.lastUpdated).toISOString()]);
        }
      }catch(e){}
    }
    // Prognose: alle Darstellungen zeigen dieselben Zahlen
    window.__auditStep = 'Prognose ' + id;
    const F = I.fc;
    if (F && !F.err && ChartPanels.pg && ChartPanels.pg.chart){
      for (const s of F.sides.list){
        const b = document.querySelector(`[data-fcside="${s[0]}"]`); if (b && !b.classList.contains('on')){ b.click(); await wait(600); }
        const side = fcSide(I, F), c = ChartPanels.pg.chart, d = c.data, f = c.fc, now = fcNow(F, side), tag = `${id} ${side[1]}`;
        chk('Prognose: Verlauf endet am Startpreis', near(d.hi[d.t.length - 1], now) && d.t[d.t.length - 1] === f.t[0] && near(f.med[0], now), tag);
        let ord = true; for (let k = 1; k < f.t.length; k++) if (!(f.q10[k] <= f.q25[k] && f.q25[k] <= f.med[k] && f.med[k] <= f.q75[k] && f.q75[k] <= f.q90[k])) ord = false;
        chk('Prognose: Bereiche geordnet', ord, tag);
        const tiles = [...document.querySelectorAll('.pg-tile dd b')].map(b => b.textContent);
        [1, 7, 31].forEach((h, i) => chk('Prognose: Kachel = Tagesrechnung', tiles[i] === price(fcDay(F, side, h).med), `${tag} ${h}`, [tiles[i], price(fcDay(F, side, h).med)]));
        const rows = [...document.querySelectorAll('.pg-tbl tbody tr')];
        chk('Prognose: Tabelle = Kacheln', rows[6] && rows[30] && rows[6].children[1].textContent === tiles[1] && rows[30].children[1].textContent === tiles[2], tag);
        const ch = fcDay(F, side, 31).ch, v = document.querySelector('.pg-verdict').innerText;
        chk('Prognose: Fazit = Kachel 31 Tage', Math.abs(ch) < .01 || v.includes(pct(Math.abs(ch) * 100, false)), tag, [v, ch]);
        const sum = [...document.querySelectorAll('.pg-drv-r.sum .pg-drv-v')][1].innerText;
        chk('Prognose: Summe der Einflüsse = Kachel', sum.includes(pct(ch * 100)), tag, [sum, ch]);
        const lg = document.querySelector('#pg-legend').innerText;
        chk('Prognose: Legende = Kachel', lg.includes(price(fcDay(F, side, K.fcView).med)), tag);
        // „Jetzt“ der Prognose gegen den Kopf der Seite
        const nowTxt = (document.querySelector('.pg-now b') || {}).textContent;
        if (I.k.bz && r && side[0] === 'buy') chk('Prognose „Jetzt“ Instabuy = Kopf', nowTxt === head['Instabuy'], id, [nowTxt, head['Instabuy']]);
        if (I.k.bz && r && side[0] === 'sell') chk('Prognose „Jetzt“ Instasell = Kopf', nowTxt === head['Instasell'], id, [nowTxt, head['Instasell']]);
        if (I.k.ah && side[0] === 'lbin') chk('Prognose „Jetzt“ Lowest BIN = Kopf', nowTxt === head['Lowest BIN'], id, [nowTxt, head['Lowest BIN']]);
        scan('Prognose ' + tag);
      }
    }
    window.__auditStep = 'Reiter ' + id;
    for (const t of ITABS){ const b = document.querySelector(`[data-mitab="${t.id}"]`); if (b){ b.click(); await wait(250); scan(`#markt/item/${id} ${t.id}`); } }
    const fb = document.querySelector('[data-mitab="forecast"]'); if (fb) fb.click();
    // dieselbe Zahl im Bazaar Flipper (Analyse-Seite)
    if (I.k.bz && r){
      const ok2 = await go('#bazaar/item/' + encodeURIComponent(id), () => document.querySelector('#aRel') || document.querySelector('.figures'), 20000);
      if (ok2){
        const a = dl(document.querySelector('#view .figures')), f2 = dl(document.querySelector('#view .facts'));
        chk('Flipper-Analyse Instabuy = Markt-Analyse', a['Instabuy'] === head['Instabuy'], id, [a['Instabuy'], head['Instabuy']]);
        chk('Flipper-Analyse Instasell = Markt-Analyse', a['Instasell'] === head['Instasell'], id, [a['Instasell'], head['Instasell']]);
        chk('Flipper-Analyse Spread = Markt-Analyse', f2['Spread'] === head['Spread'], id, [f2['Spread'], head['Spread']]);
        scan('#bazaar/item/' + id);
      }
    }
  }

  /* ---------- 4. Flip-Tabelle gegen Detailfenster ---------- */
  await go('#bazaar/flips', () => document.querySelector('#view table'));
  for (const tr of [...document.querySelectorAll('#view tbody tr[data-open]')].slice(0, 6)){
    const id = tr.dataset.open, r = S.byId[id], cell = tr.children[7].childNodes[0].textContent.trim();
    tr.click(); await wait(500);
    const m = dl(document.querySelector('#modal .figures'));
    chk('Flip-Tabelle = Detailfenster (Profit pro Stunde)', (m['Profit pro Stunde'] || '').startsWith(fmt(r.pphTyp)), id, [cell, m['Profit pro Stunde']]);
    chk('Flip-Tabelle = Detailfenster (Gewinn pro Stück)', (m['Flip-Gewinn pro Stück'] || '') === price(r.profit), id);
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'})); await wait(200);
  }

  /* ---------- 5. Startseite gegen die Bereiche ---------- */
  await go('#', () => document.querySelector('#home-kpis .mk-now'), 20000); await wait(1500);
  const kp = [...document.querySelectorAll('#home-kpis .mk-now')].map(a => a.querySelector('.v').textContent.trim());
  chk('Start: Passende Flips = Flipper', kp[0] === NF0.format(filteredFlips(true).length + filteredCrafts(true).length), 'Passende Flips', [kp[0]]);
  chk('Start: Preisindex 7 Tage = Markt-Analyse', kp[1] === P(Econ.change(md.index.spi, 7)), 'Index', [kp[1]]);
  for (const li of document.querySelectorAll('#home-flips li[data-open]')){ const r = S.byId[li.dataset.open]; chk('Start: Beste Flips = Flip-Tabelle', li.querySelector('.v').childNodes[0].textContent.trim() === fmt(r.pphTyp), r.id); }
  scan('#start');

  /* ---------- 6. alle Seiten ---------- */
  for (const t of BAZAAR_TABS){ await go('#bazaar/' + t.id, () => document.querySelector('#view'), 8000); await wait(500); scan('#bazaar/' + t.id); }
  for (const t of MARKT_TABS){ await go('#markt/' + t.id, () => document.querySelector('#view .mk, #view .mk-ranks, #view'), 8000); await wait(800); scan('#markt/' + t.id); }
  chk('keine Skriptfehler', !errs.length, 'Fehler', errs.slice(0, 5));
  window.onerror = oe;
  R.summary = Object.entries(R.checks).map(([k, [a, b]]) => `${a === b ? 'ok ' : 'FEHLER'} ${k}: ${a}/${b}`);
  return R;
};
})();
