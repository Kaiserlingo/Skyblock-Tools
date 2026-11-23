"""Prüft js/categories.js mit kleinen, eindeutigen Beispielen."""
import json, subprocess, os
HERE = os.path.dirname(os.path.abspath(__file__)); CAT = os.path.join(HERE, '..', 'js', 'lib', 'categories.js')
js = r"""
const C = require(%s);
const f = C.make([{id:'IRON_SWORD_X',category:'SWORD'},{id:'X_BOOSTER',category:'BOOSTER'},{id:'D1',dungeon_item:true},{id:'D2',dungeon_item:true,category:'HELMET'},
  {id:'RIFTY',origin:'RIFT'},{id:'STRING',rift_transferrable:true},{id:'NECK',category:'NECKLACE'},{id:'TALI',category:'ACCESSORY'},{id:'DRILLX',category:'DRILL'},{id:'RSTONE',category:'REFORGE_STONE'}],
  {MINING:{items:{DIAMOND:{},COAL:{}}},FARMING:{items:{WHEAT:{},MUSHROOM_COLLECTION:{}}},COMBAT:{items:{STRING:{}}},RIFT:{items:{WILTED_BERBERIS:{}}}},
  [['ENCHANTED_DIAMOND',1,{DIAMOND:160}],['ENCHANTED_DIAMOND_BLOCK',1,{ENCHANTED_DIAMOND:160}],['MIX',1,{ENCHANTED_DIAMOND:1,WHEAT:5}],['LOOP_A',1,{LOOP_B:1}],['LOOP_B',1,{LOOP_A:1}],
   ['ENCHANTED_BROWN_MUSHROOM',1,{BROWN_MUSHROOM:160}],['REVENANT_VISCERA',1,{REVENANT_FLESH:128,STRING:32}],['BOOK_MIX',1,{ENCHANTMENT_SHARPNESS_5:1,COAL:2}]]);
const t = [['ENCHANTED_DIAMOND','MINING'],['ENCHANTED_DIAMOND_BLOCK','MINING'],['MIX','FARMING'],['IRON_SWORD_X','WEAPONS'],['X_BOOSTER','ODDITIES'],['D1','DUNGEONS'],
  ['D2','ARMOR'],['RIFTY','RIFT'],['STRING','COMBAT'],['NECK','EQUIPMENT'],['TALI','ACCESSORIES'],['DRILLX','TOOLS'],['RSTONE','REFORGES'],['ENCHANTMENT_SHARPNESS_5','ENCHANTMENTS'],
  ['ESSENCE_GOLD','ESSENCES'],['SHARD_BAL','HUNTING'],['LOOP_A','ODDITIES'],['PET_SILVERFISH','PETS'],['PET_ITEM_TOY_JERRY','PETS'],['PET_SKIN_X','COSMETICS'],['DYE_JADE','COSMETICS'],
  ['RUNE_ZAP','RUNES'],['FINE_RUBY_GEM','MINING'],['WINTER_WATER_ORB','FISHING'],['SHARK_BAIT','FISHING'],['REVENANT_FLESH','SLAYER'],['REVENANT_VISCERA','SLAYER'],
  ['ENCHANTED_BROWN_MUSHROOM','FARMING'],['WILTED_BERBERIS','RIFT'],['UGLY_FOSSIL','MINING'],['KISMET_FEATHER','DUNGEONS'],['SUMMONING_EYE','COMBAT'],['BOOK_MIX','MINING'],['UNKNOWN_THING','ODDITIES']];
console.log(JSON.stringify({n: t.length, bad: t.filter(([i, e]) => f(i) !== e).map(([i, e]) => [i, e, f(i)]), order: C.ORDER.every(k => C.CATS[k]) && C.ORDER.length === Object.keys(C.CATS).length,
  english: Object.values(C.CATS).every(l => /^[A-Za-z ]+$/.test(l))}));
""" % json.dumps(CAT)
r = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
fails = r['bad'] + ([] if r['order'] else ['Reihenfolge/Labels unvollständig']) + ([] if r['english'] else ['nicht alle Labels englisch'])
print(f"geprüft: {r['n'] + 2}, Fehler: {len(fails)}")
for f in fails: print('  ', f)
