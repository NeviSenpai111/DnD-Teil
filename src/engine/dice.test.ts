import { describe, expect, it } from "vitest";
import { rollD20, rollDamage, rollDie } from "./dice";

/** An rng that returns the given values in order (0..1 range). */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("rollDie", () => {
  it("maps the rng range onto 1..sides", () => {
    expect(rollDie(20, () => 0)).toBe(1);
    expect(rollDie(20, () => 0.999)).toBe(20);
    expect(rollDie(6, () => 0.5)).toBe(4);
  });
});

describe("rollD20", () => {
  it("adds the modifier to a single die", () => {
    const r = rollD20(3, "normal", seq(0.5)); // d20 -> 11
    expect(r).toEqual({ rolls: [11], kept: 11, modifier: 3, total: 14 });
  });

  it("keeps the higher die with advantage and the lower with disadvantage", () => {
    const adv = rollD20(0, "advantage", seq(0.1, 0.9)); // 3, 19
    expect(adv.rolls).toEqual([3, 19]);
    expect(adv.total).toBe(19);

    const dis = rollD20(0, "disadvantage", seq(0.1, 0.9));
    expect(dis.total).toBe(3);
  });
});

describe("rollDamage", () => {
  it("rolls the dice term and adds the flat modifier", () => {
    const r = rollDamage("2d6+3 fire", seq(0.5, 0.999)); // 4, 6
    expect(r).toEqual({ rolls: [4, 6], modifier: 3, total: 13 });
  });

  it("handles the typographic minus from formatMod", () => {
    expect(rollDamage("1d8−1 slashing", seq(0.999))?.total).toBe(7);
  });

  it("returns undefined for expressions without dice", () => {
    expect(rollDamage("1 bludgeoning")).toBeUndefined();
  });
});
