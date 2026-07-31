/**
 * Tool choice definitions from proficiency grants, mirroring languages: fixed
 * grants stay in `readNamedGrants`; "choose"/"any*" forms become pickable defs
 * against the SRD tool tables (CC-BY).
 */

import type { ProficiencyGrant } from "../data/types/character-content";

export const ARTISANS_TOOLS = [
  "Alchemist's Supplies",
  "Brewer's Supplies",
  "Calligrapher's Supplies",
  "Carpenter's Tools",
  "Cartographer's Tools",
  "Cobbler's Tools",
  "Cook's Utensils",
  "Glassblower's Tools",
  "Jeweler's Tools",
  "Leatherworker's Tools",
  "Mason's Tools",
  "Painter's Supplies",
  "Potter's Tools",
  "Smith's Tools",
  "Tinker's Tools",
  "Weaver's Tools",
  "Woodcarver's Tools",
];

export const GAMING_SETS = ["Dice Set", "Playing Card Set"];

export const MUSICAL_INSTRUMENTS = [
  "Bagpipes",
  "Drum",
  "Dulcimer",
  "Flute",
  "Horn",
  "Lute",
  "Lyre",
  "Pan Flute",
  "Shawm",
  "Viol",
];

export const OTHER_TOOLS = [
  "Disguise Kit",
  "Forgery Kit",
  "Herbalism Kit",
  "Navigator's Tools",
  "Poisoner's Kit",
  "Thieves' Tools",
];

export const ALL_TOOLS = [...ARTISANS_TOOLS, ...GAMING_SETS, ...MUSICAL_INSTRUMENTS, ...OTHER_TOOLS];

export interface ToolChoiceDef {
  key: string;
  origin: string;
  from: string[];
  count: number;
}

const titleCase = (s: string) => s.replace(/(^|\s)\w/g, (c) => c.toUpperCase());

/** The option table for an "any*" grant key. */
function tableFor(key: string): string[] {
  if (/artisan/i.test(key)) return ARTISANS_TOOLS;
  if (/gaming/i.test(key)) return GAMING_SETS;
  if (/musical|instrument/i.test(key)) return MUSICAL_INSTRUMENTS;
  return ALL_TOOLS;
}

export function toolChoiceDefs(
  grants: ProficiencyGrant[] | undefined,
  keyPrefix: string,
  origin: string,
): ToolChoiceDef[] {
  const defs: ToolChoiceDef[] = [];
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
      defs.push({ key: `${keyPrefix}:${i}:${key}`, origin, from: tableFor(key), count: value });
    }
  });
  return defs;
}
