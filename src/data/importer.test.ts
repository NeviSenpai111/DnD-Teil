import { describe, expect, it } from "vitest";
import { importFiles, normalizeEntity, parseFile } from "./importer";

const sample = JSON.stringify({
  _meta: {
    sources: [{ json: "SpaceGalleonBrew", abbreviation: "SGB", full: "Space Galleon Homebrew" }],
    edition: "classic",
  },
  vehicle: [{ name: "Space Galleon", source: "Homebrew", vehicleType: "SPELLJAMMER" }],
  spell: [
    { name: "Fireball", source: "PHB" },
    { name: "Bad" }, // missing source -> skipped
  ],
});

describe("parseFile", () => {
  it("tags entities with their content type and keeps name+source", () => {
    const { entities, meta, kind, skipped } = parseFile("s.json", sample);
    expect(kind).toBe("content");
    expect(meta.edition).toBe("classic");
    expect(entities).toHaveLength(2); // vehicle + Fireball; "Bad" dropped
    expect(entities.find((e) => e.name === "Space Galleon")?.__type).toBe("vehicle");
    expect(entities.find((e) => e.name === "Fireball")?.__type).toBe("spell");
    expect(skipped).toEqual([{ type: "spell", reason: "missing source", count: 1 }]);
  });

  it("ignores non-content keys and throws on invalid JSON", () => {
    expect(() => parseFile("bad.json", "{not json")).toThrow();
  });

  it("classifies the other file kinds found in a 5eTools data tree", () => {
    expect(parseFile("class/index.json", JSON.stringify({ fighter: "class-fighter.json" })).kind).toBe("index");
    expect(parseFile("book/book-phb.json", JSON.stringify({ data: [{ type: "section" }] })).kind).toBe("book");
    expect(parseFile("changelog.json", JSON.stringify([{ ver: "1" }])).kind).toBe("unrecognized");
    const unknown = parseFile("loot.json", JSON.stringify({ hoard: [{ name: "x", source: "DMG" }] }));
    expect(unknown.kind).toBe("unrecognized");
    expect(unknown.unknownKeys).toEqual(["hoard"]);
  });

  it("skips Foundry VTT companion files by name or by shape", () => {
    const foundryShape = JSON.stringify({
      item: [{ name: "+1 Drum", source: "TCE", activities: [], migrationVersion: 3 }],
    });
    expect(parseFile("foundry-items.json", foundryShape).kind).toBe("foundry");
    expect(parseFile("whatever.json", foundryShape).kind).toBe("foundry");
    expect(parseFile("class/foundry.json", JSON.stringify({ class: [{ name: "Bard", source: "PHB", effects: [] }] })).kind).toBe("foundry");
  });
});

describe("normalizeEntity", () => {
  it("takes a magic variant's source from `inherits`", () => {
    const r = normalizeEntity("magicvariant", { name: "+1 Ammunition", inherits: { source: "DMG" } });
    expect("entity" in r && r.entity.source).toBe("DMG");
  });

  it("keys item types/properties by abbreviation and names nameless ones after it", () => {
    const r = normalizeEntity("itemProperty", { abbreviation: "2H", source: "PHB" });
    expect("entity" in r && r.entity.name).toBe("2H");
    const named = normalizeEntity("itemType", { name: "Treasure", abbreviation: "$", source: "DMG" });
    expect("entity" in named && named.entity.name).toBe("Treasure");
    expect(normalizeEntity("itemType", { source: "DMG" })).toEqual({ reason: "missing abbreviation" });
  });

  it("names a nameless subrace after its race and flags it", () => {
    const r = normalizeEntity("subrace", { source: "PHB", raceName: "Human", raceSource: "PHB", ability: [{ str: 1 }] });
    expect("entity" in r && r.entity).toMatchObject({ name: "Human", _isBaseVariant: true, raceName: "Human" });
  });
});

