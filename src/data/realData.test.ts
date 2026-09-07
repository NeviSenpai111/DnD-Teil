/**
 * Acceptance run over a real 5eTools `data/` directory.
 *
 * Skipped unless the directory exists. Point it elsewhere with
 * `FIVETOOLS_DATA=/path/to/5etools/data npm run validate-data`.
 *
 * Prints an import report (file kinds, entities per type, issue summary) and
 * asserts the concrete cases that the naive `name|source` identity used to
 * drop or shadow.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { importFiles, type ImportIssue } from "./importer";
import { mergeEntities } from "../store/contentStore";
import { ContentIndex } from "./contentIndex";
import { reprintedEntities } from "./reprints";
import { entityIdentity } from "./types/content";
import { resolveClassFeatures, resolveSubclassFeatures, listSubclasses } from "./featureResolver";
import type { ClassData, Subclass } from "./types/class-content";
import type { ImportedEntity } from "./types/content";

const DATA_DIR = process.env.FIVETOOLS_DATA ?? join(homedir(), "Dokumente", "5ETools", "data");
const available = existsSync(DATA_DIR) && statSync(DATA_DIR).isDirectory();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.toLowerCase().endsWith(".json")) out.push(p);
  }
  return out;
}

function summarizeIssues(issues: ImportIssue[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of issues) {
    // Collapse names/sources so the same kind of problem groups together.
    const key = `${i.level}: ${i.message.replace(/"[^"]*"/g, '"…"').replace(/\([^)]*\)/g, "(…)")}`;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

describe.skipIf(!available)(`real 5eTools data (${DATA_DIR})`, () => {
  const files = available ? walk(DATA_DIR) : [];
  const t0 = performance.now();
  const result = importFiles(
    files.map((p) => ({ name: relative(DATA_DIR, p), text: readFileSync(p, "utf8") })),
  );
  const t1 = performance.now();
  const issues: ImportIssue[] = [];
  const entities = mergeEntities([], result.entities, issues);
  const t2 = performance.now();
  const index = new ContentIndex(entities, result.metaSources, result.spellClasses);

  const byType: Record<string, number> = {};
  for (const e of entities) byType[e.__type] = (byType[e.__type] ?? 0) + 1;

  const kinds: Record<string, number> = {};
  for (const f of result.files) kinds[f.kind] = (kinds[f.kind] ?? 0) + 1;

  const allIssues = [...result.issues, ...issues];
  const warnings = allIssues.filter((i) => i.level !== "info");

  // One consolidated report; vitest prints console output for the file.
  console.log(
    [
      `\n=== 5eTools data import report ===`,
      `files: ${files.length}  parse ${Math.round(t1 - t0)} ms, resolve ${Math.round(t2 - t1)} ms`,
      `file kinds: ${JSON.stringify(kinds)}`,
      `entities after resolve: ${entities.length} (raw ${result.entities.length}, duplicates ${result.duplicateCount})`,
      `by type: ${JSON.stringify(byType)}`,
      `reprinted (hidden by default): ${reprintedEntities(entities, index, {}).size}`,
      `issues: ${allIssues.length} (${warnings.length} warnings)`,
      ...Object.entries(summarizeIssues(warnings))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40)
        .map(([k, n]) => `  ${n.toString().padStart(5)}  ${k}`),
      `sample warnings:`,
      ...warnings.slice(0, 15).map((i) => `  - ${i.fileName}: ${i.message}`),
    ].join("\n"),
  );

  const classFeature = (name: string, className: string, classSource: string, level: number, source = classSource) =>
    index.find("classFeature", { name, className, classSource, level, source });

  it("keeps every same-named class feature (per class and level)", () => {
    expect(classFeature("Ability Score Improvement", "Fighter", "PHB", 4)).toBeDefined();
    expect(classFeature("Ability Score Improvement", "Fighter", "PHB", 19)).toBeDefined();
    expect(classFeature("Spellcasting", "Wizard", "PHB", 1)).toBeDefined();
    expect(classFeature("Spellcasting", "Cleric", "PHB", 1)).toBeDefined();
    expect(classFeature("Extra Attack", "Paladin", "PHB", 5)).toBeDefined();
    expect(classFeature("Extra Attack", "Ranger", "PHB", 5)).toBeDefined();
    expect(index.getAll("classFeature", "Ability Score Improvement", "PHB").length).toBeGreaterThan(50);
  });

  it("keeps subclasses that differ only by class source (2014 subclasses under 2024 classes)", () => {
    const phb = index.find("subclass", { name: "Battle Master", source: "PHB", className: "Fighter", classSource: "PHB" });
    const xphb = index.find("subclass", { name: "Battle Master", source: "PHB", className: "Fighter", classSource: "XPHB" });
    expect(phb).toBeDefined();
    expect(xphb).toBeDefined();
    // The copy inherited the feature refs (and page via _preserve).
    expect(Array.isArray(xphb?.subclassFeatures)).toBe(true);
    expect(xphb?._copy).toBeUndefined();
    expect(xphb?.page).toBe(phb?.page);
  });

  it("resolves a legacy subclass's features under the 2024 class via feature refs", () => {
    const fighter = index.get("class", "Fighter", "XPHB") as unknown as ClassData;
    const subclasses = listSubclasses(entities, fighter);
    const bm = subclasses.find((s) => s.name === "Battle Master" && s.source === "PHB") as Subclass;
    expect(bm).toBeDefined();
    const names = resolveSubclassFeatures(entities, fighter, bm, 3).map((f) => f.name);
    expect(names).toContain("Combat Superiority");
    // And the 2024 class's own features are intact across levels.
    const fighterFeatures = resolveClassFeatures(entities, fighter, 20);
    expect(fighterFeatures.filter((f) => f.name === "Ability Score Improvement").length).toBeGreaterThanOrEqual(5);
  });

  it("keeps deities that share a name across pantheons", () => {
    expect(index.find("deity", { name: "Tyr", source: "PHB", pantheon: "Norse" })).toBeDefined();
    expect(index.find("deity", { name: "Tyr", source: "PHB", pantheon: "Forgotten Realms" })).toBeDefined();
  });

  it("keeps nameless base subraces (PHB Human's +1 to all abilities)", () => {
    const human = index.find("subrace", { name: "Human", source: "PHB", raceName: "Human", raceSource: "PHB" });
    expect(human?._isBaseVariant).toBe(true);
    expect(human?.ability).toEqual([{ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }]);
  });

  it("expands _versions into sibling entities", () => {
    // Subrace versions are expanded against the merged race and emitted as races.
    const black = index.get("race", "Dragonborn (Black)", "PHB");
    expect(black).toBeDefined();
    expect(black?._versionBase_name).toBe("Dragonborn");
    expect(black?.raceName).toBeUndefined();
    const names = (black?.entries as { name?: string }[]).map((e) => e.name);
    expect(names).not.toContain("Draconic Ancestry");
    expect(names).toContain("Breath Weapon");
    expect(JSON.stringify(black?.entries)).toContain("acid");
    // Race versions and the 2024 Aasimar-style "Name; Variant" pattern.
    expect(index.get("race", "Aasimar; Necrotic Shroud", "MPMM")).toBeDefined();
    expect(index.get("feat", "Magic Initiate; Cleric", "XPHB")).toBeDefined();
    expect(index.get("monster", "Archmage (Familiar)", "MM")).toBeDefined();
  });

  it("gives magic variants their source from `inherits` and keys item types by abbreviation", () => {
    expect(index.get("magicvariant", "+1 Ammunition", "DMG")).toBeDefined();
    expect(index.find("itemType", { abbreviation: "$", source: "DMG" })?.name).toBe("Treasure");
    expect(index.find("itemProperty", { abbreviation: "2H", source: "PHB" })).toBeDefined();
  });

  it("applies monster templates and bestiary mods", () => {
    const n = index.get("monster", "Nurvureem, The Dark Lady", "PotA") as ImportedEntity | undefined;
    expect(n).toBeDefined();
    expect(n?._copyTemplates).toEqual([{ name: "Legendary Shadow Dragon", source: "MM" }]);
    expect(JSON.stringify(n?.trait ?? n?.action)).toContain("Nurvureem");
    const sylvira = index.get("monster", "Sylvira Savikas", "BGDIA") as ImportedEntity | undefined;
    expect((sylvira?.skill as Record<string, string> | undefined)?.investigation).toMatch(/^\+\d+$/);
  });

  it("skips Foundry, book, and index files without shadowing content", () => {
    expect(kinds.foundry).toBeGreaterThan(0);
    expect(kinds.book).toBeGreaterThan(100);
    expect(kinds.index).toBeGreaterThan(0);
    // A real item (with entries) survived even though foundry-items.json lists the same name.
    const drum = index.get("item", "+1 Rhythm-Maker's Drum", "TCE");
    expect(Array.isArray(drum?.entries)).toBe(true);
    expect(drum?.migrationVersion).toBeUndefined();
  });

  it("finds a base for every _copy and supports every _mod mode in the data", () => {
    const unresolved = warnings.filter((i) => i.message.includes("not imported"));
    const unhandled = warnings.filter((i) => i.message.includes("unhandled _mod"));
    expect(unhandled).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it("has no two entities with the same identity", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const e of entities) {
      const id = entityIdentity(e);
      if (seen.has(id)) dupes.push(id);
      seen.add(id);
    }
    expect(dupes).toEqual([]);
  });

  it("marks entries with an imported newer printing as reprinted, as the site does", () => {
    const reprinted = reprintedEntities(entities, index, {});
    const artificers = entities.filter((e) => e.__type === "class" && e.name === "Artificer");
    expect(artificers.map((e) => e.source).sort()).toEqual(["EFA", "TCE"]);
    expect(reprinted.has(index.get("class", "Artificer", "TCE")!)).toBe(true);
    expect(reprinted.has(index.get("class", "Artificer", "EFA")!)).toBe(false);

    // The 2014 Battle Master is hidden under both Fighters once the 2024 one exists…
    for (const classSource of ["PHB", "XPHB"]) {
      const bm = index.find("subclass", { name: "Battle Master", source: "PHB", className: "Fighter", classSource })!;
      expect(reprinted.has(bm)).toBe(true);
    }
    // A renamed reprint counts (Totem Warrior -> Wild Heart), and the `_copy`
    // offered under the 2024 class carries it too via `_preserve.reprintedAs`.
    const totem = entities.filter((e) => e.__type === "subclass" && e.name === "Path of the Totem Warrior");
    expect(totem.map((e) => [e.classSource, reprinted.has(e)]).sort()).toEqual([
      ["PHB", true],
      ["XPHB", true],
    ]);
    // A 2014 subclass with no 2024 printing stays listed under both classes.
    const battlerager = entities.filter((e) => e.__type === "subclass" && e.name === "Path of the Battlerager");
    expect(battlerager.map((e) => e.classSource).sort()).toEqual(["PHB", "XPHB"]);
    expect(battlerager.some((e) => reprinted.has(e))).toBe(false);

    // With reprints hidden, every class name is listed once.
    const visibleClasses = entities.filter((e) => e.__type === "class" && !reprinted.has(e));
    expect(new Set(visibleClasses.map((e) => e.name)).size).toBe(visibleClasses.length);
    expect(visibleClasses.map((e) => e.name)).toContain("Artificer");

    // Cross-type and item-shaped targets resolve too.
    expect(reprinted.has(index.get("baseitem", "Net", "PHB")!)).toBe(true);
    expect(reprinted.has(index.get("spell", "Fireball", "PHB")!)).toBe(true);
  });

  it("un-hides the older printing when the newer source is disabled", () => {
    const reprinted = reprintedEntities(entities, index, { EFA: false });
    expect(reprinted.has(index.get("class", "Artificer", "TCE")!)).toBe(false);
    expect(reprinted.has(index.get("class", "Fighter", "PHB")!)).toBe(true);
  });

  it("indexes the spell class reverse index", () => {
    expect(index.spellClasses("Fireball", "PHB")?.some((c) => c.name === "Wizard")).toBe(true);
  });
});
