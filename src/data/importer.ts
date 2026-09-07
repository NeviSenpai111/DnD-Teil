/**
 * Parses 5eTools JSON files into a flat, tagged entity list and merges multiple
 * files, deduping by each type's identity (see `types/content.ts`).
 *
 * A 5eTools `data/` tree mixes several kinds of file; every kind is recognised
 * and reported rather than silently yielding "0 entities":
 *
 *  - content files: top-level arrays keyed by content type (`spell`, `class`,
 *    `classFeature`, …), optionally with `_meta`;
 *  - `spells/sources.json`: a spell -> class reverse index;
 *  - `index.json` / `fluff-index.json`: filename maps, nothing to import;
 *  - `book-*.json` / `adventure-*.json`: prose in a `data` array, not entities;
 *  - `foundry*.json`: Foundry VTT automation data whose entries share names
 *    with real content — importing them would shadow the real entities, so
 *    they are always skipped;
 *  - anything else (changelogs, generators, lookup tables) is "unrecognized".
 */

import type { Meta } from "./types/meta";
import type { MetaSource } from "./types/common";
import {
  entityIdentity,
  isContentType,
  type ContentType,
  type ImportedEntity,
} from "./types/content";

/** `source|spellName` (lowercased) -> the classes that can cast that spell. */
export type SpellClassMap = Record<string, { name: string; source: string }[]>;

export type FileKind =
  | "content"
  | "spell-sources"
  | "index"
  | "book"
  | "foundry"
  | "unrecognized";

export const FILE_KIND_LABELS: Record<FileKind, string> = {
  content: "content",
  "spell-sources": "spell class index",
  index: "file index",
  book: "book/adventure text",
  foundry: "Foundry VTT data",
  unrecognized: "no recognized content",
};

export interface SkippedEntities {
  type: string;
  reason: string;
  count: number;
}

export interface ParsedFile {
  fileName: string;
  kind: FileKind;
  meta: Meta;
  entities: ImportedEntity[];
  spellClasses: SpellClassMap;
  /** Entities kept, per content type. */
  typeCounts: Record<string, number>;
  /** Top-level array keys we don't model (reported so gaps are visible). */
  unknownKeys: string[];
  /** Entities dropped, grouped by type + reason. */
  skipped: SkippedEntities[];
}

export type IssueLevel = "info" | "warn" | "error";

export interface ImportIssue {
  fileName: string;
  message: string;
  level: IssueLevel;
}

/** Per-file summary surfaced to the UI. */
export interface FileSummary {
  fileName: string;
  kind: FileKind;
  entityCount: number;
  typeCounts: Record<string, number>;
  skipped: SkippedEntities[];
  unknownKeys: string[];
}

export interface ImportResult {
  /** Distinct, deduped entities across all files. */
  entities: ImportedEntity[];
  /** Meta source descriptors keyed by their `json` id (and abbreviation). */
  metaSources: Record<string, MetaSource>;
  /** Merged spell -> class reverse index from any imported sources files. */
  spellClasses: SpellClassMap;
  /** First edition declared by a file's `_meta` (used as the default active edition). */
  edition: Meta["edition"];
  /** Non-fatal problems (skipped files/entities, parse errors). */
  issues: ImportIssue[];
  /** Count of entities skipped because they were exact duplicates. */
  duplicateCount: number;
  /** One summary per file, in input order. */
  files: FileSummary[];
  /** Entities kept per content type, across all files. */
  typeCounts: Record<string, number>;
}

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function baseName(fileName: string): string {
  const parts = fileName.split(/[\\/]/);
  return (parts[parts.length - 1] ?? fileName).toLowerCase();
}

/**
 * Detect and extract a 5eTools `spells/sources.json` reverse-index: a top-level
 * object keyed by source, each mapping spellName -> { class, classVariant }.
 */
export function extractSpellSources(data: AnyRecord): SpellClassMap {
  const map: SpellClassMap = {};
  for (const [src, value] of Object.entries(data)) {
    if (src === "_meta" || !isRecord(value)) continue;
    for (const [spellName, assoc] of Object.entries(value)) {
      if (!isRecord(assoc)) continue;
      const a = assoc as { class?: unknown; classVariant?: unknown };
      // (`generated/gendata-spell-source-lookup.json` uses nested objects here; ignore it.)
      const lists = [a.class, a.classVariant].filter(Array.isArray) as unknown[][];
      const refs = lists
        .flat()
        .filter(
          (c): c is { name: string; source?: string } =>
            isRecord(c) && typeof (c as { name?: unknown }).name === "string",
        )
        .map((c) => ({ name: c.name, source: c.source ?? src }));
      if (refs.length) map[`${src}|${spellName}`.toLowerCase()] = refs;
    }
  }
  return map;
}

