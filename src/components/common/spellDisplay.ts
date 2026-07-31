/**
 * Formatting helpers for 5eTools spell metadata (casting time, range,
 * components, duration). The raw shapes are loosely typed on `Spell`, so these
 * accept `unknown` and degrade gracefully when a field is missing or odd.
 */

import type { Spell } from "../../data/types/spell-content";

export const SCHOOLS: Record<string, string> = {
  A: "Abjuration",
  C: "Conjuration",
  D: "Divination",
  E: "Enchantment",
  V: "Evocation",
  I: "Illusion",
  N: "Necromancy",
  T: "Transmutation",
  P: "Psionic",
};

export function schoolName(code?: string): string | undefined {
  if (!code) return undefined;
  return SCHOOLS[code] ?? code;
}

/** "Cantrip · Evocation" / "Level 3 · Necromancy". */
export function levelSchoolLine(spell: Spell): string {
  const level = spell.level === 0 ? "Cantrip" : `Level ${spell.level}`;
  const school = schoolName(spell.school);
  return school ? `${level} · ${school}` : level;
}

function plural(amount: number, unit: string): string {
  return `${amount} ${unit}${amount === 1 ? "" : "s"}`;
}

/** `[{number: 1, unit: "bonus"}]` → "1 bonus action"; reactions keep their condition. */
export function formatCastingTime(time?: unknown[]): string | undefined {
  if (!Array.isArray(time) || time.length === 0) return undefined;
  const parts = time.map((t) => {
    const entry = t as { number?: number; unit?: string; condition?: string };
    const n = entry.number ?? 1;
    const unit = entry.unit === "bonus" ? "bonus action" : (entry.unit ?? "action");
    const base = ["action", "bonus action", "reaction"].includes(unit)
      ? `${n} ${unit}`
      : plural(n, unit);
    return entry.condition ? `${base}, ${entry.condition}` : base;
  });
  return parts.join(" or ");
}

interface RangeShape {
  type?: string;
  distance?: { type?: string; amount?: number };
}

/** Point ranges ("Self", "Touch", "60 feet") and self-shapes ("Self (30-foot cone)"). */
export function formatRange(range?: unknown): string | undefined {
  const r = range as RangeShape | undefined;
  if (!r || typeof r !== "object") return undefined;
  if (r.type === "special") return "Special";
  const d = r.distance;
  if (!d) return undefined;
  const named: Record<string, string> = {
    self: "Self",
    touch: "Touch",
    sight: "Sight",
    unlimited: "Unlimited",
    plane: "Special",
  };
  if (r.type === "point") {
    if (d.type && named[d.type]) return named[d.type];
    if (d.amount != null) return plural(d.amount, d.type === "miles" ? "mile" : "foot").replace("foots", "feet");
    return undefined;
  }
  // Shaped areas (cone, radius, line, cube, …) emanate from the caster.
  const unit = d.type === "miles" ? "mile" : "foot";
  return d.amount != null ? `Self (${d.amount}-${unit} ${r.type})` : "Self";
}

/** `{v, s, m}` → "V, S, M (a pinch of dust)". */
export function formatComponents(components?: Record<string, unknown>): string | undefined {
  if (!components || typeof components !== "object") return undefined;
  const parts: string[] = [];
  if (components.v) parts.push("V");
  if (components.s) parts.push("S");
  if (components.m) {
    const m = components.m;
    const text = typeof m === "string" ? m : typeof m === "object" && m !== null ? (m as { text?: string }).text : undefined;
    parts.push(text ? `M (${text})` : "M");
  }
  if (components.r) parts.push("R");
  return parts.length > 0 ? parts.join(", ") : undefined;
}

interface DurationShape {
  type?: string;
  duration?: { type?: string; amount?: number };
  concentration?: boolean;
  ends?: string[];
}

/** "Instantaneous", "Concentration, up to 10 minutes", "Until dispelled", … */
export function formatDuration(duration?: unknown[]): string | undefined {
  if (!Array.isArray(duration) || duration.length === 0) return undefined;
  const parts = duration.map((entry) => {
    const d = entry as DurationShape;
    switch (d.type) {
      case "instant":
        return "Instantaneous";
      case "timed": {
        const inner = d.duration;
        const time = inner?.amount != null ? plural(inner.amount, inner.type ?? "round") : "";
        return d.concentration ? `Concentration, up to ${time}` : time || "Timed";
      }
      case "permanent":
        return d.ends?.length
          ? `Until ${d.ends.map((e) => (e === "dispel" ? "dispelled" : e === "trigger" ? "triggered" : e)).join(" or ")}`
          : "Permanent";
      case "special":
        return "Special";
      default:
        return undefined;
    }
  });
  const shown = parts.filter((p): p is string => !!p);
  return shown.length > 0 ? shown.join(" or ") : undefined;
}
