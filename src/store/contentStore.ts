/**
 * Global store for imported 5eTools content: the entity pool, which sources are
 * active, the active rules edition, and the cross-reference index.
 */

import { useMemo } from "react";
import { create } from "zustand";
import type { MetaSource } from "../data/types/common";
import type { Edition } from "../data/types/meta";
import { entityIdentity, type ImportedEntity } from "../data/types/content";
import { ContentIndex, type SourceInfo } from "../data/contentIndex";
import { expandVersions, resolveCopies } from "../data/copyResolver";
import { reprintedEntities } from "../data/reprints";
import { importFiles, type ImportIssue, type ImportResult, type SpellClassMap } from "../data/importer";

interface ContentState {
  entities: ImportedEntity[];
  metaSources: Record<string, MetaSource>;
  /** source string -> enabled. Newly imported sources default to enabled. */
  activeSources: Record<string, boolean>;
  edition: Edition;
  spellClasses: SpellClassMap;
  /**
   * List entries a newer enabled source reprints (the 2014 Fighter once the
   * 2024 one is loaded). Hidden by default, as on the site.
   */
  showReprinted: boolean;
  index: ContentIndex;
  /** Issues from every import so far (parse errors, skipped files, `_copy` problems). */
  issues: ImportIssue[];

  /** Parse + merge files into the existing pool (additive; re-imports update). */
  importTexts: (files: { name: string; text: string }[]) => ImportResult;
  toggleSource: (source: string) => void;
  setEdition: (edition: Edition) => void;
  setShowReprinted: (show: boolean) => void;
  /** Replace the whole content state (used when loading from persistence). */
  hydrate: (snapshot: Partial<ContentSnapshot>) => void;
  reset: () => void;
}

/** The serializable slice we persist / restore. */
export interface ContentSnapshot {
  entities: ImportedEntity[];
  metaSources: Record<string, MetaSource>;
  activeSources: Record<string, boolean>;
  edition: Edition;
  spellClasses: SpellClassMap;
  showReprinted: boolean;
}

function buildIndex(snapshot: ContentSnapshot): ContentIndex {
  return new ContentIndex(snapshot.entities, snapshot.metaSources, snapshot.spellClasses);
}

const EMPTY: ContentSnapshot = {
  entities: [],
  metaSources: {},
  activeSources: {},
  edition: "classic",
  spellClasses: {},
  showReprinted: false,
};

/**
 * Merge a batch of freshly-parsed entities into the existing pool and run the
 * resolution passes. Exported for tests and the data-validation script.
 *
 * Order matters: `_copy` bases may live in another file (and in a previous
 * import), so copies are resolved over the merged pool; `_versions` are then
 * expanded from the resolved parents. Both passes are idempotent, so
 * re-running over an already-resolved pool only touches new entities.
 */
export function mergeEntities(
  previous: ImportedEntity[],
  incoming: ImportedEntity[],
  issues?: ImportIssue[],
): ImportedEntity[] {
  const merged = new Map<string, ImportedEntity>();
  for (const e of previous) merged.set(entityIdentity(e), e);
  // Newest import wins on identity collision.
  for (const e of incoming) merged.set(entityIdentity(e), e);

  const resolved = resolveCopies([...merged.values()], issues);
  const expanded = expandVersions(resolved, issues);

  // Versions regenerated from a re-imported parent replace their old siblings.
  const deduped = new Map<string, ImportedEntity>();
  for (const e of expanded) deduped.set(entityIdentity(e), e);
  return [...deduped.values()];
}

export const useContentStore = create<ContentState>((set, get) => ({
  ...EMPTY,
  index: buildIndex(EMPTY),
  issues: [],

  importTexts: (files) => {
    const result = importFiles(files);
    const prev = get();

    const issues = [...result.issues];
    const entities = mergeEntities(prev.entities, result.entities, issues);

    const metaSources = { ...prev.metaSources, ...result.metaSources };
    const spellClasses = { ...prev.spellClasses, ...result.spellClasses };

    // Enable any source we haven't seen before; preserve existing toggles.
    const activeSources = { ...prev.activeSources };
    for (const e of entities) {
      if (!(e.source in activeSources)) activeSources[e.source] = true;
    }

    const edition = result.edition ?? prev.edition;
    const snapshot: ContentSnapshot = {
      entities,
      metaSources,
      activeSources,
      edition,
      spellClasses,
      showReprinted: prev.showReprinted,
    };

    set({
      ...snapshot,
      index: buildIndex(snapshot),
      issues: [...prev.issues, ...issues],
    });
    return { ...result, issues };
  },

  toggleSource: (source) =>
    set((s) => ({
      activeSources: { ...s.activeSources, [source]: !s.activeSources[source] },
    })),

  setEdition: (edition) => set({ edition }),

  setShowReprinted: (showReprinted) => set({ showReprinted }),

  hydrate: (snapshot) => {
    const next: ContentSnapshot = { ...EMPTY, ...snapshot };
    set({ ...next, index: buildIndex(next), issues: [] });
  },

  reset: () => set({ ...EMPTY, index: buildIndex(EMPTY), issues: [] }),
}));

/**
 * Reprinted entities for the current pool + source toggles. Cached on the
 * inputs' identity so store selectors get a stable reference (zustand v5 /
 * React 19 throw on selectors returning fresh objects each render).
 */
let reprintCache:
  | { entities: ImportedEntity[]; index: ContentIndex; activeSources: Record<string, boolean>; result: Set<ImportedEntity> }
  | undefined;
export function selectReprinted(s: ContentState): Set<ImportedEntity> {
  const c = reprintCache;
  if (c && c.entities === s.entities && c.index === s.index && c.activeSources === s.activeSources) return c.result;
  const result = reprintedEntities(s.entities, s.index, s.activeSources);
  reprintCache = { entities: s.entities, index: s.index, activeSources: s.activeSources, result };
  return result;
}

/** Entities belonging to enabled sources, minus reprinted ones unless `showReprinted`. */
export function selectActiveEntities(s: ContentState): ImportedEntity[] {
  const reprinted = selectReprinted(s);
  return s.entities.filter(
    (e) => s.activeSources[e.source] !== false && (s.showReprinted || !reprinted.has(e)),
  );
}

/** Distinct sources with counts + display names for the toggle UI. */
export function selectSourceInfos(s: ContentState): SourceInfo[] {
  return s.index.distinctSources(s.entities);
}

/** Hook returning the reprinted entities (stable reference; see `selectReprinted`). */
export function useReprintedEntities(): Set<ImportedEntity> {
  return useContentStore(selectReprinted);
}

/**
 * Hook returning the list-able entity pool: enabled sources only, and no
 * reprinted entries unless the user asked for them. Resolution of things a
 * character already chose should go through `index` (the full pool) instead.
 * Memoized because a selector returning a fresh array each render loops.
 */
export function useActiveEntities(): ImportedEntity[] {
  const entities = useContentStore((s) => s.entities);
  const activeSources = useContentStore((s) => s.activeSources);
  const showReprinted = useContentStore((s) => s.showReprinted);
  const reprinted = useReprintedEntities();
  return useMemo(
    () =>
      entities.filter(
        (e) => activeSources[e.source] !== false && (showReprinted || !reprinted.has(e)),
      ),
    [entities, activeSources, showReprinted, reprinted],
  );
}

/** Hook returning distinct sources for the toggle UI (memoized; see above). */
export function useSourceInfos(): SourceInfo[] {
  const index = useContentStore((s) => s.index);
  const entities = useContentStore((s) => s.entities);
  return useMemo(() => index.distinctSources(entities), [index, entities]);
}
