'use strict';
// Bazaar Flipper: eigener Preisverlauf im Browser (IndexedDB).
/* =========================================================
   Persistenter Verlauf (IndexedDB)
   ========================================================= */
const DB = {
  db: null,
  open(){ return new Promise(res => {
    try{
      const r = indexedDB.open('bazaar-tracker', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('hist');
      r.onsuccess = () => { this.db = r.result; res(true); };
      r.onerror = () => res(false);
    }catch{ res(false); }
  });},
  loadAll(){ return new Promise(res => {
    if (!this.db) return res({});
    const out = {};
    try{
      const rq = this.db.transaction('hist').objectStore('hist').openCursor();
      rq.onsuccess = () => { const c = rq.result; if (c){ out[c.key] = c.value; c.continue(); } else res(out); };
      rq.onerror = () => res(out);
    }catch{ res(out); }
  });},
  saveAll(h){ return new Promise(res => {
    if (!this.db) return res();
    try{
      const tx = this.db.transaction('hist', 'readwrite'), st = tx.objectStore('hist');
      for (const k in h) st.put(h[k], k);
      tx.oncomplete = tx.onerror = tx.onabort = () => res();
    }catch{ res(); }
  });},
  clear(){ return new Promise(res => {
    if (!this.db) return res();
    const tx = this.db.transaction('hist', 'readwrite'); tx.objectStore('hist').clear();
    tx.oncomplete = tx.onerror = () => res();
  });},
};
function pushHist(id, t, b, s){
  let h = S.hist[id];
  if (!h) h = S.hist[id] = {t:[], b:[], s:[]};
  if (h.t.length && h.t[h.t.length-1] >= t) return;
  h.t.push(t); h.b.push(b); h.s.push(s);
}
function compact(h, now){
  const fine = now - HOUR, ret = now - S.set.retentionH*HOUR;
  const t=[], b=[], s=[]; let lastBk = -1;
  for (let i = 0; i < h.t.length; i++){
    const ti = h.t[i];
    if (ti < ret) continue;
    if (ti < fine){
      const bk = Math.floor(ti / 300e3);
      if (bk === lastBk){ t[t.length-1] = ti; b[b.length-1] = h.b[i]; s[s.length-1] = h.s[i]; continue; }
      lastBk = bk;
    }
    t.push(ti); b.push(h.b[i]); s.push(h.s[i]);
  }
  h.t = t; h.b = b; h.s = s;
}
function valueAt(h, time, key){
  if (!h || !h.t.length) return null;
  if (h.t[0] > time) return (h.t[h.t.length-1] - h.t[0] >= 300e3) ? h[key][0] : null;
  let lo = 0, hi = h.t.length-1;
  while (lo < hi){ const mid = (lo+hi+1) >> 1; if (h.t[mid] <= time) lo = mid; else hi = mid-1; }
  return h[key][lo];
}
function median(arr){
  const a = arr.filter(x => x > 0).sort((x,y) => x-y);
  return a.length ? a[a.length >> 1] : null;
}
function histPoints(){ let n = 0; for (const k in S.hist) n += S.hist[k].t.length; return n; }
