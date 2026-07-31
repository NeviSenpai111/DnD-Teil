/** Character export helpers (browser download). */

import type { Character } from "../model/character";

/** Serialize a character to pretty JSON. */
export function characterToJson(character: Character): string {
  return JSON.stringify(character, null, 2);
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "character";
}

/** Trigger a browser download of the character as a `.json` file. */
export function downloadCharacterJson(character: Character): void {
  const blob = new Blob([characterToJson(character)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(character.name)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
