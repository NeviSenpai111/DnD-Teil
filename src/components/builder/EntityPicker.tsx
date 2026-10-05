import type { Entry } from "../../data/types/common";
import type { ImportedEntity } from "../../data/types/content";
import type { EntityRef } from "../../model/character";
import { Entries } from "../../data/entryRenderer/EntryRenderer";

function sameRef(e: ImportedEntity, ref?: EntityRef): boolean {
  return !!ref && e.name === ref.name && e.source === ref.source;
}

/** A radio-style list of entities with a description preview for the selection. */
export function EntityPicker({
  items,
  selected,
  onSelect,
  emptyHint,
}: {
  items: ImportedEntity[];
  selected?: EntityRef;
  onSelect: (ref: EntityRef | undefined) => void;
  emptyHint: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-muted">{emptyHint}</p>;
  }

  const chosen = items.find((e) => sameRef(e, selected));
  const entries = chosen && Array.isArray((chosen as { entries?: Entry[] }).entries)
    ? ((chosen as { entries?: Entry[] }).entries as Entry[])
    : undefined;

  return (
    <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
      <ul className="stagger space-y-1">
        {items.map((e) => {
          const isSel = sameRef(e, selected);
          return (
            <li key={`${e.name}|${e.source}`}>
              <button
                type="button"
                onClick={() => onSelect(isSel ? undefined : { name: e.name, source: e.source })}
                aria-pressed={isSel}
                className={`flex min-h-10 w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  isSel
                    ? "row-selected border-accent/40 font-medium"
                    : "border-line bg-surface hover:border-line-strong hover:bg-ink/[0.025]"
                }`}
              >
                <span className="truncate">{e.name}</span>
                <span className="ml-2 font-mono text-2xs uppercase text-ink-muted">{e.source}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="prose-rules rounded-xl border border-line bg-surface-sunk p-4">
        {chosen ? (
          entries ? (
            <Entries entries={entries} />
          ) : (
            <p className="text-ink-muted">No description provided.</p>
          )
        ) : (
          <p className="text-ink-muted">Select an option to preview its rules here.</p>
        )}
      </div>
    </div>
  );
}
