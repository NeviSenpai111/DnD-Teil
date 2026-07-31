import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importFiles } from "../data/importer";
import { ContentIndex } from "../data/contentIndex";
import { createCharacter } from "../model/character";
import { allSpellcastersFor, availableSpells, deriveFromCharacter, spellcastingFor } from "./selectors";

function loadSrdLite(): { index: ContentIndex; entities: ReturnType<typeof importFiles>["entities"] } {
  const text = readFileSync("public/sample-data/srd-lite.json", "utf8");
  const result = importFiles([{ name: "srd-lite.json", text }]);
  return { index: new ContentIndex(result.entities, result.metaSources), entities: result.entities };
}

describe("Phase 4 acceptance: spellcasting for a Channeler", () => {
  const { index, entities } = loadSrdLite();

  const channeler = createCharacter({
    name: "Arcanist",
    classes: [{ name: "Channeler", source: "SRDLite", level: 1 }],
    baseAbilities: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 10 },
  });

  it("identifies the caster and computes DC, attack, slots and limits", () => {
    const sc = spellcastingFor(channeler, index)!;
    expect(sc).toBeDefined();
    expect(sc.summary.ability).toBe("int");
    expect(sc.summary.saveDc).toBe(13); // 8 + PB 2 + int +3
    expect(sc.summary.attackBonus).toBe(5); // PB 2 + int +3
    expect(sc.summary.slots).toEqual([2]); // full caster level 1
    expect(sc.limits.cantrips).toBe(3);
    expect(sc.limits.spells).toBe(4);
    expect(sc.limits.spellsLabel).toBe("known");
  });

  it("lists only Channeler spells up to the max castable level", () => {
    const spells = availableSpells(entities, "Channeler", 1);
    expect(spells.filter((s) => s.level === 0)).toHaveLength(3);
    expect(spells.filter((s) => s.level === 1)).toHaveLength(3);
  });

  it("returns undefined for a non-caster (Warden)", () => {
    const warden = createCharacter({ classes: [{ name: "Warden", source: "SRDLite", level: 1 }] });
    expect(spellcastingFor(warden, index)).toBeUndefined();
  });
});

describe("multiclass: Warden 2 / Channeler 3", () => {
  const { index } = loadSrdLite();
  const multi = createCharacter({
    classes: [
      { name: "Warden", source: "SRDLite", level: 2 },
      { name: "Channeler", source: "SRDLite", level: 3 },
    ],
    baseAbilities: { str: 14, dex: 10, con: 14, int: 16, wis: 10, cha: 10 },
  });

  it("finds the caster at its class index with CLASS-level limits and TOTAL-level PB", () => {
    const casters = allSpellcastersFor(multi, index);
    expect(casters).toHaveLength(1);
    const sc = casters[0];
    expect(sc.className).toBe("Channeler");
    expect(sc.classIndex).toBe(1);
    // Limits from Channeler level 3, not character level 5.
    expect(sc.limits.cantrips).toBe(3);
    expect(sc.limits.spells).toBe(6);
    // Save DC uses PB from total level 5 (PB 3): 8 + 3 + int +3 = 14.
    expect(sc.summary.saveDc).toBe(14);
    // Single caster keeps its own table: full caster level 3 -> [4, 2].
    expect(sc.summary.slots).toEqual([4, 2]);
  });

  it("derives multiclass HP and hit dice (first-class die maxed once)", () => {
    const derived = deriveFromCharacter(multi, index);
    // Warden d10 L2 + Channeler d6 L3, Con +2:
    // 10+2, (6+2), then (4+2)×3 = 12 + 8 + 18 = 38.
    expect(derived.maxHp).toBe(38);
    expect(derived.hitDie).toBe("2d10 + 3d6");
    expect(derived.level).toBe(5);
    expect(derived.pb).toBe(3);
  });
});

