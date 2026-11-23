'use strict';
/* =========================================================
   Konfiguration – alle externen Adressen an einer Stelle.
   Die eigenen Daten (market.json, prices.json, bazaar_stats.json) baut die Pipeline
   (tools/, GitHub Actions) und legt sie auf den Branch „data“.
   ========================================================= */
const CFG = {
  data: 'https://raw.githubusercontent.com/Kaiserlingo/Skyblock-Tools/data/',   // eigene Daten (Branch „data“)
  hypixel: 'https://api.hypixel.net/v2/',                                     // Hypixel (ohne Schlüssel)
  cofl: 'https://sky.coflnet.com/api/',                                       // SkyCofl: Verläufe, Verkäufe
  icons: 'https://sky.coflnet.com/static/icon/',                              // Item-Bilder
};
