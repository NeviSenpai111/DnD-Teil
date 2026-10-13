/**
 * Defensive traits that species content states only in prose. Fey Ancestry
 * ("You have advantage on saving throws against being charmed, and magic
 * can't put you to sleep") has no structured field in 5eTools data, yet D&D
 * Beyond's sheet shows it as a saving-throw note and a Magical Sleep defense.
 */

export interface TraitNotes {
  /** "Advantage against being charmed". */
  saveNotes: string[];
  /** Extra immunities, e.g. "magical sleep". */
  immunities: string[];
}

/** `{@condition charmed}` / `{@variantrule Advantage|XPHB}` -> their display text. */
function plain(text: string): string {
  return text.replace(/\{@\w+ ([^}|]+)(?:\|[^}]*)?\}/g, "$1");
}

function strings(entries: unknown, out: string[] = []): string[] {
  if (typeof entries === "string") out.push(plain(entries));
  else if (Array.isArray(entries)) entries.forEach((e) => strings(e, out));
  else if (entries && typeof entries === "object") strings((entries as { entries?: unknown }).entries, out);
  return out;
}

export function traitNotes(entries: unknown): TraitNotes {
  const saveNotes: string[] = [];
  const immunities: string[] = [];
  for (const text of strings(entries)) {
    for (const m of text.matchAll(/\badvantage on saving throws (against [^.;,]+|you make to avoid or end [^.;,]+)/gi)) {
      const clause = m[1].trim();
      const note = clause.startsWith("against") ? `Advantage ${clause}` : `Advantage on saves ${clause}`;
      if (!saveNotes.includes(note)) saveNotes.push(note);
    }
    if (/magic can[’']t put you to sleep/i.test(text) && !immunities.includes("magical sleep")) {
      immunities.push("magical sleep");
    }
  }
  return { saveNotes, immunities };
}
