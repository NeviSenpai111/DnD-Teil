import { describe, expect, it, vi } from "vitest";
import { ContentIndex } from "./contentIndex";
import type { ImportedEntity } from "./types/content";
import {
  asDdbCharacter,
  ddbAbilities,
  ddbCharacterId,
  ddbMaxHp,
  type DdbCharacter,
  type DdbModifier,
} from "./ddbJson";
import { characterFromDdbJson, ddbNameVariants, fetchDdbCharacter } from "./ddbJsonImport";
import { importCharacterFile } from "./characterImport";
import { deriveFromCharacter } from "../store/selectors";

const entity = (type: string, name: string, source: string, extra: Record<string, unknown> = {}): ImportedEntity =>
  ({ __type: type, name, source, ...extra }) as ImportedEntity;

const spellSet = (name: string, cls: string) => ({
  name,
  known: { _: [{ choose: `level=0|class=${cls}`, count: 2 }] },
  innate: { _: { daily: { "1": [{ choose: `level=1|class=${cls}` }] } } },
});

/** A miniature content pool with the same-name reprints that make source matter. */
const index = new ContentIndex([
  entity("class", "Artificer", "TCE", {
    hd: { number: 1, faces: 8 },
    proficiency: ["con", "int"],
    casterProgression: "artificer",
    spellcastingAbility: "int",
    cantripProgression: [2, 2, 2, 2, 2, 2, 2, 2, 2, 3],
    startingProficiencies: {
      skills: [{ choose: { from: ["arcana", "history", "investigation", "medicine", "nature", "perception"], count: 2 } }],
      tools: [{ "thieves' tools": true, "tinker's tools": true }],
    },
  }),
  entity("subclass", "Artillerist", "TCE", { className: "Artificer", classSource: "TCE", shortName: "Artillerist" }),
  entity("race", "Dwarf", "PHB", { speed: 25, ability: [{ con: 2 }], languageProficiencies: [{ common: true, dwarvish: true }] }),
  entity("subrace", "Hill", "PHB", { raceName: "Dwarf", raceSource: "PHB", ability: [{ wis: 1 }] }),
  entity("race", "Half-Elf", "PHB", {
    speed: 30,
    ability: [{ cha: 2, choose: { from: ["str", "dex", "con", "int", "wis"], count: 2 } }],
  }),
  entity("background", "Sage", "PHB", { skillProficiencies: [{ arcana: true, history: true }] }),
  entity("background", "Sage", "XPHB", {
    ability: [
      { choose: { weighted: { from: ["con", "int", "wis"], weights: [2, 1] } } },
      { choose: { weighted: { from: ["con", "int", "wis"], weights: [1, 1, 1] } } },
    ],
    skillProficiencies: [{ arcana: true, history: true }],
    toolProficiencies: [{ "calligrapher's supplies": true }],
    feats: [{ "magic initiate; wizard|xphb": true }],
  }),
  entity("feat", "Magic Initiate", "XPHB", {
    additionalSpells: [spellSet("Cleric Spells", "Cleric"), spellSet("Wizard Spells", "Wizard")],
  }),
  entity("feat", "Fey Touched", "TCE", { ability: [{ choose: { from: ["int", "wis", "cha"], amount: 1 } }] }),
  entity("item", "Studded Leather Armor", "PHB", { type: "LA", ac: 12, weight: 13 }),
  entity("item", "Studded Leather Armor", "XPHB", { type: "LA|XPHB", ac: 12, weight: 13 }),
  entity("baseitem", "Light Crossbow", "XPHB", { type: "R", weight: 5, dmg1: "1d8", dmgType: "P" }),
  entity("item", "Backpack", "PHB", { weight: 5, containerCapacity: { weight: [30] } }),
  entity("item", "Rations (1 day)", "PHB", { weight: 2 }),
  entity("spell", "Fire Bolt", "PHB", { level: 0 }),
  entity("spell", "Fire Bolt", "XPHB", { level: 0 }),
  entity("spell", "Light", "XPHB", { level: 0 }),
  entity("spell", "Mage Hand", "XPHB", { level: 0 }),
  entity("spell", "Cure Wounds", "XPHB", { level: 1 }),
  entity("spell", "Grease", "XPHB", { level: 1 }),
  entity("spell", "Shield", "XPHB", { level: 1 }),
  entity("spell", "Sleep", "XPHB", { level: 1 }),
]);

