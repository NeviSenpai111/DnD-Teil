import { describe, expect, it } from "vitest";
import { ContentIndex } from "./contentIndex";
import type { ImportedEntity } from "./types/content";

const e = (over: Record<string, unknown>): ImportedEntity => ({ source: "PHB", ...over }) as ImportedEntity;

const entities: ImportedEntity[] = [
  e({ __type: "spell", name: "Fireball" }),
  e({ __type: "spell", name: "Fireball", source: "XPHB" }),
  e({ __type: "classFeature", name: "Ability Score Improvement", className: "Fighter", classSource: "PHB", level: 4 }),
  e({ __type: "classFeature", name: "Ability Score Improvement", className: "Fighter", classSource: "PHB", level: 8 }),
  e({ __type: "classFeature", name: "Martial Versatility", source: "TCE", className: "Fighter", classSource: "PHB", level: 4 }),
  e({ __type: "subclassFeature", name: "Combat Superiority", className: "Fighter", classSource: "PHB", subclassShortName: "Battle Master", subclassSource: "PHB", level: 3 }),
  e({ __type: "subclass", name: "Battle Master", shortName: "Battle Master", className: "Fighter", classSource: "PHB" }),
  e({ __type: "subclass", name: "Battle Master", shortName: "Battle Master", className: "Fighter", classSource: "XPHB" }),
  e({ __type: "deity", name: "Tyr", pantheon: "Norse" }),
  e({ __type: "deity", name: "Tyr", pantheon: "Forgotten Realms" }),
  e({ __type: "itemProperty", name: "2H", abbreviation: "2H" }),
  e({ __type: "monsterFluff", name: "Goblin", source: "MM" }),
  e({ __type: "monster", name: "Goblin", source: "MM" }),
];

const index = new ContentIndex(entities, { PHB: { json: "PHB", full: "Player's Handbook" } });

describe("ContentIndex", () => {
  it("get() returns the first name+source match; getAll() every one", () => {
    expect(index.get("classFeature", "Ability Score Improvement", "PHB")?.level).toBe(4);
    expect(index.getAll("classFeature", "Ability Score Improvement", "PHB")).toHaveLength(2);
    expect(index.get("spell", "Fireball", "XPHB")?.source).toBe("XPHB");
  });

  it("find() uses the full identity", () => {
    expect(index.find("classFeature", { name: "Ability Score Improvement", source: "PHB", className: "Fighter", classSource: "PHB", level: 8 })?.level).toBe(8);
    expect(index.find("deity", { name: "Tyr", source: "PHB", pantheon: "Norse" })).toBeDefined();
    expect(index.find("deity", { name: "Tyr", source: "PHB", pantheon: "Greek" })).toBeUndefined();
    expect(index.find("itemProperty", { abbreviation: "2H", source: "PHB" })).toBeDefined();
  });

  it("resolveTag() handles compound tag shapes and default sources", () => {
    expect(index.resolveTag("spell", ["Fireball"])?.source).toBe("PHB");
    expect(index.resolveTag("spell", ["fireball", "xphb"])?.source).toBe("XPHB");
    expect(index.resolveTag("classFeature", ["Ability Score Improvement", "Fighter", "", "8"])?.level).toBe(8);
    expect(index.resolveTag("classFeature", ["Martial Versatility", "Fighter", "", "4", "TCE"])?.source).toBe("TCE");
    expect(index.resolveTag("subclassFeature", ["Combat Superiority", "Fighter", "", "Battle Master", "", "3"])).toBeDefined();
    expect(index.resolveTag("subclass", ["Battle Master", "Fighter", "XPHB", "PHB"])?.classSource).toBe("XPHB");
    expect(index.resolveTag("deity", ["Tyr", "Norse"])?.pantheon).toBe("Norse");
    expect(index.resolveTag("deity", ["Tyr"])?.pantheon).toBe("Forgotten Realms");
    expect(index.resolveTag("itemProperty", ["2H"])).toBeDefined();
    expect(index.resolveTag("creature", ["Goblin"])?.__type).toBe("monster");
    expect(index.resolveTag("nope", ["x"])).toBeUndefined();
  });

  it("falls back to any source when the tag's default source isn't imported", () => {
    const only = new ContentIndex([e({ __type: "spell", name: "Fireball", source: "XPHB" })]);
    expect(only.resolveTag("spell", ["Fireball"])?.source).toBe("XPHB");
  });

  it("distinctSources() counts non-auxiliary entities and uses _meta display names", () => {
    const infos = index.distinctSources(entities);
    expect(infos.find((s) => s.source === "PHB")).toEqual({ source: "PHB", displayName: "Player's Handbook", count: 9 });
    expect(infos.find((s) => s.source === "MM")?.count).toBe(1); // fluff not counted
  });
});
