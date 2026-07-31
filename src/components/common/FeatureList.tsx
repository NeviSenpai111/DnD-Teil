import type { Entry } from "../../data/types/common";
import { Entries } from "../../data/entryRenderer/EntryRenderer";

export interface FeatureLike {
  name: string;
  level: number;
  entries?: Entry[];
}

/** Renders class/subclass features grouped by the level they're gained. */
export function FeatureList({ features }: { features: FeatureLike[] }) {
  if (features.length === 0) {
    return <p className="text-sm text-ink/60">No features at this level.</p>;
  }

  const byLevel = new Map<number, FeatureLike[]>();
  for (const f of features) {
    const list = byLevel.get(f.level) ?? [];
    list.push(f);
    byLevel.set(f.level, list);
  }

  return (
    <div className="space-y-3">
      {[...byLevel.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([level, items]) => (
          <div key={level}>
            <h4 className="text-xs font-bold uppercase tracking-wide text-ink/50">Level {level}</h4>
            <div className="space-y-2">
              {items.map((f) => (
                <div key={f.name}>
                  <h5 className="font-semibold text-blood">{f.name}</h5>
                  {f.entries && <Entries entries={f.entries} />}
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
