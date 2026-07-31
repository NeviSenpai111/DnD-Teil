/**
 * Pure character derivation: combine the player's choices with resolved race /
 * background data into final ability scores and derived stats. No store access.
 */

import type { Edition } from "../data/types/meta";
import type {
  AbilityBonus,
  AbilityEntry,
  Background,
  Feat,
  ProficiencyGrant,
  Race,
  Speed,
} from "../data/types/character-content";
import type { ClassData } from "../data/types/class-content";
import type { AsiChoice } from "../model/character";
import { ABILITIES, SKILLS, skillNameToId, type Ability, type AbilityScores } from "./constants";
import { asiSource } from "./edition";
import { bestArmorClass, type ArmorPiece, type UnarmoredFormula } from "./armor";
import { maxHpMulticlass } from "./hp";
import {
  applyToValue,
  racePassives,
  resolveTarget,
  type Modifier,
  type ModifierContext,
} from "./modifierEngine";
import { readNamedGrants, readTokenList, type NamedGrants } from "./proficiencies";

/** A feat the character has, paired with the key-prefix its choices store under. */
export interface ResolvedFeat {
  feat: Feat;
  /** Prefix for `abilityChoices` keys, e.g. `asifeat:0` or `bgfeat:0`. */
  keyPrefix: string;
}
import {
  abilityMod,
  initiativeMod,
  passiveScore,
  proficiencyBonus,
  saveMod,
  skillMod,
} from "./modifiers";

/** Levels at which most classes gain an ASI / feat. */
export const STANDARD_ASI_LEVELS = [4, 8, 12, 16, 19];

/** How many ASI/feat slots a character of the given level has. */
export function asiSlotCount(level: number): number {
  return STANDARD_ASI_LEVELS.filter((l) => l <= level).length;
}

/**
 * ASI/feat slots for a (possibly multiclass) character: ASIs come from CLASS
 * levels, not character level — a Wizard 4 / Cleric 3 has one slot, from the
 * wizard. Slots are ordered class-by-class, so slot indices for a later class
 * shift when an earlier class gains a slot.
 */
export function asiSlotsForClasses(classLevels: number[]): number {
  return classLevels.reduce((sum, level) => sum + asiSlotCount(level), 0);
}

/** Sum the ability increases from ASI choices (feats' effects are not parsed). */
export function asiBonusesFromChoices(asis: AsiChoice[]): AbilityBonus {
  const out: AbilityBonus = {};
  for (const choice of asis) {
    if (choice.type !== "asi") continue;
    for (const ab of ABILITIES) {
      const v = choice.increases[ab];
      if (typeof v === "number") out[ab] = (out[ab] ?? 0) + v;
    }
  }
  return out;
}

export interface SkillChoice {
  /** Stable key for storing the player's picks. */
  key: string;
  /** Human label for the choosing entity (e.g. "Acolyte"). */
  origin: string;
  from: string[];
  count: number;
}

export interface SkillGrants {
  fixed: string[];
  choices: SkillChoice[];
}

export interface AbilityChoiceDef {
  key: string;
  origin: string;
  from: Ability[];
  count: number;
  amount: number;
  /**
   * Per-slot increments for a 2024 `weighted` grant (e.g. `[2, 1]`). When set,
   * the player assigns each weight to a distinct ability and `picks[i]` gains
   * `weights[i]`; otherwise every pick gains `amount`.
   */
  weights?: number[];
}

const SIZE_NAMES: Record<string, string> = {
  T: "Tiny",
  S: "Small",
  M: "Medium",
  L: "Large",
  H: "Huge",
  G: "Gargantuan",
};

/** Sum the flat (non-choose) ability bonuses on one entity's `ability` array. */
function flatAbilityBonuses(entries: AbilityEntry[] | undefined): AbilityBonus {
  const out: AbilityBonus = {};
  for (const entry of entries ?? []) {
    for (const ab of ABILITIES) {
      const v = entry[ab];
      if (typeof v === "number") out[ab] = (out[ab] ?? 0) + v;
    }
  }
  return out;
}

