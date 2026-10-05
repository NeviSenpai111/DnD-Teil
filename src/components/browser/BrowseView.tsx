import { useEffect, useMemo, useRef, useState } from "react";
import { useActiveEntities, useReprintedEntities } from "../../store/contentStore";
import type { ContentType, ImportedEntity } from "../../data/types";
import { entityIdentity, isAuxType } from "../../data/types";
import { EmptyState } from "../common/EmptyState";
import { Icon } from "../common/Icon";
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
      <EmptyState title="Nothing to browse yet" icon="book" actions={<LoadSampleButton />}>
        Load the bundled sample, or import your own 5eTools JSON files from the Import content
        panel.
      </EmptyState>
    );
  }

  const totalMatches = filtered.length;

  return (
    <div className="grid h-full gap-4 md:grid-cols-[18rem_1fr] lg:grid-cols-[20rem_1fr] lg:gap-6">
      <h1 className="sr-only">Browse content</h1>
      <div className={`panel flex min-h-0 flex-col overflow-hidden ${narrowDetail ? "hidden" : ""}`}>
        <div className="border-b border-line p-2">
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, type or source…"
              aria-label="Search content"
              aria-describedby="browse-match-count"
              className={`field w-full border-transparent bg-surface-sunk pl-8 shadow-none ${query ? "pr-20" : "pr-3"}`}
            />
            <span
              id="browse-match-count"
              aria-live="polite"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-2xs text-ink-muted"
            >
              {query ? `${totalMatches} match${totalMatches === 1 ? "" : "es"}` : ""}
            </span>
          </div>
        </div>
        <nav ref={listRef} aria-label="Entries" className="flex-1 overflow-y-auto px-2 pb-2">
          {totalMatches === 0 ? (
            <p className="px-2 py-6 text-sm text-ink-muted">
              No matches for “{query}”. Try a source code like <span className="font-mono">PHB</span> or a
              type like <span className="font-mono">spell</span>.
            </p>
          ) : (
            [...grouped.entries()].map(([type, items]) => (
              <section key={type}>
                <h2 className="eyebrow sticky top-0 z-10 flex items-baseline justify-between bg-surface/95 px-2 pb-1.5 pt-3 backdrop-blur-sm">
                  {type} <span className="text-ink-faint">{items.length}</span>
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
                          className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                            isSelected ? "row-selected font-medium" : "hover:bg-ink/5"
                          } ${isReprinted ? "italic text-ink-muted" : ""}`}
                          title={entityTitle(e, isReprinted)}
                        >
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate">
                              {e.name}
                              {isReprinted && <span className="sr-only"> (reprinted)</span>}
                            </span>
                            <span className="shrink-0 font-mono text-2xs uppercase not-italic text-ink-muted">{e.source}</span>
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
        className={`min-w-0 overflow-y-auto rounded-[var(--radius-panel)] pb-6 ${!isWide && !showDetail ? "hidden" : ""}`}
      >
        {narrowDetail && (
          <button
            ref={backRef}
            type="button"
            onClick={() => setShowDetail(false)}
            className="btn btn-ghost -ml-2 mb-2"
          >
            <Icon name="arrow-left" />
            All entries
          </button>
        )}
        {selected ? (
          <EntityDetail key={selectedKey} entity={selected} />
        ) : (
          <div className="grid h-full max-w-md content-start gap-2 pt-[clamp(1rem,10vh,6rem)] text-sm text-ink-muted">
            <Icon name="book" className="h-6 w-6 text-ink-faint" />
            <p className="text-base font-medium text-ink">Select an entry to view it.</p>
            <p>
              <span className="font-mono">{browsable.length.toLocaleString("en-US")}</span> entries
              imported. Search narrows the list by name, type or source.
            </p>
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
