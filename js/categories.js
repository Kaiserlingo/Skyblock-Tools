'use strict';
/* =========================================================
   Kategorien für jedes SkyBlock-Item (englische SkyBlock-Begriffe)
   Rohstoffe: nach Skill bzw. Herkunft (Mining, Farming, Combat, …),
   Ausrüstung: nach Art (Weapons, Armor, Accessories, …).
   Grundlage: Hypixel-Item-Daten (category, dungeon_item, origin), Sammlungen
   (collections) und Rezepte (ein Item gehört dahin, woraus es überwiegend gemacht wird).
   Läuft im Browser (window.Categories) und in Node (Datenpipeline, Tests).
   ========================================================= */
(function(root){
const CATS = {
  MINING: 'Mining', FARMING: 'Farming', COMBAT: 'Combat', FORAGING: 'Foraging', FISHING: 'Fishing',
  HUNTING: 'Hunting', SLAYER: 'Slayer', DUNGEONS: 'Dungeons', RIFT: 'Rift',
  ENCHANTMENTS: 'Enchantments', ESSENCES: 'Essences', REFORGES: 'Reforge Stones', OTHER_RES: 'Oddities',
  WEAPONS: 'Weapons', ARMOR: 'Armor', EQUIPMENT: 'Equipment', ACCESSORIES: 'Accessories', TOOLS: 'Tools',
  PETS: 'Pets', COSMETICS: 'Cosmetics', RUNES: 'Runes', MISC: 'Miscellaneous',
};
// Reihenfolge in Listen und Auswahlfeldern
const ORDER = ['MINING', 'FARMING', 'COMBAT', 'FORAGING', 'FISHING', 'HUNTING', 'SLAYER', 'DUNGEONS', 'RIFT', 'ENCHANTMENTS', 'ESSENCES', 'REFORGES', 'OTHER_RES',
               'WEAPONS', 'ARMOR', 'EQUIPMENT', 'ACCESSORIES', 'TOOLS', 'PETS', 'COSMETICS', 'RUNES', 'MISC'];
// Ausrüstung nach Hypixel-Kategorie
const GEAR = {
  SWORD: 'WEAPONS', LONGSWORD: 'WEAPONS', BOW: 'WEAPONS', WAND: 'WEAPONS', GAUNTLET: 'WEAPONS', ARROW: 'WEAPONS', DEPLOYABLE: 'WEAPONS',
  HELMET: 'ARMOR', CHESTPLATE: 'ARMOR', LEGGINGS: 'ARMOR', BOOTS: 'ARMOR',
  NECKLACE: 'EQUIPMENT', CLOAK: 'EQUIPMENT', BELT: 'EQUIPMENT', GLOVES: 'EQUIPMENT', BRACELET: 'EQUIPMENT',
  ACCESSORY: 'ACCESSORIES',
  AXE: 'TOOLS', PICKAXE: 'TOOLS', DRILL: 'TOOLS', FARMING_TOOL: 'TOOLS', FISHING_ROD: 'TOOLS', FISHING_ROD_PART: 'TOOLS', SHEARS: 'TOOLS', SPADE: 'TOOLS',
  CHISEL: 'TOOLS', VACUUM: 'TOOLS', WATERING_CAN: 'TOOLS', FISHING_NET: 'TOOLS', LASSO: 'TOOLS', TRAP: 'TOOLS',
  PET: 'PETS', PET_ITEM: 'PETS', COSMETIC: 'COSMETICS', CARNIVAL_MASK: 'COSMETICS',
  REFORGE_STONE: 'REFORGES', MUTATION: 'FARMING', GARDEN_CHIP: 'FARMING', BAIT: 'FISHING', SALT: 'FISHING', ARROW_POISON: 'COMBAT',
};
// Slayer-Drops (die Ausgangsstoffe; was daraus gecraftet wird, folgt über die Rezepte)
const SLAYER = ['REVENANT_FLESH', 'FOUL_FLESH', 'UNDEAD_CATALYST', 'REVENANT_VISCERA', 'TARANTULA_WEB', 'TARANTULA_SILK', 'TOXIC_ARROW_POISON', 'FLY_SWATTER',
  'WOLF_TOOTH', 'GOLDEN_TOOTH', 'GRIZZLY_BAIT', 'HAMSTER_WHEEL', 'NULL_SPHERE', 'NULL_OVOID', 'NULL_ATOM', 'TWILIGHT_ARROW_POISON', 'ENDERSNAKE_RUNE',
  'DERELICT_ASHE', 'MOLTEN_POWDER', 'LUMINO_FIBER', 'KELVIN_INVERTER', 'WHIPPED_MAGMA_CREAM', 'COVEN_SEAL', 'UNFANGED_VAMPIRE_PART'];

function make(hyItems, collections, recipes){
  const hy = {}; for (const it of hyItems || []) hy[it.id] = it;
  const coll = {}; for (const type in collections || {}) for (const id in (collections[type].items || {})) coll[id] = type === 'RIFT' ? 'RIFT' : type;
  const byOut = new Map(); for (const [o, , ins] of recipes || []){ if (!byOut.has(o)) byOut.set(o, []); byOut.get(o).push(ins); }
  const slayer = new Set(SLAYER), memo = {};
  const res = {FARMING: 1, MINING: 1, COMBAT: 1, FORAGING: 1, FISHING: 1, RIFT: 1};

  function direct(id){
    const it = hy[id] || {};
    if (id.startsWith('ENCHANTMENT_')) return 'ENCHANTMENTS';
    if (id.startsWith('ESSENCE_')) return 'ESSENCES';
    if (id.startsWith('SHARD_')) return 'HUNTING';
    if (id.startsWith('RUNE_') || id.startsWith('UNIQUE_RUNE_') || id === 'RUNE') return 'RUNES';
    if (id.startsWith('PET_SKIN_') || id.startsWith('DYE_')) return 'COSMETICS';
    if (id.startsWith('PET_ITEM_') || (id.startsWith('PET_') && !hy[id])) return 'PETS';
    if (slayer.has(id)) return 'SLAYER';
    if (it.origin === 'RIFT') return 'RIFT';
    if (coll[id]) return coll[id];
    if (it.dungeon_item) return it.category && GEAR[it.category] && !res[GEAR[it.category]] ? GEAR[it.category] : 'DUNGEONS';
    if (it.category && GEAR[it.category]) return GEAR[it.category];
    if (/_GEM$/.test(id) && /^(ROUGH|FLAWED|FINE|FLAWLESS|PERFECT)_/.test(id)) return 'MINING';
    return null;
  }
  // Rohstoffe ohne eigene Einordnung: Sektor der wichtigsten Zutat (nach Menge), rekursiv
  function cat(id, depth = 0, stack = new Set()){
    if (memo[id]) return memo[id];
    let c = direct(id);
    if (!c && depth < 6 && byOut.has(id) && !stack.has(id)){
      stack.add(id); const score = {};
      for (const ins of byOut.get(id)) for (const ing in ins){
        const x = cat(ing, depth + 1, stack);
        if (x && x !== 'OTHER_RES' && x !== 'MISC' && x !== 'ENCHANTMENTS') score[x] = (score[x] || 0) + ins[ing];
      }
      stack.delete(id);
      const best = Object.entries(score).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
      if (best) c = best[0];
    }
    if (!c) c = hy[id] && hy[id].category && hy[id].category !== 'NONE' ? 'MISC' : 'OTHER_RES';
    if (depth === 0) memo[id] = c;
    return c;
  }
  return id => cat(id);
}

const API = {CATS, ORDER, GEAR, SLAYER, make, label: k => CATS[k] || k};
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Categories = API;
})(typeof window !== 'undefined' ? window : globalThis);