describe("availableSpells with spells/sources.json reverse index", () => {
  const spells = [
    { __type: "spell", name: "Fireball", source: "PHB", level: 3 },
    { __type: "spell", name: "Cure Wounds", source: "PHB", level: 1 },
  ] as unknown as Parameters<typeof availableSpells>[0];
  const idx = new ContentIndex(spells, {}, { "phb|fireball": [{ name: "Wizard", source: "PHB" }] });

  it("treats the index as authoritative; a defined class list excludes info-less spells", () => {
    // Wizard's list is known (Fireball maps to it), so the info-less Cure
    // Wounds must NOT flood in.
    const wizard = availableSpells(spells, "Wizard", 9, idx).map((s) => s.name);
    expect(wizard).toContain("Fireball");
    expect(wizard).not.toContain("Cure Wounds");

    // Cleric has no known list anywhere -> open fallback still applies.
    const cleric = availableSpells(spells, "Cleric", 9, idx).map((s) => s.name);
    expect(cleric).not.toContain("Fireball"); // mapped, Cleric excluded
    expect(cleric).toContain("Cure Wounds");
  });

  it("without any sources index, real spells (no inline classes) stay open", () => {
    // Documents the homebrew-friendly fallback: nothing known about any class
    // list -> everything is offered (the SpellsPanel shows a warning instead).
    const wizard = availableSpells(spells, "Wizard", 9).map((s) => s.name);
    expect(wizard).toEqual(["Cure Wounds", "Fireball"]);
  });
});

describe("spell counts honor the data's progression tables", () => {
  it("reads an explicit prepared-spell table (2024 classes) over the ability formula", () => {
    const wizard = {
      __type: "class",
      name: "Wizard",
      source: "XPHB",
      casterProgression: "full",
      spellcastingAbility: "int",
      cantripProgression: [3, 3, 3, 4, 4],
      preparedSpellsProgression: [4, 5, 6, 7, 9],
    } as unknown as Parameters<typeof availableSpells>[0][number];
    const idx = new ContentIndex([wizard], {});
    const ch = createCharacter({
      classes: [{ name: "Wizard", source: "XPHB", level: 5 }],
      baseAbilities: { str: 8, dex: 8, con: 8, int: 10, wis: 8, cha: 8 }, // int mod 0
    });
    const sc = spellcastingFor(ch, idx)!;
    expect(sc.limits.spellsLabel).toBe("prepared");
    expect(sc.limits.spells).toBe(9); // table[4], not max(1, 0 + 5) = 5
    expect(sc.limits.cantrips).toBe(4);
  });

  it("falls back to the subclass for caster fields (Eldritch Knight on a non-casting class)", () => {
    const fighter = { __type: "class", name: "Fighter", source: "PHB" };
    const ek = {
      __type: "subclass",
      name: "Eldritch Knight",
      source: "PHB",
      className: "Fighter",
      casterProgression: "1/3",
      spellcastingAbility: "int",
      cantripProgression: [0, 0, 2, 2, 2],
      spellsKnownProgression: [0, 0, 3, 4, 4],
    };
    const idx = new ContentIndex(
      [fighter, ek] as unknown as Parameters<typeof availableSpells>[0],
      {},
    );
    const ch = createCharacter({
      classes: [{ name: "Fighter", source: "PHB", level: 5, subclass: { name: "Eldritch Knight", source: "PHB" } }],
      baseAbilities: { str: 14, dex: 12, con: 12, int: 16, wis: 10, cha: 10 },
    });
    const sc = spellcastingFor(ch, idx)!;
    expect(sc).toBeDefined();
    expect(sc.limits.cantrips).toBe(2); // from the subclass table (was 0 before)
    expect(sc.limits.spellsLabel).toBe("known");
    expect(sc.limits.spells).toBe(4);
  });
});

describe("availableSpells collapses cross-source reprints", () => {
  const spells = [
    { __type: "spell", name: "Cure Wounds", source: "PHB", level: 1 },
    { __type: "spell", name: "Cure Wounds", source: "XPHB", level: 1 },
  ] as unknown as Parameters<typeof availableSpells>[0];

  it("shows a reprinted spell once", () => {
    const names = availableSpells(spells, "Cleric", 9).map((s) => s.name);
    expect(names).toEqual(["Cure Wounds"]);
  });

  it("prefers the casting class's own source for the kept copy", () => {
    const kept = availableSpells(spells, "Cleric", 9, undefined, "XPHB");
    expect(kept).toHaveLength(1);
    expect(kept[0].source).toBe("XPHB");
  });
});
