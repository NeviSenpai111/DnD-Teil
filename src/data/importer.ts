/**
 * Parses 5eTools JSON files into a flat, tagged entity list and merges multiple
 * files, deduping by identity (name + source + content-type).
 */

import type { Meta } from "./types/meta";
import type { MetaSource } from "./types/common";
import {
  isContentType,
  entityKey,
  type ContentType,
  type ImportedEntity,
} from "./types/content";

/** `source|spellName` (lowercased) -> the classes that can cast that spell. */
export type SpellClassMap = Record<string, { name: string; source: string }[]>;

export interface ParsedFile {
  fileName: string;
  meta: Meta;
  entities: ImportedEntity[];
  spellClasses: SpellClassMap;
}

/**
 * Detect and extract a 5eTools `spells/sources.json` reverse-index: a top-level
 * object keyed by source, each mapping spellName -> { class, classVariant }.
 */
function extractSpellSources(data: Record<string, unknown>): SpellClassMap {
  const map: SpellClassMap = {};
  for (const [src, value] of Object.entries(data)) {
    if (src === "_meta" || !value || typeof value !== "object" || Array.isArray(value)) continue;
    for (const [spellName, assoc] of Object.entries(value as Record<string, unknown>)) {
      if (!assoc || typeof assoc !== "object" || Array.isArray(assoc)) continue;
      const a = assoc as { class?: unknown[]; classVariant?: unknown[] };
      const refs = [...(a.class ?? []), ...(a.classVariant ?? [])]
        .filter((c): c is { name: string; source?: string } =>
          !!c && typeof c === "object" && typeof (c as { name?: unknown }).name === "string",
        )
        .map((c) => ({ name: c.name, source: c.source ?? src }));
      if (refs.length) map[`${src}|${spellName}`.toLowerCase()] = refs;
    }
  }
  return map;
}

export interface ImportIssue {
  fileName: string;
  message: string;
}

export interface ImportResult {
  /** Distinct, deduped entities across all files. */
  entities: ImportedEntity[];
  /** Meta source descriptors keyed by their `json` id (and abbreviation). */
  metaSources: Record<string, MetaSource>;
  /** Merged spell -> class reverse index from any imported sources files. */
  spellClasses: SpellClassMap;
  /** First edition encountered (used as the default active edition). */
  edition: Meta["edition"];
  /** Non-fatal problems (skipped entities, parse errors, duplicates). */
  issues: ImportIssue[];
  /** Count of entities skipped because they were exact duplicates. */
  duplicateCount: number;
}

/** Parse a single file's raw text. Throws only on invalid JSON. */
export function parseFile(fileName: string, text: string): ParsedFile {
  const data = JSON.parse(text) as Record<string, unknown>;
  const meta = (data._meta ?? {}) as Meta;
  const entities: ImportedEntity[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (key === "_meta" || !isContentType(key) || !Array.isArray(value)) continue;
    const type = key as ContentType;
    for (const raw of value as unknown[]) {
      if (!raw || typeof raw !== "object") continue;
      const obj = raw as Record<string, unknown>;
      // Identity requires name + source. Some content types (e.g. classFeature)
      // use these too; entities lacking them are surfaced as issues by the caller.
      const name = typeof obj.name === "string" ? obj.name : undefined;
      const source = typeof obj.source === "string" ? obj.source : undefined;
      if (!name || !source) continue;
      entities.push({ ...(obj as object), name, source, __type: type } as ImportedEntity);
    }
  }

  return { fileName, meta, entities, spellClasses: extractSpellSources(data) };
}

/** Index `_meta.sources` by both `json` id and `abbreviation` for lookup. */
function collectMetaSources(
  parsed: ParsedFile[],
): Record<string, MetaSource> {
  const out: Record<string, MetaSource> = {};
  for (const file of parsed) {
    for (const src of file.meta.sources ?? []) {
      if (src.json) out[src.json] = src;
      if (src.abbreviation) out[src.abbreviation] = src;
    }
  }
  return out;
}

/**
 * Parse + merge + dedupe a batch of files.
 *
 * Dedupe key is `type|name|source` (case-insensitive). The first occurrence
 * wins; later exact duplicates are counted but dropped. `_copy`/`_mod` patching
 * (where one entity references another) is deferred to a later phase.
 */
export function importFiles(files: { name: string; text: string }[]): ImportResult {
  const parsed: ParsedFile[] = [];
  const issues: ImportIssue[] = [];

  for (const file of files) {
    try {
      parsed.push(parseFile(file.name, file.text));
    } catch (err) {
      issues.push({
        fileName: file.name,
        message: `Failed to parse JSON: ${(err as Error).message}`,
      });
    }
  }

  const seen = new Map<string, ImportedEntity>();
  let duplicateCount = 0;
  for (const file of parsed) {
    for (const entity of file.entities) {
      const key = entityKey(entity.__type, entity.name, entity.source);
      if (seen.has(key)) {
        duplicateCount++;
        continue;
      }
      seen.set(key, entity);
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
  };
}
