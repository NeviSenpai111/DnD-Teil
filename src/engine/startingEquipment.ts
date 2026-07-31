/**
 * Parse the various 5eTools `startingEquipment` shapes into a flat list of
 * grantable items. Two forms appear in real data:
 *
 *  - 2024 (background/class): an array of choice-groups, each an object whose
 *    values are option lists, e.g. `[{ A: [{item, quantity}], B: [{value}] }]`.
 *  - 2014 (class): `{ default: [...strings], defaultData: [{ a: [...], b: [...] }] }`.
 *
 * For each choice-group we take the first option (the "default" loadout). Items
 * are referenced as `"name|source"`; `value` / `equipmentType` / `special`
 * entries (gold, generic categories, prose) can't be resolved and are skipped.
 */

export interface GrantedItem {
  /** Identity for resolving against imported items (`name|source`). */
  ref: { name: string; source: string };
  /** Display label (a `displayName` override when present, else the name). */
  name: string;
  quantity: number;
}

function entryToItem(entry: unknown): GrantedItem | undefined {
  if (typeof entry === "string") {
    const [name, source] = entry.split("|");
    return name ? { ref: { name, source: source ?? "" }, name, quantity: 1 } : undefined;
  }
  if (entry && typeof entry === "object") {
    const o = entry as Record<string, unknown>;
    if (typeof o.item === "string") {
      const [name, source] = o.item.split("|");
      const display = typeof o.displayName === "string" ? o.displayName : name;
      const quantity = typeof o.quantity === "number" ? o.quantity : 1;
      return { ref: { name, source: source ?? "" }, name: display, quantity };
    }
  }
  return undefined; // value / equipmentType / special
}

/** The first option-list inside a choice-group object (A/B or a/b), if any. */
function firstOptionList(group: unknown): unknown[] {
  if (Array.isArray(group)) return group;
  if (group && typeof group === "object") {
    for (const value of Object.values(group as Record<string, unknown>)) {
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

function pushGroup(group: unknown, out: GrantedItem[]) {
  const direct = entryToItem(group);
  if (direct) {
    out.push(direct);
    return;
  }
  for (const entry of firstOptionList(group)) {
    const item = entryToItem(entry);
    if (item) out.push(item);
  }
}

export function parseStartingEquipment(se: unknown): GrantedItem[] {
  const out: GrantedItem[] = [];
  if (Array.isArray(se)) {
    for (const group of se) pushGroup(group, out);
  } else if (se && typeof se === "object") {
    const data = (se as Record<string, unknown>).defaultData;
    if (Array.isArray(data)) for (const group of data) pushGroup(group, out);
  }
  return out;
}
