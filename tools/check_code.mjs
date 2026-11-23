// Statische Prüfung der Website in der Ladereihenfolge von index.html (dauert etwa eine Sekunde):
//  1. jede JS-Datei für sich syntaktisch korrekt
//  2. alle zusammen ohne doppelte globale Namen (const/let/class/function) – alle Dateien teilen einen Namensraum
//  3. CSS: Kommentare und Klammern geschlossen
//  4. Pipeline-Skripte (tools/*.mjs) syntaktisch korrekt
// Aufruf: node tools/check_code.mjs   (Exit 1 bei Fehlern)
import {readFileSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="(js\/[^"?]+)/g)].map(m => m[1]);
let bad = 0;
const seen = new Map();
for (const f of files){
  const src = readFileSync(join(ROOT, f), 'utf8');
  try{ new vm.Script(src, {filename: f}); }catch(e){ console.log(`✗ ${f}: ${e.message}`); bad++; continue; }
  // Dateien in einer Kapsel (function(){ … })() haben keine globalen Namen außer window.X
  const body = src.replace(/^'use strict';\s*/, '').replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '').trim();
  if (/^\((?:async\s+)?function\b/.test(body) && /\}\)\([^)]*\);?$/.test(body)) continue;
  // oberste Ebene: Zeilen ohne Einrückung (Konvention im Projekt)
  for (const m of src.matchAll(/^(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)){
    const n = m[1];
    if (seen.has(n) && seen.get(n) !== f){ console.log(`✗ „${n}“ doppelt: ${seen.get(n)} und ${f}`); bad++; }
    else seen.set(n, f);
  }
  // weitere Namen in Mehrfach-Deklarationen: const a = 1, b = 2;
  for (const m of src.matchAll(/^(?:const|let|var)\s+[^\n;]*?,\s*([A-Za-z_$][\w$]*)\s*=/gm)){
    const n = m[1]; if (seen.has(n) && seen.get(n) !== f){ console.log(`✗ „${n}“ doppelt: ${seen.get(n)} und ${f}`); bad++; } else seen.set(n, f);
  }
}
// alle zusammen, wie der Browser sie sieht
try{ new vm.Script(files.map(f => readFileSync(join(ROOT, f), 'utf8').replace(/^'use strict';/, '')).join('\n;\n'), {filename: 'alle Skripte'}); }
catch(e){ console.log('✗ zusammen: ' + e.message); bad++; }
// CSS
for (const f of [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"?]+)/g)].map(m => m[1])){
  const css = readFileSync(join(ROOT, f), 'utf8');
  const open = (css.match(/\/\*/g) || []).length, close = (css.match(/\*\//g) || []).length;
  if (open !== close){ console.log(`✗ ${f}: ${open} Kommentar-Anfänge, ${close} Kommentar-Enden`); bad++; continue; }
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"|'[^']*'/g, '');
  let depth = 0, neg = false; for (const ch of plain){ if (ch === '{') depth++; else if (ch === '}'){ depth--; if (depth < 0) neg = true; } }
  if (depth || neg){ console.log(`✗ ${f}: geschweifte Klammern passen nicht`); bad++; }
}
// Pipeline
for (const f of readdirSync(join(ROOT, 'tools')).filter(f => f.endsWith('.mjs'))){
  try{ execFileSync(process.execPath, ['--check', join(ROOT, 'tools', f)], {stdio: 'pipe'}); }catch(e){ console.log(`✗ tools/${f}: ${String(e.stderr).split('\n').slice(0, 4).join(' ')}`); bad++; }
}
console.log(bad ? `${bad} Problem(e) in ${files.length} Skripten` : `Code ok: ${files.length} Skripte, ${seen.size} globale Namen ohne Doppelung, CSS und Pipeline fehlerfrei`);
process.exit(bad ? 1 : 0);
