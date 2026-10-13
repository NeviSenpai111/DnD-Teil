import { useMemo, useState, type DragEvent } from "react";
import { useActiveEntities, useContentStore } from "../../store/contentStore";
import { useCharacterStore } from "../../store/characterStore";
import {
  attunedCount,
  containerContentsWeight,
  deriveFromCharacter,
  inventoryWeight,
  itemForEntry,
  listByType,
} from "../../store/selectors";
import { newItemId, type Character, type EntityRef, type InventoryItem } from "../../model/character";
import { COINS, carryingCapacity, currencyInGp } from "../../engine/currency";
import { itemModifiers } from "../../engine/modifierEngine";
import { isWeapon } from "../../engine/attacks";
import { itemTypeCode, type Item } from "../../data/types/item-content";
import { formatWeight } from "../common/itemDisplay";
import { itemTypeLines } from "../common/itemCard";
import { ItemDetail } from "../browser/ItemDetail";
import { Icon } from "../common/Icon";
import { AddButton, Empty, SlotPips } from "./sheetParts";

const WEARABLE_CODES = ["LA", "MA", "HA", "S"];
/** Section id for items carried on the character rather than in a container. */
const ON_PERSON = "";

interface Row {
  entry: InventoryItem;
  i: number;
  item?: Item;
}

interface Section {
  /** The container's inventory id, or `ON_PERSON`. */
  id: string;
  title: string;
  container?: Row;
  rows: Row[];
}

/**
 * D&D Beyond-style inventory: the items on the character under "Equipment",
 * then one section per container listing what's packed in it. Items move
 * between sections by dragging them onto a section, or from the "Move to"
 * buttons in the item's expanded details.
 */
