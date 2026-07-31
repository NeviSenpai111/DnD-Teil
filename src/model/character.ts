/**
 * The persisted character = the player's CHOICES. Derived stats are never stored;
 * they are recomputed from these choices plus imported content via the engine.
 */

import type { Edition } from "../data/types/meta";
import { ABILITIES, type Ability, type AbilityScores } from "../engine/constants";
import { emptyCurrency, type Currency } from "../engine/currency";

export interface EntityRef {
  name: string;
  source: string;
}

/**
 * A chosen spell. `forClass` records which class it was picked for so
 * multiclass casters get separate per-class limits; picks saved before
 * multiclassing existed have no tag and count toward the first class.
 */
export interface SpellPick extends EntityRef {
  forClass?: string;
}

export type AbilityMethod = "point-buy" | "standard-array" | "roll" | "manual";

/** Inline definition for an ad-hoc item not in the imported library. */
export interface CustomItemDef {
  weight?: number;
  dmg1?: string;
  dmgType?: string;
}

export interface InventoryItem {
  /** Stable id, used by container references. */
  id?: string;
  /** Reference to imported item content, if it came from the library. */
  ref?: EntityRef;
  /** Inline definition for a custom (user-created) item. */
  custom?: CustomItemDef;
  name: string;
  quantity: number;
  equipped: boolean;
  /** Attuned to this item (only meaningful when the item requires it). */
  attuned?: boolean;
  /** Id of the container inventory entry this item is packed into. */
  containedIn?: string;
}

let itemCounter = 0;
export function newItemId(): string {
  itemCounter += 1;
  return `itm_${Date.now().toString(36)}_${itemCounter.toString(36)}`;
}

/** A manually-defined attack line on the sheet. */
export interface CustomAttack {
  name: string;
  hit: number;
  damage: string;
}

/**
 * Free-text descriptive fields edited on the Background page (D&D-Beyond's
 * "Character Details" / "Physical Characteristics" / "Personal Characteristics"
 * accordions) and shown on the sheet's Background and Notes tabs.
 */
export interface CharacterDetails {
  alignment: string;
  faith: string;
  lifestyle: string;
  hair: string;
  skin: string;
  eyes: string;
  height: string;
  weight: string;
  age: string;
  gender: string;
  personalityTraits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  appearance: string;
  backstory: string;
  notes: string;
}

export function emptyDetails(): CharacterDetails {
  return {
    alignment: "",
    faith: "",
    lifestyle: "",
    hair: "",
    skin: "",
    eyes: "",
    height: "",
    weight: "",
    age: "",
    gender: "",
    personalityTraits: "",
    ideals: "",
    bonds: "",
    flaws: "",
    appearance: "",
    backstory: "",
    notes: "",
  };
}

/**
 * Manual per-ability adjustments from the Score Calculations cards (DDB's
 * Set Score / Other Modifier / Override Score rows). Absent keys mean "unset".
 */
export interface AbilityAdjustments {
  /** Replaces the base score before bonuses. */
  set: Partial<Record<Ability, number>>;
  /** Flat extra added on top of every bonus. */
  other: Partial<Record<Ability, number>>;
  /** Replaces the final total entirely (wins over everything). */
  override: Partial<Record<Ability, number>>;
}

export function emptyAdjustments(): AbilityAdjustments {
  return { set: {}, other: {}, override: {} };
}

/**
 * At-the-table state tracked on the full sheet (not part of the build): damage
 * taken, temporary HP and spent spell slots. A long rest clears all of it.
 * Damage is stored as "taken" rather than "current HP" so leveling up (max HP
 * changes) keeps the wound, not a stale total.
 */
export interface DeathSaves {
  successes: number;
  failures: number;
}

export interface PlayState {
  damageTaken: number;
  tempHp: number;
  /** Spent standard slots per spell level (index 0 = level 1 slots). */
  usedSlots: number[];
  /** Spent pact-magic slots. */
  usedPactSlots: number;
  /** Spent hit dice per class (index matches `classes`). */
  usedHitDice: number[];
  /** Death saving throws while at 0 HP; cleared by healing or a rest. */
  deathSaves: DeathSaves;
  /** Spent class-resource uses (rage, ki, …) keyed by resource name. */
  usedResources: Record<string, number>;
  /** Spent magic-item charges keyed by item name; restored on a long rest. */
  usedItemCharges: Record<string, number>;
  /** Toggled-on effects (Mage-Armor-style spell AC formulas), by name. */
  activeEffects: string[];
}

export function emptyPlayState(): PlayState {
  return {
    damageTaken: 0,
    tempHp: 0,
    usedSlots: [],
    usedPactSlots: 0,
    usedHitDice: [],
    deathSaves: { successes: 0, failures: 0 },
    usedResources: {},
    usedItemCharges: {},
    activeEffects: [],
  };
}

/** A level-up ability score increase, or a feat taken in its place. */
export type AsiChoice =
  | { type: "asi"; increases: Partial<Record<Ability, number>> }
  | { type: "feat"; ref?: EntityRef };

export interface ClassChoice {
  name: string;
  source: string;
  level: number;
  subclass?: EntityRef;
}

