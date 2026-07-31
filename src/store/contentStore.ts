/**
 * Global store for imported 5eTools content: the entity pool, which sources are
 * active, the active rules edition, and the cross-reference index.
 */

import { useMemo } from "react";
import { create } from "zustand";
import type { MetaSource } from "../data/types/common";
import type { Edition } from "../data/types/meta";
import { entityKey, type ImportedEntity } from "../data/types/content";
import { ContentIndex, type SourceInfo } from "../data/contentIndex";
import { resolveCopies } from "../data/copyResolver";
import { importFiles, type ImportIssue, type ImportResult, type SpellClassMap } from "../data/importer";

interface ContentState {
  entities: ImportedEntity[];
  metaSources: Record<string, MetaSource>;
  /** source string -> enabled. Newly imported sources default to enabled. */
  activeSources: Record<string, boolean>;
  edition: Edition;
  spellClasses: SpellClassMap;
  index: ContentIndex;
  issues: ImportIssue[];

  /** Parse + merge files into the existing pool (additive; re-imports update). */
  importTexts: (files: { name: string; text: string }[]) => ImportResult;
  toggleSource: (source: string) => void;
  setEdition: (edition: Edition) => void;
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
};

export const useContentStore = create<ContentState>((set, get) => ({
  ...EMPTY,
  index: buildIndex(EMPTY),
  issues: [],

  importTexts: (files) => {
    const result = importFiles(files);
    const prev = get();

    // Merge entity pools, newest import wins on key collision.
    const merged = new Map<string, ImportedEntity>();
    for (const e of prev.entities) merged.set(entityKey(e.__type, e.name, e.source), e);
    for (const e of result.entities) merged.set(entityKey(e.__type, e.name, e.source), e);
    // Resolve _copy/_mod over the full pool so cross-file bases are available.
    const entities = resolveCopies([...merged.values()]);

    const metaSources = { ...prev.metaSources, ...result.metaSources };
    const spellClasses = { ...prev.spellClasses, ...result.spellClasses };

    // Enable any source we haven't seen before; preserve existing toggles.
    const activeSources = { ...prev.activeSources };
    for (const e of result.entities) {
      if (!(e.source in activeSources)) activeSources[e.source] = true;
    }

    const edition = result.edition ?? prev.edition;
    const snapshot: ContentSnapshot = { entities, metaSources, activeSources, edition, spellClasses };

    set({
      ...snapshot,
      index: buildIndex(snapshot),
      issues: [...prev.issues, ...result.issues],
    });
    return result;
  },

  toggleSource: (source) =>
    set((s) => ({
      activeSources: { ...s.activeSources, [source]: !s.activeSources[source] },
    })),

  setEdition: (edition) => set({ edition }),

  hydrate: (snapshot) => {
    const next: ContentSnapshot = { ...EMPTY, ...snapshot };
    set({ ...next, index: buildIndex(next), issues: [] });
  },

  reset: () => set({ ...EMPTY, index: buildIndex(EMPTY), issues: [] }),
}));

/** Entities belonging to currently-enabled sources. */
export function selectActiveEntities(s: ContentState): ImportedEntity[] {
  return s.entities.filter((e) => s.activeSources[e.source] !== false);
}

/** Distinct sources with counts + display names for the toggle UI. */
export function selectSourceInfos(s: ContentState): SourceInfo[] {
  return s.index.distinctSources(s.entities);
}

/**
 * Hook returning the active-source entity list. Selects only stable references
 * from the store and memoizes the derived array — zustand v5 / React 19 throw
 * an infinite-loop error if a store selector returns a fresh array each render.
 */
export function useActiveEntities(): ImportedEntity[] {
  const entities = useContentStore((s) => s.entities);
  const activeSources = useContentStore((s) => s.activeSources);
  return useMemo(
    () => entities.filter((e) => activeSources[e.source] !== false),
    [entities, activeSources],
  );
}

/** Hook returning distinct sources for the toggle UI (memoized; see above). */
export function useSourceInfos(): SourceInfo[] {
  const index = useContentStore((s) => s.index);
  const entities = useContentStore((s) => s.entities);
  return useMemo(() => index.distinctSources(entities), [index, entities]);
}
