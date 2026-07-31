/**
 * Detects alternative "unarmored defense" AC formulas from rules text. 5eTools
 * carries no structured field for them, but the wording is formulaic — "your
 * Armor Class equals 13 + your Dexterity modifier" (class features) or "its
 * base Armor Class becomes 13 + its Dexterity modifier" (Mage-Armor-style
 * spells) — so one pattern covers Barbarian/Monk Unarmored Defense, Draconic
 * Resilience, armor spells and equivalent homebrew.
 */

import type { Entry } from "../data/types/common";
import type { Spell } from "../data/types/spell-content";
import type { UnarmoredFormula } from "./armor";
import type { Ability } from "./constants";

const ABILITY_BY_NAME: Record<string, Ability> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};

/** All plain-text strings of an entries tree, joined. */
export function flattenEntryText(entries: Entry[] | undefined): string {
  const parts: string[] = [];
  const walk = (entry: unknown) => {
    if (typeof entry === "string") parts.push(entry);
    else if (Array.isArray(entry)) entry.forEach(walk);
    else if (entry && typeof entry === "object") {
      walk((entry as { entries?: unknown }).entries);
      walk((entry as { items?: unknown }).items);
    }
  };
  walk(entries);
  return parts.join(" ");
}

const UNARMORED_CONDITION =
  /(aren't|are not|not) wearing (any )?armor|wears no armor|dons armor|isn't wearing armor/i;
const FORMULA =
  /(?:armor class equals|base armor class becomes|base ac becomes) (\d+)((?:\s*\+\s*(?:your|its) \w+ modifier)+)/i;

/** Parse one text into an unarmored AC formula, if it declares one. */
export function acFormulaFromText(name: string, text: string): UnarmoredFormula | undefined {
  if (!UNARMORED_CONDITION.test(text)) return undefined;
  const m = text.match(FORMULA);
  if (!m) return undefined;
  const abilities = [...m[2].matchAll(/(?:your|its) (\w+) modifier/gi)]
    .map((am) => ABILITY_BY_NAME[am[1].toLowerCase()])
    .filter((ab): ab is Ability => ab !== undefined);
  if (abilities.length === 0) return undefined;
  const allowShield = !/shield/i.test(text) || /still gain this benefit/i.test(text);
  return { name, base: Number(m[1]), abilities, allowShield };
}

/**
 * Unarmored AC formulas granted by the given features. Shields are allowed
 * unless the text forbids them without the Barbarian's "still gain this
 * benefit" escape hatch.
 */
export function detectAcFormulas(
  features: { name: string; entries?: Entry[] }[],
): UnarmoredFormula[] {
  const out: UnarmoredFormula[] = [];
  for (const feature of features) {
    const formula = acFormulaFromText(feature.name, flattenEntryText(feature.entries));
    if (formula) out.push(formula);
  }
  return out;
}

/**
 * AC formulas offered by a character's known spells (Mage-Armor style).
 * These are TOGGLES — the spell must be cast — so callers only apply the ones
 * the player has switched on via `play.activeEffects`.
 */
export function detectSpellAcFormulas(spells: Spell[]): UnarmoredFormula[] {
  const out: UnarmoredFormula[] = [];
  for (const spell of spells) {
    const formula = acFormulaFromText(spell.name, flattenEntryText(spell.entries));
    if (formula) out.push(formula);
  }
  return out;
}
