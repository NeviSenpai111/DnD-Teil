/**
 * The character's spells as sheet rows, the way D&D Beyond's Actions and
 * Spells tabs list them: where each spell comes from ("Artificer", "Magic
 * Initiate (Wizard)"), its casting time, range, to-hit or save DC, damage
 * dice (cantrips scaled to the character's level) and component notes.
 */

import type { ContentIndex } from "../../data/contentIndex";
import type { Spell } from "../../data/types/spell-content";
import type { AdditionalSpellSet } from "../../data/types/character-content";
import { featSpellGrants } from "../../engine/featSpells";
import { scaledCantripDice } from "../../engine/spellcasting";
import { ABILITIES, type Ability } from "../../engine/constants";
import { characterLevel, type Character, type EntityRef } from "../../model/character";
import {
  allSpellcastersFor,
  deriveFromCharacter,
  resolveCharacterFeats,
  speciesSpellSources,
} from "../../store/selectors";
import { formatRange } from "../common/spellDisplay";

export type SpellActivation = "action" | "bonus" | "reaction" | "other";

export type SpellHit = { kind: "attack"; bonus: number } | { kind: "save"; ability: Ability; dc: number };

export interface SheetSpellRow {
  ref: EntityRef;
  spell?: Spell;
  level: number;
  /** "Artificer", "Magic Initiate (Wizard)", "Half-Elf". */
  origin: string;
  /** Granted by a feat, the species or the subclass rather than picked. */
  granted?: "Feat" | "Species" | "Subclass";
  activation: SpellActivation;
  /** Compact casting time: "1A", "1BA", "1R", "1 min". */
  time?: string;
  range?: string;
  hit?: SpellHit;
  /** Damage dice, scaled for cantrips: "2d10". */
  damage?: string;
  damageType?: string;
  /** "V/S/M", plus C (concentration) and R (ritual). */
  notes: string;
  ritual: boolean;
  concentration: boolean;
}

const ABILITY_BY_NAME: Record<string, Ability> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};

/** A spell's description as one string. */
function spellText(spell: Spell): string {
  const parts: string[] = [];
  const walk = (entry: unknown) => {
    if (typeof entry === "string") parts.push(entry);
    else if (Array.isArray(entry)) entry.forEach(walk);
    else if (entry && typeof entry === "object") walk((entry as { entries?: unknown }).entries);
  };
  walk(spell.entries);
  return parts.join(" ");
}

/** First `{@damage …}` dice in a spell's text, e.g. "3d8". */
function baseDamage(spell: Spell): string | undefined {
  return /\{@damage ([^}|]+)/.exec(spellText(spell))?.[1]?.trim();
}

/**
 * Attack or save, from the structured fields when present, else from the text
 * ("make a melee spell attack", "must succeed on a Constitution save") — which
 * homebrew often leaves unstructured.
 */
function attackOrSave(spell: Spell | undefined): { attack: boolean; save?: Ability } {
  if (!spell) return { attack: false };
  const structuredSave = spell.savingThrow?.map((s) => ABILITY_BY_NAME[s]).find(Boolean);
  if (spell.spellAttack?.length || structuredSave) return { attack: !!spell.spellAttack?.length, save: structuredSave };
  const text = spellText(spell);
  if (/\{@atk [mr]s\}|\b(melee|ranged) spell attack/i.test(text)) return { attack: true };
  const save = /\b(strength|dexterity|constitution|intelligence|wisdom|charisma) sav/i.exec(text)?.[1];
  return { attack: false, save: save ? ABILITY_BY_NAME[save.toLowerCase()] : undefined };
}

function activationOf(spell: Spell | undefined): { activation: SpellActivation; time?: string } {
  const first = (spell?.time?.[0] ?? undefined) as { number?: number; unit?: string } | undefined;
  if (!first) return { activation: "action" };
  const n = first.number ?? 1;
  switch (first.unit) {
    case "action":
      return { activation: "action", time: `${n}A` };
    case "bonus":
      return { activation: "bonus", time: `${n}BA` };
    case "reaction":
      return { activation: "reaction", time: `${n}R` };
    default: {
      const unit = { minute: "min", hour: "hr", round: "rnd" }[first.unit ?? ""] ?? first.unit;
      return { activation: "other", time: unit ? `${n} ${unit}` : undefined };
    }
  }
}

function componentNotes(spell: Spell | undefined): { notes: string; ritual: boolean; concentration: boolean } {
  const c = spell?.components ?? {};
  const parts = [c.v ? "V" : "", c.s ? "S" : "", c.m ? "M" : ""].filter(Boolean);
  const concentration = (spell?.duration ?? []).some((d) => Boolean((d as { concentration?: boolean }).concentration));
  const ritual = Boolean(spell?.meta?.ritual);
  const flags = [concentration ? "C" : "", ritual ? "R" : ""].filter(Boolean);
  return { notes: [parts.join("/"), ...flags].filter(Boolean).join(", "), ritual, concentration };
}

/** The ability a granted spell is cast with: fixed, or the best of the offered choices. */
function grantAbility(set: AdditionalSpellSet | undefined, mods: Record<Ability, number>): Ability | undefined {
  const ability = (set as { ability?: unknown } | undefined)?.ability;
  if (typeof ability === "string" && (ABILITIES as readonly string[]).includes(ability)) return ability as Ability;
  const options = (ability as { choose?: string[] } | undefined)?.choose?.filter((a): a is Ability =>
    (ABILITIES as readonly string[]).includes(a),
  );
  if (!options?.length) return undefined;
  return options.reduce((best, a) => (mods[a] > mods[best] ? a : best));
}

