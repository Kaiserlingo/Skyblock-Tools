"""Erzeugt data/recipes.json aus dem NotEnoughUpdates-REPO.

Aufruf:  python tools/update_recipes.py <pfad-zum-NEU-items-ordner> [ausgabe.json]

Format: [[ergebnis_id, stückzahl, {zutat_id: menge, ...}], ...]
Die IDs werden auf die Bazaar-Schreibweise gebracht (z. B. SHARPNESS;5 -> ENCHANTMENT_SHARPNESS_5,
INK_SACK-3 -> INK_SACK:3). Ob ein Rezept wirklich komplett über den Bazaar läuft, prüft die
Website live anhand der aktuellen Bazaar-Produkte.
"""
import glob
import json
import os
import re
import sys

SLOTS = [a + b for a in "ABC" for b in "123"]


def norm(item_id: str) -> str:
    if ";" in item_id:
        name, level = item_id.split(";", 1)
        return f"ENCHANTMENT_{name}_{level}"
    m = re.match(r"^(.*)-(\d+)$", item_id)
    if m:
        return f"{m.group(1)}:{m.group(2)}"
    return item_id


def main() -> None:
    items_dir = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else "data/recipes.json"
    recipes = {}

    def add(output_id, recipe, count):
        ingredients = {}
        for slot in SLOTS:
            value = recipe.get(slot, "")
            if not value:
                continue
            if ":" in value:
                iid, qty = value.rsplit(":", 1)
                qty = float(qty)
            else:
                iid, qty = value, 1.0
            iid = norm(iid)
            ingredients[iid] = ingredients.get(iid, 0) + qty
        if not ingredients:
            return
        output_id = norm(output_id)
        if output_id in ingredients:
            return
        key = (output_id, json.dumps(sorted(ingredients.items())))
        recipes[key] = [output_id, count, {k: (int(v) if v == int(v) else v) for k, v in ingredients.items()}]

    for path in glob.glob(os.path.join(items_dir, "*.json")):
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception:
            continue
        output_id = data.get("internalname", os.path.basename(path)[:-5])
        if isinstance(data.get("recipe"), dict):
            add(output_id, data["recipe"], int(data["recipe"].get("count") or 1))
        for recipe in data.get("recipes", []):
            if recipe.get("type") == "crafting":
                add(recipe.get("overrideOutputId", output_id), recipe, int(recipe.get("count") or 1))

    result = [recipes[k] for k in sorted(recipes)]
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(result, fh, separators=(",", ":"))
    print(f"{len(result)} Rezepte -> {out_path}")


if __name__ == "__main__":
    main()
