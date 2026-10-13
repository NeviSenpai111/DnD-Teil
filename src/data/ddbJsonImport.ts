/**
 * Imports a D&D Beyond character from its JSON (the payload behind the
 * dndbeyond.com character sheet — see `ddbJson.ts`).
 *
 * The JSON holds the build rather than printed results, so far less has to be
 * reverse-engineered than from a PDF: base scores are real base scores, every
 * proficiency is a typed modifier, items carry equipped/attuned/container
 * state and every entity names its source book (so a 2024 "Sage" resolves to
 * the 2024 background, not the 2014 one). What still needs care is mapping
 * DDB's choices onto this app's choice slots, and the totals: DDB computes
 * them from rules this app's content may not model (a Tome of Clear Thought's
 * +2), so any ability that comes out different is pinned with Override Score
 * and reported.
 */

import { ContentIndex, looseName } from "./contentIndex";
import type { ContentType, ImportedEntity } from "./types/content";
import type { Edition } from "./types/meta";
import type { Feat } from "./types/character-content";
import type { Spell } from "./types/spell-content";
import {
  DDB_ALIGNMENTS,
  DDB_CLASS_FEATURE_COMPONENT,
  DDB_CONDITIONS,
  DDB_INITIAL_ASI_TAG,
  DDB_LIFESTYLES,
  DDB_STAT_ABILITY,
  DDB_TOOL_ENTITY_TYPE,
  DDB_WEAPON_CATEGORIES,
  activeModifiers,
  asDdbCharacter,
  ddbAbilities,
  ddbCharacterId,
  ddbMaxHp,
  ddbSkillId,
  hasBackgroundAsi,
  raceModifiers,
  sourceCodes,
  type DdbCharacter,
  type DdbClass,
  type DdbFeat,
  type DdbModifier,
  type DdbSourceRef,
  type DdbSpellEntry,
} from "./ddbJson";
import { applyProficiencies, fitHpRolls, refOf, resolveSpecies, type CharacterImport } from "./ddbImport";
import { ABILITIES, SKILLS, type Ability } from "../engine/constants";
import { emptyCurrency, COINS } from "../engine/currency";
import { maxHpMulticlass } from "../engine/hp";
import { abilityChoiceDefs, asiSlotCount, type AbilityChoiceDef } from "../engine/character";
import { featSpellGrants } from "../engine/featSpells";
import { abilityMod, formatMod, proficiencyBonus } from "../engine/modifiers";
import {
  allSpellcastersFor,
  backgroundFor,
  deriveFromCharacter,
  optionalFeatureDefsFor,
  resolveCharacterFeats,
  resolveClass,
  resolveRace,
  resolveSubrace,
  speciesSpellSources,
  spellsForFeatPick,
} from "../store/selectors";
import {
  createCharacter,
  emptyDetails,
  newItemId,
  normalizeCharacter,
  type AsiChoice,
  type CharacterDetails,
  type ClassChoice,
  type CustomAttack,
  type EntityRef,
  type InventoryItem,
  type SpellPick,
} from "../model/character";

type Types = ContentType | ContentType[];

/**
 * The spellings to try for a DDB name, best first. DDB writes "Crossbow,
 * Light", "Rope, Hempen (50 feet)", "Studded Leather" and "Magic Initiate
 * (Wizard)" where 5eTools has "Light Crossbow", "Hempen Rope (50 feet)",
 * "Studded Leather Armor" and the `_versions` name "Magic Initiate; Wizard".
 */
export function ddbNameVariants(name: string, kind: "item" | "feat" | "other" = "other"): string[] {
  const out: string[] = [];
  const add = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  };
  add(name);
  const paren = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(name);
  const core = paren ? paren[1] : name;
  const suffix = paren ? ` (${paren[2]})` : "";
  const comma = /^([^,]+),\s*(.+)$/.exec(core);
  if (comma) add(`${comma[2]} ${comma[1]}${suffix}`);
  if (kind === "feat" && paren) {
    add(`${paren[1]}; ${paren[2]}`);
    add(paren[1]);
  }
  if (kind === "item") {
    add(`${name} Armor`);
    // "Crossbow Bolts" ×20 is twenty "Crossbow Bolt"s.
    if (!suffix && /[^s]s$/i.test(core)) add(core.slice(0, -1));
  }
  return out;
}

/**
 * The entity a DDB name refers to: the first spelling that matches anything,
 * preferring the reprint from the book DDB cites.
 */
function resolveNamed(
  index: ContentIndex,
  types: Types,
  names: string[],
  sources: DdbSourceRef[] | null | undefined,
): ImportedEntity | undefined {
  const codes = sourceCodes(sources).map((code) => code.toLowerCase());
  for (const name of names) {
    const hits = index.findAllByName(types, name);
    if (!hits.length) continue;
    for (const code of codes) {
      const hit = hits.find((entity) => entity.source.toLowerCase() === code);
      if (hit) return hit;
    }
    return hits[0];
  }
  return undefined;
}