/**
 * Always-prepared spells a subclass grants by class level (Artillerist, domain
 * and oath spells): its `additionalSpells` prepared/known lists keyed by level.
 * Subclasses offering alternative sets (a choice the app doesn't store) use the first.
 */
function subclassSpells(subclass: { additionalSpells?: AdditionalSpellSet[] } | undefined, classLevel: number): EntityRef[] {
  const set = subclass?.additionalSpells?.[0] as Record<string, unknown> | undefined;
  const out: EntityRef[] = [];
  for (const group of ["prepared", "known"]) {
    const byLevel = set?.[group];
    if (!byLevel || typeof byLevel !== "object" || Array.isArray(byLevel)) continue;
    for (const [level, list] of Object.entries(byLevel as Record<string, unknown>)) {
      if (!(Number(level) <= classLevel) || !Array.isArray(list)) continue;
      for (const entry of list) {
        if (typeof entry !== "string") continue;
        const [name, source] = entry.split("|");
        out.push({ name: name.split("#")[0].trim(), source: source?.trim() ?? "" });
      }
    }
  }
  return out;
}

/** "120 feet" -> "120 ft.", "Self (15-foot cube)" -> "15-ft. cube". */
function compactRange(range: string | undefined): string | undefined {
  return range
    ?.replace(/^Self \((\d+)-foot (\w+)\)$/, "$1-ft. $2")
    .replace(/ (feet|foot)$/, " ft.");
}

/** "Magic Initiate (Wizard Spells)" -> "Magic Initiate (Wizard)". */
function originLabel(name: string, set?: string): string {
  return set ? `${name} (${set.replace(/\s+spells?$/i, "")})` : name;
}

export function sheetSpellRows(character: Character, index: ContentIndex): SheetSpellRow[] {
  const derived = deriveFromCharacter(character, index);
  const casters = allSpellcastersFor(character, index);
  const level = characterLevel(character);
  const rows: SheetSpellRow[] = [];
  const seen = new Set<string>();

  const push = (
    ref: EntityRef,
    origin: string,
    ability: Ability | undefined,
    granted?: SheetSpellRow["granted"],
  ) => {
    const spell = (index.get("spell", ref.name, ref.source) ?? index.findByName("spell", ref.name)) as
      | Spell
      | undefined;
    const key = (spell?.name ?? ref.name).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const mod = ability ? derived.mods[ability] : 0;
    const { attack, save } = attackOrSave(spell);
    const hit: SpellHit | undefined = !ability
      ? undefined
      : attack
        ? { kind: "attack", bonus: mod + derived.pb }
        : save
          ? { kind: "save", ability: save, dc: 8 + mod + derived.pb }
          : undefined;
    const damage = spell ? (scaledCantripDice(spell, level) ?? baseDamage(spell)) : undefined;
    rows.push({
      // Grants name spells loosely ("mage light|SRDLite"); show the real entry.
      ref: spell ? { name: spell.name, source: spell.source } : ref,
      spell,
      level: spell?.level ?? 0,
      origin,
      granted,
      ...activationOf(spell),
      range: compactRange(formatRange(spell?.range)),
      hit,
      damage,
      damageType: spell?.damageInflict?.[0] ?? (spell ? /\{@damage [^}]+\}\s+(\w+) damage/.exec(spellText(spell))?.[1] : undefined),
      ...componentNotes(spell),
    });
  };

  const casterFor = (forClass?: string) => casters.find((c) => c.className === forClass) ?? casters[0];
  for (const pick of [...character.cantrips, ...character.spells]) {
    const caster = casterFor(pick.forClass);
    push(pick, caster?.className ?? pick.forClass ?? "Spell", caster?.summary.ability as Ability | undefined);
  }

  character.classes.forEach((choice, i) => {
    if (!choice.subclass) return;
    const subclass = index
      .getAll("subclass", choice.subclass.name, choice.subclass.source)
      .find((s) => s.className === choice.name) as { additionalSpells?: AdditionalSpellSet[] } | undefined;
    const caster = casters.find((c) => c.classIndex === i);
    for (const ref of subclassSpells(subclass, choice.level)) {
      push(ref, choice.name, caster?.summary.ability as Ability | undefined, "Subclass");
    }
  });

  const fallback = casters[0]?.summary.ability as Ability | undefined;
  const sources = [
    ...resolveCharacterFeats(character, index).map((rf) => ({ entity: rf.feat, keyPrefix: rf.keyPrefix, granted: "Feat" as const })),
    ...speciesSpellSources(character, index).map((s) => ({ ...s, granted: "Species" as const })),
  ];
  for (const { entity, keyPrefix, granted } of sources) {
    const setName = character.featSpellSets[keyPrefix];
    const grants = featSpellGrants(entity, keyPrefix, setName);
    const sets = entity.additionalSpells ?? [];
    const set = sets.length > 1 ? sets.find((s, i) => (s.name ?? `Option ${i + 1}`) === setName) : sets[0];
    const ability = grantAbility(set, derived.mods) ?? fallback;
    const origin = originLabel(entity.name, sets.length > 1 ? setName : undefined);
    const refs: EntityRef[] = [
      ...grants.fixed.map((f) => ({ name: f.name, source: f.source ?? "" })),
      ...grants.picks.flatMap((def) => character.featSpells[def.key] ?? []),
    ];
    for (const ref of refs) push(ref, origin, ability, granted);
  }

  return rows.sort((a, b) => a.level - b.level || a.ref.name.localeCompare(b.ref.name));
}
