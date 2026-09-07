/**
 * Assembles the class/subclass features a character has gained, by level.
 *
 * 5eTools `class.classFeatures` lists features as `Name|ClassName|ClassSource|Level[|Source]`
 * reference strings (subclasses use `Name|Class|ClassSource|SubShort|SubSource|Level[|Source]`),
 * with each referenced `classFeature` / `subclassFeature` stored as its own
 * entity. We resolve both ways and take the union:
 *
 *  - by reference: exact identity lookups of the class's ref list. This is the
 *    only way to reach features that live under a *different* class source —
 *    e.g. a 2014 subclass offered under the 2024 class copies the 2014
 *    feature refs (`classSource: PHB`), which a plain class-source filter
 *    would never match;
 *  - by filter: every feature entity whose class/subclass fields match, which
 *    also catches homebrew that omits or mistypes ref strings.
 */

import { identityOf, type ImportedEntity } from "./types/content";
import type { ClassData, ClassFeature, Subclass, SubclassFeature } from "./types/class-content";

export interface ParsedFeatureRef {
  name: string;
  className: string;
  classSource?: string;
  level: number;
  subclassShortName?: string;
  subclassSource?: string;
  /** The feature entity's own source (defaults to the class / subclass source). */
  source?: string;
}

/** Parse a class/subclass feature reference string. */
export function parseFeatureRef(ref: string): ParsedFeatureRef | undefined {
  const parts = ref.split("|").map((p) => p.trim());
  if (parts.length >= 6) {
    return {
      name: parts[0],
      className: parts[1],
      classSource: parts[2] || undefined,
      subclassShortName: parts[3],
      subclassSource: parts[4] || undefined,
      level: Number(parts[5]) || 1,
      source: parts[6] || undefined,
    };
  }
  if (parts.length >= 4) {
    return {
      name: parts[0],
      className: parts[1],
      classSource: parts[2] || undefined,
      level: Number(parts[3]) || 1,
      source: parts[4] || undefined,
    };
  }
  return undefined;
}

/** Treat an undefined feature classSource as matching the class's source. */
function sourceMatches(featureSource: string | undefined, classSource: string): boolean {
  return featureSource === undefined || featureSource === classSource;
}

/** The ref strings of a class's `classFeatures` (bare or `{ classFeature }` wrapped). */
function classFeatureRefs(cls: ClassData): string[] {
  const refs = (cls as { classFeatures?: unknown }).classFeatures;
  if (!Array.isArray(refs)) return [];
  return refs
    .map((r) => (typeof r === "string" ? r : r && typeof r === "object" ? (r as { classFeature?: unknown }).classFeature : undefined))
    .filter((r): r is string => typeof r === "string");
}

function subclassFeatureRefs(subclass: Subclass): string[] {
  const refs = (subclass as { subclassFeatures?: unknown }).subclassFeatures;
  return Array.isArray(refs) ? refs.filter((r): r is string => typeof r === "string") : [];
}

/** An omitted source in a ref means PHB, per the site's `unpackUid` conventions. */
const DEFAULT_SOURCE = "PHB";

/** Identity key a class-feature ref points at (classSource defaults to PHB, source to classSource). */
function classFeatureRefIdentity(ref: ParsedFeatureRef): string {
  const classSource = ref.classSource ?? DEFAULT_SOURCE;
  return identityOf("classFeature", {
    name: ref.name,
    className: ref.className,
    classSource,
    level: ref.level,
    source: ref.source ?? classSource,
  });
}

/** Identity key a subclass-feature ref points at (class/subclass sources default to PHB, source to subclassSource). */
function subclassFeatureRefIdentity(ref: ParsedFeatureRef): string {
  const classSource = ref.classSource ?? DEFAULT_SOURCE;
  const subclassSource = ref.subclassSource ?? DEFAULT_SOURCE;
  return identityOf("subclassFeature", {
    name: ref.name,
    className: ref.className,
    classSource,
    subclassShortName: ref.subclassShortName,
    subclassSource,
    level: ref.level,
    source: ref.source ?? subclassSource,
  });
}

/**
 * Feature refs nested in a feature's entries (`{ type: "refSubclassFeature",
 * subclassFeature: "Combat Superiority|Fighter||Battle Master||3" }`). A
 * level's headline feature (e.g. "Battle Master") lists its parts this way.
 */
