import { describe, expect, it } from "vitest";
import type { Background, Feat } from "../data/types/character-content";
import {
  deriveCharacter,
  gatherAbilityBonuses,
  type ResolvedFeat,
} from "./character";

const baseAbilities = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };

describe("weighted ability choices (2024 backgrounds)", () => {
  const acolyte: Background = {
    name: "Acolyte",
    source: "XPHB",
    ability: [
      { choose: { weighted: { from: ["int", "wis", "cha"], weights: [2, 1] } } },
      { choose: { weighted: { from: ["int", "wis", "cha"], weights: [1, 1, 1] } } },
    ],
  };

  it("assigns each weight to the chosen ability (mixed +2/+1)", () => {
    const bonuses = gatherAbilityBonuses({
      edition: "one",
      background: acolyte,
      abilityChoices: { "primary:ability:0": ["cha", "wis"] }, // +2 cha, +1 wis
    });
    expect(bonuses).toEqual({ cha: 2, wis: 1 });
  });

  it("treats a uniform [1,1,1] weighted grant as +1 to each picked ability", () => {
    const bonuses = gatherAbilityBonuses({
      edition: "one",
      background: acolyte,
      abilityChoices: { "primary:ability:1": ["int", "wis", "cha"] },
    });
    expect(bonuses).toEqual({ int: 1, wis: 1, cha: 1 });
  });

  it("ignores unset weighted slots", () => {
    const bonuses = gatherAbilityBonuses({
      edition: "one",
      background: acolyte,
      // first slot unset (undefined), second slot = dex... but only cha valid here
      abilityChoices: { "primary:ability:0": [undefined as never, "int"] },
    });
    expect(bonuses).toEqual({ int: 1 });
  });
});

describe("feat effects in deriveCharacter", () => {
  const actor: ResolvedFeat = {
    feat: { name: "Actor", source: "PHB", ability: [{ cha: 1 }] } as Feat,
    keyPrefix: "asifeat:0",
  };
  const asiFeat: ResolvedFeat = {
    feat: {
      name: "Ability Score Improvement",
      source: "XPHB",
      ability: [{ choose: { from: ["str", "dex", "con", "int", "wis", "cha"], amount: 2 } }],
    } as Feat,
    keyPrefix: "asifeat:1",
  };
  const observant: ResolvedFeat = {
    feat: {
      name: "Observant",
      source: "PHB",
      skillProficiencies: [{ perception: true }],
      expertise: [{ perception: true }],
    } as Feat,
    keyPrefix: "asifeat:2",
  };
  const resilientCon: ResolvedFeat = {
    feat: {
      name: "Resilient (Con)",
      source: "HB",
      ability: [{ con: 1 }],
      savingThrowProficiencies: [{ con: true }],
    } as Feat,
    keyPrefix: "asifeat:3",
  };

  it("applies flat + chosen feat ability increases and feat proficiencies/expertise/saves", () => {
    const derived = deriveCharacter({
      edition: "classic",
      level: 8,
      baseAbilities,
      feats: [actor, asiFeat, observant, resilientCon],
      abilityChoices: { "asifeat:1:ability:0": ["str"] }, // ASI feat: +2 to one (str)
      skillChoices: {},
    });
    expect(derived.abilities.cha).toBe(9); // Actor +1
    expect(derived.abilities.str).toBe(10); // ASI feat +2
    expect(derived.abilities.con).toBe(9); // Resilient +1
    expect(derived.skills.perception.proficient).toBe(true);
    expect(derived.skills.perception.expertise).toBe(true);
    expect(derived.saves.con.proficient).toBe(true);
  });

  it("surfaces armor/weapon/tool/language proficiencies from class + background + feats", () => {
    const derived = deriveCharacter({
      edition: "one",
      level: 1,
      baseAbilities,
      background: {
        name: "Acolyte",
        source: "XPHB",
        toolProficiencies: [{ "calligrapher's supplies": true }],
        languageProficiencies: [{ any: 2 }],
      },
      class: {
        name: "Fighter",
        source: "XPHB",
        startingProficiencies: { armor: ["light", "medium", "heavy", "shield"], weapons: ["simple", "martial"] },
      },
      feats: [
        { feat: { name: "Linguist", source: "HB", languageProficiencies: [{ draconic: true }] } as Feat, keyPrefix: "asifeat:0" },
      ],
      abilityChoices: {},
      skillChoices: {},
    });
    expect(derived.proficiencies.armor).toEqual(["Light", "Medium", "Heavy", "Shield"]);
    expect(derived.proficiencies.weapons).toEqual(["Simple", "Martial"]);
    expect(derived.proficiencies.tools.fixed).toContain("Calligrapher's Supplies");
    expect(derived.proficiencies.languages.fixed).toContain("Draconic");
    expect(derived.proficiencies.languages.notes).toContain("any 2");
  });
});
