import { describe, expect, it } from "vitest";
import type { Item } from "../data/types/item-content";
import { unarmedStrikeLine, weaponAbility, weaponAttackLine } from "./attacks";

const mods = { str: 3, dex: 1, con: 2, int: 0, wis: -1, cha: 0 };

describe("weaponAbility", () => {
  it("uses Strength for a plain melee weapon", () => {
    expect(weaponAbility({ name: "Greatsword", source: "X", type: "M" } as Item, mods)).toBe("str");
  });
  it("uses Dexterity for a ranged weapon", () => {
    expect(weaponAbility({ name: "Shortbow", source: "X", type: "R" } as Item, mods)).toBe("dex");
  });
  it("uses the better ability for a finesse weapon", () => {
    const dagger = { name: "Dagger", source: "X", type: "M", properties: ["F"] } as Item;
    expect(weaponAbility(dagger, mods)).toBe("str"); // str 3 > dex 1
    expect(weaponAbility(dagger, { ...mods, dex: 5 })).toBe("dex");
  });
});

describe("weaponAttackLine", () => {
  it("adds proficiency when the category is known, ability mod to hit and damage", () => {
    const greatsword = {
      name: "Greatsword",
      source: "X",
      type: "M",
      weaponCategory: "martial",
      dmg1: "2d6",
      dmgType: "slashing",
    } as Item;
    const line = weaponAttackLine(greatsword, mods, 2, ["Martial"]);
    expect(line.hit).toBe("+5"); // str 3 + pb 2
    expect(line.damage).toBe("2d6+3 slashing");
    expect(line.range).toBe("Melee");
    expect(line.notes).toContain("martial");
  });

  it("omits proficiency and flags it when the wielder isn't proficient", () => {
    const exotic = { name: "Net", source: "X", type: "R", weaponCategory: "martial", range: "5/15" } as Item;
    const line = weaponAttackLine(exotic, mods, 2, ["Simple"]);
    expect(line.hit).toBe("+1"); // dex 1, no pb
    expect(line.range).toBe("5/15 ft.");
    expect(line.notes).toContain("Not proficient");
  });
});

describe("unarmedStrikeLine", () => {
  it("is 1 + Str bludgeoning and always proficient", () => {
    const line = unarmedStrikeLine(mods, 2);
    expect(line.hit).toBe("+5");
    expect(line.damage).toBe("4 bludgeoning");
  });
});
