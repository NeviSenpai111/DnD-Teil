import { useMemo, useState } from "react";
import { useActiveEntities, useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import { deriveFromCharacter, inventoryWeight, itemForEntry, listByType, startingEquipmentFor } from "../../store/selectors";
import { itemTypeCode } from "../../data/types/item-content";
import { isWeapon } from "../../engine/attacks";
import { COINS, carryingCapacity, currencyInGp } from "../../engine/currency";
import { itemModifiers } from "../../engine/modifierEngine";
import { categoryLine, formatWeight, itemIcon } from "../common/itemDisplay";
import { Icon } from "../common/Icon";
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
      <h2 className="text-2xl font-semibold tracking-tight text-ink">Choose Equipment</h2>

      <Accordion title="Starting Equipment" defaultOpen={draft.inventory.length === 0}>
        <div className="space-y-3">
          <div className="segmented">
            {(["kit", "gold"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setEquipmentMode(mode)}
                aria-current={draft.equipmentMode === mode ? "true" : undefined}
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
                  className="btn btn-primary btn-sm"
                >
                  Add starting equipment
                </button>
                <p className="mt-1 text-xs text-ink-muted">
                  Default loadout: {kitItems.map((k) => k.name).join(", ")}. Adds the first option
                  from each choice; swap items below as needed.
                </p>
              </div>
            ) : (
              <p className="text-xs text-ink-muted">
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
          className="w-full max-w-sm field"
        />
        {query && (
          <ul className="mt-1.5 max-h-48 max-w-sm animate-fade-in overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow-lg)]">
            {matches.length === 0 && <li className="px-2 py-1 text-sm text-ink-muted">No matches.</li>}
            {matches.map((i) => (
              <li key={`${i.name}|${i.source}`}>
                <button
                  type="button"
                  onClick={() => addItem({ ref: { name: i.name, source: i.source }, name: i.name })}
                  className="flex w-full justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-ink/5"
                >
                  <span>{i.name}</span>
                  <span className="font-mono text-2xs uppercase text-ink-muted">
                    {itemTypeCode(i.type as string) ?? "item"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface-sunk px-4 py-3">
        <span className="eyebrow">Currency</span>
        {COINS.map((coin) => (
          <label key={coin} className="flex items-center gap-1.5 font-mono text-2xs uppercase text-ink-muted">
            {coin}
            <input
              type="number"
              min={0}
              value={draft.currency[coin]}
              aria-label={coin.toUpperCase()}
              onChange={(e) => setCoin(coin, Number(e.target.value) || 0)}
              className="field field-sm w-16 text-center font-mono"
            />
          </label>
        ))}
        <span className="ml-auto font-mono text-xs text-ink-muted">≈ {purseGp} gp</span>
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-2">
          <h3 className="font-semibold tracking-tight text-ink">Current Inventory ({draft.inventory.length})</h3>
          <span
            className={`font-mono text-xs ${totalWeight > capacity ? "font-medium text-accent" : "text-ink-muted"}`}
            title="Carrying capacity: Strength × 15 lb. (variant encumbrance thresholds: Str×5 / Str×10)"
          >
            Total Weight: {formatWeight(totalWeight)} / {capacity} lb.
            {totalWeight > capacity && " — over capacity"}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No items yet. Search above to add some.</p>
        ) : (
          <ul className="stagger mt-3 space-y-2">
            {rows.map(({ entry, i, item }) => {
              const code = itemTypeCode(item?.type);
              const canWear = wearable(code);
              const canWield = !!item && isWeapon(item);
              // Modifier-carrying wondrous items are equippable as "Use".
              const canUse = !canWear && !canWield && !!item && itemModifiers(item).length > 0;
              const equipLabel = canWear
                ? entry.equipped
                  ? "Worn"
                  : "Wear"
                : canWield
                  ? entry.equipped
                    ? "Wielding"
                    : "Wield"
                  : entry.equipped
                    ? "Using"
                    : "Use";
              return (
                <li
                  key={i}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 sm:flex-nowrap"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface-sunk text-ink-muted">
                    <Icon name={itemIcon(item)} className="h-[1.125rem] w-[1.125rem]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{entry.name}</span>
                    <span className="block text-xs text-ink-muted">
                      {categoryLine(item)}
                      {item?.weight != null && ` · ${formatWeight(item.weight)}`}
                    </span>
                  </span>

                  <label className="flex items-center gap-1 text-xs text-ink-muted">
                    Qty
                    <input
                      type="number"
                      min={1}
                      value={entry.quantity}
                      onChange={(e) => setItemQuantity(i, Number(e.target.value) || 1)}
                      className="field field-sm w-14 text-center font-mono"
                    />
                  </label>

                  {(canWear || canWield || canUse) && (
                    <button
                      type="button"
                      onClick={() => toggleEquip(i)}
                      aria-pressed={entry.equipped}
                      className={`btn btn-sm min-w-[4.75rem] ${entry.equipped ? "btn-primary" : "btn-secondary"}`}
                    >
                      {equipLabel}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="btn btn-ghost btn-icon hover:text-accent"
                    title="Remove"
                    aria-label={`Remove ${entry.name}`}
                  >
                    <Icon name="close" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-ink-muted">Wearing armor or a shield updates AC on the sheet.</p>
      </section>
    </div>
  );
}
