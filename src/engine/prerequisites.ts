/**
 * Prerequisite validation for multiclassing and feats. Ability and level
 * requirements are checked; other prerequisite kinds (race, spellcasting,
 * proficiency) are included in the description text but not validated.
 */

import type { MulticlassRequirements } from "../data/types/class-content";
import { ABILITIES, ABILITY_NAMES, type Ability, type AbilityScores } from "./constants";

export interface PrereqCheck {
  met: boolean;
  /** Human-readable requirement, e.g. "Strength 13", when any exists. */
  text?: string;
}

export function multiclassCheck(
  requirements: MulticlassRequirements | undefined,
  abilities: AbilityScores,
): PrereqCheck {
  if (!requirements) return { met: true };
  const parts: string[] = [];
  let met = true;

  for (const ab of ABILITIES) {
    const min = requirements[ab];
    if (typeof min !== "number") continue;
    parts.push(`${ABILITY_NAMES[ab]} ${min}`);
    if (abilities[ab] < min) met = false;
  }
  // Each `or` group is satisfied by ANY of its listed abilities.
  for (const group of requirements.or ?? []) {
    const groupParts: string[] = [];
    let groupMet = false;
    for (const ab of ABILITIES) {
      const min = group[ab];
      if (typeof min !== "number") continue;
      groupParts.push(`${ABILITY_NAMES[ab]} ${min}`);
      if (abilities[ab] >= min) groupMet = true;
    }
    if (groupParts.length > 0) {
      parts.push(groupParts.join(" or "));
      if (!groupMet) met = false;
    }
  }
  return { met, text: parts.join(", ") || undefined };
}

/**
 * A 5eTools feat `prerequisite` is an array of ALTERNATIVES — the feat is
 * legal when any one entry is fully met. Within an entry, `ability` is an
 * array of alternatives itself and `level` is a minimum character level.
 */
export function featPrerequisiteCheck(
  feat: { prerequisite?: unknown[] },
  abilities: AbilityScores,
  characterLevel: number,
): PrereqCheck {
  const entries = feat.prerequisite ?? [];
  if (entries.length === 0) return { met: true };

  const texts: string[] = [];
  let met = false;
  for (const raw of entries) {
    const entry = raw as {
      level?: number | { level?: number };
      ability?: Partial<Record<Ability, number>>[];
    };
    const parts: string[] = [];
    let entryMet = true;

    const level = typeof entry.level === "number" ? entry.level : entry.level?.level;
    if (typeof level === "number") {
      parts.push(`level ${level}`);
      if (characterLevel < level) entryMet = false;
    }
    if (entry.ability?.length) {
      const alts: string[] = [];
      let anyAbility = false;
      for (const alt of entry.ability) {
        for (const ab of ABILITIES) {
          const min = alt[ab];
          if (typeof min !== "number") continue;
          alts.push(`${ABILITY_NAMES[ab]} ${min}`);
          if (abilities[ab] >= min) anyAbility = true;
        }
      }
      if (alts.length > 0) {
        parts.push(alts.join(" or "));
        if (!anyAbility) entryMet = false;
      }
    }
    if (parts.length > 0) texts.push(parts.join(", "));
    if (entryMet) met = true;
  }
  // Entries with only unvalidated kinds (race, spellcasting, …) count as met.
  return { met, text: texts.join("; ") || undefined };
}
