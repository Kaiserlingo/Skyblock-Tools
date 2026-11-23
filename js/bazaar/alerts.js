'use strict';
// Bazaar Flipper: Preis-Alarme der Watchlist.
/* =========================================================
   Alarme
   ========================================================= */
const CONDS = {
  sell_below:   {label:'Instabuy ≤',   get: r => r.topSell, test: (v,x) => v > 0 && v <= x},
  sell_above:   {label:'Instabuy ≥',   get: r => r.topSell, test: (v,x) => v >= x},
  buy_above:    {label:'Instasell ≥',  get: r => r.topBuy,  test: (v,x) => v >= x},
  buy_below:    {label:'Instasell ≤',  get: r => r.topBuy,  test: (v,x) => v > 0 && v <= x},
  margin_above: {label:'Flip-Gewinn/Stk ≥', get: r => r.profit, test: (v,x) => v >= x},
};
function checkAlerts(){
  const now = Date.now(); let changed = false;
  for (const a of S.alerts){
    const r = S.byId[a.id], c = CONDS[a.cond];
    if (!r || !c) continue;
    const v = c.get(r);
    if (c.test(v, a.value) && (!a.last || now - a.last > 10*60e3)){
      a.last = now; changed = true;
      notify(r.name, c.label + ' ' + price(a.value) + ' — aktuell ' + price(v), a.id);
    }
  }
  if (changed) save('alerts', S.alerts);
}
function notify(head, body, id){
  toast('<b>' + esc(head) + '</b><br>' + esc(body), id);
  if (S.set.sound) beep();
  try{ if ('Notification' in window && Notification.permission === 'granted') new Notification('Bazaar: ' + head, {body}); }catch{}
}
let actx = null;
function beep(){
  try{
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'triangle'; o.frequency.value = 880;
    g.gain.setValueAtTime(.0001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.25, actx.currentTime + .02);
    g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + .4);
    o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + .42);
  }catch{}
}
function toast(html, id){
  const el = document.createElement('div');
  el.className = 'toast'; el.innerHTML = html;
  el.onclick = () => { el.remove(); if (id) openDetail(id); };
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 12000);
}
