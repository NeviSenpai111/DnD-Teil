/**
 * Checks a character JSON file against the Character model before it reaches
 * the roster. The file is untrusted: a field of the wrong type would be saved
 * and then break the sheet every time the character is shown. Anything that
 * doesn't fit is left out (the default takes its place) and reported.
 */

import { ABILITIES, type Ability, type AbilityScores } from "../engine/constants";
import { COINS, type Coin, type Currency } from "../engine/currency";
import {
  createCharacter,
  emptyDetails,
  normalizeCharacter,
  type AbilityAdjustments,
  type AsiChoice,
  type Character,
  type CharacterDetails,
  type ClassChoice,
  type CustomAttack,
  type CustomItemDef,
  type DeathSaves,
  type EntityRef,
  type InventoryItem,
  type PlayState,
  type SpellPick,
} from "../model/character";

/**
 * Returns the value when it fits, else undefined. Containers note the path of
 * each part they leave out, so every dropped value is reported exactly once.
 */
type Check<T> = (value: unknown, path: string, dropped: string[]) => T | undefined;

/** Keys that would reach the prototype chain when copied onto a new object. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const str: Check<string> = (v) => (typeof v === "string" ? v : undefined);
const num: Check<number> = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const bool: Check<boolean> = (v) => (typeof v === "boolean" ? v : undefined);

function int(min: number, max: number): Check<number> {
  return (v) => (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : undefined);
}

function oneOf<T extends string>(...values: T[]): Check<T> {
  return (v) => (values.includes(v as T) ? (v as T) : undefined);
}

/**
 * A list. Bad items are dropped one by one, unless `aligned` (the index is a
 * pick slot or a level): then empty slots, which JSON writes as null, stay in
 * place, and any other bad item drops the whole list rather than shift it.
 */
function arrayOf<T>(item: Check<T>, { aligned = false } = {}): Check<T[]> {
  return (v, path, dropped) => {
    if (!Array.isArray(v)) return undefined;
    const out: T[] = [];
    for (const [i, el] of v.entries()) {
      if (aligned && (el === null || el === undefined)) {
        out.push(undefined as T);
        continue;
      }
      const checked = item(el, `${path}[${i}]`, dropped);
      if (checked !== undefined) out.push(checked);
      else if (aligned) return undefined;
      else dropped.push(`${path}[${i}]`);
    }
    return out;
  };
}

/** A string-keyed map, optionally limited to `keys`. Bad entries are dropped. */
function recordOf<T>(item: Check<T>, keys?: readonly string[]): Check<Record<string, T>> {
  return (v, path, dropped) => {
    if (!isRecord(v)) return undefined;
    const out: Record<string, T> = {};
    for (const [key, el] of Object.entries(v)) {
      const fits = !UNSAFE_KEYS.has(key) && (!keys || keys.includes(key));
      const checked = fits ? item(el, `${path}.${key}`, dropped) : undefined;
      if (checked !== undefined) out[key] = checked;
      else dropped.push(`${path}.${key}`);
    }
    return out;
  };
}

/**
 * An object with known fields. A bad required field rejects the object; a bad
 * optional one is dropped. Fields the model doesn't have are ignored.
 */
function shape<T extends object>(
  fields: { [K in keyof T]-?: Check<T[K]> },
  optional: readonly (keyof T)[] = [],
): Check<T> {
  return (v, path, dropped) => {
    if (!isRecord(v)) return undefined;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(fields) as (keyof T & string)[]) {
      const isOptional = optional.includes(key);
      if (v[key] === undefined) {
        if (isOptional) continue;
        return undefined;
      }
      const checked = fields[key](v[key], `${path}.${key}`, dropped);
      if (checked !== undefined) out[key] = checked;
      else if (isOptional) dropped.push(`${path}.${key}`);
      else return undefined;
    }
    return out as T;
  };
}

const entityRef = shape<EntityRef>({ name: str, source: str });
const entityRefs = arrayOf(entityRef);
const strings = arrayOf(str);
/** Picks made slot by slot in the builder; unfilled slots are empty. */
const refSlots = arrayOf(entityRef, { aligned: true });
const stringSlots = arrayOf(str, { aligned: true });
const abilityNumbers = recordOf(num, ABILITIES);

const asiIncrease = shape<Extract<AsiChoice, { type: "asi" }>>({ type: oneOf("asi"), increases: abilityNumbers });
const asiFeat = shape<Extract<AsiChoice, { type: "feat" }>>({ type: oneOf("feat"), ref: entityRef }, ["ref"]);
const asiChoice: Check<AsiChoice> = (v, path, dropped) => {
  if (!isRecord(v)) return undefined;
  if (v.type === "asi") return asiIncrease(v, path, dropped);
  if (v.type === "feat") return asiFeat(v, path, dropped);
  return undefined;
};

