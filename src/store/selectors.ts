/**
 * Bridges the character draft (choices) and imported content (the ContentIndex)
 * into resolved entities and derived stats. Kept free of React/store hooks so it
 * is easy to test and reuse.
 */

import type { ContentIndex } from "../data/contentIndex";
import type { ContentType, ImportedEntity } from "../data/types/content";
import type {
  AdditionalSpellSet,
  Background,
  Feat,
  Race,
} from "../data/types/character-content";
import type {
  ClassData,
  ClassFeature,
  OptionalFeature,
  Subclass,
  SubclassFeature,
} from "../data/types/class-content";
import {
  listSubclasses,
  resolveClassFeatures,
  resolveSubclassFeatures,
} from "../data/featureResolver";
import type { Spell } from "../data/types/spell-content";
import { spellAvailableToClass } from "../data/types/spell-content";
import type { Item } from "../data/types/item-content";
import { itemTypeCode } from "../data/types/item-content";
import { parseStartingEquipment } from "../engine/startingEquipment";
import { characterLevel, primaryClass, type Character, type EntityRef } from "../model/character";
import type { ArmorPiece } from "../engine/armor";
import {
  abilityChoiceDefs,
  asiBonusesFromChoices,
  deriveCharacter,
  gatherAbilityBonusSources,
  gatherSkillGrants,
  type AbilityBonusSource,
  type AbilityChoiceDef,
  type DeriveInput,
  type DerivedCharacter,
  type ResolvedFeat,
  type SkillGrants,
} from "../engine/character";
import { ABILITIES, SKILLS, type Ability } from "../engine/constants";
import { detectAcFormulas, detectSpellAcFormulas } from "../engine/acFormulas";
import type { UnarmoredFormula } from "../engine/armor";
import { masteryNames, weaponMasteryCount } from "../engine/mastery";
import { isWeapon } from "../engine/attacks";
import { toolChoiceDefs, type ToolChoiceDef } from "../engine/tools";
import { featSpellGrants, type FeatSpellPickDef } from "../engine/featSpells";
import { itemModifiers, type Modifier } from "../engine/modifierEngine";
import { optionalFeatureDefs, type OptionalFeatureDef } from "../engine/optionalFeatures";
import { classResources, type ClassResource } from "../engine/resources";
import { languageChoiceDefs, type LanguageChoiceDef } from "../engine/languages";
import { abilityMod, proficiencyBonus } from "../engine/modifiers";
import {
  deriveSpellcasting,
  multiclassSpellSlots,
  type SpellcastingSummary,
} from "../engine/spellcasting";
import type { CasterProgression } from "../data/types/class-content";

function resolve<T>(index: ContentIndex, type: ContentType, ref?: EntityRef): T | undefined {
  if (!ref) return undefined;
  return index.get(type, ref.name, ref.source) as unknown as T | undefined;
}

export function resolveRace(index: ContentIndex, ref?: EntityRef): Race | undefined {
  return resolve<Race>(index, "race", ref);
}
export function resolveSubrace(index: ContentIndex, ref?: EntityRef): Race | undefined {
  return resolve<Race>(index, "subrace", ref);
}
export function resolveBackground(index: ContentIndex, ref?: EntityRef): Background | undefined {
  return resolve<Background>(index, "background", ref);
}

/**
 * The character's effective background: the resolved published pick, or a
 * synthesized one from `customBackground` (2 any-skill picks, a tool and a
 * standard language) so every existing picker works unchanged.
 */
export function backgroundFor(character: Character, index: ContentIndex): Background | undefined {
  const resolved = resolveBackground(index, character.background);
  if (resolved) return resolved;
  const custom = character.customBackground;
  if (!custom) return undefined;
  return {
    name: custom.name || "Custom Background",
    source: "Custom",
    skillProficiencies: [{ choose: { from: SKILLS.map((s) => s.id), count: 2 } }],
    toolProficiencies: [{ any: 1 }],
    languageProficiencies: [{ anyStandard: 1 }],
    entries: custom.description ? [custom.description] : [],
  };
}
export function resolveClass(index: ContentIndex, ref?: EntityRef): ClassData | undefined {
  return resolve<ClassData>(index, "class", ref);
}

