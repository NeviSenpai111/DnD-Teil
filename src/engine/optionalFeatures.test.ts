import { describe, expect, it } from "vitest";
import {
  featureTypeLabel,
  levelPrerequisite,
  optionalFeatureCount,
  optionalFeatureDefs,
  optionalFeatureOptions,
} from "./optionalFeatures";
import type { ImportedEntity } from "../data/types/content";

describe("optionalFeatureCount", () => {
  it("reads record progressions at the highest threshold at or below the level", () => {
    const progression = { "1": 1, "5": 2, "10": 3 };
    expect(optionalFeatureCount(progression, 1)).toBe(1);
    expect(optionalFeatureCount(progression, 4)).toBe(1);
    expect(optionalFeatureCount(progression, 5)).toBe(2);
    expect(optionalFeatureCount(progression, 20)).toBe(3);
  });

  it("reads array progressions as cumulative counts (index = level - 1)", () => {
    const progression = [0, 2, 2, 2, 3];
    expect(optionalFeatureCount(progression, 1)).toBe(0);
    expect(optionalFeatureCount(progression, 2)).toBe(2);
    expect(optionalFeatureCount(progression, 5)).toBe(3);
    // Past the end of the table, the last entry holds.
    expect(optionalFeatureCount(progression, 20)).toBe(3);
  });
});

describe("optionalFeatureDefs", () => {
  const cls = {
    name: "Warden",
    source: "X",
    optionalfeatureProgression: [
      { name: "Warden Stance", featureType: ["FS:W"], progression: { "1": 1, "5": 2 } },
    ],
  };
  const subclass = {
    name: "Path of Embers",
    source: "X",
    className: "Warden",
    optionalfeatureProgression: [
      { name: "Ember Arts", featureType: ["EA"], progression: { "3": 2 } },
    ],
  };

  it("emits class and subclass defs with scoped keys and unlock levels", () => {
    const defs = optionalFeatureDefs({ cls, subclass, classIndex: 1, level: 5 });
    expect(defs).toEqual([
      { key: "optfeature:1:c:0", label: "Warden Stance", featureTypes: ["FS:W"], count: 2, level: 1 },
      { key: "optfeature:1:s:0", label: "Ember Arts", featureTypes: ["EA"], count: 2, level: 3 },
    ]);
  });

  it("omits progressions with no picks at the current level", () => {
    const defs = optionalFeatureDefs({ cls, subclass, classIndex: 0, level: 2 });
    expect(defs.map((d) => d.label)).toEqual(["Warden Stance"]);
  });
});

describe("optionalFeatureOptions + levelPrerequisite", () => {
  const entities = [
    { __type: "optionalfeature", name: "Stalwart Stance", source: "X", featureType: ["FS:W"] },
    { __type: "optionalfeature", name: "Dark Pact", source: "X", featureType: ["EI"] },
    {
      __type: "optionalfeature",
      name: "Emberwatch Stance",
      source: "X",
      featureType: ["FS:W"],
      prerequisite: [{ level: 5 }],
    },
  ] as unknown as ImportedEntity[];
  const def = { key: "k", label: "Warden Stance", featureTypes: ["FS:W"], count: 1, level: 1 };

  it("filters the pool by featureType", () => {
    expect(optionalFeatureOptions(entities, def).map((o) => o.name)).toEqual([
      "Emberwatch Stance",
      "Stalwart Stance",
    ]);
  });

  it("names the 5eTools featureType codes, including suffixed forms", () => {
    expect(featureTypeLabel("AI")).toBe("Artificer Infusion");
    expect(featureTypeLabel("EI")).toBe("Eldritch Invocation");
    expect(featureTypeLabel("FS:F")).toBe("Fighting Style");
    expect(featureTypeLabel("MV:B")).toBe("Maneuver");
    expect(featureTypeLabel("XX")).toBe("XX"); // unknown codes pass through
  });

  it("parses both prerequisite level shapes", () => {
    expect(levelPrerequisite({ name: "A", source: "X", prerequisite: [{ level: 5 }] })).toBe(5);
    expect(
      levelPrerequisite({
        name: "B",
        source: "X",
        prerequisite: [{ level: { level: 7, class: { name: "Warlock" } } }],
      }),
    ).toBe(7);
    expect(levelPrerequisite({ name: "C", source: "X" })).toBeUndefined();
  });
});
