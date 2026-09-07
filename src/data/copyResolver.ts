/**
 * Resolves 5eTools `_copy` inheritance and `_versions` expansion.
 *
 * Ported from 5eTools' `DataUtil.generic.copyApplier` so imported data behaves
 * as it does on the site:
 *
 *  - A child copies a base of the same content type, located by the type's
 *    full identity (subclasses by class, subclass features by class + subclass
 *    + level, subraces by race, deities by pantheon, item types by
 *    abbreviation, …). Bases are resolved first (recursively, cycle-guarded)
 *    and may live in another file.
 *  - Child fields win. A child field set to `null` deletes the base field.
 *    Metadata fields (`page`, `srd`, `reprintedAs`, `hasFluff`, …) are NOT
 *    inherited unless `_copy._preserve` names them (or is `{"*": true}`).
 *  - `_copy._templates` (monsters, legendary groups) pull `apply._root`
 *    properties and `apply._mod` operations from a `*Template` entity.
 *  - `_mod` operations: every mode the site supports, including bestiary ones
 *    (`addSkills`, `addSpells`, `scalarAddHit`, …). `replaceTxt` uses regex
 *    semantics and skips text inside `{@tags}` unless `tagInsensitive`.
 *    Dynamic `<$short_name$>` / `<$dc__con$>` / … variables in `_mod` values
 *    resolve against the copied entity.
 *  - `_versions` produce sibling entities (e.g. "Dragonborn (Black)",
 *    "Archmage (Familiar)", "Magic Initiate; Cleric") by copying the parent and
 *    applying the version's mods; `_abstract` + `_implementations` templates
 *    substitute `{{variables}}`.
 *
 * Failures never throw: they are reported as import issues and the entity is
 * kept with whatever could be applied.
 */

import type { ImportIssue } from "./importer";
import {
  entityIdentity,
  entityKey,
  identityOf,
  type ContentType,
  type ImportedEntity,
} from "./types/content";

type AnyRecord = Record<string, unknown>;

interface CopyMeta {
  name?: string;
  source?: string;
  _mod?: Record<string, unknown>;
  _preserve?: Record<string, boolean>;
  _templates?: { name: string; source: string }[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is AnyRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function getPath(obj: unknown, path: string[] | null): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const p of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as AnyRecord)[p];
  }
  return cur;
}

function setPath(obj: AnyRecord, path: string[], value: unknown): void {
  if (!path.length) return;
  let cur: AnyRecord = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const p = path[i];
    if (!isRecord(cur[p])) cur[p] = {};
    cur = cur[p] as AnyRecord;
  }
  cur[path[path.length - 1]] = value;
}

function deletePath(obj: AnyRecord, path: string[]): void {
  if (!path.length) return;
  const parent = path.length === 1 ? obj : getPath(obj, path.slice(0, -1));
  if (isRecord(parent)) delete parent[path[path.length - 1]];
}

/** Map every string inside a value (recursively), returning a new value. */
function walkStrings(node: unknown, fn: (s: string) => string): unknown {
  if (typeof node === "string") return fn(node);
  if (Array.isArray(node)) return node.map((n) => walkStrings(n, fn));
  if (isRecord(node)) {
    const out: AnyRecord = {};
    for (const [k, v] of Object.entries(node)) out[k] = walkStrings(v, fn);
    return out;
  }
  return node;
}

