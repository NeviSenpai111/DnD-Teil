/**
 * Spell-slot progressions and spellcasting math. Slot tables are indexed by
 * character level; each row lists slots for spell levels 1..9. Warlock Pact
 * Magic is a separate track (a few slots that are all the same level).
 */

import type { CasterProgression } from "../data/types/class-content";
import { spellAttackBonus, spellSaveDc } from "./modifiers";

export type SlotRow = number[]; // index 0 => level-1 slots, ... index 8 => level-9

/** Full caster (Wizard, Cleric, ...). Index by character level (1..20). */
const FULL: SlotRow[] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Half caster (Paladin, Ranger). No slots at level 1. */
const HALF: SlotRow[] = [
  [],
  [2],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2],
];

/** Third caster (Eldritch Knight, Arcane Trickster). Starts at level 3. */
const THIRD: SlotRow[] = [
  [],
  [],
  [2],
  [3],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
];

/**
 * Artificer: a half caster that rounds *up*, so unlike Paladin/Ranger it already
 * has 1st-level slots at level 1. From level 2 on its table matches the half
 * caster's, so reuse HALF with level 1 patched to two 1st-level slots.
 */
const ARTIFICER: SlotRow[] = HALF.map((row, i) => (i === 0 ? [2] : row));

const TABLES: Record<"full" | "1/2" | "1/3" | "artificer", SlotRow[]> = {
  full: FULL,
  "1/2": HALF,
  "1/3": THIRD,
  artificer: ARTIFICER,
};

/** Spell slots per spell level for a single-class caster. */
export function spellSlots(progression: CasterProgression, level: number): SlotRow {
  if (progression === "pact") return [];
  const table = TABLES[progression as "full" | "1/2" | "1/3" | "artificer"];
  if (!table) return [];
  return table[Math.min(Math.max(1, level), 20) - 1] ?? [];
}

/**
 * Levels a class contributes to the shared multiclass caster level: full
 * casters count every level, half casters round down (the artificer rounds
 * up), third casters divide by three; Pact Magic contributes nothing.
 */
export function casterLevelContribution(progression: CasterProgression, level: number): number {
  switch (progression) {
    case "full":
      return level;
    case "1/2":
      return Math.floor(level / 2);
    case "artificer":
      return Math.ceil(level / 2);
    case "1/3":
      return Math.floor(level / 3);
    default:
      return 0;
  }
}

/**
 * Shared spell slots for one or more spellcasting classes. A single caster
 * uses its own class table; two or more share the full-caster table at their
 * combined caster level (the multiclass spellcaster rule).
 */
export function multiclassSpellSlots(
  casters: { progression: CasterProgression; level: number }[],
): SlotRow {
  const slotted = casters.filter((c) => c.progression !== "pact");
  if (slotted.length === 0) return [];
  if (slotted.length === 1) return spellSlots(slotted[0].progression, slotted[0].level);
  const combined = slotted.reduce((sum, c) => sum + casterLevelContribution(c.progression, c.level), 0);
  return combined > 0 ? (FULL[Math.min(combined, 20) - 1] ?? []) : [];
}

/** Cantrip damage-dice multiplier by CHARACTER level (scales at 5/11/17). */
export function cantripDiceMultiplier(characterLevel: number): number {
  return characterLevel >= 17 ? 4 : characterLevel >= 11 ? 3 : characterLevel >= 5 ? 2 : 1;
}

/**
 * A cantrip's damage dice scaled to the character's level, read from the
 * first `{@damage NdX}` tag in its text (e.g. "1d8" -> "2d8" at level 5).
 * Undefined below level 5, for leveled spells, or when no dice tag exists.
 */
export function scaledCantripDice(
  spell: { level: number; entries?: unknown[] },
  characterLevel: number,
): string | undefined {
  if (spell.level !== 0) return undefined;
  const multiplier = cantripDiceMultiplier(characterLevel);
  if (multiplier === 1) return undefined;
  const parts: string[] = [];
  const walk = (entry: unknown) => {
    if (typeof entry === "string") parts.push(entry);
    else if (Array.isArray(entry)) entry.forEach(walk);
    else if (entry && typeof entry === "object") walk((entry as { entries?: unknown }).entries);
  };
  walk(spell.entries);
  const m = parts.join(" ").match(/\{@damage (\d+)d(\d+)\}/);
  if (!m) return undefined;
  return `${Number(m[1]) * multiplier}d${m[2]}`;
}

export interface PactSlots {
  count: number;
  slotLevel: number;
}

/** Warlock Pact Magic: a small number of slots, all of the same level. */
export function pactSlots(level: number): PactSlots {
  const lvl = Math.min(Math.max(1, level), 20);
  const count = lvl >= 17 ? 4 : lvl >= 11 ? 3 : lvl >= 2 ? 2 : 1;
  const slotLevel = Math.min(5, Math.ceil(lvl / 2));
  return { count, slotLevel };
}

export interface SpellcastingSummary {
  ability: string;
  saveDc: number;
  attackBonus: number;
  /** Standard slots per spell level (1..9). Empty for pact-only casters. */
  slots: SlotRow;
  pact?: PactSlots;
  /** Highest spell level the caster can currently cast (0 = cantrips only). */
  maxSpellLevel: number;
}

export function deriveSpellcasting(input: {
  progression: CasterProgression;
  level: number;
  abilityScore: number;
  pb: number;
  ability: string;
}): SpellcastingSummary {
  const slots = spellSlots(input.progression, input.level);
  const pact = input.progression === "pact" ? pactSlots(input.level) : undefined;
  const maxFromSlots = slots.length;
  const maxSpellLevel = Math.max(maxFromSlots, pact?.slotLevel ?? 0);

  return {
    ability: input.ability,
    saveDc: spellSaveDc(input.abilityScore, input.pb),
    attackBonus: spellAttackBonus(input.abilityScore, input.pb),
    slots,
    pact,
    maxSpellLevel,
  };
}
