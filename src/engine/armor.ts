/** Armor Class calculation from equipped armor + shield. */

import type { Ability } from "./constants";

export interface ArmorPiece {
  /** Base AC value of the armor. */
  ac: number;
  /** Armor category: "LA" light, "MA" medium, "HA" heavy. */
  category: "LA" | "MA" | "HA";
  /** Max Dex bonus allowed (defaults: light = ∞, medium = 2, heavy = 0). */
  dexterityMax?: number;
}

function dexCapFor(piece: ArmorPiece): number {
  if (piece.dexterityMax != null) return piece.dexterityMax;
  if (piece.category === "HA") return 0;
  if (piece.category === "MA") return 2;
  return Infinity;
}

/**
 * Armor Class. With armor, base = armor.ac + min(dexMod, cap). Without armor it
 * is 10 + dexMod (unarmored-defense features are not modeled here). A shield and
 * any miscellaneous bonus are added on top.
 */
export function armorClass(opts: {
  dexMod: number;
  armor?: ArmorPiece;
  shield?: boolean;
  bonus?: number;
}): number {
  const base = opts.armor
    ? opts.armor.ac + Math.min(opts.dexMod, dexCapFor(opts.armor))
    : 10 + opts.dexMod;
  return base + (opts.shield ? 2 : 0) + (opts.bonus ?? 0);
}

/**
 * An alternative AC formula available while unarmored — Unarmored Defense
 * (Barbarian 10+Dex+Con, Monk 10+Dex+Wis), Draconic Resilience (13+Dex), ….
 * Detected from feature text by `engine/acFormulas.ts`.
 */
export interface UnarmoredFormula {
  /** The granting feature's name, e.g. "Unarmored Defense". */
  name: string;
  base: number;
  /** Ability modifiers added on top (Dex included when the text names it). */
  abilities: Ability[];
  /** Monk-style formulas are lost while wielding a shield. */
  allowShield: boolean;
}

/**
 * The best of the competing AC formulas: worn armor uses only the armored
 * formula; otherwise 10+Dex competes with every unarmored formula (skipping
 * shield-incompatible ones when a shield is worn). Shield +2 and the misc
 * bonus apply on top.
 */
export function bestArmorClass(opts: {
  mods: Record<Ability, number>;
  armor?: ArmorPiece;
  shield?: boolean;
  bonus?: number;
  unarmored?: UnarmoredFormula[];
}): number {
  const shieldBonus = opts.shield ? 2 : 0;
  const candidates: number[] = [];
  if (opts.armor) {
    candidates.push(opts.armor.ac + Math.min(opts.mods.dex, dexCapFor(opts.armor)) + shieldBonus);
  } else {
    candidates.push(10 + opts.mods.dex + shieldBonus);
    for (const f of opts.unarmored ?? []) {
      if (opts.shield && !f.allowShield) continue;
      candidates.push(f.base + f.abilities.reduce((sum, ab) => sum + opts.mods[ab], 0) + shieldBonus);
    }
  }
  return Math.max(...candidates) + (opts.bonus ?? 0);
}
