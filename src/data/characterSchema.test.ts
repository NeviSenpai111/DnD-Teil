import { describe, expect, it } from "vitest";
import { sanitizeCharacter } from "./characterSchema";
import { characterLevel, createCharacter, emptyPlayState, type Character } from "../model/character";

/** Parse from text, as an imported file would be (keeps "__proto__" as an own key). */
const fromFile = (value: unknown) => JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

const ref = (name: string) => ({ name, source: "HB" });

/** A character with every field, optional ones included, filled in. */
function fullCharacter(): Character {
  return createCharacter({
    name: "Mira Quill",
    edition: "one",
    race: ref("Sturdyfolk"),
    subrace: ref("Hill"),
    background: ref("Sage"),
    customBackground: { name: "Wanderer", description: "Roams." },
    classes: [
      { name: "Warden", source: "HB", level: 3, subclass: ref("Thorn") },
      { name: "Channeler", source: "HB", level: 2 },
    ],
    abilityMethod: "manual",
    baseAbilities: { str: 12, dex: 14, con: 13, int: 10, wis: 15, cha: 8 },
    abilityAdjustments: { set: { str: 15 }, other: { dex: 1 }, override: { cha: 19 } },
    abilityChoices: { "race:0": ["str", "con"] },
    skillChoices: { "class:0": ["athletics"] },
    optionalFeatures: { "optfeature:0:c:0": [ref("Defense")] },
    expertiseChoices: { "expertise:0:1": ["stealth"] },
    languageChoices: { "bg:0": ["Elvish"] },
    toolChoices: { "bg:0": ["Lute"] },
    weaponMasteries: ["Longsword"],
    hpMode: "rolled",
    hpRolls: [6, 4, 7, 3],
    cantrips: [{ ...ref("Spark"), forClass: "Channeler" }],
    spells: [ref("Ward")],
    featSpells: { "feat:0": [ref("Spark")] },
    featSpellSets: { "feat:0": "wizard" },
    equipmentMode: "gold",
    inventory: [
      { id: "itm_a", ref: ref("Backpack"), name: "Backpack", quantity: 1, equipped: true },
      {
        id: "itm_b",
        name: "Odd Blade",
        quantity: 2,
        equipped: false,
        attuned: true,
        containedIn: "itm_a",
        custom: { weight: 3, dmg1: "1d6", dmgType: "S", weaponCategory: "martial", ranged: false, finesse: true, range: "20/60" },
      },
    ],
    gold: 0,
    currency: { cp: 1, sp: 2, ep: 0, gp: 30, pp: 1 },
    asis: [{ type: "asi", increases: { wis: 2 } }, { type: "feat", ref: ref("Alert") }],
    customAttacks: [{ name: "Headbutt", hit: 4, damage: "1d4+2" }],
    extras: [ref("Owl")],
    play: {
      ...emptyPlayState(),
      damageTaken: 5,
      tempHp: 3,
      usedSlots: [1, 0],
      usedPactSlots: 1,
      usedHitDice: [1, 0],
      deathSaves: { successes: 1, failures: 2 },
      usedResources: { Rage: 1 },
      usedItemCharges: { Wand: 2 },
      activeEffects: ["Mage Armor"],
      inspiration: true,
      conditions: ["Prone"],
    },
    variantEncumbrance: false,
    details: { ...createCharacter().details, alignment: "NG", backstory: "Long story." },
  });
}

describe("sanitizeCharacter", () => {
  it("keeps every field of a character this app exported", () => {
    const original = fullCharacter();
    const { character, dropped } = sanitizeCharacter(fromFile(original));
    expect(dropped).toEqual([]);
    expect(character).toEqual(original);
  });

  it("falls back to the default for a field of the wrong type and reports it", () => {
    const { character, dropped } = sanitizeCharacter(
      fromFile({ name: "Bad", classes: "oops", edition: "fourth", baseAbilities: { str: 10 }, play: [] }),
    );
    expect(character.name).toBe("Bad");
    expect(character.classes).toEqual([]);
    expect(character.edition).toBe("classic");
    expect(character.baseAbilities).toEqual(createCharacter().baseAbilities);
    expect(character.play).toEqual(emptyPlayState());
    expect(characterLevel(character)).toBe(1);
    expect(dropped).toEqual(["edition", "classes", "baseAbilities", "play"]);
  });

  it("drops bad list items one by one, but drops a level-indexed list whole", () => {
    const { character, dropped } = sanitizeCharacter(
      fromFile({
        name: "Mixed",
        classes: [
          { name: "Warden", source: "HB", level: 2 },
          { name: "Channeler", source: "HB", level: 1e9 },
        ],
        inventory: [{ name: "Rope", quantity: 1, equipped: false }, { name: 7 }],
        hpRolls: [5, "six"],
      }),
    );
    expect(character.classes.map((c) => c.name)).toEqual(["Warden"]);
    expect(character.inventory.map((i) => i.name)).toEqual(["Rope"]);
    expect(character.hpRolls).toEqual([]);
    expect(dropped).toEqual(["classes[1]", "hpRolls", "inventory[1]"]);
  });

  it("drops a bad optional field but keeps the rest of the item", () => {
    const { character, dropped } = sanitizeCharacter(
      fromFile({ name: "Opt", classes: [{ name: "Warden", source: "HB", level: 1, subclass: "Thorn" }] }),
    );
    expect(character.classes).toEqual([{ name: "Warden", source: "HB", level: 1 }]);
    expect(dropped).toEqual(["classes[0].subclass"]);
  });

  it("keeps unfilled pick slots in place", () => {
    // The builder fills slots by index, so a half-made pick exports with nulls.
    const { character, dropped } = sanitizeCharacter(
      JSON.parse(
        '{"name":"Half","skillChoices":{"class:0":[null,"stealth"]},"asis":[null,{"type":"asi","increases":{"dex":2}}],"hpRolls":[null,5]}',
      ),
    );
    expect(character.skillChoices["class:0"]).toEqual([undefined, "stealth"]);
    expect(character.asis).toEqual([undefined, { type: "asi", increases: { dex: 2 } }]);
    expect(character.hpRolls).toEqual([undefined, 5]);
    expect(dropped).toEqual([]);
  });

  it("ignores prototype keys in maps", () => {
    const { character, dropped } = sanitizeCharacter(
      JSON.parse('{"name":"Proto","skillChoices":{"__proto__":["polluted"],"class:0":["athletics"]}}'),
    );
    expect(character.skillChoices).toEqual({ "class:0": ["athletics"] });
    expect(Object.getPrototypeOf(character.skillChoices)).toBe(Object.prototype);
    expect(dropped).toEqual(["skillChoices.__proto__"]);
  });
});
