/**
 * General modifier engine: any grant (item, species trait, feature) can emit
 * typed modifiers against a named target, and the engine resolves them with
 * stacking rules — instead of hand-coding each source into the derivation.
 *
 * Stacking rules: `bonus` modifiers add, but multiple bonuses from the SAME
 * source count once (the largest). `set` modifiers act as a floor and the
 * highest wins — a circlet that sets INT to 19 can't lower a natural 20.
 * A modifier may carry a condition evaluated against the character's equipment
 * state (armored / unarmored / wielding a shield).
 */

import { ABILITIES } from "./constants";
import type { Race } from "../data/types/character-content";
import type { Item } from "../data/types/item-content";

/** An ability id ("str".."cha"), "ac", "initiative" or "speed". */
export type ModifierTarget = string;

export interface Modifier {
  type: "bonus" | "set";
  target: ModifierTarget;
  value: number;
  /** Granting entity's name — used for display and same-source stacking. */
  source: string;
  condition?: "armored" | "unarmored" | "shield";
}

/** Equipment state the conditions are evaluated against. */
export interface ModifierContext {
  armored: boolean;
  shield: boolean;
}

export function conditionMet(condition: Modifier["condition"], ctx: ModifierContext): boolean {
  if (condition === "armored") return ctx.armored;
  if (condition === "unarmored") return !ctx.armored;
  if (condition === "shield") return ctx.shield;
  return true;
}

export interface ResolvedTarget {
  /** Sum of applicable bonuses (each source counted once). */
  bonus: number;
  /** Highest applicable `set` value, if any. */
  set?: number;
  /** Names of the sources that contributed. */
  sources: string[];
}

/** Resolve every modifier aimed at one target under the given context. */
export function resolveTarget(
  modifiers: Modifier[],
  target: ModifierTarget,
  ctx: ModifierContext,
): ResolvedTarget {
  const active = modifiers.filter((m) => m.target === target && conditionMet(m.condition, ctx));

  // Same-source bonuses don't stack: keep the largest per source.
  const bonusBySource = new Map<string, number>();
  let set: number | undefined;
  for (const m of active) {
    if (m.type === "set") {
      set = set === undefined ? m.value : Math.max(set, m.value);
    } else {
      const prev = bonusBySource.get(m.source);
      if (prev === undefined || m.value > prev) bonusBySource.set(m.source, m.value);
    }
  }
  return {
    bonus: [...bonusBySource.values()].reduce((sum, v) => sum + v, 0),
    set,
    sources: [...new Set(active.map((m) => m.source))],
  };
}

/** Apply a target's modifiers to a base value: floor at `set`, then add bonuses. */
export function applyToValue(
  base: number,
  modifiers: Modifier[],
  target: ModifierTarget,
  ctx: ModifierContext,
): number {
  const r = resolveTarget(modifiers, target, ctx);
  return Math.max(base, r.set ?? -Infinity) + r.bonus;
}

/* ---------- content -> modifiers ---------- */

/** Parse a 5eTools bonus field which may be a number or a "+1" string. */
function parseBonus(value: number | string | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value.replace("+", "")) || 0;
  return 0;
}

/**
 * Modifiers emitted by an item: `bonusAc` (rings/cloaks of protection, magic
 * armor variants) and `ability.static` set-scores (Circlet of Insight-style
 * "your score is N while worn").
 */
export function itemModifiers(item: Item): Modifier[] {
  const out: Modifier[] = [];
  const bonusAc = parseBonus(item.bonusAc);
  if (bonusAc) out.push({ type: "bonus", target: "ac", value: bonusAc, source: item.name });

  const staticSet = (item.ability as { static?: Record<string, number> } | undefined)?.static;
  for (const [ab, value] of Object.entries(staticSet ?? {})) {
    if ((ABILITIES as readonly string[]).includes(ab) && typeof value === "number") {
      out.push({ type: "set", target: ab, value, source: item.name });
    }
  }
  return out;
}

/** Non-numeric passive grants: damage resistances/immunities and senses. */
export interface PassiveTraits {
  resistances: string[];
  immunities: string[];
  senses: string[];
}

/** String entries of a race resist/immune array (choice forms are skipped). */
function stringEntries(list: unknown[] | undefined): string[] {
  return (list ?? []).filter((e): e is string => typeof e === "string");
}

/** Passive traits from the species (race + subrace). */
export function racePassives(races: (Race | undefined)[]): PassiveTraits {
  const resistances = new Set<string>();
  const immunities = new Set<string>();
  const senses = new Set<string>();
  for (const race of races) {
    if (!race) continue;
    for (const r of stringEntries(race.resist)) resistances.add(r);
    for (const r of stringEntries(race.immune)) immunities.add(r);
    if (typeof race.darkvision === "number") senses.add(`Darkvision ${race.darkvision} ft.`);
  }
  return { resistances: [...resistances], immunities: [...immunities], senses: [...senses] };
}