/** Split a string into plain-text segments and top-level `{@tag ...}` segments. */
export function splitByTags(str: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const next = str[i + 1];
    if (c === "{" && (next === "@" || next === "=")) {
      if (depth++ > 0) {
        cur += "{";
      } else {
        if (cur) out.push(cur);
        cur = `{${next}`;
        i++;
      }
      continue;
    }
    if (c === "}") {
      cur += "}";
      if (depth !== 0 && --depth === 0) {
        out.push(cur);
        cur = "";
      }
      continue;
    }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

function replaceOutsideTags(str: string, re: RegExp, withStr: string, tagInsensitive: boolean): string {
  if (tagInsensitive) return str.replace(re, withStr);
  return splitByTags(str)
    .map((seg) => (seg.startsWith("{@") ? seg : seg.replace(re, withStr)))
    .join("");
}

function deepEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function signed(n: number): string {
  return `${n >= 0 ? "+" : ""}${n}`;
}

/**
 * Evaluate a plain arithmetic expression (`+ - * /`, parentheses, decimals).
 * Replaces the site's `eval` for `calculateProp` / `damage_avg`.
 */
export function evalArithmetic(expr: string): number {
  const s = expr.replace(/\s+/g, "");
  let i = 0;
  const peek = () => s[i];
  const parsePrimary = (): number => {
    if (peek() === "(") {
      i++;
      const v = parseExpr();
      if (peek() === ")") i++;
      return v;
    }
    if (peek() === "-") {
      i++;
      return -parsePrimary();
    }
    if (peek() === "+") {
      i++;
      return parsePrimary();
    }
    const m = /^\d+(?:\.\d+)?|^\.\d+/.exec(s.slice(i));
    if (!m) throw new Error(`Bad expression "${expr}"`);
    i += m[0].length;
    return Number(m[0]);
  };
  const parseTerm = (): number => {
    let v = parsePrimary();
    while (peek() === "*" || peek() === "/") {
      const op = s[i++];
      const r = parsePrimary();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const parseExpr = (): number => {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = s[i++];
      const r = parseTerm();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const v = parseExpr();
  if (i !== s.length) throw new Error(`Bad expression "${expr}"`);
  return v;
}

// ---------------------------------------------------------------------------
// 5e stat helpers (bestiary mods + dynamic variables)
// ---------------------------------------------------------------------------

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;

const SKILL_TO_ABILITY: Record<string, string> = {
  athletics: "str",
  acrobatics: "dex",
  "sleight of hand": "dex",
  stealth: "dex",
  arcana: "int",
  history: "int",
  investigation: "int",
  nature: "int",
  religion: "int",
  "animal handling": "wis",
  insight: "wis",
  medicine: "wis",
  perception: "wis",
  survival: "wis",
  deception: "cha",
  intimidation: "cha",
  performance: "cha",
  persuasion: "cha",
};

const SIZE_ORDER = ["T", "S", "M", "L", "H", "G", "V"];
const SIZE_MULT: Record<string, number> = { L: 2, H: 3, G: 4 };

const CR_TO_XP: Record<string, number> = {
  "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "4": 1100,
  "5": 1800, "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900, "11": 7200,
  "12": 8400, "13": 10000, "14": 11500, "15": 13000, "16": 15000, "17": 18000,
  "18": 20000, "19": 22000, "20": 25000, "21": 33000, "22": 41000, "23": 50000,
  "24": 62000, "25": 75000, "26": 90000, "27": 105000, "28": 120000, "29": 135000,
  "30": 155000,
};

function crString(cr: unknown): string | undefined {
  if (typeof cr === "string") return cr;
  if (typeof cr === "number") return String(cr);
  if (isRecord(cr) && typeof cr.cr === "string") return cr.cr;
  return undefined;
}

function crToNumber(cr: unknown): number {
  const s = crString(cr);
  if (!s) return NaN;
  if (s.includes("/")) {
    const [a, b] = s.split("/").map(Number);
    return b ? a / b : NaN;
  }
  return Number(s);
}

export function crToPb(cr: unknown): number {
  const n = crToNumber(cr);
  if (!Number.isFinite(n)) return 0;
  if (n < 5) return 2;
  return Math.ceil(n / 4) + 1;
}

function abilityScore(ent: AnyRecord, ability: string): number {
  const v = ent[ability];
  return typeof v === "number" ? v : 10;
}

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function shortName(mon: AnyRecord, isTitleCase: boolean): string {
  const name = String(mon.name ?? "");
  const sn = mon.shortName;
  const prefix = mon.isNamedCreature ? "" : isTitleCase ? "The " : "the ";
  if (sn === true) return `${prefix}${name}`;
  if (typeof sn === "string") return `${prefix}${!prefix && isTitleCase ? titleCase(sn) : sn.toLowerCase()}`;
  const base = name.split(",")[0].replace(/(?:adult|ancient|young) \w+ (dragon|dracolich)/gi, "$1");
  return `${prefix}${mon.isNamedCreature ? base.split(" ")[0] : base.toLowerCase()}`;
}

/** Resolve `<$mode__detail$>` variables inside `_mod` values against the entity. */
function resolveVariables(obj: unknown, ent: AnyRecord): unknown {
  return walkStrings(obj, (str) =>
    str.replace(/<\$([^$]+)\$>/g, (whole, variable: string) => {
      const [mode, detail = ""] = variable.split("__");
      switch (mode) {
        case "name":
          return String(ent.name ?? "");
        case "short_name":
          return shortName(ent, false);
        case "title_short_name":
          return shortName(ent, true);
        case "dc":
        case "spell_dc":
          return String(8 + abilityMod(abilityScore(ent, detail)) + crToPb(ent.cr));
        case "to_hit":
          return signed(crToPb(ent.cr) + abilityMod(abilityScore(ent, detail)));
        case "damage_mod": {
          const m = abilityMod(abilityScore(ent, detail));
          return m === 0 ? "" : m > 0 ? ` + ${m}` : ` - ${Math.abs(m)}`;
        }
        case "damage_avg": {
          const replaced = detail.replace(/\b(str|dex|con|int|wis|cha)\b/gi, (_, a: string) =>
            String(abilityMod(abilityScore(ent, a.toLowerCase()))),
          );
          try {
            return String(Math.floor(evalArithmetic(replaced.replace(/[^-+/*0-9.,()]+/g, ""))));
          } catch {
            return whole;
          }
        }
        case "size_mult": {
          const size = Array.isArray(ent.size) ? String(ent.size[0]) : "M";
          return String(SIZE_MULT[size] ?? 1);
        }
        default:
          return whole;
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Preserve rules
// ---------------------------------------------------------------------------

/** Metadata never inherited through `_copy` unless `_preserve` says so. */
const MERGE_REQUIRES_PRESERVE_BASE = new Set([
  "page",
  "otherSources",
  "referenceSources",
  "srd",
  "srd52",
  "basicRules",
  "basicRules2024",
  "reprintedAs",
  "hasFluff",
  "hasFluffImages",
  "hasToken",
  "tokenCredit",
  "tokenCustom",
  "_versions",
]);

const ITEM_PRESERVE = new Set(["lootTables", "tier"]);
const MERGE_REQUIRES_PRESERVE_BY_TYPE: Partial<Record<ContentType, Set<string>>> = {
  monster: new Set([
    "legendaryGroup",
    "environment",
    "soundClip",
    "altArt",
    "variant",
    "dragonCastingColor",
    "familiar",
  ]),
  item: ITEM_PRESERVE,
  itemGroup: ITEM_PRESERVE,
  magicvariant: ITEM_PRESERVE,
};

/** Props a `"*"` mod key applies to. */
const COPY_ENTRY_PROPS = [
  "action",
  "bonus",
  "reaction",
  "trait",
  "legendary",
  "mythic",
  "variant",
  "spellcasting",
  "actionHeader",
  "bonusHeader",
  "reactionHeader",
  "legendaryHeader",
  "mythicHeader",
];

// ---------------------------------------------------------------------------
// _mod application
// ---------------------------------------------------------------------------

interface ModContext {
  copyTo: AnyRecord;
  fail: (message: string) => void;
}

const SPELL_LIST_PROPS = ["constant", "will", "ritual"];
const SPELL_FREQ_PROPS = [
  "recharge",
  "legendary",
  "charges",
  "rest",
  "restLong",
  "daily",
  "weekly",
  "monthly",
  "yearly",
];

function modSpellcastingTrait(ctx: ModContext, op: AnyRecord): AnyRecord | undefined {
  const list = ctx.copyTo.spellcasting;
  if (!Array.isArray(list) || !list.length) {
    ctx.fail(`${op.mode}: creature has no spellcasting property`);
    return undefined;
  }
  const trait = typeof op.name === "string" ? list.find((t) => isRecord(t) && t.name === op.name) : list[0];
  if (!isRecord(trait)) {
    ctx.fail(`${op.mode}: no spellcasting trait named "${String(op.name)}"`);
    return undefined;
  }
  return trait;
}

function modAddSpells(ctx: ModContext, op: AnyRecord) {
  const trait = modSpellcastingTrait(ctx, op);
  if (!trait) return;

  if (isRecord(op.spells)) {
    if (!isRecord(trait.spells)) trait.spells = {};
    const spells = trait.spells as AnyRecord;
    for (const [level, nu] of Object.entries(op.spells)) {
      if (!isRecord(spells[level])) {
        spells[level] = clone(nu);
        continue;
      }
      if (!isRecord(nu)) continue;
      const old = spells[level] as AnyRecord;
      for (const [k, v] of Object.entries(nu)) {
        if (old[k] === undefined) old[k] = clone(v);
        else if (Array.isArray(old[k])) {
          old[k] = [...(old[k] as unknown[]), ...asArray(v as unknown)].sort((a, b) =>
            String(a).toLowerCase().localeCompare(String(b).toLowerCase()),
          );
        } else old[k] = clone(v);
      }
    }
  }

  for (const prop of SPELL_LIST_PROPS) {
    if (!Array.isArray(op[prop])) continue;
    trait[prop] = [...asArray(trait[prop] as unknown[]), ...(op[prop] as unknown[])];
  }

  for (const prop of SPELL_FREQ_PROPS) {
    const add = op[prop];
    if (!isRecord(add)) continue;
    if (!isRecord(trait[prop])) trait[prop] = {};
    const target = trait[prop] as AnyRecord;
    for (const key of Object.keys(add)) {
      target[key] = [...asArray(target[key] as unknown[]), ...asArray(add[key] as unknown[])];
    }
  }
}

function modReplaceSpells(ctx: ModContext, op: AnyRecord) {
  const trait = modSpellcastingTrait(ctx, op);
  if (!trait) return;

  const handleReplace = (container: AnyRecord | undefined, meta: AnyRecord, key: string) => {
    const arr = container?.[key];
    if (!Array.isArray(arr)) return;
    const ix = arr.indexOf(meta.replace);
    if (ix >= 0) {
      arr.splice(ix, 1, ...asArray(meta.with as unknown[]));
      arr.sort((a, b) => String(a).toLowerCase().localeCompare(String(b).toLowerCase()));
    } else ctx.fail(`replaceSpells: could not find spell "${String(meta.replace)}" to replace`);
  };

  if (isRecord(op.spells) && isRecord(trait.spells)) {
    const levels = trait.spells as AnyRecord;
    for (const [level, metas] of Object.entries(op.spells)) {
      const cur = levels[level];
      if (!isRecord(cur)) continue;
      for (const meta of asArray(metas as AnyRecord[])) if (isRecord(meta)) handleReplace(cur, meta, "spells");
    }
  }

  for (const prop of SPELL_FREQ_PROPS) {
    const reps = op[prop];
    if (!isRecord(reps) || !isRecord(trait[prop])) continue;
    const target = trait[prop] as AnyRecord;
    for (const [key, metas] of Object.entries(reps)) {
      for (const meta of asArray(metas as AnyRecord[])) if (isRecord(meta)) handleReplace(target, meta, key);
    }
  }
}

function modRemoveSpells(ctx: ModContext, op: AnyRecord) {
  const trait = modSpellcastingTrait(ctx, op);
  if (!trait) return;
  const without = (arr: unknown, remove: unknown) =>
    Array.isArray(arr) ? arr.filter((it) => !asArray(remove as unknown[]).includes(it)) : arr;

  if (isRecord(op.spells) && isRecord(trait.spells)) {
    const levels = trait.spells as AnyRecord;
    for (const [level, names] of Object.entries(op.spells)) {
      const cur = levels[level];
      if (isRecord(cur)) cur.spells = without(cur.spells, names);
    }
  }
  for (const prop of SPELL_LIST_PROPS) {
    if (op[prop] !== undefined && Array.isArray(trait[prop])) trait[prop] = without(trait[prop], op[prop]);
  }
  for (const prop of SPELL_FREQ_PROPS) {
    const rem = op[prop];
    if (!isRecord(rem) || !isRecord(trait[prop])) continue;
    const target = trait[prop] as AnyRecord;
    for (const [key, names] of Object.entries(rem)) target[key] = without(target[key], names);
  }
}

function modAddSaves(ctx: ModContext, saves: AnyRecord) {
  const to = ctx.copyTo;
  if (!isRecord(to.save)) to.save = {};
  const save = to.save as AnyRecord;
  for (const [ability, mode] of Object.entries(saves)) {
    const total = Number(mode) * crToPb(to.cr) + abilityMod(abilityScore(to, ability));
    if (save[ability] === undefined || Number(save[ability]) < total) save[ability] = signed(total);
  }
}

function modAddSkills(ctx: ModContext, skills: AnyRecord) {
  const to = ctx.copyTo;
  if (!isRecord(to.skill)) to.skill = {};
  const skill = to.skill as AnyRecord;
  for (const [name, mode] of Object.entries(skills)) {
    const ability = SKILL_TO_ABILITY[name.toLowerCase()] ?? "str";
    const total = Number(mode) * crToPb(to.cr) + abilityMod(abilityScore(to, ability));
    if (skill[name] === undefined || Number(skill[name]) < total) skill[name] = signed(total);
  }
}

function modAddSenses(ctx: ModContext, op: AnyRecord) {
  const to = ctx.copyTo;
  if (!Array.isArray(to.senses)) to.senses = [];
  const senses = to.senses as unknown[];
  for (const sense of asArray(op.senses as AnyRecord[])) {
    if (!isRecord(sense) || typeof sense.type !== "string") continue;
    const range = Number(sense.range);
    const re = new RegExp(`${sense.type} (\\d+)`, "i");
    let found = false;
    for (let i = 0; i < senses.length; i++) {
      const m = typeof senses[i] === "string" ? re.exec(senses[i] as string) : null;
      if (m) {
        found = true;
        if (Number(m[1]) < range) senses[i] = `${sense.type} ${range} ft.`;
        break;
      }
    }
    if (!found) senses.push(`${sense.type} ${range} ft.`);
  }
}

function modMaxSize(ctx: ModContext, op: AnyRecord) {
  const to = ctx.copyTo;
  const sizes = asArray(to.size as string[]).map(String);
  const ixMax = SIZE_ORDER.indexOf(String(op.max));
  const ixs = sizes.map((s) => SIZE_ORDER.indexOf(s));
  if (ixMax < 0 || ixs.some((ix) => ix < 0)) {
    ctx.fail(`maxSize: unhandled size in ${JSON.stringify(sizes)} / ${String(op.max)}`);
    return;
  }
  const next = ixs.filter((ix) => ix <= ixMax).sort((a, b) => a - b);
  if (!next.length) next.push(ixMax);
  to.size = next.map((ix) => SIZE_ORDER[ix]);
}

function modScalarMultXp(ctx: ModContext, op: AnyRecord) {
  const to = ctx.copyTo;
  const scalar = Number(op.scalar);
  const out = (n: number) => (op.floor ? Math.floor(n * scalar) : n * scalar);
  if (isRecord(to.cr) && typeof to.cr.xp === "number") {
    to.cr.xp = out(to.cr.xp);
    return;
  }
  const s = crString(to.cr);
  const base = s !== undefined ? CR_TO_XP[s] : undefined;
  if (base === undefined) return;
  if (!isRecord(to.cr)) to.cr = { cr: s };
  (to.cr as AnyRecord).xp = out(base);
}

/** Apply one `_mod` operation. `propPath` is null for root (`_`) operations. */
function applyModOp(ctx: ModContext, propPath: string[] | null, op: unknown): void {
  const { copyTo, fail } = ctx;

  if (typeof op === "string") {
    if (op === "remove" && propPath) deletePath(copyTo, propPath);
    else fail(`unhandled _mod "${op}"`);
    return;
  }
  if (!isRecord(op) || typeof op.mode !== "string") {
    fail("malformed _mod operation");
    return;
  }
  const mode = op.mode;

  const requireArray = (): unknown[] | undefined => {
    const arr = getPath(copyTo, propPath);
    if (Array.isArray(arr)) return arr;
    fail(`${mode}: could not find "${propPath?.join(".") ?? "_"}" array`);
    return undefined;
  };

  switch (mode) {
    case "appendStr": {
      if (!propPath) return;
      const existing = getPath(copyTo, propPath);
      setPath(
        copyTo,
        propPath,
        existing ? `${String(existing)}${String(op.joiner ?? "")}${String(op.str ?? "")}` : String(op.str ?? ""),
      );
      return;
    }

    case "replaceName": {
      const ents = getPath(copyTo, propPath);
      if (!Array.isArray(ents)) return;
      const re = new RegExp(String(op.replace), `g${String(op.flags ?? "")}`);
      for (const ent of ents) {
        if (isRecord(ent) && typeof ent.name === "string") {
          ent.name = replaceOutsideTags(ent.name, re, String(op.with ?? ""), !!op.tagInsensitive);
        }
      }
      return;
    }

    case "replaceTxt": {
      const ents = getPath(copyTo, propPath);
      if (ents === undefined || ents === null || !propPath) return;
      const re = new RegExp(String(op.replace), `g${String(op.flags ?? "")}`);
      const handler = (s: string) => replaceOutsideTags(s, re, String(op.with ?? ""), !!op.tagInsensitive);
      if (typeof ents === "string") {
        setPath(copyTo, propPath, handler(ents));
        return;
      }
      if (!Array.isArray(ents)) return;
      const props = Array.isArray(op.props)
        ? (op.props as (string | null)[])
        : [null, "entries", "headerEntries", "footerEntries"];
      if (!props.length) return;
      let list = ents;
      if (props.includes(null)) {
        list = ents.map((it) => (typeof it === "string" ? handler(it) : it));
        setPath(copyTo, propPath, list);
      }
      for (const ent of list) {
        if (!isRecord(ent)) continue;
        for (const prop of props) {
          if (prop === null) continue;
          if (ent[prop]) ent[prop] = walkStrings(ent[prop], handler);
        }
      }
      return;
    }

    case "prependArr":
    case "appendArr": {
      if (!propPath) return;
      const items = asArray(op.items as unknown[]);
      const existing = getPath(copyTo, propPath);
      const cur = existing === undefined || existing === null ? undefined : asArray(existing as unknown[]);
      setPath(copyTo, propPath, cur ? (mode === "appendArr" ? [...cur, ...items] : [...items, ...cur]) : items);
      return;
    }

    case "appendIfNotExistsArr": {
      if (!propPath) return;
      const items = asArray(op.items as unknown[]);
      const existing = getPath(copyTo, propPath);
      if (existing === undefined || existing === null) {
        setPath(copyTo, propPath, items);
        return;
      }
      const cur = asArray(existing as unknown[]);
      setPath(copyTo, propPath, [...cur, ...items.filter((it) => !cur.some((x) => deepEquals(it, x)))]);
      return;
    }

    case "replaceArr":
    case "replaceOrAppendArr": {
      if (!propPath) return;
      const items = asArray(op.items as unknown[]);
      const arr = getPath(copyTo, propPath);
      const rep = op.replace;
      let ix = -1;
      if (Array.isArray(arr)) {
        if (isRecord(rep) && typeof rep.regex === "string") {
          const re = new RegExp(rep.regex, String(rep.flags ?? ""));
          ix = arr.findIndex((it) =>
            isRecord(it) && typeof it.name === "string" ? re.test(it.name) : typeof it === "string" ? re.test(it) : false,
          );
        } else if (isRecord(rep) && typeof rep.index === "number") {
          ix = rep.index;
        } else {
          ix = arr.findIndex((it) => (isRecord(it) && it.name !== undefined ? it.name === rep : it === rep));
        }
      }
      if (Array.isArray(arr) && ix >= 0) {
        arr.splice(ix, 1, ...items);
        return;
      }
      if (mode === "replaceOrAppendArr") {
        setPath(copyTo, propPath, [...(Array.isArray(arr) ? arr : []), ...items]);
        return;
      }
      if (!Array.isArray(arr)) fail(`replaceArr: could not find "${propPath.join(".")}" array`);
      else fail(`replaceArr: no "${propPath.join(".")}" item matching ${JSON.stringify(rep)}`);
      return;
    }

    case "insertArr": {
      if (!propPath) return;
      const arr = requireArray();
      if (!arr) return;
      const index = typeof op.index === "number" ? (op.index === -1 ? arr.length : op.index) : 0;
      arr.splice(index, 0, ...asArray(op.items as unknown[]));
      return;
    }

    case "removeArr": {
      if (!propPath) return;
      const arr = requireArray();
      if (!arr) return;
      if (op.names !== undefined) {
        for (const name of asArray(op.names as string[])) {
          const ix = arr.findIndex((it) => isRecord(it) && it.name === name);
          if (ix >= 0) arr.splice(ix, 1);
          else if (!op.force) fail(`removeArr: no "${propPath.join(".")}" item named "${name}"`);
        }
      } else if (op.items !== undefined) {
        for (const item of asArray(op.items as unknown[])) {
          const ix = arr.findIndex((it) => it === item || deepEquals(it, item));
          if (ix >= 0) arr.splice(ix, 1);
          else if (!op.force) fail(`removeArr: no "${propPath.join(".")}" item ${JSON.stringify(item)}`);
        }
      } else fail("removeArr: one of names/items required");
      return;
    }

    case "renameArr": {
      if (!propPath) return;
      const arr = requireArray();
      if (!arr) return;
      for (const rename of asArray(op.renames as AnyRecord[])) {
        if (!isRecord(rename)) continue;
        const ent = arr.find((it) => isRecord(it) && it.name === rename.rename);
        if (isRecord(ent)) ent.name = rename.with;
        else fail(`renameArr: no "${propPath.join(".")}" item named "${String(rename.rename)}"`);
      }
      return;
    }

    case "calculateProp": {
      if (!propPath || typeof op.formula !== "string" || typeof op.prop !== "string") return;
      let tgt = getPath(copyTo, propPath);
      if (!isRecord(tgt)) {
        tgt = {};
        setPath(copyTo, propPath, tgt);
      }
      try {
        const expr = op.formula.replace(/<\$([^$]+)\$>/g, (_, v: string) => {
          if (v === "prof_bonus") return String(crToPb(copyTo.cr));
          if (v === "dex_mod") return String(abilityMod(abilityScore(copyTo, "dex")));
          throw new Error(`unknown variable "${v}"`);
        });
        (tgt as AnyRecord)[op.prop] = evalArithmetic(expr.replace(/[^-+/*0-9.,()]+/g, ""));
      } catch (err) {
        fail(`calculateProp: ${(err as Error).message}`);
      }
      return;
    }

    case "scalarAddProp":
    case "scalarMultProp": {
      const tgt = getPath(copyTo, propPath);
      if (!isRecord(tgt)) return;
      const scalar = Number(op.scalar);
      const applyTo = (k: string) => {
        const isString = typeof tgt[k] === "string";
        let out = mode === "scalarAddProp" ? Number(tgt[k]) + scalar : Number(tgt[k]) * scalar;
        if (mode === "scalarMultProp" && op.floor) out = Math.floor(out);
        tgt[k] = isString ? signed(out) : out;
      };
      if (op.prop === "*") Object.keys(tgt).forEach(applyTo);
      else if (typeof op.prop === "string") applyTo(op.prop);
      return;
    }

    case "setProp": {
      const path = typeof op.prop === "string" ? op.prop.split(".") : [];
      if (propPath && !(propPath.length === 1 && propPath[0] === "*")) path.unshift(...propPath);
      if (!path.length) return;
      if (op.value === null) deletePath(copyTo, path);
      else setPath(copyTo, path, clone(op.value));
      return;
    }

    case "prefixSuffixStringProp": {
      const path = typeof op.prop === "string" ? op.prop.split(".") : [];
      if (propPath && !(propPath.length === 1 && propPath[0] === "*")) path.unshift(...propPath);
      const str = getPath(copyTo, path);
      if (typeof str !== "string") return;
      setPath(copyTo, path, `${String(op.prefix ?? "")}${str}${String(op.suffix ?? "")}`);
      return;
    }

    case "scalarAddHit":
    case "scalarAddDc": {
      const existing = getPath(copyTo, propPath);
      if (existing === undefined || existing === null || !propPath) return;
      const scalar = Number(op.scalar);
      const re = mode === "scalarAddHit" ? /{@hit ([-+]?\d+)}/g : /{@dc (\d+)(?:\|[^}]+)?}/g;
      const tag = mode === "scalarAddHit" ? "hit" : "dc";
      setPath(
        copyTo,
        propPath,
        walkStrings(existing, (s) => s.replace(re, (_, n: string) => `{@${tag} ${Number(n) + scalar}}`)),
      );
      return;
    }

    // Bestiary-specific root operations.
    case "addSenses":
      modAddSenses(ctx, op);
      return;
    case "addSaves":
      if (isRecord(op.saves)) modAddSaves(ctx, op.saves);
      return;
    case "addSkills":
      if (isRecord(op.skills)) modAddSkills(ctx, op.skills);
      return;
    case "addAllSaves":
      modAddSaves(ctx, Object.fromEntries(ABILITIES.map((a) => [a, op.saves])));
      return;
    case "addAllSkills":
      modAddSkills(ctx, Object.fromEntries(Object.keys(SKILL_TO_ABILITY).map((s) => [s, op.skills])));
      return;
    case "addSpells":
      modAddSpells(ctx, op);
      return;
    case "replaceSpells":
      modReplaceSpells(ctx, op);
      return;
    case "removeSpells":
      modRemoveSpells(ctx, op);
      return;
    case "maxSize":
      modMaxSize(ctx, op);
      return;
    case "scalarMultXp":
      modScalarMultXp(ctx, op);
      return;

    default:
      fail(`unhandled _mod mode "${mode}"`);
  }
}

function normaliseMods(mods: Record<string, unknown>): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const [k, v] of Object.entries(mods)) out[k] = asArray(v as unknown);
  return out;
}

/** `_` and `*` keys apply after named props, mirroring the site. */
function sortModProps(a: string, b: string): number {
  const rank = (p: string) => (p === "_" ? 1 : p === "*" ? 2 : 0);
  return rank(a) - rank(b);
}

// ---------------------------------------------------------------------------
// _copy application
// ---------------------------------------------------------------------------

export interface ApplyCopyArgs {
  /** The (already resolved) base entity. Consumed; pass a clone. */
  copyFrom: AnyRecord;
  /** The child carrying `_copy`. Mutated in place. */
  copyTo: AnyRecord;
  type: ContentType;
  /** `*Template` entities available for `_copy._templates`. */
  templates: AnyRecord[];
  fail: (message: string) => void;
}

/** Merge `copyFrom` into `copyTo` per `copyTo._copy`, then apply templates and mods. */
export function applyCopy({ copyFrom, copyTo, type, templates, fail }: ApplyCopyArgs): void {
  const copyMeta = (isRecord(copyTo._copy) ? copyTo._copy : {}) as CopyMeta;
  let mods: Record<string, unknown[]> | undefined = isRecord(copyMeta._mod)
    ? normaliseMods(copyMeta._mod)
    : undefined;

  // Templates: merge their mods now, apply their root props after the base copy.
  const templatesToApply: AnyRecord[] = [];
  for (const ref of asArray(copyMeta._templates)) {
    if (!isRecord(ref) || typeof ref.name !== "string") continue;
    const tName = ref.name.toLowerCase().trim();
    const tSource = String(ref.source ?? "").toLowerCase().trim();
    const template = templates.find(
      (t) => String(t.name).toLowerCase().trim() === tName && String(t.source).toLowerCase().trim() === tSource,
    );
    if (!template) {
      fail(`template "${ref.name}" (${String(ref.source)}) not found`);
      continue;
    }
    const tpl = clone(template);
    templatesToApply.push(tpl);
    const apply = isRecord(tpl.apply) ? tpl.apply : {};
    if (isRecord(apply._mod)) {
      const tplMods = normaliseMods(apply._mod);
      if (!mods) mods = tplMods;
      else for (const [k, v] of Object.entries(tplMods)) mods[k] = mods[k] ? [...mods[k], ...v] : v;
    }
  }

  const copyToRootProps = new Set(Object.keys(copyTo));
  const preserve = isRecord(copyMeta._preserve) ? copyMeta._preserve : {};
  const typePreserve = MERGE_REQUIRES_PRESERVE_BY_TYPE[type];

  // Base copy: child fields win; explicit null deletes; metadata needs _preserve.
  for (const k of Object.keys(copyFrom)) {
    if (copyTo[k] === null) {
      delete copyTo[k];
      continue;
    }
    if (copyTo[k] !== undefined) continue;
    if (MERGE_REQUIRES_PRESERVE_BASE.has(k) || typePreserve?.has(k)) {
      if (preserve["*"] || preserve[k]) copyTo[k] = copyFrom[k];
    } else copyTo[k] = copyFrom[k];
  }

  for (const tpl of templatesToApply) {
    const root = isRecord(tpl.apply) && isRecord(tpl.apply._root) ? tpl.apply._root : undefined;
    if (!root) continue;
    for (const [k, v] of Object.entries(root)) if (!copyToRootProps.has(k)) copyTo[k] = v;
  }

  if (mods) {
    const ctx: ModContext = { copyTo, fail };
    const resolvedMods = resolveVariables(mods, copyTo) as Record<string, unknown[]>;
    for (const prop of Object.keys(resolvedMods).sort(sortModProps)) {
      const ops = resolvedMods[prop];
      if (prop === "*") {
        for (const p of COPY_ENTRY_PROPS) for (const op of ops) applyModOp(ctx, [p], op);
      } else if (prop === "_") {
        for (const op of ops) applyModOp(ctx, null, op);
      } else {
        for (const op of ops) applyModOp(ctx, prop.split("."), op);
      }
    }
  }

  copyTo._isCopy = true;
  if (copyMeta._templates) {
    copyTo._copyTemplates = asArray(copyMeta._templates).map((t) => ({ name: t.name, source: t.source }));
  }
  delete copyTo._copy;
}

// ---------------------------------------------------------------------------
// Race + subrace merge (port of Renderer.race._getMergedSubrace)
// ---------------------------------------------------------------------------

/** `Elf` + `High` -> `Elf (High)`; `Dragonborn (Draconblood)` + `Black` -> `Dragonborn (Draconblood; Black)`. */
export function subraceDisplayName(raceName: string, subraceName?: string): string {
  if (!subraceName) return raceName;
  const m = /^(.*?)(\(.*?\))$/i.exec(raceName);
  if (!m) return `${raceName} (${subraceName})`;
  return `${m[1]}(${[m[2].slice(1, -1), subraceName].join("; ")})`;
}

/**
 * Fold a subrace into a copy of its race the way the site does before
 * rendering: entries append (or overwrite a same-named race entry when the
 * subrace entry says `data.overwrite`), ability records merge index-wise
 * (`overwrite.ability` replaces), list proficiencies concatenate, and every
 * other subrace field overrides the race's. Null fields are dropped.
 */
export function mergeSubraceIntoRace(race: AnyRecord, subrace: AnyRecord, fail: (m: string) => void): AnyRecord {
  const cpy = clone(race);
  const sr = clone(subrace);
  cpy._baseName = cpy.name;
  cpy._baseSource = cpy.source;
  for (const k of ["srd", "srd52", "basicRules", "basicRules2024", "_versions", "hasFluff", "hasFluffImages", "reprintedAs"]) {
    delete cpy[k];
  }
  delete sr.__type;
  delete sr._isBaseVariant;
  const overwrite = isRecord(sr.overwrite) ? sr.overwrite : {};

  if (typeof sr.name === "string" && !subrace._isBaseVariant) {
    cpy._subraceName = sr.name;
    cpy.name = subraceDisplayName(String(cpy.name), sr.name);
  }
  delete sr.name;

  if (Array.isArray(sr.ability)) {
    if (overwrite.ability || !Array.isArray(cpy.ability)) cpy.ability = sr.ability.map(() => ({}));
    const target = cpy.ability as AnyRecord[];
    if (target.length !== sr.ability.length) {
      fail("race and subrace ability arrays differ in length; merged by index");
    }
    sr.ability.forEach((obj: unknown, i: number) => {
      if (!isRecord(obj)) return;
      if (!isRecord(target[i])) target[i] = {};
      Object.assign(target[i], obj);
    });
    delete sr.ability;
  }

  if (Array.isArray(sr.entries)) {
    if (!Array.isArray(cpy.entries)) cpy.entries = [];
    const entries = cpy.entries as unknown[];
    for (const ent of sr.entries) {
      const ow = isRecord(ent) && isRecord(ent.data) && typeof ent.data.overwrite === "string" ? ent.data.overwrite : undefined;
      if (!ow) {
        entries.push(ent);
        continue;
      }
      const ix = entries.findIndex(
        (it) => isRecord(it) && typeof it.name === "string" && it.name.toLowerCase().trim() === ow.toLowerCase().trim(),
      );
      if (ix >= 0) entries[ix] = ent;
      else entries.push(ent);
    }
    delete sr.entries;
  }

  for (const prop of ["traitTags", "languageProficiencies"]) {
    if (!Array.isArray(sr[prop])) continue;
    cpy[prop] = overwrite[prop] ? sr[prop] : [...asArray(cpy[prop] as unknown[]), ...(sr[prop] as unknown[])];
    delete sr[prop];
  }

  if (Array.isArray(sr.skillProficiencies)) {
    const cur = cpy.skillProficiencies;
    if (!Array.isArray(cur) || overwrite.skillProficiencies || cur.length !== 1 || sr.skillProficiencies.length !== 1) {
      cpy.skillProficiencies = sr.skillProficiencies;
    } else if (isRecord(cur[0]) && isRecord(sr.skillProficiencies[0])) {
      Object.assign(cur[0], sr.skillProficiencies[0]);
    }
    delete sr.skillProficiencies;
  }

  Object.assign(cpy, sr);
  for (const [k, v] of Object.entries(cpy)) if (v === null || v === undefined) delete cpy[k];
  return cpy;
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

function issueSink(issues: ImportIssue[] | undefined, fileName: string, level: ImportIssue["level"]) {
  return (message: string) => {
    if (issues) issues.push({ fileName, message, level });
  };
}

function label(e: ImportedEntity): string {
  return `${e.__type} "${e.name}" (${e.source})`;
}

function templatesByType(entities: ImportedEntity[]): Map<string, AnyRecord[]> {
  const map = new Map<string, AnyRecord[]>();
  for (const e of entities) {
    if (!e.__type.endsWith("Template")) continue;
    const forType = e.__type.slice(0, -"Template".length);
    const list = map.get(forType);
    if (list) list.push(e);
    else map.set(forType, [e]);
  }
  return map;
}

/**
 * Resolve `_copy` for every entity, returning a new fully-resolved pool in the
 * same order. Problems (missing bases, failed mods, cycles) are appended to
 * `issues` when given.
 */
export function resolveCopies(entities: ImportedEntity[], issues?: ImportIssue[]): ImportedEntity[] {
  const byIdentity = new Map<string, ImportedEntity>();
  const byNameSource = new Map<string, ImportedEntity>();
  for (const e of entities) {
    byIdentity.set(entityIdentity(e), e);
    const nk = entityKey(e.__type, e.name, e.source);
    if (!byNameSource.has(nk)) byNameSource.set(nk, e);
  }
  const templates = templatesByType(entities);

  const resolved = new Map<string, ImportedEntity>();
  const inProgress = new Set<string>();

  function findBase(type: ContentType, spec: CopyMeta): ImportedEntity | undefined {
    const exact = byIdentity.get(identityOf(type, spec));
    if (exact) return exact;
    // Fallback: name + source only (e.g. a spec omitting an identity field).
    if (typeof spec.name === "string" && typeof spec.source === "string") {
      return byNameSource.get(entityKey(type, spec.name, spec.source));
    }
    return undefined;
  }

  function strip(entity: ImportedEntity): ImportedEntity {
    const out = { ...(entity as AnyRecord) };
    delete out._copy;
    return out as ImportedEntity;
  }

  function resolve(entity: ImportedEntity): ImportedEntity {
    const key = entityIdentity(entity);
    const cached = resolved.get(key);
    if (cached) return cached;

    const warn = issueSink(issues, label(entity), "warn");
    const copy = entity._copy;
    let out: ImportedEntity;

    if (copy === undefined) {
      out = entity;
    } else if (!isRecord(copy)) {
      warn("_copy is not an object; ignored");
      out = strip(entity);
    } else if (inProgress.has(key)) {
      warn("circular _copy chain; ignored");
      out = strip(entity);
    } else {
      inProgress.add(key);
      const spec = copy as CopyMeta;
      const base = findBase(entity.__type, spec);
      if (!base) {
        warn(`_copy base "${String(spec.name)}" (${String(spec.source)}) not imported; kept own fields only`);
        out = strip(entity);
      } else if (base === entity) {
        warn("_copy references itself; ignored");
        out = strip(entity);
      } else {
        const copyFrom = clone(resolve(base)) as AnyRecord;
        const copyTo = clone(entity) as AnyRecord;
        applyCopy({ copyFrom, copyTo, type: entity.__type, templates: templates.get(entity.__type) ?? [], fail: warn });
        // Identity always comes from the child.
        copyTo.name = entity.name;
        copyTo.source = entity.source;
        copyTo.__type = entity.__type;
        out = copyTo as ImportedEntity;
      }
      inProgress.delete(key);
    }

    resolved.set(key, out);
    return out;
  }

  return entities.map(resolve);
}

function templateVersions(ver: AnyRecord): AnyRecord[] {
  const abstract = ver._abstract as AnyRecord;
  return asArray(ver._implementations as AnyRecord[])
    .filter(isRecord)
    .map((impl) => {
      let tpl = clone(abstract);
      const cpyImpl = clone(impl);
      const vars = cpyImpl._variables;
      if (isRecord(vars)) {
        tpl = walkStrings(tpl, (s) =>
          s.replace(/{{([^}]+)}}/g, (whole, k: string) => (vars[k] === undefined ? whole : String(vars[k]))),
        ) as AnyRecord;
        delete cpyImpl._variables;
      }
      return Object.assign(tpl, cpyImpl);
    });
}

/** Move a version's `_mod`/`_templates`/`_preserve` into the `_copy` shape `applyCopy` expects. */
function toCopyShape(ver: AnyRecord): void {
  ver._copy = {
    _mod: ver._mod,
    _templates: ver._templates,
    _preserve: ver._preserve ?? { "*": true },
  };
  delete ver._mod;
  delete ver._templates;
  delete ver._preserve;
}

/**
 * Expand `_versions` into sibling entities. Each version copies its parent
 * (preserving metadata) and applies its own mods. The parent keeps everything
 * except the `_versions` array (replaced by `_hasVersions`), so re-running
 * over an already-expanded pool is a no-op.
 *
 * Versions of a *subrace* are expanded against the subrace merged into its
 * race (that is where the entries the mods target live) and emitted as
 * self-contained `race` entities — "Dragonborn (Black)", "Aasimar; Necrotic
 * Shroud" — exactly as the site lists them.
 */
export function expandVersions(entities: ImportedEntity[], issues?: ImportIssue[]): ImportedEntity[] {
  const templates = templatesByType(entities);
  const races = new Map<string, ImportedEntity>();
  for (const e of entities) if (e.__type === "race") races.set(entityKey("race", e.name, e.source), e);
  const out: ImportedEntity[] = [];

  for (const e of entities) {
    const versions = e._versions;
    if (!Array.isArray(versions) || versions.length === 0) {
      out.push(e);
      continue;
    }

    const parent = { ...(e as AnyRecord) };
    delete parent._versions;
    parent._hasVersions = true;
    out.push(parent as ImportedEntity);

    const warn = issueSink(issues, label(e), "warn");

    // Base the copies on: the entity itself, or (subrace) the merged race.
    let base: AnyRecord = e;
    let outType: ContentType = e.__type;
    if (e.__type === "subrace") {
      const race = races.get(entityKey("race", String(e.raceName), String(e.raceSource)));
      if (race) {
        base = mergeSubraceIntoRace(race, e, warn);
        outType = "race";
      } else {
        warn(`parent race "${String(e.raceName)}" (${String(e.raceSource)}) not imported; versions expanded from the subrace alone`);
      }
    }

    for (const raw of versions) {
      if (!isRecord(raw)) continue;
      const expanded =
        isRecord(raw._abstract) && Array.isArray(raw._implementations) ? templateVersions(raw) : [clone(raw)];

      for (const ver of expanded) {
        if (typeof ver.name !== "string" || !ver.name) {
          warn("_versions entry without a name; skipped");
          continue;
        }
        toCopyShape(ver);
        if (typeof ver.source !== "string") ver.source = e.source;

        const copyFrom = clone(base);
        delete copyFrom._versions;
        delete copyFrom._hasVersions;
        delete copyFrom.hasToken;
        delete copyFrom.hasFluff;
        delete copyFrom.hasFluffImages;
        for (const prop of ["additionalSources", "otherSources", "referenceSources"]) {
          const list = copyFrom[prop];
          if (!Array.isArray(list)) continue;
          const kept = list.filter((s) => !isRecord(s) || s.source !== ver.source);
          if (kept.length) copyFrom[prop] = kept;
          else delete copyFrom[prop];
        }

        ver.__type = outType;
        applyCopy({
          copyFrom,
          copyTo: ver,
          type: outType,
          templates: templates.get(outType) ?? [],
          fail: issueSink(issues, `${label(e)} version "${ver.name}"`, "warn"),
        });
        if (outType === "race" && e.__type === "subrace") {
          // A merged race is not itself a subrace of anything.
          delete ver.raceName;
          delete ver.raceSource;
          delete ver._isBaseVariant;
        }
        ver._isVersion = true;
        ver._versionBase_name = e.name;
        ver._versionBase_source = e.source;
        out.push(ver as ImportedEntity);
      }
    }
  }

  return out;
}
