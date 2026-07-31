/** Minimal dice utilities. Randomness is injectable so rolls are testable. */

export type Rng = () => number;

export function rollDie(sides: number, rng: Rng = Math.random): number {
  return 1 + Math.floor(rng() * sides);
}

/** Roll 4d6 and drop the lowest die — the classic ability-score roll. */
export function roll4d6DropLowest(rng: Rng = Math.random): number {
  const dice = [rollDie(6, rng), rollDie(6, rng), rollDie(6, rng), rollDie(6, rng)].sort(
    (a, b) => a - b,
  );
  return dice[1] + dice[2] + dice[3];
}

/** Average value of a die rounded up (used for "take average" HP). */
export function dieAverage(sides: number): number {
  return Math.floor(sides / 2) + 1;
}

export type RollMode = "normal" | "advantage" | "disadvantage";

export interface D20Roll {
  /** Both dice under advantage/disadvantage, one die otherwise. */
  rolls: number[];
  /** The die that counts. */
  kept: number;
  modifier: number;
  total: number;
}

/** A d20 test: one die, or two keeping the higher (adv) / lower (dis). */
export function rollD20(modifier: number, mode: RollMode = "normal", rng: Rng = Math.random): D20Roll {
  const rolls = mode === "normal" ? [rollDie(20, rng)] : [rollDie(20, rng), rollDie(20, rng)];
  const kept = mode === "disadvantage" ? Math.min(...rolls) : Math.max(...rolls);
  return { rolls, kept, modifier, total: kept + modifier };
}

export interface DamageRoll {
  rolls: number[];
  modifier: number;
  total: number;
}

/**
 * Roll the first dice term of a damage expression like "1d8+3 slashing" or
 * "2d6". Returns undefined when there is no dice term (e.g. "1 bludgeoning").
 * Accepts both "-" and the typographic "−" for the flat modifier.
 */
export function rollDamage(expr: string, rng: Rng = Math.random): DamageRoll | undefined {
  const m = expr.match(/(\d+)d(\d+)\s*(?:([+−-])\s*(\d+))?/);
  if (!m) return undefined;
  const count = Math.min(Number(m[1]), 40);
  const rolls = Array.from({ length: count }, () => rollDie(Number(m[2]), rng));
  const modifier = m[4] ? (m[3] === "+" ? 1 : -1) * Number(m[4]) : 0;
  return { rolls, modifier, total: rolls.reduce((a, b) => a + b, 0) + modifier };
}