const customItem = shape<CustomItemDef>(
  { weight: num, dmg1: str, dmgType: str, weaponCategory: str, ranged: bool, finesse: bool, range: str },
  ["weight", "dmg1", "dmgType", "weaponCategory", "ranged", "finesse", "range"],
);

const inventoryItem = shape<InventoryItem>(
  {
    id: str,
    ref: entityRef,
    custom: customItem,
    name: str,
    quantity: num,
    equipped: bool,
    attuned: bool,
    containedIn: str,
  },
  ["id", "ref", "custom", "attuned", "containedIn"],
);

const PLAY_FIELDS: { [K in keyof PlayState]-?: Check<PlayState[K]> } = {
  damageTaken: num,
  tempHp: num,
  usedSlots: arrayOf(num, { aligned: true }),
  usedPactSlots: num,
  usedHitDice: arrayOf(num, { aligned: true }),
  deathSaves: shape<DeathSaves>({ successes: num, failures: num }),
  usedResources: recordOf(num),
  usedItemCharges: recordOf(num),
  activeEffects: strings,
  inspiration: bool,
  conditions: strings,
};

const DETAIL_KEYS = Object.keys(emptyDetails()) as (keyof CharacterDetails)[];

/** Every Character field; the compiler flags a field added to the model but not here. */
const CHARACTER_FIELDS: { [K in keyof Character]-?: Check<Character[K]> } = {
  id: str,
  name: str,
  edition: oneOf("classic", "one"),
  race: entityRef,
  subrace: entityRef,
  background: entityRef,
  customBackground: shape<{ name: string; description: string }>({ name: str, description: str }),
  classes: arrayOf(
    shape<ClassChoice>({ name: str, source: str, level: int(1, 20), subclass: entityRef }, ["subclass"]),
  ),
  abilityMethod: oneOf("point-buy", "standard-array", "roll", "manual"),
  baseAbilities: shape<AbilityScores>(Object.fromEntries(ABILITIES.map((a) => [a, num])) as Record<Ability, Check<number>>),
  // Partial maps: normalizeCharacter fills in what's missing.
  abilityAdjustments: shape<AbilityAdjustments>(
    { set: abilityNumbers, other: abilityNumbers, override: abilityNumbers },
    ["set", "other", "override"],
  ),
  abilityChoices: recordOf(arrayOf(oneOf(...ABILITIES), { aligned: true })),
  skillChoices: recordOf(stringSlots),
  optionalFeatures: recordOf(refSlots),
  expertiseChoices: recordOf(stringSlots),
  languageChoices: recordOf(stringSlots),
  toolChoices: recordOf(stringSlots),
  weaponMasteries: strings,
  hpMode: oneOf("average", "rolled"),
  hpRolls: arrayOf(num, { aligned: true }),
  cantrips: arrayOf(shape<SpellPick>({ name: str, source: str, forClass: str }, ["forClass"])),
  spells: arrayOf(shape<SpellPick>({ name: str, source: str, forClass: str }, ["forClass"])),
  featSpells: recordOf(refSlots),
  featSpellSets: recordOf(str),
  equipmentMode: oneOf("kit", "gold"),
  inventory: arrayOf(inventoryItem),
  gold: num,
  currency: shape<Currency>(Object.fromEntries(COINS.map((c) => [c, num])) as Record<Coin, Check<number>>),
  asis: arrayOf(asiChoice, { aligned: true }),
  customAttacks: arrayOf(shape<CustomAttack>({ name: str, hit: num, damage: str })),
  extras: entityRefs,
  play: shape<PlayState>(PLAY_FIELDS, Object.keys(PLAY_FIELDS) as (keyof PlayState)[]),
  variantEncumbrance: bool,
  details: shape<CharacterDetails>(
    Object.fromEntries(DETAIL_KEYS.map((k) => [k, str])) as Record<keyof CharacterDetails, Check<string>>,
    DETAIL_KEYS,
  ),
  createdAt: num,
  updatedAt: num,
};

/**
 * The character a parsed JSON object describes, keeping only fields that fit
 * the model. `dropped` lists the paths that were left out.
 */
export function sanitizeCharacter(input: Record<string, unknown>): { character: Character; dropped: string[] } {
  const dropped: string[] = [];
  const fields: Partial<Record<keyof Character, unknown>> = {};
  for (const key of Object.keys(CHARACTER_FIELDS) as (keyof Character)[]) {
    if (input[key] === undefined) continue;
    const checked = CHARACTER_FIELDS[key](input[key], key, dropped);
    if (checked !== undefined) fields[key] = checked;
    else dropped.push(key);
  }
  return { character: normalizeCharacter(createCharacter(fields as Partial<Character>)), dropped };
}
