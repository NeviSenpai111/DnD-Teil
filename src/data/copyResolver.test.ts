import { describe, expect, it } from "vitest";
import type { ImportedEntity } from "./types/content";
import type { ImportIssue } from "./importer";
import {
  evalArithmetic,
  expandVersions,
  mergeSubraceIntoRace,
  resolveCopies,
  splitByTags,
  subraceDisplayName,
} from "./copyResolver";

type R = Record<string, unknown>;

const base = (over: R): ImportedEntity => ({ __type: "subrace", name: "X", source: "S", ...over }) as ImportedEntity;
const monster = (over: R): ImportedEntity => ({ __type: "monster", name: "M", source: "MM", ...over }) as ImportedEntity;

describe("resolveCopies", () => {
  const variant = base({
    name: "Variant",
    source: "PHB",
    raceName: "Human",
    raceSource: "PHB",
    page: 31,
    srd: true,
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
          { mode: "replaceTxt", replace: "Common\\.", with: "Common and one extra language." },
        ],
      },
    },
  });

  const resolved = resolveCopies([variant, amonkhet]);
  const am = resolved.find((e) => e.name === "Amonkhet")! as R;

  it("inherits base fields not overridden by the child", () => {
    expect(am.ability).toEqual([{ choose: { from: ["str", "dex"], count: 2 } }]);
    expect(am.skillProficiencies).toBeDefined();
  });

  it("keeps the child's own identity and drops the _copy marker", () => {
    expect(am.name).toBe("Amonkhet");
    expect(am.source).toBe("PSA");
    expect(am._copy).toBeUndefined();
    expect(am._isCopy).toBe(true);
  });

  it("does not inherit metadata (page/srd) unless _preserve says so", () => {
    expect(am.page).toBeUndefined();
    expect(am.srd).toBeUndefined();
    const [, preserved] = resolveCopies([
      variant,
      base({ name: "P", source: "PSA", raceName: "Human", raceSource: "PHB", _copy: { name: "Variant", source: "PHB", raceName: "Human", raceSource: "PHB", _preserve: { page: true } } }),
    ]);
    expect(preserved.page).toBe(31);
    expect(preserved.srd).toBeUndefined();
    const [, all] = resolveCopies([
      variant,
      base({ name: "Q", source: "PSA", raceName: "Human", raceSource: "PHB", _copy: { name: "Variant", source: "PHB", raceName: "Human", raceSource: "PHB", _preserve: { "*": true } } }),
    ]);
    expect(all.srd).toBe(true);
  });

  it("applies appendArr and regex replaceTxt _mod ops", () => {
    const entries = am.entries as { name?: string; entries?: string[] }[];
    expect(entries).toContainEqual({ type: "entries", name: "Age", entries: ["Age text."] });
    const langs = entries.find((e) => e.name === "Languages");
    expect(langs?.entries?.[0]).toBe("Common and one extra language.");
  });

  it("a child field set to null deletes the inherited field", () => {
    const [, out] = resolveCopies([
      variant,
      base({ name: "N", source: "PSA", raceName: "Human", raceSource: "PHB", skillProficiencies: null, _copy: { name: "Variant", source: "PHB", raceName: "Human", raceSource: "PHB" } }),
    ]);
    expect("skillProficiencies" in out).toBe(false);
    expect(out.ability).toBeDefined();
  });

  it("locates bases by full identity (subclass under a different class source)", () => {
    const sub = (over: R): ImportedEntity => ({ __type: "subclass", name: "Champion", shortName: "Champion", source: "PHB", className: "Fighter", ...over }) as ImportedEntity;
    const phb = sub({ classSource: "PHB", subclassFeatures: ["Improved Critical|Fighter||Champion||3"], page: 72 });
    const xphb = sub({ classSource: "XPHB", _copy: { name: "Champion", source: "PHB", shortName: "Champion", className: "Fighter", classSource: "PHB", _preserve: { page: true } } });
    const out = resolveCopies([xphb, phb]);
    const resolvedX = out.find((e) => e.classSource === "XPHB")!;
    expect(resolvedX.subclassFeatures).toEqual(["Improved Critical|Fighter||Champion||3"]);
    expect(resolvedX.page).toBe(72);
    expect(resolvedX.classSource).toBe("XPHB");
  });

  it("replaceArr swaps by name, regex, or index; replaceOrAppendArr appends when missing", () => {
    const b = base({ name: "B", source: "S", entries: [{ name: "Keep", entries: ["k"] }, { name: "Old", entries: ["o"] }, "plain"] });
    const mk = (name: string, ops: R[]) => base({ name, source: "S", _copy: { name: "B", source: "S", _mod: { entries: ops } } });
    const out = resolveCopies([
      b,
      mk("C1", [{ mode: "replaceArr", replace: "Old", items: { name: "New", entries: ["n"] } }]),
      mk("C2", [{ mode: "replaceArr", replace: { regex: "^ke", flags: "i" }, items: { name: "Re" } }]),
      mk("C3", [{ mode: "replaceArr", replace: { index: 2 }, items: "swapped" }]),
      mk("C4", [{ mode: "replaceOrAppendArr", replace: "Nope", items: { name: "Added" } }]),
    ]);
    const names = (n: string) => (out.find((e) => e.name === n)!.entries as (R | string)[]).map((e) => (typeof e === "string" ? e : e.name));
    expect(names("C1")).toEqual(["Keep", "New", "plain"]);
    expect(names("C2")).toEqual(["Re", "Old", "plain"]);
    expect(names("C3")).toEqual(["Keep", "Old", "swapped"]);
    expect(names("C4")).toEqual(["Keep", "Old", "plain", "Added"]);
  });

  it("reports (rather than throws on) a failed replaceArr and a missing base", () => {
    const issues: ImportIssue[] = [];
    const out = resolveCopies(
      [
        base({ name: "B", source: "S", entries: [] }),
        base({ name: "C", source: "S", _copy: { name: "B", source: "S", _mod: { entries: { mode: "replaceArr", replace: "Nope", items: "x" } } } }),
        base({ name: "Orphan", source: "S", entries: ["mine"], _copy: { name: "Gone", source: "S" } }),
      ],
      issues,
    );
    expect(out.find((e) => e.name === "Orphan")?.entries).toEqual(["mine"]);
    expect(out.every((e) => e._copy === undefined)).toBe(true);
    expect(issues.map((i) => i.message)).toEqual([
      expect.stringContaining('no "entries" item matching "Nope"'),
      expect.stringContaining('base "Gone" (S) not imported'),
    ]);
  });

  it("supports the string 'remove', setProp, insertArr, removeArr(force), appendIfNotExistsArr and prefixSuffixStringProp", () => {
    const b = base({ name: "B", source: "S", speed: 30, size: ["M"], languages: ["Common"], entries: ["a", "b"], tag: "x" });
    const [, out] = resolveCopies([
      b,
      base({
        name: "C",
        source: "S",
        _copy: {
          name: "B",
          source: "S",
          _mod: {
            speed: "remove",
            _: [
              { mode: "setProp", prop: "size", value: ["L"] },
              { mode: "setProp", prop: "nested.deep", value: 1 },
              { mode: "prefixSuffixStringProp", prop: "tag", prefix: "<", suffix: ">" },
            ],
            entries: [
              { mode: "insertArr", index: 1, items: "mid" },
              { mode: "removeArr", items: ["zzz"], force: true },
            ],
            languages: { mode: "appendIfNotExistsArr", items: ["Common", "Elvish"] },
          },
        },
      }),
    ]);
    expect(out.speed).toBeUndefined();
    expect(out.size).toEqual(["L"]);
    expect((out.nested as R).deep).toBe(1);
    expect(out.tag).toBe("<x>");
    expect(out.entries).toEqual(["a", "mid", "b"]);
    expect(out.languages).toEqual(["Common", "Elvish"]);
  });

  it("replaceTxt leaves {@tags} alone unless tagInsensitive, and only touches entries props by default", () => {
    const b = monster({
      name: "Mage",
      trait: [{ name: "the mage trait", entries: ["The mage casts {@spell the mage}."] }],
    });
    const out = resolveCopies([
      b,
      monster({ name: "Cavil", source: "X", _copy: { name: "Mage", source: "MM", _mod: { trait: { mode: "replaceTxt", replace: "the mage", with: "Cavil", flags: "i" } } } }),
      monster({ name: "Cavil2", source: "X", _copy: { name: "Mage", source: "MM", _mod: { trait: { mode: "replaceTxt", replace: "the mage", with: "Cavil", flags: "i", tagInsensitive: true } } } }),
    ]);
    const t1 = (out[1].trait as R[])[0];
    expect(t1.entries).toEqual(["Cavil casts {@spell the mage}."]);
    expect(t1.name).toBe("the mage trait");
    const t2 = (out[2].trait as R[])[0];
    expect(t2.entries).toEqual(["Cavil casts {@spell Cavil}."]);
  });

  it("applies bestiary mods: addSkills/addSaves from CR + abilities, addSpells, scalarAddHit, maxSize", () => {
    const b = monster({
      name: "Base",
      cr: "5",
      str: 16,
      int: 14,
      size: ["L", "H"],
      action: [{ name: "Slam", entries: ["{@atk mw} {@hit 5} to hit"] }],
      spellcasting: [{ name: "Spellcasting", spells: { "1": { slots: 4, spells: ["{@spell shield}"] } }, will: ["{@spell light}"] }],
    });
    const [, out] = resolveCopies([
      b,
      monster({
        name: "Boss",
        _copy: {
          name: "Base",
          source: "MM",
          _mod: {
            _: [
              { mode: "addSkills", skills: { investigation: 2, athletics: 1 } },
              { mode: "addSaves", saves: { str: 1 } },
              { mode: "addSpells", spells: { "1": { spells: ["{@spell alarm}"] } }, will: ["{@spell mage hand}"] },
              { mode: "maxSize", max: "L" },
            ],
            action: { mode: "scalarAddHit", scalar: 2 },
          },
        },
      }),
    ]);
    // CR 5 -> PB 3; int 14 -> +2 -> expertise 3*2+2 = +8; str 16 -> +3 -> +6
    expect(out.skill).toEqual({ investigation: "+8", athletics: "+6" });
    expect(out.save).toEqual({ str: "+6" });
    const sc = (out.spellcasting as R[])[0];
    expect((sc.spells as R)["1"]).toEqual({ slots: 4, spells: ["{@spell alarm}", "{@spell shield}"] });
    expect(sc.will).toEqual(["{@spell light}", "{@spell mage hand}"]);
    expect((out.action as R[])[0].entries).toEqual(["{@atk mw} {@hit 7} to hit"]);
    expect(out.size).toEqual(["L"]);
  });

  it("applies _templates root props (without overriding the child's own) and template mods", () => {
    const template = { __type: "monsterTemplate", name: "Legendary Shadow Dragon", source: "MM", apply: { _root: { size: ["G"], alignment: ["E"] }, _mod: { trait: { mode: "appendArr", items: { name: "Shadow Stealth", entries: ["..."] } } } } } as ImportedEntity;
    const dragon = monster({ name: "Adult Black Dragon", size: ["H"], trait: [{ name: "Amphibious", entries: ["x"] }] });
    const out = resolveCopies([
      template,
      dragon,
      monster({ name: "Nurvureem", source: "PotA", alignment: ["CE"], _copy: { name: "Adult Black Dragon", source: "MM", _templates: [{ name: "Legendary Shadow Dragon", source: "MM" }], _mod: { "*": { mode: "replaceTxt", replace: "the dragon", with: "Nurvureem", flags: "i" } } } }),
    ]);
    const n = out.find((e) => e.name === "Nurvureem")!;
    expect(n.size).toEqual(["G"]); // template root prop overrides the copied base
    expect(n.alignment).toEqual(["CE"]); // but not the child's own field
    expect((n.trait as R[]).map((t) => t.name)).toEqual(["Amphibious", "Shadow Stealth"]);
    expect(n._copyTemplates).toEqual([{ name: "Legendary Shadow Dragon", source: "MM" }]);
  });

  it("resolves <$short_name$>/<$dc__con$>/<$to_hit__str$> variables against the copied entity", () => {
    const b = monster({ name: "Ogre Mage", cr: "8", con: 16, str: 18, trait: [{ name: "T", entries: ["x"] }] });
    const [, out] = resolveCopies([
      b,
      monster({
        name: "Oni Chief",
        isNamedCreature: false,
        _copy: {
          name: "Ogre Mage",
          source: "MM",
          _mod: { trait: { mode: "appendArr", items: { name: "Roar", entries: ["<$title_short_name$> roars: DC <$dc__con$>, <$to_hit__str$> to hit."] } } },
        },
      }),
    ]);
    // CR 8 -> PB 3; con 16 -> +3 -> DC 14; str 18 -> +4 -> +7
    expect((out.trait as R[])[1].entries).toEqual(["The oni chief roars: DC 14, +7 to hit."]);
  });

  it("guards against circular chains", () => {
    const issues: ImportIssue[] = [];
    const out = resolveCopies(
      [
        base({ name: "A", source: "S", _copy: { name: "B", source: "S" } }),
        base({ name: "B", source: "S", _copy: { name: "A", source: "S" } }),
      ],
      issues,
    );
    expect(out).toHaveLength(2);
    expect(out.every((e) => e._copy === undefined)).toBe(true);
    expect(issues.some((i) => i.message.includes("circular"))).toBe(true);
  });
});

