/**
 * Detects alternative "unarmored defense" AC formulas from class/subclass
 * feature text. 5eTools carries no structured field for them, but the wording
 * is formulaic — "your Armor Class equals 13 + your Dexterity modifier" — so a
 * single pattern covers Barbarian/Monk Unarmored Defense, Draconic Resilience
 * and equivalent homebrew.
 */

import type { Entry } from "../data/types/common";
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
function flattenText(entries: Entry[] | undefined): string {
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

/**
 * Unarmored AC formulas granted by the given features. A formula is detected
 * when the text conditions on not wearing armor and states "Armor Class
 * equals N + your X modifier [+ your Y modifier]". Shields are allowed unless
 * the text forbids them without the Barbarian's "still gain this benefit"
 * escape hatch.
 */
export function detectAcFormulas(
  features: { name: string; entries?: Entry[] }[],
): UnarmoredFormula[] {
  const out: UnarmoredFormula[] = [];
  for (const feature of features) {
    const text = flattenText(feature.entries);
    if (!/(aren't|are not|not) wearing (any )?armor/i.test(text)) continue;
    const m = text.match(/armor class equals (\d+)((?:\s*\+\s*your \w+ modifier)+)/i);
    if (!m) continue;
    const abilities = [...m[2].matchAll(/your (\w+) modifier/gi)]
      .map((am) => ABILITY_BY_NAME[am[1].toLowerCase()])
      .filter((ab): ab is Ability => ab !== undefined);
    if (abilities.length === 0) continue;
    const allowShield = !/shield/i.test(text) || /still gain this benefit/i.test(text);
    out.push({ name: feature.name, base: Number(m[1]), abilities, allowShield });
  }
  return out;
}
