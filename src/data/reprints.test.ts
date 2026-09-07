import { describe, expect, it } from "vitest";
import { ContentIndex } from "./contentIndex";
import { isReprinted, reprintTargets, reprintedEntities } from "./reprints";
import type { ImportedEntity } from "./types/content";

const e = (over: Record<string, unknown>): ImportedEntity => ({ source: "PHB", ...over }) as ImportedEntity;

const fireballPhb = e({ __type: "spell", name: "Fireball", reprintedAs: ["Fireball|XPHB"] });
const fireballXphb = e({ __type: "spell", name: "Fireball", source: "XPHB" });
const fighterPhb = e({ __type: "class", name: "Fighter", reprintedAs: ["Fighter|XPHB"] });
const archeryStyle = e({ __type: "optionalfeature", name: "Archery", reprintedAs: [{ uid: "Archery|XPHB", tag: "feat" }] });
const archeryFeat = e({ __type: "feat", name: "Archery", source: "XPHB" });
const bmUnderPhb = e({ __type: "subclass", name: "Battle Master", shortName: "Battle Master", className: "Fighter", classSource: "PHB", reprintedAs: ["Battle Master|Fighter|XPHB|XPHB"] });
const bmUnderXphb = e({ __type: "subclass", name: "Battle Master", shortName: "Battle Master", className: "Fighter", classSource: "XPHB", reprintedAs: ["Battle Master|Fighter|XPHB|XPHB"] });
const bmXphb = e({ __type: "subclass", name: "Battle Master", shortName: "Battle Master", source: "XPHB", className: "Fighter", classSource: "XPHB" });
const netPhb = e({ __type: "baseitem", name: "Net", reprintedAs: [{ uid: "Net|XPHB", tag: "item" }] });
const netXphb = e({ __type: "baseitem", name: "Net", source: "XPHB" });
const fallen = e({ __type: "subrace", name: "Fallen", source: "VGM", raceName: "Aasimar", raceSource: "VGM", reprintedAs: ["Aasimar|MPMM"] });
const aasimarMpmm = e({ __type: "race", name: "Aasimar", source: "MPMM" });
const oddTag = e({ __type: "action", name: "Grapple", reprintedAs: [{ uid: "Grappling|XPHB", tag: "quickref" }] });
const totemWarrior = e({ __type: "subclass", name: "Path of the Totem Warrior", shortName: "Totem Warrior", className: "Barbarian", classSource: "PHB" });

const all = [fireballPhb, fireballXphb, fighterPhb, archeryStyle, archeryFeat, bmUnderPhb, bmUnderXphb, bmXphb, netPhb, netXphb, fallen, aasimarMpmm, oddTag, totemWarrior];
const index = new ContentIndex(all);

describe("reprintTargets", () => {
  it("parses string and object forms, picking the source per uid convention", () => {
    expect(reprintTargets(fireballPhb)).toEqual([{ tag: "spell", uid: "Fireball|XPHB", source: "XPHB" }]);
    expect(reprintTargets(archeryStyle)).toEqual([{ tag: "feat", uid: "Archery|XPHB", source: "XPHB" }]);
    expect(reprintTargets(bmUnderPhb)[0]).toMatchObject({ tag: "subclass", source: "XPHB" });
    expect(reprintTargets(fallen)[0]).toMatchObject({ tag: "race", source: "MPMM" });
    expect(reprintTargets(totemWarrior)).toEqual([]);
    expect(reprintTargets(e({ __type: "spell", name: "x", reprintedAs: ["Nameless|"] }))[0].source).toBe("PHB");
  });
});

describe("reprintedEntities", () => {
  it("hides an entry whose newer printing is imported and enabled", () => {
    const set = reprintedEntities(all, index, {});
    expect(set.has(fireballPhb)).toBe(true);
    expect(set.has(fireballXphb)).toBe(false);
    expect(set.has(archeryStyle)).toBe(true); // cross-type target
    expect(set.has(bmUnderPhb)).toBe(true); // subclass uid: short|class|classSource|source
    expect(set.has(bmUnderXphb)).toBe(true);
    expect(set.has(bmXphb)).toBe(false);
    expect(set.has(netPhb)).toBe(true); // {@item} may point at a baseitem
    expect(set.has(fallen)).toBe(true); // subrace reprinted as a race
    expect(set.has(totemWarrior)).toBe(false); // never reprinted
  });

  it("does not hide an entry when the target's source is disabled or not imported", () => {
    expect(reprintedEntities(all, index, { XPHB: false }).has(fireballPhb)).toBe(false);
    expect(reprintedEntities(all, index, { XPHB: false }).has(bmUnderPhb)).toBe(false);
    // Fighter|XPHB is not in the pool even though XPHB is: still listed.
    expect(reprintedEntities(all, index, {}).has(fighterPhb)).toBe(false);
  });

  it("trusts the source alone for tags it cannot look up", () => {
    expect(reprintedEntities(all, index, {}).has(oddTag)).toBe(true);
    expect(reprintedEntities(all, index, { XPHB: false }).has(oddTag)).toBe(false);
  });

  it("isReprinted() takes an explicit availability callback", () => {
    expect(isReprinted(fireballPhb, { index, isSourceAvailable: () => true })).toBe(true);
    expect(isReprinted(fireballPhb, { index, isSourceAvailable: (s) => s !== "XPHB" })).toBe(false);
  });
});