describe("expandVersions", () => {
  it("creates sibling entities from basic and templated versions, preserving metadata", () => {
    const feat = {
      __type: "feat",
      name: "Magic Initiate",
      source: "XPHB",
      page: 201,
      entries: [{ name: "Two Cantrips", entries: ["generic"] }],
      _versions: [
        { name: "Magic Initiate; Cleric", source: "XPHB", _mod: { entries: { mode: "replaceArr", replace: "Two Cantrips", items: { name: "Two Cantrips", entries: ["cleric"] } } } },
        {
          _abstract: { name: "Magic Initiate; {{cls}}", source: "XPHB", _mod: { entries: { mode: "replaceArr", replace: "Two Cantrips", items: { name: "Two Cantrips", entries: ["{{cls}} list"] } } } },
          _implementations: [{ _variables: { cls: "Druid" } }, { _variables: { cls: "Wizard" } }],
        },
      ],
    } as ImportedEntity;
    const out = expandVersions([feat]);
    expect(out.map((e) => e.name)).toEqual(["Magic Initiate", "Magic Initiate; Cleric", "Magic Initiate; Druid", "Magic Initiate; Wizard"]);
    expect(out[0]._versions).toBeUndefined();
    expect(out[0]._hasVersions).toBe(true);
    const wizard = out[3];
    expect(wizard.page).toBe(201);
    expect(wizard._versionBase_name).toBe("Magic Initiate");
    expect((wizard.entries as R[])[0].entries).toEqual(["Wizard list"]);
    // Idempotent over an already-expanded pool.
    expect(expandVersions(out)).toHaveLength(4);
  });

  it("expands subrace versions against the merged race and emits them as races", () => {
    const race = { __type: "race", name: "Dragonborn", source: "PHB", page: 32, size: ["M"], ability: [{ str: 2, cha: 1 }], entries: [{ name: "Draconic Ancestry", entries: ["table"] }, { name: "Breath Weapon", entries: ["generic"] }] } as ImportedEntity;
    const subrace = {
      __type: "subrace",
      name: "Dragonborn",
      _isBaseVariant: true,
      source: "PHB",
      raceName: "Dragonborn",
      raceSource: "PHB",
      _versions: [
        {
          _abstract: { name: "Dragonborn ({{color}})", source: "PHB", _mod: { entries: [{ mode: "removeArr", names: "Draconic Ancestry" }, { mode: "replaceArr", replace: "Breath Weapon", items: { name: "Breath Weapon", entries: ["{{damageType}} breath"] } }] } },
          _implementations: [{ _variables: { color: "Black", damageType: "acid" } }, { _variables: { color: "Blue", damageType: "lightning" } }],
        },
      ],
    } as ImportedEntity;
    const issues: ImportIssue[] = [];
    const out = expandVersions([race, subrace], issues);
    expect(issues).toEqual([]);
    expect(out.map((e) => `${e.__type}:${e.name}`)).toEqual([
      "race:Dragonborn",
      "subrace:Dragonborn",
      "race:Dragonborn (Black)",
      "race:Dragonborn (Blue)",
    ]);
    const black = out[2];
    expect(black.raceName).toBeUndefined();
    expect(black.size).toEqual(["M"]);
    expect(black.ability).toEqual([{ str: 2, cha: 1 }]);
    expect((black.entries as R[]).map((e) => e.name)).toEqual(["Breath Weapon"]);
    expect((black.entries as R[])[0].entries).toEqual(["acid breath"]);
    expect(black._versionBase_name).toBe("Dragonborn");
  });
});

