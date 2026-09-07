/**
 * The set of top-level content-type arrays a 5eTools file may contain, the
 * per-type identity model, and helpers that compute stable identity keys.
 *
 * Identity is NOT always `name + source`. 5eTools keys several types on extra
 * fields (mirroring `UrlUtil.URL_TO_HASH_BUILDER` upstream), and getting this
 * wrong silently drops data: e.g. every class has an "Ability Score
 * Improvement|PHB" feature at several levels, so a `name|source` key keeps only
 * the first one.
 *
 *   classFeature      name | source | className | classSource | level
 *   subclassFeature   name | source | className | classSource | subclassShortName | subclassSource | level
 *   subclass          name | source | className | classSource
 *   subrace           name | source | raceName | raceSource
 *   raceFeature       name | source | raceName | raceSource
 *   deity             name | source | pantheon
 *   card              name | source | set
 *   itemType          abbreviation | source
 *   itemProperty      abbreviation | source
 *   everything else   name | source
 */

/** Content arrays that are browsable / consumed by the builder. */
export const PRIMARY_CONTENT_TYPES = [
  // Character building
  "class",
  "subclass",
  "classFeature",
  "subclassFeature",
  "race",
  "subrace",
  "background",
  "feat",
  "optionalfeature",
  "charoption",
  "psionic",
  // Equipment
  "item",
  "baseitem",
  "itemGroup",
  "magicvariant",
  "itemType",
  "itemProperty",
  "itemMastery",
  // Spells
  "spell",
  // Creatures, objects, vehicles, hazards
  "monster",
  "legendaryGroup",
  "object",
  "vehicle",
  "vehicleUpgrade",
  "trap",
  "hazard",
  // Rules & reference
  "condition",
  "disease",
  "status",
  "action",
  "language",
  "skill",
  "sense",
  "variantrule",
  "table",
  "tableGroup",
  "reward",
  "deity",
  "cult",
  "boon",
  "facility",
  "recipe",
  "deck",
  "card",
  "crochetPattern",
] as const;

/**
 * Auxiliary arrays: imported and indexed (so `_copy` bases and cross-references
 * resolve) but hidden from the browser list and source counts. Fluff carries
 * lore/images for a primary entity of the same name+source; templates are
 * applied through `_copy._templates`.
 */
export const AUX_CONTENT_TYPES = [
  "raceFeature",
  "itemEntry",
  "itemTypeAdditionalEntries",
  "languageScript",
  "encounter",
  "book",
  "adventure",
  "monsterTemplate",
  "legendaryGroupTemplate",
  "monsterFluff",
  "spellFluff",
  "classFluff",
  "subclassFluff",
  "raceFluff",
  "itemFluff",
  "backgroundFluff",
  "featFluff",
  "conditionFluff",
  "languageFluff",
  "objectFluff",
  "optionalfeatureFluff",
  "rewardFluff",
  "trapFluff",
  "hazardFluff",
  "vehicleFluff",
  "charoptionFluff",
  "recipeFluff",
  "facilityFluff",
  "crochetPatternFluff",
] as const;

export const CONTENT_TYPES = [...PRIMARY_CONTENT_TYPES, ...AUX_CONTENT_TYPES] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

const CONTENT_TYPE_SET = new Set<string>(CONTENT_TYPES);
const AUX_TYPE_SET = new Set<string>(AUX_CONTENT_TYPES);

export function isContentType(key: string): key is ContentType {
  return CONTENT_TYPE_SET.has(key);
}

/** Fluff, templates and glue data — indexed but not listed in the browser. */
export function isAuxType(type: string): boolean {
  return AUX_TYPE_SET.has(type);
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

interface IdentitySpec {
  /** Field used in place of `name` (itemType / itemProperty key on `abbreviation`). */
  nameField?: string;
  /** Extra fields appended after `name|source`. */
  extra: readonly string[];
}

const DEFAULT_IDENTITY: IdentitySpec = { extra: [] };

const IDENTITY_SPECS: Partial<Record<ContentType, IdentitySpec>> = {
  classFeature: { extra: ["className", "classSource", "level"] },
  subclassFeature: {
    extra: ["className", "classSource", "subclassShortName", "subclassSource", "level"],
  },
  subclass: { extra: ["className", "classSource"] },
  subclassFluff: { extra: ["className", "classSource"] },
  subrace: { extra: ["raceName", "raceSource"] },
  raceFeature: { extra: ["raceName", "raceSource"] },
  deity: { extra: ["pantheon"] },
  card: { extra: ["set"] },
  itemType: { nameField: "abbreviation", extra: [] },
  itemProperty: { nameField: "abbreviation", extra: [] },
};

/** The identity spec for a content type (which fields make an entity unique). */
export function identitySpec(type: string): IdentitySpec {
  return IDENTITY_SPECS[type as ContentType] ?? DEFAULT_IDENTITY;
}

/** Fields (beyond name + source) that participate in a type's identity. */
export function identityFields(type: string): readonly string[] {
  return identitySpec(type).extra;
}

function part(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

/**
 * Identity key for arbitrary fields of a content type. `fields` must carry
 * `name` (or the type's `nameField`) and `source`; missing extras are treated
 * as empty. Case-insensitive.
 */
export function identityOf(type: string, fields: Record<string, unknown>): string {
  const spec = identitySpec(type);
  const name = spec.nameField ? fields[spec.nameField] ?? fields.name : fields.name;
  const parts = [type, part(name), part(fields.source)];
  for (const f of spec.extra) parts.push(part(fields[f]));
  return parts.join("|").toLowerCase();
}

/** Identity key of an imported entity. */
export function entityIdentity(entity: ImportedEntity): string {
  return identityOf(entity.__type, entity);
}

/**
 * `type|name|source` (case-insensitive). For simple types this equals the
 * identity; for compound types it is the coarse key used for name+source
 * lookups (e.g. `{@classFeature ...}` tags, character refs).
 */
export function entityKey(type: string, name: string, source: string): string {
  return `${type}|${name}|${source}`.toLowerCase();
}
