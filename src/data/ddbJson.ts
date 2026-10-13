/**
 * D&D Beyond's character JSON — what the sheet at dndbeyond.com/characters/<id>
 * loads from `character-service.dndbeyond.com/character/v5/character/<id>`.
 *
 * Unlike the PDF export, the JSON carries the *build*: base ability scores,
 * every grant as a typed modifier (`{type: "proficiency", subType: "arcana"}`),
 * each item's equipped/attuned state, and source-book ids for every entity.
 * What it does not carry is the totals — DDB's sheet derives those client-side —
 * so the two rules the importer needs (ability totals and max HP) are ported
 * here from the character app's rules engine (`generateAbilities` and the
 * `__INITIAL_ASI` race-trait filter in character-app 1.72.8).
 *
 * Only the fields the importer reads are typed, and all of them as optional:
 * the payload is someone else's and changes without notice.
 */

import { ABILITIES, type Ability, type AbilityScores } from "../engine/constants";

export interface DdbSourceRef {
  sourceId: number;
  pageNumber?: number | null;
}

export interface DdbModifier {
  type?: string;
  subType?: string;
  value?: number | null;
  fixedValue?: number | null;
  statId?: number | null;
  componentId?: number;
  componentTypeId?: number;
  entityTypeId?: number | null;
  friendlySubtypeName?: string;
  requiresAttunement?: boolean;
  restriction?: string | null;
}

interface DdbCategory {
  tagName?: string;
}

interface DdbDefinition {
  id?: number;
  name?: string;
  sources?: DdbSourceRef[] | null;
  categories?: DdbCategory[] | null;
}

export interface DdbItemDefinition extends DdbDefinition {
  type?: string | null;
  filterType?: string | null;
  weight?: number | null;
  bundleSize?: number | null;
  canAttune?: boolean;
  isContainer?: boolean;
  damage?: { diceString?: string | null } | null;
  damageType?: string | null;
  /** 1 = melee, 2 = ranged. */
  attackType?: number | null;
  range?: number | null;
  longRange?: number | null;
  /** Weapon category: 1 = simple, 2 = martial, 3 = firearms. */
  categoryId?: number | null;
  properties?: { name?: string }[] | null;
  grantedModifiers?: DdbModifier[] | null;
}

export interface DdbInventoryItem {
  id: number;
  quantity?: number;
  equipped?: boolean;
  isAttuned?: boolean;
  chargesUsed?: number | null;
  containerEntityId?: number | null;
  definition?: DdbItemDefinition | null;
}

export interface DdbCustomItem {
  id: number;
  name?: string;
  weight?: number | null;
  quantity?: number | null;
}

export interface DdbSpellEntry {
  prepared?: boolean;
  alwaysPrepared?: boolean;
  countsAsKnownSpell?: boolean | null;
  componentId?: number;
  componentTypeId?: number;
  definition?: (DdbDefinition & { level?: number }) | null;
}

export interface DdbClassFeature {
  definition?: (DdbDefinition & { requiredLevel?: number }) | null;
}

export interface DdbClass {
  id: number;
  level: number;
  isStartingClass?: boolean;
  hitDiceUsed?: number;
  definition?: (DdbDefinition & { hitDice?: number }) | null;
  subclassDefinition?: DdbDefinition | null;
  classFeatures?: DdbClassFeature[] | null;
}

export interface DdbFeat {
  componentId?: number;
  componentTypeId?: number;
  definition?: DdbDefinition | null;
}

export interface DdbStat {
  id: number;
  value: number | null;
}

export interface DdbAction {
  name?: string;
  abilityModifierStatId?: number | null;
  statId?: number | null;
  isProficient?: boolean;
  fixedToHit?: number | null;
  toHitBonus?: number | null;
  damageBonus?: number | null;
  diceCount?: number | null;
  diceType?: number | null;
  fixedValue?: number | null;
  dice?: { diceString?: string | null; fixedValue?: number | null } | null;
}

export interface DdbOption {
  componentId?: number;
  componentTypeId?: number;
  definition?: DdbDefinition | null;
}

