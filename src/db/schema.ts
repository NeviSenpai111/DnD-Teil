/** Dexie (IndexedDB) schema: a key-value `meta` store + a `characters` roster. */

import Dexie, { type Table } from "dexie";
import type { Character } from "../model/character";

/** Singleton blobs keyed by name: the imported content snapshot and the draft. */
export interface MetaRecord {
  key: string;
  value: unknown;
}

export interface CharacterRecord {
  id: string;
  character: Character;
  updatedAt: number;
}

class AppDatabase extends Dexie {
  meta!: Table<MetaRecord, string>;
  characters!: Table<CharacterRecord, string>;

  constructor() {
    super("5etools-builder");
    this.version(1).stores({
      meta: "key",
      characters: "id, updatedAt",
    });
  }
}

export const db = new AppDatabase();

export const META_CONTENT = "content";
export const META_DRAFT = "draft";
