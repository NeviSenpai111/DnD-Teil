import { describe, expect, it } from "vitest";
import { parseStartingEquipment } from "./startingEquipment";

describe("parseStartingEquipment", () => {
  it("parses the 2024 choice-group array form, taking the first option and skipping value/gold", () => {
    const se = [
      {
        A: [
          { item: "book|xphb", displayName: "Book (Prayers)" },
          { item: "parchment|xphb", quantity: 10 },
          { value: 800 },
        ],
        B: [{ value: 5000 }],
      },
    ];
    const items = parseStartingEquipment(se);
    expect(items).toEqual([
      { ref: { name: "book", source: "xphb" }, name: "Book (Prayers)", quantity: 1 },
      { ref: { name: "parchment", source: "xphb" }, name: "parchment", quantity: 10 },
    ]);
  });

  it("parses the 2014 defaultData form (lowercase a/b choices + direct items)", () => {
    const se = {
      default: ["(a) {@item chain mail|phb} or (b) {@item leather armor|phb}"],
      defaultData: [
        { a: ["chain mail|phb"], b: ["leather armor|phb"] },
        { item: "shield|phb", quantity: 1 },
      ],
      goldAlternative: "{@dice 5d4 × 10}",
    };
    const items = parseStartingEquipment(se).map((i) => i.ref);
    expect(items).toEqual([
      { name: "chain mail", source: "phb" },
      { name: "shield", source: "phb" },
    ]);
  });

  it("returns nothing for missing / prose-only equipment", () => {
    expect(parseStartingEquipment(undefined)).toEqual([]);
    expect(parseStartingEquipment({ default: ["just prose"] })).toEqual([]);
    expect(parseStartingEquipment([{ A: [{ equipmentType: "weaponMartial" }] }])).toEqual([]);
  });
});
