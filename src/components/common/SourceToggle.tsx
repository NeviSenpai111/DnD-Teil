import { useContentStore, useSourceInfos } from "../../store/contentStore";

/** Lists distinct imported sources with a checkbox to enable/disable each. */
export function SourceToggle() {
  const sources = useSourceInfos();
  const activeSources = useContentStore((s) => s.activeSources);
  const toggleSource = useContentStore((s) => s.toggleSource);

  if (sources.length === 0) {
    return <p className="text-xs text-ink/60">No sources imported yet.</p>;
  }

  return (
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
  );
}
