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
    return <p className="text-xs text-ink/60">No sources imported yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        className="flex cursor-pointer items-center gap-2 rounded border border-blood/20 px-1 py-0.5 text-sm hover:bg-black/5"
        title="Entries that a newer enabled source reprints — e.g. the 2014 Fighter once the 2024 one is loaded. Hidden by default, as on 5eTools."
      >
        <input
          type="checkbox"
          checked={showReprinted}
          onChange={(e) => setShowReprinted(e.target.checked)}
          className="accent-blood"
        />
        <span className="flex-1">Show reprinted</span>
        <span className="text-xs text-ink/50">{reprintedCount}</span>
      </label>
      <ul className="flex flex-col gap-1">
        {sources.map((info) => {
          const enabled = activeSources[info.source] !== false;
          return (
            <li key={info.source}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-black/5">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleSource(info.source)}
                  className="accent-blood"
                />
                <span className="flex-1 truncate" title={info.displayName}>
                  {info.displayName}
                </span>
                <span className="text-xs text-ink/50">{info.count}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