function nestedFeatureRefs(feature: ImportedEntity, kind: "classFeature" | "subclassFeature"): string[] {
  const out: string[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (obj.type === `ref${kind[0].toUpperCase()}${kind.slice(1)}` && typeof obj[kind] === "string") {
      out.push(obj[kind] as string);
    }
    if (Array.isArray(obj.entries)) visit(obj.entries);
    if (Array.isArray(obj.items)) visit(obj.items);
  };
  visit(feature.entries);
  return out;
}

/**
 * Resolve a ref list against a pool, following nested refs. `keyOf` maps a
 * parsed ref to its identity key; `accept` filters by level.
 */
function resolveRefs(
  refs: string[],
  byIdentity: Map<string, ImportedEntity>,
  kind: "classFeature" | "subclassFeature",
  keyOf: (ref: ParsedFeatureRef) => string,
  level: number,
  out: Map<string, ImportedEntity>,
  depth = 0,
): void {
  if (depth > 4) return;
  for (const refStr of refs) {
    const ref = parseFeatureRef(refStr);
    if (!ref || ref.level > level) continue;
    if (kind === "classFeature" ? ref.subclassShortName !== undefined : ref.subclassShortName === undefined) continue;
    const key = keyOf(ref);
    const hit = byIdentity.get(key);
    if (!hit || out.has(key)) continue;
    out.set(key, hit);
    resolveRefs(nestedFeatureRefs(hit, kind), byIdentity, kind, keyOf, level, out, depth + 1);
  }
}

function byLevelThenName<T extends { level: number; name: string }>(a: T, b: T): number {
  return a.level - b.level || a.name.localeCompare(b.name);
}

/** All class features gained at or below `level`, ordered by level then name. */
export function resolveClassFeatures(
  entities: ImportedEntity[],
  cls: ClassData,
  level: number,
): ClassFeature[] {
  const pool = entities.filter((e) => e.__type === "classFeature");
  const byIdentity = new Map<string, ImportedEntity>();
  for (const e of pool) byIdentity.set(identityOf("classFeature", e), e);

  const out = new Map<string, ImportedEntity>();
  resolveRefs(classFeatureRefs(cls), byIdentity, "classFeature", classFeatureRefIdentity, level, out);
  for (const e of pool) {
    const f = e as unknown as ClassFeature;
    if (f.className === cls.name && sourceMatches(f.classSource, cls.source) && f.level <= level) {
      out.set(identityOf("classFeature", e), e);
    }
  }
  return [...out.values()].map((e) => e as unknown as ClassFeature).sort(byLevelThenName);
}

/** Subclass features gained at or below `level`. */
export function resolveSubclassFeatures(
  entities: ImportedEntity[],
  cls: ClassData,
  subclass: Subclass,
  level: number,
): SubclassFeature[] {
  const pool = entities.filter((e) => e.__type === "subclassFeature");
  const byIdentity = new Map<string, ImportedEntity>();
  for (const e of pool) byIdentity.set(identityOf("subclassFeature", e), e);

  const out = new Map<string, ImportedEntity>();
  resolveRefs(subclassFeatureRefs(subclass), byIdentity, "subclassFeature", subclassFeatureRefIdentity, level, out);
  for (const e of pool) {
    const f = e as unknown as SubclassFeature;
    if (
      f.className === cls.name &&
      sourceMatches(f.classSource, cls.source) &&
      (f.subclassShortName === subclass.shortName || f.subclassShortName === subclass.name) &&
      sourceMatches(f.subclassSource, subclass.source) &&
      f.level <= level
    ) {
      out.set(identityOf("subclassFeature", e), e);
    }
  }
  return [...out.values()].map((e) => e as unknown as SubclassFeature).sort(byLevelThenName);
}

/** List subclasses available for a class. */
export function listSubclasses(entities: ImportedEntity[], cls: ClassData): Subclass[] {
  return entities
    .filter((e) => e.__type === "subclass")
    .map((e) => e as unknown as Subclass)
    .filter((s) => s.className === cls.name && sourceMatches(s.classSource, cls.source))
    .sort((a, b) => a.name.localeCompare(b.name));
}