const isAbility = (a: string): a is Ability => (ABILITIES as readonly string[]).includes(a);

/** Anything that can carry an `ability` array of grants (race/background/feat). */
type AbilityGranter = { name?: string; ability?: AbilityEntry[] } | undefined;

/**
 * Describe the "choose N abilities" grants on an ASI-source entity. Handles both
 * the uniform `choose` form (count × amount) and the 2024 `weighted` form.
 * `keyPrefix` namespaces the stored picks; choices read/write `abilityChoices`.
 */
export function abilityChoiceDefs(entity: AbilityGranter, keyPrefix: string): AbilityChoiceDef[] {
  const defs: AbilityChoiceDef[] = [];
  (entity?.ability ?? []).forEach((entry, i) => {
    const choose = entry.choose;
    if (!choose) return;
    const origin = entity?.name ?? keyPrefix;
    const key = `${keyPrefix}:ability:${i}`;
    if (choose.weighted) {
      defs.push({
        key,
        origin,
        from: choose.weighted.from.filter(isAbility),
        count: choose.weighted.weights.length,
        amount: 1,
        weights: [...choose.weighted.weights],
      });
    } else if (choose.from) {
      defs.push({
        key,
        origin,
        from: choose.from.filter(isAbility),
        count: choose.count ?? 1,
        amount: choose.amount ?? 1,
      });
    }
  });
  return defs;
}

/** Apply resolved ability picks for a set of defs onto a bonus accumulator. */
function applyAbilityChoiceDefs(
  defs: AbilityChoiceDef[],
  abilityChoices: Record<string, Ability[]>,
  bonuses: AbilityBonus,
) {
  for (const def of defs) {
    (abilityChoices[def.key] ?? []).forEach((ab, i) => {
      if (!ab) return; // unset weighted slot (may serialise to null/undefined)
      const amount = def.weights ? (def.weights[i] ?? 0) : def.amount;
      bonuses[ab] = (bonuses[ab] ?? 0) + amount;
    });
  }
}

/** One contributor to the final ability scores, labelled for display. */
export interface AbilityBonusSource {
  source: string;
  bonuses: AbilityBonus;
}

const hasAnyBonus = (b: AbilityBonus) => ABILITIES.some((ab) => (b[ab] ?? 0) !== 0);

/**
 * Every ability-bonus contributor, labelled by where it came from — the itemised
 * view behind `gatherAbilityBonuses` (used by the Score Calculations panel).
 * In `classic` flat bonuses come from race (+ subrace); in `one` from the
 * background. Choice picks and feats are listed under their granting entity.
 */
export function gatherAbilityBonusSources(input: {
  edition: Edition;
  race?: Race;
  subrace?: Race;
  background?: Background;
  feats?: ResolvedFeat[];
  abilityChoices: Record<string, Ability[]>;
}): AbilityBonusSource[] {
  const sources: AbilityBonusSource[] = [];
  const push = (source: string, bonuses: AbilityBonus) => {
    if (hasAnyBonus(bonuses)) sources.push({ source, bonuses });
  };

  if (asiSource(input.edition) === "race") {
    push(input.race?.name ?? "Race", flatAbilityBonuses(input.race?.ability));
    push(input.subrace?.name ?? "Subrace", flatAbilityBonuses(input.subrace?.ability));
  } else {
    push(input.background?.name ?? "Background", flatAbilityBonuses(input.background?.ability));
  }

  // Resolved "choose" picks from whichever entities offered them.
  const choiceDefs = [
    ...abilityChoiceDefs(input.edition === "one" ? input.background : input.race, "primary"),
    ...(input.edition === "one" ? [] : abilityChoiceDefs(input.subrace, "subrace")),
  ];
  for (const def of choiceDefs) {
    const bonuses: AbilityBonus = {};
    applyAbilityChoiceDefs([def], input.abilityChoices, bonuses);
    push(`${def.origin} (choice)`, bonuses);
  }

  // Feats (taken at level-up or granted by a 2024 background) add their own flat
  // increases plus any resolved "choose" picks.
  for (const { feat, keyPrefix } of input.feats ?? []) {
    const bonuses = flatAbilityBonuses(feat.ability);
    applyAbilityChoiceDefs(abilityChoiceDefs(feat, keyPrefix), input.abilityChoices, bonuses);
    push(feat.name, bonuses);
  }
  return sources;
}

