/**
 * Language choice definitions from proficiency grants. Fixed grants stay in
 * `readNamedGrants`; the "choose"/"any*" forms become pickable defs here.
 * The standard/exotic lists are the SRD language tables (CC-BY), used when a
 * grant says "any standard language" without naming options.
 */

import type { ProficiencyGrant } from "../data/types/character-content";

export const STANDARD_LANGUAGES = [
  "Common",
  "Dwarvish",
  "Elvish",
  "Giant",
  "Gnomish",
  "Goblin",
  "Halfling",
  "Orc",
];

export const EXOTIC_LANGUAGES = [
  "Abyssal",
  "Celestial",
  "Deep Speech",
  "Draconic",
  "Infernal",
  "Primordial",
  "Sylvan",
  "Undercommon",
];

export interface LanguageChoiceDef {
  /** Storage key for the picks, e.g. `race:lang:0`. */
  key: string;
  /** Granting entity's name, for display. */
  origin: string;
  from: string[];
  count: number;
}

const titleCase = (s: string) => s.replace(/(^|\s)\w/g, (c) => c.toUpperCase());

/** Pickable language grants ("choose from", "any", "anyStandard") as defs. */
export function languageChoiceDefs(
  grants: ProficiencyGrant[] | undefined,
  keyPrefix: string,
  origin: string,
): LanguageChoiceDef[] {
  const defs: LanguageChoiceDef[] = [];
  (grants ?? []).forEach((grant, i) => {
    if (grant.choose?.from?.length) {
      defs.push({
        key: `${keyPrefix}:${i}`,
        origin,
        from: grant.choose.from.map(titleCase),
        count: grant.choose.count ?? 1,
      });
    }
    for (const [key, value] of Object.entries(grant)) {
      if (!key.startsWith("any") || typeof value !== "number" || value <= 0) continue;
      // "anyStandard" offers the standard table; a bare "any" offers both.
      const from =
        key === "anyStandard"
          ? STANDARD_LANGUAGES
          : [...STANDARD_LANGUAGES, ...EXOTIC_LANGUAGES];
      defs.push({ key: `${keyPrefix}:${i}:${key}`, origin, from, count: value });
    }
  });
  return defs;
}
