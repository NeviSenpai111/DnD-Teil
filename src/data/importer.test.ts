import { describe, expect, it } from "vitest";
import { importFiles, parseFile } from "./importer";

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
    const { entities, meta } = parseFile("s.json", sample);
    expect(meta.edition).toBe("classic");
    expect(entities).toHaveLength(2); // vehicle + Fireball; "Bad" dropped
    expect(entities.find((e) => e.name === "Space Galleon")?.__type).toBe("vehicle");
    expect(entities.find((e) => e.name === "Fireball")?.__type).toBe("spell");
  });

  it("ignores non-content keys and throws on invalid JSON", () => {
    expect(() => parseFile("bad.json", "{not json")).toThrow();
  });
});

describe("importFiles", () => {
  it("merges files and dedupes by name+source+type", () => {
    const result = importFiles([
      { name: "a.json", text: sample },
      { name: "b.json", text: sample },
    ]);
    expect(result.entities).toHaveLength(2);
    expect(result.duplicateCount).toBe(2);
    expect(result.edition).toBe("classic");
    expect(result.metaSources.SpaceGalleonBrew?.full).toBe("Space Galleon Homebrew");
  });

  it("records issues for unparseable files without throwing", () => {
    const result = importFiles([{ name: "bad.json", text: "{nope" }]);
    expect(result.entities).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
  });

  it("extracts the spell -> class map from a sources.json-shaped file", () => {
    const sources = JSON.stringify({
      PHB: { Fireball: { class: [{ name: "Wizard", source: "PHB" }, { name: "Sorcerer", source: "PHB" }] } },
      TCE: { "Tasha's Mind Whip": { classVariant: [{ name: "Bard", source: "PHB", definedInSource: "TCE" }] } },
    });
    const result = importFiles([{ name: "sources.json", text: sources }]);
    expect(result.entities).toHaveLength(0); // not a content-array file
    expect(result.spellClasses["phb|fireball"]).toEqual([
      { name: "Wizard", source: "PHB" },
      { name: "Sorcerer", source: "PHB" },
    ]);
    expect(result.spellClasses["tce|tasha's mind whip"]).toEqual([{ name: "Bard", source: "PHB" }]);
  });
});
