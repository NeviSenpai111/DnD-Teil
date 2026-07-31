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
