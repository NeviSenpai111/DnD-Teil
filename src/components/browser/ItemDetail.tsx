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
          ? "rounded border border-blood/20 bg-white/50 p-3"
          : "mx-auto max-w-2xl rounded border border-blood/30 bg-parchment p-5 shadow"
      }
    >
      <header className="border-b border-blood/30 pb-2">
        <h2 className={`font-bold text-blood ${embedded ? "text-lg" : "text-2xl"}`}>
          <span aria-hidden>{itemIcon(item)}</span> {item.name}
        </h2>
        <p className="text-xs uppercase tracking-wide text-ink/60">
          {categoryLine(item)}
          {it.rarity && it.rarity !== "none" && ` · ${it.rarity}`} · {item.source}
        </p>
      </header>

      <dl className="mt-3 space-y-1 text-sm">
        {rows
          .filter((r): r is [string, string] => !!r[1])
          .map(([label, value]) => (
            <div key={label}>
              <dt className="inline font-semibold">{label}: </dt>
              <dd className="inline text-ink/80">{value}</dd>
            </div>
          ))}
      </dl>

      {item.entries && item.entries.length > 0 && (
        <div className="mt-3 border-t border-blood/15 pt-3 text-sm">
          <Entries entries={item.entries} />
        </div>
      )}
    </article>
  );
}
