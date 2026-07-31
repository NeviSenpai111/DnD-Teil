/** Load/save helpers over the Dexie database. */

import type { Character } from "../model/character";
import type { ContentSnapshot } from "../store/contentStore";
import { db, META_CONTENT, META_DRAFT, type CharacterRecord } from "./schema";

export async function saveContentSnapshot(snapshot: ContentSnapshot): Promise<void> {
  await db.meta.put({ key: META_CONTENT, value: snapshot });
}

export async function loadContentSnapshot(): Promise<ContentSnapshot | undefined> {
  return (await db.meta.get(META_CONTENT))?.value as ContentSnapshot | undefined;
}

export async function saveDraft(character: Character): Promise<void> {
  await db.meta.put({ key: META_DRAFT, value: character });
}

export async function loadDraft(): Promise<Character | undefined> {
  return (await db.meta.get(META_DRAFT))?.value as Character | undefined;
}

export async function saveCharacter(character: Character): Promise<void> {
  const record: CharacterRecord = { id: character.id, character, updatedAt: character.updatedAt };
  await db.characters.put(record);
}

export async function loadCharacters(): Promise<Character[]> {
  const records = await db.characters.toArray();
  return records.sort((a, b) => b.updatedAt - a.updatedAt).map((r) => r.character);
}

export async function deleteCharacterRecord(id: string): Promise<void> {
  await db.characters.delete(id);
}
