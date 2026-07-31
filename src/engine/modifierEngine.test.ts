import { describe, expect, it } from "vitest";
import {
  applyToValue,
  itemModifiers,
  racePassives,
  resolveTarget,
  type Modifier,
  type ModifierContext,
} from "./modifierEngine";
import { deriveCharacter } from "./character";
import { emptyAbilities } from "../model/character";

const ctx: ModifierContext = { armored: false, shield: false };

describe("modifier stacking rules", () => {
  it("adds bonuses from different sources", () => {
    const mods: Modifier[] = [
      { type: "bonus", target: "ac", value: 1, source: "Ring of Warding" },
      { type: "bonus", target: "ac", value: 2, source: "Cloak of Warding" },
    ];
    expect(resolveTarget(mods, "ac", ctx).bonus).toBe(3);
  });

  it("counts same-source bonuses once, keeping the largest", () => {
    const mods: Modifier[] = [
      { type: "bonus", target: "ac", value: 1, source: "Charm of Warding" },
      { type: "bonus", target: "ac", value: 2, source: "Charm of Warding" },
    ];
    expect(resolveTarget(mods, "ac", ctx).bonus).toBe(2);
  });

  it("treats set as a floor — the highest set wins but can't lower a higher base", () => {
    const mods: Modifier[] = [
      { type: "set", target: "int", value: 19, source: "Circlet of Insight" },
      { type: "set", target: "int", value: 17, source: "Lesser Circlet" },
    ];
    expect(applyToValue(8, mods, "int", ctx)).toBe(19);
    expect(applyToValue(20, mods, "int", ctx)).toBe(20);
  });

  it("applies conditions against the equipment context", () => {
    const mods: Modifier[] = [
      { type: "bonus", target: "ac", value: 1, source: "Stalwart Stance", condition: "armored" },
      { type: "bonus", target: "ac", value: 2, source: "Bracers", condition: "unarmored" },
      { type: "bonus", target: "ac", value: 3, source: "Shield Charm", condition: "shield" },
    ];
    expect(resolveTarget(mods, "ac", { armored: true, shield: false }).bonus).toBe(1);
    expect(resolveTarget(mods, "ac", { armored: false, shield: true }).bonus).toBe(5);
  });
});

describe("content-derived modifiers", () => {
  it("reads an item's AC bonus in both string and number form", () => {
    expect(itemModifiers({ name: "Charm", source: "X", bonusAc: "+1" })).toEqual([
      { type: "bonus", target: "ac", value: 1, source: "Charm" },
    ]);
    expect(itemModifiers({ name: "Charm", source: "X", bonusAc: 2 })[0].value).toBe(2);
  });

  it("reads an item's static ability set-score", () => {
    const mods = itemModifiers({ name: "Circlet", source: "X", ability: { static: { int: 19 } } });
    expect(mods).toEqual([{ type: "set", target: "int", value: 19, source: "Circlet" }]);
  });

  it("gathers species resistances and darkvision", () => {
    const passives = racePassives([
      { name: "Sturdyfolk", source: "X", resist: ["poison"], darkvision: 60 },
      undefined,
    ]);
    expect(passives.resistances).toEqual(["poison"]);
    expect(passives.senses).toEqual(["Darkvision 60 ft."]);
  });

  it("skips choice-form resist entries", () => {
    const passives = racePassives([
      { name: "X", source: "X", resist: [{ choose: { from: ["acid", "cold"] } }] },
    ]);
    expect(passives.resistances).toEqual([]);
  });
});

describe("deriveCharacter with modifiers", () => {
  const base = {
    edition: "classic" as const,
    level: 1,
    baseAbilities: emptyAbilities(10),
    abilityChoices: {},
    skillChoices: {},
  };

  it("applies AC bonuses, ability set floors, and surfaces passives", () => {
    const derived = deriveCharacter({
      ...base,
      race: { name: "Sturdyfolk", source: "X", speed: 25, resist: ["poison"], darkvision: 60 },
      modifiers: [
        { type: "bonus", target: "ac", value: 1, source: "Charm of Warding" },
        { type: "set", target: "int", value: 19, source: "Circlet of Insight" },
        { type: "bonus", target: "initiative", value: 2, source: "Alert Charm" },
        { type: "bonus", target: "speed", value: 10, source: "Fleet Boots" },
      ],
    });
    expect(derived.ac).toBe(11); // 10 + dex 0 + 1
    expect(derived.abilities.int).toBe(19);
    expect(derived.mods.int).toBe(4);
    expect(derived.initiative).toBe(2);
    expect(derived.speed).toBe(35); // Sturdyfolk default 25 + 10
    expect(derived.resistances).toEqual(["poison"]);
    expect(derived.senses).toEqual(["Darkvision 60 ft."]);
  });

  it("lets a manual override still win over a set modifier", () => {
    const derived = deriveCharacter({
      ...base,
      adjustments: { override: { int: 12 } },
      modifiers: [{ type: "set", target: "int", value: 19, source: "Circlet" }],
    });
    expect(derived.abilities.int).toBe(12);
  });

  it("ignores an armored-only modifier when unarmored", () => {
    const derived = deriveCharacter({
      ...base,
      modifiers: [
        { type: "bonus", target: "ac", value: 1, source: "Stalwart Stance", condition: "armored" },
      ],
    });
    expect(derived.ac).toBe(10);
  });
});
