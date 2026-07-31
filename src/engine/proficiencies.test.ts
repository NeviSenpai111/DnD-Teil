import { describe, expect, it } from "vitest";
import { cleanProfToken, readNamedGrants, readTokenList } from "./proficiencies";

describe("cleanProfToken", () => {
  it("strips {@tag} wrappers down to display text", () => {
    expect(cleanProfToken("{@item dagger|phb|daggers}")).toBe("daggers");
    expect(cleanProfToken("{@item shield|phb}")).toBe("shield");
    expect(cleanProfToken("light")).toBe("light");
  });
});

describe("readNamedGrants", () => {
  it("collects fixed names and summarises any/choose grants", () => {
    const result = readNamedGrants([
      { "calligrapher's supplies": true },
      { anyArtisansTool: 1 },
      { any: 2 },
      { choose: { from: ["draconic", "elvish"], count: 1 } },
    ]);
    expect(result.fixed).toContain("Calligrapher's Supplies");
    expect(result.notes).toContain("any 2");
    expect(result.notes.some((n) => n.includes("artisans tool"))).toBe(true);
    expect(result.notes.some((n) => n.startsWith("choose 1"))).toBe(true);
  });
});

describe("readTokenList", () => {
  it("reads string + object token lists and cleans tags", () => {
    expect(readTokenList(["light", "medium", "heavy", "shield"])).toEqual([
      "Light",
      "Medium",
      "Heavy",
      "Shield",
    ]);
    expect(readTokenList(["{@item dagger|phb|daggers}"])).toEqual(["Daggers"]);
    expect(readTokenList([{ proficiency: "medium", optional: true }])).toEqual(["Medium"]);
  });
});
