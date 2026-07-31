/**
 * Parsing helpers for the assorted 5eTools proficiency-grant shapes that aren't
 * skills (tools, languages, armor, weapons, expertise). These appear on races,
 * backgrounds, classes and feats in a few different forms:
 *
 *  - fixed grants: `{ "thieves' tools": true }`
 *  - "any N" grants: `{ "any": 2 }` / `{ "anyArtisansTool": 1 }`
 *  - choices: `{ "choose": { "from": [...], "count": n } }`
 *  - plain token lists (armor/weapons): `["light", "medium", "{@item dagger|phb}"]`
 *
 * We surface fixed grants as concrete names and "any N" / choice grants as a
 * human note (the builder doesn't yet let you pick the specific tool/language).
 */

import type { ProficiencyGrant } from "../data/types/character-content";

/** Strip a leading `{@tag name|source|display}` wrapper down to display text. */
export function cleanProfToken(token: string): string {
  return token.replace(/\{@\w+\s+([^}]*)\}/g, (_all, inner: string) => {
    const parts = inner.split("|");
    // `name|source|display` -> prefer the display override, else the name.
    return (parts[2] ?? parts[0]).trim();
  });
}

export interface NamedGrants {
  /** Concretely-named proficiencies (e.g. "Calligrapher's Supplies"). */
  fixed: string[];
  /** Free-choice grants, summarised (e.g. "any 2", "any artisan's tool"). */
  notes: string[];
}

/** Title-case a lowercase proficiency key for display (per space-separated word). */
function titleCase(s: string): string {
  return s.replace(/(^|\s)\w/g, (c) => c.toUpperCase());
}

/** Humanise an "any*" grant key, e.g. `anyArtisansTool` -> "any artisan's tool". */
function describeAny(key: string, count: number): string {
  if (key === "any") return `any ${count}`;
  const words = key
    .replace(/^any/, "")
    .replace(/([A-Z])/g, " $1")
    .trim()
    .toLowerCase();
  return count > 1 ? `${count} ${words}` : `any ${words}`;
}

/** Read tool/language-style grant arrays into fixed names + free-choice notes. */
export function readNamedGrants(grants: ProficiencyGrant[] | undefined): NamedGrants {
  const fixed = new Set<string>();
  const notes: string[] = [];
  for (const grant of grants ?? []) {
    for (const [key, value] of Object.entries(grant)) {
      if (key === "choose") {
        const choose = value as { from?: string[]; count?: number };
        notes.push(`choose ${choose.count ?? 1} of ${(choose.from ?? []).map(titleCase).join(", ")}`);
      } else if (key.startsWith("any")) {
        notes.push(describeAny(key, typeof value === "number" ? value : 1));
      } else if (value === true) {
        fixed.add(titleCase(cleanProfToken(key)));
      }
    }
  }
  return { fixed: [...fixed], notes };
}

/** Read a plain token list (armor/weapon proficiencies) into display strings. */
export function readTokenList(list: unknown[] | undefined): string[] {
  const out: string[] = [];
  for (const entry of list ?? []) {
    if (typeof entry === "string") out.push(titleCase(cleanProfToken(entry)));
    else if (entry && typeof entry === "object") {
      const o = entry as { proficiency?: string; name?: string };
      const label = o.proficiency ?? o.name;
      if (label) out.push(titleCase(cleanProfToken(label)));
    }
  }
  return out;
}