describe("mergeSubraceIntoRace", () => {
  it("merges abilities index-wise, appends/overwrites entries, and concatenates languages", () => {
    const race = { name: "Elf", source: "PHB", ability: [{ dex: 2 }], entries: [{ name: "Darkvision", entries: ["60 ft."] }, { name: "Languages", entries: ["Common, Elvish"] }], languageProficiencies: [{ common: true, elvish: true }] };
    const subrace = { name: "High", source: "PHB", ability: [{ int: 1 }], entries: [{ name: "Cantrip", entries: ["x"] }, { name: "Extra Language", data: { overwrite: "Languages" }, entries: ["one extra"] }], languageProficiencies: [{ anyStandard: 1 }] };
    const merged = mergeSubraceIntoRace(race, subrace, () => {});
    expect(merged.name).toBe("Elf (High)");
    expect(merged._subraceName).toBe("High");
    expect(merged.ability).toEqual([{ dex: 2, int: 1 }]);
    expect((merged.entries as R[]).map((e) => e.name)).toEqual(["Darkvision", "Extra Language", "Cantrip"]);
    expect(merged.languageProficiencies).toEqual([{ common: true, elvish: true }, { anyStandard: 1 }]);
  });

  it("honours overwrite flags and keeps the race name for base variants", () => {
    const race = { name: "Human", source: "PHB", ability: [{ str: 1 }] };
    const merged = mergeSubraceIntoRace(race, { name: "Human", _isBaseVariant: true, source: "PHB", ability: [{ dex: 1 }], overwrite: { ability: true } }, () => {});
    expect(merged.name).toBe("Human");
    expect(merged.ability).toEqual([{ dex: 1 }]);
  });
});

describe("helpers", () => {
  it("splitByTags keeps nested tags intact", () => {
    expect(splitByTags("a {@b c {@d e}} f")).toEqual(["a ", "{@b c {@d e}}", " f"]);
    expect(splitByTags("no tags")).toEqual(["no tags"]);
  });

  it("evalArithmetic handles precedence and parentheses", () => {
    expect(evalArithmetic("2 + 3 * 4")).toBe(14);
    expect(evalArithmetic("(2 + 3) * 4")).toBe(20);
    expect(evalArithmetic("-3 + 10 / 4")).toBe(-0.5);
    expect(() => evalArithmetic("2 +")).toThrow();
  });

  it("subraceDisplayName folds into existing brackets", () => {
    expect(subraceDisplayName("Elf", "High")).toBe("Elf (High)");
    expect(subraceDisplayName("Dragonborn (Draconblood)", "Black")).toBe("Dragonborn (Draconblood; Black)");
    expect(subraceDisplayName("Human")).toBe("Human");
  });
});