const CLASS_FEATURE = 12168134;
const TOOL = 2103445194;
const src = (...ids: number[]) => ids.map((sourceId) => ({ sourceId }));
const stats = (values: (number | null)[]) => values.map((value, i) => ({ id: i + 1, value }));
const bonus = (subType: string, value: number, componentId: number, componentTypeId = 0): DdbModifier => ({
  type: "bonus",
  subType,
  value,
  componentId,
  componentTypeId,
});
const prof = (subType: string, friendlySubtypeName: string, extra: Partial<DdbModifier> = {}): DdbModifier => ({
  type: "proficiency",
  subType,
  friendlySubtypeName,
  ...extra,
});
const spell = (name: string, level: number, extra: Record<string, unknown> = {}) => ({
  definition: { name, level, sources: src(145) },
  ...extra,
});

/** An original test character in D&D Beyond's v5 shape: a 2024-background Artificer. */
function tinker(overrides: Partial<DdbCharacter> = {}): DdbCharacter {
  return {
    id: 4242,
    name: "Odo Gearwright",
    stats: stats([8, 14, 13, 15, 12, 10]),
    bonusStats: stats([null, 1, null, null, null, null]),
    overrideStats: stats([null, null, null, null, null, null]),
    race: {
      fullName: "Hill Dwarf",
      baseRaceName: "Dwarf",
      subRaceShortName: "Hill",
      isSubRace: true,
      sources: src(2),
      racialTraits: [
        { definition: { id: 10, name: "Ability Score Increase", categories: [{ tagName: "__INITIAL_ASI" }] } },
        { definition: { id: 12, name: "Languages" } },
      ],
    },
    background: { hasCustomBackground: false, definition: { id: 7, name: "Sage", sources: src(145) } },
    classes: [
      {
        id: 77,
        level: 4,
        isStartingClass: true,
        hitDiceUsed: 1,
        definition: { name: "Artificer", hitDice: 8, sources: src(67) },
        subclassDefinition: { name: "Artillerist", sources: src(67) },
        classFeatures: [
          { definition: { id: 500, name: "Ability Score Improvement", requiredLevel: 4 } },
          { definition: { id: 501, name: "Ability Score Improvement", requiredLevel: 8 } },
        ],
      },
    ],
    feats: [
      {
        componentId: 1,
        componentTypeId: 67468084,
        definition: { id: 900, name: "Sage Ability Score Improvements", categories: [{ tagName: "__INITIAL_ASI" }] },
      },
      { componentId: 2, componentTypeId: 67468084, definition: { id: 901, name: "Magic Initiate (Wizard)", sources: src(145) } },
      { componentId: 500, componentTypeId: CLASS_FEATURE, definition: { id: 902, name: "Fey Touched", sources: src(67) } },
    ],
    modifiers: {
      race: [
        bonus("constitution-score", 2, 10),
        { type: "language", subType: "common", friendlySubtypeName: "Common", componentId: 12 },
        { type: "language", subType: "dwarvish", friendlySubtypeName: "Dwarvish", componentId: 12 },
      ],
      class: [
        prof("investigation", "Investigation", { componentTypeId: CLASS_FEATURE }),
        prof("perception", "Perception", { componentTypeId: CLASS_FEATURE }),
        prof("thieves-tools", "Thieves' Tools", { entityTypeId: TOOL, componentTypeId: CLASS_FEATURE }),
        prof("tinkers-tools", "Tinker's Tools", { entityTypeId: TOOL, componentTypeId: CLASS_FEATURE }),
      ],
      background: [
        prof("arcana", "Arcana"),
        prof("history", "History"),
        prof("calligraphers-supplies", "Calligrapher's Supplies", { entityTypeId: TOOL }),
      ],
      feat: [
        bonus("intelligence-score", 2, 900),
        bonus("constitution-score", 1, 900),
        bonus("intelligence-score", 1, 902),
      ],
      item: [],
      condition: [],
    },
    options: { class: [] },
    inventory: [
      { id: 1001, quantity: 1, equipped: true, containerEntityId: 4242, definition: { name: "Studded Leather", sources: src(148, 1) } },
      { id: 1002, quantity: 1, equipped: false, containerEntityId: 4242, definition: { name: "Crossbow, Light", sources: src(148) } },
      { id: 1003, quantity: 1, equipped: false, containerEntityId: 4242, definition: { name: "Backpack", sources: src(1) } },
      { id: 1004, quantity: 5, equipped: false, containerEntityId: 1003, definition: { name: "Rations (1 day)", sources: src(1) } },
      {
        id: 1005,
        quantity: 1,
        equipped: true,
        containerEntityId: 4242,
        definition: {
          name: "Thunder Pistol",
          weight: 3,
          damage: { diceString: "1d10" },
          damageType: "Piercing",
          attackType: 2,
          range: 30,
          longRange: 90,
          categoryId: 2,
        },
      },
    ],
    customItems: [{ id: 1, name: "Lucky Coin", weight: 0, quantity: 1 }],
    customActions: [{ name: "Wrench Swing", abilityModifierStatId: 1, isProficient: true, diceCount: 1, diceType: 6 }],
    spells: {
      race: [],
      class: [],
      item: [],
      feat: [
        { componentId: 901, ...spell("Light", 0) },
        { componentId: 901, ...spell("Mage Hand", 0) },
        { componentId: 901, ...spell("Sleep", 1) },
      ],
    },
    classSpells: [
      {
        characterClassId: 77,
        spells: [
          spell("Fire Bolt", 0, { countsAsKnownSpell: true }),
          spell("Cure Wounds", 1, { prepared: true, countsAsKnownSpell: true }),
          spell("Grease", 1, { prepared: false, countsAsKnownSpell: true }),
          spell("Shield", 1, { alwaysPrepared: true }),
        ],
      },
    ],
    spellSlots: [{ level: 1, used: 1 }, { level: 2, used: 0 }],
    pactMagic: [],
    currencies: { cp: 0, sp: 3, ep: 0, gp: 15, pp: 0 },
    baseHitPoints: 25,
    bonusHitPoints: null,
    overrideHitPoints: null,
    removedHitPoints: 5,
    temporaryHitPoints: 3,
    deathSaves: { failCount: null, successCount: null },
    inspiration: true,
    conditions: [{ id: 11, level: null }],
    preferences: { encumbranceType: 1 },
    alignmentId: 3,
    lifestyleId: 5,
    age: 41,
    weight: 150,
    traits: { ideals: "Knowledge." },
    notes: { backstory: "Raised among gears.", allies: "The Guild" },
    ...overrides,
  };
}

