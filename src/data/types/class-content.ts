/**
 * Class-related 5eTools shapes consumed by the builder: the class itself, its
 * subclasses, and the per-level feature objects they reference by name string.
 */

import type { Entry } from "./common";
import type { ProficiencyGrant } from "./character-content";

export interface HitDie {
  number: number;
  faces: number;
}

/** Caster progression keyword from the class entity. */
export type CasterProgression = "full" | "1/2" | "1/3" | "artificer" | "pact";

export interface StartingProficiencies {
  armor?: unknown[];
  weapons?: unknown[];
  tools?: unknown[];
  skills?: ProficiencyGrant[];
}

/** A reference to a classFeature, either a bare ref string or a wrapped object. */
export type ClassFeatureRef = string | { classFeature: string; gainSubclassFeature?: boolean };

/**
 * Declares that a class/subclass picks optional features (fighting styles,
 * invocations, metamagic, …). `progression` gives the cumulative count known
 * at each level — either a 20-entry array or a `{ "level": count }` record.
 */
export interface OptionalFeatureProgression {
  name: string;
  featureType?: string[];
  progression: number[] | Record<string, number>;
}

/** A 5eTools `optionalfeature` entity (partial). */
export interface OptionalFeature {
  name: string;
  source: string;
  featureType?: string[];
  prerequisite?: unknown[];
  entries?: Entry[];
}

export interface ClassData {
  name: string;
  source: string;
  hd?: HitDie;
  /** Saving-throw proficiency abilities, e.g. ["str", "con"]. */
  proficiency?: string[];
  startingProficiencies?: StartingProficiencies;
  startingEquipment?: unknown;
  classFeatures?: ClassFeatureRef[];
  subclassTitle?: string;
  /** Level at which a subclass is chosen (defaults vary; UI falls back to 1). */
  casterProgression?: CasterProgression;
  spellcastingAbility?: string;
  /** Cantrip / known / prepared per-level count tables, when present. */
  cantripProgression?: number[];
  spellsKnownProgression?: number[];
  /** 2024 classes carry an explicit prepared-spell count per level. */
  preparedSpellsProgression?: number[];
  preparedSpells?: string;
  optionalfeatureProgression?: OptionalFeatureProgression[];
  /** Per-level class tables (rage uses, ki points, …); see engine/resources. */
  classTableGroups?: unknown[];
  /** Multiclass ability prerequisites, e.g. `{ requirements: { str: 13 } }`. */
  multiclassing?: { requirements?: MulticlassRequirements };
  entries?: Entry[];
}

/**
 * 5eTools multiclass requirements: flat ability minimums are ANDed, and each
 * `or` group is satisfied by any one of its listed abilities.
 */
export interface MulticlassRequirements {
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  or?: Omit<MulticlassRequirements, "or">[];
}

export interface ClassFeature {
  name: string;
  source: string;
  className: string;
  classSource?: string;
  level: number;
  entries?: Entry[];
}

export interface Subclass {
  name: string;
  shortName?: string;
  source: string;
  className: string;
  classSource?: string;
  subclassFeatures?: ClassFeatureRef[];
  /**
   * Subclass casters (Eldritch Knight, Arcane Trickster, …) carry their
   * spellcasting on the subclass rather than the base class.
   */
  casterProgression?: CasterProgression;
  spellcastingAbility?: string;
  cantripProgression?: number[];
  spellsKnownProgression?: number[];
  preparedSpellsProgression?: number[];
  optionalfeatureProgression?: OptionalFeatureProgression[];
}

export interface SubclassFeature {
  name: string;
  source: string;
  className: string;
  classSource?: string;
  subclassShortName?: string;
  subclassSource?: string;
  level: number;
  entries?: Entry[];
}
