/** Core D&D 5e constants shared across the rules engine and UI. */

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];
export type AbilityScores = Record<Ability, number>;

export const ABILITY_NAMES: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export interface SkillDef {
  id: string;
  name: string;
  ability: Ability;
}

/** The 18 standard skills and their governing ability. */
export const SKILLS: readonly SkillDef[] = [
  { id: "acrobatics", name: "Acrobatics", ability: "dex" },
  { id: "animalHandling", name: "Animal Handling", ability: "wis" },
  { id: "arcana", name: "Arcana", ability: "int" },
  { id: "athletics", name: "Athletics", ability: "str" },
  { id: "deception", name: "Deception", ability: "cha" },
  { id: "history", name: "History", ability: "int" },
  { id: "insight", name: "Insight", ability: "wis" },
  { id: "intimidation", name: "Intimidation", ability: "cha" },
  { id: "investigation", name: "Investigation", ability: "int" },
  { id: "medicine", name: "Medicine", ability: "wis" },
  { id: "nature", name: "Nature", ability: "int" },
  { id: "perception", name: "Perception", ability: "wis" },
  { id: "performance", name: "Performance", ability: "cha" },
  { id: "persuasion", name: "Persuasion", ability: "cha" },
  { id: "religion", name: "Religion", ability: "int" },
  { id: "sleightOfHand", name: "Sleight of Hand", ability: "dex" },
  { id: "stealth", name: "Stealth", ability: "dex" },
  { id: "survival", name: "Survival", ability: "wis" },
] as const;

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(
  SKILLS.map((s) => [s.id, s]),
);

/** Normalize a free-form skill name (e.g. "Animal Handling") to its id. */
export function skillNameToId(name: string): string {
  const key = name.trim().toLowerCase().replace(/\s+/g, "");
  const found = SKILLS.find((s) => s.id.toLowerCase() === key || s.name.toLowerCase() === name.trim().toLowerCase());
  return found?.id ?? key;
}

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

/** Point-buy cost table (D&D 5e): score -> total points spent. */
export const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

export const POINT_BUY_BUDGET = 27;