/**
 * Gather all ability bonuses to apply — the sum of every labelled source from
 * `gatherAbilityBonusSources`.
 */
export function gatherAbilityBonuses(
  input: Parameters<typeof gatherAbilityBonusSources>[0],
): AbilityBonus {
  const bonuses: AbilityBonus = {};
  for (const { bonuses: b } of gatherAbilityBonusSources(input)) {
    for (const ab of ABILITIES) if (b[ab]) bonuses[ab] = (bonuses[ab] ?? 0) + b[ab]!;
  }
  return bonuses;
}

export function applyAbilityBonuses(base: AbilityScores, bonuses: AbilityBonus): AbilityScores {
  const out = { ...base };
  for (const ab of ABILITIES) out[ab] = base[ab] + (bonuses[ab] ?? 0);
  return out;
}

/** Read fixed skills + skill choices ("choose from" AND "any N") from a
 * proficiency grant array. */
function readSkillGrant(
  grants: ProficiencyGrant[] | undefined,
  originLabel: string,
  origin: string,
  fixed: Set<string>,
  choices: SkillChoice[],
) {
  (grants ?? []).forEach((grant, i) => {
    for (const [key, value] of Object.entries(grant)) {
      if (key === "choose") continue;
      if (value === true && !key.startsWith("any")) fixed.add(skillNameToId(key));
      // `{ "any": N }` — choose N skills with no restriction (e.g. Skilled).
      if (key === "any" && typeof value === "number" && value > 0) {
        choices.push({
          key: `${originLabel}:skill:any:${i}`,
          origin,
          from: SKILLS.map((s) => s.id),
          count: value,
        });
      }
    }
    if (grant.choose) {
      choices.push({
        key: `${originLabel}:skill:${i}`,
        origin,
        from: grant.choose.from.map(skillNameToId),
        count: grant.choose.count ?? 1,
      });
    }
  });
}

/** Collect skill proficiency grants from race (+subrace), background, class and feats. */
export function gatherSkillGrants(input: {
  race?: Race;
  subrace?: Race;
  background?: Background;
  class?: ClassData;
  feats?: ResolvedFeat[];
}): SkillGrants {
  const fixed = new Set<string>();
  const choices: SkillChoice[] = [];
  readSkillGrant(input.race?.skillProficiencies, "race", input.race?.name ?? "Race", fixed, choices);
  readSkillGrant(
    input.subrace?.skillProficiencies,
    "subrace",
    input.subrace?.name ?? "Subrace",
    fixed,
    choices,
  );
  readSkillGrant(
    input.background?.skillProficiencies,
    "background",
    input.background?.name ?? "Background",
    fixed,
    choices,
  );
  readSkillGrant(
    input.class?.startingProficiencies?.skills,
    "class",
    input.class?.name ?? "Class",
    fixed,
    choices,
  );
  // Feats: fixed skills apply automatically; "choose"/"any N" grants become
  // pickable groups keyed under the feat's choice prefix (asifeat:i / bgfeat:i).
  for (const { feat, keyPrefix } of input.feats ?? []) {
    readSkillGrant(feat.skillProficiencies, `feat:${keyPrefix}`, feat.name, fixed, choices);
    // Skilled-style mixed grants: "any combination of N skills or tools". Tools
    // aren't pickable in the builder, so the picks are offered as skills.
    (feat.skillToolLanguageProficiencies ?? []).forEach((grant, i) => {
      (grant.choose ?? []).forEach((choose, j) => {
        if (!choose.from.includes("anySkill")) return;
        choices.push({
          key: `feat:${keyPrefix}:skill:stl:${i}:${j}`,
          origin: feat.name,
          from: SKILLS.map((s) => s.id),
          count: choose.count ?? 1,
        });
      });
    });
  }
  return { fixed: [...fixed], choices };
}