export function InventoryTab({ character }: { character: Character }) {
  const index = useContentStore((s) => s.index);
  const entities = useActiveEntities();
  const updateSheet = useCharacterStore((s) => s.updateSheet);

  const [expanded, setExpanded] = useState<number>();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<number>();
  const [dropTarget, setDropTarget] = useState<string>();

  const pool = useMemo(
    () => [...listByType(entities, "item"), ...listByType(entities, "baseitem")],
    [entities],
  );
  const matches = query
    ? pool.filter((i) => i.name.toLowerCase().includes(query.toLowerCase())).slice(0, 12)
    : [];

  const editInventory = (fn: (inv: InventoryItem[]) => InventoryItem[]) =>
    updateSheet(character.id, (c) => ({ inventory: fn(c.inventory) }));
  const editRow = (i: number, patch: Partial<InventoryItem>) =>
    editInventory((inv) => inv.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  // An id from the start, so a container added here can hold things.
  const addItem = (ref: EntityRef) =>
    editInventory((inv) => [...inv, { id: newItemId(), ref, name: ref.name, quantity: 1, equipped: false }]);
  const removeItem = (i: number) => {
    setExpanded(undefined);
    editInventory((inv) => {
      const removed = inv[i];
      // A removed container's contents stay where the container was.
      return inv
        .filter((_, j) => j !== i)
        .map((it) => (removed.id && it.containedIn === removed.id ? { ...it, containedIn: removed.containedIn } : it));
    });
  };

  const rows: Row[] = character.inventory.map((entry, i) => ({ entry, i, item: itemForEntry(entry, index) }));
  const containers = rows.filter((r) => r.item?.containerCapacity && r.entry.id);
  const containerIds = new Set(containers.map((c) => c.entry.id));
  // Contents of a container that no longer exists fall back to the character.
  const sectionOf = (entry: InventoryItem) =>
    entry.containedIn && containerIds.has(entry.containedIn) ? entry.containedIn : ON_PERSON;
  const sections: Section[] = [
    { id: ON_PERSON, title: "Equipment", rows: rows.filter((r) => sectionOf(r.entry) === ON_PERSON) },
    ...containers.map((c) => {
      const twins = containers.filter((o) => o.entry.name === c.entry.name);
      const n = twins.indexOf(c);
      return {
        id: c.entry.id!,
        title: n > 0 ? `${c.entry.name} (${n + 1})` : c.entry.name,
        container: c,
        rows: rows.filter((r) => sectionOf(r.entry) === c.entry.id),
      };
    }),
  ];

  const byId = new Map(character.inventory.map((e) => [e.id, e]));
  // A container can't be packed into itself or its own contents (no cycles).
  const wouldCycle = (row: InventoryItem, target: InventoryItem): boolean => {
    let holderId: string | undefined = target.id;
    const visited = new Set<string>();
    while (holderId && !visited.has(holderId)) {
      if (holderId === row.id) return true;
      visited.add(holderId);
      holderId = byId.get(holderId)?.containedIn;
    }
    return false;
  };
  const canMove = (row: Row, section: Section) =>
    section.id !== sectionOf(row.entry) && (!section.container || !wouldCycle(row.entry, section.container.entry));
  const moveTo = (row: Row, section: Section) => {
    if (canMove(row, section)) editRow(row.i, { containedIn: section.id || undefined });
  };

  const attuned = attunedCount(character);
  const anyAttunable = rows.some((r) => r.item?.reqAttune);
  const totalWeight = inventoryWeight(character, index);
  const capacity = carryingCapacity(deriveFromCharacter(character, index).abilities.str);
  const draggedRow = dragging === undefined ? undefined : rows[dragging];

  const dropHandlers = (section: Section) => ({
    onDragOver: (e: DragEvent) => {
      if (!draggedRow || !canMove(draggedRow, section)) return;
      e.preventDefault();
      if (dropTarget !== section.id) setDropTarget(section.id);
    },
    onDragLeave: (e: DragEvent) => {
      if (!(e.currentTarget as Node).contains(e.relatedTarget as Node | null)) setDropTarget(undefined);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (draggedRow) moveTo(draggedRow, section);
      setDragging(undefined);
      setDropTarget(undefined);
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {sections.length > 1 && (
          <p className="text-2xs text-ink-muted print:hidden">
            Drag items onto a container, or open an item to move it.
          </p>
        )}
        <div className="ml-auto">
          <AddButton open={adding} onClick={() => setAdding(!adding)} label="Add Item" />
        </div>
      </div>

      {adding && (
        <div className="rounded-lg border border-line bg-surface-sunk p-3 print:hidden">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items to add…"
            className="w-full field field-sm"
            autoFocus
          />
          {query && (
            <ul className="mt-1.5 max-h-48 animate-fade-in overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow-lg)]">
              {matches.length === 0 && <li className="px-2 py-1 text-sm text-ink-muted">No matches.</li>}
              {matches.map((i) => (
                <li key={`${i.name}|${i.source}`}>
                  <button
                    type="button"
                    onClick={() => addItem({ name: i.name, source: i.source })}
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
          <CustomItemForm character={character} />
        </div>
      )}

      {rows.length === 0 ? (
        <Empty>No items yet — use “+ Add Item” to search the imported gear.</Empty>
      ) : (
        sections.map((section) => (
          <section
            key={section.id || "equipment"}
            aria-label={section.title}
            {...dropHandlers(section)}
            className={`rounded-lg transition-colors ${
              dropTarget === section.id ? "bg-accent/5 ring-2 ring-accent/40" : ""
            } ${draggedRow && canMove(draggedRow, section) ? "ring-1 ring-line-strong" : ""}`}
          >
            <header className="flex items-baseline justify-between gap-2 border-b border-line px-1 pb-1">
              <h3 className="eyebrow text-ink">{section.title}</h3>
              {section.container ? (
                <ContainerLoad
                  character={character}
                  containerId={section.id}
                  capacity={section.container.item!.containerCapacity!}
                />
              ) : (
                <span className="font-mono text-2xs uppercase text-ink-muted">
                  {formatWeight(section.rows.reduce((sum, r) => sum + (r.item?.weight ?? 0) * r.entry.quantity, 0))}
                </span>
              )}
            </header>
            {section.rows.length === 0 ? (
              <p className="px-1 py-3 text-center text-xs text-ink-faint">
                Empty{sections.length > 1 && " — drag items here"}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {section.rows.map((row) => (
                  <InventoryRow
                    key={row.entry.id ?? `${row.entry.name}-${row.i}`}
                    character={character}
                    row={row}
                    open={expanded === row.i}
                    onToggle={() => setExpanded(expanded === row.i ? undefined : row.i)}
                    onEdit={(patch) => editRow(row.i, patch)}
                    onRemove={() => removeItem(row.i)}
                    attuned={attuned}
                    attuneSlot={anyAttunable}
                    destinations={sections.length > 1 ? sections.filter((s) => s.id === sectionOf(row.entry) || canMove(row, s)) : []}
                    current={sectionOf(row.entry)}
                    onMove={(s) => moveTo(row, s)}
                    onDragStart={() => setDragging(row.i)}
                    onDragEnd={() => {
                      setDragging(undefined);
                      setDropTarget(undefined);
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
        ))
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2">
        <span className="eyebrow">Currency</span>
        {COINS.map((coin) => (
          <label key={coin} className="flex items-center gap-1 font-mono text-2xs uppercase text-ink-muted">
            {coin}
            <input
              type="number"
              min={0}
              value={character.currency[coin]}
              aria-label={coin.toUpperCase()}
              onChange={(e) => {
                const value = Math.max(0, Number(e.target.value) || 0);
                updateSheet(character.id, (c) => ({ currency: { ...c.currency, [coin]: value } }));
              }}
              className="w-14 field field-sm text-center print:border-0"
            />
          </label>
        ))}
        <span className="text-xs text-ink-muted">≈ {currencyInGp(character.currency)} gp</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={`text-xs ${totalWeight > capacity ? "font-semibold text-accent" : "text-ink-muted"}`}
          title="Carrying capacity: Strength × 15 lb."
        >
          Total Weight: {formatWeight(totalWeight)} / {capacity} lb.
          {totalWeight > capacity && " — over capacity"}
          {attuned > 0 && ` · Attuned: ${attuned}/3`}
        </p>
        <label
          className="flex items-center gap-1.5 text-xs text-ink-muted print:hidden"
          title="Variant rule: −10 ft. speed past Str × 5 lb., −20 ft. past Str × 10 lb."
        >
          <input
            type="checkbox"
            checked={character.variantEncumbrance !== false}
            onChange={(e) => updateSheet(character.id, () => ({ variantEncumbrance: e.target.checked }))}
            className="accent-[var(--color-accent)]"
          />
          Variant encumbrance
        </label>
      </div>
    </div>
  );
}

const PILL = "rounded-full border px-2 py-px font-mono text-2xs uppercase transition-colors print:hidden";

/** One inventory line: name and type, weight, quantity, equip/attune, remove; expands to details. */
function InventoryRow({
  character,
  row,
  open,
  onToggle,
  onEdit,
  onRemove,
  attuned,
  attuneSlot,
  destinations,
  current,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  character: Character;
  row: Row;
  open: boolean;
  onToggle: () => void;
  onEdit: (patch: Partial<InventoryItem>) => void;
  onRemove: () => void;
  attuned: number;
  /** Reserve the attune column so the other columns line up. */
  attuneSlot: boolean;
  destinations: Section[];
  current: string;
  onMove: (section: Section) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const index = useContentStore((s) => s.index);
  const updateSheet = useCharacterStore((s) => s.updateSheet);
  const { entry, item } = row;
  const code = itemTypeCode(item?.type);
  // Modifier-carrying wondrous items (AC bonuses, set-scores, advantage
  // text) are equippable too, so their effects can apply.
  const equippable =
    WEARABLE_CODES.includes(code ?? "") || (!!item && isWeapon(item)) || (!!item && itemModifiers(item).length > 0);
  const lines = item && !entry.custom ? itemTypeLines(item, index) : undefined;
  const subtitle = entry.custom
    ? "Custom item"
    : !item
      ? "Not in the imported content"
      : (item.weaponCategory ? lines?.subtypeLine : lines?.typeLine) || lines?.typeLine;
  const weight = item?.weight ? formatWeight(item.weight * entry.quantity) : "—";

  const startDrag = (e: DragEvent<HTMLSpanElement>) => {
    const li = e.currentTarget.closest("li");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", entry.name);
      if (li) e.dataTransfer.setDragImage(li, 16, 16);
    }
    onDragStart();
  };

  return (
    <li className="py-1.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {destinations.length > 0 && (
          <span
            draggable
            onDragStart={startDrag}
            onDragEnd={onDragEnd}
            title="Drag onto a container"
            aria-hidden="true"
            className="-ml-1 cursor-grab text-ink-faint hover:text-ink active:cursor-grabbing print:hidden"
          >
            <Icon name="grip" className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-[9rem] flex-1">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="text-left hover:text-accent hover:underline"
            title="Show item details"
          >
            {entry.name}
          </button>
          {subtitle && <div className="text-2xs leading-tight text-ink-muted">{subtitle}</div>}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="w-14 text-right font-mono text-2xs text-ink-muted">{weight}</span>
          <label className="flex items-center gap-1 text-xs text-ink-muted print:hidden">
            ×
            <input
              type="number"
              min={1}
              value={entry.quantity}
              aria-label={`Quantity of ${entry.name}`}
              onChange={(e) => onEdit({ quantity: Math.max(1, Number(e.target.value) || 1) })}
              className="w-12 field field-sm text-center"
            />
          </label>
          {entry.quantity > 1 && <span className="hidden text-xs text-ink-muted print:inline">×{entry.quantity}</span>}

          <span className="flex w-[4.75rem] justify-end">
            {equippable && (
              <button
                type="button"
                onClick={() => onEdit({ equipped: !entry.equipped })}
                aria-pressed={entry.equipped}
                className={`${PILL} ${
                  entry.equipped
                    ? "border-accent/40 bg-accent/8 text-accent"
                    : "border-line-strong text-ink-muted hover:text-ink"
                }`}
              >
                {entry.equipped ? "Equipped" : "Equip"}
              </button>
            )}
            {entry.equipped && <span className="chip chip-accent hidden print:inline-flex">Equipped</span>}
          </span>
          {attuneSlot && (
            <span className="flex w-[4.25rem] justify-end">
              {item?.reqAttune && (
                <button
                  type="button"
                  onClick={() => onEdit({ attuned: !entry.attuned })}
                  disabled={!entry.attuned && attuned >= 3}
                  title={
                    entry.attuned
                      ? "End attunement"
                      : attuned >= 3
                        ? "Attunement limit reached (3 items)"
                        : "Attune to this item"
                  }
                  aria-pressed={entry.attuned}
                  className={`${PILL} ${
                    entry.attuned
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line-strong text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-ink-muted"
                  }`}
                >
                  {entry.attuned ? "Attuned" : "Attune"}
                </button>
              )}
            </span>
          )}

          <button
            type="button"
            onClick={onRemove}
            className="btn btn-ghost btn-icon min-h-8 min-w-8 hover:text-accent print:hidden"
            title="Remove item"
            aria-label={`Remove ${entry.name}`}
          >
            <Icon name="close" />
          </button>
        </div>
      </div>

      {item?.charges != null && (
        <div className="mt-1 pl-1">
          <SlotPips
            label={`${entry.name} charges`}
            total={item.charges}
            used={character.play.usedItemCharges[entry.name] ?? 0}
            onChange={(used) =>
              updateSheet(character.id, (c) => ({
                play: { ...c.play, usedItemCharges: { ...c.play.usedItemCharges, [entry.name]: used } },
              }))
            }
          />
        </div>
      )}

      {open && (
        <div className="mt-2 space-y-2">
          {destinations.length > 1 && (
            <div
              role="group"
              aria-label={`Move ${entry.name} to`}
              className="flex flex-wrap items-center gap-1.5 print:hidden"
            >
              <span className="eyebrow mr-1">Move to</span>
              {destinations.map((s) => (
                <button
                  key={s.id || "equipment"}
                  type="button"
                  aria-pressed={s.id === current}
                  onClick={() => onMove(s)}
                  className={`${PILL} ${
                    s.id === current
                      ? "border-accent/40 bg-accent/8 text-accent"
                      : "border-line-strong text-ink-muted hover:text-ink"
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </div>
          )}
          {item ? (
            <ItemDetail item={item} embedded />
          ) : (
            <p className="text-xs text-ink-muted">No details for this item.</p>
          )}
        </div>
      )}
    </li>
  );
}

/** A container's load line: direct+nested contents weight vs capacity. */
function ContainerLoad({
  character,
  containerId,
  capacity,
}: {
  character: Character;
  containerId: string;
  capacity: { weight?: number[]; weightless?: boolean };
}) {
  const index = useContentStore((s) => s.index);
  const load = containerContentsWeight(character, index, containerId);
  const cap = capacity.weight?.[0];
  const over = cap !== undefined && load > cap;
  return (
    <span
      className={`font-mono text-2xs uppercase ${over ? "font-medium text-accent" : "text-ink-muted"}`}
      title={capacity.weightless ? "Contents weigh nothing while inside" : undefined}
    >
      holds {formatWeight(load)}
      {cap !== undefined && ` / ${cap} lb`}
      {over && " — over capacity"}
    </span>
  );
}

/** Mini-form to add an ad-hoc item (name, weight, optional damage). */
function CustomItemForm({ character }: { character: Character }) {
  const updateSheet = useCharacterStore((s) => s.updateSheet);
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [damage, setDamage] = useState("");

  const add = () => {
    if (!name.trim()) return;
    updateSheet(character.id, (c) => ({
      inventory: [
        ...c.inventory,
        {
          id: newItemId(),
          name: name.trim(),
          quantity: 1,
          equipped: false,
          custom: {
            weight: Number(weight) || undefined,
            dmg1: damage.trim().split(" ")[0] || undefined,
            dmgType: damage.trim().split(" ").slice(1).join(" ") || undefined,
          },
        },
      ],
    }));
    setName("");
    setWeight("");
    setDamage("");
  };

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-line pt-2 text-sm">
      <span className="eyebrow">Custom item</span>
      <input
        value={name}
        aria-label="Custom item name"
        placeholder="Name"
        onChange={(e) => setName(e.target.value)}
        className="w-36 field field-sm"
      />
      <input
        value={weight}
        aria-label="Custom item weight"
        placeholder="lb."
        onChange={(e) => setWeight(e.target.value)}
        className="w-16 field field-sm"
      />
      <input
        value={damage}
        aria-label="Custom item damage"
        placeholder="1d6 fire (optional)"
        onChange={(e) => setDamage(e.target.value)}
        className="w-36 field field-sm"
      />
      <button type="button" onClick={add} className="btn btn-primary btn-sm">
        Add custom
      </button>
    </div>
  );
}
