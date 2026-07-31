/**
 * Resolves 5eTools `_copy` inheritance.
 *
 * An entity may copy another entity of the same content type (by name + source,
 * plus raceName/raceSource for subraces) and apply `_mod` patch operations. We
 * resolve over the full entity pool so a base in one file can be referenced by a
 * child in another. Bases are resolved first (recursively), with a cycle guard.
 *
 * Supported `_mod` modes: appendArr, prependArr, insertArr, removeArr,
 * replaceArr, replaceTxt. Unknown modes are skipped (logged once).
 */

import type { ImportedEntity } from "./types/content";

interface CopySpec {
  name: string;
  source: string;
  raceName?: string;
  raceSource?: string;
  _mod?: Record<string, unknown>;
  _preserve?: Record<string, unknown>;
}

type AnyRecord = Record<string, unknown>;

const warned = new Set<string>();
function warnOnce(mode: string) {
  if (!warned.has(mode)) {
    warned.add(mode);
    console.warn(`_copy: unsupported _mod mode "${mode}" (skipped)`);
  }
}

function fullKey(type: string, name: string, source: string, raceName?: string, raceSource?: string) {
  const base = `${type}|${name}|${source}`.toLowerCase();
  return type === "subrace" ? `${base}|${raceName ?? ""}|${raceSource ?? ""}`.toLowerCase() : base;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Recursively replace occurrences of `find` with `replace` in all strings. */
function replaceText(node: unknown, find: string, replace: string): unknown {
  if (typeof node === "string") return node.split(find).join(replace);
  if (Array.isArray(node)) return node.map((n) => replaceText(n, find, replace));
  if (node && typeof node === "object") {
    const out: AnyRecord = {};
    for (const [k, v] of Object.entries(node)) out[k] = replaceText(v, find, replace);
    return out;
  }
  return node;
}

function nameOf(item: unknown): string | undefined {
  return item && typeof item === "object" ? (item as AnyRecord).name as string | undefined : undefined;
}

/** Apply one `_mod` operation to a property array on the target. */
function applyOp(target: AnyRecord, prop: string, op: AnyRecord) {
  const mode = op.mode as string;
  const current = Array.isArray(target[prop]) ? [...(target[prop] as unknown[])] : [];

  switch (mode) {
    case "appendArr":
      target[prop] = [...current, ...asArray(op.items)];
      break;
    case "prependArr":
      target[prop] = [...asArray(op.items), ...current];
      break;
    case "insertArr": {
      const idx = typeof op.index === "number" ? op.index : current.length;
      current.splice(idx, 0, ...asArray(op.items));
      target[prop] = current;
      break;
    }
    case "removeArr": {
      const names = asArray(op.names as string | string[] | undefined);
      const items = asArray(op.items);
      target[prop] = current.filter(
        (el) => !names.includes(nameOf(el) ?? "") && !items.includes(el),
      );
      break;
    }
    case "replaceArr": {
      const replaceName = typeof op.replace === "string" ? op.replace : nameOf(op.replace);
      const i = current.findIndex((el) => nameOf(el) === replaceName);
      if (i >= 0) current.splice(i, 1, ...asArray(op.items));
      else current.push(...asArray(op.items));
      target[prop] = current;
      break;
    }
    case "replaceTxt": {
      const find = op.replace as string;
      const withText = op.with as string;
      if (find != null) {
        for (const key of Object.keys(target)) {
          target[key] = replaceText(target[key], find, withText);
        }
      }
      break;
    }
    default:
      warnOnce(mode);
  }
}

function applyMods(target: AnyRecord, mod: Record<string, unknown>) {
  for (const [prop, value] of Object.entries(mod)) {
    for (const op of asArray(value)) {
      if (op && typeof op === "object" && "mode" in op) applyOp(target, prop, op as AnyRecord);
    }
  }
}

/** Resolve `_copy` for every entity, returning a new fully-resolved pool. */
export function resolveCopies(entities: ImportedEntity[]): ImportedEntity[] {
  const byKey = new Map<string, ImportedEntity>();
  for (const e of entities) {
    byKey.set(fullKey(e.__type, e.name, e.source, (e as AnyRecord).raceName as string, (e as AnyRecord).raceSource as string), e);
  }

  const resolved = new Map<string, ImportedEntity>();
  const inProgress = new Set<string>();

  function lookup(type: string, copy: CopySpec): ImportedEntity | undefined {
    return (
      byKey.get(fullKey(type, copy.name, copy.source, copy.raceName, copy.raceSource)) ??
      byKey.get(fullKey(type, copy.name, copy.source))
    );
  }

  function resolve(entity: ImportedEntity): ImportedEntity {
    const key = fullKey(entity.__type, entity.name, entity.source, (entity as AnyRecord).raceName as string, (entity as AnyRecord).raceSource as string);
    const cached = resolved.get(key);
    if (cached) return cached;

    const copy = (entity as AnyRecord)._copy as CopySpec | undefined;
    if (!copy || inProgress.has(key)) {
      const stripped = { ...(entity as AnyRecord) };
      delete stripped._copy;
      const out = stripped as ImportedEntity;
      resolved.set(key, out);
      return out;
    }

    inProgress.add(key);
    const baseRaw = lookup(entity.__type, copy);
    let out: ImportedEntity;

    if (!baseRaw) {
      // Base not imported — keep the child's own fields, drop the _copy marker.
      const stripped = { ...(entity as AnyRecord) };
      delete stripped._copy;
      out = stripped as ImportedEntity;
    } else {
      const base = resolve(baseRaw) as AnyRecord;
      const merged: AnyRecord = structuredClone(base);
      // Child fields override the base.
      for (const [k, v] of Object.entries(entity as AnyRecord)) {
        if (k === "_copy") continue;
        merged[k] = v;
      }
      // Identity always comes from the child.
      merged.name = entity.name;
      merged.source = entity.source;
      merged.__type = entity.__type;
      if (copy._mod) applyMods(merged, copy._mod);
      delete merged._mod;
      out = merged as ImportedEntity;
    }

    inProgress.delete(key);
    resolved.set(key, out);
    return out;
  }

  return entities.map(resolve);
}