export interface ProficiencySummary {
  tools: NamedGrants;
  languages: NamedGrants;
  armor: string[];
  weapons: string[];
}

/** Merge two NamedGrants, deduping fixed names and notes. */
function mergeNamed(a: NamedGrants, b: NamedGrants): NamedGrants {
  return {
    fixed: [...new Set([...a.fixed, ...b.fixed])],
    notes: [...new Set([...a.notes, ...b.notes])],
  };
}

/** Tool / language / armor / weapon proficiencies from race, background, class and feats. */
export function gatherProficiencies(input: {
  race?: Race;
  subrace?: Race;
  background?: Background;
  class?: ClassData;
  feats?: ResolvedFeat[];
}): ProficiencySummary {
  const featGrants = input.feats?.map((f) => f.feat) ?? [];
  const tools = [
    readNamedGrants(input.background?.toolProficiencies),
    readNamedGrants(input.class?.startingProficiencies?.tools as ProficiencyGrant[] | undefined),
    ...featGrants.map((f) => readNamedGrants(f.toolProficiencies)),
  ].reduce(mergeNamed, { fixed: [], notes: [] });
  const languages = [
    readNamedGrants(input.race?.languageProficiencies),
    readNamedGrants(input.subrace?.languageProficiencies),
    readNamedGrants(input.background?.languageProficiencies),
    ...featGrants.map((f) => readNamedGrants(f.languageProficiencies)),
  ].reduce(mergeNamed, { fixed: [], notes: [] });
  return {
    tools,
    languages,
    armor: readTokenList(input.class?.startingProficiencies?.armor),
    weapons: readTokenList(input.class?.startingProficiencies?.weapons),
  };
}

/** Fixed expertise skill ids granted by the character's feats. */
export function gatherFeatExpertise(feats: ResolvedFeat[] | undefined): string[] {
  const out = new Set<string>();
  for (const { feat } of feats ?? []) {
    for (const grant of feat.expertise ?? []) {
      for (const [key, value] of Object.entries(grant)) {
        if (!key.startsWith("any") && value === true) out.add(skillNameToId(key));
      }
    }
  }
  return [...out];
}

/** Extra saving-throw proficiency abilities granted (fixed) by the feats. */
export function gatherFeatSaves(feats: ResolvedFeat[] | undefined): Ability[] {
  const out = new Set<Ability>();
  for (const { feat } of feats ?? []) {
    for (const grant of feat.savingThrowProficiencies ?? []) {
      for (const [key, value] of Object.entries(grant)) {
        if (value === true && isAbility(key)) out.add(key);
      }
    }
  }
  return [...out];
}

/** Resolve the full set of proficient skills (fixed + player picks, deduped). */
export function resolveProficientSkills(
  grants: SkillGrants,
  skillChoices: Record<string, string[]>,
): string[] {
  const set = new Set(grants.fixed);
  for (const choice of grants.choices) {
    for (const id of skillChoices[choice.key] ?? []) set.add(id);
  }
  return [...set];
}

function normalizeSpeed(speed: number | Speed | undefined): number {
  if (typeof speed === "number") return speed;
  if (speed && typeof speed.walk === "number") return speed.walk;
  return 30;
}

