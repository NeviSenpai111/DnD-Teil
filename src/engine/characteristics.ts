/**
 * 2014-style background characteristic tables (Personality Trait / Ideal /
 * Bond / Flaw): found as `{type:"table"}` entries whose second column names
 * the characteristic. Offered in the builder as click-to-pick lists with a
 * roll option, writing into the matching character-detail field.
 */

import type { Entry } from "../data/types/common";
import type { CharacterDetails } from "../model/character";

export interface CharacteristicTable {
  field: keyof Pick<CharacterDetails, "personalityTraits" | "ideals" | "bonds" | "flaws">;
  label: string;
  options: string[];
}

const FIELD_BY_LABEL: [RegExp, CharacteristicTable["field"]][] = [
  [/personality trait/i, "personalityTraits"],
  [/^ideal/i, "ideals"],
  [/^bond/i, "bonds"],
  [/^flaw/i, "flaws"],
];

const stripTags = (s: string) => s.replace(/\{@\w+ ([^}|]+)(?:\|[^}]*)?\}/g, "$1");

export function characteristicTables(background: { entries?: Entry[] }): CharacteristicTable[] {
  const out: CharacteristicTable[] = [];
  const walk = (entry: unknown) => {
    if (Array.isArray(entry)) return entry.forEach(walk);
    if (!entry || typeof entry !== "object") return;
    const o = entry as { type?: string; colLabels?: unknown[]; rows?: unknown[]; entries?: unknown };
    if (o.type === "table" && Array.isArray(o.colLabels) && Array.isArray(o.rows)) {
      const label = typeof o.colLabels[1] === "string" ? stripTags(o.colLabels[1]) : "";
      const match = FIELD_BY_LABEL.find(([re]) => re.test(label));
      if (match) {
        const options = o.rows
          .map((row) => (Array.isArray(row) ? row[1] : undefined))
          .filter((cell): cell is string => typeof cell === "string")
          .map(stripTags);
        if (options.length > 0) out.push({ field: match[1], label, options });
      }
    }
    walk(o.entries);
  };
  walk(background.entries);
  return out;
}