describe("D&D Beyond JSON format helpers", () => {
  it("accepts the API envelope, the bare object or its text, and nothing else", () => {
    const bare = tinker();
    expect(asDdbCharacter({ success: true, data: bare })?.name).toBe("Odo Gearwright");
    expect(asDdbCharacter(bare)?.id).toBe(4242);
    expect(asDdbCharacter(JSON.stringify({ data: bare }))?.id).toBe(4242);
    expect(asDdbCharacter({ name: "An app export", classes: [] })).toBeUndefined();
    expect(asDdbCharacter("not json")).toBeUndefined();
  });

  it("finds the character id in sheet links and bare ids", () => {
    expect(ddbCharacterId("https://www.dndbeyond.com/characters/48151623")).toBe("48151623");
    expect(ddbCharacterId("dndbeyond.com/characters/12/builder/class")).toBe("12");
    expect(ddbCharacterId(" 98765 ")).toBe("98765");
    expect(ddbCharacterId("https://www.dndbeyond.com/monsters/123")).toBeUndefined();
  });

  it("spells DDB names the way 5eTools does", () => {
    expect(ddbNameVariants("Crossbow, Light", "item")).toContain("Light Crossbow");
    expect(ddbNameVariants("Rope, Hempen (50 feet)", "item")).toContain("Hempen Rope (50 feet)");
    expect(ddbNameVariants("Studded Leather", "item")).toContain("Studded Leather Armor");
    expect(ddbNameVariants("Crossbow Bolts", "item")).toContain("Crossbow Bolt");
    expect(ddbNameVariants("Magic Initiate (Wizard)", "feat")).toEqual([
      "Magic Initiate (Wizard)",
      "Magic Initiate; Wizard",
      "Magic Initiate",
    ]);
  });
});

