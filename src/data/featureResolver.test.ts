import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importFiles } from "./importer";
import type { ClassData, Subclass } from "./types/class-content";
import {
  listSubclasses,
  parseFeatureRef,
  resolveClassFeatures,
  resolveSubclassFeatures,
} from "./featureResolver";

const entities = importFiles([
  { name: "srd-lite.json", text: readFileSync("public/sample-data/srd-lite.json", "utf8") },
]).entities;

const warden = entities.find((e) => e.__type === "class" && e.name === "Warden") as unknown as ClassData;

describe("parseFeatureRef", () => {
  it("parses a class feature ref", () => {
    expect(parseFeatureRef("Second Wind|Warden|SRDLite|2")).toEqual({
      name: "Second Wind",
      className: "Warden",
      classSource: "SRDLite",
      level: 2,
    });
  });
  it("parses a subclass feature ref", () => {
    expect(parseFeatureRef("Sentinel's Watch|Warden|SRDLite|Sentinel|SRDLite|3")).toMatchObject({
      name: "Sentinel's Watch",
      subclassShortName: "Sentinel",
      level: 3,
    });
  });
});

describe("feature assembly", () => {
  it("returns only features at or below the character level", () => {
    const l1 = resolveClassFeatures(entities, warden, 1).map((f) => f.name);
    expect(l1).toEqual([
      "Defensive Stance",
      "Expertise",
      "Martial Vigor",
      "Unarmored Defense",
      "Warden Stance",
    ]);

    const l3 = resolveClassFeatures(entities, warden, 3).map((f) => f.name);
    expect(l3).toContain("Second Wind");
    expect(l3).toContain("Warden Path");
  });

  it("resolves subclass features by short name and level", () => {
    const sentinel = listSubclasses(entities, warden)[0] as Subclass;
    expect(sentinel.shortName).toBe("Sentinel");
    expect(resolveSubclassFeatures(entities, warden, sentinel, 2)).toHaveLength(0);
    expect(resolveSubclassFeatures(entities, warden, sentinel, 3).map((f) => f.name)).toEqual([
      "Sentinel's Watch",
    ]);
  });
});

describe("feature refs across class sources", () => {
  const fe = (over: Record<string, unknown>) =>
    ({ __type: "subclassFeature", source: "PHB", className: "Fighter", classSource: "PHB", subclassSource: "PHB", ...over }) as unknown as import("./types/content").ImportedEntity;
  const pool = [
    { __type: "class", name: "Fighter", source: "XPHB" },
    { __type: "class", name: "Fighter", source: "PHB" },
    // The 2014 subclass as offered under the 2024 class: same feature refs, different classSource.
    { __type: "subclass", name: "Battle Master", shortName: "Battle Master", source: "PHB", className: "Fighter", classSource: "XPHB", subclassFeatures: ["Battle Master|Fighter||Battle Master||3", "Relentless|Fighter||Battle Master||15"] },
    fe({ name: "Battle Master", subclassShortName: "Battle Master", level: 3, entries: ["intro", { type: "refSubclassFeature", subclassFeature: "Combat Superiority|Fighter||Battle Master||3" }] }),
    fe({ name: "Combat Superiority", subclassShortName: "Battle Master", level: 3, entries: ["dice"] }),
    fe({ name: "Relentless", subclassShortName: "Battle Master", level: 15 }),
    // Another subclass's feature must not leak in.
    fe({ name: "Improved Critical", subclassShortName: "Champion", level: 3 }),
  ] as unknown as import("./types/content").ImportedEntity[];
  const fighter2024 = pool[0] as unknown as ClassData;
  const battleMaster = pool[2] as unknown as Subclass;

  it("resolves refs with PHB defaults and follows nested refSubclassFeature entries", () => {
    expect(resolveSubclassFeatures(pool, fighter2024, battleMaster, 3).map((f) => f.name)).toEqual([
      "Battle Master",
      "Combat Superiority",
    ]);
    expect(resolveSubclassFeatures(pool, fighter2024, battleMaster, 20).map((f) => f.name)).toEqual([
      "Battle Master",
      "Combat Superiority",
      "Relentless",
    ]);
  });

  it("still lists features by plain class/subclass match when refs are absent", () => {
    const sub = { ...battleMaster, subclassFeatures: undefined, classSource: "PHB" } as unknown as Subclass;
    const fighter2014 = pool[1] as unknown as ClassData;
    expect(resolveSubclassFeatures(pool, fighter2014, sub, 3).map((f) => f.name)).toEqual([
      "Battle Master",
      "Combat Superiority",
    ]);
  });
});
