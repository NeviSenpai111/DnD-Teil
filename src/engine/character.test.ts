import { describe, expect, it } from "vitest";
import type { Background, Race } from "../data/types/character-content";
import {
  asiBonusesFromChoices,
  asiSlotCount,
  asiSlotsForClasses,
  deriveCharacter,
  gatherAbilityBonuses,
  gatherAbilityBonusSources,
  gatherSkillGrants,
  resolveProficientSkills,
} from "./character";

const hillDwarf: Race = {
  name: "Hill Dwarf",
  source: "TEST",
  size: ["M"],
  speed: 25,
  ability: [{ con: 2, wis: 1 }],
  skillProficiencies: [{ choose: { from: ["perception", "survival", "stealth"], count: 1 } }],
};

const soldier: Background = {
  name: "Soldier",
  source: "TEST",
  skillProficiencies: [{ athletics: true, intimidation: true }],
};

const baseAbilities = { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 };

describe("deriveCharacter (classic, level 1)", () => {
  const derived = deriveCharacter({
    edition: "classic",
    level: 1,
    baseAbilities,
    race: hillDwarf,
    background: soldier,
    abilityChoices: {},
    skillChoices: { "race:skill:0": ["perception"] },
    saveProficiencies: ["str", "con"], // as if from a Fighter
  });

  it("applies racial ability bonuses to base scores", () => {
    expect(derived.abilities).toEqual({ str: 15, dex: 13, con: 16, int: 10, wis: 13, cha: 8 });
  });

  it("computes PB and modifiers", () => {
    expect(derived.pb).toBe(2);
    expect(derived.mods.str).toBe(2);
    expect(derived.mods.con).toBe(3);
  });

  it("marks proficient saves and adds PB", () => {
    expect(derived.saves.str).toEqual({ mod: 4, proficient: true }); // +2 mod + 2 PB
    expect(derived.saves.dex.proficient).toBe(false);
    expect(derived.saves.dex.mod).toBe(1);
  });

  it("grants fixed + chosen skills and computes their mods", () => {
    expect(derived.skills.athletics).toMatchObject({ proficient: true });
    expect(derived.skills.athletics.mod).toBe(4); // str +2 + PB 2
    expect(derived.skills.perception).toMatchObject({ proficient: true });
    expect(derived.skills.perception.mod).toBe(3); // wis +1 + PB 2
    expect(derived.skills.stealth.proficient).toBe(false);
  });

  it("computes AC, initiative, passive perception, speed, size", () => {
    expect(derived.ac).toBe(11); // 10 + dex +1
    expect(derived.initiative).toBe(1);
    expect(derived.passivePerception).toBe(13); // 10 + perception 3
    expect(derived.speed).toBe(25);
    expect(derived.size).toBe("Medium");
  });
});

describe("gatherSkillGrants", () => {
  it("separates fixed grants from choices and dedupes", () => {
    const grants = gatherSkillGrants({ race: hillDwarf, background: soldier });
    expect(grants.fixed.sort()).toEqual(["athletics", "intimidation"]);
    expect(grants.choices).toHaveLength(1);
    expect(grants.choices[0].count).toBe(1);

    const resolved = resolveProficientSkills(grants, { [grants.choices[0].key]: ["survival"] });
    expect(resolved.sort()).toEqual(["athletics", "intimidation", "survival"]);
  });

  it("turns feat choose/any skill grants into pickable groups under the feat's prefix", () => {
    // Real PHB "Skilled" shape: a mixed skills/tools choose.
    const skilled = {
      name: "Skilled",
      source: "X",
      skillToolLanguageProficiencies: [{ choose: [{ from: ["anySkill", "anyTool"], count: 3 }] }],
    };
    const prodigy = {
      name: "Prodigy",
      source: "X",
      skillProficiencies: [{ perception: true, choose: { from: ["arcana", "history"], count: 1 } }],
    };
    const anyN = { name: "Versatile", source: "X", skillProficiencies: [{ any: 2 }] };
    const grants = gatherSkillGrants({
      feats: [
        { feat: skilled, keyPrefix: "asifeat:0" },
        { feat: prodigy, keyPrefix: "bgfeat:0" },
        { feat: anyN, keyPrefix: "asifeat:1" },
      ],
    });

    expect(grants.fixed).toEqual(["perception"]); // fixed feat skills still apply
    const skilledGroup = grants.choices.find((c) => c.key.startsWith("feat:asifeat:0:"));
    expect(skilledGroup?.count).toBe(3);
    expect(skilledGroup?.from.length).toBeGreaterThan(15); // anySkill = every skill
    expect(skilledGroup?.origin).toBe("Skilled");

    const chooseGroup = grants.choices.find((c) => c.key.startsWith("feat:bgfeat:0:"));
    expect(chooseGroup?.from).toEqual(["arcana", "history"]);
    expect(chooseGroup?.origin).toBe("Prodigy");

    const anyGroup = grants.choices.find((c) => c.key.startsWith("feat:asifeat:1:"));
    expect(anyGroup?.count).toBe(2); // `{ any: N }` form still works
  });
});