/**
 * Foundry VTT companion files carry the same `name`/`source` as real content
 * but only automation payloads. Detect by filename or by the tell-tale fields.
 */
function looksLikeFoundry(fileName: string, data: AnyRecord): boolean {
  if (baseName(fileName).startsWith("foundry")) return true;
  for (const [key, value] of Object.entries(data)) {
    if (key === "_meta" || !isContentType(key) || !Array.isArray(value)) continue;
    const first = value.find(isRecord);
    if (!first) continue;
    if ("migrationVersion" in first) return true;
    if (!("entries" in first) && ("effects" in first || "activities" in first || "system" in first)) {
      return true;
    }
  }
  return false;
}

/**
 * Normalise one raw entity for a content type. Returns the entity, or the
 * reason it can't be identified. Kept deliberately small: it only fills in
 * identity fields that 5eTools stores elsewhere or omits.
 */
export function normalizeEntity(
  type: ContentType,
  raw: AnyRecord,
): { entity: ImportedEntity } | { reason: string } {
  const obj: AnyRecord = { ...raw };

  // Magic variants carry their source (and page/rarity) under `inherits`.
  if (type === "magicvariant" && typeof obj.source !== "string") {
    const inherits = obj.inherits;
    if (isRecord(inherits) && typeof inherits.source === "string") obj.source = inherits.source;
  }

  // Item types / properties are keyed by abbreviation and mostly nameless.
  if (type === "itemType" || type === "itemProperty") {
    if (typeof obj.abbreviation !== "string") return { reason: "missing abbreviation" };
    if (typeof obj.name !== "string") obj.name = obj.abbreviation;
  }

  // A nameless subrace is "the base race as printed in this source" (it can
  // carry real data — PHB Human's +1 to every ability lives here). Name it
  // after the race so it stays selectable, and flag it.
  if (type === "subrace" && typeof obj.name !== "string") {
    if (typeof obj.raceName !== "string") return { reason: "missing name and raceName" };
    obj.name = obj.raceName;
    obj._isBaseVariant = true;
  }

  if (typeof obj.name !== "string" || !obj.name) return { reason: "missing name" };
  if (typeof obj.source !== "string" || !obj.source) return { reason: "missing source" };

  obj.__type = type;
  return { entity: obj as ImportedEntity };
}

function emptyParsed(fileName: string, kind: FileKind, meta: Meta = {}): ParsedFile {
  return {
    fileName,
    kind,
    meta,
    entities: [],
    spellClasses: {},
    typeCounts: {},
    unknownKeys: [],
    skipped: [],
  };
}

/** Parse a single file's raw text. Throws only on invalid JSON. */
export function parseFile(fileName: string, text: string): ParsedFile {
  const data = JSON.parse(text) as unknown;
  if (!isRecord(data)) return emptyParsed(fileName, "unrecognized");

  const meta = (isRecord(data._meta) ? data._meta : {}) as Meta;
  if (looksLikeFoundry(fileName, data)) return emptyParsed(fileName, "foundry", meta);

  const entities: ImportedEntity[] = [];
  const typeCounts: Record<string, number> = {};
  const unknownKeys: string[] = [];
  const skippedMap = new Map<string, SkippedEntities>();
  let contentArrays = 0;

  for (const [key, value] of Object.entries(data)) {
    if (key === "_meta" || !Array.isArray(value)) continue;
    if (!isContentType(key)) {
      // `data` is book/adventure prose; other object arrays are unmodelled types.
      if (key !== "data" && value.some(isRecord)) unknownKeys.push(key);
      continue;
    }
    contentArrays++;
    for (const raw of value) {
      if (!isRecord(raw)) continue;
      const result = normalizeEntity(key, raw);
      if ("entity" in result) {
        entities.push(result.entity);
        typeCounts[key] = (typeCounts[key] ?? 0) + 1;
      } else {
        const k = `${key}|${result.reason}`;
        const existing = skippedMap.get(k);
        if (existing) existing.count++;
        else skippedMap.set(k, { type: key, reason: result.reason, count: 1 });
      }
    }
  }

  if (contentArrays > 0) {
    return {
      fileName,
      kind: "content",
      meta,
      entities,
      spellClasses: {},
      typeCounts,
      unknownKeys,
      skipped: [...skippedMap.values()],
    };
  }

  if (Array.isArray(data.data)) return emptyParsed(fileName, "book", meta);

  const values = Object.entries(data)
    .filter(([k]) => k !== "_meta")
    .map(([, v]) => v);
  if (values.length && values.every((v) => typeof v === "string")) {
    return emptyParsed(fileName, "index", meta);
  }

  const spellClasses = extractSpellSources(data);
  if (Object.keys(spellClasses).length) {
    return { ...emptyParsed(fileName, "spell-sources", meta), spellClasses };
  }

  return { ...emptyParsed(fileName, "unrecognized", meta), unknownKeys };
}

