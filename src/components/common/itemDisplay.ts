/**
 * Shared display helpers for 5eTools items: type-code labels, category lines,
 * icons and stat formatting. Used by the Equipment builder page and the
 * browser's item detail view.
 */

import { itemTypeCode, type Item } from "../../data/types/item-content";
import { isWeapon } from "../../engine/attacks";

export const TYPE_LABELS: Record<string, string> = {
  G: "Adventuring Gear",
  A: "Ammunition",
  AF: "Ammunition",
  AT: "Artisan's Tools",
  T: "Tools",
  INS: "Instrument",
  GS: "Gaming Set",
  LA: "Light Armor",
  MA: "Medium Armor",
  HA: "Heavy Armor",
  S: "Shield",
  M: "Melee Weapon",
  R: "Ranged Weapon",
  P: "Potion",
  SC: "Scroll",
  W: "Wondrous Item",
  RG: "Ring",
  RD: "Rod",
  WD: "Wand",
  FD: "Food & Drink",
  TG: "Trade Good",
  MNT: "Mount",
  VEH: "Vehicle",
  SHP: "Ship",
  TAH: "Tack & Harness",
  EXP: "Explosive",
};

/** Damage type codes on `dmgType`, e.g. "S" -> "slashing". */
export const DAMAGE_TYPES: Record<string, string> = {
  A: "acid",
  B: "bludgeoning",
  C: "cold",
  F: "fire",
  O: "force",
  L: "lightning",
  N: "necrotic",
  P: "piercing",
  I: "poison",
  Y: "psychic",
  R: "radiant",
  S: "slashing",
  T: "thunder",
};

/** Weapon property codes in `property`, e.g. "V" -> "Versatile". */
export const PROPERTY_LABELS: Record<string, string> = {
  "2H": "Two-Handed",
  A: "Ammunition",
  AF: "Ammunition (firearm)",
  BF: "Burst Fire",
  F: "Finesse",
  H: "Heavy",
  L: "Light",
  LD: "Loading",
  R: "Reach",
  RLD: "Reload",
  S: "Special",
  T: "Thrown",
  V: "Versatile",
};

export function categoryLine(item?: Item): string {
  if (!item) return "Gear";
  const code = itemTypeCode(item.type);
  const specific = (code && TYPE_LABELS[code]) || undefined;
  const broad = isWeapon(item)
    ? "Weapon"
    : code === "LA" || code === "MA" || code === "HA" || code === "S"
      ? "Armor"
      : "Gear";
  return specific && specific !== broad ? `${broad} · ${specific}` : broad;
}

export function itemIcon(item?: Item): string {
  if (!item) return "🎒";
  const code = itemTypeCode(item.type);
  if (isWeapon(item)) return "⚔️";
  if (code === "LA" || code === "MA" || code === "HA" || code === "S") return "🛡️";
  return "🎒";
}

export function formatWeight(lb: number): string {
  const rounded = Math.round(lb * 100) / 100;
  return `${rounded} lb`;
}

/** 5eTools item `value` is in copper pieces; show the largest sensible coin. */
export function formatValue(cp: number): string {
  if (cp % 100 === 0) return `${cp / 100} gp`;
  if (cp % 10 === 0) return `${cp / 10} sp`;
  return `${cp} cp`;
}

/** Property codes may be "V", "V|XPHB" or wrapped objects; extract the label. */
export function propertyLabels(properties: unknown[] | undefined): string[] {
  return (properties ?? [])
    .map((p) => {
      const raw = typeof p === "string" ? p : (p as { uid?: string })?.uid;
      const code = raw?.split("|")[0];
      return code ? (PROPERTY_LABELS[code] ?? code) : undefined;
    })
    .filter((s): s is string => !!s);
}