function resolveSubclass(
  index: ContentIndex,
  cls: ImportedEntity,
  definition: NonNullable<DdbClass["subclassDefinition"]>,
): EntityRef | undefined {
  const wanted = looseName(definition.name ?? "");
  if (!wanted) return undefined;
  const candidates = index
    .list("subclass")
    .filter((sub) => looseName(String(sub.className ?? "")) === looseName(cls.name))
    .filter((sub) => looseName(sub.name) === wanted || looseName(String(sub.shortName ?? "")) === wanted);
  const codes = sourceCodes(definition.sources).map((code) => code.toLowerCase());
  const best =
    candidates.find((sub) => codes.includes(sub.source.toLowerCase()) && sub.classSource === cls.source) ??
    candidates.find((sub) => sub.classSource === cls.source) ??
    candidates.find((sub) => codes.includes(sub.source.toLowerCase())) ??
    candidates[0];
  return best ? refOf(best) : undefined;
}

function resolveDdbSpecies(
  index: ContentIndex,
  race: NonNullable<DdbCharacter["race"]>,
): { race?: EntityRef; subrace?: EntityRef; partial?: boolean } {
  if (race.isSubRace && race.subRaceShortName && race.baseRaceName) {
    const base = resolveNamed(index, "race", [race.baseRaceName], race.sources);
    if (base) {
      const subs = index
        .list("subrace")
        .filter(
          (sub) =>
            looseName(String(sub.raceName ?? "")) === looseName(base.name) &&
            looseName(sub.name) === looseName(race.subRaceShortName ?? ""),
        );
      const sub = subs.find((s) => s.raceSource === base.source) ?? subs[0];
      if (sub) return { race: refOf(base), subrace: refOf(sub) };
    }
  }
  const name = race.fullName ?? race.baseName ?? "";
  const direct = resolveNamed(index, "race", [name], race.sources);
  return direct ? { race: refOf(direct) } : resolveSpecies(index, name);
}

