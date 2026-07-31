import { describe, expect, it } from "vitest";
import { carryingCapacity, currencyInGp, emptyCurrency, encumbrance } from "./currency";
import { languageChoiceDefs, STANDARD_LANGUAGES } from "./languages";

describe("currency", () => {
  it("converts a mixed purse to gold pieces", () => {
    expect(currencyInGp({ cp: 100, sp: 10, ep: 2, gp: 3, pp: 1 })).toBe(16); // 1+1+1+3+10
    expect(currencyInGp(emptyCurrency())).toBe(0);
  });
});

describe("encumbrance", () => {
  it("computes carrying capacity as Str × 15", () => {
    expect(carryingCapacity(10)).toBe(150);
  });

  it("classifies against the variant thresholds and the hard cap", () => {
    expect(encumbrance(50, 10)).toBe("ok");
    expect(encumbrance(51, 10)).toBe("encumbered"); // > Str×5
    expect(encumbrance(101, 10)).toBe("heavily-encumbered"); // > Str×10
    expect(encumbrance(151, 10)).toBe("over-capacity"); // > Str×15
  });
});

describe("languageChoiceDefs", () => {
  it("turns a choose-from grant into a def with title-cased options", () => {
    const defs = languageChoiceDefs(
      [{ choose: { from: ["elvish", "deep speech"], count: 2 } }],
      "race:lang",
      "Sturdyfolk",
    );
    expect(defs).toEqual([
      { key: "race:lang:0", origin: "Sturdyfolk", from: ["Elvish", "Deep Speech"], count: 2 },
    ]);
  });

  it("offers the standard table for anyStandard and both tables for any", () => {
    const defs = languageChoiceDefs(
      [{ common: true, anyStandard: 1 }, { any: 2 }],
      "background:lang",
      "Scribe",
    );
    expect(defs).toHaveLength(2);
    expect(defs[0]).toMatchObject({ from: STANDARD_LANGUAGES, count: 1 });
    expect(defs[1].count).toBe(2);
    expect(defs[1].from).toContain("Common");
    expect(defs[1].from).toContain("Abyssal");
    // The fixed "common: true" grant is not a choice.
    expect(defs.some((d) => d.from.length === 0)).toBe(false);
  });
});