describe("importFiles", () => {
  it("merges files and dedupes by identity", () => {
    const result = importFiles([
      { name: "a.json", text: sample },
      { name: "b.json", text: sample },
    ]);
    expect(result.entities).toHaveLength(2);
    expect(result.duplicateCount).toBe(2);
    expect(result.edition).toBe("classic");
    expect(result.metaSources.SpaceGalleonBrew?.full).toBe("Space Galleon Homebrew");
    expect(result.typeCounts).toEqual({ vehicle: 1, spell: 1 });
    expect(result.files.map((f) => f.kind)).toEqual(["content", "content"]);
  });

  it("keeps same-named class features that differ by class or level", () => {
    const text = JSON.stringify({
      classFeature: [
        { name: "Ability Score Improvement", source: "PHB", className: "Fighter", classSource: "PHB", level: 4 },
        { name: "Ability Score Improvement", source: "PHB", className: "Fighter", classSource: "PHB", level: 8 },
        { name: "Ability Score Improvement", source: "PHB", className: "Wizard", classSource: "PHB", level: 4 },
        { name: "Ability Score Improvement", source: "PHB", className: "Fighter", classSource: "PHB", level: 4 }, // true dupe
      ],
      subclass: [
        { name: "Champion", shortName: "Champion", source: "PHB", className: "Fighter", classSource: "PHB" },
        { name: "Champion", shortName: "Champion", source: "PHB", className: "Fighter", classSource: "XPHB" },
      ],
      deity: [
        { name: "Tyr", source: "PHB", pantheon: "Norse" },
        { name: "Tyr", source: "PHB", pantheon: "Forgotten Realms" },
      ],
    });
    const result = importFiles([{ name: "c.json", text }]);
    expect(result.typeCounts).toEqual({ classFeature: 3, subclass: 2, deity: 2 });
    expect(result.duplicateCount).toBe(1);
  });

  it("records issues for unparseable files without throwing", () => {
    const result = importFiles([{ name: "bad.json", text: "{nope" }]);
    expect(result.entities).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].level).toBe("error");
  });

  it("reports skipped files and entities as issues", () => {
    const result = importFiles([
      { name: "foundry-feats.json", text: JSON.stringify({ feat: [{ name: "Alert", source: "PHB" }] }) },
      { name: "s.json", text: sample },
    ]);
    expect(result.entities.map((e) => e.name)).not.toContain("Alert");
    expect(result.issues.map((i) => `${i.level}:${i.fileName}`)).toEqual([
      "info:foundry-feats.json",
      "warn:s.json",
    ]);
  });

  it("extracts the spell -> class map from a sources.json-shaped file", () => {
    const sources = JSON.stringify({
      PHB: { Fireball: { class: [{ name: "Wizard", source: "PHB" }, { name: "Sorcerer", source: "PHB" }] } },
      TCE: { "Tasha's Mind Whip": { classVariant: [{ name: "Bard", source: "PHB", definedInSource: "TCE" }] } },
    });
    const result = importFiles([{ name: "sources.json", text: sources }]);
    expect(result.entities).toHaveLength(0); // not a content-array file
    expect(result.files[0].kind).toBe("spell-sources");
    expect(result.spellClasses["phb|fireball"]).toEqual([
      { name: "Wizard", source: "PHB" },
      { name: "Sorcerer", source: "PHB" },
    ]);
    expect(result.spellClasses["tce|tasha's mind whip"]).toEqual([{ name: "Bard", source: "PHB" }]);
  });

  it("does not choke on the generated spell-source lookup (nested objects instead of arrays)", () => {
    const lookup = JSON.stringify({ phb: { fireball: { class: { PHB: { Wizard: true } } } } });
    const result = importFiles([{ name: "generated/gendata-spell-source-lookup.json", text: lookup }]);
    expect(result.issues.some((i) => i.level === "error")).toBe(false);
    expect(result.files[0].kind).toBe("unrecognized");
  });
});