export interface DdbCharacter {
  id: number;
  name?: string;
  stats?: DdbStat[];
  bonusStats?: DdbStat[];
  overrideStats?: DdbStat[];
  race?: {
    fullName?: string;
    baseRaceName?: string;
    baseName?: string;
    subRaceShortName?: string | null;
    isSubRace?: boolean;
    sources?: DdbSourceRef[] | null;
    racialTraits?: { definition?: DdbDefinition | null }[] | null;
  } | null;
  background?: {
    hasCustomBackground?: boolean;
    definition?: DdbDefinition | null;
    customBackground?: { name?: string | null; description?: string | null } | null;
  } | null;
  classes?: DdbClass[];
  feats?: DdbFeat[];
  modifiers?: Record<string, DdbModifier[] | null>;
  options?: Record<string, DdbOption[] | null>;
  inventory?: DdbInventoryItem[];
  customItems?: DdbCustomItem[] | null;
  customActions?: DdbAction[] | null;
  creatures?: { name?: string | null; definition?: DdbDefinition | null }[] | null;
  spells?: Record<string, DdbSpellEntry[] | null>;
  classSpells?: { characterClassId: number; spells?: DdbSpellEntry[] | null }[];
  spellSlots?: { level: number; used?: number }[];
  pactMagic?: { level: number; used?: number }[];
  currencies?: Partial<Record<"cp" | "sp" | "ep" | "gp" | "pp", number>>;
  inspiration?: boolean;
  conditions?: { id: number; level?: number | null }[];
  /** `encumbranceType`: 1 = standard, 2 = none, 3 = variant. */
  preferences?: { encumbranceType?: number } | null;
  baseHitPoints?: number;
  bonusHitPoints?: number | null;
  overrideHitPoints?: number | null;
  removedHitPoints?: number;
  temporaryHitPoints?: number;
  deathSaves?: { failCount?: number | null; successCount?: number | null } | null;
  alignmentId?: number | null;
  lifestyleId?: number | null;
  faith?: string | null;
  hair?: string | null;
  eyes?: string | null;
  skin?: string | null;
  age?: number | string | null;
  height?: string | null;
  weight?: number | string | null;
  gender?: string | null;
  traits?: Partial<Record<"personalityTraits" | "ideals" | "bonds" | "flaws" | "appearance", string | null>> | null;
  notes?: Partial<
    Record<
      "allies" | "personalPossessions" | "otherHoldings" | "organizations" | "enemies" | "backstory" | "otherNotes",
      string | null
    >
  > | null;
}

/** DDB's stat ids, in sheet order. */
export const DDB_STAT_ABILITY: Record<number, Ability> = { 1: "str", 2: "dex", 3: "con", 4: "int", 5: "wis", 6: "cha" };

const ABILITY_SCORE_SUBTYPE: Record<Ability, string> = {
  str: "strength-score",
  dex: "dexterity-score",
  con: "constitution-score",
  int: "intelligence-score",
  wis: "wisdom-score",
  cha: "charisma-score",
};

/** `componentTypeId` of a modifier/feat/choice granted by a class feature. */
export const DDB_CLASS_FEATURE_COMPONENT = 12168134;
/** `entityTypeId` DDB gives tool proficiencies. */
export const DDB_TOOL_ENTITY_TYPE = 2103445194;
/** The category tag DDB puts on a 2024 background's ability-score pseudo-feat and on legacy species' ASI traits. */
export const DDB_INITIAL_ASI_TAG = "__INITIAL_ASI";

/** Rule-data constants (`basicMaxStatScore`, `maxStatScore`, `minStatScore`). */
const BASIC_MAX_STAT = 20;
const MAX_STAT = 30;
const MIN_STAT = 1;

/**
 * DDB source-book ids -> 5eTools source codes, most specific first. Ids come
 * from DDB's rule data; codes from the 5eTools `books.json`/`adventures.json`.
 * Unlisted books fall back to a name-only match.
 */
