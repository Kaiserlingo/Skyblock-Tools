// Trockenlauf der Tagesdaten-Pipeline mit erfundenen API-Antworten (kein Netz nötig):
//   node tests/test_pipeline.mjs
// Prüft, dass tools/build_market.mjs durchläuft und market.json / bazaar_stats.json die erwartete Form haben.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'sbt-')), out = join(dir, 'market.json');
let ok = 0, bad = 0;
const check = (name, cond) => { if (cond) ok++; else { bad++; console.log('FEHLER', name); } };
try{
  execFileSync(process.execPath, ['--import', join(ROOT, 'tests', 'pipeline', 'mockfetch.mjs'), join(ROOT, 'tools', 'build_market.mjs'), out],
    {env: {...process.env, MOCK: '1'}, stdio: 'pipe', timeout: 300e3});
}catch(e){ console.log(String(e.stdout || ''), String(e.stderr || '')); console.log('Pipeline abgebrochen'); process.exit(1); }
const md = JSON.parse(readFileSync(out, 'utf8')), st = JSON.parse(readFileSync(join(dir, 'bazaar_stats.json'), 'utf8'));
const ids = Object.keys(md.items);
check('alle 14 Items', ids.length === 14);
check('Version', md.v === 5);
check('Tagesraster 366 Tage', md.days && (md.days.to - md.days.from) / 864e5 === 365);
check('Preisindex', Array.isArray(md.index.spi) && md.index.spi.length === 366 && md.index.spi[0] === 100);
check('Mayor-Amtszeiten', md.terms.length > 10 && md.terms.every(t => t.end > t.start));
check('Updates', md.news.length === 3);
check('Kennzahlen je Item', md.items.ENCHANTED_DIAMOND.p > 0 && typeof md.items.ENCHANTED_DIAMOND.c30 === 'number');
check('Kategorien', md.items.DIAMOND.s === 'MINING' && md.items.WHEAT.s === 'FARMING');
check('Prognose-Feld vorhanden', 'fc' in md);
check('Spread-Statistik', Object.keys(st.items).length > 0 && Object.values(st.items).every(x => Array.isArray(x.sq) && x.sq.length === 21));
console.log(`bestanden: ${ok}, Fehler: ${bad}`);
process.exit(bad ? 1 : 0);
