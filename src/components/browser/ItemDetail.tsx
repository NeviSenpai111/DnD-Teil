import type { EntriesEntry, Entry } from "../../data/types";
import type { Item } from "../../data/types/item-content";
import { Entries, EntryRenderer } from "../../data/entryRenderer/EntryRenderer";
import { InlineText } from "../../data/tagParser/TagRenderer";
import { useContentStore } from "../../store/contentStore";
import { itemCard } from "../common/itemCard";
import { itemIcon } from "../common/itemDisplay";
import { Icon } from "../common/Icon";

/**
 * A named block run in like 5eTools does at the top level: "*Versatile.* A
 * Versatile weapon can be used…" instead of a heading over its paragraph.
 */
function RunInEntry({ entry }: { entry: Entry }) {
  const e = entry as EntriesEntry;
  if (typeof entry === "string" || entry.type !== "entries" || !e.name || !e.entries?.length) {
    return <EntryRenderer entry={entry} />;
  }
  const [first, ...rest] = e.entries;
  return (
    <div className="space-y-2">
      <p className="leading-relaxed">
        <strong className="font-semibold italic">{e.name}.</strong>{" "}
        {typeof first === "string" && <InlineText text={first} />}
      </p>
      {typeof first !== "string" && <EntryRenderer entry={first} />}
      {rest.length > 0 && <Entries entries={rest} />}
    </div>
  );
}

function RunInEntries({ entries }: { entries: Entry[] }) {
  return (
    <div className="space-y-2">
      {entries.map((e, i) => (
        <RunInEntry key={i} entry={e} />
      ))}
    </div>
  );
}

/**
 * Detail card for `item` / `baseitem` entities, laid out like 5eTools: type
 * lines, cost and weight opposite damage/AC, properties and mastery, then the
 * item's text and the rules for its type, properties and mastery. `embedded`
 * renders a compact version for inline use (expanded rows on the sheet).
 */
export function ItemDetail({ item, embedded }: { item: Item; embedded?: boolean }) {
  const index = useContentStore((s) => s.index);
  const card = itemCard(item, index);
  const body = card.entries.length > 0 || card.notes.length > 0 || card.additional.length > 0;

  return (
    <article
      aria-label={item.name}
      className={embedded ? "rounded-lg border border-line bg-surface p-4" : "detail"}
    >
      <header className="detail-head">
        <div className="flex items-start justify-between gap-4">
          <h2 className={`detail-title ${embedded ? "text-lg" : ""}`}>
            <span className="flex items-center gap-2.5">
              <Icon name={itemIcon(item)} className={embedded ? "h-4 w-4 text-ink-muted" : "h-6 w-6 text-ink-muted"} />
              {item.name}
            </span>
          </h2>
          <p
            className="mt-1 shrink-0 font-mono text-sm font-medium text-accent"
            title={`${card.sourceTitle}${card.page ? `, page ${card.page}` : ""}`}
          >
            {item.source}
            {card.page !== undefined && <span className="ml-1 text-2xs text-ink-muted">p{card.page}</span>}
          </p>
        </div>
        {card.typeLine && <p className="mt-1.5 text-sm italic">{card.typeLine}</p>}
        {card.subtypeLine && <p className="text-sm italic text-ink-muted">{card.subtypeLine}</p>}
      </header>

      {(card.costWeight || card.stats.length > 0) && (
        <div className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-1 text-sm">
          <p>{card.costWeight}</p>
          {card.stats.length > 0 && (
            <ul className="space-y-0.5 sm:text-right">
              {card.stats.map((line) => (
                <li key={line} className="text-balance">
                  <InlineText text={line} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {body && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="prose-rules space-y-2">
            <RunInEntries entries={card.entries} />
            <RunInEntries entries={card.notes} />
            {card.additional.length > 0 && <Entries entries={card.additional} />}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-ink-muted">
        <span className="font-medium text-ink">Source:</span> <em>{card.sourceTitle}</em>
        {card.page !== undefined && `, page ${card.page}`}
      </p>
    </article>
  );
}