export const DDB_SOURCE_CODES: Record<number, string[]> = {
  1: ["PHB"], // Basic Rules (2014)
  2: ["PHB"],
  3: ["DMG"],
  4: ["EEPC", "XGE"], // Elemental Evil Player's Companion — 5eTools files its spells under XGE
  5: ["MM"],
  6: ["CoS"],
  8: ["LMoP"],
  9: ["OotA"],
  10: ["PotA"],
  12: ["SKT"],
  13: ["SCAG"],
  15: ["VGM"],
  25: ["ToA"],
  27: ["XGE"],
  28: ["TTP"],
  33: ["MTF"],
  35: ["WDH"],
  36: ["WDMM"],
  38: ["GGR"],
  41: ["DIP"],
  43: ["GoS"],
  44: ["AI"],
  48: ["BGDIA"],
  49: ["ERLW"],
  59: ["EGW"],
  60: ["OGA"],
  61: ["MOT"],
  66: ["IDRotF"],
  67: ["TCE"],
  68: ["CM"],
  69: ["VRGR"],
  79: ["WBtW"],
  80: ["SCC"],
  81: ["FTD"],
  83: ["CRCotN"],
  85: ["MPMM"],
  87: ["JttRC"],
  90: ["AAG", "BAM"], // Spelljammer: Adventures in Space
  94: ["DoSI"],
  95: ["DSotDQ"],
  103: ["KftGV"],
  109: ["BMT"],
  110: ["BGG"], // Bigby Presents: Glory of the Giants
  113: ["PaBTSO"],
  114: ["MPP", "SatO"], // Planescape
  116: ["DoD"],
  123: ["TDCSR"],
  132: ["VEoR"],
  136: ["DitLCoT"],
  137: ["QftIS"],
  145: ["XPHB"], // Player's Handbook (2024)
  146: ["XDMG"],
  147: ["XMM"],
  148: ["XPHB"], // D&D Beyond Basic Rules (2024)
  191: ["EFA"],
  199: ["HotB"],
  205: ["FRHoF"],
  206: ["FRAiF"],
  216: ["NF"],
  217: ["ABH"],
  220: ["LFL"],
  232: ["RHW"],
};

/** 5eTools source codes for an entity's DDB sources, primary source first. */
export function sourceCodes(sources: DdbSourceRef[] | null | undefined): string[] {
  const codes: string[] = [];
  for (const ref of sources ?? []) {
    for (const code of DDB_SOURCE_CODES[ref.sourceId] ?? []) if (!codes.includes(code)) codes.push(code);
  }
  return codes;
}

export const DDB_ALIGNMENTS: Record<number, string> = {
  1: "Lawful Good",
  2: "Neutral Good",
  3: "Chaotic Good",
  4: "Lawful Neutral",
  5: "Neutral",
  6: "Chaotic Neutral",
  7: "Lawful Evil",
  8: "Neutral Evil",
  9: "Chaotic Evil",
  10: "Unaligned",
};

/** DDB condition ids (rule data `conditions`). */
export const DDB_CONDITIONS: Record<number, string> = {
  1: "Blinded",
  2: "Charmed",
  3: "Deafened",
  4: "Exhaustion",
  5: "Frightened",
  6: "Grappled",
  7: "Incapacitated",
  8: "Invisible",
  9: "Paralyzed",
  10: "Petrified",
  11: "Poisoned",
  12: "Prone",
  13: "Restrained",
  14: "Stunned",
  15: "Unconscious",
};

/** DDB weapon category ids -> 5eTools `weaponCategory`. */
export const DDB_WEAPON_CATEGORIES: Record<number, string> = { 1: "simple", 2: "martial", 3: "firearms" };

export const DDB_LIFESTYLES: Record<number, string> = {
  1: "Wretched",
  3: "Squalid",
  4: "Poor",
  5: "Modest",
  6: "Comfortable",
  7: "Wealthy",
  8: "Aristocratic",
};

/**
 * Accept the raw API response (`{success, data}`), the bare character object,
 * or its JSON text. Returns undefined for anything that isn't a DDB character,
 * so callers can fall through to other formats.
 */
export function asDdbCharacter(input: unknown): DdbCharacter | undefined {
  let value = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const candidate = (record.data && typeof record.data === "object" ? record.data : record) as Record<string, unknown>;
  const looksLikeDdb =
    typeof candidate.id === "number" &&
    Array.isArray(candidate.stats) &&
    Array.isArray(candidate.classes) &&
    typeof candidate.modifiers === "object";
  return looksLikeDdb ? (candidate as unknown as DdbCharacter) : undefined;
}

