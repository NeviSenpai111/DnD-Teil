/** Hit-point math, single- and multiclass. */

import { dieAverage } from "./dice";

export interface HpInput {
  hitDieFaces: number;
  conMod: number;
  level: number;
  mode: "average" | "rolled";
  /** Per-level rolls for levels 2..N (index 0 = level 2). Used when mode = "rolled". */
  rolls?: number[];
}

/**
 * Max HP: at level 1 you get the full hit die plus Con mod; each level after adds
 * either the die average (rounded up) or a roll, plus Con mod. A level never adds
 * less than 1 HP.
 */
export function maxHp(input: HpInput): number {
  const { hitDieFaces, conMod, level, mode, rolls } = input;
  return maxHpMulticlass({
    classes: [{ hitDieFaces, level }],
    conMod,
    mode,
    rolls,
  });
}

export interface MulticlassHpInput {
  /** In class order; the FIRST class's first level grants the full die. */
  classes: { hitDieFaces: number; level: number }[];
  conMod: number;
  mode: "average" | "rolled";
  /** Rolls for every level after the first, in class order (index 0 = the
   * character's 2nd overall level). */
  rolls?: number[];
}

/**
 * Multiclass max HP: the first level of the FIRST class grants the full die +
 * Con; every other level of any class adds that class's die average (rounded
 * up) or a roll, plus Con. A level never adds less than 1 HP.
 */
export function maxHpMulticlass(input: MulticlassHpInput): number {
  const { classes, conMod, mode, rolls } = input;
  if (classes.length === 0) return 0;

  let hp = classes[0].hitDieFaces + conMod;
  let overall = 1; // overall character level already counted
  classes.forEach((cls, i) => {
    const avg = dieAverage(cls.hitDieFaces);
    const startLevel = i === 0 ? 2 : 1; // first class's level 1 is the full die
    for (let lvl = startLevel; lvl <= cls.level; lvl++) {
      const base = mode === "rolled" ? (rolls?.[overall - 1] ?? avg) : avg;
      hp += Math.max(1, base + conMod);
      overall += 1;
    }
  });
  return hp;
}
