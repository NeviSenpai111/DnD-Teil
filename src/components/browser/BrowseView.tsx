import { useMemo, useState } from "react";
import { useActiveEntities, useReprintedEntities } from "../../store/contentStore";
import type { ContentType, ImportedEntity } from "../../data/types";
import { entityIdentity, isAuxType } from "../../data/types";
import { EntityDetail } from "./EntityDetail";

/** Browse imported content: a grouped list on the left, a detail pane on the right. */
export function BrowseView() {
  const entities = useActiveEntities();
  const reprinted = useReprintedEntities();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");

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

  if (entities.length === 0) {
    return (
      <div className="grid h-full place-items-center text-center text-ink/60">
        <div>
          <p className="text-lg font-semibold">Nothing to browse yet</p>
          <p className="text-sm">Import a 5eTools JSON file or load the sample to begin.</p>
        </div>
      </div>
    );
  }

  const totalMatches = filtered.length;

  return (
    <div className="grid h-full grid-cols-[18rem_1fr] gap-4">
      <div className="flex flex-col gap-2 overflow-hidden">
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, type or source…"
            className="w-full rounded border border-blood/30 bg-white/70 px-2 py-1 text-sm"
          />
          {query && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink/50">
              {totalMatches}
            </span>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto rounded border border-blood/20 bg-parchment/60 p-2">
          {totalMatches === 0 ? (
            <p className="px-1 py-2 text-sm text-ink/50">No matches for “{query}”.</p>
          ) : (
            [...grouped.entries()].map(([type, items]) => (
              <section key={type} className="mb-3">
                <h3 className="mb-1 px-1 text-xs font-bold uppercase tracking-wide text-blood">
                  {type} <span className="text-ink/40">({items.length})</span>
                </h3>
                <ul>
                  {items.map((e) => {
                    const key = entityIdentity(e);
                    const meta = entityMeta(e);
                    const isReprinted = reprinted.has(e);
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => setSelectedKey(key)}
                          className={`w-full rounded px-2 py-1 text-left text-sm hover:bg-blood/10 ${
                            key === selectedKey ? "bg-blood/15 font-semibold" : ""
                          } ${isReprinted ? "opacity-60" : ""}`}
                          title={entityTitle(e, isReprinted)}
                        >
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate">{e.name}</span>
                            <span className="shrink-0 text-[10px] uppercase text-ink/40">{e.source}</span>
                          </span>
                          {meta && (
                            <span className="block truncate text-[10px] leading-tight text-ink/50">{meta}</span>
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

      <div className="overflow-y-auto">
        {selected ? (
          <EntityDetail entity={selected} />
        ) : (
          <div className="grid h-full place-items-center text-ink/50">
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
