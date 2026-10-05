import { useEffect, useMemo, useRef, useState } from "react";
import { useActiveEntities, useReprintedEntities } from "../../store/contentStore";
import type { ContentType, ImportedEntity } from "../../data/types";
import { entityIdentity, isAuxType } from "../../data/types";
import { EmptyState } from "../common/EmptyState";
import { LoadSampleButton } from "../common/ImportButton";
import { useMediaQuery } from "../common/useMediaQuery";
import { EntityDetail } from "./EntityDetail";

/**
 * Browse imported content: a grouped list on the left, a detail pane on the
 * right. Below `md` the two stack: picking an entry swaps the list for its
 * detail, with a back button to return.
 */
export function BrowseView() {
  const entities = useActiveEntities();
  const reprinted = useReprintedEntities();
  const isWide = useMediaQuery("(min-width: 48rem)");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const narrowDetail = !isWide && showDetail;

  // Fluff / templates / glue data are indexed for cross-references but not listed.
  const browsable = useMemo(() => entities.filter((e) => !isAuxType(e.__type)), [entities]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return browsable;
    return browsable.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.__type.toLowerCase().includes(q) ||
        e.source.toLowerCase().includes(q) ||
        (entityMeta(e)?.toLowerCase().includes(q) ?? false),
    );
  }, [browsable, query]);

  const grouped = useMemo(() => groupByType(filtered), [filtered]);
  const selected = useMemo(
    () =>
      browsable.find((e) => entityIdentity(e) === selectedKey) ?? null,
    [browsable, selectedKey],
  );

  // On narrow screens the clicked list button disappears with the list, so
  // move focus to the back button — and back to the entry when returning.
  const skipFocus = useRef(true);
  useEffect(() => {
    if (skipFocus.current) {
      skipFocus.current = false;
      return;
    }
    if (isWide) return;
    if (showDetail) backRef.current?.focus();
    else listRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
  }, [showDetail, isWide]);

  if (entities.length === 0) {
    return (
      <EmptyState title="Nothing to browse yet" actions={<LoadSampleButton />}>
        Load the bundled sample, or import your own 5eTools JSON files from the Import content
        panel.
      </EmptyState>
    );
  }

  const totalMatches = filtered.length;

  return (
    <div className="grid h-full gap-4 md:grid-cols-[18rem_1fr]">
      <h1 className="sr-only">Browse content</h1>
      <div className={`flex min-h-0 flex-col gap-2 ${narrowDetail ? "hidden" : ""}`}>
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, type or source…"
            aria-label="Search content"
            aria-describedby="browse-match-count"
            className="w-full rounded border border-blood/30 bg-white/70 py-1.5 pl-2 pr-16 text-sm"
          />
          <span
            id="browse-match-count"
            aria-live="polite"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted"
          >
            {query ? `${totalMatches} match${totalMatches === 1 ? "" : "es"}` : ""}
          </span>
        </div>
        <nav
          ref={listRef}
          aria-label="Entries"
          className="flex-1 overflow-y-auto rounded border border-blood/20 bg-parchment/60 p-2"
        >
          {totalMatches === 0 ? (
            <p className="px-1 py-2 text-sm text-ink-muted">No matches for “{query}”.</p>
          ) : (
            [...grouped.entries()].map(([type, items]) => (
              <section key={type} className="mb-3">
                <h2 className="mb-1 px-1 text-xs font-bold uppercase tracking-wide text-blood">
                  {type} <span className="font-semibold text-ink-muted">({items.length})</span>
                </h2>
                <ul>
                  {items.map((e) => {
                    const key = entityIdentity(e);
                    const meta = entityMeta(e);
                    const isReprinted = reprinted.has(e);
                    const isSelected = key === selectedKey;
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedKey(key);
                            setShowDetail(true);
                          }}
                          aria-current={isSelected ? "true" : undefined}
                          className={`w-full rounded px-2 py-1 text-left text-sm hover:bg-blood/10 ${
                            isSelected ? "bg-blood/15 font-semibold" : ""
                          } ${isReprinted ? "italic text-ink-muted" : ""}`}
                          title={entityTitle(e, isReprinted)}
                        >
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate">
                              {e.name}
                              {isReprinted && <span className="sr-only"> (reprinted)</span>}
                            </span>
                            <span className="shrink-0 text-2xs uppercase not-italic text-ink-muted">{e.source}</span>
                          </span>
                          {meta && (
                            <span className="block truncate text-2xs leading-tight text-ink-muted">{meta}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </nav>
      </div>

      <div
        role="region"
        aria-label="Entry details"
        // Focusable so keyboard users can scroll a long entry.
        tabIndex={0}
        className={`min-w-0 overflow-y-auto ${!isWide && !showDetail ? "hidden" : ""}`}
      >
        {narrowDetail && (
          <button
            ref={backRef}
            type="button"
            onClick={() => setShowDetail(false)}
            className="mb-3 rounded border border-blood/40 px-3 py-1.5 text-sm font-medium text-blood hover:bg-blood/10"
          >
            ← All entries
          </button>
        )}
        {selected ? (
          <EntityDetail entity={selected} />
        ) : (
          <div className="grid h-full place-items-center text-ink-muted">
            Select an entry to view it.
          </div>
        )}
      </div>
    </div>
  );
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

/**
 * Second line disambiguating same-name entries: the parent class / subclass /
 * race, pantheon or card set that is part of the entry's identity. Same-name
 * *reprints* differ by source instead, shown next to the name.
 */
function entityMeta(e: ImportedEntity): string | undefined {
  const cls = str(e.className) ? `${e.className} (${str(e.classSource) ?? "?"})` : undefined;
  const level = typeof e.level === "number" ? `L${e.level}` : undefined;
  switch (e.__type) {
    case "subclass":
      return cls;
    case "classFeature":
      return [cls, level].filter(Boolean).join(" · ");
    case "subclassFeature":
      return [str(e.subclassShortName), cls, level].filter(Boolean).join(" · ");
    case "subrace":
      return str(e.raceName) ? `${e.raceName} (${str(e.raceSource) ?? "?"})` : undefined;
    case "deity":
      return str(e.pantheon);
    case "card":
      return str(e.set);
    default:
      return undefined;
  }
}

/** Tooltip: full identity plus whether a newer printing is hiding it by default. */
function entityTitle(e: ImportedEntity, isReprinted: boolean): string {
  const meta = entityMeta(e);
  return `${e.name} (${e.source})${meta ? ` · ${meta}` : ""}${isReprinted ? " · reprinted in a newer source" : ""}`;
}

function groupByType(entities: ImportedEntity[]): Map<ContentType, ImportedEntity[]> {
  const map = new Map<ContentType, ImportedEntity[]>();
  for (const e of entities) {
    const list = map.get(e.__type) ?? [];
    list.push(e);
    map.set(e.__type, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return map;
}
