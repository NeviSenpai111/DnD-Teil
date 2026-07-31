/**
 * Formatting helpers and classification for inline tags. Pure string logic only;
 * the React mapping lives in TagRenderer.
 */

/** Reference tags that resolve to an imported entity (clickable cross-refs). */
export const REF_TAGS = new Set([
  "spell",
  "item",
  "creature",
  "condition",
  "background",
  "feat",
  "race",
  "class",
  "vehicle",
  "object",
  "action",
  "deity",
  "reward",
  "hazard",
  "trap",
  "optfeature",
  "language",
]);

/** Tags that reference rules/glossary text we don't store as entities. */
export const GLOSSARY_REF_TAGS = new Set([
  "skill",
  "sense",
  "status",
  "disease",
  "variantrule",
  "table",
  "quickref",
  "book",
  "adventure",
  "filter",
]);

/** Inline formatting tags → the style to apply to their (recursive) content. */
export const FORMAT_TAGS: Record<string, "bold" | "italic" | "strike" | "underline" | "note"> = {
  b: "bold",
  bold: "bold",
  i: "italic",
  italic: "italic",
  s: "strike",
  strike: "strike",
  u: "underline",
  underline: "underline",
  note: "note",
};

/** Tags rendered as a rollable dice chip. The dice notation is the value shown. */
export const ROLL_TAGS = new Set(["damage", "dice", "d20", "hit", "autodice"]);

const ATK_RANGE: Record<string, string> = { m: "Melee", r: "Ranged" };
const ATK_KIND: Record<string, string> = { w: "Weapon Attack:", s: "Spell Attack:" };

/** `{@atk rw}` -> "Ranged Weapon Attack:", `{@atk mw,rw}` -> "Melee or Ranged Weapon Attack:". */
export function formatAtk(code: string): string {
  const codes = code.split(",").map((c) => c.trim()).filter(Boolean);
  const ranges = [...new Set(codes.map((c) => ATK_RANGE[c[0]] ?? ""))].filter(Boolean);
  const kind = codes.map((c) => ATK_KIND[c[1]]).find(Boolean) ?? "Attack:";
  return ranges.length ? `${ranges.join(" or ")} ${kind}` : kind;
}

/** `{@hit 6}` -> "+6"; already-signed values pass through. */
export function formatHit(value: string): string {
  const v = value.trim();
  if (v.startsWith("+") || v.startsWith("-") || v.startsWith("−")) return v;
  const n = Number(v);
  return Number.isFinite(n) && n < 0 ? `${n}` : `+${v}`;
}

/** `{@recharge 5}` -> "(Recharge 5–6)"; `{@recharge}` -> "(Recharge 6)". */
export function formatRecharge(value?: string): string {
  const min = value && value.trim() ? Number(value) : 6;
  return min >= 6 ? "(Recharge 6)" : `(Recharge ${min}–6)`;
}

/**
 * Display text for a tag given its args. Reference/most tags use
 * `name|source|display`; the explicit display override (3rd arg) wins, else the
 * first arg. Dice-scaling tags show their last arg (the per-step dice).
 */
export function displayText(tag: string, args: string[]): string {
  if ((tag === "scaledamage" || tag === "scaledice") && args.length) {
    return args[args.length - 1];
  }
  const override = args[2];
  if (override && override.trim()) return override;
  return args[0] ?? "";
}
