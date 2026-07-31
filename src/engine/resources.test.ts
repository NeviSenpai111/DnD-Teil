import { describe, expect, it } from "vitest";
import { classResources, shortRestRestores } from "./resources";

describe("classResources", () => {
  const barbarianish = {
    classTableGroups: [
      {
        colLabels: ["{@filter Rages|classes|feature=rage}", "Rage Damage", "Weapons Known"],
        rows: [
          [2, { type: "bonus", value: 2 }, 3],
          [2, { type: "bonus", value: 2 }, 3],
          [3, { type: "bonus", value: 2 }, 4],
        ],
      },
    ],
  };

  it("reads numeric columns at the class level, stripping tags", () => {
    expect(classResources(barbarianish, 1)).toEqual([{ name: "Rages", max: 2 }]);
    expect(classResources(barbarianish, 3)).toEqual([{ name: "Rages", max: 3 }]);
  });

  it("skips non-numeric cells and known/spell columns", () => {
    // "Rage Damage" is a bonus object; "Weapons Known" matches the exclusion.
    expect(classResources(barbarianish, 1).map((r) => r.name)).toEqual(["Rages"]);
  });

  it("clamps past the end of the table and handles missing tables", () => {
    expect(classResources(barbarianish, 20)).toEqual([{ name: "Rages", max: 3 }]);
    expect(classResources({}, 5)).toEqual([]);
  });
});

describe("shortRestRestores", () => {
  it("matches the common short-rest resources by name", () => {
    expect(shortRestRestores("Ki Points")).toBe(true);
    expect(shortRestRestores("Channel Divinity")).toBe(true);
    expect(shortRestRestores("Superiority Dice")).toBe(true);
    expect(shortRestRestores("Rages")).toBe(false);
    expect(shortRestRestores("Sorcery Points")).toBe(false);
  });
});
