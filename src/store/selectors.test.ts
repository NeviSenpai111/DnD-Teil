import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importFiles } from "../data/importer";
import { ContentIndex } from "../data/contentIndex";
import { createCharacter } from "../model/character";
import { deriveFromCharacter, skillGrantsFor } from "./selectors";

/** Load the bundled SRD-lite fixture exactly as the app would import it. */
function loadSrdLite(): ContentIndex {
  const text = readFileSync("public/sample-data/srd-lite.json", "utf8");
  const result = importFiles([{ name: "srd-lite.json", text }]);
  return new ContentIndex(result.entities, result.metaSources);
}

describe("Phase 2 acceptance: build a level-1 character from imported content", () => {
  const index = loadSrdLite();

  // Sturdyfolk (con+2, wis+1, choose 1 skill) + Veteran Guard (athletics, intimidation).
  const choiceKey = skillGrantsFor(
    createCharacter({ race: { name: "Sturdyfolk", source: "SRDLite" } }),
    index,
  ).choices[0].key;

  const character = createCharacter({
    name: "Test Hero",
    race: { name: "Sturdyfolk", source: "SRDLite" },
    background: { name: "Veteran Guard", source: "SRDLite" },
    baseAbilities: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
    skillChoices: { [choiceKey]: ["perception"] },
  });

  const derived = deriveFromCharacter(character, index);

  it("applies racial ability bonuses", () => {
    expect(derived.abilities).toEqual({ str: 15, dex: 13, con: 16, int: 10, wis: 13, cha: 8 });
  });

  it("computes proficiency bonus and modifiers", () => {
    expect(derived.pb).toBe(2);
    expect(derived.mods.con).toBe(3);
  });

  it("grants background + chosen skills", () => {
    expect(derived.skills.athletics.proficient).toBe(true);
    expect(derived.skills.intimidation.proficient).toBe(true);
    expect(derived.skills.perception.proficient).toBe(true);
    expect(derived.skills.stealth.proficient).toBe(false);
  });

  it("computes AC, passive perception, speed and size from the race", () => {
    expect(derived.ac).toBe(11); // 10 + dex +1
    expect(derived.passivePerception).toBe(13); // 10 + (wis +1 + PB 2)
    expect(derived.speed).toBe(25);
    expect(derived.size).toBe("Medium");
  });
});

describe("Phase 3 acceptance: race + class + background level-1 character", () => {
  const index = loadSrdLite();

  const character = createCharacter({
    name: "Warden Hero",
    race: { name: "Sturdyfolk", source: "SRDLite" },
    classes: [{ name: "Warden", source: "SRDLite", level: 1 }],
    background: { name: "Veteran Guard", source: "SRDLite" },
    baseAbilities: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
  });

  const derived = deriveFromCharacter(character, index);

  it("computes HP from the class hit die + Con mod", () => {
    // d10 + Con mod (+3 after racial +2) = 13.
    expect(derived.maxHp).toBe(13);
    expect(derived.hitDie).toBe("1d10");
  });

  it("grants the class's saving-throw proficiencies", () => {
    expect(derived.saves.str.proficient).toBe(true);
    expect(derived.saves.con.proficient).toBe(true);
    expect(derived.saves.dex.proficient).toBe(false);
    expect(derived.saves.con.mod).toBe(5); // con mod +3 + PB 2
  });

  it("offers class skill choices alongside race + background grants", () => {
    const grants = skillGrantsFor(character, index);
    expect(grants.fixed.sort()).toEqual(["athletics", "intimidation"]);
    // race "choose 1" + class "choose 2".
    expect(grants.choices.map((c) => c.count).sort()).toEqual([1, 2]);
  });
});
