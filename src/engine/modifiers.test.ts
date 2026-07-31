import { describe, expect, it } from "vitest";
import {
  abilityMod,
  baseArmorClass,
  formatMod,
  initiativeMod,
  passiveScore,
  pointBuyCost,
  proficiencyBonus,
  saveMod,
  skillMod,
  spellAttackBonus,
  spellSaveDc,
} from "./modifiers";

describe("abilityMod", () => {
  it.each([
    [1, -5],
    [8, -1],
    [10, 0],
    [11, 0],
    [14, 2],
    [15, 2],
    [20, 5],
  ])("score %i -> %i", (score, mod) => {
    expect(abilityMod(score)).toBe(mod);
  });
});

describe("proficiencyBonus", () => {
  it.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [9, 4],
    [13, 5],
    [17, 6],
    [20, 6],
  ])("level %i -> +%i", (level, pb) => {
    expect(proficiencyBonus(level)).toBe(pb);
  });
});

describe("formatMod", () => {
  it("signs modifiers", () => {
    expect(formatMod(3)).toBe("+3");
    expect(formatMod(0)).toBe("+0");
    expect(formatMod(-1)).toBe("−1");
  });
});

describe("saves and skills", () => {
  it("adds PB only when proficient", () => {
    expect(saveMod(14, { proficient: false, pb: 2 })).toBe(2);
    expect(saveMod(14, { proficient: true, pb: 2 })).toBe(4);
  });

  it("doubles PB for expertise", () => {
    expect(skillMod(14, { proficient: true, pb: 2 })).toBe(4);
    expect(skillMod(14, { proficient: true, expertise: true, pb: 2 })).toBe(6);
    expect(skillMod(14, { proficient: false, pb: 2 })).toBe(2);
  });
});

describe("spellcasting math", () => {
  it("computes DC and attack from ability + PB", () => {
    expect(spellSaveDc(16, 2)).toBe(13); // 8 + 2 + 3
    expect(spellAttackBonus(16, 2)).toBe(5); // 2 + 3
  });
});

describe("misc derived stats", () => {
  it("passive score is 10 + skill mod", () => {
    expect(passiveScore(3)).toBe(13);
  });
  it("initiative and base AC use Dex", () => {
    expect(initiativeMod(14)).toBe(2);
    expect(baseArmorClass(14)).toBe(12);
  });
});

describe("pointBuyCost", () => {
  it("sums standard-array-style buys and rejects out-of-range", () => {
    expect(pointBuyCost({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 })).toBe(27);
    expect(pointBuyCost({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })).toBe(0);
    expect(pointBuyCost({ str: 16, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })).toBe(Infinity);
  });
});
