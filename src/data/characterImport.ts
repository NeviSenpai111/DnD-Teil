/**
 * Turns a dropped file into a character: a D&D Beyond PDF export, D&D
 * Beyond's character JSON, or a character JSON this app exported earlier.
 */

import type { ContentIndex } from "./contentIndex";
import type { Edition } from "./types/meta";
import { readPdfFormFields } from "./pdfForm";
import { characterFromDdbFields, isDndBeyondSheet, type CharacterImport } from "./ddbImport";
import { asDdbCharacter } from "./ddbJson";
import { characterFromDdbJson } from "./ddbJsonImport";
import { createCharacter, normalizeCharacter, type Character } from "../model/character";

export async function importCharacterFile(
  file: File,
  index: ContentIndex,
  edition: Edition,
): Promise<CharacterImport> {
  if (/\.json$/i.test(file.name)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error(`${file.name} isn't valid JSON.`);
    }
    const ddb = asDdbCharacter(parsed);
    if (ddb) return characterFromDdbJson(ddb, index);

    const exported = parsed as Partial<Character> | null;
    if (!exported || typeof exported !== "object" || typeof exported.name !== "string") {
      throw new Error(`${file.name} isn't a character export or a D&D Beyond character.`);
    }
    // A re-import is a new character, not an overwrite of the original.
    const character = normalizeCharacter({ ...createCharacter(), ...exported, id: createCharacter().id });
    return { character, warnings: [] };
  }

  const fields = await readPdfFormFields(new Uint8Array(await file.arrayBuffer()));
  if (!isDndBeyondSheet(fields)) {
    throw new Error(
      `${file.name} has no filled character-sheet fields. Use D&D Beyond's "Export → PDF" on the character sheet.`,
    );
  }
  return characterFromDdbFields(fields, index, edition);
}
