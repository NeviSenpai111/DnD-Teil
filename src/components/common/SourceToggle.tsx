import { useMemo } from "react";
import { isAuxType } from "../../data/types";
import { useContentStore, useReprintedEntities, useSourceInfos } from "../../store/contentStore";

/** Lists distinct imported sources with a checkbox to enable/disable each. */
export function SourceToggle() {
  const sources = useSourceInfos();
  const activeSources = useContentStore((s) => s.activeSources);
  const toggleSource = useContentStore((s) => s.toggleSource);
  const showReprinted = useContentStore((s) => s.showReprinted);
  const setShowReprinted = useContentStore((s) => s.setShowReprinted);
  const reprinted = useReprintedEntities();

  // Reprinted entries from enabled sources — what the toggle below hides/shows.
  const reprintedCount = useMemo(() => {
    let n = 0;
    for (const e of reprinted) if (activeSources[e.source] !== false && !isAuxType(e.__type)) n++;
    return n;
  }, [reprinted, activeSources]);

  if (sources.length === 0) {
    return <p className="text-xs text-ink-muted">No sources imported yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2 text-sm shadow-sm transition-colors hover:border-line-strong"
        title="Entries that a newer enabled source reprints — e.g. the 2014 Fighter once the 2024 one is loaded. Hidden by default, as on 5eTools."
      >
        <input
          type="checkbox"
          checked={showReprinted}
          onChange={(e) => setShowReprinted(e.target.checked)}
          className="h-4 w-4 accent-accent"
        />
        <span className="flex-1">Show reprinted</span>
        <span className="font-mono text-2xs text-ink-muted">{reprintedCount}</span>
      </label>
      <ul className="-mx-2 flex flex-col">
        {sources.map((info) => {
          const enabled = activeSources[info.source] !== false;
          return (
            <li key={info.source}>
              <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm transition-colors hover:bg-ink/5">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleSource(info.source)}
                  className="h-4 w-4 accent-accent"
                />
                <span className={`flex-1 truncate ${enabled ? "" : "text-ink-muted line-through decoration-ink-faint"}`} title={info.displayName}>
                  {info.displayName}
                </span>
                <span className="font-mono text-2xs text-ink-muted">{info.count}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
