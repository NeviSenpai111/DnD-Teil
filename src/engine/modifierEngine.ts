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

import { ABILITIES, SKILL_BY_ID, skillNameToId } from "./constants";
import type { Race } from "../data/types/character-content";
import type { Item } from "../data/types/item-content";

/** An ability id ("str".."cha"), "ac", "initiative", "speed", or a skill id. */
export type ModifierTarget = string;

export interface Modifier {
  /** `bonus`/`set` are numeric; `proficiency` grants the target skill;
   * `advantage` marks the target's d20 rolls (skill id or "initiative"). */
  type: "bonus" | "set" | "proficiency" | "advantage";
  target: ModifierTarget;
  /** Required for bonus/set; ignored for proficiency/advantage. */
  value?: number;
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
  const active = modifiers.filter(
    (m) =>
      m.target === target &&
      (m.type === "bonus" || m.type === "set") &&
      conditionMet(m.condition, ctx),
  );

  // Same-source bonuses don't stack: keep the largest per source.
  const bonusBySource = new Map<string, number>();
  let set: number | undefined;
  for (const m of active) {
    const value = m.value ?? 0;
    if (m.type === "set") {
      set = set === undefined ? value : Math.max(set, value);
    } else {
      const prev = bonusBySource.get(m.source);
      if (prev === undefined || value > prev) bonusBySource.set(m.source, value);
    }
  }
  return {
    bonus: [...bonusBySource.values()].reduce((sum, v) => sum + v, 0),
    set,
    sources: [...new Set(active.map((m) => m.source))],
  };
}

/** Targets of active `proficiency` modifiers (skill ids to mark proficient). */
export function proficiencyTargets(modifiers: Modifier[], ctx: ModifierContext): string[] {
  return [
    ...new Set(
      modifiers
        .filter((m) => m.type === "proficiency" && conditionMet(m.condition, ctx))
        .map((m) => m.target),
    ),
  ];
}

/** Active `advantage` markers: target -> granting source names. */
export function advantageTargets(
  modifiers: Modifier[],
  ctx: ModifierContext,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of modifiers) {
    if (m.type !== "advantage" || !conditionMet(m.condition, ctx)) continue;
    (out[m.target] ??= []).push(m.source);
  }
  return out;
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

/** Plain-text of an item's entries (for text-derived modifiers). */
function itemText(item: Item): string {
  const parts: string[] = [];
  const walk = (entry: unknown) => {
    if (typeof entry === "string") parts.push(entry);
    else if (Array.isArray(entry)) entry.forEach(walk);
    else if (entry && typeof entry === "object") walk((entry as { entries?: unknown }).entries);
  };
  walk(item.entries);
  return parts.join(" ");
}

/** Resolve a written skill name to a known skill id, else undefined. */
function knownSkillId(name: string): string | undefined {
  const id = skillNameToId(name.trim());
  return SKILL_BY_ID[id] ? id : undefined;
}

/**
 * Modifiers emitted by an item: `bonusAc` (rings/cloaks of protection, magic
 * armor variants), `ability.static` set-scores (Circlet of Insight-style
 * "your score is N while worn"), and text-derived advantage — items whose
 * description says "advantage on Dexterity (Stealth) checks" (or
 * "advantage on Stealth checks") mark that skill while equipped.
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

  const text = itemText(item);
  const seen = new Set<string>();
  for (const m of text.matchAll(/advantage on (?:\w+ )?\(([^)]+)\) checks/gi)) {
    const id = knownSkillId(m[1]);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push({ type: "advantage", target: id, source: item.name });
    }
  }
  for (const m of text.matchAll(/advantage on ([A-Za-z][A-Za-z' ]*?) checks/gi)) {
    const id = knownSkillId(m[1]);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push({ type: "advantage", target: id, source: item.name });
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
