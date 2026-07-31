import { describe, expect, it } from "vitest";
import { detectAcFormulas, detectSpellAcFormulas } from "./acFormulas";
import { bestArmorClass } from "./armor";
import type { Ability } from "./constants";

const mods = (over: Partial<Record<Ability, number>>): Record<Ability, number> => ({
  str: 0,
  dex: 0,
  con: 0,
  int: 0,
  wis: 0,
  cha: 0,
  ...over,
});

describe("detectAcFormulas", () => {
  it("detects a Barbarian-style formula (Dex + Con, shield allowed)", () => {
    const formulas = detectAcFormulas([
      {
        name: "Unarmored Defense",
        entries: [
          "While you aren't wearing any armor, your Armor Class equals 10 + your Dexterity modifier + your Constitution modifier. You can use a shield and still gain this benefit.",
        ],
      },
    ]);
    expect(formulas).toEqual([
      { name: "Unarmored Defense", base: 10, abilities: ["dex", "con"], allowShield: true },
    ]);
  });

  it("detects a Monk-style formula (Dex + Wis, no shield)", () => {
    const formulas = detectAcFormulas([
      {
        name: "Unarmored Defense",
        entries: [
          "While you are not wearing armor or wielding a shield, your Armor Class equals 10 + your Dexterity modifier + your Wisdom modifier.",
        ],
      },
    ]);
    expect(formulas[0]).toMatchObject({ abilities: ["dex", "wis"], allowShield: false });
  });

  it("detects a Draconic-Resilience-style flat base", () => {
    const formulas = detectAcFormulas([
      {
        name: "Draconic Resilience",
        entries: [
          { type: "entries", entries: ["When you aren't wearing armor, your Armor Class equals 13 + your Dexterity modifier."] },
        ],
      },
    ]);
    expect(formulas[0]).toMatchObject({ base: 13, abilities: ["dex"], allowShield: true });
  });

  it("ignores features without an unarmored AC formula", () => {
    expect(
      detectAcFormulas([{ name: "Second Wind", entries: ["Regain hit points as a bonus action."] }]),
    ).toEqual([]);
  });

  it("detects Mage-Armor-style spell wording (base AC becomes / dons armor)", () => {
    const formulas = detectSpellAcFormulas([
      {
        name: "Warding Aegis",
        source: "X",
        level: 1,
        entries: [
          "While it wears no armor, its base Armor Class becomes 13 + its Dexterity modifier. The ward ends early if the target dons armor.",
        ],
      },
    ]);
    expect(formulas).toEqual([
      { name: "Warding Aegis", base: 13, abilities: ["dex"], allowShield: true },
    ]);
  });
});

describe("bestArmorClass", () => {
  const ud = { name: "Unarmored Defense", base: 10, abilities: ["dex", "con"] as Ability[], allowShield: true };
  const monk = { name: "Unarmored Defense", base: 10, abilities: ["dex", "wis"] as Ability[], allowShield: false };

  it("picks the best unarmored formula over the 10+Dex base", () => {
    expect(bestArmorClass({ mods: mods({ dex: 1, con: 3 }), unarmored: [ud] })).toBe(14);
    // A negative-mod formula never lowers the AC below the base formula.
    expect(bestArmorClass({ mods: mods({ dex: 1, con: -2 }), unarmored: [ud] })).toBe(11);
  });

  it("uses only the armored formula while wearing armor", () => {
    expect(
      bestArmorClass({
        mods: mods({ dex: 1, con: 5 }),
        armor: { ac: 16, category: "HA" },
        unarmored: [ud],
      }),
    ).toBe(16);
  });

  it("drops shield-incompatible formulas when a shield is worn", () => {
    // Monk formula would give 10+2+3+2=17, but the shield disqualifies it.
    expect(
      bestArmorClass({ mods: mods({ dex: 2, wis: 3 }), shield: true, unarmored: [monk] }),
    ).toBe(14); // 10 + 2 dex + 2 shield
    expect(bestArmorClass({ mods: mods({ dex: 2, wis: 3 }), unarmored: [monk] })).toBe(15);
  });
});