export interface DeriveInput {
  edition: Edition;
  level: number;
  baseAbilities: AbilityScores;
  race?: Race;
  subrace?: Race;
  background?: Background;
  /** The first (primary) class: saves, skills and proficiencies come from it. */
  class?: ClassData;
  /**
   * All classes with their levels, in pick order (multiclass). When present it
   * drives HP and hit dice; `class` should be `classes[0].data`.
   */
  classes?: { data: ClassData; level: number }[];
  /** Feats taken at level-up or granted by a 2024 background. */
  feats?: ResolvedFeat[];
  abilityChoices: Record<string, Ability[]>;
  skillChoices: Record<string, string[]>;
  /** Extra saving-throw proficiencies beyond the class's own. */
  saveProficiencies?: Ability[];
  expertise?: string[];
  hpMode?: "average" | "rolled";
  hpRolls?: number[];
  /** Ability increases from level-up ASIs. */
  asiBonuses?: AbilityBonus;
  /** Manual per-ability adjustments: set replaces the base score, other adds
   * flat, override replaces the final total. */
  adjustments?: {
    set?: Partial<Record<Ability, number>>;
    other?: Partial<Record<Ability, number>>;
    override?: Partial<Record<Ability, number>>;
  };
  /** Equipped armor (for AC); unarmored if absent. */
  equippedArmor?: ArmorPiece;
  shield?: boolean;
  acBonus?: number;
  /** Typed modifiers from equipped items / features (modifier engine). */
  modifiers?: Modifier[];
  /** Alternative unarmored AC formulas (Unarmored Defense, …); best wins. */
  acFormulas?: UnarmoredFormula[];
  /** Languages picked from "choose/any N" grants (added to the summary). */
  extraLanguages?: string[];
  /** Tools picked from "choose/any N" grants (added to the summary). */
  extraTools?: string[];
}

export interface DerivedStat {
  mod: number;
  proficient: boolean;
}

export interface DerivedSkill extends DerivedStat {
  ability: Ability;
  expertise: boolean;
}

export interface DerivedCharacter {
  level: number;
  pb: number;
  abilities: AbilityScores;
  bonuses: AbilityBonus;
  mods: Record<Ability, number>;
  saves: Record<Ability, DerivedStat>;
  skills: Record<string, DerivedSkill>;
  ac: number;
  initiative: number;
  passivePerception: number;
  speed: number;
  size?: string;
  proficientSkillIds: string[];
  /** Tool / language / armor / weapon proficiencies for display. */
  proficiencies: ProficiencySummary;
  /** Damage resistances / immunities and senses from species traits. */
  resistances: string[];
  immunities: string[];
  senses: string[];
  /** Max HP, present only once a class with a hit die is chosen. */
  maxHp?: number;
  hitDie?: string;
}

/** Map class `proficiency` ability abbreviations to valid Ability ids. */
function classSaveProficiencies(cls?: ClassData): Ability[] {
  return (cls?.proficiency ?? []).filter((a): a is Ability =>
    (ABILITIES as readonly string[]).includes(a),
  );
}

