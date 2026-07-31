import { describe, expect, it } from "vitest";
import { featPrerequisiteCheck, multiclassCheck } from "./prerequisites";
import { weaponMasteryCount, masteryNames } from "./mastery";
import { characteristicTables } from "./characteristics";
import { emptyAbilities } from "../model/character";

const abilities = (over: Partial<Record<string, number>>) => ({
  ...emptyAbilities(10),
  ...over,
});

describe("multiclassCheck", () => {
  it("validates flat ANDed minimums", () => {
    const reqs = { str: 13, cha: 13 };
    expect(multiclassCheck(reqs, abilities({ str: 13, cha: 13 })).met).toBe(true);
    const fail = multiclassCheck(reqs, abilities({ str: 13 }));
    expect(fail.met).toBe(false);
    expect(fail.text).toBe("Strength 13, Charisma 13");
  });

  it("treats an `or` group as satisfied by any listed ability", () => {
    const reqs = { or: [{ str: 13, dex: 13 }] };
    expect(multiclassCheck(reqs, abilities({ dex: 13 })).met).toBe(true);
    const fail = multiclassCheck(reqs, abilities({}));
    expect(fail.met).toBe(false);
    expect(fail.text).toBe("Strength 13 or Dexterity 13");
  });

  it("passes with no requirements", () => {
    expect(multiclassCheck(undefined, abilities({}))).toEqual({ met: true });
  });
});

describe("featPrerequisiteCheck", () => {
  it("checks ability alternatives within an entry", () => {
    const feat = { prerequisite: [{ ability: [{ str: 13 }, { dex: 13 }] }] };
    expect(featPrerequisiteCheck(feat, abilities({ dex: 14 }), 1).met).toBe(true);
    const fail = featPrerequisiteCheck(feat, abilities({}), 1);
    expect(fail.met).toBe(false);
    expect(fail.text).toBe("Strength 13 or Dexterity 13");
  });

  it("checks minimum level and ORs across entries", () => {
    const feat = { prerequisite: [{ level: 4 }, { ability: [{ int: 13 }] }] };
    expect(featPrerequisiteCheck(feat, abilities({}), 4).met).toBe(true); // entry 1
    expect(featPrerequisiteCheck(feat, abilities({ int: 14 }), 1).met).toBe(true); // entry 2
    expect(featPrerequisiteCheck(feat, abilities({}), 1).met).toBe(false);
  });

  it("passes with no prerequisites, and for unvalidated kinds", () => {
    expect(featPrerequisiteCheck({}, abilities({}), 1).met).toBe(true);
    expect(featPrerequisiteCheck({ prerequisite: [{ spellcasting: true }] }, abilities({}), 1).met).toBe(true);
  });
});

describe("weapon mastery", () => {
  const cls = {
    classTableGroups: [
      { colLabels: ["Vigor Uses"], rows: [[2], [2]] },
      { colLabels: ["{@variantrule Weapon Mastery|XPHB}"], rows: [[2], [3]] },
    ],
  };

  it("reads the mastery count from the class table column", () => {
    expect(weaponMasteryCount(cls, 1)).toBe(2);
    expect(weaponMasteryCount(cls, 2)).toBe(3);
    expect(weaponMasteryCount({}, 5)).toBe(0);
  });

  it("strips source suffixes from item mastery properties", () => {
    expect(masteryNames({ mastery: ["Sap|XPHB", "Vex"] })).toEqual(["Sap", "Vex"]);
  });
});

describe("characteristicTables", () => {
  it("finds trait/ideal/bond/flaw tables inside background entries", () => {
    const background = {
      entries: [
        "Some intro text.",
        {
          type: "table",
          colLabels: ["d4", "Personality Trait"],
          rows: [
            ["1", "I always have a plan."],
            ["2", "I face problems head-on."],
          ],
        },
        { type: "table", colLabels: ["d6", "Ideal"], rows: [["1", "Duty above all."]] },
        { type: "table", colLabels: ["d8", "Loot"], rows: [["1", "A rusty key."]] },
      ],
    };
    const tables = characteristicTables(background);
    expect(tables).toHaveLength(2);
    expect(tables[0]).toMatchObject({ field: "personalityTraits", label: "Personality Trait" });
    expect(tables[0].options).toHaveLength(2);
    expect(tables[1]).toMatchObject({ field: "ideals", options: ["Duty above all."] });
  });
});
