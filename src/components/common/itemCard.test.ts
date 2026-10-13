import { describe, expect, it } from "vitest";
import { ContentIndex } from "../../data/contentIndex";
import type { ImportedEntity } from "../../data/types";
import type { Item } from "../../data/types/item-content";
import { itemCard, itemWeightText, titleCase } from "./itemCard";

// Original stand-in rules text; the shapes mirror 5eTools' items-base.json.
const e = (type: string, fields: Record<string, unknown>) => ({ __type: type, ...fields }) as ImportedEntity;
const content = [
  e("itemProperty", {
    name: "V",
    abbreviation: "V",
    source: "XPHB",
    template: "{{prop_name}} ({{item.dmg2}})",
    entries: [{ type: "entries", name: "Versatile", entries: ["Swing it with both hands for the bigger die."] }],
  }),
  e("itemProperty", {
    name: "F",
    abbreviation: "F",
    source: "PHB",
    template: "{{prop_name_lower}}",
    entries: [{ type: "entries", name: "Finesse", entries: ["Pick Strength or Dexterity."] }],
  }),
  e("itemProperty", {
    name: "L",
    abbreviation: "L",
    source: "PHB",
    template: "{{prop_name_lower}}",
    entries: [{ type: "entries", name: "Light", entries: ["Small enough for the off hand."] }],
  }),
  e("itemProperty", {
    name: "T",
    abbreviation: "T",
    source: "PHB",
    template: "{{prop_name_lower}} ({{item.range}} ft.)",
    entries: [{ type: "entries", name: "Thrown", entries: ["You can throw it."] }],
  }),
  e("itemMastery", { name: "Sap", source: "XPHB", entries: ["The target fumbles its next swing."] }),
  e("itemType", { name: "Melee Weapon", abbreviation: "M", source: "XPHB" }),
  e("itemType", { name: "Medium Armor", abbreviation: "MA", source: "PHB" }),
  e("itemType", { name: "Shield", abbreviation: "S", source: "PHB" }),
  e("itemType", {
    name: "Ranged Weapon",
    abbreviation: "R",
    source: "PHB",
    entries: [{ type: "entries", name: "Range", entries: ["Two numbers: normal and long range."] }],
  }),
  e("itemEntry", {
    name: "Glyph Ink",
    source: "TST",
    entriesTemplate: ["This ink glows {{item.detail1}}."],
  }),
  e("book", { name: "Test Manual (2024)", source: "TST", id: "TST" }),
];
const index = new ContentIndex(content);

const sword = {
  name: "Test Sword",
  source: "TST",
  page: 12,
  type: "M|XPHB",
  rarity: "none",
  weight: 3,
  value: 1500,
  weaponCategory: "martial",
  property: ["V|XPHB"],
  mastery: ["Sap|XPHB"],
  dmg1: "1d8",
  dmgType: "S",
  dmg2: "1d10",
  weapon: true,
} as Item;

describe("itemCard", () => {
  it("lays a weapon out like 5eTools: type lines, cost/weight, damage, properties, mastery", () => {
    const card = itemCard(sword, index);
    expect(card.typeLine).toBe("Weapon");
    expect(card.subtypeLine).toBe("Martial Weapon, Melee Weapon");
    expect(card.costWeight).toBe("15 gp, 3 lb.");
    expect(card.stats).toEqual(["{@damage 1d8} Slashing", "Versatile ({@damage 1d10})", "Mastery: Sap"]);
    expect(card.sourceTitle).toBe("Test Manual (2024)");
    expect(card.page).toBe(12);
  });

  it("appends the rules for each property and the mastery", () => {
    const card = itemCard(sword, index);
    expect(card.notes).toEqual([
      { type: "entries", name: "Versatile", entries: ["Swing it with both hands for the bigger die."] },
      { type: "entries", name: "Mastery: Sap", entries: ["The target fumbles its next swing."] },
    ]);
  });

  it("sorts classic properties by name, lower-cased after the first, with the thrown range", () => {
    const dagger = {
      name: "Test Dagger",
      source: "TST",
      type: "M",
      weaponCategory: "simple",
      property: ["T", "F", "L"],
      range: "20/60",
      dmg1: "1d4",
      dmgType: "P",
    } as Item;
    expect(itemCard(dagger, index).stats[1]).toBe("Finesse, light, thrown (20/60 ft.)");
  });

  it("adds a ranged weapon's type rules and an unused range", () => {
    const bow = { name: "Test Bow", source: "TST", type: "R", weaponCategory: "simple", range: "80/320" } as Item;
    const card = itemCard(bow, index);
    expect(card.subtypeLine).toBe("Simple Weapon, Ranged Weapon");
    expect(card.stats).toEqual(["Range 80/320 ft."]);
    expect(card.notes[0]).toMatchObject({ name: "Range" });
  });

  it("falls back to built-in property templates without itemProperty content", () => {
    const card = itemCard({ ...sword, property: ["V"], mastery: ["Sap"] }, new ContentIndex([]));
    expect(card.stats).toEqual(["{@damage 1d8} Slashing", "Versatile ({@damage 1d10})", "Mastery: Sap"]);
    expect(card.subtypeLine).toBe("Martial Weapon, Melee Weapon");
    expect(card.notes).toEqual([]);
  });

  it("shows rarity and attunement for magic items and fills itemEntry templates", () => {
    const tattoo = {
      name: "Glowing Glyph",
      source: "TST",
      wondrous: true,
      rarity: "rare",
      reqAttune: "by a wizard",
      detail1: "faintly blue",
      entries: ["{#itemEntry Glyph Ink|TST}"],
    } as Item;
    const card = itemCard(tattoo, index);
    expect(card.typeLine).toBe("Wondrous Item, Rare (Requires Attunement by a wizard)");
    expect(card.entries).toEqual(["This ink glows faintly blue."]);
    expect(card.costWeight).toBe("");
  });

  it("formats armor class per armor type, with the stealth note", () => {
    const scale = { name: "Test Scale", source: "TST", type: "MA", ac: 14, stealth: true, weight: 45 } as Item;
    const card = itemCard(scale, index);
    expect(card.typeLine).toBe("Medium Armor");
    expect(card.stats).toEqual(["AC 14 + Dex (max 2)"]);
    expect(card.notes).toEqual(["The wearer has Disadvantage on Dexterity ({@skill Stealth}) checks."]);

    const shield = itemCard({ name: "Test Shield", source: "TST", type: "S", ac: 2 } as Item, index);
    expect(shield.typeLine).toBe("Armor (Shield)");
    expect(shield.stats).toEqual(["AC +2"]);
  });

  it("names the base item of a magic weapon", () => {
    const blade = { ...sword, name: "Night Blade", baseItem: "longsword|phb", rarity: "legendary", reqAttune: true };
    expect(itemCard(blade, index).typeLine).toBe("Weapon (Longsword), Legendary (Requires Attunement)");
  });
});

describe("itemWeightText", () => {
  it("uses fractions and ounces like 5eTools", () => {
    expect(itemWeightText({ weight: 3 })).toBe("3 lb.");
    expect(itemWeightText({ weight: 0.5 })).toBe("½ lb.");
    expect(itemWeightText({ weight: 2.25 })).toBe("2¼ lb.");
    expect(itemWeightText({ weight: 0.0625 })).toBe("1 oz.");
    expect(itemWeightText({})).toBe("");
  });
});

describe("titleCase", () => {
  it("keeps short joining words lower-case", () => {
    expect(titleCase("food and drink")).toBe("Food and Drink");
    expect(titleCase("wondrous item (tattoo)")).toBe("Wondrous Item (Tattoo)");
  });
});
