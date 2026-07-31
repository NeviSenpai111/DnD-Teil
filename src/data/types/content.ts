/**
 * The set of top-level content-type arrays a 5eTools file may contain, and the
 * shared identity model for entities.
 *
 * Identity = `name` + `source` (the same name can exist in multiple sources).
 */

export const CONTENT_TYPES = [
  "vehicle",
  "monster",
  "spell",
  "class",
  "subclass",
  "classFeature",
  "subclassFeature",
  "race",
  "subrace",
  "background",
  "item",
  "baseitem",
  "feat",
  "optionalfeature",
  "reward",
  "deity",
  "object",
  "trap",
  "hazard",
  "condition",
  "action",
  "language",
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

const CONTENT_TYPE_SET = new Set<string>(CONTENT_TYPES);

export function isContentType(key: string): key is ContentType {
  return CONTENT_TYPE_SET.has(key);
}

/** Minimum every entity carries. */
export interface BaseEntity {
  name: string;
  source: string;
}

/** A parsed entity tagged with which content array it came from. */
export type ImportedEntity = BaseEntity & {
  /** Which top-level array this came from. Underscore-prefixed to avoid 5eTools field clashes. */
  __type: ContentType;
} & Record<string, unknown>;

/** Stable identity key for an entity (case-insensitive). */
export function entityKey(type: string, name: string, source: string): string {
  return `${type}|${name}|${source}`.toLowerCase();
}
