/**
 * Class resource counters (Rage uses, Ki points, Sorcery Points, Superiority
 * Dice, …) parsed from a class's `classTableGroups`: any numeric column whose
 * label isn't a spells/known count is treated as a spendable resource with a
 * per-level maximum. Non-numeric cells ("1d6" scaling, `{type:"bonus"}`) are
 * ignored, which naturally excludes Martial Arts / Rage Damage style columns.
 */

export interface ClassResource {
  name: string;
  max: number;
}

/** Column labels that are counts of things KNOWN, not spendable uses. */
const NOT_A_RESOURCE = /known|prepared|cantrip|spell|slot|infusion|mastery/i;

/** Strip 5eTools {@tag …} markup from a column label. */
function stripTags(label: string): string {
  return label.replace(/\{@\w+ ([^}|]+)(?:\|[^}]*)?\}/g, "$1").trim();
}

export function classResources(
  cls: { classTableGroups?: unknown[] },
  level: number,
): ClassResource[] {
  const out: ClassResource[] = [];
  for (const group of cls.classTableGroups ?? []) {
    const g = group as { colLabels?: unknown[]; rows?: unknown[] };
    if (!Array.isArray(g.colLabels) || !Array.isArray(g.rows)) continue;
    const row = g.rows[Math.min(Math.max(1, level), g.rows.length) - 1];
    if (!Array.isArray(row)) continue;
    g.colLabels.forEach((rawLabel, col) => {
      const label = typeof rawLabel === "string" ? stripTags(rawLabel) : "";
      const value = row[col];
      if (!label || NOT_A_RESOURCE.test(label)) return;
      if (typeof value === "number" && value > 0) out.push({ name: label, max: value });
    });
  }
  return out;
}

/**
 * Whether a short rest restores this resource. The data carries no recharge
 * rule, so this is a name heuristic for the common short-rest resources
 * (Ki/Focus, Channel Divinity, Superiority Dice, Second Wind); everything
 * else comes back on a long rest only.
 */
export function shortRestRestores(name: string): boolean {
  return /\b(ki|focus|channel|superiority|second wind)\b/i.test(name);
}
