/**
 * Builds lookup structures over imported entities: identity lookups for
 * cross-references ({@spell fireball}, {@item longsword}, ...) and the set of
 * distinct sources used to drive the source-toggle UI.
 */

import type { MetaSource } from "./types/common";
import type { SpellClassMap } from "./importer";
import { entityKey, type ContentType, type ImportedEntity } from "./types/content";

export interface SourceInfo {
  /** The raw `source` string carried by entities. */
  source: string;
  /** Friendly name from `_meta.sources` when one matches, else the raw source. */
  displayName: string;
  /** How many entities carry this source. */
  count: number;
}

/** Maps a tag like `@spell` to the content type it references. */
const TAG_TO_TYPE: Record<string, ContentType> = {
  spell: "spell",
  item: "item",
  creature: "monster",
  condition: "condition",
  background: "background",
  feat: "feat",
  race: "race",
  class: "class",
  vehicle: "vehicle",
  object: "object",
  action: "action",
  deity: "deity",
  reward: "reward",
  hazard: "hazard",
  trap: "trap",
  optfeature: "optionalfeature",
  language: "language",
};

/** Fold a name down to letters and digits, so "Thieves' Tools" == "thievestools". */
export function looseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export class ContentIndex {
  /** type|name|source -> entity */
  private readonly byFullKey = new Map<string, ImportedEntity>();
  /** type|name -> first entity with that name (source-agnostic fallback) */
  private readonly byNameKey = new Map<string, ImportedEntity>();
  /** type|looseName -> first entity matching ignoring case and punctuation */
  private readonly byLooseKey = new Map<string, ImportedEntity>();
  /** type -> every entity of that type, in import order */
  private readonly byType = new Map<string, ImportedEntity[]>();

  constructor(
    entities: ImportedEntity[],
    private readonly metaSources: Record<string, MetaSource> = {},
    private readonly spellClassMap: SpellClassMap = {},
  ) {
    for (const e of entities) {
      this.byFullKey.set(entityKey(e.__type, e.name, e.source), e);
      const nameKey = `${e.__type}|${e.name}`.toLowerCase();
      if (!this.byNameKey.has(nameKey)) this.byNameKey.set(nameKey, e);
      const looseKey = `${e.__type}|${looseName(e.name)}`;
      if (!this.byLooseKey.has(looseKey)) this.byLooseKey.set(looseKey, e);
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

  /** Exact lookup by content type + name + source. */
  get(type: ContentType, name: string, source: string): ImportedEntity | undefined {
    return this.byFullKey.get(entityKey(type, name, source));
  }

  /**
   * Resolve an inline reference tag's args to an entity.
   * Args follow the 5eTools convention `name|source|displayOverride`.
   */
  resolveTag(tag: string, args: string[]): ImportedEntity | undefined {
    const type = TAG_TO_TYPE[tag];
    if (!type || args.length === 0) return undefined;
    const name = args[0];
    const source = args[1];
    if (source) {
      const exact = this.get(type, name, source);
      if (exact) return exact;
    }
    return this.byNameKey.get(`${type}|${name}`.toLowerCase());
  }

  /**
   * Distinct sources present on entities, with friendly display names.
   *
   * NOTE: entity `source` values often differ from `_meta.sources[].json`
   * (e.g. sample has json "SpaceGalleonBrew" but source "Homebrew"), so the
   * toggle list is driven by entity sources, not `_meta`.
   * TODO: reconcile when files declare a canonical source<->meta mapping.
   */
  distinctSources(entities: ImportedEntity[]): SourceInfo[] {
    const counts = new Map<string, number>();
    for (const e of entities) {
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
