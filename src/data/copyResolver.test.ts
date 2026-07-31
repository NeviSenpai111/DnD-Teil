import { describe, expect, it } from "vitest";
import type { ImportedEntity } from "./types/content";
import { resolveCopies } from "./copyResolver";

const base = (over: Record<string, unknown>): ImportedEntity =>
  ({ __type: "subrace", name: "X", source: "S", ...over }) as ImportedEntity;

describe("resolveCopies", () => {
  const variant = base({
    name: "Variant",
    source: "PHB",
    raceName: "Human",
    raceSource: "PHB",
    ability: [{ choose: { from: ["str", "dex"], count: 2 } }],
    skillProficiencies: [{ choose: { from: ["acrobatics", "stealth"], count: 1 } }],
    entries: ["Base variant text.", { type: "entries", name: "Languages", entries: ["Common."] }],
  });

  const amonkhet = base({
    name: "Amonkhet",
    source: "PSA",
    raceName: "Human",
    raceSource: "PHB",
    _copy: {
      name: "Variant",
      source: "PHB",
      raceName: "Human",
      raceSource: "PHB",
      _mod: {
        entries: [
          { mode: "appendArr", items: { type: "entries", name: "Age", entries: ["Age text."] } },
          { mode: "replaceTxt", replace: "Common.", with: "Common and one extra language." },
        ],
      },
    },
  });

  const resolved = resolveCopies([variant, amonkhet]);
  const am = resolved.find((e) => e.name === "Amonkhet")! as Record<string, unknown>;

  it("inherits base fields not overridden by the child", () => {
    expect(am.ability).toEqual([{ choose: { from: ["str", "dex"], count: 2 } }]);
    expect(am.skillProficiencies).toBeDefined();
  });

  it("keeps the child's own identity and drops the _copy marker", () => {
    expect(am.name).toBe("Amonkhet");
    expect(am.source).toBe("PSA");
    expect(am._copy).toBeUndefined();
  });

  it("applies appendArr and replaceTxt _mod ops", () => {
    const entries = am.entries as { name?: string; entries?: string[] }[];
    expect(entries).toContainEqual({ type: "entries", name: "Age", entries: ["Age text."] });
    const langs = entries.find((e) => e.name === "Languages");
    expect(langs?.entries?.[0]).toBe("Common and one extra language.");
  });

  it("replaceArr swaps an array item matched by name", () => {
    const out = resolveCopies([
      base({ name: "B", source: "S", entries: [{ name: "Keep", entries: ["k"] }, { name: "Old", entries: ["o"] }] }),
      base({
        name: "C",
        source: "S",
        _copy: { name: "B", source: "S", _mod: { entries: [{ mode: "replaceArr", replace: "Old", items: { name: "New", entries: ["n"] } }] } },
      }),
    ]);
    const c = out.find((e) => e.name === "C")! as unknown as { entries: { name: string }[] };
    expect(c.entries.map((e) => e.name)).toEqual(["Keep", "New"]);
  });

  it("keeps a child's own fields when the base is missing", () => {
    const out = resolveCopies([
      base({ name: "Orphan", source: "S", entries: ["mine"], _copy: { name: "Gone", source: "S" } }),
    ]);
    const o = out[0] as Record<string, unknown>;
    expect(o.entries).toEqual(["mine"]);
    expect(o._copy).toBeUndefined();
  });
});