/** Index `_meta.sources` by both `json` id and `abbreviation` for lookup. */
function collectMetaSources(parsed: ParsedFile[]): Record<string, MetaSource> {
  const out: Record<string, MetaSource> = {};
  for (const file of parsed) {
    for (const src of file.meta.sources ?? []) {
      if (!isRecord(src) || typeof src.json !== "string") continue;
      out[src.json] = src as unknown as MetaSource;
      if (typeof src.abbreviation === "string") out[src.abbreviation] = src as unknown as MetaSource;
    }
  }
  return out;
}

function describeSkipped(s: SkippedEntities): string {
  return `${s.count} ${s.type} entr${s.count === 1 ? "y" : "ies"} skipped: ${s.reason}`;
}

/**
 * Parse + merge + dedupe a batch of files.
 *
 * Dedupe key is each type's identity (case-insensitive). The first occurrence
 * wins; later exact duplicates are counted but dropped. `_copy`/`_mod`
 * patching and `_versions` expansion happen in `copyResolver.ts` over the full
 * pool (so a base in one file can be referenced by a child in another).
 */
export function importFiles(files: { name: string; text: string }[]): ImportResult {
  const parsed: ParsedFile[] = [];
  const issues: ImportIssue[] = [];
  const summaries: FileSummary[] = [];

  for (const file of files) {
    let p: ParsedFile;
    try {
      p = parseFile(file.name, file.text);
    } catch (err) {
      issues.push({
        fileName: file.name,
        level: "error",
        message: `Failed to parse JSON: ${(err as Error).message}`,
      });
      continue;
    }
    parsed.push(p);
    summaries.push({
      fileName: p.fileName,
      kind: p.kind,
      entityCount: p.entities.length,
      typeCounts: p.typeCounts,
      skipped: p.skipped,
      unknownKeys: p.unknownKeys,
    });

    if (p.kind === "foundry") {
      issues.push({ fileName: p.fileName, level: "info", message: "Skipped Foundry VTT data (would shadow real content)" });
    } else if (p.kind === "book") {
      issues.push({ fileName: p.fileName, level: "info", message: "Skipped book/adventure text (not entity data)" });
    } else if (p.kind === "index") {
      issues.push({ fileName: p.fileName, level: "info", message: "Skipped file index" });
    } else if (p.kind === "unrecognized") {
      issues.push({
        fileName: p.fileName,
        level: "info",
        message: p.unknownKeys.length
          ? `No recognized content; unmodelled arrays: ${p.unknownKeys.join(", ")}`
          : "No recognized content",
      });
    } else if (p.kind === "content" && p.unknownKeys.length) {
      issues.push({
        fileName: p.fileName,
        level: "info",
        message: `Unmodelled arrays ignored: ${p.unknownKeys.join(", ")}`,
      });
    }
    for (const s of p.skipped) {
      issues.push({ fileName: p.fileName, level: "warn", message: describeSkipped(s) });
    }
  }

  const seen = new Map<string, ImportedEntity>();
  const typeCounts: Record<string, number> = {};
  let duplicateCount = 0;
  for (const file of parsed) {
    for (const entity of file.entities) {
      const key = entityIdentity(entity);
      if (seen.has(key)) {
        duplicateCount++;
        continue;
      }
      seen.set(key, entity);
      typeCounts[entity.__type] = (typeCounts[entity.__type] ?? 0) + 1;
    }
  }

  let edition: Meta["edition"];
  for (const file of parsed) {
    if (file.meta.edition) {
      edition = file.meta.edition;
      break;
    }
  }

  const spellClasses: SpellClassMap = {};
  for (const file of parsed) Object.assign(spellClasses, file.spellClasses);

  return {
    entities: [...seen.values()],
    metaSources: collectMetaSources(parsed),
    spellClasses,
    edition,
    issues,
    duplicateCount,
    files: summaries,
    typeCounts,
  };
}
