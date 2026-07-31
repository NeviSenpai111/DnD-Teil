import { describe, expect, it } from "vitest";
import { maxHp, maxHpMulticlass } from "./hp";

describe("maxHp", () => {
  it("level 1 is full hit die + Con mod", () => {
    expect(maxHp({ hitDieFaces: 10, conMod: 2, level: 1, mode: "average" })).toBe(12);
    expect(maxHp({ hitDieFaces: 8, conMod: 0, level: 1, mode: "average" })).toBe(8);
  });

  it("adds the die average + Con mod per level after 1st", () => {
    // d10 average is 6. L3: 12 + (6+2) + (6+2) = 28.
    expect(maxHp({ hitDieFaces: 10, conMod: 2, level: 3, mode: "average" })).toBe(28);
  });

  it("uses rolls when mode is rolled", () => {
    // L3 rolls [7, 9]: 12 + (7+2) + (9+2) = 32.
    expect(maxHp({ hitDieFaces: 10, conMod: 2, level: 3, mode: "rolled", rolls: [7, 9] })).toBe(32);
  });

  it("never gains less than 1 HP at a level", () => {
    // d6 average 4, Con mod -5 -> would be -1, clamped to 1 each level after 1st.
    expect(maxHp({ hitDieFaces: 6, conMod: -5, level: 2, mode: "average" })).toBe(1 + 1);
  });
});

describe("maxHpMulticlass", () => {
  it("only the FIRST class's first level grants the full die", () => {
    // Warden d10 L3 + Channeler d6 L2, Con +2:
    // 10+2, then (6+2)×2 (d10 avg), then (4+2)×2 (d6 avg) = 12 + 16 + 12 = 40.
    expect(
      maxHpMulticlass({
        classes: [
          { hitDieFaces: 10, level: 3 },
          { hitDieFaces: 6, level: 2 },
        ],
        conMod: 2,
        mode: "average",
      }),
    ).toBe(40);
  });

  it("applies rolls in overall-level order across classes", () => {
    // d10 L2 then d6 L1: 10+0, roll 7 (2nd overall), roll 3 (3rd overall) = 20.
    expect(
      maxHpMulticlass({
        classes: [
          { hitDieFaces: 10, level: 2 },
          { hitDieFaces: 6, level: 1 },
        ],
        conMod: 0,
        mode: "rolled",
        rolls: [7, 3],
      }),
    ).toBe(20);
  });

  it("matches single-class maxHp for one class", () => {
    expect(
      maxHpMulticlass({ classes: [{ hitDieFaces: 10, level: 3 }], conMod: 2, mode: "average" }),
    ).toBe(maxHp({ hitDieFaces: 10, conMod: 2, level: 3, mode: "average" }));
  });
});
