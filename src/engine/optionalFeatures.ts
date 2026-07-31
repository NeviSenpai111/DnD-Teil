/**
 * Choice-driven class features (DDB's "choice prompts"): a class or subclass
 * declares `optionalfeatureProgression` — how many optional features (fighting
 * styles, invocations, metamagic, maneuvers, …) of the given featureTypes are
 * known at each level — and the player picks from the imported
 * `optionalfeature` pool.
 */

import type { ImportedEntity } from "../data/types/content";
import type {
  ClassData,
  OptionalFeature,
  OptionalFeatureProgression,
  Subclass,
} from "../data/types/class-content";

type Progression = OptionalFeatureProgression["progression"];

/**
 * How many features are known at `level`. Counts are cumulative totals (like
 * invocations known). Arrays index by level−1; records map "level" → count,
 * where the value at the highest threshold at or below `level` applies.
 */
export function optionalFeatureCount(progression: Progression, level: number): number {
  if (Array.isArray(progression)) {
    return progression[Math.min(level, progression.length) - 1] ?? 0;
  }
  let bestLevel = 0;
  let count = 0;
  for (const [key, value] of Object.entries(progression)) {
    const l = Number(key);
    if (l >= 1 && l <= level && l >= bestLevel && typeof value === "number") {
      bestLevel = l;
      count = value;
    }
  }
  return count;
}

/** The first level at which the progression grants at least one pick. */
function firstLevel(progression: Progression): number {
  if (Array.isArray(progression)) {
    const i = progression.findIndex((c) => c > 0);
    return i >= 0 ? i + 1 : 1;
  }
  const levels = Object.entries(progression)
    .filter(([, count]) => typeof count === "number" && count > 0)
    .map(([key]) => Number(key))
    .filter((l) => l >= 1);
  return levels.length ? Math.min(...levels) : 1;
}

export interface OptionalFeatureDef {
  /** Storage key for the picks, e.g. `optfeature:0:c:0`. */
  key: string;
  /** Progression name, e.g. "Fighting Style", "Eldritch Invocations". */
  label: string;
  featureTypes: string[];
  /** Picks available at the current class level. */
  count: number;
  /** Level at which the first pick unlocks (for accordion placement). */
  level: number;
}

/**
 * Active optional-feature choice definitions for one class section: the class's
 * own progressions plus its subclass's, keyed by class index so multiclass
 * picks stay separate.
 */
export function optionalFeatureDefs(input: {
  cls?: ClassData;
  subclass?: Subclass;
  classIndex: number;
  level: number;
}): OptionalFeatureDef[] {
  const out: OptionalFeatureDef[] = [];
  const read = (progressions: OptionalFeatureProgression[] | undefined, scope: "c" | "s") => {
    (progressions ?? []).forEach((p, i) => {
      const count = optionalFeatureCount(p.progression, input.level);
      if (count <= 0) return;
      out.push({
        key: `optfeature:${input.classIndex}:${scope}:${i}`,
        label: p.name,
        featureTypes: p.featureType ?? [],
        count,
        level: firstLevel(p.progression),
      });
    });
  };
  read(input.cls?.optionalfeatureProgression, "c");
  read(input.subclass?.optionalfeatureProgression, "s");
  return out;
}

/**
 * Human names for the 5eTools `featureType` codes (suffixes like "FS:F" narrow
 * the class, so the prefix carries the meaning). Shown so a bare code like
 * "AI" is legible, and used to tell the user what file to import.
 */
const FEATURE_TYPE_NAMES: Record<string, string> = {
  AF: "Alchemical Formula",
  AI: "Artificer Infusion",
  AS: "Arcane Shot",
  ED: "Elemental Discipline",
  EI: "Eldritch Invocation",
  FS: "Fighting Style",
  MM: "Metamagic",
  MV: "Maneuver",
  PB: "Pact Boon",
  RN: "Rune",
  OTH: "Other",
};

export function featureTypeLabel(code: string): string {
  return FEATURE_TYPE_NAMES[code.split(":")[0]] ?? code;
}

const byName = (a: OptionalFeature, b: OptionalFeature) => a.name.localeCompare(b.name);

/** Imported optional features matching any of the def's featureTypes. */
export function optionalFeatureOptions(
  entities: ImportedEntity[],
  def: OptionalFeatureDef,
): OptionalFeature[] {
  return entities
    .filter((e) => e.__type === "optionalfeature")
    .map((e) => e as unknown as OptionalFeature)
    .filter((f) => (f.featureType ?? []).some((t) => def.featureTypes.includes(t)))
    .sort(byName);
}

/**
 * Minimum level from a feature's prerequisites. 5eTools uses both `{ level: 5 }`
 * and `{ level: { level: 5, class: {…} } }` forms; other prerequisite kinds
 * (pact, spell, …) are displayed as text elsewhere, not validated.
 */
export function levelPrerequisite(feature: OptionalFeature): number | undefined {
  for (const p of feature.prerequisite ?? []) {
    const level = (p as { level?: number | { level?: number } }).level;
    if (typeof level === "number") return level;
    if (level && typeof level.level === "number") return level.level;
  }
  return undefined;
}
