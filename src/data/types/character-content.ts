/**
 * Subset of 5eTools shapes the character builder reads from imported content:
 * race, background, and the proficiency/ability grant structures they share.
 *
 * These are intentionally partial — only fields the builder consumes are typed.
 * Anything else is preserved on the entity (entities are open records).
 */

import type { Entry } from "./common";

/** A flat ability bonus map, e.g. `{ str: 2, dex: 1 }`. */
export type AbilityBonus = Partial<Record<"str" | "dex" | "con" | "int" | "wis" | "cha", number>>;

/**
 * "Choose N of amount X from a set of abilities", or a 2024 `weighted` grant
 * where each listed weight is assigned to a distinct ability (e.g. weights
 * `[2, 1]` = +2 to one ability and +1 to another).
 */
export interface AbilityChoose {
  choose: {
    from?: string[];
    count?: number;
    amount?: number;
    weighted?: { from: string[]; weights: number[] };
  };
}

export type AbilityEntry = AbilityBonus & Partial<AbilityChoose>;

/**
 * 5eTools proficiency grants. Fixed grants are `{ "stealth": true }`; choices
 * are `{ "choose": { "from": [...], "count": n } }`. Modeled loosely as a record.
 */
export interface ProfChoose {
  from: string[];
  count?: number;
}
export interface ProficiencyGrant {
  choose?: ProfChoose;
  /** Fixed grants like `{ "stealth": true }`, or "any N" grants like `{ "any": 2 }`. */
  [skill: string]: boolean | number | ProfChoose | undefined;
}

export interface Speed {
  walk?: number;
  fly?: number;
  swim?: number;
  climb?: number;
  [key: string]: number | boolean | undefined;
}

export interface Race {
  name: string;
  source: string;
  size?: string[];
  speed?: number | Speed;
  ability?: AbilityEntry[];
  skillProficiencies?: ProficiencyGrant[];
  languageProficiencies?: ProficiencyGrant[];
  /** Damage resistances/immunities; string entries only are applied. */
  resist?: unknown[];
  immune?: unknown[];
  /** Darkvision range in feet. */
  darkvision?: number;
  /** Innate/choice spells granted by the species (High-Elf-cantrip style). */
  additionalSpells?: AdditionalSpellSet[];
  entries?: Entry[];
  /** Subraces reference their parent via these fields. */
  raceName?: string;
  raceSource?: string;
}

export interface Background {
  name: string;
  source: string;
  ability?: AbilityEntry[]; // 2024 backgrounds grant ASIs here
  skillProficiencies?: ProficiencyGrant[];
  languageProficiencies?: ProficiencyGrant[];
  toolProficiencies?: ProficiencyGrant[];
  startingEquipment?: unknown;
  /**
   * Feats granted by the background (2024). Either bare `"name|source"` strings
   * or the record form `{ "name|source": true }`.
   */
  feats?: (string | Record<string, boolean>)[];
  entries?: Entry[];
}

/**
 * 5eTools `feat` (partial). A feat may grant ability increases (flat or
 * `choose`), proficiencies, and expertise. Only the fields the builder applies
 * are typed; everything else is preserved on the entity.
 */
export interface Feat {
  name: string;
  source: string;
  /** Prerequisite alternatives; see engine/prerequisites. */
  prerequisite?: unknown[];
  ability?: AbilityEntry[];
  skillProficiencies?: ProficiencyGrant[];
  savingThrowProficiencies?: ProficiencyGrant[];
  languageProficiencies?: ProficiencyGrant[];
  toolProficiencies?: ProficiencyGrant[];
  expertise?: ProficiencyGrant[];
  /** Spells granted/pickable via the feat (Magic Initiate, Fey Touched, …).
   * Parsed by `engine/featSpells.ts`. */
  additionalSpells?: AdditionalSpellSet[];
  /** Mixed "any combination of N skills/tools" grants (Skilled). */
  skillToolLanguageProficiencies?: SkillToolLanguageGrant[];
  entries?: Entry[];
}

export interface SkillToolLanguageGrant {
  choose?: { from: string[]; count?: number }[];
}

/**
 * One option set of a feat's `additionalSpells` (Magic Initiate has one per
 * class list). Group values nest spell names / `{ choose }` expressions under
 * `_`, level keys and daily/rest wrappers, so they stay loosely typed.
 */
export interface AdditionalSpellSet {
  name?: string;
  ability?: unknown;
  known?: unknown;
  innate?: unknown;
  prepared?: unknown;
  expanded?: unknown;
}