/**
 * The numeric character id from a sheet link ("dndbeyond.com/characters/123",
 * "…/characters/123/builder", "ddb.ac/characters/123/AbCd") or a bare id.
 */
export function ddbCharacterId(input: string): string | undefined {
  const text = input.trim();
  if (/^\d+$/.test(text)) return text;
  return /\/characters\/(\d+)/.exec(text)?.[1];
}

const modValue = (m: DdbModifier): number => m.value ?? m.fixedValue ?? 0;

/** Every modifier from a `modifiers` bucket ("race", "class", "feat", …). */
function bucket(ddb: DdbCharacter, name: string): DdbModifier[] {
  return ddb.modifiers?.[name] ?? [];
}

/**
 * Whether a 2024 background's ability-score pseudo-feat is present — DDB then
 * drops legacy species' ability-score traits (`hack__filterOutAsi`), the
 * 2024 rule that ASIs come from the background instead.
 */
export function hasBackgroundAsi(ddb: DdbCharacter): boolean {
  return (ddb.feats ?? []).some((feat) =>
    (feat.definition?.categories ?? []).some((c) => c.tagName === DDB_INITIAL_ASI_TAG),
  );
}

/** Species modifiers DDB actually applies (ASI traits filtered under 2024 rules). */
export function raceModifiers(ddb: DdbCharacter): DdbModifier[] {
  const mods = bucket(ddb, "race");
  if (!hasBackgroundAsi(ddb)) return mods;
  const filtered = new Set(
    (ddb.race?.racialTraits ?? [])
      .filter((t) => (t.definition?.categories ?? []).some((c) => c.tagName === DDB_INITIAL_ASI_TAG))
      .map((t) => t.definition?.id),
  );
  return mods.filter((m) => !filtered.has(m.componentId));
}

/** Modifiers from equipped items (attunement-only ones need the item attuned). */
export function equipmentModifiers(ddb: DdbCharacter): { item: DdbInventoryItem; modifier: DdbModifier }[] {
  return (ddb.inventory ?? [])
    .filter((item) => item.equipped)
    .flatMap((item) =>
      (item.definition?.grantedModifiers ?? [])
        .filter((m) => !m.requiresAttunement || item.isAttuned)
        .map((modifier) => ({ item, modifier })),
    );
}

/** Every modifier currently in effect, the way DDB's `validGlobalModifiers` gathers them. */
export function activeModifiers(ddb: DdbCharacter): DdbModifier[] {
  return [
    ...raceModifiers(ddb),
    ...bucket(ddb, "class"),
    ...bucket(ddb, "feat"),
    ...bucket(ddb, "background"),
    ...equipmentModifiers(ddb).map((e) => e.modifier),
    ...bucket(ddb, "condition"),
  ];
}

const statValue = (list: DdbStat[] | undefined, id: number): number | null =>
  list?.find((s) => s.id === id)?.value ?? null;

/** One labelled contributor to an ability total, for the import report. */
export interface DdbAbilityPart {
  label: string;
  value: number;
}

export interface DdbAbility {
  total: number;
  base: number;
  /** DDB's "Other Modifier" — added after the 20 cap. */
  other: number;
  /** DDB's "Override Score" (0 means unset). */
  override?: number;
  /** Bonuses that went into the total, by where they came from. */
  parts: DdbAbilityPart[];
}

/**
 * Ability totals exactly as DDB's sheet computes them:
 * base + race + class + misc bonuses, capped at 20 (raised by ability-maximum
 * bonuses), then the Other Modifier, then the highest set-score as a floor,
 * then the Override Score, then stacking bonuses — clamped to 1–30.
 */