/** The headline computation: choices + content -> a full derived sheet. */
export function deriveCharacter(input: DeriveInput): DerivedCharacter {
  const pb = proficiencyBonus(input.level);
  const bonuses = gatherAbilityBonuses(input);
  for (const ab of ABILITIES) {
    if (input.asiBonuses?.[ab]) bonuses[ab] = (bonuses[ab] ?? 0) + input.asiBonuses[ab]!;
  }

  const mods_ = input.modifiers ?? [];
  const modCtx: ModifierContext = { armored: !!input.equippedArmor, shield: !!input.shield };

  // Manual adjustments: "set" replaces the base score, "other" adds flat, and
  // "override" replaces the computed total outright. Engine modifiers (item
  // set-scores / bonuses) apply after "other"; a manual override still wins.
  const adj = input.adjustments;
  const base = { ...input.baseAbilities };
  for (const ab of ABILITIES) {
    if (adj?.set?.[ab] !== undefined) base[ab] = adj.set[ab]!;
  }
  const abilities = applyAbilityBonuses(base, bonuses);
  for (const ab of ABILITIES) {
    if (adj?.other?.[ab] !== undefined) abilities[ab] += adj.other[ab]!;
    abilities[ab] = applyToValue(abilities[ab], mods_, ab, modCtx);
    if (adj?.override?.[ab] !== undefined) abilities[ab] = adj.override[ab]!;
  }

  const mods = Object.fromEntries(
    ABILITIES.map((ab) => [ab, abilityMod(abilities[ab])]),
  ) as Record<Ability, number>;

  const saveProfs = new Set<Ability>([
    ...(input.saveProficiencies ?? []),
    ...gatherFeatSaves(input.feats),
    ...classSaveProficiencies(input.class),
  ]);
  const saves = Object.fromEntries(
    ABILITIES.map((ab) => [
      ab,
      { mod: saveMod(abilities[ab], { proficient: saveProfs.has(ab), pb }), proficient: saveProfs.has(ab) },
    ]),
  ) as Record<Ability, DerivedStat>;

  const grants = gatherSkillGrants(input);
  const proficientSkillIds = resolveProficientSkills(grants, input.skillChoices);
  const profSet = new Set(proficientSkillIds);
  const expertiseSet = new Set([...(input.expertise ?? []), ...gatherFeatExpertise(input.feats)]);

  const skills: Record<string, DerivedSkill> = {};
  for (const skill of SKILLS) {
    const proficient = profSet.has(skill.id);
    const expertise = expertiseSet.has(skill.id);
    skills[skill.id] = {
      ability: skill.ability,
      proficient,
      expertise,
      mod: skillMod(abilities[skill.ability], { proficient, expertise, pb }),
    };
  }

  // HP + hit dice: from the classes list when present (multiclass), else the
  // single primary class.
  const hpClasses = (
    input.classes?.length
      ? input.classes.map((c) => ({ faces: c.data.hd?.faces, level: c.level }))
      : input.class?.hd
        ? [{ faces: input.class.hd.faces, level: input.level }]
        : []
  ).filter((c): c is { faces: number; level: number } => c.faces !== undefined);
  const hp = hpClasses.length
    ? maxHpMulticlass({
        classes: hpClasses.map((c) => ({ hitDieFaces: c.faces, level: c.level })),
        conMod: mods.con,
        mode: input.hpMode ?? "average",
        rolls: input.hpRolls,
      })
    : undefined;
  const hitDie = hpClasses.length
    ? hpClasses.map((c) => `${c.level}d${c.faces}`).join(" + ")
    : undefined;

  // Language/tool picks from "choose/any N" grants join the fixed summary.
  const gathered = gatherProficiencies(input);
  const proficiencies: ProficiencySummary = {
    ...gathered,
    languages: {
      ...gathered.languages,
      fixed: [...new Set([...gathered.languages.fixed, ...(input.extraLanguages ?? [])])],
    },
    tools: {
      ...gathered.tools,
      fixed: [...new Set([...gathered.tools.fixed, ...(input.extraTools ?? [])])],
    },
  };

  return {
    level: input.level,
    pb,
    abilities,
    bonuses,
    mods,
    saves,
    skills,
    ac: bestArmorClass({
      mods,
      armor: input.equippedArmor,
      shield: input.shield,
      bonus: (input.acBonus ?? 0) + resolveTarget(mods_, "ac", modCtx).bonus,
      unarmored: input.acFormulas,
    }),
    initiative: initiativeMod(abilities.dex) + resolveTarget(mods_, "initiative", modCtx).bonus,
    passivePerception: passiveScore(skills.perception.mod),
    speed: applyToValue(
      normalizeSpeed(input.race?.speed ?? input.subrace?.speed),
      mods_,
      "speed",
      modCtx,
    ),
    size: input.race?.size?.[0] ? (SIZE_NAMES[input.race.size[0]] ?? input.race.size[0]) : undefined,
    proficientSkillIds,
    proficiencies,
    ...racePassives([input.race, input.subrace]),
    maxHp: hp,
    hitDie,
  };
}
