/**
 * Weapon Mastery (2024): the number of mastered weapon kinds comes from the
 * class table's "Weapon Mastery" column; weapons carry the mastery property
 * they can use (`mastery: ["Sap|XPHB"]`).
 */

export function weaponMasteryCount(cls: { classTableGroups?: unknown[] }, level: number): number {
  for (const group of cls.classTableGroups ?? []) {
    const g = group as { colLabels?: unknown[]; rows?: unknown[] };
    if (!Array.isArray(g.colLabels) || !Array.isArray(g.rows)) continue;
    const col = g.colLabels.findIndex(
      (label) => typeof label === "string" && /weapon mastery/i.test(label),
    );
    if (col < 0) continue;
    const row = g.rows[Math.min(Math.max(1, level), g.rows.length) - 1];
    const value = Array.isArray(row) ? row[col] : undefined;
    if (typeof value === "number") return value;
  }
  return 0;
}

/** A weapon's mastery property names, stripped of source suffixes. */
export function masteryNames(item: { mastery?: unknown[] }): string[] {
  return (item.mastery ?? [])
    .filter((m): m is string => typeof m === "string")
    .map((m) => m.split("|")[0].trim());
}
