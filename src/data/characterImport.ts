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
import { sanitizeCharacter } from "./characterSchema";
import { createCharacter, type Character } from "../model/character";

/** One report line for the fields a character file had in the wrong format. */
function droppedWarning(dropped: string[]): string {
  const shown = dropped.slice(0, 6).join(", ");
  const more = dropped.length > 6 ? ` and ${dropped.length - 6} more` : "";
  return `Left out what wasn't in the expected format: ${shown}${more}.`;
}

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

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof (parsed as Character).name !== "string") {
      throw new Error(`${file.name} isn't a character export or a D&D Beyond character.`);
    }
    const { character, dropped } = sanitizeCharacter(parsed as Record<string, unknown>);
    const warnings = dropped.length ? [droppedWarning(dropped)] : [];
    // A re-import is a new character, not an overwrite of the original.
    return { character: { ...character, id: createCharacter().id }, warnings };
  }

  const fields = await readPdfFormFields(new Uint8Array(await file.arrayBuffer()));
  if (!isDndBeyondSheet(fields)) {
    throw new Error(
      `${file.name} has no filled character-sheet fields. Use D&D Beyond's "Export → PDF" on the character sheet.`,
    );
  }
  return characterFromDdbFields(fields, index, edition);
}
