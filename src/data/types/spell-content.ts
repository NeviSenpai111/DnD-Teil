import type { Entry } from "./common";

export interface SpellClassRef {
  name: string;
  source?: string;
}

/**
 * 5eTools `spell` (partial). Class association can come from `classes.fromClassList`
 * (official) or a simpler `spellLists` array of class names (homebrew-friendly).
 */
export interface Spell {
  name: string;
  source: string;
  /** 0 = cantrip. */
  level: number;
  school?: string;
  time?: unknown[];
  range?: unknown;
  components?: Record<string, unknown>;
  duration?: unknown[];
  classes?: { fromClassList?: SpellClassRef[] };
  spellLists?: string[];
  meta?: { ritual?: boolean };
  entries?: Entry[];
  entriesHigherLevel?: Entry[];
}

/**
 * Whether a spell is castable by the named class.
 *
 * `mapped` is the authoritative class list from the imported `spells/sources.json`
 * reverse-index (real 5eTools data). When present it wins. Otherwise we use the
 * spell's own inline `classes.fromClassList` / `spellLists` (homebrew).
 *
 * A spell with no association info anywhere is open ONLY when the class's spell
 * list is unknown across the whole pool (`classListKnown` false). If any spell
 * names this class, the list is considered defined and info-less spells are
 * excluded — otherwise importing real spell files without `spells/sources.json`
 * floods every class with every spell.
 */
export function spellAvailableToClass(
  spell: Spell,
  className: string,
  mapped?: SpellClassRef[],
  classListKnown = false,
): boolean {
  if (mapped) return mapped.some((c) => c.name === className);
  const fromList = spell.classes?.fromClassList;
  if (fromList?.some((c) => c.name === className)) return true;
  if (spell.spellLists?.includes(className)) return true;
  return !fromList && !spell.spellLists && !classListKnown;
}
