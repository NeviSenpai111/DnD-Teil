/**
 * Assembles the class/subclass features a character has gained, by level.
 *
 * 5eTools `class.classFeatures` lists features as `Name|ClassName|ClassSource|Level`
 * reference strings, with each referenced `classFeature` stored as its own entity.
 * Rather than rely solely on the (sometimes-irregular) ref strings, we gather the
 * `classFeature` / `subclassFeature` entities that match the class + subclass and
 * fall within the current level — equivalent, and robust to ref formatting.
 */

import type { ImportedEntity } from "./types/content";
import type { ClassData, ClassFeature, Subclass, SubclassFeature } from "./types/class-content";

export interface ParsedFeatureRef {
  name: string;
  className: string;
  classSource?: string;
  level: number;
  subclassShortName?: string;
  subclassSource?: string;
}

/** Parse a class/subclass feature reference string. */
export function parseFeatureRef(ref: string): ParsedFeatureRef | undefined {
  const parts = ref.split("|");
  if (parts.length >= 6) {
    return {
      name: parts[0],
      className: parts[1],
      classSource: parts[2],
      subclassShortName: parts[3],
      subclassSource: parts[4],
      level: Number(parts[5]) || 1,
    };
  }
  if (parts.length >= 4) {
    return { name: parts[0], className: parts[1], classSource: parts[2], level: Number(parts[3]) || 1 };
  }
  return undefined;
}

/** Treat an undefined feature classSource as matching the class's source. */
function sourceMatches(featureSource: string | undefined, classSource: string): boolean {
  return featureSource === undefined || featureSource === classSource;
}

/** All class features gained at or below `level`, ordered by level then name. */
export function resolveClassFeatures(
  entities: ImportedEntity[],
  cls: ClassData,
  level: number,
): ClassFeature[] {
  return entities
    .filter((e) => e.__type === "classFeature")
    .map((e) => e as unknown as ClassFeature)
    .filter(
      (f) =>
        f.className === cls.name && sourceMatches(f.classSource, cls.source) && f.level <= level,
    )
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

/** Subclass features gained at or below `level`. */
export function resolveSubclassFeatures(
  entities: ImportedEntity[],
  cls: ClassData,
  subclass: Subclass,
  level: number,
): SubclassFeature[] {
  return entities
    .filter((e) => e.__type === "subclassFeature")
    .map((e) => e as unknown as SubclassFeature)
    .filter(
      (f) =>
        f.className === cls.name &&
        sourceMatches(f.classSource, cls.source) &&
        (f.subclassShortName === subclass.shortName || f.subclassShortName === subclass.name) &&
        f.level <= level,
    )
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

/** List subclasses available for a class. */
export function listSubclasses(entities: ImportedEntity[], cls: ClassData): Subclass[] {
  return entities
    .filter((e) => e.__type === "subclass")
    .map((e) => e as unknown as Subclass)
    .filter((s) => s.className === cls.name && sourceMatches(s.classSource, cls.source))
    .sort((a, b) => a.name.localeCompare(b.name));
}