describe("ddbAbilities (DDB's ability-total rule)", () => {
  it("drops the species' ASI trait under a 2024 background and adds Other after the cap", () => {
    const abilities = ddbAbilities(tinker());
    expect(abilities.con.total).toBe(14); // 13 + 1 (background); the +2 Hill Dwarf trait is filtered
    expect(abilities.int.total).toBe(18); // 15 + 2 (background) + 1 (Fey Touched)
    expect(abilities.dex.total).toBe(15); // 14 + Other 1
    expect(abilities.int.parts).toEqual([
      { label: "Sage Ability Score Improvements", value: 2 },
      { label: "Fey Touched", value: 1 },
    ]);
  });

  it("keeps the species' ASI without a 2024 background", () => {
    const classic = tinker({ feats: [] });
    classic.modifiers = { ...classic.modifiers, feat: [] };
    expect(ddbAbilities(classic).con.total).toBe(15);
  });

  it("caps at 20 unless raised, floors at set scores from attuned items, and honours overrides", () => {
    const headband = (isAttuned: boolean) => ({
      id: 2001,
      equipped: true,
      isAttuned,
      definition: {
        name: "Headband of Brilliance",
        grantedModifiers: [{ type: "set", subType: "intelligence-score", value: 19, requiresAttunement: true }],
      },
    });
    const capped = tinker({ stats: stats([8, 14, 13, 19, 12, 10]) });
    expect(ddbAbilities(capped).int.total).toBe(20); // 19 + 3, capped
    expect(ddbAbilities(tinker({ inventory: [headband(false)] })).int.total).toBe(18);
    expect(ddbAbilities(tinker({ inventory: [headband(true)], stats: stats([8, 14, 13, 10, 12, 10]) })).int.total).toBe(19);
    const tome = {
      id: 2002,
      equipped: true,
      definition: {
        name: "Tome",
        grantedModifiers: [
          { type: "bonus", subType: "intelligence-score", value: 2 },
          { type: "bonus", subType: "ability-score-maximum", value: 2, statId: 4 },
        ],
      },
    };
    expect(ddbAbilities({ ...capped, inventory: [tome] }).int.total).toBe(22);
    expect(ddbAbilities(tinker({ overrideStats: stats([null, null, null, 7, null, null]) })).int.total).toBe(7);
  });

  it("computes max HP from the hit-dice total, Con and per-level bonuses", () => {
    expect(ddbMaxHp(tinker(), 2)).toBe(33);
    const tough = tinker();
    tough.modifiers!.feat = [...tough.modifiers!.feat!, bonus("hit-points-per-level", 2, 903)];
    expect(ddbMaxHp(tough, 2)).toBe(41);
    expect(ddbMaxHp(tinker({ overrideHitPoints: 50 }), 2)).toBe(50);
  });
});

