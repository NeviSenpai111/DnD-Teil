/**
 * Parses feat `additionalSpells` grants (Magic Initiate, Fey Touched, …) into
 * fixed spells and pickable choice definitions. The 5eTools shape is deeply
 * nested: an array of option SETS (Magic Initiate has one per class list),
 * each with groups (`known` / `innate` / `prepared` / `expanded`) whose values
 * nest arrays of spell-name strings or `{ choose: "level=0|class=Cleric" }`
 * expressions under `_`, level keys and daily/rest wrappers.
 */

import type { AdditionalSpellSet } from "../data/types/character-content";

export interface FeatSpellPickDef {
  /** Storage key for the picks, e.g. `asifeat:0:spell:1`. */
  key: string;
  /** Feat (and set) the pick belongs to, for display. */
  origin: string;
  count: number;
  /** Exact spell level the pick must have (0 = cantrip). */
  level?: number;
  /** Restrict to a class's spell list. */
  className?: string;
  /** Restrict to school codes (e.g. ["E", "D"]). */
  schools?: string[];
}

export interface FeatSpellGrants {
  /** Names of alternative sets; when 2+, one must be chosen before picking. */
  sets: string[];
  /** Spells granted outright, as `name|source?` refs. */
  fixed: { name: string; source?: string }[];
  picks: FeatSpellPickDef[];
}

type SpellEntry = string | { choose: string; count?: number };

/** Flatten a group's nesting (`_`, level keys, daily/rest wrappers) to entries. */
function collectEntries(group: unknown): SpellEntry[] {
  if (!group || typeof group !== "object") return [];
  const out: SpellEntry[] = [];
  for (const value of Array.isArray(group) ? group : Object.values(group)) {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) out.push(...collectEntries(value));
    else if (value && typeof value === "object") {
      if (typeof (value as { choose?: unknown }).choose === "string") {
        out.push(value as { choose: string; count?: number });
      } else {
        out.push(...collectEntries(value));
      }
    }
  }
  return out;
}

/** Parse a choose expression like "level=1|class=Cleric" or "level=1|school=E;D". */
function parseChooseExpr(expr: string): Pick<FeatSpellPickDef, "level" | "className" | "schools"> {
  const out: Pick<FeatSpellPickDef, "level" | "className" | "schools"> = {};
  for (const part of expr.split("|")) {
    const [k, v] = part.split("=");
    if (!v) continue;
    if (k === "level") {
      // "0" or a list "0;1" — the builder offers up to the highest listed.
      const levels = v.split(";").map(Number).filter((n) => !Number.isNaN(n));
      if (levels.length) out.level = Math.max(...levels);
    } else if (k === "class") {
      out.className = v;
    } else if (k === "school") {
      out.schools = v.split(";");
    }
  }
  return out;
}

/** A fixed spell string may carry a source and 5eTools markers ("#c"). */
function parseFixedSpell(raw: string): { name: string; source?: string } {
  const [namePart, source] = raw.split("|");
  return { name: namePart.split("#")[0].trim(), source: source?.trim() || undefined };
}

const GROUPS = ["known", "innate", "prepared", "expanded"] as const;

/**
 * The spell grants of one feat. `chosenSet` selects among alternative sets
 * (e.g. Magic Initiate's "Cleric Spells"); while unchosen, only `sets` is
 * populated so the UI can ask first.
 */
export function featSpellGrants(
  feat: { name: string; additionalSpells?: AdditionalSpellSet[] },
  keyPrefix: string,
  chosenSet?: string,
): FeatSpellGrants {
  const all = feat.additionalSpells ?? [];
  const sets = all.length > 1 ? all.map((s, i) => s.name ?? `Option ${i + 1}`) : [];
  const active =
    all.length > 1 ? all.find((s, i) => (s.name ?? `Option ${i + 1}`) === chosenSet) : all[0];

  const grants: FeatSpellGrants = { sets, fixed: [], picks: [] };
  if (!active) return grants;

  const origin = active.name ? `${feat.name} (${active.name})` : feat.name;
  let n = 0;
  for (const group of GROUPS) {
    for (const entry of collectEntries(active[group])) {
      if (typeof entry === "string") {
        grants.fixed.push(parseFixedSpell(entry));
      } else {
        grants.picks.push({
          key: `${keyPrefix}:spell:${n}`,
          origin,
          count: entry.count ?? 1,
          ...parseChooseExpr(entry.choose),
        });
        n += 1;
      }
    }
  }
  return grants;
}