export interface Character {
  id: string;
  name: string;
  edition: Edition;
  race?: EntityRef;
  subrace?: EntityRef;
  background?: EntityRef;
  /** A build-your-own background used when no published one is chosen. */
  customBackground?: { name: string; description: string };
  /** Multiclass-ready; Phase 2 leaves this empty. */
  classes: ClassChoice[];
  abilityMethod: AbilityMethod;
  /** Scores before racial/background bonuses. */
  baseAbilities: AbilityScores;
  /** Manual set/other/override adjustments per ability. */
  abilityAdjustments: AbilityAdjustments;
  /** Resolved "choose N abilities" picks, keyed by grant key. */
  abilityChoices: Record<string, Ability[]>;
  /** Resolved "choose N skills" picks, keyed by grant key. */
  skillChoices: Record<string, string[]>;
  /** Chosen optional features (fighting styles, invocations, …), keyed by
   * progression key (`optfeature:<classIndex>:<c|s>:<i>`). */
  optionalFeatures: Record<string, EntityRef[]>;
  /** Expertise skill picks, keyed by the granting feature
   * (`expertise:<classIndex>:<level>`). */
  expertiseChoices: Record<string, string[]>;
  /** Resolved "choose/any N languages" picks, keyed by grant key. */
  languageChoices: Record<string, string[]>;
  /** Resolved "choose/any N tools" picks, keyed by grant key. */
  toolChoices: Record<string, string[]>;
  /** Mastered weapon kinds (item names), for the 2024 Weapon Mastery rule. */
  weaponMasteries: string[];
  /** How HP above level 1 is determined. */
  hpMode: "average" | "rolled";
  /** Manual HP rolls for levels 2..N (index 0 = level 2). */
  hpRolls: number[];
  /** Chosen cantrips (spell level 0). */
  cantrips: SpellPick[];
  /** Chosen leveled spells (known or prepared, depending on class). */
  spells: SpellPick[];
  /** Spell picks from feat grants (Magic Initiate…), keyed by pick def key. */
  featSpells: Record<string, EntityRef[]>;
  /** Chosen option set per spell-granting feat (keyed by feat key prefix). */
  featSpellSets: Record<string, string>;
  /** "kit" = take the class/background starting equipment; "gold" = buy your own. */
  equipmentMode: "kit" | "gold";
  inventory: InventoryItem[];
  /** Legacy single-value purse; migrated into `currency.gp` on load. */
  gold: number;
  currency: Currency;
  /** Ability score increases / feats taken at level-up, in slot order. */
  asis: AsiChoice[];
  /** Manually-defined attack lines shown on the sheet's Actions tab. */
  customAttacks: CustomAttack[];
  /** Companions/familiars: imported monsters attached to the Extras tab. */
  extras: EntityRef[];
  /** HP damage, temp HP and spent spell slots tracked on the sheet. */
  play: PlayState;
  details: CharacterDetails;
  createdAt: number;
  updatedAt: number;
}

export function emptyAbilities(value = 8): AbilityScores {
  return Object.fromEntries(ABILITIES.map((a) => [a, value])) as AbilityScores;
}

let counter = 0;
function newId(): string {
  counter += 1;
  return `char_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function createCharacter(partial: Partial<Character> = {}): Character {
  const now = Date.now();
  return {
    id: newId(),
    name: "New Character",
    edition: "classic",
    classes: [],
    abilityMethod: "point-buy",
    baseAbilities: emptyAbilities(8),
    abilityAdjustments: emptyAdjustments(),
    abilityChoices: {},
    skillChoices: {},
    optionalFeatures: {},
    expertiseChoices: {},
    languageChoices: {},
    toolChoices: {},
    weaponMasteries: [],
    hpMode: "average",
    hpRolls: [],
    cantrips: [],
    spells: [],
    featSpells: {},
    featSpellSets: {},
    equipmentMode: "kit",
    inventory: [],
    gold: 0,
    currency: emptyCurrency(),
    asis: [],
    customAttacks: [],
    extras: [],
    play: emptyPlayState(),
    details: emptyDetails(),
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** Fill fields added after a character was persisted (e.g. `details`). */
export function normalizeCharacter(character: Character): Character {
  return {
    ...character,
    details: { ...emptyDetails(), ...character.details },
    featSpells: character.featSpells ?? {},
    featSpellSets: character.featSpellSets ?? {},
    optionalFeatures: character.optionalFeatures ?? {},
    expertiseChoices: character.expertiseChoices ?? {},
    languageChoices: character.languageChoices ?? {},
    toolChoices: character.toolChoices ?? {},
    weaponMasteries: character.weaponMasteries ?? [],
    customAttacks: character.customAttacks ?? [],
    extras: character.extras ?? [],
    // Pre-currency saves carried a single `gold` value; it becomes gp.
    currency: character.currency ?? { ...emptyCurrency(), gp: character.gold ?? 0 },
    // Container references need stable ids; backfill items saved without one.
    inventory: (character.inventory ?? []).map((it) => (it.id ? it : { ...it, id: newItemId() })),
    abilityAdjustments: { ...emptyAdjustments(), ...character.abilityAdjustments },
    play: { ...emptyPlayState(), ...character.play },
  };
}

/** Total character level across all classes (1 if none chosen yet). */
export function characterLevel(character: Character): number {
  const total = character.classes.reduce((sum, c) => sum + c.level, 0);
  return total > 0 ? total : 1;
}

/** The character's primary (first) class choice, if any. */
export function primaryClass(character: Character): ClassChoice | undefined {
  return character.classes[0];
}