describe("characterFromDdbJson", () => {
  const { character, warnings } = characterFromDdbJson(tinker(), index);
  const derived = deriveFromCharacter(character, index);

  it("resolves class, subclass, species and the background from the cited book", () => {
    expect(character.name).toBe("Odo Gearwright");
    expect(character.edition).toBe("one");
    expect(character.classes).toEqual([
      { name: "Artificer", source: "TCE", level: 4, subclass: { name: "Artillerist", source: "TCE" } },
    ]);
    expect(character.race).toEqual({ name: "Dwarf", source: "PHB" });
    expect(character.subrace).toEqual({ name: "Hill", source: "PHB" });
    expect(character.background).toEqual({ name: "Sage", source: "XPHB" });
  });

  it("rebuilds the ability scores from base + choices, matching DDB without overrides", () => {
    expect(character.baseAbilities).toEqual({ str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 });
    expect(character.abilityAdjustments.other).toEqual({ dex: 1 });
    expect(character.abilityAdjustments.override).toEqual({});
    expect(character.asis).toEqual([{ type: "feat", ref: { name: "Fey Touched", source: "TCE" } }]);
    expect(character.abilityChoices).toEqual({ "primary:ability:0": ["int", "con"], "asifeat:0:ability:0": ["int"] });
    expect(derived.abilities).toEqual({ str: 8, dex: 15, con: 14, int: 18, wis: 12, cha: 10 });
  });

  it("pins what the content can't reproduce and says why", () => {
    const tomeReader = tinker({
      inventory: [
        {
          id: 3001,
          equipped: true,
          definition: { name: "Tome of Testing", grantedModifiers: [{ type: "bonus", subType: "wisdom-score", value: 2 }] },
        },
      ],
    });
    const result = characterFromDdbJson(tomeReader, index);
    expect(result.character.abilityAdjustments.override).toEqual({ wis: 14 });
    expect(deriveFromCharacter(result.character, index).abilities.wis).toBe(14);
    expect(result.warnings.join("\n")).toMatch(/WIS 14 \(D&D Beyond: base 12, Tome of Testing \+2; this build makes 12\)/);
  });

  it("deals skills, languages and tools into the build's slots", () => {
    expect(derived.proficientSkillIds.sort()).toEqual(["arcana", "history", "investigation", "perception"]);
    expect(derived.proficiencies.languages.fixed).toEqual(expect.arrayContaining(["Common", "Dwarvish"]));
    expect(derived.proficiencies.tools.fixed.map((t) => t.toLowerCase())).toEqual(
      expect.arrayContaining(["calligrapher's supplies", "thieves' tools", "tinker's tools"]),
    );
  });

  it("keeps the inventory: reprint by source, equipped state, containers and custom items", () => {
    const byName = Object.fromEntries(character.inventory.map((item) => [item.name, item]));
    expect(byName["Studded Leather Armor"]).toMatchObject({ ref: { source: "XPHB" }, equipped: true });
    expect(byName["Light Crossbow"]).toMatchObject({ ref: { name: "Light Crossbow", source: "XPHB" } });
    expect(byName["Rations (1 day)"]).toMatchObject({ quantity: 5, containedIn: byName.Backpack.id });
    expect(byName["Thunder Pistol"]).toMatchObject({
      custom: { weight: 3, dmg1: "1d10", dmgType: "Piercing", weaponCategory: "martial", ranged: true, range: "30/90" },
      equipped: true,
    });
    expect(byName["Lucky Coin"]).toMatchObject({ custom: { weight: 0 }, quantity: 1 });
    expect(character.currency).toEqual({ cp: 0, sp: 3, ep: 0, gp: 15, pp: 0 });
    expect(derived.ac).toBe(14); // studded leather 12 + Dex 2
    expect(warnings.join("\n")).toMatch(/1 item as a custom item.*Thunder Pistol/);
  });

  it("imports prepared class spells and seats feat spells in the feat's picks", () => {
    expect(character.cantrips).toEqual([{ name: "Fire Bolt", source: "XPHB", forClass: "Artificer" }]);
    expect(character.spells).toEqual([{ name: "Cure Wounds", source: "XPHB", forClass: "Artificer" }]);
    expect(warnings.join("\n")).toMatch(/unprepared spell.*Grease/);
    expect(character.featSpellSets).toEqual({ "bgfeat:0": "Wizard Spells" });
    expect(character.featSpells).toEqual({
      "bgfeat:0:spell:0": [
        { name: "Light", source: "XPHB" },
        { name: "Mage Hand", source: "XPHB" },
      ],
      "bgfeat:0:spell:1": [{ name: "Sleep", source: "XPHB" }],
    });
  });

  it("fits HP rolls to DDB's max HP and carries the table state over", () => {
    expect(derived.maxHp).toBe(33);
    expect(character.hpMode).toBe("rolled");
    expect(character.play).toMatchObject({
      damageTaken: 5,
      tempHp: 3,
      usedSlots: [1, 0],
      usedHitDice: [1],
      deathSaves: { successes: 0, failures: 0 },
      inspiration: true,
      conditions: ["Poisoned"],
    });
    // DDB's standard encumbrance: no variant speed penalties.
    expect(character.variantEncumbrance).toBe(false);
  });

  it("brings details, notes and custom actions along", () => {
    expect(character.details).toMatchObject({
      alignment: "Chaotic Good",
      lifestyle: "Modest",
      age: "41",
      weight: "150 lb",
      ideals: "Knowledge.",
      backstory: "Raised among gears.",
    });
    expect(character.details.notes).toBe("Allies:\nThe Guild");
    // Str 8 (−1) + proficiency 2 to hit; −1 damage (the app's minus sign).
    expect(character.customAttacks).toEqual([{ name: "Wrench Swing", hit: 1, damage: "1d6\u22121" }]);
  });

  it("deals a classic species' chosen ability increases into its choice slots", () => {
    const halfElf = tinker({
      feats: [],
      race: { fullName: "Half-Elf", baseRaceName: "Half-Elf", isSubRace: false, sources: src(2), racialTraits: [] },
      background: { hasCustomBackground: false, definition: { name: "Sage", sources: src(2) } },
      modifiers: {
        race: [bonus("charisma-score", 2, 1), bonus("dexterity-score", 1, 2), bonus("constitution-score", 1, 2)],
        class: [],
        background: [],
        feat: [],
      },
      classSpells: [],
      spells: {},
    });
    const result = characterFromDdbJson(halfElf, index);
    expect(result.character.edition).toBe("classic");
    expect(result.character.background).toEqual({ name: "Sage", source: "PHB" });
    expect(result.character.abilityChoices).toEqual({ "primary:ability:0": ["dex", "con"] });
    expect(result.character.abilityAdjustments.override).toEqual({});
    expect(deriveFromCharacter(result.character, index).abilities).toMatchObject({ dex: 16, con: 14, cha: 12 });
  });

  it("reports what isn't in the content instead of guessing", () => {
    const result = characterFromDdbJson(
      tinker({
        classes: [{ id: 1, level: 3, definition: { name: "Gunslinger", sources: src(197) } }],
        race: { fullName: "Plasmoid", isSubRace: false, sources: src(90) },
      }),
      index,
    );
    expect(result.character.classes).toEqual([]);
    expect(result.warnings.join("\n")).toMatch(/Class "Gunslinger" isn't in your imported content/);
    expect(result.warnings.join("\n")).toMatch(/Species "Plasmoid" isn't in your imported content/);
  });
});

describe("importCharacterFile", () => {
  it("recognises D&D Beyond's JSON (API envelope included)", async () => {
    const file = new File([JSON.stringify({ success: true, data: tinker() })], "48151623.json", {
      type: "application/json",
    });
    const { character } = await importCharacterFile(file, index, "classic");
    expect(character.name).toBe("Odo Gearwright");
    expect(character.background).toEqual({ name: "Sage", source: "XPHB" });
  });
});

describe("fetchDdbCharacter", () => {
  const reply = (status: number, body: unknown, type = "application/json") =>
    vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": type } }));

  it("asks the relay for the character from a sheet link", async () => {
    const fetchImpl = reply(200, { success: true, data: tinker() });
    const ddb = await fetchDdbCharacter("https://www.dndbeyond.com/characters/4242", fetchImpl);
    expect(ddb.name).toBe("Odo Gearwright");
    expect(fetchImpl).toHaveBeenCalledWith("/ddb-character/4242");
  });

  it("explains private characters, a missing relay and bad links", async () => {
    await expect(fetchDdbCharacter("4242", reply(403, { success: false }))).rejects.toThrow(/private.*Public/);
    await expect(fetchDdbCharacter("4242", reply(200, "<!doctype html>", "text/html"))).rejects.toThrow(
      /dev or preview server.*character-service\.dndbeyond\.com\/character\/v5\/character\/4242/,
    );
    await expect(fetchDdbCharacter("https://example.com/me", reply(200, {}))).rejects.toThrow(/isn't a D&D Beyond character link/);
  });
});