const byName = (a: ImportedEntity, b: ImportedEntity) => a.name.localeCompare(b.name);

/** All entities of a content type, sorted by name. */
export function listByType(entities: ImportedEntity[], type: ContentType): ImportedEntity[] {
  return entities.filter((e) => e.__type === type).sort(byName);
}

/** Subraces whose parent race matches the given race ref. */
export function listSubraces(entities: ImportedEntity[], race?: EntityRef): ImportedEntity[] {
  if (!race) return [];
  return entities
    .filter(
      (e) =>
        e.__type === "subrace" &&
        (e as { raceName?: string }).raceName === race.name &&
        ((e as { raceSource?: string }).raceSource === race.source ||
          (e as { raceSource?: string }).raceSource === undefined),
    )
    .sort(byName);
}

/** Resolve an item ref from either the `item` or `baseitem` content arrays. */
export function resolveItem(index: ContentIndex, ref?: EntityRef): Item | undefined {
  return resolve<Item>(index, "item", ref) ?? resolve<Item>(index, "baseitem", ref);
}

/**
 * The item data behind one inventory entry: the imported item for library
 * refs, or a synthesized one for custom items (weapon-flagged when it deals
 * damage, so it shows in the attack list).
 */
export function itemForEntry(
  entry: { ref?: EntityRef; custom?: { weight?: number; dmg1?: string; dmgType?: string }; name: string },
  index: ContentIndex,
): Item | undefined {
  if (entry.ref) return resolveItem(index, entry.ref);
  if (!entry.custom) return undefined;
  return {
    name: entry.name,
    source: "Custom",
    weight: entry.custom.weight,
    dmg1: entry.custom.dmg1,
    dmgType: entry.custom.dmgType,
    weapon: !!entry.custom.dmg1,
  };
}

/**
 * Total carried weight. Custom items count their inline weight; an item is
 * weightless when ANY container up its chain (containers can nest) is a
 * weightless bag-of-holding style container. Cycle-safe.
 */
export function inventoryWeight(character: Character, index: ContentIndex): number {
  const byId = new Map(character.inventory.map((e) => [e.id, e]));
  const inWeightlessContainer = (entry: { containedIn?: string }): boolean => {
    const visited = new Set<string>();
    let holderId = entry.containedIn;
    while (holderId && !visited.has(holderId)) {
      visited.add(holderId);
      const holder = byId.get(holderId);
      if (!holder) return false;
      const item = itemForEntry(holder, index);
      if (item?.containerCapacity?.weightless) return true;
      holderId = holder.containedIn;
    }
    return false;
  };
  return character.inventory.reduce((sum, entry) => {
    if (inWeightlessContainer(entry)) return sum;
    const item = itemForEntry(entry, index);
    return sum + (item?.weight ?? 0) * entry.quantity;
  }, 0);
}

/** Total weight of a container's DIRECT contents (for its capacity line). */
export function containerContentsWeight(
  character: Character,
  index: ContentIndex,
  containerId: string,
): number {
  return character.inventory
    .filter((entry) => entry.containedIn === containerId)
    .reduce((sum, entry) => {
      const item = itemForEntry(entry, index);
      // Nested containers bring their own contents along.
      const nested = entry.id ? containerContentsWeight(character, index, entry.id) : 0;
      return sum + (item?.weight ?? 0) * entry.quantity + nested;
    }, 0);
}

/**
 * Mage-Armor-style AC formulas offered by the character's known/granted
 * spells — shown as sheet TOGGLES; only active ones join the derivation.
 */
