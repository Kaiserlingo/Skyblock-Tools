// Netzwerk-Helfer für die Pipeline (GitHub Actions): Abruf mit Wiederholung und begrenzt parallele Abarbeitung.
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const HYPIXEL = 'https://api.hypixel.net/v2/';
export const COFL = 'https://sky.coflnet.com/api/';
export const DATA = 'https://raw.githubusercontent.com/Kaiserlingo/Skyblock-Tools/data/';
const UA = {'User-Agent': 'SkyBlockTools (github.com/Kaiserlingo/Skyblock-Tools)'};

/* JSON holen, bei Fehlern mit wachsender Pause wiederholen.
   tries: Versuche · wait429: Pause bei „zu viele Anfragen“ (wächst mit jedem Versuch)
   pause: Pause nach sonstigen Fehlern (verdoppelt sich) · success: Hypixel-Feld success muss true sein
   empty204: Antwort 204 (kein Inhalt) gilt als leere Liste */
export async function get(url, {tries = 5, wait429 = 15e3, pause = 2000, success = false, timeout = 30e3, ua = UA} = {}){
  for (let k = 0; k < tries; k++){
    try{
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), timeout);
      const r = await fetch(url, {headers: ua, signal: ctl.signal}); clearTimeout(to);
      if (r.status === 204) return [];
      if (r.status === 429){ await sleep(wait429 * (k + 1)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (success && !j.success) throw new Error('success=false');
      return j;
    }catch(e){ if (k === tries - 1) throw new Error(url + ': ' + e.message); await sleep(pause * 2 ** k); }
  }
  throw new Error(url + ': zu viele Anfragen');
}

/* fn für jedes Element ausführen, höchstens n gleichzeitig. Fehler ergeben null (und eine Warnung). */
export async function pool(items, n, fn, {gap = 120, every = 200} = {}){
  const out = new Array(items.length); let i = 0, done = 0;
  await Promise.all(Array.from({length: n}, async () => {
    while (i < items.length){
      const k = i++;
      try{ out[k] = await fn(items[k]); }catch(e){ out[k] = null; console.warn(e.message); }
      if (++done % every === 0) console.log(`  ${done}/${items.length}`);
      await sleep(gap);
    }
  }));
  return out;
}
