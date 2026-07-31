/**
 * Shared 5eTools primitives: the recursive `entries` structure and source refs.
 *
 * `entries` mixes plain strings (which themselves contain inline {@tag} markup)
 * with typed objects. We model the common typed objects explicitly and keep a
 * permissive fallback so unknown entry types never crash the renderer.
 */

export type Entry = string | EntryObject;

export interface EntryBase {
  type: string;
  name?: string;
  /** Anchor id used by some 5eTools entries; harmless if absent. */
  id?: string;
}

/** `entries`, `section`, `inset`, `insetReadaloud`, `variant`, etc. — all nest `entries`. */
export interface EntriesEntry extends EntryBase {
  type: "entries" | "section" | "inset" | "insetReadaloud" | "variant" | "variantSub";
  entries: Entry[];
}

export interface ListEntry extends EntryBase {
  type: "list";
  items: Entry[];
  style?: string;
}

export interface TableEntry extends EntryBase {
  type: "table";
  caption?: string;
  colLabels?: string[];
  colStyles?: string[];
  rows: Entry[][];
}

export interface QuoteEntry extends EntryBase {
  type: "quote";
  entries: Entry[];
  by?: string;
}

export interface ImageEntry extends EntryBase {
  type: "image";
  href?: { type?: string; path?: string; url?: string };
  title?: string;
}

/**
 * A labelled item inside a `list` (or standalone): a bold lead-in `name`
 * followed by a single `entry` and/or nested `entries`. `itemSpell` / `itemSub`
 * share the same shape.
 */
export interface ItemEntry extends EntryBase {
  type: "item" | "itemSpell" | "itemSub";
  entry?: Entry;
  entries?: Entry[];
}

/** Fallback for entry objects we don't model explicitly yet. */
export interface UnknownEntry extends EntryBase {
  entries?: Entry[];
  items?: Entry[];
  [key: string]: unknown;
}

export type EntryObject =
  | EntriesEntry
  | ListEntry
  | TableEntry
  | QuoteEntry
  | ImageEntry
  | ItemEntry
  | UnknownEntry;

/** A `_meta.sources[]` descriptor. */
export interface MetaSource {
  json: string;
  abbreviation?: string;
  full?: string;
  authors?: string[];
  version?: string;
}