export function ddbAbilities(ddb: DdbCharacter): Record<Ability, DdbAbility> {
  const raceName = ddb.race?.fullName ?? "Species";
  const featNames = new Map((ddb.feats ?? []).map((f) => [f.definition?.id, f.definition?.name ?? "Feat"]));
  const className = (componentId?: number): string => {
    const owner = (ddb.classes ?? []).find((cls) =>
      (cls.classFeatures ?? []).some((f) => f.definition?.id === componentId),
    );
    return owner?.definition?.name ?? "Class";
  };
  // DDB sums race, class and "misc" (equipment, feats, background) bonuses;
  // set-score floors come from the misc group only.
  const labelled: { label: string; modifier: DdbModifier; misc: boolean }[] = [
    ...raceModifiers(ddb).map((modifier) => ({ label: raceName, modifier, misc: false })),
    ...bucket(ddb, "class").map((modifier) => ({ label: className(modifier.componentId), modifier, misc: false })),
    ...equipmentModifiers(ddb).map(({ item, modifier }) => ({
      label: item.definition?.name ?? "Item",
      modifier,
      misc: true,
    })),
    ...bucket(ddb, "feat").map((modifier) => ({
      label: featNames.get(modifier.componentId) ?? "Feat",
      modifier,
      misc: true,
    })),
    ...bucket(ddb, "background").map((modifier) => ({
      label: ddb.background?.definition?.name ?? "Background",
      modifier,
      misc: true,
    })),
  ];
  const global = activeModifiers(ddb);

  const out = {} as Record<Ability, DdbAbility>;
  for (const [idText, ability] of Object.entries(DDB_STAT_ABILITY)) {
    const id = Number(idText);
    const subType = ABILITY_SCORE_SUBTYPE[ability];
    const isScore = (m: DdbModifier, type: string) => m.type === type && m.subType === subType;

    const base = statValue(ddb.stats, id) ?? 10;
    const other = statValue(ddb.bonusStats, id) ?? 0;
    const overrideRaw = statValue(ddb.overrideStats, id);
    const override = overrideRaw ? overrideRaw : undefined;

    const parts = labelled
      .filter(({ modifier }) => isScore(modifier, "bonus"))
      .map(({ label, modifier }) => ({ label, value: modValue(modifier) }));
    const bonus = parts.reduce((sum, p) => sum + p.value, 0);
    const setScore = Math.max(
      0,
      ...labelled.filter((e) => e.misc && isScore(e.modifier, "set")).map((e) => modValue(e.modifier)),
    );
    const maxBonus = global
      .filter((m) => m.type === "bonus" && m.subType === "ability-score-maximum" && m.statId === id)
      .reduce((sum, m) => sum + modValue(m), 0);
    const stacking = global.filter((m) => isScore(m, "stacking-bonus")).reduce((sum, m) => sum + modValue(m), 0);

    const cap = BASIC_MAX_STAT + maxBonus;
    let total = Math.min(cap, base + bonus) + other;
    total = Math.min(MAX_STAT, Math.max(total, setScore));
    if (override) total = override;
    if (stacking > 0) total = Math.min(cap, total + stacking);
    total = Math.max(MIN_STAT, Math.min(MAX_STAT, total));

    out[ability] = { total, base, other, override, parts };
  }
  return out;
}

export function ddbAbilityTotals(ddb: DdbCharacter): AbilityScores {
  const abilities = ddbAbilities(ddb);
  return Object.fromEntries(ABILITIES.map((a) => [a, abilities[a].total])) as AbilityScores;
}

/** Total character level across classes. */
export function ddbLevel(ddb: DdbCharacter): number {
  return (ddb.classes ?? []).reduce((sum, cls) => sum + (cls.level ?? 0), 0);
}

/**
 * Max HP as DDB shows it: the override, or the rolled/fixed hit-dice total
 * (`baseHitPoints`, Con excluded) + the manual HP bonus + Con and per-level
 * bonuses (Tough, Dwarven Toughness) for every level + flat HP bonuses.
 */
export function ddbMaxHp(ddb: DdbCharacter, conMod: number): number {
  if (ddb.overrideHitPoints) return ddb.overrideHitPoints;
  const level = ddbLevel(ddb);
  const mods = activeModifiers(ddb);
  const perLevel = mods
    .filter((m) => m.type === "bonus" && m.subType === "hit-points-per-level")
    .reduce((sum, m) => sum + modValue(m), 0);
  const flat = mods
    .filter((m) => m.type === "bonus" && m.subType === "hit-points")
    .reduce((sum, m) => sum + modValue(m), 0);
  return (ddb.baseHitPoints ?? 0) + (ddb.bonusHitPoints ?? 0) + (conMod + perLevel) * level + flat;
}

/** "sleight-of-hand" -> "sleightOfHand" (the app's skill ids). */
export function ddbSkillId(subType: string): string {
  return subType.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
}
