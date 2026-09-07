/**
 * Reprint detection, mirroring the site's "Reprinted" list filter — which is
 * deselected by default on every list page, so only the 2024 Fighter shows
 * once both printings are loaded, and the PHB Battle Master disappears under
 * either Fighter once the XPHB one exists.
 *
 * An entity is *reprinted* when one of its `reprintedAs` targets is
 * available: the target's source is imported and enabled, and — when the
 * target can be looked up — it actually exists in the pool. The existence
 * check keeps a selective import (XPHB spells but no XPHB classes) from
 * hiding the 2014 classes with nothing to replace them.
 */

import { tagDefaultSource, tagToType, type ContentIndex } from "./contentIndex";
import type { ImportedEntity } from "./types/content";

/** One `reprintedAs` entry: `"Name|SOURCE"` or `{ uid, tag }` (the tag names another type). */
export interface ReprintTarget {
  tag: string;
  uid: string;
  source: string;
}

/** The tag whose uid convention a type's own `reprintedAs` strings follow. */
const TYPE_TO_TAG: Record<string, string> = {
  monster: "creature",
  baseitem: "item",
  itemGroup: "item",
  magicvariant: "item",
  vehicleUpgrade: "vehupgrade",
  optionalfeature: "optfeature",
  legendaryGroup: "legroup",
  // Subrace reprints point at the race that absorbed them ("Fallen|VGM" -> "Aasimar|MPMM").
  subrace: "race",
};

function uidSource(tag: string, uid: string): string {
  const parts = uid.split("|").map((p) => p.trim());
  // `{@subclass Short|Class|ClassSource|Source}`; everything else is `name|source`.
  const raw = tag === "subclass" ? parts[3] : parts[1];
  return raw || tagDefaultSource(tag);
}

/** Parse an entity's `reprintedAs` list. */
export function reprintTargets(entity: ImportedEntity): ReprintTarget[] {
  const raw = entity.reprintedAs;
  if (!Array.isArray(raw)) return [];
  const ownTag = TYPE_TO_TAG[entity.__type] ?? entity.__type;
  const out: ReprintTarget[] = [];
  for (const r of raw) {
    let tag = ownTag;
    let uid: string | undefined;
    if (typeof r === "string") uid = r;
    else if (r && typeof r === "object") {
      const o = r as { uid?: unknown; tag?: unknown };
      if (typeof o.uid === "string") uid = o.uid;
      if (typeof o.tag === "string") tag = o.tag;
    }
    if (!uid) continue;
    out.push({ tag, uid, source: uidSource(tag, uid) });
  }
  return out;
}

export interface ReprintContext {
  index: ContentIndex;
  /** Whether a source is imported and enabled. */
  isSourceAvailable: (source: string) => boolean;
}

/** Whether an available newer printing of `entity` exists (see module docs). */
export function isReprinted(entity: ImportedEntity, ctx: ReprintContext): boolean {
  return reprintTargets(entity).some((t) => {
    if (!ctx.isSourceAvailable(t.source)) return false;
    // A tag we can't look up: trust the source.
    if (!tagToType(t.tag)) return true;
    const hit = ctx.index.resolveTag(t.tag, t.uid.split("|"));
    // `resolveTag` falls back to other sources; only a hit in the target's
    // own source means the reprint is really there.
    return hit !== undefined && hit !== entity && hit.source.toLowerCase() === t.source.toLowerCase();
  });
}

/** The reprinted entities of a pool, given which sources are enabled (`false` = disabled). */
export function reprintedEntities(
  entities: ImportedEntity[],
  index: ContentIndex,
  activeSources: Record<string, boolean>,
): Set<ImportedEntity> {
  const known = new Map<string, string>(); // lower-cased -> as written
  for (const e of entities) known.set(e.source.toLowerCase(), e.source);
  const ctx: ReprintContext = {
    index,
    isSourceAvailable: (source) => {
      const raw = known.get(source.toLowerCase());
      return raw !== undefined && activeSources[raw] !== false;
    },
  };
  const out = new Set<ImportedEntity>();
  for (const e of entities) {
    if (e.reprintedAs !== undefined && isReprinted(e, ctx)) out.add(e);
  }
  return out;
}
