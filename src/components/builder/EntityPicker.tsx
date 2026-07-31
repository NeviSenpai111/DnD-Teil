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
    return <p className="text-sm text-ink/60">{emptyHint}</p>;
  }

  const chosen = items.find((e) => sameRef(e, selected));
  const entries = chosen && Array.isArray((chosen as { entries?: Entry[] }).entries)
    ? ((chosen as { entries?: Entry[] }).entries as Entry[])
    : undefined;

  return (
    <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
      <ul className="space-y-1">
        {items.map((e) => {
          const isSel = sameRef(e, selected);
          return (
            <li key={`${e.name}|${e.source}`}>
              <button
                type="button"
                onClick={() => onSelect(isSel ? undefined : { name: e.name, source: e.source })}
                className={`flex w-full items-center justify-between rounded border px-3 py-2 text-left text-sm ${
                  isSel
                    ? "border-blood bg-blood/10 font-semibold"
                    : "border-blood/20 hover:bg-blood/5"
                }`}
              >
                <span className="truncate">{e.name}</span>
                <span className="ml-2 text-[10px] uppercase text-ink/40">{e.source}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="rounded border border-blood/15 bg-white/40 p-3 text-sm">
        {chosen ? (
          entries ? (
            <Entries entries={entries} />
          ) : (
            <p className="text-ink/60">No description provided.</p>
          )
        ) : (
          <p className="text-ink/50">Select an option to preview it.</p>
        )}
      </div>
    </div>
  );
}
