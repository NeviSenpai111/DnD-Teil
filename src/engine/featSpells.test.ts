import { describe, expect, it } from "vitest";
import { featSpellGrants } from "./featSpells";

/** Shapes mirror real 5eTools data (Magic Initiate XPHB, Fey Touched TCE). */
const magicInitiate = {
  name: "Magic Initiate",
  additionalSpells: [
    {
      name: "Cleric Spells",
      ability: { choose: ["int", "wis", "cha"] },
      innate: { _: { daily: { "1": [{ choose: "level=1|class=Cleric" }] } } },
      known: { _: [{ choose: "level=0|class=Cleric", count: 2 }] },
    },
    {
      name: "Wizard Spells",
      ability: { choose: ["int", "wis", "cha"] },
      innate: { _: { daily: { "1": [{ choose: "level=1|class=Wizard" }] } } },
      known: { _: [{ choose: "level=0|class=Wizard", count: 2 }] },
    },
  ],
};

const feyTouched = {
  name: "Fey Touched",
  additionalSpells: [
    {
      ability: "inherit",
      innate: { _: { daily: { "1e": ["misty step", { choose: "level=1|school=E;D" }] } } },
    },
  ],
};

describe("featSpellGrants", () => {
  it("lists alternative sets and stays empty until one is chosen", () => {
    const unchosen = featSpellGrants(magicInitiate, "asifeat:0");
    expect(unchosen.sets).toEqual(["Cleric Spells", "Wizard Spells"]);
    expect(unchosen.fixed).toEqual([]);
    expect(unchosen.picks).toEqual([]);
  });

  it("parses the chosen set's choose expressions into pick defs", () => {
    const grants = featSpellGrants(magicInitiate, "asifeat:0", "Cleric Spells");
    expect(grants.picks).toHaveLength(2);

    const cantrips = grants.picks.find((p) => p.level === 0)!;
    expect(cantrips.count).toBe(2);
    expect(cantrips.className).toBe("Cleric");
    expect(cantrips.origin).toBe("Magic Initiate (Cleric Spells)");

    const leveled = grants.picks.find((p) => p.level === 1)!;
    expect(leveled.count).toBe(1);
    expect(leveled.className).toBe("Cleric");

    // Keys are stable and namespaced under the feat's prefix.
    expect(grants.picks.every((p) => p.key.startsWith("asifeat:0:spell:"))).toBe(true);
  });

  it("single-set feats need no set choice; fixed spells and school filters parse", () => {
    const grants = featSpellGrants(feyTouched, "bgfeat:0");
    expect(grants.sets).toEqual([]);
    expect(grants.fixed).toEqual([{ name: "misty step", source: undefined }]);
    expect(grants.picks).toHaveLength(1);
    expect(grants.picks[0].level).toBe(1);
    expect(grants.picks[0].schools).toEqual(["E", "D"]);
    expect(grants.picks[0].className).toBeUndefined();
  });

  it("returns nothing for feats without additionalSpells", () => {
    const grants = featSpellGrants({ name: "Tough" }, "asifeat:1");
    expect(grants).toEqual({ sets: [], fixed: [], picks: [] });
  });
});
