import type { Item } from "../../data/types/item-content";
import { Entries } from "../../data/entryRenderer/EntryRenderer";
import {
  categoryLine,
  DAMAGE_TYPES,
  formatValue,
  formatWeight,
  itemIcon,
  propertyLabels,
} from "../common/itemDisplay";
import { Icon } from "../common/Icon";

/** Extra fields real items carry beyond the builder's Item interface. */
interface ItemExtras extends Item {
  rarity?: string;
  dmg2?: string;
  reqAttune?: boolean | string;
}

/** AC display per armor category: shield bonus, light + Dex, medium + capped Dex. */
function formatAc(it: ItemExtras): string {
  const code = it.type?.split("|")[0];
  if (code === "S") return `+${it.ac}`;
  if (code === "LA") return `${it.ac} + Dex`;
  if (code === "MA") return `${it.ac} + Dex (max ${it.dexterityMax ?? 2})`;
  return `${it.ac}`;
}

/** Detail card for `item` / `baseitem` entities. `embedded` renders a compact
 * version for inline use (expanded rows on the character sheet). */
export function ItemDetail({ item, embedded }: { item: Item; embedded?: boolean }) {
  const it = item as ItemExtras;
  const props = propertyLabels(it.properties);
  const dmgType = it.dmgType ? (DAMAGE_TYPES[it.dmgType] ?? it.dmgType) : undefined;

  const damage = it.dmg1
    ? [it.dmg1, dmgType, it.dmg2 ? `(versatile: ${it.dmg2})` : undefined].filter(Boolean).join(" ")
    : undefined;
  const armorClass = it.ac != null ? formatAc(it) : undefined;

  const rows: [string, string | undefined][] = [
    ["Damage", damage],
    ["Range", it.range ? `${it.range} ft.` : undefined],
    ["Properties", props.length ? props.join(", ") : undefined],
    ["Armor Class", armorClass],
    ["Weight", it.weight != null ? formatWeight(it.weight) : undefined],
    ["Cost", it.value != null ? formatValue(it.value) : undefined],
    [
      "Attunement",
      it.reqAttune ? (typeof it.reqAttune === "string" ? `Requires attunement ${it.reqAttune}` : "Requires attunement") : undefined,
    ],
  ];

  return (
    <article
      className={
        embedded
          ? "rounded-lg border border-line bg-surface p-4"
          : "detail"
      }
    >
      <header className="detail-head">
        <h2 className={`detail-title ${embedded ? "text-lg" : ""}`}>
          <span className="flex items-center gap-2.5">
            <Icon name={itemIcon(item)} className={embedded ? "h-4 w-4 text-ink-muted" : "h-6 w-6 text-ink-muted"} />
            {item.name}
          </span>
        </h2>
        <p className="eyebrow mt-2">
          {categoryLine(item)}
          {it.rarity && it.rarity !== "none" && ` · ${it.rarity}`} · {item.source}
        </p>
      </header>

      <dl className="detail-facts">
        {rows
          .filter((r): r is [string, string] => !!r[1])
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}: </dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>

      {item.entries && item.entries.length > 0 && (
        <div className="prose-rules mt-5 border-t border-line pt-5">
          <Entries entries={item.entries} />
        </div>
      )}
    </article>
  );
}
