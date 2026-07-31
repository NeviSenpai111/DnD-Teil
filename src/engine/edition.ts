/**
 * Edition-specific rules gating. `classic` = 2014, `one` = 2024.
 *
 * Notable differences the builder cares about:
 *  - 2024 moves ability score increases from race onto the background.
 *  - 2024 renames "Race" to "Species".
 *  - 2024 adds weapon mastery.
 */

import type { Edition } from "../data/types/meta";

/** Which entity provides ability score increases at character creation. */
export function asiSource(edition: Edition): "race" | "background" {
  return edition === "one" ? "background" : "race";
}

/** UI label for the ancestry concept. */
export function speciesLabel(edition: Edition): "Race" | "Species" {
  return edition === "one" ? "Species" : "Race";
}

export function hasWeaponMastery(edition: Edition): boolean {
  return edition === "one";
}
