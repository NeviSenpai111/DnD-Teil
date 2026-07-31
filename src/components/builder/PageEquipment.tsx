import { useMemo, useState } from "react";
import { useActiveEntities, useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { deriveFromCharacter, inventoryWeight, itemForEntry, listByType, startingEquipmentFor } from "../../store/selectors";
import { itemTypeCode } from "../../data/types/item-content";
import { isWeapon } from "../../engine/attacks";
import { COINS, carryingCapacity, currencyInGp } from "../../engine/currency";
import { categoryLine, formatWeight, itemIcon } from "../common/itemDisplay";
import { Accordion } from "./Accordion";

const wearable = (code?: string) => ["LA", "MA", "HA", "S"].includes(code ?? "");

export function PageEquipment() {
  const entities = useActiveEntities();
  const index = useContentStore((s) => s.index);
  const draft = useCharacterStore((s) => s.draft);
  const setEquipmentMode = useCharacterStore((s) => s.setEquipmentMode);
  const setCoin = useCharacterStore((s) => s.setCoin);
  const addItem = useCharacterStore((s) => s.addItem);
  const removeItem = useCharacterStore((s) => s.removeItem);
  const toggleEquip = useCharacterStore((s) => s.toggleEquip);
  const setItemQuantity = useCharacterStore((s) => s.setItemQuantity);

  const [query, setQuery] = useState("");
  const items = useMemo(
    () => [...listByType(entities, "item"), ...listByType(entities, "baseitem")],
    [entities],
  );
  const matches = items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase())).slice(0, 12);

  const kitItems = useMemo(() => startingEquipmentFor(draft, index), [draft, index]);
  const grantKit = () => {
    for (const k of kitItems) {
      const already = draft.inventory.some(
        (it) => it.ref && k.ref && it.ref.name === k.ref.name && it.ref.source === k.ref.source,
      );
      if (!already) addItem({ ref: k.ref, name: k.name });
    }
  };

  // Resolve each inventory entry once for icons, category lines and weight.
  const rows = draft.inventory.map((entry, i) => ({
    entry,
    i,
    item: itemForEntry(entry, index),
  }));
  const totalWeight = inventoryWeight(draft, index);
  const capacity = carryingCapacity(deriveFromCharacter(draft, index).abilities.str);
  const purseGp = currencyInGp(draft.currency);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-ink">Choose Equipment</h2>

      <Accordion title="Starting Equipment" defaultOpen={draft.inventory.length === 0}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {(["kit", "gold"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setEquipmentMode(mode)}
                className={`rounded border px-3 py-1 text-sm ${
                  draft.equipmentMode === mode ? "border-blood bg-blood/10 font-semibold" : "border-ink/20"
                }`}
              >
                {mode === "kit" ? "Starting Equipment" : "Buy with Gold"}
              </button>
            ))}
          </div>

          {draft.equipmentMode === "kit" &&
            (kitItems.length > 0 ? (
              <div>
                <button
                  type="button"
                  onClick={grantKit}
                  className="rounded bg-blood px-3 py-1 text-sm font-semibold text-parchment hover:bg-blood-light"
                >
                  Add starting equipment
                </button>
                <p className="mt-1 text-xs text-ink/60">
                  Default loadout: {kitItems.map((k) => k.name).join(", ")}. Adds the first option
                  from each choice; swap items below as needed.
                </p>
              </div>
            ) : (
              <p className="text-xs text-ink/60">
                The chosen background/class declares no parsable starting equipment (or none is
                imported). Add items below.
              </p>
            ))}
        </div>
      </Accordion>

      <div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search items to add…"
          className="w-full max-w-sm rounded border border-ink/20 bg-white px-2 py-1.5 text-sm"
        />
        {query && (
          <ul className="mt-1 max-h-40 max-w-sm overflow-y-auto rounded border border-blood/15 bg-white/70">
            {matches.length === 0 && <li className="px-2 py-1 text-sm text-ink/50">No matches.</li>}
            {matches.map((i) => (
              <li key={`${i.name}|${i.source}`}>
                <button
                  type="button"
                  onClick={() => addItem({ ref: { name: i.name, source: i.source }, name: i.name })}
                  className="flex w-full justify-between px-2 py-1 text-left text-sm hover:bg-blood/10"
                >
                  <span>{i.name}</span>
                  <span className="text-[10px] uppercase text-ink/40">
                    {itemTypeCode(i.type as string) ?? "item"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <section className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-blood/20 bg-white/50 px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-wide text-ink/50">Currency</span>
        {COINS.map((coin) => (
          <label key={coin} className="flex items-center gap-1 text-xs uppercase text-ink/60">
            {coin}
            <input
              type="number"
              min={0}
              value={draft.currency[coin]}
              aria-label={coin.toUpperCase()}
              onChange={(e) => setCoin(coin, Number(e.target.value) || 0)}
              className="w-16 rounded border border-ink/20 bg-white px-1 py-0.5 text-center"
            />
          </label>
        ))}
        <span className="ml-auto text-xs text-ink/60">≈ {purseGp} gp</span>
      </section>

      <section>
        <div className="flex items-center justify-between border-b-2 border-blood/30 pb-1.5">
          <h3 className="font-bold text-ink">Current Inventory ({draft.inventory.length})</h3>
          <span
            className={`text-sm ${totalWeight > capacity ? "font-semibold text-blood" : "text-ink/60"}`}
            title="Carrying capacity: Strength × 15 lb. (variant encumbrance thresholds: Str×5 / Str×10)"
          >
            Total Weight: {formatWeight(totalWeight)} / {capacity} lb.
            {totalWeight > capacity && " — over capacity"}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-ink/50">No items yet. Search above to add some.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {rows.map(({ entry, i, item }) => {
              const code = itemTypeCode(item?.type);
              const canWear = wearable(code);
              const canWield = !!item && isWeapon(item);
              const equipLabel = canWear
                ? entry.equipped
                  ? "Worn"
                  : "Wear"
                : entry.equipped
                  ? "Wielding"
                  : "Wield";
              return (
                <li
                  key={i}
                  className="flex items-center gap-3 rounded border border-blood/20 bg-white/60 px-3 py-2 shadow-sm"
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded border border-blood/20 bg-parchment text-lg"
                    aria-hidden
                  >
                    {itemIcon(item)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{entry.name}</span>
                    <span className="block text-xs text-ink/50">
                      {categoryLine(item)}
                      {item?.weight != null && ` · ${formatWeight(item.weight)}`}
                    </span>
                  </span>

                  <label className="flex items-center gap-1 text-xs text-ink/60">
                    Qty
                    <input
                      type="number"
                      min={1}
                      value={entry.quantity}
                      onChange={(e) => setItemQuantity(i, Number(e.target.value) || 1)}
                      className="w-14 rounded border border-ink/20 px-1 py-0.5 text-center"
                    />
                  </label>

                  {(canWear || canWield) && (
                    <button
                      type="button"
                      onClick={() => toggleEquip(i)}
                      className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        entry.equipped
                          ? "border-blood bg-blood text-parchment"
                          : "border-blood/40 text-blood hover:bg-blood/10"
                      }`}
                    >
                      {equipLabel}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="text-blood hover:text-blood-light"
                    title="Remove"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-ink/50">Wearing armor or a shield updates AC on the sheet.</p>
      </section>
    </div>
  );
}
