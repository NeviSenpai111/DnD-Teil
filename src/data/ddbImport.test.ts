import { describe, expect, it } from "vitest";
import { ContentIndex } from "./contentIndex";
import {
  characterFromDdbFields,
  fitHpRolls,
  isDndBeyondSheet,
  parseClassLine,
  parseFeatNames,
} from "./ddbImport";
import type { ImportedEntity } from "./types/content";
import type { PdfFormFields } from "./pdfForm";

const entity = (type: string, name: string, extra: Record<string, unknown> = {}): ImportedEntity =>
  ({ __type: type, name, source: "TST", ...extra }) as ImportedEntity;

/** A miniature content pool covering everything the fixture sheet names. */
const index = new ContentIndex([
  entity("class", "Artificer", {
    hd: { number: 1, faces: 8 },
    proficiency: ["con", "int"],
    casterProgression: "artificer",
    spellcastingAbility: "int",
    cantripProgression: [2, 2, 2, 2, 2, 2, 2, 2, 2, 3],
    startingProficiencies: {
      skills: [{ choose: { from: ["arcana", "investigation", "nature", "perception"], count: 2 } }],
    },
  }),
  entity("subclass", "Artillerist", { className: "Artificer", classSource: "TST" }),
  entity("subclass", "Alchemist", { className: "Artificer", classSource: "TST" }),
  entity("race", "Human", { speed: 30, skillProficiencies: [{ any: 1 }] }),
  entity("subrace", "Variant", { raceName: "Human", raceSource: "TST" }),
  entity("background", "Sage", {
    skillProficiencies: [{ arcana: true, history: true }],
    languageProficiencies: [{ any: 2 }],
  }),
  entity("feat", "Fey Touched", { ability: [{ int: 1 }] }),
  entity("item", "Scale Mail", { type: "MA", ac: 14, weight: 45 }),
  entity("item", "Shield", { type: "S", weight: 6 }),
  entity("item", "All-Purpose Tool, +1", { reqAttune: true }),
  entity("baseitem", "Mace", { weight: 4, weaponCategory: "simple", dmg1: "1d6", dmgType: "B" }),
  entity("baseitem", "Rations (1 day)", { weight: 2 }),
  entity("spell", "Fire Bolt", { level: 0 }),
  entity("spell", "Mage Hand", { level: 0 }),
  entity("spell", "Cure Wounds", { level: 1 }),
  entity("spell", "Detect Magic", { level: 1 }),
  entity("spell", "Shield of Faith", { level: 1 }),
  entity("spell", "Thunderwave", { level: 1 }),
  entity("spell", "Guidance", { level: 0 }),
  ...["Alarm", "Grease", "Jump", "Longstrider", "Sanctuary", "Faerie Fire"].map((name) =>
    entity("spell", name, { level: 1 }),
  ),
]);

