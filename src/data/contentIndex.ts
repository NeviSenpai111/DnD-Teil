/**
 * Builds lookup structures over imported entities: identity lookups for
 * cross-references ({@spell fireball}, {@item longsword}, ...) and the set of
 * distinct sources used to drive the source-toggle UI.
 *
 * Three levels of lookup exist because 5eTools identity varies by type (see
 * `types/content.ts`):
 *   - `find(type, fields)`     exact identity (all identity fields)
 *   - `get(type, name, source)` first entity with that name + source
 *   - name only                 first entity with that name (tag fallback)
 */

import type { MetaSource } from "./types/common";
import type { SpellClassMap } from "./importer";
import {
  entityIdentity,
  entityKey,
  identityOf,
  isAuxType,
  type ContentType,
  type ImportedEntity,
} from "./types/content";

export interface SourceInfo {
  /** The raw `source` string carried by entities. */
  source: string;
  /** Friendly name from `_meta.sources` when one matches, else the raw source. */
  displayName: string;
  /** How many (non-auxiliary) entities carry this source. */
  count: number;
}

/** Maps a tag like `@spell` to the content type it references. */
const TAG_TO_TYPE: Record<string, ContentType> = {
  spell: "spell",
  item: "item",
  creature: "monster",
  condition: "condition",
  disease: "disease",
  status: "status",
  background: "background",
  feat: "feat",
  race: "race",
  class: "class",
  subclass: "subclass",
  classFeature: "classFeature",
  subclassFeature: "subclassFeature",
  vehicle: "vehicle",
  vehupgrade: "vehicleUpgrade",
  object: "object",
  action: "action",
  deity: "deity",
  reward: "reward",
  hazard: "hazard",
  trap: "trap",
  optfeature: "optionalfeature",
  language: "language",
  skill: "skill",
  sense: "sense",
  variantrule: "variantrule",
  table: "table",
  legroup: "legendaryGroup",
  itemMastery: "itemMastery",
  itemProperty: "itemProperty",
  itemType: "itemType",
  itemEntry: "itemEntry",
  charoption: "charoption",
  psionic: "psionic",
  cult: "cult",
  boon: "boon",
  card: "card",
  deck: "deck",
  facility: "facility",
  recipe: "recipe",
};

