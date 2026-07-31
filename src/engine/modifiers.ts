/** Pure D&D 5e derived-stat math. No UI, no data access. */

import { POINT_BUY_COST, type AbilityScores } from "./constants";

/** Ability modifier: floor((score - 10) / 2). */
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Proficiency bonus by character level: 2 + floor((level - 1) / 4). */
export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

/** Format a modifier with an explicit sign, e.g. 3 -> "+3", -1 -> "−1". */
export function formatMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`;
}

/** Saving throw modifier for one ability. */
export function saveMod(score: number, opts: { proficient: boolean; pb: number }): number {
  return abilityMod(score) + (opts.proficient ? opts.pb : 0);
}

/** Skill modifier, including expertise (double proficiency). */
export function skillMod(
  score: number,
  opts: { proficient: boolean; expertise?: boolean; pb: number },
): number {
  const bonus = opts.expertise ? opts.pb * 2 : opts.proficient ? opts.pb : 0;
  return abilityMod(score) + bonus;
}

/** Spell save DC: 8 + PB + spellcasting ability modifier. */
export function spellSaveDc(spellAbilityScore: number, pb: number): number {
  return 8 + pb + abilityMod(spellAbilityScore);
}

/** Spell attack bonus: PB + spellcasting ability modifier. */
export function spellAttackBonus(spellAbilityScore: number, pb: number): number {
  return pb + abilityMod(spellAbilityScore);
}

/** Passive score (e.g. Passive Perception): 10 + the relevant skill modifier. */
export function passiveScore(skillModifier: number): number {
  return 10 + skillModifier;
}

/** Initiative modifier (Dexterity, before feats/features). */
export function initiativeMod(dexScore: number): number {
  return abilityMod(dexScore);
}

/** Unarmored AC with no class features: 10 + Dex modifier. */
export function baseArmorClass(dexScore: number): number {
  return 10 + abilityMod(dexScore);
}

/** Total point-buy cost for a set of scores. Scores outside 8–15 cost Infinity. */
export function pointBuyCost(scores: AbilityScores): number {
  return Object.values(scores).reduce((sum, score) => sum + (POINT_BUY_COST[score] ?? Infinity), 0);
}