/** The subset of DDB's fields the mapper reads, filled as its exporter would. */
function sheet(overrides: PdfFormFields = {}): PdfFormFields {
  return {
    CharacterName: "Albert Zweistein",
    "CLASS  LEVEL": "Artificer 8",
    RACE: "Variant Human",
    BACKGROUND: "Sage",
    STR: "8",
    DEX: "14",
    CON: "15",
    INT: "17",
    WIS: "11",
    CHA: "10",
    MaxHP: "63",
    CurrentHP: "51",
    TempHP: "4",
    Total: "8d8",
    ArcanaProf: "P",
    HistoryProf: "P",
    InvestigationProf: "P",
    InsightProf: "P",
    PerformanceProf: "E",
    ProficienciesLang:
      "=== ARMOR === \nLight Armor \n\n=== TOOLS === \nTinker's Tools \n\n=== LANGUAGES === \nCommon, Sylvan",
    FeaturesTraits1: "=== ARTIFICER FEATURES === \n\n* Artificer Specialist • TCoE 13 \nThe type of specialist are: \n\n   | Artillerist \n",
    FeaturesTraits2: "\n=== FEATS === \n\n* Fey Touched • TCoE 79 \nIncrease your Intelligence.\n\n* Bogus Feat • XYZ 1 \n",
    GP: "8",
    SP: "3",
    "Eq Name0": "Scale Mail",
    "Eq Qty0": "1",
    "Eq Weight0": "45 lb.",
    "Eq Name1": "Mace",
    "Eq Qty1": "1",
    "Eq Weight1": "4 lb.",
    "Eq Name2": "Rations (1 day)",
    "Eq Qty2": "10",
    "Eq Weight2": "20 lb.",
    "Eq Name3": "Revolver",
    "Eq Qty3": "1",
    "Eq Weight3": "3 lb.",
    "Attuned Name1": "All-Purpose Tool, +1",
    "Attuned Qty1": "1",
    "Attuned Weight1": "--",
    "Wpn Name": "Mace",
    "Wpn1 AtkBonus": "+5",
    "Wpn1 Damage": "1d6+2 Bludgeoning",
    "Wpn Name 2": "Unarmed Strike",
    "Wpn2 AtkBonus ": "+2",
    "Wpn2 Damage ": "0 Bludgeoning",
    spellName0: "Fire Bolt",
    spellSource0: "Artificer",
    spellPrepared0: "O",
    spellName1: "Mage Hand",
    spellSource1: "Artificer Initiate",
    spellPrepared1: "O",
    spellName2: "Guidance",
    spellSource2: "Magic Initiate (Cleric)",
    spellPrepared2: "O",
    ALIGNMENT: "Chaotic Good",
    AGE: "45",
    Backstory: "Albert had a rather normal life.",
    AdditionalNotes1: "Talks to his gun.",
    ...overrides,
  };
}

describe("parseClassLine", () => {
  it("reads a single class, a subclass hint and a multiclass line", () => {
    expect(parseClassLine("Artificer 8")).toEqual([{ name: "Artificer", subclass: undefined, level: 8 }]);
    expect(parseClassLine("Fighter (Champion) 5")).toEqual([
      { name: "Fighter", subclass: "Champion", level: 5 },
    ]);
    expect(parseClassLine("Fighter 5 / Wizard 3")).toEqual([
      { name: "Fighter", subclass: undefined, level: 5 },
      { name: "Wizard", subclass: undefined, level: 3 },
    ]);
    expect(parseClassLine("")).toEqual([]);
  });
});

describe("parseFeatNames", () => {
  it("takes the name off each bullet and stops at the next section", () => {
    const text = "=== FEATS === \n\n* Fey Touched • TCoE 79 \nIncrease your Intelligence.\n\n* Alert • PHB 165 \n\n=== ACTIONS === \n\n* Dash • PHB 1";
    expect(parseFeatNames(text)).toEqual(["Fey Touched", "Alert"]);
  });
});

describe("fitHpRolls", () => {
  it("fits rolls that reproduce an exact max HP", () => {
    const classes = [{ hitDieFaces: 8, level: 8 }];
    const rolls = fitHpRolls(63, classes, 2);
    expect(rolls).toBeDefined();
    // Average would be 59; the four extra points ride on the earliest levels.
    expect(rolls!.reduce((sum, roll) => sum + roll, 0) + 8 + 2 * 8).toBe(63);
  });

  it("gives up when the target is out of reach of the hit dice", () => {
    expect(fitHpRolls(500, [{ hitDieFaces: 8, level: 8 }], 2)).toBeUndefined();
    expect(fitHpRolls(20, [], 2)).toBeUndefined();
  });
});

describe("isDndBeyondSheet", () => {
  it("accepts a filled sheet and rejects a blank or unrelated form", () => {
    expect(isDndBeyondSheet(sheet())).toBe(true);
    expect(isDndBeyondSheet({ CharacterName: "", STR: "" })).toBe(false);
    expect(isDndBeyondSheet({ Invoice: "42" })).toBe(false);
  });
});