export function effectAcFormulaCandidates(
  character: Character,
  index: ContentIndex,
): UnarmoredFormula[] {
  const refs = [
    ...character.cantrips,
    ...character.spells,
    ...featGrantedSpellsFor(character, index),
    ...speciesGrantedSpellsFor(character, index),
  ];
  const spells = refs
    .map((ref) => resolve<Spell>(index, "spell", ref))
    .filter((s): s is Spell => s !== undefined);
  return detectSpellAcFormulas(spells);
}

/** Total mastered-weapon slots across every class (2024 Weapon Mastery). */
export function masteryCountFor(character: Character, index: ContentIndex): number {
  return character.classes.reduce((sum, choice) => {
    const cls = resolveClass(index, choice);
    return sum + (cls ? weaponMasteryCount(cls, choice.level) : 0);
  }, 0);
}

/** Imported weapons carrying a mastery property, as picker options. */
export function masteryWeaponOptions(
  entities: ImportedEntity[],
): { name: string; mastery: string }[] {
  return entities
    .filter((e) => e.__type === "item" || e.__type === "baseitem")
    .map((e) => e as unknown as Item)
    .filter((i) => isWeapon(i) && masteryNames(i).length > 0)
    .map((i) => ({ name: i.name, mastery: masteryNames(i).join(", ") }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveFeat(index: ContentIndex, ref?: EntityRef): Feat | undefined {
  return resolve<Feat>(index, "feat", ref);
}

export interface StartingEquipmentItem {
  ref?: EntityRef;
  name: string;
  quantity: number;
}

/**
 * The default starting-equipment loadout granted by the character's background
 * and class. Refs are resolved against imported items so the stored identity
 * matches the library entry (enabling equip/AC); unresolved items keep their
 * raw name so they still appear in the inventory.
 */
export function startingEquipmentFor(character: Character, index: ContentIndex): StartingEquipmentItem[] {
  const cls = primaryClass(character);
  const sources: unknown[] = [
    (resolveBackground(index, character.background) as { startingEquipment?: unknown } | undefined)
      ?.startingEquipment,
    (cls ? resolveClass(index, { name: cls.name, source: cls.source }) : undefined)?.startingEquipment,
  ];
  const out: StartingEquipmentItem[] = [];
  for (const se of sources) {
    for (const granted of parseStartingEquipment(se)) {
      const item = resolveItem(index, granted.ref);
      out.push({
        ref: item ? { name: item.name, source: item.source } : granted.ref,
        name: item?.name ?? granted.name,
        quantity: granted.quantity,
      });
    }
  }
  return out;
}

/**
 * Parse a background `feats` grant into a feat ref. The grant may be a bare
 * `"name|source"` string or the record form `{ "name|source": true }`, and the
 * name may carry a `; specifier` sub-option (e.g. "magic initiate; cleric") that
 * isn't part of the feat's identity, so we strip it.
 */
function parseFeatGrant(entry: string | Record<string, boolean>): EntityRef | undefined {
  const raw =
    typeof entry === "string"
      ? entry
      : Object.entries(entry).find(([, v]) => v === true)?.[0];
  if (!raw) return undefined;
  const [namePart, source] = raw.split("|");
  const name = namePart.split(";")[0].trim();
  return name ? { name, source: source ?? "" } : undefined;
}

/**
 * The feats a character has, with the key-prefix their choices store under:
 * level-up ASI-slot feats (`asifeat:<slot>`) plus 2024 background-granted feats
 * (`bgfeat:<i>`). Unresolvable refs are dropped.
 */
export function resolveCharacterFeats(character: Character, index: ContentIndex): ResolvedFeat[] {
  const out: ResolvedFeat[] = [];
  character.asis.forEach((choice, i) => {
    if (choice.type !== "feat" || !choice.ref) return;
    const feat = resolveFeat(index, choice.ref);
    if (feat) out.push({ feat, keyPrefix: `asifeat:${i}` });
  });
  const background = backgroundFor(character, index);
  (background?.feats ?? []).forEach((grant, i) => {
    const ref = parseFeatGrant(grant);
    const feat = ref && resolveFeat(index, ref);
    if (feat) out.push({ feat, keyPrefix: `bgfeat:${i}` });
  });
  return out;
}

/** Inspect equipped inventory for an armor piece and whether a shield is worn. */
export function equippedDefense(
  character: Character,
  index: ContentIndex,
): { armor?: ArmorPiece; shield: boolean } {
  let armor: ArmorPiece | undefined;
  let shield = false;
  for (const entry of character.inventory) {
    if (!entry.equipped || !entry.ref) continue;
    const item = resolveItem(index, entry.ref);
    const code = itemTypeCode(item?.type);
    if (code === "S") shield = true;
    else if (code === "LA" || code === "MA" || code === "HA") {
      if (item?.ac != null) armor = { ac: item.ac, category: code, dexterityMax: item.dexterityMax };
    }
  }
  return { armor, shield };
}

/**
 * Typed modifiers emitted by the character's EQUIPPED items (modifier engine).
 * Items that require attunement only contribute while attuned.
 */
export function equippedItemModifiers(character: Character, index: ContentIndex): Modifier[] {
  return character.inventory
    .filter((entry) => entry.equipped && entry.ref)
    .flatMap((entry) => {
      const item = resolveItem(index, entry.ref);
      if (!item) return [];
      if (item.reqAttune && !entry.attuned) return [];
      return itemModifiers(item);
    });
}

/** Number of items the character is attuned to (the 5e limit is 3). */
export function attunedCount(character: Character): number {
  return character.inventory.filter((entry) => entry.attuned).length;
}

export function buildDeriveInput(character: Character, index: ContentIndex): DeriveInput {
  const defense = equippedDefense(character, index);
  const classes = character.classes
    .map((c) => ({ data: resolveClass(index, { name: c.name, source: c.source }), level: c.level }))
    .filter((c): c is { data: ClassData; level: number } => c.data !== undefined);
  // Unarmored Defense-style formulas live in feature text; scan the gained
  // class/subclass features for them.
  const featurePool = [
    ...index.list("classFeature"),
    ...index.list("subclassFeature"),
    ...index.list("subclass"),
  ];
  const gained = classFeaturesFor(character, featurePool, index);
  return {
    edition: character.edition,
    level: characterLevel(character),
    baseAbilities: character.baseAbilities,
    race: resolveRace(index, character.race),
    subrace: resolveSubrace(index, character.subrace),
    background: backgroundFor(character, index),
    class: classes[0]?.data,
    classes,
    feats: resolveCharacterFeats(character, index),
    abilityChoices: character.abilityChoices,
    skillChoices: character.skillChoices,
    hpMode: character.hpMode,
    hpRolls: character.hpRolls,
    asiBonuses: asiBonusesFromChoices(character.asis),
    adjustments: character.abilityAdjustments,
    equippedArmor: defense.armor,
    shield: defense.shield,
    modifiers: equippedItemModifiers(character, index),
    expertise: Object.values(character.expertiseChoices).flat(),
    acFormulas: [
      ...detectAcFormulas([...gained.features, ...gained.subclassFeatures]),
      // Spell formulas (Mage-Armor style) apply only while toggled on.
      ...effectAcFormulaCandidates(character, index).filter((f) =>
        character.play.activeEffects.includes(f.name),
      ),
    ],
    extraLanguages: Object.values(character.languageChoices).flat(),
    extraTools: Object.values(character.toolChoices).flat(),
    carriedWeight: inventoryWeight(character, index),
  };
}

/** Spendable class resources (rage, ki, …) across every class, per its level. */
export function classResourcesFor(character: Character, index: ContentIndex): ClassResource[] {
  return character.classes.flatMap((choice) => {
    const cls = resolveClass(index, choice);
    return cls ? classResources(cls, choice.level) : [];
  });
}

export function deriveFromCharacter(character: Character, index: ContentIndex): DerivedCharacter {
  return deriveCharacter(buildDeriveInput(character, index));
}

/**
 * Every labelled ability-bonus contributor for the draft — race/background
 * flats, resolved choice picks, feats, and level-up ASIs. Feeds the Abilities
 * page's Score Calculations breakdown.
 */
export function abilityBreakdownFor(character: Character, index: ContentIndex): AbilityBonusSource[] {
  const sources = gatherAbilityBonusSources({
    edition: character.edition,
    race: resolveRace(index, character.race),
    subrace: resolveSubrace(index, character.subrace),
    background: backgroundFor(character, index),
    feats: resolveCharacterFeats(character, index),
    abilityChoices: character.abilityChoices,
  });
  const asi = asiBonusesFromChoices(character.asis);
  if (Object.values(asi).some((v) => v)) {
    sources.push({ source: "Ability Score Improvement", bonuses: asi });
  }
  return sources;
}

/** Pickable language grants from the race, subrace, background and feats. */
export function languageChoiceDefsFor(character: Character, index: ContentIndex): LanguageChoiceDef[] {
  const race = resolveRace(index, character.race);
  const subrace = resolveSubrace(index, character.subrace);
  const background = backgroundFor(character, index);
  return [
    ...languageChoiceDefs(race?.languageProficiencies, "race:lang", race?.name ?? "Race"),
    ...languageChoiceDefs(subrace?.languageProficiencies, "subrace:lang", subrace?.name ?? "Subrace"),
    ...languageChoiceDefs(
      background?.languageProficiencies,
      "background:lang",
      background?.name ?? "Background",
    ),
    ...resolveCharacterFeats(character, index).flatMap((rf) =>
      languageChoiceDefs(rf.feat.languageProficiencies, `feat:${rf.keyPrefix}:lang`, rf.feat.name),
    ),
  ];
}

/** Pickable tool grants from the background (choose/any-category forms). */
export function toolChoiceDefsFor(character: Character, index: ContentIndex): ToolChoiceDef[] {
  const background = backgroundFor(character, index);
  return toolChoiceDefs(
    background?.toolProficiencies,
    "background:tool",
    background?.name ?? "Background",
  );
}

/** Skill grants (fixed + choices) from the draft's race/subrace/background/class. */
export function skillGrantsFor(character: Character, index: ContentIndex): SkillGrants {
  const cls = primaryClass(character);
  return gatherSkillGrants({
    race: resolveRace(index, character.race),
    subrace: resolveSubrace(index, character.subrace),
    background: backgroundFor(character, index),
    class: cls ? resolveClass(index, { name: cls.name, source: cls.source }) : undefined,
    feats: resolveCharacterFeats(character, index),
  });
}

/**
 * Resolve the class + subclass features a character has gained, across ALL
 * their classes — each class contributes features up to its own class level.
 */
export function classFeaturesFor(
  character: Character,
  entities: ImportedEntity[],
  index: ContentIndex,
): { features: ClassFeature[]; subclassFeatures: SubclassFeature[] } {
  const features: ClassFeature[] = [];
  const subclassFeatures: SubclassFeature[] = [];
  for (const choice of character.classes) {
    const cls = resolveClass(index, choice);
    if (!cls) continue;
    features.push(...resolveClassFeatures(entities, cls, choice.level));

    // Look the chosen subclass up in the full pool: `entities` is the
    // list-able view (enabled sources, reprints hidden), and a character may
    // well have picked a printing that is hidden from the pickers now.
    const sub = choice.subclass;
    const subData = sub
      ? (index
          .getAll("subclass", sub.name, sub.source)
          .find(
            (s) => s.className === cls.name && (s.classSource === undefined || s.classSource === cls.source),
          ) as Subclass | undefined) ??
        listSubclasses(entities, cls).find((s) => s.name === sub.name && s.source === sub.source)
      : undefined;
    if (subData) subclassFeatures.push(...resolveSubclassFeatures(entities, cls, subData, choice.level));
  }
  return { features, subclassFeatures };
}

/** Optional-feature choice definitions across every class of the character. */
export function optionalFeatureDefsFor(
  character: Character,
  index: ContentIndex,
): OptionalFeatureDef[] {
  return character.classes.flatMap((choice, i) => {
    const cls = resolveClass(index, choice);
    if (!cls) return [];
    return optionalFeatureDefs({
      cls,
      subclass: resolve<Subclass>(index, "subclass", choice.subclass),
      classIndex: i,
      level: choice.level,
    });
  });
}

/**
 * The character's chosen optional features resolved to entities, restricted to
 * currently-active choice defs (picks from a dropped class/subclass are
 * ignored). Feeds the sheet's Features tab.
 */
export function chosenOptionalFeaturesFor(
  character: Character,
  index: ContentIndex,
): OptionalFeature[] {
  const out: OptionalFeature[] = [];
  for (const def of optionalFeatureDefsFor(character, index)) {
    for (const ref of character.optionalFeatures[def.key] ?? []) {
      const feature = resolve<OptionalFeature>(index, "optionalfeature", ref);
      if (feature) out.push(feature);
    }
  }
  return out;
}

export interface SpellLimits {
  cantrips: number;
  spells: number;
  spellsLabel: "known" | "prepared";
}

export interface Spellcasting {
  summary: SpellcastingSummary;
  limits: SpellLimits;
  className: string;
  /** Source of the casting class — used to prefer same-edition spell reprints. */
  classSource: string;
  /** Index into `character.classes` for this caster (multiclass). */
  classIndex: number;
}

/**
 * Spellcasting for one class of the character, using that CLASS's level for
 * the progression tables (the multiclass rule: you know/prepare spells as if
 * single-classed) but the total character level for proficiency.
 */
function spellcastingAt(
  character: Character,
  index: ContentIndex,
  classIndex: number,
  abilities: Record<Ability, number>,
): (Spellcasting & { progression: CasterProgression }) | undefined {
  const choice = character.classes[classIndex];
  const cls = choice ? resolveClass(index, choice) : undefined;
  if (!choice || !cls) return undefined;

  // Spellcasting (progression, ability, and the count tables) may live on the
  // class or — for Eldritch Knight / Arcane Trickster — on the subclass. Prefer
  // the class and fall back to the subclass for each field independently.
  const sub = choice.subclass ? resolve<Subclass>(index, "subclass", choice.subclass) : undefined;
  const progression = cls.casterProgression ?? sub?.casterProgression;
  const ability = cls.spellcastingAbility ?? sub?.spellcastingAbility;
  if (!progression || !ability) return undefined;

  const cantripProgression = cls.cantripProgression ?? sub?.cantripProgression;
  const knownProgression = cls.spellsKnownProgression ?? sub?.spellsKnownProgression;
  const preparedProgression = cls.preparedSpellsProgression ?? sub?.preparedSpellsProgression;

  const abilityId = (ABILITIES as readonly string[]).includes(ability) ? (ability as Ability) : "int";
  const level = choice.level;
  const abilityScore = abilities[abilityId];
  const pb = proficiencyBonus(characterLevel(character));

  const summary = deriveSpellcasting({ progression, level, abilityScore, pb, ability: abilityId });

  const cantrips = cantripProgression?.[level - 1] ?? 0;
  let spells: number;
  let spellsLabel: "known" | "prepared";
  if (knownProgression) {
    spells = knownProgression[level - 1] ?? 0;
    spellsLabel = "known";
  } else if (preparedProgression) {
    // 2024 classes carry an explicit prepared-spell count per level.
    spells = preparedProgression[level - 1] ?? 0;
    spellsLabel = "prepared";
  } else {
    // 2014 prepared casters: ability modifier + (full level / half level).
    const factor = progression === "full" ? level : Math.floor(level / 2);
    spells = Math.max(1, abilityMod(abilityScore) + factor);
    spellsLabel = "prepared";
  }

  return {
    summary,
    limits: { cantrips, spells, spellsLabel },
    className: cls.name,
    classSource: cls.source,
    classIndex,
    progression,
  };
}

/**
 * Every spellcasting class of the character. With two or more slotted casters
 * the displayed slots become the shared multiclass table (combined caster
 * level); Pact Magic stays its own track.
 */
export function allSpellcastersFor(character: Character, index: ContentIndex): Spellcasting[] {
  if (character.classes.length === 0) return [];
  const abilities = deriveCharacter(buildDeriveInput(character, index)).abilities;
  const casters = character.classes
    .map((_, i) => spellcastingAt(character, index, i, abilities))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);

  const slotted = casters.filter((c) => c.progression !== "pact");
  if (slotted.length > 1) {
    const shared = multiclassSpellSlots(
      slotted.map((c) => ({ progression: c.progression, level: character.classes[c.classIndex].level })),
    );
    for (const c of slotted) c.summary = { ...c.summary, slots: shared };
  }
  return casters.map(({ progression: _progression, ...rest }) => rest);
}

/**
 * Spellcasting summary for the draft's first casting class, or undefined if the
 * character can't cast.
 */
export function spellcastingFor(character: Character, index: ContentIndex): Spellcasting | undefined {
  return allSpellcastersFor(character, index)[0];
}

/**
 * Whether the imported pool defines a spell list for the class at all — via the
 * `spells/sources.json` reverse-index or inline spell class associations. When
 * false, spells without any class info fall back to "open" (homebrew-friendly);
 * when true, they're excluded so the list can't flood.
 */
export function classSpellListKnown(
  entities: ImportedEntity[],
  className: string,
  index?: ContentIndex,
): boolean {
  return entities.some((e) => {
    if (e.__type !== "spell") return false;
    const s = e as unknown as Spell;
    const mapped = index?.spellClasses(s.name, s.source);
    if (mapped) return mapped.some((c) => c.name === className);
    return (
      !!s.classes?.fromClassList?.some((c) => c.name === className) ||
      !!s.spellLists?.includes(className)
    );
  });
}

/**
 * Spells castable by the class up to the given spell level, sorted by level then
 * name. Real 5eTools data reprints the same spell across sources (e.g. PHB +
 * XPHB), so same-named spells are collapsed to a single entry — preferring the
 * caster class's own source (`preferredSource`) when both are present.
 */
export function availableSpells(
  entities: ImportedEntity[],
  className: string,
  maxSpellLevel: number,
  index?: ContentIndex,
  preferredSource?: string,
): Spell[] {
  const listKnown = classSpellListKnown(entities, className, index);
  const matches = entities
    .filter((e) => e.__type === "spell")
    .map((e) => e as unknown as Spell)
    .filter(
      (s) =>
        s.level <= maxSpellLevel &&
        spellAvailableToClass(s, className, index?.spellClasses(s.name, s.source), listKnown),
    );

  const preferred = preferredSource?.toLowerCase();
  const byName = new Map<string, Spell>();
  for (const s of matches) {
    const key = s.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, s);
    } else if (preferred && s.source.toLowerCase() === preferred && existing.source.toLowerCase() !== preferred) {
      byName.set(key, s); // a reprint from the class's own source wins
    }
  }
  return [...byName.values()].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

/**
 * Spell options for one feat spell-pick definition: exact level, optional
 * class-list and school filters, reprints collapsed.
 */
export function spellsForFeatPick(
  entities: ImportedEntity[],
  index: ContentIndex | undefined,
  def: FeatSpellPickDef,
): Spell[] {
  const level = def.level ?? 0;
  const listKnown = def.className ? classSpellListKnown(entities, def.className, index) : false;
  const matches = entities
    .filter((e) => e.__type === "spell")
    .map((e) => e as unknown as Spell)
    .filter(
      (s) =>
        s.level === level &&
        (!def.className ||
          spellAvailableToClass(s, def.className, index?.spellClasses(s.name, s.source), listKnown)) &&
        (!def.schools || (s.school !== undefined && def.schools.includes(s.school))),
    );
  const byName = new Map<string, Spell>();
  for (const s of matches) if (!byName.has(s.name.toLowerCase())) byName.set(s.name.toLowerCase(), s);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** An entity whose `additionalSpells` grants are stored under `keyPrefix`. */
interface SpellGrantSource {
  entity: { name: string; additionalSpells?: AdditionalSpellSet[] };
  keyPrefix: string;
}

/** The species' spell-granting entities (race + subrace), if any. */
export function speciesSpellSources(character: Character, index: ContentIndex): SpellGrantSource[] {
  const out: SpellGrantSource[] = [];
  const race = resolveRace(index, character.race);
  const subrace = resolveSubrace(index, character.subrace);
  if (race?.additionalSpells?.length) out.push({ entity: race, keyPrefix: "racespell:race" });
  if (subrace?.additionalSpells?.length) out.push({ entity: subrace, keyPrefix: "racespell:subrace" });
  return out;
}

/** Fixed grants + resolved picks across the given `additionalSpells` sources. */
function grantedSpells(character: Character, index: ContentIndex, sources: SpellGrantSource[]): EntityRef[] {
  const out: EntityRef[] = [];
  const seen = new Set<string>();
  const push = (name: string, source?: string) => {
    // Resolve fixed grants (which may lack a source) against imported spells.
    const spell = source
      ? (index.get("spell", name, source) as unknown as Spell | undefined)
      : (index.resolveTag("spell", [name]) as unknown as Spell | undefined);
    const ref = spell ? { name: spell.name, source: spell.source } : source ? { name, source } : undefined;
    if (!ref) return;
    const key = `${ref.name}|${ref.source}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(ref);
    }
  };
  for (const { entity, keyPrefix } of sources) {
    const grants = featSpellGrants(entity, keyPrefix, character.featSpellSets[keyPrefix]);
    for (const fixed of grants.fixed) push(fixed.name, fixed.source);
    for (const def of grants.picks) {
      for (const ref of character.featSpells[def.key] ?? []) push(ref.name, ref.source);
    }
  }
  return out;
}

/** All spells granted by the character's feats: fixed grants + resolved picks. */
export function featGrantedSpellsFor(character: Character, index: ContentIndex): EntityRef[] {
  return grantedSpells(
    character,
    index,
    resolveCharacterFeats(character, index).map((rf) => ({ entity: rf.feat, keyPrefix: rf.keyPrefix })),
  );
}

/** All spells granted by the species (innate grants + resolved picks). */
export function speciesGrantedSpellsFor(character: Character, index: ContentIndex): EntityRef[] {
  return grantedSpells(character, index, speciesSpellSources(character, index));
}

/** Ability-choice defs from background-granted feats (rendered with the background). */
function backgroundFeatAbilityDefs(character: Character, index: ContentIndex): AbilityChoiceDef[] {
  return resolveCharacterFeats(character, index)
    .filter((rf) => rf.keyPrefix.startsWith("bgfeat"))
    .flatMap((rf) => abilityChoiceDefs(rf.feat, rf.keyPrefix));
}

/** Ability "choose N" definitions, edition-aware (race in classic, background in one). */
export function abilityChoiceDefsFor(character: Character, index: ContentIndex): AbilityChoiceDef[] {
  const base =
    character.edition === "one"
      ? abilityChoiceDefs(backgroundFor(character, index), "primary")
      : [
          ...abilityChoiceDefs(resolveRace(index, character.race), "primary"),
          ...abilityChoiceDefs(resolveSubrace(index, character.subrace), "subrace"),
        ];
  return [...base, ...backgroundFeatAbilityDefs(character, index)];
}

/** Ability-choice defs for the feat chosen in a given ASI slot. */
export function featAbilityChoiceDefsFor(
  index: ContentIndex,
  ref: EntityRef | undefined,
  keyPrefix: string,
): AbilityChoiceDef[] {
  const feat = resolveFeat(index, ref);
  return feat ? abilityChoiceDefs(feat, keyPrefix) : [];
}