/** Fold a name down to letters and digits, so "Thieves' Tools" == "thievestools". */
export function looseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Source assumed when a tag omits it (mirrors the site's per-tag defaults). */
const DEFAULT_TAG_SOURCE: Record<string, string> = {
  spell: "PHB",
  item: "DMG",
  creature: "MM",
  condition: "PHB",
  disease: "DMG",
  status: "PHB",
  background: "PHB",
  feat: "PHB",
  race: "PHB",
  class: "PHB",
  subclass: "PHB",
  classFeature: "PHB",
  subclassFeature: "PHB",
  vehicle: "GoS",
  vehupgrade: "GoS",
  object: "DMG",
  action: "PHB",
  deity: "PHB",
  reward: "DMG",
  hazard: "DMG",
  trap: "DMG",
  optfeature: "PHB",
  language: "PHB",
  skill: "PHB",
  sense: "PHB",
  variantrule: "DMG",
  table: "DMG",
  legroup: "MM",
  itemMastery: "XPHB",
  itemProperty: "PHB",
  itemType: "PHB",
  itemEntry: "DMG",
  charoption: "MOT",
  psionic: "UATMC",
  cult: "MTF",
  boon: "MTF",
  card: "DMG",
  deck: "DMG",
  facility: "XDMG",
  recipe: "HF",
};

/** The content type a reference tag (`spell`, `creature`, …) points at. */
export function tagToType(tag: string): ContentType | undefined {
  return TAG_TO_TYPE[tag];
}

/** The source assumed when a tag or uid omits it. */
export function tagDefaultSource(tag: string): string {
  return DEFAULT_TAG_SOURCE[tag] ?? "PHB";
}

/** `{@item}` may name any of the item-like types. */
const ITEM_TYPES: ContentType[] = ["item", "baseitem", "itemGroup", "magicvariant"];

/** The tag's args as identity fields, per the site's `unpackUid` conventions. */
function tagArgsToFields(tag: string, args: string[]): Record<string, unknown> {
  const a = (i: number) => (args[i] ?? "").trim();
  const or = (v: string, fallback: string) => v || fallback;
  const def = DEFAULT_TAG_SOURCE[tag] ?? "PHB";
  switch (tag) {
    case "classFeature": {
      const classSource = or(a(2), "PHB");
      return { name: a(0), className: a(1), classSource, level: Number(a(3)), source: or(a(4), classSource) };
    }
    case "subclassFeature": {
      const classSource = or(a(2), "PHB");
      const subclassSource = or(a(4), "PHB");
      return {
        name: a(0),
        className: a(1),
        classSource,
        subclassShortName: a(3),
        subclassSource,
        level: Number(a(5)),
        source: or(a(6), subclassSource),
      };
    }
    case "subclass":
      return { shortName: a(0), className: a(1), classSource: or(a(2), "PHB"), source: or(a(3), def) };
    case "deity":
      return { name: a(0), pantheon: or(a(1), "Forgotten Realms"), source: or(a(2), def) };
    case "card":
      return { name: a(0), set: or(a(1), "none"), source: or(a(2), def) };
    case "itemProperty":
    case "itemType":
      return { abbreviation: a(0), source: or(a(1), def) };
    default:
      return { name: a(0), source: or(a(1), def) };
  }
}

export class ContentIndex {
  /** full identity -> entity */
  private readonly byIdentity = new Map<string, ImportedEntity>();
  /** type|name|source -> every entity with that name + source (import order) */
  private readonly byNameSource = new Map<string, ImportedEntity[]>();
  /** type|name -> first entity with that name (source-agnostic fallback) */
  private readonly byNameKey = new Map<string, ImportedEntity>();
  /** type|looseName -> first entity matching ignoring case and punctuation */
  private readonly byLooseKey = new Map<string, ImportedEntity>();
  /** subclass|shortName|className|classSource|source -> subclass */
  private readonly bySubclassShortName = new Map<string, ImportedEntity>();
  /** type -> every entity of that type, in import order */
  private readonly byType = new Map<string, ImportedEntity[]>();

  constructor(
    entities: ImportedEntity[],
    private readonly metaSources: Record<string, MetaSource> = {},
    private readonly spellClassMap: SpellClassMap = {},
  ) {
    for (const e of entities) {
      this.byIdentity.set(entityIdentity(e), e);

      const nsKey = entityKey(e.__type, e.name, e.source);
      const nsList = this.byNameSource.get(nsKey);
      if (nsList) nsList.push(e);
      else this.byNameSource.set(nsKey, [e]);

      const nameKey = `${e.__type}|${e.name}`.toLowerCase();
      if (!this.byNameKey.has(nameKey)) this.byNameKey.set(nameKey, e);
      const looseKey = `${e.__type}|${looseName(e.name)}`;
      if (!this.byLooseKey.has(looseKey)) this.byLooseKey.set(looseKey, e);

      if (e.__type === "subclass" && typeof e.shortName === "string") {
        this.bySubclassShortName.set(
          `${e.shortName}|${String(e.className)}|${String(e.classSource)}|${e.source}`.toLowerCase(),
          e,
        );
      }

      const list = this.byType.get(e.__type);
      if (list) list.push(e);
      else this.byType.set(e.__type, [e]);
    }
  }

  /** Every indexed entity of a content type. */
  list(type: ContentType): ImportedEntity[] {
    return this.byType.get(type) ?? [];
  }

  /**
   * Look an entity up by name alone, ignoring case and punctuation. Used by the
   * character importer, where names arrive as free text from another tool
   * ("Thieves' Tools", "Crossbow, Light") rather than as `name|source` refs.
   */
  findByName(types: ContentType | ContentType[], name: string): ImportedEntity | undefined {
    const wanted = looseName(name);
    if (!wanted) return undefined;
    for (const type of Array.isArray(types) ? types : [types]) {
      const hit =
        this.byNameKey.get(`${type}|${name.trim()}`.toLowerCase()) ??
        this.byLooseKey.get(`${type}|${wanted}`);
      if (hit) return hit;
    }
    return undefined;
  }

  /**
   * Classes that can cast a spell, per the imported `spells/sources.json`
   * reverse-index. Returns `undefined` when the spell isn't in the index (so
   * callers can fall back to inline class associations).
   */
  spellClasses(name: string, source: string): { name: string; source: string }[] | undefined {
    return this.spellClassMap[`${source}|${name}`.toLowerCase()];
  }

  /** First entity with this content type + name + source. */
  get(type: ContentType, name: string, source: string): ImportedEntity | undefined {
    return this.byNameSource.get(entityKey(type, name, source))?.[0];
  }

  /** Every entity with this content type + name + source (compound types can have several). */
  getAll(type: ContentType, name: string, source: string): ImportedEntity[] {
    return this.byNameSource.get(entityKey(type, name, source)) ?? [];
  }

  /** Exact lookup by a type's full identity fields (name, source, className, level, …). */
  find(type: ContentType, fields: Record<string, unknown>): ImportedEntity | undefined {
    return this.byIdentity.get(identityOf(type, fields));
  }

  /** A subclass by its short name within a class. `source` defaults to the class source. */
  findSubclass(
    shortName: string,
    className: string,
    classSource: string,
    source: string = classSource,
  ): ImportedEntity | undefined {
    return this.bySubclassShortName.get(`${shortName}|${className}|${classSource}|${source}`.toLowerCase());
  }

  /**
   * Resolve an inline reference tag's args to an entity.
   * Args follow the 5eTools convention `name|source|displayOverride` (compound
   * types carry their identity fields in between, e.g.
   * `{@classFeature name|className|classSource|level|source}`).
   */
  resolveTag(tag: string, args: string[]): ImportedEntity | undefined {
    const type = TAG_TO_TYPE[tag];
    if (!type || args.length === 0) return undefined;
    const fields = tagArgsToFields(tag, args);

    if (tag === "subclass") {
      return (
        this.findSubclass(
          String(fields.shortName),
          String(fields.className),
          String(fields.classSource),
          String(fields.source),
        ) ??
        this.get(type, String(fields.shortName), String(fields.source)) ??
        this.byNameKey.get(`${type}|${String(fields.shortName)}`.toLowerCase())
      );
    }

    const types = tag === "item" ? ITEM_TYPES : [type];
    for (const t of types) {
      const exact = this.find(t, fields);
      if (exact) return exact;
    }

    const name = String(fields.name ?? fields.abbreviation ?? "");
    const source = String(fields.source ?? "");
    // The tag's default source may not match the imported edition: try the
    // given/default source first, then any source.
    for (const t of types) {
      const bySource = this.get(t, name, source);
      if (bySource) return bySource;
    }
    for (const t of types) {
      const byName = this.byNameKey.get(`${t}|${name}`.toLowerCase());
      if (byName) return byName;
    }
    return undefined;
  }

  /**
   * Distinct sources present on entities, with friendly display names.
   * Auxiliary entities (fluff, templates) are not counted.
   *
   * NOTE: entity `source` values often differ from `_meta.sources[].json`
   * (e.g. sample has json "SpaceGalleonBrew" but source "Homebrew"), so the
   * toggle list is driven by entity sources, not `_meta`.
   */
  distinctSources(entities: ImportedEntity[]): SourceInfo[] {
    const counts = new Map<string, number>();
    for (const e of entities) {
      if (isAuxType(e.__type)) continue;
      counts.set(e.source, (counts.get(e.source) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([source, count]) => ({
        source,
        count,
        displayName: this.metaSources[source]?.full ?? source,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
}
