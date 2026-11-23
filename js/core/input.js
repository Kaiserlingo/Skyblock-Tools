'use strict';
// Rahmen: Coins-Eingaben lesen (10m, 2,5k, 1.2b).
/* =========================================================
   Eingaben: Coins mit Kurzschreibweise (10m, 2,5k, 1.2b)
   ========================================================= */
function parseCoins(str){
  if (str == null) return NaN;
  let s = String(str).trim().toLowerCase().replace(/\s|coins?/g, '');
  if (!s) return NaN;
  const m = s.match(/^([0-9.,]+)([kmb]?)$/);
  if (!m) return NaN;
  let num = m[1];
  if (/[.,]{2}|^[.,]|[.,]$/.test(num)) return NaN;                 // "1..2", ",5", "5."
  const hasDot = num.includes('.'), hasComma = num.includes(',');
  if (hasDot && hasComma){
    // beide Trennzeichen: das letzte ist das Dezimalzeichen ("1.941.111,7" oder "1,941,111.7")
    const dec = num.lastIndexOf('.') > num.lastIndexOf(',') ? '.' : ',', grp = dec === '.' ? ',' : '.';
    const [intPart, frac] = [num.slice(0, num.lastIndexOf(dec)), num.slice(num.lastIndexOf(dec) + 1)];
    if (intPart.split(grp).some((g, i) => i > 0 && g.length !== 3) || frac.includes(grp)) return NaN;
    num = intPart.split(grp).join('') + '.' + frac;
  }
  else if (/^\d{1,3}(\.\d{3})+$/.test(num)) num = num.replace(/\./g, '');              // 1.000.000
  else if (/^\d{1,3}(,\d{3})+$/.test(num) && !m[2]) num = num.replace(/,/g, '');        // 1,000,000
  else if ((num.match(/[.,]/g) || []).length > 1) return NaN;                          // 1.2.3 ohne Tausender-Muster
  else num = num.replace(',', '.');
  const v = Number(num);
  if (!isFinite(v)) return NaN;
  return v * ({k:1e3, m:1e6, b:1e9}[m[2]] || 1);
}
function coinText(v){
  if (!isFinite(v)) return '';
  if (v >= 1e9 && v % 1e7 === 0) return NF2.format(v/1e9).replace(/,00$/, '') + 'b';
  if (v >= 1e6 && v % 1e4 === 0) return NF2.format(v/1e6).replace(/,00$/, '') + 'm';
  if (v >= 1e4 && v % 100 === 0) return NF1.format(v/1e3).replace(/,0$/, '') + 'k';
  return NF1.format(v);
}