/** Collapse DDB's rich-text fields (custom background descriptions) to plain text. */
function plainText(html: string | null | undefined): string {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const isTagged = (feat: DdbFeat, tag: string) =>
  (feat.definition?.categories ?? []).some((category) => category.tagName === tag);

const abilityBonusSubtype = (m: DdbModifier): Ability | undefined => {
  if (m.type !== "bonus" || !m.subType?.endsWith("-score")) return undefined;
  return ABILITIES.find((a) => m.subType === `${abilityLongName(a)}-score`);
};

function abilityLongName(ability: Ability): string {
  return {
    str: "strength",
    dex: "dexterity",
    con: "constitution",
    int: "intelligence",
    wis: "wisdom",
    cha: "charisma",
  }[ability];
}

/** Per-ability sum of `<ability>-score` bonuses in a modifier list. */
function sumAbilityBonuses(mods: DdbModifier[]): Partial<Record<Ability, number>> {
  const out: Partial<Record<Ability, number>> = {};
  for (const m of mods) {
    const ability = abilityBonusSubtype(m);
    if (ability) out[ability] = (out[ability] ?? 0) + (m.value ?? m.fixedValue ?? 0);
  }
  return out;
}

/** What's left of `wanted` after an entity's flat (non-choice) bonuses. */
function minusFlat(
  wanted: Partial<Record<Ability, number>>,
  entity: { ability?: Partial<Record<Ability, unknown>>[] } | undefined,
): Partial<Record<Ability, number>> {
  const out = { ...wanted };
  for (const entry of entity?.ability ?? []) {
    for (const ability of ABILITIES) {
      const value = entry[ability];
      if (typeof value === "number") out[ability] = (out[ability] ?? 0) - value;
    }
  }
  return out;
}

/**
 * Turn per-ability increases back into "choose N abilities" picks. A weighted
 * 2024 grant (+2/+1) is only filled when every weight finds a home, so the
 * alternative (+1/+1/+1) def of the same background stays empty.
 */
export function dealAbilityChoices(
  wanted: Partial<Record<Ability, number>>,
  defs: AbilityChoiceDef[],
): Record<string, Ability[]> {
  const remaining: Partial<Record<Ability, number>> = { ...wanted };
  const picks: Record<string, Ability[]> = {};
  for (const def of defs) {
    if (def.weights) {
      const slots: (Ability | undefined)[] = def.weights.map(() => undefined);
      const order = def.weights.map((weight, i) => ({ weight, i })).sort((a, b) => b.weight - a.weight);
      for (const { weight, i } of order) {
        slots[i] = def.from.find((a) => (remaining[a] ?? 0) >= weight && !slots.includes(a));
      }
      if (slots.every(Boolean)) {
        slots.forEach((a, i) => (remaining[a!] = (remaining[a!] ?? 0) - def.weights![i]));
        picks[def.key] = slots as Ability[];
      }
      continue;
    }
    const chosen: Ability[] = [];
    for (const ability of def.from) {
      if (chosen.length >= def.count) break;
      if ((remaining[ability] ?? 0) >= def.amount) {
        chosen.push(ability);
        remaining[ability] = (remaining[ability] ?? 0) - def.amount;
      }
    }
    if (chosen.length) picks[def.key] = chosen;
  }
  return picks;
}

/** A DDB class's ASI-or-feat features at or below its level, in level order. */
function asiFeatures(cls: DdbClass): { id?: number; level: number }[] {
  return (cls.classFeatures ?? [])
    .map((feature) => feature.definition)
    .filter((def) => def && /ability score improvement|epic boon/i.test(def.name ?? ""))
    .map((def) => ({ id: def!.id, level: def!.requiredLevel ?? 0 }))
    .filter((feature) => feature.level <= cls.level)
    .sort((a, b) => a.level - b.level);
}

interface FeatPlacement {
  ddb: DdbFeat;
  /** Where its choices are stored (`asifeat:<slot>` / `bgfeat:<i>`). */
  keyPrefix: string;
}

/** DDB spell rows by the feat/trait that granted them (`componentId`). */
function spellsByComponent(entries: DdbSpellEntry[] | null | undefined): Map<number | undefined, DdbSpellEntry[]> {
  const out = new Map<number | undefined, DdbSpellEntry[]>();
  for (const entry of entries ?? []) {
    const list = out.get(entry.componentId);
    if (list) list.push(entry);
    else out.set(entry.componentId, [entry]);
  }
  return out;
}

/**
 * Place DDB's chosen grant spells (Magic Initiate, Fey Touched, a High Elf's
 * cantrip) into the pick slots the app derives for the same feat or species.
 * Returns the names that found no slot.
 */
function placeGrantSpells(
  index: ContentIndex,
  entity: { name: string; additionalSpells?: Feat["additionalSpells"] },
  keyPrefix: string,
  ddbSpells: DdbSpellEntry[],
  setHint?: string,
): { featSpells: Record<string, EntityRef[]>; featSpellSets: Record<string, string>; unplaced: string[] } {
  const featSpells: Record<string, EntityRef[]> = {};
  const featSpellSets: Record<string, string> = {};
  const resolved = ddbSpells
    .map((entry) => ({
      name: entry.definition?.name ?? "",
      level: entry.definition?.level ?? 0,
      entity: resolveNamed(index, "spell", [entry.definition?.name ?? ""], entry.definition?.sources),
    }))
    .filter((row) => row.name);

  const sets = featSpellGrants(entity, keyPrefix).sets;
  const tryPlace = (set?: string) => {
    const picks: Record<string, EntityRef[]> = {};
    const placed = new Set<string>();
    for (const def of featSpellGrants(entity, keyPrefix, set).picks) {
      const allowed = new Set(spellsForFeatPick(index.list("spell"), index, def).map((s) => looseName(s.name)));
      const refs: EntityRef[] = [];
      for (const row of resolved) {
        if (refs.length >= def.count || placed.has(row.name) || !row.entity) continue;
        if (row.level !== (def.level ?? 0) || !allowed.has(looseName(row.name))) continue;
        refs.push(refOf(row.entity));
        placed.add(row.name);
      }
      if (refs.length) picks[def.key] = refs;
    }
    return { picks, placed };
  };

  let best = tryPlace();
  if (sets.length) {
    // The DDB name says which list ("Magic Initiate (Wizard)"); otherwise take
    // the option that seats the most spells.
    const hinted = setHint ? sets.find((set) => looseName(set).includes(looseName(setHint))) : undefined;
    const ordered = hinted ? [hinted] : sets;
    let bestSet = ordered[0];
    best = tryPlace(bestSet);
    for (const set of ordered.slice(1)) {
      const attempt = tryPlace(set);
      if (attempt.placed.size > best.placed.size) {
        best = attempt;
        bestSet = set;
      }
    }
    featSpellSets[keyPrefix] = bestSet;
  }
  Object.assign(featSpells, best.picks);
  return {
    featSpells,
    featSpellSets,
    unplaced: resolved.filter((row) => !best.placed.has(row.name)).map((row) => row.name),
  };
}

/** A DDB custom action as a sheet attack line (to-hit derived like DDB does). */
function customAttack(
  action: NonNullable<DdbCharacter["customActions"]>[number],
  totals: Record<Ability, number>,
  pb: number,
): CustomAttack | undefined {
  if (!action.name) return undefined;
  const statId = action.abilityModifierStatId ?? action.statId ?? undefined;
  const ability = statId ? DDB_STAT_ABILITY[statId] : undefined;
  const mod = ability ? abilityMod(totals[ability]) : 0;
  const hit = action.fixedToHit ?? mod + (action.isProficient ? pb : 0) + (action.toHitBonus ?? 0);
  let damage =
    action.dice?.diceString ??
    (action.diceCount && action.diceType ? `${action.diceCount}d${action.diceType}` : undefined) ??
    (action.fixedValue ?? action.dice?.fixedValue)?.toString() ??
    "";
  const bonus = (action.damageBonus ?? 0) + (ability ? mod : 0);
  if (damage && bonus) damage += formatMod(bonus);
  return { name: action.name, hit, damage };
}

function readDetails(ddb: DdbCharacter): CharacterDetails {
  const text = (value: string | number | null | undefined) => (value === null || value === undefined ? "" : String(value));
  const notes = ddb.notes ?? {};
  const sections: [string, string | null | undefined][] = [
    ["Allies", notes.allies],
    ["Organizations", notes.organizations],
    ["Enemies", notes.enemies],
    ["Personal Possessions", notes.personalPossessions],
    ["Other Holdings", notes.otherHoldings],
  ];
  const noteText = [
    ...(notes.otherNotes ? [notes.otherNotes] : []),
    ...sections.filter(([, value]) => value).map(([label, value]) => `${label}:\n${value}`),
  ].join("\n\n");
  const weight = ddb.weight;
  return {
    ...emptyDetails(),
    alignment: ddb.alignmentId ? (DDB_ALIGNMENTS[ddb.alignmentId] ?? "") : "",
    lifestyle: ddb.lifestyleId ? (DDB_LIFESTYLES[ddb.lifestyleId] ?? "") : "",
    faith: text(ddb.faith),
    hair: text(ddb.hair),
    skin: text(ddb.skin),
    eyes: text(ddb.eyes),
    height: text(ddb.height),
    weight: typeof weight === "number" ? `${weight} lb` : text(weight),
    age: text(ddb.age),
    gender: text(ddb.gender),
    personalityTraits: text(ddb.traits?.personalityTraits),
    ideals: text(ddb.traits?.ideals),
    bonds: text(ddb.traits?.bonds),
    flaws: text(ddb.traits?.flaws),
    appearance: text(ddb.traits?.appearance),
    backstory: text(notes.backstory),
    notes: noteText,
  };
}

/** The inventory, resolved against content, with container links kept. */
function readInventory(
  ddb: DdbCharacter,
  index: ContentIndex,
  unresolved: string[],
): { items: InventoryItem[]; charges: Record<string, number> } {
  const items: InventoryItem[] = [];
  const charges: Record<string, number> = {};
  const ids = new Map<number, string>();
  const containers = new Map<string, number>();

  for (const entry of ddb.inventory ?? []) {
    const def = entry.definition;
    const name = def?.name?.trim();
    if (!name) continue;
    const entity = resolveNamed(index, ["item", "baseitem"], ddbNameVariants(name, "item"), def?.sources);
    if (!entity) unresolved.push(name);
    const id = newItemId();
    ids.set(entry.id, id);
    if (entry.containerEntityId && entry.containerEntityId !== ddb.id) containers.set(id, entry.containerEntityId);
    // DDB's weight is per bundle ("Crossbow Bolts": 1.5 lb per 20).
    const unitWeight = def?.weight ? def.weight / Math.max(1, def.bundleSize ?? 1) : undefined;
    const properties = (def?.properties ?? []).map((p) => p.name ?? "");
    items.push({
      id,
      ref: entity ? refOf(entity) : undefined,
      custom: entity
        ? undefined
        : {
            weight: unitWeight,
            dmg1: def?.damage?.diceString ?? undefined,
            dmgType: def?.damageType ?? undefined,
            // A homebrew/third-party weapon keeps what it needs to attack
            // like DDB shows it: category (proficiency), melee/ranged, range.
            ...(def?.damage?.diceString
              ? {
                  weaponCategory: def.categoryId ? DDB_WEAPON_CATEGORIES[def.categoryId] : undefined,
                  ranged: def.attackType === 2 || undefined,
                  finesse: properties.includes("Finesse") || undefined,
                  range: def.range ? (def.longRange ? `${def.range}/${def.longRange}` : `${def.range}`) : undefined,
                }
              : {}),
          },
      name: entity?.name ?? name,
      quantity: Math.max(1, entry.quantity ?? 1),
      equipped: Boolean(entry.equipped),
      attuned: entry.isAttuned || undefined,
    });
    if (entity && entry.chargesUsed && typeof entity.charges === "number") {
      charges[entity.name] = Math.min(entry.chargesUsed, entity.charges);
    }
  }
  for (const item of items) {
    const container = item.id ? containers.get(item.id) : undefined;
    if (container !== undefined) item.containedIn = ids.get(container);
  }
  for (const custom of ddb.customItems ?? []) {
    if (!custom.name) continue;
    items.push({
      id: newItemId(),
      custom: { weight: custom.weight ?? undefined },
      name: custom.name,
      quantity: Math.max(1, custom.quantity ?? 1),
      equipped: false,
    });
  }
  return { items, charges };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Build a character from D&D Beyond's character JSON. */
export function characterFromDdbJson(ddb: DdbCharacter, index: ContentIndex): CharacterImport {
  const warnings: string[] = [];
  // DDB moves ability increases from species to background exactly when a
  // 2024 background's ASI pseudo-feat is present — the app's "one" edition rule.
  const edition: Edition = hasBackgroundAsi(ddb) ? "one" : "classic";

  // --- Classes (starting class first: it gets max HP at level 1) ----------
  const ddbClasses = [...(ddb.classes ?? [])].sort(
    (a, b) => Number(Boolean(b.isStartingClass)) - Number(Boolean(a.isStartingClass)),
  );
  const classes: ClassChoice[] = [];
  const placedClasses: DdbClass[] = [];
  for (const cls of ddbClasses) {
    const name = cls.definition?.name ?? "";
    const entity = resolveNamed(index, "class", [name], cls.definition?.sources);
    if (!entity) {
      warnings.push(`Class "${name}" isn't in your imported content — add it on the Class page.`);
      continue;
    }
    const subclass = cls.subclassDefinition ? resolveSubclass(index, entity, cls.subclassDefinition) : undefined;
    if (cls.subclassDefinition?.name && !subclass) {
      warnings.push(`Subclass "${cls.subclassDefinition.name}" isn't in your imported content — pick it on the Class page.`);
    }
    classes.push({ ...refOf(entity), level: cls.level, subclass });
    placedClasses.push(cls);
  }

  // --- Species and background -------------------------------------------
  const species = ddb.race ? resolveDdbSpecies(index, ddb.race) : {};
  const speciesName = ddb.race?.fullName ?? "";
  if (speciesName && !species.race) {
    warnings.push(`Species "${speciesName}" isn't in your imported content — pick it on the Species page.`);
  } else if (species.partial) {
    warnings.push(`Matched "${speciesName}" to ${species.race?.name} — check the subrace on the Species page.`);
  }

  const bgDef = ddb.background?.definition;
  const custom = ddb.background?.hasCustomBackground ? ddb.background.customBackground : undefined;
  const bgEntity =
    !custom && bgDef?.name ? resolveNamed(index, "background", [bgDef.name], bgDef.sources) : undefined;
  const customBackground = custom
    ? { name: custom.name ?? "Custom Background", description: plainText(custom.description) }
    : bgDef?.name && !bgEntity
      ? { name: bgDef.name, description: "Imported from D&D Beyond." }
      : undefined;
  if (bgDef?.name && !custom && !bgEntity) {
    warnings.push(`Background "${bgDef.name}" isn't in your imported content — kept as a custom background.`);
  }

  // --- Feats: class ASI slots, background grants, the rest ---------------
  const feats = ddb.feats ?? [];
  const asiFeat = feats.find((feat) => isTagged(feat, DDB_INITIAL_ASI_TAG));
  const asis: AsiChoice[] = [];
  const placements: FeatPlacement[] = [];
  const consumed = new Set<DdbFeat>(asiFeat ? [asiFeat] : []);
  const missingFeats: string[] = [];
  const extraAsis: string[] = [];
  const classMods = activeModifiers(ddb).filter((m) => m.componentTypeId === DDB_CLASS_FEATURE_COMPONENT);
  placedClasses.forEach((cls, ci) => {
    const slots = asiFeatures(cls);
    const allowed = classes[ci] ? Math.min(slots.length, asiSlotCount(classes[ci].level)) : 0;
    slots.forEach((slot, i) => {
      const feat = feats.find(
        (f) => f.componentTypeId === DDB_CLASS_FEATURE_COMPONENT && f.componentId === slot.id,
      );
      if (feat) consumed.add(feat);
      if (i >= allowed) {
        extraAsis.push(feat?.definition?.name ?? `${cls.definition?.name} level ${slot.level} ASI`);
        return;
      }
      if (feat) {
        const name = feat.definition?.name ?? "";
        const entity = resolveNamed(index, "feat", ddbNameVariants(name, "feat"), feat.definition?.sources);
        if (!entity) missingFeats.push(name);
        if (entity) placements.push({ ddb: feat, keyPrefix: `asifeat:${asis.length}` });
        asis.push({ type: "feat", ref: entity ? refOf(entity) : undefined });
        return;
      }
      const increases = sumAbilityBonuses(classMods.filter((m) => m.componentId === slot.id));
      asis.push({ type: "asi", increases });
    });
  });
  if (missingFeats.length) warnings.push(`Feats not found in your content: ${missingFeats.join(", ")}.`);
  if (extraAsis.length) {
    warnings.push(
      `This app gives ASI slots at levels 4/8/12/16/19 only, so these extra class picks weren't placed: ${extraAsis.join(", ")}.`,
    );
  }

  const unresolvedItems: string[] = [];
  const { items, charges } = readInventory(ddb, index, unresolvedItems);
  if (unresolvedItems.length) {
    warnings.push(
      `Kept ${unresolvedItems.length === 1 ? "1 item as a custom item" : `${unresolvedItems.length} items as custom items`} (not in your content): ${unresolvedItems.join(", ")}.`,
    );
  }

  const abilities = ddbAbilities(ddb);
  const totals = Object.fromEntries(ABILITIES.map((a) => [a, abilities[a].total])) as Record<Ability, number>;
  const pb = proficiencyBonus(Math.max(1, classes.reduce((sum, c) => sum + c.level, 0)));
  const currency = emptyCurrency();
  for (const coin of COINS) currency[coin] = ddb.currencies?.[coin] ?? 0;

  let character = normalizeCharacter(
    createCharacter({
      name: ddb.name?.trim() || "Imported Character",
      edition,
      race: species.race,
      subrace: species.subrace,
      background: bgEntity ? refOf(bgEntity) : undefined,
      customBackground,
      classes,
      asis,
      abilityMethod: "manual",
      baseAbilities: Object.fromEntries(ABILITIES.map((a) => [a, abilities[a].base])) as Record<Ability, number>,
      abilityAdjustments: {
        set: {},
        other: Object.fromEntries(ABILITIES.filter((a) => abilities[a].other).map((a) => [a, abilities[a].other])),
        override: Object.fromEntries(
          ABILITIES.filter((a) => abilities[a].override).map((a) => [a, abilities[a].override!]),
        ),
      },
      inventory: items,
      currency,
      // The inventory is what the character carries; no class kit on top.
      equipmentMode: "gold",
      customAttacks: (ddb.customActions ?? [])
        .map((action) => customAttack(action, totals, pb))
        .filter((attack): attack is CustomAttack => Boolean(attack)),
      details: readDetails(ddb),
    }),
  );

  // Background-granted feats are derived from the background; pair each with
  // the DDB feat of the same name so its spell and ability picks carry over.
  for (const resolved of resolveCharacterFeats(character, index)) {
    if (!resolved.keyPrefix.startsWith("bgfeat")) continue;
    const match = feats.find(
      (feat) =>
        !consumed.has(feat) &&
        ddbNameVariants(feat.definition?.name ?? "", "feat").some((v) => looseName(v) === looseName(resolved.feat.name)),
    );
    if (!match) continue;
    consumed.add(match);
    placements.push({ ddb: match, keyPrefix: resolved.keyPrefix });
  }
  const unplacedFeats = feats.filter((feat) => !consumed.has(feat)).map((feat) => feat.definition?.name ?? "");
  if (unplacedFeats.length) {
    warnings.push(
      `${plural(unplacedFeats.length, "feat")} from your species/background ${unplacedFeats.length === 1 ? "isn't" : "aren't"} granted by the imported content: ${unplacedFeats.join(", ")}.`,
    );
  }

  // --- Ability-score choices ----------------------------------------------
  const featMods = (id?: number) => (ddb.modifiers?.feat ?? []).filter((m) => m.componentId === id);
  const abilityChoices: Record<string, Ability[]> = {};
  if (edition === "one") {
    const background = backgroundFor(character, index);
    const wanted = asiFeat ? sumAbilityBonuses(featMods(asiFeat.definition?.id)) : {};
    Object.assign(abilityChoices, dealAbilityChoices(minusFlat(wanted, background), abilityChoiceDefs(background, "primary")));
  } else {
    const race = resolveRace(index, character.race);
    const subrace = resolveSubrace(index, character.subrace);
    const wanted = minusFlat(minusFlat(sumAbilityBonuses(raceModifiers(ddb)), race), subrace);
    Object.assign(
      abilityChoices,
      dealAbilityChoices(wanted, [...abilityChoiceDefs(race, "primary"), ...abilityChoiceDefs(subrace, "subrace")]),
    );
  }
  const featEntities = new Map(resolveCharacterFeats(character, index).map((rf) => [rf.keyPrefix, rf.feat]));
  for (const placement of placements) {
    const feat = featEntities.get(placement.keyPrefix);
    if (!feat) continue;
    const wanted = minusFlat(sumAbilityBonuses(featMods(placement.ddb.definition?.id)), feat);
    Object.assign(abilityChoices, dealAbilityChoices(wanted, abilityChoiceDefs(feat, placement.keyPrefix)));
  }
  character = { ...character, abilityChoices };

  // Whatever the content can't reproduce (magic-item bonuses, homebrew
  // traits) gets pinned so the sheet matches D&D Beyond.
  const derivedAbilities = deriveFromCharacter(character, index).abilities;
  const pinned: string[] = [];
  const override = { ...character.abilityAdjustments.override };
  for (const ability of ABILITIES) {
    if (override[ability] !== undefined || derivedAbilities[ability] === totals[ability]) continue;
    override[ability] = totals[ability];
    const parts = [`base ${abilities[ability].base}`, ...abilities[ability].parts.map((p) => `${p.label} ${formatMod(p.value)}`)];
    pinned.push(
      `${ability.toUpperCase()} ${totals[ability]} (D&D Beyond: ${parts.join(", ")}; this build makes ${derivedAbilities[ability]})`,
    );
  }
  character = { ...character, abilityAdjustments: { ...character.abilityAdjustments, override } };
  if (pinned.length) {
    warnings.push(
      `Pinned with Override Score to match D&D Beyond: ${pinned.join("; ")}. Clear the override on the Abilities page once the content covers it.`,
    );
  }

  // --- Proficiencies -------------------------------------------------------
  const mods = activeModifiers(ddb);
  const skillIds = new Set(SKILLS.map((s) => s.id));
  const skillsOf = (type: string) => [
    ...new Set(
      mods
        .filter((m) => m.type === type && m.subType && skillIds.has(ddbSkillId(m.subType)))
        .map((m) => ddbSkillId(m.subType!)),
    ),
  ];
  const named = (m: DdbModifier) => m.friendlySubtypeName ?? m.subType ?? "";
  character = applyProficiencies(
    character,
    index,
    {
      proficient: skillsOf("proficiency"),
      expertise: skillsOf("expertise"),
      languages: [...new Set(mods.filter((m) => m.type === "language").map(named))],
      tools: [
        ...new Set(
          mods.filter((m) => m.type === "proficiency" && m.entityTypeId === DDB_TOOL_ENTITY_TYPE).map(named),
        ),
      ],
    },
    warnings,
  );

  // --- Optional features (fighting styles, invocations, metamagic…) ------
  const optionalFeatures: Record<string, EntityRef[]> = {};
  const unplacedOptions: string[] = [];
  const defs = optionalFeatureDefsFor(character, index);
  for (const option of ddb.options?.class ?? []) {
    const name = option.definition?.name ?? "";
    const entity = resolveNamed(index, "optionalfeature", [name], option.definition?.sources);
    const types = (entity?.featureType as string[] | undefined) ?? [];
    const def = defs.find(
      (d) => d.featureTypes.some((t) => types.includes(t)) && (optionalFeatures[d.key]?.length ?? 0) < d.count,
    );
    if (entity && def) (optionalFeatures[def.key] ??= []).push(refOf(entity));
    else if (name) unplacedOptions.push(name);
  }
  character = { ...character, optionalFeatures };
  if (unplacedOptions.length) {
    warnings.push(`Class options not placed (no matching pick in your content): ${unplacedOptions.join(", ")}.`);
  }

  // --- Spells --------------------------------------------------------------
  const casters = new Map(allSpellcastersFor(character, index).map((c) => [c.className, c]));
  const cantrips: SpellPick[] = [];
  const spells: SpellPick[] = [];
  const missingSpells: string[] = [];
  const unprepared: string[] = [];
  for (const group of ddb.classSpells ?? []) {
    const ci = placedClasses.findIndex((cls) => cls.id === group.characterClassId);
    const className = classes[ci]?.name;
    if (!className) continue;
    const caster = casters.get(className);
    for (const entry of group.spells ?? []) {
      const name = entry.definition?.name ?? "";
      const level = entry.definition?.level ?? 0;
      // Always-prepared spells come from class/subclass features, which the
      // content grants by itself.
      if (!name || entry.alwaysPrepared) continue;
      if (level > 0 && caster?.limits.spellsLabel === "prepared" && !entry.prepared) {
        unprepared.push(name);
        continue;
      }
      const entity = resolveNamed(index, "spell", [name], entry.definition?.sources);
      if (!entity) {
        missingSpells.push(name);
        continue;
      }
      const pick: SpellPick = { ...refOf(entity), forClass: className };
      if (((entity as unknown as Spell).level ?? level) === 0) cantrips.push(pick);
      else spells.push(pick);
    }
  }
  character = { ...character, cantrips, spells };
  if (unprepared.length) {
    warnings.push(
      `Left out ${plural(unprepared.length, "unprepared spell")} (spellbook entries aren't tracked): ${unprepared.join(", ")}.`,
    );
  }

  // Feat and species grants: DDB records the picks per granting feat/trait.
  const featSpells: Record<string, EntityRef[]> = {};
  const featSpellSets: Record<string, string> = {};
  const unplacedGrantSpells: string[] = [];
  const byFeat = spellsByComponent(ddb.spells?.feat);
  for (const placement of placements) {
    const feat = featEntities.get(placement.keyPrefix);
    const rows = byFeat.get(placement.ddb.definition?.id) ?? [];
    if (!feat || !rows.length) continue;
    const hint = /\(([^)]*)\)\s*$/.exec(placement.ddb.definition?.name ?? "")?.[1];
    const result = placeGrantSpells(index, feat, placement.keyPrefix, rows, hint);
    Object.assign(featSpells, result.featSpells);
    Object.assign(featSpellSets, result.featSpellSets);
    unplacedGrantSpells.push(...result.unplaced);
  }
  const raceSpells = ddb.spells?.race ?? [];
  if (raceSpells.length) {
    let remaining = raceSpells;
    for (const source of speciesSpellSources(character, index)) {
      const result = placeGrantSpells(index, source.entity, source.keyPrefix, remaining);
      Object.assign(featSpells, result.featSpells);
      Object.assign(featSpellSets, result.featSpellSets);
      remaining = remaining.filter((entry) => result.unplaced.includes(entry.definition?.name ?? ""));
    }
    unplacedGrantSpells.push(...remaining.map((entry) => entry.definition?.name ?? ""));
  }
  character = { ...character, featSpells, featSpellSets };
  // Fixed grants (no pick involved) show up on their own; only report picks.
  const grantedNow = new Set(
    [...Object.values(featSpells).flat()].map((ref) => looseName(ref.name)),
  );
  const lostGrants = unplacedGrantSpells.filter((name) => name && !grantedNow.has(looseName(name)));
  if (missingSpells.length) warnings.push(`Spells not found in your content: ${missingSpells.join(", ")}.`);
  if (lostGrants.length) {
    warnings.push(`Feat/species spells without a matching pick in your content: ${lostGrants.join(", ")}.`);
  }

  // --- Extras (companions, familiars) --------------------------------------
  const extras: EntityRef[] = [];
  const missingCreatures: string[] = [];
  for (const creature of ddb.creatures ?? []) {
    const name = creature.definition?.name ?? "";
    const entity = name ? resolveNamed(index, "monster", [name], creature.definition?.sources) : undefined;
    if (entity) extras.push(refOf(entity));
    else if (name) missingCreatures.push(creature.name ? `${creature.name} (${name})` : name);
  }
  character = { ...character, extras };
  if (missingCreatures.length) warnings.push(`Creatures not in your content: ${missingCreatures.join(", ")}.`);

  // --- Hit points ------------------------------------------------------------
  const conMod = abilityMod(totals.con);
  const maxHp = ddbMaxHp(ddb, conMod);
  const hitDice = character.classes
    .map((choice) => ({ faces: resolveClass(index, choice)?.hd?.faces, level: choice.level }))
    .filter((entry): entry is { faces: number; level: number } => entry.faces !== undefined)
    .map((entry) => ({ hitDieFaces: entry.faces, level: entry.level }));
  if (hitDice.length && maxHpMulticlass({ classes: hitDice, conMod, mode: "average" }) !== maxHp) {
    const rolls = fitHpRolls(maxHp, hitDice, conMod);
    if (rolls) character = { ...character, hpMode: "rolled", hpRolls: rolls };
    else warnings.push(`D&D Beyond's max HP (${maxHp}) doesn't fit this build's hit dice — check the HP section.`);
  }

  // --- At-the-table state ------------------------------------------------------
  const usedSlots: number[] = [];
  for (const slot of ddb.spellSlots ?? []) if (slot.level >= 1) usedSlots[slot.level - 1] = slot.used ?? 0;
  character = {
    ...character,
    play: {
      ...character.play,
      damageTaken: Math.max(0, ddb.removedHitPoints ?? 0),
      tempHp: Math.max(0, ddb.temporaryHitPoints ?? 0),
      deathSaves: {
        successes: ddb.deathSaves?.successCount ?? 0,
        failures: ddb.deathSaves?.failCount ?? 0,
      },
      usedSlots: Array.from(usedSlots, (n) => n ?? 0),
      usedPactSlots: (ddb.pactMagic ?? []).reduce((sum, slot) => sum + (slot.used ?? 0), 0),
      usedHitDice: placedClasses.map((cls) => cls.hitDiceUsed ?? 0),
      usedItemCharges: charges,
      inspiration: Boolean(ddb.inspiration),
      conditions: (ddb.conditions ?? [])
        .map((c) => DDB_CONDITIONS[c.id])
        .filter((name): name is string => Boolean(name)),
    },
    variantEncumbrance: ddb.preferences?.encumbranceType === 3,
    updatedAt: Date.now(),
  };

  return { character, warnings };
}

/** Same-origin path the dev/preview server relays to D&D Beyond (see vite.config.ts). */
export const DDB_PROXY_PATH = "/ddb-character";

/** Where a person can download the JSON themselves when the relay isn't there. */
export function ddbJsonUrl(id: string): string {
  return `https://character-service.dndbeyond.com/character/v5/character/${id}`;
}

/**
 * Fetch a public character by sheet link or id. D&D Beyond only allows its own
 * origin to read the API, so the request goes through the app server's relay.
 */
export async function fetchDdbCharacter(input: string, fetchImpl: typeof fetch = fetch): Promise<DdbCharacter> {
  const id = ddbCharacterId(input);
  if (!id) {
    throw new Error("That isn't a D&D Beyond character link — it should look like dndbeyond.com/characters/12345.");
  }
  let response: Response;
  try {
    response = await fetchImpl(`${DDB_PROXY_PATH}/${id}`);
  } catch {
    throw new Error("Couldn't reach D&D Beyond. Check your connection and try again.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Character ${id} is private. In D&D Beyond, open the character's Settings and set Character Privacy to Public, then try again.`,
    );
  }
  if (response.status === 404) throw new Error(`D&D Beyond has no character ${id}.`);
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.includes("json")) {
    throw new Error(
      `Link import needs the app's dev or preview server, which relays the request to D&D Beyond. Instead, open ${ddbJsonUrl(id)}, save the page as a .json file and import that file.`,
    );
  }
  const ddb = asDdbCharacter(await response.json());
  if (!ddb) throw new Error(`D&D Beyond's reply for character ${id} wasn't a character.`);
  return ddb;
}