describe("characterFromDdbFields", () => {
  const imported = () => characterFromDdbFields(sheet(), index, "classic");

  it("resolves class, subclass, species and background", () => {
    const { character } = imported();
    expect(character.name).toBe("Albert Zweistein");
    expect(character.classes).toEqual([
      { name: "Artificer", source: "TST", level: 8, subclass: { name: "Artillerist", source: "TST" } },
    ]);
    expect(character.race).toEqual({ name: "Human", source: "TST" });
    expect(character.subrace).toEqual({ name: "Variant", source: "TST" });
    expect(character.background).toEqual({ name: "Sage", source: "TST" });
  });

  it("pins the sheet's ability scores and backs the bonuses out of the base", () => {
    const { character } = imported();
    expect(character.abilityAdjustments.override).toEqual({
      str: 8,
      dex: 14,
      con: 15,
      int: 17,
      wis: 11,
      cha: 10,
    });
    // Fey Touched grants +1 Int, so the base has to be one lower to match.
    expect(character.baseAbilities.int).toBe(16);
    expect(character.baseAbilities.str).toBe(8);
    expect(character.abilityMethod).toBe("manual");
  });

  it("deals skill proficiencies into the slots the build actually grants", () => {
    const { character, warnings } = imported();
    // Arcana + History are fixed from Sage; the class slot and the species'
    // free pick take the rest.
    expect(Object.values(character.skillChoices).flat().sort()).toEqual(["insight", "investigation"]);
    expect(character.expertiseChoices["import:expertise"]).toEqual(["performance"]);
    expect(warnings.join(" ")).toContain("Performance");
  });

  it("keeps the sheet's inventory, marking worn armour and attuned items", () => {
    const { character } = imported();
    const byName = Object.fromEntries(character.inventory.map((item) => [item.name, item]));
    expect(byName["Scale Mail"].equipped).toBe(true);
    expect(byName["Mace"].equipped).toBe(true); // named in an attack row
    expect(byName["All-Purpose Tool, +1"].attuned).toBe(true);
    // DDB prints stack weight; the model stores it per item.
    expect(byName["Rations (1 day)"].quantity).toBe(10);
    expect(byName["Revolver"].ref).toBeUndefined();
    expect(byName["Revolver"].custom).toEqual({ weight: 3 });
    expect(character.equipmentMode).toBe("gold");
    expect(character.currency).toMatchObject({ gp: 8, sp: 3 });
  });

  it("turns attack rows with no item or spell behind them into custom attacks", () => {
    const { character } = imported();
    expect(character.customAttacks).toEqual([
      { name: "Unarmed Strike", hit: 2, damage: "0 Bludgeoning" },
    ]);
  });

  it("imports class spells and reports feat-granted ones instead of guessing", () => {
    const { character, warnings } = imported();
    expect(character.cantrips).toEqual([{ name: "Fire Bolt", source: "TST", forClass: "Artificer" }]);
    expect(warnings.join(" ")).toContain("Mage Hand (Artificer Initiate)");
    expect(warnings.join(" ")).toContain("Guidance (Magic Initiate (Cleric))");
  });

  /** Lay out `names` as spell rows; `alwaysPrepared` names get DDB's "P" mark. */
  const spellRows = (names: string[], alwaysPrepared: string[] = []): PdfFormFields => {
    const rows: PdfFormFields = {};
    names.forEach((name, i) => {
      const always = alwaysPrepared.includes(name);
      rows[`spellName${10 + i}`] = name;
      rows[`spellSource${10 + i}`] = always ? "Artificer (Always Prepared)" : "Artificer";
      rows[`spellPrepared${10 + i}`] = always ? "P" : "O";
    });
    return rows;
  };

  it("imports the whole list when it fits inside the class's prepared limit", () => {
    const rows = spellRows(["Cure Wounds", "Detect Magic", "Shield of Faith", "Thunderwave"], [
      "Thunderwave",
    ]);
    const { character } = characterFromDdbFields(sheet(rows), index, "classic");
    expect(character.spells.map((pick) => pick.name).sort()).toEqual([
      "Cure Wounds",
      "Detect Magic",
      "Shield of Faith",
      "Thunderwave",
    ]);
  });

  it("keeps only always-prepared spells when the sheet lists the whole class list", () => {
    // A level-8 artificer prepares 7 (Int +3 plus half its level); ten rows
    // means DDB printed everything the class could prepare, not its picks.
    const rows = spellRows(
      [
        "Cure Wounds",
        "Detect Magic",
        "Shield of Faith",
        "Thunderwave",
        "Alarm",
        "Grease",
        "Jump",
        "Longstrider",
        "Sanctuary",
        "Faerie Fire",
      ],
      ["Thunderwave"],
    );
    const { character, warnings } = characterFromDdbFields(sheet(rows), index, "classic");
    expect(character.spells.map((pick) => pick.name)).toEqual(["Thunderwave"]);
    expect(warnings.join(" ")).toContain("every spell Artificer can prepare");
  });

  it("drops an over-long cantrip list rather than stacking every cantrip", () => {
    // The fixture class knows 2 cantrips at level 8; the sheet names three.
    const rows: PdfFormFields = {};
    ["Fire Bolt", "Mage Hand", "Guidance"].forEach((name, i) => {
      rows[`spellName${i}`] = name;
      rows[`spellSource${i}`] = "Artificer";
      rows[`spellPrepared${i}`] = "O";
    });
    const { character, warnings } = characterFromDdbFields(sheet(rows), index, "classic");
    expect(character.cantrips).toEqual([]);
    expect(warnings.join(" ")).toContain("more Artificer cantrips than the class knows");
  });

  it("skips spells whose content entry has no level instead of calling them cantrips", () => {
    // An unresolved `_copy` reprint arrives with a name but no level.
    const partial = new ContentIndex([
      ...["Artificer"].map((name) =>
        entity("class", name, {
          hd: { number: 1, faces: 8 },
          casterProgression: "artificer",
          spellcastingAbility: "int",
          cantripProgression: [2, 2, 2, 2, 2, 2, 2, 2, 2, 3],
        }),
      ),
      entity("spell", "Fire Bolt", { level: 0 }),
      entity("spell", "Catapult", { _copy: { name: "Catapult", source: "XGE" } }),
    ]);
    const { character, warnings } = characterFromDdbFields(
      sheet({
        spellName0: "Fire Bolt",
        spellSource0: "Artificer",
        spellName1: "Catapult",
        spellSource1: "Artificer",
      }),
      partial,
      "classic",
    );
    expect(character.cantrips.map((pick) => pick.name)).toEqual(["Fire Bolt"]);
    expect(character.spells).toEqual([]);
    expect(warnings.join(" ")).toContain("no spell level in your content");
    expect(warnings.join(" ")).toContain("Catapult");
  });

  it("matches the sheet's max HP by fitting hit-dice rolls", () => {
    const { character } = imported();
    expect(character.hpMode).toBe("rolled");
    expect(character.hpRolls).toHaveLength(7);
    expect(character.play.damageTaken).toBe(12);
    expect(character.play.tempHp).toBe(4);
  });

  it("leaves HP on average when the sheet already agrees", () => {
    const { character } = characterFromDdbFields(sheet({ MaxHP: "59", CurrentHP: "" }), index, "classic");
    expect(character.hpMode).toBe("average");
    expect(character.play.damageTaken).toBe(0);
  });

  it("carries the descriptive fields over", () => {
    const { character } = imported();
    expect(character.details.alignment).toBe("Chaotic Good");
    expect(character.details.age).toBe("45");
    expect(character.details.backstory).toBe("Albert had a rather normal life.");
    expect(character.details.notes).toBe("Talks to his gun.");
  });

  it("names what it couldn't resolve rather than dropping it silently", () => {
    const { warnings } = imported();
    const joined = warnings.join(" ");
    expect(joined).toContain("Bogus Feat");
    expect(joined).toContain("Revolver");
    expect(joined).toContain("Override Score");
  });

  it("falls back to a custom background and keeps going when content is missing", () => {
    const bare = new ContentIndex([]);
    const { character, warnings } = characterFromDdbFields(sheet(), bare, "classic");
    expect(character.name).toBe("Albert Zweistein");
    expect(character.classes).toEqual([]);
    expect(character.customBackground).toEqual({
      name: "Sage",
      description: "Imported from D&D Beyond.",
    });
    expect(warnings.join(" ")).toContain('Class "Artificer"');
    expect(warnings.join(" ")).toContain('Species "Variant Human"');
  });
});
