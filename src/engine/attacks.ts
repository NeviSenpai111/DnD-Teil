/**
 * Pure derivation of weapon "attack lines" for the character sheet's Actions
 * tab: the to-hit bonus and damage string for a weapon, given the wielder's
 * ability modifiers and proficiency bonus. No UI, no content lookups.
 */

import type { Item } from "../data/types/item-content";
import { itemTypeCode } from "../data/types/item-content";
import type { Ability } from "./constants";
import { formatMod } from "./modifiers";

export interface AttackLine {
  name: string;
  /** "Melee", "Ranged", or a range string like "30/120 ft." */
  range: string;
  /** To-hit, formatted with sign, e.g. "+5". */
  hit: string;
  /** Damage expression, e.g. "1d8+3 slashing". */
  damage: string;
  /** Short descriptor, e.g. "Simple" or "Not proficient". */
  notes: string;
}

/** The leading letter of each of a weapon's property tags (e.g. "F" for finesse). */
function propertyCodes(item: Item): string[] {
  return (item.properties ?? []).map((p) => {
    const raw = typeof p === "string" ? p : ((p as { name?: string }).name ?? "");
    return raw.split("|")[0].toUpperCase();
  });
}

export function isWeapon(item: Item): boolean {
  const code = itemTypeCode(item.type);
  return item.weapon === true || code === "M" || code === "R";
}

/** Attack ability: ranged → Dex, finesse → the better of Str/Dex, else Str. */
export function weaponAbility(item: Item, mods: Record<Ability, number>): Ability {
  if (itemTypeCode(item.type) === "R") return "dex";
  if (propertyCodes(item).includes("F")) return mods.dex > mods.str ? "dex" : "str";
  return "str";
}

/** Proficient if the wielder's weapon proficiencies include its category or name. */
function weaponProficient(item: Item, weaponProfs: string[]): boolean {
  const profs = weaponProfs.map((p) => p.toLowerCase());
  return (
    (!!item.weaponCategory && profs.includes(item.weaponCategory.toLowerCase())) ||
    profs.includes(item.name.toLowerCase())
  );
}

export function weaponAttackLine(
  item: Item,
  mods: Record<Ability, number>,
  pb: number,
  weaponProfs: string[] = [],
): AttackLine {
  const mod = mods[weaponAbility(item, mods)];
  const proficient = weaponProficient(item, weaponProfs);
  const code = itemTypeCode(item.type);

  const damage = item.dmg1
    ? `${item.dmg1}${mod !== 0 ? formatMod(mod) : ""}${item.dmgType ? ` ${item.dmgType}` : ""}`
    : "—";
  const range = item.range ? `${item.range} ft.` : code === "R" ? "Ranged" : "Melee";
  const notes = [item.weaponCategory, proficient ? undefined : "Not proficient"]
    .filter(Boolean)
    .join(" · ");

  return { name: item.name, range, hit: formatMod(mod + (proficient ? pb : 0)), damage, notes };
}

/** The default Unarmed Strike (always proficient): 1 + Str modifier bludgeoning. */
export function unarmedStrikeLine(mods: Record<Ability, number>, pb: number): AttackLine {
  return {
    name: "Unarmed Strike",
    range: "Melee",
    hit: formatMod(mods.str + pb),
    damage: `${1 + mods.str} bludgeoning`,
    notes: "",
  };
}
