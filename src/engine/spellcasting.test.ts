import { describe, expect, it } from "vitest";
import {
  casterLevelContribution,
  deriveSpellcasting,
  multiclassSpellSlots,
  pactSlots,
  spellSlots,
} from "./spellcasting";

describe("spellSlots", () => {
  it("full caster level 1 and 5", () => {
    expect(spellSlots("full", 1)).toEqual([2]);
    expect(spellSlots("full", 5)).toEqual([4, 3, 2]);
  });
  it("half caster has no slots at level 1 and 5th-level slots only at 17+", () => {
    expect(spellSlots("1/2", 1)).toEqual([]);
    expect(spellSlots("1/2", 2)).toEqual([2]);
    expect(spellSlots("1/2", 17)).toEqual([4, 3, 3, 3, 1]);
  });
  it("third caster starts at level 3", () => {
    expect(spellSlots("1/3", 2)).toEqual([]);
    expect(spellSlots("1/3", 3)).toEqual([2]);
  });
  it("artificer has 1st-level slots from level 1 (half caster rounding up)", () => {
    expect(spellSlots("artificer", 1)).toEqual([2]); // unlike Paladin/Ranger
    expect(spellSlots("artificer", 2)).toEqual([2]);
    expect(spellSlots("artificer", 5)).toEqual([4, 2]);
    expect(spellSlots("artificer", 17)).toEqual([4, 3, 3, 3, 1]);
  });
  it("pact progression yields no standard slots", () => {
    expect(spellSlots("pact", 5)).toEqual([]);
  });
});

describe("multiclass spell slots", () => {
  it("computes combined caster level per progression", () => {
    expect(casterLevelContribution("full", 5)).toBe(5);
    expect(casterLevelContribution("1/2", 5)).toBe(2); // Paladin rounds down
    expect(casterLevelContribution("artificer", 5)).toBe(3); // rounds up
    expect(casterLevelContribution("1/3", 5)).toBe(1);
    expect(casterLevelContribution("pact", 5)).toBe(0);
  });

  it("a single caster keeps its own class table", () => {
    expect(multiclassSpellSlots([{ progression: "1/2", level: 1 }])).toEqual([]); // no combined rounding
  });

  it("two casters share the full-caster table at their combined level", () => {
    // Wizard 3 (3) + Ranger 2 (1) -> caster level 4 -> [4, 3].
    expect(
      multiclassSpellSlots([
        { progression: "full", level: 3 },
        { progression: "1/2", level: 2 },
      ]),
    ).toEqual([4, 3]);
  });

  it("pact magic contributes nothing to shared slots", () => {
    expect(
      multiclassSpellSlots([
        { progression: "full", level: 2 },
        { progression: "pact", level: 5 },
      ]),
    ).toEqual([3]); // full 2 alone
  });
});

describe("pactSlots", () => {
  it("scales count and slot level with warlock level", () => {
    expect(pactSlots(1)).toEqual({ count: 1, slotLevel: 1 });
    expect(pactSlots(2)).toEqual({ count: 2, slotLevel: 1 });
    expect(pactSlots(5)).toEqual({ count: 2, slotLevel: 3 });
    expect(pactSlots(11)).toEqual({ count: 3, slotLevel: 5 });
    expect(pactSlots(17)).toEqual({ count: 4, slotLevel: 5 });
  });
});

describe("deriveSpellcasting", () => {
  it("computes DC, attack and max spell level for a full caster", () => {
    const sc = deriveSpellcasting({ progression: "full", level: 5, abilityScore: 16, pb: 3, ability: "int" });
    expect(sc.saveDc).toBe(14); // 8 + 3 + 3
    expect(sc.attackBonus).toBe(6); // 3 + 3
    expect(sc.maxSpellLevel).toBe(3);
    expect(sc.slots).toEqual([4, 3, 2]);
  });

  it("reports pact slots for warlocks", () => {
    const sc = deriveSpellcasting({ progression: "pact", level: 5, abilityScore: 16, pb: 3, ability: "cha" });
    expect(sc.pact).toEqual({ count: 2, slotLevel: 3 });
    expect(sc.maxSpellLevel).toBe(3);
  });
});