describe("manual score adjustments (Set / Other / Override)", () => {
  const base = {
    edition: "classic" as const,
    level: 1,
    baseAbilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    abilityChoices: {},
    skillChoices: {},
    asiBonuses: { str: 2 },
  };

  it("set replaces the base score BEFORE bonuses", () => {
    const d = deriveCharacter({ ...base, adjustments: { set: { str: 15 } } });
    expect(d.abilities.str).toBe(17); // 15 set + 2 ASI
  });

  it("other adds flat on top of everything", () => {
    const d = deriveCharacter({ ...base, adjustments: { other: { str: 1, dex: -2 } } });
    expect(d.abilities.str).toBe(13); // 10 + 2 ASI + 1 other
    expect(d.abilities.dex).toBe(8);
  });

  it("override wins over set, bonuses and other", () => {
    const d = deriveCharacter({
      ...base,
      adjustments: { set: { str: 15 }, other: { str: 3 }, override: { str: 20 } },
    });
    expect(d.abilities.str).toBe(20);
    expect(d.mods.str).toBe(5);
  });
});

describe("Phase 5: ASIs and equipped armor", () => {
  it("counts ASI slots at standard levels", () => {
    expect(asiSlotCount(3)).toBe(0);
    expect(asiSlotCount(4)).toBe(1);
    expect(asiSlotCount(12)).toBe(3);
    expect(asiSlotCount(19)).toBe(5);
  });

  it("counts multiclass ASI slots per CLASS level, not character level", () => {
    expect(asiSlotsForClasses([4, 3])).toBe(1); // Wizard 4 / Cleric 3 -> wizard's only
    expect(asiSlotsForClasses([8, 4])).toBe(3);
    expect(asiSlotsForClasses([5, 4])).toBe(2); // character level 9 alone would be 2 as well
  });

  it("sums ability increases from ASI choices and ignores feats", () => {
    const bonuses = asiBonusesFromChoices([
      { type: "asi", increases: { str: 2 } },
      { type: "feat", ref: { name: "Tough", source: "X" } },
      { type: "asi", increases: { str: 1, dex: 1 } },
    ]);
    expect(bonuses).toEqual({ str: 3, dex: 1 });
  });

  it("applies ASI bonuses and equipped armor to derived stats", () => {
    const derived = deriveCharacter({
      edition: "classic",
      level: 4,
      baseAbilities: { str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 10 },
      abilityChoices: {},
      skillChoices: {},
      asiBonuses: { str: 2 },
      equippedArmor: { ac: 13, category: "MA" },
      shield: true,
    });
    expect(derived.abilities.str).toBe(16); // 14 + ASI 2
    expect(derived.ac).toBe(17); // chain shirt 13 + min(dex+2, 2) + shield 2
  });
});

describe("deriveCharacter (2024 edition)", () => {
  it("applies ability bonuses from the background, not the race", () => {
    const derived = deriveCharacter({
      edition: "one",
      level: 1,
      baseAbilities,
      race: hillDwarf, // its +con/+wis must be ignored in 2024
      background: { ...soldier, ability: [{ str: 2, con: 1 }] },
      abilityChoices: {},
      skillChoices: {},
    });
    expect(derived.abilities.con).toBe(15); // 14 base + 1 from background, NOT +2 from race
    expect(derived.abilities.str).toBe(17); // 15 + 2 from background
    expect(derived.abilities.wis).toBe(12); // unchanged (race +1 ignored)
  });
});

describe("gatherAbilityBonusSources (Score Calculations breakdown)", () => {
  const input = {
    edition: "classic" as const,
    race: hillDwarf,
    background: soldier,
    feats: [
      { feat: { name: "Tough Mind", source: "TEST", ability: [{ wis: 1 }] }, keyPrefix: "asifeat:0" },
    ],
    abilityChoices: {},
  };

  it("labels each contributor and sums to gatherAbilityBonuses", () => {
    const sources = gatherAbilityBonusSources(input);
    expect(sources.map((s) => s.source)).toEqual(["Hill Dwarf", "Tough Mind"]);
    expect(sources[0].bonuses).toEqual({ con: 2, wis: 1 });
    expect(sources[1].bonuses).toEqual({ wis: 1 });
    expect(gatherAbilityBonuses(input)).toEqual({ con: 2, wis: 2 });
  });

  it("lists resolved choice picks under the granting entity", () => {
    const elf: Race = {
      name: "Wood Elf",
      source: "TEST",
      ability: [{ choose: { from: ["str", "dex"], count: 1, amount: 1 } }],
    };
    const sources = gatherAbilityBonusSources({
      edition: "classic",
      race: elf,
      abilityChoices: { "primary:ability:0": ["dex"] },
    });
    expect(sources).toEqual([{ source: "Wood Elf (choice)", bonuses: { dex: 1 } }]);
  });
});
